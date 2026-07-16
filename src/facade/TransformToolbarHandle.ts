import type { TransformToolbarViewHandle } from '../core/ports/TransformToolbarPort.js';
import type { TransformToolbarHandle, TransformToolbarItemPatch, TransformToolbarOptionsPatch } from './transformTypes.js';

/** 将内部工具栏视图句柄包装为公共控制句柄。 */
export class TransformToolbarHandleImpl implements TransformToolbarHandle {
  /** 实际控制工具栏视图的内部句柄。 */
  readonly #handle: TransformToolbarViewHandle;

  /** 绑定内部工具栏视图句柄。 */
  constructor(handle: TransformToolbarViewHandle) {
    this.#handle = handle;
  }

  /** 设置当前激活的工具栏项目。 */
  setActive(key: string): void {
    this.#handle.setActive(key);
  }

  /** 更新指定工具栏项目。 */
  updateItem(key: string, patch: TransformToolbarItemPatch): void {
    this.#handle.updateItem(key, patch);
  }

  /** 更新工具栏整体配置。 */
  updateOptions(patch: TransformToolbarOptionsPatch): void {
    this.#handle.updateOptions(patch);
  }

  /** 显示工具栏。 */
  show(): void {
    this.#handle.show();
  }

  /** 隐藏工具栏。 */
  hide(): void {
    this.#handle.hide();
  }

  /** 销毁工具栏视图。 */
  destroy(): void {
    this.#handle.destroy();
  }
}
