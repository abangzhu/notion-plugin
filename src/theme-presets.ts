import type { ThemeColors, Typography } from "./theme";

export type ThemePreset = {
  id: string;
  label: string;
  description?: string;
  colors: Partial<ThemeColors>;
  typography?: Partial<Typography>;
};

// 现代主题：每套都有独立的结构语言（见 theme-skins.ts），不只是换色
export const MODERN_THEME_PRESETS: ThemePreset[] = [
  { id: "apple", label: "简约白", description: "细线标题 · 圆角浅灰卡片 · 点状分隔，克制耐看",
    colors: { text: "#1d1d1f", subText: "#6e6e73", link: "#0071e3", border: "#d2d2d7", divider: "#e5e5ea", codeBg: "#f5f5f7", inlineCodeBg: "#eeeef0" } },
  { id: "magazine", label: "杂志", description: "衬线标题 · 大号章节序号 · 装饰分隔，适合深度长文",
    colors: { text: "#1f1f1f", subText: "#6b6460", link: "#a8322d", border: "#d9cfc7", divider: "#e8e2dc", codeBg: "#f7f4f1", inlineCodeBg: "#efe9e3" },
    typography: { bodyLineHeight: "1.85", letterSpacing: "0.02em" } },
  { id: "tech", label: "极客蓝", description: "胶囊标题 · # 小标题 · 深色代码窗，适合技术教程",
    colors: { text: "#1f2937", subText: "#6b7280", link: "#2563eb", border: "#bfdbfe", divider: "#e5e7eb", codeBg: "#f3f6fb", inlineCodeBg: "#e8eefb" },
    typography: { letterSpacing: "0.01em" } },
  { id: "paper", label: "暖纸文艺", description: "居中衬线标题 · 框线引用 · 相框图片，适合随笔书评",
    colors: { text: "#3b342c", subText: "#7a6e60", link: "#9c6b3f", border: "#d8c8b2", divider: "#e9dfd0", codeBg: "#f8f3ea", inlineCodeBg: "#efe6d8" },
    typography: { bodyLineHeight: "1.95", letterSpacing: "0.03em" } },
  { id: "vivid", label: "荧光笔", description: "荧光笔标题与重点 · 圆润卡片，活泼醒目",
    colors: { text: "#2b2b2b", subText: "#737373", link: "#ea580c", border: "#fed7aa", divider: "#f1e4d8", codeBg: "#fff7ed", inlineCodeBg: "#ffedd5" },
    typography: { letterSpacing: "0.02em" } },
  { id: "mist", label: "雾蓝", description: "整行色块标题 · 竖条小标题 · 柔和底色，适合报告周报",
    colors: { text: "#243746", subText: "#607584", link: "#2f6f8f", border: "#c4d5e0", divider: "#e0e9ef", codeBg: "#f2f6f9", inlineCodeBg: "#e5edf3" } },
  { id: "bauhaus", label: "包豪斯", description: "实色方块序号 · 粗竖条 · 直角，几何感强",
    colors: { text: "#202020", subText: "#68635f", link: "#c0392b", border: "#bdb6ad", divider: "#e7e2da", codeBg: "#f7f4ee", inlineCodeBg: "#eee9df" },
    typography: { headingWeight: "700", letterSpacing: "0" } },
  { id: "swiss", label: "瑞士网格", description: "粗顶线分区 · 序号大字标题 · 黑白配一点红",
    colors: { text: "#111111", subText: "#5f5f5f", link: "#d62828", border: "#bdbdbd", divider: "#dedede", codeBg: "#f5f5f5", inlineCodeBg: "#ebebeb" },
    typography: { headingWeight: "700", letterSpacing: "0" } }
];

export const MODERN_THEME_IDS = new Set(MODERN_THEME_PRESETS.map((preset) => preset.id));

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
