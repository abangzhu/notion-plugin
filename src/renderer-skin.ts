// 现代主题（skin 驱动）的块级渲染：每套主题在标题、引用、卡片、分隔线、表格、图片、代码上
// 都有自己的结构语言，而不仅是换色。只输出公众号可保留的内联样式，正文统一包在 span[leaf]。
import type { ImageMap } from "./image-loader";
import {
  baseFontSize,
  buildBodyParagraphStyle,
  escapeHtml,
  inlinesToHtml,
  letterSpacingStyle,
  markerBackground,
  wrapLeaf
} from "./render-helpers";
import type { RenderOptions } from "./theme";
import type { ThemeSkin } from "./theme-skins";
import type { Block, Inline, TableBlock } from "./types";

export type HeadingLevel = 1 | 2 | 3;

type HeadingBlock = Extract<Block, { type: "heading" }>;

export type SkinRenderContext = {
  indexMap?: Map<string, number>;
  imageMap?: ImageMap;
  headingLevel?: HeadingLevel;
  chapterNumber?: number;
};

const pad2 = (value: number): string => String(value).padStart(2, "0");

// 强调色块上的内容：把强调色/正文色替换为反白色，避免加粗、链接与底色同色而"消失"
const onAccentOptions = (options: RenderOptions, skin: ThemeSkin): RenderOptions => ({
  ...options,
  colors: { ...options.colors, link: skin.onAccent, text: skin.onAccent, inlineCodeBg: "rgba(255,255,255,0.22)" },
  style: { ...options.style, skin: { ...skin, strong: "weight" } }
});

const headingLevelStyle = (options: RenderOptions, level: HeadingLevel) =>
  level === 1 ? options.style.headings.h1 : level === 2 ? options.style.headings.h2 : options.style.headings.h3;

const FIT_CONTENT = ["width:fit-content", "max-width:100%", "box-sizing:border-box", "overflow-wrap:anywhere"];

const headingBase = (
  options: RenderOptions,
  skin: ThemeSkin,
  level: HeadingLevel,
  margin?: string
): string[] => {
  const base = baseFontSize(options);
  const hs = headingLevelStyle(options, level);
  return [
    `font-family:${skin.headingFont ?? options.fontStack}`,
    `font-size:${Math.round(base * hs.scale)}px`,
    `font-weight:${hs.weight ?? options.typography.headingWeight}`,
    `margin:${margin ?? `${Math.round(base * hs.marginTopEm)}px 0 ${Math.round(base * hs.marginBottomEm)}px`}`,
    `line-height:${hs.lineHeight}`,
    `color:${options.colors.text}`,
    "letter-spacing:0"
  ];
};

const headingTag = (level: HeadingLevel, parts: string[], content: string): string => {
  const tag = `h${level}`;
  const wrap = parts.some((part) => part.startsWith("overflow-wrap")) ? parts : [...parts, "overflow-wrap:break-word"];
  return `<${tag} style="${wrap.join(";")};">${wrapLeaf(content)}</${tag}>`;
};

const titleDecoration = (options: RenderOptions, skin: ThemeSkin): string[] => {
  if (skin.title === "center") return ["text-align:center"];
  if (skin.title === "rule") return [`border-top:4px solid ${options.colors.text}`, "padding-top:14px"];
  return ["text-align:left"];
};

