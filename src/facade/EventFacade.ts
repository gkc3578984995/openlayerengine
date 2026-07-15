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
 * @typeParam T 指针事件类型。表示指针事件名称的类型。
 */
export type EarthPointerEvent<T extends Exclude<EarthEventType, 'keydown'> = Exclude<EarthEventType, 'keydown'>> = {
  /** 事件类型。表示本次指针事件的名称。 */
  readonly type: T;
  /** 地图坐标。提供事件发生位置的坐标快照。 */
  readonly coordinate: Coordinate;
  /** 屏幕像素。提供事件相对地图视口的像素位置。 */
  readonly pixel: Pixel;
  /** 命中元素。命中受管理元素时提供其实时句柄。 */
  readonly element?: Element;
  /** 业务模块。命中元素带有模块标识时提供该值。 */
  readonly module?: string;
  /** 命中图层。命中受管理元素时提供所属图层句柄。 */
  readonly layer?: Layer;
  /** 原生要素。命中元素时提供对应的 OpenLayers Feature。 */
  readonly olFeature?: Element['olFeature'];
  /** 原始事件。提供当前同步回调期间有效的浏览器事件。 */
  readonly originalEvent: Event;
} & (T extends 'pointermove'
  ? {
      /** 指针阶段。表示指针进入、移动或离开同一元素。 */
      readonly phase?: 'enter' | 'move' | 'leave';
    }
  : {});

/** Earth 键盘事件的公开载荷。 */
export interface EarthKeyboardEvent {
  /** 事件类型。固定为 `keydown`。 */
  readonly type: 'keydown';
  /** 按键值。提供浏览器事件的 `key`。 */
  readonly key: string;
  /** 按键代码。提供浏览器事件的 `code`。 */
  readonly code: string;
  /** Alt 状态。表示 Alt 修饰键是否按下。 */
  readonly altKey: boolean;
  /** Ctrl 状态。表示 Ctrl 修饰键是否按下。 */
  readonly ctrlKey: boolean;
  /** Meta 状态。表示 Meta 修饰键是否按下。 */
  readonly metaKey: boolean;
  /** Shift 状态。表示 Shift 修饰键是否按下。 */
  readonly shiftKey: boolean;
  /** 原始事件。提供当前同步回调期间有效的 KeyboardEvent。 */
  readonly originalEvent: KeyboardEvent;
}

/** Earth 事件名称与公开载荷的映射。 */
export interface EarthEventMap {
  /** 指针移动事件。映射到带阶段信息的指针载荷。 */
  readonly pointermove: EarthPointerEvent<'pointermove'>;
  /** 单击事件。映射到地图单击的指针载荷。 */
  readonly click: EarthPointerEvent<'click'>;
  /** 左键按下事件。映射到鼠标主按钮按下的指针载荷。 */
  readonly leftdown: EarthPointerEvent<'leftdown'>;
  /** 左键抬起事件。映射到鼠标主按钮抬起的指针载荷。 */
  readonly leftup: EarthPointerEvent<'leftup'>;
  /** 双击事件。映射到地图双击的指针载荷。 */
  readonly doubleclick: EarthPointerEvent<'doubleclick'>;
  /** 右键事件。映射到地图右键的指针载荷。 */
  readonly rightclick: EarthPointerEvent<'rightclick'>;
  /** 键盘事件。映射到 Earth 全局的键盘载荷。 */
  readonly keydown: EarthKeyboardEvent;
}

/** 事件订阅的过滤和生命周期配置。 */
export type EventSubscriptionOptions =
  | {
      /** 中止信号。触发后自动取消本次订阅。 */
      readonly signal?: AbortSignal;
      /** 元素选择器。仅接收命中匹配元素的指针事件。 */
      readonly selector?: ElementSelector;
      /** 业务模块。使用选择器过滤时禁止同时指定模块。 */
      readonly module?: never;
    }
  | {
      /** 中止信号。触发后自动取消本次订阅。 */
      readonly signal?: AbortSignal;
      /** 业务模块。仅接收命中该模块元素的指针事件。 */
      readonly module: string;
      /** 元素选择器。使用模块过滤时禁止同时指定选择器。 */
      readonly selector?: never;
    };

