import { writeClipboard } from "./clipboard";
import { extractDocFromNotion } from "./extractor";
import { renderDocToHtml, renderDocToMarkdown, renderDocToText } from "./renderer";
import {
  STYLE_PRESET_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  TRANSLATION_MODELS
} from "./translation-config";
import {
  applyTranslationOutputsToDoc,
  DEFAULT_TRANSLATION_SETTINGS,
  detectDocLanguage,
  hashDoc,
  normalizeTranslationSettings,
  TRANSLATION_PORT_NAME,
  TRANSLATION_SETTINGS_KEY
} from "./translation";
import {
  DEFAULT_COLORS,
  DEFAULT_TYPO,
  FONT_STACK_DEFAULT,
  FONT_STACK_HELVETICA,
  FONT_STACK_PINGFANG
} from "./theme";
import type {
  DetectedLanguage,
  PreviewContentMode,
  TranslationBackgroundState,
  PreviewFormatMode,
  TranslationPortServerMessage,
  TranslationSettings,
  TranslationState
} from "./translation";
import type { RenderOptions, ThemeColors, Typography } from "./theme";
import type { Doc } from "./types";
import {
  buildImageMap,
  extractImageUrls,
  preloadImages,
  type ImageMap
} from "./image-loader";

const DRAWER_ID = "__notion_wechat_drawer";
const DRAWER_STYLE_ID = "__notion_wechat_drawer_style";
const ACCENT = "#10b981";
const TRANSLATION_CACHE_PREFIX = "translationCache";
const NOTION_PAGE_ID_PATTERN = /[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i;

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

type StatusTone = "info" | "success" | "error";

type TranslationCacheEntry = {
  translatedDoc: Doc;
  createdAt: number;
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

const createButton = (
  label: string,
  variant: "ghost" | "primary" = "ghost"
): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
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

const EYE_CLOSED_ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.2 8c1.48-2.6 3.86-4.2 6.8-4.2 2.94 0 5.32 1.6 6.8 4.2-1.48 2.6-3.86 4.2-6.8 4.2-2.94 0-5.32-1.6-6.8-4.2Z" stroke="#6b7280" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.1" stroke="#6b7280" stroke-width="1.2"/></svg>';
const EYE_OPEN_ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.2 2.2l11.6 11.6" stroke="#6b7280" stroke-width="1.2" stroke-linecap="round"/><path d="M4.35 4.35A7.23 7.23 0 0 1 8 3.4c2.94 0 5.32 1.6 6.8 4.2a8.74 8.74 0 0 1-2.08 2.45M6.13 6.13A2.68 2.68 0 0 0 5.9 8c0 1.16.94 2.1 2.1 2.1.67 0 1.26-.31 1.64-.8M11.67 11.67A7.31 7.31 0 0 1 8 12.6c-2.94 0-5.32-1.6-6.8-4.2.63-1.1 1.42-2.01 2.35-2.73" stroke="#6b7280" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const COPY_ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5" y="3" width="7" height="9" rx="1.6" stroke="#6b7280" stroke-width="1.2"/><path d="M4 5.2H3.6C2.72 5.2 2 5.92 2 6.8v5.6C2 13.28 2.72 14 3.6 14h4.8c.88 0 1.6-.72 1.6-1.6V12" stroke="#6b7280" stroke-width="1.2" stroke-linecap="round"/></svg>';
const CHECK_ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.2 8.4 6.4 11.4 12.8 4.8" stroke="#10b981" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const createIconButton = (): HTMLButtonElement => {
  const button = createButton("", "ghost");
  button.style.width = "30px";
  button.style.height = "30px";
  button.style.padding = "0";
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.border = "none";
  button.style.background = "transparent";
  button.style.borderRadius = "8px";
  return button;
};

const setApiKeyToggleVisual = (button: HTMLButtonElement, visible: boolean) => {
  button.innerHTML = visible ? EYE_OPEN_ICON : EYE_CLOSED_ICON;
  button.title = visible ? "隐藏 API Key" : "显示 API Key";
  button.setAttribute("aria-label", button.title);
};

const setButtonDisabled = (button: HTMLButtonElement, disabled: boolean) => {
  button.disabled = disabled;
  button.style.opacity = disabled ? "0.48" : "1";
  button.style.cursor = disabled ? "not-allowed" : "pointer";
};

const applySegmentStyle = (button: HTMLButtonElement, active: boolean) => {
  button.style.border = "1px solid #e5e7eb";
  button.style.background = active ? ACCENT : "#fff";
  button.style.color = active ? "#fff" : "#111827";
};

const createSegment = (label: string, active = false): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.padding = "8px 14px";
  button.style.fontSize = "12px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
  button.style.borderRadius = "10px";
  applySegmentStyle(button, active);
  return button;
};

const styleControl = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
  element.style.width = "100%";
  element.style.boxSizing = "border-box";
  element.style.border = "1px solid #d1d5db";
  element.style.borderRadius = "10px";
  element.style.padding = "10px 12px";
  element.style.fontSize = "13px";
  element.style.color = "#111827";
  element.style.background = "#fff";
  element.style.outline = "none";
  element.style.fontFamily =
    element.tagName === "TEXTAREA" ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : FONT_STACK_DEFAULT;

  if (element instanceof HTMLSelectElement) {
    element.style.paddingRight = "36px";
    element.style.appearance = "none";
    element.style.backgroundImage =
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='none' stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M2.5 4.5L6 8l3.5-3.5'/%3E%3C/svg%3E\")";
    element.style.backgroundRepeat = "no-repeat";
    element.style.backgroundPosition = "right 12px center";
    element.style.backgroundSize = "12px 12px";
  }
};

const createField = (
  label: string,
  control: HTMLElement,
  description = "",
  shouldStyleControl = true
) => {
  const wrapper = document.createElement("label");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "6px";

  const title = document.createElement("span");
  title.textContent = label;
  title.style.fontSize = "12px";
  title.style.fontWeight = "700";
  title.style.color = "#111827";
  wrapper.appendChild(title);

  if (description) {
    const note = document.createElement("span");
    note.textContent = description;
    note.style.fontSize = "11px";
    note.style.color = "#6b7280";
    wrapper.appendChild(note);
  }

  if (
    shouldStyleControl &&
    (control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement)
  ) {
    styleControl(control);
  }
  wrapper.appendChild(control);
  return wrapper;
};

const createTextInput = (type = "text"): HTMLInputElement => {
  const input = document.createElement("input");
  input.type = type;
  return input;
};

const createTextArea = (rows: number): HTMLTextAreaElement => {
  const textarea = document.createElement("textarea");
  textarea.rows = rows;
  textarea.style.resize = "vertical";
  return textarea;
};

const createSelect = (options: Array<{ value: string; label: string }>): HTMLSelectElement => {
  const select = document.createElement("select");
  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  });
  return select;
};

const shieldPanelInteraction = (element: HTMLElement) => {
  const stop = (event: Event) => {
    event.stopPropagation();
  };

  [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "keydown",
    "keyup",
    "keypress",
    "beforeinput",
    "input",
    "focus",
    "focusin"
  ].forEach((eventName) => {
    element.addEventListener(eventName, stop, true);
  });
};