const renderH2 = (
  inlines: Inline[],
  options: RenderOptions,
  skin: ThemeSkin,
  ctx: SkinRenderContext
): string => {
  const parts = headingBase(options, skin, 2);
  const inner = inlinesToHtml(inlines, options, ctx.indexMap);
  const accent = options.colors.link;
  const n = ctx.chapterNumber;
  const numeralFont = skin.numeralFont ?? options.fontStack;
  const base = baseFontSize(options);
  switch (skin.h2) {
    case "underline":
      return headingTag(2, [...parts, ...FIT_CONTENT, `border-bottom:2px solid ${accent}`, "padding-bottom:6px"], inner);
    case "number": {
      const numeral = n
        ? `<span style="display:block;font-family:${numeralFont};font-size:${Math.round(base * 2.1)}px;line-height:1.1;font-weight:400;color:${accent};margin:0 0 8px;">${pad2(n)}</span>`
        : "";
      return headingTag(2, [...parts, `border-top:1px solid ${options.colors.divider}`, "padding-top:16px"], numeral + inner);
    }
    case "pill": {
      const pillInner = inlinesToHtml(inlines, onAccentOptions(options, skin), ctx.indexMap);
      return headingTag(
        2,
        [...parts, ...FIT_CONTENT, `color:${skin.onAccent}`, `background:${accent}`, "padding:4px 14px", `border-radius:${skin.radius}`],
        pillInner
      );
    }
    case "ornament": {
      const mark = `<span style="display:block;font-size:${Math.round(base * 0.8)}px;line-height:1.6;color:${accent};margin:0 0 6px;">◆</span>`;
      return headingTag(2, [...parts, "text-align:center"], mark + inner);
    }
    case "marker":
      return headingTag(2, parts, `<span style="${markerBackground(skin.marker)}padding:0 4px;">${inner}</span>`);
    case "block":
      return headingTag(
        2,
        [...parts, `background:${skin.tint}`, `border-left:4px solid ${accent}`, "padding:10px 14px", `border-radius:0 ${skin.radius} ${skin.radius} 0`],
        inner
      );
    case "badge": {
      if (!n) return headingTag(2, [...parts, `border-left:6px solid ${accent}`, "padding-left:12px"], inner);
      const badge = `<span style="display:inline-block;background:${accent};color:${skin.onAccent};font-family:${numeralFont};font-size:0.85em;line-height:1.5;padding:0 8px;margin-right:12px;font-weight:700;">${pad2(n)}</span>`;
      return headingTag(2, parts, badge + inner);
    }
    case "rule": {
      const numeral = n
        ? `<span style="color:${accent};font-family:${numeralFont};font-weight:700;margin-right:12px;">${pad2(n)}</span>`
        : "";
      return headingTag(2, [...parts, `border-top:3px solid ${options.colors.text}`, "padding-top:12px"], numeral + inner);
    }
    default:
      return headingTag(2, parts, inner);
  }
};

const renderH3 = (inlines: Inline[], options: RenderOptions, skin: ThemeSkin, ctx: SkinRenderContext): string => {
  const parts = headingBase(options, skin, 3);
  const inner = inlinesToHtml(inlines, options, ctx.indexMap);
  const accent = options.colors.link;
  switch (skin.h3) {
    case "accent":
      return headingTag(3, [...parts, `color:${accent}`], inner);
    case "dot":
      return headingTag(3, parts, `<span style="color:${accent};font-size:0.7em;margin-right:8px;">●</span>${inner}`);
    case "hash":
      return headingTag(3, parts, `<span style="color:${accent};font-family:Menlo, Monaco, Consolas, monospace;margin-right:8px;">#</span>${inner}`);
    case "sidebar":
      return headingTag(3, [...parts, `border-left:3px solid ${accent}`, "padding-left:10px"], inner);
    default:
      return headingTag(3, parts, inner);
  }
};

export const renderSkinHeading = (
  block: HeadingBlock,
  options: RenderOptions,
  skin: ThemeSkin,
  ctx: SkinRenderContext
): string => {
  const level = ctx.headingLevel ?? block.level;
  if (level === 2) return renderH2(block.children, options, skin, ctx);
  if (level === 3) return renderH3(block.children, options, skin, ctx);
  const parts = [...headingBase(options, skin, 1), ...titleDecoration(options, skin)];
  return headingTag(1, parts, inlinesToHtml(block.children, options, ctx.indexMap));
};

// 文章标题区（基于 Doc.title）
export const renderSkinTitle = (
  titleBlock: HeadingBlock,
  options: RenderOptions,
  skin: ThemeSkin,
  indexMap: Map<string, number>
): string => {
  const base = baseFontSize(options);
  const inner = inlinesToHtml(titleBlock.children, options, indexMap);
  const after = Math.round(base * 2);
  const accent = options.colors.link;
  if (skin.title === "plain") return headingTag(1, headingBase(options, skin, 1, `0 0 ${after}px`), inner);
  if (skin.title === "center") {
    const heading = headingTag(1, [...headingBase(options, skin, 1, "0 0 14px"), "text-align:center"], inner);
    return `<section style="margin:0 0 ${after}px;text-align:center;">${heading}<hr style="width:36px;border:0;border-top:2px solid ${accent};margin:0 auto;" /></section>`;
  }
  if (skin.title === "rule") {
    const heading = headingTag(1, headingBase(options, skin, 1, "0"), inner);
    return `<section style="margin:0 0 ${after}px;border-top:6px solid ${options.colors.text};padding-top:16px;">${heading}</section>`;
  }
  const bar = `<hr style="width:36px;border:0;border-top:4px solid ${accent};margin:0 0 14px;" />`;
  const heading = headingTag(1, headingBase(options, skin, 1, `0 0 ${Math.round(base * 1.1)}px`), inner);
  return `<section style="margin:0 0 ${after}px;">${bar}${heading}<hr style="border:0;border-top:1px solid ${options.colors.divider};margin:0;" /></section>`;
};

