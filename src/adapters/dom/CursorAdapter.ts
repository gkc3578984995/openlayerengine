import { InvalidArgumentError } from '../../core/errors.js';
import type { CursorPort, CursorViewHandle } from '../../core/ports/CursorPort.js';

/** 在单个 Earth viewport 内应用并恢复交互光标。 */
export class CursorAdapter implements CursorPort {
  readonly #viewport: HTMLElement;
  /** 未被交互覆盖时应使用的最新外部光标。 */
  #baseCursor: string;
  readonly #views = new Set<CursorView>();

  constructor(viewport: HTMLElement) {
    this.#viewport = viewport;
    this.#baseCursor = viewport.style.cursor;
  }

  /** 为互斥交互取得光标所有权，并吸收视口上最新的外部光标。 */
  open(): CursorViewHandle {
    if (this.#views.size === 0 && this.#viewport.style.cursor !== this.#baseCursor) this.#baseCursor = this.#viewport.style.cursor;
    const view = new CursorView(
      this.#viewport,
      this.#baseCursor,
      (cursor) => {
        this.#baseCursor = cursor;
      },
      () => this.#views.delete(view)
    );
    this.#views.add(view);
    return view;
  }

  /** 记录 ViewService 写入的外部光标；活动交互结束后恢复该值。 */
  setBase(cursor: string): void {
    const normalized = requireCursor(cursor);
    this.#baseCursor = normalized;
    if (this.#views.size === 0) {
      this.#viewport.style.cursor = normalized;
      return;
    }
    for (const view of this.#views) view.updateBase(normalized);
  }
}

/** 管理单个交互 Session 的光标覆盖与恢复。 */
class CursorView implements CursorViewHandle {
  readonly #viewport: HTMLElement;
  #baseCursor: string;
  #override: string | undefined;
  readonly #onBaseChange: (cursor: string) => void;
  readonly #onDestroy: () => void;
  #destroyed = false;

  constructor(viewport: HTMLElement, baseCursor: string, onBaseChange: (cursor: string) => void, onDestroy: () => void) {
    this.#viewport = viewport;
    this.#baseCursor = baseCursor;
    this.#onBaseChange = onBaseChange;
    this.#onDestroy = onDestroy;
  }

  /** 同步通过 ViewService 显式更新的外部基准，同时保留活动交互覆盖。 */
  updateBase(cursor: string): void {
    if (this.#destroyed) return;
    this.#baseCursor = cursor;
    this.#viewport.style.cursor = this.#override ?? cursor;
  }

  /** 应用交互光标，同时保留 Session 期间外部写入的最新基础值。 */
  set(cursor: string): void {
    if (this.#destroyed) return;
    const normalized = requireCursor(cursor);
    this.#captureExternalCursor();
    this.#override = normalized;
    this.#viewport.style.cursor = normalized;
  }

  /** 清除交互覆盖并恢复最新基础光标。 */
  reset(): void {
    if (this.#destroyed) return;
    this.#captureExternalCursor();
    this.#override = undefined;
    this.#viewport.style.cursor = this.#baseCursor;
  }

  /** 幂等释放光标所有权。 */
  destroy(): void {
    if (this.#destroyed) return;
    this.#captureExternalCursor();
    if (this.#override === undefined || this.#viewport.style.cursor === this.#override) this.#viewport.style.cursor = this.#baseCursor;
    this.#override = undefined;
    this.#destroyed = true;
    this.#onDestroy();
  }

  /** 识别 ViewService 或调用方在 Session 期间直接写入的新光标。 */
  #captureExternalCursor(): void {
    const current = this.#viewport.style.cursor;
    const expected = this.#override ?? this.#baseCursor;
    if (current !== expected) {
      this.#baseCursor = current;
      this.#onBaseChange(current);
    }
  }
}

function requireCursor(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError('Cursor must be a non-empty string');
  return value;
}
