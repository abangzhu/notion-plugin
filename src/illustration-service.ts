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

const IMAGE_SIZE = "1536x1024"; // responses image_generation 工具支持的横版尺寸（3:2），生成后裁剪为 16:9
const TARGET_ASPECT_RATIO = 16 / 9;
const IMAGE_REQUEST_TIMEOUT_MS = 120_000; // 单张生图上界，避免请求挂死阻塞整个 job
const IMAGE_MAX_ATTEMPTS = 3; // 单张生图失败重试（含首次），提升成功率

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const isTransientImageError = (message: string): boolean =>
  /\b(429|500|502|503|504)\b|timeout|timed out|network|fetch|connection|socket|reset|overload/i.test(
    message
  ) ||
  // 模型有概率不调用 image_generation tool（非确定性），重试通常可成功
  /生图返回为空/.test(message);

// 将原始错误归类为明确的中文提示，便于用户对症处理。
const formatImageError = (error: unknown): string => {
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();

  if (/\b404\b/.test(lower) || (lower.includes("model") && /not found|does not exist|unknown|no such/.test(lower))) {
    return `生图模型不可用或不存在（当前接口可能不支持该模型）：${message}`;
  }
  if (lower.includes("image_generation") || (lower.includes("tool") && lower.includes("support")) || lower.includes("not supported") || lower.includes("unsupported")) {
    return `当前模型/接口不支持图像生成工具（image_generation）：${message}`;
  }
  if (lower.includes("size") || lower.includes("dimension") || lower.includes("resolution")) {
    return `生图尺寸不被接受（接口可能只支持固定档位）：${message}`;
  }
  if (/\b401\b|\b403\b/.test(lower) || lower.includes("unauthorized") || lower.includes("invalid api key") || lower.includes("permission")) {
    return `API Key 无效或无生图权限：${message}`;
  }
  if (/\b429\b/.test(lower) || lower.includes("rate limit") || lower.includes("quota")) {
    return `请求过于频繁或额度不足（限流/配额）：${message}`;
  }
  if ((lower.includes("content") && lower.includes("policy")) || lower.includes("safety") || lower.includes("moderation") || lower.includes("rejected")) {
    return `配图描述被安全策略拦截：${message}`;
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted")) {
    return `生图超时（>120秒）：${message}`;
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("connection")) {
    return `网络连接失败：${message}`;
  }
  if (lower.includes("空") || lower.includes("empty")) {
    return `生图接口返回为空（响应中无图像数据，可能模型不支持出图）：${message}`;
  }
  return message;
};

// 拼接最终生图 prompt：固定基底 → 用户风格词（可空）→ 主题描述。
const buildImagePrompt = (subject: string, stylePrompt: string): string =>
  [STYLE_PREFIX, stylePrompt.trim(), `Subject: ${subject.trim()}`]
    .filter((part) => part.length > 0)
    .join(" ");

const base64FromArrayBuffer = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

// image_generation 工具无原生 16:9：取回 3:2 后用 OffscreenCanvas 居中裁剪为真 16:9。
// 裁剪失败则降级返回原图，不阻断流程。
const cropTo16x9 = async (dataUri: string): Promise<string> => {
  try {
    const blob = await (await fetch(dataUri)).blob();
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;

    let cropWidth = width;
    let cropHeight = Math.round(width / TARGET_ASPECT_RATIO);
    if (cropHeight > height) {
      cropHeight = height;
      cropWidth = Math.round(height * TARGET_ASPECT_RATIO);
    }

    const sourceX = Math.round((width - cropWidth) / 2);
    const sourceY = Math.round((height - cropHeight) / 2);

    const canvas = new OffscreenCanvas(cropWidth, cropHeight);
    const context = canvas.getContext("2d");
    if (!context) return dataUri;
    context.drawImage(bitmap, sourceX, sourceY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    bitmap.close();

    const outputBlob = await canvas.convertToBlob({ type: "image/png" });
    return `data:image/png;base64,${base64FromArrayBuffer(await outputBlob.arrayBuffer())}`;
  } catch (error) {
    console.warn(`16:9 裁剪失败，使用原图：${getErrorMessage(error)}`);
    return dataUri;
  }
};

export const planIllustrations = async (params: {
  title: string;
  inputs: FormattingBlockSummary[];
  settings: IllustrationSettings;
  signal: AbortSignal;
}): Promise<IllustrationPlanItem[]> => {
  const input = renderPromptTemplate(illustrationPromptTemplate, {
    ARTICLE_TITLE: params.title.trim() || "（无标题）",
    MAX_IMAGES: String(params.settings.maxImages),
    BLOCKS_JSON: JSON.stringify({ blocks: params.inputs }, null, 2)
  });

  const payload = await callResponsesApi<{ images: IllustrationPlanItem[] }>({
    // 规划阶段用语言模型（planningModel），不用图片模型
    settings: {
      apiKey: params.settings.apiKey,
      baseURL: params.settings.baseURL,
      model: params.settings.planningModel
    },
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
  new OpenAI({
    apiKey: settings.apiKey,
    ...(settings.baseURL ? { baseURL: settings.baseURL } : {}),
    maxRetries: 0,
    dangerouslyAllowBrowser: true
  });

// 单张生图：responses API + image_generation tool，从 output 数组取 base64。
export const generateImage = async (params: {
  prompt: string;
  settings: IllustrationSettings;
  signal: AbortSignal;
}): Promise<string> => {
  const client = createImageClient(params.settings);
  const input = buildImagePrompt(params.prompt, params.settings.stylePrompt);

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
      // Images API（/v1/images/generations）：直接调用图片模型，不经 Responses API 编排
      const imageResponse = await client.images.generate(
        {
          model: params.settings.model,
          prompt: input,
          n: 1,
          size: IMAGE_SIZE as "1536x1024",
          response_format: "b64_json"
        },
        { signal: requestController.signal }
      );

      const base64 = imageResponse.data?.[0]?.b64_json;
      if (!base64) throw new Error("生图返回为空");
      return cropTo16x9(`data:image/png;base64,${base64}`);
    } catch (error) {
      lastError = error;
      if (params.signal.aborted) throw error;
      // 瞬时错误（限流/网络/超时/过载/空响应）退避重试，提升成功率
      if (attempt < IMAGE_MAX_ATTEMPTS && isTransientImageError(getErrorMessage(error))) {
        // 空响应（模型未调用 tool）用更长间隔，给模型重新决策的机会
        const backoffMs = /生图返回为空/.test(getErrorMessage(error)) ? 2000 * attempt : 800 * attempt;
        await wait(backoffMs);
        continue;
      }
      throw new Error(formatImageError(error));
    } finally {
      globalThis.clearTimeout(timeoutId);
      params.signal.removeEventListener("abort", abortFromParent);
    }
  }

  throw new Error(formatImageError(lastError));
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
  let lastError: unknown;

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
      lastError = error;
      // 单张失败：跳过该图，继续其余
      console.warn(`配图生成失败（${index + 1}/${total}）：${getErrorMessage(error)}`);
    }
  }

  // 全部失败：抛出真实错误，便于 UI 展示原因（而非静默"未生成任何配图"）
  if (items.length === 0 && total > 0 && lastError && !params.signal.aborted) {
    throw new Error(`配图全部生成失败：${getErrorMessage(lastError)}`);
  }

  return items;
};
