import { isObject } from './is.js';

/**
 * 极速深拷贝：循环引用安全，保留原型链，覆盖
 * Date / RegExp / Map / Set / ArrayBuffer / TypedArray / Symbol 键。
 * 比 structuredClone 更好的地方：不抛 DataCloneError、保留原型；缺点是不克隆函数（按引用传递）。
 */
export function deepClone<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();

  const clone = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) return seen.get(v as object);

    if (v instanceof Date) return new Date(v.getTime());
    if (v instanceof RegExp) return new RegExp(v.source, v.flags);
    if (v instanceof ArrayBuffer) return v.slice(0);

    if (v instanceof Map) {
      const copy = new Map();
      seen.set(v as object, copy);
      v.forEach((val, key) => copy.set(clone(key), clone(val)));
      return copy;
    }

    if (v instanceof Set) {
      const copy = new Set();
      seen.set(v as object, copy);
      v.forEach((val) => copy.add(clone(val)));
      return copy;
    }

    if (ArrayBuffer.isView(v)) {
      const view = v as Uint8Array;
      const Ctor = Object.getPrototypeOf(view).constructor as typeof Uint8Array;
      const copy = new Ctor(view.length);
      copy.set(view);
      seen.set(v as object, copy);
      return copy;
    }

    const proto = Object.getPrototypeOf(v);
    const copy: Record<PropertyKey, unknown> = Array.isArray(v)
      ? []
      : proto
        ? Object.create(proto)
        : Object.create(null);
    seen.set(v as object, copy);
    for (const key of Reflect.ownKeys(v as object)) {
      copy[key] = clone((v as Record<PropertyKey, unknown>)[key]);
    }
    return copy;
  };

  return clone(value) as T;
}
