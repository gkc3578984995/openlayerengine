import type { FeatureLike } from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { checkedFonts, measureTextWidth as measureCanvasTextWidth, registerFont as registerCanvasFont } from 'ol/render/canvas.js';
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
import { ObjectDisposedError } from '../../../core/errors.js';
import type { LayerRenderPathReveal } from '../../../core/ports/LayerRenderPort.js';
import { isNativeStyleRef, type ArrowDecorationSpec, type IconSymbolSpec, type StrokeSpec, type StyleSpec, type TextSpec } from '../../../core/style/types.js';
import { assertStructuredStyleSpec } from '../../../services/style/StyleService.js';
import { createPatternFill, type PatternCanvasFactory } from './pattern.js';
import {
  compileLineworkStyles,
  createLineworkPresentationPool,
  lineworkDependencies,
  type CompiledLineworkStylePool,
  type LineworkTextMeasurer
} from './linework.js';
import type { PathViewport } from './pathLayout.js';

/** 样式编译器的可选配置。 */
export interface StyleCompilerOptions {
  /** 按需读取当前 View 旋转角度。 */
  readonly getViewRotation?: () => number;
  /** 为纹理填充提供自定义画布上下文。 */
  readonly createCanvasContext?: PatternCanvasFactory;
  /** 为路径内嵌文本提供与最终字体一致的 CSS 像素宽度。 */
  readonly measureTextWidth?: LineworkTextMeasurer;
  /** 测试或非浏览器 Adapter 提供字体度量缓存 revision。 */
  readonly getFontRevision?: () => number;
  /** 注册字体加载完成后的重绘监听。 */
  readonly registerFont?: (font: string) => void;
  /** 返回重复线饰当前可见的保守 View 范围与 wrapX 世界宽度。 */
  readonly getLineworkViewport?: () => PathViewport | undefined;
}

/** 结构化样式实际依赖的渲染上下文。 */
interface StyleDependencies {
  readonly geometry: boolean;
  readonly resolution: boolean;
  readonly viewRotation: boolean;
  readonly font: boolean;
  readonly viewport: boolean;
}

/** 单个 Feature 最近一次样式编译缓存。 */
interface CacheEntry {
  readonly geometry: object | undefined;
  readonly geometryRevision: number | undefined;
  readonly resolution: number;
  readonly viewRotation: number;
  readonly fontRevision: number;
  readonly viewportKey: string;
  readonly styles: Style[];
}

/** 本次样式编译使用的缓存上下文。 */
interface CompilationCacheContext {
  readonly cacheable: boolean;
  readonly geometry: object | undefined;
  readonly geometryRevision: number | undefined;
  readonly resolution: number;
  readonly viewRotation: number;
  readonly fontRevision: number;
  readonly viewport: PathViewport | undefined;
  readonly viewportKey: string;
}

type Coordinate2 = readonly [number, number];

/** 线装饰箭头的位置和朝向。 */
interface ArrowPoint {
  readonly coordinate: Coordinate2;
  readonly angle: number;
}

/** 单个展示替身拥有的稳定样式池。 */
export interface CompiledPresentationStyle {
  /** 规范 Geometry、分辨率或旋转导致池重建时递增。 */
  readonly revision: number;
  /** 用当前展示 Geometry 更新池内动态位置，并返回本帧生效的稳定 Style。 */
  resolve(feature: FeatureLike, resolution: number, pathReveal?: LayerRenderPathReveal): readonly Style[];
  /** 释放池对 Style 和 Geometry 的引用；重复调用不产生副作用。 */
  destroy(): void;
}

/** 一种 Decoration 模板预分配的稳定 slot。 */
interface DecorationStylePool {
  readonly decoration: ArrowDecorationSpec;
  readonly slots: DecorationStyleSlot[];
}

/** 单个 Decoration slot 的可变 OL 对象。 */
interface DecorationStyleSlot {
  readonly style: Style;
  readonly geometry: Point;
}

