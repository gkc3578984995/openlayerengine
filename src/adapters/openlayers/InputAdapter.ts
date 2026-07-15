import type OLMap from 'ol/Map.js';
import { runFinalizers } from '../../core/common/dispose.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { HitTestPort } from '../../core/ports/HitTestPort.js';
import type { InputEventMap, InputPort, InputType, PointerInputType } from '../../core/ports/InputPort.js';
import type { NativeRefRegistry } from './NativeRefRegistry.js';

/** 统一保存各类输入事件监听器。 */
type InputListener = (event: InputEventMap[InputType]) => void;

/** 本适配器关心的 OpenLayers 指针事件字段。 */
interface OpenLayersInputEvent {
  /** 事件发生的地图坐标。 */
  readonly coordinate: readonly number[];
  /** 事件发生的屏幕像素。 */
  readonly pixel: readonly number[];
  /** 浏览器原始事件。 */
  readonly originalEvent: Event;
}

/** 输入适配器使用的地图事件能力。 */
interface EventedMap {
  /** 监听 OpenLayers 事件。 */
  on(type: string, listener: (event: OpenLayersInputEvent) => void): unknown;
  /** 移除 OpenLayers 事件。 */
  un(type: string, listener: (event: OpenLayersInputEvent) => void): void;
}

/** 支持的指针输入类型。 */
const pointerTypes: readonly PointerInputType[] = ['pointermove', 'click', 'leftdown', 'leftup', 'doubleclick', 'rightclick'];
/** 支持的全部输入类型。 */
const inputTypes: readonly InputType[] = [...pointerTypes, 'keydown'];

/** 将 OpenLayers 和 DOM 输入事件转换为统一事件。 */
export class InputAdapter implements InputPort {
  /** 输入事件所属的地图。 */
  readonly #map: OLMap;
  /** 为指针事件补充命中的元素。 */
  readonly #hitTest: HitTestPort;
  /** 临时保存浏览器原始事件引用。 */
  readonly #nativeRefs: NativeRefRegistry;
  /** 按类型保存业务监听器。 */
  readonly #listeners = new Map<InputType, InputListener>();
  /** 按类型保存原生事件清理函数。 */
  readonly #nativeDisposers = new Map<InputType, () => void>();
  /** 适配器是否已经销毁。 */
  #disposed = false;

  /** 保存地图、命中服务和原生引用注册表。 */
  constructor(map: OLMap, hitTest: HitTestPort, nativeRefs: NativeRefRegistry) {
    this.#map = map;
    this.#hitTest = hitTest;
    this.#nativeRefs = nativeRefs;
  }

  /** 为指定输入类型安装唯一监听器，并返回取消函数。 */
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

  /** 移除全部原生事件和业务监听器。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
    const disposers = [...this.#nativeDisposers.values()];
    this.#nativeDisposers.clear();
    runFinalizers(disposers);
  }

  /** 按输入类型安装对应的 OpenLayers 或 DOM 事件。 */
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
      const blockBrowserMenu = (event: Event) => event.preventDefault();
      const route = (event: Event) => this.#routeViewportPointer('rightclick', event);
      const captureOptions = Object.freeze({ capture: true });
      viewport.addEventListener('contextmenu', blockBrowserMenu, captureOptions);
      try {
        viewport.addEventListener('contextmenu', route);
      } catch (error) {
        try {
          runFinalizers([
            () => viewport.removeEventListener('contextmenu', route),
            () => viewport.removeEventListener('contextmenu', blockBrowserMenu, captureOptions)
          ]);
        } catch (rollbackError) {
          void rollbackError;
        }
        throw error;
      }
      return () =>
        runFinalizers([
          () => viewport.removeEventListener('contextmenu', route),
          () => viewport.removeEventListener('contextmenu', blockBrowserMenu, captureOptions)
        ]);
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

  /** 转换由 OpenLayers 提供坐标和像素的指针事件。 */
  #routeMapPointer(type: 'pointermove' | 'click' | 'doubleclick', event: OpenLayersInputEvent): void {
    this.#withNativeEvent(event.originalEvent, (nativeEventRef) => {
      const coordinate = safeCoordinate(() => event.coordinate);
      const pixel = safePixel(() => event.pixel);
      if (coordinate === undefined || pixel === undefined) return;
      const hit = this.#hitTest.atPixel(pixel);
      this.#listeners.get(type)?.(Object.freeze({ type, coordinate, pixel, ...(hit === undefined ? {} : { elementId: hit.elementId }), nativeEventRef }));
    });
  }

  /** 转换直接来自地图视口的指针事件。 */
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

  /** 转换键盘事件。 */
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

  /** 在事件派发期间临时注册浏览器原始事件。 */
  #withNativeEvent(event: Event, dispatch: (reference: InputEventMap[InputType]['nativeEventRef']) => void): void {
    const reference = this.#nativeRefs.registerTransient('input-event', event);
    try {
      dispatch(reference);
    } finally {
      this.#nativeRefs.releaseTransient('input-event', reference);
    }
  }

  /** 确认适配器仍可使用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('InputAdapter has been destroyed');
  }
}

/** 确认输入类型受当前适配器支持。 */
function assertInputType(value: unknown): asserts value is InputType {
  if (!inputTypes.includes(value as InputType)) throw new InvalidArgumentError('Unknown input type');
}

/** 安全读取并冻结地图坐标。 */
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

/** 安全读取并冻结屏幕像素。 */
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
