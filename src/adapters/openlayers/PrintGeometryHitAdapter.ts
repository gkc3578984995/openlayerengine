import CircleGeometry from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import GeometryCollection from 'ol/geom/GeometryCollection.js';
import LineString from 'ol/geom/LineString.js';
import MultiLineString from 'ol/geom/MultiLineString.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import type OlMap from 'ol/Map.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import { fromUserExtent } from 'ol/proj.js';
import type Projection from 'ol/proj/Projection.js';
import { CapabilityError } from '../../core/errors.js';
import type { ShapePresentationFrame } from '../../core/ports/ShapePresentationPort.js';
import type { PrintFootprint } from '../../core/print/types.js';
import type { PrintGeometryHitPort } from '../../core/ports/PrintGeometryHitPort.js';
import type { FeatureBinding } from './FeatureBinding.js';
import type { LayerAdapter } from './LayerAdapter.js';
import { isRenderableCompiledStyle } from './style/visualFootprint.js';

export interface PrintGeometryHitAdapterOptions {
  readonly map?: OlMap;
  readonly layers?: LayerAdapter;
  readonly worldWidth?: number;
}

/** 使用 FeatureBinding 的规范 OL 投影执行自动图例空间命中。 */
export class PrintGeometryHitAdapter implements PrintGeometryHitPort {
  readonly #binding: FeatureBinding;
  readonly #map: OlMap | undefined;
  readonly #layers: LayerAdapter | undefined;
  readonly #worldWidth: number | undefined;

  constructor(binding: FeatureBinding, worldWidthOrOptions?: number | Readonly<PrintGeometryHitAdapterOptions>) {
    this.#binding = binding;
    const options = typeof worldWidthOrOptions === 'number' ? undefined : worldWidthOrOptions;
    this.#map = options?.map;
    this.#layers = options?.layers;
    const worldWidth = typeof worldWidthOrOptions === 'number' ? worldWidthOrOptions : options?.worldWidth;
    this.#worldWidth = worldWidth !== undefined && Number.isFinite(worldWidth) && worldWidth > 0 ? worldWidth : undefined;
  }

