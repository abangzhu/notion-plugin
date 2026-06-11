import { mergeRenderOptions, getCodeHighlightColors } from "./theme";
import type { RenderOptions } from "./theme";
import type { Block, Doc, Inline, ListBlock, ListItem, TableBlock } from "./types";
import type { ImageMap } from "./image-loader";
import { highlightCode } from "./highlighter";

type ReferenceItem = {
  href: string;
  text: string;
};

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeCssColor = (value: string): string => {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i.test(trimmed)) return trimmed;
  return "yellow";
};

const normalizeHref = (href: string): string => href.trim();

const hostnameOf = (href: string): string => {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
};

const collectReferencesFromInlines = (
  inlines: Inline[],
  items: ReferenceItem[],
  indexMap: Map<string, number>
) => {
  inlines.forEach((inline) => {
    if (inline.type !== "link") return;
    const href = normalizeHref(inline.href);
    if (!href) return;
    if (!indexMap.has(href)) {
      indexMap.set(href, items.length + 1);
      items.push({ href, text: inline.content });
    }
  });
};

const collectReferencesFromList = (
  list: ListBlock,
  items: ReferenceItem[],
  indexMap: Map<string, number>
) => {
  list.items.forEach((item) => {
    collectReferencesFromInlines(item.children, items, indexMap);
    item.nested?.forEach((nested) => collectReferencesFromList(nested, items, indexMap));
  });
};

const collectReferencesFromTable = (
  table: TableBlock,
  items: ReferenceItem[],
  indexMap: Map<string, number>
) => {
  table.rows.forEach((row) => {
    row.cells.forEach((cell) => collectReferencesFromInlines(cell.children, items, indexMap));
  });
};

const collectReferences = (doc: Doc): { items: ReferenceItem[]; indexMap: Map<string, number> } => {
  const items: ReferenceItem[] = [];
  const indexMap = new Map<string, number>();

  doc.blocks.forEach((block) => {
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "quote":
      case "callout":
      case "emphasis":
        collectReferencesFromInlines(block.children, items, indexMap);
        break;
      case "steps":
        block.items.forEach((item) =>
          collectReferencesFromInlines(item.children, items, indexMap)
        );
        break;
      case "list":
        collectReferencesFromList(block, items, indexMap);
        break;
      case "table":
        collectReferencesFromTable(block, items, indexMap);
        break;
      default:
        break;
    }
  });

  return { items, indexMap };
};

const inlineToHtml = (
  inline: Inline,
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  const isPineapple = options.themeId === "red";
  const isBlue = options.themeId === "blue";
  const isBlack = options.themeId === "black";
  const isSspai = options.themeId === "sspai";
  const isMatcha = options.themeId === "matcha";
  const isAcademia = options.themeId === "academia";
  const isBento = options.themeId === "bento";
  const isAccentTheme = isPineapple || isBlue || isSspai || isMatcha || isBento;
  const inlineAccent = "color" in inline && inline.color === "accent";
  switch (inline.type) {
    case "text":
      return inlineAccent
        ? `<span style="color:${options.colors.link};">${escapeHtml(inline.content)}</span>`
        : escapeHtml(inline.content);
    case "bold": {
      // 加粗默认仅 font-weight，不整体染强调色；只有 Notion 真彩色文本或主题显式开启时才染色
      const boldAccent = inlineAccent || options.style.accentOnBold;
      return `<strong style="font-weight:600;${boldAccent ? `word-break:break-all;color:${options.colors.link};` : ""}">${escapeHtml(
        inline.content
      )}</strong>`;
    }
    case "italic":
      return `<em style="font-style:italic;${inlineAccent ? `color:${options.colors.link};` : ""}">${escapeHtml(
        inline.content
      )}</em>`;
    case "strikethrough":
      return `<del style="text-decoration:line-through;${inlineAccent ? `color:${options.colors.link};` : ""}">${escapeHtml(inline.content)}</del>`;
    case "underline":
      return `<span style="text-decoration:underline;${inlineAccent ? `color:${options.colors.link};` : ""}">${escapeHtml(inline.content)}</span>`;
    case "highlight":
      return `<mark style="background:${sanitizeCssColor(inline.highlightColor)};padding:2px 0;">${escapeHtml(inline.content)}</mark>`;
    case "code":
      return `<code style="font-family:Menlo, Monaco, Consolas, monospace;background:${options.colors.inlineCodeBg};padding:2px 4px;border-radius:4px;font-size:0.95em;">${escapeHtml(inline.content)}</code>`;
    case "link":
      const href = normalizeHref(inline.href);
      const index = indexMap?.get(href);
      const sup = index ? `<sup style="font-size:0.8em;">[${index}]</sup>` : "";
      return `<a href="${escapeHtml(href)}" style="color:${options.colors.link};${isAccentTheme || isBlack || isAcademia ? "text-decoration:none;border-bottom:1px solid " + options.colors.link + ";" : "text-decoration:underline;"}">${escapeHtml(
        inline.content
      )}${sup}</a>`;
    default:
      return "";
  }
};

