import type Map from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import PointerInteraction from 'ol/interaction/Pointer.js';
import { unByKey } from 'ol/Observable.js';
import type { EventsKey } from 'ol/events.js';
import type { Coordinate, Pixel } from '../../../core/common/types.js';
import { runFinalizers } from '../../../core/common/dispose.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../../core/ports/ErrorReporter.js';
import type { LayerRenderPort } from '../../../core/ports/LayerRenderPort.js';
import type {
  TransformCopyPreview,
  TransformDelta,
  TransformInteractionEvent,
  TransformInteractionHandle,
  TransformInteractionOptions,
  TransformInteractionPort,
  TransformInteractionTarget,
  TransformOperation
} from '../../../core/ports/TransformInteractionPort.js';
import type { FeatureBinding } from '../FeatureBinding.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';
import { HandleLayer, type TransformHandleHit } from '../transform/HandleLayer.js';
import { extentCenter } from '../transform/PreviewTransform.js';
import type { TransformHitTest } from '../transform/HitTest.js';

/** Transform 交互适配器的可选配置。 */
export interface TransformInteractionAdapterOptions {
  /** 接收监听器和原生资源清理错误。 */
  readonly errorReporter?: ErrorReporter;
}

/** 创建并安装 OpenLayers Transform 交互句柄。 */
export class TransformInteractionAdapter implements TransformInteractionPort {
  /** 交互所属的地图。 */
  readonly #map: Map;
  /** 查询可选择的业务元素。 */
  readonly #hitTest: TransformHitTest;
  /** 控制目标要素的投影抑制。 */
  readonly #binding: FeatureBinding;
  /** 编译目标和自定义手柄样式。 */
  readonly #styles: StyleCompiler;
  /** 提供选中框闪烁等图层渲染通道。 */
  readonly #render: LayerRenderPort;
  /** 接收监听器和清理错误。 */
  readonly #errorReporter: ErrorReporter;

  /** 保存 Transform 交互所需的地图和适配器。 */
  constructor(
    map: Map,
    hitTest: TransformHitTest,
    binding: FeatureBinding,
    styles: StyleCompiler,
    render: LayerRenderPort,
    options: TransformInteractionAdapterOptions = {}
  ) {
    this.#map = map;
    this.#hitTest = hitTest;
    this.#binding = binding;
    this.#styles = styles;
    this.#render = render;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
  }

  /** 打开一套 Transform 交互并在失败时回滚。 */
  open(sessionId: string, options: TransformInteractionOptions, listener: (event: TransformInteractionEvent) => void): TransformInteractionHandle {
    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) throw new InvalidArgumentError('Transform session id must be a non-empty string');
    if (typeof listener !== 'function') throw new InvalidArgumentError('Transform interaction listener must be a function');
    const handle = new OpenLayersTransformHandle(
      this.#map,
      this.#hitTest,
      this.#binding,
      this.#styles,
      this.#render,
      sessionId,
      options,
      listener,
      this.#errorReporter
    );
    try {
      handle.open();
      return handle;
    } catch (error) {
      handle.destroy();
      throw error;
    }
  }
}

/** 一次手柄拖拽的起点、中心和当前增量。 */
interface DragState {
  /** 被拖拽的控制手柄。 */
  readonly hit: TransformHandleHit;
  /** 拖拽起始坐标。 */
  readonly start: Coordinate;
  /** 缩放和旋转使用的中心。 */
  readonly center: Coordinate;
  /** 最近一次计算出的变换增量。 */
  delta: TransformDelta;
}

/** Transform 交互处理的地图浏览器事件。 */
type PointerMapEvent = MapBrowserEvent<PointerEvent | KeyboardEvent | WheelEvent>;

