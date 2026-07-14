import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import { toLonLat, type ProjectionLike } from 'ol/proj.js';
import { getArea, getLength } from 'ol/sphere.js';
import type { NativeRefRegistry } from './NativeRefRegistry.js';
import type { Coordinate, Color } from '../../core/common/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { NativeRef } from '../../core/native/types.js';
import type { LineMeasurement, MeasurementPort, MeasurementSegment, SurfaceMeasurement } from '../../core/ports/MeasurementPort.js';
import type { TextSpec } from '../../core/style/types.js';
import type { MeasurementTooltipPort } from '../../services/measure/types.js';

export interface MeasurementAdapterOptions {
  readonly projection?: ProjectionLike;
  readonly nativeRefs?: NativeRefRegistry;
  readonly createElement?: () => HTMLElement;
}

export class MeasurementAdapter implements MeasurementPort, MeasurementTooltipPort {
  readonly #projection: ProjectionLike;
  readonly #nativeRefs: NativeRefRegistry | undefined;
  readonly #createElement: (() => HTMLElement) | undefined;

  constructor(options: MeasurementAdapterOptions = {}) {
    this.#projection = options.projection ?? 'EPSG:3857';
    this.#nativeRefs = options.nativeRefs;
    this.#createElement = options.createElement ?? defaultElementFactory();
  }

  measureLine(coordinates: readonly Coordinate[], mode: 'path' | 'radial'): LineMeasurement | undefined {
    const points = normalizeCoordinates(coordinates);
    if (points.length < 2) return undefined;
    const pairs =
      mode === 'radial' ? points.slice(1).map((point) => [points[0], point] as const) : points.slice(1).map((point, index) => [points[index], point] as const);
    const segments = pairs.map(([start, end]) => this.#segment(start, end));
    const meters = segments.reduce((total, segment) => total + segment.meters, 0);
    return freeze({ meters, anchor: cloneCoordinate(points[points.length - 1]), segments: Object.freeze(segments) });
  }

  measureArea(ring: readonly Coordinate[]): SurfaceMeasurement | undefined {
    const points = normalizeCoordinates(ring);
    if (points.length < 3) return undefined;
    const closed = sameCoordinate(points[0], points[points.length - 1]) ? points : [...points, cloneCoordinate(points[0])];
    const polygon = new Polygon([closed.map((coordinate) => [...coordinate])]);
    const squareMeters = getArea(polygon, { projection: this.#projection });
    const anchor = polygon.getInteriorPoint().getCoordinates();
    if (!Number.isFinite(squareMeters) || !validCoordinate(anchor)) throw new InvalidArgumentError('Measurement area could not be calculated');
    return freeze({
      squareMeters,
      anchor: coordinateFromOl(anchor),
      verticesGeographic: Object.freeze(points.map((coordinate) => coordinateFromOl(toLonLat([...coordinate], this.#projection))))
    });
  }

  create(style: Readonly<Omit<TextSpec, 'text'>>): NativeRef<'element'> {
    const refs = this.#nativeRefs;
    const createElement = this.#createElement;
    if (refs === undefined || createElement === undefined) throw new ObjectDisposedError('Measurement tooltip adapter is not configured');
    const element = createElement();
    element.className = 'ol-engine-measure-tooltip';
    applyTextStyle(element, style);
    return refs.register('element', element);
  }

  setText(reference: NativeRef<'element'>, text: string): void {
    const refs = this.#nativeRefs;
    if (refs === undefined) throw new ObjectDisposedError('Measurement tooltip adapter is not configured');
    refs.require<HTMLElement>('element', reference).textContent = text;
  }

  release(reference: NativeRef<'element'>): void {
    const refs = this.#nativeRefs;
    if (refs === undefined) throw new ObjectDisposedError('Measurement tooltip adapter is not configured');
    refs.revoke('element', reference);
  }

  #segment(start: Coordinate, end: Coordinate): MeasurementSegment {
    const geometry = new LineString([[...start], [...end]]);
    const meters = getLength(geometry, { projection: this.#projection });
    const anchor = geometry.getCoordinateAt(0.5);
    if (!Number.isFinite(meters) || !validCoordinate(anchor)) throw new InvalidArgumentError('Measurement distance could not be calculated');
    return freeze({
      start: cloneCoordinate(start),
      end: cloneCoordinate(end),
      startGeographic: coordinateFromOl(toLonLat([...start], this.#projection)),
      endGeographic: coordinateFromOl(toLonLat([...end], this.#projection)),
      anchor: coordinateFromOl(anchor),
      meters
    });
  }
}

function normalizeCoordinates(input: readonly Coordinate[]): Coordinate[] {
  if (!Array.isArray(input)) throw new InvalidArgumentError('Measurement coordinates must be an array');
  return input.map((coordinate) => {
    if (!validCoordinate(coordinate)) throw new InvalidArgumentError('Measurement coordinate must contain two or three finite numbers');
    return cloneCoordinate(coordinate);
  });
}

function validCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && (value.length === 2 || value.length === 3) && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function sameCoordinate(left: Coordinate, right: Coordinate): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return Object.freeze([...coordinate]) as Coordinate;
}

function coordinateFromOl(coordinate: readonly number[]): Coordinate {
  if (!validCoordinate(coordinate)) throw new InvalidArgumentError('Measurement coordinate must contain two or three finite numbers');
  return cloneCoordinate(coordinate);
}

function defaultElementFactory(): (() => HTMLElement) | undefined {
  const document = globalThis.document;
  return document === undefined ? undefined : () => document.createElement('div');
}

function applyTextStyle(element: HTMLElement, style: Readonly<Omit<TextSpec, 'text'>>): void {
  if (style.font !== undefined) element.style.font = style.font;
  if (style.fontFamily !== undefined) element.style.fontFamily = style.fontFamily;
  if (style.fontSize !== undefined) element.style.fontSize = typeof style.fontSize === 'number' ? `${style.fontSize}px` : style.fontSize;
  if (style.fontWeight !== undefined) element.style.fontWeight = String(style.fontWeight);
  if (style.fontStyle !== undefined) element.style.fontStyle = style.fontStyle;
  if (style.fill?.color !== undefined) element.style.color = colorToCss(style.fill.color);
  if (style.backgroundFill?.color !== undefined) element.style.backgroundColor = colorToCss(style.backgroundFill.color);
  if (style.padding !== undefined) element.style.padding = style.padding.map((value) => `${value}px`).join(' ');
  if (style.textAlign !== undefined) element.style.textAlign = style.textAlign === 'start' || style.textAlign === 'end' ? style.textAlign : style.textAlign;
  if (style.offsetX !== undefined) element.style.marginLeft = `${style.offsetX}px`;
  if (style.offsetY !== undefined) element.style.marginTop = `${style.offsetY}px`;
}

function colorToCss(color: Color): string {
  if (typeof color === 'string') return color;
  if (color.length === 3) return `rgb(${color.join(', ')})`;
  const alpha = color[3] > 1 ? color[3] / 255 : color[3];
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
