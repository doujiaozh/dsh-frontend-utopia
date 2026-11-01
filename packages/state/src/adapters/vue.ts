import type { UtopiaState } from '../core.js';

/**
 * Vue 绑定：把 Vue 运行时作为参数传入，得到响应式状态与 computed 映射。
 *
 * Vue 3：```ts
 * import { bindVue } from '@utopia/state/vue';
 * import { reactive, computed, version } from 'vue';
 * const useStore = bindVue({ version, reactive, computed });
 * const state = useStore(store);          // 放进 setup return 即可模板驱动
 * ```
 *
 * Vue 2.6+：用 Vue.observable 作为 reactive 传入。
 */
export interface VueLike {
  version?: string;
  /** Vue 3 reactivity */
  reactive?: <T>(target: T) => T;
  computed?: <T>(getter: () => T) => { value: T };
  /** Vue 2.6+ */
  observable?: <T>(target: T) => T;
}

type ComputedMap<M extends Record<string, (state: never) => unknown>> = {
  [K in keyof M]: { value: ReturnType<M[K]> };
};

export interface VueBinding {
  <S extends object>(store: UtopiaState<S>): S;
  map<S extends object, M extends Record<string, (state: S) => unknown>>(store: UtopiaState<S>, mapper: M): ComputedMap<M>;
}

export function bindVue(Vue: VueLike): VueBinding {
  const version = String(Vue.version ?? '');
  const isVue3 = version.startsWith('3');
  const reactive = isVue3 ? Vue.reactive : Vue.observable;
  if (!reactive) {
    throw new Error('[utopia/state/vue] 需要 Vue 2.6+（observable）或 Vue 3（reactive），请把 Vue 运行时传入 bindVue');
  }
  const reactiveFn = reactive as <T extends object>(target: T) => T;
  const cache = new WeakMap<object, object>();

  function useStore<S extends object>(store: UtopiaState<S>): S {
    let reactiveState = cache.get(store as unknown as object);
    if (!reactiveState) {
      // 把 Utopia 代理再包进 Vue 的响应式系统：模板里读、Vue 里写都会回流到 Utopia 提交
      reactiveState = reactiveFn(store.state) as object;
      cache.set(store as unknown as object, reactiveState);
    }
    return reactiveState as S;
  }

  function map<S extends object, M extends Record<string, (state: S) => unknown>>(
    store: UtopiaState<S>,
    mapper: M
  ): ComputedMap<M> {
    if (!Vue.computed) {
      throw new Error('[utopia/state/vue] map 需要 Vue.computed（Vue 2.6+/Vue 3）');
    }
    const out: Record<string, { value: unknown }> = {};
    for (const key of Object.keys(mapper)) {
      out[key] = Vue.computed(() => mapper[key](store.state));
    }
    return out as ComputedMap<M>;
  }

  return Object.assign(useStore as VueBinding, { map }) as VueBinding;
}
