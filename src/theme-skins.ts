// 主题"皮肤"：把每套现代主题的结构差异（标题、引用、卡片、分隔线、表格、图片……）
// 声明为可组合的变体，而不是只换颜色。渲染逻辑见 renderer-skin.ts。
// 约束：只用公众号可保留的内联样式（不用 flex / box-shadow / svg / 定位），文本统一包在 span[leaf] 内。

export type SkinTitle = "plain" | "center" | "rule" | "bar";
export type SkinH2 = "underline" | "number" | "pill" | "ornament" | "marker" | "block" | "badge" | "rule";
export type SkinH3 = "plain" | "accent" | "dot" | "hash" | "sidebar";
export type SkinQuote = "line" | "mark" | "frame" | "tint";
export type SkinCallout = "tint" | "outline" | "left";
export type SkinEmphasis = "card" | "center" | "outline" | "bar";
export type SkinDivider = "line" | "dashed" | "dots" | "ornament" | "bar";
export type SkinImage = "plain" | "rounded" | "frame";
export type SkinStrong = "weight" | "accent" | "marker";
export type SkinCode = "light" | "dark";
export type SkinTable = "line" | "tint" | "solid";
export type SkinSteps = "circle" | "square" | "numeral";

export type ThemeSkin = {
  title: SkinTitle;
  h2: SkinH2;
  h3: SkinH3;
  quote: SkinQuote;
  callout: SkinCallout;
  emphasis: SkinEmphasis;
  divider: SkinDivider;
  image: SkinImage;
  strong: SkinStrong;
  code: SkinCode;
  table: SkinTable;
  steps: SkinSteps;
  tint: string; // 浅强调底色：卡片、表头、标题块
  marker: string; // 荧光笔色
  onAccent: string; // 强调色块上的文字色
  radius: string; // 卡片 / 图片圆角
  headingFont?: string; // 标题字体（如衬线），缺省跟随正文字体
  numeralFont?: string; // 章节序号字体
  justify?: boolean; // 正文两端对齐
  listAccent?: boolean; // 列表符号染强调色
};

export const SERIF_STACK =
  "'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', 'STSong', Georgia, 'Times New Roman', serif";
export const NUMERAL_SERIF = "Didot, 'Bodoni 72', 'Times New Roman', Georgia, serif";
export const NUMERAL_SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export const THEME_SKINS: Record<string, ThemeSkin> = {
  // 简约白：大留白、细下划线标题、圆角浅灰卡片、点状分隔
  apple: {
    title: "plain", h2: "underline", h3: "plain", quote: "line", callout: "tint", emphasis: "card",
    divider: "dots", image: "rounded", strong: "weight", code: "light", table: "line", steps: "circle",
    tint: "#f5f5f7", marker: "#dbeafe", onAccent: "#ffffff", radius: "12px", listAccent: true
  },
  // 杂志：衬线标题、大号章节序号、首尾细线、装饰分隔、两端对齐
  magazine: {
    title: "center", h2: "number", h3: "accent", quote: "mark", callout: "left", emphasis: "center",
    divider: "ornament", image: "plain", strong: "accent", code: "light", table: "line", steps: "numeral",
    tint: "#f7f1ec", marker: "#f6dcd5", onAccent: "#ffffff", radius: "2px",
    headingFont: SERIF_STACK, numeralFont: NUMERAL_SERIF, justify: true, listAccent: true
  },
  // 极客蓝：胶囊标题、# 小标题、深色代码窗、描边提示、实色表头
  tech: {
    title: "bar", h2: "pill", h3: "hash", quote: "tint", callout: "outline", emphasis: "outline",
    divider: "dashed", image: "rounded", strong: "accent", code: "dark", table: "solid", steps: "square",
    tint: "#eff6ff", marker: "#dbeafe", onAccent: "#ffffff", radius: "6px",
    numeralFont: NUMERAL_SANS, listAccent: true
  },
  // 暖纸：居中衬线标题与花饰、框线引用、相框图片、舒展行距
  paper: {
    title: "center", h2: "ornament", h3: "accent", quote: "frame", callout: "tint", emphasis: "center",
    divider: "ornament", image: "frame", strong: "weight", code: "light", table: "tint", steps: "numeral",
    tint: "#f6efe3", marker: "#f3e2c4", onAccent: "#ffffff", radius: "4px",
    headingFont: SERIF_STACK, numeralFont: NUMERAL_SERIF, justify: true, listAccent: true
  },
  // 荧光笔：标题与加粗都带荧光笔底色，圆润卡片，粗短分隔条
  vivid: {
    title: "plain", h2: "marker", h3: "dot", quote: "tint", callout: "tint", emphasis: "outline",
    divider: "bar", image: "rounded", strong: "marker", code: "light", table: "tint", steps: "circle",
    tint: "#fff4e8", marker: "#ffe08a", onAccent: "#ffffff", radius: "14px", listAccent: true
  },
  // 雾蓝：整行色块标题、竖条小标题、柔和底色卡片
  mist: {
    title: "bar", h2: "block", h3: "sidebar", quote: "line", callout: "outline", emphasis: "card",
    divider: "line", image: "rounded", strong: "accent", code: "light", table: "tint", steps: "circle",
    tint: "#edf4f8", marker: "#d7e8f2", onAccent: "#ffffff", radius: "8px", listAccent: true
  },
  // 包豪斯：实色方块序号、粗竖条、直角、实色表头
  bauhaus: {
    title: "rule", h2: "badge", h3: "sidebar", quote: "mark", callout: "left", emphasis: "bar",
    divider: "bar", image: "plain", strong: "weight", code: "light", table: "solid", steps: "square",
    tint: "#f7f4ee", marker: "#f6d6cf", onAccent: "#ffffff", radius: "0",
    numeralFont: NUMERAL_SANS, listAccent: true
  },
  // 瑞士网格：粗顶线分区、序号 + 大字标题、黑白秩序配一点红
  swiss: {
    title: "rule", h2: "rule", h3: "plain", quote: "line", callout: "outline", emphasis: "bar",
    divider: "line", image: "plain", strong: "weight", code: "light", table: "line", steps: "numeral",
    tint: "#f4f4f4", marker: "#fde2e2", onAccent: "#ffffff", radius: "0",
    numeralFont: NUMERAL_SANS
  }
};