const bindEditableControl = (
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
) => {
  shieldPanelInteraction(element);

  const insertTextAtCursor = (text: string) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;

    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;

    if (typeof element.setRangeText === "function") {
      element.setRangeText(text, start, end, "end");
    } else {
      element.value = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const focusControl = () => {
    window.requestAnimationFrame(() => {
      element.focus();
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const length = element.value.length;
        try {
          element.setSelectionRange(length, length);
        } catch (error) {
          // Ignore controls that do not support selection ranges.
        }
      }
    });
  };

  ["pointerdown", "mousedown", "mouseup", "click"].forEach((eventName) => {
    element.addEventListener(
      eventName,
      (event) => {
        event.stopPropagation();
        focusControl();
      },
      true
    );
  });

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.addEventListener(
      "keydown",
      (event) => {
        const keyboardEvent = event as KeyboardEvent;
        const isPasteShortcut =
          (keyboardEvent.ctrlKey || keyboardEvent.metaKey) &&
          keyboardEvent.key.toLowerCase() === "v";
        if (!isPasteShortcut) return;

        keyboardEvent.stopPropagation();
      },
      true
    );

    element.addEventListener(
      "paste",
      (event) => {
        const clipboardEvent = event as ClipboardEvent;
        clipboardEvent.stopPropagation();
        const text = clipboardEvent.clipboardData?.getData("text");
        if (!text) return;
        clipboardEvent.preventDefault();
        insertTextAtCursor(text);
      },
      true
    );
  }
};

const bindClickableControl = (element: HTMLElement) => {
  const stop = (event: Event) => {
    event.stopPropagation();
  };

  ["pointerdown", "mousedown", "mouseup", "click"].forEach((eventName) => {
    element.addEventListener(eventName, stop, true);
  });
};

const bindPressAction = (element: HTMLElement, action: () => void) => {
  const runAction = () => {
    if (element instanceof HTMLButtonElement && element.disabled) return;
    action();
  };

  element.addEventListener(
    "pointerdown",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      runAction();
    },
    true
  );

  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    runAction();
  });
};

