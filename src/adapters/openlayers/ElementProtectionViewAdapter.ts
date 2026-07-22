import type Collection from 'ol/Collection.js';
import Feature, { type FeatureLike } from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import type MapEvent from 'ol/MapEvent.js';
import { unByKey } from 'ol/Observable.js';
import Overlay from 'ol/Overlay.js';
import { getUserProjection } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import Icon from 'ol/style/Icon.js';
import Style, { type RenderFunction, type StyleFunction, type StyleLike } from 'ol/style/Style.js';
import type { EventsKey } from 'ol/events.js';
import { horizontalWorldFromExtent, prepareWorldEdit } from '../../core/common/worldWrap.js';
import type { Coordinate } from '../../core/common/types.js';
import type { ElementState } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ElementProtectionViewPort } from '../../core/ports/ElementProtectionPort.js';
import type { ElementProtectionState } from '../../core/protection/types.js';
import type { GeometryCodec } from './GeometryCodec.js';
import { projectRenderGeometry } from './GeometryCodec.js';
import type { LayerAdapter } from './LayerAdapter.js';
import type { StyleCompiler } from './style/StyleCompiler.js';
import { compiledImageVisualExtentPx, compiledTextVisualFootprintPx, isRenderableCompiledStyle } from './style/visualFootprint.js';

type ProtectionFeature = Feature<Geometry>;
type ProtectionSource = VectorSource<ProtectionFeature>;
type ProtectionLayer = VectorLayer<ProtectionSource>;

interface ProtectionLayerBucket {
  readonly layerId: string;
  readonly targetLayer: VectorLayer;
  readonly targetSource: VectorSource;
  readonly collection: Collection<BaseLayer>;
  readonly source: ProtectionSource;
  readonly layer: ProtectionLayer;
  readonly records: Set<ProtectionVisualRecord>;
  presentationKey: EventsKey | undefined;
}

type PointMaskMetrics = Readonly<{ kind: 'circle'; radius: number }> | Readonly<{ kind: 'rect'; extent: readonly [number, number, number, number] }>;

interface ProtectionVisualRecord {
  readonly elementId: string;
  readonly feature: ProtectionFeature;
  readonly maskStyle: Style;
  readonly styleFunction: StyleFunction;
  bucket: ProtectionLayerBucket;
  compiledBaseStyle: StyleLike;
  resolvedBaseStyles: readonly Style[];
  elementVisible: boolean;
  baseRenderable: boolean;
  anchor: Coordinate | undefined;
  pointMetrics: PointMaskMetrics;
  labelOffset: readonly [number, number];
  labelElement: HTMLDivElement | undefined;
  labelOverlay: Overlay | undefined;
}

/** Element 保护视觉适配器的可选配置。 */
export interface ElementProtectionViewAdapterOptions {
  /** 接收异步展示同步和资源清理中的非致命错误。 */
  readonly errorReporter?: ErrorReporter;
  /** 创建保护标签根节点；非浏览器环境未提供时只渲染 OpenLayers 遮罩。 */
  readonly createElement?: () => HTMLDivElement;
}

const protectionStroke = '#f59e0b';
const protectionFill = 'rgba(245,158,11,0.16)';
const protectionHalo = 'rgba(245,158,11,0.28)';
const protectionLineDash = Object.freeze([6, 4]);
const protectionStrokeWidth = 2;
const protectionHaloWidth = 8;
const protectionLineHaloWidth = 10;
const defaultPointRadius = 12;
const pointPadding = 4;
const labelGap = 10;
const defaultLabelOffset = Object.freeze([12, -12] as const);
const renderNoHit: RenderFunction = (): void => undefined;

/**
 * 将 Element 保护运行态投影为按业务 VectorLayer 分组的遮罩和内部 DOM 标签。
 *
 * 每个目标业务层最多创建一个临时保护层；保护 Feature 不进入业务 Source，也不参与命中。
 */
