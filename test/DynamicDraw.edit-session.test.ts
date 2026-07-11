/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import DynamicDraw from '../src/components/DynamicDraw';

describe('DynamicDraw 编辑会话', () => {
  it('启动新会话前会关闭上一会话的监听和临时资源', () => {
    const exitDisposer = vi.fn();
    const cleanup = vi.fn();
    const draw = Object.create(DynamicDraw.prototype) as any;
    draw.editSessionExitDisposer = exitDisposer;
    draw.editSessionCleanup = cleanup;

    draw.closeEditSession();

    expect(exitDisposer).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(draw.editSessionExitDisposer).toBeUndefined();
    expect(draw.editSessionCleanup).toBeUndefined();
  });
});
