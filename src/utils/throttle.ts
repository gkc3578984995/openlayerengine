/**
 * 节流函数。除了正常调用，还可以取消或立即执行待处理任务。
 *
 * @typeParam This 调用上下文。原函数使用的 `this` 类型。
 * @typeParam Args 参数。原函数接收的参数列表类型。
 * @typeParam Result 返回值。原函数的返回值类型。
 */
export interface ThrottledFunction<This, Args extends unknown[], Result> {
  /**
   * 调用节流函数。
   *
   * @param this 调用上下文。传给原函数的 `this`。
   * @param args 参数。传给原函数的参数。
   * @returns 本次执行结果；没有立即执行时返回上次结果或 `undefined`。
   *
   * @example
   * ```ts
   * import { throttle } from '@vrsim/earth-engine-ol';
   *
   * const update = throttle((value: number) => value * 2, 100);
   * const result = update(2);
   * ```
   */
  (this: This, ...args: Args): Result | undefined;
  /**
   * 取消还没有执行的尾调用，并清空节流状态。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { throttle } from '@vrsim/earth-engine-ol';
   *
   * const update = throttle(() => console.log('更新'), 100);
   * update.cancel();
   * ```
   */
  cancel(): void;
  /**
   * 立即执行还在等待的尾调用。
   *
   * @returns 最新一次执行结果；没有结果时返回 `undefined`。
   *
   * @example
   * ```ts
   * import { throttle } from '@vrsim/earth-engine-ol';
   *
   * const update = throttle((value: number) => value * 2, 100);
   * update(2);
   * const result = update.flush();
   * ```
   */
  flush(): Result | undefined;
}

/** 节流配置。控制第一次和最后一次调用是否执行。 */
export interface ThrottleOptions {
  /** 是否立即执行。控制等待开始时是否执行第一次调用。 */
  leading?: boolean;
  /** 是否执行尾调用。控制等待结束时是否执行最后一次调用。 */
  trailing?: boolean;
}

/**
 * 创建一个节流函数，限制原函数在指定时间内的执行次数。
 *
 * @typeParam This 调用上下文。原函数使用的 `this` 类型。
 * @typeParam Args 参数。原函数接收的参数列表类型。
 * @typeParam Result 返回值。原函数的返回值类型。
 * @param fn 函数。需要限制执行频率的原函数。
 * @param wait 等待时间。两次执行之间至少间隔的毫秒数。
 * @param options 配置。控制第一次和最后一次调用是否执行。
 * @returns 带有取消和立即执行能力的节流函数。
 *
 * @example
 * ```ts
 * import { throttle } from '@vrsim/earth-engine-ol';
 *
 * const onMove = throttle((x: number, y: number) => console.log(x, y), 50);
 * onMove(120, 80);
 * ```
 */
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

  /** 使用最后一次参数执行原函数。 */
  const invoke = (time: number): Result => {
    const argumentsToUse = lastArguments as Args;
    const contextToUse = lastContext as This;
    lastArguments = undefined;
    lastContext = undefined;
    lastInvokeTime = time;
    result = fn.apply(contextToUse, argumentsToUse);
    return result;
  };

  /** 判断当前调用是否已经满足执行间隔。 */
  const shouldInvoke = (time: number): boolean => {
    if (lastCallTime === undefined) return true;
    const sinceLastCall = time - lastCallTime;
    const sinceLastInvoke = time - lastInvokeTime;
    return sinceLastCall >= delay || sinceLastCall < 0 || sinceLastInvoke >= delay;
  };

  /** 计算距离下次允许执行还需要等待多久。 */
  const remainingWait = (time: number): number => {
    const sinceLastCall = time - (lastCallTime as number);
    const sinceLastInvoke = time - lastInvokeTime;
    return Math.min(delay - sinceLastCall, delay - sinceLastInvoke);
  };

  /** 结束本轮等待，并按配置执行尾调用。 */
  const trailingEdge = (time: number): Result | undefined => {
    timer = undefined;
    if (trailing && lastArguments !== undefined) return invoke(time);
    lastArguments = undefined;
    lastContext = undefined;
    return result;
  };

  /** 处理等待计时结束。 */
  const timerExpired = (): void => {
    const time = Date.now();
    if (shouldInvoke(time)) {
      trailingEdge(time);
      return;
    }
    timer = setTimeout(timerExpired, Math.max(0, remainingWait(time)));
  };

  /** 开始新一轮等待，并按配置执行首次调用。 */
  const leadingEdge = (time: number): Result | undefined => {
    lastInvokeTime = time;
    timer = setTimeout(timerExpired, delay);
    return leading ? invoke(time) : result;
  };

  /** 记录一次调用，并决定立即执行还是等待。 */
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
