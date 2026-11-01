import { test, expect } from '../../../scripts/utest.js';
import { createState } from '../src/index.js';

test('createState: 直接修改 state 即触发订阅', () => {
  const store = createState({ count: 0, label: 'dsh' });
  let seen = 0;
  store.subscribe(() => seen++);
  store.state.count = 1;
  expect(seen).toBe(1);
  expect(store.state.count).toBe(1);
  expect(store.version).toBe(1);
});

test('createState: 初始状态被隔离，外部修改不穿透', () => {
  const initial = { list: [1, 2] };
  const store = createState(initial);
  initial.list.push(3);
  expect(store.state.list.length).toBe(2);
});

test('select: 仅在所选切片变化时回调', () => {
  const store = createState({ count: 0, text: 'a' });
  const hits: number[] = [];
  store.select(s => s.count, v => hits.push(v));
  store.state.text = 'b';   // 与 count 无关，不触发
  store.state.count = 1;
  store.state.count = 1;    // 相同值不触发
  store.state.count = 2;
  expect(hits).toEqual([1, 2]);
});

test('变更记录携带路径与旧值', () => {
  const store = createState({ user: { name: 'a', age: 1 } });
  const commits: string[] = [];
  store.subscribe((_s, c) => commits.push(...c.changes.map(ch => `${ch.op}:${ch.path}=${String(ch.value)}`)));
  store.state.user.name = 'b';
  expect(commits).toEqual(['set:/user/name=b']);
});

test('setState: 对象合并与函数 draft 两种姿势', () => {
  const store = createState({ a: 1, b: 2 });
  store.setState({ a: 10 });
  expect(store.state.a).toBe(10);
  store.setState(draft => { draft.b = draft.b + 5; });
  expect(store.state.b).toBe(7);
});

test('batch: 多次修改合并为一次提交', () => {
  const store = createState({ a: 1, b: 1 });
  let commits = 0;
  store.subscribe(() => commits++);
  store.batch(d => {
    d.a = 2;
    d.b = 2;
  });
  expect(store.state.a).toBe(2);
  expect(store.state.b).toBe(2);
  expect(commits).toBe(1);
  expect(store.inspect()[0].changes.length).toBe(2);
});

test('时间旅行: undo / redo / jumpTo', () => {
  const store = createState({ n: 0 });
  store.state.n = 1;
  store.state.n = 2;
  store.state.n = 3;
  expect(store.timeTravel.size()).toBe(4);
  expect(store.timeTravel.canUndo()).toBe(true);
  store.timeTravel.undo();
  expect(store.state.n).toBe(2);
  store.timeTravel.undo();
  expect(store.state.n).toBe(1);
  store.timeTravel.redo();
  expect(store.state.n).toBe(2);
  store.timeTravel.jumpTo(0);
  expect(store.state.n).toBe(0);
  store.timeTravel.last();
  expect(store.state.n).toBe(3);
  expect(store.timeTravel.entries().filter(e => e.isCurrent)[0].index).toBe(3);
});

test('时间旅行: 回放后写新值会截断未来分支', () => {
  const store = createState({ n: 0 });
  store.state.n = 1;
  store.timeTravel.undo();
  store.state.n = 99;
  expect(store.timeTravel.canRedo()).toBe(false);
  expect(store.state.n).toBe(99);
});

test('取 unsubscribe 后不再收到通知', () => {
  const store = createState({ n: 0 });
  let hits = 0;
  const off = store.subscribe(() => hits++);
  off();
  store.state.n = 1;
  expect(hits).toBe(0);
});

test('onChange 选项与异常订阅者隔离', () => {
  let ok = 0;
  const store = createState({ n: 0 }, {
    onChange: () => ok++,
  });
  store.subscribe(() => { throw new Error('boom'); });
  store.state.n = 1;
  expect(ok).toBe(1);
});
