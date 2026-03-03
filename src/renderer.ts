import { mergeRenderOptions } from "./theme";
import type { RenderOptions } from "./theme";
import type { Block, Doc, Inline, ListBlock, ListItem, TableBlock } from "./types";

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const inlineToHtml = (inline: Inline, options: RenderOptions): string => {
  const isPineapple = options.themeId === "red";
  switch (inline.type) {
    case "text":
      return escapeHtml(inline.content);
    case "bold":
      return `<strong style="font-weight:600;${isPineapple ? "word-break:break-all;" : ""}">${escapeHtml(
        inline.content
      )}</strong>`;
    case "italic":
      return `<em style="font-style:italic;">${escapeHtml(inline.content)}</em>`;
    case "code":
      return `<code style="font-family:Menlo, Monaco, Consolas, monospace;background:${options.colors.inlineCodeBg};padding:2px 4px;border-radius:4px;font-size:0.95em;">${escapeHtml(inline.content)}</code>`;
    case "link":
      return `<a href="${escapeHtml(inline.href)}" style="color:${options.colors.link};${isPineapple ? "text-decoration:none;border-bottom:1px solid " + options.colors.link + ";" : "text-decoration:underline;"}">${escapeHtml(inline.content)}</a>`;
    default:
      return "";
  }
};

const inlinesToHtml = (inlines: Inline[], options: RenderOptions): string =>
  inlines.map((inline) => inlineToHtml(inline, options)).join("");

const listItemToHtml = (item: ListItem, options: RenderOptions): string => {
  const nestedHtml = item.nested?.map((nested) => listToHtml(nested, options)).join("") ?? "";
  return `<li style="margin-bottom:6px;">${inlinesToHtml(item.children, options)}${nestedHtml}</li>`;
};

const listToHtml = (list: ListBlock, options: RenderOptions): string => {
  const isPineapple = options.themeId === "red";
  const tag = list.ordered ? "ol" : "ul";
  const listItems = list.items.map((item) => listItemToHtml(item, options)).join("");
  return `<${tag} style="font-family:${options.fontStack};padding-left:20px;margin:0 0 ${isPineapple ? "8px" : options.typography.bodyMarginBottom} 0;line-height:${options.typography.bodyLineHeight};color:${options.colors.text};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}">${listItems}</${tag}>`;
};

const tableToHtml = (table: TableBlock, options: RenderOptions): string => {
  const rows = table.rows;
  const columnCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0) || 1;
  const widthPercent = Math.floor(100 / columnCount);
  const tbody = rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          return `<td style="word-break:break-all;font-family:${options.fontStack};font-size:${options.typography.bodySize};vertical-align:top;width:${widthPercent}%;${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}">${inlinesToHtml(
            cell.children,
            options
          )}</td>`;
        })
        .join("");
      return `<tr style="font-size:${options.typography.bodySize};">${cells}</tr>`;
    })
    .join("");

  return `<table style="font-size:${options.typography.bodySize};margin:10px 0;line-height:${options.typography.bodyLineHeight};">${tbody}</table>`;
};

