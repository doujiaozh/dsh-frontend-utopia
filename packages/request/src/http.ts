import { SWRCache } from './cache.js';
import { UtopiaRequestError } from './error.js';
import { InterceptorManager } from './interceptor.js';
import type {
  FinalRequestConfig,
  HttpMethod,
  RequestConfig,
  UtopiaResponse
} from './types.js';
import { fetchRequest, makeAbortReason, statusError } from './fetch-transport.js';
import { xhrRequest } from './xhr-transport.js';
import { buildUrl, joinUrl, mergeConfig, serializeQuery } from './url.js';

export type SwrKey = string | [url: string, config?: RequestConfig];

export interface SwrOptions {
  /** 新鲜期（毫秒），默认取 config.staleTime */
  staleTime?: number;
  /** 后台重验证返回后触发 */
  onSuccess?: (data: unknown) => void;
  onError?: (error: unknown) => void;
}

export interface SwrState<T> {
  data?: T;
  error?: unknown;
  loading: boolean;
}

export interface SwrHandle<T> extends PromiseLike<T | undefined> {
  readonly state: SwrState<T>;
  subscribe(cb: (state: SwrState<T>) => void): () => void;
  revalidate(force?: boolean): Promise<T | undefined>;
  mutate(updater?: ((current?: T) => T) | T, opts?: { revalidate?: boolean; optimistic?: boolean }): Promise<T | undefined>;
  invalidate(): void;
}

export interface Http {
  readonly defaults: RequestConfig;
  readonly interceptors: {
    request: InterceptorManager<FinalRequestConfig>;
    response: InterceptorManager<UtopiaResponse>;
  };
  readonly cache: SWRCache;
  request<T = unknown>(config: RequestConfig): Promise<UtopiaResponse<T>>;
  get<T = unknown>(url: string, config?: Omit<RequestConfig, 'url' | 'method'>): Promise<UtopiaResponse<T>>;
  post<T = unknown>(url: string, body?: unknown, config?: Omit<RequestConfig, 'url' | 'method' | 'body'>): Promise<UtopiaResponse<T>>;
  put<T = unknown>(url: string, body?: unknown, config?: Omit<RequestConfig, 'url' | 'method' | 'body'>): Promise<UtopiaResponse<T>>;
  patch<T = unknown>(url: string, body?: unknown, config?: Omit<RequestConfig, 'url' | 'method' | 'body'>): Promise<UtopiaResponse<T>>;
  del<T = unknown>(url: string, config?: Omit<RequestConfig, 'url' | 'method'>): Promise<UtopiaResponse<T>>;
  head<T = unknown>(url: string, config?: Omit<RequestConfig, 'url' | 'method'>): Promise<UtopiaResponse<T>>;
  swr<T = unknown>(key: SwrKey, config?: RequestConfig, options?: SwrOptions): SwrHandle<T>;
  cancel(tag?: string): void;
  cancelAll(): void;
  create(extraDefaults?: RequestConfig): Http;
}

const identity = <T>(value: T): T => value;

function normalizeKey(key: SwrKey): [string, RequestConfig | undefined] {
  return Array.isArray(key) ? [key[0], key[1]] : [key, undefined];
}

function abortController(controller: AbortController, reason: string): void {
  const ac = controller as unknown as { abort(reason?: unknown): void };
  ac.abort(makeAbortReason('AbortError', reason));
}

/** 把调用方传入的 signal 转发到内部控制器（支持外部取消） */
function linkExternalSignal(signal: AbortSignal | null, controller: AbortController): void {
  if (!signal) return;
  const forward = (): void => {
    const reason = (signal as unknown as { reason?: unknown }).reason;
    (controller as unknown as { abort(reason?: unknown): void }).abort(reason);
  };
  if (signal.aborted) forward();
  else signal.addEventListener('abort', forward, { once: true });
}

