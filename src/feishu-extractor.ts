import type { Block, Doc, Inline, ListBlock, ListItem, TableBlock, TableRow } from "./types";

// ─── DOM helpers ───────────────────────────────────────────────────────────────

const isElement = (node: Node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE;

const textNodeToInline = (text: string, accent = false): Inline[] =>
  text ? [{ type: "text", content: text, ...(accent ? { color: "accent" as const } : {}) }] : [];

// ─── Inline format detection ───────────────────────────────────────────────────
// Duplicated from extractor.ts because hasAccentColor uses platform-specific
// color class patterns. Extracting to a shared module would require
// parameterization complexity that isn't warranted yet.

const parseRgb = (value: string): { r: number; g: number; b: number } | null => {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  return {
    r: Number.parseInt(match[1], 10),
    g: Number.parseInt(match[2], 10),
    b: Number.parseInt(match[3], 10)
  };
};

const isAccentColor = (value: string): boolean => {
  const rgb = parseRgb(value);
  if (!rgb) return false;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  if (max - min < 20) return false;
  return true;
};

const hasAccentColor = (node: Node): boolean => {
  const el = isElement(node) ? node : node.parentElement;
  if (!el) return false;
  const color = getComputedStyle(el).color ?? "";
  return isAccentColor(color);
};

const extractHighlightColor = (el: HTMLElement): string | null => {
  const bg = getComputedStyle(el).backgroundColor ?? "";
  if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return null;
  const rgb = parseRgb(bg);
  if (!rgb) return null;
  if (rgb.r >= 250 && rgb.g >= 250 && rgb.b >= 250) return null;
  return bg;
};

const isStrikethroughEl = (el: HTMLElement): boolean => {
  const tag = el.tagName;
  if (tag === "S" || tag === "DEL" || tag === "STRIKE") return true;
  return (getComputedStyle(el).textDecorationLine ?? "").includes("line-through");
};

const isUnderlineEl = (el: HTMLElement): boolean => {
  if (el.tagName === "A") return false;
  if (el.tagName === "U") return true;
  return (getComputedStyle(el).textDecorationLine ?? "").includes("underline");
};

const isBoldEl = (el: HTMLElement): boolean => {
  const weight = parseInt(getComputedStyle(el).fontWeight || "0", 10);
  return el.tagName === "STRONG" || el.tagName === "B" || weight >= 600;
};

const isItalicEl = (el: HTMLElement): boolean =>
  el.tagName === "EM" || el.tagName === "I" || getComputedStyle(el).fontStyle === "italic";

const isInlineCodeEl = (el: HTMLElement): boolean => {
  if (el.tagName === "CODE") return true;
  const family = getComputedStyle(el).fontFamily?.toLowerCase() ?? "";
  const className = el.className?.toString().toLowerCase() ?? "";
  return family.includes("monospace") || className.includes("inline-code");
};

// ─── Inline extraction ─────────────────────────────────────────────────────────

const extractInlinesFromNode = (node: Node): Inline[] => {
  if (node.nodeType === Node.TEXT_NODE) {
    const accent = hasAccentColor(node);
    return textNodeToInline(node.textContent ?? "", accent);
  }

  if (!isElement(node)) return [];

  if (node.tagName === "BR") return [{ type: "text", content: "\n" }];

  if (node.tagName === "A") {
    const href = (node as HTMLAnchorElement).href;
    const text = node.textContent ?? "";
    return text ? [{ type: "link", content: text, href }] : [];
  }

  if (isInlineCodeEl(node)) {
    const text = node.textContent ?? "";
    return text ? [{ type: "code", content: text }] : [];
  }

  const highlightColor = extractHighlightColor(node);
  if (highlightColor) {
    const text = node.textContent ?? "";
    return text ? [{ type: "highlight", content: text, highlightColor }] : [];
  }

  if (isStrikethroughEl(node)) {
    const text = node.textContent ?? "";
    const accent = hasAccentColor(node);
    return text ? [{ type: "strikethrough", content: text, ...(accent ? { color: "accent" as const } : {}) }] : [];
  }

  if (isUnderlineEl(node)) {
    const text = node.textContent ?? "";
    const accent = hasAccentColor(node);
    return text ? [{ type: "underline", content: text, ...(accent ? { color: "accent" as const } : {}) }] : [];
  }

  if (isBoldEl(node)) {
    const text = node.textContent ?? "";
    const accent = hasAccentColor(node);
    return text ? [{ type: "bold", content: text, ...(accent ? { color: "accent" as const } : {}) }] : [];
  }

  if (isItalicEl(node)) {
    const text = node.textContent ?? "";
    const accent = hasAccentColor(node);
    return text ? [{ type: "italic", content: text, ...(accent ? { color: "accent" as const } : {}) }] : [];
  }

  const inlines: Inline[] = [];
  node.childNodes.forEach((child) => {
    inlines.push(...extractInlinesFromNode(child));
  });
  return inlines;
};

const extractInlinesFromNodes = (nodes: Node[]): Inline[] => {
  const inlines: Inline[] = [];
  nodes.forEach((node) => {
    inlines.push(...extractInlinesFromNode(node));
  });
  return inlines;
};

// ─── Block helpers ──────────────────────────────────────────────────────────────

const normalizeInlineContent = (inlines: Inline[]): Inline[] => {
  const hasVisibleText = inlines.some((inline) => inline.content.trim().length > 0);
  return hasVisibleText ? inlines : [];
};

const stripInvisibleChars = (text: string): string =>
  text.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
  objc: "objective-c",
  cs: "csharp",
  "c++": "cpp"
};

