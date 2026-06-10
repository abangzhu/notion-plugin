export type ThemeColors = {
  text: string;
  subText: string;
  border: string;
  divider: string;
  codeBg: string;
  inlineCodeBg: string;
  link: string;
};

export type Typography = {
  bodySize: string;
  bodyLineHeight: string;
  bodyMarginBottom: string;
  headingWeight: string;
  bodyWeight: string;
  letterSpacing?: string;
};

// 标题装饰类型 —— 把 default/notion + 旧四主题的 heading if-else 收敛为可配置风格。
// matcha/academia/bento 的标题带背景块/边框等复杂装饰，保留各自 renderer 分支，不走 token。
export type HeadingDecoration =
  | "none" // 纯文字
  | "underline" // 下边框
  | "sidebar"; // 左侧竖条

export type HeadingLevelStyle = {
  decoration: HeadingDecoration;
  scale: number; // 相对 bodySize 的字号倍率
  lineHeight: string; // 无单位行高，如 "1.5"
  marginTopEm: number; // 上边距（以 bodySize 为单位的倍率）
  marginBottomEm: number; // 下边距（同上）
  weight?: string; // 缺省回退 typography.headingWeight
  align?: "left" | "center"; // 默认 left
  fitContent?: boolean; // width:fit-content（装饰仅包裹文字宽度）
  colorKey?: "text" | "link" | "subText"; // 文字取色来源，默认 text
  accentColorKey?: "link" | "border"; // 装饰（下边框/竖条）取色来源，默认 link
};

export type HeadingStyleScale = {
  h1: HeadingLevelStyle;
  h2: HeadingLevelStyle;
  h3: HeadingLevelStyle;
};

// 与 themeId 无关的风格 token：把"颜色/字号之外的风格决策"集中为配置
export type StyleTokens = {
  radiusSm: string; // 行内 code 等小元素圆角
  radiusMd: string; // callout / 代码块 / 图片圆角
  codeMargin: string; // 代码块上下外边距（统一左右对齐）
  calloutBg?: string; // callout 专用底色（与 codeBg 区分），缺省回退 codeBg
  accentOnBold: boolean; // 是否让加粗整体染强调色（默认 false）
  showTitleHeader: boolean; // 是否渲染基于 Doc.title 的标题区
  quoteVariant: "default" | "card"; // 引用渲染变体（card = 金句卡）
  headings: HeadingStyleScale;
};

export type RenderOptions = {
  fontStack: string;
  colors: ThemeColors;
  typography: Typography;
  themeId?: string;
  style: StyleTokens;
};

export const FONT_STACK_DEFAULT =
  "Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, 'PingFang SC', Cambria, Cochin, Georgia, Times, 'Times New Roman', serif";

export const FONT_STACK_PINGFANG =
  "PingFangSC-light, PingFangTC-light, 'PingFang SC', Optima-Regular, Optima, Cambria, Cochin, Georgia, Times, 'Times New Roman', serif";

export const FONT_STACK_HELVETICA =
  "Helvetica, 'Helvetica Neue', Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, 'PingFang SC', Cambria, Cochin, Georgia, Times, 'Times New Roman', serif";

export const DEFAULT_COLORS: ThemeColors = {
  text: "#222",
  subText: "#555",
  border: "#ddd",
  divider: "#eee",
  codeBg: "#f6f6f6",
  inlineCodeBg: "#f2f2f2",
  link: "#2563eb"
};

export const DEFAULT_TYPO: Typography = {
  bodySize: "15px",
  bodyLineHeight: "26px",
  bodyMarginBottom: "10px",
  headingWeight: "600",
  bodyWeight: "400",
  letterSpacing: "0.02em"
};

// 默认风格 token —— 复刻 default 主题现状（heading 字号/边距来自旧 renderer 逻辑）
export const DEFAULT_STYLE_TOKENS: StyleTokens = {
  radiusSm: "4px",
  radiusMd: "6px",
  codeMargin: "16px 0",
  accentOnBold: false,
  showTitleHeader: false,
  quoteVariant: "default",
  headings: {
    h1: { decoration: "none", scale: 1.6, lineHeight: "1.5", marginTopEm: 1.6, marginBottomEm: 0.9 },
    h2: { decoration: "none", scale: 1.33, lineHeight: "1.5", marginTopEm: 1.4, marginBottomEm: 0.8 },
    h3: { decoration: "none", scale: 1.13, lineHeight: "1.5", marginTopEm: 1.4, marginBottomEm: 0.8 }
  }
};

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  fontStack: FONT_STACK_DEFAULT,
  colors: DEFAULT_COLORS,
  typography: DEFAULT_TYPO,
  themeId: "default",
  style: DEFAULT_STYLE_TOKENS
};

export type CodeHighlightColors = {
  keyword: string;
  builtIn: string;
  type: string;
  literal: string;
  number: string;
  string: string;
  regexp: string;
  symbol: string;
  variable: string;
  function: string;
  params: string;
  comment: string;
  doctag: string;
  meta: string;
  attr: string;
  tag: string;
  property: string;
  addition: string;
  deletion: string;
  operator: string;
  punctuation: string;
};

const CODE_COLORS_DARK: CodeHighlightColors = {
  keyword: "#ff7b72",
  builtIn: "#79c0ff",
  type: "#ffa657",
  literal: "#79c0ff",
  number: "#79c0ff",
  string: "#a5d6ff",
  regexp: "#7ee787",
  symbol: "#ffa657",
  variable: "#ffa657",
  function: "#d2a8ff",
  params: "#c9d1d9",
  comment: "#8b949e",
  doctag: "#8b949e",
  meta: "#79c0ff",
  attr: "#79c0ff",
  tag: "#7ee787",
  property: "#79c0ff",
  addition: "#aff5b4",
  deletion: "#ffa198",
  operator: "#ff7b72",
  punctuation: "#c9d1d9"
};