export class ElementProtectionViewAdapter implements ElementProtectionViewPort {
  readonly #map: OlMap;
  readonly #layers: LayerAdapter;
  readonly #geometry: GeometryCodec;
  readonly #styles: StyleCompiler;
  readonly #errorReporter: ErrorReporter;
  readonly #createElement: (() => HTMLDivElement) | undefined;
  readonly #buckets = new Map<string, ProtectionLayerBucket>();
  readonly #records = new Map<string, ProtectionVisualRecord>();
  #postrenderKey: EventsKey | undefined;
  #disposed = false;

  constructor(map: OlMap, layers: LayerAdapter, geometry: GeometryCodec, styles: StyleCompiler, options: ElementProtectionViewAdapterOptions = {}) {
    if (options.errorReporter !== undefined && typeof options.errorReporter !== 'function') {
      throw new InvalidArgumentError('Element protection errorReporter must be a function');
    }
    if (options.createElement !== undefined && typeof options.createElement !== 'function') {
      throw new InvalidArgumentError('Element protection createElement must be a function');
    }
    this.#map = map;
    this.#layers = layers;
    this.#geometry = geometry;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    this.#createElement = options.createElement ?? defaultElementFactory();
  }

  /** 新增或原位更新一个保护遮罩与编辑者标签。 */
  upsert(element: Readonly<ElementState>, protection: ElementProtectionState): void {
    this.#assertActive();
    assertViewInput(element, protection);

    const rendered = this.#geometry.render(element.geometry);
    const compiledBaseStyle = this.#styles.compile(element.style);
    const bucket = this.#requireBucket(element.layerId);
    const current = this.#records.get(element.id);
    if (current === undefined) {
      this.#createRecord(element, protection, rendered, compiledBaseStyle, bucket);
      return;
    }

    current.feature.setId(element.id);
    projectRenderGeometry(current.feature, rendered);
    current.compiledBaseStyle = compiledBaseStyle;
    current.resolvedBaseStyles = Object.freeze([]);
    current.elementVisible = element.visible;
    current.baseRenderable = element.visible;
    current.anchor = representativeCoordinate(current.feature.getGeometry());
    current.feature.changed();
    this.#updateLabelText(current, protection);

    if (current.bucket !== bucket) this.#moveRecord(current, bucket);
    this.#hideUntilRendered(current);
    this.#ensurePostrenderListener();
  }

  /** 移除指定 Element 的全部保护视觉；目标不存在时保持幂等。 */
  remove(elementId: string): void {
    if (this.#disposed) return;
    const safeId = nonEmptyString(elementId, 'Element protection id');
    const record = this.#records.get(safeId);
    if (record === undefined) return;
    this.#records.delete(safeId);
    this.#disposeRecord(record);
    this.#cleanupBucketIfEmpty(record.bucket);
    this.#cleanupPostrenderIfIdle();
  }

  /** 释放保护层、Feature、Overlay、DOM 和监听器；重复调用无副作用。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const postrenderKey = this.#postrenderKey;
    this.#postrenderKey = undefined;
    if (postrenderKey !== undefined) this.#attempt(() => unByKey(postrenderKey), 'unsubscribe-postrender');

    const records = [...this.#records.values()];
    this.#records.clear();
    for (const record of records) this.#disposeRecord(record);
    for (const bucket of [...this.#buckets.values()]) this.#disposeBucket(bucket);
    this.#buckets.clear();
  }

  /** 创建新记录，并在任一步骤失败时回滚已建立的原生资源。 */
  #createRecord(
    element: Readonly<ElementState>,
    protection: ElementProtectionState,
    rendered: ReturnType<GeometryCodec['render']>,
    compiledBaseStyle: StyleLike,
    bucket: ProtectionLayerBucket
  ): void {
    const feature = new Feature<Geometry>();
    feature.setId(element.id);
    projectRenderGeometry(feature, rendered);
    const record = {} as ProtectionVisualRecord;
    Object.assign(record, {
      elementId: element.id,
      feature,
      bucket,
      compiledBaseStyle,
      resolvedBaseStyles: Object.freeze([]),
      elementVisible: element.visible,
      baseRenderable: element.visible,
      anchor: representativeCoordinate(feature.getGeometry()),
      pointMetrics: Object.freeze({ kind: 'circle' as const, radius: defaultPointRadius }),
      labelOffset: defaultLabelOffset,
      labelElement: undefined,
      labelOverlay: undefined
    });
    const maskStyle = new Style({
      renderer: (coordinates, state) => renderProtectionMask(record, coordinates, state),
      hitDetectionRenderer: renderNoHit,
      zIndex: Number.MAX_VALUE
    });
    const styleFunction: StyleFunction = (candidate, resolution) => {
      if (!record.elementVisible) {
        record.resolvedBaseStyles = Object.freeze([]);
        record.baseRenderable = false;
        return [];
      }
      const resolved = resolveStyleLike(record.compiledBaseStyle, candidate, resolution);
      record.resolvedBaseStyles = resolved;
      record.baseRenderable = resolved.some(styleHasVisual);
      return record.baseRenderable ? maskStyle : [];
    };
    Object.assign(record, { maskStyle, styleFunction });
    feature.setStyle(styleFunction);

    try {
      this.#createLabel(record, protection);
      bucket.source.addFeature(feature);
      if (!bucket.source.hasFeature(feature)) throw new InvalidArgumentError(`OpenLayers did not attach protection Feature: ${element.id}`);
      bucket.records.add(record);
      this.#records.set(element.id, record);
      this.#hideUntilRendered(record);
      this.#ensurePostrenderListener();
    } catch (error) {
      this.#records.delete(element.id);
      bucket.records.delete(record);
      this.#disposeRecord(record);
      this.#cleanupBucketIfEmpty(bucket);
      throw error;
    }
  }

