import { analyzeTranslationSource, translateInputs } from "./translation-service";
import {
  collectTranslationInputs,
  TRANSLATION_PORT_NAME,
  type TranslationBackgroundState,
  type TranslationJobRequest,
  type TranslationPortClientMessage,
  type TranslationPortServerMessage
} from "./translation";

const CONTENT_SCRIPT_FILE = "dist/content.js";
const TRANSLATION_JOB_STATE_PREFIX = "translationBackgroundJob";

type BackgroundTranslationJob = {
  controller: AbortController;
  request: TranslationJobRequest;
  state: TranslationBackgroundState;
};

void chrome.storage.session
  .setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })
  .catch((error) => {
    console.warn("Failed to expose storage.session to content scripts", error);
  });

const translationJobs = new Map<number, BackgroundTranslationJob>();
const translationSubscribers = new Map<number, Set<chrome.runtime.Port>>();

const getTranslationJobStorageKey = (tabId: number) => `${TRANSLATION_JOB_STATE_PREFIX}:${tabId}`;

const persistTranslationJobState = async (
  tabId: number,
  state: TranslationBackgroundState | null
) => {
  const key = getTranslationJobStorageKey(tabId);
  if (state) {
    await chrome.storage.session.set({ [key]: state });
    return;
  }

  await chrome.storage.session.remove(key);
};

const readPersistedTranslationJobState = async (
  tabId: number
): Promise<TranslationBackgroundState | null> => {
  const key = getTranslationJobStorageKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return (stored[key] as TranslationBackgroundState | undefined) ?? null;
};

const getTabIdFromPort = (port: chrome.runtime.Port): number | null => port.sender?.tab?.id ?? null;

const addTranslationSubscriber = (tabId: number, port: chrome.runtime.Port) => {
  const subscribers = translationSubscribers.get(tabId) ?? new Set<chrome.runtime.Port>();
  subscribers.add(port);
  translationSubscribers.set(tabId, subscribers);
};

const removeTranslationSubscriber = (tabId: number, port: chrome.runtime.Port) => {
  const subscribers = translationSubscribers.get(tabId);
  if (!subscribers) return;
  subscribers.delete(port);
  if (subscribers.size === 0) {
    translationSubscribers.delete(tabId);
  }
};

const postMessageSafe = (port: chrome.runtime.Port, message: TranslationPortServerMessage) => {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post translation message", error);
  }
};

const broadcastTranslationMessage = (tabId: number, message: TranslationPortServerMessage) => {
  const subscribers = translationSubscribers.get(tabId);
  if (!subscribers) return;

  for (const port of subscribers) {
    postMessageSafe(port, message);
  }
};

const getTranslationJob = (tabId: number): BackgroundTranslationJob | null =>
  translationJobs.get(tabId) ?? null;

const getTranslationJobState = async (
  tabId: number
): Promise<TranslationBackgroundState | null> => {
  const activeJob = getTranslationJob(tabId);
  if (activeJob) return activeJob.state;

  const persistedState = await readPersistedTranslationJobState(tabId);
  if (persistedState?.status === "translating") {
    await persistTranslationJobState(tabId, null);
    return null;
  }

  return persistedState;
};

const isCurrentTranslationJob = (tabId: number, jobId: string): boolean =>
  getTranslationJob(tabId)?.request.jobId === jobId;

const updateTranslationJobState = async (
  tabId: number,
  jobId: string,
  state: TranslationBackgroundState
): Promise<boolean> => {
  const job = getTranslationJob(tabId);
  if (!job || job.request.jobId !== jobId) return false;
  job.state = state;
  await persistTranslationJobState(tabId, state);
  return true;
};

const clearTranslationJob = async (tabId: number, jobId?: string) => {
  const job = getTranslationJob(tabId);
  if (job && jobId && job.request.jobId !== jobId) return;
  if (job) {
    translationJobs.delete(tabId);
  }
  await persistTranslationJobState(tabId, null);
};

const abortTranslationJob = (tabId: number, jobId?: string) => {
  const job = getTranslationJob(tabId);
  if (!job) return;
  if (jobId && job.request.jobId !== jobId) return;
  job.controller.abort();
};

