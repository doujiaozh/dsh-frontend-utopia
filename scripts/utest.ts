/**
 * utest —— 侵入式零依赖测试核。
 *
 * 不依赖 vitest / jest / mocha：test() 注册用例，expect() 断言，
 * runAll() 统一执行并输出。被 scripts/test.mjs 编译后调用。
 */

export interface AssertResult {
  name: string;
  ok: boolean;
  error?: string;
}

interface Case {
  name: string;
  fn: () => void | Promise<void>;
}

const cases: Case[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
  cases.push({ name, fn });
}
export const it = test;

export function casesOf(): readonly Case[] {
  return cases;
}

/** 测试用延时工具：await sleep(ms) —— 不引入任何外部依赖 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fmt(v: unknown): string {
  if (typeof v === 'symbol') return String(v);
  if (typeof v === 'bigint') return `${v}n`;
  if (typeof v === 'function') return `[Function ${(v as { name?: string }).name || 'anonymous'}]`;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === 'object' && v !== null) {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k))) return false;
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

class ExpectationError extends Error {}

export interface Expectation<T> {
  toBe(expected: T): void;
  toEqual(expected: unknown): void;
  toStrictEqual(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toBeNull(): void;
  toBeInstanceOf(cls: new (...args: any[]) => unknown): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  toHaveLength(n: number): void;
  toBeGreaterThan(n: number): void;
  toBeGreaterThanOrEqual(n: number): void;
  toBeLessThan(n: number): void;
  toBeLessThanOrEqual(n: number): void;
  toContain(item: unknown): void;
  toThrow(matcher?: string | RegExp): void;
  not: Omit<Expectation<T>, 'not'>;
}

export function expect<T>(actual: T): Expectation<T> {
  const make = (neg: boolean) => {
    const check = (cond: boolean, msg: string) => {
      // 正向：cond 为假则失败；反向：cond 为真则失败
      const failed = neg ? cond : !cond;
      if (failed) throw new ExpectationError(msg);
    };
    return {
      toBe: (expected: T) =>
        check(Object.is(actual, expected), `期望 ${fmt(actual)} ${neg ? '不' : ''}等于(toBe) ${fmt(expected)}`),
      toEqual: (expected: unknown) =>
        check(deepEqual(actual, expected), `期望深度相等(equal): actual=${fmt(actual)} expected=${fmt(expected)}`),
      toStrictEqual: (expected: unknown) =>
        check(deepEqual(actual, expected), `期望严格相等(strictEqual): actual=${fmt(actual)} expected=${fmt(expected)}`),
      toBeTruthy: () => check(Boolean(actual), `期望真值，实为 ${fmt(actual)}`),
      toBeFalsy: () => check(!actual, `期望假值，实为 ${fmt(actual)}`),
      toBeDefined: () => check(actual !== undefined, `期望已定义，实为 undefined`),
      toBeUndefined: () => check(actual === undefined, `期望 undefined，实为 ${fmt(actual)}`),
      toBeNull: () => check(actual === null, `期望 null，实为 ${fmt(actual)}`),
      toBeInstanceOf: (cls: new (...args: any[]) => unknown) => // eslint-disable-line @typescript-eslint/no-explicit-any
        check(actual instanceof cls, `期望 ${fmt(actual)} 是 ${cls.name} 实例`),
      toHaveLength: (n: number) =>
        check((actual as { length?: number })?.length === n, `期望长度 ${n}，实为 ${(actual as { length?: number })?.length}`),
      toBeGreaterThan: (n: number) => check((actual as unknown as number) > n, `期望大于 ${n}，实为 ${fmt(actual)}`),
      toBeGreaterThanOrEqual: (n: number) => check((actual as unknown as number) >= n, `期望大于等于 ${n}，实为 ${fmt(actual)}`),
      toBeLessThan: (n: number) => check((actual as unknown as number) < n, `期望小于 ${n}，实为 ${fmt(actual)}`),
      toBeLessThanOrEqual: (n: number) => check((actual as unknown as number) <= n, `期望小于等于 ${n}，实为 ${fmt(actual)}`),
      toContain: (item: unknown) => {
        const a = actual as unknown;
        let has = false;
        if (typeof (a as { includes?: unknown })?.includes === 'function') {
          has = (a as unknown[]).includes(item);
        } else if (a instanceof Map || a instanceof Set) {
          has = a.has(item as never);
        } else if (typeof a === 'string') {
          has = a.includes(String(item));
        }
        check(has, `期望 ${fmt(actual)} 包含 ${fmt(item)}`);
      },
      toThrow: (matcher?: string | RegExp) => {
        if (typeof actual !== 'function') throw new ExpectationError('toThrow 仅适用于函数');
        let thrown: string | null = null;
        try {
          (actual as () => unknown)();
        } catch (e) {
          thrown = e instanceof Error ? e.message : String(e);
        }
        if (matcher) {
          const hit = matcher instanceof RegExp ? matcher.test(thrown ?? '') : (thrown ?? '').includes(matcher);
          check(hit, `期望抛出匹配 ${String(matcher)} 的错误，实为 "${thrown}"`);
        } else {
          check(thrown !== null, `期望抛出异常，但未抛出`);
        }
      }
    };
  };
  const base = make(false) as Omit<Expectation<T>, 'not'>;
  return { ...base, not: make(true) as Omit<Expectation<T>, 'not'> };
}

export async function runAll(): Promise<{ passed: number; failed: number; results: AssertResult[] }> {
  const results: AssertResult[] = [];
  for (const c of cases) {
    try {
      await c.fn();
      results.push({ name: c.name, ok: true });
    } catch (e) {
      const error = e instanceof ExpectationError
        ? e.message
        : e instanceof Error
          ? `${e.name}: ${e.message}`
          : String(e);
      results.push({ name: c.name, ok: false, error });
    }
  }
  for (const r of results) {
    if (r.ok) console.log(`  ✓ ${r.name}`);
    else console.log(`  ✗ ${r.name}\n      ${r.error}`);
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n  通过 ${results.length - failed} / ${results.length}`);
  return { passed: results.length - failed, failed, results };
}
