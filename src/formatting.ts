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
};

// AI 只能输出"排版决策指令"，schema 中没有任何正文文字字段 → 构造性保证不改字
export type ConvertOperation =
  | { op: "convert"; blockId: string; to: "heading"; level: 1 | 2 | 3 }
  | { op: "convert"; blockId: string; to: "quote-card" }
  | { op: "convert"; blockId: string; to: "callout"; icon?: string }
  | { op: "convert"; blockId: string; to: "emphasis" };

export type FormattingOperation =
  | ConvertOperation
  | { op: "insert-divider"; afterBlockId: string }
  | { op: "group-steps"; blockIds: string[]; ordered?: boolean };

export type FormattingSettings = {
  apiKey: string;
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
  `fmt_${djb2(JSON.stringify({ ...settings, apiKey: "" }))}`;

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

export const collectFormattingInputs = (doc: Doc): FormattingBlockSummary[] =>
  doc.blocks.map((block, index) => ({
    blockId: `blk_${index}`,
    type: block.type,
    ...(block.type === "heading" ? { level: block.level } : {}),
    text: blockInlineText(block).slice(0, MAX_SUMMARY_LEN)
  }));

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

export const applyFormattingOperationsToDoc = (doc: Doc, operations: FormattingOperation[]): Doc => {
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

  operations.forEach((op) => {
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
    } else if (op.op === "convert") {
      const index = indexOf(op.blockId);
      if (index >= 0) convertAt.set(index, op);
    }
  });

  const out: Block[] = [];
  for (let index = 0; index < blocks.length; ) {
    const group = groups.find((plan) => plan.start === index);
    if (group) {
      out.push(buildStepsBlock(blocks.slice(group.start, group.end + 1), group.ordered));
      index = group.end + 1;
      continue;
    }
    if (consumed.has(index)) {
      index += 1;
      continue;
    }
    const conversion = convertAt.get(index);
    out.push(conversion ? convertBlock(blocks[index], conversion) : blocks[index]);
    if (dividerAfter.has(index)) out.push({ type: "divider" });
    index += 1;
  }

  return { ...clone, blocks: out };
};

const SPECIAL_CONVERT_TYPES = new Set<string>(["quote-card", "callout", "emphasis"]);

const parseBlockIndex = (blockId: string): number => {
  const m = /^blk_(\d+)$/.exec(blockId);
  return m ? Number(m[1]) : -1;
};

// 后处理：过滤 AI 输出的排版指令，防止连续引用和样式密度过高。
// 不改文字，只减少 convert 操作数量。insert-divider 和 group-steps 保持不变。
export const normalizeFormattingOperations = (ops: FormattingOperation[]): FormattingOperation[] => {
  const converts = ops
    .filter((o): o is ConvertOperation => o.op === "convert")
    .map((op) => ({ index: parseBlockIndex(op.blockId), op }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index);

  const removed = new Set<string>();

  // 规则 1：连续 quote-card（相邻索引差 ≤ 1）只保留每 run 的第一个
  let lastQuoteCardIndex = -99;
  converts.forEach(({ index, op }) => {
    if (op.to === "quote-card") {
      if (index - lastQuoteCardIndex <= 1) {
        removed.add(op.blockId);
      } else {
        lastQuoteCardIndex = index;
      }
    }
  });

  // 规则 2：任意 4 块窗口内 special（quote-card/callout/emphasis）数 ≤ 2
  const specials = converts.filter(({ op }) => SPECIAL_CONVERT_TYPES.has(op.to) && !removed.has(op.blockId));
  specials.forEach(({ index }) => {
    const inWindow = specials.filter(
      ({ index: i, op }) => i >= index && i <= index + 3 && !removed.has(op.blockId)
    );
    if (inWindow.length > 2) {
      inWindow.slice(2).forEach(({ op }) => removed.add(op.blockId));
    }
  });

  return ops.filter((op) => op.op !== "convert" || !removed.has(op.blockId));
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
