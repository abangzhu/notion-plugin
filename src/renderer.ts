import { mergeRenderOptions } from "./theme";
import type { RenderOptions } from "./theme";
import type { Block, Doc, Inline, ListBlock, ListItem, TableBlock } from "./types";

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

const normalizeHref = (href: string): string => href.trim();

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
        collectReferencesFromInlines(block.children, items, indexMap);
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
  const isAccentTheme =
    options.themeId === "red" || options.themeId === "blue" || options.themeId === "sspai";
  const inlineAccent = "color" in inline && inline.color === "accent";

  switch (inline.type) {
    case "text":
      return inlineAccent
        ? `<span style="color:${options.colors.link};">${escapeHtml(inline.content)}</span>`
        : escapeHtml(inline.content);
    case "bold":
      return `<strong style="font-weight:600;${inlineAccent ? `color:${options.colors.link};` : ""}">${escapeHtml(
        inline.content
      )}</strong>`;
    case "italic":
      return `<em style="font-style:italic;${inlineAccent ? `color:${options.colors.link};` : ""}">${escapeHtml(
        inline.content
      )}</em>`;
    case "code":
      return `<code style="font-family:Menlo, Monaco, Consolas, monospace;background:${options.colors.inlineCodeBg};padding:2px 4px;border-radius:4px;font-size:0.95em;">${escapeHtml(inline.content)}</code>`;
    case "link": {
      const href = normalizeHref(inline.href);
      const index = indexMap?.get(href);
      const sup = index ? `<sup style="font-size:0.8em;">[${index}]</sup>` : "";
      return `<a href="${escapeHtml(href)}" style="color:${options.colors.link};${isAccentTheme ? `text-decoration:none;border-bottom:1px solid ${options.colors.link};` : "text-decoration:underline;"}">${escapeHtml(
        inline.content
      )}${sup}</a>`;
    }
    default:
      return "";
  }
};

const inlinesToHtml = (
  inlines: Inline[],
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => inlines.map((inline) => inlineToHtml(inline, options, indexMap)).join("");

const paragraphStyle = (
  options: RenderOptions,
  textColor?: string,
  extra = ""
): string =>
  [
    `font-family:${options.fontStack}`,
    `font-size:${options.typography.bodySize}`,
    `line-height:${options.typography.bodyLineHeight}`,
    `font-weight:${options.typography.bodyWeight}`,
    `color:${textColor ?? options.colors.text}`,
    options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing}` : "",
    "text-align:left",
    "white-space:pre-wrap",
    "word-break:break-word",
    extra
  ]
    .filter(Boolean)
    .join(";");

const wrapSection = (innerHtml: string, margin = "10px 0"): string =>
  `<section style="margin:${margin};">${innerHtml}</section>`;

const paragraphToHtml = (
  inlines: Inline[],
  options: RenderOptions,
  indexMap?: Map<string, number>,
  textColor?: string
): string => {
  const content = inlinesToHtml(inlines, options, indexMap) || "<br/>";
  return wrapSection(`<p style="${paragraphStyle(options, textColor)}">${content}</p>`);
};

const listItemToHtml = (
  item: ListItem,
  options: RenderOptions,
  depth: number,
  indexMap?: Map<string, number>,
  textColor?: string
): string => {
  const itemText = inlinesToHtml(item.children, options, indexMap) || "<br/>";
  const nestedHtml =
    item.nested?.map((nested) => listToHtml(nested, options, depth + 1, indexMap)).join("") ?? "";
  return `<li style="margin:6px 0;${textColor ? `color:${textColor};` : ""}"><p style="${paragraphStyle(options, textColor, "margin:0")}">${itemText}</p>${nestedHtml}</li>`;
};

const listToHtml = (
  list: ListBlock,
  options: RenderOptions,
  depth = 0,
  indexMap?: Map<string, number>
): string => {
  const tag = list.ordered ? "ol" : "ul";
  const listStyleType = list.ordered
    ? depth === 0
      ? "decimal"
      : depth === 1
        ? "lower-alpha"
        : "lower-roman"
    : depth === 0
      ? "disc"
      : depth === 1
        ? "circle"
        : "square";
  const isAccentTheme =
    options.themeId === "red" || options.themeId === "blue" || options.themeId === "sspai";
  const listColor = !list.ordered && isAccentTheme ? options.colors.link : options.colors.text;
  const itemTextColor = !list.ordered && isAccentTheme ? options.colors.text : undefined;
  const listItems = list.items
    .map((item) => listItemToHtml(item, options, depth, indexMap, itemTextColor))
    .join("");
  const listHtml = `<${tag} style="font-family:${options.fontStack};font-size:${options.typography.bodySize};padding-left:1.5em;margin:0;color:${listColor};line-height:${options.typography.bodyLineHeight};list-style-type:${listStyleType};list-style-position:outside;${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}">${listItems}</${tag}>`;
  return wrapSection(listHtml, depth === 0 ? "10px 0" : "6px 0 0 0");
};

const tableToHtml = (
  table: TableBlock,
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  const rows = table.rows;
  const columnCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0) || 1;
  const widthPercent = Math.floor(100 / columnCount);
  const tbody = rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          return `<td style="word-break:break-all;font-family:${options.fontStack};font-size:${options.typography.bodySize};vertical-align:top;width:${widthPercent}%;border:1px solid ${options.colors.divider};padding:6px 8px;${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}">${inlinesToHtml(
            cell.children,
            options,
            indexMap
          )}</td>`;
        })
        .join("");
      return `<tr style="font-size:${options.typography.bodySize};">${cells}</tr>`;
    })
    .join("");

  const tableHtml = `<table style="font-size:${options.typography.bodySize};margin:0;line-height:${options.typography.bodyLineHeight};border-collapse:collapse;width:100%;border:1px solid ${options.colors.divider};">${tbody}</table>`;
  return wrapSection(tableHtml, "10px 0");
};

const headingToHtml = (
  level: 1 | 2 | 3,
  inlines: Inline[],
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  const baseSize = Number.parseFloat(options.typography.bodySize) || 16;
  const fontSize = level === 1 ? Math.round(baseSize * 1.55) : level === 2 ? Math.round(baseSize * 1.3) : Math.round(baseSize * 1.15);
  const marginTop = level === 1 ? Math.round(baseSize * 1.9) : Math.round(baseSize * 1.4);
  const marginBottom = level === 1 ? Math.round(baseSize * 1.0) : Math.round(baseSize * 0.75);
  const content = inlinesToHtml(inlines, options, indexMap) || "<br/>";
  return wrapSection(
    `<p style="font-family:${options.fontStack};font-size:${fontSize}px;line-height:1.5;font-weight:${options.typography.headingWeight};margin:0;color:${options.colors.text};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><strong>${content}</strong></p>`,
    `${marginTop}px 0 ${marginBottom}px 0`
  );
};

