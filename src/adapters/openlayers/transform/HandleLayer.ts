import Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import CircleGeometry from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { unByKey } from 'ol/Observable.js';
import type { EventsKey } from 'ol/events.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Icon from 'ol/style/Icon.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import type { Coordinate, Pixel } from '../../../core/common/types.js';
import { runFinalizers } from '../../../core/common/dispose.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import type { LayerRenderPort, LayerRenderTargetHandle } from '../../../core/ports/LayerRenderPort.js';
import type { TransformInteractionOptions, TransformInteractionTarget, TransformOperation } from '../../../core/ports/TransformInteractionPort.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';
import type { ProjectionSuppressionLease, FeatureBinding } from '../FeatureBinding.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';
import { centerImage, rotateImage, scaleImage, stretchHorizontalImage, stretchVerticalImage, translateImage } from './handleImages.js';
import { extentCenter, renderExtent, translateRenderGeometry, type TransformExtent } from './PreviewTransform.js';

export interface TransformHandleHit {
  readonly key: string;
  readonly operation: 'translate' | 'rotate' | 'scale' | 'stretch' | 'vertex';
  readonly axis?: 'x' | 'y' | 'xy';
  readonly index?: number;
  readonly coordinate: Coordinate;
}

interface HandleLayerOptions {
  readonly sessionId: string;
  readonly interaction: TransformInteractionOptions;
}

const handleMetadata = 'ol-engine-transform-handle';

export class HandleLayer {
  readonly renderLayerId: string;
  readonly renderTargetId: string;
  readonly #map: Map;
  readonly #binding: FeatureBinding;
  readonly #styles: StyleCompiler;
  readonly #render: LayerRenderPort;
  readonly #options: TransformInteractionOptions;
  readonly #source: VectorSource<Feature<Geometry>>;
  readonly #layer: VectorLayer<VectorSource<Feature<Geometry>>>;
  readonly #viewKeys: EventsKey[] = [];
  #target: TransformInteractionTarget | undefined;
  #extent: TransformExtent | undefined;
  #suppression: ProjectionSuppressionLease | undefined;
  #bbox: Feature<Geometry> | undefined;
  #copy: Feature<Geometry> | undefined;
  #copyGeometry: RenderGeometryState | undefined;
  #renderTarget: LayerRenderTargetHandle | undefined;
  #renderTargetLayerId: string | undefined;
  #operationActive = false;
  #activeOperation: TransformOperation | undefined;
  #blinkVisible = true;
  #destroyed = false;
  #destroying = false;

  constructor(map: Map, binding: FeatureBinding, styles: StyleCompiler, render: LayerRenderPort, options: HandleLayerOptions) {
    this.#map = map;
    this.#binding = binding;
    this.#styles = styles;
    this.#render = render;
    this.#options = options.interaction;
    this.renderLayerId = `transform-handles:${options.sessionId}`;
    this.renderTargetId = `transform-bbox:${options.sessionId}`;
    this.#source = new VectorSource({ wrapX: true });
    this.#layer = new VectorLayer({ source: this.#source, zIndex: 2_147_483_647, updateWhileAnimating: true, updateWhileInteracting: true });
    this.#map.addLayer(this.#layer);
    const view = this.#map.getView();
    this.#viewKeys.push(view.on('change:resolution', this.#refreshForView), view.on('change:rotation', this.#refreshForView));
  }

  get target(): TransformInteractionTarget | undefined {
    return this.#target;
  }

  get activeRenderLayerId(): string {
    return this.#target?.layerId ?? this.renderLayerId;
  }

  get extent(): TransformExtent | undefined {
    return this.#extent;
  }

  setTarget(target: TransformInteractionTarget): void {
    this.#assertActive();
    const targetChanged = this.#target?.elementId !== target.elementId;
    const features = this.#featuresFor(target);
    let suppression: ProjectionSuppressionLease | undefined;
    let registration: LayerRenderTargetHandle | undefined;
    try {
      if (this.#renderTarget === undefined || this.#renderTargetLayerId !== target.layerId) {
        registration = this.#registerRenderTarget(target.layerId);
      }
      suppression = this.#binding.suppressProjection(target.elementId);
      this.#source.clear(true);
      this.#source.addFeatures(features);
      const previous = this.#suppression;
      const previousRegistration = this.#renderTarget;
      if (targetChanged) {
        this.#operationActive = false;
        this.#activeOperation = undefined;
        this.#blinkVisible = true;
      }
      this.#target = target;
      this.#applyBBoxStyle();
      this.#suppression = suppression;
      suppression = undefined;
      if (registration !== undefined) {
        this.#renderTarget = registration;
        this.#renderTargetLayerId = target.layerId;
        registration = undefined;
        previousRegistration?.destroy();
      }
      previous?.release();
      this.#copy = undefined;
      this.#copyGeometry = undefined;
    } finally {
      suppression?.release();
      registration?.destroy();
    }
  }

