import { test, expect, sleep } from '../../../scripts/utest.js';
import { createHttp } from '../src/index.js';

function makeFetch(payload: unknown) {
  let count = 0;
  const calls: string[] = [];
  const fetchImpl = (url: string): Promise<Response> => {
    count++;
    calls.push(url);
    return Promise.resolve(new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }));
  };
  return { fetchImpl: fetchImpl as typeof fetch, count: () => count, calls };
}

test('SWR: 新鲜期内共享缓存，只发一次请求', async () => {
  const f = makeFetch({ n: 1 });
  const api = createHttp({ fetch: f.fetchImpl });
  const h1 = api.swr('/counter', undefined, { staleTime: 5000 });
  const h2 = api.swr('/counter', undefined, { staleTime: 5000 });
  const h3 = api.swr('/counter', undefined, { staleTime: 5000 });
  expect(await h1).toEqual({ n: 1 });
  expect(await h2).toEqual({ n: 1 });
  expect(await h3).toEqual({ n: 1 });
  expect(f.count()).toBe(1);
});

test('SWR: 过期后立即返回 stale 并后台重验证', async () => {
  const f = makeFetch({ n: 1 });
  const api = createHttp({ fetch: f.fetchImpl });
  const first = api.swr('/c2', undefined, { staleTime: 60 });
  await first;
  await sleep(120);
  // 此时缓存已过期：再次 swr 会立刻给到旧数据、同时再发一次请求
  const again = api.swr('/c2', undefined, { staleTime: 60 });
  const states: unknown[] = [];
  const off = again.subscribe(s => states.push({ data: s.data, loading: s.loading }));
  const data = await again;
  expect(data).toEqual({ n: 1 });
  await sleep(10);
  expect(f.count()).toBe(2);
  off();
});

test('SWR: mutate 乐观更新先落本地，再后台重验证', async () => {
  const f = makeFetch({ n: 1 });
  const api = createHttp({ fetch: f.fetchImpl });
  const h = api.swr('/c3', undefined, { staleTime: 1000 });
  await h;
  await h.mutate({ n: 99 }, { revalidate: true, optimistic: true });
  expect(h.state.data).toEqual({ n: 1 });   // 网络返回值覆盖乐观值
  expect(f.count()).toBeGreaterThanOrEqual(2);
});

test('SWR: key 带 query 时按完整 key 缓存', async () => {
  const f = makeFetch({ items: [] });
  const api = createHttp({ fetch: f.fetchImpl });
  await api.swr(['/items', { url: '/items', query: { page: 1 } as never }], undefined, { staleTime: 1000 });
  await api.swr(['/items', { url: '/items', query: { page: 2 } as never }], undefined, { staleTime: 1000 });
  expect(f.calls).toContain('/items?page=1');
  expect(f.calls).toContain('/items?page=2');
  expect(f.count()).toBe(2);
});

test('SWR: invalidate 后下次访问重新请求', async () => {
  const f = makeFetch({ n: 1 });
  const api = createHttp({ fetch: f.fetchImpl });
  const h = api.swr('/c4', undefined, { staleTime: 1000 });
  await h;
  expect(f.count()).toBe(1);
  api.cache.invalidate('/c4');
  await api.swr('/c4', undefined, { staleTime: 1000 });
  expect(f.count()).toBe(2);
});

test('SWR: 并发去重（in-flight dedupe）', async () => {
  const f = makeFetch({ n: 1 });
  const api = createHttp({ fetch: f.fetchImpl });
  const h1 = api.swr('/c5', undefined, { staleTime: 0 });
  const h2 = api.swr('/c5', undefined, { staleTime: 0 });
  await Promise.all([h1, h2]);
  expect(f.count()).toBe(1);
});

test('SWR: 失败时 state.error 有值，await 得到 undefined', async () => {
  const fetchImpl = (): Promise<Response> => Promise.resolve(new Response('nope', { status: 500 }));
  const api = createHttp({ fetch: fetchImpl as typeof fetch });
  const h = api.swr('/c6', undefined, { staleTime: 0 });
  const data = await h;
  expect(data).toBeUndefined();
  expect(h.state.error).toBeDefined();
});
