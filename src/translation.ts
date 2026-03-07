import { renderDocToText } from "./renderer";
import { DEFAULT_TRANSLATION_MODEL } from "./translation-config";
import type { Block, CalloutBlock, Doc, HeadingBlock, ImageBlock, Inline, ListBlock, ParagraphBlock, QuoteBlock, TableBlock } from "./types";

export const TRANSLATION_SETTINGS_KEY = "translationSettings";
export const TRANSLATION_PORT_NAME = "translation";

export type TranslationMode = "quick" | "normal";
export type TranslationState = "idle" | "translating" | "success" | "error" | "stale";
export type PreviewContentMode = "original" | "translated";
export type PreviewFormatMode = "wechat" | "markdown";
export type TranslationStep = "prepare" | "analyze" | "translate" | "apply";
export type DetectedLanguage = "zh-CN" | "en" | "unknown";

export type TranslationSettings = {
  apiKey: string;
  model: string;
  targetLanguage: string;
  mode: TranslationMode;
  audience: string;
  stylePreset: string;
  glossary: string;
  preserveTerms: string;
  extraInstructions: string;
  chunkThreshold: number;
  chunkMaxUnits: number;
};

export type TranslationInput = {
  id: string;
  kind: "rich_text" | "image_alt";
  content: string;
};

export type TranslationOutput = {
  id: string;
  content: string;
};

export type TranslationJobRequest = {
  jobId: string;
  sourceHash: string;
  doc: Doc;
  settings: TranslationSettings;
};

export type TranslationPortClientMessage =
  | { type: "translation/start"; payload: TranslationJobRequest }
  | { type: "translation/cancel"; jobId: string };

export type TranslationPortServerMessage =
  | {
      type: "translation/progress";
      jobId: string;
      step: TranslationStep;
      label: string;
      detail?: string;
      completed?: number;
      total?: number;
    }
  | {
      type: "translation/result";
      jobId: string;
      outputs: TranslationOutput[];
    }
  | {
      type: "translation/error";
      jobId: string;
      message: string;
    };

export const DEFAULT_TRANSLATION_SETTINGS: TranslationSettings = {
  apiKey: "",
  model: DEFAULT_TRANSLATION_MODEL,
  targetLanguage: "zh-CN",
  mode: "normal",
  audience: "general",
  stylePreset: "storytelling",
  glossary: "",
  preserveTerms: "",
  extraInstructions: "",
  chunkThreshold: 8000,
  chunkMaxUnits: 12
};

const escapeXmlText = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeXmlAttr = (value: string): string => escapeXmlText(value).replace(/\n/g, " ");

const hasTranslatableInlineContent = (inlines: Inline[]): boolean =>
  inlines.some((inline) => inline.type !== "code" && inline.content.trim().length > 0);

const serializeInline = (inline: Inline): string => {
  switch (inline.type) {
    case "text":
      return `<text${inline.color === "accent" ? ' accent="1"' : ""}>${escapeXmlText(inline.content)}</text>`;
    case "bold":
      return `<bold${inline.color === "accent" ? ' accent="1"' : ""}>${escapeXmlText(inline.content)}</bold>`;
    case "italic":
      return `<italic${inline.color === "accent" ? ' accent="1"' : ""}>${escapeXmlText(inline.content)}</italic>`;
    case "code":
      return `<code>${escapeXmlText(inline.content)}</code>`;
    case "link":
      return `<link href="${escapeXmlAttr(inline.href)}">${escapeXmlText(inline.content)}</link>`;
    default:
      return "";
  }
};

const serializeInlines = (inlines: Inline[]): string => inlines.map((inline) => serializeInline(inline)).join("");

