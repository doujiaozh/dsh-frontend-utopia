/**
 * 节流：在 wait 毫秒窗口内最多执行一次。
 * leading=false 时首次调用不立即执行；trailing=true 时窗口结束时补发最后一次调用。
 */
export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

export interface ThrottledFunction<Args extends unknown[]> {
  (...args: Args): void;
  cancel(): void;
  flush(): void;
}

export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait = 200,
  options: ThrottleOptions = {}
): ThrottledFunction<Args> {
  const { leading = true, trailing = true } = options;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  function invoke(args: Args): void {
    fn(...args);
    last = Date.now();
    pendingArgs = null;
    timer = null;
  }

  const throttled = (...args: Args): void => {
    const now = Date.now();
    if (last === 0 && !leading) last = now;
    const remaining = wait - (now - last);
    pendingArgs = args;
    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      invoke(args);
    } else if (!timer && trailing) {
      timer = setTimeout(() => {
        if (pendingArgs) invoke(pendingArgs);
      }, remaining);
    }
  };

  throttled.cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
    last = 0;
  };

  throttled.flush = (): void => {
    if (timer && pendingArgs) {
      clearTimeout(timer);
      invoke(pendingArgs);
    }
  };

  return throttled;
}