  /** 创建内部 DOM Overlay；没有 DOM 工厂时保留纯 Canvas 遮罩。 */
  #createLabel(record: ProtectionVisualRecord, protection: ElementProtectionState): void {
    const createElement = this.#createElement;
    if (createElement === undefined) return;
    const element = createElement();
    if (!isLabelElement(element)) throw new InvalidArgumentError('Element protection createElement must return an HTMLDivElement');
    element.className = 'ol-element-protection-label';
    element.style.pointerEvents = 'none';
    element.dataset.ownerId = record.elementId;
    element.hidden = true;
    element.textContent = protectionLabel(protection);
    const overlay = new Overlay({
      element,
      className: 'ol-overlay-container ol-element-protection-label-overlay',
      positioning: 'bottom-left',
      stopEvent: false,
      insertFirst: false,
      offset: [...defaultLabelOffset]
    });
    if (record.anchor !== undefined) overlay.setPosition([...record.anchor]);
    try {
      this.#map.addOverlay(overlay);
    } catch (error) {
      this.#attempt(() => this.#map.removeOverlay(overlay), 'rollback-label-overlay');
      this.#attempt(() => overlay.setElement(undefined), 'rollback-label-element');
      this.#attempt(() => overlay.dispose(), 'rollback-label-dispose');
      this.#attempt(() => element.remove(), 'rollback-label-dom');
      throw error;
    }
    record.labelElement = element;
    record.labelOverlay = overlay;
  }

  /** 只更新文字内容，避免几何或图层变化时重建 DOM。 */
  #updateLabelText(record: ProtectionVisualRecord, protection: ElementProtectionState): void {
    const element = record.labelElement;
    if (element === undefined) return;
    const text = protectionLabel(protection);
    if (element.textContent !== text) element.textContent = text;
  }

  /** 把稳定 Feature 移到新的目标业务层 bucket。 */
  #moveRecord(record: ProtectionVisualRecord, next: ProtectionLayerBucket): void {
    const previous = record.bucket;
    next.source.addFeature(record.feature);
    if (!next.source.hasFeature(record.feature)) throw new InvalidArgumentError(`OpenLayers did not move protection Feature: ${record.elementId}`);
    try {
      previous.source.removeFeature(record.feature);
    } catch (error) {
      this.#attempt(() => next.source.removeFeature(record.feature), 'rollback-move-feature');
      throw error;
    }
    previous.records.delete(record);
    next.records.add(record);
    record.bucket = next;
    this.#cleanupBucketIfEmpty(previous);
  }

  /** 找到或创建目标层共享的临时保护层。 */
  #requireBucket(layerId: string): ProtectionLayerBucket {
    const current = this.#buckets.get(layerId);
    if (current !== undefined) return current;
    const targetLayer = this.#layers.requireLayer(layerId);
    const targetSource = this.#layers.requireVectorSource(layerId);
    if (!(targetLayer instanceof VectorLayer) || !(targetSource instanceof VectorSource) || targetLayer.getSource() !== targetSource) {
      throw new InvalidArgumentError(`Element protection target must be a registered vector layer: ${layerId}`);
    }
    const collection = findLayerCollection(this.#map.getLayers(), targetLayer);
    if (collection === undefined) throw new InvalidArgumentError(`Element protection target layer is not attached: ${layerId}`);

    const source = new VectorSource<ProtectionFeature>({ wrapX: targetSource.getWrapX() });
    const layer = new VectorLayer<ProtectionSource>({ source, style: null, declutter: targetLayer.getDeclutter() });
    const bucket: ProtectionLayerBucket = {
      layerId,
      targetLayer,
      targetSource,
      collection,
      source,
      layer,
      records: new Set(),
      presentationKey: undefined
    };

    try {
      syncProtectionLayerPresentation(targetLayer, layer);
      bucket.presentationKey = targetLayer.on('propertychange', () => {
        try {
          syncProtectionLayerPresentation(targetLayer, layer);
          if (!targetLayer.getVisible() || targetLayer.getOpacity() === 0) {
            for (const record of bucket.records) this.#setLabelVisible(record, false);
          }
        } catch (error) {
          this.#report(error, 'target-layer-presentation', layerId);
        }
      });
      insertLayerAfter(collection, targetLayer, layer);
      const targetIndex = collection.getArray().indexOf(targetLayer);
      if (targetIndex < 0 || collection.getArray()[targetIndex + 1] !== layer) {
        throw new InvalidArgumentError(`OpenLayers did not attach protection layer after target: ${layerId}`);
      }
      this.#buckets.set(layerId, bucket);
      return bucket;
    } catch (error) {
      this.#disposeBucket(bucket);
      throw error;
    }
  }

  /** 在新帧完成后同步 Overlay 的有效可见性、world copy 和像素偏移。 */
  readonly #handlePostrender = (event: MapEvent): void => {
    if (this.#disposed) return;
    const frameState = event.frameState;
    if (frameState === null) return;
    for (const record of this.#records.values()) {
      try {
        const layerState = frameState.layerStatesArray.find(({ layer }) => layer === record.bucket.targetLayer);
        const layerVisible =
          frameState.extent !== null &&
          layerState !== undefined &&
          layerState.opacity > 0 &&
          record.bucket.targetLayer.isVisible({
            viewState: frameState.viewState,
            extent: frameState.extent,
            layerStatesArray: frameState.layerStatesArray
          });
        if (!record.elementVisible || !record.baseRenderable || !layerVisible || record.anchor === undefined) {
          this.#setLabelVisible(record, false);
          continue;
        }
        const position = presentationCoordinate(this.#map, record.bucket, record.anchor);
        const pixel = this.#map.getPixelFromCoordinate([...position]);
        const size = frameState.size;
        if (!validPixel(pixel) || pixel[0] < 0 || pixel[1] < 0 || pixel[0] > size[0] || pixel[1] > size[1]) {
          this.#setLabelVisible(record, false);
          continue;
        }
        if (!coordinatesEqual(record.labelOverlay?.getPosition(), position)) record.labelOverlay?.setPosition([...position]);
        const offset = protectionLabelOffset(record);
        if (!numbersEqual(record.labelOffset, offset)) {
          record.labelOffset = offset;
          record.labelOverlay?.setOffset([...offset]);
        }
        this.#setLabelVisible(record, true);
      } catch (error) {
        this.#setLabelVisible(record, false);
        this.#report(error, 'postrender-label', record.elementId);
      }
    }
  };

  #ensurePostrenderListener(): void {
    if (this.#postrenderKey !== undefined || ![...this.#records.values()].some(({ labelOverlay }) => labelOverlay !== undefined)) return;
    this.#postrenderKey = this.#map.on('postrender', this.#handlePostrender);
  }

  #cleanupPostrenderIfIdle(): void {
    if (this.#records.size > 0 || this.#postrenderKey === undefined) return;
    const key = this.#postrenderKey;
    this.#postrenderKey = undefined;
    this.#attempt(() => unByKey(key), 'unsubscribe-postrender');
  }

  #hideUntilRendered(record: ProtectionVisualRecord): void {
    this.#setLabelVisible(record, false);
    if (record.anchor !== undefined) record.labelOverlay?.setPosition([...record.anchor]);
  }

  #setLabelVisible(record: ProtectionVisualRecord, visible: boolean): void {
    const element = record.labelElement;
    if (element !== undefined && element.hidden === visible) element.hidden = !visible;
  }

  /** 清理单条 Feature 与标签资源；各步骤互不阻断。 */
  #disposeRecord(record: ProtectionVisualRecord): void {
    record.bucket.records.delete(record);
    this.#attempt(() => record.bucket.source.removeFeature(record.feature), 'remove-feature', record.elementId);
    const overlay = record.labelOverlay;
    const element = record.labelElement;
    record.labelOverlay = undefined;
    record.labelElement = undefined;
    if (overlay !== undefined) {
      this.#attempt(() => this.#map.removeOverlay(overlay), 'remove-label-overlay', record.elementId);
      this.#attempt(() => overlay.setElement(undefined), 'clear-label-element', record.elementId);
      this.#attempt(() => overlay.dispose(), 'dispose-label-overlay', record.elementId);
    }
    if (element !== undefined) this.#attempt(() => element.remove(), 'remove-label-dom', record.elementId);
    this.#attempt(() => record.feature.setGeometry(undefined), 'clear-feature-geometry', record.elementId);
    this.#attempt(() => record.feature.setStyle(undefined), 'clear-feature-style', record.elementId);
    this.#attempt(() => record.feature.dispose(), 'dispose-feature', record.elementId);
  }

  #cleanupBucketIfEmpty(bucket: ProtectionLayerBucket): void {
    if (bucket.records.size > 0 || this.#buckets.get(bucket.layerId) !== bucket) return;
    this.#buckets.delete(bucket.layerId);
    this.#disposeBucket(bucket);
  }

  /** 清理一层共享保护资源，并兼容打开失败时尚未挂载的状态。 */
  #disposeBucket(bucket: ProtectionLayerBucket): void {
    const key = bucket.presentationKey;
    bucket.presentationKey = undefined;
    if (key !== undefined) this.#attempt(() => unByKey(key), 'unsubscribe-layer-presentation', bucket.layerId);
    if (bucket.collection.getArray().includes(bucket.layer)) {
      this.#attempt(() => bucket.collection.remove(bucket.layer), 'remove-protection-layer', bucket.layerId);
    }
    this.#attempt(() => bucket.source.clear(true), 'clear-protection-source', bucket.layerId);
    this.#attempt(() => bucket.layer.setSource(null), 'clear-protection-layer-source', bucket.layerId);
    this.#attempt(() => bucket.source.dispose(), 'dispose-protection-source', bucket.layerId);
    this.#attempt(() => bucket.layer.dispose(), 'dispose-protection-layer', bucket.layerId);
    bucket.records.clear();
  }

  #attempt(work: () => void, operation: string, ownerId?: string): void {
    try {
      work();
    } catch (error) {
      this.#report(error, operation, ownerId);
    }
  }

  #report(error: unknown, operation: string, ownerId?: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'ElementProtectionViewAdapter',
        operation,
        ...(ownerId === undefined ? {} : { ownerId })
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // 错误上报失败不能中断保护视觉的其余清理步骤。
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('Element protection view has been destroyed');
  }
}

