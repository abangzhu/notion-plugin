import { analyzeTranslationSource, translateInputs } from "./translation-service";
import { collectTranslationInputs, TRANSLATION_PORT_NAME } from "./translation";

const CONTENT_SCRIPT_FILE = "dist/content.js";

void chrome.storage.session
  .setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })
  .catch((error) => {
    console.warn("Failed to expose storage.session to content scripts", error);
  });

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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== TRANSLATION_PORT_NAME) return;

  let controller: AbortController | null = null;
  let activeJobId = "";

  const postError = (jobId: string, message: string) => {
    port.postMessage({
      type: "translation/error",
      jobId,
      message
    });
  };

  port.onMessage.addListener((message) => {
    if (message?.type === "translation/cancel") {
      if (controller && message.jobId === activeJobId) {
        controller.abort();
      }
      return;
    }

    if (message?.type !== "translation/start") return;

    controller?.abort();
    activeJobId = message.payload.jobId;
    controller = new AbortController();
    const jobController = controller;
    const jobId = activeJobId;

    void (async () => {
      try {
        const { doc, settings, sourceHash } = message.payload;
        const inputs = collectTranslationInputs(doc);

        port.postMessage({
          type: "translation/progress",
          jobId,
          step: "prepare",
          label: "步骤 1/4：准备翻译内容",
          detail: `已提取 ${inputs.length} 个可翻译单元`
        });

        if (inputs.length === 0) {
          port.postMessage({
            type: "translation/result",
            jobId,
            outputs: []
          });
          return;
        }

        let analysisSummary = "";
        if (settings.mode === "normal") {
          port.postMessage({
            type: "translation/progress",
            jobId,
            step: "analyze",
            label: "步骤 2/4：分析术语与语气"
          });

          const analysis = await analyzeTranslationSource({
            doc,
            settings,
            signal: jobController.signal
          });
          analysisSummary = analysis.summary;
        }

        port.postMessage({
          type: "translation/progress",
          jobId,
          step: "translate",
          label: settings.mode === "normal" ? "步骤 3/4：翻译内容" : "步骤 2/3：翻译内容",
          completed: 0,
          total: 0
        });

        const outputs = await translateInputs({
          inputs,
          settings,
          mode: settings.mode,
          analysisSummary,
          signal: jobController.signal,
          onChunkProgress: (completed, total) => {
            port.postMessage({
              type: "translation/progress",
              jobId,
              step: "translate",
              label:
                settings.mode === "normal" ? "步骤 3/4：翻译内容" : "步骤 2/3：翻译内容",
              detail: `分块 ${completed}/${total}`,
              completed,
              total
            });
          }
        });

        port.postMessage({
          type: "translation/progress",
          jobId,
          step: "apply",
          label: settings.mode === "normal" ? "步骤 4/4：生成预览" : "步骤 3/3：生成预览",
          detail: `源内容版本 ${sourceHash}`
        });

        port.postMessage({
          type: "translation/result",
          jobId,
          outputs
        });
      } catch (error) {
        if (jobController.signal.aborted) {
          postError(jobId, "翻译已取消");
          return;
        }

        postError(
          jobId,
          error instanceof Error ? error.message : "翻译失败，请检查模型配置和网络状态"
        );
      }
    })();
  });

  port.onDisconnect.addListener(() => {
    controller?.abort();
  });
});

// Image upload removed: images are copied as-is in HTML output.
