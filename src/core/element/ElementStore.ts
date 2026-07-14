import { InvalidArgumentError, ObjectDisposedError } from '../errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../ports/ErrorReporter.js';
import type { ShapeRegistry } from '../shape/ShapeRegistry.js';
import { createElementTransactionScope, type ElementTransaction, type ElementTransactionScope } from '../transaction/ElementTransaction.js';
import type { ElementChangeSet, TransactionResult } from '../transaction/types.js';
import { cloneElementSnapshot, type ElementSnapshot } from './snapshot.js';
import type { ElementCopyOptions, ElementPatch, ElementSelector, ElementState } from './types.js';

export interface ElementStoreOptions {
  readonly errorReporter?: ErrorReporter;
  readonly createId?: () => string;
  readonly validateElement?: (state: Readonly<ElementState>) => void;
}

type StoredElement = ElementSnapshot<unknown>;
type SynchronousResult<T> = T extends PromiseLike<unknown> ? never : T;

export class ElementStore {
  readonly #shapeRegistry: ShapeRegistry;
  readonly #errorReporter: ErrorReporter;
  readonly #providedCreateId: (() => string) | undefined;
  readonly #validateElement: ((state: Readonly<ElementState>) => void) | undefined;
  readonly #listeners = new Map<number, (changes: ElementChangeSet) => void>();
  readonly #notificationQueue: ElementChangeSet[] = [];
  readonly #states = new Map<string, StoredElement>();
  readonly #transactionScopes: ElementTransactionScope[] = [];
  #nextListenerId = 0;
  #nextGeneratedId = 0;
  #disposed = false;
  #transactionActive = false;
  #notifying = false;

  constructor(shapeRegistry: ShapeRegistry, options: ElementStoreOptions = {}) {
    this.#shapeRegistry = shapeRegistry;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    this.#providedCreateId = options.createId;
    this.#validateElement = options.validateElement;
  }

  add<T>(input: ElementState<T>): Readonly<ElementState<T>> {
    return this.transaction((transaction) => transaction.add(input)).value;
  }

  get<T>(id: string): Readonly<ElementState<T>> | undefined {
    this.#assertActive();
    const state = this.#states.get(id);
    return state === undefined ? undefined : (cloneElementSnapshot(this.#shapeRegistry, state) as ElementSnapshot<T>);
  }

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

  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): ElementChangeSet {
    return this.transaction((transaction) => transaction.update(selector, patch)).changes;
  }

  remove(selector: ElementSelector): ElementChangeSet {
    return this.transaction((transaction) => transaction.remove(selector)).changes;
  }

  hide(selector: ElementSelector): ElementChangeSet {
    return this.transaction((transaction) => transaction.hide(selector)).changes;
  }

  show(selector: ElementSelector): ElementChangeSet {
    return this.transaction((transaction) => transaction.show(selector)).changes;
  }

  copy<T>(id: string, overrides?: ElementCopyOptions<T>): Readonly<ElementState<T>> {
    return this.transaction((transaction) => transaction.copy(id, overrides)).value;
  }

  clear(): ElementChangeSet {
    return this.transaction((transaction) => transaction.clear()).changes;
  }

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
    this.#notify(changes);
    return Object.freeze({ value, changes });
  }

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

  destroy(): void {
    if (this.#disposed) return;
    this.#assertSelectorReadOnly();
    if (this.#transactionActive) throw new InvalidArgumentError('Cannot destroy an ElementStore during a transaction');
    this.#disposed = true;
    this.#states.clear();
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
      // Error reporting must not affect a transaction that has already committed.
    }
  }
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