/** 使用共享 Canvas renderer 绘制点、图标、线、面和圆的保护强调。 */
function renderProtectionMask(record: ProtectionVisualRecord, coordinates: Parameters<RenderFunction>[0], state: Parameters<RenderFunction>[1]): void {
  const context = state.context;
  const pixelRatio = finitePositive(state.pixelRatio, 1);
  const geometryType = state.geometry.getType();
  context.save();
  try {
    if (geometryType === 'Point') {
      const metrics = pointMaskMetrics(record.resolvedBaseStyles, state.rotation);
      record.pointMetrics = metrics;
      drawPointMask(context, coordinates as readonly number[], metrics, pixelRatio);
      return;
    }

    context.beginPath();
    if (geometryType === 'Circle') {
      const points = coordinates as readonly (readonly number[])[];
      const center = points[0];
      const edge = points[1];
      if (center === undefined || edge === undefined) return;
      const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
      if (!Number.isFinite(radius)) return;
      context.moveTo(center[0] + radius, center[1]);
      context.arc(center[0], center[1], radius, 0, 2 * Math.PI);
      fillAndStrokeSurface(context, pixelRatio);
      return;
    }
    if (geometryType === 'Polygon') {
      for (const ring of coordinates as readonly (readonly (readonly number[])[])[]) tracePath(context, ring, true);
      fillAndStrokeSurface(context, pixelRatio);
      return;
    }

    tracePath(context, coordinates as readonly (readonly number[])[], false);
    strokeProtectionLine(context, pixelRatio);
  } finally {
    context.restore();
  }
}