/** Earth 事件订阅能力的公开入口。 */
export interface EventService {
  /**
   * 持续订阅一种 Earth 事件。
   *
   * @typeParam T 事件类型。表示订阅事件名称的类型。
   * @param type 事件名称。指定要订阅的公开事件。
   * @param listener 监听函数。接收对应的公开事件载荷。
   * @param options 订阅配置。指定可选的中止信号和指针事件过滤条件。
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
   * @typeParam T 事件类型。表示订阅事件名称的类型。
   * @param type 事件名称。指定只订阅一次的公开事件。
   * @param listener 监听函数。接收对应的公开事件载荷。
   * @param options 订阅配置。指定可选的中止信号和指针事件过滤条件。
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
   * @param type 事件名称。指定要检查的公开事件。
   * @param module 模块标识。传入时只检查该模块；省略时只检查全局订阅，不包含选择器或模块订阅。
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
   * @param module 模块标识。指定要清理订阅的业务模块。
   * @param type 事件名称。省略时清理该模块的全部事件。
   * @returns 无返回值。
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

/** 内部事件服务提供给公开门面的最小契约。 */
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

/** 公开订阅在门面中的跟踪记录。 */
interface PublicSubscription {
  /** 事件类型。记录订阅对应的事件名称。 */
  readonly type: EarthEventType;
  /** 业务模块。记录订阅关联的可选模块。 */
  readonly module?: string;
  /** 清理函数。释放公开与内部订阅资源。 */
  readonly dispose: () => void;
}

/** 将内部路由事件转换为公开 Earth 事件的门面。 */
export class EventFacade implements EventService {
  /** 内部服务。负责实际事件路由和订阅。 */
  readonly #service: InternalEventService;
  /** 元素服务。用于把内部元素状态还原为公开句柄。 */
  readonly #elements: ElementService;
  /** 图层服务。用于把内部图层 ID 还原为公开句柄。 */
  readonly #layers: LayerService;
  /** 原生引用表。用于解析仅在同步回调期间有效的浏览器事件。 */
  readonly #nativeRefs: NativeRefRegistry;
  /** 订阅记录。保存公开注销函数及其模块归属。 */
  readonly #subscriptions = new Map<number, PublicSubscription>();
  /** 订阅序号。为公开订阅生成稳定的本地 ID。 */
  #nextId = 0;
  /** 销毁状态。阻止销毁后的继续访问。 */
  #disposed = false;

  /** 创建事件门面并绑定 Earth 范围内的服务。 */
  constructor(service: InternalEventService, elements: ElementService, layers: LayerService, nativeRefs: NativeRefRegistry) {
    this.#service = service;
    this.#elements = elements;
    this.#layers = layers;
    this.#nativeRefs = nativeRefs;
  }

  /**
   * 持续订阅一种 Earth 事件。
   *
   * @typeParam T 事件类型。表示订阅事件名称的类型。
   * @param type 事件名称。指定要订阅的公开事件。
   * @param listener 监听函数。接收对应的公开事件载荷。
   * @param options 订阅配置。指定可选的中止信号和指针事件过滤条件。
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
   * @typeParam T 事件类型。表示订阅事件名称的类型。
   * @param type 事件名称。指定只订阅一次的公开事件。
   * @param listener 监听函数。接收对应的公开事件载荷。
   * @param options 订阅配置。指定可选的中止信号和指针事件过滤条件。
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
   * @param type 事件名称。指定要检查的公开事件。
   * @param module 模块标识。传入时仅检查该业务模块的订阅。
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
   * @param module 模块标识。指定要清理订阅的业务模块。
   * @param type 事件名称。省略时清理该模块的全部事件。
   * @returns 无返回值。
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

  /** @internal 销毁门面并释放 Earth 生命周期内的全部事件订阅。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const finalizers = [...this.#subscriptions.values()].map(({ dispose }) => dispose);
    this.#subscriptions.clear();
    finalizers.push(() => this.#service.destroy());
    runFinalizers(finalizers);
  }

  /** 注册公开监听并协调内部订阅、中止信号和幂等清理。 */
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

  /** 将内部事件快照转换为仅暴露公开句柄的事件载荷。 */
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

  /** 确保门面仍可使用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('EventFacade has been destroyed');
  }
}

/** 已完成校验和规范化的订阅选项。 */
interface InspectedOptions {
  /** 中止信号。用于自动注销订阅。 */
  readonly signal?: AbortSignal;
  /** 元素选择器。用于内部指针事件过滤。 */
  readonly selector?: ElementSelector;
  /** 业务模块。用于批量检查和清理订阅。 */
  readonly module?: string;
}

/** 校验公开订阅选项并转换模块过滤条件。 */
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