const blockToHtml = (block: Block, options: RenderOptions): string => {
  const baseSize = Number.parseFloat(options.typography.bodySize) || 16;
  const h1Size = Math.round(baseSize * 1.6);
  const h2Size = Math.round(baseSize * 1.33);
  const h3Size = Math.round(baseSize * 1.13);
  const isPineapple = options.themeId === "red";
  switch (block.type) {
    case "heading": {
      const tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
      if (isPineapple) {
        if (block.level === 1) {
          return `<${tag} style="line-height:${options.typography.bodyLineHeight};font-size:${h1Size}px;font-family:${options.fontStack};font-weight:700;margin:0 auto ${Math.round(baseSize * 2.6)}px;width:fit-content;color:${options.colors.link};text-align:center;padding:0 1em;border-bottom:2px solid ${options.colors.link};">${inlinesToHtml(
            block.children,
            options
          )}</${tag}>`;
        }
        if (block.level === 2) {
          return `<${tag} style="line-height:${options.typography.bodyLineHeight};font-family:${options.fontStack};font-size:${h2Size}px;font-weight:700;margin:${Math.round(baseSize * 2.6)}px auto;width:fit-content;background:${options.colors.link};color:#fff;text-align:center;padding:0 0.2em;">${inlinesToHtml(
            block.children,
            options
          )}</${tag}>`;
        }
        return `<${tag} style="line-height:${options.typography.bodyLineHeight};font-family:${options.fontStack};font-size:${h3Size}px;font-weight:700;margin:${Math.round(baseSize * 2.6)}px 0;width:fit-content;color:#000;padding-left:8px;border-left:3px solid ${options.colors.link};">${inlinesToHtml(
          block.children,
          options
        )}</${tag}>`;
      }
      const fontSize =
        block.level === 1 ? `${h1Size}px` : block.level === 2 ? `${h2Size}px` : `${h3Size}px`;
      const marginTop = block.level === 1 ? `${Math.round(baseSize * 1.6)}px` : `${Math.round(baseSize * 1.4)}px`;
      const marginBottom = block.level === 1 ? `${Math.round(baseSize * 0.9)}px` : `${Math.round(baseSize * 0.8)}px`;
      return `<${tag} style="font-family:${options.fontStack};font-size:${fontSize};font-weight:${options.typography.headingWeight};margin:${marginTop} 0 ${marginBottom} 0;line-height:1.5;color:${options.colors.text};">${inlinesToHtml(block.children, options)}</${tag}>`;
    }
    case "paragraph":
      return `<p style="font-family:${options.fontStack};font-size:${options.typography.bodySize};line-height:${options.typography.bodyLineHeight};margin:10px 0;color:${options.colors.text};font-weight:${options.typography.bodyWeight};${options.typography.letterSpacing ? `letter-spacing:${options.typography.letterSpacing};` : ""}text-align:left;white-space:pre-line;min-height:20px;padding-left:0em;">${inlinesToHtml(
        block.children,
        options
      )}</p>`;
    case "quote":
      return `<blockquote style="font-family:${options.fontStack};border-left:${isPineapple ? "3px" : "4px"} solid ${options.colors.border};padding:${isPineapple ? "1px 10px 1px 20px" : "0 0 0 12px"};margin:${isPineapple ? "20px 0" : "16px 0"};color:${options.colors.subText};line-height:${options.typography.bodyLineHeight};">${inlinesToHtml(
        block.children,
        options
      )}</blockquote>`;
    case "divider":
      return isPineapple
        ? `<hr style="border-style:solid;border-width:1px 0 0;border-color:${options.colors.divider};transform-origin:0 0;transform:scale(1,0.5);" />`
        : `<hr style="border:none;border-top:1px solid ${options.colors.divider};margin:24px 0;" />`;
    case "image":
      return `<p style="text-align:center;margin:16px 0;"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt ?? "")}" style="max-width:100%;border-radius:6px;" /></p>`;
    case "code":
      return isPineapple
        ? `<pre style="margin:20px 10px;display:block;font-size:${options.typography.bodySize};padding:10px;color:#333;position:relative;background-color:#fafafa;border:1px solid #f0f0f0;border-radius:5px;white-space:pre;box-shadow:0 2px 10px rgba(0,0,0,0.3);overflow:auto;font-family:${options.fontStack};line-height:1.6;">${escapeHtml(
            block.code
          )}</pre>`
        : `<pre style="font-family:Menlo, Monaco, Consolas, monospace;background:${options.colors.codeBg};padding:12px;overflow-x:auto;border-radius:6px;font-size:13px;line-height:1.6;">${escapeHtml(block.code)}</pre>`;
    case "list":
      return listToHtml(block, options);
    case "table":
      return tableToHtml(block, options);
    default:
      return "";
  }
};

export const renderDocToHtml = (doc: Doc, overrides?: Partial<RenderOptions>): string => {
  const options = mergeRenderOptions(overrides);
  return doc.blocks.map((block) => blockToHtml(block, options)).join("");
};

const inlineToText = (inline: Inline): string => inline.content;

const listToText = (list: ListBlock, depth = 0): string => {
  const prefix = list.ordered ? (index: number) => `${index + 1}. ` : () => "- ";
  return list.items
    .map((item, idx) => {
      const itemText = item.children.map(inlineToText).join("");
      const nestedText = item.nested
        ? "\n" + item.nested.map((nested) => listToText(nested, depth + 1)).join("\n")
        : "";
      const indent = "  ".repeat(depth);
      return `${indent}${prefix(idx)}${itemText}${nestedText}`;
    })
    .join("\n");
};

export const renderDocToText = (doc: Doc): string =>
  doc.blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
        case "paragraph":
        case "quote":
          return block.children.map(inlineToText).join("");
        case "divider":
          return "---";
        case "image":
          return block.alt ? `[Image: ${block.alt}]` : "[Image]";
        case "code":
          return block.code;
        case "list":
          return listToText(block);
        case "table":
          return block.rows
            .map((row) => row.cells.map((cell) => cell.children.map(inlineToText).join("")).join(" | "))
            .join("\n");
        default:
          return "";
      }
    })
    .join("\n\n");
