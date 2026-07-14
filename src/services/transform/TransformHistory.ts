import type { ElementSnapshot } from '../../core/element/snapshot.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import { isNativeStyleRef } from '../../core/style/types.js';
import { cloneElementSnapshot } from '../../core/element/snapshot.js';
import type { TransformCommandMetadata } from './types.js';

interface TransformHistoryEntry<T> {
  readonly snapshot: ElementSnapshot<T>;
  readonly command: TransformCommandMetadata;
}

export class TransformHistory<T = unknown> {
  readonly #shapes: ShapeRegistry;
  readonly #limit: number;
  #entries: TransformHistoryEntry<T>[] = [];
  #index = -1;

  constructor(shapes: ShapeRegistry, limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new InvalidArgumentError('Transform historyLimit must be a positive safe integer');
    this.#shapes = shapes;
    this.#limit = limit;
  }

  get current(): ElementSnapshot<T> | undefined {
    const entry = this.#entries[this.#index];
    return entry === undefined ? undefined : this.#clone(entry.snapshot);
  }

  get canUndo(): boolean {
    return this.#index > 0;
  }

  get canRedo(): boolean {
    return this.#index >= 0 && this.#index < this.#entries.length - 1;
  }

  get undoCount(): number {
    return Math.max(0, this.#index);
  }

  get redoCount(): number {
    return Math.max(0, this.#entries.length - this.#index - 1);
  }

  reset(snapshot: ElementSnapshot<T>, command: TransformCommandMetadata = metadata('select')): void {
    this.#entries = [{ snapshot: this.#clone(snapshot), command }];
    this.#index = 0;
  }

  record(snapshot: ElementSnapshot<T>, command: TransformCommandMetadata): void {
    const current = this.#entries[this.#index];
    if (current !== undefined && sameValue(current.snapshot, snapshot)) return;
    this.#entries.splice(this.#index + 1);
    this.#entries.push({ snapshot: this.#clone(snapshot), command });
    if (this.#entries.length > this.#limit) this.#entries.shift();
    this.#index = this.#entries.length - 1;
  }

  undo(): ElementSnapshot<T> | undefined {
    if (!this.canUndo) return undefined;
    this.#index -= 1;
    return this.current;
  }

  redo(): ElementSnapshot<T> | undefined {
    if (!this.canRedo) return undefined;
    this.#index += 1;
    return this.current;
  }

  clear(): void {
    this.#entries = [];
    this.#index = -1;
  }

  #clone(snapshot: ElementSnapshot<T>): ElementSnapshot<T> {
    return cloneElementSnapshot(this.#shapes, snapshot);
  }
}

function sameValue(left: unknown, right: unknown, visited = new WeakMap<object, object>()): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (isNativeStyleRef(left) || isNativeStyleRef(right)) return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  if (visited.get(left) === right) return true;
  visited.set(left, right);
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key) => !rightKeys.includes(key))) return false;
  return leftKeys.every((key) => sameValue(Reflect.get(left, key), Reflect.get(right, key), visited));
}

export function metadata(operation: TransformCommandMetadata['operation']): TransformCommandMetadata {
  return Object.freeze({ operation, timestamp: Date.now() });
}
