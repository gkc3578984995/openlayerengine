import Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import CircleGeometry from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { unByKey } from 'ol/Observable.js';
import type { EventsKey } from 'ol/events.js';
import { fromUserCoordinate, getUserProjection, toUserResolution } from 'ol/proj.js';
import RBush from 'ol/structs/RBush.js';
import Fill from 'ol/style/Fill.js';
import Icon from 'ol/style/Icon.js';
import Stroke from 'ol/style/Stroke.js';
import Style, { type RenderFunction } from 'ol/style/Style.js';
import type { Coordinate, Pixel } from '../../../core/common/types.js';
import { runFinalizers } from '../../../core/common/dispose.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import type { LayerRenderPort, LayerRenderTargetHandle } from '../../../core/ports/LayerRenderPort.js';
import type { EditControlAnchor, EditInteractionAnchor } from '../../../core/ports/EditInteractionPort.js';
import type { TransformInteractionOptions, TransformInteractionTarget, TransformOperation } from '../../../core/ports/TransformInteractionPort.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';
import { isNativeStyleRef, type ElementStyleState } from '../../../core/style/types.js';
import type { ProjectionSuppressionLease, FeatureBinding } from '../FeatureBinding.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';
import {
  EDIT_CONTROL_ANCHOR_HIT_RADIUS,
  EDIT_CONTROL_ANCHOR_Z_INDEX,
  EDIT_INSERTION_ANCHOR_HIT_RADIUS,
  EDIT_INSERTION_ANCHOR_Z_INDEX,
  composeEditPreviewStyle,
  editAnchorFeedbackStyle,
  editControlAnchorBatchRenderer,
  editControlAnchorPointStyle,
  editInsertionAnchorBatchRenderer,
  editInsertionAnchorPointStyle,
  type EditAnchorFeedbackPhase
} from '../interactions/EditAnchorVisuals.js';
import { centerImage, rotateImage, scaleImage, stretchHorizontalImage, stretchVerticalImage, translateImage } from './handleImages.js';
import { extentCenter, renderExtent, type TransformExtent } from './PreviewTransform.js';

/** 命中的 Transform 控制手柄信息。 */
export interface TransformHandleHit {
  /** 手柄的唯一键。 */
  readonly key: string;
  /** 手柄触发的操作类型。 */
  readonly operation?: 'translate' | 'rotate' | 'scale' | 'stretch' | 'vertex';
  /** 操作影响的坐标轴。 */
  readonly axis?: 'x' | 'y' | 'xy';
  /** 顶点手柄对应的控制点索引。 */
  readonly index?: number;
  /** 编辑模式下命中的完整语义锚点。 */
  readonly anchor?: EditInteractionAnchor;
  /** 手柄所在的地图坐标。 */
  readonly coordinate: Coordinate;
}

/** Transform Edit 按当前输入语义筛选锚点候选。 */
export type EditAnchorHitMode = 'all' | 'control' | 'structural';

/** 控制手柄图层的内部创建配置。 */
interface HandleLayerOptions {
  /** 当前 Transform 会话 ID。 */
  readonly sessionId: string;
  /** 当前会话使用的交互配置。 */
  readonly interaction: TransformInteractionOptions;
  /** 选中框右上角变化时同步界面锚点。 */
  readonly onExtentChange?: (topRight: Coordinate) => void;
}

/** 大顶点批量的空间索引条目。 */
interface EditAnchorIndexEntry {
  /** 锚点在当前完整拓扑中的稳定顺序。 */
  readonly order: number;
  /** 控制点或可插入位置的完整语义。 */
  anchor: EditInteractionAnchor;
  /** 当前展示世界中的投影坐标。 */
  coordinate: Coordinate;
  /** RBush 和视图分辨率共同使用的视图投影坐标。 */
  internalCoordinate: readonly [number, number];
}

/** 写入手柄要素的元数据字段名。 */
const handleMetadata = 'ol-engine-transform-handle';

/** 标记使用 MultiPoint 统一渲染的大顶点要素。 */
const vertexBatchMetadata = 'ol-engine-transform-vertex-batch';

/** 标记使用 MultiPoint 统一渲染的大插入点要素。 */
const insertionBatchMetadata = 'ol-engine-transform-insertion-batch';

/** 默认统一样式超过该数量后切换为 MultiPoint 批次。 */
const vertexBatchThreshold = 512;

/** 自定义 StyleFunction 在该规模以下保留逐顶点 Feature 语义，以上改为单个 MultiPoint 批次。 */
const customVertexBatchThreshold = 4_096;

/** 超过该规模且移除过半时改用数据源快速重置。 */
const bulkResetRemovalThreshold = 256;

/** 管理 Transform 预览、边框和控制手柄图层。 */
export class HandleLayer {
  /** 控制手柄图层的渲染 ID。 */
  readonly renderLayerId: string;
  /** 选中框在渲染通道中的目标 ID。 */
  readonly renderTargetId: string;
  /** 手柄图层所属的地图。 */
  readonly #map: Map;
  /** 控制目标要素的投影抑制。 */
  readonly #binding: FeatureBinding;
  /** 编译目标和自定义手柄样式。 */
  readonly #styles: StyleCompiler;
  /** 接收选中框闪烁等渲染状态。 */
  readonly #render: LayerRenderPort;
  /** 当前 Transform 交互配置。 */
  readonly #options: TransformInteractionOptions;
  /** 选中框右上角变化时的通知函数。 */
  readonly #onExtentChange: ((topRight: Coordinate) => void) | undefined;
  /** 保存预览、边框和手柄要素。 */
  readonly #source: VectorSource<Feature<Geometry>>;
  /** 显示控制要素的顶层矢量图层。 */
  readonly #layer: VectorLayer<VectorSource<Feature<Geometry>>>;
  /** 视图分辨率和旋转事件的取消键。 */
  readonly #viewKeys: EventsKey[] = [];
  /** 当前操作目标。 */
  #target: TransformInteractionTarget | undefined;
  /** 当前目标从规范世界移动到唯一展示世界的水平偏移。 */
  #worldOffset = 0;
  /** 当前目标的缓冲外接范围。 */
  #extent: TransformExtent | undefined;
  /** 上一次通知界面的选中框右上角。 */
  #notifiedTopRight: Coordinate | undefined;
  /** 当前目标的投影抑制租约。 */
  #suppression: ProjectionSuppressionLease | undefined;
  /** 当前目标的预览要素。 */
  #preview: Feature<Geometry> | undefined;
  /** 当前选中框要素。 */
  #bbox: Feature<Geometry> | undefined;
  /** 旋转操作显示的中心点要素。 */
  #rotationCenter: Feature<Geometry> | undefined;
  /** 按逻辑键复用同一目标的控制手柄要素。 */
  readonly #handleFeatures = new globalThis.Map<string, Feature<Geometry>>();
  /** 顶点手柄池当前保留的连续索引数量。 */
  #vertexHandleCount = 0;
  /** 插入点手柄池当前保留的连续顺序数量。 */
  #insertionHandleCount = 0;
  /** 默认样式的大顶点 MultiPoint 要素。 */
  #vertexBatch: Feature<Geometry> | undefined;
  /** 默认样式的大插入点 MultiPoint 要素。 */
  #insertionBatch: Feature<Geometry> | undefined;
  /** 悬停或按下锚点使用的单个 Point 反馈覆盖物。 */
  #editAnchorFeedback: Feature<Geometry> | undefined;
  /** 当前反馈覆盖物绑定的语义锚点。 */
  #editAnchorFeedbackAnchor: EditInteractionAnchor | undefined;
  /** 当前反馈覆盖物的交互阶段。 */
  #editAnchorFeedbackPhase: EditAnchorFeedbackPhase | undefined;
  /** 当前反馈锚点在完整语义索引中的稳定顺序。 */
  #editAnchorFeedbackOrder: number | undefined;
  /** 编辑锚点命中使用的投影坐标索引。 */
  readonly #editAnchorIndex = new RBush<EditAnchorIndexEntry>();
  /** 与完整语义锚点一一对应的稳定条目。 */
  #editAnchorEntries: EditAnchorIndexEntry[] = [];
  /** 由语义身份直接定位完整锚点顺序，避免 hover / active 状态切换线性扫描。 */
  readonly #editAnchorOrderByIdentity = new globalThis.Map<string, number>();
  /** 当前已经加入数据源的目标相关要素。 */
  readonly #activeTargetFeatures = new Set<Feature<Geometry>>();
  /** 上一次编译的目标样式状态。 */
  #previewStyleState: ElementStyleState | undefined;
  /** 上一次编译得到的目标样式。 */
  #previewStyle: ReturnType<StyleCompiler['compile']> | undefined;
  /** 自定义手柄样式是否已经编译。 */
  #handleStyleCompiled = false;
  /** 复用的自定义手柄样式。 */
  #compiledHandleStyle: ReturnType<StyleCompiler['compile']> | undefined;
  /** 当前复制预览要素。 */
  #copy: Feature<Geometry> | undefined;
  /** 复制预览当前已经应用的水平位移。 */
  #copyOffsetX = 0;
  /** 复制预览当前已经应用的垂直位移。 */
  #copyOffsetY = 0;
  /** 选中框对应的渲染目标句柄。 */
  #renderTarget: LayerRenderTargetHandle | undefined;
  /** 渲染目标当前绑定的业务图层 ID。 */
  #renderTargetLayerId: string | undefined;
  /** 是否正在执行一次变换操作。 */
  #operationActive = false;
  /** 当前变换操作类型。 */
  #activeOperation: TransformOperation | undefined;
  /** 闪烁阶段中选中框是否可见。 */
  #blinkVisible = true;
  /** 手柄图层是否已经销毁。 */
  #destroyed = false;
  /** 手柄图层是否正在销毁。 */
  #destroying = false;

