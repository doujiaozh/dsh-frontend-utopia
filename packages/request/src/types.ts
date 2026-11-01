export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type ResponseType = 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData';

export type QueryValue = string | number | boolean | null | undefined | QueryValue[];

export type ProgressCallback = (loaded: number, total: number, percent: number) => void;

export interface RequestConfig {
  /** 完整地址；作为默认配置存在时可省略（由调用处的 url 提供具体值） */
  url?: string;
  method?: HttpMethod;
  baseURL?: string;
  headers?: Record<string, string>;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** 超时毫秒，0 表示不限制 */
  timeout?: number;
  /** 网络错误或 5xx 时的重试次数 */
  retries?: number;
  retryDelay?: number | ((attempt: number) => number);
  /** 取消标签，默认取 url；可用 http.cancel(tag) 成组取消 */
  cancelTag?: string;
  signal?: AbortSignal | null;
  responseType?: ResponseType;
  /** auto: 需要上传进度时自动降级 XHR */
  transport?: 'auto' | 'fetch' | 'xhr';
  /** SWR 新鲜期（毫秒），0 表示总是重新请求 */
  staleTime?: number;
  onDownloadProgress?: ProgressCallback;
  onUploadProgress?: ProgressCallback;
  credentials?: RequestCredentials;
  mode?: RequestMode;
  /** 注入自定义 fetch（测试 / 小程序 / Node 老环境） */
  fetch?: typeof fetch;
}

export interface FinalRequestConfig {
  url: string;
  method: HttpMethod;
  baseURL: string;
  headers: Record<string, string>;
  query: Record<string, QueryValue>;
  body: unknown;
  timeout: number;
  retries: number;
  retryDelay: number | ((attempt: number) => number);
  cancelTag: string;
  signal: AbortSignal | null;
  responseType: ResponseType;
  transport: 'auto' | 'fetch' | 'xhr';
  staleTime: number;
  onDownloadProgress?: ProgressCallback;
  onUploadProgress?: ProgressCallback;
  credentials?: RequestCredentials;
  mode?: RequestMode;
  fetch?: typeof fetch;
  /** @internal 由 request() 预创建并登记，使「发出请求后立即 cancel(tag)」也能生效 */
  controller?: AbortController;
}

export interface UtopiaResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  ok: boolean;
  config: FinalRequestConfig;
  raw?: Response | XMLHttpRequest;
}