const createLoadingButton = (label: string): {
  button: HTMLButtonElement;
  spinner: HTMLSpanElement;
  labelElement: HTMLSpanElement;
} => {
  const button = createButton("", "primary");
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.gap = "8px";
  button.style.minWidth = "92px";

  const spinner = document.createElement("span");
  spinner.style.width = "12px";
  spinner.style.height = "12px";
  spinner.style.borderRadius = "999px";
  spinner.style.border = "2px solid rgba(255,255,255,0.45)";
  spinner.style.borderTopColor = "#ffffff";
  spinner.style.animation = "drawerSpin 0.9s linear infinite";
  spinner.style.display = "none";

  const labelElement = document.createElement("span");
  labelElement.textContent = label;

  button.appendChild(spinner);
  button.appendChild(labelElement);

  return { button, spinner, labelElement };
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
@keyframes drawerSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  container.style.overflow = "hidden";

  const toolbar = document.createElement("div");
  toolbar.style.padding = "16px";
  toolbar.style.background = "#ffffff";
  toolbar.style.borderBottom = "1px solid #ededed";
  toolbar.style.display = "flex";
  toolbar.style.flexDirection = "column";
  toolbar.style.gap = "12px";

  const rowTop = document.createElement("div");
  rowTop.style.display = "flex";
  rowTop.style.alignItems = "flex-start";
  rowTop.style.justifyContent = "space-between";
  rowTop.style.gap = "12px";

  const rowTopLeft = document.createElement("div");
  rowTopLeft.style.display = "flex";
  rowTopLeft.style.alignItems = "center";
  rowTopLeft.style.flexWrap = "wrap";
  rowTopLeft.style.gap = "8px";

  const translateControls = createLoadingButton("翻译");
  const translateButton = translateControls.button;
  const translateSpinner = translateControls.spinner;
  const translateLabel = translateControls.labelElement;

  const contentSegment = document.createElement("div");
  contentSegment.style.display = "none";
  contentSegment.style.gap = "6px";
  contentSegment.style.padding = "4px";
  contentSegment.style.border = "1px solid #e5e7eb";
  contentSegment.style.borderRadius = "14px";
  contentSegment.style.background = "#fff";

  const originalContentButton = createSegment("原文", true);
  const translatedContentButton = createSegment("译文");
  contentSegment.appendChild(originalContentButton);
  contentSegment.appendChild(translatedContentButton);

  const previewSegment = document.createElement("div");
  previewSegment.style.display = "flex";
  previewSegment.style.gap = "6px";
  previewSegment.style.padding = "4px";
  previewSegment.style.border = "1px solid #e5e7eb";
  previewSegment.style.borderRadius = "14px";
  previewSegment.style.background = "#fff";

  const wechatPreviewButton = createSegment("公众号", true);
  const markdownPreviewButton = createSegment("Markdown");
  previewSegment.appendChild(wechatPreviewButton);
  previewSegment.appendChild(markdownPreviewButton);

  const settingsButton = createButton("设置", "ghost");

  rowTopLeft.appendChild(translateButton);
  rowTopLeft.appendChild(contentSegment);
  rowTopLeft.appendChild(previewSegment);
  rowTop.appendChild(rowTopLeft);
  rowTop.appendChild(settingsButton);

  const rowMiddle = document.createElement("div");
  rowMiddle.style.display = "flex";
  rowMiddle.style.alignItems = "center";
  rowMiddle.style.flexWrap = "wrap";
  rowMiddle.style.gap = "12px";

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

  rowMiddle.appendChild(themeWrapper);
  rowMiddle.appendChild(fontSegment);
  rowMiddle.appendChild(sizeControl);

  const rowBottom = document.createElement("div");
  rowBottom.style.display = "flex";
  rowBottom.style.alignItems = "center";
  rowBottom.style.justifyContent = "space-between";
  rowBottom.style.gap = "12px";

  const status = document.createElement("div");
  status.style.fontSize = "12px";
  status.style.color = "#6b7280";
  status.style.minHeight = "18px";
  status.style.flex = "1";
  status.style.whiteSpace = "pre-wrap";
  status.style.wordBreak = "break-word";
  status.style.userSelect = "text";
  status.style.cursor = "text";
  status.tabIndex = 0;
  rowBottom.appendChild(status);

  const copyStatusButton = createIconButton();
  copyStatusButton.innerHTML = COPY_ICON;
  copyStatusButton.style.display = "none";
  copyStatusButton.style.flexShrink = "0";
  rowBottom.appendChild(copyStatusButton);

  toolbar.appendChild(rowTop);
  toolbar.appendChild(rowMiddle);
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
  const copyMarkdownButton = createButton("复制为 Markdown", "ghost");
  footer.appendChild(refreshButton);
  footer.appendChild(copyAllButton);
  footer.appendChild(copyMarkdownButton);

  const settingsOverlay = document.createElement("div");
  settingsOverlay.style.position = "absolute";
  settingsOverlay.style.inset = "0";
  settingsOverlay.style.display = "none";
  settingsOverlay.style.alignItems = "stretch";
  settingsOverlay.style.justifyContent = "flex-end";
  settingsOverlay.style.background = "rgba(17,24,39,0.24)";
  settingsOverlay.style.backdropFilter = "blur(4px)";
  settingsOverlay.style.padding = "16px";

  const settingsPanel = document.createElement("div");
  settingsPanel.style.width = "430px";
  settingsPanel.style.maxWidth = "100%";
  settingsPanel.style.background = "#ffffff";
  settingsPanel.style.borderRadius = "18px";
  settingsPanel.style.boxShadow = "0 24px 40px rgba(0,0,0,0.18)";
  settingsPanel.style.display = "flex";
  settingsPanel.style.flexDirection = "column";
  settingsPanel.style.overflow = "hidden";

  const settingsHeader = document.createElement("div");
  settingsHeader.style.display = "flex";
  settingsHeader.style.alignItems = "center";
  settingsHeader.style.justifyContent = "space-between";
  settingsHeader.style.padding = "18px 20px 14px";
  settingsHeader.style.borderBottom = "1px solid #f1f5f9";

  const settingsTitle = document.createElement("div");
  settingsTitle.textContent = "翻译设置";
  settingsTitle.style.fontSize = "16px";
  settingsTitle.style.fontWeight = "700";
  settingsTitle.style.color = "#111827";

  const settingsCloseButton = createButton("关闭", "ghost");
  settingsCloseButton.style.padding = "6px 10px";

  settingsHeader.appendChild(settingsTitle);
  settingsHeader.appendChild(settingsCloseButton);

  const settingsBody = document.createElement("div");
  settingsBody.style.flex = "1";
  settingsBody.style.overflowY = "auto";
  settingsBody.style.padding = "18px 20px";
  settingsBody.style.display = "flex";
  settingsBody.style.flexDirection = "column";
  settingsBody.style.gap = "14px";

  const apiKeyInput = createTextInput("password");
  const apiKeyControl = document.createElement("div");
  apiKeyControl.style.position = "relative";
  apiKeyControl.style.display = "flex";
  apiKeyControl.style.alignItems = "center";
  apiKeyControl.style.width = "100%";

  const apiKeyToggleButton = createIconButton();
  apiKeyToggleButton.style.position = "absolute";
  apiKeyToggleButton.style.top = "50%";
  apiKeyToggleButton.style.right = "8px";
  apiKeyToggleButton.style.transform = "translateY(-50%)";
  setApiKeyToggleVisual(apiKeyToggleButton, false);

  const modelSelect = createSelect(
    TRANSLATION_MODELS.map((model) => ({
      value: model.id,
      label: model.label
    }))
  );
  const modeSelect = createSelect([
    { value: "quick", label: "Quick" },
    { value: "normal", label: "Normal" }
  ]);
  const audienceSelect = createSelect([...TARGET_AUDIENCE_OPTIONS]);
  const stylePresetSelect = createSelect([...STYLE_PRESET_OPTIONS]);
  const glossaryInput = createTextArea(5);
  const preserveTermsInput = createTextArea(4);
  const extraInstructionsInput = createTextArea(4);
  const chunkThresholdInput = createTextInput("number");
  const chunkMaxUnitsInput = createTextInput("number");

  const targetLanguageSegment = document.createElement("div");
  targetLanguageSegment.style.display = "flex";
  targetLanguageSegment.style.gap = "6px";
  targetLanguageSegment.dataset.value = DEFAULT_TRANSLATION_SETTINGS.targetLanguage;

  const targetLanguageButtons = TARGET_LANGUAGE_OPTIONS.map((option, index) => {
    const button = createSegment(option.label, index === 0);
    bindClickableControl(button);
    targetLanguageSegment.appendChild(button);
    return { option, button };
  });

  chunkThresholdInput.min = "2000";
  chunkThresholdInput.step = "500";
  chunkMaxUnitsInput.min = "1";
  chunkMaxUnitsInput.step = "1";

  styleControl(apiKeyInput);
  apiKeyInput.style.paddingRight = "42px";
  apiKeyControl.appendChild(apiKeyInput);
  apiKeyControl.appendChild(apiKeyToggleButton);

  settingsBody.appendChild(createField("API Key", apiKeyControl, "", false));
  settingsBody.appendChild(
    createField("模型", modelSelect, "模型列表来自 src/translation-models.json")
  );
  settingsBody.appendChild(createField("目标语言", targetLanguageSegment, "", false));
  settingsBody.appendChild(createField("翻译模式", modeSelect));
  settingsBody.appendChild(createField("目标读者", audienceSelect));
  settingsBody.appendChild(createField("风格预设", stylePresetSelect));
  settingsBody.appendChild(createField("术语表", glossaryInput, "一行一个术语或映射"));
  settingsBody.appendChild(createField("保留术语", preserveTermsInput, "这些词会被要求保留原文"));
  settingsBody.appendChild(createField("额外说明", extraInstructionsInput));
  settingsBody.appendChild(createField("分块阈值", chunkThresholdInput, "超过该字数后启用分块翻译"));
  settingsBody.appendChild(createField("每块最大单元数", chunkMaxUnitsInput));

  [
    apiKeyInput,
    modelSelect,
    modeSelect,
    audienceSelect,
    stylePresetSelect,
    glossaryInput,
    preserveTermsInput,
    extraInstructionsInput,
    chunkThresholdInput,
    chunkMaxUnitsInput
  ].forEach((control) => bindEditableControl(control));
  bindClickableControl(apiKeyToggleButton);

  const settingsFooter = document.createElement("div");
  settingsFooter.style.display = "flex";
  settingsFooter.style.flexDirection = "column";
  settingsFooter.style.gap = "10px";
  settingsFooter.style.padding = "16px 20px 20px";
  settingsFooter.style.borderTop = "1px solid #f1f5f9";

  const settingsStatus = document.createElement("div");
  settingsStatus.style.fontSize = "12px";
  settingsStatus.style.color = "#6b7280";
  settingsStatus.style.minHeight = "18px";

  const settingsActions = document.createElement("div");
  settingsActions.style.display = "flex";
  settingsActions.style.gap = "10px";
  settingsActions.style.justifyContent = "flex-end";

  const settingsCancelButton = createButton("取消", "ghost");
  const settingsSaveButton = createButton("保存设置", "primary");
  bindClickableControl(settingsCloseButton);
  bindClickableControl(settingsCancelButton);
  bindClickableControl(settingsSaveButton);
  settingsActions.appendChild(settingsCancelButton);
  settingsActions.appendChild(settingsSaveButton);

  settingsFooter.appendChild(settingsStatus);
  settingsFooter.appendChild(settingsActions);

  settingsPanel.appendChild(settingsHeader);
  settingsPanel.appendChild(settingsBody);
  settingsPanel.appendChild(settingsFooter);
  settingsOverlay.appendChild(settingsPanel);

  container.appendChild(toolbar);
  container.appendChild(previewScroll);
  container.appendChild(footer);
  container.appendChild(settingsOverlay);

  return {
    container,
    previewPage,
    status,
    copyStatusButton,
    themeButton,
    themeMenu,
    themeWrapper,
    fontButtons,
    sizeDown,
    sizeUp,
    refreshButton,
    copyAllButton,
    copyMarkdownButton,
    translateButton,
    translateSpinner,
    translateLabel,
    contentSegment,
    originalContentButton,
    translatedContentButton,
    wechatPreviewButton,
    markdownPreviewButton,
    settingsButton,
    settingsOverlay,
    settingsPanel,
    settingsCloseButton,
    settingsCancelButton,
    settingsSaveButton,
    settingsStatus,
    settingsInputs: {
      apiKeyInput,
      apiKeyToggleButton,
      modelSelect,
      targetLanguageSegment,
      targetLanguageButtons,
      modeSelect,
      audienceSelect,
      stylePresetSelect,
      glossaryInput,
      preserveTermsInput,
      extraInstructionsInput,
      chunkThresholdInput,
      chunkMaxUnitsInput
    }
  };
};