  /** 创建顶层手柄图层并监听视图变化。 */
  constructor(map: Map, binding: FeatureBinding, styles: StyleCompiler, render: LayerRenderPort, options: HandleLayerOptions) {
    this.#map = map;
    this.#binding = binding;
    this.#styles = styles;
    this.#render = render;
    this.#options = options.interaction;
    this.#onExtentChange = options.onExtentChange;
    this.renderLayerId = `transform-handles:${options.sessionId}`;
    this.renderTargetId = `transform-bbox:${options.sessionId}`;
    this.#source = new VectorSource({ wrapX: false });
    this.#layer = new VectorLayer({ source: this.#source, zIndex: 2_147_483_647 });
    this.#map.addLayer(this.#layer);
    const view = this.#map.getView();
    this.#viewKeys.push(view.on('change:resolution', this.#refreshForView), view.on('change:rotation', this.#refreshForView));
  }

  /** 返回当前操作目标。 */
  get target(): TransformInteractionTarget | undefined {
    return this.#target;
  }

  /** 返回当前接收渲染效果的图层 ID。 */
  get activeRenderLayerId(): string {
    return this.#target?.layerId ?? this.renderLayerId;
  }

  /** 返回当前目标的缓冲外接范围。 */
  get extent(): TransformExtent | undefined {
    return this.#extent;
  }

  /** 切换操作目标；同一元素只原位更新预览、边框和手柄。 */
  setTarget(target: TransformInteractionTarget, worldOffset = 0): void {
    this.#assertActive();
    if (!Number.isFinite(worldOffset)) throw new InvalidArgumentError('Transform world offset must be finite');
    const targetChanged = this.#target?.elementId !== target.elementId;
    const previewStyle = this.#previewStyleFor(target.style);
    const handleStyle = this.#handleStyleForTarget(target);
    let suppression: ProjectionSuppressionLease | undefined;
    let registration: LayerRenderTargetHandle | undefined;
    try {
      if (this.#renderTarget === undefined || this.#renderTargetLayerId !== target.layerId) {
        registration = this.#registerRenderTarget(target.layerId);
      }
      if (targetChanged) suppression = this.#binding.suppressProjection(target.elementId);
      const previous = this.#suppression;
      const previousRegistration = this.#renderTarget;
      if (targetChanged) {
        this.clearCopyPreview();
        this.#resetTargetFeatures();
        this.#operationActive = false;
        this.#activeOperation = undefined;
        this.#blinkVisible = true;
      }
      this.#syncTargetFeatures(target, previewStyle, handleStyle, worldOffset);
      this.#target = target;
      this.#worldOffset = worldOffset;
      this.#applyBBoxStyle();
      if (targetChanged) {
        this.#suppression = suppression;
        suppression = undefined;
      }
      if (registration !== undefined) {
        this.#renderTarget = registration;
        this.#renderTargetLayerId = target.layerId;
        registration = undefined;
        previousRegistration?.destroy();
      }
      if (targetChanged) previous?.release();
      this.#notifyExtentChange();
    } finally {
      suppression?.release();
      registration?.destroy();
    }
  }

