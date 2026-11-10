import { mergeRenderOptions } from "./theme";
import type { RenderOptions } from "./theme";
import type { Block, Doc, Inline, ListBlock, ListItem, TableBlock } from "./types";
import type { ImageMap } from "./image-loader";
import {
  buildBodyParagraphStyle,
  escapeHtml,
  inlinesToHtml,
  inlinesToLeafHtml,
  normalizeHref,
  wrapLeaf
} from "./render-helpers";
import { renderSkinBlock, renderSkinTitle } from "./renderer-skin";

type ReferenceItem = {
  href: string;
  text: string;
};

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

// 标题层级自适应：不同作者写文档时起点不一致（有的从 H1 开始，有的习惯从 H2/H3 开始），
// 视觉样式跟随本篇实际用到的层级；有文章标题区时为它保留第一档。
// 此映射只影响 HTML 展示，Markdown 保持原始标题语义。
type HeadingLevel = 1 | 2 | 3;

const buildHeadingLevelMap = (doc: Doc, firstLevel: HeadingLevel = 1): Map<HeadingLevel, HeadingLevel> => {
  const levels = Array.from(
    new Set(
      doc.blocks
        .filter((block): block is Extract<Block, { type: "heading" }> => block.type === "heading")
        .map((block) => block.level)
    )
  ).sort((a, b) => a - b);
  const map = new Map<HeadingLevel, HeadingLevel>();
  levels.forEach((level, index) => map.set(level, Math.min(index + firstLevel, 3) as HeadingLevel));
  return map;
};

const effectiveHeadingLevel = (level: HeadingLevel, map: Map<HeadingLevel, HeadingLevel>): HeadingLevel =>
  map.get(level) ?? level;

// 章节自动序号（01 / 02 …）：仅当章节标题 ≥2 个且作者没有自带编号时启用，避免出现"01 一、标题"
const AUTHOR_NUMBERED = /^\s*(?:第[一二三四五六七八九十百\d]+[章节部分篇讲]|(?:\d{1,2}|[一二三四五六七八九十]+)[.、．:：)）\s]|part\s*\d|step\s*\d)/i;

export const buildChapterNumbers = (
  doc: Doc,
  headingLevelMap: Map<HeadingLevel, HeadingLevel>
): Map<Block, number> => {
  const chapters = doc.blocks.filter(
    (block): block is Extract<Block, { type: "heading" }> =>
      block.type === "heading" && effectiveHeadingLevel(block.level, headingLevelMap) === 2
  );
  if (chapters.length < 2) return new Map();
  const numbered = chapters.some((block) =>
    AUTHOR_NUMBERED.test(block.children.map((child) => child.content).join(""))
  );
  if (numbered) return new Map();
  return new Map(chapters.map((block, index) => [block as Block, index + 1]));
};

