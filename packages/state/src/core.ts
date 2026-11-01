import { cloneSnapshot, replaceInPlace, unwrap } from './snapshot.js';
import { RAW } from './symbols.js';

export type EqualityFn<T> = (a: T, b: T) => boolean;

export interface ChangeRecord {
  /** 变更路径，根的子代为 '/key'，深层为 '/a/b/0/c' */
  path: string;
  op: 'set' | 'delete';
  value?: unknown;
  prev?: unknown;
}

export interface CommitRecord {
  id: number;
  at: number;
  batchId: number;
  changes: ChangeRecord[];
}

export type StateListener<S> = (state: S, commit: CommitRecord) => void;

export interface StateOptions {
  /** Store 名称，DevTools 展示用 */
  name?: string;
  /** 时间旅行历史容量，默认 100 */
  maxHistory?: number;
  /** 关闭后不记录快照（省内存），默认 true */
  timeTravel?: boolean;
  /** 每次提交的回调，等价于 subscribe */
  onChange?: StateListener<object>;
}

export interface TimeTravelEntry {
  index: number;
  at: number;
  isCurrent: boolean;
}

export interface TimeTravelApi<S> {
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): S | null;
  redo(): S | null;
  jumpTo(index: number): S | null;
  first(): S | null;
  last(): S | null;
  entries(): TimeTravelEntry[];
  size(): number;
  /** 导出全部历史快照（DevTools 时间旅行/持久化） */
  exportAll(): Array<{ at: number; snapshot: unknown }>;
}

export interface UtopiaState<S extends object> {
  readonly name: string;
  /** 单调递增的提交版本号，React useSyncExternalStore 的变化信号 */
  readonly version: number;
  /** 响应式根代理：直接读写即触发提交 */
  readonly state: S;
  setState(patch: Partial<S> | ((draft: S) => void)): void;
  batch(fn: (draft: S) => void): void;
  subscribe(listener: StateListener<S>): () => void;
  select<T>(selector: (state: S) => T, listener: (value: T) => void, equalityFn?: EqualityFn<T>): () => void;
  getSnapshot(): S;
  inspect(): CommitRecord[];
  timeTravel: TimeTravelApi<S>;
}

interface SelectorSub<S, T> {
  selector: (state: S) => T;
  listener: (value: T) => void;
  eq: EqualityFn<T>;
  last: T;
}

interface HistoryItem {
  at: number;
  snapshot: unknown;
}

function joinPath(base: string, key: PropertyKey): string {
  return base === '' ? `/${String(key)}` : `${base}/${String(key)}`;
}

function reportError(e: unknown): void {
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error('[utopia/state] 订阅者抛出异常:', e);
  }
}

/**
 * createState —— 唯一需要记住的 API。
 *
 * ```ts
 * const store = createState({ count: 0 });
 * store.state.count++;            // 即提交
 * store.select(s => s.count, render);
 * store.timeTravel.undo();
 * ```
 */
