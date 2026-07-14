import type Map from 'ol/Map.js';
import type View from 'ol/View.js';
import type { Coordinate, Pixel } from '../../core/common/types.js';
import { InvalidArgumentError } from '../../core/errors.js';

type CoordinateLine = readonly Coordinate[];
type CoordinateRings = readonly CoordinateLine[];
type Coordinates = Coordinate | CoordinateLine | CoordinateRings;

interface ParsedCoordinates {
  readonly depth: 0 | 1 | 2;
  readonly value: Coordinates;
  readonly flat: readonly Coordinate[];
}

export function getWorldWidth(view: View): number | undefined {
  const extent = view.getProjection().getExtent();
  if (extent === undefined || extent.length < 4) return undefined;
  const width = extent[2] - extent[0];
  return Number.isFinite(width) && width > 0 ? width : undefined;
}

export function getWorldIndex(view: View, x: number): number | undefined {
  requireFinite(x, 'World x');
  const width = getWorldWidth(view);
  return width === undefined ? undefined : Math.floor(x / width);
}

export function normalizeCoordinatesToViewWorld(view: View, coordinates: Coordinate): Coordinate;
export function normalizeCoordinatesToViewWorld(view: View, coordinates: CoordinateLine): CoordinateLine;
export function normalizeCoordinatesToViewWorld(view: View, coordinates: CoordinateRings): CoordinateRings;
export function normalizeCoordinatesToViewWorld(view: View, coordinates: Coordinates): Coordinates {
  const parsed = parseCoordinates(coordinates);
  const center = view.getCenter();
  const width = getWorldWidth(view);
  if (center === undefined || width === undefined) return cloneParsed(parsed);
  const centerCoordinate = parseCoordinate(center, 'View center');
  const centerWorld = getWorldIndex(view, centerCoordinate[0]);
  if (centerWorld === undefined) return cloneParsed(parsed);
  return mapParsed(parsed, (coordinate) => {
    const coordinateWorld = getWorldIndex(view, coordinate[0]);
    return coordinateWorld === undefined ? cloneCoordinate(coordinate) : shiftCoordinate(coordinate, (centerWorld - coordinateWorld) * width, 0);
  });
}

export function restoreCoordinatesToWorld(view: View, coordinates: Coordinate, index: number | undefined): Coordinate;
export function restoreCoordinatesToWorld(view: View, coordinates: CoordinateLine, index: number | undefined): CoordinateLine;
export function restoreCoordinatesToWorld(view: View, coordinates: CoordinateRings, index: number | undefined): CoordinateRings;
export function restoreCoordinatesToWorld(view: View, coordinates: Coordinates, index: number | undefined): Coordinates {
  const parsed = parseCoordinates(coordinates);
  if (index === undefined) return cloneParsed(parsed);
  if (!Number.isInteger(index)) throw new InvalidArgumentError('World index must be an integer');
  const width = getWorldWidth(view);
  if (width === undefined) return cloneParsed(parsed);
  return mapParsed(parsed, (coordinate) => {
    const currentWorld = getWorldIndex(view, coordinate[0]);
    return currentWorld === undefined ? cloneCoordinate(coordinate) : shiftCoordinate(coordinate, (index - currentWorld) * width, 0);
  });
}

export function getCoordinateAtPixel(map: Map, pixel: Pixel): Coordinate | undefined {
  const inspectedPixel = parsePixel(pixel);
  const coordinate = map.getCoordinateFromPixel([...inspectedPixel]);
  return coordinate === undefined || coordinate === null ? undefined : parseCoordinate(coordinate, 'Pixel coordinate');
}

export function translateCoordinatesToPixel(map: Map, view: View, pixel: Pixel, coordinates: Coordinate): Coordinate | undefined;
export function translateCoordinatesToPixel(map: Map, view: View, pixel: Pixel, coordinates: CoordinateLine): CoordinateLine | undefined;
export function translateCoordinatesToPixel(map: Map, view: View, pixel: Pixel, coordinates: CoordinateRings): CoordinateRings | undefined;
export function translateCoordinatesToPixel(map: Map, view: View, pixel: Pixel, coordinates: Coordinates): Coordinates | undefined {
  const parsed = parseCoordinates(coordinates);
  if (parsed.flat.length === 0) return undefined;
  const target = getCoordinateAtPixel(map, pixel);
  if (target === undefined) return undefined;

  const center = coordinateCenter(parsed.flat);
  const extent = view.getProjection().getExtent();
  const width = getWorldWidth(view);
  const dx = width === undefined ? target[0] - center[0] : shortestWrappedDelta(center[0], target[0], width);
  const dy = target[1] - center[1];
  const minX = extent?.[0];
  const maxX = extent?.[2];

  return mapParsed(parsed, (coordinate) => {
    const shifted = shiftCoordinate(coordinate, dx, dy);
    if (width === undefined || !Number.isFinite(minX) || !Number.isFinite(maxX)) return shifted;
    return replaceX(shifted, normalizeX(shifted[0], minX as number, maxX as number, width));
  });
}

