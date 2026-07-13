import { InvalidArgumentError } from '../../core/errors.js';
import type { Coordinate } from '../../core/common/types.js';
import type { RenderGeometryState, ShapeCapability, ShapeDefinition, ShapeState, ShapeType } from '../../core/shape/types.js';

export function immutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const source = new Set(values);
  const result: ReadonlySet<T> = Object.freeze({
    get size() {
      return source.size;
    },
    has: (value: T) => source.has(value),
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    forEach: (callback: (value: T, value2: T, set: ReadonlySet<T>) => void, thisArg?: unknown) => {
      source.forEach((value) => callback.call(thisArg, value, value, result));
    },
    [Symbol.iterator]: () => source[Symbol.iterator](),
    [Symbol.toStringTag]: 'Set'
  });
  return result;
}

export const editableCapabilities = immutableSet<ShapeCapability>(['draw', 'edit', 'translate', 'rotate', 'scale', 'vertexEdit']);
export const pathCapabilities = immutableSet<ShapeCapability>([...editableCapabilities, 'path']);
export const pointCapabilities = immutableSet<ShapeCapability>([...editableCapabilities, 'anchor']);
export const nonRotatingEditableCapabilities = immutableSet<ShapeCapability>(['draw', 'edit', 'translate', 'scale', 'vertexEdit']);

export function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

export function normalizeCoordinate(input: unknown, label = 'coordinate'): Coordinate {
  if (!Array.isArray(input) || (input.length !== 2 && input.length !== 3) || !input.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  }
  return input.length === 3 ? [input[0], input[1], input[2]] : [input[0], input[1]];
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

interface ControlPointDefinitionOptions<T extends Exclude<ShapeType, 'circle'>> {
  readonly type: T;
  readonly previewMin: number;
  readonly completeMin: number;
  readonly completeMax?: number;
  readonly autoFinish?: number;
  readonly capabilities?: ReadonlySet<ShapeCapability>;
  readonly validate?: (points: readonly Coordinate[]) => void;
  readonly render: (points: readonly Coordinate[]) => RenderGeometryState;
  readonly finalize?: (state: ShapeState<T>) => ShapeState<T>;
}

function getRecord(input: unknown): Record<PropertyKey, unknown> {
  if (input === null || typeof input !== 'object') throw new InvalidArgumentError('Shape state must be an object');
  return input as Record<PropertyKey, unknown>;
}

export function createControlPointDefinition<T extends Exclude<ShapeType, 'circle'>>(
  options: ControlPointDefinitionOptions<T>
): ShapeDefinition<ShapeState<T>> {
  const normalize = (input: unknown): ShapeState<T> => {
    const record = getRecord(input);
    if (record.type !== options.type) throw new InvalidArgumentError(`Expected shape type ${options.type}`);
    if (!Array.isArray(record.controlPoints)) throw new InvalidArgumentError(`${options.type} requires controlPoints`);
    const points = record.controlPoints.map((coordinate, index) => normalizeCoordinate(coordinate, `controlPoints[${index}]`));
    if (points.length < options.previewMin) throw new InvalidArgumentError(`${options.type} requires at least ${options.previewMin} preview control points`);
    if (options.completeMax !== undefined && points.length > options.completeMax) {
      throw new InvalidArgumentError(`${options.type} accepts at most ${options.completeMax} control points`);
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
    isComplete: (state) => {
      const count = normalize(state).controlPoints.length;
      return count >= options.completeMin && (options.completeMax === undefined || count <= options.completeMax);
    },
    finalize: (state) => {
      const normalized = normalize(state);
      if (options.finalize !== undefined) return normalize(options.finalize(normalized));
      const count = normalized.controlPoints.length;
      if (count < options.completeMin || (options.completeMax !== undefined && count > options.completeMax)) {
        throw new InvalidArgumentError(`${options.type} is not complete`);
      }
      return normalize(normalized);
    },
    toRenderGeometry: (state) => options.render(normalize(state).controlPoints),
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
