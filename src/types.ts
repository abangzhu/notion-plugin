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
  | TableBlock
  | EmphasisBlock
  | StepsBlock;

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
  // "card" 触发金句卡渲染（单块级别）；缺省时回退主题级 StyleTokens.quoteVariant
  variant?: "card";
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

// 重点/强调卡片：醒目色块，用于突出核心结论段（比 callout 更强、比金句卡更段落化）
export type EmphasisBlock = {
  type: "emphasis";
  children: Inline[];
};

// 步骤/序号卡：把连续的流程性内容折叠成带序号徽标的卡片
export type StepsBlock = {
  type: "steps";
  ordered: boolean;
  items: StepItem[];
};

export type StepItem = {
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