/** 管理一次 OpenLayers Transform 会话的交互和控制图层。 */
class OpenLayersTransformHandle implements TransformInteractionHandle {
  /** 交互所属的地图。 */
  readonly #map: Map;
  /** 查询可选择的业务元素。 */
  readonly #hitTest: TransformHitTest;
  /** 已校验的 Transform 配置。 */
  readonly #options: TransformInteractionOptions;
  /** 接收语义 Transform 事件。 */
  readonly #listener: (event: TransformInteractionEvent) => void;
  /** 接收监听器和清理错误。 */
  readonly #errorReporter: ErrorReporter;
  /** 管理目标预览、选中框和控制手柄。 */
  readonly #handles: HandleLayer;
  /** 接收指针拖拽事件的 OpenLayers 交互。 */
  readonly #interaction: PointerInteraction;
  /** 地图事件的取消键。 */
  readonly #keys: EventsKey[] = [];
  /** click 事件去重监听器。 */
  #clickListener: ((event: PointerMapEvent) => void) | undefined;
  /** singleclick 选择监听器。 */
  #singleClickListener: ((event: PointerMapEvent) => void) | undefined;
  /** 是否已经尝试把交互装到地图。 */
  #interactionInstallAttempted = false;
  /** 当前操作目标。 */
  #target: TransformInteractionTarget | undefined;
  /** 当前手柄拖拽状态。 */
  #drag: DragState | undefined;
  /** 鼠标当前悬停的手柄。 */
  #hover: TransformHandleHit | undefined;
  /** 最近一次有效指针坐标。 */
  #lastCoordinate: Coordinate | undefined;
  /** 复制预览开始时的参考坐标。 */
  #copyAnchor: Coordinate | undefined;
  /** 当前复制预览位移。 */
  #copyDelta: Readonly<{ x: number; y: number }> = Object.freeze({ x: 0, y: 0 });
  /** 是否处于复制预览状态。 */
  #copyActive = false;
  /** 交互是否已经成功打开。 */
  #opened = false;
  /** 句柄是否已经销毁。 */
  #destroyed = false;
  /** 句柄是否正在销毁。 */
  #destroying = false;

