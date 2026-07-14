import type OLMap from 'ol/Map.js';
import { runFinalizers } from '../../core/common/dispose.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { HitTestPort } from '../../core/ports/HitTestPort.js';
import type { InputEventMap, InputPort, InputType, PointerInputType } from '../../core/ports/InputPort.js';
import type { NativeRefRegistry } from './NativeRefRegistry.js';

type InputListener = (event: InputEventMap[InputType]) => void;

interface OpenLayersInputEvent {
  readonly coordinate: readonly number[];
  readonly pixel: readonly number[];
  readonly originalEvent: Event;
}

interface EventedMap {
  on(type: string, listener: (event: OpenLayersInputEvent) => void): unknown;
  un(type: string, listener: (event: OpenLayersInputEvent) => void): void;
}

const pointerTypes: readonly PointerInputType[] = ['pointermove', 'click', 'leftdown', 'leftup', 'doubleclick', 'rightclick'];
const inputTypes: readonly InputType[] = [...pointerTypes, 'keydown'];

export class InputAdapter implements InputPort {
  readonly #map: OLMap;
  readonly #hitTest: HitTestPort;
  readonly #nativeRefs: NativeRefRegistry;
  readonly #listeners = new Map<InputType, InputListener>();
  readonly #nativeDisposers = new Map<InputType, () => void>();
  #disposed = false;

  constructor(map: OLMap, hitTest: HitTestPort, nativeRefs: NativeRefRegistry) {
    this.#map = map;
    this.#hitTest = hitTest;
    this.#nativeRefs = nativeRefs;
  }

  listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
    this.#assertActive();
    assertInputType(type);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Input listener must be a function');
    if (this.#listeners.has(type)) throw new InvalidArgumentError(`Input listener already installed: ${type}`);
    this.#listeners.set(type, listener as InputListener);
    try {
      this.#nativeDisposers.set(type, this.#install(type));
    } catch (error) {
      this.#listeners.delete(type);
      throw error;
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(type);
      const dispose = this.#nativeDisposers.get(type);
      this.#nativeDisposers.delete(type);
      dispose?.();
    };
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
    const disposers = [...this.#nativeDisposers.values()];
    this.#nativeDisposers.clear();
    runFinalizers(disposers);
  }

  #install(type: InputType): () => void {
    if (type === 'pointermove' || type === 'click' || type === 'doubleclick') {
      const nativeType = type === 'doubleclick' ? 'dblclick' : type;
      const listener = (event: OpenLayersInputEvent) => this.#routeMapPointer(type, event);
      const map = this.#map as unknown as EventedMap;
      map.on(nativeType, listener);
      return () => map.un(nativeType, listener);
    }

    const viewport = this.#map.getViewport();
    if (type === 'leftdown' || type === 'leftup') {
      const nativeType = type === 'leftdown' ? 'pointerdown' : 'pointerup';
      const listener = (event: Event) => {
        if ((event as PointerEvent).button !== 0) return;
        this.#routeViewportPointer(type, event);
      };
      viewport.addEventListener(nativeType, listener);
      return () => viewport.removeEventListener(nativeType, listener);
    }
    if (type === 'rightclick') {
      const listener = (event: Event) => {
        event.preventDefault();
        this.#routeViewportPointer('rightclick', event);
      };
      viewport.addEventListener('contextmenu', listener);
      return () => viewport.removeEventListener('contextmenu', listener);
    }

    const keyboardTarget = this.#map.getTargetElement() ?? viewport;
    const listener = (event: Event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.repeat === true) return;
      this.#routeKeyboard(keyboard);
    };
    keyboardTarget.addEventListener('keydown', listener);
    return () => keyboardTarget.removeEventListener('keydown', listener);
  }

  #routeMapPointer(type: 'pointermove' | 'click' | 'doubleclick', event: OpenLayersInputEvent): void {
    this.#withNativeEvent(event.originalEvent, (nativeEventRef) => {
      const coordinate = safeCoordinate(() => event.coordinate);
      const pixel = safePixel(() => event.pixel);
      if (coordinate === undefined || pixel === undefined) return;
      const hit = this.#hitTest.atPixel(pixel);
      this.#listeners.get(type)?.(Object.freeze({ type, coordinate, pixel, ...(hit === undefined ? {} : { elementId: hit.elementId }), nativeEventRef }));
    });
  }

  #routeViewportPointer(type: 'leftdown' | 'leftup' | 'rightclick', event: Event): void {
    this.#withNativeEvent(event, (nativeEventRef) => {
      const pixel = safePixel(() => this.#map.getEventPixel(event as UIEvent));
      if (pixel === undefined) return;
      const coordinate = safeCoordinate(() => this.#map.getCoordinateFromPixel([...pixel]));
      if (coordinate === undefined) return;
      const hit = this.#hitTest.atPixel(pixel);
      this.#listeners.get(type)?.(Object.freeze({ type, coordinate, pixel, ...(hit === undefined ? {} : { elementId: hit.elementId }), nativeEventRef }));
    });
  }

  #routeKeyboard(event: KeyboardEvent): void {
    this.#withNativeEvent(event, (nativeEventRef) => {
      this.#listeners.get('keydown')?.(
        Object.freeze({
          type: 'keydown',
          key: typeof event.key === 'string' ? event.key : '',
          code: typeof event.code === 'string' ? event.code : '',
          altKey: event.altKey === true,
          ctrlKey: event.ctrlKey === true,
          metaKey: event.metaKey === true,
          shiftKey: event.shiftKey === true,
          nativeEventRef
        })
      );
    });
  }

  #withNativeEvent(event: Event, dispatch: (reference: InputEventMap[InputType]['nativeEventRef']) => void): void {
    const reference = this.#nativeRefs.registerTransient('input-event', event);
    try {
      dispatch(reference);
    } finally {
      this.#nativeRefs.releaseTransient('input-event', reference);
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('InputAdapter has been destroyed');
  }
}

function assertInputType(value: unknown): asserts value is InputType {
  if (!inputTypes.includes(value as InputType)) throw new InvalidArgumentError('Unknown input type');
}

function safeCoordinate(read: () => unknown): InputEventMap['click']['coordinate'] | undefined {
  let value: unknown;
  try {
    value = read();
  } catch {
    return undefined;
  }
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3) || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    return undefined;
  }
  return Object.freeze([...value]) as InputEventMap['click']['coordinate'];
}

function safePixel(read: () => unknown): InputEventMap['click']['pixel'] | undefined {
  let value: unknown;
  try {
    value = read();
  } catch {
    return undefined;
  }
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) return undefined;
  return Object.freeze([...value]) as InputEventMap['click']['pixel'];
}