const inlinesToHtml = (
  inlines: Inline[],
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => inlines.map((inline) => inlineToHtml(inline, options, indexMap)).join("");

const buildBodyParagraphStyle = (options: RenderOptions, color?: string): string =>
  `font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};margin:0 0 ${options.typography.bodyMarginBottom};color:${color ?? options.colors.text};font-weight:${options.typography.bodyWeight};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}text-align:left;white-space:pre-line;min-height:20px;padding-left:0em;`;

// 由 StyleTokens.headings 驱动的标题渲染，覆盖 default / red / blue / black / sspai。
// notion/matcha/academia/bento 的标题在 blockToHtml 内有各自分支，不经此函数。
const headingToHtml = (
  block: Extract<Block, { type: "heading" }>,
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  const tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
  const baseSize = Number.parseFloat(options.typography.bodySize) || 16;
  const hs =
    block.level === 1
      ? options.style.headings.h1
      : block.level === 2
        ? options.style.headings.h2
        : options.style.headings.h3;
  const fontSize = Math.round(baseSize * hs.scale);
  const weight = hs.weight ?? options.typography.headingWeight;
  const color =
    hs.colorKey === "link"
      ? options.colors.link
      : hs.colorKey === "subText"
        ? options.colors.subText
        : options.colors.text;
  const accent = hs.accentColorKey === "border" ? options.colors.border : options.colors.link;
  const mt = Math.round(baseSize * hs.marginTopEm);
  const mb = Math.round(baseSize * hs.marginBottomEm);
  const center = hs.align === "center";
  const mAuto = hs.fitContent && center ? "auto" : "0";
  const parts = [
    `font-family:${options.fontStack}`,
    `font-size:${fontSize}px`,
    `font-weight:${weight}`,
    `margin:${mt}px ${mAuto} ${mb}px ${mAuto}`,
    `line-height:${hs.lineHeight}`,
    `color:${color}`
  ];
  if (hs.fitContent) parts.push("width:fit-content");
  if (center && !hs.fitContent) parts.push("text-align:center");
  if (hs.decoration === "underline") parts.push(`border-bottom:2px solid ${accent}`, "padding-bottom:6px");
  else if (hs.decoration === "sidebar") parts.push(`border-left:3px solid ${accent}`, "padding-left:10px");
  return `<${tag} style="${parts.join(";")};">${inlinesToHtml(block.children, options, indexMap)}</${tag}>`;
};

// 金句卡：引用的卡片式变体（居中、大引号、卡片底色），由 StyleTokens.quoteVariant === "card" 触发
const quoteCardHtml = (
  block: Extract<Block, { type: "quote" }>,
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  const inner = inlinesToHtml(block.children, options, indexMap) || "<br/>";
  const baseSize = Number.parseFloat(options.typography.bodySize) || 16;
  const bg = options.style.calloutBg ?? options.colors.codeBg;
  return `<section style="margin:24px 0;padding:22px 20px;background:${bg};border-radius:${options.style.radiusMd};text-align:center;font-family:${options.fontStack};"><span style="display:block;font-size:${Math.round(
    baseSize * 2.4
  )}px;line-height:1;color:${options.colors.link};margin:0 0 6px;">&ldquo;</span><p style="margin:0;font-size:${Math.round(
    baseSize * 1.1
  )}px;line-height:1.7;font-weight:600;color:${options.colors.text};">${inner}</p></section>`;
};

const listItemToHtml = (
  item: ListItem,
  options: RenderOptions,
  depth: number,
  indexMap?: Map<string, number>,
  textColor?: string,
  imageMap?: ImageMap
): string => {
  const textHtml = inlinesToHtml(item.children, options, indexMap) || "<br/>";
  const nestedHtml =
    item.nested?.map((nested) => listToHtml(nested, options, depth + 1, indexMap, imageMap)).join("") ?? "";
  const paragraphStyle = buildBodyParagraphStyle(options, textColor);
  return `<li><p style="${paragraphStyle}"><span leaf="">${textHtml}</span></p>${nestedHtml}</li>`;
};

const listToHtml = (
  list: ListBlock,
  options: RenderOptions,
  depth = 0,
  indexMap?: Map<string, number>,
  imageMap?: ImageMap
): string => {
  const tag = list.ordered ? "ol" : "ul";
  const orderedStyles = ["decimal", "lower-alpha", "lower-roman", "upper-alpha", "upper-roman"];
  const unorderedStyles = ["disc", "circle", "square"];
  const listStyleType = list.ordered
    ? orderedStyles[Math.min(depth, orderedStyles.length - 1)]
    : unorderedStyles[Math.min(depth, unorderedStyles.length - 1)];
  const isAccentTheme =
    options.themeId === "red" ||
    options.themeId === "blue" ||
    options.themeId === "sspai" ||
    options.themeId === "matcha" ||
    options.themeId === "bento";
  const itemTextColor = !list.ordered && isAccentTheme ? options.colors.text : options.colors.text;
  const extraStyle =
    options.themeId === "bento"
      ? `margin:14px 0;padding-left:1.75em;border-left:3px solid ${options.colors.divider};`
      : options.themeId === "matcha"
        ? `margin:14px 0;padding-left:1.65em;color:${options.colors.link};`
        : options.themeId === "academia"
          ? `margin:14px 0;padding-left:1.65em;`
          : "padding-left:1.5em;";
  const listItems = list.items
    .map((item) => listItemToHtml(item, options, depth, indexMap, itemTextColor, imageMap))
    .join("");
  return `<${tag} style="list-style-type:${listStyleType};${extraStyle}list-style-position:outside;" class="list-paddingleft-1">${listItems}</${tag}>`;
};

const tableToHtml = (
  table: TableBlock,
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  const rows = table.rows;
  const columnCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0) || 1;
  const widthPercent = Math.floor(100 / columnCount);
  const isNotion = options.themeId === "notion";
  const isMatcha = options.themeId === "matcha";
  const isAcademia = options.themeId === "academia";
  const isBento = options.themeId === "bento";
  const headerBackground = isMatcha
    ? "#eef7ec"
    : isAcademia
      ? "#f3e7d2"
      : isBento
        ? "#eef4ff"
        : isNotion
          ? "#f7f6f3"
          : "#f5f5f5";
  const bodyBackground = isAcademia ? "#fffaf1" : "#ffffff";
  const borderColor = options.colors.divider;
  const tableBorderStyle = isBento
    ? `border:1px solid ${borderColor};border-radius:8px;overflow:hidden;`
    : `border:1px solid ${borderColor};`;
  const tbody = rows
    .map((row) => {
      const isHeader = row.isHeader === true;
      const cellTag = isHeader ? "th" : "td";
      const headerBg = isHeader ? `background:${headerBackground};` : `background:${bodyBackground};`;
      const headerWeight = isHeader ? "font-weight:700;" : "";
      const cells = row.cells
        .map((cell) => {
          const cellPadding = isBento ? "10px 12px" : isAcademia ? "8px 10px" : "6px 8px";
          return `<${cellTag} style="word-break:break-all;font-family:${options.fontStack};font-size:${options.typography.bodySize};vertical-align:top;width:${widthPercent}%;border:1px solid ${borderColor};padding:${cellPadding};${headerBg}${headerWeight}${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}">${inlinesToHtml(
            cell.children,
            options,
            indexMap
          )}</${cellTag}>`;
        })
        .join("");
      return `<tr style="font-size:${options.typography.bodySize};">${cells}</tr>`;
    })
    .join("");

  return `<table style="font-size:${options.typography.bodySize};margin:${isBento ? "18px 0" : "12px 0"};line-height:${options.typography.bodyLineHeight};border-collapse:collapse;width:100%;${tableBorderStyle}">${tbody}</table>`;
};

