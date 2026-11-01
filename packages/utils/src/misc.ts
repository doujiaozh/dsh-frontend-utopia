export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function noop(): void {
  /* 意图明确的空函数，替代 () => {} */
}

export function identity<T>(value: T): T {
  return value;
}

export function range(start: number, end: number, step = 1): number[] {
  const out: number[] = [];
  if (step <= 0) return out;
  for (let i = start; i < end; i += step) out.push(i);
  return out;
}
