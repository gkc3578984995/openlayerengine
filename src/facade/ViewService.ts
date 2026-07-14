import type Map from 'ol/Map.js';
import type View from 'ol/View.js';
import DragPan from 'ol/interaction/DragPan.js';
import type { Coordinate, Pixel } from '../core/common/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';
import {
  getCoordinateAtPixel,
  getWorldIndex,
  getWorldWidth,
  normalizeCoordinatesToViewWorld,
  restoreCoordinatesToWorld,
  translateCoordinatesToPixel as translateToPixel
} from '../adapters/openlayers/world.js';

type CoordinateLine = readonly Coordinate[];
type CoordinateRings = readonly CoordinateLine[];

export interface ViewAnimationOptions {
  readonly duration?: number;
  readonly easing?: (progress: number) => number;
  readonly callback?: (completed: boolean) => void;
}

export interface FlyToOptions extends ViewAnimationOptions {
  readonly zoom?: number;
}

export interface ViewService {
  readonly olView: View;
  getCenter(): Coordinate | undefined;
  setCenter(center: Coordinate): void;
  getZoom(): number | undefined;
  setZoom(zoom: number): void;
  flyHome(options?: ViewAnimationOptions): void;
  animateFlyTo(center: Coordinate, options?: FlyToOptions): void;
  flyTo(center: Coordinate, zoom?: number): void;
  setCursor(cursor: string): void;
  useDefaultCursor(): void;
  useCrosshairCursor(): void;
  setDragEnabled(enabled: boolean): void;
  worldWidth(): number | undefined;
  worldIndex(x: number): number | undefined;
  normalizeToViewWorld(coordinates: Coordinate): Coordinate;
  normalizeToViewWorld(coordinates: readonly Coordinate[]): readonly Coordinate[];
  normalizeToViewWorld(coordinates: readonly (readonly Coordinate[])[]): readonly (readonly Coordinate[])[];
  restoreToWorld(coordinates: Coordinate, index: number | undefined): Coordinate;
  restoreToWorld(coordinates: readonly Coordinate[], index: number | undefined): readonly Coordinate[];
  restoreToWorld(coordinates: readonly (readonly Coordinate[])[], index: number | undefined): readonly (readonly Coordinate[])[];
  coordinateAtPixel(pixel: Pixel): Coordinate | undefined;
  translateCoordinatesToPixel(pixel: Pixel, coordinates: Coordinate): Coordinate | undefined;
  translateCoordinatesToPixel(pixel: Pixel, coordinates: readonly Coordinate[]): readonly Coordinate[] | undefined;
  translateCoordinatesToPixel(pixel: Pixel, coordinates: readonly (readonly Coordinate[])[]): readonly (readonly Coordinate[])[] | undefined;
}

interface ViewServiceContext {
  readonly map: Map;
  readonly olView: View;
  readonly viewport: HTMLElement;
}

interface ParsedAnimationOptions {
  readonly duration: number;
  readonly easing?: (progress: number) => number;
  readonly callback?: (completed: boolean) => void;
  readonly zoom?: number;
}

export class ViewServiceImpl implements ViewService {
  static readonly DEFAULT_DURATION = 2_000;
  static readonly HOME_ZOOM = 4;

  readonly olView: View;
  readonly #map: Map;
  readonly #viewport: HTMLElement;
  readonly #home: Coordinate;
  #disposed = false;

  constructor(context: ViewServiceContext, home?: readonly number[]) {
    this.#map = context.map;
    this.olView = context.olView;
    this.#viewport = context.viewport;
    const initialCenter = home ?? context.olView.getCenter();
    this.#home = initialCenter === undefined ? Object.freeze([0, 0]) : copyCoordinate(initialCenter, 'Home center');
  }

  getCenter(): Coordinate | undefined {
    this.#assertActive();
    const center = this.olView.getCenter();
    return center === undefined ? undefined : copyCoordinate(center, 'View center');
  }

  setCenter(center: Coordinate): void {
    this.#assertActive();
    this.olView.setCenter([...copyCoordinate(center, 'View center')]);
  }

  getZoom(): number | undefined {
    this.#assertActive();
    const zoom = this.olView.getZoom();
    return zoom === undefined ? undefined : requireFinite(zoom, 'View zoom');
  }

  setZoom(zoom: number): void {
    this.#assertActive();
    this.olView.setZoom(requireFinite(zoom, 'View zoom'));
  }

  flyHome(options?: ViewAnimationOptions): void {
    this.#assertActive();
    const parsed = inspectAnimationOptions(options, false);
    this.#animate(
      {
        center: [...this.#home],
        zoom: ViewServiceImpl.HOME_ZOOM,
        duration: parsed.duration,
        ...(parsed.easing === undefined ? {} : { easing: parsed.easing })
      },
      parsed.callback
    );
  }

