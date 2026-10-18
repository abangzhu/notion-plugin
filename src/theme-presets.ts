import type { ThemeColors, Typography } from "./theme";

export type ThemePreset = {
  id: string;
  label: string;
  description?: string;
  colors: Partial<ThemeColors>;
  typography?: Partial<Typography>;
};

export const MODERN_THEME_PRESETS: ThemePreset[] = [
  { id: "apple", label: "苹果白", description: "大留白 · 清晰字阶 · 轻盈圆角",
    colors: { text: "#1d1d1f", subText: "#6e6e73", link: "#0066cc", border: "#d2d2d7", divider: "#e5e5ea", codeBg: "#f5f5f7", inlineCodeBg: "#eeeef0" } },
  { id: "bauhaus", label: "包豪斯", description: "几何竖线 · 黑红对比 · 利落直角",
    colors: { text: "#202020", subText: "#68635f", link: "#b43224", border: "#b43224", divider: "#e7e2da", codeBg: "#f7f4ee", inlineCodeBg: "#eee9df" }, typography: { headingWeight: "700", letterSpacing: "0" } },
  { id: "swiss", label: "瑞士网格", description: "大字标题 · 细线分区 · 黑白秩序",
    colors: { text: "#171717", subText: "#666666", link: "#333333", border: "#a3a3a3", divider: "#dedede", codeBg: "#f5f5f5", inlineCodeBg: "#ebebeb" }, typography: { headingWeight: "700", letterSpacing: "0" } },
  { id: "paper", label: "暖纸", description: "暖灰棕色 · 舒展行距 · 细腻质感",
    colors: { text: "#39342e", subText: "#766b5e", link: "#88613d", border: "#d5c9b7", divider: "#e9e1d5", codeBg: "#f8f4ed", inlineCodeBg: "#eee7db" }, typography: { bodyLineHeight: "1.9" } },
  { id: "mist", label: "雾蓝", description: "冷蓝层级 · 柔和底色 · 技术与长文",
    colors: { text: "#243746", subText: "#607584", link: "#326589", border: "#c4d5e0", divider: "#e0e9ef", codeBg: "#f2f6f9", inlineCodeBg: "#e5edf3" } }
];

export const THEME_PRESETS: ThemePreset[] = [
  ...MODERN_THEME_PRESETS,
  { id: "default", label: "默认主题", colors: {}, typography: { letterSpacing: "0.02em" } },
  {
    id: "notion",
    label: "Notion 白",
    colors: {
      text: "#2f3437",
      subText: "#6b6f72",
      link: "#0f6bff",
      border: "#d9d9d6",
      divider: "#e9e9e7",
      codeBg: "#f7f6f3",
      inlineCodeBg: "#efefed"
    },
    typography: {
      bodySize: "15px",
      bodyLineHeight: "27px",
      bodyMarginBottom: "12px",
      headingWeight: "700",
      letterSpacing: "0"
    }
  },
  {
    id: "matcha",
    label: "抹茶计划",
    colors: {
      text: "#263229",
      subText: "#657368",
      link: "#4d7c59",
      border: "#b9d4b8",
      divider: "#dbe8d8",
      codeBg: "#f2f8ef",
      inlineCodeBg: "#e7f1e3"
    },
    typography: {
      bodySize: "15px",
      bodyLineHeight: "28px",
      bodyMarginBottom: "12px",
      headingWeight: "700",
      letterSpacing: "0.03em"
    }
  },
  {
    id: "academia",
    label: "学院档案",
    colors: {
      text: "#372f27",
      subText: "#786a5d",
      link: "#8a5a2b",
      border: "#c8ac7a",
      divider: "#eadcc5",
      codeBg: "#f8f1e6",
      inlineCodeBg: "#efe3d0"
    },
    typography: {
      bodySize: "15px",
      bodyLineHeight: "28px",
      bodyMarginBottom: "12px",
      headingWeight: "700",
      letterSpacing: "0.04em"
    }
  },
  {
    id: "bento",
    label: "Bento OS",
    colors: {
      text: "#172033",
      subText: "#647086",
      link: "#2563eb",
      border: "#cbd5e1",
      divider: "#e2e8f0",
      codeBg: "#f8fafc",
      inlineCodeBg: "#eef2ff"
    },
    typography: {
      bodySize: "15px",
      bodyLineHeight: "27px",
      bodyMarginBottom: "11px",
      headingWeight: "700",
      letterSpacing: "0"
    }
  },
  {
    id: "red",
    label: "活力橙",
    colors: {
      text: "#3f3f3f",
      subText: "#808a87",
      link: "#fc7930",
      border: "#f7cfba",
      divider: "#f0d9cc"
    },
    typography: {
      bodySize: "15px",
      bodyLineHeight: "26px",
      bodyMarginBottom: "10px",
      headingWeight: "700",
      letterSpacing: "0.02em"
    }
  },
  {
    id: "blue",
    label: "海蓝色",
    colors: {
      text: "#3f3f3f",
      subText: "#808a87",
      link: "#5296d4",
      border: "#c3d7df",
      divider: "#cfe0ea"
    },
    typography: {
      letterSpacing: "0.02em"
    }
  },
  {
    id: "black",
    label: "科技黑",
    colors: {
      text: "#1a1a1a",
      subText: "#57606a",
      link: "#c8472b",
      border: "#1a1a1a",
      divider: "#d9d9d9"
    }
  },
  {
    id: "sspai",
    label: "魔力红",
    colors: {
      text: "#3f3f3f",
      subText: "#8c8c8c",
      link: "#f22f27",
      border: "#f22f27",
      divider: "#f0d2d0"
    },
    typography: {
      bodyLineHeight: "28px"
    }
  }
];