const normalizeLanguageName = (raw: string): string => {
  const trimmed = raw.trim().toLowerCase();
  return LANGUAGE_ALIASES[trimmed] ?? trimmed;
};

// ─── Feishu-specific block detection ────────────────────────────────────────────

const getFeishuRoot = (): Element => {
  return (
    document.querySelector(".page-block-children") ??
    document.querySelector('[data-content-editable-root="true"]') ??
    document.body
  );
};

const getBlockElements = (root: Element): HTMLElement[] => {
  const allBlocks = Array.from(
    root.querySelectorAll<HTMLElement>(".render-unit-wrapper > .block[data-block-type]")
  );
  if (allBlocks.length > 0) {
    return allBlocks.filter((block) => {
      const blockType = block.getAttribute("data-block-type") ?? "";
      return blockType !== "table_cell" && blockType !== "page";
    });
  }
  // Fallback: direct children
  return Array.from(root.children).filter(
    (child): child is HTMLElement => isElement(child as Node)
  );
};

// ─── Feishu inline extraction ────────────────────────────────────────────────────

const extractInlinesFromFeishuBlock = (blockEl: HTMLElement): Inline[] => {
  const textEditor = blockEl.querySelector<HTMLElement>(".text-editor") ?? blockEl;
  const aceLines = textEditor.querySelectorAll<HTMLElement>(".ace-line");
  if (aceLines.length === 0) return extractInlinesFromNode(textEditor);

  const inlines: Inline[] = [];
  aceLines.forEach((line) => {
    line.childNodes.forEach((node) => {
      if (isElement(node) && node.getAttribute("data-enter") === "true") return;
      inlines.push(...extractInlinesFromNode(node));
    });
  });
  return normalizeInlineContent(inlines);
};

// ─── Code block detection ───────────────────────────────────────────────────────

const detectCodeLanguage = (preEl: HTMLElement, blockEl: HTMLElement): string | undefined => {
  const dataLang = preEl.getAttribute("data-language");
  if (dataLang?.trim()) return normalizeLanguageName(dataLang);

  const codeEl = preEl.querySelector("code");
  if (codeEl) {
    const classNames = codeEl.className?.toString() ?? "";
    const langMatch = classNames.match(/(?:language|lang|hljs)-(\S+)/i);
    if (langMatch?.[1]) return normalizeLanguageName(langMatch[1]);
  }

  return undefined;
};

// ─── List extraction ────────────────────────────────────────────────────────────

const extractListBlock = (listEl: HTMLOListElement | HTMLUListElement): ListBlock => {
  const ordered = listEl.tagName === "OL";
  const items: ListItem[] = Array.from(listEl.children)
    .filter((child): child is HTMLLIElement => child.tagName === "LI")
    .map((li) => {
      const childNodes = Array.from(li.childNodes).filter((node) => {
        return !(isElement(node) && (node.tagName === "UL" || node.tagName === "OL"));
      });
      const children = extractInlinesFromNodes(childNodes);
      const nestedLists = Array.from(li.children)
        .filter((child): child is HTMLOListElement | HTMLUListElement =>
          child.tagName === "UL" || child.tagName === "OL"
        )
        .map(extractListBlock);
      return {
        children,
        nested: nestedLists.length ? nestedLists : undefined
      };
    });

  return { type: "list", ordered, items };
};

// ─── Callout extraction ─────────────────────────────────────────────────────────

const extractCalloutBlock = (blockEl: HTMLElement): Block | null => {
  const iconEl = blockEl.querySelector<HTMLElement>('[role="img"], .emoji, .callout-icon');
  const icon = iconEl?.textContent?.trim() || undefined;
  const children = normalizeInlineContent(extractInlinesFromFeishuBlock(blockEl));
  if (!children.length && !icon) return null;
  return { type: "callout", icon, children };
};

// ─── Block extraction ───────────────────────────────────────────────────────────

