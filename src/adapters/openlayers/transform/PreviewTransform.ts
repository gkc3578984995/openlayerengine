import type { Coordinate } from '../../../core/common/types.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';

export type TransformExtent = readonly [number, number, number, number];

export function renderExtent(geometry: RenderGeometryState): TransformExtent {
  if (geometry.type === 'point') {
    return Object.freeze([geometry.coordinates[0], geometry.coordinates[1], geometry.coordinates[0], geometry.coordinates[1]]);
  }
  if (geometry.type === 'circle') {
    return Object.freeze([
      geometry.center[0] - geometry.radius,
      geometry.center[1] - geometry.radius,
      geometry.center[0] + geometry.radius,
      geometry.center[1] + geometry.radius
    ]);
  }
  const coordinates = geometry.type === 'polyline' ? geometry.coordinates : geometry.coordinates.flat();
  return Object.freeze([
    Math.min(...coordinates.map((coordinate) => coordinate[0])),
    Math.min(...coordinates.map((coordinate) => coordinate[1])),
    Math.max(...coordinates.map((coordinate) => coordinate[0])),
    Math.max(...coordinates.map((coordinate) => coordinate[1]))
  ]);
}

export function extentCenter(extent: TransformExtent): Coordinate {
  return Object.freeze([(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2]);
}

export function translateRenderGeometry(geometry: RenderGeometryState, x: number, y: number): RenderGeometryState {
  if (geometry.type === 'point') return Object.freeze({ type: 'point', coordinates: translate(geometry.coordinates, x, y) });
  if (geometry.type === 'circle') return Object.freeze({ type: 'circle', center: translate(geometry.center, x, y), radius: geometry.radius });
  if (geometry.type === 'polyline') {
    return Object.freeze({ type: 'polyline', coordinates: Object.freeze(geometry.coordinates.map((coordinate) => translate(coordinate, x, y))) });
  }
  return Object.freeze({
    type: 'polygon',
    coordinates: Object.freeze(geometry.coordinates.map((ring) => Object.freeze(ring.map((coordinate) => translate(coordinate, x, y)))))
  });
}

function translate(coordinate: Coordinate, x: number, y: number): Coordinate {
  return coordinate.length === 3 ? [coordinate[0] + x, coordinate[1] + y, coordinate[2]] : [coordinate[0] + x, coordinate[1] + y];
}
