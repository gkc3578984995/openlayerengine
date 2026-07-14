import type { Coordinate } from '../../core/common/types.js';
import { ObjectDisposedError } from '../../core/errors.js';
import type { InternalDescriptorEvent, InternalDescriptorPatch, InternalDescriptorState } from './types.js';

export interface DescriptorUpdateReceipt {
  commit(): void;
  rollback(): void;
}

export interface DescriptorHandleController<T> {
  readonly id: string;
  isCurrent(): boolean;
  state(): Readonly<InternalDescriptorState<T>>;
  prepareUpdate(patch: InternalDescriptorPatch<T>): DescriptorUpdateReceipt;
  setPosition(position: Coordinate): void;
  show(): void;
  hide(): void;
  close(): void;
  on(type: 'click' | 'close', listener: (event: InternalDescriptorEvent<T>) => void): () => void;
  destroy(): void;
}

export class DescriptorHandle<T = unknown> {
  readonly #controller: DescriptorHandleController<T>;
  #destroyed = false;

  constructor(controller: DescriptorHandleController<T>) {
    this.#controller = controller;
  }

  get id(): string {
    return this.#controller.id;
  }

  get visible(): boolean {
    return this.#current().visible;
  }

  update(patch: InternalDescriptorPatch<T>): void {
    this.stageUpdate(patch).commit();
  }

  stageUpdate(patch: InternalDescriptorPatch<T>): DescriptorUpdateReceipt {
    this.#assertCurrent();
    return this.#controller.prepareUpdate(patch);
  }

  setPosition(position: Coordinate): void {
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

  close(): void {
    this.#assertCurrent();
    this.#controller.close();
  }

  on(type: 'click' | 'close', listener: (event: InternalDescriptorEvent<T>) => void): () => void {
    this.#assertCurrent();
    return this.#controller.on(type, listener);
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

  #current(): Readonly<InternalDescriptorState<T>> {
    this.#assertCurrent();
    return this.#controller.state();
  }

  #assertCurrent(): void {
    if (this.#destroyed || !this.#controller.isCurrent()) throw new ObjectDisposedError(`Descriptor handle is stale: ${this.id}`);
  }
}
