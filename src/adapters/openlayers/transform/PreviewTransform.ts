import type { Coordinate } from '../../../core/common/types.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';

/** Transform 预览几何的二维范围。 */
export type TransformExtent = readonly [number, number, number, number];

/** 计算渲染几何的外接范围。 */
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
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  if (geometry.type === 'polyline') {
    for (const coordinate of geometry.coordinates) {
      minX = Math.min(minX, coordinate[0]);
      minY = Math.min(minY, coordinate[1]);
      maxX = Math.max(maxX, coordinate[0]);
      maxY = Math.max(maxY, coordinate[1]);
    }
  } else {
    for (const ring of geometry.coordinates) {
      for (const coordinate of ring) {
        minX = Math.min(minX, coordinate[0]);
        minY = Math.min(minY, coordinate[1]);
        maxX = Math.max(maxX, coordinate[0]);
        maxY = Math.max(maxY, coordinate[1]);
      }
    }
  }
  return Object.freeze([minX, minY, maxX, maxY]);
}

/** 计算范围中心坐标。 */
export function extentCenter(extent: TransformExtent): Coordinate {
  return Object.freeze([(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2]);
}

/** 平移完整渲染几何。 */
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

/** 平移单个坐标并保留高度值。 */
function translate(coordinate: Coordinate, x: number, y: number): Coordinate {
  return coordinate.length === 3 ? [coordinate[0] + x, coordinate[1] + y, coordinate[2]] : [coordinate[0] + x, coordinate[1] + y];
}