  /** 创建尚未安装的指针交互和控制图层。 */
  constructor(
    map: Map,
    hitTest: TransformHitTest,
    binding: FeatureBinding,
    styles: StyleCompiler,
    render: LayerRenderPort,
    sessionId: string,
    options: TransformInteractionOptions,
    listener: (event: TransformInteractionEvent) => void,
    errorReporter: ErrorReporter
  ) {
    this.#map = map;
    this.#hitTest = hitTest;
    this.#options = validateOptions(options);
    this.#listener = listener;
    this.#errorReporter = errorReporter;
    this.#handles = new HandleLayer(map, binding, styles, render, { sessionId, interaction: this.#options });
    this.#interaction = new PointerInteraction({
      handleDownEvent: (event) => this.#down(event),
      handleDragEvent: (event) => this.#dragEvent(event),
      handleUpEvent: (event) => this.#up(event),
      handleMoveEvent: (event) => this.#move(event),
      stopDown: (handled) => handled
    });
  }

  /** 返回当前实际接收渲染效果的图层 ID。 */
  get renderLayerId(): string {
    return this.#handles.activeRenderLayerId;
  }

  /** 返回选中框的渲染目标 ID。 */
  get renderTargetId(): string {
    return this.#handles.renderTargetId;
  }

  /** 将指针和选择事件安装到地图。 */
  open(): void {
    this.#assertActive();
    if (this.#opened) throw new InvalidArgumentError('Transform interaction is already open');
    this.#interactionInstallAttempted = true;
    this.#map.addInteraction(this.#interaction);
    const observedClicks = new WeakSet<Event>();
    const clickListener = (event: PointerMapEvent) => observedClicks.add(event.originalEvent);
    this.#clickListener = clickListener;
    this.#keys.push(this.#map.on('click', clickListener));
    const singleClickListener = (event: PointerMapEvent) => {
      if (observedClicks.delete(event.originalEvent)) this.#selectAt(event.pixel, event.coordinate);
    };
    this.#singleClickListener = singleClickListener;
    this.#keys.push(this.#map.on('singleclick', singleClickListener));
    this.#map.getViewport().addEventListener('contextmenu', this.#onContextMenu, true);
    this.#opened = true;
  }

  /** 设置当前 Transform 目标并刷新控制图层。 */
  setTarget(target: TransformInteractionTarget): void {
    this.#assertOpen();
    const preserveDrag = this.#drag !== undefined && this.#target?.elementId === target.elementId;
    this.#target = snapshotTarget(target);
    if (!preserveDrag) this.#drag = undefined;
    this.#handles.setTarget(this.#target);
  }

  /** 清除目标、拖拽、悬停和复制预览状态。 */
  clearTarget(): void {
    if (this.#destroyed) return;
    this.cancelCopyPreview();
    this.#leaveHover();
    this.#drag = undefined;
    this.#target = undefined;
    this.#handles.clearTarget();
  }

  /** 通知控制图层当前操作是否活动。 */
  setOperationActive(active: boolean, operation?: TransformOperation): void {
    if (this.#destroyed) return;
    this.#handles.setOperationActive(active, operation);
  }

  /** 启动一个跟随指针的复制预览。 */
  startCopyPreview(preview: TransformCopyPreview): void {
    this.#assertOpen();
    this.#copyAnchor = this.#lastCoordinate ?? extentCenter(this.#handles.extent ?? [0, 0, 0, 0]);
    this.#copyDelta = Object.freeze({ x: 0, y: 0 });
    this.#copyActive = true;
    this.#handles.setCopyPreview(preview.geometry, preview.style);
  }

  /** 取消复制预览并清除位移状态。 */
  cancelCopyPreview(): void {
    if (!this.#copyActive && this.#copyAnchor === undefined) return;
    this.#copyActive = false;
    this.#copyAnchor = undefined;
    this.#copyDelta = Object.freeze({ x: 0, y: 0 });
    this.#handles.clearCopyPreview();
  }

  /** 移除全部地图事件、交互和控制图层。 */
  destroy(): void {
    if (this.#destroyed || this.#destroying) return;
    this.#destroying = true;
    try {
      runFinalizers([
        () => this.#map.getViewport().removeEventListener('contextmenu', this.#onContextMenu, true),
        () => {
          if (this.#keys.length > 0) {
            unByKey(this.#keys);
            this.#keys.length = 0;
          }
        },
        () => {
          const listener = this.#clickListener;
          if (listener !== undefined) this.#map.un('click', listener);
          if (this.#clickListener === listener) this.#clickListener = undefined;
        },
        () => {
          const listener = this.#singleClickListener;
          if (listener !== undefined) this.#map.un('singleclick', listener);
          if (this.#singleClickListener === listener) this.#singleClickListener = undefined;
        },
        () => {
          if (!this.#interactionInstallAttempted) return;
          this.#map.removeInteraction(this.#interaction);
          this.#interactionInstallAttempted = false;
          this.#opened = false;
        },
        () => this.#interaction.setActive(false),
        () => this.#interaction.setMap(null),
        () => this.#handles.destroy(),
        () => this.#interaction.dispose()
      ]);
      this.#target = undefined;
      this.#drag = undefined;
      this.#hover = undefined;
      this.#destroyed = true;
    } finally {
      this.#destroying = false;
    }
  }

  /** 处理指针按下并开始手柄拖拽或确认复制。 */
  #down(event: PointerMapEvent): boolean {
    const currentCoordinate = coordinate(event.coordinate);
    const currentPixel = pixel(event.pixel);
    this.#lastCoordinate = currentCoordinate;
    if (this.#copyActive) {
      if (!isPrimary(event)) return false;
      const delta = this.#copyDelta;
      this.cancelCopyPreview();
      this.#emit({ type: 'copy-preview-confirm', delta });
      return true;
    }
    if (!isPrimary(event) || this.#target === undefined) return false;
    const hit = this.#handles.hit(currentPixel, this.#options.hitTolerance);
    if (hit === undefined || !operationAllowed(this.#target, hit.operation)) return false;
    const center = this.#options.handleCenter ?? extentCenter(this.#handles.extent ?? [0, 0, 0, 0]);
    const start = currentCoordinate;
    const delta = initialDelta(hit, start, center);
    this.#drag = { hit, start, center, delta };
    this.#emit({ type: 'operation-start', operation: hit.operation, delta, pixel: currentPixel, coordinate: currentCoordinate });
    return true;
  }

  /** 处理指针拖拽并发布实时变换增量。 */
  #dragEvent(event: PointerMapEvent): void {
    const drag = this.#drag;
    if (drag === undefined) return;
    this.#lastCoordinate = coordinate(event.coordinate);
    const currentPixel = pixel(event.pixel);
    drag.delta = this.#deltaFor(drag, this.#lastCoordinate, event.originalEvent.shiftKey === true);
    this.#emit({ type: 'operation-change', operation: drag.hit.operation, delta: drag.delta, pixel: currentPixel, coordinate: this.#lastCoordinate });
  }

  /** 处理指针抬起并结束当前拖拽。 */
  #up(event: PointerMapEvent): boolean {
    const drag = this.#drag;
    if (drag === undefined) return false;
    this.#lastCoordinate = coordinate(event.coordinate);
    const currentPixel = pixel(event.pixel);
    drag.delta = this.#deltaFor(drag, this.#lastCoordinate, event.originalEvent.shiftKey === true);
    this.#drag = undefined;
    this.#emit({ type: 'operation-end', operation: drag.hit.operation, delta: drag.delta, pixel: currentPixel, coordinate: this.#lastCoordinate });
    return true;
  }

  /** 处理指针移动、手柄悬停和复制预览。 */
  #move(event: PointerMapEvent): void {
    const current = coordinate(event.coordinate);
    const currentPixel = pixel(event.pixel);
    this.#lastCoordinate = current;
    this.#emit({ type: 'pointer-move', coordinate: current, pixel: currentPixel });
    if (this.#copyActive && this.#copyAnchor !== undefined) {
      this.#copyDelta = Object.freeze({ x: current[0] - this.#copyAnchor[0], y: current[1] - this.#copyAnchor[1] });
      this.#handles.updateCopyPreview(this.#copyDelta.x, this.#copyDelta.y);
      return;
    }
    const hit = this.#handles.hit(currentPixel, this.#options.hitTolerance);
    if (sameHit(hit, this.#hover)) return;
    this.#leaveHover(current, currentPixel);
    if (hit !== undefined) {
      this.#hover = hit;
      this.#emit({
        type: 'enter-handle',
        key: hit.key,
        operation: hit.operation,
        ...(hit.axis === undefined ? {} : { axis: hit.axis }),
        cursor: cursorFor(hit),
        coordinate: current,
        pixel: currentPixel
      });
    }
  }

  /** 在指定像素选择最前面的可操作元素。 */
  #selectAt(rawPixel: readonly number[], rawCoordinate?: readonly number[]): void {
    if (this.#destroyed || this.#copyActive || this.#drag !== undefined) return;
    const selectedPixel = pixel(rawPixel);
    const candidates = this.#hitTest.atPixel(selectedPixel, this.#options.hitTolerance).map(({ elementId }) => elementId);
    this.#emit({
      type: 'select-request',
      pixel: selectedPixel,
      ...(rawCoordinate === undefined ? {} : { coordinate: coordinate(rawCoordinate) }),
      candidateIds: Object.freeze(candidates)
    });
  }

  /** 根据当前指针计算平移、旋转、缩放或拉伸增量。 */
  #deltaFor(drag: DragState, current: Coordinate, keepAspectRatio = false): TransformDelta {
    if (drag.hit.operation === 'translate') return Object.freeze({ type: 'translate', x: current[0] - drag.start[0], y: current[1] - drag.start[1] });
    if (drag.hit.operation === 'vertex') {
      if (drag.hit.index === undefined) throw new InvalidArgumentError('Transform vertex handle has no index');
      return Object.freeze({ type: 'vertex', index: drag.hit.index, coordinate: current });
    }
    if (drag.hit.operation === 'rotate') {
      const startAngle = Math.atan2(drag.start[1] - drag.center[1], drag.start[0] - drag.center[0]);
      const currentAngle = Math.atan2(current[1] - drag.center[1], current[0] - drag.center[0]);
      return Object.freeze({ type: 'rotate', angle: currentAngle - startAngle, center: drag.center });
    }
    const x = ratio(current[0] - drag.center[0], drag.start[0] - drag.center[0]);
    const y = ratio(current[1] - drag.center[1], drag.start[1] - drag.center[1]);
    let scaleX = drag.hit.axis === 'y' ? 1 : x;
    let scaleY = drag.hit.axis === 'x' ? 1 : y;
    if (this.#options.noFlip) {
      scaleX = Math.max(0.001, scaleX);
      scaleY = Math.max(0.001, scaleY);
    }
    if (drag.hit.operation === 'scale' && keepAspectRatio) {
      const scale = Math.min(scaleX, scaleY);
      scaleX = scale;
      scaleY = scale;
    } else if (drag.hit.operation === 'scale' && this.#options.keepRectangle && this.#target?.type === 'rectangle') {
      const magnitude = Math.max(Math.abs(scaleX), Math.abs(scaleY));
      scaleX = Math.sign(scaleX || 1) * magnitude;
      scaleY = Math.sign(scaleY || 1) * magnitude;
    }
    return Object.freeze({ type: drag.hit.operation, scaleX, scaleY, center: drag.center });
  }

  /** 离开当前悬停手柄并发布对应事件。 */
  #leaveHover(current?: Coordinate, currentPixel?: Pixel): void {
    const hover = this.#hover;
    this.#hover = undefined;
    if (hover !== undefined) {
      this.#emit({
        type: 'leave-handle',
        key: hover.key,
        operation: hover.operation,
        ...(hover.axis === undefined ? {} : { axis: hover.axis }),
        cursor: cursorFor(hover),
        ...(current === undefined ? {} : { coordinate: current }),
        ...(currentPixel === undefined ? {} : { pixel: currentPixel })
      });
    }
  }

  /** 屏蔽右键菜单并结束或取消当前交互状态。 */
  readonly #onContextMenu = (event: MouseEvent): void => {
    if (this.#destroying || !this.#copyActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelCopyPreview();
    this.#emit({ type: 'copy-preview-cancel' });
  };

  /** 冻结并安全发布语义 Transform 事件。 */
  #emit(event: TransformInteractionEvent): void {
    try {
      this.#listener(Object.freeze(event));
    } catch (error) {
      try {
        const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
          source: 'TransformInteractionAdapter',
          operation: `listener:${event.type}`
        });
        void Promise.resolve(result).catch(() => undefined);
      } catch {
        return;
      }
    }
  }

  /** 确认交互已经打开且仍可使用。 */
  #assertOpen(): void {
    this.#assertActive();
    if (!this.#opened) throw new ObjectDisposedError('Transform interaction is not open');
  }

  /** 确认句柄尚未销毁。 */
  #assertActive(): void {
    if (this.#destroyed) throw new ObjectDisposedError('Transform interaction has been destroyed');
  }
}

