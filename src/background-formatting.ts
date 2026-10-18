import { planFormatting } from "./formatting-service";
import {
  collectFormattingInputs,
  FORMATTING_PORT_NAME,
  type FormattingBackgroundState,
  type FormattingJobRequest,
  type FormattingOperation,
  type FormattingPortClientMessage,
  type FormattingPortServerMessage
} from "./formatting";

const FORMATTING_JOB_STATE_PREFIX = "formattingBackgroundJob";

type BackgroundFormattingJob = {
  controller: AbortController;
  request: FormattingJobRequest;
  state: FormattingBackgroundState;
};

const formattingJobs = new Map<number, BackgroundFormattingJob>();
const formattingSubscribers = new Map<number, Set<chrome.runtime.Port>>();
const stateQueues = new Map<number, Promise<void>>();

// Serialize only state/storage work, never the long-running model request.
// A query following discard must wait for removal, including after a worker restart.
const withStateQueue = <T>(tabId: number, action: () => Promise<T> | T): Promise<T> => {
  const result = (stateQueues.get(tabId) ?? Promise.resolve()).then(action);
  const settled = result.then(() => {}, () => {});
  stateQueues.set(tabId, settled);
  void settled.then(() => {
    if (stateQueues.get(tabId) === settled) stateQueues.delete(tabId);
  });
  return result;
};

const getStorageKey = (tabId: number) => `${FORMATTING_JOB_STATE_PREFIX}:${tabId}`;

const persistJobState = async (tabId: number, state: FormattingBackgroundState | null) => {
  const key = getStorageKey(tabId);
  if (state) {
    await chrome.storage.session.set({ [key]: state });
    return;
  }
  await chrome.storage.session.remove(key);
};

const readPersistedJobState = async (tabId: number): Promise<FormattingBackgroundState | null> => {
  const key = getStorageKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return (stored[key] as FormattingBackgroundState | undefined) ?? null;
};

const getTabIdFromPort = (port: chrome.runtime.Port): number | null => port.sender?.tab?.id ?? null;

const addSubscriber = (tabId: number, port: chrome.runtime.Port) => {
  const subscribers = formattingSubscribers.get(tabId) ?? new Set<chrome.runtime.Port>();
  subscribers.add(port);
  formattingSubscribers.set(tabId, subscribers);
};

const removeSubscriber = (tabId: number, port: chrome.runtime.Port) => {
  const subscribers = formattingSubscribers.get(tabId);
  if (!subscribers) return;
  subscribers.delete(port);
  if (subscribers.size === 0) {
    formattingSubscribers.delete(tabId);
  }
};

const postMessageSafe = (port: chrome.runtime.Port, message: FormattingPortServerMessage) => {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post formatting message", error);
  }
};

const broadcast = (tabId: number, message: FormattingPortServerMessage) => {
  const subscribers = formattingSubscribers.get(tabId);
  if (!subscribers) return;
  for (const port of subscribers) {
    postMessageSafe(port, message);
  }
};

const getJob = (tabId: number): BackgroundFormattingJob | null => formattingJobs.get(tabId) ?? null;

const getJobState = async (tabId: number): Promise<FormattingBackgroundState | null> => {
  const activeJob = getJob(tabId);
  if (activeJob) return activeJob.state;

  const persistedState = await readPersistedJobState(tabId);
  if (persistedState?.status === "formatting") {
    await persistJobState(tabId, null);
    return null;
  }
  return persistedState;
};

const isCurrentJob = (tabId: number, jobId: string): boolean =>
  getJob(tabId)?.request.jobId === jobId;

const updateJobState = (
  tabId: number,
  jobId: string,
  state: FormattingBackgroundState,
  message: FormattingPortServerMessage
): Promise<boolean> => withStateQueue(tabId, async () => {
  const job = getJob(tabId);
  if (!job || job.request.jobId !== jobId) return false;
  job.state = state;
  await persistJobState(tabId, state);
  broadcast(tabId, message);
  return true;
});

const clearJob = (tabId: number, jobId?: string) => withStateQueue(tabId, async () => {
  const job = getJob(tabId);
  if (job && jobId && job.request.jobId !== jobId) return;
  if (job) {
    job.controller.abort();
    formattingJobs.delete(tabId);
  }
  await persistJobState(tabId, null);
});

const discardResult = (tabId: number, sourceHash: string, jobId?: string) =>
  withStateQueue(tabId, async () => {
    const state = getJob(tabId)?.state ?? await readPersistedJobState(tabId);
    if (state?.status !== "success" || state.sourceHash !== sourceHash ||
        (jobId !== undefined && state.jobId !== jobId)) return;
    await persistJobState(tabId, null);
    formattingJobs.delete(tabId);
    broadcast(tabId, { type: "formatting/state", state: null });
  });