/** 固定规范拓扑、分辨率和旋转下的一组展示样式。 */
interface PresentationStylePool {
  readonly maximumGeometry: object | undefined;
  readonly maximumGeometryRevision: number | undefined;
  readonly resolution: number;
  readonly viewRotation: number;
  readonly fontRevision: number;
  readonly baseStyles: Style[];
  readonly decorations: DecorationStylePool[];
  readonly linework: CompiledLineworkStylePool | undefined;
  readonly activeStyles: Style[];
}

/** 将 StyleSpec 单向编译为 OpenLayers 样式，并直接解析 nativeStyle 引用。 */
export class StyleCompiler {
  readonly #nativeRefs: NativeRefRegistry;
  readonly #getViewRotation: () => number;
  readonly #createCanvasContext: PatternCanvasFactory | undefined;
  readonly #measureTextWidth: LineworkTextMeasurer;
  readonly #getFontRevision: () => number;
  readonly #registerFont: (font: string) => void;
  readonly #getLineworkViewport: () => PathViewport | undefined;

  constructor(nativeRefs: NativeRefRegistry, options: StyleCompilerOptions = {}) {
    this.#nativeRefs = nativeRefs;
    this.#getViewRotation = options.getViewRotation ?? (() => 0);
    this.#createCanvasContext = options.createCanvasContext;
    this.#measureTextWidth = options.measureTextWidth ?? defaultMeasureTextWidth;
    this.#getFontRevision = options.getFontRevision ?? (() => checkedFonts.getRevision());
    this.#registerFont = options.registerFont ?? defaultRegisterFont;
    this.#getLineworkViewport = options.getLineworkViewport ?? (() => undefined);
  }

