import { vi } from 'vitest';
import type { CursorPort, CursorViewHandle } from '../../src/core/ports/CursorPort.js';

/** 记录一次交互 Session 的光标覆盖及其生命周期。 */
export class FakeCursorHandle implements CursorViewHandle {
  /** 当前 Session 覆盖的 CSS cursor；`undefined` 表示已恢复基础光标。 */
  cursor: string | undefined;
  destroyed = false;
  /** 按发生顺序保存光标变化。 */
  readonly log: string[] = [];

  readonly set = vi.fn((cursor: string): void => {
    if (this.destroyed) return;
    this.cursor = cursor;
    this.log.push(`set:${cursor}`);
  });

  readonly reset = vi.fn((): void => {
    if (this.destroyed) return;
    this.cursor = undefined;
    this.log.push('reset');
  });

  readonly destroy = vi.fn((): void => {
    if (this.destroyed) return;
    this.cursor = undefined;
    this.destroyed = true;
    this.log.push('destroy');
  });
}

/** 为 Draw/Edit Session 提供可观察的光标测试端口。 */
export class FakeCursorPort implements CursorPort {
  /** 按创建顺序保存 Session 句柄。 */
  readonly views: FakeCursorHandle[] = [];

  readonly open = vi.fn((): CursorViewHandle => {
    const view = new FakeCursorHandle();
    this.views.push(view);
    return view;
  });
}
