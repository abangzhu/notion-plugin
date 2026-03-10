import OpenAI from "openai";

import analysisPromptTemplate from "./prompts/translation-analysis.md";
import commonRulesTemplate from "./prompts/translation-common-rules.md";
import translationPromptTemplate from "./prompts/translation-structured.md";
import { getTranslationSourceText } from "./translation";
import type { Doc } from "./types";
import type { TranslationInput, TranslationOutput, TranslationSettings } from "./translation";

type AnalysisResult = {
  summary: string;
};

const OPENAI_REQUEST_TIMEOUT_MS = 90_000;
const OPENAI_REQUEST_MAX_ATTEMPTS = 2;
const RETRYABLE_ERROR_PATTERNS = [
  "timeout",
  "timed out",
  "network",
  "fetch",
  "connection",
  "socket",
  "reset",
  "429",
  "500",
  "502",
  "503",
  "504"
];

const parseJsonPayload = <T>(raw: string): T => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  return JSON.parse(candidate) as T;
};

const createOpenAIClient = (settings: TranslationSettings) =>
  new OpenAI({
    apiKey: settings.apiKey,
    maxRetries: 0,
    dangerouslyAllowBrowser: true
  });

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return String(error || "未知错误");
};

const isRetryableError = (error: unknown): boolean => {
  const normalizedMessage = getErrorMessage(error).toLowerCase();
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
};

type TranslationErrorCategory =
  | "auth"
  | "rate_limit"
  | "server_error"
  | "timeout"
  | "network"
  | "invalid_model"
  | "unknown";

const classifyTranslationError = (error: unknown): TranslationErrorCategory => {
  const message = getErrorMessage(error).toLowerCase();
  if (message.includes("401") || message.includes("unauthorized") || message.includes("invalid api key")) return "auth";
  if (message.includes("429") || message.includes("rate limit") || message.includes("rate_limit")) return "rate_limit";
  if (/\b(500|502|503)\b/.test(message)) return "server_error";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("network") || message.includes("fetch") || message.includes("connection")) return "network";
  if (message.includes("model") && (message.includes("not found") || message.includes("not exist"))) return "invalid_model";
  return "unknown";
};

const formatUserFriendlyError = (error: unknown, modelName?: string): string => {
  const category = classifyTranslationError(error);
  const modelSuffix = modelName ? `（模型: ${modelName}）` : "";

  switch (category) {
    case "auth":
      return `翻译失败：API Key 无效或已过期${modelSuffix}。请在设置中检查。`;
    case "rate_limit":
      return "请求超出配额限制，请稍后重试或升级 OpenAI 账户。";
    case "server_error":
      return "OpenAI 服务器错误，这通常是临时问题，请稍后重试。";
    case "timeout":
      return "请求超时（>90秒），文档可能太长，请尝试减少内容。";
    case "network":
      return "网络连接失败，请检查网络后重试。";
    case "invalid_model":
      return `模型不可用${modelSuffix}，请在设置中选择其他模型。`;
    default:
      return `${getErrorMessage(error)}${modelSuffix}`;
  }
};

