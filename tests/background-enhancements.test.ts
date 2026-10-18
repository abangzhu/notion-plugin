import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { setImmediate } from "node:timers/promises";

import { setupFormattingBackground } from "../src/background-formatting";
import { setupIllustrationBackground } from "../src/background-illustration";
import { DEFAULT_FORMATTING_SETTINGS } from "../src/formatting";
import { DEFAULT_ILLUSTRATION_SETTINGS } from "../src/illustration";

type Kind = "formatting" | "illustration";
type State = { jobId: string; sourceHash: string; status: string; [key: string]: unknown };
type Message = { type: string; state?: State | null; [key: string]: unknown };

const originalFetch = globalThis.fetch;
let networkAttempts = 0;
before(() => {
  globalThis.fetch = async () => {
    networkAttempts += 1;
    throw new Error("Background result tests must never call a real API");
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(networkAttempts, 0);
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await setImmediate();
  }
  assert.ok(condition(), "background operation did not finish");
};

let nextTabId = 100;
const createChrome = (kind: Kind) => {
  const tabId = nextTabId++;
  const key = `${kind}BackgroundJob:${tabId}`;
  const storage = new Map<string, State>();
  const listeners: Array<(port: unknown) => void> = [];
  const removedListeners: Array<(id: number) => void> = [];
  const hooks = {
    beforeGet: undefined as (() => Promise<void>) | undefined,
    beforeSet: undefined as ((state: State) => Promise<void>) | undefined,
    beforeRemove: undefined as (() => Promise<void>) | undefined
  };
  const chromeMock = {
    runtime: {
      onConnect: { addListener: (listener: (port: unknown) => void) => listeners.push(listener) },
      getPlatformInfo: (callback: () => void) => callback()
    },
    tabs: { onRemoved: { addListener: (listener: (id: number) => void) => removedListeners.push(listener) } },
    storage: { session: {
      get: async (storageKey: string) => {
        const value = storage.get(storageKey);
        await hooks.beforeGet?.();
        return value ? { [storageKey]: structuredClone(value) } : {};
      },
      set: async (values: Record<string, State>) => {
        for (const [storageKey, value] of Object.entries(values)) {
          await hooks.beforeSet?.(value);
          storage.set(storageKey, structuredClone(value));
        }
      },
      remove: async (storageKey: string) => {
        await hooks.beforeRemove?.();
        storage.delete(storageKey);
      }
    } }
  };
  Object.assign(globalThis, { chrome: chromeMock });
  (kind === "formatting" ? setupFormattingBackground : setupIllustrationBackground)();

  const connect = (id = tabId) => {
    const messages: Message[] = [];
    let receive: (message: Message) => void = () => {};
    let disconnect: () => void = () => {};
    const port = {
      name: kind,
      sender: { tab: { id } },
      postMessage: (message: Message) => messages.push(message),
      onMessage: { addListener: (listener: typeof receive) => { receive = listener; } },
      onDisconnect: { addListener: (listener: () => void) => { disconnect = listener; } },
      disconnect: () => disconnect()
    };
    for (const listener of listeners) listener(port);
    return { messages, send: (message: Message) => receive(message), disconnect: port.disconnect };
  };
  return { tabId, key, storage, hooks, connect,
    removeTab: () => { for (const listener of removedListeners) listener(tabId); }
  };
};

const success = (kind: Kind, jobId = "completed-job", sourceHash = "source-a"): State => ({
  jobId, sourceHash, status: "success",
  ...(kind === "formatting" ? { operations: [] } : { items: [], requested: 0 })
});

for (const kind of ["formatting", "illustration"] as const) {
  test(`${kind}: discarded persisted success does not return when reopening the drawer`, async () => {
    const env = createChrome(kind);
    env.storage.set(env.key, success(kind));
    const port = env.connect();
    port.send({ type: `${kind}/discard-result`, sourceHash: "source-a" });
    port.send({ type: `${kind}/query-state` });
    await waitFor(() => port.messages.some((message) => message.type === `${kind}/state`));
    assert.equal(env.storage.has(env.key), false);
    assert.ok(port.messages.every((message) => message.state === null));

    port.disconnect();
    const reopened = env.connect();
    reopened.send({ type: `${kind}/query-state` });
    await waitFor(() => reopened.messages.length > 0);
    assert.equal(reopened.messages.at(-1)?.state, null);
  });

  test(`${kind}: discard only removes a matching successful result in the sender tab`, async () => {
    const env = createChrome(kind);
    const otherKey = `${kind}BackgroundJob:${env.tabId + 10_000}`;
    const completed = success(kind);
    env.storage.set(otherKey, completed);
    const port = env.connect();
    for (const [state, sourceHash, jobId] of [
      [completed, "different-source", "completed-job"],
      [completed, "source-a", "different-job"],
      [{ ...completed, status: "error" }, "source-a", "completed-job"],
      [{ ...completed, status: kind === "formatting" ? "formatting" : "illustrating" }, "source-a", "completed-job"]
    ] as const) {
      env.storage.set(env.key, state);
      port.send({ type: `${kind}/discard-result`, sourceHash, jobId });
      for (let turn = 0; turn < 5; turn += 1) await setImmediate();
      assert.deepEqual(env.storage.get(env.key), state);
      assert.equal(port.messages.length, 0);
    }
    env.storage.set(env.key, completed);
    port.send({ type: `${kind}/discard-result`, sourceHash: "source-a", jobId: "completed-job" });
    await waitFor(() => !env.storage.has(env.key));
    assert.deepEqual(env.storage.get(otherKey), completed);
  });

  test(`${kind}: a query immediately after discard waits for persisted removal`, async () => {
    const env = createChrome(kind);
    env.storage.set(env.key, success(kind));
    const gate = deferred();
    let removalStarted = false;
    env.hooks.beforeRemove = async () => { removalStarted = true; await gate.promise; };
    const port = env.connect();
    port.send({ type: `${kind}/discard-result`, sourceHash: "source-a" });
    port.send({ type: `${kind}/query-state` });
    try {
      await waitFor(() => removalStarted || port.messages.length > 0);
      assert.equal(port.messages.length, 0, "query must not return the old persisted result");
    } finally {
      gate.resolve();
    }
    await waitFor(() => port.messages.length >= 2);
    assert.ok(port.messages.every((message) => message.state === null));
  });

  test(`${kind}: discard clears in-memory success and cannot race a pending success write`, async () => {
    const env = createChrome(kind);
    const gate = deferred();
    let successWriteStarted = false;
    env.hooks.beforeSet = async (state) => {
      if (state.status === "success") {
        successWriteStarted = true;
        await gate.promise;
      }
    };
    const port = env.connect();
    // An empty document completes before either AI service is called.
    port.send({ type: `${kind}/start`, payload: {
      jobId: "live-job", sourceHash: "source-a", doc: { blocks: [] },
      settings: kind === "formatting" ? DEFAULT_FORMATTING_SETTINGS : DEFAULT_ILLUSTRATION_SETTINGS
    } });
    try {
      await waitFor(() => successWriteStarted);
      port.messages.length = 0;
      port.send({ type: `${kind}/discard-result`, sourceHash: "source-a", jobId: "live-job" });
      port.send({ type: `${kind}/query-state` });
    } finally {
      gate.resolve();
    }
    await waitFor(() => port.messages.filter((message) => message.type === `${kind}/state`).length >= 2);
    assert.equal(env.storage.has(env.key), false);
    const stateMessages = port.messages.filter((message) => message.type === `${kind}/state`);
    assert.ok(stateMessages.every((message) => message.state === null));
    const firstClear = port.messages.findIndex((message) => message.type === `${kind}/state`);
    assert.ok(port.messages.slice(firstClear).every((message) => message.type !== `${kind}/result`));
  });

  test(`${kind}: discard leaves a running job intact`, async () => {
    const env = createChrome(kind);
    const gate = deferred();
    let initialWriteStarted = false;
    env.hooks.beforeSet = async () => {
      if (!initialWriteStarted) {
        initialWriteStarted = true;
        await gate.promise;
      }
    };
    const port = env.connect();
    port.send({ type: `${kind}/start`, payload: {
      jobId: "running-job", sourceHash: "source-a", doc: { blocks: [] },
      settings: kind === "formatting" ? DEFAULT_FORMATTING_SETTINGS : DEFAULT_ILLUSTRATION_SETTINGS
    } });
    try {
      await waitFor(() => initialWriteStarted);
      port.send({ type: `${kind}/discard-result`, sourceHash: "source-a", jobId: "running-job" });
      port.send({ type: `${kind}/query-state` });
    } finally {
      gate.resolve();
    }
    await waitFor(() => port.messages.some((message) => message.type === `${kind}/result`));
    const stateMessage = port.messages.find((message) => message.type === `${kind}/state`);
    assert.equal(stateMessage?.state?.status, kind === "formatting" ? "formatting" : "illustrating");
    assert.equal(env.storage.get(env.key)?.status, "success");
    assert.equal(env.storage.get(env.key)?.jobId, "running-job");
  });

  test(`${kind}: a new start queued behind discard is not removed with the old result`, async () => {
    const env = createChrome(kind);
    env.storage.set(env.key, success(kind));
    const gate = deferred();
    let removalStarted = false;
    env.hooks.beforeRemove = async () => { removalStarted = true; await gate.promise; };
    const port = env.connect();
    port.send({ type: `${kind}/discard-result`, sourceHash: "source-a" });
    try {
      await waitFor(() => removalStarted);
      port.send({ type: `${kind}/start`, payload: {
        jobId: "new-job", sourceHash: "source-b", doc: { blocks: [] },
        settings: kind === "formatting" ? DEFAULT_FORMATTING_SETTINGS : DEFAULT_ILLUSTRATION_SETTINGS
      } });
    } finally {
      gate.resolve();
    }
    await waitFor(() => port.messages.some((message) => message.type === `${kind}/result` && message.jobId === "new-job"));
    assert.equal(env.storage.get(env.key)?.jobId, "new-job");
    assert.equal(env.storage.get(env.key)?.status, "success");
    port.send({ type: `${kind}/query-state` });
    await waitFor(() => port.messages.at(-1)?.state?.jobId === "new-job");
  });

  test(`${kind}: closing a tab while initialization is queued prevents model work and stale state`, async () => {
    const env = createChrome(kind);
    const gate = deferred();
    let initialWriteStarted = false;
    let writes = 0;
    env.hooks.beforeSet = async () => {
      writes += 1;
      initialWriteStarted = true;
      await gate.promise;
    };
    const port = env.connect();
    port.send({ type: `${kind}/start`, payload: {
      jobId: "closed-job", sourceHash: "source-a", doc: { blocks: [
        { type: "paragraph", children: [{ type: "text", content: "Never send this to a model." }] }
      ] },
      settings: kind === "formatting" ? DEFAULT_FORMATTING_SETTINGS : DEFAULT_ILLUSTRATION_SETTINGS
    } });
    try {
      await waitFor(() => initialWriteStarted);
      env.removeTab();
    } finally {
      gate.resolve();
    }
    for (let turn = 0; turn < 10; turn += 1) await setImmediate();
    assert.equal(env.storage.has(env.key), false);
    assert.equal(writes, 1, "no progress/result should be persisted after removal");
    assert.equal(port.messages.length, 0);
  });
}
