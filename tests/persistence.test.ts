import assert from "node:assert/strict";
import test from "node:test";

import { createPersistentCache, planCacheEviction, type StorageAreaLike } from "../src/persistent-cache";
import { normalizePreviewPreferences } from "../src/preferences";
import {
  DEFAULT_FORMATTING_INSTRUCTIONS,
  normalizeFormattingSettings
} from "../src/formatting";
import {
  DEFAULT_ILLUSTRATION_STYLE_PROMPT,
  normalizeIllustrationSettings
} from "../src/illustration";

const createMemoryArea = (): StorageAreaLike & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>();
  const keysOf = (keys: string | string[]) => (Array.isArray(keys) ? keys : [keys]);
  return {
    data,
    get: async (keys) =>
      Object.fromEntries(keysOf(keys).filter((key) => data.has(key)).map((key) => [key, structuredClone(data.get(key))])),
    set: async (items) => {
      Object.entries(items).forEach(([key, value]) => data.set(key, structuredClone(value)));
    },
    remove: async (keys) => {
      keysOf(keys).forEach((key) => data.delete(key));
    }
  };
};

test("persistent cache survives a new cache instance (simulated extension reload)", async () => {
  const area = createMemoryArea();
  let now = 1_000;
  const options = { ttlMs: 10_000, maxEntries: 5, now: () => now };
  await createPersistentCache(area, options).set("fmt:a", { createdAt: now, operations: [1] });

  const reloaded = createPersistentCache(area, options);
  assert.deepEqual(await reloaded.get("fmt:a"), { createdAt: 1_000, operations: [1] });

  now = 20_000;
  assert.equal(await reloaded.get("fmt:a"), null, "expired entries are not returned");
  assert.equal(area.data.has("fmt:a"), false, "expired entries are removed from storage");
});

test("persistent cache evicts the oldest entries beyond the limit and on removal updates the index", async () => {
  const area = createMemoryArea();
  let now = 0;
  const cache = createPersistentCache(area, { ttlMs: 1_000_000, maxEntries: 2, indexKey: "idx", now: () => now });
  for (const key of ["a", "b", "c"]) {
    now += 10;
    await cache.set(key, { createdAt: now });
  }
  assert.equal(area.data.has("a"), false);
  assert.ok(area.data.has("b") && area.data.has("c"));
  assert.deepEqual(Object.keys(area.data.get("idx") as object).sort(), ["b", "c"]);

  await cache.remove("b");
  assert.equal(area.data.has("b"), false);
  assert.deepEqual(Object.keys(area.data.get("idx") as object), ["c"]);
});

test("concurrent writers from two cache instances never orphan entries outside the index", async () => {
  const area = createMemoryArea();
  const slow: StorageAreaLike = {
    get: async (keys) => { await new Promise((resolve) => setTimeout(resolve, 1)); return area.get(keys); },
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys)
  };
  const options = { ttlMs: 1_000_000, maxEntries: 2, indexKey: "idx", now: () => 100 };
  const tabA = createPersistentCache(slow, options);
  const tabB = createPersistentCache(slow, options);
  await Promise.all([tabA.set("a", { createdAt: 1 }), tabB.set("b", { createdAt: 2 })]);
  for (let i = 3; i <= 7; i += 1) await tabA.set(`k${i}`, { createdAt: i });
  const stored = [...area.data.keys()].filter((key) => key !== "idx").sort();
  assert.deepEqual(stored, Object.keys(area.data.get("idx") as object).sort());
  assert.equal(stored.length, 2);
});

test("cache eviction plan keeps the newest fresh entries", () => {
  const plan = planCacheEviction({ old: 0, mid: 50, new: 90, stale: -500 }, 100, { ttlMs: 200, maxEntries: 2 });
  assert.deepEqual(Object.keys(plan.keep).sort(), ["mid", "new"]);
  assert.deepEqual(plan.evict.sort(), ["old", "stale"]);
});

test("preview preferences fall back for unknown themes, fonts and out-of-range scales", () => {
  const fallback = { themeId: "apple", fontId: "default", fontScale: 1 };
  const valid = { themeIds: ["apple", "magazine"], fontIds: ["default", "pingfang"] };
  assert.deepEqual(
    normalizePreviewPreferences({ themeId: "magazine", fontId: "pingfang", fontScale: 1.1 }, fallback, valid),
    { themeId: "magazine", fontId: "pingfang", fontScale: 1.1 }
  );
  assert.deepEqual(
    normalizePreviewPreferences({ themeId: "removed", fontId: 3, fontScale: 9 }, fallback, valid),
    { themeId: "apple", fontId: "default", fontScale: 1.15 }
  );
  assert.deepEqual(normalizePreviewPreferences(undefined, fallback, valid), fallback);
});

test("formatting and illustration prompts default when empty but keep user text", () => {
  assert.equal(normalizeFormattingSettings(undefined).extraInstructions, DEFAULT_FORMATTING_INSTRUCTIONS);
  assert.equal(normalizeFormattingSettings({ extraInstructions: "   " }).extraInstructions, DEFAULT_FORMATTING_INSTRUCTIONS);
  assert.equal(normalizeFormattingSettings({ extraInstructions: "少用卡片" }).extraInstructions, "少用卡片");
  assert.ok(DEFAULT_FORMATTING_INSTRUCTIONS.length > 20);

  assert.equal(normalizeIllustrationSettings({ stylePrompt: "" }).stylePrompt, DEFAULT_ILLUSTRATION_STYLE_PROMPT);
  assert.equal(normalizeIllustrationSettings({ stylePrompt: "watercolor" }).stylePrompt, "watercolor");
});
