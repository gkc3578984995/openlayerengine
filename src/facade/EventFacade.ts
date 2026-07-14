import type { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import type { Coordinate, Pixel } from '../core/common/types.js';
import { runFinalizers } from '../core/common/dispose.js';
import type { ElementSelector } from '../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';
import type { PointerInputType } from '../core/ports/InputPort.js';
import type { RoutedEventMap } from '../services/events/types.js';
import type { Element } from './Element.js';
import type { Layer } from './Layer.js';
import type { ElementService, LayerService } from './types.js';

export type EarthEventType = 'pointermove' | 'click' | 'leftdown' | 'leftup' | 'doubleclick' | 'rightclick' | 'keydown';

export type EarthPointerEvent<T extends Exclude<EarthEventType, 'keydown'> = Exclude<EarthEventType, 'keydown'>> = {
  readonly type: T;
  readonly coordinate: Coordinate;
  readonly pixel: Pixel;
  readonly element?: Element;
  readonly module?: string;
  readonly layer?: Layer;
  readonly olFeature?: Element['olFeature'];
  readonly originalEvent: Event;
} & (T extends 'pointermove' ? { readonly phase?: 'enter' | 'move' | 'leave' } : {});

export interface EarthKeyboardEvent {
  readonly type: 'keydown';
  readonly key: string;
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly originalEvent: KeyboardEvent;
}

export interface EarthEventMap {
  readonly pointermove: EarthPointerEvent<'pointermove'>;
  readonly click: EarthPointerEvent<'click'>;
  readonly leftdown: EarthPointerEvent<'leftdown'>;
  readonly leftup: EarthPointerEvent<'leftup'>;
  readonly doubleclick: EarthPointerEvent<'doubleclick'>;
  readonly rightclick: EarthPointerEvent<'rightclick'>;
  readonly keydown: EarthKeyboardEvent;
}

export type EventSubscriptionOptions =
  | { readonly signal?: AbortSignal; readonly selector?: ElementSelector; readonly module?: never }
  | { readonly signal?: AbortSignal; readonly module: string; readonly selector?: never };

export interface EventService {
  on<T extends EarthEventType>(
    type: T,
    listener: (event: EarthEventMap[T]) => void,
    options?: 'keydown' extends T
      ? Pick<EventSubscriptionOptions, 'signal'> & Readonly<Partial<Record<'selector' | 'module', never>>>
      : EventSubscriptionOptions
  ): () => void;
  once<T extends EarthEventType>(
    type: T,
    listener: (event: EarthEventMap[T]) => void,
    options?: 'keydown' extends T
      ? Pick<EventSubscriptionOptions, 'signal'> & Readonly<Partial<Record<'selector' | 'module', never>>>
      : EventSubscriptionOptions
  ): () => void;
  has(type: EarthEventType, module?: string): boolean;
  clearModule(module: string, type?: EarthEventType): void;
}

interface InternalEventService {
  on<T extends EarthEventType>(
    type: T,
    listener: (event: RoutedEventMap[T]) => void,
    options?: { readonly selector?: ElementSelector; readonly module?: string }
  ): () => void;
  once<T extends EarthEventType>(
    type: T,
    listener: (event: RoutedEventMap[T]) => void,
    options?: { readonly selector?: ElementSelector; readonly module?: string }
  ): () => void;
  has(type: EarthEventType, module?: string): boolean;
  clearModule(module: string, type?: EarthEventType): void;
  destroy(): void;
}

interface PublicSubscription {
  readonly type: EarthEventType;
  readonly module?: string;
  readonly dispose: () => void;
}

export class EventFacade implements EventService {
  readonly #service: InternalEventService;
  readonly #elements: ElementService;
  readonly #layers: LayerService;
  readonly #nativeRefs: NativeRefRegistry;
  readonly #subscriptions = new Map<number, PublicSubscription>();
  #nextId = 0;
  #disposed = false;

  constructor(service: InternalEventService, elements: ElementService, layers: LayerService, nativeRefs: NativeRefRegistry) {
    this.#service = service;
    this.#elements = elements;
    this.#layers = layers;
    this.#nativeRefs = nativeRefs;
  }

  on<T extends EarthEventType>(
    type: T,
    listener: (event: EarthEventMap[T]) => void,
    options?: 'keydown' extends T
      ? Pick<EventSubscriptionOptions, 'signal'> & Readonly<Partial<Record<'selector' | 'module', never>>>
      : EventSubscriptionOptions
  ): () => void {
    return this.#register(type, listener, options, false);
  }

  once<T extends EarthEventType>(
    type: T,
    listener: (event: EarthEventMap[T]) => void,
    options?: 'keydown' extends T
      ? Pick<EventSubscriptionOptions, 'signal'> & Readonly<Partial<Record<'selector' | 'module', never>>>
      : EventSubscriptionOptions
  ): () => void {
    return this.#register(type, listener, options, true);
  }

  has(type: EarthEventType, module?: string): boolean {
    this.#assertActive();
    return this.#service.has(type, module);
  }

  clearModule(module: string, type?: EarthEventType): void {
    this.#assertActive();
    const finalizers: (() => void)[] = [];
    for (const subscription of [...this.#subscriptions.values()]) {
      if (subscription.module === module && (type === undefined || subscription.type === type)) finalizers.push(subscription.dispose);
    }
    finalizers.push(() => this.#service.clearModule(module, type));
    runFinalizers(finalizers);
  }

  /** @internal Earth lifecycle hook. */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const finalizers = [...this.#subscriptions.values()].map(({ dispose }) => dispose);
    this.#subscriptions.clear();
    finalizers.push(() => this.#service.destroy());
    runFinalizers(finalizers);
  }

  #register<T extends EarthEventType>(
    type: T,
    listener: (event: EarthEventMap[T]) => void,
    options:
      | ('keydown' extends T ? Pick<EventSubscriptionOptions, 'signal'> & Readonly<Partial<Record<'selector' | 'module', never>>> : EventSubscriptionOptions)
      | undefined,
    once: boolean
  ): () => void {
    this.#assertActive();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Event listener must be a function');
    const inspected = inspectOptions(type, options);
    if (inspected.signal?.aborted === true) return () => undefined;

    const id = ++this.#nextId;
    let active = true;
    let internalDispose: () => void = () => undefined;
    let abortInstalled = false;
    const abort = (): void => dispose();
    const dispose = (): void => {
      if (!active) return;
      active = false;
      this.#subscriptions.delete(id);
      runFinalizers([
        () => {
          if (abortInstalled) inspected.signal?.removeEventListener('abort', abort);
        },
        () => internalDispose()
      ]);
    };
    const callback = (event: RoutedEventMap[T]): unknown => {
      if (!active) return undefined;
      if (once) dispose();
      return (listener as (event: EarthEventMap[T]) => unknown)(this.#toPublic(type, event));
    };
    const internalOptions = {
      ...(inspected.selector === undefined ? {} : { selector: inspected.selector }),
      ...(inspected.module === undefined ? {} : { module: inspected.module })
    };
    internalDispose = once
      ? this.#service.once(type, callback as (event: RoutedEventMap[T]) => void, internalOptions)
      : this.#service.on(type, callback as (event: RoutedEventMap[T]) => void, internalOptions);
    this.#subscriptions.set(id, {
      type,
      ...(inspected.module === undefined ? {} : { module: inspected.module }),
      dispose
    });
    try {
      if (inspected.signal !== undefined) {
        inspected.signal.addEventListener('abort', abort, { once: true });
        abortInstalled = true;
        if (inspected.signal.aborted) dispose();
      }
    } catch (error) {
      dispose();
      throw error;
    }
    return dispose;
  }

  #toPublic<T extends EarthEventType>(type: T, event: RoutedEventMap[T]): EarthEventMap[T] {
    if (type === 'keydown') {
      const keyboard = event as RoutedEventMap['keydown'];
      return Object.freeze({
        type: 'keydown',
        key: keyboard.key,
        code: keyboard.code,
        altKey: keyboard.altKey,
        ctrlKey: keyboard.ctrlKey,
        metaKey: keyboard.metaKey,
        shiftKey: keyboard.shiftKey,
        originalEvent: this.#nativeRefs.requireTransient<KeyboardEvent>('input-event', keyboard.nativeEventRef)
      }) as EarthEventMap[T];
    }

    const pointer = event as RoutedEventMap[PointerInputType];
    const element = pointer.element === undefined ? undefined : this.#elements.get(pointer.element.id);
    const layer = pointer.element === undefined ? undefined : this.#layers.get(pointer.element.layerId);
    return Object.freeze({
      type: pointer.type,
      coordinate: Object.freeze([...pointer.coordinate]) as Coordinate,
      pixel: Object.freeze([...pointer.pixel]) as Pixel,
      ...(element === undefined ? {} : { element, olFeature: element.olFeature }),
      ...(pointer.element?.module === undefined ? {} : { module: pointer.element.module }),
      ...(layer === undefined ? {} : { layer }),
      ...(pointer.type === 'pointermove' && pointer.phase !== undefined ? { phase: pointer.phase } : {}),
      originalEvent: this.#nativeRefs.requireTransient<Event>('input-event', pointer.nativeEventRef)
    }) as EarthEventMap[T];
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('EventFacade has been destroyed');
  }
}

interface InspectedOptions {
  readonly signal?: AbortSignal;
  readonly selector?: ElementSelector;
  readonly module?: string;
}

function inspectOptions<T extends EarthEventType>(
  type: T,
  options:
    | ('keydown' extends T ? Pick<EventSubscriptionOptions, 'signal'> & Readonly<Partial<Record<'selector' | 'module', never>>> : EventSubscriptionOptions)
    | undefined
): InspectedOptions {
  if (options === undefined) return {};
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new InvalidArgumentError('Event options must be an object');
  const record = options as EventSubscriptionOptions;
  if (record.selector !== undefined && record.module !== undefined) throw new InvalidArgumentError('Event options cannot contain both selector and module');
  if (type === 'keydown' && (record.selector !== undefined || record.module !== undefined)) {
    throw new InvalidArgumentError('keydown subscriptions must be Earth-global');
  }
  if (record.module !== undefined && (typeof record.module !== 'string' || record.module.trim().length === 0)) {
    throw new InvalidArgumentError('Event module must be a non-empty string');
  }
  return {
    ...(record.signal === undefined ? {} : { signal: record.signal }),
    ...(record.module === undefined
      ? record.selector === undefined
        ? {}
        : { selector: record.selector }
      : { selector: { module: record.module }, module: record.module })
  };
}
