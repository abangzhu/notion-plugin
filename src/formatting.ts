import { DEFAULT_TRANSLATION_MODEL } from "./translation-config";
import type { Block, Doc, Inline, StepsBlock } from "./types";

export const FORMATTING_SETTINGS_KEY = "formattingSettings";
export const FORMATTING_PORT_NAME = "formatting";

export type FormattingState = "idle" | "formatting" | "success" | "error" | "stale";
export type FormattingStep = "prepare" | "plan" | "apply";
export type FormattingAggressiveness = "conservative" | "balanced" | "bold";

// 给 AI 的只读块摘要：仅含稳定 ID、类型与纯文本预览（供理解语义，禁止改写/复述）
export type FormattingBlockSummary = {
  blockId: string;
  type: Block["type"];
  level?: 1 | 2 | 3;
  text: string;
  emphasisCandidates?: { id: string; text: string }[];
};

// AI 只能输出"排版决策指令"，schema 中没有任何正文文字字段 → 构造性保证不改字
export type ConvertOperation =
  | { op: "convert"; blockId: string; to: "heading"; level: 1 | 2 | 3 }
  | { op: "convert"; blockId: string; to: "quote-card" }
  | { op: "convert"; blockId: string; to: "callout"; icon?: string }
  | { op: "convert"; blockId: string; to: "emphasis" };

export type FormattingOperation =
  | ConvertOperation
  | { op: "emphasize-inline"; blockId: string; candidateId: string }
  | { op: "insert-divider"; afterBlockId: string }
  | { op: "group-steps"; blockIds: string[]; ordered?: boolean };

export type FormattingSettings = {
  apiKey: string;
  baseURL: string;
  model: string;
  aggressiveness: FormattingAggressiveness;
  extraInstructions: string;
  chunkThreshold: number;
  chunkMaxUnits: number;
};

export type FormattingJobRequest = {
  jobId: string;
  sourceHash: string;
  doc: Doc;
  settings: FormattingSettings;
};

export type FormattingPortClientMessage =
  | { type: "formatting/start"; payload: FormattingJobRequest }
  | { type: "formatting/cancel"; jobId: string }
  | { type: "formatting/discard-result"; sourceHash: string; jobId?: string }
  | { type: "formatting/query-state" };

export type FormattingBackgroundState = {
  jobId: string;
  sourceHash: string;
  status: "formatting" | "success" | "error";
  step?: FormattingStep;
  label?: string;
  detail?: string;
  completed?: number;
  total?: number;
  operations?: FormattingOperation[];
  message?: string;
};

export type FormattingPortServerMessage =
  | { type: "formatting/state"; state: FormattingBackgroundState | null }
  | {
      type: "formatting/progress";
      jobId: string;
      step: FormattingStep;
      label: string;
      detail?: string;
      completed?: number;
      total?: number;
    }
  | { type: "formatting/result"; jobId: string; operations: FormattingOperation[] }
  | { type: "formatting/error"; jobId: string; message: string };

export const DEFAULT_FORMATTING_SETTINGS: FormattingSettings = {
  apiKey: "",
  baseURL: "",
  model: DEFAULT_TRANSLATION_MODEL,
  aggressiveness: "balanced",
  extraInstructions: "",
  chunkThreshold: 12000,
  chunkMaxUnits: 60
};

const AGGRESSIVENESS_VALUES: FormattingAggressiveness[] = ["conservative", "balanced", "bold"];

