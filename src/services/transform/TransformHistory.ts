import type { ElementSnapshot } from '../../core/element/snapshot.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import { isNativeStyleRef } from '../../core/style/types.js';
import { cloneElementSnapshot } from '../../core/element/snapshot.js';
import type { TransformCommandMetadata } from './types.js';

/** 保存一次变换历史快照及其命令信息。 */
interface TransformHistoryEntry<T> {
  /** 元素快照。 */
  readonly snapshot: ElementSnapshot<T>;
  /** 产生快照的变换命令。 */
  readonly command: TransformCommandMetadata;
}

/** 仅管理 Transform Session 工作态的撤销与重做，不直接提交 Store。 */
export class TransformHistory<T = unknown> {
  /** 按 ShapeDefinition 规则克隆图形状态的注册表。 */
  readonly #shapes: ShapeRegistry;
  /** 最多保留的历史条数。 */
  readonly #limit: number;
  /** 按时间顺序保存的历史记录。 */
  #entries: TransformHistoryEntry<T>[] = [];
  /** 当前历史记录索引。 */
  #index = -1;

  /** 创建具有指定容量的历史管理器。 */
  constructor(shapes: ShapeRegistry, limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new InvalidArgumentError('Transform historyLimit must be a positive safe integer');
    this.#shapes = shapes;
    this.#limit = limit;
  }

  /** 返回当前快照的安全副本。 */
  get current(): ElementSnapshot<T> | undefined {
    const entry = this.#entries[this.#index];
    return entry === undefined ? undefined : this.#clone(entry.snapshot);
  }

  /** 当前是否可以撤销。 */
  get canUndo(): boolean {
    return this.#index > 0;
  }

  /** 当前是否可以重做。 */
  get canRedo(): boolean {
    return this.#index >= 0 && this.#index < this.#entries.length - 1;
  }

  /** 可撤销的步骤数。 */
  get undoCount(): number {
    return Math.max(0, this.#index);
  }

  /** 可重做的步骤数。 */
  get redoCount(): number {
    return Math.max(0, this.#entries.length - this.#index - 1);
  }

  /** 用起始快照重置历史。 */
  reset(snapshot: ElementSnapshot<T>, command: TransformCommandMetadata = metadata('select')): void {
    this.#entries = [{ snapshot: this.#clone(snapshot), command }];
    this.#index = 0;
  }

  /** 记录新的变换快照。 */
  record(snapshot: ElementSnapshot<T>, command: TransformCommandMetadata): void {
    const current = this.#entries[this.#index];
    if (current !== undefined && sameValue(current.snapshot, snapshot)) return;
    this.#entries.splice(this.#index + 1);
    this.#entries.push({ snapshot: this.#clone(snapshot), command });
    if (this.#entries.length > this.#limit) this.#entries.shift();
    this.#index = this.#entries.length - 1;
  }

  /** 回退一步并返回对应快照。 */
  undo(): ElementSnapshot<T> | undefined {
    if (!this.canUndo) return undefined;
    this.#index -= 1;
    return this.current;
  }

  /** 前进一步并返回对应快照。 */
  redo(): ElementSnapshot<T> | undefined {
    if (!this.canRedo) return undefined;
    this.#index += 1;
    return this.current;
  }

  /** 清空全部历史记录。 */
  clear(): void {
    this.#entries = [];
    this.#index = -1;
  }

  /** 按 ShapeDefinition 克隆快照，隔离历史记录与外部可变值。 */
  #clone(snapshot: ElementSnapshot<T>): ElementSnapshot<T> {
    return cloneElementSnapshot(this.#shapes, snapshot);
  }
}

/** 深度比较两个历史值是否一致。 */
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

/** 创建带时间戳的变换命令信息。 */
export function metadata(operation: TransformCommandMetadata['operation']): TransformCommandMetadata {
  return Object.freeze({ operation, timestamp: Date.now() });
}