  animateFlyTo(center: Coordinate, options?: FlyToOptions): void {
    this.#assertActive();
    const target = copyCoordinate(center, 'Fly-to center');
    const parsed = inspectAnimationOptions(options, true);
    const zoom = parsed.zoom ?? this.getZoom();
    this.#animate(
      {
        center: [...target],
        ...(zoom === undefined ? {} : { zoom }),
        duration: parsed.duration,
        ...(parsed.easing === undefined ? {} : { easing: parsed.easing })
      },
      parsed.callback
    );
  }

  flyTo(center: Coordinate, zoom?: number): void {
    this.#assertActive();
    const target = copyCoordinate(center, 'Fly-to center');
    this.olView.setCenter([...target]);
    if (zoom !== undefined) this.olView.setZoom(requireFinite(zoom, 'Fly-to zoom'));
  }

  setCursor(cursor: string): void {
    this.#assertActive();
    if (typeof cursor !== 'string' || cursor.trim().length === 0) throw new InvalidArgumentError('Cursor must be a non-empty string');
    this.#viewport.style.cursor = cursor;
  }

  useDefaultCursor(): void {
    this.setCursor('auto');
  }

  useCrosshairCursor(): void {
    this.setCursor('crosshair');
  }

  setDragEnabled(enabled: boolean): void {
    this.#assertActive();
    if (typeof enabled !== 'boolean') throw new InvalidArgumentError('Drag enabled must be a boolean');
    this.#map.getInteractions().forEach((interaction) => {
      if (interaction instanceof DragPan) interaction.setActive(enabled);
    });
  }

  worldWidth(): number | undefined {
    this.#assertActive();
    return getWorldWidth(this.olView);
  }

  worldIndex(x: number): number | undefined {
    this.#assertActive();
    return getWorldIndex(this.olView, x);
  }

  normalizeToViewWorld(coordinates: Coordinate): Coordinate;
  normalizeToViewWorld(coordinates: CoordinateLine): CoordinateLine;
  normalizeToViewWorld(coordinates: CoordinateRings): CoordinateRings;
  normalizeToViewWorld(coordinates: Coordinate | CoordinateLine | CoordinateRings): Coordinate | CoordinateLine | CoordinateRings {
    this.#assertActive();
    return normalizeCoordinatesToViewWorld(this.olView, coordinates as CoordinateRings);
  }

  restoreToWorld(coordinates: Coordinate, index: number | undefined): Coordinate;
  restoreToWorld(coordinates: CoordinateLine, index: number | undefined): CoordinateLine;
  restoreToWorld(coordinates: CoordinateRings, index: number | undefined): CoordinateRings;
  restoreToWorld(coordinates: Coordinate | CoordinateLine | CoordinateRings, index: number | undefined): Coordinate | CoordinateLine | CoordinateRings {
    this.#assertActive();
    return restoreCoordinatesToWorld(this.olView, coordinates as CoordinateRings, index);
  }

  coordinateAtPixel(pixel: Pixel): Coordinate | undefined {
    this.#assertActive();
    return getCoordinateAtPixel(this.#map, pixel);
  }

  translateCoordinatesToPixel(pixel: Pixel, coordinates: Coordinate): Coordinate | undefined;
  translateCoordinatesToPixel(pixel: Pixel, coordinates: CoordinateLine): CoordinateLine | undefined;
  translateCoordinatesToPixel(pixel: Pixel, coordinates: CoordinateRings): CoordinateRings | undefined;
  translateCoordinatesToPixel(
    pixel: Pixel,
    coordinates: Coordinate | CoordinateLine | CoordinateRings
  ): Coordinate | CoordinateLine | CoordinateRings | undefined {
    this.#assertActive();
    return translateToPixel(this.#map, this.olView, pixel, coordinates as CoordinateRings);
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.olView.cancelAnimations();
  }

  #animate(options: Parameters<View['animate']>[0], callback: ((completed: boolean) => void) | undefined): void {
    if (callback === undefined) this.olView.animate(options);
    else this.olView.animate(options, callback);
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('ViewService has been destroyed');
  }
}

function inspectAnimationOptions(options: ViewAnimationOptions | FlyToOptions | undefined, allowZoom: boolean): ParsedAnimationOptions {
  if (options === undefined) return { duration: ViewServiceImpl.DEFAULT_DURATION };
  const record = inspectRecord(options, 'View animation options');
  const allowed = allowZoom ? new Set(['duration', 'easing', 'callback', 'zoom']) : new Set(['duration', 'easing', 'callback']);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown view animation option: ${String(key)}`);
  }
  const duration = hasOwn(record, 'duration') ? requireNonNegative(record.duration, 'Animation duration') : ViewServiceImpl.DEFAULT_DURATION;
  const easing = hasOwn(record, 'easing') ? requireFunction<(progress: number) => number>(record.easing, 'Animation easing') : undefined;
  const callback = hasOwn(record, 'callback') ? requireFunction<(completed: boolean) => void>(record.callback, 'Animation callback') : undefined;
  const zoom = allowZoom && hasOwn(record, 'zoom') ? requireFinite(record.zoom, 'Fly-to zoom') : undefined;
  return {
    duration,
    ...(easing === undefined ? {} : { easing }),
    ...(callback === undefined ? {} : { callback }),
    ...(zoom === undefined ? {} : { zoom })
  };
}

function inspectRecord(value: unknown, label: string): Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
    const record = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} fields must be data properties`);
      record[key] = descriptor.value;
    }
    return record;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

function copyCoordinate(value: unknown, label: string): Coordinate {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  const numbers: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} items must be data properties`);
    numbers.push(requireFinite(descriptor.value, label));
  }
  return Object.freeze(numbers) as Coordinate;
}

function requireNonNegative(value: unknown, label: string): number {
  const number = requireFinite(value, label);
  if (number < 0) throw new InvalidArgumentError(`${label} must be non-negative`);
  return number;
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidArgumentError(`${label} must be finite`);
  return value;
}

function requireFunction<T extends (...args: never[]) => unknown>(value: unknown, label: string): T {
  if (typeof value !== 'function') throw new InvalidArgumentError(`${label} must be a function`);
  return value as T;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