function parseCoordinates(value: unknown): ParsedCoordinates {
  const outer = readArray(value, 'Coordinates');
  if (isCoordinateValues(outer)) {
    const coordinate = parseCoordinateValues(outer, 'Coordinate');
    return { depth: 0, value: coordinate, flat: Object.freeze([coordinate]) };
  }
  if (outer.length === 0) return { depth: 1, value: Object.freeze([]), flat: Object.freeze([]) };

  const first = readArray(outer[0], 'Coordinates item');
  if (isCoordinateValues(first)) {
    const line = Object.freeze(outer.map((item, index) => parseCoordinate(item, `Coordinate ${index}`)));
    return { depth: 1, value: line, flat: line };
  }

  const rings = Object.freeze(
    outer.map((ring, ringIndex) => {
      const values = readArray(ring, `Coordinate ring ${ringIndex}`);
      return Object.freeze(values.map((item, index) => parseCoordinate(item, `Coordinate ${ringIndex}:${index}`)));
    })
  );
  return { depth: 2, value: rings, flat: Object.freeze(rings.flat()) };
}

function parseCoordinate(value: unknown, label: string): Coordinate {
  return parseCoordinateValues(readArray(value, label), label);
}

function parseCoordinateValues(values: readonly unknown[], label: string): Coordinate {
  if (!isCoordinateValues(values)) throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  return Object.freeze(values.length === 2 ? [values[0], values[1]] : [values[0], values[1], values[2]]) as Coordinate;
}

function isCoordinateValues(values: readonly unknown[]): values is readonly [number, number] | readonly [number, number, number] {
  return (values.length === 2 || values.length === 3) && values.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function parsePixel(value: unknown): Pixel {
  const values = readArray(value, 'Pixel');
  if (values.length !== 2 || values.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new InvalidArgumentError('Pixel must contain two finite numbers');
  }
  return Object.freeze([values[0], values[1]]) as Pixel;
}

function readArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be an array`);
  const length = value.length;
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} items must be data properties`);
    result.push(descriptor.value);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !isArrayIndex(key, length)) throw new InvalidArgumentError(`${label} contains an unsupported field`);
  }
  return result;
}

function isArrayIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function mapParsed(parsed: ParsedCoordinates, mapper: (coordinate: Coordinate) => Coordinate): Coordinates {
  if (parsed.depth === 0) return mapper(parsed.value as Coordinate);
  if (parsed.depth === 1) return Object.freeze((parsed.value as CoordinateLine).map(mapper));
  return Object.freeze((parsed.value as CoordinateRings).map((ring) => Object.freeze(ring.map(mapper))));
}

function cloneParsed(parsed: ParsedCoordinates): Coordinates {
  return mapParsed(parsed, cloneCoordinate);
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return Object.freeze(coordinate.length === 2 ? [coordinate[0], coordinate[1]] : [coordinate[0], coordinate[1], coordinate[2]]) as Coordinate;
}

function shiftCoordinate(coordinate: Coordinate, dx: number, dy: number): Coordinate {
  return Object.freeze(
    coordinate.length === 2 ? [coordinate[0] + dx, coordinate[1] + dy] : [coordinate[0] + dx, coordinate[1] + dy, coordinate[2]]
  ) as Coordinate;
}

function replaceX(coordinate: Coordinate, x: number): Coordinate {
  return Object.freeze(coordinate.length === 2 ? [x, coordinate[1]] : [x, coordinate[1], coordinate[2]]) as Coordinate;
}

function coordinateCenter(coordinates: readonly Coordinate[]): Coordinate {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const coordinate of coordinates) {
    minX = Math.min(minX, coordinate[0]);
    minY = Math.min(minY, coordinate[1]);
    maxX = Math.max(maxX, coordinate[0]);
    maxY = Math.max(maxY, coordinate[1]);
  }
  return Object.freeze([(minX + maxX) / 2, (minY + maxY) / 2]);
}

function shortestWrappedDelta(from: number, to: number, width: number): number {
  const delta = to - from;
  const half = width / 2;
  const wrapped = ((((delta + half) % width) + width) % width) - half;
  return wrapped === -half && delta > 0 ? half : wrapped;
}

function normalizeX(x: number, minX: number, maxX: number, width: number): number {
  if (x > maxX) return x - Math.ceil((x - maxX) / width) * width;
  if (x < minX) return x + Math.ceil((minX - x) / width) * width;
  return x;
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidArgumentError(`${label} must be finite`);
  return value;
}
