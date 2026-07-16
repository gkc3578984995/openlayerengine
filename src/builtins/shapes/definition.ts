import { InvalidArgumentError } from '../../core/errors.js';
import type { Coordinate } from '../../core/common/types.js';
import type {
  ControlPointInsertion,
  RenderGeometryState,
  ShapeCapability,
  ShapeCompletion,
  ShapeDefinition,
  ShapeEditTopology,
  ShapeFreehandPolicy,
  ShapeState,
  ShapeType
} from '../../core/shape/types.js';
import { registerShapeFreehandAccumulator } from '../../core/shape/freehandAccumulator.js';
import { createImmutableSet } from '../../core/shape/immutableSet.js';
import { registerTrustedShapeMover, registerTrustedShapeRenderer } from '../../core/shape/trustedRender.js';

/** 内部方法。处理 immutableSet 相关数据。 */
export function immutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  return createImmutableSet(values);
}

/** 内部常量。保存 editableCapabilities 使用的数据。 */
export const editableCapabilities = immutableSet<ShapeCapability>(['draw', 'edit', 'translate', 'rotate', 'scale', 'vertexEdit']);
/** 内部常量。保存 pathCapabilities 使用的数据。 */
export const pathCapabilities = immutableSet<ShapeCapability>([...editableCapabilities, 'path']);
/** 内部常量。保存 structuralEditableCapabilities 使用的数据。 */
export const structuralEditableCapabilities = immutableSet<ShapeCapability>([...editableCapabilities, 'controlPointInsert', 'controlPointRemove']);
/** 内部常量。保存 structuralPathCapabilities 使用的数据。 */
export const structuralPathCapabilities = immutableSet<ShapeCapability>([...structuralEditableCapabilities, 'path']);
/** 内部常量。保存 freehandPolylineCapabilities 使用的数据。 */
export const freehandPolylineCapabilities = immutableSet<ShapeCapability>([...structuralPathCapabilities, 'freehand']);
/** 内部常量。保存 freehandPolygonCapabilities 使用的数据。 */
export const freehandPolygonCapabilities = immutableSet<ShapeCapability>([...structuralEditableCapabilities, 'freehand']);
/** 内部常量。保存 pointCapabilities 使用的数据。 */
export const pointCapabilities = immutableSet<ShapeCapability>([...editableCapabilities, 'anchor']);
/** 内部常量。保存 nonRotatingEditableCapabilities 使用的数据。 */
export const nonRotatingEditableCapabilities = immutableSet<ShapeCapability>(['draw', 'edit', 'translate', 'scale', 'vertexEdit']);

/** 内部方法。处理 cloneCoordinate 相关数据。 */
export function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

/** 内部方法。处理 normalizeCoordinate 相关数据。 */
export function normalizeCoordinate(input: unknown, label = 'coordinate'): Coordinate {
  const values = readDensePlainArray(input, label);
  if ((values.length !== 2 && values.length !== 3) || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  }
  return values.length === 3 ? [values[0] as number, values[1] as number, values[2] as number] : [values[0] as number, values[1] as number];
}

/** 内部方法。处理 normalizeCoordinateArray 相关数据。 */
export function normalizeCoordinateArray(input: unknown, label = 'coordinates'): Coordinate[] {
  const values = readDensePlainArray(input, label);
  return values.map((value, index) => normalizeCoordinate(value, `${label}[${index}]`));
}

/** 内部方法。处理 coordinatesEqual 相关数据。 */
export function coordinatesEqual(left: Coordinate, right: Coordinate): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** 内部方法。处理 closeRing 相关数据。 */
export function closeRing(coordinates: readonly Coordinate[]): readonly Coordinate[] {
  if (coordinates.length === 0) throw new InvalidArgumentError('A polygon ring cannot be empty');
  const ring = coordinates.map(cloneCoordinate);
  if (!coordinatesEqual(ring[0], ring[ring.length - 1])) ring.push(cloneCoordinate(ring[0]));
  return ring;
}