// 由 StyleTokens.headings 驱动的标题渲染，覆盖 default / red / blue / black / sspai。
// notion/matcha/academia/bento 的标题在 blockToHtml 内有各自分支，不经此函数。
const headingToHtml = (
  block: Extract<Block, { type: "heading" }>,
  options: RenderOptions,
  indexMap?: Map<string, number>,
  levelOverride?: HeadingLevel
): string => {
  const level = levelOverride ?? block.level;
  const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  const baseSize = Number.parseFloat(options.typography.bodySize) || 16;
  const hs =
    level === 1
      ? options.style.headings.h1
      : level === 2
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
    `color:${color}`,
    "letter-spacing:0",
    `overflow-wrap:${hs.fitContent ? "anywhere" : "break-word"}`,
    `text-align:${center ? "center" : "left"}`
  ];
  // fit-content 使用内容的最小宽度；长标识符也须能换行，装饰宽度不能撑破窄屏正文。
  if (hs.fitContent) parts.push("width:fit-content", "max-width:100%", "box-sizing:border-box");
  if (center && !hs.fitContent) parts.push("text-align:center");
  if (hs.decoration === "underline") parts.push(`border-bottom:2px solid ${accent}`, "padding-bottom:6px");
  else if (hs.decoration === "sidebar") parts.push(`border-left:3px solid ${accent}`, "padding-left:10px");
  return `<${tag} style="${parts.join(";")};">${inlinesToLeafHtml(block.children, options, indexMap)}</${tag}>`;
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
  return `<section style="margin:24px 0;padding:22px 20px;background:${bg};border-radius:${options.style.radiusMd};text-align:left;font-family:${options.fontStack};"><p style="overflow-wrap:break-word;font-size:${Math.round(
    baseSize * 2.4
  )}px;line-height:1.2;color:${options.colors.link};margin:0 0 6px;"><span leaf="">&ldquo;</span></p><p style="overflow-wrap:break-word;margin:0;font-size:${Math.round(
    baseSize * 1.1
  )}px;line-height:1.7;font-weight:600;color:${options.colors.text};">${wrapLeaf(inner)}</p></section>`;
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
  const paragraphStyle = buildBodyParagraphStyle(options, textColor) + "margin:0 0 8px;";
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
  const extraStyle = options.style.skin
    ? `margin:16px 0;padding-left:1.5em;${options.style.skin.listAccent ? `color:${options.colors.link};` : ""}`
    : options.themeId === "bento"
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
          return `<${cellTag} style="overflow-wrap:anywhere;font-family:${options.fontStack};font-size:${options.typography.bodySize};vertical-align:top;width:${widthPercent}%;border:1px solid ${borderColor};padding:${cellPadding};${headerBg}${headerWeight}${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}">${inlinesToLeafHtml(
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
  imageMap?: ImageMap,
  headingLevelMap?: Map<HeadingLevel, HeadingLevel>,
  chapterNumbers?: Map<Block, number>
): string => {
  const skin = options.style.skin;
  if (skin) {
    const headingLevel =
      block.type === "heading" && headingLevelMap ? effectiveHeadingLevel(block.level, headingLevelMap) : undefined;
    const skinned = renderSkinBlock(block, options, skin, {
      indexMap,
      imageMap,
      headingLevel,
      chapterNumber: chapterNumbers?.get(block)
    });
    if (skinned !== null) return skinned;
  }
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
      // 按实际标题层级适配字阶；存在文章标题区时，正文从章节字阶开始。
      const level = headingLevelMap ? effectiveHeadingLevel(block.level, headingLevelMap) : block.level;
      const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      if (isNotion) {
        const fontSize =
          level === 1 ? `${h1Size}px` : level === 2 ? `${h2Size}px` : `${h3Size}px`;
        const margin =
          level === 1
            ? `0 0 ${Math.round(baseSize * 1.8)}px`
            : `${Math.round(baseSize * 1.7)}px 0 ${Math.round(baseSize * 0.7)}px`;
        return `<${tag} style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${fontSize};font-weight:700;margin:${margin};line-height:1.5;color:${options.colors.text};letter-spacing:0;">${inlinesToLeafHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      if (isMatcha) {
        if (level === 1) {
          return `<${tag} style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${h1Size}px;font-weight:700;line-height:1.5;margin:0 0 ${Math.round(baseSize * 2)}px;color:${options.colors.text};padding:0 0 10px;border-bottom:2px solid ${options.colors.border};">${inlinesToLeafHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        if (level === 2) {
          return `<${tag} style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${h2Size}px;font-weight:700;line-height:1.5;margin:${Math.round(baseSize * 2.2)}px 0 ${Math.round(baseSize * 1)}px;color:${options.colors.text};padding:2px 0 2px 12px;border-left:4px solid ${options.colors.link};background:#f7fbf4;">${inlinesToLeafHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        return `<${tag} style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${h3Size}px;font-weight:700;line-height:1.5;margin:${Math.round(baseSize * 1.8)}px 0 ${Math.round(baseSize * 0.8)}px;color:${options.colors.link};">${inlinesToLeafHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      if (isAcademia) {
        if (level === 1) {
          return `<${tag} style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${h1Size}px;font-weight:700;line-height:1.5;margin:0 0 ${Math.round(baseSize * 2.1)}px;color:${options.colors.text};padding:0 0 12px;border-bottom:1px solid ${options.colors.border};">${inlinesToLeafHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        if (level === 2) {
          return `<${tag} style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${h2Size}px;font-weight:700;line-height:1.5;margin:${Math.round(baseSize * 2.4)}px 0 ${Math.round(baseSize)}px;color:${options.colors.link};">${inlinesToLeafHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        return `<${tag} style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${h3Size}px;font-weight:700;line-height:1.5;margin:${Math.round(baseSize * 1.8)}px 0 ${Math.round(baseSize * 0.8)}px;color:${options.colors.text};padding-left:10px;border-left:3px solid ${options.colors.border};">${inlinesToLeafHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      if (isBento) {
        if (level === 1) {
          return `<${tag} style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${h1Size}px;font-weight:800;line-height:1.5;margin:0 0 ${Math.round(baseSize * 2)}px;color:${options.colors.text};padding:0 0 12px;border-bottom:1px solid ${options.colors.divider};">${inlinesToLeafHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        if (level === 2) {
          return `<${tag} style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${h2Size}px;font-weight:800;line-height:1.5;margin:${Math.round(baseSize * 2)}px 0 ${Math.round(baseSize)}px;color:${options.colors.text};padding:8px 12px;background:#f8fafc;border:1px solid ${options.colors.divider};border-left:4px solid ${options.colors.link};border-radius:8px;">${inlinesToLeafHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        return `<${tag} style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${h3Size}px;font-weight:700;line-height:1.5;margin:${Math.round(baseSize * 1.6)}px 0 ${Math.round(baseSize * 0.7)}px;color:${options.colors.link};">${inlinesToLeafHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      return headingToHtml(block, options, indexMap, level);
    }
    case "paragraph":
      return `<p style="${buildBodyParagraphStyle(options)}">${inlinesToLeafHtml(
        block.children,
        options,
        indexMap
      )}</p>`;
    case "quote":
      if (block.variant === "card" || options.style.quoteVariant === "card")
        return quoteCardHtml(block, options, indexMap);
      if (isNotion) {
        return `<blockquote style="overflow-wrap:break-word;font-family:${options.fontStack};border-left:3px solid ${options.colors.border};padding:2px 0 2px 14px;margin:18px 0;color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};">${inlinesToLeafHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      if (isMatcha) {
        return `<blockquote style="overflow-wrap:break-word;font-family:${options.fontStack};border-left:4px solid ${options.colors.link};padding:12px 14px;margin:20px 0;background:#f5faf2;color:${options.colors.text};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};">${inlinesToLeafHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      if (isAcademia) {
        return `<blockquote style="overflow-wrap:break-word;font-family:${options.fontStack};border-top:1px solid ${options.colors.border};border-bottom:1px solid ${options.colors.border};padding:14px 8px;margin:22px 0;background:#fffaf1;color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};font-style:italic;">${inlinesToLeafHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      if (isBento) {
        return `<blockquote style="overflow-wrap:break-word;font-family:${options.fontStack};border:1px solid ${options.colors.divider};border-left:4px solid ${options.colors.link};border-radius:8px;padding:12px 14px;margin:20px 0;background:#f8fafc;color:${options.colors.text};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};">${inlinesToLeafHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      if (isBlack) {
        return `<blockquote style="overflow-wrap:break-word;font-family:${options.fontStack};border-left:8px solid ${options.colors.border};padding:10px;margin:20px 0;background-color:#f5f5f5;color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};">${inlinesToLeafHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      if (isSspai) {
        return `<blockquote style="overflow-wrap:break-word;font-family:${options.fontStack};border-left:2px solid ${options.colors.link};padding:24px 16px 12px;margin:24px 0 36px;background:url('https://new-notion-1315843248.cos.ap-guangzhou.myqcloud.com/theme/pie/pie_blockquote.svg') 12px 0 / 12px no-repeat;color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};">${inlinesToLeafHtml(
          block.children,
          options,
          indexMap
        )}</blockquote>`;
      }
      return `<blockquote style="overflow-wrap:break-word;font-family:${options.fontStack};border-left:${isAccentTheme ? "3px" : "4px"} solid ${options.colors.border};padding:${isAccentTheme ? "1px 10px 1px 20px" : "0 0 0 12px"};margin:${isAccentTheme ? "20px 0" : "16px 0"};color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};">${inlinesToLeafHtml(
        block.children,
        options,
        indexMap
      )}</blockquote>`;
    case "callout": {
      const icon = escapeHtml((block.icon || "💡").trim() || "💡");
      const inner = inlinesToHtml(block.children, options, indexMap) || "<br/>";
      if (isNotion) {
        return `<section style="margin:16px 0;padding:12px 14px;background:${options.style.calloutBg ?? options.colors.codeBg};border-radius:6px;color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="overflow-wrap:break-word;margin:0;"><span leaf=""><strong style="margin-right:8px;">${icon}</strong>${inner}</span></p></section>`;
      }
      if (isMatcha) {
        return `<section style="margin:16px 0;padding:12px 14px;background:#f2f8ef;border:1px solid ${options.colors.border};border-left:4px solid ${options.colors.link};border-radius:6px;color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="overflow-wrap:break-word;margin:0;"><span leaf=""><strong style="margin-right:8px;color:${options.colors.link};">${icon}</strong>${inner}</span></p></section>`;
      }
      if (isAcademia) {
        return `<section style="margin:18px 0;padding:12px 14px;background:#fbf4e8;border:1px solid ${options.colors.divider};border-top:3px solid ${options.colors.border};color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="overflow-wrap:break-word;margin:0;"><span leaf=""><strong style="margin-right:8px;color:${options.colors.link};">${icon}</strong>${inner}</span></p></section>`;
      }
      if (isBento) {
        return `<section style="margin:16px 0;padding:14px;background:#f8fafc;border:1px solid ${options.colors.divider};border-radius:8px;box-shadow:0 1px 0 rgba(15,23,42,0.04);color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="overflow-wrap:break-word;margin:0;"><span leaf=""><strong style="margin-right:8px;color:${options.colors.link};">${icon}</strong>${inner}</span></p></section>`;
      }
      if (isBlack) {
        return `<section style="margin:16px 0;padding:10px 12px;background:#f5f5f5;border-left:8px solid ${options.colors.border};color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="overflow-wrap:break-word;margin:0;"><span leaf=""><strong style="margin-right:6px;">${icon}</strong>${inner}</span></p></section>`;
      }
      if (isSspai) {
        return `<section style="margin:16px 0;padding:10px 12px;background:#fff7f7;border-left:2px solid ${options.colors.link};color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="overflow-wrap:break-word;margin:0;"><span leaf=""><strong style="margin-right:6px;color:${options.colors.link};">${icon}</strong>${inner}</span></p></section>`;
      }
      return `<section style="margin:16px 0;padding:10px 12px;background:${options.style.calloutBg ?? options.colors.codeBg};border-left:3px solid ${options.colors.border};border-radius:4px;color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="overflow-wrap:break-word;margin:0;"><span leaf=""><strong style="margin-right:6px;color:${isAccentTheme ? options.colors.link : options.colors.text};">${icon}</strong>${inner}</span></p></section>`;
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
      return `<p style="overflow-wrap:break-word;text-align:center;margin:${imageMargin};"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(block.alt ?? "")}" style="max-width:100%;border-radius:${imageRadius};${imageBorder}" /></p>`;
    }
    case "code": {
      const langLabel = block.language ?? "";
      const codeSize = Math.max(13, Math.round(baseSize * 0.9));
      const macDots = `<span style="display:flex;padding:10px 14px 0px;"><svg xmlns="http://www.w3.org/2000/svg" version="1.1" x="0px" y="0px" width="45px" height="13px" viewBox="0 0 450 130" role="img" aria-label="code-window"><ellipse cx="50" cy="65" rx="50" ry="52" stroke="rgb(220,60,54)" stroke-width="2" fill="rgb(237,108,96)"></ellipse><ellipse cx="225" cy="65" rx="50" ry="52" stroke="rgb(218,151,33)" stroke-width="2" fill="rgb(247,193,81)"></ellipse><ellipse cx="400" cy="65" rx="50" ry="52" stroke="rgb(27,161,37)" stroke-width="2" fill="rgb(100,200,86)"></ellipse></svg></span>`;
      const langAttr = langLabel ? ` data-language-pending="${escapeHtml(langLabel)}"` : "";
      const codeTextColor = isPineapple
        ? "#333"
        : isNotion || isMatcha || isBento
          ? "#24292f"
          : isAcademia
            ? "#4f3f30"
            : "rgb(201,209,217)";
      const codeBackground = isPineapple
        ? "#fafafa"
        : isNotion || isMatcha || isAcademia || isBento
          ? options.colors.codeBg
          : "rgb(13,17,23)";
      const codeBorder =
        isPineapple || isNotion || isMatcha || isAcademia || isBento
          ? `border:1px solid ${isPineapple ? "#f0f0f0" : options.colors.divider};`
          : "";
      const codeShadow = isPineapple ? "box-shadow:0 2px 10px rgba(0,0,0,0.3);" : "";
      const codeText = wrapLeaf(escapeHtml(block.code));

      // 公众号会把语法高亮产生的多个 span 误识别为多行文本。代码块复制时采用
      // 单一文字叶子节点，并用 pre-wrap 保留缩进与换行，兼顾移动端窄屏阅读。
      return `<section style="color:${codeTextColor};background:${codeBackground};font-size:${codeSize}px;border-radius:${isAcademia ? "0" : "8px"};line-height:1.65;margin:${options.style.codeMargin};padding:0;${codeBorder}${codeShadow}">${macDots}<code${langAttr} style="font-size:inherit;line-height:inherit;border-radius:4px;display:block;padding:0.5em 1em 1em;overflow-wrap:anywhere;word-break:break-word;text-indent:0;color:inherit;background:none;white-space:pre-wrap;margin:0;font-family:Menlo, Monaco, Consolas, monospace;">${codeText}</code></section>`;
    }
    case "emphasis": {
      const inner = inlinesToHtml(block.children, options, indexMap) || "<br/>";
      const accent = options.colors.link;
      const bg = options.style.calloutBg ?? options.colors.codeBg;
      const ls = options.typography.letterSpacing
        ? `letter-spacing:${options.typography.letterSpacing};`
        : "";
      if (isMatcha) {
        return `<section style="margin:18px 0;padding:14px 16px;background:#eef7ec;border:1px solid ${options.colors.border};border-left:4px solid ${accent};border-radius:6px;font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};color:${options.colors.text};${ls}"><p style="overflow-wrap:break-word;margin:0;font-weight:600;">${wrapLeaf(inner)}</p></section>`;
      }
      return `<section style="margin:18px 0;padding:14px 16px;background:${bg};border-left:4px solid ${accent};border-radius:${options.style.radiusMd};font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};color:${options.colors.text};${ls}"><p style="overflow-wrap:break-word;margin:0;font-weight:600;">${wrapLeaf(inner)}</p></section>`;
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
          return `<section style="display:flex;align-items:flex-start;margin:0 0 12px;">${badge}<p style="overflow-wrap:break-word;margin:0;flex:1;min-width:0;font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};color:${options.colors.text};">${wrapLeaf(inner)}</p></section>`;
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
      return `<p style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};margin:6px 0;color:${options.colors.text};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}">${wrapLeaf(`<span style="opacity:0.6;">[${idx + 1}]</span> <a href="${escapeHtml(
        item.href
      )}" style="overflow-wrap:anywhere;color:${options.colors.link};text-decoration:none;border-bottom:1px solid ${options.colors.divider};">${escapeHtml(label)}</a>${hostSuffix}`)}</p>`;
    })
    .join("");
  return `${headingHtml}${itemHtml}`;
};

// 基于 Doc.title 的标题区（强调色短条 + 大标题 + 细分割线）。
// 仅当 StyleTokens.showTitleHeader 开启且存在标题时输出；首个同名标题移入标题区，保留富文本。
const getExistingTitleBlock = (doc: Doc): Extract<Block, { type: "heading" }> | undefined => {
  const first = doc.blocks[0];
  return first?.type === "heading" &&
    first.children.map((child) => child.content).join("").trim() === doc.title?.trim()
    ? first
    : undefined;
};

const renderTitleBlock = (
  doc: Doc,
  options: RenderOptions,
  indexMap: Map<string, number>
): string => {
  if (!options.style.showTitleHeader) return "";
  const title = doc.title?.trim();
  if (!title) return "";
  const titleBlock = getExistingTitleBlock(doc) ??
    { type: "heading" as const, level: 1 as const, children: [{ type: "text" as const, content: title }] };
  const baseSize = Number.parseFloat(options.typography.bodySize) || 16;
  if (options.style.skin) return renderSkinTitle(titleBlock, options, options.style.skin, indexMap);
  const bar = `<p style="overflow-wrap:break-word;margin:0 0 12px;"><span style="display:inline-block;width:36px;height:3px;background:${options.colors.link};"></span></p>`;
  const heading = `<h1 style="overflow-wrap:break-word;font-family:${options.fontStack};font-size:${Math.round(
    baseSize * 1.9
  )}px;font-weight:800;line-height:1.5;margin:0 0 ${Math.round(baseSize * 1.2)}px;color:${options.colors.text};">${inlinesToLeafHtml(titleBlock.children, options, indexMap)}</h1>`;
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
  const titleHtml = renderTitleBlock(doc, options, indexMap);
  const bodyDoc = titleHtml && getExistingTitleBlock(doc) ? { ...doc, blocks: doc.blocks.slice(1) } : doc;
  // Notion exports may contain only body H2/H3 blocks (the page title is separate).
  // Keep those at chapter size instead of treating every chapter as an article title.
  const hasExplicitH1 = bodyDoc.blocks.some((block) => block.type === "heading" && block.level === 1);
  const chapterSized = Boolean(titleHtml) || (Boolean(options.style.skin) && !hasExplicitH1);
  const headingLevelMap = buildHeadingLevelMap(bodyDoc, chapterSized ? 2 : 1);
  const chapterNumbers = options.style.skin ? buildChapterNumbers(bodyDoc, headingLevelMap) : undefined;
  const bodyHtml = bodyDoc.blocks
    .map((block) => blockToHtml(block, options, indexMap, imageMap, headingLevelMap, chapterNumbers))
    .join("");
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
