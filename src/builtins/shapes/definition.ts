import { InvalidArgumentError } from '../../core/errors.js';
import type { Coordinate } from '../../core/common/types.js';
import type { RenderGeometryState, ShapeCapability, ShapeDefinition, ShapeState, ShapeType } from '../../core/shape/types.js';
import { createImmutableSet } from '../../core/shape/immutableSet.js';

export function immutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  return createImmutableSet(values);
}

export const editableCapabilities = immutableSet<ShapeCapability>(['draw', 'edit', 'translate', 'rotate', 'scale', 'vertexEdit']);
export const pathCapabilities = immutableSet<ShapeCapability>([...editableCapabilities, 'path']);
export const pointCapabilities = immutableSet<ShapeCapability>([...editableCapabilities, 'anchor']);
export const nonRotatingEditableCapabilities = immutableSet<ShapeCapability>(['draw', 'edit', 'translate', 'scale', 'vertexEdit']);

export function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

export function normalizeCoordinate(input: unknown, label = 'coordinate'): Coordinate {
  const values = readDensePlainArray(input, label);
  if ((values.length !== 2 && values.length !== 3) || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  }
  return values.length === 3 ? [values[0] as number, values[1] as number, values[2] as number] : [values[0] as number, values[1] as number];
}

export function coordinatesEqual(left: Coordinate, right: Coordinate): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function closeRing(coordinates: readonly Coordinate[]): readonly Coordinate[] {
  if (coordinates.length === 0) throw new InvalidArgumentError('A polygon ring cannot be empty');
  const ring = coordinates.map(cloneCoordinate);
  if (!coordinatesEqual(ring[0], ring[ring.length - 1])) ring.push(cloneCoordinate(ring[0]));
  return ring;
}

function planarVectors(origin: Coordinate, first: Coordinate, second: Coordinate): readonly [number, number, number, number] {
  const firstX = first[0] - origin[0];
  const firstY = first[1] - origin[1];
  const secondX = second[0] - origin[0];
  const secondY = second[1] - origin[1];
  if (![firstX, firstY, secondX, secondY].every(Number.isFinite)) {
    throw new InvalidArgumentError('Control-point differences exceed the finite numeric range');
  }
  const scale = Math.max(Math.abs(firstX), Math.abs(firstY), Math.abs(secondX), Math.abs(secondY));
  if (scale === 0) return [0, 0, 0, 0];
  return [firstX / scale, firstY / scale, secondX / scale, secondY / scale];
}

export function arePlanarCollinear(origin: Coordinate, first: Coordinate, second: Coordinate): boolean {
  const [firstX, firstY, secondX, secondY] = planarVectors(origin, first, second);
  const positive = firstX * secondY;
  const negative = firstY * secondX;
  const magnitude = Math.abs(positive) + Math.abs(negative);
  return Math.abs(positive - negative) <= Number.EPSILON * 8 * magnitude;
}

export function requireNonCollinear(origin: Coordinate, first: Coordinate, second: Coordinate): void {
  if (arePlanarCollinear(origin, first, second)) throw new InvalidArgumentError('Control points must not be collinear');
}

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

export function haveSamePlanarDirection(origin: Coordinate, first: Coordinate, second: Coordinate): boolean {
  const [firstX, firstY, secondX, secondY] = planarVectors(origin, first, second);
  const positive = firstX * secondY;
  const negative = firstY * secondX;
  const crossMagnitude = Math.abs(positive) + Math.abs(negative);
  return Math.abs(positive - negative) <= Number.EPSILON * 8 * crossMagnitude && firstX * secondX + firstY * secondY > 0;
}

interface ControlPointDefinitionOptions<T extends Exclude<ShapeType, 'circle'>> {
  readonly type: T;
  readonly previewMin: number;
  readonly completeMin: number;
  readonly completeMax?: number;
  readonly autoFinish?: number;
  readonly coordinateDimension?: 2 | 3;
  readonly capabilities?: ReadonlySet<ShapeCapability>;
  readonly validate?: (points: readonly Coordinate[]) => void;
  readonly render: (points: readonly Coordinate[]) => RenderGeometryState;
  readonly finalize?: (state: ShapeState<T>) => ShapeState<T>;
}

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

export function getOwnDataValue(record: object, key: PropertyKey, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} must be an own data property`);
  return descriptor.value;
}

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

export function createControlPointDefinition<T extends Exclude<ShapeType, 'circle'>>(
  options: ControlPointDefinitionOptions<T>
): ShapeDefinition<ShapeState<T>> {
  const hasCompleteCount = (count: number): boolean => count >= options.completeMin && (options.completeMax === undefined || count <= options.completeMax);

  const normalize = (input: unknown): ShapeState<T> => {
    const record = getPlainDataRecord(input);
    if (getOwnDataValue(record, 'type', 'type') !== options.type) throw new InvalidArgumentError(`Expected shape type ${options.type}`);
    const rawPoints = readDensePlainArray(getOwnDataValue(record, 'controlPoints', 'controlPoints'), 'controlPoints');
    const points = new Array<Coordinate>(rawPoints.length);
    for (let index = 0; index < rawPoints.length; index += 1) points[index] = normalizeCoordinate(rawPoints[index], `controlPoints[${index}]`);
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

  const definition: ShapeDefinition<ShapeState<T>> = {
    type: options.type,
    capabilities: options.capabilities ?? editableCapabilities,
    controlPointPolicy: Object.freeze({
      previewMin: options.previewMin,
      completeMin: options.completeMin,
      ...(options.completeMax === undefined ? {} : { completeMax: options.completeMax }),
      ...(options.autoFinish === undefined ? {} : { autoFinish: options.autoFinish })
    }),
    normalize,
    clone: (state) => normalize(state),
    isComplete: (state) => hasCompleteCount(normalize(state).controlPoints.length),
    finalize: (state) => {
      const normalized = normalize(state);
      const finalized = normalize(options.finalize === undefined ? normalized : options.finalize(normalized));
      if (!hasCompleteCount(finalized.controlPoints.length)) throw new InvalidArgumentError(`${options.type} is not complete`);
      return finalized;
    },
    toRenderGeometry: (state) => {
      const geometry = options.render(normalize(state).controlPoints);
      assertFiniteRenderGeometry(geometry);
      return geometry;
    },
    getControlPoints: (state) => normalize(state).controlPoints,
    updateControlPoint: (state, index, coordinate) => {
      const normalized = normalize(state);
      if (!Number.isInteger(index) || index < 0 || index >= normalized.controlPoints.length) {
        throw new InvalidArgumentError(`Control-point index is out of range: ${index}`);
      }
      const points = normalized.controlPoints.map(cloneCoordinate);
      points[index] = normalizeCoordinate(coordinate);
      return normalize({ type: options.type, controlPoints: points });
    }
  };

  return Object.freeze(definition);
}

export function requireSeparated(points: readonly Coordinate[], ...pairs: readonly [number, number][]): void {
  for (const [left, right] of pairs) {
    if (coordinatesEqual(points[left], points[right])) throw new InvalidArgumentError('Control points that define a segment must be distinct');
  }
}