function drawPointMask(context: CanvasRenderingContext2D, coordinate: readonly number[], metrics: PointMaskMetrics, pixelRatio: number): void {
  const x = coordinate[0];
  const y = coordinate[1];
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  context.beginPath();
  if (metrics.kind === 'circle') {
    const radius = (metrics.radius + pointPadding) * pixelRatio;
    context.moveTo(x + radius, y);
    context.arc(x, y, radius, 0, 2 * Math.PI);
  } else {
    const padding = pointPadding * pixelRatio;
    const left = x + metrics.extent[0] * pixelRatio - padding;
    const top = y + metrics.extent[1] * pixelRatio - padding;
    const right = x + metrics.extent[2] * pixelRatio + padding;
    const bottom = y + metrics.extent[3] * pixelRatio + padding;
    traceRoundedRectangle(context, left, top, right, bottom, 5 * pixelRatio);
  }
  fillAndStrokeSurface(context, pixelRatio);
}

function fillAndStrokeSurface(context: CanvasRenderingContext2D, pixelRatio: number): void {
  context.fillStyle = protectionFill;
  context.fill();
  strokeProtectionPath(context, pixelRatio, protectionHaloWidth);
}

function strokeProtectionLine(context: CanvasRenderingContext2D, pixelRatio: number): void {
  strokeProtectionPath(context, pixelRatio, protectionLineHaloWidth);
}

