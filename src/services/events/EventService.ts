import type { ElementStore } from '../../core/element/ElementStore.js';
import { compileSelector } from '../../core/element/selector.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import { runFinalizers } from '../../core/common/dispose.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { InputEventMap, InputType } from '../../core/ports/InputPort.js';
import type { InputRouter } from './InputRouter.js';
import type { RoutedEventMap, RoutedPointerEvent } from './types.js';

export interface InternalEventSubscriptionOptions {
  readonly selector?: ElementSelector;
  readonly module?: string;
  readonly moduleKey?: string;
  readonly once?: boolean;
}

type SubscriptionScope = 'global' | 'selector' | 'module';

type RoutedEvent = RoutedEventMap[InputType];

interface SubscriptionRecord {
  readonly id: number;
  readonly type: InputType;
  readonly listener: (event: RoutedEvent) => unknown;
  readonly scope: SubscriptionScope;
  readonly matches?: (state: Readonly<ElementState>) => boolean;
  readonly moduleKey?: string;
  readonly once: boolean;
  hover: Readonly<ElementState> | undefined;
  hoverRevision: number;
}

export class EventService {
  readonly #router: InputRouter;
  readonly #store: ElementStore;
  readonly #errorReporter: ErrorReporter;
  readonly #records = new Map<InputType, Map<number, SubscriptionRecord>>();
  readonly #routerDisposers = new Map<InputType, () => void>();
  #nextId = 0;
  #disposed = false;

  constructor(router: InputRouter, store: ElementStore, errorReporter: ErrorReporter = defaultErrorReporter) {
    if (typeof errorReporter !== 'function') throw new InvalidArgumentError('Error reporter must be a function');
    this.#router = router;
    this.#store = store;
    this.#errorReporter = errorReporter;
  }

  on<T extends InputType>(type: T, listener: (event: RoutedEventMap[T]) => void, options: InternalEventSubscriptionOptions = {}): () => void {
    this.#assertActive();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Event listener must be a function');
    const moduleKey = options.moduleKey ?? options.module;
    if (type === 'keydown' && (options.selector !== undefined || moduleKey !== undefined)) {
      throw new InvalidArgumentError('keydown subscriptions must be Earth-global');
    }
    if (moduleKey !== undefined && (typeof moduleKey !== 'string' || moduleKey.trim().length === 0)) {
      throw new InvalidArgumentError('Event module must be a non-empty string');
    }
    const selector = options.selector ?? (options.module === undefined ? undefined : { module: options.module });
    if (options.moduleKey !== undefined && selector === undefined) throw new InvalidArgumentError('Module subscriptions require an internal selector');

    const scope: SubscriptionScope = moduleKey !== undefined ? 'module' : selector === undefined ? 'global' : 'selector';
    const matches = selector === undefined ? undefined : compileSelector(selector);
    const id = ++this.#nextId;
    const record: SubscriptionRecord = {
      id,
      type,
      listener: listener as unknown as (event: RoutedEvent) => unknown,
      scope,
      ...(matches === undefined ? {} : { matches }),
      ...(moduleKey === undefined ? {} : { moduleKey }),
      once: options.once === true,
      hover: undefined,
      hoverRevision: 0
    };
    let records = this.#records.get(type);
    if (records === undefined) {
      records = new Map();
      this.#records.set(type, records);
    }
    records.set(id, record);
    try {
      this.#installRouter(type);
    } catch (error) {
      records.delete(id);
      if (records.size === 0) this.#records.delete(type);
      throw error;
    }
    return this.#recordDisposer(type, id);
  }

  once<T extends InputType>(type: T, listener: (event: RoutedEventMap[T]) => void, options: Omit<InternalEventSubscriptionOptions, 'once'> = {}): () => void {
    return this.on(type, listener, { ...options, once: true });
  }

  has(type: InputType, module?: string): boolean {
    this.#assertActive();
    const records = this.#records.get(type);
    if (records === undefined) return false;
    for (const record of records.values()) {
      if (module === undefined ? record.scope === 'global' : record.scope === 'module' && record.moduleKey === module) return true;
    }
    return false;
  }

