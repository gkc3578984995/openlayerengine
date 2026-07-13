import { InvalidArgumentError, ObjectDisposedError } from '../errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../ports/ErrorReporter.js';
import type { ShapeRegistry } from '../shape/ShapeRegistry.js';
import { abortElementTransaction, completeElementTransaction, ElementTransaction } from '../transaction/ElementTransaction.js';
import type { ElementChangeSet, TransactionResult } from '../transaction/types.js';
import { createElementSnapshot, type ElementSnapshot } from './snapshot.js';
import type { ElementCopyOptions, ElementPatch, ElementSelector, ElementState } from './types.js';

export interface ElementStoreOptions {
  readonly errorReporter?: ErrorReporter;
  readonly createId?: () => string;
}

type StoredElement = ElementSnapshot<unknown>;

export class ElementStore {
  readonly #shapeRegistry: ShapeRegistry;
  readonly #errorReporter: ErrorReporter;
  readonly #providedCreateId: (() => string) | undefined;
  readonly #listeners = new Map<number, (changes: ElementChangeSet) => void>();
  #states = new Map<string, StoredElement>();
  #nextListenerId = 0;
  #nextGeneratedId = 0;
  #disposed = false;
  #transactionActive = false;

  constructor(shapeRegistry: ShapeRegistry, options: ElementStoreOptions = {}) {
    this.#shapeRegistry = shapeRegistry;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    this.#providedCreateId = options.createId;
  }

  add<T>(input: ElementState<T>): Readonly<ElementState<T>> {
    return this.transaction((transaction) => transaction.add(input)).value;
  }

  get<T>(id: string): Readonly<ElementState<T>> | undefined {
    this.#assertActive();
    const state = this.#states.get(id);
    return state === undefined ? undefined : (createElementSnapshot(this.#shapeRegistry, state) as ElementSnapshot<T>);
  }

  query<T>(selector?: ElementSelector<T>): readonly Readonly<ElementState<T>>[] {
    this.#assertActive();
    const staged = new Map(this.#states);
    const transaction = new ElementTransaction(this.#shapeRegistry, staged, this.#createIdFor(staged));
    try {
      const result = transaction.query(selector);
      abortElementTransaction(transaction);
      return result;
    } catch (error) {
      abortElementTransaction(transaction);
      throw error;
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

  transaction<T>(work: (transaction: ElementTransaction) => T): TransactionResult<T> {
    this.#assertActive();
    if (this.#transactionActive) throw new InvalidArgumentError('Nested element transactions are not supported');
    if (typeof work !== 'function') throw new InvalidArgumentError('Element transaction work must be a function');

    this.#transactionActive = true;
    const staged = new Map(this.#states);
    const transaction = new ElementTransaction(this.#shapeRegistry, staged, this.#createIdFor(staged));
    try {
      const value = work(transaction);
      if (isThenable(value)) {
        consumeThenable(value);
        throw new InvalidArgumentError('Element transactions must be synchronous');
      }
      const changes = completeElementTransaction(transaction);
      this.#states = staged;
      this.#transactionActive = false;
      this.#notify(changes);
      return Object.freeze({ value, changes });
    } catch (error) {
      abortElementTransaction(transaction);
      this.#transactionActive = false;
      throw error;
    }
  }

  subscribe(listener: (changes: ElementChangeSet) => void): () => void {
    this.#assertActive();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Element listener must be a function');
    const subscriptionId = ++this.#nextListenerId;
    this.#listeners.set(subscriptionId, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(subscriptionId);
    };
  }

  destroy(): void {
    if (this.#disposed) return;
    if (this.#transactionActive) throw new InvalidArgumentError('Cannot destroy an ElementStore during a transaction');
    this.#disposed = true;
    this.#states.clear();
    this.#listeners.clear();
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('ElementStore has been destroyed');
  }

  #createIdFor(states: ReadonlyMap<string, StoredElement>): () => string {
    return this.#providedCreateId ?? (() => this.#nextAvailableId(states));
  }

  #nextAvailableId(states: ReadonlyMap<string, StoredElement>): string {
    let candidate: string;
    do candidate = `element-${++this.#nextGeneratedId}`;
    while (states.has(candidate));
    return candidate;
  }

  #notify(changes: ElementChangeSet): void {
    if (changes.changes.length === 0) return;
    for (const listener of [...this.#listeners.values()]) {
      try {
        const result = (listener as (notifiedChanges: ElementChangeSet) => unknown)(changes);
        void Promise.resolve(result).catch((error: unknown) => this.#report(error));
      } catch (error) {
        this.#report(error);
      }
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

function consumeThenable(value: unknown): void {
  try {
    void Promise.resolve(value).catch(() => undefined);
  } catch {
    // A hostile thenable is still rejected synchronously by transaction().
  }
}