  /** 结构化样式按其真实上下文依赖缓存；nativeStyle 保持原引用。 */
  compile(style: StyleSpec | Parameters<NativeRefRegistry['requireStyle']>[0]): StyleLike {
    if (isNativeStyleRef(style)) return this.#nativeRefs.requireStyle(style);

    const spec = cloneCoreState(style);
    assertStructuredStyleSpec(spec);
    const needsFitPaths =
      spec.strokes?.some((stroke) => stroke.fitPatternOnce === true && stroke.lineDash !== undefined && stroke.lineDash.length > 0) ?? false;
    const needsDecorations = (spec.decorations?.length ?? 0) > 0;
    const dependencies = styleDependencies(spec, needsFitPaths, needsDecorations);
    registerLineworkFont(spec, this.#registerFont);
    const cache = new WeakMap<object, CacheEntry>();
    let sharedCache: CacheEntry | undefined;
    const compiled: StyleFunction = (feature, resolution) => {
      const viewRotation = dependencies.viewRotation ? finiteOr(this.#getViewRotation(), 0) : 0;
      const fontRevision = dependencies.font ? finiteOr(this.#getFontRevision(), 0) : 0;
      const viewport = dependencies.viewport ? this.#getLineworkViewport() : undefined;
      const context = compilationCacheContext(feature, resolution, viewRotation, fontRevision, viewport, dependencies);
      const key = feature as object;
      const previous = context.cacheable ? (dependencies.geometry ? cache.get(key) : sharedCache) : undefined;
      if (previous !== undefined && cacheMatches(previous, context, dependencies)) return previous.styles;

      const styles = this.#compileStructured(
        spec,
        context.geometry,
        context.resolution,
        context.viewRotation,
        needsFitPaths,
        needsDecorations,
        true,
        context.viewport
      );
      if (context.cacheable) {
        const entry: CacheEntry = {
          geometry: context.geometry,
          geometryRevision: context.geometryRevision,
          resolution: context.resolution,
          viewRotation: context.viewRotation,
          fontRevision: context.fontRevision,
          viewportKey: context.viewportKey,
          styles
        };
        if (dependencies.geometry) cache.set(key, entry);
        else sharedCache = entry;
      }
      return styles;
    };
    return compiled;
  }

  /**
   * 为动画展示替身建立稳定样式池。Decoration 容量来自规范完整 Geometry，
   * 当前帧 Geometry 只更新预分配 Point 与 image setter。
   */
  compilePresentation(style: StyleSpec, maximumFeature: FeatureLike): CompiledPresentationStyle {
    const spec = cloneCoreState(style);
    assertStructuredStyleSpec(spec);
    const needsFitPaths =
      spec.strokes?.some((stroke) => stroke.fitPatternOnce === true && stroke.lineDash !== undefined && stroke.lineDash.length > 0) ?? false;
    const needsDecorations = (spec.decorations?.length ?? 0) > 0;
    const dependencies = styleDependencies(spec, needsFitPaths, needsDecorations);
    registerLineworkFont(spec, this.#registerFont);
    let pool: PresentationStylePool | undefined;
    let destroyed = false;
    let revision = 0;
    const resolve = (feature: FeatureLike, resolution: number, pathReveal?: LayerRenderPathReveal): readonly Style[] => {
      if (destroyed) throw new ObjectDisposedError('Compiled presentation style has been destroyed');
      const normalizedResolution = dependencies.resolution ? safeResolution(resolution) : 1;
      const viewRotation = dependencies.viewRotation ? finiteOr(this.#getViewRotation(), 0) : 0;
      const fontRevision = dependencies.font ? finiteOr(this.#getFontRevision(), 0) : 0;
      const viewport = spec.linework !== undefined ? this.#getLineworkViewport() : undefined;
      const maximumGeometry = featureGeometry(maximumFeature);
      const maximumGeometryRevision = maximumGeometry === undefined ? undefined : callNumber(maximumGeometry, 'getRevision');
      if (
        pool === undefined ||
        pool.maximumGeometry !== maximumGeometry ||
        pool.maximumGeometryRevision !== maximumGeometryRevision ||
        pool.resolution !== normalizedResolution ||
        pool.viewRotation !== viewRotation ||
        pool.fontRevision !== fontRevision
      ) {
        if (pool !== undefined) releasePresentationPool(pool);
        pool = this.#createPresentationPool(
          spec,
          featureGeometry(feature),
          maximumGeometry,
          normalizedResolution,
          viewRotation,
          needsFitPaths,
          needsDecorations,
          maximumGeometryRevision,
          fontRevision,
          viewport
        );
        revision += 1;
      }
      updatePresentationPool(pool, spec, featureGeometry(feature), normalizedResolution, viewRotation, viewport, pathReveal, needsFitPaths);
      return pool.activeStyles;
    };
    return Object.freeze({
      get revision() {
        return revision;
      },
      resolve,
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        if (pool !== undefined) releasePresentationPool(pool);
        pool = undefined;
      }
    });
  }

  /** 把多层描边、填充、符号、文字和装饰组合为有序 Style 列表。 */
  #compileStructured(
    spec: StyleSpec,
    geometry: object | undefined,
    resolution: number,
    viewRotation: number,
    needsFitPaths: boolean,
    needsDecorations: boolean,
    includeLinework = true,
    viewport?: PathViewport
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
    if (includeLinework && spec.linework !== undefined) {
      styles.push(
        ...compileLineworkStyles(spec.linework, {
          geometry,
          resolution,
          viewRotation,
          zIndex: spec.zIndex,
          measureText: this.#measureTextWidth,
          viewport
        })
      );
    }
    return styles;
  }

  /** 按完整路径容量建立一次展示池。 */
  #createPresentationPool(
    spec: StyleSpec,
    geometry: object | undefined,
    maximumGeometry: object | undefined,
    resolution: number,
    viewRotation: number,
    needsFitPaths: boolean,
    needsDecorations: boolean,
    maximumGeometryRevision: number | undefined,
    fontRevision: number,
    viewport: PathViewport | undefined
  ): PresentationStylePool {
    const baseStyles = this.#compileStructured(spec, geometry, resolution, viewRotation, needsFitPaths, false, false);
    const inheritedColor = lastExplicitStrokeColor(spec.strokes);
    const maximumPaths = linePaths(maximumGeometry);
    const currentPaths = linePaths(geometry);
    const decorations = needsDecorations
      ? (spec.decorations ?? []).map((decoration) => {
          const capacity = Math.max(placeArrows(maximumPaths, decoration, resolution).length, placeArrows(currentPaths, decoration, resolution).length);
          const slots: DecorationStyleSlot[] = [];
          for (let index = 0; index < capacity; index += 1) slots.push(createDecorationStyleSlot(decoration, inheritedColor, viewRotation, spec.zIndex));
          return { decoration, slots };
        })
      : [];
    const linework =
      spec.linework === undefined
        ? undefined
        : createLineworkPresentationPool(spec.linework, maximumGeometry, geometry, {
            resolution,
            viewRotation,
            zIndex: spec.zIndex,
            measureText: this.#measureTextWidth,
            viewport
          });
    return {
      maximumGeometry,
      maximumGeometryRevision,
      resolution,
      viewRotation,
      fontRevision,
      baseStyles,
      decorations,
      linework,
      activeStyles: [...baseStyles, ...(linework?.resolve(geometry, resolution, viewRotation) ?? [])]
    };
  }
}

/**
 * 为结构化样式建立透明代理。代理保留 Geometry、尺寸和 declutter 信息，
 * OpenLayers 的独立命中指令仍按原样式范围工作。
 */
export function createTransparentStyleProxy(style: StyleLike): StyleFunction {
  const clones = new WeakMap<Style, Style>();
  return (feature, resolution) => resolveStyleLike(style, feature, resolution).map((item) => transparentClone(item, clones));
}

/** 将样式解析结果转换为稳定数组。 */
function resolveStyleLike(style: StyleLike, feature: FeatureLike, resolution: number): Style[] {
  const resolved = typeof style === 'function' ? style(feature, resolution) : style;
  if (resolved === undefined) return [];
  return Array.isArray(resolved) ? resolved : [resolved];
}

/** 克隆一次可见样式，并把所有视觉分支改为完全透明。 */
function transparentClone(source: Style, cache: WeakMap<Style, Style>): Style {
  const cached = cache.get(source);
  if (cached !== undefined) return cached;
  const clone = source.clone();
  clone.getFill()?.setColor([0, 0, 0, 0]);
  clone.getStroke()?.setColor([0, 0, 0, 0]);
  clone.getImage()?.setOpacity(0);
  const text = clone.getText();
  text?.getFill()?.setColor([0, 0, 0, 0]);
  text?.getStroke()?.setColor([0, 0, 0, 0]);
  text?.getBackgroundFill()?.setColor([0, 0, 0, 0]);
  text?.getBackgroundStroke()?.setColor([0, 0, 0, 0]);
  cache.set(source, clone);
  return clone;
}

/** 编译单层线样式。 */
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

/** 编译纯色或纹理填充。 */
function compileFill(spec: NonNullable<StyleSpec['fill']>, inheritedColor: Color | undefined, createCanvasContext: PatternCanvasFactory | undefined): Fill {
  if (spec.type === 'solid') return new Fill({ color: copyColor(spec.color) });
  return new Fill({
    color: createCanvasContext === undefined ? createPatternFill(spec, inheritedColor) : createPatternFill(spec, inheritedColor, createCanvasContext)
  });
}

/** 编译点符号样式。 */
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

/** 编译图片图标样式。 */
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

/** 编译文本及其前景、背景样式。 */
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

/** 编译放置在线上的单个箭头装饰。 */
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

/** 建立一个可重复更新的 Decoration slot。 */
function createDecorationStyleSlot(
  decoration: ArrowDecorationSpec,
  inheritedColor: Color | undefined,
  viewRotation: number,
  zIndex?: number
): DecorationStyleSlot {
  const style = compileArrow(decoration, { coordinate: [0, 0], angle: 0 }, inheritedColor, viewRotation, zIndex);
  const geometry = style.getGeometry();
  if (!(geometry instanceof Point)) throw new ObjectDisposedError('Decoration style did not retain its Point geometry');
  return { style, geometry };
}

/** 用当前有效路径更新预分配 Decoration slot，不创建新的 OL 对象。 */
function updateDecorationStyleSlot(slot: DecorationStyleSlot, decoration: ArrowDecorationSpec, arrow: ArrowPoint, viewRotation: number): void {
  slot.geometry.setCoordinates(arrow.coordinate as [number, number]);
  const image = slot.style.getImage();
  if (decoration.symbol === undefined) {
    image?.setRotation(Math.PI / 2 - arrow.angle);
    return;
  }
  if (!(image instanceof Icon)) return;
  const rotation = degreesToRadians(decoration.symbol.rotation ?? 0) - arrow.angle;
  const rotateWithView = decoration.symbol.rotateWithView ?? true;
  image.setRotation(rotation);
  image.setDisplacement(compensateOffset(decoration.symbol.displacement, rotation + (rotateWithView ? viewRotation : 0)));
}

/** 更新本帧生效 Style；容量只在规范拓扑失配时补齐。 */
function updatePresentationPool(
  pool: PresentationStylePool,
  spec: StyleSpec,
  geometry: object | undefined,
  resolution: number,
  viewRotation: number,
  viewport: PathViewport | undefined,
  pathReveal: LayerRenderPathReveal | undefined,
  needsFitPaths: boolean
): void {
  const extracted = needsFitPaths || pool.decorations.length > 0 ? extractGeometryPaths(geometry) : undefined;
  const paths = extracted?.paths ?? [];
  if (needsFitPaths) updateFitPatternStyles(pool.baseStyles, spec.strokes, paths, resolution);

  const active = pool.activeStyles;
  active.length = pool.baseStyles.length;
  for (let index = 0; index < pool.baseStyles.length; index += 1) active[index] = pool.baseStyles[index];
  const inheritedColor = lastExplicitStrokeColor(spec.strokes);
  if (pool.linework !== undefined) active.push(...pool.linework.resolve(geometry, resolution, viewRotation, viewport, pathReveal));
  for (const decorationPool of pool.decorations) {
    const arrows = extracted?.type === 'LineString' || extracted?.type === 'MultiLineString' ? placeArrows(paths, decorationPool.decoration, resolution) : [];
    while (decorationPool.slots.length < arrows.length) {
      decorationPool.slots.push(createDecorationStyleSlot(decorationPool.decoration, inheritedColor, viewRotation, spec.zIndex));
    }
    for (let index = 0; index < arrows.length; index += 1) {
      const slot = decorationPool.slots[index];
      updateDecorationStyleSlot(slot, decorationPool.decoration, arrows[index], viewRotation);
      active.push(slot.style);
    }
  }
}

/** fitPatternOnce 只更新现有 Stroke，不重建 Style。 */
function updateFitPatternStyles(
  styles: readonly Style[],
  strokes: readonly StrokeSpec[] | undefined,
  paths: readonly Coordinate2[][],
  resolution: number
): void {
  if (strokes === undefined) return;
  for (let index = 0; index < strokes.length; index += 1) {
    const strokeSpec = strokes[index];
    if (strokeSpec.fitPatternOnce !== true) continue;
    styles[index]?.getStroke()?.setLineDash(fitDashPattern(strokeSpec.lineDash, paths, resolution) ?? null);
  }
}

/** 从完整 Geometry 取得可放置 Decoration 的线性路径。 */
function linePaths(geometry: object | undefined): Coordinate2[][] {
  const extracted = extractGeometryPaths(geometry);
  return extracted.type === 'LineString' || extracted.type === 'MultiLineString' ? extracted.paths : [];
}

/** 显式断开池对 OL 对象的引用。 */
function releasePresentationPool(pool: PresentationStylePool): void {
  pool.activeStyles.length = 0;
  pool.baseStyles.length = 0;
  pool.linework?.destroy();
  for (const decoration of pool.decorations) decoration.slots.length = 0;
  pool.decorations.length = 0;
}

/** 根据文本分项配置组合 CSS 字体字符串。 */
function composeFont(spec: TextSpec): string | undefined {
  const split = spec.fontFamily !== undefined || spec.fontSize !== undefined || spec.fontWeight !== undefined || spec.fontStyle !== undefined;
  if (!split) return spec.font;
  const fontStyle = spec.fontStyle ?? 'normal';
  const fontWeight = spec.fontWeight ?? 'normal';
  const fontSize = typeof spec.fontSize === 'number' ? `${spec.fontSize}px` : (spec.fontSize ?? '10px');
  const fontFamily = spec.fontFamily ?? 'sans-serif';
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

/** 按视图旋转补偿屏幕方向的偏移。 */
function compensateOffset(offset: readonly [number, number] | undefined, rotation: number): [number, number] {
  const x = offset?.[0] ?? 0;
  const y = offset?.[1] ?? 0;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return [x * cosine - y * sine, x * sine + y * cosine];
}

/** 调整虚线间隔，使整套图案只铺满路径一次。 */
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

/** 按装饰配置计算路径上的箭头位置。 */
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

/** 路径中一条有效线段的长度和方向。 */
interface PathSegment {
  readonly start: Coordinate2;
  readonly end: Coordinate2;
  readonly length: number;
  readonly angle: number;
}

/** 将坐标路径拆成有效线段。 */
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

/** 在累计路径距离处取样坐标和方向。 */
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

/** 从 OpenLayers Geometry 提取的线性路径。 */
interface ExtractedGeometryPaths {
  readonly type: string | undefined;
  readonly paths: Coordinate2[][];
}

/** 从常规或扁平 Geometry 中提取线性路径。 */
function extractGeometryPaths(geometry: object | undefined): ExtractedGeometryPaths {
  if (geometry === undefined) return { type: undefined, paths: [] };
  const type = callString(geometry, 'getType');
  const coordinates = callUnknown(geometry, 'getCoordinates');
  return {
    type,
    paths: coordinates === undefined ? flatCoordinatePaths(geometry, type) : coordinatePaths(type, coordinates)
  };
}

/** 按几何类型整理嵌套坐标路径。 */
function coordinatePaths(type: string | undefined, coordinates: unknown): Coordinate2[][] {
  if (type === 'LineString' || type === 'LinearRing') return [coordinateArray(coordinates)];
  if (type === 'MultiLineString' || type === 'Polygon') return nestedCoordinateArrays(coordinates);
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) return coordinates.flatMap(nestedCoordinateArrays);
  return [];
}

/** 从 OpenLayers 扁平坐标字段中整理路径。 */
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

/** 将一段扁平坐标转换为二维坐标列表。 */
function flatToCoordinates(flat: readonly unknown[], start: number, end: number, stride: number): Coordinate2[] {
  const result: Coordinate2[] = [];
  for (let index = start; index + 1 < end; index += stride) {
    const x = flat[index];
    const y = flat[index + 1];
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) result.push([x, y]);
  }
  return result;
}

