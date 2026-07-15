import type { ElementStore } from '../../core/element/ElementStore.js';
import { compileSelector } from '../../core/element/selector.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate, Pixel } from '../../core/common/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { InputEventMap, InputType } from '../../core/ports/InputPort.js';
import type { InputRouter } from './InputRouter.js';
import type { RoutedEventMap, RoutedPointerEvent } from './types.js';

/** 内部事件订阅使用的选择范围与生命周期配置。 */
export interface InternalEventSubscriptionOptions {
  /** 元素选择范围。 */
  readonly selector?: ElementSelector;
  /** 用于生成元素选择范围的业务模块。 */
  readonly module?: string;
  /** 用于管理订阅的模块键。 */
  readonly moduleKey?: string;
  /** 是否只触发一次。 */
  readonly once?: boolean;
}

/** 订阅监听的范围类型。 */
type SubscriptionScope = 'global' | 'selector' | 'module';

/** 输入路由可分发的事件联合类型。 */
type RoutedEvent = RoutedEventMap[InputType];

/** 保存一个事件订阅及其悬停状态。 */
interface SubscriptionRecord {
  /** 订阅 ID。 */
  readonly id: number;
  /** 订阅的输入事件类型。 */
  readonly type: InputType;
  /** 用户监听函数。 */
  readonly listener: (event: RoutedEvent) => unknown;
  /** 订阅作用范围。 */
  readonly scope: SubscriptionScope;
  /** 编译后的元素匹配函数。 */
  readonly matches?: (state: Readonly<ElementState>) => boolean;
  /** 用于批量清理的模块键。 */
  readonly moduleKey?: string;
  /** 是否在首次触发后移除。 */
  readonly once: boolean;
  /** 当前悬停的元素状态。 */
  hover: Readonly<ElementState> | undefined;
  /** 用于识别悬停分发重入的修订号。 */
  hoverRevision: number;
}

/** 将底层输入事件转换为按元素和模块过滤的业务事件。 */
export class EventService {
  /** 统一输入路由器。 */
  readonly #router: InputRouter;
  /** 用于读取命中元素状态的仓库。 */
  readonly #store: ElementStore;
  /** 事件回调错误报告器。 */
  readonly #errorReporter: ErrorReporter;
  /** 按事件类型保存的订阅。 */
  readonly #records = new Map<InputType, Map<number, SubscriptionRecord>>();
  /** 已安装的路由订阅释放函数。 */
  readonly #routerDisposers = new Map<InputType, () => void>();
  /** 下一个订阅 ID。 */
  #nextId = 0;
  /** 服务是否已销毁。 */
  #disposed = false;
  /** 最近命中元素的版本化快照，避免连续移动时重复深复制。 */
  #cachedElement: Readonly<{ id: string; revision: unknown; state: Readonly<ElementState> }> | undefined;

  /** 创建事件服务。 */
  constructor(router: InputRouter, store: ElementStore, errorReporter: ErrorReporter = defaultErrorReporter) {
    if (typeof errorReporter !== 'function') throw new InvalidArgumentError('Error reporter must be a function');
    this.#router = router;
    this.#store = store;
    this.#errorReporter = errorReporter;
  }

  /** 注册一个按范围过滤的事件订阅。 */
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

  /** 注册只触发一次的事件订阅。 */
  once<T extends InputType>(type: T, listener: (event: RoutedEventMap[T]) => void, options: Omit<InternalEventSubscriptionOptions, 'once'> = {}): () => void {
    return this.on(type, listener, { ...options, once: true });
  }

  /** 判断全局或指定模块是否存在订阅。 */
  has(type: InputType, module?: string): boolean {
    this.#assertActive();
    const records = this.#records.get(type);
    if (records === undefined) return false;
    for (const record of records.values()) {
      if (module === undefined ? record.scope === 'global' : record.scope === 'module' && record.moduleKey === module) return true;
    }
    return false;
  }

  /** 清除指定模块的事件订阅。 */
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

