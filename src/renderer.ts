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
  const isPineapple = options.themeId === "red";
  const isBlue = options.themeId === "blue";
  const isBlack = options.themeId === "black";
  const isSspai = options.themeId === "sspai";
  const isAccentTheme = isPineapple || isBlue || isSspai;
  const inlineAccent = "color" in inline && inline.color === "accent";
  switch (inline.type) {
    case "text":
      return inlineAccent
        ? `<span style="color:${options.colors.link};">${escapeHtml(inline.content)}</span>`
        : escapeHtml(inline.content);
    case "bold":
      return `<strong style="font-weight:600;${isAccentTheme || inlineAccent ? `word-break:break-all;color:${options.colors.link};` : ""}">${escapeHtml(
        inline.content
      )}</strong>`;
    case "italic":
      return `<em style="font-style:italic;${inlineAccent ? `color:${options.colors.link};` : ""}">${escapeHtml(
        inline.content
      )}</em>`;
    case "code":
      return `<code style="font-family:Menlo, Monaco, Consolas, monospace;background:${options.colors.inlineCodeBg};padding:2px 4px;border-radius:4px;font-size:0.95em;">${escapeHtml(inline.content)}</code>`;
    case "link":
      const href = normalizeHref(inline.href);
      const index = indexMap?.get(href);
      const sup = index ? `<sup style="font-size:0.8em;">[${index}]</sup>` : "";
      return `<a href="${escapeHtml(href)}" style="color:${options.colors.link};${isAccentTheme || isBlack ? "text-decoration:none;border-bottom:1px solid " + options.colors.link + ";" : "text-decoration:underline;"}">${escapeHtml(
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
  `font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};margin:10px 0;color:${color ?? options.colors.text};font-weight:${options.typography.bodyWeight};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}text-align:left;white-space:pre-line;min-height:20px;padding-left:0em;`;

const listItemToHtml = (
  item: ListItem,
  options: RenderOptions,
  depth: number,
  indexMap?: Map<string, number>,
  textColor?: string
): string => {
  const textHtml = inlinesToHtml(item.children, options, indexMap) || "<br/>";
  const nestedHtml =
    item.nested?.map((nested) => listToHtml(nested, options, depth + 1, indexMap)).join("") ?? "";
  const paragraphStyle = buildBodyParagraphStyle(options, textColor);
  return `<li><p style="${paragraphStyle}"><span leaf="">${textHtml}</span></p>${nestedHtml}</li>`;
};

const listToHtml = (
  list: ListBlock,
  options: RenderOptions,
  depth = 0,
  indexMap?: Map<string, number>
): string => {
  const tag = list.ordered ? "ol" : "ul";
  const orderedStyles = ["decimal", "lower-alpha", "lower-roman", "upper-alpha", "upper-roman"];
  const unorderedStyles = ["disc", "circle", "square"];
  const listStyleType = list.ordered
    ? orderedStyles[Math.min(depth, orderedStyles.length - 1)]
    : unorderedStyles[Math.min(depth, unorderedStyles.length - 1)];
  const isAccentTheme = options.themeId === "red" || options.themeId === "blue" || options.themeId === "sspai";
  const itemTextColor = !list.ordered && isAccentTheme ? options.colors.text : options.colors.text;
  const listItems = list.items
    .map((item) => listItemToHtml(item, options, depth, indexMap, itemTextColor))
    .join("");
  return `<${tag} style="list-style-type: ${listStyleType};padding-left:1.5em;list-style-position:outside;" class="list-paddingleft-1">${listItems}</${tag}>`;
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

  return `<table style="font-size:${options.typography.bodySize};margin:10px 0;line-height:${options.typography.bodyLineHeight};border-collapse:collapse;width:100%;border:1px solid ${options.colors.divider};">${tbody}</table>`;
};

const blockToHtml = (
  block: Block,
  options: RenderOptions,
  indexMap?: Map<string, number>
): string => {
  const baseSize = Number.parseFloat(options.typography.bodySize) || 16;
  const h1Size = Math.round(baseSize * 1.6);
  const h2Size = Math.round(baseSize * 1.33);
  const h3Size = Math.round(baseSize * 1.13);
  const isPineapple = options.themeId === "red";
  const isBlue = options.themeId === "blue";
  const isBlack = options.themeId === "black";
  const isSspai = options.themeId === "sspai";
  const isAccentTheme = isPineapple || isBlue;
  switch (block.type) {
    case "heading": {
      const tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
      if (isSspai) {
        if (block.level === 1) {
          return `<${tag} style="line-height:1.5;font-size:${h1Size}px;font-family:${options.fontStack};font-weight:700;margin:0 auto ${Math.round(baseSize * 2.6)}px 0;width:fit-content;border-left:6px solid ${options.colors.link};padding-left:6px;color:${options.colors.text};">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        if (block.level === 2) {
          return `<${tag} style="line-height:1.5;font-family:${options.fontStack};font-size:${h2Size}px;font-weight:700;margin:${Math.round(baseSize * 2.6)}px auto;width:fit-content;color:${options.colors.text};">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        return `<${tag} style="line-height:1.5;font-family:${options.fontStack};font-size:${h3Size}px;font-weight:700;margin:${Math.round(baseSize * 2.6)}px 0;width:fit-content;color:${options.colors.text};">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      if (isBlack) {
        if (block.level === 1) {
          return `<${tag} style="line-height:1.5;font-size:${h1Size}px;font-family:${options.fontStack};font-weight:700;margin:0 auto ${Math.round(baseSize * 2.6)}px;width:fit-content;color:${options.colors.link};text-align:center;padding:0 1em;border-bottom:8px solid ${options.colors.link};">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        if (block.level === 2) {
          return `<${tag} style="line-height:1.5;font-family:${options.fontStack};font-size:${h2Size}px;font-weight:700;margin:${Math.round(baseSize * 2.6)}px auto;width:fit-content;color:${options.colors.link};text-align:center;padding:0 0.2em;">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        return `<${tag} style="line-height:1.5;font-family:${options.fontStack};font-size:${h3Size}px;font-weight:700;margin:${Math.round(baseSize * 2.6)}px 0;width:fit-content;color:${options.colors.link};text-align:left;">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      if (isAccentTheme) {
        const accentBorder = isBlue ? "#7bb7e0" : options.colors.link;
        const headingMargin = Math.round(baseSize * 2.6);
        const h3MarginTop = isBlue ? Math.round(baseSize * 3.33) : headingMargin;
        const h3MarginBottom = isBlue ? Math.round(baseSize * 2.67) : headingMargin;
        if (block.level === 1) {
          return `<${tag} style="line-height:1.5;font-size:${h1Size}px;font-family:${options.fontStack};font-weight:700;margin:0 auto ${headingMargin}px;width:fit-content;color:${options.colors.link};text-align:center;padding:0 1em;border-bottom:2px solid ${accentBorder};">${inlinesToHtml(
            block.children,
            options,
            indexMap
          )}</${tag}>`;
        }
        if (block.level === 2) {
          const headingOptions: RenderOptions = {
            ...options,
            colors: { ...options.colors, link: "#ffffff" }
          };
          return `<${tag} style="line-height:1.5;font-family:${options.fontStack};font-size:${h2Size}px;font-weight:700;margin:${headingMargin}px auto;width:fit-content;background:${options.colors.link};color:#fff;text-align:center;padding:0 0.2em;">${inlinesToHtml(
            block.children,
            headingOptions,
            indexMap
          )}</${tag}>`;
        }
        return `<${tag} style="line-height:1.5;font-family:${options.fontStack};font-size:${h3Size}px;font-weight:700;margin:${h3MarginTop}px 0 ${h3MarginBottom}px;width:fit-content;color:#000;padding-left:8px;border-left:3px solid ${accentBorder};">${inlinesToHtml(
          block.children,
          options,
          indexMap
        )}</${tag}>`;
      }
      const fontSize =
        block.level === 1 ? `${h1Size}px` : block.level === 2 ? `${h2Size}px` : `${h3Size}px`;
      const marginTop = block.level === 1 ? `${Math.round(baseSize * 1.6)}px` : `${Math.round(baseSize * 1.4)}px`;
      const marginBottom = block.level === 1 ? `${Math.round(baseSize * 0.9)}px` : `${Math.round(baseSize * 0.8)}px`;
      return `<${tag} style="font-family:${options.fontStack};font-size:${fontSize};font-weight:${options.typography.headingWeight};margin:${marginTop} 0 ${marginBottom} 0;line-height:1.5;color:${options.colors.text};">${inlinesToHtml(
        block.children,
        options,
        indexMap
      )}</${tag}>`;
    }
    case "paragraph":
      return `<p style="${buildBodyParagraphStyle(options)}">${inlinesToHtml(
        block.children,
        options,
        indexMap
      )}</p>`;
    case "quote":
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
      if (isBlack) {
        return `<section style="margin:16px 0;padding:10px 12px;background:#f5f5f5;border-left:8px solid ${options.colors.border};color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="margin:0;"><strong style="margin-right:6px;">${icon}</strong>${inner}</p></section>`;
      }
      if (isSspai) {
        return `<section style="margin:16px 0;padding:10px 12px;background:#fff7f7;border-left:2px solid ${options.colors.link};color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="margin:0;"><strong style="margin-right:6px;color:${options.colors.link};">${icon}</strong>${inner}</p></section>`;
      }
      return `<section style="margin:16px 0;padding:10px 12px;background:${options.colors.codeBg};border-left:3px solid ${options.colors.border};border-radius:4px;color:${options.colors.text};font-family:${options.fontStack};line-height:${options.typography.bodyLineHeight};font-size:${options.typography.bodySize};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><p style="margin:0;"><strong style="margin-right:6px;color:${isAccentTheme ? options.colors.link : options.colors.text};">${icon}</strong>${inner}</p></section>`;
    }
    case "divider":
      return isAccentTheme || isBlack || isSspai
        ? `<hr style="border-style:solid;border-width:1px 0 0;border-color:${options.colors.divider};transform-origin:0 0;transform:scale(1,${isSspai ? "1" : "0.5"});margin:${isSspai ? "15px 0" : "16px 0"};" />`
        : `<hr style="border:none;border-top:1px solid ${options.colors.divider};margin:16px 0;" />`;
    case "image":
      return `<p style="text-align:center;margin:16px 0;"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt ?? "")}" style="max-width:100%;border-radius:6px;" /></p>`;
    case "code":
      return isPineapple
        ? `<pre style="margin:20px 10px;display:block;font-size:${options.typography.bodySize};padding:10px;color:#333;position:relative;background-color:#fafafa;border:1px solid #f0f0f0;border-radius:5px;white-space:pre;box-shadow:0 2px 10px rgba(0,0,0,0.3);overflow:auto;font-family:${options.fontStack};line-height:1.6;">${escapeHtml(
            block.code
          )}</pre>`
        : `<pre style="font-family:Menlo, Monaco, Consolas, monospace;background:${options.colors.codeBg};padding:12px;overflow-x:auto;border-radius:6px;font-size:13px;line-height:1.6;">${escapeHtml(block.code)}</pre>`;
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
      return `<p style="font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};margin:6px 0;color:${options.colors.text};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}"><span style="opacity:0.6;">[${idx + 1}]</span> 链接: <em>${escapeHtml(
        item.href
      )}</em></p>`;
    })
    .join("");
  return `${headingHtml}${itemHtml}`;
};

export const renderDocToHtml = (doc: Doc, overrides?: Partial<RenderOptions>): string => {
  const options = mergeRenderOptions(overrides);
  const { items, indexMap } = collectReferences(doc);
  const bodyHtml = doc.blocks.map((block) => blockToHtml(block, options, indexMap)).join("");
  const referencesHtml = renderReferencesSection(items, options, indexMap);
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

  const header = normalizeRow(table.rows[0].cells);
  const divider = Array.from({ length: columnCount }, () => "---");
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
        case "divider":
          return "---";
        case "image":
          return `![${escapeMarkdownText(block.alt ?? "image")}](${block.src})`;
        case "code": {
          const fence = block.code.includes("```") ? "````" : "```";
          return `${fence}\n${block.code}\n${fence}`;
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
