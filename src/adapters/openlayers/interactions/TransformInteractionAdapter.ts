import type Map from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import PointerInteraction from 'ol/interaction/Pointer.js';
import { unByKey } from 'ol/Observable.js';
import type { EventsKey } from 'ol/events.js';
import { getUserProjection } from 'ol/proj.js';
import type { Coordinate, Pixel } from '../../../core/common/types.js';
import { runFinalizers } from '../../../core/common/dispose.js';
import { horizontalWorldFromExtent, type HorizontalWorld } from '../../../core/common/worldWrap.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import type { EditInteractionAnchor } from '../../../core/ports/EditInteractionPort.js';
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
import { extentCenter, renderExtent, translateRenderGeometry } from '../transform/PreviewTransform.js';
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
type ActiveTransformHandleHit = TransformHandleHit & Readonly<{ operation: TransformOperation }>;

/** 一次手柄拖拽的起点、中心和当前增量。 */
interface DragState {
  /** 被拖拽的控制手柄。 */
  readonly hit: ActiveTransformHandleHit;
  /** 拖拽起始坐标。 */
  readonly start: Coordinate;
  /** 缩放和旋转使用的中心。 */
  readonly center: Coordinate;
  /** 拖拽开始时视图相对规范目标所在的整数世界偏移。 */
  readonly viewWorldOffset: number;
  /** 当前环绕坐标系；未启用 wrapX 时不存在。 */
  readonly world?: HorizontalWorld;
  /** 计算视图整数世界偏移时使用的固定规范坐标。 */
  readonly worldReferenceX: number;
  /** 最近一次计算出的变换增量。 */
  delta: TransformDelta;
}

/** 浏览器一帧内最后一次待处理的拖拽采样。 */
interface PendingDragSample {
  readonly coordinate: Coordinate;
  readonly pixel: Pixel;
  readonly keepAspectRatio: boolean;
}

/** Transform 交互处理的地图浏览器事件。 */
type PointerMapEvent = MapBrowserEvent<PointerEvent | KeyboardEvent | WheelEvent>;