const extractBlock = (blockEl: HTMLElement): Block | null => {
  const blockType = blockEl.getAttribute("data-block-type") ?? "";

  // Heading — feishu uses data-block-type="heading1/2/3" instead of <h1>/<h2>/<h3>
  if (blockType.startsWith("heading")) {
    const levelStr = blockType.replace("heading", "");
    const level = Math.min(parseInt(levelStr, 10) || 1, 3) as 1 | 2 | 3;
    const contentEl = blockEl.querySelector<HTMLElement>(".heading-content") ?? blockEl;
    const children = extractInlinesFromFeishuBlock(contentEl);
    return children.length ? { type: "heading", level, children } : null;
  }

  // Table — feishu uses standard <table> inside data-block-type="table"
  if (blockType === "table") {
    const tableEl = blockEl.querySelector("table");
    if (tableEl) {
      const trElements = Array.from(tableEl.querySelectorAll("tr"));
      const rows: TableRow[] = trElements.map((row, rowIndex) => {
        const cellElements = Array.from(row.querySelectorAll("td, th"));
        const cells = cellElements.map((cell) => ({
          children: extractInlinesFromNodes(Array.from(cell.childNodes))
        }));
        const inThead = row.closest("thead") !== null;
        const allTh = cellElements.length > 0 && cellElements.every((c) => c.tagName === "TH");
        const isHeader = inThead || (rowIndex === 0 && allTh);
        return { cells, ...(isHeader ? { isHeader: true } : {}) };
      });
      const hasContent = rows.some((row) => row.cells.some((cell) => cell.children.length > 0));
      if (hasContent) {
        const tableBlock: TableBlock = { type: "table", rows };
        return tableBlock;
      }
    }
    return null;
  }

  // Code — feishu may use <pre> or custom code block markup
  if (blockType === "code") {
    const preEl = blockEl.querySelector("pre");
    if (preEl) {
      const language = detectCodeLanguage(preEl, blockEl);
      return {
        type: "code",
        code: stripInvisibleChars(preEl.textContent ?? ""),
        ...(language ? { language } : {})
      };
    }
    // Fallback: extract text from the block's text editor area
    const textEditor = blockEl.querySelector<HTMLElement>(".text-editor") ?? blockEl;
    const language = detectCodeLanguage(textEditor, blockEl);
    const code = stripInvisibleChars(textEditor.textContent ?? "").replace(/\n+$/, "");
    return code ? { type: "code", code, ...(language ? { language } : {}) } : null;
  }

  // Quote
  if (blockType === "quote") {
    const contentEl = blockEl.querySelector<HTMLElement>(".text-editor") ?? blockEl;
    const children = extractInlinesFromFeishuBlock(contentEl);
    return children.length ? { type: "quote", children } : null;
  }

  // Divider
  if (blockType === "divider") {
    return { type: "divider" };
  }

  // List items — feishu represents each item as a separate block
  if (blockType === "ordered" || blockType === "bullet") {
    const children = extractInlinesFromFeishuBlock(blockEl);
    if (!children.length) return null;
    return { type: "list", ordered: blockType === "ordered", items: [{ children }] };
  }

  // Callout
  if (blockType === "callout") {
    const calloutBlock = extractCalloutBlock(blockEl);
    if (calloutBlock) return calloutBlock;
    // Fallback: treat as paragraph
    const children = extractInlinesFromFeishuBlock(blockEl);
    return children.length ? { type: "callout", children } : null;
  }

  // Image
  if (blockType === "image") {
    const imgEl = blockEl.querySelector("img");
    if (imgEl?.src) return { type: "image", src: imgEl.src, alt: imgEl.alt || undefined };
    return null;
  }

  // Text / fallback → paragraph
  const children = extractInlinesFromFeishuBlock(blockEl);
  return children.length ? { type: "paragraph", children } : null;
};

// ─── Post-processing ────────────────────────────────────────────────────────────

const mergeAdjacentLists = (blocks: Block[]): Block[] => {
  const merged: Block[] = [];

  blocks.forEach((block) => {
    if (block.type !== "list") {
      merged.push(block);
      return;
    }

    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.type === "list" &&
      prev.ordered === block.ordered &&
      prev.items.every((item) => !item.nested?.length) &&
      block.items.every((item) => !item.nested?.length)
    ) {
      prev.items.push(...block.items);
      return;
    }

    merged.push(block);
  });

  return merged;
};

const mergeAdjacentCodeBlocks = (blocks: Block[]): Block[] => {
  const merged: Block[] = [];

  blocks.forEach((block) => {
    if (block.type !== "code") {
      merged.push(block);
      return;
    }

    const prev = merged[merged.length - 1];
    if (prev && prev.type === "code") {
      merged[merged.length - 1] = {
        ...prev,
        code: prev.code + "\n" + block.code,
        language: prev.language ?? block.language,
      };
      return;
    }

    merged.push(block);
  });

  return merged;
};

// ─── Main export ────────────────────────────────────────────────────────────────

export const extractDocFromFeishu = (): Doc => {
  const root = getFeishuRoot();
  const blocks = getBlockElements(root)
    .map(extractBlock)
    .filter((block): block is Block => Boolean(block));
  const mergedBlocks = mergeAdjacentCodeBlocks(mergeAdjacentLists(blocks));

  const titleEl = document.querySelector<HTMLElement>(
    "h1.page-block-content .text-editor .ace-line"
  );
  const title = titleEl?.textContent?.trim() || undefined;

  return { title, blocks: mergedBlocks };
};
