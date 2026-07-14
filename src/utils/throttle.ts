export interface ThrottledFunction<This, Args extends unknown[], Result> {
  (this: This, ...args: Args): Result | undefined;
  cancel(): void;
  flush(): Result | undefined;
}

export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

export function throttle<This, Args extends unknown[], Result>(
  fn: (this: This, ...args: Args) => Result,
  wait = 0,
  options: ThrottleOptions = {}
): ThrottledFunction<This, Args, Result> {
  const delay = Number.isFinite(wait) ? Math.max(0, wait) : 0;
  const leading = options.leading !== false;
  const trailing = options.trailing !== false;
  let lastArguments: Args | undefined;
  let lastCallTime: number | undefined;
  let lastContext: This | undefined;
  let lastInvokeTime = 0;
  let result: Result | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const invoke = (time: number): Result => {
    const argumentsToUse = lastArguments as Args;
    const contextToUse = lastContext as This;
    lastArguments = undefined;
    lastContext = undefined;
    lastInvokeTime = time;
    result = fn.apply(contextToUse, argumentsToUse);
    return result;
  };

  const shouldInvoke = (time: number): boolean => {
    if (lastCallTime === undefined) return true;
    const sinceLastCall = time - lastCallTime;
    const sinceLastInvoke = time - lastInvokeTime;
    return sinceLastCall >= delay || sinceLastCall < 0 || sinceLastInvoke >= delay;
  };

  const remainingWait = (time: number): number => {
    const sinceLastCall = time - (lastCallTime as number);
    const sinceLastInvoke = time - lastInvokeTime;
    return Math.min(delay - sinceLastCall, delay - sinceLastInvoke);
  };

  const trailingEdge = (time: number): Result | undefined => {
    timer = undefined;
    if (trailing && lastArguments !== undefined) return invoke(time);
    lastArguments = undefined;
    lastContext = undefined;
    return result;
  };

  const timerExpired = (): void => {
    const time = Date.now();
    if (shouldInvoke(time)) {
      trailingEdge(time);
      return;
    }
    timer = setTimeout(timerExpired, Math.max(0, remainingWait(time)));
  };

  const leadingEdge = (time: number): Result | undefined => {
    lastInvokeTime = time;
    timer = setTimeout(timerExpired, delay);
    return leading ? invoke(time) : result;
  };

  const call = (context: This, args: Args): Result | undefined => {
    const time = Date.now();
    const invokeNow = shouldInvoke(time);
    lastArguments = args;
    lastContext = context;
    lastCallTime = time;

    if (invokeNow) {
      if (timer === undefined) return leadingEdge(time);
      clearTimeout(timer);
      timer = setTimeout(timerExpired, delay);
      return invoke(time);
    }
    if (timer === undefined) timer = setTimeout(timerExpired, delay);
    return result;
  };

  const throttled = function (this: This, ...args: Args): Result | undefined {
    return call(this, args);
  } as ThrottledFunction<This, Args, Result>;

  throttled.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    lastArguments = undefined;
    lastCallTime = undefined;
    lastContext = undefined;
    lastInvokeTime = 0;
    timer = undefined;
  };

  throttled.flush = (): Result | undefined => {
    if (timer === undefined) return result;
    clearTimeout(timer);
    return trailingEdge(Date.now());
  };

  return throttled;
}