export const normalizeFormattingSettings = (
  value?: Partial<FormattingSettings> | null
): FormattingSettings => {
  const merged = { ...DEFAULT_FORMATTING_SETTINGS, ...(value ?? {}) };
  const aggressiveness = AGGRESSIVENESS_VALUES.includes(merged.aggressiveness as FormattingAggressiveness)
    ? (merged.aggressiveness as FormattingAggressiveness)
    : DEFAULT_FORMATTING_SETTINGS.aggressiveness;

  return {
    apiKey: String(merged.apiKey ?? "").trim(),
    baseURL: String(merged.baseURL ?? "").trim(),
    model:
      String(merged.model ?? DEFAULT_FORMATTING_SETTINGS.model).trim() ||
      DEFAULT_FORMATTING_SETTINGS.model,
    aggressiveness,
    extraInstructions: String(merged.extraInstructions ?? "").trim(),
    chunkThreshold: Number.isFinite(merged.chunkThreshold)
      ? Math.max(2000, Number(merged.chunkThreshold))
      : DEFAULT_FORMATTING_SETTINGS.chunkThreshold,
    chunkMaxUnits: Number.isFinite(merged.chunkMaxUnits)
      ? Math.max(1, Number(merged.chunkMaxUnits))
      : DEFAULT_FORMATTING_SETTINGS.chunkMaxUnits
  };
};

const djb2 = (input: string): string => {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
};

// 排版设置 hash（剔除 apiKey），用于缓存键，避免敏感信息进入存储键
export const hashFormatting = (settings: FormattingSettings): string =>
  `fmt_v2_${djb2(JSON.stringify({ ...settings, apiKey: "" }))}`;

// === 纯文本提取（仅用于摘要与不改字校验，不含渲染层附加的 icon/序号） ===

const inlineText = (inlines: Inline[]): string => inlines.map((inline) => inline.content).join("");

const blockInlineText = (block: Block): string => {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "quote":
    case "callout":
    case "emphasis":
      return inlineText(block.children);
    case "steps":
      return block.items.map((item) => inlineText(item.children)).join("\n");
    case "list":
      return block.items
        .map((item) => {
          const nested = item.nested?.map((n) => n.items.map((i) => inlineText(i.children)).join("\n")) ?? [];
          return [inlineText(item.children), ...nested].join("\n");
        })
        .join("\n");
    case "table":
      return block.rows
        .map((row) => row.cells.map((cell) => inlineText(cell.children)).join(""))
        .join("");
    case "image":
      return block.alt ?? "";
    case "code":
      return block.code;
    default:
      return "";
  }
};

const MAX_SUMMARY_LEN = 200;

// Candidate IDs refer to exact source spans. The model chooses meaning, never offsets or text.
const emphasisCandidates = (block: Block) => {
  if (block.type !== "paragraph") return [];
  if (block.children.some((child) => child.type === "bold" || child.type === "highlight")) return [];
  const text = inlineText(block.children);
  const candidates: { id: string; text: string; start: number; end: number }[] = [];
  const pattern = /[^\n]+?(?:[。！？；，]|[.!?;,](?=\s|$)|(?=\n|$))/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const trimmed = match[0].trim();
    const start = match.index + match[0].indexOf(trimmed);
    const end = start + trimmed.length;
    if (trimmed.length < 4 || trimmed.length > 64 || trimmed.length > text.length * 0.4) continue;
    let offset = 0;
    const plain = block.children.every((child) => {
      const overlaps = offset < end && offset + child.content.length > start;
      offset += child.content.length;
      return !overlaps || (child.type === "text" && !child.color);
    });
    if (plain) candidates.push({ id: `span_${start}_${end}`, text: trimmed, start, end });
  }
  return candidates.slice(0, 12);
};

export const collectFormattingInputs = (doc: Doc): FormattingBlockSummary[] =>
  doc.blocks.map((block, index) => ({
    blockId: `blk_${index}`,
    type: block.type,
    ...(block.type === "heading" ? { level: block.level } : {}),
    text: blockInlineText(block).slice(0, MAX_SUMMARY_LEN),
    ...(block.type === "paragraph" ? {
      emphasisCandidates: emphasisCandidates(block).map(({ id, text }) => ({ id, text }))
    } : {})
  }));

