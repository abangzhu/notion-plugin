import { writeClipboard } from "./clipboard";
import { extractDoc, getPageKey } from "./platform";
import { renderDocToHtml, renderDocToMarkdown, renderDocToText } from "./renderer";
import {
  IMAGE_MODELS,
  STYLE_PRESET_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  TRANSLATION_MODELS,
  type TranslationModelConfig
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
  DEFAULT_FORMATTING_SETTINGS,
  FORMATTING_PORT_NAME,
  FORMATTING_SETTINGS_KEY,
  hashFormatting,
  normalizeFormattingSettings
} from "./formatting";
import {
  applyEnhancementsToDoc,
  DEFAULT_ILLUSTRATION_SETTINGS,
  hashIllustration,
  ILLUSTRATION_PORT_NAME,
  ILLUSTRATION_SETTINGS_KEY,
  normalizeIllustrationSettings
} from "./illustration";
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
import type {
  FormattingAggressiveness,
  FormattingBackgroundState,
  FormattingOperation,
  FormattingPortServerMessage,
  FormattingSettings,
  FormattingState
} from "./formatting";
import type {
  IllustrationBackgroundState,
  IllustrationItem,
  IllustrationPortServerMessage,
  IllustrationSettings,
  IllustrationState
} from "./illustration";
import type { RenderOptions, ThemeColors, Typography } from "./theme";
import type { Doc } from "./types";
import {
  buildImageMap,
  extractImageUrls,
  preloadImages,
  type ImageMap
} from "./image-loader";
import { testApiConnection } from "./translation-service";
import type { ApiTestResult } from "./translation-service";

const DRAWER_ID = "__notion_wechat_drawer";
const DRAWER_STYLE_ID = "__notion_wechat_drawer_style";
const DRAWER_WIDTH_KEY = "drawerWidth";
const DRAWER_MIN_WIDTH = 380;
const DRAWER_DEFAULT_WIDTH = 686;
const ACCENT = "#10b981";
const TRANSLATION_CACHE_PREFIX = "translationCache";
const FORMATTING_CACHE_PREFIX = "formattingCache";
const ILLUSTRATION_CACHE_PREFIX = "illustrationCache";


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

type FormattingCacheEntry = {
  operations: FormattingOperation[];
  createdAt: number;
};

type IllustrationCacheEntry = {
  items: IllustrationItem[];
  createdAt: number;
};

