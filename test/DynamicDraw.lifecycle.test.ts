/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import DynamicDraw from '../src/components/DynamicDraw';

describe('DynamicDraw 监听生命周期', () => {
  it('退出绘制时只注销自身的全局监听', () => {
    const progressDisposer = vi.fn();
    const exitDisposer = vi.fn();
    const disableGlobalMouseRightClickEvent = vi.fn();
    const disableGlobalMouseMoveEvent = vi.fn();
    const disableGlobalMouseLeftDownEvent = vi.fn();
    const draw = Object.create(DynamicDraw.prototype) as any;
    draw.drawProgressDisposers = [progressDisposer];
    draw.drawExitDisposer = exitDisposer;
    draw.lastDrawCompleted = true;
    draw.earth = {
      useGlobalEvent: () => ({
        hasGlobalMouseRightClickEvent: () => true,
        hasGlobalMouseMoveEvent: () => true,
        hasGlobalMouseLeftDownEvent: () => true,
        disableGlobalMouseRightClickEvent,
        disableGlobalMouseMoveEvent,
        disableGlobalMouseLeftDownEvent
      }),
      setMouseStyleToDefault: vi.fn()
    };

    draw.exitDraw({ position: [120, 30] });

    expect(progressDisposer).toHaveBeenCalledTimes(1);
    expect(exitDisposer).toHaveBeenCalledTimes(1);
    expect(disableGlobalMouseRightClickEvent).not.toHaveBeenCalled();
    expect(disableGlobalMouseMoveEvent).not.toHaveBeenCalled();
    expect(disableGlobalMouseLeftDownEvent).not.toHaveBeenCalled();
  });
});
