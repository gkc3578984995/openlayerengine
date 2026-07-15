import type { Coordinate } from '../../core/common/types.js';
import { ObjectDisposedError } from '../../core/errors.js';
import type { CorePanIntoViewSpec } from '../../core/ports/OverlayPort.js';
import type { InternalOverlayPatch, InternalOverlayState } from './types.js';

/** OverlayHandle 调用 OverlayService 的内部控制接口。 */
export interface OverlayHandleController<T> {
  /** Overlay ID。 */
  readonly id: string;
  /** 判断句柄是否仍指向当前记录。 */
  isCurrent(): boolean;
  /** 读取当前 Overlay 状态。 */
  state(): Readonly<InternalOverlayState<T>>;
  /** 准备一次可提交或回滚的更新。 */
  prepareUpdate(patch: InternalOverlayPatch<T>): OverlayUpdateReceipt;
  /** 更新地图坐标。 */
  setPosition(position: Coordinate | undefined): void;
  /** 显示 Overlay。 */
  show(): void;
  /** 隐藏 Overlay。 */
  hide(): void;
  /** 将 Overlay 平移到视野内。 */
  panIntoView(options?: CorePanIntoViewSpec): void;
  /** 销毁 Overlay。 */
  destroy(): void;
}

/** 表示一次可提交或回滚的 Overlay 更新。 */
export interface OverlayUpdateReceipt {
  /** 提交更新。 */
  commit(): void;
  /** 放弃更新。 */
  rollback(): void;
}

/** 提供带过期检查的 Overlay 操作句柄。 */
export class OverlayHandle<T = unknown> {
  /** OverlayService 提供的控制器。 */
  readonly #controller: OverlayHandleController<T>;
  /** 句柄是否已销毁。 */
  #destroyed = false;

  /** 创建 Overlay 句柄。 */
  constructor(controller: OverlayHandleController<T>) {
    this.#controller = controller;
  }

  /** 返回 Overlay ID。 */
  get id(): string {
    return this.#controller.id;
  }

  /** 返回当前地图坐标。 */
  get position(): Coordinate | undefined {
    return this.#current().position;
  }

  /** 返回当前可见状态。 */
  get visible(): boolean {
    return this.#current().visible;
  }

  /** 返回只读业务数据。 */
  get data(): Readonly<T> | undefined {
    return this.#current().data;
  }

  /** 返回所属业务模块。 */
  get module(): string | undefined {
    return this.#current().module;
  }

  /** 立即提交 Overlay 更新。 */
  update(patch: InternalOverlayPatch<T>): void {
    this.#assertCurrent();
    this.stageUpdate(patch).commit();
  }

  /** 准备可由调用方提交或回滚的更新。 */
  stageUpdate(patch: InternalOverlayPatch<T>): OverlayUpdateReceipt {
    this.#assertCurrent();
    return this.#controller.prepareUpdate(patch);
  }

  /** 更新 Overlay 地图坐标。 */
  setPosition(position: Coordinate | undefined): void {
    this.#assertCurrent();
    this.#controller.setPosition(position);
  }

  /** 显示 Overlay。 */
  show(): void {
    this.#assertCurrent();
    this.#controller.show();
  }

  /** 隐藏 Overlay。 */
  hide(): void {
    this.#assertCurrent();
    this.#controller.hide();
  }

  /** 将 Overlay 平移到视野内。 */
  panIntoView(options?: CorePanIntoViewSpec): void {
    this.#assertCurrent();
    this.#controller.panIntoView(options);
  }

  /** 销毁当前 Overlay。 */
  destroy(): void {
    if (this.#destroyed) return;
    if (!this.#controller.isCurrent()) {
      this.#destroyed = true;
      return;
    }
    try {
      this.#controller.destroy();
      this.#destroyed = true;
    } catch (error) {
      if (!this.#controller.isCurrent()) this.#destroyed = true;
      throw error;
    }
  }

  /** 读取当前 Overlay 状态。 */
  #current(): Readonly<InternalOverlayState<T>> {
    this.#assertCurrent();
    return this.#controller.state();
  }

  /** 确保句柄仍指向有效记录。 */
  #assertCurrent(): void {
    if (this.#destroyed || !this.#controller.isCurrent()) throw new ObjectDisposedError(`Overlay handle is stale: ${this.id}`);
  }
}