/** 校验并读取一维坐标数组。 */
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

/** 校验并读取多条坐标路径。 */
function nestedCoordinateArrays(value: unknown): Coordinate2[][] {
  if (!Array.isArray(value)) return [];
  return value.map(coordinateArray).filter((path) => path.length > 0);
}

/** Feature 几何访问器异常时按无几何处理，不中断样式渲染。 */
function featureGeometry(feature: FeatureLike): object | undefined {
  const geometry = callUnknown(feature, 'getGeometry');
  return geometry !== null && typeof geometry === 'object' ? geometry : undefined;
}

/** 分析样式编译真正需要监听的渲染上下文。 */
function styleDependencies(spec: StyleSpec, needsFitPaths: boolean, needsDecorations: boolean): StyleDependencies {
  const linework = spec.linework === undefined ? undefined : lineworkDependencies(spec.linework);
  const resolution = needsFitPaths || linework?.resolution === true || (spec.decorations?.some((decoration) => decoration.placement === 'repeat') ?? false);
  const viewRotation =
    linework?.viewRotation === true ||
    iconOffsetDependsOnView(spec.symbol) ||
    textOffsetDependsOnView(spec.text) ||
    (spec.decorations?.some(
      (decoration) => decoration.symbol !== undefined && decoration.symbol.rotateWithView !== false && hasOffset(decoration.symbol.displacement)
    ) ??
      false);
  return {
    geometry: needsFitPaths || needsDecorations || linework?.geometry === true,
    resolution,
    viewRotation,
    font: spec.linework?.inlineText !== undefined,
    viewport: linework?.viewport === true
  };
}