const emphasizeInline = (block: Block, candidateId: string): Block => {
  const candidate = emphasisCandidates(block).find((span) => span.id === candidateId);
  if (!candidate || block.type !== "paragraph") return block;
  let offset = 0;
  const children = block.children.flatMap((child): Inline[] => {
    const start = offset;
    offset += child.content.length;
    const left = Math.max(0, candidate.start - start);
    const right = Math.min(child.content.length, candidate.end - start);
    if (left >= right) return [child];
    return [
      ...(left > 0 ? [{ ...child, content: child.content.slice(0, left) }] : []),
      { type: "bold", content: child.content.slice(left, right), color: "accent" as const },
      ...(right < child.content.length ? [{ ...child, content: child.content.slice(right) }] : [])
    ];
  });
  return { ...block, children };
};

// === 回填：把排版指令不可变地应用到 Doc，正文文字始终从原块搬运 ===

const HAS_INLINE_CHILDREN = new Set(["paragraph", "heading", "quote", "callout", "emphasis"]);

const childrenOf = (block: Block): Inline[] =>
  HAS_INLINE_CHILDREN.has(block.type) ? (block as Extract<Block, { children: Inline[] }>).children : [];

// callout icon 是唯一的自由字符串：限制为短 emoji，异常则回退默认，绝不让正文混入
const sanitizeEmoji = (icon?: string): string | undefined => {
  if (!icon) return undefined;
  const trimmed = icon.trim();
  if (!trimmed) return undefined;
  return Array.from(trimmed).length > 6 ? "💡" : trimmed;
};

const convertBlock = (block: Block, op: ConvertOperation): Block => {
  const kids = childrenOf(block);
  // list/table/image/code/divider 无 inline children → 拒绝转换，原样返回（防丢字）
  if (kids.length === 0) return block;
  switch (op.to) {
    case "heading":
      return { type: "heading", level: op.level, children: kids };
    case "quote-card":
      return { type: "quote", children: kids, variant: "card" };
    case "callout":
      return { type: "callout", icon: sanitizeEmoji(op.icon), children: kids };
    case "emphasis":
      return { type: "emphasis", children: kids };
  }
};

const buildStepsBlock = (blocks: Block[], ordered: boolean): StepsBlock => ({
  type: "steps",
  ordered,
  items: blocks.map((block) => ({ children: childrenOf(block) }))
});

const splitIntoConsecutiveRuns = (sorted: number[]): number[][] => {
  const runs: number[][] = [];
  let current: number[] = [];
  sorted.forEach((value) => {
    if (current.length === 0 || value === current[current.length - 1] + 1) {
      current.push(value);
    } else {
      runs.push(current);
      current = [value];
    }
  });
  if (current.length > 0) runs.push(current);
  return runs;
};

