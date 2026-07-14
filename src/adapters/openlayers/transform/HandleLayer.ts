import Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import CircleGeometry from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import type { Coordinate, Pixel } from '../../../core/common/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import type { TransformInteractionOptions, TransformInteractionTarget } from '../../../core/ports/TransformInteractionPort.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';
import type { ProjectionSuppressionLease, FeatureBinding } from '../FeatureBinding.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';
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
  readonly #options: TransformInteractionOptions;
  readonly #source: VectorSource<Feature<Geometry>>;
  readonly #layer: VectorLayer<VectorSource<Feature<Geometry>>>;
  #target: TransformInteractionTarget | undefined;
  #suppression: ProjectionSuppressionLease | undefined;
  #bbox: Feature<Geometry> | undefined;
  #copy: Feature<Geometry> | undefined;
  #copyGeometry: RenderGeometryState | undefined;
  #destroyed = false;

  constructor(map: Map, binding: FeatureBinding, styles: StyleCompiler, options: HandleLayerOptions) {
    this.#map = map;
    this.#binding = binding;
    this.#styles = styles;
    this.#options = options.interaction;
    this.renderLayerId = `transform-handles:${options.sessionId}`;
    this.renderTargetId = `transform-bbox:${options.sessionId}`;
    this.#source = new VectorSource({ wrapX: true });
    this.#layer = new VectorLayer({ source: this.#source, zIndex: 2_147_483_647, updateWhileAnimating: true, updateWhileInteracting: true });
    this.#map.addLayer(this.#layer);
  }

  get target(): TransformInteractionTarget | undefined {
    return this.#target;
  }

  get extent(): TransformExtent | undefined {
    return this.#target === undefined ? undefined : bufferedExtent(this.#map, this.#target.geometry, this.#options);
  }

  setTarget(target: TransformInteractionTarget): void {
    this.#assertActive();
    const features = this.#featuresFor(target);
    let suppression: ProjectionSuppressionLease | undefined;
    try {
      suppression = this.#binding.suppressProjection(target.elementId);
      this.#source.clear(true);
      this.#source.addFeatures(features);
      const previous = this.#suppression;
      this.#target = target;
      this.#suppression = suppression;
      suppression = undefined;
      previous?.release();
      this.#copy = undefined;
      this.#copyGeometry = undefined;
    } finally {
      suppression?.release();
    }
  }

  clearTarget(): void {
    if (this.#destroyed) return;
    this.#source.clear(true);
    this.#target = undefined;
    this.#bbox = undefined;
    this.#copy = undefined;
    this.#copyGeometry = undefined;
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
    if (this.#bbox === undefined) return;
    this.#bbox.setStyle(visible ? bboxStyle : hiddenStyle);
    this.#layer.changed();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.clearCopyPreview();
    this.#source.clear(true);
    const suppression = this.#suppression;
    this.#suppression = undefined;
    suppression?.release();
    this.#map.removeLayer(this.#layer);
    this.#layer.setSource(null);
    this.#source.dispose();
    this.#layer.dispose();
    this.#target = undefined;
    this.#bbox = undefined;
  }

  #featuresFor(target: TransformInteractionTarget): Feature<Geometry>[] {
    const preview = new Feature<Geometry>(createGeometry(target.geometry));
    preview.setStyle(this.#styles.compile(target.style));
    if (target.canTranslate && this.#options.translate === 'feature') {
      preview.set(handleMetadata, freezeHit({ key: 'feature', operation: 'translate', coordinate: geometryCenter(target.geometry) }), true);
    }

    const extent = bufferedExtent(this.#map, target.geometry, this.#options);
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
    bbox.setStyle(bboxStyle);
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
      const offset = Math.max(this.#options.buffer, 12) * resolution(this.#map);
      handles.push(this.#handle('rotate', 'rotate', [center[0], maxY + offset], 'xy'));
    }
    if (target.canTranslate && this.#options.translate === 'center') handles.push(this.#handle('translate-center', 'translate', center, 'xy'));
    if (target.canEditVertices) {
      for (let index = 0; index < target.controlPoints.length; index += 1) {
        handles.push(this.#handle(`vertex-${index}`, 'vertex', target.controlPoints[index], 'xy', index));
      }
    }
    return [preview, bbox, ...handles];
  }

  #handle(
    key: string,
    operation: TransformHandleHit['operation'],
    coordinate: Coordinate,
    axis: TransformHandleHit['axis'],
    index?: number
  ): Feature<Geometry> {
    const feature = new Feature<Geometry>(new Point([...coordinate]));
    feature.setStyle(this.#options.handleStyle === undefined ? styleFor(operation) : this.#styles.compile(this.#options.handleStyle));
    feature.set(handleMetadata, freezeHit({ key, operation, coordinate, axis, ...(index === undefined ? {} : { index }) }), true);
    return feature;
  }

  #assertActive(): void {
    if (this.#destroyed) throw new ObjectDisposedError('Transform HandleLayer has been destroyed');
  }
}

const bboxStyle = new Style({ stroke: new Stroke({ color: 'rgba(0,153,255,0.95)', width: 2, lineDash: [7, 5] }) });
const hiddenStyle = new Style({ stroke: new Stroke({ color: 'rgba(0,153,255,0)', width: 2 }) });
const scaleHandleStyle = new Style({
  image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#0099ff', width: 2 }) })
});
const rotateHandleStyle = new Style({
  image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#ffb000' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) })
});
const vertexHandleStyle = new Style({
  image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#27ae60', width: 2 }) })
});
const translateHandleStyle = new Style({
  image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#0099ff' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) })
});

function styleFor(operation: TransformHandleHit['operation']): Style {
  if (operation === 'rotate') return rotateHandleStyle;
  if (operation === 'vertex') return vertexHandleStyle;
  if (operation === 'translate') return translateHandleStyle;
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

function bufferedExtent(map: Map, geometry: RenderGeometryState, options: TransformInteractionOptions): TransformExtent {
  const extent = renderExtent(geometry);
  const mapResolution = resolution(map);
  const padding = geometry.type === 'point' ? Math.max(options.pointRadius, options.buffer) * mapResolution : options.buffer * mapResolution;
  return Object.freeze([extent[0] - padding, extent[1] - padding, extent[2] + padding, extent[3] + padding]);
}

function resolution(map: Map): number {
  const value = map.getView().getResolution();
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
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