/** 判断图片的屏幕偏移是否需要跟随视图旋转重新计算。 */
function iconOffsetDependsOnView(symbol: StyleSpec['symbol']): boolean {
  return symbol?.type === 'icon' && symbol.rotateWithView === true && hasOffset(symbol.displacement);
}

/** 判断文字的屏幕偏移是否需要跟随视图旋转重新计算。 */
function textOffsetDependsOnView(text: TextSpec | undefined): boolean {
  return text?.rotateWithView === true && ((text.offsetX ?? 0) !== 0 || (text.offsetY ?? 0) !== 0);
}

/** 判断二维偏移是否会改变最终绘制位置。 */
function hasOffset(offset: readonly [number, number] | undefined): boolean {
  return offset !== undefined && (offset[0] !== 0 || offset[1] !== 0);
}

/** 生成样式函数本次调用的缓存上下文。 */
function compilationCacheContext(
  feature: FeatureLike,
  resolution: number,
  viewRotation: number,
  fontRevision: number,
  viewport: PathViewport | undefined,
  dependencies: StyleDependencies
): CompilationCacheContext {
  const normalizedResolution = dependencies.resolution ? safeResolution(resolution) : 1;
  const viewportKey = dependencies.viewport ? lineworkViewportKey(viewport) : '';
  if (!dependencies.geometry) {
    return {
      cacheable: true,
      geometry: undefined,
      geometryRevision: undefined,
      resolution: normalizedResolution,
      viewRotation,
      fontRevision,
      viewport,
      viewportKey
    };
  }

  const geometry = featureGeometry(feature);
  const geometryRevision = geometry === undefined ? undefined : callNumber(geometry, 'getRevision');
  return {
    cacheable: geometryRevision !== undefined,
    geometry,
    geometryRevision,
    resolution: normalizedResolution,
    viewRotation,
    fontRevision,
    viewport,
    viewportKey
  };
}