const blockToHtml = (
  block: Block,
  options: RenderOptions,
  indexMap?: Map<string, number>,
  imageMap?: ImageMap
): string => {
  const baseSize = Number.parseFloat(options.typography.bodySize) || 16;
  const h1Size = Math.round(baseSize * 1.6);
  const h2Size = Math.round(baseSize * 1.33);
  const h3Size = Math.round(baseSize * 1.13);
  const isPineapple = options.themeId === "red";
  const isBlue = options.themeId === "blue";
  const isBlack = options.themeId === "black";
  const isSspai = options.themeId === "sspai";
  const isNotion = options.themeId === "notion";
  const isMatcha = options.themeId === "matcha";
  const isAcademia = options.themeId === "academia";
  const isBento = options.themeId === "bento";
  const isAccentTheme = isPineapple || isBlue;
  switch (block.type) {
    case "heading": {
      const tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
      if (isNotion) {
        const fontSize =
          block.level === 1 ? `${h1Size}px` : block.level === 2 ? `${h2Size}px` : `${h3Size}px`;
        const margin =
          block.level === 1
            ? `0 0 ${Math.round(baseSize * 1.8)}px`
            : `${Math.round(baseSize * 1.7)}px 0 ${Math.round(baseSize * 0.7)}px`;
        return `<${tag} style="font-family:${options.fontStack};font-size:${fontSize};font-weight:700;margin:${margin};line-height:1.35;color:${options.colors.text};letter-spacing:0;">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      if (isMatcha) {
        if (block.level === 1) {
          return `<${tag} style="font-family:${options.fontStack};font-size:${h1Size}px;font-weight:700;line-height:1.45;margin:0 0 ${Math.round(baseSize * 2)}px;color:${options.colors.text};padding:0 0 10px;border-bottom:2px solid ${options.colors.border};">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        if (block.level === 2) {
          return `<${tag} style="font-family:${options.fontStack};font-size:${h2Size}px;font-weight:700;line-height:1.45;margin:${Math.round(baseSize * 2.2)}px 0 ${Math.round(baseSize * 1)}px;color:${options.colors.text};padding:2px 0 2px 12px;border-left:4px solid ${options.colors.link};background:#f7fbf4;">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        return `<${tag} style="font-family:${options.fontStack};font-size:${h3Size}px;font-weight:700;line-height:1.45;margin:${Math.round(baseSize * 1.8)}px 0 ${Math.round(baseSize * 0.8)}px;color:${options.colors.link};">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      if (isAcademia) {
        if (block.level === 1) {
          return `<${tag} style="font-family:${options.fontStack};font-size:${h1Size}px;font-weight:700;line-height:1.45;margin:0 0 ${Math.round(baseSize * 2.1)}px;color:${options.colors.text};text-align:center;padding:0 0 12px;border-bottom:1px solid ${options.colors.border};">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        if (block.level === 2) {
          return `<${tag} style="font-family:${options.fontStack};font-size:${h2Size}px;font-weight:700;line-height:1.45;margin:${Math.round(baseSize * 2.4)}px 0 ${Math.round(baseSize)}px;color:${options.colors.link};">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        return `<${tag} style="font-family:${options.fontStack};font-size:${h3Size}px;font-weight:700;line-height:1.45;margin:${Math.round(baseSize * 1.8)}px 0 ${Math.round(baseSize * 0.8)}px;color:${options.colors.text};padding-left:10px;border-left:3px solid ${options.colors.border};">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      if (isBento) {
        if (block.level === 1) {
          return `<${tag} style="font-family:${options.fontStack};font-size:${h1Size}px;font-weight:800;line-height:1.35;margin:0 0 ${Math.round(baseSize * 2)}px;color:${options.colors.text};padding:0 0 12px;border-bottom:1px solid ${options.colors.divider};">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        if (block.level === 2) {
          return `<${tag} style="font-family:${options.fontStack};font-size:${h2Size}px;font-weight:800;line-height:1.35;margin:${Math.round(baseSize * 2)}px 0 ${Math.round(baseSize)}px;color:${options.colors.text};padding:8px 12px;background:#f8fafc;border:1px solid ${options.colors.divider};border-left:4px solid ${options.colors.link};border-radius:8px;">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        return `<${tag} style="font-family:${options.fontStack};font-size:${h3Size}px;font-weight:700;line-height:1.4;margin:${Math.round(baseSize * 1.6)}px 0 ${Math.round(baseSize * 0.7)}px;color:${options.colors.link};">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      return headingToHtml(block, options, indexMap);
    }
    case "paragraph":
      return `<p style="${buildBodyParagraphStyle(options)}">${inlinesToHtml(
        block.children,
        options,
        indexMap
      )}</p>`;
    case "quote":
      if (block.variant === "card" || options.style.quoteVariant === "card")
        return quoteCardHtml(block, options, indexMap);
      if (isNotion) {
        return `<blockquote style="font-family:${options.fontStack};border-left:3px solid ${options.colors.border};padding:2px 0 2px 14px;margin:18px 0;color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      if (isMatcha) {
        return `<blockquote style="font-family:${options.fontStack};border-left:4px solid ${options.colors.link};padding:12px 14px;margin:20px 0;background:#f5faf2;color:${options.colors.text};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      if (isAcademia) {
        return `<blockquote style="font-family:${options.fontStack};border-top:1px solid ${options.colors.border};border-bottom:1px solid ${options.colors.border};padding:14px 8px;margin:22px 0;background:#fffaf1;color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};font-style:italic;">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      if (isBento) {
        return `<blockquote style="font-family:${options.fontStack};border:1px solid ${options.colors.divider};border-left:4px solid ${options.colors.link};border-radius:8px;padding:12px 14px;margin:20px 0;background:#f8fafc;color:${options.colors.text};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      if (isBlack) {
        return `<blockquote style="font-family:${options.fontStack};border-left:8px solid ${options.colors.border};padding:10px;margin:20px 0;background-color:#f5f5f5;color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      if (isSspai) {
        return `<blockquote style="font-family:${options.fontStack};border-left:2px solid ${options.colors.link};padding:24px 16px 12px;margin:24px 0 36px;background:url('https://new-notion-1315843248.cos.ap-guangzhou.myqcloud.com/theme/pie/pie_blockquote.svg') 12px 0 / 12px no-repeat;color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      return `<blockquote style="font-family:${options.fontStack};border-left:${isAccentTheme ? "3px" : "4px"} solid ${options.colors.border};padding:${isAccentTheme ? "1px 10px 1px 20px" : "0 0 0 12px"};margin:${isAccentTheme ? "20px 0" : "16px 0"};color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};">${inlinesToHtml(
        block.children,
        options,
        indexMap
      )}</blockquote>`;
    case "callout": {
      const icon = escapeHtml((block.icon || "💡").trim() || "💡");
      const inner = inlinesToHtml(block.children, options, indexMap) || "<br/>";
      if (isNotion) {
        return `<section style="margin:16px 0;padding:12px 14px;background:${options.style.calloutBg ?? options.colors.codeBg};border-radius:6px;color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="margin:0;"><strong style="margin-right:8px;">${icon}</strong>${inner}</p></section>`;
      }
      if (isMatcha) {
        return `<section style="margin:16px 0;padding:12px 14px;background:#f2f8ef;border:1px solid ${options.colors.border};border-left:4px solid ${options.colors.link};border-radius:6px;color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="margin:0;"><strong style="margin-right:8px;color:${options.colors.link};">${icon}</strong>${inner}</p></section>`;
      }
      if (isAcademia) {
        return `<section style="margin:18px 0;padding:12px 14px;background:#fbf4e8;border:1px solid ${options.colors.divider};border-top:3px solid ${options.colors.border};color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="margin:0;"><strong style="margin-right:8px;color:${options.colors.link};">${icon}</strong>${inner}</p></section>`;
      }
      if (isBento) {
        return `<section style="margin:16px 0;padding:14px;background:#f8fafc;border:1px solid ${options.colors.divider};border-radius:8px;box-shadow:0 1px 0 rgba(15,23,42,0.04);color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="margin:0;"><strong style="margin-right:8px;color:${options.colors.link};">${icon}</strong>${inner}</p></section>`;
      }
      if (isBlack) {
        return `<section style="margin:16px 0;padding:10px 12px;background:#f5f5f5;border-left:8px solid ${options.colors.border};color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="margin:0;"><strong style="margin-right:6px;">${icon}</strong>${inner}</p></section>`;
      }
      if (isSspai) {
        return `<section style="margin:16px 0;padding:10px 12px;background:#fff7f7;border-left:2px solid ${options.colors.link};color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="margin:0;"><strong style="margin-right:6px;color:${options.colors.link};">${icon}</strong>${inner}</p></section>`;
      }
      return `<section style="margin:16px 0;padding:10px 12px;background:${options.style.calloutBg ?? options.colors.codeBg};border-left:3px solid ${options.colors.border};border-radius:4px;color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="margin:0;"><strong style="margin-right:6px;color:${isAccentTheme ? options.colors.link : options.colors.text};">${icon}</strong>${inner}</p></section>`;
    }
    case "divider":
      if (isNotion || isMatcha || isAcademia || isBento) {
        const dividerMargin = isBento ? "22px 0" : isAcademia ? "24px 0" : "20px 0";
        const dividerColor = isAcademia ? options.colors.border : options.colors.divider;
        return `<hr style="border:none;border-top:1px solid ${dividerColor};margin:${dividerMargin};" />`;
      }
      return isAccentTheme || isBlack || isSspai
        ? `<hr style="border-style:solid;border-width:1px 0 0;border-color:${options.colors.divider};transform-origin:0 0;transform:scale(1,${isSspai ? "1" : "0.5"});margin:${isSspai ? "15px 0" : "16px 0"};" />`
        : `<hr style="border:none;border-top:1px solid ${options.colors.divider};margin:16px 0;" />`;
    case "image": {
      const imgSrc = imageMap?.get(block.src) ?? block.src;
      const imageRadius = isAcademia ? "0" : isBento ? "8px" : "6px";
      const imageMargin = isBento || isAcademia ? "22px 0" : "16px 0";
      const imageBorder =
        isAcademia || isBento || isMatcha ? `border:1px solid ${options.colors.divider};` : "";
      return `<p style="text-align:center;margin:${imageMargin};"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(block.alt ?? "")}" style="max-width:100%;border-radius:${imageRadius};${imageBorder}" /></p>`;
    }
    case "code": {
      const langLabel = block.language ?? "";
      const codeColors = getCodeHighlightColors(options.themeId);
      const highlighted = highlightCode(block.code, block.language, codeColors);
      const macDots = `<span style="display:flex;padding:10px 14px 0px;"><svg xmlns="http://www.w3.org/2000/svg" version="1.1" x="0px" y="0px" width="45px" height="13px" viewBox="0 0 450 130" role="img" aria-label="code-window"><ellipse cx="50" cy="65" rx="50" ry="52" stroke="rgb(220,60,54)" stroke-width="2" fill="rgb(237,108,96)"></ellipse><ellipse cx="225" cy="65" rx="50" ry="52" stroke="rgb(218,151,33)" stroke-width="2" fill="rgb(247,193,81)"></ellipse><ellipse cx="400" cy="65" rx="50" ry="52" stroke="rgb(27,161,37)" stroke-width="2" fill="rgb(100,200,86)"></ellipse></svg></span>`;
      const langAttr = langLabel ? ` data-language-pending="${escapeHtml(langLabel)}"` : "";
      if (isPineapple) {
        return `<pre style="color:#333;background:#fafafa;font-size:90%;overflow-x:auto;border-radius:8px;line-height:1.5;margin:${options.style.codeMargin};padding:0px !important;border:1px solid #f0f0f0;box-shadow:0 2px 10px rgba(0,0,0,0.3);">${macDots}<code${langAttr} style="font-size:90%;border-radius:4px;display:block;padding:0.5em 1em 1em;overflow-x:auto;text-indent:0px;color:inherit;background:none;white-space:pre;margin:0px;font-family:Menlo, Monaco, Consolas, monospace;">${highlighted}</code></pre>`;
      }
      if (isNotion || isMatcha || isAcademia || isBento) {
        const codeTextColor = isAcademia ? "#4f3f30" : "#24292f";
        const codeBorder = isBento
          ? `border:1px solid ${options.colors.divider};`
          : isAcademia || isMatcha || isNotion
            ? `border:1px solid ${options.colors.divider};`
            : "";
        return `<pre style="color:${codeTextColor};background:${options.colors.codeBg};font-size:90%;overflow-x:auto;border-radius:${isAcademia ? "0" : "8px"};line-height:1.5;margin:${options.style.codeMargin};padding:0px !important;${codeBorder}">${macDots}<code${langAttr} style="font-size:90%;border-radius:4px;display:block;padding:0.5em 1em 1em;overflow-x:auto;text-indent:0px;color:inherit;background:none;white-space:pre;margin:0px;font-family:Menlo, Monaco, Consolas, monospace;">${highlighted}</code></pre>`;
      }
      return `<pre style="color:rgb(201,209,217);background:rgb(13,17,23);font-size:90%;overflow-x:auto;border-radius:8px;line-height:1.5;margin:${options.style.codeMargin};padding:0px !important;">${macDots}<code${langAttr} style="font-size:90%;border-radius:4px;display:block;padding:0.5em 1em 1em;overflow-x:auto;text-indent:0px;color:inherit;background:none;white-space:pre;margin:0px;font-family:Menlo, Monaco, Consolas, monospace;">${highlighted}</code></pre>`;
    }
    case "emphasis": {
      const inner = inlinesToHtml(block.children, options, indexMap) || "<br/>";
      const accent = options.colors.link;
      const bg = options.style.calloutBg ?? options.colors.codeBg;
      const ls = options.typography.letterSpacing
        ? `letter-spacing:${options.typography.letterSpacing};`
        : "";
      if (isMatcha) {
        return `<section style="margin:18px 0;padding:14px 16px;background:#eef7ec;border:1px solid ${options.colors.border};border-left:4px solid ${accent};border-radius:6px;font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};color:${options.colors.text};${ls}"><p style="margin:0;font-weight:600;">${inner}</p></section>`;
      }
      return `<section style="margin:18px 0;padding:14px 16px;background:${bg};border-left:4px solid ${accent};border-radius:${options.style.radiusMd};font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};color:${options.colors.text};${ls}"><p style="margin:0;font-weight:600;">${inner}</p></section>`;
    }
    case "steps": {
      const accent = options.colors.link;
      const bg = options.style.calloutBg ?? options.colors.codeBg;
      const rows = block.items
        .map((item, i) => {
          const inner = inlinesToHtml(item.children, options, indexMap) || "<br/>";
          const badge = block.ordered
            ? `<span style="flex:0 0 auto;display:inline-block;width:24px;height:24px;border-radius:50%;background:${accent};color:#fff;font-size:13px;line-height:24px;text-align:center;font-weight:700;margin-right:10px;">${i + 1}</span>`
            : `<span style="flex:0 0 auto;display:inline-block;width:8px;height:8px;border-radius:50%;background:${accent};margin:9px 14px 0 6px;"></span>`;
          return `<section style="display:flex;align-items:flex-start;margin:0 0 12px;">${badge}<p style="margin:0;flex:1;font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};color:${options.colors.text};">${inner}</p></section>`;
        })
        .join("");
      return `<section style="margin:18px 0;padding:16px 16px 4px;background:${bg};border-radius:${options.style.radiusMd};font-family:${options.fontStack};">${rows}</section>`;
    }
    case "list":
      return listToHtml(block, options, 0, indexMap, imageMap);
    case "table":
      return tableToHtml(block, options, indexMap);
    default:
      return "";
  }
};

const renderReferencesSection = (
  items: ReferenceItem[],
  options: RenderOptions,
  indexMap: Map<string, number>
): string => {
  if (items.length === 0) return "";
  const headingHtml = blockToHtml(
    { type: "heading", level: 3, children: [{ type: "text", content: "参考资料" }] },
    options,
    indexMap
  );
  const itemHtml = items
    .map((item, idx) => {
      const host = hostnameOf(item.href);
      const label = item.text.trim() || host;
      const hostSuffix =
        label === host ? "" : ` <span style="opacity:0.5;">（${escapeHtml(host)}）</span>`;
      return `<p style="font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};margin:6px 0;color:${options.colors.text};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><span style="opacity:0.6;">[${idx + 1}]</span> <a href="${escapeHtml(
        item.href
      )}" style="color:${options.colors.link};text-decoration:none;border-bottom:1px solid ${options.colors.divider};">${escapeHtml(label)}</a>${hostSuffix}</p>`;
    })
    .join("");
  return `${headingHtml}${itemHtml}`;
};

// 基于 Doc.title 的标题区（强调色短条 + 大标题 + 细分割线）。
// 仅当 StyleTokens.showTitleHeader 开启且存在标题时输出；若首个块已是同文本的一级标题则去重避免双标题。
const renderTitleBlock = (doc: Doc, options: RenderOptions): string => {
  if (!options.style.showTitleHeader) return "";
  const title = doc.title?.trim();
  if (!title) return "";
  const first = doc.blocks[0];
  if (first && first.type === "heading" && first.level === 1) {
    const firstText = first.children.map((child) => child.content).join("").trim();
    if (firstText === title) return "";
  }
  const baseSize = Number.parseFloat(options.typography.bodySize) || 16;
  const bar = `<p style="margin:0 0 12px;"><span style="display:inline-block;width:36px;height:3px;background:${options.colors.link};"></span></p>`;
  const heading = `<h1 style="font-family:${options.fontStack};font-size:${Math.round(
    baseSize * 1.9
  )}px;font-weight:800;line-height:1.3;margin:0 0 ${Math.round(baseSize * 1.2)}px;color:${options.colors.text};">${escapeHtml(
    title
  )}</h1>`;
  const divider = `<hr style="border:none;border-top:1px solid ${options.colors.divider};margin:0 0 ${Math.round(
    baseSize * 1.6
  )}px;" />`;
  return `<section style="margin:0 0 ${Math.round(baseSize * 0.4)}px;">${bar}${heading}${divider}</section>`;
};

export const renderDocToHtml = (
  doc: Doc,
  overrides?: Partial<RenderOptions>,
  imageMap?: ImageMap
): string => {
  const options = mergeRenderOptions(overrides);
  const { items, indexMap } = collectReferences(doc);
  const titleHtml = renderTitleBlock(doc, options);
  const bodyHtml = doc.blocks.map((block) => blockToHtml(block, options, indexMap, imageMap)).join("");
  const referencesHtml = renderReferencesSection(items, options, indexMap);
  return `${titleHtml}${bodyHtml}${referencesHtml}`;
};

const inlineToText = (inline: Inline, indexMap: Map<string, number>): string => {
  if (inline.type === "link") {
    const href = normalizeHref(inline.href);
    const index = indexMap.get(href);
    return index ? `${inline.content}[${index}]` : inline.content;
  }
  return inline.content;
};

const inlinesToText = (inlines: Inline[], indexMap: Map<string, number>): string =>
  inlines.map((inline) => inlineToText(inline, indexMap)).join("");

const listToText = (list: ListBlock, indexMap: Map<string, number>, depth = 0): string => {
  const prefix = list.ordered ? (index: number) => `${index + 1}. ` : () => "- ";
  return list.items
    .map((item, idx) => {
      const itemText = inlinesToText(item.children, indexMap);
      const nestedText = item.nested
        ? "\n" + item.nested.map((nested) => listToText(nested, indexMap, depth + 1)).join("\n")
        : "";
      const indent = "  ".repeat(depth);
      return `${indent}${prefix(idx)}${itemText}${nestedText}`;
    })
    .join("\n");
};

const escapeMarkdownText = (text: string): string =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const inlineToMarkdown = (inline: Inline): string => {
  switch (inline.type) {
    case "text":
      return escapeMarkdownText(inline.content);
    case "bold":
      return `**${escapeMarkdownText(inline.content)}**`;
    case "italic":
      return `*${escapeMarkdownText(inline.content)}*`;
    case "strikethrough":
      return `~~${escapeMarkdownText(inline.content)}~~`;
    case "underline":
      return `<u>${escapeMarkdownText(inline.content)}</u>`;
    case "highlight":
      return `<mark>${escapeMarkdownText(inline.content)}</mark>`;
    case "code":
      return `\`${inline.content.replace(/`/g, "\\`")}\``;
    case "link":
      return `[${escapeMarkdownText(inline.content)}](${normalizeHref(inline.href)})`;
    default:
      return "";
  }
};