const createProgressState = (
  request: TranslationJobRequest,
  progress: Omit<TranslationBackgroundState, "jobId" | "sourceHash" | "status">
): TranslationBackgroundState => ({
  jobId: request.jobId,
  sourceHash: request.sourceHash,
  status: "translating",
  ...progress
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

const runTranslationJob = async (tabId: number, request: TranslationJobRequest) => {
  const controller = new AbortController();
  const job: BackgroundTranslationJob = {
    controller,
    request,
    state: createProgressState(request, {
      step: "prepare",
      label: request.settings.mode === "normal" ? "步骤 1/4：准备翻译内容" : "步骤 1/3：准备翻译内容"
    })
  };

  translationJobs.set(tabId, job);
  await persistTranslationJobState(tabId, job.state);

  const publishProgress = async (
    progress: Omit<TranslationBackgroundState, "jobId" | "sourceHash" | "status">
  ) => {
    const nextState = createProgressState(request, progress);
    const updated = await updateTranslationJobState(tabId, request.jobId, nextState);
    if (!updated) return false;

    broadcastTranslationMessage(tabId, {
      type: "translation/progress",
      jobId: request.jobId,
      step: progress.step ?? "prepare",
      label: progress.label ?? "",
      detail: progress.detail,
      completed: progress.completed,
      total: progress.total
    });
    return true;
  };

  const publishResult = async (outputs: TranslationBackgroundState["outputs"]) => {
    const nextState: TranslationBackgroundState = {
      jobId: request.jobId,
      sourceHash: request.sourceHash,
      status: "success",
      outputs
    };
    const updated = await updateTranslationJobState(tabId, request.jobId, nextState);
    if (!updated) return false;

    broadcastTranslationMessage(tabId, {
      type: "translation/result",
      jobId: request.jobId,
      outputs: outputs ?? []
    });
    return true;
  };

  const publishError = async (message: string) => {
    const nextState: TranslationBackgroundState = {
      jobId: request.jobId,
      sourceHash: request.sourceHash,
      status: "error",
      message
    };
    const updated = await updateTranslationJobState(tabId, request.jobId, nextState);
    if (!updated) return false;

    broadcastTranslationMessage(tabId, {
      type: "translation/error",
      jobId: request.jobId,
      message
    });
    return true;
  };

  try {
    const { doc, settings, sourceHash } = request;
    const inputs = collectTranslationInputs(doc);

    await publishProgress({
      step: "prepare",
      label: settings.mode === "normal" ? "步骤 1/4：准备翻译内容" : "步骤 1/3：准备翻译内容",
      detail: `已提取 ${inputs.length} 个可翻译单元`
    });

    if (inputs.length === 0) {
      await publishResult([]);
      return;
    }

    let analysisSummary = "";
    if (settings.mode === "normal") {
      await publishProgress({
        step: "analyze",
        label: "步骤 2/4：分析术语与语气"
      });

      const analysis = await analyzeTranslationSource({
        doc,
        settings,
        signal: controller.signal
      });
      if (!isCurrentTranslationJob(tabId, request.jobId)) return;
      analysisSummary = analysis.summary;
    }

    await publishProgress({
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
      signal: controller.signal,
      onChunkProgress: (current, total) => {
        void publishProgress({
          step: "translate",
          label: settings.mode === "normal" ? "步骤 3/4：翻译内容" : "步骤 2/3：翻译内容",
          detail: `处理中 ${current}/${total}`,
          completed: current,
          total
        });
      }
    });
    if (!isCurrentTranslationJob(tabId, request.jobId)) return;

    await publishProgress({
      step: "apply",
      label: settings.mode === "normal" ? "步骤 4/4：生成预览" : "步骤 3/3：生成预览",
      detail: `源内容版本 ${sourceHash}`
    });

    await publishResult(outputs);
  } catch (error) {
    if (!isCurrentTranslationJob(tabId, request.jobId)) return;

    if (controller.signal.aborted) {
      await publishError("翻译已取消");
      await clearTranslationJob(tabId, request.jobId);
      return;
    }

    await publishError(
      error instanceof Error ? error.message : "翻译失败，请检查模型配置和网络状态"
    );
  }
};

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== TRANSLATION_PORT_NAME) return;

  const tabId = getTabIdFromPort(port);
  if (tabId == null) {
    port.disconnect();
    return;
  }

  addTranslationSubscriber(tabId, port);

  port.onMessage.addListener((message) => {
    const payload = message as TranslationPortClientMessage;

    if (payload.type === "translation/query-state") {
      void getTranslationJobState(tabId).then((state) => {
        postMessageSafe(port, {
          type: "translation/state",
          state
        });
      });
      return;
    }

    if (payload.type === "translation/cancel") {
      abortTranslationJob(tabId, payload.jobId);
      return;
    }

    if (payload.type !== "translation/start") return;

    abortTranslationJob(tabId);
    void runTranslationJob(tabId, payload.payload);
  });

  port.onDisconnect.addListener(() => {
    removeTranslationSubscriber(tabId, port);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  abortTranslationJob(tabId);
  void clearTranslationJob(tabId);
  translationSubscribers.delete(tabId);
});

// Image upload removed: images are copied as-is in HTML output.
