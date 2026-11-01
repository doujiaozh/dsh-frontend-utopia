/**
 * 防抖：连续调用只在最后一次调用后等待 wait 毫秒执行一次。
 * leading=true 时首次调用立即执行；trailing=false 时禁止尾随调用。
 */
export interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
}

export interface DebouncedFunction<Args extends unknown[]> {
  (...args: Args): void;
  cancel(): void;
  flush(): void;
  pending(): boolean;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait = 200,
  options: DebounceOptions = {}
): DebouncedFunction<Args> {
  const { leading = false, trailing = true } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Args | null = null;
  let leadingFired = false;

  function fire(args: Args) {
    fn(...args);
    lastArgs = null;
    timer = null;
    leadingFired = false;
  }

  function invoke(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (lastArgs && trailing) {
      fire(lastArgs);
    } else {
      leadingFired = false;
    }
  }

  const debounced = (...args: Args): void => {
    if (leading && !leadingFired) {
      leadingFired = true;
      lastArgs = null;
      fn(...args);
    } else {
      lastArgs = args;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(invoke, wait);
  };

  debounced.cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
    leadingFired = false;
  };

  debounced.flush = (): void => {
    if (timer) invoke();
  };

  debounced.pending = (): boolean => timer !== null;

  return debounced;
}