export function createState<S extends object>(initial: S, options: StateOptions = {}): UtopiaState<S> {
  const name = options.name ?? 'utopia';
  const maxHistory = Math.max(1, options.maxHistory ?? 100);
  const enableTimeTravel = options.timeTravel !== false;

  const target = cloneSnapshot(initial) as S;
  const proxies = new WeakMap<object, object>();

  let pending: ChangeRecord[] = [];
  let batchDepth = 0;
  let batchId = 0;
  let version = 0;
  let commitSeq = 0;
  let applying = false;

  const listeners = new Set<StateListener<S>>();
  const selectorSubs = new Set<SelectorSub<S, unknown>>();
  const commitLog: CommitRecord[] = [];
  const COMMIT_LOG_CAP = 500;

  let history: HistoryItem[] = enableTimeTravel ? [{ at: Date.now(), snapshot: cloneSnapshot(target) }] : [];
  let cursor = 0;

  function commit(): void {
    if (pending.length === 0) return;
    const changes = pending;
    pending = [];
    version++;
    const record: CommitRecord = { id: ++commitSeq, at: Date.now(), batchId, changes };
    commitLog.push(record);
    if (commitLog.length > COMMIT_LOG_CAP) commitLog.shift();

    if (enableTimeTravel) {
      history = history.slice(0, cursor + 1);
      history.push({ at: Date.now(), snapshot: cloneSnapshot(target) });
      if (history.length > maxHistory) history.shift();
      cursor = history.length - 1;
    }
    notify(record);
  }

  function notify(record: CommitRecord): void {
    for (const l of listeners) {
      try { l(root, record); } catch (e) { reportError(e); }
    }
    for (const sub of selectorSubs) {
      const cur = sub.selector(root);
      if (!sub.eq(sub.last, cur)) {
        sub.last = cur;
        try { sub.listener(cur); } catch (e) { reportError(e); }
      }
    }
  }

  function makeProxy<T extends object>(nodeValue: T, nodePath: string): T {
    const existing = proxies.get(nodeValue);
    if (existing) return existing as T;
    const proxy = new Proxy(nodeValue, {
      get(obj, key) {
        if (key === RAW) return obj;
        const value = Reflect.get(obj, key, obj);
        if (value !== null && typeof value === 'object') {
          return makeProxy(value, joinPath(nodePath, key));
        }
        return value;
      },
      set(obj, key, value) {
        const raw = unwrap(value) as unknown;
        const prev = Reflect.get(obj, key, obj);
        if (Object.is(prev, raw)) return true;
        const ok = Reflect.set(obj, key, raw, obj);
        if (!applying) {
          pending.push({ path: joinPath(nodePath, key), op: 'set', value: raw, prev });
          if (batchDepth === 0) commit();
        }
        return ok;
      },
      deleteProperty(obj, key) {
        const had = Reflect.has(obj, key);
        const prev = Reflect.get(obj, key, obj);
        const ok = Reflect.deleteProperty(obj, key);
        if (!applying && had) {
          pending.push({ path: joinPath(nodePath, key), op: 'delete', prev });
          if (batchDepth === 0) commit();
        }
        return ok;
      }
    });
    proxies.set(nodeValue, proxy);
    return proxy as T;
  }

  const root = makeProxy(target, '') as S;

  function applySnapshot(snap: S): void {
    applying = true;
    try {
      replaceInPlace(target, snap);
    } finally {
      applying = false;
    }
    version++;
    const record: CommitRecord = {
      id: ++commitSeq,
      at: Date.now(),
      batchId,
      changes: [{ path: '/', op: 'set', prev: undefined, value: undefined }]
    };
    commitLog.push(record);
    if (commitLog.length > COMMIT_LOG_CAP) commitLog.shift();
    notify(record);
  }

  function batch(fn: (draft: S) => void): void {
    batchDepth++;
    batchId++;
    try {
      fn(root);
    } finally {
      if (--batchDepth === 0) commit();
    }
  }

  function setState(patch: Partial<S> | ((draft: S) => void)): void {
    batch((draft) => {
      if (typeof patch === 'function') {
        patch(draft);
      } else {
        for (const key of Object.keys(patch)) {
          (draft as Record<string, unknown>)[key] = (patch as Record<string, unknown>)[key];
        }
      }
    });
  }

  function select<T>(selector: (state: S) => T, listener: (value: T) => void, equalityFn?: EqualityFn<T>): () => void {
    const sub: SelectorSub<S, T> = {
      selector,
      listener,
      eq: equalityFn ?? (Object.is as EqualityFn<T>),
      last: selector(root)
    };
    selectorSubs.add(sub as SelectorSub<S, unknown>);
    return () => { selectorSubs.delete(sub as SelectorSub<S, unknown>); };
  }

  function jumpTo(index: number): S | null {
    if (index < 0 || index >= history.length || index === cursor) return null;
    cursor = index;
    applySnapshot(history[index].snapshot as S);
    return root;
  }

  const api: UtopiaState<S> = {
    name,
    get version() { return version; },
    get state() { return root; },
    setState,
    batch,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    select,
    getSnapshot: () => root,
    inspect: () => commitLog.slice(),
    timeTravel: {
      canUndo: () => cursor > 0,
      canRedo: () => cursor < history.length - 1,
      undo: () => jumpTo(cursor - 1),
      redo: () => jumpTo(cursor + 1),
      jumpTo,
      first: () => jumpTo(0),
      last: () => jumpTo(history.length - 1),
      entries: () => history.map((h, i) => ({ index: i, at: h.at, isCurrent: i === cursor })),
      size: () => history.length,
      exportAll: () => history.map((h) => ({ at: h.at, snapshot: h.snapshot }))
    }
  };

  if (typeof options.onChange === 'function') {
    listeners.add(options.onChange as StateListener<S>);
  }

  // DevTools 钩子：若页面注入了 Utopia DevTools 面板，自动注册
  const devtools = (globalThis as { __UTOPIA_DEVTOOLS__?: { register(info: unknown): void } }).__UTOPIA_DEVTOOLS__;
  devtools?.register?.({ name, api });

  return api;
}
