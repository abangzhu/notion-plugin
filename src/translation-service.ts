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

const parseJsonPayload = <T>(raw: string): T => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  return JSON.parse(candidate) as T;
};

const createOpenAIClient = (settings: TranslationSettings) =>
  new OpenAI({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true
  });

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
  const response = await client.responses.create(
    {
      model: params.settings.model,
      input: params.input,
      temperature: 0.2
    },
    {
      signal: params.signal
    }
  );

  const content = response.output_text?.trim() ?? "";
  if (!content) {
    throw new Error("OpenAI 返回了空结果");
  }

  return parseJsonPayload<T>(content);
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
  onChunkProgress?: (completed: number, total: number) => void;
}): Promise<TranslationOutput[]> => {
  const chunks = chunkInputs(params.inputs, params.settings);
  const translated: TranslationOutput[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
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

    const payload = await callResponsesApi<{ items: TranslationOutput[] }>({
      settings: params.settings,
      input,
      signal: params.signal
    });

    translated.push(...(payload.items ?? []));
    params.onChunkProgress?.(index + 1, chunks.length);
  }

  return translated;
};