  clearTarget(): void {
    if (this.#destroyed) return;
    this.#releaseRenderTarget();
    this.#source.clear(true);
    this.#target = undefined;
    this.#extent = undefined;
    this.#bbox = undefined;
    this.#copy = undefined;
    this.#copyGeometry = undefined;
    this.#operationActive = false;
    this.#activeOperation = undefined;
    this.#blinkVisible = true;
    const suppression = this.#suppression;
    this.#suppression = undefined;
    suppression?.release();
  }

  setCopyPreview(geometry: RenderGeometryState, style: TransformInteractionTarget['style']): void {
    this.#assertActive();
    this.clearCopyPreview();
    const feature = new Feature<Geometry>(createGeometry(geometry));
    feature.setStyle(this.#styles.compile(style));
    feature.set('ol-engine-transform-copy', true, true);
    this.#source.addFeature(feature);
    this.#copy = feature;
    this.#copyGeometry = geometry;
  }

  updateCopyPreview(x: number, y: number): void {
    if (this.#copy === undefined || this.#copyGeometry === undefined) return;
    this.#copy.setGeometry(createGeometry(translateRenderGeometry(this.#copyGeometry, x, y)));
  }

  clearCopyPreview(): void {
    const feature = this.#copy;
    this.#copy = undefined;
    this.#copyGeometry = undefined;
    if (feature === undefined) return;
    this.#source.removeFeature(feature);
    feature.setGeometry(undefined);
    feature.setStyle(undefined);
    feature.dispose();
  }

  hit(pixel: Pixel, hitTolerance: number): TransformHandleHit | undefined {
    this.#assertActive();
    return this.#map.forEachFeatureAtPixel(
      [...pixel],
      (feature) => {
        if (!(feature instanceof Feature)) return undefined;
        const metadata = feature.get(handleMetadata);
        return isHandleHit(metadata) ? metadata : undefined;
      },
      { layerFilter: (layer) => layer === this.#layer, hitTolerance, checkWrapped: true }
    );
  }

  setBlink(visible: boolean): void {
    if (!this.#operationActive) return;
    if (this.#blinkVisible === visible) return;
    this.#blinkVisible = visible;
    this.#applyBBoxStyle();
  }

  setOperationActive(active: boolean, operation?: TransformOperation): void {
    this.#assertActive();
    if (active && operation === undefined) throw new InvalidArgumentError('Transform active operation is required');
    if (this.#operationActive === active && this.#activeOperation === operation) return;
    this.#operationActive = active;
    this.#activeOperation = active ? operation : undefined;
    this.#blinkVisible = true;
    this.#refreshForView();
  }

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
      this.#bbox = undefined;
      this.#operationActive = false;
      this.#activeOperation = undefined;
      this.#destroyed = true;
    } finally {
      this.#destroying = false;
    }
  }

  #featuresFor(target: TransformInteractionTarget): Feature<Geometry>[] {
    const preview = new Feature<Geometry>(createGeometry(target.geometry));
    preview.setStyle(this.#styles.compile(target.style));
    if (target.canTranslate && this.#options.translate === 'feature') {
      preview.set(handleMetadata, freezeHit({ key: 'feature', operation: 'translate', coordinate: geometryCenter(target.geometry) }), true);
    }

    const extent = bufferedExtent(
      this.#map,
      target.geometry,
      this.#options,
      target.geometry.type === 'point' ? pointVisualPadding(preview, this.#map) : undefined
    );
    this.#extent = extent;
    const [minX, minY, maxX, maxY] = extent;
    const center = this.#options.handleCenter ?? extentCenter(extent);
    const bbox = new Feature<Geometry>(
      new Polygon([
        [
          [minX, minY],
          [minX, maxY],
          [maxX, maxY],
          [maxX, minY],
          [minX, minY]
        ]
      ])
    );
    bbox.setStyle(bboxIdleStyle);
    if (target.canTranslate && this.#options.translateBBox)
      bbox.set(handleMetadata, freezeHit({ key: 'bbox', operation: 'translate', coordinate: center }), true);
    this.#bbox = bbox;

    const handles: Feature<Geometry>[] = [];
    if (target.canScale) {
      handles.push(
        this.#handle('scale-sw', 'scale', [minX, minY], 'xy'),
        this.#handle('scale-nw', 'scale', [minX, maxY], 'xy'),
        this.#handle('scale-ne', 'scale', [maxX, maxY], 'xy'),
        this.#handle('scale-se', 'scale', [maxX, minY], 'xy')
      );
    }
    if (target.canStretch) {
      handles.push(
        this.#handle('stretch-west', 'stretch', [minX, center[1]], 'x'),
        this.#handle('stretch-east', 'stretch', [maxX, center[1]], 'x'),
        this.#handle('stretch-south', 'stretch', [center[0], minY], 'y'),
        this.#handle('stretch-north', 'stretch', [center[0], maxY], 'y')
      );
    }
    if (target.canRotate) {
      if (this.#activeOperation === 'rotate') {
        const rotationCenter = new Feature<Geometry>(new Point([...center]));
        rotationCenter.setStyle(centerHandleStyle);
        handles.push(rotationCenter);
      }
      handles.push(this.#handle('rotate', 'rotate', [center[0], maxY], 'xy'));
    }
    if (target.canTranslate && this.#options.translate === 'center') handles.push(this.#handle('translate-center', 'translate', center, 'xy'));
    if (target.canEditVertices) {
      for (let index = 0; index < target.controlPoints.length; index += 1) {
        handles.push(this.#handle(`vertex-${index}`, 'vertex', target.controlPoints[index], 'xy', index));
      }
    }
    return [preview, bbox, ...handles];
  }

  #registerRenderTarget(layerId: string): LayerRenderTargetHandle {
    return this.#render.registerTarget({
      layerId,
      targetId: this.renderTargetId,
      apply: (value) => this.setBlink(value.visible ?? true),
      clear: () => this.setBlink(true)
    });
  }

  #releaseRenderTarget(): void {
    const target = this.#renderTarget;
    if (target === undefined) return;
    target.destroy();
    if (this.#renderTarget === target) {
      this.#renderTarget = undefined;
      this.#renderTargetLayerId = undefined;
    }
  }

  readonly #refreshForView = (): void => {
    if (this.#destroyed || this.#destroying || this.#target === undefined) return;
    const copy = this.#copy;
    const features = this.#featuresFor(this.#target);
    this.#source.clear(true);
    this.#source.addFeatures(features);
    if (copy !== undefined) this.#source.addFeature(copy);
    this.#applyBBoxStyle();
  };

  #applyBBoxStyle(): void {
    const bbox = this.#bbox;
    if (bbox === undefined) return;
    if (!this.#operationActive) {
      bbox.setStyle(bboxIdleStyle);
      return;
    }
    bbox.setStyle(this.#blinkVisible ? bboxActiveStyle : bboxActiveHiddenStyle);
  }

  #handle(
    key: string,
    operation: TransformHandleHit['operation'],
    coordinate: Coordinate,
    axis: TransformHandleHit['axis'],
    index?: number
  ): Feature<Geometry> {
    const feature = new Feature<Geometry>(new Point([...coordinate]));
    feature.setStyle(this.#options.handleStyle === undefined ? styleFor(operation, axis) : this.#styles.compile(this.#options.handleStyle));
    feature.set(handleMetadata, freezeHit({ key, operation, coordinate, axis, ...(index === undefined ? {} : { index }) }), true);
    return feature;
  }

  #assertActive(): void {
    if (this.#destroyed || this.#destroying) throw new ObjectDisposedError('Transform HandleLayer has been destroyed');
  }
}

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

function iconStyle(src: string, displacement?: readonly [number, number]): Style {
  return new Style({ image: new Icon({ src, color: [80, 80, 80, 1], ...(displacement === undefined ? {} : { displacement: [...displacement] }) }) });
}

function styleFor(operation: TransformHandleHit['operation'], axis: TransformHandleHit['axis']): Style {
  if (operation === 'rotate') return rotateHandleStyle;
  if (operation === 'vertex') return vertexHandleStyle;
  if (operation === 'translate') return translateHandleStyle;
  if (operation === 'stretch') return axis === 'x' ? stretchHorizontalHandleStyle : stretchVerticalHandleStyle;
  return scaleHandleStyle;
}

function createGeometry(state: RenderGeometryState): Geometry {
  if (state.type === 'point') return new Point([...state.coordinates]);
  if (state.type === 'polyline') return new LineString(state.coordinates.map((coordinate) => [...coordinate]));
  if (state.type === 'polygon') return new Polygon(state.coordinates.map((ring) => ring.map((coordinate) => [...coordinate])));
  return new CircleGeometry([...state.center], state.radius);
}

function geometryCenter(geometry: RenderGeometryState): Coordinate {
  return extentCenter(renderExtent(geometry));
}

function bufferedExtent(
  map: Map,
  geometry: RenderGeometryState,
  options: TransformInteractionOptions,
  visualPadding?: readonly [number, number]
): TransformExtent {
  const extent = renderExtent(geometry);
  const mapResolution = resolution(map);
  const fallback = geometry.type === 'point' ? Math.max(options.pointRadius, options.buffer) : options.buffer;
  const paddingX = Math.max(fallback, visualPadding?.[0] ?? 0) * mapResolution;
  const paddingY = Math.max(fallback, visualPadding?.[1] ?? 0) * mapResolution;
  return Object.freeze([extent[0] - paddingX, extent[1] - paddingY, extent[2] + paddingX, extent[3] + paddingY]);
}

function pointVisualPadding(feature: Feature<Geometry>, map: Map): readonly [number, number] | undefined {
  const styleFunction = feature.getStyleFunction();
  if (styleFunction === undefined) return undefined;
  let styles: Style[];
  try {
    const value = styleFunction(feature, resolution(map));
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

function resolution(map: Map): number {
  const value = map.getView().getResolution();
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
}

function rotationOf(map: Map): number {
  const value = map.getView().getRotation();
  return Number.isFinite(value) ? value : 0;
}

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

function isHandleHit(value: unknown): value is TransformHandleHit {
  if (value === null || typeof value !== 'object') return false;
  const hit = value as Partial<TransformHandleHit>;
  return typeof hit.key === 'string' && ['translate', 'rotate', 'scale', 'stretch', 'vertex'].includes(hit.operation ?? '') && Array.isArray(hit.coordinate);
}
