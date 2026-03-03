const CONTENT_SCRIPT_FILE = "dist/content.js";

const ensureContentScript = async (tabId: number) => {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILE]
  });
};

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggleDrawer" });
  } catch (error) {
    try {
      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: "toggleDrawer" });
    } catch (injectError) {
      // Swallow to avoid noisy console errors in case of unsupported pages.
      console.warn("Failed to inject content script", injectError);
    }
  }
});

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const uploadToImgBB = async (imageUrl: string, apiKey: string): Promise<string> => {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  const formData = new FormData();
  formData.append("image", base64);

  const uploadResponse = await fetch(
    `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: formData
    }
  );
  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload image: ${uploadResponse.status}`);
  }
  const data = (await uploadResponse.json()) as {
    success: boolean;
    data?: { url?: string; display_url?: string };
  };
  if (!data.success || !data.data?.url) {
    throw new Error("ImgBB upload failed");
  }
  return data.data.url ?? data.data.display_url ?? "";
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "uploadImage") return;
  const { src, apiKey } = message as { src: string; apiKey: string };
  (async () => {
    try {
      const uploadedUrl = await uploadToImgBB(src, apiKey);
      sendResponse({ success: true, url: uploadedUrl });
    } catch (error) {
      sendResponse({ success: false, error: (error as Error).message ?? "upload_failed" });
    }
  })();
  return true;
});
