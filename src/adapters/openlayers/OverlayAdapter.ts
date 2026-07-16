import type OlMap from 'ol/Map.js';
import Overlay, { type PanIntoViewOptions } from 'ol/Overlay.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate, Pixel } from '../../core/common/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { NativeRef } from '../../core/native/types.js';
import type {
  CoreOverlayOwnership,
  CorePanIntoViewSpec,
  DescriptorPortAction,
  OverlayDragEvent,
  OverlayPort,
  OverlayRenderState,
  PixelBounds
} from '../../core/ports/OverlayPort.js';
import type { NativeRefRegistry } from './NativeRefRegistry.js';

/** 描述牌动作监听及其 DOM 绑定。 */
interface ActionSubscription {
  readonly listener: (action: DescriptorPortAction) => void;
  bindingDisposer: () => void;
}

/** 覆盖物拖拽监听及其 DOM 绑定。 */
interface DragSubscription {
  readonly listener: (event: OverlayDragEvent) => void;
  bindingDisposer: () => void;
}

/** 单个已挂载覆盖物的原生状态和事件绑定。 */
interface OverlayAdapterRecord {
  state: Readonly<OverlayRenderState>;
  readonly overlay: Overlay;
  mounted: boolean;
  /** `false` 表示上次补偿后无法确认地图集合中的真实挂载状态。 */
  mountStateKnown: boolean;
  element: HTMLElement;
  action: ActionSubscription | undefined;
  drag: DragSubscription | undefined;
}

/** 将 Core Overlay 状态映射到 OpenLayers Overlay 与 DOM 事件。 */
export class OverlayAdapter implements OverlayPort {
  readonly #map: OlMap;
  readonly #refs: NativeRefRegistry;
  readonly #records = new Map<string, OverlayAdapterRecord>();
  readonly #layoutDisposers = new Set<() => void>();
  #layoutViewportBounds: DOMRect | undefined;
  #disposed = false;

  constructor(map: OlMap, refs: NativeRefRegistry) {
    this.#map = map;
    this.#refs = refs;
  }