/** 校验并冻结 Transform 交互配置。 */
function validateOptions(options: TransformInteractionOptions): TransformInteractionOptions {
  if (options === null || typeof options !== 'object') throw new InvalidArgumentError('Transform interaction options must be an object');
  if (!Number.isFinite(options.hitTolerance) || options.hitTolerance < 0) throw new InvalidArgumentError('Transform hitTolerance must be non-negative');
  if (!Number.isFinite(options.buffer) || options.buffer < 0) throw new InvalidArgumentError('Transform buffer must be non-negative');
  if (!Number.isFinite(options.pointRadius) || options.pointRadius <= 0) throw new InvalidArgumentError('Transform pointRadius must be positive');
  return Object.freeze({ ...options });
}

/** 复制并冻结 Transform 操作目标。 */
function snapshotTarget(target: TransformInteractionTarget): TransformInteractionTarget {
  return Object.freeze({
    ...target,
    controlPoints: Object.freeze(target.controlPoints.map(coordinate)),
    ...(target.style === undefined ? {} : { style: target.style })
  });
}

/** 判断目标是否允许指定手柄操作。 */
function operationAllowed(target: TransformInteractionTarget, operation: TransformHandleHit['operation']): boolean {
  if (operation === 'vertex') return target.mode === 'edit' && target.canEditVertices;
  if (target.mode !== 'transform') return false;
  if (operation === 'translate') return target.canTranslate;
  if (operation === 'rotate') return target.canRotate;
  if (operation === 'scale') return target.canScale;
  if (operation === 'stretch') return target.canStretch;
  return false;
}

