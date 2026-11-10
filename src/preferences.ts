// 预览偏好（主题 / 字体 / 字号）持久化：此前仅存在内存里，重载扩展或刷新页面就回到默认。

export const PREVIEW_PREFERENCES_KEY = "previewPreferences";

export const FONT_SCALE_MIN = 0.9;
export const FONT_SCALE_MAX = 1.15;

export type PreviewPreferences = {
  themeId: string;
  fontId: string;
  fontScale: number;
};

export const normalizePreviewPreferences = (
  value: unknown,
  fallback: PreviewPreferences,
  valid: { themeIds: readonly string[]; fontIds: readonly string[] }
): PreviewPreferences => {
  const raw = value && typeof value === "object" ? (value as Partial<PreviewPreferences>) : {};
  const themeId =
    typeof raw.themeId === "string" && valid.themeIds.includes(raw.themeId) ? raw.themeId : fallback.themeId;
  const fontId =
    typeof raw.fontId === "string" && valid.fontIds.includes(raw.fontId) ? raw.fontId : fallback.fontId;
  const scale = Number(raw.fontScale);
  const fontScale = Number.isFinite(scale)
    ? Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(scale * 100) / 100))
    : fallback.fontScale;
  return { themeId, fontId, fontScale };
};
