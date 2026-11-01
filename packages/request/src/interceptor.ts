/**
 * 拦截器链：与 axios 同源的 use/eject 语义。
 */
export interface InterceptorHandlers<T> {
  fulfilled?: (value: T) => T | Promise<T>;
  rejected?: (error: unknown) => unknown;
}

export class InterceptorManager<T> {
  private items: Array<InterceptorHandlers<T> | null> = [];

  use(fulfilled?: (value: T) => T | Promise<T>, rejected?: (error: unknown) => unknown): number {
    this.items.push({ fulfilled, rejected });
    return this.items.length - 1;
  }

  eject(id: number): void {
    if (this.items[id]) this.items[id] = null;
  }

  forEach(cb: (handlers: InterceptorHandlers<T>) => void): void {
    this.items.forEach((item) => {
      if (item) cb(item);
    });
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.filter(Boolean).length;
  }
}
