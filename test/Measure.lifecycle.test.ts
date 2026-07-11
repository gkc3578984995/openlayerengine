/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import Measure from '../src/components/Measure';

describe('Measure 监听生命周期', () => {
  it('结束测量时只释放自身登记的监听和延迟任务', () => {
    const exitDisposer = vi.fn();
    const leftUpDisposer = vi.fn();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const measure = Object.create(Measure.prototype) as any;
    measure.measureExitDisposer = exitDisposer;
    measure.centerLeftUpDisposer = leftUpDisposer;
    measure.centerLeftUpTimer = 1;

    measure.clearMeasureListeners();

    expect(exitDisposer).toHaveBeenCalledTimes(1);
    expect(leftUpDisposer).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(1);
    clearTimeoutSpy.mockRestore();
  });
});
