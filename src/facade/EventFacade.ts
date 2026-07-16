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

/** Earth 对外提供的事件名称。 */
export type EarthEventType = 'pointermove' | 'click' | 'leftdown' | 'leftup' | 'doubleclick' | 'rightclick' | 'keydown';

/**
 * Earth 指针事件的公开载荷。
 *
 * @typeParam T 当前指针事件的名称类型。
 */
export type EarthPointerEvent<T extends Exclude<EarthEventType, 'keydown'> = Exclude<EarthEventType, 'keydown'>> = {
  /** 本次指针事件的名称。 */
  readonly type: T;
  /** 事件位置的地图坐标快照。 */
  readonly coordinate: Coordinate;
  /** 事件位置相对地图视口的屏幕坐标。 */
  readonly pixel: Pixel;
  /** 命中受管理 Element 时提供的实时句柄。 */
  readonly element?: Element;
  /** 命中 Element 携带的业务模块标识。 */
  readonly module?: string;
  /** 命中 Element 所属的图层句柄。 */
  readonly layer?: Layer;
  /** 命中 Element 对应的 OpenLayers Feature。 */
  readonly olFeature?: Element['olFeature'];
  /** 只在当前同步回调期间有效的原始浏览器事件。 */
  readonly originalEvent: Event;
} & (T extends 'pointermove'
  ? {
      /** 指针进入、移动或离开同一 Element 的阶段。 */
      readonly phase?: 'enter' | 'move' | 'leave';
    }
  : {});

/** Earth 键盘事件的公开载荷。 */
export interface EarthKeyboardEvent {
  /** 固定为 `keydown`。 */
  readonly type: 'keydown';
  /** 浏览器事件的 `key`。 */
  readonly key: string;
  /** 浏览器事件的 `code`。 */
  readonly code: string;
  /** Alt 修饰键是否按下。 */
  readonly altKey: boolean;
  /** Ctrl 修饰键是否按下。 */
  readonly ctrlKey: boolean;
  /** Meta 修饰键是否按下。 */
  readonly metaKey: boolean;
  /** Shift 修饰键是否按下。 */
  readonly shiftKey: boolean;
  /** 只在当前同步回调期间有效的 KeyboardEvent。 */
  readonly originalEvent: KeyboardEvent;
}

/** Earth 事件名称与公开载荷的映射。 */
export interface EarthEventMap {
  /** 带进入、移动、离开阶段的指针移动事件。 */
  readonly pointermove: EarthPointerEvent<'pointermove'>;
  /** 地图单击事件。 */
  readonly click: EarthPointerEvent<'click'>;
  /** 鼠标主按钮按下事件。 */
  readonly leftdown: EarthPointerEvent<'leftdown'>;
  /** 鼠标主按钮抬起事件。 */
  readonly leftup: EarthPointerEvent<'leftup'>;
  /** 地图双击事件。 */
  readonly doubleclick: EarthPointerEvent<'doubleclick'>;
  /** 地图右键事件。 */
  readonly rightclick: EarthPointerEvent<'rightclick'>;
  /** Earth 全局键盘事件。 */
  readonly keydown: EarthKeyboardEvent;
}

/** 事件订阅的过滤和生命周期配置。 */
export type EventSubscriptionOptions =
  | {
      /** 中止信号。触发后自动取消本次订阅。 */
      readonly signal?: AbortSignal;
      /** 只接收命中匹配 Element 的指针事件。 */
      readonly selector?: ElementSelector;
      /** 使用 Element 选择器时不得同时指定业务模块。 */
      readonly module?: never;
    }
  | {
      /** 中止信号。触发后自动取消本次订阅。 */
      readonly signal?: AbortSignal;
      /** 只接收命中该业务模块中 Element 的指针事件。 */
      readonly module: string;
      /** 使用业务模块过滤时不得同时指定 Element 选择器。 */
      readonly selector?: never;
    };

