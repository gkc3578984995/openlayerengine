import type { TransformToolbarViewHandle } from '../core/ports/TransformToolbarPort.js';
import type { TransformToolbarHandle, TransformToolbarItemPatch, TransformToolbarOptionsPatch } from './transformTypes.js';

export class TransformToolbarHandleImpl implements TransformToolbarHandle {
  readonly #handle: TransformToolbarViewHandle;

  constructor(handle: TransformToolbarViewHandle) {
    this.#handle = handle;
  }

  setActive(key: string): void {
    this.#handle.setActive(key);
  }

  updateItem(key: string, patch: TransformToolbarItemPatch): void {
    this.#handle.updateItem(key, patch);
  }

  updateOptions(patch: TransformToolbarOptionsPatch): void {
    this.#handle.updateOptions(patch);
  }

  show(): void {
    this.#handle.show();
  }

  hide(): void {
    this.#handle.hide();
  }

  destroy(): void {
    this.#handle.destroy();
  }
}