const inlinesToMarkdown = (inlines: Inline[]): string => inlines.map((inline) => inlineToMarkdown(inline)).join("");

const listToMarkdown = (list: ListBlock, depth = 0): string => {
  const indent = "  ".repeat(depth);
  return list.items
    .map((item, idx) => {
      const prefix = list.ordered ? `${idx + 1}. ` : "- ";
      const itemText = inlinesToMarkdown(item.children).trim();
      const line = `${indent}${prefix}${itemText}`.trimEnd();
      const nested = item.nested?.map((nestedList) => listToMarkdown(nestedList, depth + 1)).join("\n") ?? "";
      return nested ? `${line}\n${nested}` : line;
    })
    .join("\n");
};

const tableToMarkdown = (table: TableBlock): string => {
  if (table.rows.length === 0) return "";
  const columnCount = table.rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
  if (columnCount === 0) return "";

  const normalizeRow = (cells: TableBlock["rows"][number]["cells"]): string[] =>
    Array.from({ length: columnCount }, (_, idx) =>
      inlinesToMarkdown(cells[idx]?.children ?? []).replace(/\n/g, " ")
    );

  const headerRowIndex = table.rows.findIndex((row) => row.isHeader === true);
  const divider = Array.from({ length: columnCount }, () => "---");

  if (headerRowIndex >= 0) {
    const header = normalizeRow(table.rows[headerRowIndex].cells);
    const body = table.rows
      .filter((_, idx) => idx !== headerRowIndex)
      .map((row) => normalizeRow(row.cells));
    const rows = [header, divider, ...body];
    return rows.map((cols) => `| ${cols.join(" | ")} |`).join("\n");
  }

  const header = normalizeRow(table.rows[0].cells);
  const body = table.rows.slice(1).map((row) => normalizeRow(row.cells));
  const rows = [header, divider, ...body];
  return rows.map((cols) => `| ${cols.join(" | ")} |`).join("\n");
};

