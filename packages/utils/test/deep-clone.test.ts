import { test, expect } from '../../../scripts/utest.js';
import { deepClone } from '../src/deepClone.js';

class Entity {
  constructor(public kind: string) {}
  describe(): string { return `entity:${this.kind}`; }
}

test('deepClone: 深层对象与数组完全独立', () => {
  const src = { list: [1, 2, { nested: true }], meta: { at: 1 } };
  const copy = deepClone(src);
  expect(copy).toEqual(src);
  expect(copy).not.toBe(src);
  expect(copy.list).not.toBe(src.list);
  expect((copy.list as unknown[])[2]).not.toBe((src.list as unknown[])[2]);
});

test('deepClone: Date / RegExp / Map / Set / TypedArray 精确克隆', () => {
  const d = new Date(0);
  const r = /a+/gu;
  const m = new Map([['k', [1, 2]]]);
  const s = new Set([1, 2, 3]);
  const buf = new Uint8Array([1, 2, 3]);
  const copy = deepClone({ d, r, m, s, buf });
  expect((copy as { d: Date }).d.getTime()).toBe(d.getTime());
  expect((copy as { r: RegExp }).r.flags).toBe('gu');
  expect((copy as { m: Map<string, number[]> }).m.get('k')).toEqual([1, 2]);
  expect((copy as { s: Set<number> }).s.size).toBe(3);
  expect((copy as { buf: Uint8Array }).buf).toEqual(buf);
});

test('deepClone: 循环引用安全', () => {
  const a: Record<string, unknown> = { name: 'a' };
  a.self = a;
  const copy = deepClone(a);
  expect(copy.name).toBe('a');
  expect(copy.self).toBe(copy);
});

test('deepClone: 保留原型链与 Symbol 键', () => {
  const sym = Symbol('id');
  const src = new Entity('user');
  (src as unknown as Record<symbol, string>)[sym] = 'sym-value';
  const copy = deepClone(src);
  expect(copy.describe()).toBe('entity:user');
  expect((copy as unknown as Record<symbol, string>)[sym]).toBe('sym-value');
});