  /** 创建 Overlay；仅可见状态会立即挂到地图。 */
  attach(state: Readonly<OverlayRenderState>): void {
    this.#assertActive();
    if (this.#records.has(state.id)) throw new InvalidArgumentError(`Overlay adapter id already exists: ${state.id}`);
    const element = this.#resolveElement(state.elementRef);
    const overlay = new Overlay({
      id: state.id,
      element,
      offset: [...state.offset],
      positioning: state.positioning,
      stopEvent: state.stopEvent,
      insertFirst: state.insertFirst,
      autoPan: state.autoPan === false ? false : toPanIntoViewOptions(state.autoPan),
      ...(state.className === undefined ? {} : { className: state.className }),
      position: state.visible && state.position !== undefined ? [...state.position] : undefined
    });
    if (state.visible) {
      try {
        this.#map.addOverlay(overlay);
      } catch (error) {
        try {
          this.#map.removeOverlay(overlay);
        } catch {
          // 尝试原生回滚后仍保留最初的挂载错误。
        }
        throw error;
      }
    }
    this.#records.set(state.id, { state, overlay, mounted: state.visible, mountStateKnown: true, element, action: undefined, drag: undefined });
  }

  /** 原子同步新状态；写入失败时补偿原生属性、挂载关系和 DOM 绑定。 */
  update(before: Readonly<OverlayRenderState>, after: Readonly<OverlayRenderState>): void {
    this.#assertActive();
    if (before.id !== after.id) throw new InvalidArgumentError('Overlay adapter update cannot change id');
    const record = this.#requireRecord(before.id);
    if (record.state.elementRef !== before.elementRef) throw new InvalidArgumentError(`Overlay adapter state is stale: ${before.id}`);
    if (!record.mountStateKnown) {
      const mounted = this.#mountedState(record.overlay);
      if (mounted !== undefined) {
        record.mounted = mounted;
        record.mountStateKnown = true;
      }
    }
    const elementChanged = before.elementRef !== after.elementRef;
    const nextElement = elementChanged ? this.#resolveElement(after.elementRef) : record.element;
    let nextActionBinding: (() => void) | undefined;
    let nextDragBinding: (() => void) | undefined;
    try {
      if (elementChanged && record.action !== undefined) nextActionBinding = this.#installAction(nextElement, record.action.listener);
      if (elementChanged && record.drag !== undefined) nextDragBinding = this.#installDrag(nextElement, record.drag.listener);
    } catch (error) {
      try {
        runFinalizers([...(nextDragBinding === undefined ? [] : [nextDragBinding]), ...(nextActionBinding === undefined ? [] : [nextActionBinding])]);
      } catch {
        // 保留最初的事件绑定错误。
      }
      throw error;
    }

    let mountTransitionAttempted = false;
    try {
      this.#applyNative(record.overlay, before, after, nextElement);
      if (record.mounted !== after.visible) {
        mountTransitionAttempted = true;
        if (after.visible) this.#map.addOverlay(record.overlay);
        else this.#map.removeOverlay(record.overlay);
      }
    } catch (error) {
      try {
        runFinalizers([
          ...(mountTransitionAttempted ? [() => this.#restoreMounted(record.overlay, record.mounted)] : []),
          () => this.#restoreNative(record.overlay, before, record.element),
          ...(nextDragBinding === undefined ? [] : [nextDragBinding]),
          ...(nextActionBinding === undefined ? [] : [nextActionBinding])
        ]);
      } catch {
        // 补偿失败不能覆盖最初的 OpenLayers 写入错误。
      }
      const mounted = this.#mountedState(record.overlay);
      if (mounted === undefined) record.mountStateKnown = false;
      else {
        record.mounted = mounted;
        record.mountStateKnown = true;
      }
      throw error;
    }

    if (elementChanged) {
      const oldBindings: Array<() => void> = [];
      if (record.action !== undefined && nextActionBinding !== undefined) {
        oldBindings.push(record.action.bindingDisposer);
        record.action.bindingDisposer = nextActionBinding;
      }
      if (record.drag !== undefined && nextDragBinding !== undefined) {
        oldBindings.push(record.drag.bindingDisposer);
        record.drag.bindingDisposer = nextDragBinding;
      }
      record.element = nextElement;
      try {
        runFinalizers(oldBindings);
      } catch {
        // 旧绑定清理失败不能让已经提交的新绑定失效。
      }
    }
    record.mounted = after.visible;
    record.mountStateKnown = true;
    record.state = after;
  }

  /** 移除 Overlay 及其描述牌、拖拽事件绑定。 */
  detach(id: string): void {
    this.#assertActive();
    const record = this.#records.get(id);
    if (record === undefined) throw new ObjectDisposedError(`Overlay is not attached: ${id}`);
    this.#records.delete(id);
    const action = record.action;
    const drag = record.drag;
    record.action = undefined;
    record.drag = undefined;
    runFinalizers([
      ...(drag === undefined ? [] : [drag.bindingDisposer]),
      ...(action === undefined ? [] : [action.bindingDisposer]),
      ...(record.mounted ? [() => this.#map.removeOverlay(record.overlay)] : [])
    ]);
  }

  panIntoView(id: string, options?: CorePanIntoViewSpec): void {
    this.#assertActive();
    this.#requireRecord(id).overlay.panIntoView(options === undefined ? undefined : toPanIntoViewOptions(options));
  }

  /** 撤销 DOM 引用；只有 Earth 独占且已交接的节点才从页面移除。 */
  releaseElement(ref: NativeRef<'element'>, ownership: CoreOverlayOwnership): void {
    this.#assertActive();
    const element = this.#refs.require<HTMLElement>('element', ref);
    const provisional = this.#refs.isProvisional('element', ref);
    const hasOtherReference = this.#refs.hasOtherCommittedReference('element', ref);
    let failure: unknown;
    try {
      this.#refs.revoke('element', ref);
    } catch (error) {
      failure = error;
    }
    if (ownership === 'earth' && !provisional && !hasOtherReference) {
      try {
        element.remove();
      } catch (error) {
        if (failure === undefined) failure = error;
      }
    }
    if (failure !== undefined) throw failure;
  }

  coordinateToPixel(coordinate: Coordinate): Pixel | undefined {
    this.#assertActive();
    const value = this.#map.getPixelFromCoordinate([...coordinate]);
    return value === null ? undefined : toPixel(value);
  }

  pixelToCoordinate(pixel: Pixel): Coordinate | undefined {
    this.#assertActive();
    const value = this.#map.getCoordinateFromPixel([...pixel]);
    return value === undefined || value === null ? undefined : (Object.freeze([...value]) as Coordinate);
  }

  /** 读取覆盖物相对地图视口的像素范围。 */
  getBounds(id: string): PixelBounds | undefined {
    this.#assertActive();
    const record = this.#records.get(id);
    if (record === undefined) return undefined;
    const elementBounds = record.element.getBoundingClientRect();
    const viewportBounds = this.#layoutViewportBounds ?? this.#map.getViewport().getBoundingClientRect();
    const bounds = {
      left: elementBounds.left - viewportBounds.left,
      top: elementBounds.top - viewportBounds.top,
      right: elementBounds.right - viewportBounds.left,
      bottom: elementBounds.bottom - viewportBounds.top
    };
    return Object.values(bounds).every(Number.isFinite) ? Object.freeze(bounds) : undefined;
  }

  /** 监听地图渲染后的覆盖物布局变化。 */
  subscribeLayout(listener: () => void): () => void {
    this.#assertActive();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Overlay layout listener must be a function');
    const wrapped = (): void => {
      this.#layoutViewportBounds = this.#map.getViewport().getBoundingClientRect();
      try {
        listener();
      } finally {
        this.#layoutViewportBounds = undefined;
      }
    };
    this.#map.on('postrender', wrapped);
    const disposer = once(() => {
      this.#map.un('postrender', wrapped);
      this.#layoutDisposers.delete(disposer);
    });
    this.#layoutDisposers.add(disposer);
    return disposer;
  }

  /** 监听描述牌列表项和关闭按钮动作。 */
  subscribeDescriptorActions(id: string, listener: (action: DescriptorPortAction) => void): () => void {
    this.#assertActive();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Descriptor action listener must be a function');
    const record = this.#requireRecord(id);
    if (record.action !== undefined) throw new InvalidArgumentError(`Descriptor action listener already exists: ${id}`);
    const subscription: ActionSubscription = { listener, bindingDisposer: this.#installAction(record.element, listener) };
    record.action = subscription;
    return once(() => {
      if (record.action === subscription) record.action = undefined;
      subscription.bindingDisposer();
    });
  }

  /** 为覆盖物安装指针拖拽事件。 */
  bindDrag(id: string, listener: (event: OverlayDragEvent) => void): () => void {
    this.#assertActive();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Overlay drag listener must be a function');
    const record = this.#requireRecord(id);
    if (record.drag !== undefined) throw new InvalidArgumentError(`Overlay drag listener already exists: ${id}`);
    const subscription: DragSubscription = { listener, bindingDisposer: this.#installDrag(record.element, listener) };
    record.drag = subscription;
    return once(() => {
      if (record.drag === subscription) record.drag = undefined;
      subscription.bindingDisposer();
    });
  }

  /** 移除全部覆盖物、引用和事件监听。 */
  destroy(): void {
    if (this.#disposed) return;
    const records = [...this.#records.values()].map(({ state }) => ({ id: state.id, elementRef: state.elementRef, ownership: state.ownership }));
    let failure: unknown;
    try {
      runFinalizers([
        ...records.map(
          ({ id, elementRef, ownership }) =>
            () =>
              runFinalizers([() => this.detach(id), () => this.releaseElement(elementRef, ownership)])
        ),
        ...this.#layoutDisposers
      ]);
    } catch (error) {
      failure = error;
    }
    if (failure === undefined) this.#disposed = true;
    if (failure !== undefined) throw failure;
  }

  /** 将有变化的字段写入 OpenLayers Overlay。 */
  #applyNative(overlay: Overlay, before: Readonly<OverlayRenderState>, after: Readonly<OverlayRenderState>, element: HTMLElement): void {
    if (before.elementRef !== after.elementRef) overlay.setElement(element);
    if (!tupleEqual(before.offset, after.offset)) overlay.setOffset([...after.offset]);
    if (before.positioning !== after.positioning) overlay.setPositioning(after.positioning);
    if (before.visible !== after.visible || !tupleEqual(before.position, after.position)) {
      overlay.setPosition(after.visible && after.position !== undefined ? [...after.position] : undefined);
    }
  }

  /** 尽力把 Overlay 恢复到更新前状态。 */
  #restoreNative(overlay: Overlay, state: Readonly<OverlayRenderState>, element: HTMLElement): void {
    let failure: unknown;
    for (const restore of [
      () => overlay.setElement(element),
      () => overlay.setOffset([...state.offset]),
      () => overlay.setPositioning(state.positioning),
      () => overlay.setPosition(state.visible && state.position !== undefined ? [...state.position] : undefined)
    ]) {
      try {
        restore();
      } catch (error) {
        if (failure === undefined) failure = error;
      }
    }
    if (failure !== undefined) throw failure;
  }

  /** 根据实际 Overlay 集合状态恢复更新前的挂载关系，避免重复插入同一个实例。 */
  #restoreMounted(overlay: Overlay, mounted: boolean): void {
    const currentlyMounted = this.#map.getOverlays().getArray().includes(overlay);
    if (currentlyMounted === mounted) return;
    if (mounted) this.#map.addOverlay(overlay);
    else this.#map.removeOverlay(overlay);
  }

  /** 仅在交接结果不确定时读取真实集合中的挂载状态。 */
  #mountedState(overlay: Overlay): boolean | undefined {
    try {
      return this.#map.getOverlays().getArray().includes(overlay);
    } catch {
      return undefined;
    }
  }

  /** 在描述牌 DOM 上安装点击动作识别。 */
  #installAction(element: HTMLElement, listener: (action: DescriptorPortAction) => void): () => void {
    const onClick = (event: Event) => {
      let current: HTMLElement | null = isElementLike(event.target) ? event.target : null;
      while (current !== null) {
        if (current.dataset.descriptorAction === 'close') {
          listener({ type: 'close' });
          return;
        }
        const rawIndex = current.dataset.descriptorIndex;
        if (rawIndex !== undefined) {
          const index = Number(rawIndex);
          if (Number.isSafeInteger(index) && index >= 0) listener({ type: 'item', index });
          return;
        }
        if (current === element) return;
        current = current.parentElement;
      }
    };
    element.addEventListener('click', onClick);
    return once(() => element.removeEventListener('click', onClick));
  }

  /** 在覆盖物 DOM 上安装完整的指针拖拽流程。 */
  #installDrag(element: HTMLElement, listener: (event: OverlayDragEvent) => void): () => void {
    let activePointer: number | undefined;
    let lastPixel: Pixel | undefined;
    const eventPixel = (event: PointerEvent): Pixel => {
      const bounds = this.#map.getViewport().getBoundingClientRect();
      return Object.freeze([event.clientX - bounds.left, event.clientY - bounds.top]);
    };
    const finish = (type: 'end' | 'cancel', event: PointerEvent) => {
      if (activePointer === undefined || event.pointerId !== activePointer) return;
      const pointerId = activePointer;
      const pixel = Number.isFinite(event.clientX) && Number.isFinite(event.clientY) ? eventPixel(event) : lastPixel;
      activePointer = undefined;
      lastPixel = undefined;
      try {
        element.releasePointerCapture(pointerId);
      } catch {
        // 指针捕获可能已经被宿主释放。
      }
      if (pixel !== undefined) listener({ type, pointerId, pixel });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (activePointer !== undefined || event.button !== 0) return;
      element.setPointerCapture(event.pointerId);
      activePointer = event.pointerId;
      lastPixel = eventPixel(event);
      listener({ type: 'start', pointerId: event.pointerId, pixel: lastPixel });
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return;
      lastPixel = eventPixel(event);
      listener({ type: 'move', pointerId: event.pointerId, pixel: lastPixel });
    };
    const onPointerUp = (event: PointerEvent) => finish('end', event);
    const onPointerCancel = (event: PointerEvent) => finish('cancel', event);
    const onLostPointerCapture = (event: PointerEvent) => finish('cancel', event);
    const listeners = [
      ['pointerdown', onPointerDown],
      ['pointermove', onPointerMove],
      ['pointerup', onPointerUp],
      ['pointercancel', onPointerCancel],
      ['lostpointercapture', onLostPointerCapture]
    ] as const;
    const installed: Array<readonly [string, EventListener]> = [];
    try {
      for (const [type, callback] of listeners) {
        const eventListener = callback as EventListener;
        element.addEventListener(type, eventListener);
        installed.push([type, eventListener]);
      }
    } catch (error) {
      for (const [type, callback] of installed.reverse()) element.removeEventListener(type, callback);
      throw error;
    }
    return once(() => {
      const pointerId = activePointer;
      const pixel = lastPixel;
      if (pointerId !== undefined) {
        try {
          element.releasePointerCapture(pointerId);
        } catch {
          // 指针捕获可能已经被宿主释放。
        }
      }
      activePointer = undefined;
      lastPixel = undefined;
      for (const [type, callback] of listeners) element.removeEventListener(type, callback as EventListener);
      if (pointerId !== undefined && pixel !== undefined) listener({ type: 'cancel', pointerId, pixel });
    });
  }

  /** 解析并确认引用对应可用的 DOM 元素。 */
  #resolveElement(ref: NativeRef<'element'>): HTMLElement {
    const element = this.#refs.require<HTMLElement>('element', ref);
    if (
      element === null ||
      typeof element !== 'object' ||
      typeof element.addEventListener !== 'function' ||
      typeof element.removeEventListener !== 'function' ||
      typeof element.getBoundingClientRect !== 'function' ||
      typeof element.remove !== 'function'
    ) {
      throw new InvalidArgumentError('Overlay element reference must resolve to an HTMLElement');
    }
    return element;
  }

  /** 获取指定 ID 的已挂载覆盖物记录。 */
  #requireRecord(id: string): OverlayAdapterRecord {
    const record = this.#records.get(id);
    if (record === undefined) throw new ObjectDisposedError(`Overlay is not attached: ${id}`);
    return record;
  }

  /** 确认适配器仍可使用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('OverlayAdapter has been destroyed');
  }
}

/** 将 Core 自动平移配置转换为 OpenLayers 配置。 */
function toPanIntoViewOptions(spec: CorePanIntoViewSpec): PanIntoViewOptions {
  const animation = spec.duration === undefined && spec.easing === undefined ? undefined : { duration: spec.duration, easing: spec.easing };
  return {
    ...(spec.margin === undefined ? {} : { margin: spec.margin }),
    ...(animation === undefined ? {} : { animation })
  };
}

/** 校验并冻结 OpenLayers 返回的屏幕像素。 */
function toPixel(value: readonly number[]): Pixel {
  if (value.length !== 2 || value.some((item) => !Number.isFinite(item))) throw new InvalidArgumentError('OpenLayers returned an invalid pixel');
  return Object.freeze([value[0], value[1]]);
}

/** 比较两个可选数值元组是否相同。 */
function tupleEqual(left: readonly number[] | undefined, right: readonly number[] | undefined): boolean {
  if (left === right) return true;
  return left !== undefined && right !== undefined && left.length === right.length && left.every((value, index) => value === right[index]);
}

/** 判断事件目标是否具备描述牌需要的 DOM 字段。 */
function isElementLike(value: EventTarget | null): value is HTMLElement {
  return value !== null && typeof value === 'object' && 'dataset' in value && 'parentElement' in value;
}

/** 将清理函数包装为成功后只执行一次。 */
function once(dispose: () => void): () => void {
  let state: 'active' | 'disposing' | 'disposed' = 'active';
  return () => {
    if (state !== 'active') return;
    state = 'disposing';
    try {
      dispose();
      state = 'disposed';
    } catch (error) {
      state = 'active';
      throw error;
    }
  };
}
