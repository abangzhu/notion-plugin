import { collectFormattingInputs } from "./formatting";
import { generateIllustrations, planIllustrations } from "./illustration-service";
import {
  ILLUSTRATION_PORT_NAME,
  type IllustrationBackgroundState,
  type IllustrationItem,
  type IllustrationJobRequest,
  type IllustrationPortClientMessage,
  type IllustrationPortServerMessage
} from "./illustration";

const ILLUSTRATION_JOB_STATE_PREFIX = "illustrationBackgroundJob";

// 生图耗时长（串行多张），单张 await 期间无 chrome API 活动会触发 MV3 service worker
// 30s 空闲终止 → 端口断开。job 运行期间周期性调用 chrome API 重置空闲计时器。
const KEEPALIVE_INTERVAL_MS = 20_000;

const startKeepAlive = (): (() => void) => {
  const timer = globalThis.setInterval(() => {
    try {
      chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
    } catch {
      // 忽略：仅用于保活
    }
  }, KEEPALIVE_INTERVAL_MS);

  return () => globalThis.clearInterval(timer);
};

type BackgroundIllustrationJob = {
  controller: AbortController;
  request: IllustrationJobRequest;
  state: IllustrationBackgroundState;
};

const illustrationJobs = new Map<number, BackgroundIllustrationJob>();
const illustrationSubscribers = new Map<number, Set<chrome.runtime.Port>>();

const getStorageKey = (tabId: number) => `${ILLUSTRATION_JOB_STATE_PREFIX}:${tabId}`;

const persistJobState = async (tabId: number, state: IllustrationBackgroundState | null) => {
  const key = getStorageKey(tabId);
  if (state) {
    try {
      await chrome.storage.session.set({ [key]: state });
    } catch (error) {
      // 含 base64 的成功态可能超配额：降级为不持久化，不影响当前会话
      console.warn("Failed to persist illustration job state", error);
    }
    return;
  }
  await chrome.storage.session.remove(key);
};

const readPersistedJobState = async (tabId: number): Promise<IllustrationBackgroundState | null> => {
  const key = getStorageKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return (stored[key] as IllustrationBackgroundState | undefined) ?? null;
};

const getTabIdFromPort = (port: chrome.runtime.Port): number | null => port.sender?.tab?.id ?? null;

const addSubscriber = (tabId: number, port: chrome.runtime.Port) => {
  const subscribers = illustrationSubscribers.get(tabId) ?? new Set<chrome.runtime.Port>();
  subscribers.add(port);
  illustrationSubscribers.set(tabId, subscribers);
};

const removeSubscriber = (tabId: number, port: chrome.runtime.Port) => {
  const subscribers = illustrationSubscribers.get(tabId);
  if (!subscribers) return;
  subscribers.delete(port);
  if (subscribers.size === 0) {
    illustrationSubscribers.delete(tabId);
  }
};

const postMessageSafe = (port: chrome.runtime.Port, message: IllustrationPortServerMessage) => {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post illustration message", error);
  }
};

const broadcast = (tabId: number, message: IllustrationPortServerMessage) => {
  const subscribers = illustrationSubscribers.get(tabId);
  if (!subscribers) return;
  for (const port of subscribers) {
    postMessageSafe(port, message);
  }
};

const getJob = (tabId: number): BackgroundIllustrationJob | null =>
  illustrationJobs.get(tabId) ?? null;

const getJobState = async (tabId: number): Promise<IllustrationBackgroundState | null> => {
  const activeJob = getJob(tabId);
  if (activeJob) return activeJob.state;

  const persistedState = await readPersistedJobState(tabId);
  if (persistedState?.status === "illustrating") {
    await persistJobState(tabId, null);
    return null;
  }
  return persistedState;
};

const isCurrentJob = (tabId: number, jobId: string): boolean =>
  getJob(tabId)?.request.jobId === jobId;

const updateJobState = async (
  tabId: number,
  jobId: string,
  state: IllustrationBackgroundState
): Promise<boolean> => {
  const job = getJob(tabId);
  if (!job || job.request.jobId !== jobId) return false;
  job.state = state;
  await persistJobState(tabId, state);
  return true;
};

const clearJob = async (tabId: number, jobId?: string) => {
  const job = getJob(tabId);
  if (job && jobId && job.request.jobId !== jobId) return;
  if (job) {
    illustrationJobs.delete(tabId);
  }
  await persistJobState(tabId, null);
};

const abortJob = (tabId: number, jobId?: string) => {
  const job = getJob(tabId);
  if (!job) return;
  if (jobId && job.request.jobId !== jobId) return;
  job.controller.abort();
};

