import { test, expect, sleep } from '../../../scripts/utest.js';
import { debounce } from '../src/debounce.js';
import { throttle } from '../src/throttle.js';

test('debounce: 尾随执行，只触发一次', async () => {
  let calls = 0;
  const d = debounce(() => calls++, 40);
  d(); d(); d();
  await sleep(80);
  expect(calls).toBe(1);
});

test('debounce: cancel 后不再执行', async () => {
  let calls = 0;
  const d = debounce(() => calls++, 40);
  d();
  d.cancel();
  await sleep(80);
  expect(calls).toBe(0);
});

test('debounce: flush 立即触发挂起的调用', async () => {
  const seq: number[] = [];
  const d = debounce((n: number) => seq.push(n), 60);
  d(1);
  d(2);
  d.flush();
  expect(seq).toEqual([2]);
  await sleep(100);
  expect(seq).toEqual([2]);
});

test('debounce: leading 模式首次立即执行', async () => {
  const seq: number[] = [];
  const d = debounce((n: number) => seq.push(n), 40, { leading: true, trailing: false });
  d(1);
  expect(seq).toEqual([1]);
  await sleep(80);
  expect(seq).toEqual([1]);
});

test('throttle: 窗口内最多执行一次（leading）', async () => {
  const seq: number[] = [];
  const t = throttle((n: number) => seq.push(n), 50);
  t(1); t(2); t(3);
  await sleep(90);
  expect(seq).toEqual([1, 3]);
});

test('throttle: leading=false 时首次不立即执行', async () => {
  const seq: number[] = [];
  const t = throttle((n: number) => seq.push(n), 40, { leading: false });
  t(1);
  expect(seq).toEqual([]);
  await sleep(90);
  expect(seq).toEqual([1]);
});

test('throttle: cancel 清除挂起调用', async () => {
  let calls = 0;
  const t = throttle(() => calls++, 40, { leading: false });
  t();
  t.cancel();
  await sleep(90);
  expect(calls).toBe(0);
});
