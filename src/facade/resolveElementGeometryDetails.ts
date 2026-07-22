import type { Coordinate } from '../core/common/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import { createRenderGeometryDetails } from '../core/shape/geometryDetails.js';
import type { RenderGeometryState, ShapeState } from '../core/shape/types.js';
import type { ElementGeometryDetails, ElementRenderGeometry, MapExtent } from './elementGeometryTypes.js';

const emptyRangePoints = Object.freeze([]) as readonly (readonly Coordinate[])[];

/** 从同一份规范状态和最终渲染几何生成公共只读详情。 */
export function createElementGeometryDetails(stateGeometry: ShapeState, renderGeometry: RenderGeometryState): Readonly<ElementGeometryDetails> {
  const rendered = createRenderGeometryDetails(renderGeometry);
  const extentPoints = createExtentPoints(rendered.extent);

  if (stateGeometry.type === 'circle') {
    if (rendered.renderGeometry.type !== 'circle') throw new InvalidArgumentError('Circle state must resolve to Circle render geometry');
    const radius = Object.freeze({
      meters: requireRadius(stateGeometry.radius, 'Circle state radius'),
      projected: rendered.renderGeometry.radius
    });
    return Object.freeze({
      renderGeometry: rendered.renderGeometry,
      extent: rendered.extent,
      extentPoints,
      rangePoints: emptyRangePoints,
      controlPoints: null,
      center: rendered.renderGeometry.center,
      radius
    });
  }

  if (rendered.renderGeometry.type === 'circle') throw new InvalidArgumentError('Circle render geometry must resolve from Circle state');

  return Object.freeze({
    renderGeometry: rendered.renderGeometry,
    extent: rendered.extent,
    extentPoints,
    rangePoints: createRangePoints(rendered.renderGeometry),
    controlPoints: cloneControlPoints(stateGeometry.controlPoints),
    center: null,
    radius: null
  });
}

/** 将最终渲染坐标统一为坐标组，同时保留 Polygon ring 边界。 */
function createRangePoints(geometry: Exclude<ElementRenderGeometry, { readonly type: 'circle' }>): readonly (readonly Coordinate[])[] {
  if (geometry.type === 'point') return Object.freeze([Object.freeze([geometry.coordinates])]);
  if (geometry.type === 'polyline') return Object.freeze([geometry.coordinates]);
  return geometry.coordinates;
}

/** 按左下、右下、右上、左上的固定顺序生成范围角点。 */
function createExtentPoints(extent: MapExtent): ElementGeometryDetails['extentPoints'] {
  const [minX, minY, maxX, maxY] = extent;
  return Object.freeze([freezePoint(minX, minY), freezePoint(maxX, minY), freezePoint(maxX, maxY), freezePoint(minX, maxY)]);
}

/** 冻结一个范围二维角点。 */
function freezePoint(x: number, y: number): readonly [number, number] {
  return Object.freeze([x, y]);
}

/** 复制规范控制点，避免详情快照与 Store 状态共享数组。 */
function cloneControlPoints(controlPoints: readonly Coordinate[]): readonly Coordinate[] {
  return Object.freeze(controlPoints.map((coordinate) => freezeCoordinate(coordinate)));
}

/** 复制并冻结一个有限二维或三维坐标。 */
function freezeCoordinate(coordinate: readonly number[]): Coordinate {
  if ((coordinate.length !== 2 && coordinate.length !== 3) || coordinate.some((value) => !Number.isFinite(value))) {
    throw new InvalidArgumentError('Element geometry detail coordinates must contain two or three finite numbers');
  }
  return Object.freeze(coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]]);
}

/** 校验 Circle 的米制业务半径。 */
function requireRadius(radius: number, label: string): number {
  if (!Number.isFinite(radius) || radius < 0) throw new InvalidArgumentError(`${label} must be a non-negative finite number`);
  return radius;
}