export const renderDocToText = (doc: Doc): string => {
  const { items, indexMap } = collectReferences(doc);
  const bodyText = doc.blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
        case "paragraph":
        case "quote":
        case "emphasis":
          return inlinesToText(block.children, indexMap);
        case "callout": {
          const icon = block.icon?.trim() || "💡";
          const content = inlinesToText(block.children, indexMap);
          return `${icon} ${content}`.trim();
        }
        case "steps":
          return block.items
            .map(
              (item, idx) =>
                `${block.ordered ? `${idx + 1}. ` : "- "}${inlinesToText(item.children, indexMap)}`
            )
            .join("\n");
        case "divider":
          return "---";
        case "image":
          return block.alt ? `[Image: ${block.alt}]` : "[Image]";
        case "code":
          return block.code;
        case "list":
          return listToText(block, indexMap);
        case "table":
          return block.rows
            .map((row) =>
              row.cells.map((cell) => inlinesToText(cell.children, indexMap)).join(" | ")
            )
            .join("\n");
        default:
          return "";
      }
    })
    .join("\n\n");

  if (items.length === 0) return bodyText;
  const referencesText = items.map((item, idx) => `[${idx + 1}] ${item.href}`).join("\n");
  return `${bodyText}\n\n参考资料\n${referencesText}`;
};

