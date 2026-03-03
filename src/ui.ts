import { extractDocFromNotion } from "./extractor";
import { renderDocToHtml, renderDocToText } from "./renderer";
import { writeClipboard } from "./clipboard";
import {
  DEFAULT_COLORS,
  DEFAULT_TYPO,
  FONT_STACK_DEFAULT,
  FONT_STACK_HELVETICA,
  FONT_STACK_PINGFANG
} from "./theme";
import type { RenderOptions, ThemeColors, Typography } from "./theme";

const DRAWER_ID = "__notion_wechat_drawer";
const DRAWER_STYLE_ID = "__notion_wechat_drawer_style";
const ACCENT = "#10b981";

type ThemePreset = {
  id: string;
  label: string;
  colors: Partial<ThemeColors>;
  typography?: Partial<Typography>;
};

type FontPreset = {
  id: string;
  label: string;
  stack: string;
};

const THEME_PRESETS: ThemePreset[] = [
  { id: "default", label: "默认主题", colors: {}, typography: { letterSpacing: "0.1em" } },
  {
    id: "red",
    label: "菠萝红",
    colors: {
      text: "#3f3f3f",
      subText: "#808a87",
      link: "#fc7930",
      border: "#f7cfba",
      divider: "#797979"
    },
    typography: {
      bodySize: "15px",
      bodyLineHeight: "26px",
      bodyMarginBottom: "10px",
      headingWeight: "700",
      letterSpacing: "0.1em"
    }
  },
  { id: "blue", label: "简约蓝", colors: { link: "#2563eb", border: "#bfd2ff", divider: "#dbe5ff" } },
  { id: "black", label: "科技黑", colors: { link: "#111827", border: "#111827", divider: "#111827" } },
  { id: "sspai", label: "少数派", colors: { link: "#16a34a", border: "#86efac", divider: "#dcfce7" } }
];

const FONT_PRESETS: FontPreset[] = [
  { id: "default", label: "默认字体", stack: FONT_STACK_DEFAULT },
  { id: "pingfang", label: "苹方", stack: FONT_STACK_PINGFANG },
  { id: "helvetica", label: "Helvetica", stack: FONT_STACK_HELVETICA }
];

const createButton = (label: string, variant: "ghost" | "primary" = "ghost"): HTMLButtonElement => {
  const button = document.createElement("button");
  button.textContent = label;
  button.style.border = variant === "primary" ? `1px solid ${ACCENT}` : "1px solid #e5e7eb";
  button.style.background = variant === "primary" ? ACCENT : "#fff";
  button.style.color = variant === "primary" ? "#fff" : "#111827";
  button.style.borderRadius = "10px";
  button.style.padding = "8px 12px";
  button.style.fontSize = "12px";
  button.style.cursor = "pointer";
  button.style.fontWeight = "600";
  return button;
};

const applySegmentStyle = (button: HTMLButtonElement, active: boolean) => {
  button.style.border = "1px solid #e5e7eb";
  button.style.background = active ? ACCENT : "#fff";
  button.style.color = active ? "#fff" : "#111827";
};

const createSegment = (label: string, active = false): HTMLButtonElement => {
  const button = document.createElement("button");
  button.textContent = label;
  button.style.padding = "8px 14px";
  button.style.fontSize = "12px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
  button.style.borderRadius = "10px";
  applySegmentStyle(button, active);
  return button;
};