/** 管理一次 OpenLayers Transform 会话的交互和控制图层。 */
class OpenLayersTransformHandle implements TransformInteractionHandle {
  /** 交互所属的地图。 */
  readonly #map: Map;
  /** 查询可选择的业务元素。 */
  readonly #hitTest: TransformHitTest;
  /** 查询目标图层的环绕语义。 */
  readonly #binding: FeatureBinding;
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
  /** 地图和视图事件的取消键。 */
  readonly #keys: EventsKey[] = [];
  /** click 事件去重监听器。 */
  #clickListener: ((event: PointerMapEvent) => void) | undefined;
  /** singleclick 选择监听器。 */
  #singleClickListener: ((event: PointerMapEvent) => void) | undefined;
  /** 是否已经尝试把交互装到地图。 */
  #interactionInstallAttempted = false;
  /** 当前操作目标。 */
  #target: TransformInteractionTarget | undefined;
  /** 当前 Core 规范世界中的操作目标。 */
  #canonicalTarget: TransformInteractionTarget | undefined;
  /** 当前目标从规范世界移到展示世界的水平偏移。 */
  #worldOffset = 0;
  /** 拖拽期间是否收到了需在结束后补做的跨世界定位。 */
  #worldRepositionPending = false;
  /** 当前选择请求使用的一次性世界参考坐标。 */
  #selectionReferenceX: number | undefined;
  /** 当前手柄拖拽状态。 */
  #drag: DragState | undefined;
  /** 等待在下一绘制帧处理的最后一次拖拽采样。 */
  #pendingDrag: PendingDragSample | undefined;
  /** 已登记的拖拽绘制帧。 */
  #dragFrame: number | undefined;
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
    this.#binding = binding;
    this.#options = validateOptions(options);
    this.#listener = listener;
    this.#errorReporter = errorReporter;
    this.#handles = new HandleLayer(map, binding, styles, render, {
      sessionId,
      interaction: this.#options,
      onExtentChange: (topRight) => this.#emit({ type: 'bounds-change', topRight })
    });
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
      if (!observedClicks.delete(event.originalEvent)) return;
      if (!this.#editAt(event)) this.#selectAt(event.pixel, event.coordinate);
    };
    this.#singleClickListener = singleClickListener;
    this.#keys.push(this.#map.on('singleclick', singleClickListener));
    this.#keys.push(this.#map.getView().on('change:center', this.#onViewCenterChange));
    this.#map.getViewport().addEventListener('contextmenu', this.#onContextMenu, true);
    this.#opened = true;
  }

  /** 设置当前 Transform 目标并刷新控制图层。 */
  setTarget(target: TransformInteractionTarget): void {
    this.#assertOpen();
    const canonicalTarget = snapshotTarget(target);
    const preserveDrag = this.#drag !== undefined && this.#canonicalTarget?.elementId === canonicalTarget.elementId;
    const targetChanged = this.#canonicalTarget?.elementId !== canonicalTarget.elementId;
    const previousOffset = this.#worldOffset;
    if (!preserveDrag) {
      this.#worldOffset = worldOffsetFor(this.#map, this.#binding, canonicalTarget, targetChanged ? this.#selectionReferenceX : undefined);
      this.#worldRepositionPending = false;
    }
    this.#canonicalTarget = canonicalTarget;
    this.#target = canonicalTarget;
    if (!preserveDrag) {
      this.#cancelPendingDrag();
      this.#drag = undefined;
    }
    this.#handles.setTarget(this.#target, this.#worldOffset);
    if (!targetChanged) this.#shiftPresentationWorld(this.#worldOffset - previousOffset);
  }

  /** 清除目标、拖拽、悬停和复制预览状态。 */
  clearTarget(): void {
    if (this.#destroyed) return;
    this.cancelCopyPreview();
    this.#leaveHover();
    this.#cancelPendingDrag();
    this.#drag = undefined;
    this.#target = undefined;
    this.#canonicalTarget = undefined;
    this.#worldOffset = 0;
    this.#worldRepositionPending = false;
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
    this.#handles.setCopyPreview(translateRenderGeometry(preview.geometry, this.#worldOffset, 0), preview.style);
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
      this.#cancelPendingDrag();
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
      this.#canonicalTarget = undefined;
      this.#drag = undefined;
      this.#worldRepositionPending = false;
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
    if (this.#target.mode === 'edit' && event.originalEvent.altKey === true) return false;
    const hit = this.#handles.hit(currentPixel, this.#options.hitTolerance, this.#target.mode === 'edit' ? 'control' : 'all');
    if (!hasTransformOperation(hit) || !operationAllowed(this.#target, hit.operation)) return false;
    const center =
      this.#target.handleCenter === undefined
        ? extentCenter(this.#handles.extent ?? [0, 0, 0, 0])
        : shiftCoordinate(this.#target.handleCenter, this.#worldOffset);
    const start = currentCoordinate;
    const delta = canonicalDelta(initialDelta(hit, start, center), this.#worldOffset);
    const world = transformWorldFor(this.#map, this.#binding, this.#canonicalTarget);
    const worldReferenceX = this.#canonicalTarget === undefined ? start[0] - this.#worldOffset : targetReferenceX(this.#canonicalTarget);
    const viewWorldOffset = viewWorldOffsetFor(this.#map, world, worldReferenceX);
    this.#cancelPendingDrag();
    this.#drag = { hit, start, center, delta, viewWorldOffset, ...(world === undefined ? {} : { world }), worldReferenceX };
    this.#emit({
      type: 'operation-start',
      operation: hit.operation,
      delta,
      pixel: currentPixel,
      coordinate: currentCoordinate,
      ...(hit.axis === undefined ? {} : { axis: hit.axis }),
      ...(hit.anchor?.kind !== 'control' ? {} : { anchor: hit.anchor }),
      cursor: cursorFor(hit)
    });
    return true;
  }

  /** 处理指针拖拽并发布实时变换增量。 */
  #dragEvent(event: PointerMapEvent): void {
    const drag = this.#drag;
    if (drag === undefined) return;
    this.#pendingDrag = {
      coordinate: this.#coordinateInDragWorld(drag, coordinate(event.coordinate)),
      pixel: pixel(event.pixel),
      keepAspectRatio: event.originalEvent.shiftKey === true
    };
    const requestFrame = globalThis.requestAnimationFrame;
    if (typeof requestFrame !== 'function') {
      this.#flushPendingDrag();
      return;
    }
    if (this.#dragFrame !== undefined) return;
    this.#dragFrame = requestFrame(() => {
      this.#dragFrame = undefined;
      this.#flushPendingDrag();
    });
  }

  /** 处理指针抬起并结束当前拖拽。 */
  #up(event: PointerMapEvent): boolean {
    if (this.#drag === undefined) return false;
    if (isPointerCancel(event)) {
      const drag = this.#drag;
      this.#cancelPendingDrag();
      const currentCoordinate = this.#coordinateInDragWorld(drag, coordinate(event.coordinate));
      const currentPixel = pixel(event.pixel);
      try {
        this.#emit({
          type: 'operation-cancel',
          operation: drag.hit.operation,
          delta: drag.delta,
          pixel: currentPixel,
          coordinate: currentCoordinate,
          ...(drag.hit.axis === undefined ? {} : { axis: drag.hit.axis }),
          ...(drag.hit.anchor?.kind !== 'control' ? {} : { anchor: drag.hit.anchor }),
          cursor: cursorFor(drag.hit)
        });
      } finally {
        if (this.#drag === drag) this.#drag = undefined;
        this.#leaveHover(currentCoordinate, currentPixel);
        if (this.#worldRepositionPending) this.#repositionForView();
      }
      return false;
    }
    this.#cancelDragFrame();
    this.#flushPendingDrag();
    const drag = this.#drag;
    if (drag === undefined) return true;
    this.#lastCoordinate = this.#coordinateInDragWorld(drag, coordinate(event.coordinate));
    const currentPixel = pixel(event.pixel);
    drag.delta = this.#deltaFor(drag, this.#lastCoordinate, event.originalEvent.shiftKey === true);
    try {
      this.#emit({
        type: 'operation-end',
        operation: drag.hit.operation,
        delta: drag.delta,
        pixel: currentPixel,
        coordinate: this.#lastCoordinate,
        ...(drag.hit.axis === undefined ? {} : { axis: drag.hit.axis }),
        ...(drag.hit.anchor?.kind !== 'control' ? {} : { anchor: drag.hit.anchor }),
        cursor: cursorFor(drag.hit)
      });
    } finally {
      if (this.#drag === drag) this.#drag = undefined;
      if (this.#worldRepositionPending) this.#repositionForView();
    }
    return true;
  }

  /** 处理浏览器一帧内最后一次拖拽采样，避免高频输入重复刷新整条预览链路。 */
  #flushPendingDrag(): void {
    const sample = this.#pendingDrag;
    this.#pendingDrag = undefined;
    const drag = this.#drag;
    if (sample === undefined || drag === undefined) return;
    this.#lastCoordinate = sample.coordinate;
    drag.delta = this.#deltaFor(drag, sample.coordinate, sample.keepAspectRatio);
    this.#emit({
      type: 'operation-change',
      operation: drag.hit.operation,
      delta: drag.delta,
      pixel: sample.pixel,
      coordinate: sample.coordinate,
      ...(drag.hit.axis === undefined ? {} : { axis: drag.hit.axis }),
      ...(drag.hit.anchor?.kind !== 'control' ? {} : { anchor: drag.hit.anchor }),
      cursor: cursorFor(drag.hit)
    });
  }

  /** 取消尚未执行的浏览器绘制帧，但保留最后一次采样供 pointerup 同步处理。 */
  #cancelDragFrame(): void {
    const frame = this.#dragFrame;
    this.#dragFrame = undefined;
    if (frame === undefined) return;
    const cancelFrame = globalThis.cancelAnimationFrame;
    if (typeof cancelFrame === 'function') cancelFrame(frame);
  }

  /** 丢弃当前拖拽的全部延迟输入。 */
  #cancelPendingDrag(): void {
    this.#cancelDragFrame();
    this.#pendingDrag = undefined;
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
        ...(hit.operation === undefined ? {} : { operation: hit.operation }),
        ...(hit.axis === undefined ? {} : { axis: hit.axis }),
        ...(hit.anchor === undefined ? {} : { anchor: hit.anchor }),
        cursor: cursorFor(hit),
        coordinate: current,
        pixel: currentPixel
      });
    }
  }

  /** Alt 单击语义锚点时发布原子插入或删除请求，并阻止重新选择目标。 */
  #editAt(event: PointerMapEvent): boolean {
    const target = this.#target;
    if (target?.mode !== 'edit' || this.#drag !== undefined || this.#copyActive) return false;
    const currentPixel = pixel(event.pixel);
    const hovered = this.#handles.hit(currentPixel, this.#options.hitTolerance);
    if (hovered?.anchor === undefined) return false;
    const currentCoordinate = coordinate(event.coordinate);
    this.#lastCoordinate = currentCoordinate;
    event.originalEvent.preventDefault?.();
    if (event.originalEvent.altKey !== true) return true;
    const anchor = this.#handles.hit(currentPixel, this.#options.hitTolerance, 'structural')?.anchor;
    if (anchor === undefined) return true;
    this.#leaveHover(currentCoordinate, currentPixel);
    if (anchor.kind === 'insertion') this.#emit({ type: 'edit-insert', anchor });
    else this.#emit({ type: 'edit-remove', anchor });
    return true;
  }

  /** 在指定像素选择最前面的可操作元素。 */
  #selectAt(rawPixel: readonly number[], rawCoordinate?: readonly number[]): void {
    if (this.#destroyed || this.#copyActive || this.#drag !== undefined) return;
    const selectedPixel = pixel(rawPixel);
    const candidates = this.#hitTest.atPixel(selectedPixel, this.#options.hitTolerance).map(({ elementId }) => elementId);
    const selectedCoordinate = rawCoordinate === undefined ? undefined : coordinate(rawCoordinate);
    this.#selectionReferenceX = selectedCoordinate?.[0];
    try {
      this.#emit({
        type: 'select-request',
        pixel: selectedPixel,
        ...(selectedCoordinate === undefined ? {} : { coordinate: selectedCoordinate }),
        candidateIds: Object.freeze(candidates)
      });
    } finally {
      this.#selectionReferenceX = undefined;
    }
  }

  /** 根据当前指针计算平移、旋转、缩放或拉伸增量。 */
  #deltaFor(drag: DragState, current: Coordinate, keepAspectRatio = false): TransformDelta {
    if (drag.hit.operation === 'translate') return Object.freeze({ type: 'translate', x: current[0] - drag.start[0], y: current[1] - drag.start[1] });
    if (drag.hit.operation === 'vertex') {
      if (drag.hit.index === undefined) throw new InvalidArgumentError('Transform vertex handle has no index');
      return canonicalDelta(Object.freeze({ type: 'vertex', index: drag.hit.index, coordinate: current }), this.#worldOffset);
    }
    if (drag.hit.operation === 'rotate') {
      const startAngle = Math.atan2(drag.start[1] - drag.center[1], drag.start[0] - drag.center[0]);
      const currentAngle = Math.atan2(current[1] - drag.center[1], current[0] - drag.center[0]);
      return canonicalDelta(Object.freeze({ type: 'rotate', angle: currentAngle - startAngle, center: drag.center }), this.#worldOffset);
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
    return canonicalDelta(Object.freeze({ type: drag.hit.operation, scaleX, scaleY, center: drag.center }), this.#worldOffset);
  }

  /** 把视图切换到其他整数世界后产生的事件坐标放回拖拽开始时冻结的展示世界。 */
  #coordinateInDragWorld(drag: DragState, current: Coordinate): Coordinate {
    const world = drag.world;
    if (world === undefined) return current;
    const currentViewOffset = viewWorldOffsetFor(this.#map, world, drag.worldReferenceX);
    const offset = drag.viewWorldOffset - currentViewOffset;
    return offset === 0 ? current : shiftCoordinate(current, offset);
  }

  /** 离开当前悬停手柄并发布对应事件。 */
  #leaveHover(current?: Coordinate, currentPixel?: Pixel): void {
    const hover = this.#hover;
    this.#hover = undefined;
    if (hover !== undefined) {
      this.#emit({
        type: 'leave-handle',
        key: hover.key,
        ...(hover.operation === undefined ? {} : { operation: hover.operation }),
        ...(hover.axis === undefined ? {} : { axis: hover.axis }),
        ...(hover.anchor === undefined ? {} : { anchor: hover.anchor }),
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

  /** 视图跨越世界边界时把选中目标移到离当前中心最近的副本。 */
  readonly #onViewCenterChange = (): void => {
    if (this.#destroyed || this.#destroying || this.#canonicalTarget === undefined) return;
    try {
      this.#repositionForView();
    } catch (error) {
      this.#report(error, 'view-center');
    }
  };

  /** 在非拖拽阶段重算展示世界；拖拽期间只记录待处理状态。 */
  #repositionForView(): void {
    const canonicalTarget = this.#canonicalTarget;
    if (canonicalTarget === undefined) {
      this.#worldRepositionPending = false;
      return;
    }
    if (this.#drag !== undefined) {
      this.#worldRepositionPending = true;
      return;
    }
    const previousOffset = this.#worldOffset;
    const nextOffset = worldOffsetFor(this.#map, this.#binding, canonicalTarget);
    if (nextOffset === previousOffset) {
      this.#worldRepositionPending = false;
      return;
    }
    this.#worldOffset = nextOffset;
    this.#target = canonicalTarget;
    try {
      this.#handles.setTarget(canonicalTarget, nextOffset);
    } catch (error) {
      this.#worldOffset = previousOffset;
      this.#target = canonicalTarget;
      this.#worldRepositionPending = true;
      throw error;
    }
    this.#shiftPresentationWorld(nextOffset - previousOffset);
    this.#worldRepositionPending = false;
  }

  /** 同步复制预览和指针基准等展示世界临时状态。 */
  #shiftPresentationWorld(offset: number): void {
    if (offset === 0) return;
    this.#handles.shiftCopyPreview(offset, 0);
    if (this.#copyAnchor !== undefined) this.#copyAnchor = shiftCoordinate(this.#copyAnchor, offset);
    if (this.#lastCoordinate !== undefined) this.#lastCoordinate = shiftCoordinate(this.#lastCoordinate, offset);
  }

  /** 冻结并安全发布语义 Transform 事件。 */
  #emit(event: TransformInteractionEvent): void {
    try {
      this.#listener(Object.freeze(event));
    } catch (error) {
      this.#report(error, `listener:${event.type}`);
    }
  }

  /** 报告适配器内部错误且不让报告失败中断地图交互。 */
  #report(error: unknown, operation: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'TransformInteractionAdapter',
        operation
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      return;
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
    editAnchors: Object.freeze(target.editAnchors.map(snapshotEditAnchor)),
    ...(target.handleCenter === undefined ? {} : { handleCenter: coordinate(target.handleCenter) }),
    ...(target.style === undefined ? {} : { style: target.style })
  });
}

/** 深拷贝并冻结 Transform 编辑锚点，避免调用方在交互期间修改拓扑快照。 */
function snapshotEditAnchor(anchor: EditInteractionAnchor): EditInteractionAnchor {
  const snapshot = { ...anchor, coordinate: coordinate(anchor.coordinate) };
  return Object.freeze(snapshot) as EditInteractionAnchor;
}

/** 根据点击位置、视图中心和业务源 wrapX 选择唯一展示世界。 */
function worldOffsetFor(map: Map, binding: FeatureBinding, target: TransformInteractionTarget, requestedX?: number): number {
  const world = transformWorldFor(map, binding, target);
  if (world === undefined) return 0;
  const targetX = targetReferenceX(target);
  const center = map.getView().getCenter();
  const referenceX = requestedX ?? (center !== undefined && Number.isFinite(center[0]) ? center[0] : targetX);
  const offset = Math.round((referenceX - targetX) / world.width) * world.width;
  return Number.isFinite(offset) ? offset : 0;
}

/** 按用户投影优先级取得与 MapBrowserEvent.coordinate 一致的水平环绕坐标系。 */
function transformWorldFor(map: Map, binding: FeatureBinding, target: TransformInteractionTarget | undefined): HorizontalWorld | undefined {
  if (target === undefined) return undefined;
  const wrapsX = (binding as FeatureBinding & { wrapsX?: (elementId: string) => boolean }).wrapsX;
  if (typeof wrapsX !== 'function' || !wrapsX.call(binding, target.elementId)) return undefined;
  const projection = getUserProjection() ?? map.getView().getProjection();
  return horizontalWorldFromExtent(projection.getExtent(), projection.canWrapX());
}

/** 返回目标在 Core 规范世界中的稳定水平参考位置。 */
function targetReferenceX(target: TransformInteractionTarget): number {
  return target.controlPoints[0]?.[0] ?? extentCenter(renderExtent(target.geometry))[0];
}

/** 计算视图中心相对固定规范坐标所在的整数世界偏移。 */
function viewWorldOffsetFor(map: Map, world: HorizontalWorld | undefined, referenceX: number): number {
  if (world === undefined) return 0;
  const center = map.getView().getCenter();
  if (center === undefined || !Number.isFinite(center[0])) return 0;
  const offset = Math.round((center[0] - referenceX) / world.width) * world.width;
  return Number.isFinite(offset) ? offset : 0;
}

/** 将展示世界中的中心或顶点坐标恢复为 Core 的规范世界坐标。 */
function canonicalDelta(delta: TransformDelta, worldOffset: number): TransformDelta {
  if (worldOffset === 0 || delta.type === 'translate') return delta;
  if (delta.type === 'vertex') return Object.freeze({ ...delta, coordinate: shiftCoordinate(delta.coordinate, -worldOffset) });
  return Object.freeze({ ...delta, center: shiftCoordinate(delta.center, -worldOffset) });
}

/** 平移坐标并保留可选高度值。 */
function shiftCoordinate(value: Coordinate, x: number): Coordinate {
  return Object.freeze(value.length === 3 ? [value[0] + x, value[1], value[2]] : [value[0] + x, value[1]]) as Coordinate;
}

/** 判断目标是否允许指定手柄操作。 */
function operationAllowed(target: TransformInteractionTarget, operation: TransformOperation): boolean {
  if (operation === 'vertex') return target.mode === 'edit' && target.canEditVertices;
  if (target.mode !== 'transform') return false;
  if (operation === 'translate') return target.canTranslate;
  if (operation === 'rotate') return target.canRotate;
  if (operation === 'scale') return target.canScale;
  if (operation === 'stretch') return target.canStretch;
  return false;
}

/** 根据手柄、起点和中心生成初始变换增量。 */
function initialDelta(hit: ActiveTransformHandleHit, start: Coordinate, center: Coordinate): TransformDelta {
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

/** 判断 OpenLayers 的 pointerup 是否由原生 pointercancel 包装而来。 */
function isPointerCancel(event: PointerMapEvent): boolean {
  return event.type === 'pointercancel' || (event.originalEvent as Readonly<{ type?: unknown }>).type === 'pointercancel';
}

/** 判断命中项是否可启动一次连续 Transform 操作。 */
function hasTransformOperation(hit: TransformHandleHit | undefined): hit is ActiveTransformHandleHit {
  return hit?.operation !== undefined;
}

/** 判断两个悬停命中是否指向同一手柄。 */
function sameHit(left: TransformHandleHit | undefined, right: TransformHandleHit | undefined): boolean {
  if (left?.key !== right?.key || left?.operation !== right?.operation) return false;
  const leftAnchor = left?.anchor;
  const rightAnchor = right?.anchor;
  if (leftAnchor === undefined || rightAnchor === undefined) return leftAnchor === rightAnchor;
  return (
    leftAnchor.kind === rightAnchor.kind &&
    leftAnchor.index === rightAnchor.index &&
    (leftAnchor.kind !== 'control' || rightAnchor.kind !== 'control' || leftAnchor.removable === rightAnchor.removable)
  );
}

/** 按手柄操作和坐标轴选择鼠标样式。 */
function cursorFor(hit: TransformHandleHit): string {
  if (hit.anchor !== undefined || hit.operation === 'translate' || hit.operation === 'vertex') return 'move';
  if (hit.operation === 'rotate') return 'grab';
  if (hit.operation === 'stretch') return hit.axis === 'x' ? 'ew-resize' : 'ns-resize';
  if (hit.key === 'scale-sw' || hit.key === 'scale-ne') return 'nesw-resize';
  return 'nwse-resize';
}
