import type { FeatureLike } from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Icon from 'ol/style/Icon.js';
import RegularShape from 'ol/style/RegularShape.js';
import Stroke from 'ol/style/Stroke.js';
import Style, { type StyleFunction, type StyleLike } from 'ol/style/Style.js';
import Text from 'ol/style/Text.js';
import type { NativeRefRegistry } from '../NativeRefRegistry.js';
import { cloneCoreState } from '../../../core/common/clone.js';
import type { Color } from '../../../core/common/types.js';
import { isNativeStyleRef, type ArrowDecorationSpec, type IconSymbolSpec, type StrokeSpec, type StyleSpec, type TextSpec } from '../../../core/style/types.js';
import { assertStructuredStyleSpec } from '../../../services/style/StyleService.js';
import { createPatternFill, type PatternCanvasFactory } from './pattern.js';

export interface StyleCompilerOptions {
  readonly getViewRotation?: () => number;
  readonly createCanvasContext?: PatternCanvasFactory;
}

interface CacheEntry {
  readonly signature: string;
  readonly styles: Style[];
}

interface CompilationCacheContext {
  readonly signature: string | undefined;
  readonly geometry: object | undefined;
}

type Coordinate2 = readonly [number, number];

interface ArrowPoint {
  readonly coordinate: Coordinate2;
  readonly angle: number;
}

export class StyleCompiler {
  readonly #nativeRefs: NativeRefRegistry;
  readonly #getViewRotation: () => number;
  readonly #createCanvasContext: PatternCanvasFactory | undefined;

  constructor(nativeRefs: NativeRefRegistry, options: StyleCompilerOptions = {}) {
    this.#nativeRefs = nativeRefs;
    this.#getViewRotation = options.getViewRotation ?? (() => 0);
    this.#createCanvasContext = options.createCanvasContext;
  }