const textBox = (options: RenderOptions, extra: string): string =>
  `font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};color:${options.colors.text};${letterSpacingStyle(options)}white-space:pre-line;${extra}`;

const renderQuote = (block: Extract<Block, { type: "quote" }>, options: RenderOptions, skin: ThemeSkin, ctx: SkinRenderContext): string => {
  const inner = inlinesToHtml(block.children, options, ctx.indexMap) || "<br/>";
  const base = baseFontSize(options);
  const accent = options.colors.link;
  const bigMark = (align: string) =>
    `<span style="display:block;font-family:Georgia, serif;font-size:${Math.round(base * 2.6)}px;line-height:1;height:${Math.round(base * 1.5)}px;color:${accent};text-align:${align};">“</span>`;
  if (block.variant === "card" || options.style.quoteVariant === "card") {
    if (skin.headingFont) {
      return `<blockquote style="overflow-wrap:break-word;${textBox(options, `margin:32px 0;padding:4px 16px;border-left:0;text-align:center;font-family:${skin.headingFont};font-size:${base + 2}px;line-height:1.75;font-weight:600;`)}">${wrapLeaf(bigMark("center") + inner)}</blockquote>`;
    }
    return `<blockquote style="overflow-wrap:break-word;${textBox(options, `margin:28px 0;padding:18px 20px;border-left:0;background:${skin.tint};border-radius:${skin.radius};font-size:${base + 1}px;line-height:1.75;font-weight:600;`)}">${wrapLeaf(bigMark("left") + inner)}</blockquote>`;
  }
  const quoteStyle = {
    line: `margin:24px 0;padding:0 0 0 16px;border-left:2px solid ${options.colors.border};color:${options.colors.subText};`,
    mark: `margin:28px 0;padding:0 8px;border-left:0;color:${options.colors.subText};`,
    frame: `margin:28px 0;padding:18px 12px;border-left:0;text-align:center;border-top:1px solid ${options.colors.border};border-bottom:1px solid ${options.colors.border};color:${options.colors.subText};font-family:${skin.headingFont ?? options.fontStack};`,
    tint: `margin:24px 0;padding:14px 16px;background:${skin.tint};border-left:3px solid ${accent};border-radius:0 ${skin.radius} ${skin.radius} 0;`
  }[skin.quote];
  const content = skin.quote === "mark" ? bigMark("left") + inner : inner;
  return `<blockquote style="overflow-wrap:break-word;${textBox(options, quoteStyle)}">${wrapLeaf(content)}</blockquote>`;
};

const cardParagraph = (content: string, extra = ""): string =>
  `<p style="overflow-wrap:break-word;margin:0;${extra}">${wrapLeaf(content)}</p>`;

const renderCallout = (block: Extract<Block, { type: "callout" }>, options: RenderOptions, skin: ThemeSkin, ctx: SkinRenderContext): string => {
  const inner = inlinesToHtml(block.children, options, ctx.indexMap) || "<br/>";
  const icon = escapeHtml((block.icon || "💡").trim() || "💡");
  const box = {
    tint: `margin:24px 0;padding:16px 18px;background:${skin.tint};border-radius:${skin.radius};`,
    outline: `margin:24px 0;padding:14px 16px;border:1px solid ${options.colors.border};border-radius:${skin.radius};`,
    left: `margin:24px 0;padding:4px 0 4px 14px;border-left:3px solid ${options.colors.link};`
  }[skin.callout];
  return `<section style="${textBox(options, box)}">${cardParagraph(`<span style="margin-right:8px;">${icon}</span>${inner}`)}</section>`;
};