/** 内部接口。约定 PlanarVectors 的数据结构。 */
interface PlanarVectors {
  /** 内部字段。保存 firstX 相关状态。 */
  readonly firstX: number;
  /** 内部字段。保存 firstY 相关状态。 */
  readonly firstY: number;
  /** 内部字段。保存 secondX 相关状态。 */
  readonly secondX: number;
  /** 内部字段。保存 secondY 相关状态。 */
  readonly secondY: number;
  /** 内部字段。保存 firstXError 相关状态。 */
  readonly firstXError: number;
  /** 内部字段。保存 firstYError 相关状态。 */
  readonly firstYError: number;
  /** 内部字段。保存 secondXError 相关状态。 */
  readonly secondXError: number;
  /** 内部字段。保存 secondYError 相关状态。 */
  readonly secondYError: number;
}

/** 内部方法。处理 numberRoundingRadius 相关数据。 */
export function numberRoundingRadius(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude === 0 || magnitude < 2 ** -1022) return Number.MIN_VALUE;
  const exponent = Math.min(1023, Math.floor(Math.log2(magnitude)));
  return Math.max(Number.MIN_VALUE, 2 ** (exponent - 53));
}

/** 内部方法。处理 differenceRoundingError 相关数据。 */
function differenceRoundingError(left: number, right: number): number {
  return numberRoundingRadius(left) + numberRoundingRadius(right);
}

/** 内部方法。处理 arePlanarCoordinatesCoincident 相关数据。 */
export function arePlanarCoordinatesCoincident(left: Coordinate, right: Coordinate): boolean {
  const propagatedMidpointUlps = 4;
  return (
    Math.abs(left[0] - right[0]) <= differenceRoundingError(left[0], right[0]) * propagatedMidpointUlps &&
    Math.abs(left[1] - right[1]) <= differenceRoundingError(left[1], right[1]) * propagatedMidpointUlps
  );
}

/** 内部方法。处理 planarVectors 相关数据。 */
function planarVectors(origin: Coordinate, first: Coordinate, second: Coordinate): PlanarVectors {
  const firstX = first[0] - origin[0];
  const firstY = first[1] - origin[1];
  const secondX = second[0] - origin[0];
  const secondY = second[1] - origin[1];
  if (![firstX, firstY, secondX, secondY].every(Number.isFinite)) {
    throw new InvalidArgumentError('Control-point differences exceed the finite numeric range');
  }
  const scale = Math.max(Math.abs(firstX), Math.abs(firstY), Math.abs(secondX), Math.abs(secondY));
  if (scale === 0) {
    return { firstX: 0, firstY: 0, secondX: 0, secondY: 0, firstXError: 0, firstYError: 0, secondXError: 0, secondYError: 0 };
  }
  return {
    firstX: firstX / scale,
    firstY: firstY / scale,
    secondX: secondX / scale,
    secondY: secondY / scale,
    firstXError: differenceRoundingError(first[0], origin[0]) / scale,
    firstYError: differenceRoundingError(first[1], origin[1]) / scale,
    secondXError: differenceRoundingError(second[0], origin[0]) / scale,
    secondYError: differenceRoundingError(second[1], origin[1]) / scale
  };
}

/** 内部方法。处理 planarCrossTolerance 相关数据。 */
function planarCrossTolerance(vectors: PlanarVectors): number {
  const { firstX, firstY, secondX, secondY, firstXError, firstYError, secondXError, secondYError } = vectors;
  const firstLength = Math.hypot(firstX, firstY);
  const secondLength = Math.hypot(secondX, secondY);
  const angularError = Number.EPSILON * 8 * firstLength * secondLength;
  const firstProductError = Math.abs(firstX) * secondYError + Math.abs(secondY) * firstXError + firstXError * secondYError;
  const secondProductError = Math.abs(firstY) * secondXError + Math.abs(secondX) * firstYError + firstYError * secondXError;
  return angularError + firstProductError + secondProductError;
}

/** 内部方法。处理 arePlanarCollinear 相关数据。 */
export function arePlanarCollinear(origin: Coordinate, first: Coordinate, second: Coordinate): boolean {
  const vectors = planarVectors(origin, first, second);
  const cross = vectors.firstX * vectors.secondY - vectors.firstY * vectors.secondX;
  const tolerance = planarCrossTolerance(vectors);
  return Math.abs(cross) <= tolerance;
}