export function createHttp(defaults: RequestConfig = {}): Http {
  const requestInterceptors = new InterceptorManager<FinalRequestConfig>();
  const responseInterceptors = new InterceptorManager<UtopiaResponse>();
  const cache = new SWRCache();
  const controllers = new Map<string, Set<AbortController>>();

  function registerController(cfg: FinalRequestConfig, controller: AbortController): void {
    if (!cfg.cancelTag) return;
    let set = controllers.get(cfg.cancelTag);
    if (!set) {
      set = new Set();
      controllers.set(cfg.cancelTag, set);
    }
    set.add(controller);
  }

  function unregisterController(cfg: FinalRequestConfig, controller: AbortController): void {
    const set = controllers.get(cfg.cancelTag);
    if (set) {
      set.delete(controller);
      if (set.size === 0) controllers.delete(cfg.cancelTag);
    }
  }

  /** 为请求叠加超时：超时时以 TimeoutError 原因 abort，错误形态与原生 AbortSignal.timeout 一致 */
  function composeTimeout(cfg: FinalRequestConfig, controller: AbortController): () => void {
    if (cfg.timeout <= 0) return () => {};
    const timer = setTimeout(() => {
      const ac = controller as unknown as { abort(reason?: unknown): void };
      ac.abort(makeAbortReason('TimeoutError', `请求超时(${cfg.timeout}ms): ${cfg.url}`));
    }, cfg.timeout);
    return () => clearTimeout(timer);
  }

  function wrapError(error: unknown, cfg: FinalRequestConfig): UtopiaRequestError {
    if (error instanceof UtopiaRequestError) return error;
    const name = (error as { name?: string })?.name ?? '';
    if (name === 'TimeoutError') {
      return new UtopiaRequestError({
        code: 'ECONNABORTED',
        message: `请求超时: ${cfg.url}`,
        config: cfg,
        isTimeout: true
      });
    }
    if (name === 'AbortError') {
      return new UtopiaRequestError({
        code: 'ERR_CANCELED',
        message: `请求被取消: ${cfg.url}`,
        config: cfg,
        isCancel: true
      });
    }
    return new UtopiaRequestError({
      code: 'ERR_NETWORK',
      message: (error as Error)?.message ?? String(error),
      config: cfg
    });
  }

  async function dispatchRequest(cfg: FinalRequestConfig): Promise<UtopiaResponse> {
    const tries = cfg.retries + 1;
    // 控制器已在 request() 中创建并登记（保证“发出后立刻 cancel(tag)”有效），这里只做兜底
    const controller = cfg.controller ?? new AbortController();
    let lastError: unknown;
    for (let attempt = 0; attempt < tries; attempt++) {
      const cleanup = composeTimeout(cfg, controller);
      const fullUrl = joinUrl(cfg.baseURL, buildUrl(cfg));
      try {
        // 需要上传进度时自动降级 XHR
        const useXhr = cfg.transport === 'xhr'
          || (cfg.transport === 'auto' && !!cfg.onUploadProgress && typeof XMLHttpRequest !== 'undefined');
        const resp = useXhr
          ? await xhrRequest(cfg, controller, fullUrl)
          : await fetchRequest(cfg, controller, fullUrl);
        // 5xx 视为服务端故障：始终抛错（供 retry 消费）；4xx 属于业务响应，交给调用方判断
        if (resp.status >= 500) throw statusError(resp);
        return resp;
      } catch (raw) {
        const error = raw instanceof UtopiaRequestError ? raw : wrapError(raw, cfg);
        if (error.isCancel || error.isTimeout) throw error;
        lastError = error;
        if (attempt === tries - 1) break;
        const delay = typeof cfg.retryDelay === 'function' ? cfg.retryDelay(attempt) : cfg.retryDelay;
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      } finally {
        cleanup();
      }
    }
    throw lastError;
  }

  function request<T = unknown>(userConfig: RequestConfig): Promise<UtopiaResponse<T>> {
    const finalConfig = mergeConfig(defaults, userConfig);
    // 提前创建并登记取消控制器：Promise 链是异步的，若等到 dispatchRequest 才登记，
    // “发出请求后立刻 cancel(tag)” 会因为控制器还没注册而丢取消。
    const controller = new AbortController();
    finalConfig.controller = controller;
    registerController(finalConfig, controller);
    linkExternalSignal(finalConfig.signal, controller);
    type Pair = [(value: any) => any, ((error: any) => any) | undefined]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const chain: Pair[] = [];
    requestInterceptors.forEach((handler) => {
      chain.unshift([handler.fulfilled ?? identity, handler.rejected]);
    });
    chain.push([dispatchRequest, undefined]);
    responseInterceptors.forEach((handler) => {
      chain.push([handler.fulfilled ?? identity, handler.rejected]);
    });

    let promise: Promise<unknown> = Promise.resolve(finalConfig);
    for (const [onFulfilled, onRejected] of chain) {
      promise = onRejected
        ? promise.then(
          onFulfilled as (value: unknown) => unknown,
          onRejected as (reason: unknown) => unknown
        )
        : promise.then(onFulfilled as (value: unknown) => unknown);
    }
    return promise.then(
      (value) => {
        unregisterController(finalConfig, controller);
        return value;
      },
      (error) => {
        unregisterController(finalConfig, controller);
        throw error;
      }
    ) as Promise<UtopiaResponse<T>>;
  }

  function shorthand(method: HttpMethod): <T = unknown>(url: string, rest?: Omit<RequestConfig, 'url' | 'method'>) => Promise<UtopiaResponse<T>> {
    return <T = unknown>(url: string, rest: Omit<RequestConfig, 'url' | 'method'> = {}): Promise<UtopiaResponse<T>> =>
      request<T>({ ...rest, url, method });
  }

  function swr<T = unknown>(key: SwrKey, config: RequestConfig = {}, options: SwrOptions = {}): SwrHandle<T> {
    const [url, inlineConfig] = normalizeKey(key);
    const mergedConfig = { ...(inlineConfig ?? {}), ...config, url, method: config.method ?? inlineConfig?.method ?? 'GET' };
    const staleTime = options.staleTime ?? config.staleTime ?? inlineConfig?.staleTime ?? 0;
    const qs = serializeQuery(mergedConfig.query ?? {});
    const cacheKey = qs ? `${url}?${qs}` : url;

    const state: SwrState<T> = { data: undefined, error: undefined, loading: true };
    const listeners = new Set<(state: SwrState<T>) => void>();
    const notify = (): void => { listeners.forEach(cb => cb(state)); };

    const fetcher = (): Promise<T> => {
      const cfg = mergeConfig(defaults, { ...mergedConfig, cancelTag: cacheKey });
      return cache.startFetch<T>(cacheKey, () => request<T>(cfg).then(r => r.data), staleTime);
    };

    const existing = cache.get<T>(cacheKey);
    const fresh = existing && existing.data !== undefined && !existing.error && Date.now() - existing.at < staleTime;
    if (existing) {
      state.data = existing.data;
      state.error = existing.error;
    }
    state.loading = !fresh;

    let settled: Promise<T | undefined>;
    if (fresh) {
      settled = Promise.resolve(state.data);
    } else {
      settled = fetcher().then(
        (data) => {
          state.data = data;
          state.error = undefined;
          state.loading = false;
          notify();
          options.onSuccess?.(data);
          return data;
        },
        (error) => {
          state.error = error;
          state.loading = false;
          notify();
          options.onError?.(error);
          throw error;
        }
      ).then(
        (data) => data,
        () => undefined as T | undefined
      );
    }

    let cleanupCache: () => void = () => {};
    let cleanupFocus: () => void = () => {};
    cleanupCache = cache.subscribe(cacheKey, (entry) => {
      if (entry.data !== state.data || entry.error !== state.error) {
        state.data = entry.data as T | undefined;
        state.error = entry.error;
        if (!entry.promise) state.loading = false;
        notify();
      }
    });
    if (options && 'revalidateOnFocus' in options) {
      // 显式打开才监听；默认不绑定 document 事件
      if (typeof document !== 'undefined') {
        const handler = (): void => { if (!document.hidden) void revalidate(); };
        document.addEventListener('visibilitychange', handler);
        cleanupFocus = () => document.removeEventListener('visibilitychange', handler);
      }
    }

    async function revalidate(force = false): Promise<T | undefined> {
      if (!force && !cache.isStale(cacheKey)) return state.data;
      state.loading = true;
      notify();
      try {
        const data = await fetcher();
        state.data = data;
        state.error = undefined;
        return data;
      } catch (error) {
        state.error = error;
        throw error;
      } finally {
        state.loading = false;
        notify();
      }
    }

    async function mutate(
      updater?: ((current?: T) => T) | T,
      opts: { revalidate?: boolean; optimistic?: boolean } = {}
    ): Promise<T | undefined> {
      const optimistic = opts.optimistic !== false;
      const doRevalidate = opts.revalidate !== false;
      const next = updater === undefined
        ? undefined
        : typeof updater === 'function' ? (updater as (current?: T) => T)(state.data) : updater;
      if (optimistic && next !== undefined) {
        state.data = next;
        state.loading = true;
        notify();
        cache.set(cacheKey, next, staleTime, true);
      }
      if (doRevalidate) {
        try { await revalidate(true); } catch { /* 错误已写入 state.error */ }
      }
      return state.data;
    }

    const handle: SwrHandle<T> = {
      get state() { return state; },
      subscribe(cb) {
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
          if (listeners.size === 0) {
            cleanupCache();
            cleanupFocus();
          }
        };
      },
      revalidate,
      mutate,
      invalidate: () => cache.invalidate(cacheKey),
      // await handle 直接拿到 data（失败时 undefined，细节进 state.error）
      then(onfulfilled, onrejected) { return settled.then(onfulfilled, onrejected); }
    };
    return handle;
  }

  const api: Http = {
    defaults,
    interceptors: { request: requestInterceptors, response: responseInterceptors },
    cache,
    request,
    get: shorthand('GET'),
    post: <T = unknown>(url: string, body?: unknown, rest: Omit<RequestConfig, 'url' | 'method' | 'body'> = {}) =>
      request<T>({ ...rest, url, method: 'POST', body }),
    put: <T = unknown>(url: string, body?: unknown, rest: Omit<RequestConfig, 'url' | 'method' | 'body'> = {}) =>
      request<T>({ ...rest, url, method: 'PUT', body }),
    patch: <T = unknown>(url: string, body?: unknown, rest: Omit<RequestConfig, 'url' | 'method' | 'body'> = {}) =>
      request<T>({ ...rest, url, method: 'PATCH', body }),
    del: shorthand('DELETE'),
    head: shorthand('HEAD'),
    swr,
    cancel(tag) {
      if (tag === undefined) {
        controllers.forEach(set => set.forEach(controller => abortController(controller, '取消全部请求')));
        controllers.clear();
        return;
      }
      const set = controllers.get(tag);
      if (set) {
        set.forEach(controller => abortController(controller, `取消 ${tag}`));
        controllers.delete(tag);
      }
    },
    cancelAll() { api.cancel(); },
    create(extraDefaults = {}) {
      return createHttp({ ...defaults, ...extraDefaults });
    }
  };

  return api;
}

/** 开箱即用的默认实例 */
export const http = createHttp();
