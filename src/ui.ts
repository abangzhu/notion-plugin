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
const IMG_BB_KEY = "imgbb_api_key";

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
    label: "活力橙",
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
  {
    id: "blue",
    label: "海蓝色",
    colors: {
      text: "#3f3f3f",
      subText: "#808a87",
      link: "#5296d4",
      border: "#c3d7df",
      divider: "#797979"
    }
  },
  {
    id: "black",
    label: "科技黑",
    colors: {
      text: "#3f3f3f",
      subText: "#3f3f3f",
      link: "#222222",
      border: "#222222",
      divider: "#797979"
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
      divider: "#f22f27"
    },
    typography: {
      bodyLineHeight: "1.75"
    }
  }
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
  container.style.width = "686px";
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
  rowBottom.style.justifyContent = "flex-start";

  const status = document.createElement("div");
  status.style.fontSize = "12px";
  status.style.color = "#6b7280";
  status.textContent = "";
  rowBottom.appendChild(status);

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

  const footer = document.createElement("div");
  footer.style.padding = "12px 16px";
  footer.style.background = "#ffffff";
  footer.style.borderTop = "1px solid #ededed";
  footer.style.display = "flex";
  footer.style.alignItems = "center";
  footer.style.gap = "12px";
  footer.style.justifyContent = "flex-start";

  const refreshButton = createButton("刷新", "ghost");
  const copyAllButton = createButton("复制为公众号格式", "primary");
  footer.appendChild(refreshButton);
  footer.appendChild(copyAllButton);

  container.appendChild(toolbar);
  container.appendChild(previewScroll);
  container.appendChild(footer);

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
  let cachedApiKey: string | null = null;

  const setStatus = (message: string, tone: "info" | "success" | "error" = "info") => {
    if (!status) return;
    status.textContent = message;
    status.style.color = tone === "success" ? "#047857" : tone === "error" ? "#b91c1c" : "#6b7280";
  };

  const getApiKey = async (): Promise<string | null> => {
    if (cachedApiKey) return cachedApiKey;
    return new Promise((resolve) => {
      chrome.storage.local.get([IMG_BB_KEY], (result) => {
        const key = (result[IMG_BB_KEY] as string | undefined)?.trim();
        cachedApiKey = key || null;
        resolve(cachedApiKey);
      });
    });
  };

  const setApiKey = async (value: string) =>
    new Promise<void>((resolve) => {
      cachedApiKey = value.trim() || null;
      chrome.storage.local.set({ [IMG_BB_KEY]: cachedApiKey }, () => resolve());
    });

  const ensureApiKey = async (): Promise<string | null> => {
    let key = await getApiKey();
    if (key) return key;
    const input = window.prompt("Enter ImgBB API key to upload images:");
    if (!input) return null;
    await setApiKey(input);
    return input.trim();
  };

  const uploadImage = (src: string, apiKey: string): Promise<string | null> =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "uploadImage", src, apiKey }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        if (response?.success && response?.url) {
          resolve(response.url as string);
          return;
        }
        resolve(null);
      });
    });

  const replaceImagesWithImgBB = async (html: string, apiKey: string) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const images = Array.from(wrapper.querySelectorAll("img"));
    let uploaded = 0;
    let failed = 0;

    for (const image of images) {
      const src = image.getAttribute("src") ?? "";
      if (!src || src.startsWith("data:")) continue;
      if (src.includes("i.ibb.co") || src.includes("ibb.co")) continue;
      const uploadedUrl = await uploadImage(src, apiKey);
      if (uploadedUrl) {
        image.setAttribute("src", uploadedUrl);
        uploaded += 1;
      } else {
        failed += 1;
      }
    }

    return { html: wrapper.innerHTML, uploaded, failed };
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
        const apiKey = await ensureApiKey();
        if (!apiKey) {
          setStatus("需要 ImgBB API Key 才能上传图片", "error");
          return;
        }
        setStatus("正在上传图片…", "info");
        const { html, uploaded, failed } = await replaceImagesWithImgBB(lastHtml, apiKey);
        await writeClipboard(html, lastText);
        if (uploaded > 0) {
          setStatus(`已复制为公众号格式（已上传 ${uploaded} 张图片）`, "success");
        } else if (failed > 0) {
          setStatus("已复制为公众号格式（部分图片上传失败）", "error");
        } else {
          setStatus("已复制为公众号格式", "success");
        }
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
