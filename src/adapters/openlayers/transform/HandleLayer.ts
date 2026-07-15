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
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Icon from 'ol/style/Icon.js';
import Stroke from 'ol/style/Stroke.js';
import Style, { type RenderFunction } from 'ol/style/Style.js';
import type { Coordinate, Pixel } from '../../../core/common/types.js';
import { runFinalizers } from '../../../core/common/dispose.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import type { LayerRenderPort, LayerRenderTargetHandle } from '../../../core/ports/LayerRenderPort.js';
import type { TransformInteractionOptions, TransformInteractionTarget, TransformOperation } from '../../../core/ports/TransformInteractionPort.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';
import { isNativeStyleRef, type ElementStyleState } from '../../../core/style/types.js';
import type { ProjectionSuppressionLease, FeatureBinding } from '../FeatureBinding.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';
import { centerImage, rotateImage, scaleImage, stretchHorizontalImage, stretchVerticalImage, translateImage } from './handleImages.js';
import { extentCenter, renderExtent, type TransformExtent } from './PreviewTransform.js';

/** 命中的 Transform 控制手柄信息。 */
export interface TransformHandleHit {
  /** 手柄的唯一键。 */
  readonly key: string;
  /** 手柄触发的操作类型。 */
  readonly operation: 'translate' | 'rotate' | 'scale' | 'stretch' | 'vertex';
  /** 操作影响的坐标轴。 */
  readonly axis?: 'x' | 'y' | 'xy';
  /** 顶点手柄对应的控制点索引。 */
  readonly index?: number;
  /** 手柄所在的地图坐标。 */
  readonly coordinate: Coordinate;
}

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
interface VertexIndexEntry {
  /** 顶点在 Core 控制点列表中的索引。 */
  readonly index: number;
  /** 当前展示世界中的投影坐标。 */
  coordinate: Coordinate;
  /** RBush 和视图分辨率共同使用的视图投影坐标。 */
  internalCoordinate: readonly [number, number];
}

/** 写入手柄要素的元数据字段名。 */
const handleMetadata = 'ol-engine-transform-handle';

/** 标记使用 MultiPoint 统一渲染的大顶点要素。 */
const vertexBatchMetadata = 'ol-engine-transform-vertex-batch';

/** 默认统一样式超过该数量后切换为 MultiPoint 批次。 */
const vertexBatchThreshold = 512;

/** 自定义 StyleFunction 在该规模以下保留逐顶点 Feature 语义，以上改为单个 MultiPoint 批次。 */
const customVertexBatchThreshold = 4_096;