const THEME_PRESETS: ThemePreset[] = [
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

const createCollapsibleSection = (
  title: string,
  expanded: boolean,
  fields: HTMLElement[]
): HTMLElement => {
  const section = document.createElement("div");
  section.style.borderTop = "1px solid #f1f5f9";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;padding:12px 0 8px;cursor:pointer;user-select:none;";
  const label = document.createElement("span");
  label.textContent = title;
  label.style.cssText = "font-size:12px;font-weight:700;color:#374151;";
  const arrow = document.createElement("span");
  arrow.textContent = expanded ? "▾" : "▸";
  arrow.style.cssText = "font-size:11px;color:#9ca3af;transition:transform 0.15s;";
  header.appendChild(label);
  header.appendChild(arrow);

  const body = document.createElement("div");
  body.style.cssText = `display:${expanded ? "flex" : "none"};flex-direction:column;gap:16px;padding-bottom:8px;`;
  fields.forEach((field) => body.appendChild(field));

  header.addEventListener("click", () => {
    const isOpen = body.style.display !== "none";
    body.style.display = isOpen ? "none" : "flex";
    arrow.textContent = isOpen ? "▸" : "▾";
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
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
@keyframes toastIn {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes toastOut {
  from { transform: translateY(0); opacity: 1; }
  to { transform: translateY(20px); opacity: 0; }
}
`;
  document.head.appendChild(style);
};

const showToast = (message: string) => {
  const existing = document.getElementById("n2w-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "n2w-toast";
  toast.textContent = message;
  toast.style.cssText =
    "position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 20px;border-radius:8px;font-size:13px;z-index:2147483647;pointer-events:none;animation:toastIn 0.25s ease-out;font-family:-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.2);";

  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.style.animation = "toastOut 0.25s ease-in forwards";
    window.setTimeout(() => toast.remove(), 250);
  }, 2000);
};

const createDrawer = () => {
  ensureDrawerStyles();

  const container = document.createElement("div");
  container.id = DRAWER_ID;
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.right = "0";
  container.style.height = "100vh";
  container.style.width = `min(${DRAWER_DEFAULT_WIDTH}px, 100vw)`;
  container.style.zIndex = "2147483647";
  container.style.background = "#f5f5f5";
  container.style.boxShadow = "-4px 0 20px rgba(0,0,0,0.12)";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.fontFamily = FONT_STACK_DEFAULT;
  container.style.animation = "0.3s ease-in-out 0s 1 normal none running sliceIn";
  container.style.overflow = "hidden";

  // 左缘拖拽手柄：抽屉锚定右侧，指针左移 → 宽度增大。
  const resizeHandle = document.createElement("div");
  resizeHandle.style.position = "absolute";
  resizeHandle.style.top = "0";
  resizeHandle.style.left = "0";
  resizeHandle.style.width = "10px";
  resizeHandle.style.height = "100%";
  resizeHandle.style.cursor = "ew-resize";
  resizeHandle.style.zIndex = "60";
  resizeHandle.style.background = "transparent";
  resizeHandle.title = "拖拽调整抽屉宽度";

  const resizeGrip = document.createElement("div");
  resizeGrip.style.position = "absolute";
  resizeGrip.style.top = "50%";
  resizeGrip.style.left = "3px";
  resizeGrip.style.width = "4px";
  resizeGrip.style.height = "48px";
  resizeGrip.style.transform = "translateY(-50%)";
  resizeGrip.style.borderRadius = "999px";
  resizeGrip.style.background = "#d1d5db";
  resizeGrip.style.transition = "background 0.15s ease";
  resizeHandle.appendChild(resizeGrip);

  let resizing = false;

  const applyDrawerWidth = (width: number) => {
    const max = Math.max(DRAWER_MIN_WIDTH, window.innerWidth);
    const clamped = Math.min(max, Math.max(DRAWER_MIN_WIDTH, Math.round(width)));
    container.style.width = `${clamped}px`;
  };

  resizeHandle.addEventListener("mouseenter", () => {
    resizeGrip.style.background = ACCENT;
  });
  resizeHandle.addEventListener("mouseleave", () => {
    if (!resizing) resizeGrip.style.background = "#d1d5db";
  });

  resizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    resizing = true;
    const startX = event.clientX;
    const startWidth = container.getBoundingClientRect().width;
    resizeHandle.setPointerCapture(event.pointerId);
    container.style.animation = "none"; // 拖拽时禁用入场动画干扰
    resizeGrip.style.background = ACCENT;
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: PointerEvent) => {
      if (!resizing) return;
      applyDrawerWidth(startWidth + (startX - moveEvent.clientX));
    };

    const onUp = () => {
      resizing = false;
      document.body.style.userSelect = "";
      resizeGrip.style.background = "#d1d5db";
      resizeHandle.removeEventListener("pointermove", onMove);
      resizeHandle.removeEventListener("pointerup", onUp);
      const finalWidth = container.getBoundingClientRect().width;
      void chrome.storage.local
        .set({ [DRAWER_WIDTH_KEY]: finalWidth })
        .catch(() => undefined);
    };

    resizeHandle.addEventListener("pointermove", onMove);
    resizeHandle.addEventListener("pointerup", onUp);
  });

  // 恢复上次保存的宽度（异步，创建后立即应用）
  void chrome.storage.local
    .get(DRAWER_WIDTH_KEY)
    .then((stored) => {
      const saved = Number(stored?.[DRAWER_WIDTH_KEY]);
      if (Number.isFinite(saved) && saved > 0) applyDrawerWidth(saved);
    })
    .catch(() => undefined);

  const toolbar = document.createElement("div");
  toolbar.style.padding = "16px";
  toolbar.style.background = "#ffffff";
  toolbar.style.borderBottom = "1px solid #ededed";
  toolbar.style.display = "flex";
  toolbar.style.flexDirection = "column";
  toolbar.style.gap = "12px";
  toolbar.style.position = "relative";
  toolbar.style.zIndex = "5";

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

  const formatControls = createLoadingButton("智能排版");
  const formatButton = formatControls.button;
  const formatSpinner = formatControls.spinner;
  const formatLabel = formatControls.labelElement;

  const illustrateControls = createLoadingButton("智能配图");
  const illustrateButton = illustrateControls.button;
  const illustrateSpinner = illustrateControls.spinner;
  const illustrateLabel = illustrateControls.labelElement;

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

  const formatSegment = document.createElement("div");
  formatSegment.style.display = "none";
  formatSegment.style.gap = "6px";
  formatSegment.style.padding = "4px";
  formatSegment.style.border = "1px solid #e5e7eb";
  formatSegment.style.borderRadius = "14px";
  formatSegment.style.background = "#fff";

  const originalFormatButton = createSegment("原稿", true);
  const formattedFormatButton = createSegment("增强稿");
  formatSegment.appendChild(originalFormatButton);
  formatSegment.appendChild(formattedFormatButton);

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
  rowTopLeft.appendChild(formatButton);
  rowTopLeft.appendChild(illustrateButton);
  rowTopLeft.appendChild(contentSegment);
  rowTopLeft.appendChild(formatSegment);
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
  themeWrapper.style.zIndex = "30";

  const themeButton = document.createElement("button");
  themeButton.style.border = `2px solid ${ACCENT}`;
  themeButton.style.background = "#fff";
  themeButton.style.borderRadius = "14px";
  themeButton.style.padding = "8px 14px";
  themeButton.style.fontSize = "13px";
  themeButton.style.fontWeight = "700";
  themeButton.style.cursor = "pointer";

  const themeMenu = document.createElement("div");
  themeMenu.style.position = "fixed";
  themeMenu.style.width = "180px";
  themeMenu.style.background = "#fff";
  themeMenu.style.borderRadius = "14px";
  themeMenu.style.boxShadow = "0 18px 30px rgba(0,0,0,0.15)";
  themeMenu.style.border = "1px solid #eee";
  themeMenu.style.padding = "8px";
  themeMenu.style.display = "none";
  themeMenu.style.zIndex = "2147483647";
  themeMenu.style.maxHeight = "min(420px, calc(100vh - 96px))";
  themeMenu.style.overflowY = "auto";
  themeMenu.style.boxSizing = "border-box";

  themeWrapper.appendChild(themeButton);

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

  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.textContent = "重试";
  retryButton.style.border = `1px solid ${ACCENT}`;
  retryButton.style.background = ACCENT;
  retryButton.style.color = "#fff";
  retryButton.style.borderRadius = "8px";
  retryButton.style.padding = "4px 10px";
  retryButton.style.fontSize = "12px";
  retryButton.style.fontWeight = "600";
  retryButton.style.cursor = "pointer";
  retryButton.style.display = "none";
  retryButton.style.flexShrink = "0";
  rowBottom.appendChild(retryButton);

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
  settingsOverlay.style.zIndex = "50";

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
  settingsTitle.textContent = "翻译与排版设置";
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

  const modelInput = createTextInput("text");
  modelInput.placeholder = "输入模型 ID";

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

  const aggressivenessSelect = createSelect([
    { value: "conservative", label: "保守" },
    { value: "balanced", label: "均衡" },
    { value: "bold", label: "大胆" }
  ]);
  const formattingExtraInstructionsInput = createTextArea(4);

  const maxImagesSelect = createSelect([
    { value: "2", label: "2 张" },
    { value: "3", label: "3 张" },
    { value: "4", label: "4 张" }
  ]);

  const illustrationStylePromptInput = createTextArea(3);

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

  // 给 input 包一层 relative 容器并附加右侧复制按钮
  const makeInputControl = (input: HTMLInputElement): { control: HTMLDivElement; copyButton: HTMLButtonElement } => {
    const control = document.createElement("div");
    control.style.position = "relative";
    control.style.display = "flex";
    control.style.alignItems = "center";
    control.style.width = "100%";
    const copyButton = createIconButton();
    copyButton.innerHTML = COPY_ICON;
    copyButton.title = "复制";
    copyButton.setAttribute("aria-label", "复制");
    copyButton.style.position = "absolute";
    copyButton.style.top = "50%";
    copyButton.style.right = "8px";
    copyButton.style.transform = "translateY(-50%)";
    copyButton.addEventListener("click", async () => {
      const text = input.value.trim();
      if (!text) return;
      await navigator.clipboard.writeText(text).catch(() => {});
      copyButton.innerHTML = CHECK_ICON;
      globalThis.setTimeout(() => { copyButton.innerHTML = COPY_ICON; }, 1500);
    });
    input.style.paddingRight = "42px";
    control.appendChild(input);
    control.appendChild(copyButton);
    return { control, copyButton };
  };

  const baseURLInput = createTextInput("url");
  baseURLInput.placeholder = "留空使用 OpenAI 官方接口（如 https://your-gateway.com/v1）";
  styleControl(baseURLInput);
  const { control: baseURLControl, copyButton: baseURLCopyButton } = makeInputControl(baseURLInput);

  styleControl(modelInput);

  // input + 复制按钮 + 可点击建议 chips（避免原生 datalist 在扩展 content script 中被事件拦截）
  const makeModelField = (
    input: HTMLInputElement,
    models: TranslationModelConfig[]
  ): { wrapper: HTMLDivElement; copyButton: HTMLButtonElement } => {
    const { control, copyButton } = makeInputControl(input);

    const chipsRow = document.createElement("div");
    chipsRow.style.display = "flex";
    chipsRow.style.flexWrap = "wrap";
    chipsRow.style.gap = "6px";
    chipsRow.style.marginTop = "6px";

    const chips = models.map((model) => {
      const chip = createSegment(model.label, false);
      // mousedown 代替 click：bindClickableControl 内部用 pointerdown/preventDefault 会吞掉 click 事件
      chip.addEventListener("mousedown", (e) => {
        e.preventDefault(); // 阻止 input 失焦
        input.value = model.id;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        syncChips();
      });
      chipsRow.appendChild(chip);
      return { model, chip };
    });

    const syncChips = () => {
      chips.forEach(({ model, chip }) => applySegmentStyle(chip, input.value === model.id));
    };

    input.addEventListener("input", syncChips);
    syncChips();

    const wrapper = document.createElement("div");
    wrapper.appendChild(control);
    wrapper.appendChild(chipsRow);
    return { wrapper, copyButton };
  };

  const { wrapper: modelWrapper, copyButton: modelCopyButton } = makeModelField(modelInput, TRANSLATION_MODELS);

  const imageModelInput = createTextInput("text");
  imageModelInput.placeholder = "输入图片模型 ID";
  styleControl(imageModelInput);
  const { wrapper: imageModelWrapper, copyButton: imageModelCopyButton } = makeModelField(imageModelInput, IMAGE_MODELS);

  const basicFields = [
    createField("API Key", apiKeyControl, "", false),
    createField("API 地址", baseURLControl, "LiteLLM Gateway 或 OpenAI 兼容网关地址，留空使用官方接口"),
    createField("语言模型", modelWrapper, "翻译和排版使用；支持 OpenAI / Claude 系列", false),
    createField("目标语言", targetLanguageSegment, "", false),
    createField("翻译模式", modeSelect)
  ];
  const styleFields = [
    createField("目标读者", audienceSelect),
    createField("风格预设", stylePresetSelect),
    createField("术语表", glossaryInput, "一行一个术语或映射"),
    createField("保留术语", preserveTermsInput, "这些词会被要求保留原文"),
    createField("额外说明", extraInstructionsInput)
  ];
  const advancedFields = [
    createField("分块阈值", chunkThresholdInput, "超过该字数后启用分块翻译"),
    createField("每块最大单元数", chunkMaxUnitsInput)
  ];
  const formattingFields = [
    createField("排版力度", aggressivenessSelect, "保守=高置信才改；大胆=积极重构版式"),
    createField("额外说明", formattingExtraInstructionsInput, "对智能排版的额外要求（不会改动正文文字）")
  ];
  const illustrationFields = [
    createField("图片模型", imageModelWrapper, "生图使用；留空回退到语言模型", false),
    createField("配图数量上限", maxImagesSelect, "16:9 宽图；生图较慢，数量越多越慢"),
    createField(
      "风格提示词",
      illustrationStylePromptInput,
      "英文最佳，拼到内置极简风之后。例：warm pastel tones, hand-drawn texture"
    )
  ];

  settingsBody.appendChild(createCollapsibleSection("基础配置", true, basicFields));
  settingsBody.appendChild(createCollapsibleSection("翻译风格", false, styleFields));
  settingsBody.appendChild(createCollapsibleSection("智能排版", false, formattingFields));
  settingsBody.appendChild(createCollapsibleSection("智能配图", false, illustrationFields));
  settingsBody.appendChild(createCollapsibleSection("高级选项", false, advancedFields));

  [
    apiKeyInput,
    baseURLInput,
    modelInput,
    imageModelInput,
    modeSelect,
    audienceSelect,
    stylePresetSelect,
    glossaryInput,
    preserveTermsInput,
    extraInstructionsInput,
    chunkThresholdInput,
    chunkMaxUnitsInput,
    aggressivenessSelect,
    formattingExtraInstructionsInput,
    maxImagesSelect,
    illustrationStylePromptInput
  ].forEach((control) => bindEditableControl(control));
  bindClickableControl(apiKeyToggleButton);
  [baseURLCopyButton, modelCopyButton, imageModelCopyButton].forEach((btn) => bindClickableControl(btn));

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
  settingsActions.style.justifyContent = "space-between";
  settingsActions.style.alignItems = "center";

  const settingsTestButton = createButton("测试连接", "ghost");
  const settingsCancelButton = createButton("取消", "ghost");
  const settingsSaveButton = createButton("保存设置", "primary");

  const settingsRightActions = document.createElement("div");
  settingsRightActions.style.display = "flex";
  settingsRightActions.style.gap = "10px";

  bindClickableControl(settingsTestButton);
  bindClickableControl(settingsCloseButton);
  bindClickableControl(settingsCancelButton);
  bindClickableControl(settingsSaveButton);
  settingsRightActions.appendChild(settingsCancelButton);
  settingsRightActions.appendChild(settingsSaveButton);
  settingsActions.appendChild(settingsTestButton);
  settingsActions.appendChild(settingsRightActions);

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
  container.appendChild(resizeHandle);

  return {
    container,
    previewPage,
    status,
    retryButton,
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
    formatButton,
    formatSpinner,
    formatLabel,
    illustrateButton,
    illustrateSpinner,
    illustrateLabel,
    formatSegment,
    originalFormatButton,
    formattedFormatButton,
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
    settingsTestButton,
    settingsStatus,
    settingsInputs: {
      apiKeyInput,
      apiKeyToggleButton,
      baseURLInput,
      modelInput,
      imageModelInput,
      targetLanguageSegment,
      targetLanguageButtons,
      modeSelect,
      audienceSelect,
      stylePresetSelect,
      glossaryInput,
      preserveTermsInput,
      extraInstructionsInput,
      chunkThresholdInput,
      chunkMaxUnitsInput,
      aggressivenessSelect,
      formattingExtraInstructionsInput,
      maxImagesSelect,
      illustrationStylePromptInput
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
  let drawerOpenedAt = 0;

  let testConnectionController: AbortController | null = null;

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

  // 增强管线：存操作（排版指令 + 配图项），enhancedDoc 按 base 派生，可叠加。
  // enhancedDoc = applyIllustrations(applyFormatting(base, formatOps), illustrations)
  let formatOps: FormattingOperation[] | null = null;
  let illustrations: IllustrationItem[] | null = null;
  let enhancedDoc: Doc | null = null;
  let enhancedHtml = "";
  let enhancedText = "";
  let enhancedMarkdown = "";
  let showEnhanced = false;
  let enhancedBaseMode: PreviewContentMode = "original";

  let previewMode: PreviewFormatMode = "wechat";
  let contentMode: PreviewContentMode = "original";
  let translationState: TranslationState = "idle";
  let translationJobId = "";
  let translationPort: chrome.runtime.Port | null = null;
  let suppressNextTranslationDisconnect = false;
  let translationDisconnectRecoveryId = 0;

  let formattingState: FormattingState = "idle";
  let formattingJobId = "";
  let formattingPort: chrome.runtime.Port | null = null;
  let suppressNextFormattingDisconnect = false;

  let illustrationState: IllustrationState = "idle";
  let illustrationJobId = "";
  let illustrationPort: chrome.runtime.Port | null = null;
  let suppressNextIllustrationDisconnect = false;

  let currentTheme = THEME_PRESETS[0];
  let currentFont = FONT_PRESETS[0];
  let fontScale = 1;

  let translationSettings = DEFAULT_TRANSLATION_SETTINGS;
  let settingsLoadPromise: Promise<void> | null = null;

  let formattingSettings = DEFAULT_FORMATTING_SETTINGS;
  let formattingSettingsLoadPromise: Promise<void> | null = null;

  let illustrationSettings = DEFAULT_ILLUSTRATION_SETTINGS;
  let illustrationSettingsLoadPromise: Promise<void> | null = null;

  let statusMessage = "";
  let statusTone: StatusTone = "info";
  let translationStatusMessage = "";
  let formattingStatusMessage = "";
  let illustrationStatusMessage = "";

  let imageMap: ImageMap = new Map();
  let imagePreloadAborted = false;

  const getLanguageLabel = (language: DetectedLanguage | string): string => {
    if (language === "zh-CN") return "中文";
    if (language === "en") return "English";
    return "当前语言";
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

  const isJobStatusActive = (): boolean =>
    (translationState === "translating" && translationStatusMessage.trim().length > 0) ||
    (formattingState === "formatting" && formattingStatusMessage.trim().length > 0) ||
    (illustrationState === "illustrating" && illustrationStatusMessage.trim().length > 0);

  const getVisibleStatusMessage = (): string => {
    if (translationState === "translating" && translationStatusMessage.trim().length > 0) {
      return translationStatusMessage;
    }
    if (formattingState === "formatting" && formattingStatusMessage.trim().length > 0) {
      return formattingStatusMessage;
    }
    if (illustrationState === "illustrating" && illustrationStatusMessage.trim().length > 0) {
      return illustrationStatusMessage;
    }
    return statusMessage;
  };

  const setStatusTone = (element: HTMLElement, tone: StatusTone) => {
    element.style.color =
      tone === "success" ? "#047857" : tone === "error" ? "#b91c1c" : "#6b7280";
  };

  const updateStatus = () => {
    if (!drawerRefs) return;
    const usingJobStatus = isJobStatusActive();
    const visibleStatusMessage = getVisibleStatusMessage();
    drawerRefs.status.textContent = visibleStatusMessage;
    drawerRefs.status.title = visibleStatusMessage;
    setStatusTone(drawerRefs.status, usingJobStatus ? "info" : statusTone);
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

  const setFormattingStatus = (message: string) => {
    formattingStatusMessage = message;
    updateStatus();
  };

  const setIllustrationStatus = (message: string) => {
    illustrationStatusMessage = message;
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

  // 增强稿仅在它所基于的 base 视图（原文/译文）下可切换显示
  const isEnhancedActive = (): boolean =>
    showEnhanced && !!enhancedDoc && enhancedBaseMode === contentMode;

  const getCurrentHtml = (): string => {
    if (isEnhancedActive()) return enhancedHtml;
    if (contentMode === "translated" && translatedDoc) return translatedHtml;
    return originalHtml;
  };

  const getCurrentMarkdown = (): string => {
    if (isEnhancedActive()) return enhancedMarkdown;
    if (contentMode === "translated" && translatedDoc) return translatedMarkdown;
    return originalMarkdown;
  };

  const getCurrentText = (): string => {
    if (isEnhancedActive()) return enhancedText;
    if (contentMode === "translated" && translatedDoc) return translatedText;
    return originalText;
  };

  // 当前增强的 base（按 contentMode 取原文/译文）
  const currentBaseDoc = (): Doc | null =>
    contentMode === "translated" && translatedDoc ? translatedDoc : sourceDoc;

  // 按 enhancedBaseMode 取增强所基于的 base
  const enhancedBaseDoc = (): Doc | null =>
    enhancedBaseMode === "translated" && translatedDoc ? translatedDoc : sourceDoc;

  // 增强稿派生：排版 + 配图均锚定 base 索引，组合应用（顺序无关，配图不因重排而错位/消失）
  const computeEnhancedDoc = (): Doc | null => {
    const base = enhancedBaseDoc();
    if (!base) return null;
    if (!formatOps && !illustrations) return null;
    return applyEnhancementsToDoc(base, formatOps ?? [], illustrations ?? []);
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

    enhancedDoc = computeEnhancedDoc();
    if (enhancedDoc) {
      enhancedHtml = renderDocToHtml(enhancedDoc, renderOptions, imageMap);
      enhancedText = renderDocToText(enhancedDoc);
      enhancedMarkdown = renderDocToMarkdown(enhancedDoc);
    } else {
      enhancedHtml = "";
      enhancedText = "";
      enhancedMarkdown = "";
    }

    renderPreview();
  };

  const clearEnhancedContent = () => {
    formatOps = null;
    illustrations = null;
    enhancedDoc = null;
    enhancedHtml = "";
    enhancedText = "";
    enhancedMarkdown = "";
    showEnhanced = false;
  };

  const clearTranslatedContent = () => {
    translatedDoc = null;
    translatedHtml = "";
    translatedText = "";
    translatedMarkdown = "";
    if (contentMode === "translated") {
      contentMode = "original";
    }
    // 译文消失后，基于译文的增强（排版/配图）也失效
    if (enhancedBaseMode === "translated") {
      clearEnhancedContent();
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
    settingsInputs.baseURLInput.value = translationSettings.baseURL;
    settingsInputs.modelInput.value = translationSettings.model;
    settingsInputs.modelInput.dispatchEvent(new Event("input"));
    settingsInputs.imageModelInput.value = illustrationSettings.model;
    settingsInputs.imageModelInput.dispatchEvent(new Event("input"));
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
    settingsInputs.aggressivenessSelect.value = formattingSettings.aggressiveness;
    settingsInputs.formattingExtraInstructionsInput.value = formattingSettings.extraInstructions;
    ensureSelectValue(
      settingsInputs.maxImagesSelect,
      String(illustrationSettings.maxImages),
      `${illustrationSettings.maxImages} 张`
    );
    settingsInputs.illustrationStylePromptInput.value = illustrationSettings.stylePrompt;
  };

  const loadSettings = async () => {
    if (!settingsLoadPromise) {
      settingsLoadPromise = (async () => {
        if (!chrome.storage?.local) {
          translationSettings = normalizeTranslationSettings(undefined);
          syncSettingsForm();
          return;
        }
        const stored = await chrome.storage.local.get(TRANSLATION_SETTINGS_KEY);
        translationSettings = normalizeTranslationSettings(
          stored[TRANSLATION_SETTINGS_KEY] as Partial<TranslationSettings> | undefined
        );
        syncSettingsForm();
      })();
    }

    await settingsLoadPromise;
  };

  const loadFormattingSettings = async () => {
    if (!formattingSettingsLoadPromise) {
      formattingSettingsLoadPromise = (async () => {
        if (!chrome.storage?.local) {
          formattingSettings = normalizeFormattingSettings(undefined);
          return;
        }
        const stored = await chrome.storage.local.get(FORMATTING_SETTINGS_KEY);
        formattingSettings = normalizeFormattingSettings(
          stored[FORMATTING_SETTINGS_KEY] as Partial<FormattingSettings> | undefined
        );
        syncSettingsForm();
      })();
    }

    await formattingSettingsLoadPromise;
  };

  const loadIllustrationSettings = async () => {
    if (!illustrationSettingsLoadPromise) {
      illustrationSettingsLoadPromise = (async () => {
        if (!chrome.storage?.local) {
          illustrationSettings = normalizeIllustrationSettings(undefined);
          return;
        }
        const stored = await chrome.storage.local.get(ILLUSTRATION_SETTINGS_KEY);
        illustrationSettings = normalizeIllustrationSettings(
          stored[ILLUSTRATION_SETTINGS_KEY] as Partial<IllustrationSettings> | undefined
        );
        syncSettingsForm();
      })();
    }

    await illustrationSettingsLoadPromise;
  };

  const openSettings = async () => {
    if (!drawerRefs) return;
    await loadSettings();
    await loadFormattingSettings();
    await loadIllustrationSettings();
    syncSettingsForm();
    setSettingsStatus("");
    drawerRefs.settingsOverlay.style.display = "flex";
  };

  const closeSettings = () => {
    if (!drawerRefs) return;
    testConnectionController?.abort();
    testConnectionController = null;
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

    drawerRefs.retryButton.style.display = translationState === "error" ? "inline-block" : "none";

    // 增强稿（排版/配图叠加）：toggle 仅在 enhancedDoc 对应当前 base 视图时可见
    const enhancedToggleVisible = !!enhancedDoc && enhancedBaseMode === contentMode;
    drawerRefs.formatSegment.style.display = enhancedToggleVisible ? "flex" : "none";
    applySegmentStyle(drawerRefs.originalFormatButton, !showEnhanced);
    applySegmentStyle(drawerRefs.formattedFormatButton, showEnhanced && !!enhancedDoc);

    const hasFormatOps = !!formatOps && formatOps.length > 0;
    const formatDisabled = !sourceDoc || !sourceHash;
    drawerRefs.formatSpinner.style.display = formattingState === "formatting" ? "inline-block" : "none";
    drawerRefs.formatLabel.textContent =
      formattingState === "formatting" ? "排版中" : hasFormatOps ? "重新排版" : "智能排版";
    drawerRefs.formatButton.title =
      formattingState === "formatting"
        ? "点击取消智能排版"
        : formatDisabled
          ? "未检测到可排版内容"
          : "AI 智能排版：识别金句、要点、步骤等（不改动正文文字）";
    drawerRefs.formatButton.style.opacity =
      formattingState === "formatting" ? "0.92" : formatDisabled ? "0.48" : "1";
    drawerRefs.formatButton.style.cursor =
      formattingState === "formatting" ? "progress" : formatDisabled ? "not-allowed" : "pointer";
    drawerRefs.formatButton.disabled = formattingState !== "formatting" && formatDisabled;

    // 智能配图：base = 当前 base doc 排版后的结果
    const hasIllustrations = !!illustrations && illustrations.length > 0;
    const illustrateDisabled = !sourceDoc || !sourceHash;
    drawerRefs.illustrateSpinner.style.display =
      illustrationState === "illustrating" ? "inline-block" : "none";
    drawerRefs.illustrateLabel.textContent =
      illustrationState === "illustrating" ? "配图中" : hasIllustrations ? "重新配图" : "智能配图";
    drawerRefs.illustrateButton.title =
      illustrationState === "illustrating"
        ? "点击取消智能配图"
        : illustrateDisabled
          ? "未检测到可配图内容"
          : "AI 智能配图：在合适位置生成极简插画（可与排版叠加）";
    drawerRefs.illustrateButton.style.opacity =
      illustrationState === "illustrating" ? "0.92" : illustrateDisabled ? "0.48" : "1";
    drawerRefs.illustrateButton.style.cursor =
      illustrationState === "illustrating" ? "progress" : illustrateDisabled ? "not-allowed" : "pointer";
    drawerRefs.illustrateButton.disabled =
      illustrationState !== "illustrating" && illustrateDisabled;

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

  // === 智能排版编排（镜像翻译流程；只取 operations，正文文字始终从 base 搬运） ===

  const buildEffectiveFormattingSettings = (): FormattingSettings => ({
    ...formattingSettings,
    apiKey: translationSettings.apiKey,
    model: translationSettings.model
  });

  const getFormattingCacheKey = (base: Doc): string =>
    `${FORMATTING_CACHE_PREFIX}:${hashDoc(base)}:${hashFormatting(buildEffectiveFormattingSettings())}`;

  const readFormattingCache = async (base: Doc): Promise<FormattingCacheEntry | null> => {
    if (!chrome.storage.session) return null;
    const key = getFormattingCacheKey(base);
    const stored = await chrome.storage.session.get(key);
    return (stored[key] as FormattingCacheEntry | undefined) ?? null;
  };

  const persistFormattingCache = async (base: Doc, operations: FormattingOperation[]) => {
    if (!chrome.storage.session) return;
    const key = getFormattingCacheKey(base);
    await chrome.storage.session.set({
      [key]: { operations, createdAt: Date.now() } satisfies FormattingCacheEntry
    });
  };

  // 设置排版指令：存 ops、显示增强稿。结构变（ops 不同）→ 清空已有配图（旧位置失效）
  const setFormatOps = async (
    base: Doc,
    baseMode: PreviewContentMode,
    operations: FormattingOperation[],
    options?: { statusMessage?: string; persist?: boolean }
  ) => {
    // 配图锚定 base 索引，重排版后由 anchorOf 映射重新定位，无需清空（顺序无关）
    formatOps = operations;
    enhancedBaseMode = baseMode;
    formattingState = "success";
    formattingJobId = "";
    showEnhanced = true;
    setFormattingStatus("");
    rebuildRenderedContent();
    syncControlState();
    if (options?.statusMessage) {
      setStatusMessage(options.statusMessage, "success");
    }
    if (options?.persist ?? true) {
      await persistFormattingCache(base, operations);
    }
  };

  const maybeRestoreCachedFormatting = async (
    base: Doc,
    baseMode: PreviewContentMode
  ): Promise<boolean> => {
    const cached = await readFormattingCache(base);
    if (!cached?.operations) return false;
    await setFormatOps(base, baseMode, cached.operations, {
      statusMessage: "已加载缓存排版",
      persist: false
    });
    return true;
  };

  const cancelActiveFormatting = (showMessage = true) => {
    if (formattingState !== "formatting" || !formattingJobId) return;
    const port = formattingPort ?? ensureFormattingPort();
    port.postMessage({ type: "formatting/cancel", jobId: formattingJobId });
    formattingJobId = "";
    formattingState = formatOps ? "success" : "idle";
    setFormattingStatus("");
    syncControlState();
    if (showMessage) {
      setStatusMessage("智能排版已取消", "info");
    }
  };

  const handleBackgroundFormattingState = async (state: FormattingBackgroundState | null) => {
    if (!state) return;
    const base = currentBaseDoc();
    if (!base || hashDoc(base) !== state.sourceHash) return;

    const baseMode: PreviewContentMode =
      contentMode === "translated" && translatedDoc ? "translated" : "original";

    if (state.status === "formatting") {
      formattingJobId = state.jobId;
      formattingState = "formatting";
      enhancedBaseMode = baseMode;
      setFormattingStatus(getTranslationProgressMessage(state));
      syncControlState();
      return;
    }

    if (state.status === "success" && state.operations) {
      await setFormatOps(base, baseMode, state.operations, {
        statusMessage: "已恢复后台排版结果"
      });
      return;
    }

    formattingJobId = "";
    formattingState = formatOps ? "success" : "error";
    setFormattingStatus("");
    syncControlState();
    if (state.message) {
      setStatusMessage(state.message, "error");
    }
  };

  const handleFormattingMessage = (message: FormattingPortServerMessage) => {
    if (message.type === "formatting/state") {
      void handleBackgroundFormattingState(message.state);
      return;
    }

    if (!formattingJobId || message.jobId !== formattingJobId) return;

    if (message.type === "formatting/progress") {
      setFormattingStatus(getTranslationProgressMessage(message));
      syncControlState();
      return;
    }

    if (message.type === "formatting/result") {
      const base = enhancedBaseDoc() ?? currentBaseDoc();
      if (!base) {
        formattingJobId = "";
        formattingState = "idle";
        setFormattingStatus("");
        syncControlState();
        return;
      }
      const baseMode: PreviewContentMode =
        enhancedBaseMode === "translated" && translatedDoc ? "translated" : "original";
      void setFormatOps(base, baseMode, message.operations, { statusMessage: "智能排版完成" });
      return;
    }

    if (message.message === "智能排版已取消") {
      formattingJobId = "";
      formattingState = formatOps ? "success" : "idle";
      setFormattingStatus("");
      syncControlState();
      setStatusMessage("智能排版已取消", "info");
      return;
    }

    formattingJobId = "";
    formattingState = formatOps ? "success" : "error";
    setFormattingStatus("");
    syncControlState();
    setStatusMessage(message.message, "error");
  };

  const ensureFormattingPort = () => {
    if (formattingPort) return formattingPort;

    formattingPort = chrome.runtime.connect({ name: FORMATTING_PORT_NAME });
    formattingPort.onMessage.addListener((message) => {
      handleFormattingMessage(message as FormattingPortServerMessage);
    });
    formattingPort.onDisconnect.addListener(() => {
      formattingPort = null;
      if (suppressNextFormattingDisconnect) {
        suppressNextFormattingDisconnect = false;
        return;
      }
      if (formattingState === "formatting") {
        formattingJobId = "";
        formattingState = formatOps ? "success" : "error";
        setFormattingStatus("");
        syncControlState();
        setStatusMessage("智能排版连接已断开，请重试", "error");
      }
    });

    return formattingPort;
  };

  const syncFormattingStateFromBackground = () => {
    if (!sourceDoc || !sourceHash) return;
    ensureFormattingPort().postMessage({ type: "formatting/query-state" });
  };

  const startFormatting = async () => {
    if (formattingState === "formatting") {
      cancelActiveFormatting(true);
      return;
    }

    await loadSettings();
    await loadFormattingSettings();
    if (!sourceDoc) {
      await refreshSource({ announce: false, activateCachedTranslation: false });
    }

    const base = currentBaseDoc();
    if (!base) {
      setStatusMessage("未检测到可排版内容", "error");
      return;
    }

    if (!translationSettings.apiKey || !translationSettings.model) {
      setStatusMessage("请先在设置中补全 API Key 和模型", "error");
      await openSettings();
      return;
    }

    const baseMode: PreviewContentMode =
      contentMode === "translated" && translatedDoc ? "translated" : "original";

    const restored = await maybeRestoreCachedFormatting(base, baseMode);
    if (restored) {
      syncControlState();
      return;
    }

    const port = ensureFormattingPort();
    formattingState = "formatting";
    enhancedBaseMode = baseMode;
    formattingJobId =
      typeof crypto.randomUUID === "function"
        ? `formatting_${crypto.randomUUID()}`
        : `formatting_${Date.now()}`;
    setFormattingStatus("步骤 1/3：分析文档结构");
    syncControlState();

    port.postMessage({
      type: "formatting/start",
      payload: {
        jobId: formattingJobId,
        sourceHash: hashDoc(base),
        doc: base,
        settings: buildEffectiveFormattingSettings()
      }
    });
  };

  // === 智能配图编排（配图锚定 base 块索引，与排版可叠加且顺序无关） ===

  const buildEffectiveIllustrationSettings = (): IllustrationSettings => ({
    ...illustrationSettings,
    apiKey: translationSettings.apiKey,
    model: illustrationSettings.model
  });

  // 配图锚定 base（原文/译文）块索引，缓存键与排版无关 → 重排版不失效
  const getIllustrationCacheKey = (base: Doc): string =>
    `${ILLUSTRATION_CACHE_PREFIX}:${hashDoc(base)}:${hashIllustration(
      buildEffectiveIllustrationSettings()
    )}`;

  const readIllustrationCache = async (base: Doc): Promise<IllustrationCacheEntry | null> => {
    if (!chrome.storage.session) return null;
    const key = getIllustrationCacheKey(base);
    const stored = await chrome.storage.session.get(key);
    return (stored[key] as IllustrationCacheEntry | undefined) ?? null;
  };

  // 配图含 base64，体积大；session 可能触配额 → try/catch 吞错降级为不缓存
  const persistIllustrationCache = async (base: Doc, items: IllustrationItem[]) => {
    if (!chrome.storage.session) return;
    const key = getIllustrationCacheKey(base);
    try {
      await chrome.storage.session.set({
        [key]: { items, createdAt: Date.now() } satisfies IllustrationCacheEntry
      });
    } catch (error) {
      // 配额超限：不缓存，不影响主流程
      console.warn("配图缓存写入失败（可能超出 session 配额）：", error);
    }
  };

  const setIllustrationItems = async (
    base: Doc,
    baseMode: PreviewContentMode,
    items: IllustrationItem[],
    options?: { statusMessage?: string; persist?: boolean }
  ) => {
    illustrations = items;
    enhancedBaseMode = baseMode;
    illustrationState = "success";
    illustrationJobId = "";
    showEnhanced = true;
    setIllustrationStatus("");
    rebuildRenderedContent();
    syncControlState();
    if (options?.statusMessage) {
      setStatusMessage(options.statusMessage, "success");
    }
    if (options?.persist ?? true) {
      await persistIllustrationCache(base, items);
    }
  };

  const maybeRestoreCachedIllustration = async (
    base: Doc,
    baseMode: PreviewContentMode
  ): Promise<boolean> => {
    const cached = await readIllustrationCache(base);
    if (!cached?.items || cached.items.length === 0) return false;
    await setIllustrationItems(base, baseMode, cached.items, {
      statusMessage: "已加载缓存配图",
      persist: false
    });
    return true;
  };

  const cancelActiveIllustration = (showMessage = true) => {
    if (illustrationState !== "illustrating" || !illustrationJobId) return;
    const port = illustrationPort ?? ensureIllustrationPort();
    port.postMessage({ type: "illustration/cancel", jobId: illustrationJobId });
    illustrationJobId = "";
    illustrationState = illustrations ? "success" : "idle";
    setIllustrationStatus("");
    syncControlState();
    if (showMessage) {
      setStatusMessage("智能配图已取消", "info");
    }
  };

  const getIllustrationProgressMessage = (message: {
    label?: string;
    detail?: string;
    completed?: number;
    total?: number;
  }): string => {
    const label = message.label ?? "智能配图";
    if (message.total && message.total > 0 && typeof message.completed === "number") {
      return `${label}（${message.completed}/${message.total}）`;
    }
    return message.detail ? `${label}：${message.detail}` : label;
  };

  const handleBackgroundIllustrationState = async (
    state: IllustrationBackgroundState | null
  ) => {
    if (!state) return;
    const base = currentBaseDoc();
    if (!base) return;
    if (hashDoc(base) !== state.sourceHash) return;

    const baseMode: PreviewContentMode =
      contentMode === "translated" && translatedDoc ? "translated" : "original";

    if (state.status === "illustrating") {
      illustrationJobId = state.jobId;
      illustrationState = "illustrating";
      enhancedBaseMode = baseMode;
      setIllustrationStatus(getIllustrationProgressMessage(state));
      syncControlState();
      return;
    }

    if (state.status === "success" && state.items) {
      await setIllustrationItems(base, baseMode, state.items, {
        statusMessage: "已恢复后台配图结果"
      });
      return;
    }

    illustrationJobId = "";
    illustrationState = illustrations ? "success" : "error";
    setIllustrationStatus("");
    syncControlState();
    if (state.message) {
      setStatusMessage(state.message, "error");
    }
  };

  const handleIllustrationMessage = (message: IllustrationPortServerMessage) => {
    if (message.type === "illustration/state") {
      void handleBackgroundIllustrationState(message.state);
      return;
    }

    if (!illustrationJobId || message.jobId !== illustrationJobId) return;

    if (message.type === "illustration/progress") {
      setIllustrationStatus(getIllustrationProgressMessage(message));
      syncControlState();
      return;
    }

    if (message.type === "illustration/result") {
      const base = enhancedBaseDoc() ?? currentBaseDoc();
      if (!base) {
        illustrationJobId = "";
        illustrationState = "idle";
        setIllustrationStatus("");
        syncControlState();
        return;
      }
      if (message.items.length === 0) {
        illustrationJobId = "";
        illustrationState = illustrations ? "success" : "idle";
        setIllustrationStatus("");
        syncControlState();
        const reason =
          (message.requested ?? 0) === 0
            ? "AI 未规划出配图位置（文档可能太短或无合适位置）"
            : "未生成任何配图";
        setStatusMessage(reason, "info");
        return;
      }
      const baseMode: PreviewContentMode =
        enhancedBaseMode === "translated" && translatedDoc ? "translated" : "original";
      const requested = message.requested ?? message.items.length;
      const statusMessage =
        requested > message.items.length
          ? `智能配图完成：成功 ${message.items.length}/${requested} 张（部分生成失败）`
          : `智能配图完成：${message.items.length} 张`;
      void setIllustrationItems(base, baseMode, message.items, { statusMessage });
      return;
    }

    if (message.message === "智能配图已取消") {
      illustrationJobId = "";
      illustrationState = illustrations ? "success" : "idle";
      setIllustrationStatus("");
      syncControlState();
      setStatusMessage("智能配图已取消", "info");
      return;
    }

    illustrationJobId = "";
    illustrationState = illustrations ? "success" : "error";
    setIllustrationStatus("");
    syncControlState();
    setStatusMessage(message.message, "error");
  };

  const ensureIllustrationPort = () => {
    if (illustrationPort) return illustrationPort;

    illustrationPort = chrome.runtime.connect({ name: ILLUSTRATION_PORT_NAME });
    illustrationPort.onMessage.addListener((message) => {
      handleIllustrationMessage(message as IllustrationPortServerMessage);
    });
    illustrationPort.onDisconnect.addListener(() => {
      illustrationPort = null;
      if (suppressNextIllustrationDisconnect) {
        suppressNextIllustrationDisconnect = false;
        return;
      }
      if (illustrationState === "illustrating") {
        illustrationJobId = "";
        illustrationState = illustrations ? "success" : "error";
        setIllustrationStatus("");
        syncControlState();
        setStatusMessage("智能配图连接已断开，请重试", "error");
      }
    });

    return illustrationPort;
  };

  const syncIllustrationStateFromBackground = () => {
    if (!sourceDoc || !sourceHash) return;
    ensureIllustrationPort().postMessage({ type: "illustration/query-state" });
  };

  const startIllustration = async () => {
    if (illustrationState === "illustrating") {
      cancelActiveIllustration(true);
      return;
    }

    await loadSettings();
    await loadIllustrationSettings();
    if (!sourceDoc) {
      await refreshSource({ announce: false, activateCachedTranslation: false });
    }

    const base = currentBaseDoc();
    if (!base) {
      setStatusMessage("未检测到可配图内容", "error");
      return;
    }

    if (!translationSettings.apiKey || !illustrationSettings.model) {
      setStatusMessage("请先在设置中补全 API Key 和模型", "error");
      await openSettings();
      return;
    }

    const baseMode: PreviewContentMode =
      contentMode === "translated" && translatedDoc ? "translated" : "original";

    const restored = await maybeRestoreCachedIllustration(base, baseMode);
    if (restored) {
      syncControlState();
      return;
    }

    const port = ensureIllustrationPort();
    illustrationState = "illustrating";
    enhancedBaseMode = baseMode;
    illustrationJobId =
      typeof crypto.randomUUID === "function"
        ? `illustration_${crypto.randomUUID()}`
        : `illustration_${Date.now()}`;
    setIllustrationStatus("步骤 1/3：分析配图位置");
    syncControlState();

    // 配图锚定 base 块索引（与排版可叠加，顺序无关）；规划基于 base
    port.postMessage({
      type: "illustration/start",
      payload: {
        jobId: illustrationJobId,
        sourceHash: hashDoc(base),
        doc: base,
        settings: buildEffectiveIllustrationSettings()
      }
    });
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

  const testConnection = async () => {
    if (!drawerRefs) return;
    const { settingsInputs, settingsTestButton } = drawerRefs;
    const apiKey = settingsInputs.apiKeyInput.value.trim();
    const baseURL = settingsInputs.baseURLInput.value.trim();
    const model = settingsInputs.modelInput.value.trim();

    if (!apiKey) {
      setSettingsStatus("请先填写 API Key", "error");
      return;
    }
    if (!model) {
      setSettingsStatus("请先填写模型 ID", "error");
      return;
    }

    testConnectionController?.abort();
    testConnectionController = new AbortController();

    setButtonDisabled(settingsTestButton, true);
    const originalLabel = settingsTestButton.textContent ?? "测试连接";
    settingsTestButton.textContent = "测试中…";
    setSettingsStatus("正在测试 API 连接…");

    let result: ApiTestResult;
    try {
      result = await testApiConnection({ apiKey, baseURL, model }, testConnectionController.signal);
    } finally {
      settingsTestButton.textContent = originalLabel;
      setButtonDisabled(settingsTestButton, false);
    }

    setSettingsStatus(result.message, result.success ? "success" : "error");
  };

  const saveSettings = async () => {
    if (!drawerRefs) return;

    const { settingsInputs } = drawerRefs;
    const nextSettings = normalizeTranslationSettings({
      apiKey: settingsInputs.apiKeyInput.value,
      baseURL: settingsInputs.baseURLInput.value,
      model: settingsInputs.modelInput.value,
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
      if (!chrome.storage?.local) {
        setSettingsStatus("扩展上下文已失效，请刷新页面后重试");
        setButtonDisabled(drawerRefs.settingsSaveButton, false);
        return;
      }
      const nextFormattingSettings = normalizeFormattingSettings({
        ...formattingSettings,
        apiKey: nextSettings.apiKey,
        baseURL: nextSettings.baseURL,
        model: nextSettings.model,
        aggressiveness: settingsInputs.aggressivenessSelect.value as FormattingAggressiveness,
        extraInstructions: settingsInputs.formattingExtraInstructionsInput.value
      });
      const nextIllustrationSettings = normalizeIllustrationSettings({
        ...illustrationSettings,
        apiKey: nextSettings.apiKey,
        baseURL: nextSettings.baseURL,
        model: settingsInputs.imageModelInput.value,
        maxImages: Number(settingsInputs.maxImagesSelect.value),
        stylePrompt: settingsInputs.illustrationStylePromptInput.value
      });
      await chrome.storage.local.set({
        [TRANSLATION_SETTINGS_KEY]: nextSettings,
        [FORMATTING_SETTINGS_KEY]: nextFormattingSettings,
        [ILLUSTRATION_SETTINGS_KEY]: nextIllustrationSettings
      });
      translationSettings = nextSettings;
      formattingSettings = nextFormattingSettings;
      illustrationSettings = nextIllustrationSettings;
      syncSettingsForm();
      closeSettings();

      // 设置变更后已生成的增强稿（排版/配图）可能不再匹配新配置：清空并刷新（重排版/配图可命中缓存秒恢复）
      cancelActiveFormatting(false);
      cancelActiveIllustration(false);
      clearEnhancedContent();
      formattingState = "idle";
      illustrationState = "idle";
      rebuildRenderedContent();
      syncControlState();

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

    const nextSourceDoc = await extractDoc();
    const nextSourceHash = hashDoc(nextSourceDoc);
    const nextSourcePageKey = getPageKey();
    const previousSourceHash = sourceHash;
    const previousSourcePageKey = sourcePageKey;
    const pageChanged = Boolean(previousSourcePageKey) && previousSourcePageKey !== nextSourcePageKey;
    const sourceChanged = Boolean(previousSourceHash) && previousSourceHash !== nextSourceHash;
    const hadTranslatedContent = Boolean(translatedDoc);

    if (pageChanged || sourceChanged) {
      cancelActiveTranslation(false);
      clearTranslatedContent();
      cancelActiveFormatting(false);
      cancelActiveIllustration(false);
      clearEnhancedContent();
      cancelImagePreload();
      imageMap = new Map();
      translationState = !pageChanged && hadTranslatedContent ? "stale" : "idle";
      formattingState = "idle";
      illustrationState = "idle";
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
    suppressNextFormattingDisconnect = Boolean(formattingPort);
    formattingPort?.disconnect();
    formattingPort = null;
    suppressNextIllustrationDisconnect = Boolean(illustrationPort);
    illustrationPort?.disconnect();
    illustrationPort = null;
    cancelImagePreload();
    imageMap = new Map();
    drawerRefs?.themeMenu.remove();
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
    drawerOpenedAt = Date.now();

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
      const menu = drawerRefs!.themeMenu;
      if (menu.style.display !== "none") {
        menu.style.display = "none";
        return;
      }
      const rect = drawerRefs!.themeButton.getBoundingClientRect();
      const menuWidth = 180;
      const left = Math.min(rect.left, Math.max(8, window.innerWidth - menuWidth - 8));
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.left = `${left}px`;
      menu.style.display = "block";
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
      item.addEventListener("click", (event) => {
        event.stopPropagation();
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

    drawerRefs.formatButton.addEventListener("click", () => {
      void startFormatting();
    });

    drawerRefs.illustrateButton.addEventListener("click", () => {
      void startIllustration();
    });

    drawerRefs.originalFormatButton.addEventListener("click", () => {
      showEnhanced = false;
      renderPreview();
      syncControlState();
    });

    drawerRefs.formattedFormatButton.addEventListener("click", () => {
      if (!enhancedDoc) return;
      showEnhanced = true;
      renderPreview();
      syncControlState();
    });

    bindClickableControl(drawerRefs.retryButton);
    drawerRefs.retryButton.addEventListener("click", () => {
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

    bindPressAction(drawerRefs.settingsTestButton, () => {
      void testConnection();
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
        const msg = isEnhancedActive()
          ? "已复制增强稿为公众号格式"
          : contentMode === "translated"
            ? "已复制译文为公众号格式"
            : "已复制原文为公众号格式";
        setStatusMessage(msg, "success");
        showToast(msg);
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
        const msg = isEnhancedActive()
          ? "已复制增强稿为 Markdown"
          : contentMode === "translated"
            ? "已复制译文为 Markdown"
            : "已复制原文为 Markdown";
        setStatusMessage(msg, "success");
        showToast(msg);
      } catch (error) {
        setStatusMessage("复制失败，请重试", "error");
      }
    });

    if (!outsideListenerAttached) {
      outsideListenerAttached = true;
      document.addEventListener("click", (event) => {
        const target = event.target as Node;

        const clickedThemeMenu = Boolean(activeThemeMenu?.contains(target));
        const clickedThemeButton = Boolean(activeThemeWrapper?.contains(target));

        if (activeThemeMenu && !clickedThemeButton && !clickedThemeMenu) {
          activeThemeMenu.style.display = "none";
        }

        if (
          drawer &&
          !drawer.contains(target) &&
          !clickedThemeMenu &&
          Date.now() - drawerOpenedAt > 300
        ) {
          closeDrawer();
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && drawer) {
          if (drawerRefs && drawerRefs.settingsOverlay.style.display === "flex") {
            closeSettings();
          } else {
            closeDrawer();
          }
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
    document.body.appendChild(drawerRefs.themeMenu);

    // 如果有缓存内容，立即渲染到新 drawer DOM，避免重新提取期间空白
    if (sourceDoc) {
      renderPreview();
    }

    void (async () => {
      await refreshSource({ announce: false, activateCachedTranslation: false });
      syncTranslationStateFromBackground();
      syncFormattingStateFromBackground();
      syncIllustrationStateFromBackground();
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