const renderPromptTemplate = (
  template: string,
  variables: Record<string, string>
): string =>
  Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{{${key}}}`).join(value.trim()),
    template
  );

const buildCommonTranslationRules = (settings: TranslationSettings): string => {
  const glossary = settings.glossary.trim();
  const preserveTerms = settings.preserveTerms.trim();
  const extraInstructions = settings.extraInstructions.trim();

  return renderPromptTemplate(commonRulesTemplate, {
    TARGET_LANGUAGE: settings.targetLanguage,
    AUDIENCE: settings.audience,
    STYLE: settings.stylePreset,
    GLOSSARY_BLOCK: glossary ? `\n\nGlossary:\n${glossary}` : "",
    PRESERVE_TERMS_BLOCK: preserveTerms
      ? `\n\nPreserve these terms unchanged when appropriate:\n${preserveTerms}`
      : "",
    EXTRA_INSTRUCTIONS_BLOCK: extraInstructions
      ? `\n\nExtra instructions:\n${extraInstructions}`
      : ""
  });
};

const chunkInputs = (
  inputs: TranslationInput[],
  settings: TranslationSettings
): TranslationInput[][] => {
  const chunks: TranslationInput[][] = [];
  let currentChunk: TranslationInput[] = [];
  let currentLength = 0;

  inputs.forEach((input) => {
    const nextLength = currentLength + input.content.length;
    if (
      currentChunk.length > 0 &&
      (currentChunk.length >= settings.chunkMaxUnits || nextLength >= settings.chunkThreshold)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push(input);
    currentLength += input.content.length;
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [inputs];
};

const callResponsesApi = async <T>(params: {
  settings: TranslationSettings;
  input: string;
  signal: AbortSignal;
}): Promise<T> => {
  const client = createOpenAIClient(params.settings);

  for (let attempt = 1; attempt <= OPENAI_REQUEST_MAX_ATTEMPTS; attempt += 1) {
    let timedOut = false;
    const requestController = new AbortController();
    const abortFromParent = () => {
      requestController.abort();
    };

    if (params.signal.aborted) {
      requestController.abort();
    } else {
      params.signal.addEventListener("abort", abortFromParent, { once: true });
    }

    const timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, OPENAI_REQUEST_TIMEOUT_MS);

    try {
      const response = await client.responses.create(
        {
          model: params.settings.model,
          input: params.input,
          temperature: 0.2
        },
        {
          signal: requestController.signal
        }
      );

      const content = response.output_text?.trim() ?? "";
      if (!content) {
        throw new Error("OpenAI 返回了空结果");
      }

      return parseJsonPayload<T>(content);
    } catch (error) {
      if (params.signal.aborted) {
        throw error;
      }

      const shouldRetry =
        attempt < OPENAI_REQUEST_MAX_ATTEMPTS && (timedOut || isRetryableError(error));

      if (!shouldRetry) {
        throw new Error(
          formatUserFriendlyError(
            timedOut ? new Error("timeout") : error,
            params.settings.model
          )
        );
      }

      await wait(700 * attempt);
    } finally {
      globalThis.clearTimeout(timeoutId);
      params.signal.removeEventListener("abort", abortFromParent);
    }
  }

  throw new Error("OpenAI 请求失败");
};

export const analyzeTranslationSource = async (params: {
  doc: Doc;
  settings: TranslationSettings;
  signal: AbortSignal;
}): Promise<AnalysisResult> => {
  const sourceText = getTranslationSourceText(params.doc).slice(0, 12000);
  const input = renderPromptTemplate(analysisPromptTemplate, {
    COMMON_RULES: buildCommonTranslationRules(params.settings),
    SOURCE_TEXT: sourceText
  });

  return callResponsesApi<AnalysisResult>({
    settings: params.settings,
    input,
    signal: params.signal
  });
};

export const translateInputs = async (params: {
  inputs: TranslationInput[];
  settings: TranslationSettings;
  mode: "quick" | "normal";
  analysisSummary?: string;
  signal: AbortSignal;
  onChunkProgress?: (current: number, total: number) => void;
}): Promise<TranslationOutput[]> => {
  const chunks = chunkInputs(params.inputs, params.settings);
  const translated: TranslationOutput[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    params.onChunkProgress?.(index + 1, chunks.length);
    const input = renderPromptTemplate(translationPromptTemplate, {
      COMMON_RULES: buildCommonTranslationRules(params.settings),
      ANALYSIS_BLOCK:
        params.mode === "normal" && params.analysisSummary
          ? `Analysis summary:\n${params.analysisSummary}`
          : "",
      ITEMS_JSON: JSON.stringify(
        {
          items: chunk
        },
        null,
        2
      )
    });

    let payload: { items: TranslationOutput[] };
    try {
      payload = await callResponsesApi<{ items: TranslationOutput[] }>({
        settings: params.settings,
        input,
        signal: params.signal
      });
    } catch (error) {
      const detail = getErrorMessage(error);
      throw new Error(`分块 ${index + 1}/${chunks.length} 失败：${detail}`);
    }

    translated.push(...(payload.items ?? []));
  }

  return translated;
};
