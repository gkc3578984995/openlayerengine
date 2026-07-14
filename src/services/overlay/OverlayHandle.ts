import type { Coordinate } from '../../core/common/types.js';
import { ObjectDisposedError } from '../../core/errors.js';
import type { CorePanIntoViewSpec } from '../../core/ports/OverlayPort.js';
import type { InternalOverlayPatch, InternalOverlayState } from './types.js';

export interface OverlayHandleController<T> {
  readonly id: string;
  isCurrent(): boolean;
  state(): Readonly<InternalOverlayState<T>>;
  prepareUpdate(patch: InternalOverlayPatch<T>): OverlayUpdateReceipt;
  setPosition(position: Coordinate | undefined): void;
  show(): void;
  hide(): void;
  panIntoView(options?: CorePanIntoViewSpec): void;
  destroy(): void;
}

export interface OverlayUpdateReceipt {
  commit(): void;
  rollback(): void;
}

export class OverlayHandle<T = unknown> {
  readonly #controller: OverlayHandleController<T>;
  #destroyed = false;

  constructor(controller: OverlayHandleController<T>) {
    this.#controller = controller;
  }

  get id(): string {
    return this.#controller.id;
  }

  get position(): Coordinate | undefined {
    return this.#current().position;
  }

  get visible(): boolean {
    return this.#current().visible;
  }

  get data(): Readonly<T> | undefined {
    return this.#current().data;
  }

  get module(): string | undefined {
    return this.#current().module;
  }

  update(patch: InternalOverlayPatch<T>): void {
    this.#assertCurrent();
    this.stageUpdate(patch).commit();
  }

  stageUpdate(patch: InternalOverlayPatch<T>): OverlayUpdateReceipt {
    this.#assertCurrent();
    return this.#controller.prepareUpdate(patch);
  }

  setPosition(position: Coordinate | undefined): void {
    this.#assertCurrent();
    this.#controller.setPosition(position);
  }

  show(): void {
    this.#assertCurrent();
    this.#controller.show();
  }

  hide(): void {
    this.#assertCurrent();
    this.#controller.hide();
  }

  panIntoView(options?: CorePanIntoViewSpec): void {
    this.#assertCurrent();
    this.#controller.panIntoView(options);
  }

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

  #current(): Readonly<InternalOverlayState<T>> {
    this.#assertCurrent();
    return this.#controller.state();
  }

  #assertCurrent(): void {
    if (this.#destroyed || !this.#controller.isCurrent()) throw new ObjectDisposedError(`Overlay handle is stale: ${this.id}`);
  }
}
