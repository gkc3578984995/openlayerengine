/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import GlobalEvent from '../src/components/GlobalEvent';

describe('GlobalEvent 一次性监听', () => {
  it('取消后不再触发一次性右键回调', () => {
    const viewport = new EventTarget();
    const globalEvent = Object.create(GlobalEvent.prototype) as any;
    globalEvent.map = {
      getViewport: () => viewport,
      getEventCoordinate: () => [120, 30],
      getEventPixel: () => [12, 24]
    };
    const callback = vi.fn();

    const cancel = globalEvent.addCancelableMouseOnceRightClickEventByGlobal(callback);
    cancel();
    viewport.dispatchEvent(new Event('contextmenu'));

    expect(callback).not.toHaveBeenCalled();
  });
});