/** 内部方法。处理 requireNonCollinear 相关数据。 */
export function requireNonCollinear(origin: Coordinate, first: Coordinate, second: Coordinate): void {
  if (arePlanarCollinear(origin, first, second)) throw new InvalidArgumentError('Control points must not be collinear');
}

/** 内部方法。处理 requireNonZeroPlanarArea 相关数据。 */
export function requireNonZeroPlanarArea(points: readonly Coordinate[], message = 'Control points must enclose a non-zero area'): void {
  if (points.length < 3) return;
  const origin = points[0];
  const vectors = new Array<readonly [number, number]>(points.length);
  let scale = 0;
  for (let index = 0; index < points.length; index += 1) {
    const x = points[index][0] - origin[0];
    const y = points[index][1] - origin[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new InvalidArgumentError('Control-point differences exceed the finite numeric range');
    scale = Math.max(scale, Math.abs(x), Math.abs(y));
    vectors[index] = [x, y];
  }
  if (scale === 0) throw new InvalidArgumentError(message);
  let doubledArea = 0;
  let magnitude = 0;
  for (let index = 1; index < vectors.length - 1; index += 1) {
    const current = vectors[index];
    const next = vectors[index + 1];
    const positive = (current[0] / scale) * (next[1] / scale);
    const negative = (current[1] / scale) * (next[0] / scale);
    doubledArea += positive - negative;
    magnitude += Math.abs(positive) + Math.abs(negative);
  }
  if (!Number.isFinite(doubledArea) || Math.abs(doubledArea) <= Number.EPSILON * 8 * vectors.length * magnitude) throw new InvalidArgumentError(message);
}

/** 内部方法。处理 haveSamePlanarDirection 相关数据。 */
export function haveSamePlanarDirection(origin: Coordinate, first: Coordinate, second: Coordinate): boolean {
  const vectors = planarVectors(origin, first, second);
  const cross = vectors.firstX * vectors.secondY - vectors.firstY * vectors.secondX;
  const tolerance = planarCrossTolerance(vectors);
  return Math.abs(cross) <= tolerance && vectors.firstX * vectors.secondX + vectors.firstY * vectors.secondY > 0;
}

/** 内部类型。描述 ControlPointTopologyMode 使用的数据。 */
type ControlPointTopologyMode = 'fixed' | 'open' | 'closed' | 'arrow';

/** 内部接口。约定 ControlPointDefinitionOptions 的数据结构。 */
interface ControlPointDefinitionOptions<T extends Exclude<ShapeType, 'circle'>> {
  /** 类型。保存当前数据类型。 */
  readonly type: T;
  /** 内部字段。保存 previewMin 相关状态。 */
  readonly previewMin: number;
  /** 内部字段。保存 completeMin 相关状态。 */
  readonly completeMin: number;
  /** 内部字段。保存 completeMax 相关状态。 */
  readonly completeMax?: number;
  /** 内部字段。保存 autoFinish 相关状态。 */
  readonly autoFinish?: number;
  /** 内部字段。保存 coordinateDimension 相关状态。 */
  readonly coordinateDimension?: 2 | 3;
  /** 内部字段。保存 capabilities 相关状态。 */
  readonly capabilities?: ReadonlySet<ShapeCapability>;
  /** 内部字段。保存 topology 相关状态。 */
  readonly topology?: ControlPointTopologyMode;
  /** 内部字段。保存 freehand 相关状态。 */
  readonly freehand?: boolean;
  /** 内部字段。保存 validate 相关状态。 */
  readonly validate?: (points: readonly Coordinate[]) => void;
  /** 内部字段。保存 render 相关状态。 */
  readonly render: (points: readonly Coordinate[]) => RenderGeometryState;
  /** 已校验并冻结的控制点可直接使用时采用的渲染路径。 */
  readonly renderTrusted?: (points: readonly Coordinate[]) => RenderGeometryState;
  /** 内部字段。保存 complete 相关状态。 */
  readonly complete?: (state: ShapeState<T>) => ShapeCompletion<ShapeState<T>>;
}

/** 内部方法。处理 getPlainDataRecord 相关数据。 */
export function getPlainDataRecord(input: unknown, label = 'Shape state'): object {
  if (input === null || typeof input !== 'object') throw new InvalidArgumentError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const snapshot = Object.create(null) as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === 'symbol') throw new InvalidArgumentError(`${label} cannot contain symbol properties`);
    const descriptor = descriptors[key];
    if (!('value' in descriptor)) throw new InvalidArgumentError(`${label} cannot contain accessor properties`);
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

/** 内部方法。处理 getOwnDataValue 相关数据。 */
export function getOwnDataValue(record: object, key: PropertyKey, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} must be an own data property`);
  return descriptor.value;
}

/** 内部方法。处理 readDensePlainArray 相关数据。 */
function readDensePlainArray(input: unknown, label: string): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) throw new InvalidArgumentError(`${label} must be an ordinary array`);
  const descriptors = Object.getOwnPropertyDescriptors(input) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const lengthDescriptor = descriptors['length'];
  if (lengthDescriptor === undefined || !('value' in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
    throw new InvalidArgumentError(`${label} must have an ordinary array length`);
  }
  const length = lengthDescriptor.value as number;
  const values = new Array<unknown>(length);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== length + 1 || keys.some((key) => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)))) {
    throw new InvalidArgumentError(`${label} must be a dense array without attached properties`);
  }
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} must contain only dense data entries`);
    values[index] = descriptor.value;
  }
  return values;
}