const abortJob = (tabId: number, jobId?: string) => {
  const job = getJob(tabId);
  if (!job) return;
  if (jobId && job.request.jobId !== jobId) return;
  job.controller.abort();
};

const createProgressState = (
  request: FormattingJobRequest,
  progress: Omit<FormattingBackgroundState, "jobId" | "sourceHash" | "status">
): FormattingBackgroundState => ({
  jobId: request.jobId,
  sourceHash: request.sourceHash,
  status: "formatting",
  ...progress
});

const runFormattingJob = async (tabId: number, request: FormattingJobRequest) => {
  const controller = new AbortController();
  const job: BackgroundFormattingJob = {
    controller,
    request,
    state: createProgressState(request, { step: "prepare", label: "步骤 1/3：分析文档结构" })
  };

  await withStateQueue(tabId, async () => {
    abortJob(tabId);
    formattingJobs.set(tabId, job);
    await persistJobState(tabId, job.state);
  });
  if (!isCurrentJob(tabId, request.jobId) || controller.signal.aborted) return;

  const publishProgress = async (
    progress: Omit<FormattingBackgroundState, "jobId" | "sourceHash" | "status">
  ) => {
    const nextState = createProgressState(request, progress);
    return updateJobState(tabId, request.jobId, nextState, {
      type: "formatting/progress",
      jobId: request.jobId,
      step: progress.step ?? "prepare",
      label: progress.label ?? "",
      detail: progress.detail,
      completed: progress.completed,
      total: progress.total
    });
  };

  const publishResult = async (operations: FormattingOperation[]) => {
    const nextState: FormattingBackgroundState = {
      jobId: request.jobId,
      sourceHash: request.sourceHash,
      status: "success",
      operations
    };
    return updateJobState(tabId, request.jobId, nextState,
      { type: "formatting/result", jobId: request.jobId, operations });
  };

  const publishError = async (message: string) => {
    const nextState: FormattingBackgroundState = {
      jobId: request.jobId,
      sourceHash: request.sourceHash,
      status: "error",
      message
    };
    return updateJobState(tabId, request.jobId, nextState,
      { type: "formatting/error", jobId: request.jobId, message });
  };

  try {
    const { doc, settings } = request;
    const inputs = collectFormattingInputs(doc);

    await publishProgress({
      step: "prepare",
      label: "步骤 1/3：分析文档结构",
      detail: `已分析 ${inputs.length} 个内容块`
    });

    if (inputs.length === 0) {
      await publishResult([]);
      return;
    }

    await publishProgress({ step: "plan", label: "步骤 2/3：规划智能排版", completed: 0, total: 0 });

    const operations = await planFormatting({
      inputs,
      settings,
      signal: controller.signal,
      onChunkProgress: (current, total) => {
        void publishProgress({
          step: "plan",
          label: "步骤 2/3：规划智能排版",
          detail: `处理中 ${current}/${total}`,
          completed: current,
          total
        });
      }
    });
    if (!isCurrentJob(tabId, request.jobId)) return;

    await publishProgress({ step: "apply", label: "步骤 3/3：生成排版方案" });
    await publishResult(operations);
  } catch (error) {
    if (!isCurrentJob(tabId, request.jobId)) return;

    if (controller.signal.aborted) {
      await publishError("智能排版已取消");
      await clearJob(tabId, request.jobId);
      return;
    }

    await publishError(
      error instanceof Error
        ? error.message
        : `智能排版失败 (模型: ${request.settings.model})：请检查模型配置和网络状态`
    );
  }
};

// 自注册端口与标签页清理监听器。在 background.ts 顶部调用一次即可。
export const setupFormattingBackground = () => {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== FORMATTING_PORT_NAME) return;

    const tabId = getTabIdFromPort(port);
    if (tabId == null) {
      port.disconnect();
      return;
    }

    addSubscriber(tabId, port);

    port.onMessage.addListener((message) => {
      const payload = message as FormattingPortClientMessage;

      if (payload.type === "formatting/query-state") {
        void withStateQueue(tabId, async () => {
          const state = await getJobState(tabId);
          postMessageSafe(port, { type: "formatting/state", state });
        }).catch((error) => console.warn("Failed to read formatting state", error));
        return;
      }

      if (payload.type === "formatting/discard-result") {
        void discardResult(tabId, payload.sourceHash, payload.jobId)
          .catch((error) => console.warn("Failed to discard formatting result", error));
        return;
      }

      if (payload.type === "formatting/cancel") {
        void withStateQueue(tabId, () => abortJob(tabId, payload.jobId));
        return;
      }

      if (payload.type !== "formatting/start") return;

      void runFormattingJob(tabId, payload.payload);
    });

    port.onDisconnect.addListener(() => {
      removeSubscriber(tabId, port);
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void clearJob(tabId);
    formattingSubscribers.delete(tabId);
  });
};
