import { test, expect, sleep } from '../../../scripts/utest.js';
import { createHttp } from '../src/index.js';
import { UtopiaRequestError } from '../src/index.js';

interface Call {
  url: string;
  init?: RequestInit;
}

function makeFetch(payload: unknown, opts: { status?: number; headers?: Record<string, string>; delay?: number } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const body = opts.delay
      ? new Promise<Response>(resolve => setTimeout(() => resolve(new Response(JSON.stringify(payload), {
          status: opts.status ?? 200,
          headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) }
        })), opts.delay))
      : Promise.resolve(new Response(JSON.stringify(payload), {
          status: opts.status ?? 200,
          headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) }
        }));
    return body;
  };
  return { fetchImpl, calls };
}

test('baseURL 与 query 序列化: 数组/布尔正确拼到 URL 上', async () => {
  const { fetchImpl, calls } = makeFetch({ ok: 1 });
  const api = createHttp({ baseURL: 'https://api.dsh.dev/', fetch: fetchImpl as typeof fetch });
  const resp = await api.get('/v1/users', { query: { page: 1, active: true, ids: [1, 2], drop: null } as never });
  expect(calls[0].url).toBe('https://api.dsh.dev/v1/users?page=1&active=true&ids=1&ids=2');
  expect(resp.data).toEqual({ ok: 1 });
  expect(resp.ok).toBe(true);
});

test('POST: JSON body 自动带 Content-Type', async () => {
  const { fetchImpl, calls } = makeFetch({ ok: 1 });
  const api = createHttp({ fetch: fetchImpl as typeof fetch });
  await api.post('/login', { user: 'dsh', pwd: '***' });
  expect(calls[0].init?.method).toBe('POST');
  expect(calls[0].init?.body).toBe('{"user":"dsh","pwd":"***"}');
  expect(calls[0].init?.headers).toBeInstanceOf(Headers);
  expect((calls[0].init?.headers as Headers).get('content-type')).toContain('application/json');
});

test('拦截器: 请求级注入鉴权 + 响应级解包 data 字段', async () => {
  const { fetchImpl } = makeFetch({ code: 0, data: { name: 'utopia' } });
  const api = createHttp({ fetch: fetchImpl as typeof fetch });
  api.interceptors.request.use(cfg => {
    cfg.headers['x-token'] = 'tok-1';
    return cfg;
  });
  api.interceptors.response.use(resp => {
    resp.data = (resp.data as { data: unknown }).data;
    return resp;
  });
  const resp = await api.get('/me');
  expect(resp.data).toEqual({ name: 'utopia' });
});

test('拦截器可用 eject 移除', async () => {
  const { fetchImpl, calls } = makeFetch({});
  const api = createHttp({ fetch: fetchImpl as typeof fetch });
  const id = api.interceptors.request.use(cfg => { cfg.headers['x-mock'] = '1'; return cfg; });
  api.interceptors.request.eject(id);
  await api.get('/x');
  expect((calls[0].init?.headers as Headers).get('x-mock')).toBeNull();
});

test('cancel(tag): 成组请求被取消，错误带 isCancel', async () => {
  const { fetchImpl } = makeFetch({ ok: 1 }, { delay: 500 });
  const api = createHttp({ fetch: fetchImpl as typeof fetch });
  const p1 = api.get('/slow', { cancelTag: 'group-a' });
  const p2 = api.get('/slow2', { cancelTag: 'group-a' });
  api.cancel('group-a');
  const errors = await Promise.all([p1.catch(e => e), p2.catch(e => e)]);
  expect(errors[0]).toBeInstanceOf(UtopiaRequestError);
  expect((errors[0] as UtopiaRequestError).isCancel).toBe(true);
  expect((errors[1] as UtopiaRequestError).isCancel).toBe(true);
});

test('timeout: 超时抛 isTimeout 错误', async () => {
  const { fetchImpl } = makeFetch({ ok: 1 }, { delay: 400 });
  const api = createHttp({ fetch: fetchImpl as typeof fetch });
  try {
    await api.get('/slow', { timeout: 40 });
    throw new Error('should not reach');
  } catch (e) {
    expect(e).toBeInstanceOf(UtopiaRequestError);
    expect((e as UtopiaRequestError).isTimeout).toBe(true);
  }
});

test('retries: 5xx 首失败次重试成功，共发 3 次请求', async () => {
  let count = 0;
  const fetchImpl = (): Promise<Response> => {
    count++;
    return Promise.resolve(new Response('oops', { status: count < 3 ? 500 : 200, headers: { 'content-type': 'application/json' } }));
  };
  const api = createHttp({ fetch: fetchImpl as typeof fetch });
  const resp = await api.get('/flaky', { retries: 2, retryDelay: 0 });
  expect(count).toBe(3);
  expect(resp.status).toBe(200);
});

test('retries: 网络类错误会被重试，最终归一为 ERR_NETWORK', async () => {
  let count = 0;
  // 每次都抛网络错误：重试耗尽后应得到 ERR_NETWORK，且请求次数 = retries + 1
  const failingFetch = (): Promise<Response> => {
    count++;
    return Promise.reject(new TypeError('mid'));
  };
  const api = createHttp({ fetch: failingFetch as typeof fetch });
  const p = api.get('/x', { retries: 2, retryDelay: 0 });
  const err = await p.catch(e => e) as UtopiaRequestError;
  expect(err.code).toBe('ERR_NETWORK');
  expect(count).toBe(3);
});

test('下载进度: content-length 已知时回调被触发', async () => {
  const calls: number[][] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('hello utopia'));
      controller.close();
    }
  });
  const fetchImpl = (): Promise<Response> => Promise.resolve(
    new Response(stream, { headers: { 'content-type': 'application/json', 'content-length': '12' } })
  );
  const api = createHttp({ fetch: fetchImpl as typeof fetch });
  const resp = await api.get('/file', {
    onDownloadProgress: (loaded, total, percent) => calls.push([loaded, total, Math.round(percent)])
  });
  expect(resp.data).toEqual('hello utopia');  // 非 JSON 文本透传
  expect(calls).toEqual([[12, 12, 100]]);
});

test('responseType text 与错误状态码', async () => {
  const { fetchImpl } = makeFetch('raw text', { status: 404 });
  const api = createHttp({ fetch: fetchImpl as typeof fetch, responseType: 'text' });
  const resp = await api.get('/missing');
  expect(resp.status).toBe(404);
  expect(resp.ok).toBe(false);
  expect(resp.data).toBe('"raw text"');
});

test('create: 派生实例继承默认配置与拦截器', async () => {
  const { fetchImpl, calls } = makeFetch({ ok: 1 });
  const api = createHttp({ baseURL: 'https://a.dsh.dev', fetch: fetchImpl as typeof fetch });
  const child = api.create({ baseURL: 'https://b.dsh.dev' });
  await child.get('/x');
  expect(calls[0].url).toBe('https://b.dsh.dev/x');
});
