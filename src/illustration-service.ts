import OpenAI from "openai";

import illustrationPromptTemplate from "./prompts/illustration-plan.md";
import { callResponsesApi, getErrorMessage, renderPromptTemplate } from "./translation-service";
import type { FormattingBlockSummary } from "./formatting";
import type {
  IllustrationItem,
  IllustrationPlanItem,
  IllustrationSettings
} from "./illustration";

// 固定基底风格：极简扁平插画 + 无文字。用户自定义风格词与主题描述按序追加。
const STYLE_PREFIX =
  "Minimalist flat vector illustration, clean composition with generous negative space, " +
  "soft muted color palette, no text, no letters, no watermark.";

const IMAGE_MODEL = "gpt-image-2"; // 专用生图模型
const IMAGE_SIZE = "1080x608"; // 16:9 宽图
const IMAGE_REQUEST_TIMEOUT_MS = 120_000; // 单张生图上界，避免请求挂死阻塞整个 job
const IMAGE_MAX_ATTEMPTS = 3; // 单张生图失败重试（含首次），提升成功率

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const isTransientImageError = (message: string): boolean =>
  /\b(429|500|502|503|504)\b|timeout|timed out|network|fetch|connection|socket|reset|overload/i.test(
    message
  );

// 拼接最终生图 prompt：固定基底 → 用户风格词（可空）→ 主题描述。
const buildImagePrompt = (subject: string, stylePrompt: string): string =>
  [STYLE_PREFIX, stylePrompt.trim(), `Subject: ${subject.trim()}`]
    .filter((part) => part.length > 0)
    .join(" ");

export const planIllustrations = async (params: {
  inputs: FormattingBlockSummary[];
  settings: IllustrationSettings;
  signal: AbortSignal;
}): Promise<IllustrationPlanItem[]> => {
  const input = renderPromptTemplate(illustrationPromptTemplate, {
    MAX_IMAGES: String(params.settings.maxImages),
    BLOCKS_JSON: JSON.stringify({ blocks: params.inputs }, null, 2)
  });

  const payload = await callResponsesApi<{ images: IllustrationPlanItem[] }>({
    settings: params.settings,
    input,
    signal: params.signal
  });

  const images = payload.images ?? [];
  // 防御：截断到上限，过滤空 prompt/afterBlockId
  return images
    .filter((item) => item && item.afterBlockId && item.prompt?.trim())
    .slice(0, params.settings.maxImages);
};

const createImageClient = (settings: IllustrationSettings) =>
  new OpenAI({ apiKey: settings.apiKey, maxRetries: 0, dangerouslyAllowBrowser: true });

// 单张生图：responses API + image_generation tool，从 output 数组取 base64。
export const generateImage = async (params: {
  prompt: string;
  settings: IllustrationSettings;
  signal: AbortSignal;
}): Promise<string> => {
  const client = createImageClient(params.settings);
  const prompt = buildImagePrompt(params.prompt, params.settings.stylePrompt);

  let lastError: unknown;
  for (let attempt = 1; attempt <= IMAGE_MAX_ATTEMPTS; attempt += 1) {
    if (params.signal.aborted) throw new Error("已取消");

    // 单张超时：派生受父 signal 影响、自带 120s 上界的 controller
    const requestController = new AbortController();
    const abortFromParent = () => requestController.abort();
    params.signal.addEventListener("abort", abortFromParent, { once: true });
    const timeoutId = globalThis.setTimeout(
      () => requestController.abort(),
      IMAGE_REQUEST_TIMEOUT_MS
    );

    try {
      const result = (await client.images.generate(
        {
          model: IMAGE_MODEL,
          prompt,
          size: IMAGE_SIZE,
          n: 1
        } as unknown as Parameters<typeof client.images.generate>[0],
        { signal: requestController.signal }
      )) as { data?: Array<{ b64_json?: string }> };

      const base64 = result.data?.[0]?.b64_json;
      if (!base64) throw new Error("生图返回为空");
      return `data:image/png;base64,${base64}`;
    } catch (error) {
      lastError = error;
      if (params.signal.aborted) throw error;
      // 瞬时错误（限流/网络/超时/过载）退避重试，提升成功率
      if (attempt < IMAGE_MAX_ATTEMPTS && isTransientImageError(getErrorMessage(error))) {
        await wait(800 * attempt);
        continue;
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeoutId);
      params.signal.removeEventListener("abort", abortFromParent);
    }
  }

  throw lastError ?? new Error("生图失败");
};

// 逐张串行生成（生图慢、贵）；单张失败跳过，不阻断其余。
export const generateIllustrations = async (params: {
  plan: IllustrationPlanItem[];
  settings: IllustrationSettings;
  signal: AbortSignal;
  onProgress?: (current: number, total: number) => void;
}): Promise<IllustrationItem[]> => {
  const items: IllustrationItem[] = [];
  const total = params.plan.length;

  for (let index = 0; index < total; index += 1) {
    if (params.signal.aborted) break;
    const planItem = params.plan[index];
    params.onProgress?.(index + 1, total);

    try {
      const dataUri = await generateImage({
        prompt: planItem.prompt,
        settings: params.settings,
        signal: params.signal
      });
      items.push({ afterBlockId: planItem.afterBlockId, dataUri, alt: planItem.prompt });
    } catch (error) {
      if (params.signal.aborted) break;
      // 单张失败：跳过该图，继续其余
      console.warn(`配图生成失败（${index + 1}/${total}）：${getErrorMessage(error)}`);
    }
  }

  return items;
};
