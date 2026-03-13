import type { Block, Doc, Inline, ListBlock, ListItem, TableBlock, TableCell, TableRow } from "./types";

// ─── Feishu data types ────────────────────────────────────────────────────────

type FeishuBlockData = {
  type: string;
  parent_id: string;
  children?: string[];
  text?: {
    apool: { numToAttrib: Record<string, [string, string]> };
    initialAttributedTexts: { attribs: Record<string, string>; text: Record<string, string> };
  };
  columns_id?: string[];
  rows_id?: string[];
  cell_set?: Record<string, { block_id: string; merge_info: { row_span: number; col_span: number } }>;
  header_row?: boolean;
  language?: string;
};
type BlockMap = Record<string, { id: string; data: FeishuBlockData }>;

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
      if (blockType === "table_cell" || blockType === "page") return false;
      if (block.closest('[data-block-type="quote_container"]') && blockType !== "quote_container") return false;
      if (block.closest('[data-block-type="table"]') && blockType !== "table") return false;
      return true;
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

  // Table — feishu uses two separate <table> elements: sticky header + content scroller
  if (blockType === "table") {
    const tableEls = Array.from(blockEl.querySelectorAll("table"));
    if (tableEls.length > 0) {
      const allTrs: HTMLTableRowElement[] = [];
      tableEls.forEach((tableEl) => {
        allTrs.push(
          ...Array.from(
            tableEl.querySelectorAll<HTMLTableRowElement>(
              ":scope > thead > tr, :scope > tbody > tr, :scope > tr"
            )
          )
        );
      });
      // Deduplicate: sticky header row may appear in both tables
      const seen = new Set<string>();
      const uniqueTrs = allTrs.filter((tr) => {
        const key = tr.getAttribute("data-index") ?? tr.textContent ?? "";
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const rows: TableRow[] = uniqueTrs.map((row, rowIndex) => {
        const cellElements = Array.from(row.querySelectorAll("td, th"));
        const cells = cellElements.map((cell) => ({
          children: extractInlinesFromFeishuBlock(cell as HTMLElement)
        }));
        const inThead = row.closest("thead") !== null;
        const isStickyRow =
          row.classList.contains("sticky-row") || row.classList.contains("first-row");
        const allTh =
          cellElements.length > 0 && cellElements.every((c) => c.tagName === "TH");
        const isHeader = inThead || isStickyRow || (rowIndex === 0 && allTh);
        return { cells, ...(isHeader ? { isHeader: true } : {}) };
      });
      const hasContent = rows.some((row) =>
        row.cells.some((cell) => cell.children.length > 0)
      );
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
  if (blockType === "quote" || blockType === "quote_container") {
    if (blockType === "quote_container") {
      const childBlocks = Array.from(
        blockEl.querySelectorAll<HTMLElement>(
          ".quote-container-block-children .block[data-block-type]"
        )
      );
      const allInlines: Inline[] = [];
      childBlocks.forEach((child) => {
        const inlines = extractInlinesFromFeishuBlock(child);
        if (inlines.length > 0) {
          if (allInlines.length > 0) {
            allInlines.push({ type: "text", content: "\n" });
          }
          allInlines.push(...inlines);
        }
      });
      return allInlines.length ? { type: "quote", children: allInlines } : null;
    }
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

  // Whiteboard
  if (blockType === "whiteboard") {
    return { type: "paragraph", children: [{ type: "text", content: "[飞书白板]" }] };
  }

  // Image
  if (blockType === "image") {
    const imgEl = blockEl.querySelector("img");
    if (imgEl?.src) return { type: "image", src: imgEl.src, alt: imgEl.alt || undefined };
    return null;
  }

  // Quote — fallback: some feishu quotes use data-block-type="text" with quote class
  if (blockEl.classList.contains("quote-container-render-unit")) {
    const children = extractInlinesFromFeishuBlock(blockEl);
    return children.length ? { type: "quote", children } : null;
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
      merged[merged.length - 1] = { ...prev, items: [...prev.items, ...block.items] };
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

// ─── Data-based extraction (bypasses virtual scrolling) ─────────────────────

const parseBase36 = (s: string): number => {
  const n = parseInt(s, 36);
  return Number.isNaN(n) ? 0 : n;
};

const parseAttributedText = (blockData: FeishuBlockData): Inline[] => {
  const textData = blockData.text;
  if (!textData) return [];

  const { apool, initialAttributedTexts } = textData;
  const attribStr = initialAttributedTexts.attribs["0"] ?? "";
  const textStr = initialAttributedTexts.text["0"] ?? "";
  if (!textStr) return [];

  const numToAttrib = apool.numToAttrib;
  // Etherpad changeset format: *N = activate attrib N, |N+X = insert X chars containing N newlines, +X = insert X chars (base36)
  const regex = /(\*([0-9a-z]+))|(\|([0-9a-z]+))?\+([0-9a-z]+)/g;

  // Track active attributes by name → apool key (so we can resolve the correct value)
  const activeAttribs = new Map<string, string>();
  const inlines: Inline[] = [];
  let textPos = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(attribStr)) !== null) {
    if (match[1]) {
      // *N → activate attribute N
      const key = match[2];
      const attrib = numToAttrib[key];
      if (attrib) activeAttribs.set(attrib[0], key);
    } else {
      // |N before +X → line marker (N newlines in this insertion), NOT attribute deactivation
      // Do nothing — attributes remain active

      // +X → consume X characters
      const count = parseBase36(match[5]);
      const content = textStr.slice(textPos, textPos + count);
      textPos += count;

      if (content === "\n" || !content) {
        activeAttribs.clear();
        continue;
      }

      // Resolve attributes by priority: link > code > highlight > formatting > text
      // Our Inline type is single-format, so pick the most semantically significant one
      let inlineType: Inline["type"] = "text";
      let href: string | undefined;
      let highlightColor: string | undefined;

      for (const [attr, poolKey] of activeAttribs) {
        if (attr === "link") {
          inlineType = "link";
          const attribEntry = numToAttrib[poolKey];
          try {
            const linkData = JSON.parse(attribEntry?.[1] ?? "{}");
            href = linkData.url ?? "";
          } catch {
            href = "";
          }
        } else if (attr === "inlineCode" && inlineType !== "link") {
          inlineType = "code";
        } else if (attr === "textHighlight" && inlineType !== "link" && inlineType !== "code") {
          inlineType = "highlight";
          const attribEntry = numToAttrib[poolKey];
          highlightColor = attribEntry?.[1] ?? "#fff3b0";
        } else if (attr === "bold" && inlineType === "text") {
          inlineType = "bold";
        } else if (attr === "italic" && inlineType === "text") {
          inlineType = "italic";
        } else if (attr === "underline" && inlineType === "text") {
          inlineType = "underline";
        } else if (attr === "strikethrough" && inlineType === "text") {
          inlineType = "strikethrough";
        }
      }

      if (inlineType === "link" && href !== undefined) {
        inlines.push({ type: "link", content, href });
      } else if (inlineType === "highlight" && highlightColor) {
        inlines.push({ type: "highlight", content, highlightColor });
      } else if (inlineType === "code") {
        inlines.push({ type: "code", content });
      } else if (inlineType === "bold" || inlineType === "italic" || inlineType === "underline" || inlineType === "strikethrough") {
        inlines.push({ type: inlineType, content });
      } else {
        inlines.push({ type: "text", content });
      }

      activeAttribs.clear();
    }
  }

  return inlines;
};

const extractBlockFromData = (
  data: FeishuBlockData | undefined,
  blockMap: BlockMap
): Block | null => {
  if (!data) return null;
  const { type } = data;

  // Heading
  if (type === "heading1" || type === "heading2" || type === "heading3") {
    const level = parseInt(type.replace("heading", ""), 10) as 1 | 2 | 3;
    const children = parseAttributedText(data);
    return children.length ? { type: "heading", level, children } : null;
  }

  // Text → paragraph (skip empty)
  if (type === "text") {
    const children = parseAttributedText(data);
    return children.length ? { type: "paragraph", children } : null;
  }

  // Quote container
  if (type === "quote_container") {
    const allInlines: Inline[] = [];
    for (const childId of data.children ?? []) {
      const childData = blockMap[childId]?.data;
      if (!childData) continue;
      const inlines = parseAttributedText(childData);
      if (inlines.length > 0) {
        if (allInlines.length > 0) {
          allInlines.push({ type: "text", content: "\n" });
        }
        allInlines.push(...inlines);
      }
    }
    return allInlines.length ? { type: "quote", children: allInlines } : null;
  }

  // Lists
  if (type === "ordered" || type === "bullet") {
    const children = parseAttributedText(data);
    if (!children.length) return null;
    return { type: "list", ordered: type === "ordered", items: [{ children }] };
  }

  // Code
  if (type === "code") {
    const textData = data.text;
    const code = textData?.initialAttributedTexts?.text?.["0"]?.replace(/\n+$/, "") ?? "";
    if (!code) return null;
    const language = data.language ? normalizeLanguageName(data.language) : undefined;
    return { type: "code", code: stripInvisibleChars(code), ...(language ? { language } : {}) };
  }

  // Table
  if (type === "table") {
    const rowsId = data.rows_id ?? [];
    const colsId = data.columns_id ?? [];
    const cellSet = data.cell_set ?? {};
    const hasHeaderRow = data.header_row === true;

    const rows: TableRow[] = rowsId.map((rowId, rowIndex) => {
      const cells: TableCell[] = colsId.map((colId) => {
        const cellKey = `${rowId}${colId}`;
        const cellInfo = cellSet[cellKey];
        if (!cellInfo) return { children: [] };
        const cellBlock = blockMap[cellInfo.block_id];
        if (!cellBlock) return { children: [] };
        // Cell block may have children blocks
        const cellChildren = cellBlock.data.children ?? [];
        const inlines: Inline[] = [];
        let listCounter = 1;
        for (const childId of cellChildren) {
          const childData = blockMap[childId]?.data;
          if (!childData) continue;
          const parsed = parseAttributedText(childData);
          if (parsed.length > 0) {
            if (inlines.length > 0) inlines.push({ type: "text", content: "\n" });
            if (childData.type === "ordered") {
              inlines.push({ type: "text", content: `${listCounter++}. ` });
            } else if (childData.type === "bullet") {
              inlines.push({ type: "text", content: "• " });
            } else {
              listCounter = 1;
            }
            inlines.push(...parsed);
          }
        }
        return { children: inlines };
      });
      return { cells, ...(hasHeaderRow && rowIndex === 0 ? { isHeader: true } : {}) };
    });

    const hasContent = rows.some((row) =>
      row.cells.some((cell) => cell.children.length > 0)
    );
    return hasContent ? { type: "table", rows } : null;
  }

  // Divider
  if (type === "divider") {
    return { type: "divider" };
  }

  // Callout
  if (type === "callout") {
    const children = parseAttributedText(data);
    return children.length ? { type: "callout", children } : null;
  }

  // Whiteboard
  if (type === "whiteboard" || type === "board") {
    return { type: "paragraph", children: [{ type: "text", content: "[飞书白板]" }] };
  }

  // Embedded spreadsheet
  if (type === "sheet") {
    return { type: "paragraph", children: [{ type: "text", content: "[飞书电子表格]" }] };
  }

  // Unknown types — skip
  return null;
};

const BRIDGE_ELEMENT_ID = "__feishu_block_map__";

const getFeishuPageData = (): BlockMap | null => {
  // Strategy 1: Read from MAIN world bridge element (CSP-safe)
  const bridgeEl = document.getElementById(BRIDGE_ELEMENT_ID);
  if (bridgeEl?.textContent) {
    try {
      const blockMap = JSON.parse(bridgeEl.textContent) as BlockMap;
      if (blockMap && Object.keys(blockMap).length > 0) return blockMap;
    } catch { /* fall through to strategy 2 */ }
  }

  // Strategy 2: Inline script injection (legacy fallback, may fail if CSP blocks inline scripts)
  const script = document.createElement("script");
  script.textContent = `
    (() => {
      const data = window.DATA?.clientVars?.data;
      if (data?.block_map) {
        document.dispatchEvent(new CustomEvent("__feishu_data__", {
          detail: JSON.stringify(data.block_map)
        }));
      }
    })();
  `;

  let blockMap: BlockMap | null = null;
  const handler = (e: Event) => {
    try {
      blockMap = JSON.parse((e as CustomEvent).detail);
    } catch { /* ignore */ }
  };

  document.addEventListener("__feishu_data__", handler);
  document.documentElement.appendChild(script);
  script.remove();
  document.removeEventListener("__feishu_data__", handler);

  return blockMap;
};

const extractDocFromFeishuData = (): Doc | null => {
  const blockMap = getFeishuPageData();
  if (!blockMap) return null;
  const pageBlock = Object.values(blockMap).find((b) => b.data.type === "page");
  if (!pageBlock?.data.children) return null;

  const blocks = pageBlock.data.children
    .map((id) => extractBlockFromData(blockMap[id]?.data, blockMap))
    .filter((block): block is Block => Boolean(block));

  const title = pageBlock.data.text?.initialAttributedTexts?.text?.["0"]?.trim();

  return { title, blocks: mergeAdjacentCodeBlocks(mergeAdjacentLists(blocks)) };
};

// ─── Scroll-based accumulation (virtual scrolling workaround) ────────────────

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const hashBlock = (block: Block): string => {
  switch (block.type) {
    case "heading":
      return `h${block.level}:${block.children.map((i) => i.content).join("")}`;
    case "paragraph":
      return `p:${block.children.map((i) => i.content).join("")}`;
    case "code":
      return `code:${block.code.substring(0, 200)}`;
    case "list":
      return `list:${block.ordered}:${block.items.map((i) => i.children.map((c) => c.content).join("")).join("|")}`;
    case "quote":
      return `quote:${block.children.map((i) => i.content).join("")}`;
    case "callout":
      return `callout:${block.children.map((i) => i.content).join("")}`;
    case "table": {
      const firstRowContent = block.rows[0]?.cells.map((c) => c.children.map((i) => i.content).join("")).join(",") ?? "";
      return `table:${block.rows.length}x${block.rows[0]?.cells.length ?? 0}:${firstRowContent}`;
    }
    case "image":
      return `img:${block.src}`;
    case "divider":
      return "divider";
  }
};

const findScrollContainer = (root: Element): Element => {
  let el: Element | null = root;
  while (el && el !== document.documentElement) {
    if (el.scrollHeight > el.clientHeight + 10) return el;
    el = el.parentElement;
  }
  return document.documentElement;
};

const ensureTableRowsRendered = async (tableBlockEl: HTMLElement): Promise<void> => {
  const scrollContainer = tableBlockEl.querySelector<HTMLElement>(
    '.table-scroll-container, .table-body-container, [class*="virtual-scroll"], [class*="scroll-container"]'
  );
  const target = scrollContainer ?? tableBlockEl;
  if (target.scrollHeight <= target.clientHeight + 10) return;

  const saved = target.scrollTop;
  let last = -1;
  while (target.scrollTop !== last) {
    last = target.scrollTop;
    target.scrollTop += target.clientHeight * 0.8;
    await delay(150);
  }
  target.scrollTop = saved;
  await delay(100);
};

const tableContentScore = (block: Block): number => {
  if (block.type !== "table") return 0;
  return block.rows.reduce(
    (sum, row) => sum + row.cells.reduce((s, c) => s + c.children.length, 0),
    0
  );
};

const scrollAndAccumulateBlocks = async (root: Element): Promise<Block[]> => {
  const container = findScrollContainer(root);
  const savedScrollTop = container.scrollTop;
  const allBlocks: Block[] = [];
  const seenHashes = new Set<string>();
  const tableHashToIndex = new Map<string, number>();

  container.scrollTop = 0;
  await delay(300);

  let lastScrollTop = -1;

  while (true) {
    // Pre-scroll any table containers to force virtual rows to render
    const tableEls = Array.from(root.querySelectorAll<HTMLElement>('.block[data-block-type="table"]'));
    for (const tableEl of tableEls) {
      await ensureTableRowsRendered(tableEl);
    }

    const visibleBlocks = getBlockElements(root)
      .map((el) => {
        try { return extractBlock(el); }
        catch { return null; }
      })
      .filter((b): b is Block => Boolean(b));

    for (const block of visibleBlocks) {
      const hash = hashBlock(block);
      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        allBlocks.push(block);
        if (block.type === "table") {
          tableHashToIndex.set(hash, allBlocks.length - 1);
        }
      } else if (block.type === "table") {
        // Replace with more complete version if this scroll pass rendered more rows
        const idx = tableHashToIndex.get(hash);
        if (idx !== undefined && tableContentScore(block) > tableContentScore(allBlocks[idx])) {
          allBlocks[idx] = block;
        }
      }
    }

    const scrollStep = container.clientHeight * 0.7;
    container.scrollTop += scrollStep;
    await delay(300);

    if (container.scrollTop === lastScrollTop) break;
    lastScrollTop = container.scrollTop;
  }

  container.scrollTop = savedScrollTop;
  return allBlocks;
};

// ─── Main export ────────────────────────────────────────────────────────────────

export const extractDocFromFeishu = async (): Promise<Doc> => {
  // Prefer data-based extraction (complete document, bypasses virtual scrolling)
  const dataDoc = extractDocFromFeishuData();
  if (dataDoc && dataDoc.blocks.length > 0) return dataDoc;

  // Fallback: scroll-based accumulation (handles virtual scrolling in /wiki/ pages)
  const root = getFeishuRoot();
  const blocks = await scrollAndAccumulateBlocks(root);
  const mergedBlocks = mergeAdjacentCodeBlocks(mergeAdjacentLists(blocks));

  const titleEl = document.querySelector<HTMLElement>(
    "h1.page-block-content .text-editor .ace-line"
  );
  const title = titleEl?.textContent?.trim() || undefined;

  return { title, blocks: mergedBlocks };
};