function strokeProtectionPath(context: CanvasRenderingContext2D, pixelRatio: number, haloWidth: number): void {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.miterLimit = 2;
  context.setLineDash([]);
  context.strokeStyle = protectionHalo;
  context.lineWidth = haloWidth * pixelRatio;
  context.stroke();
  context.strokeStyle = protectionStroke;
  context.lineWidth = protectionStrokeWidth * pixelRatio;
  context.setLineDash(protectionLineDash.map((value) => value * pixelRatio));
  context.stroke();
}

function tracePath(context: CanvasRenderingContext2D, points: readonly (readonly number[])[], close: boolean): void {
  const first = points[0];
  if (first === undefined) return;
  context.moveTo(first[0], first[1]);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point !== undefined) context.lineTo(point[0], point[1]);
  }
  if (close) context.closePath();
}

function traceRoundedRectangle(context: CanvasRenderingContext2D, left: number, top: number, right: number, bottom: number, radius: number): void {
  const safeRadius = Math.max(0, Math.min(radius, Math.abs(right - left) / 2, Math.abs(bottom - top) / 2));
  context.moveTo(left + safeRadius, top);
  context.lineTo(right - safeRadius, top);
  context.quadraticCurveTo(right, top, right, top + safeRadius);
  context.lineTo(right, bottom - safeRadius);
  context.quadraticCurveTo(right, bottom, right - safeRadius, bottom);
  context.lineTo(left + safeRadius, bottom);
  context.quadraticCurveTo(left, bottom, left, bottom - safeRadius);
  context.lineTo(left, top + safeRadius);
  context.quadraticCurveTo(left, top, left + safeRadius, top);
  context.closePath();
}

