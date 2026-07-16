import { vi } from 'vitest';
import type { CursorPort, CursorViewHandle } from '../../src/core/ports/CursorPort.js';

/** 测试中记录单个交互会话光标状态的句柄。 */
export class FakeCursorHandle implements CursorViewHandle {
  /** 当前会话覆盖的 CSS cursor；`undefined` 表示已经恢复基础光标。 */
  cursor: string | undefined;
  /** 句柄是否已经释放。 */
  destroyed = false;
  /** 按调用顺序记录光标生命周期。 */
  readonly log: string[] = [];

  /** 记录新的交互光标。 */
  readonly set = vi.fn((cursor: string): void => {
    if (this.destroyed) return;
    this.cursor = cursor;
    this.log.push(`set:${cursor}`);
  });

  /** 记录恢复会话基础光标。 */
  readonly reset = vi.fn((): void => {
    if (this.destroyed) return;
    this.cursor = undefined;
    this.log.push('reset');
  });

  /** 记录最终释放并清除交互覆盖。 */
  readonly destroy = vi.fn((): void => {
    if (this.destroyed) return;
    this.cursor = undefined;
    this.destroyed = true;
    this.log.push('destroy');
  });
}

/** 为 Draw/Edit Session 提供可观察光标句柄的测试端口。 */
export class FakeCursorPort implements CursorPort {
  /** 按打开顺序保存全部会话句柄。 */
  readonly views: FakeCursorHandle[] = [];

  /** 创建并记录一个新的测试句柄。 */
  readonly open = vi.fn((): CursorViewHandle => {
    const view = new FakeCursorHandle();
    this.views.push(view);
    return view;
  });
}