/** 默认顶点圆的可视半径，包含描边的半像素扩展。 */
const defaultVertexHitRadius = 6;

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
  /** 默认样式的大顶点 MultiPoint 要素。 */
  #vertexBatch: Feature<Geometry> | undefined;
  /** 大顶点命中使用的投影坐标索引。 */
  readonly #vertexIndex = new RBush<VertexIndexEntry>();
  /** 与顶点索引一一对应的稳定条目。 */
  #vertexEntries: VertexIndexEntry[] = [];
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
  setTarget(target: TransformInteractionTarget): void {
    this.#assertActive();
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
      this.#syncTargetFeatures(target, previewStyle, handleStyle);
      this.#target = target;
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
  hit(pixel: Pixel, hitTolerance: number): TransformHandleHit | undefined {
    this.#assertActive();
    const vertex = this.#hitVertexBatch(pixel, hitTolerance);
    if (vertex !== undefined) return vertex;
    if (this.#vertexBatch !== undefined && this.#target?.mode === 'edit') return undefined;
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
      this.#extent = undefined;
      this.#preview = undefined;
      this.#bbox = undefined;
      this.#rotationCenter = undefined;
      for (const feature of this.#handleFeatures.values()) releaseFeature(feature);
      this.#handleFeatures.clear();
      this.#vertexHandleCount = 0;
      this.#activeTargetFeatures.clear();
      this.#clearVertexBatch();
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
    handleStyle: ReturnType<StyleCompiler['compile']> | undefined
  ): void {
    const preview = this.#preview ?? new Feature<Geometry>();
    this.#preview = preview;
    updateFeatureGeometry(preview, target.geometry);
    if (preview.getStyle() !== previewStyle) preview.setStyle(previewStyle);
    const geometryExtent = renderExtent(target.geometry);
    setHandleHit(
      preview,
      target.canTranslate && this.#options.translate === 'feature'
        ? { key: 'feature', operation: 'translate', coordinate: extentCenter(geometryExtent) }
        : undefined
    );

    const features = [preview, ...this.#syncExtentFeatures(target, handleStyle, geometryExtent)];
    const vertexHandleCount = target.canEditVertices ? target.controlPoints.length : 0;
    const batchThreshold = handleStyle === undefined ? vertexBatchThreshold : customVertexBatchThreshold;
    const useVertexBatch = vertexHandleCount >= batchThreshold;
    if (useVertexBatch) {
      features.push(this.#syncVertexBatch(target.controlPoints, handleStyle));
    } else if (vertexHandleCount > 0) {
      for (let index = 0; index < vertexHandleCount; index += 1) {
        features.push(this.#handle(`vertex-${index}`, 'vertex', target.controlPoints[index], 'xy', handleStyle, index));
      }
    }
    this.#syncSourceFeatures(features);
    this.#trimVertexHandlePool(useVertexBatch ? 0 : vertexHandleCount);
    if (!useVertexBatch) this.#clearVertexBatch();
  }

  /** 原位更新大顶点 MultiPoint 及其命中索引。 */
  #syncVertexBatch(coordinates: readonly Coordinate[], customStyle: ReturnType<StyleCompiler['compile']> | undefined): Feature<Geometry> {
    const feature = this.#vertexBatch ?? new Feature<Geometry>();
    this.#vertexBatch = feature;
    const coordinatesChanged = this.#syncVertexIndex(coordinates);
    if (coordinatesChanged) updateMultiPointGeometry(feature, coordinates);
    const style = customStyle ?? vertexBatchStyle;
    if (feature.getStyle() !== style) feature.setStyle(style);
    if (feature.get(vertexBatchMetadata) !== true) feature.set(vertexBatchMetadata, true, true);
    return feature;
  }

  /** 大顶点首次批量加载 RBush，单顶点变化时只更新差异条目。 */
  #syncVertexIndex(coordinates: readonly Coordinate[]): boolean {
    const entries = this.#vertexEntries;
    if (entries.length !== coordinates.length) {
      this.#rebuildVertexIndex(coordinates);
      return true;
    }
    const incrementalLimit = Math.max(32, Math.floor(coordinates.length / 100));
    const changes: Array<Readonly<{ entry: VertexIndexEntry; coordinate: Coordinate }>> = [];
    for (let index = 0; index < coordinates.length; index += 1) {
      if (coordinatesEqual(entries[index].coordinate, coordinates[index])) continue;
      changes.push({ entry: entries[index], coordinate: coordinates[index] });
      if (changes.length > incrementalLimit) {
        this.#rebuildVertexIndex(coordinates);
        return true;
      }
    }
    if (changes.length === 0) return false;
    for (const change of changes) {
      change.entry.coordinate = change.coordinate;
      change.entry.internalCoordinate = coordinateForIndex(this.#map, change.coordinate);
      this.#vertexIndex.update(pointExtent(change.entry.internalCoordinate), change.entry);
    }
    return true;
  }

  /** 使用点范围一次批量构建大顶点 RBush。 */
  #rebuildVertexIndex(coordinates: readonly Coordinate[]): void {
    this.#vertexIndex.clear();
    const entries = coordinates.map((coordinate, index): VertexIndexEntry => ({
      index,
      coordinate,
      internalCoordinate: coordinateForIndex(this.#map, coordinate)
    }));
    this.#vertexEntries = entries;
    if (entries.length > 0)
      this.#vertexIndex.load(
        entries.map((entry) => pointExtent(entry.internalCoordinate)),
        entries
      );
  }

  /** 用屏幕容差查询大顶点索引，等距时固定选择较小索引。 */
  #hitVertexBatch(pixel: Pixel, hitTolerance: number): TransformHandleHit | undefined {
    if (this.#vertexBatch === undefined || this.#vertexEntries.length === 0) return undefined;
    const rawCoordinate = this.#map.getCoordinateFromPixelInternal([...pixel]);
    if (!Array.isArray(rawCoordinate) || rawCoordinate.length < 2 || !Number.isFinite(rawCoordinate[0]) || !Number.isFinite(rawCoordinate[1])) return undefined;
    const coordinate: Coordinate = [rawCoordinate[0], rawCoordinate[1]];
    const tolerance = internalResolution(this.#map) * (Math.max(0, hitTolerance) + defaultVertexHitRadius);
    const candidates = this.#vertexIndex.getInExtent([
      coordinate[0] - tolerance,
      coordinate[1] - tolerance,
      coordinate[0] + tolerance,
      coordinate[1] + tolerance
    ]);
    const toleranceSquared = tolerance * tolerance;
    let best: VertexIndexEntry | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const x = candidate.internalCoordinate[0] - coordinate[0];
      const y = candidate.internalCoordinate[1] - coordinate[1];
      const distance = x * x + y * y;
      if (distance > toleranceSquared) continue;
      if (distance < bestDistance || (distance === bestDistance && (best === undefined || candidate.index < best.index))) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best === undefined
      ? undefined
      : freezeHit({ key: `vertex-${best.index}`, operation: 'vertex', axis: 'xy', index: best.index, coordinate: best.coordinate });
  }

  /** 断开大顶点批次和空间索引的全部引用。 */
  #clearVertexBatch(): void {
    const feature = this.#vertexBatch;
    this.#vertexBatch = undefined;
    this.#vertexEntries = [];
    this.#vertexIndex.clear();
    if (feature !== undefined) releaseFeature(feature);
  }

  /** 更新受视图分辨率影响的选中框与操作手柄，不触碰预览和顶点要素。 */
  #syncExtentFeatures(
    target: TransformInteractionTarget,
    handleStyle: ReturnType<StyleCompiler['compile']> | undefined,
    geometryExtent: TransformExtent
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
    const [minX, minY, maxX, maxY] = extent;
    const center = target.handleCenter ?? extentCenter(extent);
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
    const bulkReset = removals.length >= bulkResetRemovalThreshold && removals.length * 2 >= this.#activeTargetFeatures.size;
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

  /** 顶点数缩减或离开编辑模式时立即释放不再可见的要素池。 */
  #trimVertexHandlePool(nextCount: number): void {
    const previousCount = this.#vertexHandleCount;
    this.#vertexHandleCount = nextCount;
    if (nextCount >= previousCount) return;
    for (let index = nextCount; index < previousCount; index += 1) {
      const key = `vertex-${index}`;
      const feature = this.#handleFeatures.get(key);
      if (feature === undefined) continue;
      this.#handleFeatures.delete(key);
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
    this.#clearVertexBatch();
    this.#preview = undefined;
    this.#bbox = undefined;
    this.#rotationCenter = undefined;
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
    updatePointGeometry(feature, target.handleCenter ?? extentCenter(extent));
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
    this.#syncExtentFeatures(this.#target, handleStyle, renderExtent(this.#target.geometry));
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
    index?: number
  ): Feature<Geometry> {
    let feature = this.#handleFeatures.get(key);
    if (feature === undefined) {
      feature = new Feature<Geometry>();
      this.#handleFeatures.set(key, feature);
    }
    updatePointGeometry(feature, coordinate);
    const style = customStyle ?? styleFor(operation, axis);
    if (feature.getStyle() !== style) feature.setStyle(style);
    setHandleHit(feature, { key, operation, coordinate, axis, ...(index === undefined ? {} : { index }) });
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
const vertexHandleStyle = new Style({
  image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#27ae60', width: 2 }) })
});

/** 用一条 Canvas path 绘制默认顶点批次，所有视觉尺寸按 DPR 缩放。 */
const renderVertexBatch: RenderFunction = (coordinates, state): void => {
  if (!Array.isArray(coordinates) || coordinates.length === 0 || !Array.isArray(coordinates[0])) return;
  const points = coordinates as unknown as readonly Coordinate[];
  const context = state.context;
  const pixelRatio = Number.isFinite(state.pixelRatio) && state.pixelRatio > 0 ? state.pixelRatio : 1;
  const radius = 5 * pixelRatio;
  context.save();
  try {
    context.beginPath();
    for (const point of points) {
      context.moveTo(point[0] + radius, point[1]);
      context.arc(point[0], point[1], radius, 0, Math.PI * 2);
    }
    context.fillStyle = '#ffffff';
    context.fill();
    context.strokeStyle = '#27ae60';
    context.lineWidth = 2 * pixelRatio;
    context.stroke();
  } finally {
    context.restore();
  }
};

/** MultiPoint 命中由 RBush 负责，命中画布上不重复绘制大批量圆。 */
const renderEmptyHitBatch: RenderFunction = (): void => undefined;
const vertexBatchStyle = new Style({ renderer: renderVertexBatch, hitDetectionRenderer: renderEmptyHitBatch });

/** 用内置图片创建手柄图标样式。 */
function iconStyle(src: string, displacement?: readonly [number, number]): Style {
  return new Style({ image: new Icon({ src, color: [80, 80, 80, 1], ...(displacement === undefined ? {} : { displacement: [...displacement] }) }) });
}

/** 按操作类型和坐标轴选择内置手柄样式。 */
function styleFor(operation: TransformHandleHit['operation'], axis: TransformHandleHit['axis']): Style {
  if (operation === 'rotate') return rotateHandleStyle;
  if (operation === 'vertex') return vertexHandleStyle;
  if (operation === 'translate') return translateHandleStyle;
  if (operation === 'stretch') return axis === 'x' ? stretchHorizontalHandleStyle : stretchVerticalHandleStyle;
  return scaleHandleStyle;
}

/** 将渲染几何状态转换为 OpenLayers Geometry。 */
function createGeometry(state: RenderGeometryState): Geometry {
  if (state.type === 'point') return new Point([...state.coordinates]);
  if (state.type === 'polyline') return new LineString(state.coordinates.map((coordinate) => [...coordinate]));
  if (state.type === 'polygon') return new Polygon(state.coordinates.map((ring) => ring.map((coordinate) => [...coordinate])));
  return new CircleGeometry([...state.center], state.radius);
}

/** 兼容类型不变时复用 OpenLayers Geometry，仅在类型变化时替换实例。 */
function updateFeatureGeometry(feature: Feature<Geometry>, state: RenderGeometryState): void {
  const geometry = feature.getGeometry();
  if (state.type === 'point' && geometry instanceof Point) {
    if (flatCoordinatesEqual(geometry, state.coordinates)) return;
    geometry.setCoordinates([...state.coordinates]);
    return;
  }
  if (state.type === 'polyline' && geometry instanceof LineString) {
    if (lineCoordinatesEqual(geometry, state.coordinates)) return;
    geometry.setCoordinates(state.coordinates.map((coordinate) => [...coordinate]));
    return;
  }
  if (state.type === 'polygon' && geometry instanceof Polygon) {
    if (polygonCoordinatesEqual(geometry, state.coordinates)) return;
    geometry.setCoordinates(state.coordinates.map((ring) => ring.map((coordinate) => [...coordinate])));
    return;
  }
  if (state.type === 'circle' && geometry instanceof CircleGeometry) {
    if (coordinatesEqual(geometry.getCenter(), state.center) && geometry.getRadius() === state.radius) return;
    geometry.setCenterAndRadius([...state.center], state.radius);
    return;
  }
  feature.setGeometry(createGeometry(state));
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
function updateMultiPointGeometry(feature: Feature<Geometry>, coordinates: readonly Coordinate[]): void {
  const geometry = feature.getGeometry();
  if (geometry instanceof MultiPoint) {
    geometry.setCoordinates(coordinates.map((coordinate) => [...coordinate]));
    return;
  }
  feature.setGeometry(new MultiPoint(coordinates.map((coordinate) => [...coordinate])));
}

/** 断开退役要素对几何和样式的强引用，并清理 Observable 资源。 */
function releaseFeature(feature: Feature<Geometry>): void {
  feature.setGeometry(undefined);
  feature.setStyle(undefined);
  feature.dispose();
}

/** 无分配比较简单几何的扁平坐标。 */
function flatCoordinatesEqual(geometry: Point, coordinate: Coordinate): boolean {
  const flat = geometry.getFlatCoordinates();
  return flat.length === coordinate.length && flat.every((value, index) => value === coordinate[index]);
}

/** 把一个投影坐标转为 RBush 使用的零面积范围。 */
function pointExtent(coordinate: Coordinate): [number, number, number, number] {
  return [coordinate[0], coordinate[1], coordinate[0], coordinate[1]];
}

/** 无分配比较折线坐标，避免未变化状态触发 OpenLayers change 事件。 */
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

/** 无分配比较多边形环和坐标。 */
function polygonCoordinatesEqual(geometry: Polygon, coordinates: readonly (readonly Coordinate[])[]): boolean {
  const flat = geometry.getFlatCoordinates();
  const ends = geometry.getEnds();
  const stride = geometry.getStride();
  if (ends.length !== coordinates.length) return false;
  let offset = 0;
  for (let ringIndex = 0; ringIndex < coordinates.length; ringIndex += 1) {
    for (const coordinate of coordinates[ringIndex]) {
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

/** 判断两份命中元数据是否完全相同。 */
function handleHitsEqual(left: TransformHandleHit, right: TransformHandleHit): boolean {
  return (
    left.key === right.key &&
    left.operation === right.operation &&
    left.axis === right.axis &&
    left.index === right.index &&
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
  return typeof hit.key === 'string' && ['translate', 'rotate', 'scale', 'stretch', 'vertex'].includes(hit.operation ?? '') && Array.isArray(hit.coordinate);
}