/** 判断最近一次编译结果是否仍适用于当前渲染上下文。 */
function cacheMatches(entry: CacheEntry, context: CompilationCacheContext, dependencies: StyleDependencies): boolean {
  if (dependencies.geometry && (entry.geometry !== context.geometry || entry.geometryRevision !== context.geometryRevision)) return false;
  if (dependencies.resolution && entry.resolution !== context.resolution) return false;
  if (dependencies.viewRotation && entry.viewRotation !== context.viewRotation) return false;
  if (dependencies.font && entry.fontRevision !== context.fontRevision) return false;
  return !dependencies.viewport || entry.viewportKey === context.viewportKey;
}

function lineworkViewportKey(viewport: PathViewport | undefined): string {
  if (viewport === undefined) return '';
  return `${viewport.extent.join(',')}|${String(viewport.worldWidth ?? '')}|${String(viewport.renderBufferPx ?? '')}`;
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

/** 其他样式从最后一层显式线条颜色继承默认值。 */
function lastExplicitStrokeColor(strokes: readonly StrokeSpec[] | undefined): Color | undefined {
  if (strokes === undefined) return undefined;
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    if (strokes[index].color !== undefined) return strokes[index].color;
  }
  return undefined;
}

/** 复制颜色值，避免 OpenLayers 修改外部数组。 */
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

/** 把无效分辨率归一化为样式计算使用的安全值。 */
function safeResolution(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 浏览器中使用 OL 同源字体度量；无 Canvas 的测试环境交给 linework 的确定性回退。 */
function defaultMeasureTextWidth(font: string, text: string): number {
  try {
    return measureCanvasTextWidth(font, text);
  } catch {
    return Number.NaN;
  }
}

/** 让 OL CompositeMapRenderer 在字体可用时调用 map.redrawText。 */
function defaultRegisterFont(font: string): void {
  if (typeof document === 'undefined' || document.fonts === undefined) return;
  void registerCanvasFont(font).catch(() => undefined);
}

function registerLineworkFont(spec: StyleSpec, register: (font: string) => void): void {
  const text = spec.linework?.inlineText;
  if (text === undefined) return;
  register(`${text.fontStyle} ${text.fontWeight} ${text.fontSize}px ${text.fontFamily}`);
}