/** 将外部控制点输入整理成规范坐标。扁平数组固定按 XY 两两分组。 */
function normalizeControlPoints(input: unknown): Coordinate[] {
  const values = readDensePlainArray(input, 'controlPoints');
  if (values.length === 0 || typeof values[0] !== 'number') {
    const points = new Array<Coordinate>(values.length);
    for (let index = 0; index < values.length; index += 1) points[index] = normalizeCoordinate(values[index], `controlPoints[${index}]`);
    return points;
  }

  if (values.length % 2 !== 0) throw new InvalidArgumentError('Flat controlPoints must contain complete XY pairs');
  const points = new Array<Coordinate>(values.length / 2);
  for (let index = 0; index < values.length; index += 2) {
    points[index / 2] = normalizeCoordinate([values[index], values[index + 1]], `controlPoints[${index / 2}]`);
  }
  return points;
}

/** 内部方法。处理 assertFiniteRenderGeometry 相关数据。 */
export function assertFiniteRenderGeometry(geometry: RenderGeometryState): void {
  const record = getPlainDataRecord(geometry, 'Render geometry');
  const type = getOwnDataValue(record, 'type', 'Render geometry type');
  if (type === 'point') {
    normalizeCoordinate(getOwnDataValue(record, 'coordinates', 'Point render coordinates'), 'Point render coordinates');
    return;
  }
  if (type === 'polyline') {
    const coordinates = readDensePlainArray(getOwnDataValue(record, 'coordinates', 'Polyline render coordinates'), 'Polyline render coordinates');
    for (let index = 0; index < coordinates.length; index += 1) normalizeCoordinate(coordinates[index], `Polyline render coordinates[${index}]`);
    return;
  }
  if (type === 'polygon') {
    const rings = readDensePlainArray(getOwnDataValue(record, 'coordinates', 'Polygon render coordinates'), 'Polygon render coordinates');
    for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
      const ring = readDensePlainArray(rings[ringIndex], `Polygon render coordinates[${ringIndex}]`);
      for (let coordinateIndex = 0; coordinateIndex < ring.length; coordinateIndex += 1) {
        normalizeCoordinate(ring[coordinateIndex], `Polygon render coordinates[${ringIndex}][${coordinateIndex}]`);
      }
    }
    return;
  }
  if (type === 'circle') {
    normalizeCoordinate(getOwnDataValue(record, 'center', 'Circle render center'), 'Circle render center');
    const radius = getOwnDataValue(record, 'radius', 'Circle render radius');
    if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0)
      throw new InvalidArgumentError('Circle render radius must be finite and non-negative');
    return;
  }
  throw new InvalidArgumentError('Render geometry has an unsupported type');
}

