import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { InputEventMap, InputPort, InputType } from '../../core/ports/InputPort.js';

export type ContextMenuArbiter = (event: InputEventMap['rightclick']) => 'consume' | 'pass';

interface ListenerRecord {
  readonly id: number;
  readonly listener: (event: InputEventMap[InputType]) => void;
}

export class InputRouter {
  readonly #port: InputPort;
  readonly #listeners = new Map<InputType, Map<number, ListenerRecord>>();
  readonly #portDisposers = new Map<InputType, () => void>();
  #nextListenerId = 0;
  #contextMenuArbiter: ContextMenuArbiter | undefined;
  #disposed = false;

  constructor(port: InputPort) {
    this.#port = port;
    this.#install('rightclick');
  }

  on<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
    this.#assertActive();
    assertInputType(type);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Input listener must be a function');
    let records = this.#listeners.get(type);
    if (records === undefined) {
      records = new Map();
      this.#listeners.set(type, records);
    }
    const id = ++this.#nextListenerId;
    records.set(id, { id, listener: listener as (event: InputEventMap[InputType]) => void });
    try {
      this.#install(type);
    } catch (error) {
      records.delete(id);
      if (records.size === 0) this.#listeners.delete(type);
      throw error;
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.#listeners.get(type);
      current?.delete(id);
      if (current?.size === 0) {
        this.#listeners.delete(type);
        if (type !== 'rightclick') this.#uninstall(type);
      }
    };
  }

  setContextMenuArbiter(arbiter: ContextMenuArbiter): () => void {
    this.#assertActive();
    if (typeof arbiter !== 'function') throw new InvalidArgumentError('Context-menu arbiter must be a function');
    if (this.#contextMenuArbiter !== undefined) throw new InvalidArgumentError('A context-menu arbiter is already registered');
    this.#contextMenuArbiter = arbiter;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.#contextMenuArbiter === arbiter) this.#contextMenuArbiter = undefined;
    };
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
    this.#contextMenuArbiter = undefined;
    const disposers = [...this.#portDisposers.values()];
    this.#portDisposers.clear();
    runFinalizers(disposers);
  }

  #install(type: InputType): void {
    if (this.#portDisposers.has(type)) return;
    const dispose = this.#port.listen(type, (event) => this.#dispatch(type, event));
    if (typeof dispose !== 'function') throw new InvalidArgumentError('Input port must return a disposer');
    this.#portDisposers.set(type, once(dispose));
  }

  #uninstall(type: InputType): void {
    const dispose = this.#portDisposers.get(type);
    if (dispose === undefined) return;
    this.#portDisposers.delete(type);
    dispose();
  }

  #dispatch<T extends InputType>(type: T, event: InputEventMap[T]): void {
    if (this.#disposed) return;
    const ids = [...(this.#listeners.get(type)?.keys() ?? [])];
    if (type === 'rightclick' && this.#contextMenuArbiter?.(event as InputEventMap['rightclick']) === 'consume') return;
    for (const id of ids) {
      const current = this.#listeners.get(type)?.get(id);
      if (current !== undefined) current.listener(event);
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('InputRouter has been destroyed');
  }
}

function assertInputType(value: unknown): asserts value is InputType {
  if (!['pointermove', 'click', 'leftdown', 'leftup', 'doubleclick', 'rightclick', 'keydown'].includes(value as string)) {
    throw new InvalidArgumentError('Unknown input type');
  }
}

function once(dispose: () => void): () => void {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    dispose();
  };
}
