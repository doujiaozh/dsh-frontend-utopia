import { RAW } from './symbols.js';

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 快照克隆：与 @utopia/utils 的 deepClone 同构（保持各包零依赖独立）。
 * 用于时间旅行快照与初始状态隔离。
 */
export function cloneSnapshot<T>(value: T): T {
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
      return copy;
    }
    const copy: Record<PropertyKey, unknown> = Array.isArray(v)
      ? []
      : Object.create(Object.getPrototypeOf(v));
    seen.set(v as object, copy);
    for (const key of Reflect.ownKeys(v as object)) {
      copy[key] = clone((v as Record<PropertyKey, unknown>)[key]);
    }
    return copy;
  };

  return clone(value) as T;
}

/** 把可能被代理包裹的值还原为原始对象 */
export function unwrap<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    const raw = (value as Record<symbol, unknown>)[RAW];
    if (raw !== undefined) return raw as T;
  }
  return value;
}

function isLeaf(value: unknown): boolean {
  return value === null
    || typeof value !== 'object'
    || value instanceof Date
    || value instanceof RegExp
    || value instanceof Map
    || value instanceof Set
    || value instanceof ArrayBuffer
    || ArrayBuffer.isView(value);
}

/**
 * 就地改写：把 target 的内容替换成 source 的内容，保持 target 对象身份不变。
 * 时间旅行回放时使用——订阅者持有的根代理引用依然有效。
 */
export function replaceInPlace(target: object, source: unknown): void {
  if (!isObject(target) || !isObject(source)) return;

  if (Array.isArray(target)) {
    const src = Array.isArray(source) ? source : [];
    (target as unknown[]).length = src.length;
    for (let i = 0; i < src.length; i++) {
      const cur = (target as unknown[])[i];
      const val = src[i];
      if (!isLeaf(cur) && !isLeaf(val)) replaceInPlace(cur as object, val as object);
      else (target as unknown[])[i] = val;
    }
    return;
  }

  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  for (const [key, val] of Object.entries(source)) {
    const cur = target[key];
    if (!isLeaf(cur) && !isLeaf(val)) replaceInPlace(cur as object, val as object);
    else target[key] = val;
  }
}