/** 订阅 Earth 指针和键盘事件的公开服务。 */
export interface EventService {
  /**
   * 持续订阅一种 Earth 事件。
   *
   * @typeParam T 要订阅的事件名称类型。
   * @param type 公共事件名称。
   * @param listener 接收对应公共载荷的监听函数。
   * @param options 可选的中止信号和指针事件过滤条件。
   * @returns 用于取消本次订阅的幂等函数。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const off = earth.events.on('click', ({ coordinate }) => console.log(coordinate));
   * off();
   * ```
   */
  on<T extends EarthEventType>(
    type: T,
    listener: (event: EarthEventMap[T]) => void,
    options?: 'keydown' extends T
      ? Pick<EventSubscriptionOptions, 'signal'> & Readonly<Partial<Record<'selector' | 'module', never>>>
      : EventSubscriptionOptions
  ): () => void;
  /**
   * 订阅一种 Earth 事件并在首次触发后自动取消。
   *
   * @typeParam T 要订阅的事件名称类型。
   * @param type 只订阅一次的公共事件名称。
   * @param listener 接收对应公共载荷的监听函数。
   * @param options 可选的中止信号和指针事件过滤条件。
   * @returns 用于提前取消本次订阅的幂等函数。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.events.once('rightclick', ({ pixel }) => console.log(pixel));
   * ```
   */
  once<T extends EarthEventType>(
    type: T,
    listener: (event: EarthEventMap[T]) => void,
    options?: 'keydown' extends T
      ? Pick<EventSubscriptionOptions, 'signal'> & Readonly<Partial<Record<'selector' | 'module', never>>>
      : EventSubscriptionOptions
  ): () => void;
  /**
   * 判断指定事件是否存在订阅。
   *
   * @param type 要检查的公共事件名称。
   * @param module 传入时只检查该业务模块；省略时只检查全局订阅，不含选择器或模块订阅。
   * @returns 存在匹配订阅时返回 `true`，否则返回 `false`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const subscribed = earth.events.has('click', 'planning');
   * ```
   */
  has(type: EarthEventType, module?: string): boolean;
  /**
   * 清除指定业务模块的事件订阅。
   *
   * @param module 要清理订阅的业务模块。
   * @param type 事件名称；省略时清理该模块的全部事件。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.events.clearModule('planning', 'click');
   * ```
   */
  clearModule(module: string, type?: EarthEventType): void;
}

/** 公共 Facade 依赖的最小内部事件契约。 */
interface InternalEventService {
  /** 注册一个持续生效的内部事件监听。 */
  on<T extends EarthEventType>(
    type: T,
    listener: (event: RoutedEventMap[T]) => void,
    options?: { readonly selector?: ElementSelector; readonly module?: string }
  ): () => void;
  /** 注册一个仅触发一次的内部事件监听。 */
  once<T extends EarthEventType>(
    type: T,
    listener: (event: RoutedEventMap[T]) => void,
    options?: { readonly selector?: ElementSelector; readonly module?: string }
  ): () => void;
  /** 判断内部服务是否存在匹配订阅。 */
  has(type: EarthEventType, module?: string): boolean;
  /** 清理指定模块的内部订阅。 */
  clearModule(module: string, type?: EarthEventType): void;
  /** 销毁内部事件服务。 */
  destroy(): void;
}

/** 公共订阅在 Facade 内的资源记录。 */
interface PublicSubscription {
  /** 订阅对应的事件名称。 */
  readonly type: EarthEventType;
  /** 订阅关联的业务模块。 */
  readonly module?: string;
  /** 同时释放公共与内部订阅资源。 */
  readonly dispose: () => void;
}

/** 将内部路由事件转换为公共 Earth 事件。 */
export class EventFacade implements EventService {
  /** 处理实际事件路由和订阅的内部服务。 */
  readonly #service: InternalEventService;
  /** 将内部 Element 状态还原为公共句柄。 */
  readonly #elements: ElementService;
  /** 将内部图层 ID 还原为公共句柄。 */
  readonly #layers: LayerService;
  /** 解析只在同步回调期间有效的浏览器事件引用。 */
  readonly #nativeRefs: NativeRefRegistry;
  /** 公共注销函数及其业务模块归属。 */
  readonly #subscriptions = new Map<number, PublicSubscription>();
  /** 为公共订阅生成稳定本地 ID 的序号。 */
  #nextId = 0;
  /** 销毁状态。阻止销毁后的继续访问。 */
  #disposed = false;

  /** 绑定当前 Earth 的事件、Element、图层和原生引用服务。 */
  constructor(service: InternalEventService, elements: ElementService, layers: LayerService, nativeRefs: NativeRefRegistry) {
    this.#service = service;
    this.#elements = elements;
    this.#layers = layers;
    this.#nativeRefs = nativeRefs;
  }