const renderEmphasis = (block: Extract<Block, { type: "emphasis" }>, options: RenderOptions, skin: ThemeSkin, ctx: SkinRenderContext): string => {
  const inner = inlinesToHtml(block.children, options, ctx.indexMap) || "<br/>";
  const accent = options.colors.link;
  const base = baseFontSize(options);
  const variants = {
    card: { box: `margin:28px 0;padding:18px 20px;background:${skin.tint};border-left:3px solid ${accent};border-radius:0 ${skin.radius} ${skin.radius} 0;`, text: "font-weight:600;" },
    center: { box: `margin:32px 0;padding:18px 8px;text-align:center;border-top:1px solid ${accent};border-bottom:1px solid ${accent};font-family:${skin.headingFont ?? options.fontStack};`, text: `font-weight:600;font-size:${base + 1}px;` },
    outline: { box: `margin:28px 0;padding:16px 18px;background:${skin.tint};border:1px solid ${accent};border-radius:${skin.radius};`, text: "font-weight:600;" },
    bar: { box: `margin:28px 0;padding:4px 0 4px 16px;border-left:6px solid ${options.colors.text};`, text: `font-weight:700;font-size:${base + 1}px;` }
  }[skin.emphasis];
  return `<section style="${textBox(options, variants.box)}">${cardParagraph(inner, variants.text)}</section>`;
};

const renderDivider = (options: RenderOptions, skin: ThemeSkin): string => {
  const glyphLine = (glyph: string, color: string) =>
    `<p style="overflow-wrap:break-word;text-align:center;margin:32px 0;line-height:1.6;font-size:14px;letter-spacing:0.5em;color:${color};">${wrapLeaf(glyph)}</p>`;
  switch (skin.divider) {
    case "dashed":
      return `<hr style="border:0;border-top:1px dashed ${options.colors.border};margin:32px 0;" />`;
    case "dots":
      return glyphLine("···", options.colors.subText);
    case "ornament":
      return glyphLine("✦", options.colors.link);
    case "bar":
      return `<hr style="width:48px;border:0;border-top:4px solid ${options.colors.link};margin:36px auto;" />`;
    default:
      return `<hr style="border:0;border-top:1px solid ${options.colors.divider};margin:32px 0;" />`;
  }
};

const renderImage = (block: Extract<Block, { type: "image" }>, options: RenderOptions, skin: ThemeSkin, ctx: SkinRenderContext): string => {
  const src = ctx.imageMap?.get(block.src) ?? block.src;
  const look = {
    plain: "border-radius:0;",
    rounded: `border-radius:${skin.radius};`,
    frame: `padding:6px;background:#ffffff;border:1px solid ${options.colors.divider};box-sizing:border-box;border-radius:2px;`
  }[skin.image];
  return `<p style="overflow-wrap:break-word;text-align:center;margin:24px 0;"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt ?? "")}" style="max-width:100%;${look}" /></p>`;
};

const DARK_CODE = { bg: "#0f172a", text: "#e2e8f0", label: "#94a3b8" };

const renderCode = (block: Extract<Block, { type: "code" }>, options: RenderOptions, skin: ThemeSkin): string => {
  const codeSize = Math.max(13, Math.round(baseFontSize(options) * 0.9));
  const langAttr = block.language ? ` data-language-pending="${escapeHtml(block.language)}"` : "";
  const dark = skin.code === "dark";
  const surface = dark
    ? `color:${DARK_CODE.text};background:${DARK_CODE.bg};`
    : `color:#24292f;background:${options.colors.codeBg};border:1px solid ${options.colors.divider};`;
  const header = dark
    ? `<p style="margin:0;padding:12px 16px 0;line-height:1;font-size:12px;">${wrapLeaf(
        `<span style="color:#ff5f57;">●</span> <span style="color:#febc2e;">●</span> <span style="color:#28c840;">●</span>${
          block.language ? `<span style="color:${DARK_CODE.label};margin-left:10px;">${escapeHtml(block.language)}</span>` : ""
        }`
      )}</p>`
    : "";
  return `<section style="${surface}font-size:${codeSize}px;border-radius:${skin.radius === "0" ? "0" : "8px"};line-height:1.65;margin:${options.style.codeMargin};padding:0;">${header}<code${langAttr} style="font-size:inherit;line-height:inherit;border-radius:4px;display:block;padding:${dark ? "12px 16px 16px" : "16px 18px"};overflow-wrap:anywhere;word-break:break-word;text-indent:0;color:inherit;background:none;white-space:pre-wrap;margin:0;font-family:Menlo, Monaco, Consolas, monospace;">${wrapLeaf(escapeHtml(block.code))}</code></section>`;
};

const STEP_INDENT = 34;

