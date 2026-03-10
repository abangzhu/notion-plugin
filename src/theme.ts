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

export type RenderOptions = {
  fontStack: string;
  colors: ThemeColors;
  typography: Typography;
  themeId?: string;
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
  letterSpacing: "0.1em"
};

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  fontStack: FONT_STACK_DEFAULT,
  colors: DEFAULT_COLORS,
  typography: DEFAULT_TYPO,
  themeId: "default"
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
  themeId === "red" ? CODE_COLORS_LIGHT : CODE_COLORS_DARK;

export const mergeRenderOptions = (overrides?: Partial<RenderOptions>): RenderOptions => {
  if (!overrides) return DEFAULT_RENDER_OPTIONS;
  return {
    fontStack: overrides.fontStack ?? DEFAULT_RENDER_OPTIONS.fontStack,
    colors: { ...DEFAULT_RENDER_OPTIONS.colors, ...(overrides.colors ?? {}) },
    typography: { ...DEFAULT_RENDER_OPTIONS.typography, ...(overrides.typography ?? {}) },
    themeId: overrides.themeId ?? DEFAULT_RENDER_OPTIONS.themeId
  };
};
