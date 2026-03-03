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

const uploadToImgBB = async (base64: string, apiKey: string): Promise<string> => {
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
  const { src, apiKey, base64 } = message as {
    src?: string;
    apiKey: string;
    base64?: string;
  };
  (async () => {
    try {
      let payloadBase64 = base64;
      if (!payloadBase64 && src) {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        payloadBase64 = arrayBufferToBase64(buffer);
      }
      if (!payloadBase64) {
        throw new Error("Missing image payload");
      }
      const uploadedUrl = await uploadToImgBB(payloadBase64, apiKey);
      sendResponse({ success: true, url: uploadedUrl });
    } catch (error) {
      sendResponse({ success: false, error: (error as Error).message ?? "upload_failed" });
    }
  })();
  return true;
});