const parseInlineNode = (node: ChildNode): Inline[] => {
  if (node.nodeType === Node.TEXT_NODE) {
    const content = node.textContent ?? "";
    return content ? [{ type: "text", content }] : [];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const content = element.textContent ?? "";
  const accent = element.getAttribute("accent") === "1";

  switch (tag) {
    case "text":
      return content ? [{ type: "text", content, ...(accent ? { color: "accent" } : {}) }] : [];
    case "bold":
      return content ? [{ type: "bold", content, ...(accent ? { color: "accent" } : {}) }] : [];
    case "italic":
      return content ? [{ type: "italic", content, ...(accent ? { color: "accent" } : {}) }] : [];
    case "code":
      return content ? [{ type: "code", content }] : [];
    case "link":
      return content ? [{ type: "link", content, href: element.getAttribute("href") ?? "" }] : [];
    default:
      return content ? [{ type: "text", content }] : [];
  }
};

export const parseTranslatedInlines = (markup: string, fallback: Inline[]): Inline[] => {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<root>${markup}</root>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return fallback;

  const inlines: Inline[] = [];
  root.childNodes.forEach((node) => {
    inlines.push(...parseInlineNode(node));
  });

  return inlines.length > 0 ? inlines : fallback;
};

export const normalizeTranslationSettings = (
  value?: Partial<TranslationSettings> | null
): TranslationSettings => {
  const merged = { ...DEFAULT_TRANSLATION_SETTINGS, ...(value ?? {}) };

  return {
    ...merged,
    apiKey: String(merged.apiKey ?? "").trim(),
    model: String(merged.model ?? DEFAULT_TRANSLATION_SETTINGS.model).trim() || DEFAULT_TRANSLATION_SETTINGS.model,
    targetLanguage:
      String(merged.targetLanguage ?? DEFAULT_TRANSLATION_SETTINGS.targetLanguage).trim() === "en"
        ? "en"
        : "zh-CN",
    mode: merged.mode === "quick" ? "quick" : "normal",
    audience: String(merged.audience ?? DEFAULT_TRANSLATION_SETTINGS.audience).trim(),
    stylePreset: String(merged.stylePreset ?? DEFAULT_TRANSLATION_SETTINGS.stylePreset).trim(),
    glossary: String(merged.glossary ?? "").trim(),
    preserveTerms: String(merged.preserveTerms ?? "").trim(),
    extraInstructions: String(merged.extraInstructions ?? "").trim(),
    chunkThreshold: Number.isFinite(merged.chunkThreshold) ? Math.max(2000, Number(merged.chunkThreshold)) : DEFAULT_TRANSLATION_SETTINGS.chunkThreshold,
    chunkMaxUnits: Number.isFinite(merged.chunkMaxUnits) ? Math.max(1, Number(merged.chunkMaxUnits)) : DEFAULT_TRANSLATION_SETTINGS.chunkMaxUnits
  };
};

export const hashDoc = (doc: Doc): string => {
  const input = JSON.stringify(doc);
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return `doc_${(hash >>> 0).toString(16)}`;
};

const pushBlockInlines = (
  inputs: TranslationInput[],
  inlines: Inline[],
  nextRichTextId: () => string
) => {
  if (!hasTranslatableInlineContent(inlines)) return;
  inputs.push({
    id: nextRichTextId(),
    kind: "rich_text",
    content: serializeInlines(inlines)
  });
};

const walkListForInputs = (
  inputs: TranslationInput[],
  list: ListBlock,
  nextRichTextId: () => string
) => {
  list.items.forEach((item) => {
    pushBlockInlines(inputs, item.children, nextRichTextId);
    item.nested?.forEach((nested) => walkListForInputs(inputs, nested, nextRichTextId));
  });
};

const walkTableForInputs = (
  inputs: TranslationInput[],
  table: TableBlock,
  nextRichTextId: () => string
) => {
  table.rows.forEach((row) => {
    row.cells.forEach((cell) => {
      pushBlockInlines(inputs, cell.children, nextRichTextId);
    });
  });
};

export const collectTranslationInputs = (doc: Doc): TranslationInput[] => {
  let richTextIndex = 0;
  let imageAltIndex = 0;
  const inputs: TranslationInput[] = [];
  const nextRichTextId = () => `rich_text_${richTextIndex++}`;
  const nextImageAltId = () => `image_alt_${imageAltIndex++}`;

  doc.blocks.forEach((block) => {
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "quote":
      case "callout":
        pushBlockInlines(inputs, block.children, nextRichTextId);
        break;
      case "list":
        walkListForInputs(inputs, block, nextRichTextId);
        break;
      case "table":
        walkTableForInputs(inputs, block, nextRichTextId);
        break;
      case "image":
        if (block.alt?.trim()) {
          inputs.push({
            id: nextImageAltId(),
            kind: "image_alt",
            content: block.alt
          });
        }
        break;
      default:
        break;
    }
  });

  return inputs;
};

