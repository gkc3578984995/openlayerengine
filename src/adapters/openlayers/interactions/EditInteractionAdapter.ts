import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import Interaction from 'ol/interaction/Interaction.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { unByKey } from 'ol/Observable.js';
import type { EventsKey } from 'ol/events.js';
import { fromUserCoordinate, getUserProjection } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import RBush from 'ol/structs/RBush.js';
import type { Coordinate } from '../../../core/common/types.js';
import { horizontalWorldFromExtent, prepareWorldEdit, type PreparedWorldEdit } from '../../../core/common/worldWrap.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import type {
  EditControlAnchor,
  EditInsertionAnchor,
  EditInteractionAnchor,
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState,
  EditInteractionSpec
} from '../../../core/ports/EditInteractionPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../../core/ports/ErrorReporter.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';
import type { ElementStyleState } from '../../../core/style/types.js';
import type { FeatureBinding, ProjectionSuppressionLease } from '../FeatureBinding.js';
import type { LayerAdapter } from '../LayerAdapter.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';
import {
  EDIT_CONTROL_ANCHOR_HIT_RADIUS,
  EDIT_INSERTION_ANCHOR_HIT_RADIUS,
  composeEditPreviewStyle,
  editAnchorFeedbackStyle,
  editControlAnchorStyle,
  editInsertionAnchorStyle,
  editUnderlayReferenceStyle,
  type EditAnchorFeedbackPhase
} from './EditAnchorVisuals.js';

type EditFeature = Feature<Geometry>;
type EditSource = VectorSource<EditFeature>;
type EditLayer = VectorLayer<EditSource>;

/** 一次完整编辑预览的 Feature 集合。 */
interface RenderBundle {
  readonly source: EditSource;
  features: readonly EditFeature[];
  /** 当前预览中的完整语义锚点，供低频指针事件执行像素命中。 */
  anchors: readonly EditInteractionAnchor[];
  /** 以稳定编辑世界坐标建立的锚点索引，展示世界变化时可在双缓冲间共享。 */
  anchorIndex: RBush<IndexedAnchor>;
  underlay: EditFeature | undefined;
  underlayGeometryState: RenderGeometryState | undefined;
  underlayWorldOffset: number;
  /** 按稳定逻辑槽位复用预览、底图和锚点 Feature。 */
  readonly pool: Map<string, EditFeature>;
}

interface IndexedAnchor {
  readonly anchor: EditInteractionAnchor;
  readonly coordinate: Coordinate;
  readonly order: number;
}

/** 一帧编辑预览在写入屏幕外缓冲前完成校验的不可变计划。 */
interface RenderPlan {
  readonly geometry: RenderGeometryState;
  readonly style: ReturnType<StyleCompiler['compile']>;
  readonly anchors: readonly EditInteractionAnchor[];
  readonly underlayGeometry: RenderGeometryState | undefined;
  readonly underlayStyle: ReturnType<StyleCompiler['compile']> | undefined;
}

/** 浏览器动画帧内只保留最后一次控制点移动。 */
interface PendingMove {
  readonly anchor: EditControlAnchor;
  readonly coordinate: Coordinate;
}

/** 单个编辑预览 Feature 的分步清理进度。 */
interface FeatureCleanupProgress {
  readonly feature: EditFeature;
  geometryCleared: boolean;
  styleCleared: boolean;
  disposed: boolean;
}

/** 一组编辑预览资源的清理进度。 */
interface BundleCleanupProgress {
  source: EditSource | undefined;
  sourceCleared: boolean;
  readonly features: Set<FeatureCleanupProgress>;
}

/**
 * OpenLayers 编辑交互适配器的可选配置。
 *
 * @internal
 */
export interface EditInteractionAdapterOptions {
  /** 接收语义监听器与原生资源清理中的非致命错误。 */
  readonly errorReporter?: ErrorReporter;
  /**
   * 控制点与插入点的像素命中容差，必须为非负有限数。
   *
   * @defaultValue `8`
   */
  readonly hitTolerance?: number;
}

/**
 * 将语义编辑端口映射为独立的 OpenLayers 临时图层、交互、锚点命中测试和投影抑制租约。
 *
 * @internal
 */
export class EditInteractionAdapter implements EditInteractionPort {
  readonly #map: OlMap;
  readonly #layers: LayerAdapter;
  readonly #binding: FeatureBinding;
  readonly #styles: StyleCompiler;
  readonly #errorReporter: ErrorReporter;
  readonly #hitTolerance: number;

  /**
   * 创建编辑交互适配器。
   *
   * @param map 承载临时编辑图层和交互的 OpenLayers 地图。
   * @param layers 解析目标 Element 持久图层及矢量 Source 的适配器。
   * @param binding 管理持久 Feature 身份和投影抑制租约的绑定器。
   * @param styles 将语义样式编译为 OpenLayers 样式的编译器。
   * @param options 错误报告器和命中容差配置。
   * @throws `InvalidArgumentError` 命中容差不是非负有限数时抛出。
   */
  constructor(map: OlMap, layers: LayerAdapter, binding: FeatureBinding, styles: StyleCompiler, options: EditInteractionAdapterOptions = {}) {
    this.#map = map;
    this.#layers = layers;
    this.#binding = binding;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    const hitTolerance = options.hitTolerance ?? 8;
    if (!Number.isFinite(hitTolerance) || hitTolerance < 0) throw new InvalidArgumentError('Edit hitTolerance must be a non-negative finite number');
    this.#hitTolerance = hitTolerance;
  }

