import { UtopiaRequestError } from './error.js';
import type { FinalRequestConfig, ProgressCallback, ResponseType, UtopiaResponse } from './types.js';
import { streamToArrayBufferWithProgress } from './progress.js';
import { buildUrl, hasHeader, serializeBody } from './url.js';

/**
 * 统一 abort 原因：用 DOMException 让 fetch 抛出可辨识的名称，
 * 从而区分“用户取消 (AbortError)”与“超时 (TimeoutError)”。
 */
export function makeAbortReason(name: 'AbortError' | 'TimeoutError', message: string): unknown {
  if (typeof DOMException === 'function') return new DOMException(message, name);
  const err = new Error(message);
  err.name = name;
  return err;
}

function parseBytes<T>(buffer: ArrayBuffer, contentType: string, responseType: ResponseType): T {
  switch (responseType) {
    case 'arrayBuffer':
      return buffer as unknown as T;
    case 'blob':
      return new Blob([buffer], { type: contentType }) as unknown as T;
    case 'text': {
      const text = new TextDecoder().decode(buffer);
      return text as unknown as T;
    }
    default: {
      const text = new TextDecoder().decode(buffer);
      const looksJson = contentType.includes('application/json') || /^\s*[[{]/.test(text);
      if (looksJson) {
        try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
      }
      return text as unknown as T;
    }
  }
}

async function parseResponse<T>(resp: Response, cfg: FinalRequestConfig): Promise<T> {
  if (cfg.onDownloadProgress && resp.body && typeof resp.body.getReader === 'function') {
    const total = Number(resp.headers.get('content-length')) || 0;
    const buffer = await streamToArrayBufferWithProgress(resp.body, total, cfg.onDownloadProgress);
    return parseBytes<T>(buffer, resp.headers.get('content-type') || '', cfg.responseType);
  }
  switch (cfg.responseType) {
    case 'text': return (await resp.text()) as unknown as T;
    case 'blob': return (await resp.blob()) as unknown as T;
    case 'arrayBuffer': return (await resp.arrayBuffer()) as unknown as T;
    case 'formData': return (await resp.formData()) as unknown as T;
    default: return (await parseJsonSafe(resp)) as unknown as T;
  }
}

async function parseJsonSafe(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return text; }
}

/**
 * 原生 Fetch 传输层（下载进度经 body reader 实现）。
 */
export function fetchRequest<T>(
  cfg: FinalRequestConfig,
  controller: AbortController,
  fullUrl: string
): Promise<UtopiaResponse<T>> {
  const fetchImpl = cfg.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!fetchImpl) {
    return Promise.reject(new UtopiaRequestError({
      code: 'NO_FETCH',
      message: `当前环境无 fetch（${fullUrl}）：注入 cfg.fetch，或改用 transport: 'xhr'`,
      config: cfg
    }));
  }

  const headers = new Headers(cfg.headers);
  const body = serializeBody(cfg);
  if (body && typeof body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json;charset=utf-8');
  }

  const signal = controller.signal;

  // 请求发出前就已取消（如 cancel(tag) 早于 dispatch）：直接失败，不再真正发请求
  if (signal.aborted) {
    const reason = (signal as unknown as { reason?: unknown }).reason;
    return Promise.reject(reason !== undefined ? reason : makeAbortReason('AbortError', `请求被取消: ${fullUrl}`));
  }

  // 与 abort 信号赛跑：浏览器原生 fetch 会响应 signal，但注入的/降级的 fetch 实现
  // 未必监听 signal（测试替身、老运行时），这里统一兜底，取消与超时语义始终成立。
  const exec = fetchImpl(fullUrl, {
    method: cfg.method,
    headers,
    body: (body as BodyInit | null) ?? undefined,
    signal,
    credentials: cfg.credentials,
    mode: cfg.mode
  }).then(async (resp) => {
    const data = await parseResponse<T>(resp, cfg);
    return {
      data,
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
      ok: resp.ok,
      config: cfg,
      raw: resp
    } as UtopiaResponse<T>;
  });

  return new Promise<UtopiaResponse<T>>((resolve, reject) => {
    let done = false;
    const abortReason = (): unknown => {
      const reason = (signal as unknown as { reason?: unknown }).reason;
      return reason !== undefined ? reason : makeAbortReason('AbortError', `请求被取消: ${fullUrl}`);
    };
    const finish = (fn: (value: never) => void, value: unknown): void => {
      if (done) return;
      done = true;
      signal.removeEventListener('abort', onAbort);
      fn(value as never);
    };
    const onAbort = (): void => finish(reject, abortReason());
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort);
    exec.then(
      (resp) => finish(resolve, resp),
      (error) => finish(reject, error)
    );
  });
}

/** 状态码错误：5xx 才能被 retry 消费 */
export function statusError(resp: UtopiaResponse): UtopiaRequestError {
  return new UtopiaRequestError({
    code: `HTTP_${resp.status}`,
    message: `请求失败：${resp.config.method} ${resp.config.url} -> ${resp.status} ${resp.statusText}`,
    config: resp.config,
    response: resp
  });
}

export { buildUrl, hasHeader, serializeBody };
export type { ProgressCallback };
