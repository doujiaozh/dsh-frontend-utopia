import { UtopiaRequestError } from './error.js';
import type { FinalRequestConfig, UtopiaResponse } from './types.js';
import { computePercent } from './progress.js';
import { hasHeader, serializeBody } from './url.js';

/**
 * XHR 传输层：唯一目标是补齐 fetch 缺失的**上传进度**（auto 模式按需启用）。
 */
export function xhrRequest<T>(
  cfg: FinalRequestConfig,
  controller: AbortController,
  fullUrl: string
): Promise<UtopiaResponse<T>> {
  return new Promise<UtopiaResponse<T>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(cfg.method, fullUrl, true);

    for (const [key, value] of Object.entries(cfg.headers)) {
      xhr.setRequestHeader(key, value);
    }
    if (cfg.credentials === 'include' || cfg.credentials === 'same-origin') {
      xhr.withCredentials = true;
    }
    if (cfg.timeout > 0) xhr.timeout = cfg.timeout;

    const responseType = cfg.responseType;
    if (responseType === 'blob') xhr.responseType = 'blob';
    else if (responseType === 'arrayBuffer') xhr.responseType = 'arraybuffer';
    else if (responseType === 'json') xhr.responseType = 'json';
    else xhr.responseType = 'text';

    const fail = (code: string, message: string, isTimeout = false, isCancel = false): void => {
      reject(new UtopiaRequestError({ code, message, config: cfg, isTimeout, isCancel }));
    };

    xhr.upload.onprogress = (event) => {
      cfg.onUploadProgress?.(event.loaded, event.total, computePercent(event.loaded, event.total));
    };
    xhr.onprogress = (event) => {
      cfg.onDownloadProgress?.(event.loaded, event.total, computePercent(event.loaded, event.total));
    };
    xhr.onload = () => {
      const headers = new Headers();
      const rawHeaders = xhr.getAllResponseHeaders().trim();
      for (const line of rawHeaders.split(/\r?\n/)) {
        const index = line.indexOf(':');
        if (index > 0) headers.append(line.slice(0, index).trim(), line.slice(index + 1).trim());
      }
      const data = (xhr.responseType === 'text' || xhr.responseType === '') ? xhr.responseText : xhr.response;
      resolve({
        data: data as T,
        status: xhr.status,
        statusText: xhr.statusText,
        headers,
        ok: xhr.status >= 200 && xhr.status < 300,
        config: cfg,
        raw: xhr
      });
    };
    xhr.onerror = () => fail('ERR_NETWORK', `网络错误: ${fullUrl}`);
    xhr.ontimeout = () => fail('ECONNABORTED', `请求超时(${cfg.timeout}ms): ${fullUrl}`, true);
    xhr.onabort = () => fail('ERR_CANCELED', `请求被取消: ${fullUrl}`, false, true);

    controller.signal.addEventListener('abort', () => xhr.abort());

    const body = serializeBody(cfg);
    if (body && typeof body === 'string' && !hasHeader(cfg, 'content-type')) {
      xhr.setRequestHeader('Content-Type', 'application/json;charset=utf-8');
    }
    xhr.send((body ?? null) as unknown as Document | XMLHttpRequestBodyInit | null);
  });
}