export const initDrawer = () => {
  let drawer: HTMLElement | null = null;
  let drawerRefs: ReturnType<typeof createDrawer> | null = null;
  let closing = false;
  let outsideListenerAttached = false;
  let settingsGuardAttached = false;
  let activeThemeWrapper: HTMLElement | null = null;
  let activeThemeMenu: HTMLElement | null = null;

  let sourceDoc: Doc | null = null;
  let sourceHash = "";
  let sourcePageKey = "";
  let originalHtml = "";
  let originalText = "";
  let originalMarkdown = "";

  let translatedDoc: Doc | null = null;
  let translatedHtml = "";
  let translatedText = "";
  let translatedMarkdown = "";
  let sourceLanguage: DetectedLanguage = "unknown";

  let previewMode: PreviewFormatMode = "wechat";
  let contentMode: PreviewContentMode = "original";
  let translationState: TranslationState = "idle";
  let translationJobId = "";
  let translationPort: chrome.runtime.Port | null = null;
  let suppressNextTranslationDisconnect = false;
  let translationDisconnectRecoveryId = 0;

  let currentTheme = THEME_PRESETS[0];
  let currentFont = FONT_PRESETS[0];
  let fontScale = 1;

  let translationSettings = DEFAULT_TRANSLATION_SETTINGS;
  let settingsLoadPromise: Promise<void> | null = null;

  let statusMessage = "";
  let statusTone: StatusTone = "info";
  let translationStatusMessage = "";

  let imageMap: ImageMap = new Map();
  let imagePreloadAborted = false;

  const getLanguageLabel = (language: DetectedLanguage | string): string => {
    if (language === "zh-CN") return "中文";
    if (language === "en") return "English";
    return "当前语言";
  };

  const getCurrentPageKey = (): string => {
    const url = new URL(window.location.href);
    const pageParam = url.searchParams.get("p");
    const lastPathSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? url.pathname;

    for (const candidate of [pageParam, lastPathSegment]) {
      if (!candidate) continue;
      const match = candidate.match(NOTION_PAGE_ID_PATTERN);
      if (match) {
        return match[0].replace(/-/g, "").toLowerCase();
      }
    }

    return url.pathname;
  };

  const getTranslateDisabledReason = (): string => {
    if (!sourceDoc || !sourceHash) return "未检测到可翻译内容";
    if (translationState === "translating") return "";
    if (sourceLanguage !== "unknown" && sourceLanguage === translationSettings.targetLanguage) {
      return `当前文章已是${getLanguageLabel(sourceLanguage)}，无需翻译到${getLanguageLabel(
        translationSettings.targetLanguage
      )}`;
    }
    return "";
  };

  const getVisibleStatusMessage = (): string => {
    const usingTranslationStatus =
      translationState === "translating" && translationStatusMessage.trim().length > 0;
    return usingTranslationStatus ? translationStatusMessage : statusMessage;
  };

  const setStatusTone = (element: HTMLElement, tone: StatusTone) => {
    element.style.color =
      tone === "success" ? "#047857" : tone === "error" ? "#b91c1c" : "#6b7280";
  };

  const updateStatus = () => {
    if (!drawerRefs) return;
    const usingTranslationStatus =
      translationState === "translating" && translationStatusMessage.trim().length > 0;
    const visibleStatusMessage = getVisibleStatusMessage();
    drawerRefs.status.textContent = visibleStatusMessage;
    drawerRefs.status.title = visibleStatusMessage;
    setStatusTone(drawerRefs.status, usingTranslationStatus ? "info" : statusTone);
    setButtonDisabled(drawerRefs.copyStatusButton, visibleStatusMessage.trim().length === 0);
    drawerRefs.copyStatusButton.style.display = visibleStatusMessage.trim().length > 0 ? "inline-flex" : "none";
    drawerRefs.copyStatusButton.title = visibleStatusMessage ? "复制当前消息" : "";
    drawerRefs.copyStatusButton.setAttribute("aria-label", visibleStatusMessage ? "复制当前消息" : "");
  };

  const setStatusMessage = (message: string, tone: StatusTone = "info") => {
    statusMessage = message;
    statusTone = tone;
    updateStatus();
  };

  const setTranslationStatus = (message: string) => {
    translationStatusMessage = message;
    updateStatus();
  };

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const queryTranslationStateSnapshot = (): Promise<TranslationBackgroundState | null | undefined> =>
    new Promise((resolve) => {
      let settled = false;
      let port: chrome.runtime.Port | null = null;

      const finish = (state?: TranslationBackgroundState | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (port) {
          port.onMessage.removeListener(handleMessage);
          port.onDisconnect.removeListener(handleDisconnect);
          try {
            port.disconnect();
          } catch (error) {
            // Ignore already-closed ports.
          }
        }
        resolve(state);
      };

      const handleMessage = (message: unknown) => {
        const payload = message as TranslationPortServerMessage;
        if (payload.type !== "translation/state") return;
        finish(payload.state);
      };

      const handleDisconnect = () => {
        finish(undefined);
      };

      const timeoutId = window.setTimeout(() => {
        finish(undefined);
      }, 900);

      try {
        port = chrome.runtime.connect({ name: TRANSLATION_PORT_NAME });
      } catch (error) {
        finish(undefined);
        return;
      }

      port.onMessage.addListener(handleMessage);
      port.onDisconnect.addListener(handleDisconnect);

      try {
        port.postMessage({ type: "translation/query-state" });
      } catch (error) {
        finish(undefined);
      }
    });

  const queryTranslationStateSnapshotWithRetry = async (
    attempts = 3
  ): Promise<TranslationBackgroundState | null | undefined> => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const state = await queryTranslationStateSnapshot();
      if (state !== undefined || attempt === attempts - 1) {
        return state;
      }
      await wait(180);
    }

    return undefined;
  };

  const formatTranslationDisconnectMessage = (detail?: string): string => {
    const normalizedDetail = detail?.trim();
    if (!normalizedDetail) {
      return "翻译服务连接已断开，请重试";
    }

    return `翻译服务连接已断开，请重试（${normalizedDetail}）`;
  };

  const getTranslationProgressMessage = (message: {
    label?: string;
    detail?: string;
  }): string => {
    if (!message.label) return message.detail ?? "";
    return message.detail ? `${message.label} · ${message.detail}` : message.label;
  };

  const setSettingsStatus = (message: string, tone: StatusTone = "info") => {
    if (!drawerRefs) return;
    drawerRefs.settingsStatus.textContent = message;
    setStatusTone(drawerRefs.settingsStatus, tone);
  };

  const escapePreviewText = (input: string): string =>
    input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const hashString = (input: string): string => {
    let hash = 5381;
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash * 33) ^ input.charCodeAt(index);
    }
    return `cache_${(hash >>> 0).toString(16)}`;
  };

  const getSettingsHash = (settings: TranslationSettings): string => {
    const value = {
      ...settings,
      apiKey: ""
    };
    return hashString(JSON.stringify(value));
  };

  const getTranslationCacheKey = (): string | null => {
    if (!sourceHash) return null;
    return `${TRANSLATION_CACHE_PREFIX}:${sourceHash}:${getSettingsHash(translationSettings)}`;
  };

  const getCurrentHtml = (): string => {
    if (contentMode === "translated" && translatedDoc) return translatedHtml;
    return originalHtml;
  };

  const getCurrentMarkdown = (): string => {
    if (contentMode === "translated" && translatedDoc) return translatedMarkdown;
    return originalMarkdown;
  };

  const getCurrentText = (): string => {
    if (contentMode === "translated" && translatedDoc) return translatedText;
    return originalText;
  };

  const renderPreview = () => {
    if (!drawerRefs) return;

    if (previewMode === "markdown") {
      const markdown = getCurrentMarkdown() || "未检测到可用内容";
      drawerRefs.previewPage.innerHTML = `<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:13px;line-height:1.6;color:#111827;">${escapePreviewText(
        markdown
      )}</pre>`;
      return;
    }

    drawerRefs.previewPage.innerHTML =
      getCurrentHtml() || "<p style=\"color:#9ca3af;font-size:13px;\">未检测到可用内容</p>";
  };

  const computeTypography = (): Typography => {
    const themeTypography = { ...DEFAULT_TYPO, ...(currentTheme.typography ?? {}) };
    const baseSize = Number.parseFloat(themeTypography.bodySize) || 16;
    const scaledSize = Math.max(14, Math.min(18, Math.round(baseSize * fontScale)));

    const baseLineHeight = themeTypography.bodyLineHeight;
    let lineHeight = baseLineHeight;
    if (baseLineHeight.endsWith("px")) {
      const lineHeightPx = Number.parseFloat(baseLineHeight);
      if (lineHeightPx) {
        const ratio = lineHeightPx / baseSize;
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

  const buildRenderOptions = (): Partial<RenderOptions> => ({
    themeId: currentTheme.id,
    fontStack: currentFont.stack,
    colors: { ...DEFAULT_COLORS, ...currentTheme.colors },
    typography: computeTypography()
  });

  const cancelImagePreload = () => {
    imagePreloadAborted = true;
  };

  const startImagePreload = (doc: Doc) => {
    const urls = extractImageUrls(doc);
    if (urls.length === 0) return;

    imagePreloadAborted = false;

    void preloadImages(urls, (loaded, total) => {
      if (imagePreloadAborted) return;
      setStatusMessage(`图片加载中 ${loaded}/${total}`, "info");
    }).then((results) => {
      if (imagePreloadAborted) return;
      imageMap = buildImageMap(results);
      const failed = results.filter((r) => r.error).length;
      rebuildRenderedContent();
      if (failed > 0) {
        setStatusMessage(`图片加载完成（${failed}/${results.length} 张失败）`, "info");
      } else {
        setStatusMessage(`${results.length} 张图片已加载`, "success");
      }
    });
  };

  const rebuildRenderedContent = () => {
    const renderOptions = buildRenderOptions();

    if (sourceDoc) {
      originalHtml = renderDocToHtml(sourceDoc, renderOptions, imageMap);
      originalText = renderDocToText(sourceDoc);
      originalMarkdown = renderDocToMarkdown(sourceDoc);
    } else {
      originalHtml = "";
      originalText = "";
      originalMarkdown = "";
    }

    if (translatedDoc) {
      translatedHtml = renderDocToHtml(translatedDoc, renderOptions, imageMap);
      translatedText = renderDocToText(translatedDoc);
      translatedMarkdown = renderDocToMarkdown(translatedDoc);
    } else {
      translatedHtml = "";
      translatedText = "";
      translatedMarkdown = "";
    }

    renderPreview();
  };

  const clearTranslatedContent = () => {
    translatedDoc = null;
    translatedHtml = "";
    translatedText = "";
    translatedMarkdown = "";
    if (contentMode === "translated") {
      contentMode = "original";
    }
  };

  const ensureSelectValue = (
    select: HTMLSelectElement,
    value: string,
    fallbackLabel = value
  ) => {
    const exists = Array.from(select.options).some((option) => option.value === value);
    if (!exists) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = fallbackLabel;
      select.appendChild(option);
    }
    select.value = value;
  };

  const syncTargetLanguageButtons = () => {
    if (!drawerRefs) return;
    const selected = drawerRefs.settingsInputs.targetLanguageSegment.dataset.value ?? "zh-CN";
    drawerRefs.settingsInputs.targetLanguageButtons.forEach(({ option, button }) => {
      applySegmentStyle(button, option.value === selected);
    });
  };

  const syncSettingsForm = () => {
    if (!drawerRefs) return;
    const { settingsInputs } = drawerRefs;
    settingsInputs.apiKeyInput.value = translationSettings.apiKey;
    settingsInputs.apiKeyInput.type = "password";
    setApiKeyToggleVisual(settingsInputs.apiKeyToggleButton, false);
    ensureSelectValue(settingsInputs.modelSelect, translationSettings.model, translationSettings.model);
    settingsInputs.targetLanguageSegment.dataset.value = translationSettings.targetLanguage;
    syncTargetLanguageButtons();
    settingsInputs.modeSelect.value = translationSettings.mode;
    ensureSelectValue(settingsInputs.audienceSelect, translationSettings.audience, translationSettings.audience);
    ensureSelectValue(
      settingsInputs.stylePresetSelect,
      translationSettings.stylePreset,
      translationSettings.stylePreset
    );
    settingsInputs.glossaryInput.value = translationSettings.glossary;
    settingsInputs.preserveTermsInput.value = translationSettings.preserveTerms;
    settingsInputs.extraInstructionsInput.value = translationSettings.extraInstructions;
    settingsInputs.chunkThresholdInput.value = String(translationSettings.chunkThreshold);
    settingsInputs.chunkMaxUnitsInput.value = String(translationSettings.chunkMaxUnits);
  };

  const loadSettings = async () => {
    if (!settingsLoadPromise) {
      settingsLoadPromise = (async () => {
        const stored = await chrome.storage.local.get(TRANSLATION_SETTINGS_KEY);
        translationSettings = normalizeTranslationSettings(
          stored[TRANSLATION_SETTINGS_KEY] as Partial<TranslationSettings> | undefined
        );
        syncSettingsForm();
      })();
    }

    await settingsLoadPromise;
  };

  const openSettings = async () => {
    if (!drawerRefs) return;
    await loadSettings();
    syncSettingsForm();
    setSettingsStatus("");
    drawerRefs.settingsOverlay.style.display = "flex";
  };

  const closeSettings = () => {
    if (!drawerRefs) return;
    drawerRefs.settingsOverlay.style.display = "none";
    setSettingsStatus("");
  };

  const updateThemeButton = () => {
    if (!drawerRefs) return;
    drawerRefs.themeButton.textContent = `${currentTheme.label} ▼`;
  };

  const updateFontButtons = () => {
    if (!drawerRefs) return;
    drawerRefs.fontButtons.forEach(({ font, button }) => {
      applySegmentStyle(button, font.id === currentFont.id);
    });
  };

  const syncControlState = () => {
    if (!drawerRefs) return;

    drawerRefs.contentSegment.style.display = translatedDoc ? "flex" : "none";
    applySegmentStyle(drawerRefs.originalContentButton, contentMode === "original" || !translatedDoc);
    applySegmentStyle(drawerRefs.translatedContentButton, contentMode === "translated" && !!translatedDoc);
    setButtonDisabled(drawerRefs.translatedContentButton, !translatedDoc);

    applySegmentStyle(drawerRefs.wechatPreviewButton, previewMode === "wechat");
    applySegmentStyle(drawerRefs.markdownPreviewButton, previewMode === "markdown");

    const translateDisabledReason = getTranslateDisabledReason();
    const translateDisabled =
      (translationState !== "translating" && translateDisabledReason.length > 0) || false;

    drawerRefs.translateSpinner.style.display = translationState === "translating" ? "inline-block" : "none";
    drawerRefs.translateLabel.textContent =
      translationState === "translating"
        ? "翻译中"
        : translatedDoc || translationState === "stale"
          ? "重新翻译"
          : "翻译";
    drawerRefs.translateButton.title =
      translationState === "translating"
        ? "点击取消当前翻译"
        : translateDisabledReason;
    drawerRefs.translateButton.style.opacity =
      translationState === "translating" ? "0.92" : translateDisabled ? "0.48" : "1";
    drawerRefs.translateButton.style.cursor =
      translationState === "translating"
        ? "progress"
        : translateDisabled
          ? "not-allowed"
          : "pointer";
    drawerRefs.translateButton.disabled =
      translationState !== "translating" && translateDisabled;

    const hasActiveContent =
      getCurrentHtml().trim().length > 0 || getCurrentMarkdown().trim().length > 0;
    setButtonDisabled(drawerRefs.copyAllButton, !hasActiveContent);
    setButtonDisabled(drawerRefs.copyMarkdownButton, !hasActiveContent);

    updateStatus();
  };

  const readTranslationCache = async (): Promise<TranslationCacheEntry | null> => {
    const cacheKey = getTranslationCacheKey();
    if (!cacheKey || !chrome.storage.session) return null;

    const stored = await chrome.storage.session.get(cacheKey);
    return (stored[cacheKey] as TranslationCacheEntry | undefined) ?? null;
  };

  const persistTranslationCache = async (doc: Doc) => {
    const cacheKey = getTranslationCacheKey();
    if (!cacheKey || !chrome.storage.session) return;

    await chrome.storage.session.set({
      [cacheKey]: {
        translatedDoc: doc,
        createdAt: Date.now()
      } satisfies TranslationCacheEntry
    });
  };

  const applyTranslatedDoc = async (
    nextTranslatedDoc: Doc,
    options?: { activateTranslated?: boolean; statusMessage?: string }
  ) => {
    translatedDoc = nextTranslatedDoc;
    translationState = "success";
    translationJobId = "";
    setTranslationStatus("");
    if (options?.activateTranslated ?? true) {
      contentMode = "translated";
    }
    rebuildRenderedContent();
    syncControlState();
    if (options?.statusMessage) {
      setStatusMessage(options.statusMessage, "success");
    }
    await persistTranslationCache(nextTranslatedDoc);
  };

  const maybeRestoreCachedTranslation = async (
    activateTranslated: boolean,
    notify = false
  ): Promise<boolean> => {
    if (!sourceDoc) return false;

    const cached = await readTranslationCache();
    if (!cached?.translatedDoc) return false;

    await applyTranslatedDoc(cached.translatedDoc, {
      activateTranslated,
      statusMessage: notify ? "已加载缓存译文" : ""
    });
    if (!notify) {
      setStatusMessage("");
    }
    return true;
  };

  const cancelActiveTranslation = (showMessage = true) => {
    if (translationState !== "translating" || !translationJobId) return;
    translationDisconnectRecoveryId += 1;
    const port = translationPort ?? ensureTranslationPort();
    port.postMessage({ type: "translation/cancel", jobId: translationJobId });
    translationJobId = "";
    translationState = translatedDoc ? "success" : "idle";
    setTranslationStatus("");
    syncControlState();
    if (showMessage) {
      setStatusMessage("翻译已取消", "info");
    }
  };

  const handleBackgroundTranslationState = async (state: TranslationBackgroundState | null) => {
    if (!sourceDoc || !sourceHash) return;

    const sameLanguageTarget =
      sourceLanguage !== "unknown" && sourceLanguage === translationSettings.targetLanguage;

    if (!state) {
      if (translationState === "translating") {
        translationDisconnectRecoveryId += 1;
        translationJobId = "";
        translationState = translatedDoc ? "success" : "idle";
        setTranslationStatus("");
        syncControlState();
      }
      return;
    }

    if (sameLanguageTarget) {
      if (state.status === "translating") {
        ensureTranslationPort().postMessage({ type: "translation/cancel", jobId: state.jobId });
      }
      translationDisconnectRecoveryId += 1;
      translationJobId = "";
      translationState = "idle";
      setTranslationStatus("");
      syncControlState();
      return;
    }

    if (state.sourceHash !== sourceHash) {
      if (state.status === "translating") {
        ensureTranslationPort().postMessage({ type: "translation/cancel", jobId: state.jobId });
      }
      if (translationState === "translating") {
        translationDisconnectRecoveryId += 1;
        translationJobId = "";
        translationState = translatedDoc ? "success" : "idle";
        setTranslationStatus("");
        syncControlState();
      }
      return;
    }

    if (state.status === "translating") {
      translationJobId = state.jobId;
      translationState = "translating";
      setTranslationStatus(getTranslationProgressMessage(state));
      syncControlState();
      return;
    }

    translationDisconnectRecoveryId += 1;

    if (state.status === "success") {
      translationJobId = "";
      setTranslationStatus("");

      const nextTranslatedDoc = applyTranslationOutputsToDoc(sourceDoc, state.outputs ?? []);
      if (translatedDoc && hashDoc(translatedDoc) === hashDoc(nextTranslatedDoc)) {
        translationState = "success";
        syncControlState();
        return;
      }
      await applyTranslatedDoc(nextTranslatedDoc, {
        activateTranslated: true,
        statusMessage: "已恢复后台翻译结果"
      });
      return;
    }

    translationJobId = "";
    translationState = translatedDoc ? "success" : "error";
    setTranslationStatus("");
    syncControlState();
    if (state.message) {
      setStatusMessage(state.message, "error");
    }
  };

  const recoverTranslationAfterDisconnect = async (disconnectDetail?: string) => {
    const recoveryId = ++translationDisconnectRecoveryId;
    const disconnectSourceHash = sourceHash;

    setTranslationStatus("翻译连接中断，正在尝试恢复…");
    syncControlState();

    const state = await queryTranslationStateSnapshotWithRetry();
    if (recoveryId !== translationDisconnectRecoveryId) return;
    if (translationState !== "translating" || sourceHash !== disconnectSourceHash) return;

    if (state && state.sourceHash === disconnectSourceHash) {
      if (state.status === "translating") {
        ensureTranslationPort();
      }
      await handleBackgroundTranslationState(state);
      return;
    }

    translationDisconnectRecoveryId += 1;
    translationJobId = "";
    translationState = translatedDoc ? "success" : "error";
    setTranslationStatus("");
    syncControlState();
    setStatusMessage(formatTranslationDisconnectMessage(disconnectDetail), "error");
  };

  const handleTranslationMessage = (message: TranslationPortServerMessage) => {
    if (message.type === "translation/state") {
      void handleBackgroundTranslationState(message.state);
      return;
    }

    if (!translationJobId || message.jobId !== translationJobId) return;

    if (message.type === "translation/progress") {
      setTranslationStatus(getTranslationProgressMessage(message));
      syncControlState();
      return;
    }

    if (message.type === "translation/result") {
      if (!sourceDoc) return;
      const nextTranslatedDoc = applyTranslationOutputsToDoc(sourceDoc, message.outputs);
      void applyTranslatedDoc(nextTranslatedDoc, {
        activateTranslated: true,
        statusMessage: "翻译完成"
      });
      return;
    }

    if (message.message === "翻译已取消") {
      translationJobId = "";
      translationState = translatedDoc ? "success" : "idle";
      setTranslationStatus("");
      syncControlState();
      setStatusMessage("翻译已取消", "info");
      return;
    }

    translationJobId = "";
    translationState = translatedDoc ? "success" : "error";
    setTranslationStatus("");
    syncControlState();
    setStatusMessage(message.message, "error");
  };

  const ensureTranslationPort = () => {
    if (translationPort) return translationPort;

    translationPort = chrome.runtime.connect({ name: TRANSLATION_PORT_NAME });
    translationPort.onMessage.addListener((message) => {
      handleTranslationMessage(message as TranslationPortServerMessage);
    });
    translationPort.onDisconnect.addListener(() => {
      const disconnectDetail = chrome.runtime.lastError?.message ?? "";
      translationPort = null;
      if (suppressNextTranslationDisconnect) {
        suppressNextTranslationDisconnect = false;
        return;
      }
      if (translationState === "translating") {
        void recoverTranslationAfterDisconnect(disconnectDetail);
      }
    });

    return translationPort;
  };

  const syncTranslationStateFromBackground = () => {
    if (!sourceDoc || !sourceHash) return;
    ensureTranslationPort().postMessage({ type: "translation/query-state" });
  };

  const startTranslation = async () => {
    if (translationState === "translating") {
      cancelActiveTranslation(true);
      return;
    }

    await loadSettings();
    if (!sourceDoc) {
      await refreshSource({ announce: false, activateCachedTranslation: false });
    }

    if (!sourceDoc || !sourceHash) {
      setStatusMessage("未检测到可翻译内容", "error");
      return;
    }

    const translateDisabledReason = getTranslateDisabledReason();
    if (translateDisabledReason) {
      setStatusMessage(translateDisabledReason, "info");
      syncControlState();
      return;
    }

    if (!translationSettings.apiKey || !translationSettings.model) {
      setStatusMessage("请先在设置中补全 API Key 和模型", "error");
      await openSettings();
      return;
    }

    const restored = await maybeRestoreCachedTranslation(true, true);
    if (restored) {
      syncControlState();
      return;
    }

    const port = ensureTranslationPort();
    translationDisconnectRecoveryId += 1;
    translationState = "translating";
    translationJobId =
      typeof crypto.randomUUID === "function"
        ? `translation_${crypto.randomUUID()}`
        : `translation_${Date.now()}`;
    setTranslationStatus(
      translationSettings.mode === "normal" ? "步骤 1/4：准备翻译内容" : "步骤 1/3：准备翻译内容"
    );
    syncControlState();

    port.postMessage({
      type: "translation/start",
      payload: {
        jobId: translationJobId,
        sourceHash,
        doc: sourceDoc,
        settings: translationSettings
      }
    });
  };

  const saveSettings = async () => {
    if (!drawerRefs) return;

    const { settingsInputs } = drawerRefs;
    const nextSettings = normalizeTranslationSettings({
      apiKey: settingsInputs.apiKeyInput.value,
      model: settingsInputs.modelSelect.value,
      targetLanguage: settingsInputs.targetLanguageSegment.dataset.value ?? "zh-CN",
      mode: settingsInputs.modeSelect.value as TranslationSettings["mode"],
      audience: settingsInputs.audienceSelect.value,
      stylePreset: settingsInputs.stylePresetSelect.value,
      glossary: settingsInputs.glossaryInput.value,
      preserveTerms: settingsInputs.preserveTermsInput.value,
      extraInstructions: settingsInputs.extraInstructionsInput.value,
      chunkThreshold: Number(settingsInputs.chunkThresholdInput.value),
      chunkMaxUnits: Number(settingsInputs.chunkMaxUnitsInput.value)
    });

    if (!nextSettings.apiKey || !nextSettings.model) {
      setSettingsStatus("API Key 和模型不能为空", "error");
      return;
    }

    const previousSettingsHash = getSettingsHash(translationSettings);
    const hadTranslatedContent = Boolean(translatedDoc);

    setButtonDisabled(drawerRefs.settingsSaveButton, true);
    setSettingsStatus("正在保存设置…");

    try {
      await chrome.storage.local.set({
        [TRANSLATION_SETTINGS_KEY]: nextSettings
      });
      translationSettings = nextSettings;
      syncSettingsForm();
      closeSettings();

      const currentSettingsHash = getSettingsHash(translationSettings);
      if (previousSettingsHash !== currentSettingsHash) {
        cancelActiveTranslation(false);
        clearTranslatedContent();
        translationState = hadTranslatedContent ? "stale" : "idle";
        rebuildRenderedContent();
        syncControlState();

        const translateDisabledReason = getTranslateDisabledReason();
        if (translateDisabledReason) {
          setStatusMessage(translateDisabledReason, "info");
          return;
        }

        const restored = await maybeRestoreCachedTranslation(false, false);
        if (restored) {
          setStatusMessage("已加载新设置对应的缓存译文", "success");
        } else {
          setStatusMessage(
            hadTranslatedContent ? "翻译设置已更新，请重新翻译" : "已保存翻译设置",
            hadTranslatedContent ? "info" : "success"
          );
        }
      } else {
        setStatusMessage("已保存翻译设置", "success");
      }
    } catch (error) {
      setSettingsStatus(error instanceof Error ? error.message : "保存设置失败", "error");
      return;
    } finally {
      setButtonDisabled(drawerRefs.settingsSaveButton, false);
    }
  };

  const refreshSource = async (options?: {
    announce?: boolean;
    activateCachedTranslation?: boolean;
  }) => {
    const announce = options?.announce ?? false;
    const activateCachedTranslation = options?.activateCachedTranslation ?? false;

    await loadSettings();

    const nextSourceDoc = extractDocFromNotion();
    const nextSourceHash = hashDoc(nextSourceDoc);
    const nextSourcePageKey = getCurrentPageKey();
    const previousSourceHash = sourceHash;
    const previousSourcePageKey = sourcePageKey;
    const pageChanged = Boolean(previousSourcePageKey) && previousSourcePageKey !== nextSourcePageKey;
    const sourceChanged = Boolean(previousSourceHash) && previousSourceHash !== nextSourceHash;
    const hadTranslatedContent = Boolean(translatedDoc);

    if (pageChanged || sourceChanged) {
      cancelActiveTranslation(false);
      clearTranslatedContent();
      cancelImagePreload();
      imageMap = new Map();
      translationState = !pageChanged && hadTranslatedContent ? "stale" : "idle";
      contentMode = "original";
    }

    sourceDoc = nextSourceDoc;
    sourceHash = nextSourceHash;
    sourcePageKey = nextSourcePageKey;
    sourceLanguage = detectDocLanguage(nextSourceDoc);
    rebuildRenderedContent();
    startImagePreload(nextSourceDoc);

    if (sourceLanguage !== "unknown" && sourceLanguage === translationSettings.targetLanguage) {
      clearTranslatedContent();
      translationState = "idle";
      contentMode = "original";
      syncControlState();
      setStatusMessage(
        `当前文章已是${getLanguageLabel(sourceLanguage)}，无需翻译到${getLanguageLabel(
          translationSettings.targetLanguage
        )}`,
        "info"
      );
      return;
    }

    const restored = await maybeRestoreCachedTranslation(
      activateCachedTranslation || contentMode === "translated",
      false
    );

    syncControlState();

    if (pageChanged) {
      if (restored) {
        setStatusMessage("已切换页面，已恢复匹配的缓存译文", "success");
      } else if (hadTranslatedContent || announce) {
        setStatusMessage("已切换到新页面", "success");
      }
      return;
    }

    if (sourceChanged) {
      if (restored) {
        setStatusMessage("原文已更新，已恢复匹配的缓存译文", "success");
      } else if (hadTranslatedContent) {
        setStatusMessage("原文已更新，译文已失效，请重新翻译", "info");
      } else if (announce) {
        setStatusMessage("已刷新内容", "success");
      }
      return;
    }

    if (announce) {
      setStatusMessage(restored ? "已刷新并恢复缓存译文" : "已刷新内容", "success");
    }
  };

  const closeDrawer = () => {
    if (!drawer || closing) return;

    closing = true;
    suppressNextTranslationDisconnect = Boolean(translationPort);
    translationPort?.disconnect();
    translationPort = null;
    cancelImagePreload();
    imageMap = new Map();
    activeThemeMenu = null;
    activeThemeWrapper = null;

    drawer.style.animation = "0.25s ease-in-out 0s 1 normal forwards running sliceOut";
    setTimeout(() => {
      drawer?.remove();
      drawer = null;
      drawerRefs = null;
      closing = false;
    }, 250);
  };

  const ensureDrawer = () => {
    if (drawer && drawerRefs) return;

    drawerRefs = createDrawer();
    drawer = drawerRefs.container;
    activeThemeWrapper = drawerRefs.themeWrapper;
    activeThemeMenu = drawerRefs.themeMenu;

    updateThemeButton();
    updateFontButtons();
    syncSettingsForm();
    syncControlState();

    const themeItems: Array<{ preset: ThemePreset; item: HTMLDivElement }> = [];

    const updateThemeMenu = () => {
      themeItems.forEach(({ preset, item }) => {
        item.style.color = preset.id === currentTheme.id ? ACCENT : "#111827";
      });
    };

    drawerRefs.themeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      drawerRefs!.themeMenu.style.display =
        drawerRefs!.themeMenu.style.display === "none" ? "block" : "none";
    });

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
        drawerRefs?.themeMenu.style.setProperty("display", "none");
        rebuildRenderedContent();
        syncControlState();
      });
      drawerRefs!.themeMenu.appendChild(item);
      themeItems.push({ preset, item });
    });

    drawerRefs.fontButtons.forEach(({ font, button }) => {
      button.addEventListener("click", () => {
        currentFont = font;
        updateFontButtons();
        rebuildRenderedContent();
        syncControlState();
      });
    });

    drawerRefs.sizeDown.addEventListener("click", () => {
      fontScale = Math.max(0.9, Math.round((fontScale - 0.05) * 100) / 100);
      rebuildRenderedContent();
      syncControlState();
    });

    drawerRefs.sizeUp.addEventListener("click", () => {
      fontScale = Math.min(1.15, Math.round((fontScale + 0.05) * 100) / 100);
      rebuildRenderedContent();
      syncControlState();
    });

    drawerRefs.originalContentButton.addEventListener("click", () => {
      contentMode = "original";
      renderPreview();
      syncControlState();
    });

    drawerRefs.translatedContentButton.addEventListener("click", () => {
      if (!translatedDoc) return;
      contentMode = "translated";
      renderPreview();
      syncControlState();
    });

    drawerRefs.wechatPreviewButton.addEventListener("click", () => {
      previewMode = "wechat";
      renderPreview();
      syncControlState();
    });

    drawerRefs.markdownPreviewButton.addEventListener("click", () => {
      previewMode = "markdown";
      renderPreview();
      syncControlState();
    });

    drawerRefs.translateButton.addEventListener("click", () => {
      void startTranslation();
    });

    drawerRefs.settingsButton.addEventListener("click", () => {
      void openSettings();
    });

    drawerRefs.settingsInputs.targetLanguageButtons.forEach(({ option, button }) => {
      bindPressAction(button, () => {
        if (!drawerRefs) return;
        drawerRefs.settingsInputs.targetLanguageSegment.dataset.value = option.value;
        syncTargetLanguageButtons();
      });
    });

    bindPressAction(drawerRefs.settingsCloseButton, () => {
      closeSettings();
    });

    bindPressAction(drawerRefs.settingsInputs.apiKeyToggleButton, () => {
      if (!drawerRefs) return;
      const nextVisible = drawerRefs.settingsInputs.apiKeyInput.type === "password";
      drawerRefs.settingsInputs.apiKeyInput.type = nextVisible ? "text" : "password";
      setApiKeyToggleVisual(drawerRefs.settingsInputs.apiKeyToggleButton, nextVisible);
      drawerRefs.settingsInputs.apiKeyInput.focus();
      const length = drawerRefs.settingsInputs.apiKeyInput.value.length;
      try {
        drawerRefs.settingsInputs.apiKeyInput.setSelectionRange(length, length);
      } catch (error) {
        // Ignore selection errors for unsupported input states.
      }
    });

    bindPressAction(drawerRefs.settingsCancelButton, () => {
      closeSettings();
    });

    bindPressAction(drawerRefs.settingsSaveButton, () => {
      void saveSettings();
    });

    drawerRefs.settingsOverlay.addEventListener("click", (event) => {
      if (event.target === drawerRefs?.settingsOverlay) {
        closeSettings();
      }
    });

    drawerRefs.settingsPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    drawerRefs.refreshButton.addEventListener("click", () => {
      void refreshSource({ announce: true, activateCachedTranslation: contentMode === "translated" });
    });

    drawerRefs.copyStatusButton.addEventListener("click", async () => {
      const message = getVisibleStatusMessage().trim();
      if (!message) return;

      try {
        await navigator.clipboard.writeText(message);
        if (!drawerRefs) return;
        drawerRefs.copyStatusButton.innerHTML = CHECK_ICON;
        window.setTimeout(() => {
          if (!drawerRefs) return;
          drawerRefs.copyStatusButton.innerHTML = COPY_ICON;
        }, 1200);
      } catch (error) {
        setStatusMessage("复制消息失败，请检查剪贴板权限", "error");
      }
    });

    drawerRefs.copyAllButton.addEventListener("click", async () => {
      const html = getCurrentHtml();
      const text = getCurrentText();
      if (!html.trim()) {
        setStatusMessage("未检测到可复制内容", "error");
        return;
      }

      try {
        await writeClipboard(html, text);
        setStatusMessage(
          contentMode === "translated" ? "已复制译文为公众号格式" : "已复制原文为公众号格式",
          "success"
        );
      } catch (error) {
        setStatusMessage("复制失败，请重试", "error");
      }
    });

    drawerRefs.copyMarkdownButton.addEventListener("click", async () => {
      const markdown = getCurrentMarkdown();
      if (!markdown.trim()) {
        setStatusMessage("未检测到可复制内容", "error");
        return;
      }

      try {
        await navigator.clipboard.writeText(markdown);
        setStatusMessage(
          contentMode === "translated" ? "已复制译文为 Markdown" : "已复制原文为 Markdown",
          "success"
        );
      } catch (error) {
        setStatusMessage("复制失败，请重试", "error");
      }
    });

    if (!outsideListenerAttached) {
      outsideListenerAttached = true;
      document.addEventListener("click", (event) => {
        const target = event.target as Node;

        if (activeThemeWrapper && activeThemeMenu && !activeThemeWrapper.contains(target)) {
          activeThemeMenu.style.display = "none";
        }

        if (drawer && !drawer.contains(target)) {
          closeDrawer();
        }
      });
    }

    if (!settingsGuardAttached) {
      settingsGuardAttached = true;
      const guardSettingsInteraction = (event: Event) => {
        if (!drawerRefs || drawerRefs.settingsOverlay.style.display !== "flex") return;
        const target = event.target as Node | null;
        if (!target || !drawerRefs.settingsPanel.contains(target)) return;
        event.stopPropagation();
      };

      [
        "keydown",
        "keyup",
        "keypress",
        "beforeinput",
        "input",
        "focusin"
      ].forEach((eventName) => {
        window.addEventListener(eventName, guardSettingsInteraction, true);
      });
    }

    document.body.appendChild(drawer);

    void (async () => {
      await refreshSource({ announce: false, activateCachedTranslation: false });
      syncTranslationStateFromBackground();
      syncControlState();
    })();
  };

  const toggleDrawer = () => {
    if (drawer) {
      closeDrawer();
      return;
    }

    ensureDrawer();
  };

  return { toggleDrawer };
};