  candidateElementIds(footprint: PrintFootprint, _resolution: number, visibleLayerIds: readonly string[]): readonly string[] | undefined {
    const layers = this.#layers;
    const query = (this.#binding as FeatureBinding & { queryPrintCandidateIds?: FeatureBinding['queryPrintCandidateIds'] }).queryPrintCandidateIds;
    if (layers === undefined || typeof query !== 'function') return undefined;
    const footprintExtent = extentOf(footprint);
    const worldWidth = this.#currentWorldWidth();
    const candidates = new Set<string>();
    for (const layerId of visibleLayerIds) {
      const source = layers.requireVectorSource(layerId);
      const sourceExtent = source.getExtent();
      const extents =
        source.getWrapX() && worldWidth !== undefined && sourceExtent !== null
          ? wrappedCandidateQueryExtents(footprintExtent, sourceExtent, worldWidth)
          : [footprintExtent];
      for (const elementId of query.call(this.#binding, layerId, extents)) candidates.add(elementId);
    }
    return Object.freeze([...candidates]);
  }

  intersectsFootprint(elementId: string, footprint: PrintFootprint, resolution?: number, presentationFrame?: Readonly<ShapePresentationFrame>): boolean {
    if (resolution !== undefined) return this.#resolvedStyleHits(elementId, resolution, footprint, presentationFrame);
    const geometry = this.#binding.requireFeature(elementId).getGeometry();
    if (geometry === undefined) return false;
    const path = this.#layerPath(elementId);
    if (path === null) return false;
    const clip = path === undefined ? undefined : intersectLayerPathExtents(path, this.#map?.getView().getProjection());
    if (clip === null) return false;
    const worldWidth = this.#binding.wrapsX(elementId) ? this.#currentWorldWidth() : undefined;
    return geometryIntersectsWrappedPrintConstraints(geometry, footprint, worldWidth, clip);
  }

  isVisibleAt(elementId: string, resolution: number, footprint?: PrintFootprint, presentationFrame?: Readonly<ShapePresentationFrame>): boolean {
    return this.#resolvedStyleHits(elementId, resolution, footprint, presentationFrame);
  }

  #resolvedStyleHits(
    elementId: string,
    resolution: number,
    footprint: PrintFootprint | undefined,
    presentationFrame: Readonly<ShapePresentationFrame> | undefined
  ): boolean {
    const path = this.#layerPath(elementId);
    if (path === null) return false;
    if (path !== undefined) {
      const zoom = this.#map?.getView().getZoomForResolution(resolution);
      if (!path.every((layer) => layerVisibleAt(layer, resolution, zoom))) return false;
    }
    const clip = path === undefined ? undefined : intersectLayerPathExtents(path, this.#map?.getView().getProjection());
    if (clip === null) return false;
    const worldWidth = this.#binding.wrapsX(elementId) ? this.#currentWorldWidth() : undefined;
    const feature = this.#binding.cloneCanonicalFeature(elementId, presentationFrame ?? resolution);
    try {
      const resolved = feature.getStyleFunction()?.(feature, resolution);
      const styles = resolved === undefined ? [] : Array.isArray(resolved) ? resolved : [resolved];
      return styles.some((style) => {
        if (!isRenderableCompiledStyle(style)) return false;
        if (footprint === undefined) return true;
        let geometry;
        try {
          geometry = style.getGeometryFunction()(feature);
        } catch {
          return false;
        }
        return geometry instanceof Geometry && geometryIntersectsWrappedPrintConstraints(geometry, footprint, worldWidth, clip);
      });
    } finally {
      feature.setGeometry(undefined);
      feature.setStyle(undefined);
      feature.dispose();
    }
  }

  renderOrderOf(elementId: string): number {
    return this.#binding.renderOrderOf(elementId);
  }

  #layerPath(elementId: string): readonly BaseLayer[] | null | undefined {
    const map = this.#map;
    const layers = this.#layers;
    if (map === undefined || layers === undefined) return undefined;
    const feature = this.#binding.requireFeature(elementId);
    const identity = this.#binding.resolveFeature(feature);
    if (identity === undefined) return null;
    const target = layers.requireLayer(identity.layerId);
    return findLayerPath(map.getLayers().getArray(), target) ?? null;
  }

  #currentWorldWidth(): number | undefined {
    const map = this.#map;
    if (map === undefined) return this.#worldWidth;
    const projection = map.getView().getProjection();
    if (!projection.canWrapX()) return undefined;
    const extent = projection.getExtent();
    if (extent === null) return undefined;
    const width = extent[2] - extent[0];
    return Number.isFinite(width) && width > 0 ? width : undefined;
  }
}

export function geometryIntersectsPrintFootprint(geometry: Geometry, footprint: PrintFootprint): boolean {
  const extent = extentOf(footprint);
  return geometry.intersectsExtent(extent) && geometryIntersectsFootprint(geometry, footprint);
}

function shiftFootprintX(footprint: PrintFootprint, offset: number): PrintFootprint {
  return [
    [footprint[0][0] + offset, footprint[0][1]],
    [footprint[1][0] + offset, footprint[1][1]],
    [footprint[2][0] + offset, footprint[2][1]],
    [footprint[3][0] + offset, footprint[3][1]]
  ];
}

function shiftExtentX(extent: readonly [number, number, number, number], offset: number): readonly [number, number, number, number] {
  return [extent[0] + offset, extent[1], extent[2] + offset, extent[3]];
}

function geometryIntersectsPrintConstraints(
  geometry: Geometry,
  footprint: PrintFootprint,
  clip: readonly [number, number, number, number] | undefined
): boolean {
  return geometryIntersectsPrintFootprint(geometry, footprint) && (clip === undefined || geometry.intersectsExtent([...clip]));
}

const MAX_WRAPPED_WORLDS_TO_INSPECT = 4096;

function wrappedCandidateQueryExtents(
  footprintExtent: readonly [number, number, number, number],
  sourceExtent: readonly number[],
  worldWidth: number
): readonly (readonly [number, number, number, number])[] {
  if (
    sourceExtent.length < 4 ||
    sourceExtent.slice(0, 4).some((value) => !Number.isFinite(value)) ||
    sourceExtent[0]! > sourceExtent[2]! ||
    sourceExtent[1]! > sourceExtent[3]!
  ) {
    return Object.freeze([]);
  }
  const minimumWorld = Math.ceil((footprintExtent[0] - sourceExtent[2]!) / worldWidth);
  const maximumWorld = Math.floor((footprintExtent[2] - sourceExtent[0]!) / worldWidth);
  if (minimumWorld > maximumWorld) return Object.freeze([]);
  if (maximumWorld - minimumWorld + 1 > MAX_WRAPPED_WORLDS_TO_INSPECT) {
    throw new CapabilityError(`World-wrap print inspection exceeds ${MAX_WRAPPED_WORLDS_TO_INSPECT} repeated worlds`);
  }
  const extents: Array<readonly [number, number, number, number]> = [];
  for (let world = minimumWorld; world <= maximumWorld; world += 1) {
    const offset = -world * worldWidth;
    extents.push([footprintExtent[0] + offset, footprintExtent[1], footprintExtent[2] + offset, footprintExtent[3]]);
  }
  return Object.freeze(extents);
}

export function geometryIntersectsWrappedPrintConstraints(
  geometry: Geometry,
  footprint: PrintFootprint,
  worldWidth: number | undefined,
  clip: readonly [number, number, number, number] | null | undefined
): boolean {
  if (clip === null) return false;
  if (worldWidth === undefined || !Number.isFinite(worldWidth) || worldWidth <= 0) {
    return geometryIntersectsPrintConstraints(geometry, footprint, clip);
  }
  const geometryExtent = geometry.getExtent();
  const footprintExtent = extentOf(footprint);
  let minimumWorld = Math.ceil((footprintExtent[0] - geometryExtent[2]) / worldWidth);
  let maximumWorld = Math.floor((footprintExtent[2] - geometryExtent[0]) / worldWidth);
  if (clip !== undefined) {
    minimumWorld = Math.max(minimumWorld, Math.ceil((clip[0] - geometryExtent[2]) / worldWidth));
    maximumWorld = Math.min(maximumWorld, Math.floor((clip[2] - geometryExtent[0]) / worldWidth));
  }
  if (!Number.isFinite(minimumWorld) || !Number.isFinite(maximumWorld) || minimumWorld > maximumWorld) return false;
  if (maximumWorld - minimumWorld + 1 > MAX_WRAPPED_WORLDS_TO_INSPECT) {
    throw new CapabilityError(`World-wrap print inspection exceeds ${MAX_WRAPPED_WORLDS_TO_INSPECT} repeated worlds`);
  }
  for (let world = minimumWorld; world <= maximumWorld; world += 1) {
    const offset = -world * worldWidth;
    const shiftedFootprint = shiftFootprintX(footprint, offset);
    const shiftedClip = clip === undefined ? undefined : shiftExtentX(clip, offset);
    if (geometryIntersectsPrintConstraints(geometry, shiftedFootprint, shiftedClip)) return true;
  }
  return false;
}

function layerVisibleAt(layer: BaseLayer, resolution: number, zoom: number | undefined): boolean {
  return (
    layer.getVisible() &&
    layer.getOpacity() > 0 &&
    resolution >= layer.getMinResolution() &&
    resolution < layer.getMaxResolution() &&
    (zoom === undefined || (zoom > layer.getMinZoom() && zoom <= layer.getMaxZoom()))
  );
}

function findLayerPath(roots: readonly BaseLayer[], target: BaseLayer): readonly BaseLayer[] | undefined {
  const visiting = new Set<BaseLayer>();
  const visit = (layer: BaseLayer): readonly BaseLayer[] | undefined => {
    if (layer === target) return [layer];
    if (!(layer instanceof LayerGroup) || visiting.has(layer)) return undefined;
    visiting.add(layer);
    try {
      for (const child of layer.getLayers().getArray()) {
        const nested = visit(child);
        if (nested !== undefined) return [layer, ...nested];
      }
      return undefined;
    } finally {
      visiting.delete(layer);
    }
  };
  for (const root of roots) {
    const path = visit(root);
    if (path !== undefined) return path;
  }
  return undefined;
}

function intersectLayerPathExtents(
  path: readonly BaseLayer[],
  projection: Projection | undefined
): readonly [number, number, number, number] | null | undefined {
  let result: readonly [number, number, number, number] | undefined;
  for (const layer of path) {
    const extent = layer.getExtent();
    if (extent === undefined || extent.length < 4 || extent.some((value) => !Number.isFinite(value))) continue;
    const normalized = projection === undefined ? extent : fromUserExtent([...extent], projection);
    const current = [normalized[0]!, normalized[1]!, normalized[2]!, normalized[3]!] as const;
    if (result === undefined) result = current;
    else {
      const intersection = [
        Math.max(result[0], current[0]),
        Math.max(result[1], current[1]),
        Math.min(result[2], current[2]),
        Math.min(result[3], current[3])
      ] as const;
      if (intersection[0] > intersection[2] || intersection[1] > intersection[3]) return null;
      result = intersection;
    }
  }
  return result;
}

function geometryIntersectsFootprint(geometry: Geometry, footprint: PrintFootprint): boolean {
  if (geometry instanceof Point) return pointInConvex(geometry.getCoordinates(), footprint);
  if (geometry instanceof MultiPoint) return geometry.getCoordinates().some((coordinate) => pointInConvex(coordinate, footprint));
  if (geometry instanceof LineString) return lineIntersectsFootprint(geometry.getCoordinates(), footprint);
  if (geometry instanceof MultiLineString) return geometry.getCoordinates().some((line) => lineIntersectsFootprint(line, footprint));
  if (geometry instanceof Polygon) return polygonIntersectsFootprint(geometry, footprint);
  if (geometry instanceof MultiPolygon) {
    return geometry.getPolygons().some((polygon) => polygonIntersectsFootprint(polygon, footprint));
  }
  if (geometry instanceof CircleGeometry) return circleIntersectsFootprint(geometry, footprint);
  if (geometry instanceof GeometryCollection) return geometry.getGeometries().some((part) => geometryIntersectsFootprint(part, footprint));
  return footprint.some((coordinate) => geometry.intersectsCoordinate([...coordinate]));
}

function polygonIntersectsFootprint(polygon: Polygon, footprint: PrintFootprint): boolean {
  if (footprint.some((coordinate) => polygon.intersectsCoordinate([...coordinate]))) return true;
  return polygon.getCoordinates().some((ring) => lineIntersectsFootprint(ring, footprint));
}

function circleIntersectsFootprint(circle: CircleGeometry, footprint: PrintFootprint): boolean {
  const center = circle.getCenter();
  const radius = circle.getRadius();
  if (pointInConvex(center, footprint)) return true;
  if (footprint.some((coordinate) => Math.hypot(coordinate[0] - center[0], coordinate[1] - center[1]) <= radius)) return true;
  return footprint.some((coordinate, index) => distanceToSegment(center, coordinate, footprint[(index + 1) % footprint.length]!) <= radius);
}

function lineIntersectsFootprint(line: readonly number[][], footprint: PrintFootprint): boolean {
  if (line.some((coordinate) => pointInConvex(coordinate, footprint))) return true;
  for (let index = 1; index < line.length; index += 1) {
    const first = line[index - 1]!;
    const second = line[index]!;
    for (let edge = 0; edge < footprint.length; edge += 1) {
      if (segmentsIntersect(first, second, footprint[edge]!, footprint[(edge + 1) % footprint.length]!)) return true;
    }
  }
  return false;
}

function pointInConvex(point: readonly number[], footprint: PrintFootprint): boolean {
  let positive = false;
  let negative = false;
  for (let index = 0; index < footprint.length; index += 1) {
    const first = footprint[index]!;
    const second = footprint[(index + 1) % footprint.length]!;
    const cross = crossProduct(first, second, point);
    positive ||= cross > 1e-9;
    negative ||= cross < -1e-9;
    if (positive && negative) return false;
  }
  return true;
}

function segmentsIntersect(first: readonly number[], second: readonly number[], third: readonly number[], fourth: readonly number[]): boolean {
  const firstSide = crossProduct(first, second, third);
  const secondSide = crossProduct(first, second, fourth);
  const thirdSide = crossProduct(third, fourth, first);
  const fourthSide = crossProduct(third, fourth, second);
  if (opposite(firstSide, secondSide) && opposite(thirdSide, fourthSide)) return true;
  return (
    (Math.abs(firstSide) <= 1e-9 && pointOnSegment(third, first, second)) ||
    (Math.abs(secondSide) <= 1e-9 && pointOnSegment(fourth, first, second)) ||
    (Math.abs(thirdSide) <= 1e-9 && pointOnSegment(first, third, fourth)) ||
    (Math.abs(fourthSide) <= 1e-9 && pointOnSegment(second, third, fourth))
  );
}

function opposite(left: number, right: number): boolean {
  return (left > 1e-9 && right < -1e-9) || (left < -1e-9 && right > 1e-9);
}

function pointOnSegment(point: readonly number[], first: readonly number[], second: readonly number[]): boolean {
  return (
    point[0] >= Math.min(first[0]!, second[0]!) - 1e-9 &&
    point[0] <= Math.max(first[0]!, second[0]!) + 1e-9 &&
    point[1] >= Math.min(first[1]!, second[1]!) - 1e-9 &&
    point[1] <= Math.max(first[1]!, second[1]!) + 1e-9
  );
}

function crossProduct(first: readonly number[], second: readonly number[], point: readonly number[]): number {
  return (second[0]! - first[0]!) * (point[1]! - first[1]!) - (second[1]! - first[1]!) * (point[0]! - first[0]!);
}

function distanceToSegment(point: readonly number[], first: readonly number[], second: readonly number[]): number {
  const dx = second[0] - first[0];
  const dy = second[1] - first[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0]! - first[0], point[1]! - first[1]);
  const ratio = Math.max(0, Math.min(1, ((point[0]! - first[0]) * dx + (point[1]! - first[1]) * dy) / lengthSquared));
  return Math.hypot(point[0]! - (first[0] + ratio * dx), point[1]! - (first[1] + ratio * dy));
}

function extentOf(footprint: PrintFootprint): [number, number, number, number] {
  const xs = footprint.map((coordinate) => coordinate[0]);
  const ys = footprint.map((coordinate) => coordinate[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
