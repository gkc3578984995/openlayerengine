import type { Coordinate } from '../../core/common/types.js';
import { ObjectDisposedError } from '../../core/errors.js';
import type { InternalDescriptorEvent, InternalDescriptorPatch, InternalDescriptorState } from './types.js';

/** 表示一次可提交或回滚的 Descriptor 更新。 */
export interface DescriptorUpdateReceipt {
  /** 提交更新。 */
  commit(): void;
  /** 放弃更新。 */
  rollback(): void;
}

/** DescriptorHandle 调用 OverlayService 的内部控制接口。 */
export interface DescriptorHandleController<T> {
  /** Descriptor ID。 */
  readonly id: string;
  /** 判断句柄是否仍指向当前记录。 */
  isCurrent(): boolean;
  /** 读取当前 Descriptor 状态。 */
  state(): Readonly<InternalDescriptorState<T>>;
  /** 准备一次可提交或回滚的更新。 */
  prepareUpdate(patch: InternalDescriptorPatch<T>): DescriptorUpdateReceipt;
  /** 更新地图坐标。 */
  setPosition(position: Coordinate): void;
  /** 显示 Descriptor。 */
  show(): void;
  /** 隐藏 Descriptor。 */
  hide(): void;
  /** 执行 Descriptor 关闭行为。 */
  close(): void;
  /** 订阅 Descriptor 事件。 */
  on(type: 'click' | 'close', listener: (event: InternalDescriptorEvent<T>) => void): () => void;
  /** 销毁 Descriptor。 */
  destroy(): void;
}

/** 提供带过期检查的 Descriptor 操作句柄。 */
export class DescriptorHandle<T = unknown> {
  /** OverlayService 提供的控制器。 */
  readonly #controller: DescriptorHandleController<T>;
  /** 句柄是否已销毁。 */
  #destroyed = false;

  /** 创建 Descriptor 句柄。 */
  constructor(controller: DescriptorHandleController<T>) {
    this.#controller = controller;
  }

  /** 返回 Descriptor ID。 */
  get id(): string {
    return this.#controller.id;
  }

  /** 返回当前可见状态。 */
  get visible(): boolean {
    return this.#current().visible;
  }

  /** 立即提交 Descriptor 更新。 */
  update(patch: InternalDescriptorPatch<T>): void {
    this.stageUpdate(patch).commit();
  }

  /** 准备可由调用方提交或回滚的更新。 */
  stageUpdate(patch: InternalDescriptorPatch<T>): DescriptorUpdateReceipt {
    this.#assertCurrent();
    return this.#controller.prepareUpdate(patch);
  }

  /** 更新 Descriptor 地图坐标。 */
  setPosition(position: Coordinate): void {
    this.#assertCurrent();
    this.#controller.setPosition(position);
  }

  /** 显示 Descriptor。 */
  show(): void {
    this.#assertCurrent();
    this.#controller.show();
  }

  /** 隐藏 Descriptor。 */
  hide(): void {
    this.#assertCurrent();
    this.#controller.hide();
  }

  /** 执行配置的关闭行为。 */
  close(): void {
    this.#assertCurrent();
    this.#controller.close();
  }

  /** 订阅 Descriptor 事件。 */
  on(type: 'click' | 'close', listener: (event: InternalDescriptorEvent<T>) => void): () => void {
    this.#assertCurrent();
    return this.#controller.on(type, listener);
  }

  /** 销毁当前 Descriptor。 */
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

  /** 读取当前 Descriptor 状态。 */
  #current(): Readonly<InternalDescriptorState<T>> {
    this.#assertCurrent();
    return this.#controller.state();
  }

  /** 确保句柄仍指向有效记录。 */
  #assertCurrent(): void {
    if (this.#destroyed || !this.#controller.isCurrent()) throw new ObjectDisposedError(`Descriptor handle is stale: ${this.id}`);
  }
}
