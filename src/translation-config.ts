import modelConfig from "./translation-models.json";

export type TranslationModelConfig = {
  id: string;
  label: string;
  description?: string;
};

const DEFAULT_MODEL_ID = "gpt-5.4";

export const TRANSLATION_MODELS: TranslationModelConfig[] = Array.isArray(modelConfig)
  ? modelConfig
      .filter(
        (item): item is TranslationModelConfig =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          item.id.trim().length > 0 &&
          typeof item.label === "string" &&
          item.label.trim().length > 0
      )
      .map((item) => ({
        id: item.id.trim(),
        label: item.label.trim(),
        description:
          typeof item.description === "string" && item.description.trim().length > 0
            ? item.description.trim()
            : undefined
      }))
  : [];

export const DEFAULT_TRANSLATION_MODEL =
  TRANSLATION_MODELS[0]?.id ?? DEFAULT_MODEL_ID;

export const TARGET_LANGUAGE_OPTIONS = [
  { value: "zh-CN", label: "中文" },
  { value: "en", label: "English" }
] as const;

export const TARGET_AUDIENCE_OPTIONS = [
  { value: "general", label: "通用读者" },
  { value: "technical", label: "技术读者" },
  { value: "academic", label: "学术读者" },
  { value: "business", label: "商业读者" }
] as const;

export const STYLE_PRESET_OPTIONS = [
  { value: "storytelling", label: "叙事感" },
  { value: "formal", label: "正式" },
  { value: "technical", label: "技术" },
  { value: "literal", label: "直译" },
  { value: "academic", label: "学术" },
  { value: "business", label: "商业" },
  { value: "humorous", label: "幽默" },
  { value: "conversational", label: "口语化" },
  { value: "elegant", label: "优雅" }
] as const;
