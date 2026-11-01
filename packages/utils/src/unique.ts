/**
 * 数组去重：unique 用 Set 处理原始值；uniqBy 按业务键去重任意对象。
 */
export function unique<T>(list: readonly T[]): T[] {
  return Array.from(new Set(list));
}

export function uniqBy<T, K>(list: readonly T[], iteratee: (item: T, index: number) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  list.forEach((item, index) => {
    const key = iteratee(item, index);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  });
  return out;
}