/** 图片和文字使用矩形遮罩，普通圆形 Symbol 使用外环。 */
function pointMaskMetrics(styles: readonly Style[], rotation: number): PointMaskMetrics {
  let extent: [number, number, number, number] | undefined;
  let rectangular = false;
  for (const style of styles) {
    const image = style.getImage();
    if (image !== null && image.getOpacity() > 0) {
      const imageExtent = compiledImageVisualExtentPx([0, 0], image, rotation);
      if (imageExtent !== undefined) extent = unionExtent(extent, imageExtent);
      if (image instanceof Icon) rectangular = true;
    }
    const text = style.getText();
    if (text !== null && text.getText() !== undefined && String(text.getText()).length > 0) {
      const footprint = compiledTextVisualFootprintPx(style);
      if (footprint[0] > 0 || footprint[1] > 0) {
        extent = unionExtent(extent, [-footprint[0], -footprint[1], footprint[0], footprint[1]]);
        rectangular = true;
      }
    }
  }
  if (extent === undefined) return Object.freeze({ kind: 'circle', radius: defaultPointRadius });
  if (rectangular) return Object.freeze({ kind: 'rect', extent: Object.freeze(extent) });
  return Object.freeze({ kind: 'circle', radius: Math.max(defaultPointRadius, ...extent.map(Math.abs)) });
}

function protectionLabelOffset(record: ProtectionVisualRecord): readonly [number, number] {
  const geometry = record.feature.getGeometry();
  if (!(geometry instanceof Point)) return defaultLabelOffset;
  const metrics = record.pointMetrics;
  if (metrics.kind === 'circle') return Object.freeze([metrics.radius + pointPadding + labelGap, -metrics.radius - pointPadding - 6]);
  return Object.freeze([metrics.extent[2] + pointPadding + labelGap, metrics.extent[1] - pointPadding - 6]);
}

function representativeCoordinate(geometry: Geometry | undefined): Coordinate | undefined {
  let coordinate: readonly number[] | undefined;
  if (geometry instanceof Point) coordinate = geometry.getCoordinates();
  else if (geometry instanceof LineString) coordinate = geometry.getCoordinateAt(0.5);
  else if (geometry instanceof Polygon) coordinate = geometry.getInteriorPoint().getCoordinates();
  else if (geometry instanceof Circle) {
    const center = geometry.getCenter();
    const offset = geometry.getRadius() / Math.SQRT2;
    coordinate = [center[0] + offset, center[1] + offset];
  }
  if (coordinate === undefined || coordinate.length < 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) return undefined;
  return Object.freeze([coordinate[0], coordinate[1]]);
}

/** 选择与当前 View 中心最近的一份水平循环世界标签。 */
function presentationCoordinate(map: OlMap, bucket: ProtectionLayerBucket, anchor: Coordinate): Coordinate {
  const projection = getUserProjection() ?? bucket.targetSource.getProjection() ?? map.getView().getProjection();
  const world = horizontalWorldFromExtent(projection.getExtent(), bucket.targetSource.getWrapX() === true && projection.canWrapX());
  if (world === undefined) return anchor;
  const center = map.getView().getCenter();
  const referenceX = center !== undefined && Number.isFinite(center[0]) ? center[0] : anchor[0];
  return prepareWorldEdit([anchor], { world, referenceX }).controlPoints[0] ?? anchor;
}

function resolveStyleLike(style: StyleLike, feature: FeatureLike, resolution: number): readonly Style[] {
  try {
    const result = typeof style === 'function' ? style(feature, resolution) : style;
    if (result === undefined) return Object.freeze([]);
    if (result instanceof Style) return Object.freeze([result]);
    return Object.freeze(result.filter((candidate): candidate is Style => candidate instanceof Style));
  } catch {
    return Object.freeze([]);
  }
}

function styleHasVisual(style: Style): boolean {
  return style.getRenderer() !== null || isRenderableCompiledStyle(style);
}

