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

/** 测量适配器的可选配置。 */
export interface MeasurementAdapterOptions {
  /** 地图当前使用的投影，默认 `EPSG:3857`。 */
  readonly projection?: ProjectionLike;
  /** 测量 Tooltip 的 DOM 引用注册表。 */
  readonly nativeRefs?: NativeRefRegistry;
  /** 创建测量 Tooltip 节点的自定义工厂。 */
  readonly createElement?: () => HTMLElement;
}

/** 以 OpenLayers 实现长度、面积计算和测量 Tooltip。 */
export class MeasurementAdapter implements MeasurementPort, MeasurementTooltipPort {
  readonly #projection: ProjectionLike;
  readonly #nativeRefs: NativeRefRegistry | undefined;
  readonly #createElement: (() => HTMLElement) | undefined;

  constructor(options: MeasurementAdapterOptions = {}) {
    this.#projection = options.projection ?? 'EPSG:3857';
    this.#nativeRefs = options.nativeRefs;
    this.#createElement = options.createElement ?? defaultElementFactory();
  }

  /** `path` 累加相邻线段，`radial` 则从首点分别量到其余点。 */
  measureLine(coordinates: readonly Coordinate[], mode: 'path' | 'radial'): LineMeasurement | undefined {
    const points = normalizeCoordinates(coordinates);
    if (points.length < 2) return undefined;
    const pairs =
      mode === 'radial' ? points.slice(1).map((point) => [points[0], point] as const) : points.slice(1).map((point, index) => [points[index], point] as const);
    const segments = pairs.map(([start, end]) => this.#segment(start, end));
    const meters = segments.reduce((total, segment) => total + segment.meters, 0);
    return freeze({ meters, anchor: cloneCoordinate(points[points.length - 1]), segments: Object.freeze(segments) });
  }

  /** 测量多边形面积，并以内部点作为标注位置。 */
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

  /** 创建测量 Tooltip，并把 DOM 所有权登记到当前 Earth。 */
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

/** 仅在浏览器环境中提供默认 Tooltip 工厂。 */
function defaultElementFactory(): (() => HTMLElement) | undefined {
  const document = globalThis.document;
  return document === undefined ? undefined : () => document.createElement('div');
}

/** 将 TextSpec 可表达的视觉语义映射到 Tooltip DOM。 */
function applyTextStyle(element: HTMLElement, style: Readonly<Omit<TextSpec, 'text'>>): void {
  if (style.font !== undefined) element.style.font = style.font;
  if (style.fontFamily !== undefined) element.style.fontFamily = style.fontFamily;
  if (style.fontSize !== undefined) element.style.fontSize = typeof style.fontSize === 'number' ? `${style.fontSize}px` : style.fontSize;
  if (style.fontWeight !== undefined) element.style.fontWeight = String(style.fontWeight);
  if (style.fontStyle !== undefined) element.style.fontStyle = style.fontStyle;
  if (style.fill !== undefined) applyForeground(element, style.fill);
  if (style.stroke !== undefined) {
    const width = style.stroke.width ?? 1;
    const color = style.stroke.color === undefined ? '#000000' : colorToCss(style.stroke.color);
    element.style.setProperty('-webkit-text-stroke', `${width}px ${color}`);
    element.style.textShadow = textShadow(width, color);
  }
  if (style.backgroundFill !== undefined) applyBackground(element, style.backgroundFill);
  if (style.backgroundStroke !== undefined) {
    element.style.borderStyle = 'solid';
    element.style.borderWidth = `${style.backgroundStroke.width ?? 1}px`;
    if (style.backgroundStroke.color !== undefined) element.style.borderColor = colorToCss(style.backgroundStroke.color);
  }
  if (style.padding !== undefined) element.style.padding = style.padding.map((value) => `${value}px`).join(' ');
  if (style.textAlign !== undefined) element.style.textAlign = style.textAlign === 'start' || style.textAlign === 'end' ? style.textAlign : style.textAlign;
  if (style.justify !== undefined) element.style.textAlign = style.justify;
  if (style.textBaseline !== undefined) element.style.verticalAlign = baseline(style.textBaseline);
  if (style.offsetX !== undefined) element.style.marginLeft = `${style.offsetX}px`;
  if (style.offsetY !== undefined) element.style.marginTop = `${style.offsetY}px`;
  const transforms: string[] = [];
  if (style.scale !== undefined) {
    const scale = Array.isArray(style.scale) ? style.scale : [style.scale, style.scale];
    transforms.push(`scale(${scale[0]}, ${scale[1]})`);
  }
  if (style.rotation !== undefined) transforms.push(`rotate(${style.rotation}rad)`);
  if (transforms.length > 0) {
    element.style.transform = transforms.join(' ');
    element.style.transformOrigin = 'center';
  }
}

function applyForeground(element: HTMLElement, fill: NonNullable<TextSpec['fill']>): void {
  if (fill.type === 'solid') {
    element.style.color = colorToCss(fill.color);
    return;
  }
  element.style.color = 'transparent';
  element.style.backgroundImage = patternImage(fill);
  element.style.backgroundClip = 'text';
  element.style.setProperty('-webkit-background-clip', 'text');
}

function applyBackground(element: HTMLElement, fill: NonNullable<TextSpec['backgroundFill']>): void {
  if (fill.type === 'solid') element.style.backgroundColor = colorToCss(fill.color);
  else {
    if (fill.backgroundColor !== undefined) element.style.backgroundColor = colorToCss(fill.backgroundColor);
    element.style.backgroundImage = patternImage(fill);
  }
}

/** 用 CSS 渐变近似表达纹理填充。 */
function patternImage(fill: Extract<NonNullable<TextSpec['fill']>, { type: 'pattern' }>): string {
  const color = fill.color === undefined ? '#ffffff' : colorToCss(fill.color);
  const size = Math.max(1, fill.size ?? 8);
  const width = Math.max(1, fill.lineWidth ?? 1);
  if (fill.pattern === 'dot') {
    const radius = Math.max(0.5, fill.dotRadius ?? width);
    return `radial-gradient(circle, ${color} ${radius}px, transparent ${radius}px)`;
  }
  if (fill.pattern === 'horizontal') return `repeating-linear-gradient(0deg, ${color} 0 ${width}px, transparent ${width}px ${size}px)`;
  if (fill.pattern === 'vertical') return `repeating-linear-gradient(90deg, ${color} 0 ${width}px, transparent ${width}px ${size}px)`;
  if (fill.pattern === 'cross') {
    return `repeating-linear-gradient(45deg, ${color} 0 ${width}px, transparent ${width}px ${size}px), repeating-linear-gradient(-45deg, ${color} 0 ${width}px, transparent ${width}px ${size}px)`;
  }
  return `repeating-linear-gradient(45deg, ${color} 0 ${width}px, transparent ${width}px ${size}px)`;
}

/** 在不支持完整文字描边的环境中用四向阴影补足效果。 */
function textShadow(width: number, color: string): string {
  const offset = Math.max(1, width);
  return [`${offset}px 0 ${color}`, `${-offset}px 0 ${color}`, `0 ${offset}px ${color}`, `0 ${-offset}px ${color}`].join(', ');
}

function baseline(value: NonNullable<TextSpec['textBaseline']>): string {
  if (value === 'top' || value === 'hanging') return 'top';
  if (value === 'bottom' || value === 'alphabetic' || value === 'ideographic') return 'bottom';
  return 'middle';
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
