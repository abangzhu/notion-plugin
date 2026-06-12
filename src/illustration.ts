import { applyFormattingWithAnchors, type FormattingOperation } from "./formatting";
import { DEFAULT_TRANSLATION_MODEL } from "./translation-config";
import type { Block, Doc, ImageBlock } from "./types";

export const ILLUSTRATION_SETTINGS_KEY = "illustrationSettings";
export const ILLUSTRATION_PORT_NAME = "illustration";

export const MAX_ILLUSTRATIONS_LIMIT = 4;

export type IllustrationState = "idle" | "illustrating" | "success" | "error" | "stale";
export type IllustrationStep = "prepare" | "plan" | "generate" | "apply";

// AI 规划阶段输出：在某块后配一张图 + 英文图像描述（不含正文文字）
export type IllustrationPlanItem = {
  afterBlockId: string;
  prompt: string;
};

// 生图完成后的配图项：data URI + 替代文本
export type IllustrationItem = {
  afterBlockId: string;
  dataUri: string;
  alt: string;
};

export type IllustrationSettings = {
  apiKey: string;
  model: string;
  maxImages: number;
  // 用户自定义生图风格提示词（拼到固定极简风之后、主题描述之前）
  stylePrompt: string;
};

export type IllustrationJobRequest = {
  jobId: string;
  sourceHash: string;
  doc: Doc;
  settings: IllustrationSettings;
};

export type IllustrationPortClientMessage =
  | { type: "illustration/start"; payload: IllustrationJobRequest }
  | { type: "illustration/cancel"; jobId: string }
  | { type: "illustration/query-state" };

export type IllustrationBackgroundState = {
  jobId: string;
  sourceHash: string;
  status: "illustrating" | "success" | "error";
  step?: IllustrationStep;
  label?: string;
  detail?: string;
  completed?: number;
  total?: number;
  items?: IllustrationItem[];
  requested?: number;
  message?: string;
};

export type IllustrationPortServerMessage =
  | { type: "illustration/state"; state: IllustrationBackgroundState | null }
  | {
      type: "illustration/progress";
      jobId: string;
      step: IllustrationStep;
      label: string;
      detail?: string;
      completed?: number;
      total?: number;
    }
  | {
      type: "illustration/result";
      jobId: string;
      items: IllustrationItem[];
      requested?: number;
    }
  | { type: "illustration/error"; jobId: string; message: string };

export const DEFAULT_ILLUSTRATION_SETTINGS: IllustrationSettings = {
  apiKey: "",
  model: DEFAULT_TRANSLATION_MODEL,
  maxImages: 4,
  stylePrompt: ""
};

export const normalizeIllustrationSettings = (
  value?: Partial<IllustrationSettings> | null
): IllustrationSettings => {
  const merged = { ...DEFAULT_ILLUSTRATION_SETTINGS, ...(value ?? {}) };
  const maxImages = Number.isFinite(merged.maxImages)
    ? Math.min(MAX_ILLUSTRATIONS_LIMIT, Math.max(1, Math.round(Number(merged.maxImages))))
    : DEFAULT_ILLUSTRATION_SETTINGS.maxImages;

  return {
    apiKey: String(merged.apiKey ?? "").trim(),
    model:
      String(merged.model ?? DEFAULT_ILLUSTRATION_SETTINGS.model).trim() ||
      DEFAULT_ILLUSTRATION_SETTINGS.model,
    maxImages,
    stylePrompt: String(merged.stylePrompt ?? "").trim()
  };
};

const djb2 = (input: string): string => {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
};

// 缓存键用（剔除 apiKey）
export const hashIllustration = (settings: IllustrationSettings): string =>
  `ill_${djb2(JSON.stringify({ ...settings, apiKey: "" }))}`;

const indexOfBlockId = (id: string, length: number): number => {
  const match = /^blk_(\d+)$/.exec(id);
  if (!match) return -1;
  const index = Number(match[1]);
  return index >= 0 && index < length ? index : -1;
};

// 不可变地把生成的配图插入到对应块之后。blockId 规则同 collectFormattingInputs（blk_i）。
export const applyIllustrationsToDoc = (doc: Doc, items: IllustrationItem[]): Doc => {
  const clone = structuredClone(doc);
  const blocks = clone.blocks;

  // 按目标块索引分组（同一 afterBlockId 的多张按给定顺序插入）
  const byIndex = new Map<number, ImageBlock[]>();
  items.forEach((item) => {
    const index = indexOfBlockId(item.afterBlockId, blocks.length);
    if (index < 0) {
      // 越界/非法 id 忽略；打点便于诊断"生成了但没插入"的少图问题
      console.warn(`配图位置 ${item.afterBlockId} 不在当前文档（共 ${blocks.length} 块），已跳过`);
      return;
    }
    const image: ImageBlock = { type: "image", src: item.dataUri, alt: item.alt };
    const list = byIndex.get(index) ?? [];
    list.push(image);
    byIndex.set(index, list);
  });

  if (byIndex.size === 0) return clone;

  const out: Block[] = [];
  blocks.forEach((block, index) => {
    out.push(block);
    const images = byIndex.get(index);
    if (images) out.push(...images);
  });

  return { ...clone, blocks: out };
};

// 统一增强：排版 + 配图都锚定 base 块索引，组合应用使两者顺序无关。
// formatOps 转换/合并/插分隔符 → 产出 anchorOf 映射 → 配图按映射插到排版后对应输出位置。
// 先配图后排版、先排版后配图，结果一致，配图不会因重新排版而错位或消失。
export const applyEnhancementsToDoc = (
  base: Doc,
  operations: FormattingOperation[],
  items: IllustrationItem[]
): Doc => {
  const { doc: formatted, anchorOf } = applyFormattingWithAnchors(base, operations);
  if (items.length === 0) return formatted;

  const baseLength = base.blocks.length;
  const byOutIndex = new Map<number, ImageBlock[]>();
  items.forEach((item) => {
    const baseIndex = indexOfBlockId(item.afterBlockId, baseLength);
    if (baseIndex < 0) {
      console.warn(`配图位置 ${item.afterBlockId} 不在当前文档（共 ${baseLength} 块），已跳过`);
      return;
    }
    const outIndex = anchorOf.get(baseIndex);
    if (outIndex == null) return; // 理论上每个 base 索引都有锚点；防御性跳过
    const image: ImageBlock = { type: "image", src: item.dataUri, alt: item.alt };
    const list = byOutIndex.get(outIndex) ?? [];
    list.push(image);
    byOutIndex.set(outIndex, list);
  });

  if (byOutIndex.size === 0) return formatted;

  const out: Block[] = [];
  formatted.blocks.forEach((block, index) => {
    out.push(block);
    const images = byOutIndex.get(index);
    if (images) out.push(...images);
  });

  return { ...formatted, blocks: out };
};
