export type Doc = {
  title?: string;
  blocks: Block[];
};

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | QuoteBlock
  | CalloutBlock
  | DividerBlock
  | ImageBlock
  | CodeBlock
  | TableBlock;

export type HeadingBlock = {
  type: "heading";
  level: 1 | 2 | 3;
  children: Inline[];
};

export type ParagraphBlock = {
  type: "paragraph";
  children: Inline[];
};

export type QuoteBlock = {
  type: "quote";
  children: Inline[];
};

export type CalloutBlock = {
  type: "callout";
  icon?: string;
  children: Inline[];
};

export type DividerBlock = {
  type: "divider";
};

export type ImageBlock = {
  type: "image";
  src: string;
  alt?: string;
};

export type CodeBlock = {
  type: "code";
  code: string;
  language?: string;
};

export type TableBlock = {
  type: "table";
  rows: TableRow[];
};

export type TableRow = {
  cells: TableCell[];
  isHeader?: boolean;
};

export type TableCell = {
  children: Inline[];
};

export type ListBlock = {
  type: "list";
  ordered: boolean;
  items: ListItem[];
};

export type ListItem = {
  children: Inline[];
  nested?: ListBlock[];
};

export type Inline =
  | { type: "text"; content: string; color?: "accent" }
  | { type: "bold"; content: string; color?: "accent" }
  | { type: "italic"; content: string; color?: "accent" }
  | { type: "strikethrough"; content: string; color?: "accent" }
  | { type: "underline"; content: string; color?: "accent" }
  | { type: "highlight"; content: string; highlightColor: string }
  | { type: "code"; content: string }
  | { type: "link"; content: string; href: string };