// 排版应用 + 锚点映射：返回排版后的 doc，以及 base 块索引 → 输出块索引 的映射。
// 映射用于把"锚定到 base 块"的配图插到排版后对应的输出位置（被合并进 steps 的多块都映射到该 steps 块）。
export const applyFormattingWithAnchors = (
  doc: Doc,
  operations: FormattingOperation[]
): { doc: Doc; anchorOf: Map<number, number> } => {
  const clone = structuredClone(doc);
  const blocks = clone.blocks;

  const indexOf = (id: string): number => {
    const match = /^blk_(\d+)$/.exec(id);
    if (!match) return -1;
    const index = Number(match[1]);
    return index >= 0 && index < blocks.length ? index : -1;
  };

  type GroupPlan = { start: number; end: number; ordered: boolean };
  const groups: GroupPlan[] = [];
  const convertAt = new Map<number, ConvertOperation>();
  const dividerAfter = new Set<number>();
  const consumed = new Set<number>();

  const inlineAt = new Map<number, string>();
  normalizeFormattingOperations(operations, collectFormattingInputs(doc)).forEach((op) => {
    if (op.op === "group-steps") {
      const sorted = Array.from(
        new Set(op.blockIds.map(indexOf).filter((index) => index >= 0))
      ).sort((a, b) => a - b);
      splitIntoConsecutiveRuns(sorted).forEach((run) => {
        if (run.length < 2) return;
        // 区间内任一块无 inline children（list/table/image/code）→ 拒绝整组（防丢字）
        if (run.some((index) => childrenOf(blocks[index]).length === 0)) return;
        if (run.some((index) => consumed.has(index))) return;
        run.forEach((index) => consumed.add(index));
        groups.push({ start: run[0], end: run[run.length - 1], ordered: op.ordered ?? true });
      });
    } else if (op.op === "insert-divider") {
      const index = indexOf(op.afterBlockId);
      if (index >= 0) dividerAfter.add(index);
    } else if (op.op === "emphasize-inline") {
      inlineAt.set(indexOf(op.blockId), op.candidateId);
    } else if (op.op === "convert") {
      const index = indexOf(op.blockId);
      if (index >= 0) convertAt.set(index, op);
    }
  });

  const out: Block[] = [];
  const anchorOf = new Map<number, number>();
  for (let index = 0; index < blocks.length; ) {
    const group = groups.find((plan) => plan.start === index);
    if (group) {
      const outIndex = out.length;
      out.push(buildStepsBlock(blocks.slice(group.start, group.end + 1), group.ordered));
      // 组内每个 base 块都映射到这个 steps 输出块
      for (let inner = group.start; inner <= group.end; inner += 1) {
        anchorOf.set(inner, outIndex);
      }
      index = group.end + 1;
      continue;
    }
    if (consumed.has(index)) {
      index += 1;
      continue;
    }
    const conversion = convertAt.get(index);
    const outIndex = out.length;
    const candidateId = inlineAt.get(index);
    const block = candidateId ? emphasizeInline(blocks[index], candidateId) : blocks[index];
    out.push(conversion ? convertBlock(block, conversion) : block);
    anchorOf.set(index, outIndex);
    if (dividerAfter.has(index)) out.push({ type: "divider" });
    index += 1;
  }

  return { doc: { ...clone, blocks: out }, anchorOf };
};

export const applyFormattingOperationsToDoc = (doc: Doc, operations: FormattingOperation[]): Doc =>
  applyFormattingWithAnchors(doc, operations).doc;

