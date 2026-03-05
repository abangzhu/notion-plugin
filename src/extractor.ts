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

const extractBlock = (blockEl: HTMLElement): Block | null => {
  const tableEl = blockEl.querySelector("table");
  if (tableEl) {
    const rows: TableRow[] = Array.from(tableEl.querySelectorAll("tr")).map((row) => {
      const cells = Array.from(row.querySelectorAll("td, th")).map((cell) => ({
        children: extractInlinesFromNodes(Array.from(cell.childNodes))
      }));
      return { cells };
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

  const calloutBlock = extractCalloutBlock(blockEl);
  if (calloutBlock) return calloutBlock;

  const codeEl = blockEl.querySelector("pre");
  if (codeEl) {
    return {
      type: "code",
      code: codeEl.textContent ?? ""
    };
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

  return {
    blocks
  };
};
