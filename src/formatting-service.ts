import formattingPromptTemplate from "./prompts/formatting-plan.md";
import { callResponsesApi, getErrorMessage, renderPromptTemplate } from "./translation-service";
import type { FormattingBlockSummary, FormattingOperation, FormattingSettings } from "./formatting";

// 分块：以块数为主、字符数为辅。chunk 边界对齐——不在连续 paragraph 段中间切断，
// 以降低 group-steps 跨 chunk 概率（回填层对跨 chunk 漏分组已安全兜底）。
const chunkSummaries = (
  inputs: FormattingBlockSummary[],
  settings: FormattingSettings
): FormattingBlockSummary[][] => {
  const chunks: FormattingBlockSummary[][] = [];
  let current: FormattingBlockSummary[] = [];
  let currentLength = 0;

  inputs.forEach((input) => {
    const nextLength = currentLength + input.text.length;
    const overUnits = current.length >= settings.chunkMaxUnits;
    const overChars = nextLength >= settings.chunkThreshold;
    const prev = current[current.length - 1];
    // 上一块与当前块同为段落时视为可能的步骤序列，避免在其间断开
    const wouldSplitParagraphRun = prev?.type === "paragraph" && input.type === "paragraph";

    if (current.length > 0 && (overUnits || overChars) && !wouldSplitParagraphRun) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }

    current.push(input);
    currentLength += input.text.length;
  });

  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [inputs];
};

const buildExtraInstructionsBlock = (settings: FormattingSettings): string => {
  const extra = settings.extraInstructions.trim();
  return extra ? `\nExtra requirements (still obey all hard constraints):\n${extra}` : "";
};

export const planFormatting = async (params: {
  inputs: FormattingBlockSummary[];
  settings: FormattingSettings;
  signal: AbortSignal;
  onChunkProgress?: (current: number, total: number) => void;
}): Promise<FormattingOperation[]> => {
  const chunks = chunkSummaries(params.inputs, params.settings);
  const operations: FormattingOperation[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    params.onChunkProgress?.(index + 1, chunks.length);

    const input = renderPromptTemplate(formattingPromptTemplate, {
      AGGRESSIVENESS: params.settings.aggressiveness,
      EXTRA_INSTRUCTIONS_BLOCK: buildExtraInstructionsBlock(params.settings),
      BLOCKS_JSON: JSON.stringify({ blocks: chunk }, null, 2)
    });

    let payload: { operations: FormattingOperation[] };
    try {
      payload = await callResponsesApi<{ operations: FormattingOperation[] }>({
        settings: params.settings,
        input,
        signal: params.signal
      });
    } catch (error) {
      const detail = getErrorMessage(error);
      throw new Error(`分块 ${index + 1}/${chunks.length} 失败：${detail}`);
    }

    operations.push(...(payload.operations ?? []));
  }

  return operations;
};
