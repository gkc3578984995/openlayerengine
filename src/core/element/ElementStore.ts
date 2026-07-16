import { InvalidArgumentError, ObjectDisposedError } from '../errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../ports/ErrorReporter.js';
import type { ShapeRegistry } from '../shape/ShapeRegistry.js';
import { createElementTransactionScope, type ElementTransaction, type ElementTransactionScope } from '../transaction/ElementTransaction.js';
import type { ElementChangeSet, ElementGeneration, ElementRevision, TransactionResult } from '../transaction/types.js';
import { cloneElementSnapshot, type ElementSnapshot } from './snapshot.js';
import type { ElementCopyOptions, ElementPatch, ElementSelector, ElementState, ElementStateInput } from './types.js';

/** ElementStore 的内部配置。 */
export interface ElementStoreOptions {
  /** 接收监听器抛出的错误。 */
  readonly errorReporter?: ErrorReporter;
  /** 为未指定 ID 的 Element 分配唯一 ID。 */
  readonly createId?: () => string;
  /** 在事务提交前补充校验 Element 状态。 */
  readonly validateElement?: (state: Readonly<ElementState>) => void;
}

type StoredElement = ElementSnapshot<unknown>;
type SynchronousResult<T> = T extends PromiseLike<unknown> ? never : T;

/** 管理 Element 快照、事务和变更通知。 */
export class ElementStore {
  readonly #shapeRegistry: ShapeRegistry;
  readonly #errorReporter: ErrorReporter;
  readonly #providedCreateId: (() => string) | undefined;
  readonly #validateElement: ((state: Readonly<ElementState>) => void) | undefined;
  readonly #listeners = new Map<number, (changes: ElementChangeSet) => void>();
  readonly #notificationQueue: ElementChangeSet[] = [];
  readonly #states = new Map<string, StoredElement>();
  readonly #generations = new Map<string, ElementGeneration>();
  readonly #revisions = new Map<string, ElementRevision>();
  readonly #transactionScopes: ElementTransactionScope[] = [];
  #nextListenerId = 0;
  #nextGeneratedId = 0;
  #disposed = false;
  #transactionActive = false;
  #notifying = false;

  /** 创建与 ShapeRegistry 绑定的 ElementStore。 */
  constructor(shapeRegistry: ShapeRegistry, options: ElementStoreOptions = {}) {
    this.#shapeRegistry = shapeRegistry;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    this.#providedCreateId = options.createId;
    this.#validateElement = options.validateElement;
  }

  /** 添加 Element 并返回提交后的隔离快照。 */
  add<T>(input: ElementStateInput<T>): Readonly<ElementState<T>> {
    return this.transaction((transaction) => transaction.add(input)).value;
  }