export const renderDocToMarkdown = (doc: Doc): string => {
  const body = doc.blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `${"#".repeat(block.level)} ${inlinesToMarkdown(block.children).trim()}`.trim();
        case "paragraph":
          return inlinesToMarkdown(block.children).trim();
        case "quote": {
          const quote = inlinesToMarkdown(block.children).trim();
          return quote
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
        }
        case "callout": {
          const icon = block.icon?.trim() || "💡";
          const content = inlinesToMarkdown(block.children).trim();
          return `> ${icon} ${content}`.trim();
        }
        case "emphasis":
          return `> **${inlinesToMarkdown(block.children).trim()}**`;
        case "steps":
          return block.items
            .map(
              (item, idx) =>
                `${block.ordered ? `${idx + 1}.` : "-"} ${inlinesToMarkdown(item.children).trim()}`
            )
            .join("\n");
        case "divider":
          return "---";
        case "image":
          return `![${escapeMarkdownText(block.alt ?? "image")}](${block.src})`;
        case "code": {
          const fence = block.code.includes("```") ? "````" : "```";
          const lang = block.language ?? "";
          return `${fence}${lang}\n${block.code}\n${fence}`;
        }
        case "list":
          return listToMarkdown(block);
        case "table":
          return tableToMarkdown(block);
        default:
          return "";
      }
    })
    .filter((section) => section.length > 0)
    .join("\n\n");

  return body.trim();
};
