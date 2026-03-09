import type { Block, Doc } from "./types";

export type ImageMap = Map<string, string>;

export type ImageLoadResult = {
  url: string;
  dataUri?: string;
  error?: string;
};

const collectImageUrlsFromBlocks = (blocks: Block[], urls: Set<string>): void => {
  for (const block of blocks) {
    if (block.type === "image" && block.src) {
      urls.add(block.src);
    }
    if (block.type === "list") {
      for (const item of block.items) {
        if (item.nested) {
          for (const nested of item.nested) {
            collectImageUrlsFromBlocks([nested], urls);
          }
        }
      }
    }
  }
};

export const extractImageUrls = (doc: Doc): string[] => {
  const urls = new Set<string>();
  collectImageUrlsFromBlocks(doc.blocks, urls);
  return [...urls];
};

export const buildImageMap = (results: ImageLoadResult[]): ImageMap => {
  const map: ImageMap = new Map();
  for (const r of results) {
    if (r.dataUri) {
      map.set(r.url, r.dataUri);
    }
  }
  return map;
};

const loadSingleImage = (url: string): Promise<ImageLoadResult> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        resolve({ url, dataUri: canvas.toDataURL() });
      } catch {
        resolve({ url, error: "Canvas conversion failed" });
      }
    };
    img.onerror = () => resolve({ url, error: "Image load failed" });
    img.src = url;
  });

export const preloadImages = async (
  urls: string[],
  onProgress?: (loaded: number, total: number) => void
): Promise<ImageLoadResult[]> => {
  const CONCURRENCY = 3;
  let loaded = 0;
  const results: ImageLoadResult[] = [];

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(loadSingleImage));
    results.push(...batchResults);
    loaded += batchResults.length;
    onProgress?.(loaded, urls.length);
  }

  return results;
};