  clearModule(module: string, type?: InputType): void {
    this.#assertActive();
    if (typeof module !== 'string' || module.trim().length === 0) throw new InvalidArgumentError('Event module must be a non-empty string');
    const types = type === undefined ? [...this.#records.keys()] : [type];
    const removals: Array<() => void> = [];
    for (const currentType of types) {
      const records = this.#records.get(currentType);
      if (records === undefined) continue;
      for (const [id, record] of [...records]) {
        if (record.scope === 'module' && record.moduleKey === module) removals.push(() => this.#remove(currentType, id));
      }
    }
    runFinalizers(removals);
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#records.clear();
    const disposers = [...this.#routerDisposers.values()];
    this.#routerDisposers.clear();
    runFinalizers(disposers);
  }

  #installRouter<T extends InputType>(type: T): void {
    if (this.#routerDisposers.has(type)) return;
    this.#routerDisposers.set(
      type,
      this.#router.on(type, (event) => this.#dispatch(type, event))
    );
  }

  #dispatch<T extends InputType>(type: T, event: InputEventMap[T]): void {
    const records = this.#records.get(type);
    if (records === undefined) return;
    const ids = [...records.keys()];
    if (type === 'keydown') {
      for (const id of ids) {
        const current = this.#records.get(type)?.get(id);
        if (current !== undefined) this.#invoke(current, Object.freeze({ ...event }) as unknown as RoutedEvent);
      }
      return;
    }

    const pointer = event as InputEventMap[Exclude<InputType, 'keydown'>];
    const state = pointer.elementId === undefined ? undefined : this.#store.get(pointer.elementId);
    for (const id of ids) {
      const current = this.#records.get(type)?.get(id);
      if (current === undefined) continue;
      if (type === 'pointermove') this.#dispatchMove(current, pointer as InputEventMap['pointermove'], state);
      else this.#dispatchPointer(current, pointer, state);
    }
  }

  #dispatchPointer(record: SubscriptionRecord, event: InputEventMap[Exclude<InputType, 'keydown'>], state?: Readonly<ElementState>): void {
    if (record.scope !== 'global') {
      if (state === undefined) return;
      const matches = this.#tryMatches(record, state);
      if (matches !== true) return;
    }
    this.#invoke(record, routedPointer(event, state));
  }

  #dispatchMove(record: SubscriptionRecord, event: InputEventMap['pointermove'], state?: Readonly<ElementState>): void {
    const revision = ++record.hoverRevision;
    if (record.scope === 'global') {
      this.#invoke(record, routedPointer(event, state, 'move'));
      return;
    }

    let matches = false;
    if (state !== undefined) {
      const result = this.#tryMatches(record, state);
      if (result === undefined) return;
      matches = result;
    }
    if (record.hoverRevision !== revision || !this.#records.get(record.type)?.has(record.id)) return;
    const previous = record.hover;
    if (!matches) {
      if (previous === undefined) return;
      record.hover = undefined;
      this.#invoke(record, routedPointer(event, previous, 'leave'));
      return;
    }
    if (state === undefined) return;
    if (previous === undefined) {
      record.hover = state;
      this.#invoke(record, routedPointer(event, state, 'enter'));
      return;
    }
    if (previous.id === state.id) {
      record.hover = state;
      this.#invoke(record, routedPointer(event, state, 'move'));
      return;
    }
    record.hover = undefined;
    this.#invoke(record, routedPointer(event, previous, 'leave'));
    if (record.hoverRevision !== revision || !this.#records.get(record.type)?.has(record.id)) return;
    record.hover = state;
    this.#invoke(record, routedPointer(event, state, 'enter'));
  }

  #tryMatches(record: SubscriptionRecord, state: Readonly<ElementState>): boolean | undefined {
    try {
      return record.matches?.(state) ?? true;
    } catch (error) {
      this.#report(error, 'predicate');
      return undefined;
    }
  }

  #invoke(record: SubscriptionRecord, event: RoutedEvent): void {
    if (!this.#records.get(record.type)?.has(record.id)) return;
    if (record.once) this.#remove(record.type, record.id);
    try {
      const result = record.listener(event);
      void Promise.resolve(result).catch((error: unknown) => this.#report(error, 'listener'));
    } catch (error) {
      this.#report(error, 'listener');
    }
  }

  #recordDisposer(type: InputType, id: number): () => void {
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#remove(type, id);
    };
  }

  #remove(type: InputType, id: number): void {
    const records = this.#records.get(type);
    if (records === undefined || !records.delete(id)) return;
    if (records.size > 0) return;
    this.#records.delete(type);
    const dispose = this.#routerDisposers.get(type);
    this.#routerDisposers.delete(type);
    dispose?.();
  }

  #report(error: unknown, operation: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, { source: 'EventService', operation });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // Reporting failures must not interrupt later listeners.
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('EventService has been destroyed');
  }
}

function routedPointer(
  event: InputEventMap[Exclude<InputType, 'keydown'>],
  element?: Readonly<ElementState>,
  phase?: 'enter' | 'move' | 'leave'
): RoutedPointerEvent {
  return Object.freeze({
    type: event.type,
    coordinate: Object.freeze([...event.coordinate]) as RoutedPointerEvent['coordinate'],
    pixel: Object.freeze([...event.pixel]) as RoutedPointerEvent['pixel'],
    ...(element === undefined ? {} : { element }),
    nativeEventRef: event.nativeEventRef,
    ...(phase === undefined ? {} : { phase })
  });
}