const quoteToHtml = (
  inlines: Inline[],
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  const content = inlinesToHtml(inlines, options, indexMap) || "<br/>";
  return wrapSection(
    `<p style="${paragraphStyle(options, options.colors.subText, `border-left:3px solid ${options.colors.border};padding-left:12px;margin:0`)}">❝ ${content}</p>`,
    "12px 0"
  );
};

const calloutToHtml = (
  icon: string | undefined,
  inlines: Inline[],
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  const content = inlinesToHtml(inlines, options, indexMap) || "<br/>";
  const calloutIcon = escapeHtml((icon || "💡").trim() || "💡");
  return wrapSection(
    `<p style="${paragraphStyle(options, options.colors.text, `background:${options.colors.codeBg};border-radius:6px;padding:8px 12px;margin:0`)}">${calloutIcon} ${content}</p>`,
    "12px 0"
  );
};

const codeToHtml = (code: string, options: RenderOptions): string => {
  const escaped = escapeHtml(code).replace(/\n/g, "<br/>") || "<br/>";
  return wrapSection(
    `<p style="font-family:Menlo, Monaco, Consolas, monospace;font-size:13px;line-height:1.6;background:${options.colors.codeBg};padding:12px;border-radius:6px;margin:0;white-space:pre-wrap;word-break:break-word;"><code>${escaped}</code></p>`,
    "12px 0"
  );
};

const dividerToHtml = (options: RenderOptions): string =>
  wrapSection(
    `<p style="font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:1.6;margin:0;color:${options.colors.divider};text-align:center;">——</p>`,
    "14px 0"
  );

const imageToHtml = (src: string, alt: string): string =>
  wrapSection(
    `<p style="margin:0;text-align:center;"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;border-radius:6px;" /></p>`,
    "14px 0"
  );

const blockToHtml = (
  block: Block,
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  switch (block.type) {
    case "heading":
      return headingToHtml(block.level, block.children, options, indexMap);
    case "paragraph":
      return paragraphToHtml(block.children, options, indexMap);
    case "quote":
      return quoteToHtml(block.children, options, indexMap);
    case "callout":
      return calloutToHtml(block.icon, block.children, options, indexMap);
    case "divider":
      return dividerToHtml(options);
    case "image":
      return imageToHtml(block.src, block.alt ?? "");
    case "code":
      return codeToHtml(block.code, options);
    case "list":
      return listToHtml(block, options, 0, indexMap);
    case "table":
      return tableToHtml(block, options, indexMap);
    default:
      return "";
  }
};

const renderReferencesSection = (
  items: ReferenceItem[],
  options: RenderOptions
): string => {
  if (items.length === 0) return "";
  const heading = wrapSection(
    `<p style="font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};font-weight:${options.typography.headingWeight};margin:0;color:${options.colors.text};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><strong>参考资料</strong></p>`,
    "20px 0 8px 0"
  );
  const itemHtml = items
    .map((item, idx) => {
      return wrapSection(
        `<p style="${paragraphStyle(options)}margin:0;"><span style="opacity:0.6;">[${idx + 1}]</span> 链接: <em>${escapeHtml(
          item.href
        )}</em></p>`,
        "6px 0"
      );
    })
    .join("");
  return `${heading}${itemHtml}`;
};

export const renderDocToHtml = (doc: Doc, overrides?: Partial<RenderOptions>): string => {
  const options = mergeRenderOptions(overrides);
  const { items, indexMap } = collectReferences(doc);
  const bodyHtml = doc.blocks.map((block) => blockToHtml(block, options, indexMap)).join("");
  const referencesHtml = renderReferencesSection(items, options);
  return `${bodyHtml}${referencesHtml}`;
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

export const renderDocToText = (doc: Doc): string => {
  const { items, indexMap } = collectReferences(doc);
  const bodyText = doc.blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
        case "paragraph":
        case "quote":
          return inlinesToText(block.children, indexMap);
        case "callout": {
          const icon = block.icon?.trim() || "💡";
          const content = inlinesToText(block.children, indexMap);
          return `${icon} ${content}`.trim();
        }
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
            .map((row) => row.cells.map((cell) => inlinesToText(cell.children, indexMap)).join(" | "))
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
