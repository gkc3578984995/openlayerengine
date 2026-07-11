/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import Transform from '../src/components/Transform';

describe('Transform 监听生命周期', () => {
  it('销毁时只释放自身登记的键盘和复制监听', () => {
    const keyDownDisposer = vi.fn();
    const copyMoveDisposer = vi.fn();
    const copyConfirmDisposer = vi.fn();
    const copyCancelDisposer = vi.fn();
    const disableGlobalKeyDownEvent = vi.fn();
    const transform = Object.create(Transform.prototype) as any;
    transform.disposed = false;
    transform.earth = {
      setMouseStyleToDefault: vi.fn(),
      map: {
        getViewport: () => ({ removeEventListener: vi.fn() }),
        removeInteraction: () => true
      },
      useGlobalEvent: () => ({ disableGlobalKeyDownEvent })
    };
    transform.listenerMap = new Map();
    transform.keyDownFun = keyDownDisposer;
    transform.copyMoveDisposer = copyMoveDisposer;
    transform.copyConfirmDisposer = copyConfirmDisposer;
    transform.copyCancelDisposer = copyCancelDisposer;
    transform.toolbar = null;
    transform.history = { clear: vi.fn() };
    transform.toolbarSyncKeys = [];
    transform.removeHelpTooltip = vi.fn();

    transform.destroy();

    expect(keyDownDisposer).toHaveBeenCalledTimes(1);
    expect(copyMoveDisposer).toHaveBeenCalledTimes(1);
    expect(copyConfirmDisposer).toHaveBeenCalledTimes(1);
    expect(copyCancelDisposer).toHaveBeenCalledTimes(1);
    expect(disableGlobalKeyDownEvent).not.toHaveBeenCalled();
  });
});
