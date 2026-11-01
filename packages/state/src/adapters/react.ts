import type { UtopiaState } from '../core.js';

/**
 * React 绑定：把 React 实例作为参数传入（避免硬依赖），得到一个 Hook。
 * ```ts
 * import { bindReact } from '@utopia/state/react';
 * import React from 'react';
 * const useStore = bindReact(React);
 * const count = useStore(store, s => s.count);
 * ```
 */
export interface ReactLike {
  version?: string;
  useSyncExternalStore?: <S>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => S,
    getServerSnapshot?: () => S
  ) => S;
  useState?: <S>(initial: S | (() => S)) => [S, (value: S | ((prev: S) => S)) => void];
  useEffect?: (effect: () => (() => void) | void, deps?: unknown[]) => void;
  useCallback?: <T extends (...args: never[]) => unknown>(fn: T, deps: unknown[]) => T;
}

export interface UtopiaReactHook {
  <S extends object>(store: UtopiaState<S>): S;
  <S extends object, T>(store: UtopiaState<S>, selector: (state: S) => T, equalityFn?: (a: T, b: T) => boolean): T;
}

export function bindReact(React: ReactLike): UtopiaReactHook {
  const useSES = typeof React.useSyncExternalStore === 'function' ? React.useSyncExternalStore : undefined;
  const useCallback = React.useCallback ?? ((fn) => fn);

  if (useSES) {
    const ses = useSES as (
      subscribe: (onChange: () => void) => () => void,
      getSnapshot: () => unknown,
      getServerSnapshot?: () => unknown
    ) => unknown;
    function useUtopiaState<S extends object, T>(
      store: UtopiaState<S>,
      selector: (state: S) => T = (s) => s as unknown as T,
      _equalityFn?: (a: T, b: T) => boolean
    ): T {
      // 版本号作为快照信号：版本不变就不重渲染；selector 在渲染期重新计算
      const subscribe = useCallback((onChange: () => void) => store.subscribe(onChange), [store]);
      const getSnapshot = useCallback(() => store.version, [store]);
      void ses(subscribe, getSnapshot, getSnapshot);
      return selector(store.state);
    }
    return useUtopiaState as UtopiaReactHook;
  }

  if (!React.useState || !React.useEffect) {
    throw new Error('[utopia/state/react] 需要 React >= 16.8（useState/useEffect）或 >= 18（useSyncExternalStore）');
  }
  const useState = React.useState;
  const useEffect = React.useEffect;

  function useUtopiaStateLegacy<S extends object, T>(
    store: UtopiaState<S>,
    selector: (state: S) => T = (s) => s as unknown as T,
    _equalityFn?: (a: T, b: T) => boolean
  ): T {
    const [, setTick] = useState(0);
    useEffect(() => store.subscribe(() => setTick((n) => n + 1)), [store]);
    return selector(store.state);
  }
  return useUtopiaStateLegacy as UtopiaReactHook;
}