// Validate model output and cached plans before rendering. One structural change per block,
// at most one visual card/group per four source blocks; inline emphasis has a separate budget.
export const normalizeFormattingOperations = (
  value: unknown,
  inputs?: FormattingBlockSummary[]
): FormattingOperation[] => {
  if (!Array.isArray(value)) return [];
  const byId = new Map(inputs?.map((input) => [input.blockId, input]));
  const validId = (id: unknown): id is string =>
    typeof id === "string" && /^blk_\d+$/.test(id) && (!inputs || byId.has(id));
  const indexOf = (id: string) => Number(id.slice(4));
  const valid: FormattingOperation[] = [];
  for (const op of value) {
    if (!op || typeof op !== "object") continue;
    if (op.op === "convert" && validId(op.blockId)) {
      const input = byId.get(op.blockId);
      if (input && input.type !== "paragraph") continue;
      if (op.to === "heading") {
        if (![1, 2, 3].includes(op.level) || (input && (input.text.length > 48 || /[。！？\n]/u.test(input.text)))) continue;
        valid.push({ op: "convert", blockId: op.blockId, to: "heading", level: op.level });
      } else if (["quote-card", "callout", "emphasis"].includes(op.to)) {
        if (input && input.text.length > (op.to === "quote-card" ? 90 : 180)) continue;
        valid.push({ op: "convert", blockId: op.blockId, to: op.to,
          ...(op.to === "callout" && typeof op.icon === "string" ? { icon: sanitizeEmoji(op.icon) } : {}) });
      }
    } else if (op.op === "emphasize-inline" && validId(op.blockId) && typeof op.candidateId === "string") {
      if (!byId.get(op.blockId)?.emphasisCandidates?.some((candidate) => candidate.id === op.candidateId)) continue;
      valid.push({ op: "emphasize-inline", blockId: op.blockId, candidateId: op.candidateId });
    } else if (op.op === "group-steps" && Array.isArray(op.blockIds)) {
      if (op.blockIds.length < 2 || op.blockIds.length > 6 || !op.blockIds.every(validId)) continue;
      const ids = op.blockIds as string[];
      if (ids.some((id, i) => (inputs && byId.get(id)?.type !== "paragraph") || (i > 0 && indexOf(id) !== indexOf(ids[i - 1]) + 1))) continue;
      if (op.ordered !== undefined && typeof op.ordered !== "boolean") continue;
      valid.push({ op: "group-steps", blockIds: ids, ordered: op.ordered ?? true });
    } else if (op.op === "insert-divider" && validId(op.afterBlockId)) {
      const i = indexOf(op.afterBlockId);
      if (inputs && (!byId.has(`blk_${i + 1}`) || [byId.get(op.afterBlockId), byId.get(`blk_${i + 1}`)].some((b) => b?.type === "heading" || b?.type === "divider"))) continue;
      valid.push({ op: "insert-divider", afterBlockId: op.afterBlockId });
    }
  }
  const position = (op: FormattingOperation) => indexOf(op.op === "group-steps" ? op.blockIds[0] : op.op === "insert-divider" ? op.afterBlockId : op.blockId);
  const priority = (op: FormattingOperation) => op.op === "emphasize-inline" ? 0 : op.op === "insert-divider" ? 2 : 1;
  valid.sort((a, b) => priority(a) - priority(b) || position(a) - position(b));
  const occupied = new Set<number>();
  const decorations = (inputs ?? []).filter((b) => ["quote", "callout", "emphasis", "steps"].includes(b.type)).map((b) => indexOf(b.blockId));
  const dividers: number[] = [];
  const result: FormattingOperation[] = [];
  const total = inputs?.length ?? Math.max(0, ...valid.map(position)) + 1;
  const cardLimit = Math.ceil(total / 4);
  let cardCount = decorations.length;
  let emphasisCount = 0;
  for (const op of valid) {
    const index = position(op);
    if (op.op === "insert-divider") {
      if (index === 0 || occupied.has(index) || decorations.some((i) => Math.abs(i - index) < 2) || dividers.some((i) => Math.abs(i - index) < 6)) continue;
      dividers.push(index);
      result.push(op);
      continue;
    }
    const indices = op.op === "group-steps" ? op.blockIds.map(indexOf) : [index];
    if (indices.some((i) => occupied.has(i))) continue;
    const card = op.op === "group-steps" || (op.op === "convert" && op.to !== "heading");
    if (card && (cardCount >= cardLimit || decorations.some((i) => indices.some((j) => Math.abs(i - j) < 4)))) continue;
    if (op.op === "emphasize-inline" && emphasisCount >= Math.ceil(total / 3)) continue;
    if (op.op === "emphasize-inline") emphasisCount++;
    if (card) {
      decorations.push(...indices);
      cardCount++;
    }
    indices.forEach((i) => occupied.add(i));
    result.push(op);
  }
  return result.sort((a, b) => position(a) - position(b));
};

// dev/测试护栏：校验排版前后正文 inline 文本逐字一致（顺序也一致）。
// 过滤无文字的块（如插入的分隔符），它们不携带正文，只影响结构。
export const collectDocText = (doc: Doc): string =>
  doc.blocks
    .map((block) => blockInlineText(block))
    .filter((text) => text.length > 0)
    .join("\n");

export const assertTextPreserved = (source: Doc, formatted: Doc): boolean =>
  collectDocText(source) === collectDocText(formatted);