const createProgressState = (
  request: IllustrationJobRequest,
  progress: Omit<IllustrationBackgroundState, "jobId" | "sourceHash" | "status">
): IllustrationBackgroundState => ({
  jobId: request.jobId,
  sourceHash: request.sourceHash,
  status: "illustrating",
  ...progress
});

const runIllustrationJob = async (tabId: number, request: IllustrationJobRequest) => {
  const controller = new AbortController();
  const job: BackgroundIllustrationJob = {
    controller,
    request,
    state: createProgressState(request, { step: "prepare", label: "步骤 1/3：分析配图位置" })
  };

  illustrationJobs.set(tabId, job);
  await persistJobState(tabId, job.state);

  const publishProgress = async (
    progress: Omit<IllustrationBackgroundState, "jobId" | "sourceHash" | "status">
  ) => {
    const nextState = createProgressState(request, progress);
    const updated = await updateJobState(tabId, request.jobId, nextState);
    if (!updated) return false;

    broadcast(tabId, {
      type: "illustration/progress",
      jobId: request.jobId,
      step: progress.step ?? "prepare",
      label: progress.label ?? "",
      detail: progress.detail,
      completed: progress.completed,
      total: progress.total
    });
    return true;
  };

  const publishResult = async (items: IllustrationItem[], requested: number) => {
    const nextState: IllustrationBackgroundState = {
      jobId: request.jobId,
      sourceHash: request.sourceHash,
      status: "success",
      items,
      requested
    };
    const updated = await updateJobState(tabId, request.jobId, nextState);
    if (!updated) return false;

    broadcast(tabId, { type: "illustration/result", jobId: request.jobId, items, requested });
    return true;
  };

  const publishError = async (message: string) => {
    const nextState: IllustrationBackgroundState = {
      jobId: request.jobId,
      sourceHash: request.sourceHash,
      status: "error",
      message
    };
    const updated = await updateJobState(tabId, request.jobId, nextState);
    if (!updated) return false;

    broadcast(tabId, { type: "illustration/error", jobId: request.jobId, message });
    return true;
  };

  const stopKeepAlive = startKeepAlive();

  try {
    const { doc, settings } = request;
    const inputs = collectFormattingInputs(doc);

    await publishProgress({
      step: "prepare",
      label: "步骤 1/3：分析配图位置",
      detail: `已分析 ${inputs.length} 个内容块`
    });

    if (inputs.length === 0) {
      await publishResult([], 0);
      return;
    }

    await publishProgress({ step: "plan", label: "步骤 2/3：规划配图" });

    const plan = await planIllustrations({
      title: doc.title ?? "",
      inputs,
      settings,
      signal: controller.signal
    });
    if (!isCurrentJob(tabId, request.jobId)) return;

    if (plan.length === 0) {
      await publishResult([], 0);
      return;
    }

    await publishProgress({
      step: "generate",
      label: "步骤 3/3：生成配图",
      detail: `共 ${plan.length} 张`,
      completed: 0,
      total: plan.length
    });

    const items = await generateIllustrations({
      plan,
      settings,
      signal: controller.signal,
      onProgress: (current, total) => {
        void publishProgress({
          step: "generate",
          label: "步骤 3/3：生成配图",
          detail: `生成第 ${current}/${total} 张`,
          completed: current,
          total
        });
      }
    });
    if (!isCurrentJob(tabId, request.jobId)) return;

    await publishResult(items, plan.length);
  } catch (error) {
    if (!isCurrentJob(tabId, request.jobId)) return;

    if (controller.signal.aborted) {
      await publishError("智能配图已取消");
      await clearJob(tabId, request.jobId);
      return;
    }

    await publishError(
      error instanceof Error
        ? error.message
        : `智能配图失败 (模型: ${request.settings.model})：请检查模型配置和网络状态`
    );
  } finally {
    stopKeepAlive();
  }
};

// 自注册端口与标签页清理监听器。在 background.ts 顶部调用一次即可。
export const setupIllustrationBackground = () => {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== ILLUSTRATION_PORT_NAME) return;

    const tabId = getTabIdFromPort(port);
    if (tabId == null) {
      port.disconnect();
      return;
    }

    addSubscriber(tabId, port);

    port.onMessage.addListener((message) => {
      const payload = message as IllustrationPortClientMessage;

      if (payload.type === "illustration/query-state") {
        void getJobState(tabId).then((state) => {
          postMessageSafe(port, { type: "illustration/state", state });
        });
        return;
      }

      if (payload.type === "illustration/cancel") {
        abortJob(tabId, payload.jobId);
        return;
      }

      if (payload.type !== "illustration/start") return;

      abortJob(tabId);
      void runIllustrationJob(tabId, payload.payload);
    });

    port.onDisconnect.addListener(() => {
      removeSubscriber(tabId, port);
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    abortJob(tabId);
    void clearJob(tabId);
    illustrationSubscribers.delete(tabId);
  });
};
