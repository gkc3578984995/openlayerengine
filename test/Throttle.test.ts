import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { throttle } from '../src/utils/throttle.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

describe('v2 节流工具（utils-throttle-cancel-flush）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('默认在窗口首尾执行并使用尾部最后一组参数', () => {
    coversCapabilities('utils-throttle-cancel-flush');
    const callback = vi.fn((value: number) => value * 2);
    const throttled = throttle(callback, 100);
    expect(throttled(1)).toBe(2);
    expect(throttled(2)).toBe(2);
    expect(throttled(3)).toBe(2);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenNthCalledWith(2, 3);
    expect(throttled.flush()).toBe(6);
  });

  it('支持仅在窗口尾部执行', () => {
    const callback = vi.fn((value: string) => value.toUpperCase());
    const throttled = throttle(callback, 100, { leading: false });
    expect(throttled('first')).toBeUndefined();
    expect(throttled('last')).toBeUndefined();
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('last');
    expect(throttled.flush()).toBe('LAST');
  });

  it('支持仅在窗口首部执行', () => {
    const callback = vi.fn((value: number) => value);
    const throttled = throttle(callback, 100, { trailing: false });
    expect(throttled(1)).toBe(1);
    expect(throttled(2)).toBe(1);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(throttled(3)).toBe(3);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('首尾均关闭时不执行回调且仍会释放窗口计时器', () => {
    const callback = vi.fn();
    const throttled = throttle(callback, 100, { leading: false, trailing: false });
    throttled();
    throttled();
    expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);
    expect(callback).not.toHaveBeenCalled();
  });

  it('保留 this、参数与最近一次执行结果', () => {
    const calls: Array<{ readonly context: { readonly base: number }; readonly args: readonly [number, number] }> = [];
    function callback(this: { base: number }, left: number, right: number): number {
      calls.push({ context: this, args: [left, right] });
      return this.base + left + right;
    }
    const context = { base: 5 };
    const throttled = throttle(callback, 100);
    expect(throttled.call(context, 2, 3)).toBe(10);
    expect(throttled.call({ base: 20 }, 4, 6)).toBe(10);
    vi.advanceTimersByTime(100);
    expect(calls).toEqual([
      { context, args: [2, 3] },
      { context: { base: 20 }, args: [4, 6] }
    ]);
    expect(throttled.flush()).toBe(30);
  });

  it('cancel 丢弃待执行调用、释放计时器并允许重新开始', () => {
    const callback = vi.fn((value: number) => value);
    const throttled = throttle(callback, 100, { leading: false });
    throttled(1);
    throttled.cancel();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(100);
    expect(callback).not.toHaveBeenCalled();

    throttled(2);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledWith(2);
  });

  it('flush 立即执行尾部调用并同步释放计时器', () => {
    const callback = vi.fn((value: number) => value + 1);
    const throttled = throttle(callback, 100, { leading: false });
    throttled(4);
    expect(vi.getTimerCount()).toBe(1);
    expect(throttled.flush()).toBe(5);
    expect(callback).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(throttled.flush()).toBe(5);
  });

  it('持续调用时每个等待窗口最多执行一次并最终释放计时器', () => {
    const callback = vi.fn();
    const throttled = throttle(callback, 100);
    throttled();
    for (let index = 0; index < 5; index += 1) {
      vi.advanceTimersByTime(25);
      throttled();
    }
    expect(callback).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(75);
    expect(callback).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