  /** 销毁服务并释放全部路由订阅。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cachedElement = undefined;
    this.#records.clear();
    const disposers = [...this.#routerDisposers.values()];
    this.#routerDisposers.clear();
    runFinalizers(disposers);
  }

  /** 确保指定事件已连接到输入路由器。 */
  #installRouter<T extends InputType>(type: T): void {
    if (this.#routerDisposers.has(type)) return;
    this.#routerDisposers.set(
      type,
      this.#router.on(type, (event) => this.#dispatch(type, event))
    );
  }

  /** 按事件类型选择键盘或指针分发流程。 */
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
    const state = pointer.elementId === undefined ? undefined : this.#elementState(pointer.elementId);
    for (const id of ids) {
      const current = this.#records.get(type)?.get(id);
      if (current === undefined) continue;
      if (type === 'pointermove') this.#dispatchMove(current, pointer as InputEventMap['pointermove'], state);
      else this.#dispatchPointer(current, pointer, state);
    }
  }

  /** 向匹配普通指针条件的订阅分发事件。 */
  #dispatchPointer(record: SubscriptionRecord, event: InputEventMap[Exclude<InputType, 'keydown'>], state?: Readonly<ElementState>): void {
    if (record.scope !== 'global') {
      if (state === undefined) return;
      const matches = this.#tryMatches(record, state);
      if (matches !== true) return;
    }
    this.#invoke(record, routedPointer(event, state));
  }

  /** 计算并分发指针进入、移动和离开事件。 */
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

  /** 安全执行订阅的元素匹配函数。 */
  #tryMatches(record: SubscriptionRecord, state: Readonly<ElementState>): boolean | undefined {
    try {
      return record.matches?.(state) ?? true;
    } catch (error) {
      this.#report(error, 'predicate');
      return undefined;
    }
  }

  /** 调用监听器并隔离同步或异步错误。 */
  #invoke(record: SubscriptionRecord, event: RoutedEvent): void {
    if (!this.#records.get(record.type)?.has(record.id)) return;
    if (record.once) this.#remove(record.type, record.id);
    try {
      const result = record.listener(event);
      if (isPromiseLike(result)) void Promise.resolve(result).catch((error: unknown) => this.#report(error, 'listener'));
    } catch (error) {
      this.#report(error, 'listener');
    }
  }

  /** 按元素内容版本复用 Store 返回的冻结快照。 */
  #elementState(id: string): Readonly<ElementState> | undefined {
    const revision = this.#store.revisionOf(id);
    if (revision === undefined) {
      if (this.#cachedElement?.id === id) this.#cachedElement = undefined;
      return undefined;
    }
    if (this.#cachedElement?.id === id && this.#cachedElement.revision === revision) return this.#cachedElement.state;
    const state = this.#store.get(id);
    if (state === undefined) return undefined;
    this.#cachedElement = Object.freeze({ id, revision, state });
    return state;
  }

  /** 创建只能执行一次的订阅释放函数。 */
  #recordDisposer(type: InputType, id: number): () => void {
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#remove(type, id);
    };
  }

  /** 移除订阅，并在无监听器时释放底层路由。 */
  #remove(type: InputType, id: number): void {
    const records = this.#records.get(type);
    if (records === undefined || !records.delete(id)) return;
    if (records.size > 0) return;
    this.#records.delete(type);
    const dispose = this.#routerDisposers.get(type);
    this.#routerDisposers.delete(type);
    dispose?.();
  }

  /** 隔离并上报事件回调错误。 */
  #report(error: unknown, operation: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, { source: 'EventService', operation });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // 错误上报失败不能中断后续监听器。
    }
  }

  /** 确保事件服务仍可使用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('EventService has been destroyed');
  }
}

/** 将底层指针事件转换为冻结的内部事件。 */
function routedPointer(
  event: InputEventMap[Exclude<InputType, 'keydown'>],
  element?: Readonly<ElementState>,
  phase?: 'enter' | 'move' | 'leave'
): RoutedPointerEvent {
  return Object.freeze({
    type: event.type,
    coordinate: frozenCoordinate(event.coordinate),
    pixel: frozenPair(event.pixel),
    ...(element === undefined ? {} : { element }),
    nativeEventRef: event.nativeEventRef,
    ...(phase === undefined ? {} : { phase })
  });
}

/** 保留已冻结的坐标，只为不可信输入创建完整的二维或三维副本。 */
function frozenCoordinate(value: Coordinate): Coordinate {
  if (Object.isFrozen(value)) return value;
  return Object.freeze(value.length === 3 ? [value[0], value[1], value[2]] : [value[0], value[1]]) as Coordinate;
}

/** 保留已冻结的像素，只为不可信输入创建二维副本。 */
function frozenPair(value: Pixel): Pixel {
  return Object.isFrozen(value) ? value : (Object.freeze([value[0], value[1]]) as Pixel);
}

/** 判断回调结果是否需要异步拒绝处理。 */
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function';
}
