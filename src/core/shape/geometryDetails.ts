import type { Coordinate } from '../common/types.js';
import { InvalidArgumentError } from '../errors.js';
import type { RenderGeometryState } from './types.js';

/** RenderGeometry 在当前 View 投影中的 XY 范围。 */
export type RenderGeometryExtent = readonly [minX: number, minY: number, maxX: number, maxY: number];

/** 与输入不共享可变数组的 RenderGeometry 详情快照。 */
export interface RenderGeometryDetails {
  readonly renderGeometry: RenderGeometryState;
  readonly extent: RenderGeometryExtent;
}

/**
 * 复制并冻结 RenderGeometry，同时计算覆盖全部坐标环的有限 XY 范围。
 *
 * 该函数只处理当前 View 投影中的纯数据几何，不包含样式外扩、动画帧或 world-wrap 展示副本。
 */
export function createRenderGeometryDetails(geometry: RenderGeometryState): Readonly<RenderGeometryDetails> {
  requireRenderGeometryObject(geometry);

  if (geometry.type === 'point') {
    const coordinates = cloneCoordinate(geometry.coordinates, 'Point render coordinates');
    const renderGeometry = Object.freeze({ type: 'point', coordinates }) satisfies RenderGeometryState;
    return details(renderGeometry, calculateRenderGeometryExtent(renderGeometry));
  }

  if (geometry.type === 'polyline') {
    const coordinates = cloneCoordinateSequence(geometry.coordinates, 'Polyline render coordinates');
    const renderGeometry = Object.freeze({ type: 'polyline', coordinates }) satisfies RenderGeometryState;
    return details(renderGeometry, calculateRenderGeometryExtent(renderGeometry));
  }

  if (geometry.type === 'polygon') {
    const sourceRings = requireNonEmptyArray(geometry.coordinates, 'Polygon render coordinates');
    const rings = new Array<readonly Coordinate[]>(sourceRings.length);
    for (let index = 0; index < sourceRings.length; index += 1) {
      rings[index] = cloneCoordinateSequence(sourceRings[index], `Polygon render coordinates[${index}]`);
    }
    const coordinates = Object.freeze(rings);
    const renderGeometry = Object.freeze({ type: 'polygon', coordinates }) satisfies RenderGeometryState;
    return details(renderGeometry, calculateRenderGeometryExtent(renderGeometry));
  }

  if (geometry.type === 'circle') {
    const center = cloneCoordinate(geometry.center, 'Circle render center');
    const radius = geometry.radius;
    if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0) {
      throw new InvalidArgumentError('Circle render radius must be a non-negative finite number');
    }
    const renderGeometry = Object.freeze({ type: 'circle', center, radius }) satisfies RenderGeometryState;
    return details(renderGeometry, calculateRenderGeometryExtent(renderGeometry));
  }

  throw new InvalidArgumentError(`Unsupported render geometry type: ${String((geometry as { readonly type?: unknown }).type)}`);
}

/** 计算完整 RenderGeometry 在当前 View 投影中的有限 XY 范围。 */
export function calculateRenderGeometryExtent(geometry: RenderGeometryState): RenderGeometryExtent {
  requireRenderGeometryObject(geometry);

  if (geometry.type === 'point') {
    const coordinate = requireCoordinate(geometry.coordinates, 'Point render coordinates');
    return freezeExtent(coordinate[0], coordinate[1], coordinate[0], coordinate[1]);
  }

  if (geometry.type === 'polyline') {
    return extentFromSequences([requireNonEmptyArray(geometry.coordinates, 'Polyline render coordinates')], 'Polyline render coordinates');
  }

  if (geometry.type === 'polygon') {
    const rings = requireNonEmptyArray(geometry.coordinates, 'Polygon render coordinates');
    for (let index = 0; index < rings.length; index += 1) {
      requireNonEmptyArray(rings[index], `Polygon render coordinates[${index}]`);
    }
    return extentFromSequences(rings, 'Polygon render coordinates');
  }

  if (geometry.type === 'circle') {
    const center = requireCoordinate(geometry.center, 'Circle render center');
    const radius = geometry.radius;
    if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0) {
      throw new InvalidArgumentError('Circle render radius must be a non-negative finite number');
    }
    return freezeExtent(center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius);
  }

  throw new InvalidArgumentError(`Unsupported render geometry type: ${String((geometry as { readonly type?: unknown }).type)}`);
}

function details(renderGeometry: RenderGeometryState, extent: RenderGeometryExtent): Readonly<RenderGeometryDetails> {
  return Object.freeze({ renderGeometry, extent });
}

function cloneCoordinateSequence(input: unknown, label: string): readonly Coordinate[] {
  const source = requireNonEmptyArray(input, label);
  const coordinates = new Array<Coordinate>(source.length);
  for (let index = 0; index < source.length; index += 1) coordinates[index] = cloneCoordinate(source[index], `${label}[${index}]`);
  return Object.freeze(coordinates);
}

function cloneCoordinate(input: unknown, label: string): Coordinate {
  const source = requireCoordinate(input, label);
  return source.length === 3 ? Object.freeze([source[0], source[1], source[2]]) : Object.freeze([source[0], source[1]]);
}

function requireCoordinate(input: unknown, label: string): Coordinate {
  const source = requireDenseArray(input, label);
  if (source.length !== 2 && source.length !== 3) throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  if (source.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  }
  return source as unknown as Coordinate;
}

function requireNonEmptyArray(input: unknown, label: string): readonly unknown[] {
  const values = requireDenseArray(input, label);
  if (values.length === 0) throw new InvalidArgumentError(`${label} cannot be empty`);
  return values;
}

function requireDenseArray(input: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(input)) throw new InvalidArgumentError(`${label} must be an array`);
  for (let index = 0; index < input.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(input, index)) throw new InvalidArgumentError(`${label} must be a dense array`);
  }
  return input;
}

function extentFromSequences(sequences: readonly unknown[], label: string): RenderGeometryExtent {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let sequenceIndex = 0; sequenceIndex < sequences.length; sequenceIndex += 1) {
    const coordinates = requireNonEmptyArray(sequences[sequenceIndex], `${label}[${sequenceIndex}]`);
    for (let coordinateIndex = 0; coordinateIndex < coordinates.length; coordinateIndex += 1) {
      const coordinate = requireCoordinate(coordinates[coordinateIndex], `${label}[${sequenceIndex}][${coordinateIndex}]`);
      minX = Math.min(minX, coordinate[0]);
      minY = Math.min(minY, coordinate[1]);
      maxX = Math.max(maxX, coordinate[0]);
      maxY = Math.max(maxY, coordinate[1]);
    }
  }
  return freezeExtent(minX, minY, maxX, maxY);
}

function freezeExtent(minX: number, minY: number, maxX: number, maxY: number): RenderGeometryExtent {
  const extent = Object.freeze([minX, minY, maxX, maxY]) as RenderGeometryExtent;
  if (!extent.every(Number.isFinite)) throw new InvalidArgumentError('Render geometry extent must contain four finite numbers');
  return extent;
}

function requireRenderGeometryObject(geometry: RenderGeometryState): void {
  if (geometry === null || typeof geometry !== 'object' || Array.isArray(geometry)) {
    throw new InvalidArgumentError('Render geometry must be an object');
  }
}