const ensureDrawerStyles = () => {
  if (document.getElementById(DRAWER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = DRAWER_STYLE_ID;
  style.textContent = `
@keyframes sliceIn {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes sliceOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(24px); opacity: 0; }
}
`;
  document.head.appendChild(style);
};

const createDrawer = () => {
  ensureDrawerStyles();
  const container = document.createElement("div");
  container.id = DRAWER_ID;
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.right = "0";
  container.style.height = "100vh";
  container.style.width = "520px";
  container.style.zIndex = "2147483647";
  container.style.background = "#f5f5f5";
  container.style.boxShadow = "-4px 0 20px rgba(0,0,0,0.12)";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.fontFamily = FONT_STACK_DEFAULT;
  container.style.animation = "0.3s ease-in-out 0s 1 normal none running sliceIn";

  const toolbar = document.createElement("div");
  toolbar.style.padding = "16px";
  toolbar.style.background = "#ffffff";
  toolbar.style.borderBottom = "1px solid #ededed";
  toolbar.style.display = "flex";
  toolbar.style.flexDirection = "column";
  toolbar.style.gap = "12px";

  const rowTop = document.createElement("div");
  rowTop.style.display = "flex";
  rowTop.style.alignItems = "center";
  rowTop.style.gap = "12px";

  const themeWrapper = document.createElement("div");
  themeWrapper.style.position = "relative";

  const themeButton = document.createElement("button");
  themeButton.style.border = `2px solid ${ACCENT}`;
  themeButton.style.background = "#fff";
  themeButton.style.borderRadius = "14px";
  themeButton.style.padding = "8px 14px";
  themeButton.style.fontSize = "13px";
  themeButton.style.fontWeight = "700";
  themeButton.style.cursor = "pointer";

  const themeMenu = document.createElement("div");
  themeMenu.style.position = "absolute";
  themeMenu.style.top = "46px";
  themeMenu.style.left = "0";
  themeMenu.style.width = "180px";
  themeMenu.style.background = "#fff";
  themeMenu.style.borderRadius = "14px";
  themeMenu.style.boxShadow = "0 18px 30px rgba(0,0,0,0.15)";
  themeMenu.style.border = "1px solid #eee";
  themeMenu.style.padding = "8px";
  themeMenu.style.display = "none";
  themeMenu.style.zIndex = "10";

  themeWrapper.appendChild(themeButton);
  themeWrapper.appendChild(themeMenu);

  const fontSegment = document.createElement("div");
  fontSegment.style.display = "flex";
  fontSegment.style.gap = "6px";
  fontSegment.style.padding = "4px";
  fontSegment.style.border = "1px solid #e5e7eb";
  fontSegment.style.borderRadius = "14px";
  fontSegment.style.background = "#fff";

  const fontButtons = FONT_PRESETS.map((font, index) => {
    const button = createSegment(font.label, index === 0);
    fontSegment.appendChild(button);
    return { font, button };
  });

  const sizeControl = document.createElement("div");
  sizeControl.style.display = "flex";
  sizeControl.style.gap = "8px";

  const sizeDown = createButton("A-", "ghost");
  const sizeUp = createButton("A+", "ghost");
  sizeDown.style.width = "44px";
  sizeUp.style.width = "44px";
  sizeDown.style.fontWeight = "700";
  sizeUp.style.fontWeight = "700";

  sizeControl.appendChild(sizeDown);
  sizeControl.appendChild(sizeUp);

  rowTop.appendChild(themeWrapper);
  rowTop.appendChild(fontSegment);
  rowTop.appendChild(sizeControl);

  const rowBottom = document.createElement("div");
  rowBottom.style.display = "flex";
  rowBottom.style.alignItems = "center";
  rowBottom.style.justifyContent = "space-between";

  const status = document.createElement("div");
  status.style.fontSize = "12px";
  status.style.color = "#6b7280";
  status.textContent = "";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.alignItems = "center";
  actions.style.gap = "8px";

  const refreshButton = createButton("刷新", "ghost");
  const copyAllButton = createButton("复制全文", "primary");

  actions.appendChild(refreshButton);
  actions.appendChild(copyAllButton);

  rowBottom.appendChild(status);
  rowBottom.appendChild(actions);

  toolbar.appendChild(rowTop);
  toolbar.appendChild(rowBottom);

  const previewScroll = document.createElement("div");
  previewScroll.style.flex = "1";
  previewScroll.style.overflowY = "auto";
  previewScroll.style.padding = "22px";
  previewScroll.style.background = "#f3f4f6";

  const previewPage = document.createElement("div");
  previewPage.style.background = "#fff";
  previewPage.style.borderRadius = "14px";
  previewPage.style.padding = "22px";
  previewPage.style.boxShadow = "0 10px 30px rgba(0,0,0,0.08)";
  previewPage.style.minHeight = "60vh";

  previewScroll.appendChild(previewPage);

  container.appendChild(toolbar);
  container.appendChild(previewScroll);

  return {
    container,
    previewPage,
    status,
    themeButton,
    themeMenu,
    themeWrapper,
    fontButtons,
    sizeDown,
    sizeUp,
    refreshButton,
    copyAllButton
  };
};

export const initDrawer = () => {
  let drawer = document.getElementById(DRAWER_ID) as HTMLElement | null;
  let previewPage: HTMLElement | null = null;
  let status: HTMLElement | null = null;
  let lastHtml = "";
  let lastText = "";
  let outsideListenerAttached = false;
  let closing = false;

  let currentTheme = THEME_PRESETS[0];
  let currentFont = FONT_PRESETS[0];
  let fontScale = 1;

  const setStatus = (message: string, tone: "info" | "success" | "error" = "info") => {
    if (!status) return;
    status.textContent = message;
    status.style.color = tone === "success" ? "#047857" : tone === "error" ? "#b91c1c" : "#6b7280";
  };

  const computeTypography = (): Typography => {
    const themeTypography = { ...DEFAULT_TYPO, ...(currentTheme.typography ?? {}) };
    const baseSize = Number.parseFloat(themeTypography.bodySize) || 16;
    const scaledSize = Math.max(14, Math.min(18, Math.round(baseSize * fontScale)));

    const baseLineHeight = themeTypography.bodyLineHeight;
    let lineHeight = baseLineHeight;
    if (baseLineHeight.endsWith("px")) {
      const lhPx = Number.parseFloat(baseLineHeight);
      if (lhPx) {
        const ratio = lhPx / baseSize;
        lineHeight = `${Math.round(scaledSize * ratio)}px`;
      }
    }

    const baseMargin = themeTypography.bodyMarginBottom;
    let marginBottom = baseMargin;
    if (baseMargin.endsWith("px")) {
      const marginPx = Number.parseFloat(baseMargin);
      if (marginPx) {
        const ratio = marginPx / baseSize;
        marginBottom = `${Math.round(scaledSize * ratio)}px`;
      }
    }

    return {
      ...themeTypography,
      bodySize: `${scaledSize}px`,
      bodyLineHeight: lineHeight,
      bodyMarginBottom: marginBottom
    };
  };

  const buildRenderOptions = (): Partial<RenderOptions> => {
    return {
      themeId: currentTheme.id,
      fontStack: currentFont.stack,
      colors: { ...DEFAULT_COLORS, ...currentTheme.colors },
      typography: computeTypography()
    };
  };

  const render = () => {
    const doc = extractDocFromNotion();
    lastHtml = renderDocToHtml(doc, buildRenderOptions());
    lastText = renderDocToText(doc);
    if (previewPage) {
      previewPage.innerHTML =
        lastHtml || "<p style=\"color:#9ca3af;font-size:13px;\">未检测到可用内容</p>";
    }
    setStatus("");
  };

  const closeDrawer = () => {
    if (!drawer || closing) return;
    closing = true;
    drawer.style.animation = "0.25s ease-in-out 0s 1 normal forwards running sliceOut";
    setTimeout(() => {
      drawer?.remove();
      drawer = null;
      previewPage = null;
      status = null;
      closing = false;
    }, 250);
  };

  const ensureDrawer = () => {
    if (drawer && previewPage && status) return;
    const created = createDrawer();
    drawer = created.container;
    previewPage = created.previewPage;
    status = created.status;

    const updateThemeButton = () => {
      created.themeButton.textContent = `${currentTheme.label} ▼`;
    };

    const updateFontButtons = () => {
      created.fontButtons.forEach(({ font, button }) => {
        applySegmentStyle(button, font.id === currentFont.id);
      });
    };

    updateThemeButton();
    updateFontButtons();

    created.themeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      created.themeMenu.style.display = created.themeMenu.style.display === "none" ? "block" : "none";
    });

    const themeItems: Array<{ preset: ThemePreset; item: HTMLDivElement }> = [];

    const updateThemeMenu = () => {
      themeItems.forEach(({ preset, item }) => {
        item.style.color = preset.id === currentTheme.id ? ACCENT : "#111827";
      });
    };

    THEME_PRESETS.forEach((preset) => {
      const item = document.createElement("div");
      item.textContent = preset.label;
      item.style.padding = "10px 12px";
      item.style.fontSize = "13px";
      item.style.borderRadius = "10px";
      item.style.cursor = "pointer";
      item.style.color = preset.id === currentTheme.id ? ACCENT : "#111827";
      item.addEventListener("mouseenter", () => {
        item.style.background = "#f3f4f6";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });
      item.addEventListener("click", () => {
        currentTheme = preset;
        updateThemeButton();
        updateThemeMenu();
        created.themeMenu.style.display = "none";
        render();
      });
      created.themeMenu.appendChild(item);
      themeItems.push({ preset, item });
    });

    if (!outsideListenerAttached) {
      outsideListenerAttached = true;
      document.addEventListener("click", (event) => {
        const target = event.target as Node;
        if (!created.themeWrapper.contains(target)) {
          created.themeMenu.style.display = "none";
        }
        if (drawer && !drawer.contains(target)) {
          closeDrawer();
        }
      });
    }

    created.fontButtons.forEach(({ font, button }) => {
      button.addEventListener("click", () => {
        currentFont = font;
        updateFontButtons();
        render();
      });
    });

    created.sizeDown.addEventListener("click", () => {
      fontScale = Math.max(0.9, Math.round((fontScale - 0.05) * 100) / 100);
      render();
    });

    created.sizeUp.addEventListener("click", () => {
      fontScale = Math.min(1.15, Math.round((fontScale + 0.05) * 100) / 100);
      render();
    });

    created.refreshButton.addEventListener("click", () => {
      render();
    });

    created.copyAllButton.addEventListener("click", async () => {
      try {
        await writeClipboard(lastHtml, lastText);
        setStatus("已复制全文", "success");
      } catch (error) {
        setStatus("复制失败，请重试", "error");
      }
    });

    document.body.appendChild(drawer);
    render();
  };

  const toggleDrawer = () => {
    if (drawer) return closeDrawer();
    ensureDrawer();
  };

  return { toggleDrawer };
};