  /** 清除当前目标及其投影抑制和渲染目标。 */
  clearTarget(): void {
    if (this.#destroyed) return;
    this.#releaseRenderTarget();
    this.clearCopyPreview();
    this.#resetTargetFeatures();
    this.#target = undefined;
    this.#worldOffset = 0;
    this.#extent = undefined;
    this.#notifiedTopRight = undefined;
    this.#operationActive = false;
    this.#activeOperation = undefined;
    this.#blinkVisible = true;
    const suppression = this.#suppression;
    this.#suppression = undefined;
    suppression?.release();
  }

  /** 创建复制操作使用的预览要素。 */
  setCopyPreview(geometry: RenderGeometryState, style: TransformInteractionTarget['style']): void {
    this.#assertActive();
    this.clearCopyPreview();
    const feature = new Feature<Geometry>(createGeometry(geometry));
    feature.setStyle(this.#styles.compile(style));
    feature.set('ol-engine-transform-copy', true, true);
    this.#source.addFeature(feature);
    this.#copy = feature;
    this.#copyOffsetX = 0;
    this.#copyOffsetY = 0;
  }

  /** 按绝对位移增量平移既有复制预览。 */
  updateCopyPreview(x: number, y: number): void {
    if (this.#copy === undefined) return;
    const deltaX = x - this.#copyOffsetX;
    const deltaY = y - this.#copyOffsetY;
    if (deltaX === 0 && deltaY === 0) return;
    const geometry = this.#copy.getGeometry();
    if (geometry === undefined) return;
    geometry.translate(deltaX, deltaY);
    this.#copyOffsetX = x;
    this.#copyOffsetY = y;
  }

  /** 平移复制预览的展示世界，保留用户复制位移的绝对基准。 */
  shiftCopyPreview(x: number, y: number): void {
    if ((x === 0 && y === 0) || this.#copy === undefined) return;
    this.#copy.getGeometry()?.translate(x, y);
  }

  /** 清除并销毁复制预览要素。 */
  clearCopyPreview(): void {
    const feature = this.#copy;
    this.#copy = undefined;
    this.#copyOffsetX = 0;
    this.#copyOffsetY = 0;
    if (feature === undefined) return;
    this.#source.removeFeature(feature);
    feature.setGeometry(undefined);
    feature.setStyle(undefined);
    feature.dispose();
  }

  /** 查询指定像素命中的控制手柄。 */
  hit(pixel: Pixel, hitTolerance: number, editMode: EditAnchorHitMode = 'all'): TransformHandleHit | undefined {
    this.#assertActive();
    if (this.#target?.mode === 'edit') return this.#hitEditAnchor(pixel, hitTolerance, editMode);
    const regular = this.#map.forEachFeatureAtPixel(
      [...pixel],
      (feature) => {
        if (!(feature instanceof Feature)) return undefined;
        const metadata = feature.get(handleMetadata);
        return isHandleHit(metadata) ? metadata : undefined;
      },
      { layerFilter: (layer) => layer === this.#layer, hitTolerance, checkWrapped: false }
    );
    return regular;
  }

  /** 设置活动操作下选中框的闪烁可见状态。 */
  setBlink(visible: boolean): void {
    if (!this.#operationActive) return;
    if (this.#blinkVisible === visible) return;
    this.#blinkVisible = visible;
    this.#applyBBoxStyle();
  }

  /** 切换操作活动状态并刷新手柄。 */
  setOperationActive(active: boolean, operation?: TransformOperation): void {
    this.#assertActive();
    if (active && operation === undefined) throw new InvalidArgumentError('Transform active operation is required');
    if (this.#operationActive === active && this.#activeOperation === operation) return;
    this.#operationActive = active;
    this.#activeOperation = active ? operation : undefined;
    this.#blinkVisible = true;
    this.#syncRotationCenterFeature();
    this.#applyBBoxStyle();
  }

  /** 原位切换 Transform Edit 的单点锚点反馈，不让覆盖物参与命中。 */
  setEditAnchorFeedback(anchor?: EditInteractionAnchor, phase: EditAnchorFeedbackPhase = 'hover'): void {
    this.#assertActive();
    const nextAnchor = this.#target?.mode === 'edit' ? anchor : undefined;
    const nextPhase = nextAnchor === undefined ? undefined : phase;
    if (
      ((nextAnchor === undefined && this.#editAnchorFeedbackAnchor === undefined) ||
        (nextAnchor !== undefined && sameAnchorIdentity(nextAnchor, this.#editAnchorFeedbackAnchor))) &&
      this.#editAnchorFeedbackPhase === nextPhase
    ) {
      return;
    }
    this.#editAnchorFeedbackAnchor = nextAnchor;
    this.#editAnchorFeedbackPhase = nextPhase;
    this.#editAnchorFeedbackOrder = nextAnchor === undefined ? undefined : this.#editAnchorOrderByIdentity.get(editAnchorIdentityKey(nextAnchor));
    const feedback = this.#editAnchorFeedback ?? new Feature<Geometry>();
    this.#editAnchorFeedback = feedback;
    this.#syncEditAnchorFeedbackFeature();
    if (this.#activeTargetFeatures.has(feedback)) return;
    this.#source.addFeature(feedback);
    this.#activeTargetFeatures.add(feedback);
  }

  /** 移除图层并清理全部要素、监听和租约。 */
  destroy(): void {
    if (this.#destroyed || this.#destroying) return;
    this.#destroying = true;
    try {
      runFinalizers([
        () => {
          if (this.#viewKeys.length === 0) return;
          unByKey(this.#viewKeys);
          this.#viewKeys.length = 0;
        },
        () => this.#releaseRenderTarget(),
        () => this.clearCopyPreview(),
        () => this.#source.clear(true),
        () => {
          const suppression = this.#suppression;
          suppression?.release();
          if (this.#suppression === suppression) this.#suppression = undefined;
        },
        () => this.#map.removeLayer(this.#layer),
        () => this.#layer.setSource(null),
        () => this.#source.dispose(),
        () => this.#layer.dispose()
      ]);
      this.#target = undefined;
      this.#worldOffset = 0;
      this.#extent = undefined;
      this.#preview = undefined;
      this.#bbox = undefined;
      this.#rotationCenter = undefined;
      if (this.#editAnchorFeedback !== undefined) releaseFeature(this.#editAnchorFeedback);
      this.#editAnchorFeedback = undefined;
      this.#editAnchorFeedbackAnchor = undefined;
      this.#editAnchorFeedbackPhase = undefined;
      this.#editAnchorFeedbackOrder = undefined;
      for (const feature of this.#handleFeatures.values()) releaseFeature(feature);
      this.#handleFeatures.clear();
      this.#vertexHandleCount = 0;
      this.#insertionHandleCount = 0;
      this.#activeTargetFeatures.clear();
      this.#clearEditAnchorBatches();
      this.#previewStyleState = undefined;
      this.#previewStyle = undefined;
      this.#compiledHandleStyle = undefined;
      this.#handleStyleCompiled = false;
      this.#operationActive = false;
      this.#activeOperation = undefined;
      this.#destroyed = true;
    } finally {
      this.#destroying = false;
    }
  }

  /** 原位同步当前目标的预览、选中框和控制手柄。 */
  #syncTargetFeatures(
    target: TransformInteractionTarget,
    previewStyle: ReturnType<StyleCompiler['compile']>,
    handleStyle: ReturnType<StyleCompiler['compile']> | undefined,
    worldOffset: number
  ): void {
    if (target.mode !== 'edit') this.#releaseEditAnchorFeedback();
    const preview = this.#preview ?? new Feature<Geometry>();
    this.#preview = preview;
    updateFeatureGeometry(preview, target.geometry, worldOffset);
    const effectivePreviewStyle = target.mode === 'edit' ? composeEditPreviewStyle(previewStyle) : previewStyle;
    if (preview.getStyle() !== effectivePreviewStyle) preview.setStyle(effectivePreviewStyle);
    const geometryExtent = presentationExtent(renderExtent(target.geometry), worldOffset);
    setHandleHit(
      preview,
      target.canTranslate && this.#options.translate === 'feature'
        ? { key: 'feature', operation: 'translate', coordinate: extentCenter(geometryExtent) }
        : undefined
    );

    const features = [preview, ...this.#syncExtentFeatures(target, handleStyle, geometryExtent, worldOffset)];
    const editAnchors = target.canEditVertices ? target.editAnchors : [];
    const controlAnchors = editAnchors.filter((anchor): anchor is EditControlAnchor => anchor.kind === 'control');
    const insertionAnchors = editAnchors.filter((anchor) => anchor.kind === 'insertion');
    this.#syncEditAnchorIndex(editAnchors, worldOffset);
    const vertexHandleCount = controlAnchors.length;
    const insertionHandleCount = insertionAnchors.length;
    const batchThreshold = handleStyle === undefined ? vertexBatchThreshold : customVertexBatchThreshold;
    const useVertexBatch = vertexHandleCount >= batchThreshold;
    const useInsertionBatch = insertionHandleCount >= vertexBatchThreshold;
    if (useInsertionBatch) {
      features.push(this.#syncInsertionBatch(insertionAnchors, worldOffset));
    } else if (insertionHandleCount > 0) {
      for (let order = 0; order < insertionHandleCount; order += 1) {
        const anchor = insertionAnchors[order];
        features.push(
          this.#handle(`insertion-${order}`, undefined, presentationCoordinate(anchor.coordinate, worldOffset), undefined, undefined, anchor.index, anchor)
        );
      }
    }
    if (useVertexBatch) {
      features.push(this.#syncVertexBatch(controlAnchors, handleStyle, worldOffset));
    } else if (vertexHandleCount > 0) {
      for (let order = 0; order < vertexHandleCount; order += 1) {
        const anchor = controlAnchors[order];
        features.push(
          this.#handle(`vertex-${order}`, 'vertex', presentationCoordinate(anchor.coordinate, worldOffset), 'xy', handleStyle, anchor.index, anchor)
        );
      }
    }
    if (target.mode === 'edit' && this.#editAnchorFeedback !== undefined) {
      this.#syncEditAnchorFeedbackFeature();
      features.push(this.#editAnchorFeedback);
    }
    this.#syncSourceFeatures(features);
    this.#trimVertexHandlePool(useVertexBatch ? 0 : vertexHandleCount, this.#operationActive);
    this.#trimInsertionHandlePool(useInsertionBatch ? 0 : insertionHandleCount, this.#operationActive);
    if (!this.#operationActive && !useVertexBatch) this.#clearVertexBatch();
    if (!this.#operationActive && !useInsertionBatch) this.#clearInsertionBatch();
  }

  /** 原位更新大控制点 MultiPoint；语义命中统一由完整锚点索引负责。 */
  #syncVertexBatch(
    anchors: readonly EditControlAnchor[],
    customStyle: ReturnType<StyleCompiler['compile']> | undefined,
    worldOffset: number
  ): Feature<Geometry> {
    const feature = this.#vertexBatch ?? new Feature<Geometry>();
    this.#vertexBatch = feature;
    updateMultiPointGeometry(
      feature,
      anchors.map(({ coordinate }) => coordinate),
      worldOffset
    );
    const style = customStyle ?? vertexBatchStyle;
    if (feature.getStyle() !== style) feature.setStyle(style);
    if (feature.get(vertexBatchMetadata) !== true) feature.set(vertexBatchMetadata, true, true);
    return feature;
  }

  /** 原位更新大插入点 MultiPoint。 */
  #syncInsertionBatch(anchors: readonly EditInteractionAnchor[], worldOffset: number): Feature<Geometry> {
    const feature = this.#insertionBatch ?? new Feature<Geometry>();
    this.#insertionBatch = feature;
    updateMultiPointGeometry(
      feature,
      anchors.map(({ coordinate }) => coordinate),
      worldOffset
    );
    if (feature.getStyle() !== insertionBatchStyle) feature.setStyle(insertionBatchStyle);
    if (feature.get(insertionBatchMetadata) !== true) feature.set(insertionBatchMetadata, true, true);
    return feature;
  }

  /** 首次批量加载完整编辑锚点，连续拖拽时只更新变化条目。 */
  #syncEditAnchorIndex(anchors: readonly EditInteractionAnchor[], worldOffset: number): void {
    const entries = this.#editAnchorEntries;
    if (entries.length !== anchors.length || entries.some((entry, order) => !sameAnchorIdentity(entry.anchor, anchors[order]))) {
      this.#rebuildEditAnchorIndex(anchors, worldOffset);
      return;
    }
    const incrementalLimit = Math.max(32, Math.floor(anchors.length / 100));
    const changes: Array<Readonly<{ entry: EditAnchorIndexEntry; anchor: EditInteractionAnchor }>> = [];
    for (let order = 0; order < anchors.length; order += 1) {
      const anchor = anchors[order];
      if (coordinateEqualsPresentation(entries[order].coordinate, anchor.coordinate, worldOffset)) continue;
      changes.push({ entry: entries[order], anchor });
      if (changes.length > incrementalLimit) {
        this.#rebuildEditAnchorIndex(anchors, worldOffset);
        return;
      }
    }
    if (changes.length === 0) return;
    for (const change of changes) {
      const presented = presentationCoordinate(change.anchor.coordinate, worldOffset);
      change.entry.anchor = change.anchor;
      change.entry.coordinate = presented;
      change.entry.internalCoordinate = coordinateForIndex(this.#map, presented);
      this.#editAnchorIndex.update(pointExtent(change.entry.internalCoordinate), change.entry);
    }
  }

  /** 使用点范围一次批量构建完整编辑锚点 RBush。 */
  #rebuildEditAnchorIndex(anchors: readonly EditInteractionAnchor[], worldOffset: number): void {
    this.#editAnchorIndex.clear();
    const entries = anchors.map((anchor, order): EditAnchorIndexEntry => {
      const presented = presentationCoordinate(anchor.coordinate, worldOffset);
      return { order, anchor, coordinate: presented, internalCoordinate: coordinateForIndex(this.#map, presented) };
    });
    this.#editAnchorEntries = entries;
    this.#editAnchorOrderByIdentity.clear();
    for (const entry of entries) this.#editAnchorOrderByIdentity.set(editAnchorIdentityKey(entry.anchor), entry.order);
    if (entries.length > 0)
      this.#editAnchorIndex.load(
        entries.map((entry) => pointExtent(entry.internalCoordinate)),
        entries
      );
  }

  /** 在完整语义锚点上查询最近命中；等距时控制点优先于插入点。 */
  #hitEditAnchor(pixel: Pixel, hitTolerance: number, mode: EditAnchorHitMode): TransformHandleHit | undefined {
    if (this.#editAnchorEntries.length === 0) return undefined;
    const rawCoordinate = this.#map.getCoordinateFromPixelInternal([...pixel]);
    if (!Array.isArray(rawCoordinate) || rawCoordinate.length < 2 || !Number.isFinite(rawCoordinate[0]) || !Number.isFinite(rawCoordinate[1])) return undefined;
    const coordinate: Coordinate = [rawCoordinate[0], rawCoordinate[1]];
    const resolution = internalResolution(this.#map);
    const maximumTolerance = resolution * (Math.max(0, hitTolerance) + Math.max(EDIT_CONTROL_ANCHOR_HIT_RADIUS, EDIT_INSERTION_ANCHOR_HIT_RADIUS));
    const candidates = this.#editAnchorIndex.getInExtent([
      coordinate[0] - maximumTolerance,
      coordinate[1] - maximumTolerance,
      coordinate[0] + maximumTolerance,
      coordinate[1] + maximumTolerance
    ]);
    let best: EditAnchorIndexEntry | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      if (!acceptsEditAnchor(candidate.anchor, mode)) continue;
      const x = candidate.internalCoordinate[0] - coordinate[0];
      const y = candidate.internalCoordinate[1] - coordinate[1];
      const distance = x * x + y * y;
      const radius = candidate.anchor.kind === 'control' ? EDIT_CONTROL_ANCHOR_HIT_RADIUS : EDIT_INSERTION_ANCHOR_HIT_RADIUS;
      const tolerance = resolution * (Math.max(0, hitTolerance) + radius);
      if (distance > tolerance * tolerance) continue;
      const winsEqualDistance =
        distance === bestDistance &&
        (best === undefined ||
          (candidate.anchor.kind === 'control' && best.anchor.kind === 'insertion') ||
          (candidate.anchor.kind === best.anchor.kind && candidate.order > best.order));
      if (distance < bestDistance || winsEqualDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (best === undefined) return undefined;
    const anchor = best.anchor;
    return anchor.kind === 'control'
      ? freezeHit({ key: `vertex-${best.order}`, operation: 'vertex', axis: 'xy', index: anchor.index, coordinate: best.coordinate, anchor })
      : freezeHit({ key: `insertion-${best.order}`, index: anchor.index, coordinate: best.coordinate, anchor });
  }

  /** 断开大控制点批次引用。 */
  #clearVertexBatch(): void {
    const feature = this.#vertexBatch;
    this.#vertexBatch = undefined;
    if (feature !== undefined) releaseFeature(feature);
  }

  /** 断开大插入点批次引用。 */
  #clearInsertionBatch(): void {
    const feature = this.#insertionBatch;
    this.#insertionBatch = undefined;
    if (feature !== undefined) releaseFeature(feature);
  }

  /** 清理全部批次和语义命中索引。 */
  #clearEditAnchorBatches(): void {
    this.#clearVertexBatch();
    this.#clearInsertionBatch();
    this.#editAnchorEntries = [];
    this.#editAnchorOrderByIdentity.clear();
    this.#editAnchorIndex.clear();
  }

  /** 更新受视图分辨率影响的选中框与操作手柄，不触碰预览和顶点要素。 */
  #syncExtentFeatures(
    target: TransformInteractionTarget,
    handleStyle: ReturnType<StyleCompiler['compile']> | undefined,
    geometryExtent: TransformExtent,
    worldOffset: number
  ): Feature<Geometry>[] {
    const preview = this.#preview;
    if (preview === undefined) throw new InvalidArgumentError('Transform preview feature is missing');
    const extent = bufferedExtent(
      this.#map,
      geometryExtent,
      target.geometry.type === 'point',
      this.#options,
      target.geometry.type === 'point' ? pointVisualPadding(preview, this.#map) : undefined
    );
    this.#extent = extent;
    // 编辑模式仅显示业务图形与语义锚点，避免 Transform 选框遮盖真实样式。
    if (target.mode === 'edit') return [];
    const [minX, minY, maxX, maxY] = extent;
    const center = target.handleCenter === undefined ? extentCenter(extent) : presentationCoordinate(target.handleCenter, worldOffset);
    const bbox = this.#bbox ?? new Feature<Geometry>();
    this.#bbox = bbox;
    updateFeatureGeometry(bbox, {
      type: 'polygon',
      coordinates: [
        [
          [minX, minY],
          [minX, maxY],
          [maxX, maxY],
          [maxX, minY],
          [minX, minY]
        ]
      ]
    });
    setHandleHit(bbox, target.canTranslate && this.#options.translateBBox ? { key: 'bbox', operation: 'translate', coordinate: center } : undefined);

    const features = [bbox];
    if (target.canScale) {
      features.push(
        this.#handle('scale-sw', 'scale', [minX, minY], 'xy', handleStyle),
        this.#handle('scale-nw', 'scale', [minX, maxY], 'xy', handleStyle),
        this.#handle('scale-ne', 'scale', [maxX, maxY], 'xy', handleStyle),
        this.#handle('scale-se', 'scale', [maxX, minY], 'xy', handleStyle)
      );
    }
    if (target.canStretch) {
      features.push(
        this.#handle('stretch-west', 'stretch', [minX, center[1]], 'x', handleStyle),
        this.#handle('stretch-east', 'stretch', [maxX, center[1]], 'x', handleStyle),
        this.#handle('stretch-south', 'stretch', [center[0], minY], 'y', handleStyle),
        this.#handle('stretch-north', 'stretch', [center[0], maxY], 'y', handleStyle)
      );
    }
    if (target.canRotate) {
      if (this.#activeOperation === 'rotate') {
        const rotationCenter = this.#rotationCenter ?? new Feature<Geometry>();
        this.#rotationCenter = rotationCenter;
        updatePointGeometry(rotationCenter, center);
        if (rotationCenter.getStyle() !== centerHandleStyle) rotationCenter.setStyle(centerHandleStyle);
        features.push(rotationCenter);
      }
      features.push(this.#handle('rotate', 'rotate', [center[0], maxY], 'xy', handleStyle));
    }
    if (target.canTranslate && this.#options.translate === 'center') {
      features.push(this.#handle('translate-center', 'translate', center, 'xy', handleStyle));
    }
    return features;
  }

  /** 仅在目标样式真正变化时重新编译预览样式。 */
  #previewStyleFor(style: ElementStyleState): ReturnType<StyleCompiler['compile']> {
    if (this.#previewStyleState !== undefined && this.#previewStyle !== undefined && styleStatesEqual(this.#previewStyleState, style)) {
      return this.#previewStyle;
    }
    const compiled = this.#styles.compile(style);
    this.#previewStyleState = style;
    this.#previewStyle = compiled;
    return compiled;
  }

  /** 自定义手柄样式只编译一次，并由全部交互手柄共享。 */
  #handleStyleForTarget(target: TransformInteractionTarget): ReturnType<StyleCompiler['compile']> | undefined {
    if (target.mode === 'edit') return undefined;
    if (!hasInteractiveHandles(target, this.#options) || this.#options.handleStyle === undefined) return undefined;
    if (this.#handleStyleCompiled) return this.#compiledHandleStyle;
    const compiled = this.#styles.compile(this.#options.handleStyle);
    this.#compiledHandleStyle = compiled;
    this.#handleStyleCompiled = true;
    return compiled;
  }

  /** 只增删能力变化产生的差异要素，连续拖拽不触碰数据源集合。 */
  #syncSourceFeatures(features: readonly Feature<Geometry>[]): void {
    const next = new Set(features);
    const removals = [...this.#activeTargetFeatures].filter((feature) => !next.has(feature));
    const additions = features.filter((feature) => !this.#activeTargetFeatures.has(feature));
    const featureSetChanged = removals.length > 0 || additions.length > 0;
    const projectedOrder = featureSetChanged
      ? [...this.#source.getFeatures().filter((feature) => this.#activeTargetFeatures.has(feature) && next.has(feature)), ...additions]
      : features;
    const editOrderChanged = this.#target?.mode === 'edit' && !sameFeatureSequence(projectedOrder, features);
    const bulkReset = editOrderChanged || (removals.length >= bulkResetRemovalThreshold && removals.length * 2 >= this.#activeTargetFeatures.size);
    if (bulkReset) {
      const retained = [...features];
      if (this.#copy !== undefined) retained.push(this.#copy);
      this.#source.clear(true);
      if (retained.length > 0) this.#source.addFeatures(retained);
    } else {
      if (removals.length > 0) this.#source.removeFeatures(removals);
      if (additions.length > 0) this.#source.addFeatures(additions);
    }
    this.#activeTargetFeatures.clear();
    for (const feature of features) this.#activeTargetFeatures.add(feature);
  }

  /** 记录当前逐点控制点数；暂时隐藏的池成员保留到目标切换，供拖拽结束原位复用。 */
  #trimVertexHandlePool(nextCount: number, retainHidden: boolean): void {
    const previousCount = this.#vertexHandleCount;
    this.#vertexHandleCount = nextCount;
    if (retainHidden || nextCount >= previousCount) return;
    for (let index = nextCount; index < previousCount; index += 1) {
      const feature = this.#handleFeatures.get(`vertex-${index}`);
      if (feature === undefined) continue;
      this.#handleFeatures.delete(`vertex-${index}`);
      if (this.#activeTargetFeatures.delete(feature)) this.#source.removeFeature(feature);
      releaseFeature(feature);
    }
  }

  /** 记录当前逐点插入点数；隐藏期间保留池成员，避免拖拽首尾集中销毁和重建。 */
  #trimInsertionHandlePool(nextCount: number, retainHidden: boolean): void {
    const previousCount = this.#insertionHandleCount;
    this.#insertionHandleCount = nextCount;
    if (retainHidden || nextCount >= previousCount) return;
    for (let order = nextCount; order < previousCount; order += 1) {
      const feature = this.#handleFeatures.get(`insertion-${order}`);
      if (feature === undefined) continue;
      this.#handleFeatures.delete(`insertion-${order}`);
      if (this.#activeTargetFeatures.delete(feature)) this.#source.removeFeature(feature);
      releaseFeature(feature);
    }
  }

  /** 丢弃上一元素的要素池；同一元素刷新不会调用此方法。 */
  #resetTargetFeatures(): void {
    if (this.#activeTargetFeatures.size > 0) this.#source.clear(true);
    this.#activeTargetFeatures.clear();
    for (const feature of this.#handleFeatures.values()) releaseFeature(feature);
    this.#handleFeatures.clear();
    this.#vertexHandleCount = 0;
    this.#insertionHandleCount = 0;
    this.#clearEditAnchorBatches();
    this.#releaseEditAnchorFeedback();
    this.#preview = undefined;
    this.#bbox = undefined;
    this.#rotationCenter = undefined;
  }

  /** 将反馈覆盖物更新到最新索引坐标；拓扑变化时只做一次身份回查。 */
  #syncEditAnchorFeedbackFeature(): void {
    const feature = this.#editAnchorFeedback;
    const anchor = this.#editAnchorFeedbackAnchor;
    const phase = this.#editAnchorFeedbackPhase;
    if (feature === undefined) return;
    if (anchor === undefined || phase === undefined) {
      if (feature.getGeometry() !== undefined) feature.setGeometry(undefined);
      return;
    }
    let order = this.#editAnchorFeedbackOrder;
    let entry = order === undefined || order < 0 ? undefined : this.#editAnchorEntries[order];
    if (entry === undefined || !sameAnchorIdentity(anchor, entry.anchor)) {
      order = this.#editAnchorOrderByIdentity.get(editAnchorIdentityKey(anchor));
      this.#editAnchorFeedbackOrder = order;
      entry = order === undefined ? undefined : this.#editAnchorEntries[order];
    }
    if (entry === undefined) {
      if (feature.getGeometry() !== undefined) feature.setGeometry(undefined);
      return;
    }
    this.#editAnchorFeedbackAnchor = entry.anchor;
    updatePointGeometry(feature, entry.coordinate);
    const style = editAnchorFeedbackStyle(entry.anchor.kind, phase);
    if (feature.getStyle() !== style) feature.setStyle(style);
  }

  /** 释放跨目标或跨模式不再适用的反馈覆盖物。 */
  #releaseEditAnchorFeedback(): void {
    const feature = this.#editAnchorFeedback;
    this.#editAnchorFeedback = undefined;
    this.#editAnchorFeedbackAnchor = undefined;
    this.#editAnchorFeedbackPhase = undefined;
    this.#editAnchorFeedbackOrder = undefined;
    if (feature === undefined) return;
    if (this.#activeTargetFeatures.delete(feature)) this.#source.removeFeature(feature);
    releaseFeature(feature);
  }

  /** 仅增删旋转操作期间显示的中心点，避免为状态切换重建整组控制要素。 */
  #syncRotationCenterFeature(): void {
    const target = this.#target;
    const extent = this.#extent;
    const active = target?.canRotate === true && this.#activeOperation === 'rotate' && extent !== undefined;
    const existing = this.#rotationCenter;
    if (!active) {
      if (existing !== undefined && this.#activeTargetFeatures.delete(existing)) this.#source.removeFeature(existing);
      return;
    }
    const feature = existing ?? new Feature<Geometry>();
    this.#rotationCenter = feature;
    updatePointGeometry(feature, target.handleCenter === undefined ? extentCenter(extent) : presentationCoordinate(target.handleCenter, this.#worldOffset));
    if (feature.getStyle() !== centerHandleStyle) feature.setStyle(centerHandleStyle);
    if (this.#activeTargetFeatures.has(feature)) return;
    this.#source.addFeature(feature);
    this.#activeTargetFeatures.add(feature);
  }

  /** 在目标业务图层上登记选中框渲染通道。 */
  #registerRenderTarget(layerId: string): LayerRenderTargetHandle {
    return this.#render.registerTarget({
      layerId,
      targetId: this.renderTargetId,
      apply: (value) => this.setBlink(value.visible ?? true),
      clear: () => this.setBlink(true)
    });
  }

  /** 释放当前选中框渲染目标。 */
  #releaseRenderTarget(): void {
    const target = this.#renderTarget;
    if (target === undefined) return;
    target.destroy();
    if (this.#renderTarget === target) {
      this.#renderTarget = undefined;
      this.#renderTargetLayerId = undefined;
    }
  }

  /** 视图缩放或旋转后原位更新控制要素。 */
  readonly #refreshForView = (): void => {
    if (this.#destroyed || this.#destroying || this.#target === undefined) return;
    const handleStyle = this.#handleStyleForTarget(this.#target);
    this.#syncExtentFeatures(this.#target, handleStyle, presentationExtent(renderExtent(this.#target.geometry), this.#worldOffset), this.#worldOffset);
    this.#applyBBoxStyle();
    this.#notifyExtentChange();
  };

  /** 只在选中框右上角实际变化时通知界面层。 */
  #notifyExtentChange(): void {
    const extent = this.#extent;
    if (extent === undefined || this.#onExtentChange === undefined) return;
    const topRight = visualTopRight(this.#map, extent);
    if (this.#notifiedTopRight !== undefined && coordinatesEqual(this.#notifiedTopRight, topRight)) return;
    this.#notifiedTopRight = Object.freeze([...topRight]) as Coordinate;
    this.#onExtentChange(this.#notifiedTopRight);
  }

  /** 按活动和闪烁状态应用选中框样式。 */
  #applyBBoxStyle(): void {
    const bbox = this.#bbox;
    if (bbox === undefined) return;
    const style = !this.#operationActive ? bboxIdleStyle : this.#blinkVisible ? bboxActiveStyle : bboxActiveHiddenStyle;
    if (bbox.getStyle() !== style) bbox.setStyle(style);
  }

  /** 更新并返回带命中元数据的可复用控制手柄。 */
  #handle(
    key: string,
    operation: TransformHandleHit['operation'],
    coordinate: Coordinate,
    axis: TransformHandleHit['axis'],
    customStyle: ReturnType<StyleCompiler['compile']> | undefined,
    index?: number,
    anchor?: EditInteractionAnchor
  ): Feature<Geometry> {
    let feature = this.#handleFeatures.get(key);
    if (feature === undefined) {
      feature = new Feature<Geometry>();
      this.#handleFeatures.set(key, feature);
    }
    updatePointGeometry(feature, coordinate);
    const style = customStyle ?? styleFor(operation, axis);
    if (feature.getStyle() !== style) feature.setStyle(style);
    setHandleHit(feature, {
      key,
      ...(operation === undefined ? {} : { operation }),
      coordinate,
      ...(axis === undefined ? {} : { axis }),
      ...(index === undefined ? {} : { index }),
      ...(anchor === undefined ? {} : { anchor })
    });
    return feature;
  }

  /** 确认手柄图层仍可使用。 */
  #assertActive(): void {
    if (this.#destroyed || this.#destroying) throw new ObjectDisposedError('Transform HandleLayer has been destroyed');
  }
}

/** 将地图坐标范围转换为屏幕外接框，并返回视觉右上角对应的地图坐标。 */
function visualTopRight(map: Map, extent: TransformExtent): Coordinate {
  const rotation = map.getView().getRotation();
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const [minX, minY, maxX, maxY] = extent;
  const right = Math.max(cosine * minX + sine * minY, cosine * minX + sine * maxY, cosine * maxX + sine * maxY, cosine * maxX + sine * minY);
  const top = Math.min(sine * minX - cosine * minY, sine * minX - cosine * maxY, sine * maxX - cosine * maxY, sine * maxX - cosine * minY);
  return [cosine * right + sine * top, sine * right - cosine * top];
}

/** Transform 选中框和各类控制手柄的内置样式。 */
const bboxFill = new Fill({ color: [204, 204, 204, 0.3] });
const bboxIdleStyle = new Style({ stroke: new Stroke({ color: [80, 80, 80], width: 1 }), fill: bboxFill });
const bboxActiveStyle = new Style({ stroke: new Stroke({ color: [80, 80, 80], width: 1, lineDash: [6, 4] }), fill: bboxFill });
const bboxActiveHiddenStyle = new Style({ stroke: new Stroke({ color: [80, 80, 80, 0.2], width: 1, lineDash: [6, 4] }), fill: bboxFill });
const scaleHandleStyle = iconStyle(scaleImage);
const rotateHandleStyle = iconStyle(rotateImage, [0, 30]);
const stretchHorizontalHandleStyle = iconStyle(stretchHorizontalImage);
const stretchVerticalHandleStyle = iconStyle(stretchVerticalImage);
const translateHandleStyle = iconStyle(translateImage);
const centerHandleStyle = iconStyle(centerImage);

/** MultiPoint 命中由 RBush 负责，命中画布上不重复绘制大批量圆。 */
const renderEmptyHitBatch: RenderFunction = (): void => undefined;
const vertexBatchStyle = new Style({
  renderer: editControlAnchorBatchRenderer,
  hitDetectionRenderer: renderEmptyHitBatch,
  zIndex: EDIT_CONTROL_ANCHOR_Z_INDEX
});
const insertionBatchStyle = new Style({
  renderer: editInsertionAnchorBatchRenderer,
  hitDetectionRenderer: renderEmptyHitBatch,
  zIndex: EDIT_INSERTION_ANCHOR_Z_INDEX
});

/** 用内置图片创建手柄图标样式。 */
function iconStyle(src: string, displacement?: readonly [number, number]): Style {
  return new Style({ image: new Icon({ src, color: [80, 80, 80, 1], ...(displacement === undefined ? {} : { displacement: [...displacement] }) }) });
}

/** 按操作类型和坐标轴选择内置手柄样式。 */
function styleFor(operation: TransformHandleHit['operation'], axis: TransformHandleHit['axis']): Style {
  if (operation === 'rotate') return rotateHandleStyle;
  if (operation === 'vertex') return editControlAnchorPointStyle;
  if (operation === undefined) return editInsertionAnchorPointStyle;
  if (operation === 'translate') return translateHandleStyle;
  if (operation === 'stretch') return axis === 'x' ? stretchHorizontalHandleStyle : stretchVerticalHandleStyle;
  return scaleHandleStyle;
}

/** 把规范世界范围平移到当前唯一展示世界。 */
function presentationExtent(extent: TransformExtent, worldOffset: number): TransformExtent {
  if (worldOffset === 0) return extent;
  return Object.freeze([extent[0] + worldOffset, extent[1], extent[2] + worldOffset, extent[3]]);
}

/** 把规范世界坐标平移到当前唯一展示世界，并保留高度值。 */
function presentationCoordinate(coordinate: Coordinate, worldOffset: number): Coordinate {
  if (worldOffset === 0) return coordinate;
  return Object.freeze(copyPresentationCoordinate(coordinate, worldOffset)) as Coordinate;
}

/** 创建可交给 OpenLayers 修改的展示世界坐标副本。 */
function copyPresentationCoordinate(coordinate: Coordinate, worldOffset: number): number[] {
  return coordinate.length === 3 ? [coordinate[0] + worldOffset, coordinate[1], coordinate[2]] : [coordinate[0] + worldOffset, coordinate[1]];
}

/** 比较已展示坐标与规范世界坐标叠加偏移后的值。 */
function coordinateEqualsPresentation(presented: readonly number[], canonical: readonly number[], worldOffset: number): boolean {
  return presented.length === canonical.length && presented.every((value, index) => value === canonical[index] + (index === 0 ? worldOffset : 0));
}

/** 将渲染几何状态转换为 OpenLayers Geometry。 */
function createGeometry(state: RenderGeometryState, worldOffset = 0): Geometry {
  if (state.type === 'point') return new Point(copyPresentationCoordinate(state.coordinates, worldOffset));
  if (state.type === 'polyline') return new LineString(state.coordinates.map((coordinate) => copyPresentationCoordinate(coordinate, worldOffset)));
  if (state.type === 'polygon') {
    return new Polygon(state.coordinates.map((ring) => ring.map((coordinate) => copyPresentationCoordinate(coordinate, worldOffset))));
  }
  return new CircleGeometry(copyPresentationCoordinate(state.center, worldOffset), state.radius);
}

/** 兼容类型不变时复用 OpenLayers Geometry，仅在类型变化时替换实例。 */
function updateFeatureGeometry(feature: Feature<Geometry>, state: RenderGeometryState, worldOffset = 0): void {
  const geometry = feature.getGeometry();
  if (state.type === 'point' && geometry instanceof Point) {
    if (flatCoordinatesEqual(geometry, state.coordinates, worldOffset)) return;
    geometry.setCoordinates(copyPresentationCoordinate(state.coordinates, worldOffset));
    return;
  }
  if (state.type === 'polyline' && geometry instanceof LineString) {
    if (lineCoordinatesEqual(geometry, state.coordinates, worldOffset)) return;
    geometry.setCoordinates(state.coordinates.map((coordinate) => copyPresentationCoordinate(coordinate, worldOffset)));
    return;
  }
  if (state.type === 'polygon' && geometry instanceof Polygon) {
    if (polygonCoordinatesEqual(geometry, state.coordinates, worldOffset)) return;
    geometry.setCoordinates(state.coordinates.map((ring) => ring.map((coordinate) => copyPresentationCoordinate(coordinate, worldOffset))));
    return;
  }
  if (state.type === 'circle' && geometry instanceof CircleGeometry) {
    if (coordinateEqualsPresentation(geometry.getCenter(), state.center, worldOffset) && geometry.getRadius() === state.radius) return;
    geometry.setCenterAndRadius(copyPresentationCoordinate(state.center, worldOffset), state.radius);
    return;
  }
  feature.setGeometry(createGeometry(state, worldOffset));
}

/** 原位更新点要素坐标。 */
function updatePointGeometry(feature: Feature<Geometry>, coordinate: Coordinate): void {
  const geometry = feature.getGeometry();
  if (geometry instanceof Point) {
    if (flatCoordinatesEqual(geometry, coordinate)) return;
    geometry.setCoordinates([...coordinate]);
    return;
  }
  feature.setGeometry(new Point([...coordinate]));
}

/** 已确认坐标变化后原位更新大顶点 MultiPoint。 */
function updateMultiPointGeometry(feature: Feature<Geometry>, coordinates: readonly Coordinate[], worldOffset: number): void {
  const geometry = feature.getGeometry();
  if (geometry instanceof MultiPoint) {
    if (multiPointCoordinatesEqual(geometry, coordinates, worldOffset)) return;
    const presented = coordinates.map((coordinate) => copyPresentationCoordinate(coordinate, worldOffset));
    geometry.setCoordinates(presented);
    return;
  }
  const presented = coordinates.map((coordinate) => copyPresentationCoordinate(coordinate, worldOffset));
  feature.setGeometry(new MultiPoint(presented));
}

/** 断开退役要素对几何和样式的强引用，并清理 Observable 资源。 */
function releaseFeature(feature: Feature<Geometry>): void {
  feature.setGeometry(undefined);
  feature.setStyle(undefined);
  feature.dispose();
}

/** 无分配比较简单几何的扁平坐标。 */
function flatCoordinatesEqual(geometry: Point, coordinate: Coordinate, worldOffset = 0): boolean {
  const flat = geometry.getFlatCoordinates();
  return flat.length === coordinate.length && flat.every((value, index) => value === coordinate[index] + (index === 0 ? worldOffset : 0));
}

/** 无分配比较批量编辑锚点的扁平坐标。 */
function multiPointCoordinatesEqual(geometry: MultiPoint, coordinates: readonly Coordinate[], worldOffset = 0): boolean {
  const flat = geometry.getFlatCoordinates();
  const stride = geometry.getStride();
  if (flat.length !== coordinates.length * stride) return false;
  let offset = 0;
  for (const coordinate of coordinates) {
    if (coordinate.length !== stride) return false;
    for (let index = 0; index < stride; index += 1) {
      if (flat[offset] !== coordinate[index] + (index === 0 ? worldOffset : 0)) return false;
      offset += 1;
    }
  }
  return true;
}

/** 把一个投影坐标转为 RBush 使用的零面积范围。 */
function pointExtent(coordinate: Coordinate): [number, number, number, number] {
  return [coordinate[0], coordinate[1], coordinate[0], coordinate[1]];
}

/** 无分配比较折线坐标，避免未变化状态触发 OpenLayers change 事件。 */
function lineCoordinatesEqual(geometry: LineString, coordinates: readonly Coordinate[], worldOffset = 0): boolean {
  const flat = geometry.getFlatCoordinates();
  const stride = geometry.getStride();
  if (flat.length !== coordinates.length * stride) return false;
  let offset = 0;
  for (const coordinate of coordinates) {
    if (coordinate.length !== stride) return false;
    for (let index = 0; index < stride; index += 1) {
      if (flat[offset] !== coordinate[index] + (index === 0 ? worldOffset : 0)) return false;
      offset += 1;
    }
  }
  return true;
}

/** 无分配比较多边形环和坐标。 */
function polygonCoordinatesEqual(geometry: Polygon, coordinates: readonly (readonly Coordinate[])[], worldOffset = 0): boolean {
  const flat = geometry.getFlatCoordinates();
  const ends = geometry.getEnds();
  const stride = geometry.getStride();
  if (ends.length !== coordinates.length) return false;
  let offset = 0;
  for (let ringIndex = 0; ringIndex < coordinates.length; ringIndex += 1) {
    for (const coordinate of coordinates[ringIndex]) {
      if (coordinate.length !== stride) return false;
      for (let index = 0; index < stride; index += 1) {
        if (flat[offset] !== coordinate[index] + (index === 0 ? worldOffset : 0)) return false;
        offset += 1;
      }
    }
    if (ends[ringIndex] !== offset) return false;
  }
  return offset === flat.length;
}

/** 仅在命中信息变化时更新要素元数据。 */
function setHandleHit(feature: Feature<Geometry>, hit: TransformHandleHit | undefined): void {
  const current = feature.get(handleMetadata);
  if (hit === undefined) {
    if (current !== undefined) feature.unset(handleMetadata, true);
    return;
  }
  if (isHandleHit(current) && handleHitsEqual(current, hit)) return;
  feature.set(handleMetadata, freezeHit(hit), true);
}

/** 判断目标是否需要使用可自定义样式的交互手柄。 */
function hasInteractiveHandles(target: TransformInteractionTarget, options: TransformInteractionOptions): boolean {
  return target.canScale || target.canStretch || target.canRotate || target.canEditVertices || (target.canTranslate && options.translate === 'center');
}

/** 按配置和视觉尺寸扩展目标外接范围。 */
function bufferedExtent(
  map: Map,
  extent: TransformExtent,
  point: boolean,
  options: TransformInteractionOptions,
  visualPadding?: readonly [number, number]
): TransformExtent {
  const mapResolution = presentationResolution(map);
  const fallback = point ? Math.max(options.pointRadius, options.buffer) : options.buffer;
  const paddingX = Math.max(fallback, visualPadding?.[0] ?? 0) * mapResolution;
  const paddingY = Math.max(fallback, visualPadding?.[1] ?? 0) * mapResolution;
  return Object.freeze([extent[0] - paddingX, extent[1] - paddingY, extent[2] + paddingX, extent[3] + paddingY]);
}

/** 估算点图标相对锚点的屏幕外扩距离。 */
function pointVisualPadding(feature: Feature<Geometry>, map: Map): readonly [number, number] | undefined {
  const styleFunction = feature.getStyleFunction();
  if (styleFunction === undefined) return undefined;
  let styles: Style[];
  try {
    const value = styleFunction(feature, internalResolution(map));
    if (value === undefined) return undefined;
    styles = value instanceof Style ? [value] : value.filter((style): style is Style => style instanceof Style);
  } catch {
    return undefined;
  }
  let paddingX = 0;
  let paddingY = 0;
  for (const style of styles) {
    const image = style.getImage();
    if (image === null) continue;
    try {
      const size = image.getSize();
      const anchor = image.getAnchor();
      const scale = image.getScaleArray();
      if (size === null || anchor === null || size.length < 2 || anchor.length < 2 || scale.length < 2) continue;
      const values = [size[0], size[1], anchor[0], anchor[1], scale[0], scale[1], image.getRotation()];
      if (values.some((value) => !Number.isFinite(value)) || size[0] <= 0 || size[1] <= 0 || scale[0] === 0 || scale[1] === 0) continue;
      const rotation = image.getRotation() - (image.getRotateWithView() ? 0 : rotationOf(map));
      const cosine = Math.cos(rotation);
      const sine = Math.sin(rotation);
      const xs = [-anchor[0] * scale[0], (size[0] - anchor[0]) * scale[0]];
      const ys = [-anchor[1] * scale[1], (size[1] - anchor[1]) * scale[1]];
      const corners = xs.flatMap((x) => ys.map((y) => [x * cosine - y * sine, x * sine + y * cosine] as const));
      paddingX = Math.max(paddingX, ...corners.map(([x]) => Math.abs(x)));
      paddingY = Math.max(paddingY, ...corners.map(([, y]) => Math.abs(y)));
    } catch {
      continue;
    }
  }
  return paddingX > 0 && paddingY > 0 ? Object.freeze([paddingX, paddingY]) : undefined;
}

/** 读取可用的视图分辨率。 */
function internalResolution(map: Map): number {
  const value = map.getView().getResolution();
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
}

/** 把内部视图分辨率转换为展示坐标分辨率，供用户投影中的几何缓冲使用。 */
function presentationResolution(map: Map): number {
  const value = internalResolution(map);
  if (getUserProjection() === null) return value;
  const converted = toUserResolution(value, map.getView().getProjection());
  return Number.isFinite(converted) && converted > 0 ? converted : value;
}

/** 把展示坐标转换为视图内部投影，供 RBush 与内部分辨率在同一单位下计算。 */
function coordinateForIndex(map: Map, coordinate: Coordinate): readonly [number, number] {
  const transformed = getUserProjection() === null ? coordinate : fromUserCoordinate(coordinate as unknown as number[], map.getView().getProjection());
  const x = transformed[0];
  const y = transformed[1];
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new InvalidArgumentError('Transform vertex projection must produce finite coordinates');
  return [x, y];
}

/** 读取可用的视图旋转角度。 */
function rotationOf(map: Map): number {
  const value = map.getView().getRotation();
  return Number.isFinite(value) ? value : 0;
}

/** 校验并冻结手柄命中信息。 */
function freezeHit(hit: TransformHandleHit): TransformHandleHit {
  if (
    !Array.isArray(hit.coordinate) ||
    (hit.coordinate.length !== 2 && hit.coordinate.length !== 3) ||
    hit.coordinate.some((value) => !Number.isFinite(value))
  ) {
    throw new InvalidArgumentError('Transform handle coordinate is invalid');
  }
  return Object.freeze({ ...hit, coordinate: Object.freeze([...hit.coordinate]) as Coordinate });
}

/** 判断两个地图坐标是否逐项相同。 */
function coordinatesEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** 判断数据源按当前增删差异得到的 Feature 顺序是否满足编辑视觉层序。 */
function sameFeatureSequence(left: readonly Feature<Geometry>[], right: readonly Feature<Geometry>[]): boolean {
  return left.length === right.length && left.every((feature, index) => feature === right[index]);
}

/** 判断两份编辑锚点是否占据同一个语义槽位。 */
function sameAnchorIdentity(left: EditInteractionAnchor, right: EditInteractionAnchor | undefined): boolean {
  if (right === undefined || left.kind !== right.kind || left.index !== right.index) return false;
  if (left.kind === 'insertion' || right.kind === 'insertion') return left.kind === right.kind;
  return left.role === right.role && left.removable === right.removable;
}

/** 为控制点与插入点生成与 sameAnchorIdentity 一致的稳定身份键。 */
function editAnchorIdentityKey(anchor: EditInteractionAnchor): string {
  return anchor.kind === 'insertion' ? `insertion:${anchor.index}` : `control:${anchor.index}:${anchor.role}:${anchor.removable ? 1 : 0}`;
}

/** 判断编辑锚点是否符合当前输入动作的语义候选集合。 */
function acceptsEditAnchor(anchor: EditInteractionAnchor, mode: EditAnchorHitMode): boolean {
  if (mode === 'all') return true;
  if (mode === 'control') return anchor.kind === 'control';
  return anchor.kind === 'insertion' || anchor.removable;
}

/** 判断两份命中元数据是否完全相同。 */
function handleHitsEqual(left: TransformHandleHit, right: TransformHandleHit): boolean {
  return (
    left.key === right.key &&
    left.operation === right.operation &&
    left.axis === right.axis &&
    left.index === right.index &&
    ((left.anchor === undefined && right.anchor === undefined) ||
      (left.anchor !== undefined && right.anchor !== undefined && sameAnchorIdentity(left.anchor, right.anchor))) &&
    coordinatesEqual(left.coordinate, right.coordinate)
  );
}

/** 判断两份目标样式状态是否表达相同内容。 */
function styleStatesEqual(left: ElementStyleState, right: ElementStyleState): boolean {
  if (left === right) return true;
  if (isNativeStyleRef(left) || isNativeStyleRef(right)) return false;
  return styleValuesEqual(left, right);
}

/** 递归比较已经校验过的普通样式数据。 */
function styleValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => styleValuesEqual(value, right[index]));
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) && styleValuesEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])
  );
}

/** 判断要素元数据是否是有效的手柄命中信息。 */
function isHandleHit(value: unknown): value is TransformHandleHit {
  if (value === null || typeof value !== 'object') return false;
  const hit = value as Partial<TransformHandleHit>;
  const operationValid = ['translate', 'rotate', 'scale', 'stretch', 'vertex'].includes(hit.operation ?? '');
  const insertionValid = hit.operation === undefined && hit.anchor?.kind === 'insertion';
  return typeof hit.key === 'string' && (operationValid || insertionValid) && Array.isArray(hit.coordinate);
}
