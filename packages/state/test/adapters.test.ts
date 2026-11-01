import { test, expect } from '../../../scripts/utest.js';
import { createState } from '../src/index.js';
import { bindReact } from '../src/adapters/react.js';
import { bindVue } from '../src/adapters/vue.js';

test('React 18 路径: useSyncExternalStore 订阅 version，count 变化被重渲染', () => {
  const store = createState({ count: 0 });
  const renders: number[] = [];
  const subscribers = new Set<() => void>();

  const FakeReact = {
    useSyncExternalStore: <S>(subscribe: (cb: () => void) => () => void, getSnapshot: () => S): S => {
      const off = subscribe(() => subscribers.forEach(cb => cb()));
      void off;
      renders.push(getSnapshot() as number);
      return getSnapshot();
    },
    useCallback: <T extends (...args: never[]) => unknown>(fn: T): T => fn
  };

  const useStore = bindReact(FakeReact);
  const view = () => useStore(store, s => s.count);
  expect(view()).toBe(0);
  // 模拟一次提交后的重渲染
  store.state.count = 7;
  subscribers.forEach(cb => cb());
  expect(view()).toBe(7);
  // getSnapshot 返回的是 version（提交序号）：初始 0，一次提交后为 1，说明订阅触发了重渲染
  expect(renders.length).toBe(2);
  expect(renders[1]).toBe(1);
});

test('Vue 绑定: observable 包装与 computed map', () => {
  const store = createState({ user: { name: 'dsh' }, count: 1 });
  const observed: unknown[] = [];
  const FakeVue = {
    version: '3.4.0',
    reactive: <T>(t: T): T => { observed.push(t); return t; },
    computed: <T>(getter: () => T): { value: T } => ({ get value() { return getter(); } })
  };
  const useStore = bindVue(FakeVue);
  const state = useStore(store);
  expect(state).toBe(store.state);
  const mapped = bindVue(FakeVue).map(store, {
    name: s => s.user.name,
    double: s => s.count * 2
  });
  expect(mapped.name.value).toBe('dsh');
  expect(mapped.double.value).toBe(2);
  store.state.count = 5;
  expect(mapped.double.value).toBe(10);
  expect(observed.length).toBe(1); // 缓存：同一个 store 只包装一次
});

test('Vue 2.6+ 路径: observable 也可用', () => {
  const store = createState({ n: 0 });
  const FakeVue2 = {
    version: '2.7.8',
    observable: <T>(t: T): T => t,
    computed: <T>(g: () => T): { value: T } => ({ value: g() })
  };
  const useStore = bindVue(FakeVue2);
  expect(useStore(store).n).toBe(0);
});

test('缺失能力时给出明确报错', () => {
  expect(() => bindReact({})).toThrow(/React >= 16\.8/);
  expect(() => bindVue({ version: '2.5.0' })).toThrow(/Vue 2\.6\+/);
});
