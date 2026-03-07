import OpenAI from "openai";

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

const buildCommonTranslationRules = (settings: TranslationSettings): string => {
  const glossary = settings.glossary.trim();
  const preserveTerms = settings.preserveTerms.trim();
  const extraInstructions = settings.extraInstructions.trim();

  return [
    `Target language: ${settings.targetLanguage}`,
    `Audience: ${settings.audience}`,
    `Style: ${settings.stylePreset}`,
    glossary ? `Glossary:\n${glossary}` : "",
    preserveTerms ? `Preserve these terms unchanged when appropriate:\n${preserveTerms}` : "",
    extraInstructions ? `Extra instructions:\n${extraInstructions}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
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

  const input = [
    "You analyze source articles before translation.",
    "Return strict JSON with a single key `summary`.",
    "Keep it concise, practical, and focused on tone, terminology, and translation risks.",
    "",
    buildCommonTranslationRules(params.settings),
    "",
    "Analyze the following source text for translation. Focus on terminology, tone, audience fit, and any phrases that must remain consistent.",
    "",
    sourceText
  ].join("\n");

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

    const input = [
      "You are a translation engine for structured article content.",
      "Return strict JSON with a single key `items`, where `items` is an array of objects: `{ \"id\": string, \"content\": string }`.",
      "Preserve every item id exactly.",
      "For `rich_text` content, preserve all XML-like tags exactly: <text>, <bold>, <italic>, <code>, <link href=\"...\">.",
      "Translate only the human-readable text.",
      "Do not translate code inside <code> tags.",
      "Do not modify href values.",
      "Do not add explanations outside the translated content.",
      "",
      buildCommonTranslationRules(params.settings),
      "",
      params.mode === "normal" && params.analysisSummary
        ? `Analysis summary:\n${params.analysisSummary}`
        : "",
      "",
      "Translate the following structured items.",
      "",
      JSON.stringify(
        {
          items: chunk
        },
        null,
        2
      )
    ]
      .filter(Boolean)
      .join("\n");

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
