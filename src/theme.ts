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

export const mergeRenderOptions = (overrides?: Partial<RenderOptions>): RenderOptions => {
  if (!overrides) return DEFAULT_RENDER_OPTIONS;
  return {
    fontStack: overrides.fontStack ?? DEFAULT_RENDER_OPTIONS.fontStack,
    colors: { ...DEFAULT_RENDER_OPTIONS.colors, ...(overrides.colors ?? {}) },
    typography: { ...DEFAULT_RENDER_OPTIONS.typography, ...(overrides.typography ?? {}) },
    themeId: overrides.themeId ?? DEFAULT_RENDER_OPTIONS.themeId
  };
};