/** 内部方法。处理 createControlPointDefinition 相关数据。 */
export function createControlPointDefinition<T extends Exclude<ShapeType, 'circle'>>(
  options: ControlPointDefinitionOptions<T>
): ShapeDefinition<ShapeState<T>> {
  const hasCompleteCount = (count: number): boolean => count >= options.completeMin && (options.completeMax === undefined || count <= options.completeMax);
  const topologyMode = options.topology ?? 'fixed';

  const normalize = (input: unknown): ShapeState<T> => {
    const record = getPlainDataRecord(input);
    if (getOwnDataValue(record, 'type', 'type') !== options.type) throw new InvalidArgumentError(`Expected shape type ${options.type}`);
    const points = normalizeControlPoints(getOwnDataValue(record, 'controlPoints', 'controlPoints'));
    if (points.length < options.previewMin) throw new InvalidArgumentError(`${options.type} requires at least ${options.previewMin} preview control points`);
    if (options.completeMax !== undefined && points.length > options.completeMax) {
      throw new InvalidArgumentError(`${options.type} accepts at most ${options.completeMax} control points`);
    }
    const dimension = options.coordinateDimension ?? points[0]?.length;
    for (const point of points) {
      if (dimension !== undefined && point.length !== dimension)
        throw new InvalidArgumentError(`${options.type} control points must use a uniform ${dimension}D dimension`);
    }
    options.validate?.(points);
    return { type: options.type, controlPoints: points } as unknown as ShapeState<T>;
  };

  const createDraft = (controlPoints: readonly Coordinate[]): ShapeState<T> | undefined => {
    const points = normalizeCoordinateArray(controlPoints, 'controlPoints');
    if (points.length < options.previewMin) return undefined;
    return normalize({ type: options.type, controlPoints: points });
  };

  const moveNormalized = (normalized: ShapeState<T>, index: number, coordinate: Coordinate): ShapeState<T> => {
    if (!Number.isInteger(index) || index < 0 || index >= normalized.controlPoints.length) {
      throw new InvalidArgumentError(`Control-point index is out of range: ${index}`);
    }
    const points = normalized.controlPoints.map(cloneCoordinate);
    points[index] = normalizeCoordinate(coordinate);
    return normalize({ type: options.type, controlPoints: points });
  };

  const move = (state: ShapeState<T>, index: number, coordinate: Coordinate): ShapeState<T> => moveNormalized(normalize(state), index, coordinate);

  const midpointCoordinate = (left: Coordinate, right: Coordinate): Coordinate => {
    if (left.length !== right.length) throw new InvalidArgumentError(`${options.type} control-point topology requires uniform dimensions`);
    const component = (leftValue: number, rightValue: number): number => {
      const direct = (leftValue + rightValue) / 2;
      const value = Number.isFinite(direct) ? direct : leftValue / 2 + rightValue / 2;
      if (!Number.isFinite(value)) throw new InvalidArgumentError(`${options.type} insertion midpoint exceeds the finite numeric range`);
      return value;
    };
    return left.length === 3 && right.length === 3
      ? [component(left[0], right[0]), component(left[1], right[1]), component(left[2], right[2])]
      : [component(left[0], right[0]), component(left[1], right[1])];
  };

  const createInsertionCandidate = (index: number, left: Coordinate, right: Coordinate): ControlPointInsertion | undefined => {
    const coordinate = midpointCoordinate(left, right);
    if (coordinatesEqual(coordinate, left) || coordinatesEqual(coordinate, right)) return undefined;
    return { index, coordinate };
  };

  const rawInsertionCandidates = (points: readonly Coordinate[]): readonly ControlPointInsertion[] => {
    if (topologyMode === 'fixed') return [];
    if (topologyMode === 'arrow') {
      if (points.length < 3) return [];
      const tailCenter = midpointCoordinate(points[0], points[1]);
      const insertions: ControlPointInsertion[] = [];
      for (let index = 2; index < points.length; index += 1) {
        const candidate = createInsertionCandidate(index, index === 2 ? tailCenter : points[index - 1], points[index]);
        if (candidate !== undefined) insertions.push(candidate);
      }
      return insertions;
    }

    const insertions: ControlPointInsertion[] = [];
    for (let index = 1; index < points.length; index += 1) {
      const candidate = createInsertionCandidate(index, points[index - 1], points[index]);
      if (candidate !== undefined) insertions.push(candidate);
    }
    if (topologyMode === 'closed' && points.length >= 3) {
      const candidate = createInsertionCandidate(points.length, points[points.length - 1], points[0]);
      if (candidate !== undefined) insertions.push(candidate);
    }
    return insertions;
  };

  const isStructurallyRemovable = (count: number, index: number): boolean => {
    if (topologyMode === 'fixed' || count <= options.completeMin) return false;
    return topologyMode !== 'arrow' || index >= 2;
  };

  const insertControlPoint = (points: readonly Coordinate[], index: number, coordinate: Coordinate): ShapeState<T> => {
    const result = points.map(cloneCoordinate);
    result.splice(index, 0, normalizeCoordinate(coordinate));
    return normalize({ type: options.type, controlPoints: result });
  };

  const insertionCandidates = (points: readonly Coordinate[]): readonly ControlPointInsertion[] => {
    if (options.completeMax !== undefined && points.length >= options.completeMax) return [];
    const candidates = rawInsertionCandidates(points);
    if (options.validate === undefined) return candidates;
    return candidates.filter((candidate) => {
      try {
        insertControlPoint(points, candidate.index, candidate.coordinate);
        return true;
      } catch (error) {
        if (error instanceof InvalidArgumentError) return false;
        throw error;
      }
    });
  };

  const removableState = (points: readonly Coordinate[], index: number): ShapeState<T> | undefined => {
    if (!Number.isInteger(index) || index < 0 || index >= points.length || !isStructurallyRemovable(points.length, index)) return undefined;
    const result = points.map(cloneCoordinate);
    result.splice(index, 1);
    try {
      const normalized = normalize({ type: options.type, controlPoints: result });
      return hasCompleteCount(normalized.controlPoints.length) ? normalized : undefined;
    } catch (error) {
      if (error instanceof InvalidArgumentError) return undefined;
      throw error;
    }
  };

  const isRemovalAvailable = (points: readonly Coordinate[], index: number): boolean => {
    if (!Number.isInteger(index) || index < 0 || index >= points.length || !isStructurallyRemovable(points.length, index)) return false;
    if (options.validate === undefined) return hasCompleteCount(points.length - 1);
    return removableState(points, index) !== undefined;
  };

  const editTopology: ShapeEditTopology<ShapeState<T>> = {
    describe: (state) => {
      const normalized = normalize(state);
      return {
        handles: normalized.controlPoints.map((coordinate, index) => ({
          index,
          coordinate: cloneCoordinate(coordinate),
          role: topologyMode === 'arrow' && index < 2 ? 'tail' : 'control',
          removable: isRemovalAvailable(normalized.controlPoints, index)
        })),
        insertions: insertionCandidates(normalized.controlPoints).map(({ index, coordinate }) => ({ index, coordinate: cloneCoordinate(coordinate) }))
      };
    },
    move,
    ...(topologyMode === 'fixed'
      ? {}
      : {
          insert: (state: ShapeState<T>, index: number, coordinate: Coordinate): ShapeState<T> => {
            const normalized = normalize(state);
            if (!Number.isInteger(index) || !insertionCandidates(normalized.controlPoints).some((candidate) => candidate.index === index)) {
              throw new InvalidArgumentError(`Control-point insertion index is unavailable: ${index}`);
            }
            return insertControlPoint(normalized.controlPoints, index, coordinate);
          },
          remove: (state: ShapeState<T>, index: number): ShapeState<T> => {
            const normalized = normalize(state);
            const result = removableState(normalized.controlPoints, index);
            if (result === undefined) throw new InvalidArgumentError(`Control point cannot be removed: ${index}`);
            return result;
          }
        })
  };

  const tryComplete = (state: ShapeState<T>): ShapeCompletion<ShapeState<T>> => {
    const normalized = normalize(state);
    const outcome =
      options.complete?.(normalized) ??
      (hasCompleteCount(normalized.controlPoints.length) ? { status: 'complete', state: normalized } : { status: 'incomplete' });
    if (outcome.status === 'incomplete') return { status: 'incomplete' };
    if (outcome.status !== 'complete') throw new InvalidArgumentError(`${options.type} completion returned an unsupported status`);
    const completed = normalize(outcome.state);
    if (!hasCompleteCount(completed.controlPoints.length)) throw new InvalidArgumentError(`${options.type} completion returned an incomplete state`);
    return { status: 'complete', state: completed };
  };

  const normalizeFreehandSamples = (samples: readonly Coordinate[]): Coordinate[] => {
    const normalized = normalizeCoordinateArray(samples, 'freehand samples');
    const dimension = normalized[0]?.length;
    if (dimension !== undefined && normalized.some((sample) => sample.length !== dimension)) {
      throw new InvalidArgumentError(`${options.type} freehand samples must use a uniform dimension`);
    }
    return normalized;
  };

  const appendFreehandSampleInPlace = (samples: Coordinate[], coordinate: Coordinate): void => {
    const next = normalizeCoordinate(coordinate, 'freehand sample');
    const dimension = samples[0]?.length ?? next.length;
    if (next.length !== dimension) {
      throw new InvalidArgumentError(`${options.type} freehand samples must use a uniform dimension`);
    }
    if (samples.length === 0 || !coordinatesEqual(samples[samples.length - 1], next)) samples.push(next);
  };

  const appendSample: ShapeFreehandPolicy<ShapeState<T>>['appendSample'] = (samples, coordinate) => {
    const normalizedSamples = normalizeFreehandSamples(samples);
    appendFreehandSampleInPlace(normalizedSamples, coordinate);
    return normalizedSamples;
  };

  if (options.freehand) registerShapeFreehandAccumulator(appendSample, { append: appendFreehandSampleInPlace });

  const freehand: ShapeFreehandPolicy<ShapeState<T>> | undefined = options.freehand
    ? {
        appendSample,
        normalizeSamples: (samples, phase) => {
          if (phase !== 'preview' && phase !== 'complete') throw new InvalidArgumentError(`Unknown freehand phase: ${String(phase)}`);
          const normalizedSamples = normalizeFreehandSamples(samples);
          try {
            const draft = createDraft(normalizedSamples);
            if (draft === undefined || phase === 'preview') return draft;
            const completion = tryComplete(draft);
            return completion.status === 'complete' ? completion.state : undefined;
          } catch (error) {
            if (error instanceof InvalidArgumentError) return undefined;
            throw error;
          }
        }
      }
    : undefined;

  const toRenderGeometry = (state: ShapeState<T>): RenderGeometryState => {
    const geometry = options.render(normalize(state).controlPoints);
    assertFiniteRenderGeometry(geometry);
    return geometry;
  };

  const definition: ShapeDefinition<ShapeState<T>> = {
    type: options.type,
    capabilities: options.capabilities ?? editableCapabilities,
    controlPointPolicy: Object.freeze({
      previewMin: options.previewMin,
      completeMin: options.completeMin,
      ...(options.completeMax === undefined ? {} : { completeMax: options.completeMax }),
      ...(options.autoFinish === undefined ? {} : { autoFinish: options.autoFinish })
    }),
    editTopology: Object.freeze(editTopology),
    ...(freehand === undefined ? {} : { freehand: Object.freeze(freehand) }),
    createDraft,
    normalize,
    clone: (state) => normalize(state),
    isComplete: (state) => hasCompleteCount(normalize(state).controlPoints.length),
    tryComplete,
    toRenderGeometry
  };

  registerTrustedShapeRenderer(definition, (state) => {
    const geometry = options.renderTrusted?.(state.controlPoints) ?? options.render(state.controlPoints);
    if (options.renderTrusted === undefined) assertFiniteRenderGeometry(geometry);
    return geometry;
  });
  registerTrustedShapeMover(definition, (state, index, coordinate) => moveNormalized(state, index, coordinate));

  return Object.freeze(definition);
}

/** 内部方法。处理 requireSeparated 相关数据。 */
export function requireSeparated(points: readonly Coordinate[], ...pairs: readonly [number, number][]): void {
  for (const [left, right] of pairs) {
    if (coordinatesEqual(points[left], points[right])) throw new InvalidArgumentError('Control points that define a segment must be distinct');
  }
}
