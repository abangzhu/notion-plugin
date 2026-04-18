import type { Block, Doc, Inline, ListBlock, ListItem, TableBlock, TableRow } from "./types";

const isElement = (node: Node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE;

const textNodeToInline = (text: string, accent = false): Inline[] =>
  text ? [{ type: "text", content: text, ...(accent ? { color: "accent" } : {}) }] : [];

const COLOR_CLASS_PATTERN =
  /(notion-|color-)(red|orange|yellow|green|blue|purple|pink|brown|gray|grey)/i;

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
  if (max - min < 20) return false; // grayscale / default
  return true;
};

const hasAccentColor = (node: Node): boolean => {
  const el = isElement(node) ? node : node.parentElement;
  if (!el) return false;
  const className = el.className?.toString() ?? "";
  if (COLOR_CLASS_PATTERN.test(className)) return true;
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
  return el.tagName === "STRONG" || weight >= 600;
};

const isItalicEl = (el: HTMLElement): boolean =>
  el.tagName === "EM" || getComputedStyle(el).fontStyle === "italic";

const isInlineCodeEl = (el: HTMLElement): boolean => {
  if (el.tagName === "CODE") return true;
  const family = getComputedStyle(el).fontFamily?.toLowerCase() ?? "";
  const className = el.className?.toString().toLowerCase() ?? "";
  return family.includes("monospace") || className.includes("inline-code");
};

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
    return text ? [{ type: "strikethrough", content: text, ...(accent ? { color: "accent" } : {}) }] : [];
  }

  if (isUnderlineEl(node)) {
    // If the underline span wraps a link, recurse to preserve href
    if (node.querySelector("a[href]")) {
      const inlines: Inline[] = [];
      node.childNodes.forEach((child) => {
        inlines.push(...extractInlinesFromNode(child));
      });
      return inlines;
    }
    const text = node.textContent ?? "";
    const accent = hasAccentColor(node);
    return text ? [{ type: "underline", content: text, ...(accent ? { color: "accent" } : {}) }] : [];
  }

  if (isBoldEl(node)) {
    const text = node.textContent ?? "";
    const accent = hasAccentColor(node);
    return text ? [{ type: "bold", content: text, ...(accent ? { color: "accent" } : {}) }] : [];
  }

  if (isItalicEl(node)) {
    const text = node.textContent ?? "";
    const accent = hasAccentColor(node);
    return text ? [{ type: "italic", content: text, ...(accent ? { color: "accent" } : {}) }] : [];
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

const stripInvisibleChars = (text: string): string =>
  text.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");

const PRISM_CLASS_HINTS: Record<string, string> = {
  environment: "bash",
  shebang: "bash",
  "assign-left": "bash",
  "file-descriptor": "bash",
  decorator: "python",
  "f-string": "python",
  "triple-quoted-string": "python",
};

const detectLanguageFromPrismTokens = (containerEl: HTMLElement): string | undefined => {
  const tokenSpans = containerEl.querySelectorAll<HTMLElement>("span.token");
  const limit = Math.min(tokenSpans.length, 20);
  for (let i = 0; i < limit; i++) {
    const classes = tokenSpans[i].className.split(/\s+/);
    for (const cls of classes) {
      const hint = PRISM_CLASS_HINTS[cls];
      if (hint) return hint;
    }
  }
  return undefined;
};

const detectCodeLanguage = (preEl: HTMLElement, blockEl: HTMLElement): string | undefined => {
  const dataLang = preEl.getAttribute("data-language");
  if (dataLang?.trim()) return normalizeLanguageName(dataLang);

  const codeEl = preEl.querySelector("code");
  if (codeEl) {
    const classNames = codeEl.className?.toString() ?? "";
    const langMatch = classNames.match(/(?:language|lang|hljs)-(\S+)/i);
    if (langMatch?.[1]) return normalizeLanguageName(langMatch[1]);
  }

  const langButton = blockEl.querySelector<HTMLElement>(
    '[class*="notion-code-block"] [role="button"], [class*="code-block"] [role="button"]'
  );
  const langText = langButton?.textContent?.trim();
  if (langText && langText.length < 30 && /^[a-zA-Z][a-zA-Z0-9#+\-. ]*$/.test(langText)) {
    return normalizeLanguageName(langText);
  }

  // Method 4: search for data-language attribute on any descendant of blockEl
  const langAttrEl = blockEl.querySelector<HTMLElement>("[data-language]");
  if (langAttrEl) {
    const lang = langAttrEl.getAttribute("data-language")?.trim();
    if (lang) return normalizeLanguageName(lang);
  }

  // Method 5: look for language label text near the figure element
  const figureEl = blockEl.querySelector("[role=\"figure\"]");
  if (figureEl) {
    const siblings = figureEl.parentElement?.children ?? [];
    for (const sibling of Array.from(siblings)) {
      if (sibling === figureEl) continue;
      const text = (sibling as HTMLElement).textContent?.trim() ?? "";
      if (text && text.length < 30 && /^[a-zA-Z][a-zA-Z0-9#+\-. ]*$/.test(text)) {
        return normalizeLanguageName(text);
      }
    }
  }

  // Method 6: infer language from Notion's Prism token classes
  const contentEl = blockEl.querySelector<HTMLElement>('[data-content-editable-leaf="true"]') ?? preEl;
  const prismLang = detectLanguageFromPrismTokens(contentEl);
  if (prismLang) return prismLang;

  return undefined;
};

const CALLOUT_SELECTOR = '[class*="notion-callout"], [data-block-type="callout"]';

const normalizeInlineContent = (inlines: Inline[]): Inline[] => {
  const hasVisibleText = inlines.some((inline) => inline.content.trim().length > 0);
  return hasVisibleText ? inlines : [];
};

const extractCalloutBlock = (blockEl: HTMLElement): Block | null => {
  const calloutEl = blockEl.matches(CALLOUT_SELECTOR)
    ? blockEl
    : blockEl.querySelector<HTMLElement>(CALLOUT_SELECTOR);
  if (!calloutEl) return null;
  const ownerBlock = calloutEl.closest<HTMLElement>("[data-block-id]");
  if (ownerBlock && ownerBlock !== blockEl) return null;

  const iconEl = calloutEl.querySelector<HTMLElement>('[class*="notion-page-icon"], [role="img"]');
  const icon = iconEl?.textContent?.trim() || undefined;
  const textEl =
    calloutEl.querySelector<HTMLElement>('[class*="notion-callout-text"]') ??
    calloutEl.querySelector<HTMLElement>('[class*="notion-semantic-string"]') ??
    calloutEl;
  const children = normalizeInlineContent(extractInlinesFromNode(textEl));
  if (!children.length && !icon) return null;
  return {
    type: "callout",
    icon,
    children
  };
};

const getBlockElements = (root: Element): HTMLElement[] => {
  const allBlocks = Array.from(root.querySelectorAll<HTMLElement>("[data-block-id]"));
  return allBlocks.filter((block) => {
    const parentBlock = block.parentElement?.closest("[data-block-id]");
    return parentBlock == null;
  });
};

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

  return {
    type: "list",
    ordered,
    items
  };
};

const toSingleItemListBlock = (blockEl: HTMLElement, ordered: boolean): ListBlock | null => {
  const children = extractInlinesFromNode(blockEl).filter((inline) => inline.content.trim().length > 0);
  if (!children.length) return null;
  return {
    type: "list",
    ordered,
    items: [{ children }]
  };
};

const extractListItemBlockFromHint = (blockEl: HTMLElement): ListBlock | null => {
  const blockType = (blockEl.getAttribute("data-block-type") ?? "").toLowerCase();
  const className = blockEl.className?.toString().toLowerCase() ?? "";
  const hint = `${blockType} ${className}`;

  if (
    hint.includes("numbered_list_item") ||
    hint.includes("numbered-list-item") ||
    hint.includes("notion-numbered")
  ) {
    return toSingleItemListBlock(blockEl, true);
  }

  if (
    hint.includes("bulleted_list_item") ||
    hint.includes("bulleted-list-item") ||
    hint.includes("notion-bulleted")
  ) {
    return toSingleItemListBlock(blockEl, false);
  }

  return null;
};

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

const extractBlock = (blockEl: HTMLElement): Block | null => {
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

  const heading = blockEl.querySelector("h1, h2, h3");
  if (heading && isElement(heading)) {
    const level = heading.tagName === "H1" ? 1 : heading.tagName === "H2" ? 2 : 3;
    return {
      type: "heading",
      level,
      children: extractInlinesFromNode(heading)
    };
  }

  const codeEl = blockEl.querySelector("pre");
  if (codeEl) {
    const language = detectCodeLanguage(codeEl, blockEl);
    return {
      type: "code",
      code: stripInvisibleChars(codeEl.textContent ?? ""),
      ...(language ? { language } : {})
    };
  }

  // Notion code blocks: no <pre>, uses class "notion-code-block"
  if (blockEl.classList.contains("notion-code-block")) {
    const contentEl = blockEl.querySelector<HTMLElement>(
      '[data-content-editable-leaf="true"]'
    );
    if (contentEl) {
      const language = detectCodeLanguage(contentEl, blockEl);
      const code = stripInvisibleChars(contentEl.textContent ?? "").replace(/\n+$/, "");
      return {
        type: "code",
        code,
        ...(language ? { language } : {}),
      };
    }
  }

  const quoteEl = blockEl.querySelector("blockquote");
  if (quoteEl && isElement(quoteEl)) {
    return {
      type: "quote",
      children: extractInlinesFromNode(quoteEl)
    };
  }

  const dividerEl = blockEl.querySelector("hr");
  if (dividerEl) {
    return {
      type: "divider"
    };
  }

  const listEl = blockEl.querySelector("ul, ol");
  if (listEl && (listEl.tagName === "UL" || listEl.tagName === "OL")) {
    return extractListBlock(listEl as HTMLOListElement | HTMLUListElement);
  }

  const hintedListBlock = extractListItemBlockFromHint(blockEl);
  if (hintedListBlock) return hintedListBlock;

  const calloutBlock = extractCalloutBlock(blockEl);
  if (calloutBlock) return calloutBlock;

  const imgEl = blockEl.querySelector("img");
  if (imgEl && imgEl.getAttribute("src")) {
    return {
      type: "image",
      src: imgEl.getAttribute("src") ?? "",
      alt: imgEl.getAttribute("alt") ?? undefined
    };
  }

  const text = blockEl.textContent ?? "";
  if (!text.trim()) return null;

  return {
    type: "paragraph",
    children: extractInlinesFromNode(blockEl)
  };
};

export const extractDocFromNotion = (): Doc => {
  const root =
    document.querySelector(".notion-page-content") ??
    document.querySelector('[class*="notion-page-content"]') ??
    document.body;

  const blocks = getBlockElements(root).map(extractBlock).filter((block): block is Block => Boolean(block));
  const mergedBlocks = mergeAdjacentCodeBlocks(mergeAdjacentLists(blocks));

  return {
    blocks: mergedBlocks
  };
};
