import type { RenderOptions } from "./theme";
import type { Inline } from "./types";

export const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sanitizeCssColor = (value: string): string => {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i.test(trimmed)) return trimmed;
  return "yellow";
};

export const normalizeHref = (href: string): string => href.trim();

// 荧光笔效果：下半部分底色；clone 让多行文本每行都带下划高亮
export const markerBackground = (color: string): string =>
  `background:linear-gradient(to bottom, transparent 60%, ${color} 60%);-webkit-box-decoration-break:clone;box-decoration-break:clone;`;

const LEGACY_BORDER_LINK_THEMES = new Set(["red", "blue", "sspai", "matcha", "bento", "black", "academia"]);

const strongStyle = (options: RenderOptions, inlineAccent: boolean): string => {
  const skin = options.style.skin;
  if (skin && !inlineAccent) {
    if (skin.strong === "accent") return `font-weight:600;color:${options.colors.link};`;
    if (skin.strong === "marker") return `font-weight:600;padding:0 1px;${markerBackground(skin.marker)}`;
    return `font-weight:600;color:${options.colors.text};`;
  }
  // 加粗默认仅 font-weight，不整体染强调色；只有 Notion 真彩色文本或主题显式开启时才染色
  const boldAccent = inlineAccent || options.style.accentOnBold;
  return `font-weight:600;${boldAccent ? `overflow-wrap:anywhere;color:${options.colors.link};` : ""}`;
};

const linkDecoration = (options: RenderOptions): string =>
  options.style.skin || LEGACY_BORDER_LINK_THEMES.has(options.themeId ?? "")
    ? `text-decoration:none;border-bottom:1px solid ${options.colors.link};`
    : "text-decoration:underline;";

export const inlineToHtml = (
  inline: Inline,
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  const inlineAccent = "color" in inline && inline.color === "accent";
  const accentColor = inlineAccent ? `color:${options.colors.link};` : "";
  switch (inline.type) {
    case "text":
      return inlineAccent
        ? `<span style="color:${options.colors.link};">${escapeHtml(inline.content)}</span>`
        : escapeHtml(inline.content);
    case "bold":
      return `<strong style="${strongStyle(options, inlineAccent)}">${escapeHtml(inline.content)}</strong>`;
    case "italic":
      return `<em style="font-style:italic;${accentColor}">${escapeHtml(inline.content)}</em>`;
    case "strikethrough":
      return `<del style="text-decoration:line-through;${accentColor}">${escapeHtml(inline.content)}</del>`;
    case "underline":
      return `<span style="text-decoration:underline;${accentColor}">${escapeHtml(inline.content)}</span>`;
    case "highlight":
      return `<mark style="background:${sanitizeCssColor(inline.highlightColor)};padding:2px 0;${options.style.skin ? "color:#1f1f1f;" : ""}">${escapeHtml(inline.content)}</mark>`;
    case "code":
      return `<code style="font-family:Menlo, Monaco, Consolas, monospace;background:${options.colors.inlineCodeBg};overflow-wrap:anywhere;padding:2px 4px;border-radius:4px;font-size:0.95em;">${escapeHtml(inline.content)}</code>`;
    case "link": {
      const href = normalizeHref(inline.href);
      const index = indexMap?.get(href);
      const sup = index ? `<sup style="font-size:0.8em;">[${index}]</sup>` : "";
      return `<a href="${escapeHtml(href)}" style="overflow-wrap:anywhere;color:${options.colors.link};${linkDecoration(options)}">${escapeHtml(
        inline.content
      )}${sup}</a>`;
    }
    default:
      return "";
  }
};

export const inlinesToHtml = (
  inlines: Inline[],
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => inlines.map((inline) => inlineToHtml(inline, options, indexMap)).join("");

// 微信编辑器把 span[leaf] 作为文字叶子节点。统一包裹富文本内容可以避免
// line-height 校验器把同一行里的 strong/span/code 片段误算成多行。
export const wrapLeaf = (html: string): string => `<span leaf="">${html}</span>`;

export const inlinesToLeafHtml = (
  inlines: Inline[],
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => wrapLeaf(inlinesToHtml(inlines, options, indexMap));

export const letterSpacingStyle = (options: RenderOptions): string =>
  options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : "";

export const buildBodyParagraphStyle = (options: RenderOptions, color?: string): string =>
  `font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};margin:0 0 ${options.typography.bodyMarginBottom};color:${color ?? options.colors.text};font-weight:${options.typography.bodyWeight};${letterSpacingStyle(options)}text-align:${options.style.skin?.justify ? "justify" : "left"};overflow-wrap:break-word;white-space:pre-line;min-height:20px;padding-left:0em;`;

export const baseFontSize = (options: RenderOptions): number =>
  Number.parseFloat(options.typography.bodySize) || 16;
