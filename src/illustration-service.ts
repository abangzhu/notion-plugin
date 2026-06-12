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

const IMAGE_SIZE = "1536x1024"; // gpt-image 横版尺寸（3:2），生成后居中裁剪为 16:9
const TARGET_ASPECT_RATIO = 16 / 9;

const IMAGE_REQUEST_TIMEOUT_MS = 120_000; // 单张生图上界，避免请求挂死阻塞整个 job

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

// gpt-image 无原生 16:9 尺寸：取回 3:2 后用 OffscreenCanvas 居中裁剪为真 16:9。
// 裁剪失败（环境不支持/解码异常）则降级返回原图，不阻断流程。
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
    const base64 = base64FromArrayBuffer(await outputBlob.arrayBuffer());
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.warn(`16:9 裁剪失败，使用原图：${getErrorMessage(error)}`);
    return dataUri;
  }
};

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

  // 单张超时：派生一个受父 signal 影响、且自带 120s 上界的 controller
  const requestController = new AbortController();
  const abortFromParent = () => requestController.abort();
  if (params.signal.aborted) {
    requestController.abort();
  } else {
    params.signal.addEventListener("abort", abortFromParent, { once: true });
  }
  const timeoutId = globalThis.setTimeout(() => requestController.abort(), IMAGE_REQUEST_TIMEOUT_MS);

  let response: { output?: Array<{ type?: string; result?: string }> };
  try {
    response = (await client.responses.create(
      {
        model: params.settings.model,
        input: buildImagePrompt(params.prompt, params.settings.stylePrompt),
        tools: [{ type: "image_generation", size: IMAGE_SIZE }]
      } as Parameters<typeof client.responses.create>[0],
      { signal: requestController.signal }
    )) as { output?: Array<{ type?: string; result?: string }> };
  } finally {
    globalThis.clearTimeout(timeoutId);
    params.signal.removeEventListener("abort", abortFromParent);
  }

  const output = response.output ?? [];
  const base64 = output.find((item) => item.type === "image_generation_call")?.result;
  if (!base64) {
    throw new Error("生图返回为空");
  }

  return cropTo16x9(`data:image/png;base64,${base64}`);
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