  /**
   * 原子安装一次编辑交互，并在成功后返回全部原生资源的所有权句柄。
   *
   * 返回句柄前不会向 `listener` 发布事件；打开失败时先释放投影抑制租约、临时图层和交互，再重新抛出错误。
   *
   * @param spec 目标 Element、进入编辑时的控制点和临时底图配置。
   * @param listener 接收冻结后的语义编辑事件快照。
   * @returns 管理预览、命中锚点、投影交接和销毁重试的编辑句柄。
   * @throws `InvalidArgumentError` 配置、监听器或目标图层不符合契约时抛出。
   * @throws `ObjectDisposedError` 目标 Element 不再具有有效的持久 Feature 绑定时抛出。
   * @throws `AggregateError` 打开失败且原生资源回滚不完整时抛出。
   */
  open(spec: Readonly<EditInteractionSpec>, listener: (event: EditInteractionEvent) => void): EditInteractionHandle {
    const safeSpec = validateSpec(spec);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Edit interaction listener must be a function');

    const persistentFeature = this.#binding.requireFeature(safeSpec.elementId);
    const identity = this.#binding.resolveFeature(persistentFeature);
    if (identity === undefined || identity.elementId !== safeSpec.elementId) {
      throw new ObjectDisposedError(`Element Feature is not bound: ${safeSpec.elementId}`);
    }
    const targetLayer = this.#layers.requireLayer(identity.layerId);
    const persistentSource = this.#layers.requireVectorSource(identity.layerId);
    if (!(targetLayer instanceof VectorLayer) || !(persistentSource instanceof VectorSource) || targetLayer.getSource() !== persistentSource) {
      throw new InvalidArgumentError(`Edit target must be a registered vector layer: ${identity.layerId}`);
    }

    const placement = placementFor(this.#map, persistentSource, safeSpec.controlPoints);
    const suppression = this.#binding.suppressProjection(safeSpec.elementId);
    let transientSource: EditSource | undefined;
    let transientLayer: EditLayer | undefined;
    let handle: OpenLayersEditInteractionHandle | undefined;
    try {
      transientSource = new VectorSource<EditFeature>({ wrapX: false, useSpatialIndex: false });
      const targetZIndex = targetLayer.getZIndex();
      transientLayer = new VectorLayer<EditSource>({
        source: transientSource,
        style: null,
        ...(targetZIndex === undefined ? {} : { zIndex: targetZIndex + 1 })
      });
      const interactionOwner: { handle?: OpenLayersEditInteractionHandle } = {};
      const interaction = new Interaction({ handleEvent: (event) => interactionOwner.handle?.handleEvent(event) ?? true });
      const ownedHandle = new OpenLayersEditInteractionHandle(
        this.#map,
        transientLayer,
        transientSource,
        interaction,
        this.#styles,
        safeSpec,
        placement,
        suppression,
        listener,
        this.#hitTolerance,
        this.#errorReporter
      );
      interactionOwner.handle = ownedHandle;
      handle = ownedHandle;

      this.#map.addLayer(transientLayer);
      if (!containsLayer(this.#map, transientLayer)) throw new InvalidArgumentError('OpenLayers did not attach the edit preview layer');
      this.#map.addInteraction(interaction);
      if (!containsInteraction(this.#map, interaction)) throw new InvalidArgumentError('OpenLayers did not attach the edit interaction');
      handle.handoffSuppression();
      handle.publish();
      return handle;
    } catch (error) {
      if (handle !== undefined) {
        try {
          handle.rollbackOpen();
        } catch (rollbackError) {
          report(this.#errorReporter, rollbackError, 'open-rollback');
          throw new AggregateError([error, rollbackError], 'Edit interaction open failed and rollback was incomplete');
        }
      } else {
        const rollbackFailures: unknown[] = [];
        capture(rollbackFailures, () => suppression.release());
        if (transientLayer !== undefined) capture(rollbackFailures, () => transientLayer?.dispose());
        if (transientSource !== undefined) capture(rollbackFailures, () => transientSource?.dispose());
        for (const rollbackFailure of rollbackFailures) report(this.#errorReporter, rollbackFailure, 'open-rollback');
        if (rollbackFailures.length > 0) {
          throw new AggregateError([error, ...rollbackFailures], 'Edit interaction open failed and rollback was incomplete');
        }
      }
      throw error;
    }
  }
}

/** 管理一次 Edit Session 的临时图层、交互和可重试清理。 */
class OpenLayersEditInteractionHandle implements EditInteractionHandle {
  readonly #map: OlMap;
  readonly #layer: EditLayer;
  readonly #interaction: Interaction;
  readonly #styles: StyleCompiler;
  readonly #spec: Readonly<EditInteractionSpec>;
  readonly #listener: (event: EditInteractionEvent) => void;
  readonly #hitTolerance: number;
  readonly #errorReporter: ErrorReporter;
  #viewCenterKey: EventsKey | undefined;
  /** 等待继续清理的旧预览资源。 */
  readonly #retired = new Set<BundleCleanupProgress>();
  /** 当前编辑在循环世界中的放置结果。 */
  readonly placement: PreparedWorldEdit;
  #suppression: ProjectionSuppressionLease;
  #bundle: RenderBundle | undefined;
  /** 屏幕外等待下一帧更新的双缓冲预览。 */
  #staging: RenderBundle | undefined;
  /** 首次成功渲染时冻结的底图几何。 */
  #underlayGeometry: RenderGeometryState | undefined;
  /** 首次成功渲染时冻结的底图样式。 */
  #underlayStyle: ReturnType<StyleCompiler['compile']> | undefined;
  /** 最近一次成功编译的 Element 样式引用。 */
  #compiledStyleState: ElementStyleState | undefined;
  /** 同一 Edit Session 复用的已编译预览样式。 */
  #compiledStyle: ReturnType<StyleCompiler['compile']> | undefined;
  /** 最近一次成功渲染的 Core 编辑世界计划。 */
  #currentPlan: RenderPlan | undefined;
  /** Core 编辑世界到当前展示世界的水平偏移。 */
  #worldOffset = 0;
  /** 拖拽或渲染期间需要延迟应用的跨世界重定位。 */
  #worldRepositionPending = false;
  #dragAnchor: EditControlAnchor | undefined;
  /** 当前由单个 Point Feature 强调的语义锚点。 */
  #anchorFeedback: EditInteractionAnchor | undefined;
  /** 当前锚点 Feature 的悬停或按下阶段。 */
  #anchorFeedbackPhase: EditAnchorFeedbackPhase | undefined;
  /** 拖拽开始时冻结的展示世界偏移。 */
  #dragPresentationOffset: number | undefined;
  /** 等待下一动画帧发布的最新移动。 */
  #pendingMove: PendingMove | undefined;
  /** 当前移动合并使用的动画帧句柄。 */
  #moveFrame: number | undefined;
  /** 使已取消但仍回调的旧动画帧失效。 */
  #moveFrameToken = 0;
  #published = false;
  #rendering = false;
  #closing = false;
  #destroyRunning = false;
  #deactivated = false;
  #layerRemoved = false;
  #interactionRemoved = false;
  #layerSourceCleared = false;
  #layerDisposed = false;
  #suppressionReleased = false;

  constructor(
    map: OlMap,
    layer: EditLayer,
    source: EditSource,
    interaction: Interaction,
    styles: StyleCompiler,
    spec: Readonly<EditInteractionSpec>,
    placement: PreparedWorldEdit,
    suppression: ProjectionSuppressionLease,
    listener: (event: EditInteractionEvent) => void,
    hitTolerance: number,
    errorReporter: ErrorReporter
  ) {
    this.#map = map;
    this.#layer = layer;
    this.#interaction = interaction;
    this.#styles = styles;
    this.#spec = spec;
    this.placement = placement;
    this.#suppression = suppression;
    this.#listener = listener;
    this.#hitTolerance = hitTolerance;
    this.#errorReporter = errorReporter;
    this.#bundle = emptyRenderBundle(source);
  }

  /** 接管投影抑制租约，使创建阶段的旧句柄失效。 */
  handoffSuppression(): void {
    this.#suppression = this.#suppression.handoff();
  }

  /** 完成安装交接，允许后续事件向 Core 发布。 */
  publish(): void {
    if (this.placement.handoff.kind === 'wrapped') this.#viewCenterKey = this.#map.getView().on('change:center', this.#onViewCenterChange);
    this.#published = true;
  }

  /** 把地图浏览器事件转换为冻结的编辑语义。 */
  handleEvent(event: MapBrowserEvent): boolean {
    if (!this.#published || this.#closing || this.#rendering) return true;
    try {
      const type = event.type;
      if (isPointerCancel(event)) {
        const anchor = this.#dragAnchor;
        this.#cancelPendingMove();
        this.#setAnchorFeedback(undefined);
        if (anchor === undefined) return true;
        this.#dragAnchor = undefined;
        this.#dragPresentationOffset = undefined;
        try {
          this.#emit({ type: 'move-cancel', anchor });
        } finally {
          this.#flushWorldReposition();
        }
        return false;
      }

      if (type === 'pointermove') {
        const coordinate = safeCoordinate(event.coordinate);
        if (coordinate === undefined) return true;
        const anchor = this.#anchorAt(event);
        this.#setAnchorFeedback(anchor, 'hover');
        this.#emit({ type: 'pointer-move', coordinate, ...(anchor === undefined ? {} : { anchor }) });
        return true;
      }

      if (type === 'pointerdown') {
        if (!isPrimary(event, true)) return true;
        const anchor = this.#anchorAt(event, ({ kind }) => kind === 'control');
        if (anchor?.kind === 'control' && !isAlt(event)) {
          const coordinate = this.#canonicalCoordinate(event.coordinate);
          if (coordinate === undefined) return true;
          this.#cancelPendingMove();
          this.#dragAnchor = anchor;
          this.#dragPresentationOffset = this.#worldOffset;
          this.#setAnchorFeedback(anchor, 'active');
          this.#emit({ type: 'move-start', anchor, coordinate });
        }
        return anchor === undefined;
      }

      const dragAnchor = this.#dragAnchor;
      if (dragAnchor !== undefined && type === 'pointerdrag') {
        const coordinate = this.#canonicalCoordinate(event.coordinate);
        if (!isPrimary(event, false) || coordinate === undefined) return false;
        this.#queueMove(dragAnchor, coordinate);
        return false;
      }
      if (dragAnchor !== undefined && type === 'pointerup') {
        this.#flushPendingMove();
        if (this.#closing) return false;
        const coordinate = this.#canonicalCoordinate(event.coordinate);
        const completed = isPrimary(event, false) && coordinate !== undefined;
        this.#dragAnchor = undefined;
        this.#dragPresentationOffset = undefined;
        try {
          if (!completed) this.#emit({ type: 'move-cancel', anchor: dragAnchor });
          else this.#emit({ type: 'move-end', anchor: dragAnchor, coordinate });
        } finally {
          this.#flushWorldReposition();
          this.#restoreHoverAfterMove(event, completed);
        }
        return false;
      }

      if (type !== 'click' || !isPrimary(event, true)) return true;
      const hovered = this.#anchorAt(event);
      if (!isAlt(event)) return hovered === undefined;
      const anchor = this.#anchorAt(event, (candidate) => candidate.kind === 'insertion' || candidate.removable);
      if (anchor?.kind === 'insertion') {
        this.#setAnchorFeedback(undefined);
        this.#emit({ type: 'insert', anchor });
        return false;
      }
      if (anchor?.kind === 'control') {
        this.#setAnchorFeedback(undefined);
        this.#emit({ type: 'remove', anchor });
        return false;
      }
      return hovered === undefined;
    } catch (error) {
      report(this.#errorReporter, error, 'input');
      return true;
    }
  }

  /** 原子替换当前编辑预览。 */
  render(state: Readonly<EditInteractionRenderState>): void {
    if (this.#closing) throw new ObjectDisposedError('Edit interaction has been destroyed');
    if (this.#rendering) throw new InvalidArgumentError('Edit interaction render is already in progress');
    this.#rendering = true;
    try {
      this.#requireBundle();
      const safeState = validateRenderState(state);
      const geometry = validateRenderGeometry(safeState.geometry);
      const plan = prepareRenderPlan(
        safeState,
        geometry,
        this.#styleFor(safeState.style),
        this.#spec.underlay ? this.#underlayGeometry : undefined,
        this.#spec.underlay ? this.#underlayStyle : undefined,
        this.#spec.underlay
      );
      const preserveAnchorFeedback = this.#dragAnchor !== undefined;
      this.#renderPreparedPlan(plan, this.#worldOffset, undefined, preserveAnchorFeedback);
      this.#currentPlan = plan;
      if (!preserveAnchorFeedback) {
        this.#anchorFeedback = undefined;
        this.#anchorFeedbackPhase = undefined;
      }
    } finally {
      this.#rendering = false;
      this.#flushWorldReposition();
    }
  }

  /** 把已校验计划写入屏幕外缓冲，并原子交接给临时图层。 */
  #renderPreparedPlan(plan: RenderPlan, worldOffset: number, reusableAnchorIndex?: RBush<IndexedAnchor>, preserveAnchorFeedback = true): void {
    let prepared: RenderBundle | undefined = this.#takeStaging();
    try {
      try {
        syncRenderBundle(
          prepared,
          plan,
          worldOffset,
          this.#map,
          preserveAnchorFeedback ? this.#anchorFeedback : undefined,
          preserveAnchorFeedback ? this.#anchorFeedbackPhase : undefined,
          reusableAnchorIndex
        );
      } catch (error) {
        this.#retire(prepared, 'render-prepared-cleanup');
        prepared = undefined;
        throw error;
      }
      if (this.#closing) throw new ObjectDisposedError('Edit interaction was destroyed during render');
      const previousSource = this.#layer.getSource();
      try {
        this.#layer.setSource(prepared.source);
        if (this.#layer.getSource() !== prepared.source) throw new CapabilityError('OpenLayers did not install the edit render snapshot');
        if (this.#closing) throw new ObjectDisposedError('Edit interaction was destroyed during render');
      } catch (error) {
        if (!this.#closing) {
          try {
            this.#restoreSource(previousSource);
          } catch (rollbackError) {
            report(this.#errorReporter, rollbackError, 'render-source-rollback-failed');
          }
        }
        if (this.#closing) {
          this.#retireAfterClosing(prepared, 'render-closing-cleanup');
          prepared = undefined;
          throw error;
        }
        if (this.#layer.getSource() === previousSource) {
          this.#keepStaging(prepared);
          prepared = undefined;
        } else {
          this.#adopt(prepared);
          this.#commitUnderlay(plan);
          prepared = undefined;
          this.#closing = true;
          this.#published = false;
        }
        throw error;
      }
      this.#adopt(prepared);
      this.#commitUnderlay(plan);
      prepared = undefined;
      if (this.#closing) throw new ObjectDisposedError('Edit interaction was destroyed during render');
    } finally {
      if (prepared !== undefined && (this.#closing || this.#layer.getSource() !== prepared.source)) {
        if (this.#closing) this.#retireAfterClosing(prepared, 'render-closing-cleanup');
        else this.#retire(prepared, 'render-prepared-cleanup');
      }
    }
  }

  /** 分步移除并销毁全部编辑资源。 */
  destroy(): void {
    if (this.#destroyComplete() || this.#destroyRunning) return;
    this.#closing = true;
    this.#published = false;
    this.#dragAnchor = undefined;
    this.#anchorFeedback = undefined;
    this.#anchorFeedbackPhase = undefined;
    this.#dragPresentationOffset = undefined;
    this.#worldRepositionPending = false;
    this.#cancelPendingMove();
    this.#currentPlan = undefined;
    this.#underlayGeometry = undefined;
    this.#underlayStyle = undefined;
    this.#compiledStyleState = undefined;
    this.#compiledStyle = undefined;
    const failures: unknown[] = [];
    this.#destroyRunning = true;
    try {
      const viewCenterKey = this.#viewCenterKey;
      if (viewCenterKey !== undefined) {
        const failureCount = failures.length;
        capture(failures, () => unByKey(viewCenterKey));
        if (failures.length === failureCount && this.#viewCenterKey === viewCenterKey) this.#viewCenterKey = undefined;
      }
      if (!this.#deactivated) {
        capture(failures, () => this.#interaction.setActive(false));
        inspect(
          failures,
          () => this.#interaction.getActive(),
          (active) => {
            if (!active) this.#deactivated = true;
          }
        );
      }
      if (!this.#layerRemoved) {
        capture(failures, () => this.#map.removeLayer(this.#layer));
        inspect(
          failures,
          () => containsLayer(this.#map, this.#layer),
          (attached) => {
            if (!attached) this.#layerRemoved = true;
          }
        );
      }
      if (!this.#interactionRemoved) {
        capture(failures, () => this.#map.removeInteraction(this.#interaction));
        inspect(
          failures,
          () => containsInteraction(this.#map, this.#interaction),
          (attached) => {
            if (!attached) {
              this.#interactionRemoved = true;
              this.#deactivated = true;
            }
          }
        );
      }
      const current = this.#bundle;
      if (current !== undefined) {
        this.#bundle = undefined;
        this.#enqueueRetirement(current);
      }
      const staging = this.#staging;
      if (staging !== undefined) {
        this.#staging = undefined;
        if (staging !== current) this.#enqueueRetirement(staging);
      }
      this.#cleanupRetired(failures);
      if (!this.#layerSourceCleared) {
        capture(failures, () => this.#layer.setSource(null));
        inspect(
          failures,
          () => this.#layer.getSource(),
          (source) => {
            if (source === null) this.#layerSourceCleared = true;
          }
        );
      }
      if (!this.#layerDisposed) {
        const failureCount = failures.length;
        capture(failures, () => this.#layer.dispose());
        if (failures.length === failureCount) this.#layerDisposed = true;
      }
      if (!this.#suppressionReleased) {
        capture(failures, () => this.#suppression.release());
        inspect(
          failures,
          () => this.#suppression.active,
          (active) => {
            if (!active) this.#suppressionReleased = true;
          }
        );
      }
    } finally {
      this.#destroyRunning = false;
    }

    for (const failure of failures) report(this.#errorReporter, failure, 'destroy');
    if (failures.length > 0) throw failures[0];
  }

  /** 打开失败时尽力回滚尚未发布的全部资源。 */
  rollbackOpen(): void {
    this.#closing = true;
    this.#published = false;
    let firstFailure: unknown;
    for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
      try {
        this.destroy();
        if (this.#destroyComplete()) return;
      } catch (error) {
        firstFailure ??= error;
        report(this.#errorReporter, error, 'open-rollback-retry');
      }
    }

    if (containsInteraction(this.#map, this.#interaction)) {
      attempt(
        this.#errorReporter,
        () => {
          this.#map.getInteractions().remove(this.#interaction);
          this.#interaction.setMap(null);
        },
        'open-rollback-interaction-collection'
      );
      if (!containsInteraction(this.#map, this.#interaction)) {
        this.#interactionRemoved = true;
        this.#deactivated = true;
      }
    }
    if (containsLayer(this.#map, this.#layer)) {
      attempt(this.#errorReporter, () => this.#map.getLayers().remove(this.#layer), 'open-rollback-layer-collection');
      if (!containsLayer(this.#map, this.#layer)) this.#layerRemoved = true;
    }
    try {
      this.destroy();
    } catch (error) {
      firstFailure ??= error;
    }
    if (!this.#destroyComplete()) throw firstFailure ?? new CapabilityError('Edit interaction open rollback did not complete');
  }

  /** 将临时图层恢复到更新前的 Source。 */
  #restoreSource(previousSource: EditSource | null): void {
    if (this.#closing || this.#layer.getSource() === previousSource) return;
    let firstFailure: unknown;
    for (let attemptIndex = 0; attemptIndex < 2 && !this.#closing && this.#layer.getSource() !== previousSource; attemptIndex += 1) {
      try {
        this.#layer.setSource(previousSource);
      } catch (error) {
        firstFailure ??= error;
        report(this.#errorReporter, error, 'render-source-rollback');
      }
    }
    if (this.#closing) return;
    if (this.#layer.getSource() !== previousSource) {
      throw firstFailure ?? new CapabilityError('Edit render source rollback did not restore the previous snapshot');
    }
  }

  /** 取得屏幕外缓冲；首次渲染时只额外创建一个 Source。 */
  #takeStaging(): RenderBundle {
    const staging = this.#staging ?? emptyRenderBundle(new VectorSource<EditFeature>({ wrapX: false, useSpatialIndex: false }));
    this.#staging = undefined;
    return staging;
  }

  /** 失败回滚后保留已准备好的屏幕外缓冲，供下一帧原位更新。 */
  #keepStaging(bundle: RenderBundle): void {
    if (this.#closing) {
      this.#retireAfterClosing(bundle, 'render-closing-cleanup');
      return;
    }
    const previous = this.#staging;
    this.#staging = bundle;
    if (previous !== undefined && previous !== bundle) this.#retire(previous, 'render-staging-replace');
  }

  /** 接管新的预览资源并把上一帧转为下一次更新使用的屏幕外缓冲。 */
  #adopt(bundle: RenderBundle): void {
    if (this.#closing) throw new ObjectDisposedError('Edit interaction was destroyed during render');
    const previous = this.#bundle;
    this.#bundle = bundle;
    this.#staging = previous;
  }

  /** 首次成功交接时冻结底图的几何与样式，后续双缓冲只复用该快照。 */
  #commitUnderlay(plan: RenderPlan): void {
    if (!this.#spec.underlay || this.#underlayGeometry !== undefined) return;
    if (plan.underlayGeometry === undefined || plan.underlayStyle === undefined) {
      throw new CapabilityError('Edit underlay snapshot was not prepared');
    }
    this.#underlayGeometry = plan.underlayGeometry;
    this.#underlayStyle = plan.underlayStyle;
  }

  /** 样式引用未变化时复用编译结果；失败不会污染上一份可用缓存。 */
  #styleFor(style: ElementStyleState): ReturnType<StyleCompiler['compile']> {
    if (this.#compiledStyleState === style && this.#compiledStyle !== undefined) return this.#compiledStyle;
    const compiled = this.#styles.compile(style);
    this.#compiledStyleState = style;
    this.#compiledStyle = compiled;
    return compiled;
  }

  /** 原位切换单个锚点反馈，不重建批量锚点或命中索引。 */
  #setAnchorFeedback(anchor: EditInteractionAnchor | undefined, phase?: EditAnchorFeedbackPhase): void {
    const nextPhase = anchor === undefined ? undefined : (phase ?? 'hover');
    if (sameAnchorIdentity(this.#anchorFeedback, anchor) && this.#anchorFeedbackPhase === nextPhase) return;
    this.#anchorFeedback = anchor;
    this.#anchorFeedbackPhase = nextPhase;
    const bundle = this.#bundle;
    if (bundle === undefined) return;
    syncAnchorFeedbackFeature(bundle, this.#worldOffset, anchor, nextPhase);
  }

  /** 拖拽结束后按释放像素重新命中，并同步校正反馈、光标与 Tooltip。 */
  #restoreHoverAfterMove(event: MapBrowserEvent, completed: boolean): void {
    if (!completed || this.#closing || !this.#published) {
      this.#setAnchorFeedback(undefined);
      return;
    }
    const coordinate = safeCoordinate(event.coordinate);
    if (coordinate === undefined) {
      this.#setAnchorFeedback(undefined);
      return;
    }
    const anchor = this.#anchorAt(event);
    this.#setAnchorFeedback(anchor, 'hover');
    this.#emit({ type: 'pointer-move', coordinate, ...(anchor === undefined ? {} : { anchor }) });
  }

  /** 取得当前预览；销毁或尚未渲染时统一报错。 */
  #requireBundle(): RenderBundle {
    const bundle = this.#bundle;
    if (bundle === undefined) throw new ObjectDisposedError('Edit interaction has been destroyed');
    return bundle;
  }

  /** 把展示世界中的输入坐标恢复为本次编辑固定的 Core 世界坐标。 */
  #canonicalCoordinate(value: unknown): Coordinate | undefined {
    const coordinate = safeCoordinate(value);
    if (coordinate === undefined) return undefined;
    const frozenOffset = this.#dragPresentationOffset ?? this.#worldOffset;
    const viewOffset = this.#dragPresentationOffset === undefined ? frozenOffset : worldOffsetForEdit(this.#map, this.placement);
    const replayOffset = frozenOffset - viewOffset;
    const replayed = replayOffset === 0 ? coordinate : shiftCoordinate(coordinate, replayOffset);
    return frozenOffset === 0 ? replayed : shiftCoordinate(replayed, -frozenOffset);
  }

  /** 视图跨越整数世界时更新预览副本；拖拽和渲染期间只记录待处理状态。 */
  readonly #onViewCenterChange = (): void => {
    if (this.#closing || !this.#published) return;
    try {
      this.#repositionForView();
    } catch (error) {
      report(this.#errorReporter, error, 'view-center');
    }
  };

  /** 在安全时机应用待处理的展示世界重定位，不把失败传播到输入或渲染调用方。 */
  #flushWorldReposition(): void {
    if (!this.#worldRepositionPending || this.#closing || !this.#published || this.#dragAnchor !== undefined || this.#rendering) return;
    try {
      this.#repositionForView();
    } catch (error) {
      report(this.#errorReporter, error, 'view-center-pending');
    }
  }

  /** 仅在整数世界发生变化时，以双缓冲方式整体平移预览和锚点索引。 */
  #repositionForView(): void {
    if (this.#closing || !this.#published) return;
    if (this.#dragAnchor !== undefined || this.#rendering) {
      this.#worldRepositionPending = true;
      return;
    }
    const nextOffset = worldOffsetForEdit(this.#map, this.placement);
    if (nextOffset === this.#worldOffset) {
      this.#worldRepositionPending = false;
      return;
    }
    const plan = this.#currentPlan;
    if (plan === undefined) {
      this.#worldOffset = nextOffset;
      this.#worldRepositionPending = false;
      return;
    }
    this.#worldRepositionPending = false;
    this.#rendering = true;
    try {
      this.#renderPreparedPlan(plan, nextOffset, this.#requireBundle().anchorIndex);
      this.#worldOffset = nextOffset;
    } catch (error) {
      this.#worldRepositionPending = true;
      throw error;
    } finally {
      this.#rendering = false;
    }
  }

  /** 先按当前输入语义过滤候选，再在有效锚点中选择像素距离最近项。 */
  #anchorAt(event: MapBrowserEvent, accepts: (anchor: EditInteractionAnchor) => boolean = () => true): EditInteractionAnchor | undefined {
    const pixel = safePixel(event.pixel);
    if (pixel === undefined) return undefined;
    const bundle = this.#requireBundle();
    const coordinate = safeCoordinate(this.#map.getCoordinateFromPixelInternal(pixel as unknown as number[]));
    if (coordinate === undefined) return undefined;
    const indexWorldOffset = internalWorldOffsetForEdit(this.#map, this.placement, this.#worldOffset);
    const indexCoordinate: Coordinate = indexWorldOffset === 0 ? coordinate : Object.freeze([coordinate[0] - indexWorldOffset, coordinate[1]]);
    const resolution = this.#map.getView().getResolution();
    const maximumTolerance = this.#hitTolerance + Math.max(EDIT_CONTROL_ANCHOR_HIT_RADIUS, EDIT_INSERTION_ANCHOR_HIT_RADIUS);
    const candidates =
      resolution !== undefined && Number.isFinite(resolution) && resolution > 0
        ? bundle.anchorIndex.getInExtent([
            indexCoordinate[0] - maximumTolerance * resolution,
            indexCoordinate[1] - maximumTolerance * resolution,
            indexCoordinate[0] + maximumTolerance * resolution,
            indexCoordinate[1] + maximumTolerance * resolution
          ])
        : bundle.anchorIndex.getAll();
    let best: EditInteractionAnchor | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestOrder = -1;
    for (const indexed of candidates) {
      const anchor = indexed.anchor;
      if (!accepts(anchor)) continue;
      const presentationCoordinate = this.#worldOffset === 0 ? indexed.coordinate : shiftCoordinate(indexed.coordinate, this.#worldOffset);
      const anchorPixel = safePixel(this.#map.getPixelFromCoordinate(presentationCoordinate as unknown as number[]));
      if (anchorPixel === undefined) continue;
      const deltaX = anchorPixel[0] - pixel[0];
      const deltaY = anchorPixel[1] - pixel[1];
      const distance = deltaX * deltaX + deltaY * deltaY;
      const radius = anchor.kind === 'control' ? EDIT_CONTROL_ANCHOR_HIT_RADIUS : EDIT_INSERTION_ANCHOR_HIT_RADIUS;
      const tolerance = radius + this.#hitTolerance;
      if (distance > tolerance * tolerance) continue;
      const winsEqualDistance =
        distance === bestDistance &&
        (best === undefined || (anchor.kind === 'control' && best.kind === 'insertion') || (anchor.kind === best.kind && indexed.order > bestOrder));
      if (distance < bestDistance || winsEqualDistance) {
        best = anchor;
        bestDistance = distance;
        bestOrder = indexed.order;
      }
    }
    return best;
  }

  /** 浏览器中把同一动画帧内的 pointerdrag 合并为最后一个坐标；无 rAF 时保持同步语义。 */
  #queueMove(anchor: EditControlAnchor, coordinate: Coordinate): void {
    const requestFrame = globalThis.requestAnimationFrame;
    if (typeof requestFrame !== 'function') {
      this.#emit({ type: 'move', anchor, coordinate });
      return;
    }
    this.#pendingMove = { anchor, coordinate };
    if (this.#moveFrame !== undefined) return;
    const token = ++this.#moveFrameToken;
    try {
      this.#moveFrame = requestFrame.call(globalThis, () => {
        if (token !== this.#moveFrameToken) return;
        this.#moveFrame = undefined;
        const pending = this.#pendingMove;
        this.#pendingMove = undefined;
        if (pending === undefined || this.#closing || !this.#published || this.#dragAnchor !== pending.anchor) return;
        this.#emit({ type: 'move', anchor: pending.anchor, coordinate: pending.coordinate });
      });
    } catch (error) {
      this.#moveFrame = undefined;
      this.#pendingMove = undefined;
      report(this.#errorReporter, error, 'move-frame-request');
      this.#emit({ type: 'move', anchor, coordinate });
    }
  }

  /** pointerup 前同步发布最后一个待处理移动，保证 move-end 的事件顺序。 */
  #flushPendingMove(): void {
    const pending = this.#pendingMove;
    this.#pendingMove = undefined;
    this.#cancelMoveFrame();
    if (pending === undefined || this.#closing || !this.#published || this.#dragAnchor !== pending.anchor) return;
    this.#emit({ type: 'move', anchor: pending.anchor, coordinate: pending.coordinate });
  }

  /** 取消待处理移动，供 cancel 与 destroy 阶段阻止迟到回调。 */
  #cancelPendingMove(): void {
    this.#pendingMove = undefined;
    this.#cancelMoveFrame();
  }

  /** 取消当前动画帧并使无法取消的迟到回调失效。 */
  #cancelMoveFrame(): void {
    const frame = this.#moveFrame;
    this.#moveFrame = undefined;
    this.#moveFrameToken += 1;
    const cancelFrame = globalThis.cancelAnimationFrame;
    if (frame === undefined || typeof cancelFrame !== 'function') return;
    try {
      cancelFrame.call(globalThis, frame);
    } catch (error) {
      report(this.#errorReporter, error, 'move-frame-cancel');
    }
  }

  /** 监听器异常只进入错误通道，不反向破坏原生交互。 */
  #emit(event: EditInteractionEvent): void {
    try {
      this.#listener(freezeEvent(event));
    } catch (error) {
      report(this.#errorReporter, error, `listener:${event.type}`);
    }
  }

  /** 将旧预览加入清理队列并立即尝试清理。 */
  #retire(bundle: RenderBundle, operation: string): void {
    this.#enqueueRetirement(bundle);
    const failures: unknown[] = [];
    this.#cleanupRetired(failures);
    for (const failure of failures) report(this.#errorReporter, failure, operation);
  }

  /** 关闭阶段将预览加入清理队列并上报失败。 */
  #retireAfterClosing(bundle: RenderBundle, operation: string): void {
    if (this.#layer.getSource() !== null) this.#layerSourceCleared = false;
    this.#retire(bundle, operation);
  }

  /** 为一组旧预览资源建立清理进度。 */
  #enqueueRetirement(bundle: RenderBundle): void {
    this.#retired.add({
      source: bundle.source,
      sourceCleared: false,
      features: new Set(
        [...bundle.pool.values()].map((feature) => ({
          feature,
          geometryCleared: false,
          styleCleared: false,
          disposed: false
        }))
      )
    });
  }

  /** 继续清理全部旧预览资源。 */
  #cleanupRetired(failures: unknown[]): void {
    for (const progress of [...this.#retired]) {
      this.#cleanupRetirement(progress, failures);
      if (progress.source === undefined && progress.features.size === 0) this.#retired.delete(progress);
    }
  }

  /** 分步清理一组旧预览资源。 */
  #cleanupRetirement(progress: BundleCleanupProgress, failures: unknown[]): void {
    const source = progress.source;
    if (source !== undefined && !progress.sourceCleared) {
      const failureCount = failures.length;
      capture(failures, () => source.clear(true));
      inspect(
        failures,
        () => source.getFeatures().length === 0,
        (cleared) => {
          progress.sourceCleared = cleared;
        }
      );
      if (!progress.sourceCleared && failures.length === failureCount) {
        failures.push(new CapabilityError('OpenLayers did not clear an edit preview source'));
      }
    }

    if (!progress.sourceCleared) return;
    for (const featureProgress of [...progress.features]) {
      this.#cleanupRetiredFeature(featureProgress, failures);
      if (featureProgress.geometryCleared && featureProgress.styleCleared && featureProgress.disposed) progress.features.delete(featureProgress);
    }

    if (source !== undefined) {
      const failureCount = failures.length;
      capture(failures, () => source.dispose());
      if (failures.length === failureCount) progress.source = undefined;
    }
  }

  /** 分步清理一个旧预览 Feature。 */
  #cleanupRetiredFeature(progress: FeatureCleanupProgress, failures: unknown[]): void {
    const feature = progress.feature;
    if (!progress.geometryCleared) {
      const failureCount = failures.length;
      capture(failures, () => feature.setGeometry(undefined));
      inspect(
        failures,
        () => feature.getGeometry() === undefined,
        (cleared) => {
          progress.geometryCleared = cleared;
        }
      );
      if (!progress.geometryCleared && failures.length === failureCount) {
        failures.push(new CapabilityError('OpenLayers did not clear an edit preview geometry'));
      }
    }
    if (!progress.styleCleared) {
      const failureCount = failures.length;
      capture(failures, () => feature.setStyle(undefined));
      inspect(
        failures,
        () => feature.getStyle() === undefined,
        (cleared) => {
          progress.styleCleared = cleared;
        }
      );
      if (!progress.styleCleared && failures.length === failureCount) {
        failures.push(new CapabilityError('OpenLayers did not clear an edit preview style'));
      }
    }
    if (!progress.disposed) {
      const failureCount = failures.length;
      capture(failures, () => feature.dispose());
      progress.disposed = failures.length === failureCount;
    }
  }

  /** 判断 Edit Session 的全部销毁步骤是否完成。 */
  #destroyComplete(): boolean {
    return (
      this.#deactivated &&
      this.#layerRemoved &&
      this.#interactionRemoved &&
      this.#viewCenterKey === undefined &&
      this.#layerSourceCleared &&
      this.#bundle === undefined &&
      this.#staging === undefined &&
      this.#retired.size === 0 &&
      this.#layerDisposed &&
      this.#suppressionReleased
    );
  }
}

/** 校验并冻结编辑交互配置。 */
function validateSpec(spec: Readonly<EditInteractionSpec>): Readonly<EditInteractionSpec> {
  if (spec === null || typeof spec !== 'object') throw new InvalidArgumentError('Edit interaction spec must be an object');
  if (typeof spec.elementId !== 'string' || spec.elementId.trim().length === 0) {
    throw new InvalidArgumentError('Edit interaction elementId must be a non-empty string');
  }
  if (!Array.isArray(spec.controlPoints)) throw new InvalidArgumentError('Edit interaction controlPoints must be an array');
  if (typeof spec.underlay !== 'boolean') throw new InvalidArgumentError('Edit interaction underlay must be boolean');
  return Object.freeze({
    elementId: spec.elementId,
    controlPoints: Object.freeze(spec.controlPoints.map((coordinate) => Object.freeze(copyCoordinate(coordinate)))),
    underlay: spec.underlay
  });
}

/** 根据目标图层和控制点选择合适的循环世界。 */
function placementFor(map: OlMap, source: EditSource, controlPoints: readonly Coordinate[]): PreparedWorldEdit {
  const projection = getUserProjection() ?? source.getProjection() ?? map.getView().getProjection();
  const world = horizontalWorldFromExtent(projection.getExtent(), source.getWrapX() === true && projection.canWrapX());
  const center = map.getView().getCenter();
  const referenceX = center !== undefined && Number.isFinite(center[0]) ? center[0] : controlPoints[0]?.[0];
  return prepareWorldEdit(controlPoints, { ...(world === undefined ? {} : { world }), ...(referenceX === undefined ? {} : { referenceX }) });
}

/** 计算初始编辑世界到当前视图最近整数世界副本的水平偏移。 */
function worldOffsetForEdit(map: OlMap, placement: PreparedWorldEdit): number {
  if (placement.handoff.kind === 'identity') return 0;
  const reference = placement.controlPoints[0];
  const center = map.getView().getCenter();
  if (reference === undefined || center === undefined || !Number.isFinite(center[0])) return 0;
  const offset = Math.round((center[0] - reference[0]) / placement.handoff.world.width) * placement.handoff.world.width;
  return Number.isFinite(offset) ? offset : 0;
}

/** 把编辑坐标系中的展示世界偏移转换为锚点 RBush 使用的视图投影单位。 */
function internalWorldOffsetForEdit(map: OlMap, placement: PreparedWorldEdit, worldOffset: number): number {
  if (worldOffset === 0 || placement.handoff.kind === 'identity') return 0;
  const reference = placement.controlPoints[0];
  if (reference === undefined) return 0;
  const stable = coordinateForIndex(map, reference);
  const presented = coordinateForIndex(map, shiftCoordinate(reference, worldOffset));
  const offset = presented[0] - stable[0];
  if (!Number.isFinite(offset)) throw new InvalidArgumentError('Edit anchor world offset must be finite in the view projection');
  return offset;
}

function shiftCoordinate(coordinate: Coordinate, offset: number): Coordinate {
  const x = coordinate[0] + offset;
  if (!Number.isFinite(x)) throw new InvalidArgumentError('Shifted edit world coordinate must be finite');
  return Object.freeze(coordinate.length === 3 ? [x, coordinate[1], coordinate[2]] : [x, coordinate[1]]) as Coordinate;
}

/** 创建尚未写入任何预览 Feature 的双缓冲资源。 */
function emptyRenderBundle(source: EditSource): RenderBundle {
  return {
    source,
    features: [],
    anchors: [],
    anchorIndex: new RBush<IndexedAnchor>(),
    underlay: undefined,
    underlayGeometryState: undefined,
    underlayWorldOffset: 0,
    pool: new Map()
  };
}

/** 校验渲染状态外壳，并保留原始样式引用供 Session 级缓存命中。 */
function validateRenderState(state: Readonly<EditInteractionRenderState>): Readonly<EditInteractionRenderState> {
  if (state === null || typeof state !== 'object') throw new InvalidArgumentError('Edit render state must be an object');
  if (!Array.isArray(state.anchors)) throw new InvalidArgumentError('Edit render anchors must be an array');
  return state;
}

/** 在写入屏幕外缓冲前校验并冻结一帧完整渲染计划。 */
function prepareRenderPlan(
  state: Readonly<EditInteractionRenderState>,
  geometry: RenderGeometryState,
  style: ReturnType<StyleCompiler['compile']>,
  existingUnderlayGeometry: RenderGeometryState | undefined,
  existingUnderlayStyle: ReturnType<StyleCompiler['compile']> | undefined,
  includeUnderlay: boolean
): RenderPlan {
  const anchors = snapshotAnchors(state.anchors);
  const stableGeometry = renderGeometryIsFrozen(geometry) ? geometry : snapshotRenderGeometry(geometry);
  return Object.freeze({
    geometry: stableGeometry,
    style,
    anchors,
    underlayGeometry: includeUnderlay ? (existingUnderlayGeometry ?? stableGeometry) : undefined,
    underlayStyle: includeUnderlay ? (existingUnderlayStyle ?? editUnderlayReferenceStyle) : undefined
  });
}

/** 一次线性校验渲染几何；OpenLayers setter 会在当前调用内复制坐标。 */
function validateRenderGeometry(state: RenderGeometryState): RenderGeometryState {
  if (state === null || typeof state !== 'object') throw new InvalidArgumentError('Edit preview geometry must be an object');
  if (state.type === 'point') {
    assertCoordinate(state.coordinates);
    return state;
  }
  if (state.type === 'polyline') {
    if (!Array.isArray(state.coordinates)) throw new InvalidArgumentError('Edit preview polyline coordinates must be an array');
    for (const coordinate of state.coordinates) assertCoordinate(coordinate);
    return state;
  }
  if (state.type === 'polygon') {
    if (!Array.isArray(state.coordinates)) throw new InvalidArgumentError('Edit preview polygon coordinates must be an array');
    for (const ring of state.coordinates) {
      if (!Array.isArray(ring)) throw new InvalidArgumentError('Edit preview polygon ring must be an array');
      for (const coordinate of ring) assertCoordinate(coordinate);
    }
    return state;
  }
  if (state.type === 'circle') {
    assertCoordinate(state.center);
    if (!Number.isFinite(state.radius) || state.radius < 0) throw new InvalidArgumentError('Edit preview circle radius must be a finite non-negative number');
    return state;
  }
  throw new InvalidArgumentError('Unknown edit preview geometry type');
}

/** 原位更新屏幕外缓冲中的 Feature、Geometry 与 Source 差异。 */
function syncRenderBundle(
  bundle: RenderBundle,
  plan: RenderPlan,
  worldOffset: number,
  map: OlMap,
  feedbackAnchor: EditInteractionAnchor | undefined,
  feedbackPhase: EditAnchorFeedbackPhase | undefined,
  reusableAnchorIndex?: RBush<IndexedAnchor>
): void {
  const anchorIndex = reusableAnchorIndex ?? createAnchorIndex(plan.anchors, map);
  const preview = pooledFeature(bundle, 'preview');
  updateFeatureGeometry(preview, plan.geometry, worldOffset);
  const previewStyle = composeEditPreviewStyle(plan.style);
  if (preview.getStyle() !== previewStyle) preview.setStyle(previewStyle);

  let underlay: EditFeature | undefined;
  if (plan.underlayGeometry !== undefined && plan.underlayStyle !== undefined) {
    underlay = pooledFeature(bundle, 'underlay');
    if (bundle.underlayGeometryState !== plan.underlayGeometry || bundle.underlayWorldOffset !== worldOffset || underlay.getGeometry() === undefined) {
      updateFeatureGeometry(underlay, plan.underlayGeometry, worldOffset);
      bundle.underlayGeometryState = plan.underlayGeometry;
      bundle.underlayWorldOffset = worldOffset;
    }
    if (underlay.getStyle() !== plan.underlayStyle) underlay.setStyle(plan.underlayStyle);
  } else {
    bundle.underlayGeometryState = undefined;
    bundle.underlayWorldOffset = 0;
  }
  const controlCoordinates: Coordinate[] = [];
  const insertionCoordinates: Coordinate[] = [];
  let feedbackCoordinate: Coordinate | undefined;
  for (let order = 0; order < plan.anchors.length; order += 1) {
    const anchor = plan.anchors[order];
    if (anchor === undefined) continue;
    const coordinate = worldOffset === 0 ? anchor.coordinate : shiftCoordinate(anchor.coordinate, worldOffset);
    if (anchor.kind === 'control') controlCoordinates.push(coordinate);
    else insertionCoordinates.push(coordinate);
    if (feedbackCoordinate === undefined && sameAnchorIdentity(anchor, feedbackAnchor)) feedbackCoordinate = coordinate;
  }

  let insertionAnchors: EditFeature | undefined;
  if (insertionCoordinates.length > 0) {
    insertionAnchors = pooledFeature(bundle, 'anchors:insertion');
    updateMultiPointGeometry(insertionAnchors, insertionCoordinates);
    if (insertionAnchors.getStyle() !== editInsertionAnchorStyle) insertionAnchors.setStyle(editInsertionAnchorStyle);
  }
  let controlAnchors: EditFeature | undefined;
  if (controlCoordinates.length > 0) {
    controlAnchors = pooledFeature(bundle, 'anchors:control');
    updateMultiPointGeometry(controlAnchors, controlCoordinates);
    if (controlAnchors.getStyle() !== editControlAnchorStyle) controlAnchors.setStyle(editControlAnchorStyle);
  }
  let feedback: EditFeature | undefined;
  if (feedbackCoordinate !== undefined && feedbackAnchor !== undefined && feedbackPhase !== undefined) {
    feedback = pooledFeature(bundle, 'anchors:feedback');
    updateAnchorFeedbackFeature(feedback, feedbackCoordinate, feedbackAnchor, feedbackPhase);
  } else {
    const inactiveFeedback = bundle.pool.get('anchors:feedback');
    if (inactiveFeedback?.getGeometry() !== undefined) inactiveFeedback.setGeometry(undefined);
  }
  const features: readonly EditFeature[] = Object.freeze([
    ...(underlay === undefined ? [] : [underlay]),
    preview,
    ...(insertionAnchors === undefined ? [] : [insertionAnchors]),
    ...(controlAnchors === undefined ? [] : [controlAnchors]),
    ...(feedback === undefined ? [] : [feedback])
  ]);
  syncBundleSource(bundle, features);
  bundle.features = features;
  bundle.anchors = plan.anchors;
  bundle.anchorIndex = anchorIndex;
  bundle.underlay = underlay;
}

/** 只在语义锚点计划变化时构建新索引；索引坐标不包含动态展示世界偏移。 */
function createAnchorIndex(anchors: readonly EditInteractionAnchor[], map: OlMap): RBush<IndexedAnchor> {
  const index = new RBush<IndexedAnchor>();
  if (anchors.length === 0) return index;
  const indexedAnchors: IndexedAnchor[] = [];
  const anchorExtents: number[][] = [];
  for (let order = 0; order < anchors.length; order += 1) {
    const anchor = anchors[order];
    if (anchor === undefined) continue;
    const internalCoordinate = coordinateForIndex(map, anchor.coordinate);
    indexedAnchors.push({ anchor, coordinate: anchor.coordinate, order });
    anchorExtents.push([internalCoordinate[0], internalCoordinate[1], internalCoordinate[0], internalCoordinate[1]]);
  }
  if (indexedAnchors.length > 0) index.load(anchorExtents, indexedAnchors);
  return index;
}

/** 把用户投影中的展示坐标转换为视图投影，供 RBush 与分辨率使用同一单位。 */
function coordinateForIndex(map: OlMap, coordinate: Coordinate): readonly [number, number] {
  const transformed = getUserProjection() === null ? coordinate : fromUserCoordinate(coordinate as unknown as number[], map.getView().getProjection());
  const x = transformed[0];
  const y = transformed[1];
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new InvalidArgumentError('Edit anchor projection must produce finite coordinates');
  return [x, y];
}

/** 只为展示副本平移渲染几何，不修改 Core 编辑世界中的快照。 */
function presentationGeometry(state: RenderGeometryState, worldOffset: number): RenderGeometryState {
  if (worldOffset === 0) return state;
  if (state.type === 'point') return Object.freeze({ type: 'point', coordinates: shiftCoordinate(state.coordinates, worldOffset) });
  if (state.type === 'polyline') {
    return Object.freeze({ type: 'polyline', coordinates: Object.freeze(state.coordinates.map((value) => shiftCoordinate(value, worldOffset))) });
  }
  if (state.type === 'polygon') {
    return Object.freeze({
      type: 'polygon',
      coordinates: Object.freeze(state.coordinates.map((ring) => Object.freeze(ring.map((value) => shiftCoordinate(value, worldOffset)))))
    });
  }
  return Object.freeze({ type: 'circle', center: shiftCoordinate(state.center, worldOffset), radius: state.radius });
}

function pooledFeature(bundle: RenderBundle, key: string): EditFeature {
  const existing = bundle.pool.get(key);
  if (existing !== undefined) return existing;
  const feature = new Feature<Geometry>();
  bundle.pool.set(key, feature);
  return feature;
}

/** 在当前可见缓冲中原位同步单个锚点反馈；只在指针状态切换时执行线性身份查找。 */
function syncAnchorFeedbackFeature(
  bundle: RenderBundle,
  worldOffset: number,
  feedbackAnchor: EditInteractionAnchor | undefined,
  feedbackPhase: EditAnchorFeedbackPhase | undefined
): void {
  const coordinate =
    feedbackAnchor === undefined ? undefined : worldOffset === 0 ? feedbackAnchor.coordinate : shiftCoordinate(feedbackAnchor.coordinate, worldOffset);
  const visible = coordinate !== undefined && feedbackPhase !== undefined;
  const feedback = visible ? pooledFeature(bundle, 'anchors:feedback') : bundle.pool.get('anchors:feedback');
  if (feedback === undefined) return;
  updateAnchorFeedbackFeature(feedback, coordinate, feedbackAnchor, feedbackPhase);
  const included = bundle.features.includes(feedback);
  if (visible && !included) {
    bundle.source.addFeature(feedback);
    bundle.features = Object.freeze([...bundle.features, feedback]);
  } else if (!visible && included) {
    bundle.source.removeFeature(feedback);
    bundle.features = Object.freeze(bundle.features.filter((feature) => feature !== feedback));
  }
}

/** 更新反馈 Point 的坐标和共享样式；无有效锚点时保留空壳 Feature 以避免 Source 抖动。 */
function updateAnchorFeedbackFeature(
  feature: EditFeature,
  coordinate: Coordinate | undefined,
  anchor: EditInteractionAnchor | undefined,
  phase: EditAnchorFeedbackPhase | undefined
): void {
  if (coordinate === undefined || anchor === undefined || phase === undefined) {
    if (feature.getGeometry() !== undefined) feature.setGeometry(undefined);
    return;
  }
  const geometry = feature.getGeometry();
  if (geometry instanceof Point) {
    if (!coordinatesEqual(geometry.getCoordinates(), coordinate)) geometry.setCoordinates([...coordinate]);
  } else {
    feature.setGeometry(new Point([...coordinate]));
  }
  const style = editAnchorFeedbackStyle(anchor.kind, phase);
  if (feature.getStyle() !== style) feature.setStyle(style);
}

function sameAnchorIdentity(left: EditInteractionAnchor | undefined, right: EditInteractionAnchor | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.kind === right.kind && left.index === right.index;
}

/** 只把 Feature 集合差异写入屏幕外 Source。 */
function syncBundleSource(bundle: RenderBundle, features: readonly EditFeature[]): void {
  const previous = new Set(bundle.features);
  const next = new Set(features);
  const removals = [...previous].filter((feature) => !next.has(feature));
  const additions = features.filter((feature) => !previous.has(feature));
  const projectedOrder = [...bundle.source.getFeatures().filter((feature) => next.has(feature)), ...additions];
  if (!sameFeatureSequence(projectedOrder, features)) {
    bundle.source.clear(true);
    if (features.length > 0) bundle.source.addFeatures([...features]);
    return;
  }
  if (removals.length > 0) bundle.source.removeFeatures(removals);
  if (additions.length > 0) bundle.source.addFeatures(additions);
}

/** 比较双缓冲 Source 的实际 Feature 顺序，确保同一 Default Builder 内严格遵守设计层序。 */
function sameFeatureSequence(left: readonly EditFeature[], right: readonly EditFeature[]): boolean {
  return left.length === right.length && left.every((feature, index) => feature === right[index]);
}

function renderGeometryIsFrozen(state: RenderGeometryState): boolean {
  if (!Object.isFrozen(state)) return false;
  if (state.type === 'point') return Object.isFrozen(state.coordinates);
  if (state.type === 'polyline') return Object.isFrozen(state.coordinates) && state.coordinates.every(Object.isFrozen);
  if (state.type === 'polygon') {
    return Object.isFrozen(state.coordinates) && state.coordinates.every((ring) => Object.isFrozen(ring) && ring.every(Object.isFrozen));
  }
  return Object.isFrozen(state.center);
}

/** 深拷贝并校验渲染几何，避免调用方在缓冲切换后修改输入数组。 */
function snapshotRenderGeometry(state: RenderGeometryState): RenderGeometryState {
  if (state.type === 'point') return Object.freeze({ type: 'point', coordinates: Object.freeze(copyCoordinate(state.coordinates)) });
  if (state.type === 'polyline') {
    return Object.freeze({
      type: 'polyline',
      coordinates: Object.freeze(state.coordinates.map((coordinate) => Object.freeze(copyCoordinate(coordinate))))
    });
  }
  if (state.type === 'polygon') {
    return Object.freeze({
      type: 'polygon',
      coordinates: Object.freeze(state.coordinates.map((ring) => Object.freeze(ring.map((coordinate) => Object.freeze(copyCoordinate(coordinate))))))
    });
  }
  if (state.type === 'circle') {
    return Object.freeze({ type: 'circle', center: Object.freeze(copyCoordinate(state.center)), radius: state.radius });
  }
  throw new InvalidArgumentError('Unknown edit preview geometry type');
}

function createGeometry(state: RenderGeometryState): Geometry {
  if (state.type === 'point') return new Point(state.coordinates as unknown as number[]);
  if (state.type === 'polyline') return new LineString(state.coordinates as unknown as number[][]);
  if (state.type === 'polygon') return new Polygon(state.coordinates as unknown as number[][][]);
  return new Circle(state.center as unknown as number[], state.radius);
}

/** 类型不变时原位更新几何，并跳过坐标完全相同的 setter。 */
function updateFeatureGeometry(feature: EditFeature, state: RenderGeometryState, worldOffset = 0): void {
  const geometry = feature.getGeometry();
  if (state.type === 'polyline' && geometry instanceof LineString && updateLineStringFlatCoordinates(geometry, state.coordinates, worldOffset)) return;
  if (state.type === 'polygon' && geometry instanceof Polygon && updatePolygonFlatCoordinates(geometry, state.coordinates, worldOffset)) return;
  const presented = presentationGeometry(state, worldOffset);
  if (presented.type === 'point' && geometry instanceof Point) {
    if (flatCoordinatesEqual(geometry, presented.coordinates)) return;
    geometry.setCoordinates(presented.coordinates as unknown as number[]);
    return;
  }
  if (presented.type === 'polyline' && geometry instanceof LineString) {
    if (lineCoordinatesEqual(geometry, presented.coordinates)) return;
    geometry.setCoordinates(presented.coordinates as unknown as number[][]);
    return;
  }
  if (presented.type === 'polygon' && geometry instanceof Polygon) {
    if (polygonCoordinatesEqual(geometry, presented.coordinates)) return;
    geometry.setCoordinates(presented.coordinates as unknown as number[][][]);
    return;
  }
  if (presented.type === 'circle' && geometry instanceof Circle) {
    if (coordinatesEqual(geometry.getCenter(), presented.center) && geometry.getRadius() === presented.radius) return;
    geometry.setCenterAndRadius(presented.center as unknown as number[], presented.radius);
    return;
  }
  feature.setGeometry(createGeometry(presented));
}

/** 在屏幕外 LineString 的 flatCoordinates 上原位同步世界偏移，避免每帧分配整条坐标链。 */
function updateLineStringFlatCoordinates(geometry: LineString, coordinates: readonly Coordinate[], worldOffset: number): boolean {
  const flat = geometry.getFlatCoordinates();
  const stride = geometry.getStride();
  if (flat.length !== coordinates.length * stride || coordinates.some((coordinate) => coordinate.length !== stride)) return false;
  let changed = false;
  let offset = 0;
  for (const coordinate of coordinates) {
    for (let dimension = 0; dimension < stride; dimension += 1) {
      const source = coordinate[dimension];
      if (source === undefined) return false;
      const value = dimension === 0 ? source + worldOffset : source;
      if (!Number.isFinite(value)) throw new InvalidArgumentError('Shifted edit world coordinate must be finite');
      if (flat[offset] !== value) {
        flat[offset] = value;
        changed = true;
      }
      offset += 1;
    }
  }
  if (changed) geometry.changed();
  return true;
}

/** 在环结构不变时原位同步 Polygon，覆盖大多边形顶点拖拽的跨世界热路径。 */
function updatePolygonFlatCoordinates(geometry: Polygon, rings: readonly (readonly Coordinate[])[], worldOffset: number): boolean {
  const flat = geometry.getFlatCoordinates();
  const ends = geometry.getEnds();
  const stride = geometry.getStride();
  if (ends.length !== rings.length) return false;
  let expectedEnd = 0;
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    if (ring === undefined || ring.some((coordinate) => coordinate.length !== stride)) return false;
    expectedEnd += ring.length * stride;
    if (ends[ringIndex] !== expectedEnd) return false;
  }
  if (flat.length !== expectedEnd) return false;
  let changed = false;
  let offset = 0;
  for (const ring of rings) {
    for (const coordinate of ring) {
      for (let dimension = 0; dimension < stride; dimension += 1) {
        const source = coordinate[dimension];
        if (source === undefined) return false;
        const value = dimension === 0 ? source + worldOffset : source;
        if (!Number.isFinite(value)) throw new InvalidArgumentError('Shifted edit world coordinate must be finite');
        if (flat[offset] !== value) {
          flat[offset] = value;
          changed = true;
        }
        offset += 1;
      }
    }
  }
  if (changed) geometry.changed();
  return true;
}

/** 同类锚点批次原位更新，坐标未变时跳过 MultiPoint setter。 */
function updateMultiPointGeometry(feature: EditFeature, coordinates: readonly Coordinate[]): void {
  const geometry = feature.getGeometry();
  if (geometry instanceof MultiPoint) {
    if (multiPointCoordinatesEqual(geometry, coordinates)) return;
    geometry.setCoordinates(coordinates as unknown as number[][]);
    return;
  }
  feature.setGeometry(new MultiPoint(coordinates as unknown as number[][]));
}

function flatCoordinatesEqual(geometry: Point, coordinate: Coordinate): boolean {
  return coordinatesEqual(geometry.getFlatCoordinates(), coordinate);
}

function multiPointCoordinatesEqual(geometry: MultiPoint, coordinates: readonly Coordinate[]): boolean {
  const flat = geometry.getFlatCoordinates();
  const stride = geometry.getStride();
  if (flat.length !== coordinates.length * stride) return false;
  let offset = 0;
  for (const coordinate of coordinates) {
    if (coordinate.length !== stride) return false;
    for (let index = 0; index < stride; index += 1) {
      if (flat[offset] !== coordinate[index]) return false;
      offset += 1;
    }
  }
  return true;
}

function lineCoordinatesEqual(geometry: LineString, coordinates: readonly Coordinate[]): boolean {
  const flat = geometry.getFlatCoordinates();
  const stride = geometry.getStride();
  if (flat.length !== coordinates.length * stride) return false;
  let offset = 0;
  for (const coordinate of coordinates) {
    if (coordinate.length !== stride) return false;
    for (let index = 0; index < stride; index += 1) {
      if (flat[offset] !== coordinate[index]) return false;
      offset += 1;
    }
  }
  return true;
}

function polygonCoordinatesEqual(geometry: Polygon, coordinates: readonly (readonly Coordinate[])[]): boolean {
  const flat = geometry.getFlatCoordinates();
  const ends = geometry.getEnds();
  const stride = geometry.getStride();
  if (ends.length !== coordinates.length) return false;
  let offset = 0;
  for (let ringIndex = 0; ringIndex < coordinates.length; ringIndex += 1) {
    const ring = coordinates[ringIndex];
    if (ring === undefined) return false;
    for (const coordinate of ring) {
      if (coordinate.length !== stride) return false;
      for (let index = 0; index < stride; index += 1) {
        if (flat[offset] !== coordinate[index]) return false;
        offset += 1;
      }
    }
    if (ends[ringIndex] !== offset) return false;
  }
  return offset === flat.length;
}

function coordinatesEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** 复用已经深冻结的锚点，否则复制成不可变快照。 */
function snapshotAnchors(anchors: readonly EditInteractionAnchor[]): readonly EditInteractionAnchor[] {
  if (Object.isFrozen(anchors)) {
    let reusable = true;
    for (const anchor of anchors) {
      if (snapshotAnchor(anchor) !== anchor) {
        reusable = false;
        break;
      }
    }
    if (reusable) return anchors;
  }
  return Object.freeze(anchors.map(snapshotAnchor));
}

function snapshotAnchor(anchor: EditInteractionAnchor): EditInteractionAnchor {
  if (anchor === null || typeof anchor !== 'object') throw new InvalidArgumentError('Edit anchor must be an object');
  if (!Number.isSafeInteger(anchor.index) || anchor.index < 0) throw new InvalidArgumentError('Edit anchor index must be a non-negative safe integer');
  assertCoordinate(anchor.coordinate);
  const reusable = Object.isFrozen(anchor) && Object.isFrozen(anchor.coordinate);
  const coordinate = reusable ? anchor.coordinate : Object.freeze(copyCoordinate(anchor.coordinate));
  if (anchor.kind === 'insertion') return reusable ? anchor : Object.freeze({ kind: 'insertion', index: anchor.index, coordinate });
  if (anchor.kind !== 'control' || typeof anchor.removable !== 'boolean') throw new InvalidArgumentError('Unknown edit anchor kind');
  if (anchor.role !== undefined && typeof anchor.role !== 'string') throw new InvalidArgumentError('Edit control anchor role must be a string');
  if (reusable) return anchor;
  return Object.freeze({
    kind: 'control',
    index: anchor.index,
    coordinate,
    ...(anchor.role === undefined ? {} : { role: anchor.role }),
    removable: anchor.removable
  });
}

/** 复制并冻结语义事件，隔离原生监听器与 Session。 */
function freezeEvent(event: EditInteractionEvent): EditInteractionEvent {
  if (event.type === 'pointer-move') {
    const coordinate = Object.freeze(copyCoordinate(event.coordinate));
    const anchor = event.anchor === undefined ? undefined : snapshotAnchor(event.anchor);
    return Object.freeze({ type: event.type, coordinate, ...(anchor === undefined ? {} : { anchor }) });
  }
  const anchor = snapshotAnchor(event.anchor);
  if (event.type === 'insert') return Object.freeze({ type: event.type, anchor: anchor as EditInsertionAnchor });
  if (event.type === 'remove' || event.type === 'move-cancel') {
    return Object.freeze({ type: event.type, anchor: anchor as EditControlAnchor });
  }
  const coordinate = Object.freeze(copyCoordinate(event.coordinate));
  if (event.type === 'move-start') return Object.freeze({ type: event.type, anchor: anchor as EditControlAnchor, coordinate });
  if (event.type === 'move') return Object.freeze({ type: event.type, anchor: anchor as EditControlAnchor, coordinate });
  return Object.freeze({ type: event.type, anchor: anchor as EditControlAnchor, coordinate });
}

function copyCoordinate(value: Coordinate): Coordinate {
  assertCoordinate(value);
  return value.length === 3 ? [value[0], value[1], value[2]] : [value[0], value[1]];
}

function safeCoordinate(value: unknown): Coordinate | undefined {
  if (!isCoordinate(value)) return undefined;
  return Object.freeze(value.length === 3 ? [value[0], value[1], value[2]] : [value[0], value[1]]);
}

function assertCoordinate(value: unknown): asserts value is Coordinate {
  if (!isCoordinate(value)) throw new InvalidArgumentError('Edit coordinate must contain two or three finite numbers');
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && (value.length === 2 || value.length === 3) && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function safePixel(value: unknown): readonly [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) return undefined;
  return Object.freeze([value[0], value[1]]) as readonly [number, number];
}

function containsLayer(map: OlMap, layer: EditLayer): boolean {
  return map.getLayers().getArray().includes(layer);
}

function containsInteraction(map: OlMap, interaction: Interaction): boolean {
  return map.getInteractions().getArray().includes(interaction);
}

function isPrimary(event: MapBrowserEvent, requireLeftButton: boolean): boolean {
  if (field(event.originalEvent, 'isPrimary') === false) return false;
  const button = field(event.originalEvent, 'button');
  return !requireLeftButton || typeof button !== 'number' || button === 0;
}

function isAlt(event: MapBrowserEvent): boolean {
  return field(event.originalEvent, 'altKey') === true;
}

function isPointerCancel(event: MapBrowserEvent): boolean {
  return event.type === 'pointercancel' || field(event.originalEvent, 'type') === 'pointercancel';
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

function capture(failures: unknown[], work: () => void): void {
  try {
    work();
  } catch (error) {
    failures.push(error);
  }
}

function inspect<T>(failures: unknown[], read: () => T, accept: (value: T) => void): void {
  try {
    accept(read());
  } catch (error) {
    failures.push(error);
  }
}

function attempt(errorReporter: ErrorReporter, work: () => void, operation: string): void {
  try {
    work();
  } catch (error) {
    report(errorReporter, error, operation);
  }
}

/** 错误报告器失败时保持原生编辑资源的所有权不受影响。 */
function report(errorReporter: ErrorReporter, error: unknown, operation: string): void {
  try {
    const result = (errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
      source: 'EditInteractionAdapter',
      operation
    });
    void Promise.resolve(result).catch(() => undefined);
  } catch {
    // 错误报告器自身失败时不能破坏原生编辑资源的所有权。
  }
}
