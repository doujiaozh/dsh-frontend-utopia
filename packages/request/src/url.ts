import type { FinalRequestConfig, HttpMethod, QueryValue, RequestConfig } from './types.js';

export function joinUrl(base: string, url: string): string {
  if (!base) return url;
  if (!url) return base;
  return `${base.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

export function serializeQuery(query: Record<string, QueryValue>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) sp.append(key, String(item));
      }
    } else {
      sp.append(key, String(value));
    }
  }
  return sp.toString();
}

export function buildUrl(cfg: FinalRequestConfig): string {
  const qs = serializeQuery(cfg.query);
  if (!qs) return cfg.url;
  return cfg.url.includes('?') ? `${cfg.url}&${qs}` : `${cfg.url}?${qs}`;
}

export function hasHeader(cfg: FinalRequestConfig, name: string): boolean {
  return Object.keys(cfg.headers).some(k => k.toLowerCase() === name.toLowerCase());
}

export function serializeBody(cfg: FinalRequestConfig): BodyInit | undefined {
  const body = cfg.body;
  if (body === undefined || body === null) return undefined;
  if (
    typeof body === 'string' ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  ) {
    return body as BodyInit;
  }
  return JSON.stringify(body);
}

export function mergeConfig(defaults: RequestConfig, user: RequestConfig): FinalRequestConfig {
  const merged: RequestConfig = {
    ...defaults,
    ...user,
    headers: { ...(defaults.headers ?? {}), ...(user.headers ?? {}) },
    query: { ...(defaults.query ?? {}), ...(user.query ?? {}) }
  };
  return {
    url: merged.url ?? '',
    method: (merged.method ?? 'GET').toUpperCase() as HttpMethod,
    baseURL: merged.baseURL ?? '',
    headers: merged.headers ?? {},
    query: merged.query ?? {},
    body: merged.body,
    timeout: merged.timeout ?? 0,
    retries: Math.max(0, merged.retries ?? 0),
    retryDelay: merged.retryDelay ?? 300,
    cancelTag: merged.cancelTag ?? merged.url ?? '',
    signal: merged.signal ?? null,
    responseType: merged.responseType ?? 'json',
    transport: merged.transport ?? 'auto',
    staleTime: merged.staleTime ?? 0,
    onDownloadProgress: merged.onDownloadProgress,
    onUploadProgress: merged.onUploadProgress,
    credentials: merged.credentials,
    mode: merged.mode,
    fetch: merged.fetch
  };
}
