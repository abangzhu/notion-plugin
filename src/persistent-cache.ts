// 跨扩展重载持久化的结果缓存（译文 / 排版 / 配图）。
// chrome.storage.session 会在扩展重载、浏览器重启时清空，导致耗时的 AI 结果丢失；
// 这里改存 chrome.storage.local，并维护一个轻量索引做 TTL 过期与数量上限淘汰，
// 避免逐条读取（配图含 base64，体积很大）。

export type StorageAreaLike = {
  get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

export type CacheEntry = { createdAt: number };

export type PersistentCacheOptions = {
  ttlMs: number;
  maxEntries: number;
  indexKey?: string;
  now?: () => number;
};

export type PersistentCache = {
  get: <T extends CacheEntry>(key: string) => Promise<T | null>;
  set: <T extends CacheEntry>(key: string, entry: T) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

type CacheIndex = Record<string, number>;

export const DEFAULT_CACHE_INDEX_KEY = "resultCacheIndex";

const readIndex = async (area: StorageAreaLike, indexKey: string): Promise<CacheIndex> => {
  const stored = await area.get(indexKey);
  const value = stored[indexKey];
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])
    )
  );
};

// 纯函数：给出新索引与需要删除的键（过期 + 超出上限的最旧条目）
export const planCacheEviction = (
  index: CacheIndex,
  now: number,
  options: Pick<PersistentCacheOptions, "ttlMs" | "maxEntries">
): { keep: CacheIndex; evict: string[] } => {
  const fresh = Object.entries(index).filter(([, createdAt]) => now - createdAt <= options.ttlMs);
  const expired = Object.keys(index).filter((key) => now - index[key] > options.ttlMs);
  const newestFirst = [...fresh].sort((a, b) => b[1] - a[1]);
  const kept = newestFirst.slice(0, Math.max(1, options.maxEntries));
  const overflow = newestFirst.slice(Math.max(1, options.maxEntries)).map(([key]) => key);
  return { keep: Object.fromEntries(kept), evict: [...expired, ...overflow] };
};

// 同一索引的读-改-写必须串行，否则多标签页 / 过期删除与写入并发会互相覆盖索引，
// 被覆盖掉的条目不再受淘汰管理（配图 base64 会永久残留）。
// 跨标签页用 Web Locks（内容脚本可用）；不可用时退化为本上下文内的 Promise 队列。
const localQueues = new Map<string, Promise<unknown>>();

const withIndexLock = <T>(indexKey: string, task: () => Promise<T>): Promise<T> => {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (locks?.request) return locks.request(`n2w:${indexKey}`, task) as Promise<T>;
  const previous = localQueues.get(indexKey) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  localQueues.set(indexKey, next);
  return next;
};

export const createPersistentCache = (
  area: StorageAreaLike,
  options: PersistentCacheOptions
): PersistentCache => {
  const indexKey = options.indexKey ?? DEFAULT_CACHE_INDEX_KEY;
  const now = options.now ?? (() => Date.now());

  const get = async <T extends CacheEntry>(key: string): Promise<T | null> => {
    const stored = await area.get(key);
    const entry = stored[key] as T | undefined;
    if (!entry || typeof entry.createdAt !== "number") return null;
    if (now() - entry.createdAt > options.ttlMs) {
      await remove(key);
      return null;
    }
    return entry;
  };

  const set = <T extends CacheEntry>(key: string, entry: T): Promise<void> =>
    withIndexLock(indexKey, async () => {
    const index = await readIndex(area, indexKey);
    const { keep, evict } = planCacheEviction({ ...index, [key]: entry.createdAt }, now(), options);
    const toRemove = evict.filter((evictKey) => evictKey !== key);
    if (toRemove.length > 0) await area.remove(toRemove);
    // 先写索引再写条目：条目写入失败（配额）时索引里多一个悬空键，下次淘汰即可清理
    await area.set({ [indexKey]: keep });
    if (keep[key] !== undefined) await area.set({ [key]: entry });
    });

  const remove = (key: string): Promise<void> =>
    withIndexLock(indexKey, async () => {
      const index = await readIndex(area, indexKey);
      const { [key]: _removed, ...rest } = index;
      await area.remove(key);
      await area.set({ [indexKey]: rest });
    });

  return { get, set, remove };
};