  compile(style: StyleSpec | Parameters<NativeRefRegistry['requireStyle']>[0]): StyleLike {
    if (isNativeStyleRef(style)) return this.#nativeRefs.requireStyle(style);

    const spec = cloneCoreState(style);
    assertStructuredStyleSpec(spec);
    const needsFitPaths =
      spec.strokes?.some((stroke) => stroke.fitPatternOnce === true && stroke.lineDash !== undefined && stroke.lineDash.length > 0) ?? false;
    const needsDecorations = (spec.decorations?.length ?? 0) > 0;
    const needsGeometry = needsFitPaths || needsDecorations;
    const cache = new WeakMap<object, CacheEntry>();
    const compiled: StyleFunction = (feature, resolution) => {
      const viewRotation = finiteOr(this.#getViewRotation(), 0);
      const context = compilationCacheContext(feature, resolution, viewRotation, needsGeometry);
      const key = feature as object;
      const previous = context.signature === undefined ? undefined : cache.get(key);
      if (previous !== undefined && previous.signature === context.signature) return previous.styles;

      const styles = this.#compileStructured(spec, context.geometry, resolution, viewRotation, needsFitPaths, needsDecorations);
      if (context.signature !== undefined) cache.set(key, { signature: context.signature, styles });
      return styles;
    };
    return compiled;
  }

  #compileStructured(
    spec: StyleSpec,
    geometry: object | undefined,
    resolution: number,
    viewRotation: number,
    needsFitPaths: boolean,
    needsDecorations: boolean
  ): Style[] {
    const extracted = needsFitPaths || needsDecorations ? extractGeometryPaths(geometry) : undefined;
    const fitPaths = needsFitPaths ? (extracted?.paths ?? []) : [];
    const inheritedColor = lastExplicitStrokeColor(spec.strokes);
    const strokes = spec.strokes ?? [];
    const styles: Style[] = [];

    if (strokes.length > 0) {
      for (let index = 0; index < strokes.length; index += 1) {
        const foreground = index === strokes.length - 1;
        styles.push(
          new Style({
            stroke: compileStroke(strokes[index], fitPaths, resolution),
            ...(foreground && spec.fill !== undefined ? { fill: compileFill(spec.fill, inheritedColor, this.#createCanvasContext) } : {}),
            ...(foreground && spec.symbol !== undefined ? { image: compileSymbol(spec.symbol, inheritedColor, viewRotation, this.#createCanvasContext) } : {}),
            ...(foreground && spec.text !== undefined ? { text: compileText(spec.text, inheritedColor, viewRotation, this.#createCanvasContext) } : {}),
            ...(spec.zIndex === undefined ? {} : { zIndex: spec.zIndex })
          })
        );
      }
    } else if (spec.fill !== undefined || spec.symbol !== undefined || spec.text !== undefined || spec.zIndex !== undefined) {
      styles.push(
        new Style({
          ...(spec.fill === undefined ? {} : { fill: compileFill(spec.fill, inheritedColor, this.#createCanvasContext) }),
          ...(spec.symbol === undefined ? {} : { image: compileSymbol(spec.symbol, inheritedColor, viewRotation, this.#createCanvasContext) }),
          ...(spec.text === undefined ? {} : { text: compileText(spec.text, inheritedColor, viewRotation, this.#createCanvasContext) }),
          ...(spec.zIndex === undefined ? {} : { zIndex: spec.zIndex })
        })
      );
    }

    if (needsDecorations) {
      const linePaths = extracted?.type === 'LineString' || extracted?.type === 'MultiLineString' ? extracted.paths : [];
      for (const decoration of spec.decorations ?? []) {
        for (const arrow of placeArrows(linePaths, decoration, resolution)) {
          styles.push(compileArrow(decoration, arrow, inheritedColor, viewRotation, spec.zIndex));
        }
      }
    }
    return styles;
  }
}

function compileStroke(spec: StrokeSpec, paths: readonly Coordinate2[][], resolution: number): Stroke {
  const lineDash = spec.fitPatternOnce ? fitDashPattern(spec.lineDash, paths, resolution) : copyNumbers(spec.lineDash);
  return new Stroke({
    ...(spec.color === undefined ? {} : { color: copyColor(spec.color) }),
    ...(spec.width === undefined ? {} : { width: spec.width }),
    ...(lineDash === undefined ? {} : { lineDash }),
    ...(spec.lineDashOffset === undefined ? {} : { lineDashOffset: spec.lineDashOffset }),
    ...(spec.lineCap === undefined ? {} : { lineCap: spec.lineCap }),
    ...(spec.lineJoin === undefined ? {} : { lineJoin: spec.lineJoin }),
    ...(spec.miterLimit === undefined ? {} : { miterLimit: spec.miterLimit })
  });
}

function compileFill(spec: NonNullable<StyleSpec['fill']>, inheritedColor: Color | undefined, createCanvasContext: PatternCanvasFactory | undefined): Fill {
  if (spec.type === 'solid') return new Fill({ color: copyColor(spec.color) });
  return new Fill({
    color: createCanvasContext === undefined ? createPatternFill(spec, inheritedColor) : createPatternFill(spec, inheritedColor, createCanvasContext)
  });
}

function compileSymbol(
  spec: NonNullable<StyleSpec['symbol']>,
  inheritedColor: Color | undefined,
  viewRotation: number,
  createCanvasContext: PatternCanvasFactory | undefined
): CircleStyle | Icon {
  if (spec.type === 'icon') return compileIcon(spec, viewRotation);
  return new CircleStyle({
    radius: spec.radius,
    ...(spec.fill === undefined ? {} : { fill: compileFill(spec.fill, spec.stroke?.color ?? inheritedColor, createCanvasContext) }),
    ...(spec.stroke === undefined ? {} : { stroke: compileStroke(spec.stroke, [], 1) })
  });
}

function compileIcon(spec: IconSymbolSpec, viewRotation: number, additionalRotation = 0): Icon {
  const rotation = degreesToRadians(spec.rotation ?? 0) + additionalRotation;
  const displacement = compensateOffset(spec.displacement, rotation + (spec.rotateWithView ? viewRotation : 0));
  return new Icon({
    src: spec.src,
    ...(spec.size === undefined ? {} : { size: [...spec.size] }),
    ...(spec.color === undefined ? {} : { color: copyColor(spec.color) }),
    ...(spec.offset === undefined ? {} : { offset: [...spec.offset] }),
    displacement,
    ...(spec.scale === undefined ? {} : { scale: copyScale(spec.scale) }),
    rotation,
    ...(spec.rotateWithView === undefined ? {} : { rotateWithView: spec.rotateWithView }),
    ...(spec.anchor === undefined ? {} : { anchor: [...spec.anchor] }),
    ...(spec.anchorOrigin === undefined ? {} : { anchorOrigin: spec.anchorOrigin }),
    ...(spec.anchorXUnits === undefined ? {} : { anchorXUnits: spec.anchorXUnits }),
    ...(spec.anchorYUnits === undefined ? {} : { anchorYUnits: spec.anchorYUnits }),
    ...(spec.origin === undefined ? {} : { offsetOrigin: spec.origin }),
    ...(spec.opacity === undefined ? {} : { opacity: spec.opacity }),
    ...(spec.crossOrigin === undefined ? {} : { crossOrigin: spec.crossOrigin })
  });
}

function compileText(spec: TextSpec, inheritedColor: Color | undefined, viewRotation: number, createCanvasContext: PatternCanvasFactory | undefined): Text {
  const rotation = degreesToRadians(spec.rotation ?? 0);
  const offset = compensateOffset([spec.offsetX ?? 0, spec.offsetY ?? 0], rotation + (spec.rotateWithView ? viewRotation : 0));
  return new Text({
    text: spec.text,
    ...(composeFont(spec) === undefined ? {} : { font: composeFont(spec) }),
    ...(spec.fill === undefined ? {} : { fill: compileFill(spec.fill, spec.stroke?.color ?? inheritedColor, createCanvasContext) }),
    ...(spec.stroke === undefined ? {} : { stroke: compileStroke(spec.stroke, [], 1) }),
    ...(spec.backgroundFill === undefined
      ? {}
      : { backgroundFill: compileFill(spec.backgroundFill, spec.backgroundStroke?.color ?? inheritedColor, createCanvasContext) }),
    ...(spec.backgroundStroke === undefined ? {} : { backgroundStroke: compileStroke(spec.backgroundStroke, [], 1) }),
    ...(spec.padding === undefined ? {} : { padding: [...spec.padding] }),
    offsetX: offset[0],
    offsetY: -offset[1],
    ...(spec.scale === undefined ? {} : { scale: copyScale(spec.scale) }),
    ...(spec.textAlign === undefined ? {} : { textAlign: spec.textAlign }),
    ...(spec.textBaseline === undefined ? {} : { textBaseline: spec.textBaseline }),
    rotation,
    ...(spec.rotateWithView === undefined ? {} : { rotateWithView: spec.rotateWithView }),
    ...(spec.overflow === undefined ? {} : { overflow: spec.overflow }),
    ...(spec.placement === undefined ? {} : { placement: spec.placement }),
    ...(spec.maxAngle === undefined ? {} : { maxAngle: degreesToRadians(spec.maxAngle) }),
    ...(spec.repeat === undefined ? {} : { repeat: spec.repeat }),
    ...(spec.justify === undefined ? {} : { justify: spec.justify }),
    ...(spec.keepUpright === undefined ? {} : { keepUpright: spec.keepUpright })
  });
}

function compileArrow(decoration: ArrowDecorationSpec, arrow: ArrowPoint, inheritedColor: Color | undefined, viewRotation: number, zIndex?: number): Style {
  const geometry = new Point([...arrow.coordinate]);
  const image =
    decoration.symbol === undefined
      ? new RegularShape({
          points: 3,
          radius: 7,
          fill: new Fill({ color: copyColor(inheritedColor ?? '#000000') }),
          rotation: Math.PI / 2 - arrow.angle,
          rotateWithView: true
        })
      : compileIcon(
          {
            ...decoration.symbol,
            ...(decoration.symbol.color === undefined && inheritedColor !== undefined ? { color: copyColor(inheritedColor) } : {}),
            rotateWithView: decoration.symbol.rotateWithView ?? true
          },
          viewRotation,
          -arrow.angle
        );
  return new Style({ geometry, image, ...(zIndex === undefined ? {} : { zIndex }) });
}

function composeFont(spec: TextSpec): string | undefined {
  const split = spec.fontFamily !== undefined || spec.fontSize !== undefined || spec.fontWeight !== undefined || spec.fontStyle !== undefined;
  if (!split) return spec.font;
  const fontStyle = spec.fontStyle ?? 'normal';
  const fontWeight = spec.fontWeight ?? 'normal';
  const fontSize = typeof spec.fontSize === 'number' ? `${spec.fontSize}px` : (spec.fontSize ?? '10px');
  const fontFamily = spec.fontFamily ?? 'sans-serif';
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

function compensateOffset(offset: readonly [number, number] | undefined, rotation: number): [number, number] {
  const x = offset?.[0] ?? 0;
  const y = offset?.[1] ?? 0;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return [x * cosine - y * sine, x * sine + y * cosine];
}

function fitDashPattern(lineDash: readonly number[] | undefined, paths: readonly Coordinate2[][], resolution: number): number[] | undefined {
  if (lineDash === undefined || lineDash.length === 0) return copyNumbers(lineDash);
  const safePattern = lineDash.map((value) => (Number.isFinite(value) && value > 0 ? value : 1));
  const canvasPattern = safePattern.length % 2 === 0 ? safePattern : [...safePattern, ...safePattern];
  const patternLength = canvasPattern.reduce((sum, value) => sum + value, 0);
  const mapLength = paths.reduce((total, path) => total + pathLength(path), 0);
  const safeResolution = Number.isFinite(resolution) && resolution > 0 ? resolution : 1;
  const pixelLength = mapLength > 0 ? mapLength / safeResolution : patternLength;
  const factor = pixelLength / patternLength;
  return canvasPattern.map((value) => Math.max(Number.EPSILON, value * factor));
}

function placeArrows(paths: readonly Coordinate2[][], decoration: ArrowDecorationSpec, resolution: number): ArrowPoint[] {
  const result: ArrowPoint[] = [];
  const safeResolution = Number.isFinite(resolution) && resolution > 0 ? resolution : 1;
  for (const path of paths) {
    const segments = pathSegments(path);
    if (segments.length === 0) continue;
    if (decoration.placement === 'start') {
      const first = segments[0];
      result.push({ coordinate: path[0], angle: Math.atan2(first.start[1] - first.end[1], first.start[0] - first.end[0]) });
    } else if (decoration.placement === 'end') {
      const last = segments[segments.length - 1];
      result.push({ coordinate: last.end, angle: last.angle });
    } else if (decoration.placement === 'each-segment') {
      result.push(...segments.map((segment) => ({ coordinate: segment.end, angle: segment.angle })));
    } else {
      const offset = (decoration.offset ?? 0) * safeResolution;
      const spacing = (decoration.spacing ?? 40) * safeResolution;
      const total = segments.reduce((sum, segment) => sum + segment.length, 0);
      for (let distance = offset; distance <= total; distance += spacing) {
        const sampled = sampleSegments(segments, distance);
        if (sampled !== undefined) result.push(sampled);
      }
    }
  }
  return result;
}

interface PathSegment {
  readonly start: Coordinate2;
  readonly end: Coordinate2;
  readonly length: number;
  readonly angle: number;
}

function pathSegments(path: readonly Coordinate2[]): PathSegment[] {
  const segments: PathSegment[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const deltaX = end[0] - start[0];
    const deltaY = end[1] - start[1];
    const length = Math.hypot(deltaX, deltaY);
    if (!Number.isFinite(length) || length <= 0) continue;
    segments.push({ start, end, length, angle: Math.atan2(deltaY, deltaX) });
  }
  return segments;
}

function sampleSegments(segments: readonly PathSegment[], distance: number): ArrowPoint | undefined {
  if (!Number.isFinite(distance) || distance < 0) return undefined;
  let remaining = distance;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = remaining / segment.length;
      return {
        coordinate: [segment.start[0] + (segment.end[0] - segment.start[0]) * ratio, segment.start[1] + (segment.end[1] - segment.start[1]) * ratio],
        angle: segment.angle
      };
    }
    remaining -= segment.length;
  }
  return undefined;
}

interface ExtractedGeometryPaths {
  readonly type: string | undefined;
  readonly paths: Coordinate2[][];
}

function extractGeometryPaths(geometry: object | undefined): ExtractedGeometryPaths {
  if (geometry === undefined) return { type: undefined, paths: [] };
  const type = callString(geometry, 'getType');
  const coordinates = callUnknown(geometry, 'getCoordinates');
  return {
    type,
    paths: coordinates === undefined ? flatCoordinatePaths(geometry, type) : coordinatePaths(type, coordinates)
  };
}

function coordinatePaths(type: string | undefined, coordinates: unknown): Coordinate2[][] {
  if (type === 'LineString' || type === 'LinearRing') return [coordinateArray(coordinates)];
  if (type === 'MultiLineString' || type === 'Polygon') return nestedCoordinateArrays(coordinates);
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) return coordinates.flatMap(nestedCoordinateArrays);
  return [];
}

function flatCoordinatePaths(geometry: object, type: string | undefined): Coordinate2[][] {
  const flat = callUnknown(geometry, 'getFlatCoordinates');
  const stride = callUnknown(geometry, 'getStride');
  if (!Array.isArray(flat) || typeof stride !== 'number' || stride < 2) return [];
  const all = flatToCoordinates(flat, 0, flat.length, stride);
  if (type === 'LineString' || type === 'LinearRing') return [all];
  const ends = callUnknown(geometry, 'getEnds');
  if ((type === 'MultiLineString' || type === 'Polygon') && Array.isArray(ends)) {
    const paths: Coordinate2[][] = [];
    let start = 0;
    for (const end of ends) {
      if (typeof end !== 'number') continue;
      paths.push(flatToCoordinates(flat, start, end, stride));
      start = end;
    }
    return paths;
  }
  return type === 'MultiLineString' ? [all] : [];
}

function flatToCoordinates(flat: readonly unknown[], start: number, end: number, stride: number): Coordinate2[] {
  const result: Coordinate2[] = [];
  for (let index = start; index + 1 < end; index += stride) {
    const x = flat[index];
    const y = flat[index + 1];
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) result.push([x, y]);
  }
  return result;
}

function coordinateArray(value: unknown): Coordinate2[] {
  if (!Array.isArray(value)) return [];
  const result: Coordinate2[] = [];
  for (const coordinate of value) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
    const [x, y] = coordinate;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) result.push([x, y]);
  }
  return result;
}

function nestedCoordinateArrays(value: unknown): Coordinate2[][] {
  if (!Array.isArray(value)) return [];
  return value.map(coordinateArray).filter((path) => path.length > 0);
}

function featureGeometry(feature: FeatureLike): object | undefined {
  const geometry = callUnknown(feature, 'getGeometry');
  return geometry !== null && typeof geometry === 'object' ? geometry : undefined;
}

function compilationCacheContext(feature: FeatureLike, resolution: number, viewRotation: number, needsGeometry: boolean): CompilationCacheContext {
  const featureRevision = callNumber(feature, 'getRevision');
  if (!needsGeometry) {
    return { signature: `${featureRevision ?? 'none'}|${resolution}|${viewRotation}`, geometry: undefined };
  }

  const geometry = featureGeometry(feature);
  const geometryRevision = geometry === undefined ? undefined : callNumber(geometry, 'getRevision');
  const signature =
    featureRevision === undefined || geometryRevision === undefined ? undefined : `${featureRevision}|${geometryRevision}|${resolution}|${viewRotation}`;
  return { signature, geometry };
}

function callUnknown(value: object, name: string): unknown {
  const candidate = (value as Record<string, unknown>)[name];
  return typeof candidate === 'function' ? (candidate as () => unknown).call(value) : undefined;
}

function callNumber(value: object, name: string): number | undefined {
  const result = callUnknown(value, name);
  return typeof result === 'number' && Number.isFinite(result) ? result : undefined;
}

function callString(value: object, name: string): string | undefined {
  const result = callUnknown(value, name);
  return typeof result === 'string' ? result : undefined;
}

function pathLength(path: readonly Coordinate2[]): number {
  return pathSegments(path).reduce((sum, segment) => sum + segment.length, 0);
}

function lastExplicitStrokeColor(strokes: readonly StrokeSpec[] | undefined): Color | undefined {
  if (strokes === undefined) return undefined;
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    if (strokes[index].color !== undefined) return strokes[index].color;
  }
  return undefined;
}

function copyColor(color: Color): Color {
  return typeof color === 'string' ? color : ([...color] as Color);
}

function copyNumbers(numbers: readonly number[] | undefined): number[] | undefined {
  return numbers === undefined ? undefined : [...numbers];
}

function copyScale(scale: number | readonly [number, number]): number | [number, number] {
  return typeof scale === 'number' ? scale : [...scale];
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