  /** 按 ID 读取 Element 的隔离快照。 */
  get<T>(id: string): Readonly<ElementState<T>> | undefined {
    this.#assertActive();
    const state = this.#states.get(id);
    return state === undefined ? undefined : (cloneElementSnapshot(this.#shapeRegistry, state) as ElementSnapshot<T>);
  }

  /**
   * 直接解析 Store 内部已深冻结的 Element 快照，避免复制大体量几何。
   *
   * 该方法只供可信的内部服务热路径使用；公开读取仍必须通过 `get` 获得隔离副本。
   *
   * @param id Element ID。
   * @returns Element 存在时返回 Store 持有的只读快照，否则返回 `undefined`。
   * @internal
   */
  resolve<T>(id: string): Readonly<ElementState<T>> | undefined {
    this.#assertActive();
    return this.#states.get(id) as ElementSnapshot<T> | undefined;
  }

  /**
   * 读取 Element ID 当前实例生命周期的身份令牌。
   *
   * @param id Element ID。
   * @returns Element 存在时返回当前实例令牌，否则返回 `undefined`。
   * @internal
   */
  generationOf(id: string): ElementGeneration | undefined {
    this.#assertActive();
    return this.#generations.get(id);
  }

  /**
   * 判断 Element ID 是否仍代表指定实例生命周期。
   *
   * @param id Element ID。
   * @param generation 要比较的实例令牌。
   * @returns 令牌仍为当前实例时返回 `true`。
   * @internal
   */
  isGenerationCurrent(id: string, generation: ElementGeneration): boolean {
    this.#assertActive();
    return this.#generations.get(id) === generation;
  }

  /**
   * 读取 Element 当前已提交内容的版本令牌。
   *
   * @param id Element ID。
   * @returns Element 存在时返回当前版本令牌，否则返回 `undefined`。
   * @internal
   */
  revisionOf(id: string): ElementRevision | undefined {
    this.#assertActive();
    return this.#revisions.get(id);
  }

  /**
   * 判断 Element 是否仍保持指定的已提交内容版本。
   *
   * @param id Element ID。
   * @param revision 要比较的内容版本令牌。
   * @returns 版本令牌仍为当前值时返回 `true`。
   * @internal
   */
  isRevisionCurrent(id: string, revision: ElementRevision): boolean {
    this.#assertActive();
    return this.#revisions.get(id) === revision;
  }

  /**
   * 仅在 Element 仍属于指定实例生命周期时将其移除。
   *
   * @param id Element ID。
   * @param generation 允许移除的实例令牌。
   * @returns 实际移除指定实例时返回 `true`。
   * @internal
   */
  removeIfGeneration(id: string, generation: ElementGeneration): boolean {
    this.#assertActive();
    this.#assertSelectorReadOnly();
    if (this.#generations.get(id) !== generation) return false;
    return this.remove({ id }).changes.some((change) => change.kind === 'remove' && change.id === id);
  }

  /** 查询符合选择条件的 Element 快照。 */
  query<T>(selector?: ElementSelector<T>): readonly Readonly<ElementState<T>>[] {
    this.#assertActive();
    this.#assertSelectorReadOnly();
    const scope = createElementTransactionScope(
      this.#shapeRegistry,
      this.#states,
      this.#createIdFor(),
      () => this.#isSelectorEvaluationActive(),
      this.#validateElement
    );
    this.#transactionScopes.push(scope);
    try {
      return scope.transaction.query(selector);
    } finally {
      scope.abort();
      this.#transactionScopes.pop();
    }
  }

  /** 更新符合选择条件的 Element。 */
  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): ElementChangeSet {
    return this.transaction((transaction) => transaction.update(selector, patch)).changes;
  }

  /** 移除符合选择条件的 Element。 */
  remove(selector: ElementSelector): ElementChangeSet {
    return this.transaction((transaction) => transaction.remove(selector)).changes;
  }

  /** 隐藏符合选择条件的 Element。 */
  hide(selector: ElementSelector): ElementChangeSet {
    return this.transaction((transaction) => transaction.hide(selector)).changes;
  }

  /** 显示符合选择条件的 Element。 */
  show(selector: ElementSelector): ElementChangeSet {
    return this.transaction((transaction) => transaction.show(selector)).changes;
  }

  /** 复制指定 Element 并返回新副本的快照。 */
  copy<T>(id: string, overrides?: ElementCopyOptions<T>): Readonly<ElementState<T>> {
    return this.transaction((transaction) => transaction.copy(id, overrides)).value;
  }

  /** 清空 Store 中的全部 Element。 */
  clear(): ElementChangeSet {
    return this.transaction((transaction) => transaction.clear()).changes;
  }

  /** 在单个同步事务中提交一组 Element 操作。 */
  transaction<T>(work: (transaction: ElementTransaction) => SynchronousResult<T>): TransactionResult<T>;
  transaction<T>(work: (transaction: ElementTransaction) => T): TransactionResult<T> {
    this.#assertActive();
    this.#assertSelectorReadOnly();
    if (this.#transactionActive) throw new InvalidArgumentError('Nested element transactions are not supported');
    if (typeof work !== 'function') throw new InvalidArgumentError('Element transaction work must be a function');

    const scope = createElementTransactionScope(
      this.#shapeRegistry,
      this.#states,
      this.#createIdFor(),
      () => this.#isSelectorEvaluationActive(),
      this.#validateElement
    );
    this.#transactionActive = true;
    this.#transactionScopes.push(scope);
    let value!: T;
    let changes!: ElementChangeSet;
    try {
      value = work(scope.transaction);
      if (observeNativePromise(value) || isThenable(value)) throw new InvalidArgumentError('Element transactions must be synchronous');
      changes = scope.complete();
    } catch (error) {
      scope.abort();
      throw error;
    } finally {
      this.#transactionScopes.pop();
      this.#transactionActive = false;
    }
    this.#applyGenerationChanges(changes);
    this.#applyRevisionChanges(changes);
    const committedGenerations = new Map<string, ElementGeneration>();
    for (const change of changes.changes) {
      const generation = this.#generations.get(change.id);
      if (generation !== undefined) committedGenerations.set(change.id, generation);
    }
    const result = { value, changes } as TransactionResult<T>;
    Object.defineProperty(result, 'generation', {
      enumerable: false,
      value: (id: string) => committedGenerations.get(id)
    });
    Object.freeze(result);
    this.#notify(changes);
    return result;
  }

  /** 订阅 Element 变更并返回取消函数。 */
  subscribe(listener: (changes: ElementChangeSet) => void): () => void {
    this.#assertActive();
    this.#assertSelectorReadOnly();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Element listener must be a function');
    const subscriptionId = ++this.#nextListenerId;
    this.#listeners.set(subscriptionId, listener);
    let active = true;
    return () => {
      if (!active) return;
      this.#assertSelectorReadOnly();
      active = false;
      this.#listeners.delete(subscriptionId);
    };
  }

  /** 销毁 Store 并释放内部数据和监听器。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#assertSelectorReadOnly();
    if (this.#transactionActive) throw new InvalidArgumentError('Cannot destroy an ElementStore during a transaction');
    this.#disposed = true;
    this.#states.clear();
    this.#generations.clear();
    this.#revisions.clear();
    this.#listeners.clear();
    this.#notificationQueue.length = 0;
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('ElementStore has been destroyed');
  }

  #assertSelectorReadOnly(): void {
    if (this.#isSelectorEvaluationActive()) throw new InvalidArgumentError('Element selector predicates are read-only');
  }

  #isSelectorEvaluationActive(): boolean {
    return this.#transactionScopes.some((scope) => scope.isEvaluatingSelector());
  }

  #createIdFor(): (isOccupied: (id: string) => boolean) => string {
    const providedCreateId = this.#providedCreateId;
    return providedCreateId === undefined ? (isOccupied) => this.#nextAvailableId(isOccupied) : () => providedCreateId();
  }

  #nextAvailableId(isOccupied: (id: string) => boolean): string {
    let candidate: string;
    do candidate = `element-${++this.#nextGeneratedId}`;
    while (isOccupied(candidate));
    return candidate;
  }

  #applyGenerationChanges(changes: ElementChangeSet): void {
    for (const change of changes.changes) {
      if (change.kind === 'remove') {
        this.#generations.delete(change.id);
      } else if (change.kind === 'add' || !this.#generations.has(change.id)) {
        this.#generations.set(change.id, createElementGeneration());
      }
    }
  }

  #applyRevisionChanges(changes: ElementChangeSet): void {
    for (const change of changes.changes) {
      if (change.kind === 'remove') this.#revisions.delete(change.id);
      else this.#revisions.set(change.id, createElementRevision());
    }
  }

  #notify(changes: ElementChangeSet): void {
    if (changes.changes.length === 0 || this.#disposed) return;
    this.#notificationQueue.push(changes);
    if (this.#notifying) return;

    this.#notifying = true;
    try {
      while (!this.#disposed && this.#notificationQueue.length > 0) {
        const nextChanges = this.#notificationQueue.shift();
        if (nextChanges === undefined) continue;
        const subscriptionIds = [...this.#listeners.keys()];
        for (const subscriptionId of subscriptionIds) {
          if (this.#disposed) break;
          const listener = this.#listeners.get(subscriptionId);
          if (listener === undefined) continue;
          try {
            const result = (listener as (notifiedChanges: ElementChangeSet) => unknown)(nextChanges);
            void Promise.resolve(result).catch((error: unknown) => this.#report(error));
          } catch (error) {
            this.#report(error);
          }
        }
      }
    } finally {
      if (this.#disposed) this.#notificationQueue.length = 0;
      this.#notifying = false;
    }
  }

  #report(error: unknown): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'ElementStore',
        operation: 'notify'
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // 错误报告器自身失败时不能影响已经提交的事务。
    }
  }
}

function createElementGeneration(): ElementGeneration {
  return Object.freeze({}) as ElementGeneration;
}

function createElementRevision(): ElementRevision {
  return Object.freeze({}) as ElementRevision;
}

function isThenable(value: unknown): boolean {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false;
  try {
    return typeof (value as { then?: unknown }).then === 'function';
  } catch {
    return true;
  }
}

function observeNativePromise(value: unknown): boolean {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false;
  try {
    void Promise.prototype.then.call(value, undefined, () => undefined);
    return true;
  } catch {
    return false;
  }
}