function unionExtent(
  current: [number, number, number, number] | undefined,
  candidate: readonly [number, number, number, number]
): [number, number, number, number] {
  if (current === undefined) return [candidate[0], candidate[1], candidate[2], candidate[3]];
  current[0] = Math.min(current[0], candidate[0]);
  current[1] = Math.min(current[1], candidate[1]);
  current[2] = Math.max(current[2], candidate[2]);
  current[3] = Math.max(current[3], candidate[3]);
  return current;
}

/** 递归定位目标图层直属 Collection。 */
function findLayerCollection(collection: Collection<BaseLayer>, target: BaseLayer): Collection<BaseLayer> | undefined {
  if (collection.getArray().includes(target)) return collection;
  for (const layer of collection.getArray()) {
    if (!(layer instanceof LayerGroup)) continue;
    const nested = findLayerCollection(layer.getLayers(), target);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** 将保护层插入目标层紧后方，使相同 zIndex 下的遮罩稳定覆盖业务图形。 */
function insertLayerAfter(collection: Collection<BaseLayer>, target: BaseLayer, protection: ProtectionLayer): void {
  const targetIndex = collection.getArray().indexOf(target);
  if (targetIndex < 0) throw new InvalidArgumentError('OpenLayers detached the protection target layer during installation');
  collection.insertAt(targetIndex + 1, protection);
}

/** 使共享保护层实时继承目标业务层的完整展示约束。 */
function syncProtectionLayerPresentation(target: VectorLayer, protection: ProtectionLayer): void {
  if (protection.getVisible() !== target.getVisible()) protection.setVisible(target.getVisible());
  if (protection.getOpacity() !== target.getOpacity()) protection.setOpacity(target.getOpacity());
  if (protection.getExtent() !== target.getExtent()) protection.setExtent(target.getExtent());
  if (protection.getMinResolution() !== target.getMinResolution()) protection.setMinResolution(target.getMinResolution());
  if (protection.getMaxResolution() !== target.getMaxResolution()) protection.setMaxResolution(target.getMaxResolution());
  if (protection.getMinZoom() !== target.getMinZoom()) protection.setMinZoom(target.getMinZoom());
  if (protection.getMaxZoom() !== target.getMaxZoom()) protection.setMaxZoom(target.getMaxZoom());
  const zIndex = target.getZIndex();
  if (protection.getZIndex() !== zIndex) {
    if (zIndex === undefined) protection.unset('zIndex');
    else protection.setZIndex(zIndex);
  }
}

function assertViewInput(element: Readonly<ElementState>, protection: ElementProtectionState): void {
  if (element === null || typeof element !== 'object') throw new InvalidArgumentError('Element protection view requires an Element state');
  const elementId = nonEmptyString(element.id, 'Element protection Element id');
  nonEmptyString(element.layerId, 'Element protection layer id');
  if (typeof element.visible !== 'boolean') throw new InvalidArgumentError('Element protection Element visible must be boolean');
  if (protection === null || typeof protection !== 'object' || protection.protected !== true) {
    throw new InvalidArgumentError('Element protection view requires an active protection state');
  }
  if (protection.elementId !== elementId) throw new InvalidArgumentError('Element protection state must match the Element id');
}

function protectionLabel(protection: ElementProtectionState): string {
  return protection.operatorName === undefined ? '🔒 其他协作者正在编辑' : `🔒 ${protection.operatorName} 正在编辑`;
}

function defaultElementFactory(): (() => HTMLDivElement) | undefined {
  const document = globalThis.document;
  return document === undefined ? undefined : () => document.createElement('div');
}

function isLabelElement(value: unknown): value is HTMLDivElement {
  return (
    value !== null &&
    typeof value === 'object' &&
    'style' in value &&
    'dataset' in value &&
    'remove' in value &&
    typeof (value as { remove?: unknown }).remove === 'function'
  );
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function validPixel(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function numbersEqual(left: readonly number[] | undefined, right: readonly number[]): boolean {
  return left !== undefined && left.length === right.length && left.every((value, index) => value === right[index]);
}

function coordinatesEqual(left: readonly number[] | undefined, right: readonly number[]): boolean {
  return numbersEqual(left, right);
}
