/**
 * SWR 缓存引擎：stale-while-revalidate 的最小实现。
 * - 新鲜期内直接返回缓存
 * - 过期后立即返回 stale 数据，并在后台重验证
 * - in-flight 去重：同一 key 的并发请求只打一次
 * - 订阅机制：缓存变化时通知所有持有者（乐观更新 / 跨组件同步）
 */
export interface CacheEntry<T = unknown> {
  key: string;
  data?: T;
  error?: unknown;
  at: number;
  promise?: Promise<T>;
  staleTime: number;
  optimistic?: boolean;
}

export type CacheEntryListener = (entry: CacheEntry) => void;

export class SWRCache {
  private entries = new Map<string, CacheEntry>();
  private subscribers = new Map<string, Set<CacheEntryListener>>();

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get<T = unknown>(key: string): CacheEntry<T> | undefined {
    return this.entries.get(key) as CacheEntry<T> | undefined;
  }

  private getOrCreate(key: string, staleTime: number): CacheEntry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { key, at: 0, staleTime };
      this.entries.set(key, entry);
    }
    return entry;
  }

  set<T>(key: string, data: T, staleTime: number, optimistic = false): CacheEntry<T> {
    const entry = this.getOrCreate(key, staleTime) as CacheEntry<T>;
    entry.data = data;
    entry.error = undefined;
    entry.at = Date.now();
    entry.staleTime = staleTime;
    entry.optimistic = optimistic;
    this.emit(key, entry as CacheEntry);
    return entry;
  }

  setError(key: string, error: unknown, staleTime: number): void {
    const entry = this.getOrCreate(key, staleTime);
    entry.error = error;
    this.emit(key, entry);
  }

  /**
   * 发起一次请求，并与缓存条目绑定：
   * 成功写缓存、失败写 error，期间 promise 供其它持有者复用（去重）。
   */
  startFetch<T>(key: string, factory: () => Promise<T>, staleTime: number): Promise<T> {
    const existing = this.entries.get(key);
    if (existing?.promise) return existing.promise as Promise<T>;
    const entry = this.getOrCreate(key, staleTime);
    const promise = factory().then(
      (data) => {
        const hit = this.set<T>(key, data, staleTime);
        hit.promise = undefined;
        return data;
      },
      (error) => {
        const hit = this.getOrCreate(key, staleTime);
        hit.error = error;
        hit.promise = undefined;
        this.emit(key, hit);
        throw error;
      }
    );
    entry.promise = promise as Promise<T>;
    return promise;
  }

  isStale(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry || entry.data === undefined) return true;
    return Date.now() - entry.at >= entry.staleTime;
  }

  invalidate(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      entry.at = 0;
      this.emit(key, entry);
    }
  }

  remove(key: string): void {
    this.entries.delete(key);
    const set = this.subscribers.get(key);
    if (set) {
      const stub: CacheEntry = { key, at: 0, staleTime: 0 };
      set.forEach((cb) => cb(stub));
    }
  }

  clear(): void {
    const keys = Array.from(this.entries.keys());
    this.entries.clear();
    keys.forEach((key) => this.remove(key));
  }

  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  subscribe(key: string, cb: CacheEntryListener): () => void {
    let set = this.subscribers.get(key);
    if (!set) {
      set = new Set();
      this.subscribers.set(key, set);
    }
    set.add(cb);
    return () => {
      set?.delete(cb);
      if (set && set.size === 0) this.subscribers.delete(key);
    };
  }

  private emit(key: string, entry: CacheEntry): void {
    const set = this.subscribers.get(key);
    if (set) set.forEach((cb) => cb(entry));
  }
}