/** 根据手柄、起点和中心生成初始变换增量。 */
function initialDelta(hit: TransformHandleHit, start: Coordinate, center: Coordinate): TransformDelta {
  if (hit.operation === 'translate') return Object.freeze({ type: 'translate', x: 0, y: 0 });
  if (hit.operation === 'rotate') return Object.freeze({ type: 'rotate', angle: 0, center });
  if (hit.operation === 'vertex') {
    if (hit.index === undefined) throw new InvalidArgumentError('Transform vertex handle has no index');
    return Object.freeze({ type: 'vertex', index: hit.index, coordinate: start });
  }
  return Object.freeze({ type: hit.operation, scaleX: 1, scaleY: 1, center });
}

/** 校验并冻结地图坐标。 */
function coordinate(value: readonly number[]): Coordinate {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3) || value.some((item) => !Number.isFinite(item))) {
    throw new InvalidArgumentError('Transform coordinate must contain two or three finite numbers');
  }
  return Object.freeze([...value]) as Coordinate;
}

/** 校验并冻结屏幕像素。 */
function pixel(value: readonly number[]): Pixel {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => !Number.isFinite(item))) {
    throw new InvalidArgumentError('Transform pixel must contain two finite numbers');
  }
  return Object.freeze([value[0], value[1]]);
}

/** 安全计算比例，除数过小时使用 1。 */
function ratio(numerator: number, denominator: number): number {
  return Math.abs(denominator) < Number.EPSILON ? 1 : numerator / denominator;
}

/** 判断事件是否来自主指针。 */
function isPrimary(event: PointerMapEvent): boolean {
  const native = event.originalEvent as Partial<PointerEvent>;
  return native.isPrimary !== false && native.button === 0;
}

/** 判断两个悬停命中是否指向同一手柄。 */
function sameHit(left: TransformHandleHit | undefined, right: TransformHandleHit | undefined): boolean {
  return left?.key === right?.key;
}

/** 按手柄操作和坐标轴选择鼠标样式。 */
function cursorFor(hit: TransformHandleHit): string {
  if (hit.operation === 'translate' || hit.operation === 'vertex') return 'move';
  if (hit.operation === 'rotate') return 'grab';
  if (hit.operation === 'stretch') return hit.axis === 'x' ? 'ew-resize' : 'ns-resize';
  if (hit.key === 'scale-sw' || hit.key === 'scale-ne') return 'nesw-resize';
  return 'nwse-resize';
}
