import { describe, expect, it, vi } from 'vitest';
import { DisposeBag } from '../.test/harness/DisposeBag.js';

describe('人工验收台清理机制', () => {
  it('按逆序清理并在开始清理时同步标记为已销毁', () => {
    const dispose = new DisposeBag();
    const order: number[] = [];
    dispose.add(() => {
      expect(dispose.isDisposed).toBe(true);
      order.push(1);
    });
    dispose.add(() => order.push(2));

    dispose.dispose();
    dispose.dispose();

    expect(dispose.isDisposed).toBe(true);
    expect(order).toEqual([2, 1]);
  });

  it('一个清理函数失败时仍执行其余清理并抛出首个错误', () => {
    const dispose = new DisposeBag();
    const remaining = vi.fn();
    dispose.add(remaining);
    dispose.add(() => {
      throw new Error('预期的清理错误');
    });

    expect(() => dispose.dispose()).toThrow('预期的清理错误');
    expect(remaining).toHaveBeenCalledOnce();
  });

  it('销毁后新增的清理函数会立即执行', () => {
    const dispose = new DisposeBag();
    const cleanup = vi.fn();
    dispose.dispose();

    dispose.add(cleanup);

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