const applyTranslatedBlockInlines = (
  inlines: Inline[],
  outputs: Map<string, string>,
  nextRichTextId: () => string
): Inline[] => {
  const fallback = inlines;
  if (!hasTranslatableInlineContent(inlines)) return fallback;
  const translated = outputs.get(nextRichTextId());
  return translated ? parseTranslatedInlines(translated, fallback) : fallback;
};

const applyTranslatedList = (
  list: ListBlock,
  outputs: Map<string, string>,
  nextRichTextId: () => string
): ListBlock => ({
  ...list,
  items: list.items.map((item) => ({
    ...item,
    children: applyTranslatedBlockInlines(item.children, outputs, nextRichTextId),
    nested: item.nested?.map((nested) => applyTranslatedList(nested, outputs, nextRichTextId))
  }))
});

const applyTranslatedTable = (
  table: TableBlock,
  outputs: Map<string, string>,
  nextRichTextId: () => string
): TableBlock => ({
  ...table,
  rows: table.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      children: applyTranslatedBlockInlines(cell.children, outputs, nextRichTextId)
    }))
  }))
});

const applyTranslatedImage = (
  block: ImageBlock,
  outputs: Map<string, string>,
  nextImageAltId: () => string
): ImageBlock => {
  if (!block.alt?.trim()) return block;
  const translated = outputs.get(nextImageAltId());
  return translated ? { ...block, alt: translated } : block;
};

const applyTranslatedInlineBlock = <T extends HeadingBlock | ParagraphBlock | QuoteBlock | CalloutBlock>(
  block: T,
  outputs: Map<string, string>,
  nextRichTextId: () => string
): T => ({
  ...block,
  children: applyTranslatedBlockInlines(block.children, outputs, nextRichTextId)
});

export const applyTranslationOutputsToDoc = (doc: Doc, translatedOutputs: TranslationOutput[]): Doc => {
  const outputs = new Map(translatedOutputs.map((item) => [item.id, item.content]));
  let richTextIndex = 0;
  let imageAltIndex = 0;
  const nextRichTextId = () => `rich_text_${richTextIndex++}`;
  const nextImageAltId = () => `image_alt_${imageAltIndex++}`;

  const translatedBlocks = structuredClone(doc.blocks).map((block): Block => {
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "quote":
      case "callout":
        return applyTranslatedInlineBlock(block, outputs, nextRichTextId);
      case "list":
        return applyTranslatedList(block, outputs, nextRichTextId);
      case "table":
        return applyTranslatedTable(block, outputs, nextRichTextId);
      case "image":
        return applyTranslatedImage(block, outputs, nextImageAltId);
      default:
        return block;
    }
  });

  return {
    ...structuredClone(doc),
    blocks: translatedBlocks
  };
};

export const getTranslationSourceText = (doc: Doc): string => renderDocToText(doc);

export const detectDocLanguage = (doc: Doc): DetectedLanguage => {
  const text = getTranslationSourceText(doc).trim();
  if (!text) return "unknown";

  const cjkMatches = text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) ?? [];
  const latinMatches = text.match(/[A-Za-z]/g) ?? [];
  const englishWordMatches = text.match(/\b[A-Za-z][A-Za-z'-]*\b/g) ?? [];

  const cjkCount = cjkMatches.length;
  const latinCount = latinMatches.length;
  const englishWordCount = englishWordMatches.length;

  if (cjkCount >= 12 && cjkCount >= latinCount * 0.6) {
    return "zh-CN";
  }

  if (englishWordCount >= 8 && latinCount > cjkCount * 1.5) {
    return "en";
  }

  if (cjkCount >= 6 && cjkCount > latinCount) {
    return "zh-CN";
  }

  if (englishWordCount >= 4 && latinCount > cjkCount) {
    return "en";
  }

  return "unknown";
};