const CODE_COLORS_LIGHT: CodeHighlightColors = {
  keyword: "#cf222e",
  builtIn: "#0550ae",
  type: "#953800",
  literal: "#0550ae",
  number: "#0550ae",
  string: "#0a3069",
  regexp: "#116329",
  symbol: "#953800",
  variable: "#953800",
  function: "#8250df",
  params: "#24292f",
  comment: "#6e7781",
  doctag: "#6e7781",
  meta: "#0550ae",
  attr: "#0550ae",
  tag: "#116329",
  property: "#0550ae",
  addition: "#116329",
  deletion: "#82071e",
  operator: "#cf222e",
  punctuation: "#24292f"
};

export const getCodeHighlightColors = (themeId?: string): CodeHighlightColors =>
  themeId === "red" ||
  themeId === "notion" ||
  themeId === "matcha" ||
  themeId === "academia" ||
  themeId === "bento"
    ? CODE_COLORS_LIGHT
    : CODE_COLORS_DARK;

// 各主题对默认 token 的覆盖。
// - notion/matcha/academia/bento 的 heading 保留各自 renderer 分支（不在此配置 headings）。
// - red/blue/black/sspai 的 heading 改造为标准 underline/sidebar/居中风格，由此驱动。
export const STYLE_TOKENS_BY_THEME: Record<string, Partial<StyleTokens>> = {
  notion: { calloutBg: "#f1f0ec" },
  academia: { showTitleHeader: true },
  bento: { showTitleHeader: true },
  red: {
    quoteVariant: "card",
    headings: {
      h1: { decoration: "underline", scale: 1.6, lineHeight: "1.5", marginTopEm: 0, marginBottomEm: 2.6, weight: "700", align: "center", fitContent: true, colorKey: "link", accentColorKey: "link" },
      h2: { decoration: "sidebar", scale: 1.33, lineHeight: "1.5", marginTopEm: 2.4, marginBottomEm: 1.2, weight: "700", accentColorKey: "link" },
      h3: { decoration: "sidebar", scale: 1.13, lineHeight: "1.5", marginTopEm: 2.0, marginBottomEm: 1.0, weight: "700", accentColorKey: "link" }
    }
  },
  blue: {
    headings: {
      h1: { decoration: "underline", scale: 1.6, lineHeight: "1.5", marginTopEm: 0, marginBottomEm: 2.6, weight: "700", align: "center", fitContent: true, colorKey: "link", accentColorKey: "link" },
      h2: { decoration: "sidebar", scale: 1.33, lineHeight: "1.5", marginTopEm: 2.4, marginBottomEm: 1.2, weight: "700", accentColorKey: "link" },
      h3: { decoration: "sidebar", scale: 1.13, lineHeight: "1.5", marginTopEm: 2.0, marginBottomEm: 1.0, weight: "700", accentColorKey: "link" }
    }
  },
  black: {
    headings: {
      h1: { decoration: "underline", scale: 1.6, lineHeight: "1.5", marginTopEm: 0, marginBottomEm: 2.6, weight: "700", align: "center", fitContent: true, colorKey: "text", accentColorKey: "link" },
      h2: { decoration: "none", scale: 1.33, lineHeight: "1.5", marginTopEm: 2.4, marginBottomEm: 1.2, weight: "700", align: "center", fitContent: true, colorKey: "text" },
      h3: { decoration: "sidebar", scale: 1.13, lineHeight: "1.5", marginTopEm: 2.0, marginBottomEm: 1.0, weight: "700", colorKey: "text", accentColorKey: "link" }
    }
  },
  sspai: {
    quoteVariant: "card",
    headings: {
      h1: { decoration: "sidebar", scale: 1.6, lineHeight: "1.5", marginTopEm: 0, marginBottomEm: 2.6, weight: "700", colorKey: "text", accentColorKey: "link" },
      h2: { decoration: "none", scale: 1.33, lineHeight: "1.5", marginTopEm: 2.4, marginBottomEm: 1.2, weight: "700", colorKey: "text", fitContent: true },
      h3: { decoration: "none", scale: 1.13, lineHeight: "1.5", marginTopEm: 2.0, marginBottomEm: 1.0, weight: "700", colorKey: "text", fitContent: true }
    }
  }
};

// 不可变合并：override > 主题覆盖 > 默认；headings 整体替换（不深合并）
export const mergeStyleTokens = (themeId?: string, override?: Partial<StyleTokens>): StyleTokens => {
  const themeOverride = themeId ? STYLE_TOKENS_BY_THEME[themeId] ?? {} : {};
  return {
    ...DEFAULT_STYLE_TOKENS,
    ...themeOverride,
    ...(override ?? {}),
    headings: override?.headings ?? themeOverride.headings ?? DEFAULT_STYLE_TOKENS.headings
  };
};

export const mergeRenderOptions = (overrides?: Partial<RenderOptions>): RenderOptions => {
  if (!overrides) return DEFAULT_RENDER_OPTIONS;
  const themeId = overrides.themeId ?? DEFAULT_RENDER_OPTIONS.themeId;
  return {
    fontStack: overrides.fontStack ?? DEFAULT_RENDER_OPTIONS.fontStack,
    colors: { ...DEFAULT_RENDER_OPTIONS.colors, ...(overrides.colors ?? {}) },
    typography: { ...DEFAULT_RENDER_OPTIONS.typography, ...(overrides.typography ?? {}) },
    themeId,
    style: mergeStyleTokens(themeId, overrides.style)
  };
};