  /**
   * 持续订阅一种 Earth 事件。
   *
   * @typeParam T 要订阅的事件名称类型。
   * @param type 公共事件名称。
   * @param listener 接收对应公共载荷的监听函数。
   * @param options 可选的中止信号和指针事件过滤条件。
   * @returns 用于取消本次订阅的幂等函数。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const off = earth.events.on('pointermove', ({ phase }) => console.log(phase));
   * off();
   * ```
   */
  on<T extends EarthEventType>(
    type: T,
    listener: (event: EarthEventMap[T]) => void,
    options?: 'keydown' extends T
      ? Pick<EventSubscriptionOptions, 'signal'> & Readonly<Partial<Record<'selector' | 'module', never>>>
      : EventSubscriptionOptions
  ): () => void {
    return this.#register(type, listener, options, false);
  }

  /**
   * 订阅一种 Earth 事件并在首次触发后自动取消。
   *
   * @typeParam T 要订阅的事件名称类型。
   * @param type 只订阅一次的公共事件名称。
   * @param listener 接收对应公共载荷的监听函数。
   * @param options 可选的中止信号和指针事件过滤条件。
   * @returns 用于提前取消本次订阅的幂等函数。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.events.once('keydown', ({ key }) => console.log(key));
   * ```
   */
  once<T extends EarthEventType>(
    type: T,
    listener: (event: EarthEventMap[T]) => void,
    options?: 'keydown' extends T
      ? Pick<EventSubscriptionOptions, 'signal'> & Readonly<Partial<Record<'selector' | 'module', never>>>
      : EventSubscriptionOptions
  ): () => void {
    return this.#register(type, listener, options, true);
  }

  /**
   * 判断指定事件是否存在订阅。
   *
   * @param type 要检查的公共事件名称。
   * @param module 传入时只检查该业务模块的订阅。
   * @returns 存在匹配订阅时返回 `true`，否则返回 `false`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const subscribed = earth.events.has('rightclick');
   * ```
   */
  has(type: EarthEventType, module?: string): boolean {
    this.#assertActive();
    return this.#service.has(type, module);
  }

  /**
   * 清除指定业务模块的事件订阅。
   *
   * @param module 要清理订阅的业务模块。
   * @param type 事件名称；省略时清理该模块的全部事件。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.events.clearModule('planning');
   * ```
   */
  clearModule(module: string, type?: EarthEventType): void {
    this.#assertActive();
    const finalizers: (() => void)[] = [];
    for (const subscription of [...this.#subscriptions.values()]) {
      if (subscription.module === module && (type === undefined || subscription.type === type)) finalizers.push(subscription.dispose);
    }
    finalizers.push(() => this.#service.clearModule(module, type));
    runFinalizers(finalizers);
  }

  /** @internal 销毁 Facade，并释放当前 Earth 的全部事件订阅。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const finalizers = [...this.#subscriptions.values()].map(({ dispose }) => dispose);
    this.#subscriptions.clear();
    finalizers.push(() => this.#service.destroy());
    runFinalizers(finalizers);
  }

  /** 注册公共监听，并协调内部订阅、中止信号和幂等清理。 */
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

  /** 将内部事件快照转换为只暴露公共句柄的载荷。 */
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
      coordinate: pointer.coordinate as Coordinate,
      pixel: pointer.pixel as Pixel,
      ...(element === undefined ? {} : { element, olFeature: element.olFeature }),
      ...(pointer.element?.module === undefined ? {} : { module: pointer.element.module }),
      ...(layer === undefined ? {} : { layer }),
      ...(pointer.type === 'pointermove' && pointer.phase !== undefined ? { phase: pointer.phase } : {}),
      originalEvent: this.#nativeRefs.requireTransient<Event>('input-event', pointer.nativeEventRef)
    }) as EarthEventMap[T];
  }

  /** 拒绝销毁后的 Facade 调用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('EventFacade has been destroyed');
  }
}

/** 已完成校验和规范化的订阅选项。 */
interface InspectedOptions {
  /** 自动注销订阅的中止信号。 */
  readonly signal?: AbortSignal;
  /** 内部指针事件使用的 Element 选择器。 */
  readonly selector?: ElementSelector;
  /** 批量检查和清理订阅时使用的业务模块。 */
  readonly module?: string;
}

/** 校验公共订阅选项，并转换业务模块过滤条件。 */
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