const renderSteps = (block: Extract<Block, { type: "steps" }>, options: RenderOptions, skin: ThemeSkin, ctx: SkinRenderContext): string => {
  const accent = options.colors.link;
  const badgeFor = (index: number): string => {
    // 徽标宽度 + 右间距 = STEP_INDENT，配合段落悬挂缩进让换行文字与首行对齐
    const common = `display:inline-block;text-indent:0;white-space:nowrap;letter-spacing:0;`;
    if (!block.ordered) return `<span style="${common}width:22px;margin-right:12px;text-align:center;color:${accent};font-size:0.7em;">●</span>`;
    if (skin.steps === "numeral") {
      return `<span style="${common}width:28px;margin-right:6px;color:${accent};font-family:${skin.numeralFont ?? options.fontStack};font-weight:700;">${pad2(index + 1)}</span>`;
    }
    const shape = skin.steps === "circle" ? "border-radius:50%;" : "border-radius:2px;";
    return `<span style="${common}width:22px;height:22px;line-height:22px;margin-right:12px;${shape}background:${accent};color:${skin.onAccent};font-size:12px;font-weight:700;text-align:center;vertical-align:1px;">${index + 1}</span>`;
  };
  const rows = block.items
    .map((item, index) => {
      const inner = inlinesToHtml(item.children, options, ctx.indexMap) || "<br/>";
      return `<p style="${buildBodyParagraphStyle(options)}margin:0 0 12px;padding-left:${STEP_INDENT}px;text-indent:-${STEP_INDENT}px;">${wrapLeaf(badgeFor(index) + inner)}</p>`;
    })
    .join("");
  const container =
    skin.steps === "numeral"
      ? `margin:24px 0;padding:14px 0 2px;border-top:1px solid ${options.colors.divider};`
      : `margin:24px 0;padding:18px 18px 6px;background:${skin.tint};border-radius:${skin.radius};`;
  return `<section style="${container}">${rows}</section>`;
};

const renderTable = (table: TableBlock, options: RenderOptions, skin: ThemeSkin, ctx: SkinRenderContext): string => {
  const columnCount = table.rows.reduce((max, row) => Math.max(max, row.cells.length), 0) || 1;
  const width = Math.floor(100 / columnCount);
  const divider = options.colors.divider;
  const headerOptions = skin.table === "solid" ? onAccentOptions(options, skin) : options;
  const cellStyle = (isHeader: boolean): string => {
    const base = `overflow-wrap:anywhere;font-family:${options.fontStack};font-size:${options.typography.bodySize};vertical-align:top;width:${width}%;padding:8px 10px;text-align:left;${letterSpacingStyle(options)}`;
    if (skin.table === "line") {
      return `${base}border:0;border-bottom:${isHeader ? `2px solid ${options.colors.text}` : `1px solid ${divider}`};${isHeader ? "font-weight:700;" : ""}`;
    }
    const fill = isHeader
      ? `background:${skin.table === "solid" ? options.colors.link : skin.tint};font-weight:700;${skin.table === "solid" ? `color:${skin.onAccent};` : ""}`
      : "background:#ffffff;";
    return `${base}border:1px solid ${divider};${fill}`;
  };
  const rows = table.rows
    .map((row) => {
      const isHeader = row.isHeader === true;
      const tag = isHeader ? "th" : "td";
      const cells = row.cells
        .map((cell) => `<${tag} style="${cellStyle(isHeader)}">${wrapLeaf(inlinesToHtml(cell.children, isHeader ? headerOptions : options, ctx.indexMap))}</${tag}>`)
        .join("");
      return `<tr style="font-size:${options.typography.bodySize};">${cells}</tr>`;
    })
    .join("");
  const outer = skin.table === "line" ? "border:0;" : `border:1px solid ${divider};`;
  return `<table style="font-size:${options.typography.bodySize};margin:20px 0;line-height:${options.typography.bodyLineHeight};border-collapse:collapse;width:100%;${outer}">${rows}</table>`;
};

// 返回 null 表示交给通用渲染（段落、列表）
export const renderSkinBlock = (
  block: Block,
  options: RenderOptions,
  skin: ThemeSkin,
  ctx: SkinRenderContext
): string | null => {
  switch (block.type) {
    case "heading":
      return renderSkinHeading(block, options, skin, ctx);
    case "quote":
      return renderQuote(block, options, skin, ctx);
    case "callout":
      return renderCallout(block, options, skin, ctx);
    case "emphasis":
      return renderEmphasis(block, options, skin, ctx);
    case "divider":
      return renderDivider(options, skin);
    case "image":
      return renderImage(block, options, skin, ctx);
    case "code":
      return renderCode(block, options, skin);
    case "steps":
      return renderSteps(block, options, skin, ctx);
    case "table":
      return renderTable(block, options, skin, ctx);
    default:
      return null;
  }
};
