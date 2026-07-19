import Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import Point from 'ol/geom/Point.js';
import type BaseLayer from 'ol/layer/Base.js';
import type Layer from 'ol/layer/Layer.js';
import type Source from 'ol/source/Source.js';
import type { Pixel } from '../../core/common/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type { LayerManager } from '../../core/layer/LayerManager.js';
import type { HitTestPort } from '../../core/ports/HitTestPort.js';
import { isNativeStyleRef, type StyleSpec } from '../../core/style/types.js';
import { styleVisualOutsetPx } from '../../core/style/visualOutset.js';
import type { FeatureBinding } from './FeatureBinding.js';
import type { LayerAdapter } from './LayerAdapter.js';
import {
  compiledImageVisualExtentPx,
  compiledStylesGeometryExtent,
  compiledStylesVisualFootprintPx,
  compiledTextVisualFootprintPx,
  isRenderableCompiledStyle,
  resolveCompiledStyles
} from './style/visualFootprint.js';

/** 像素命中适配器的可选配置。 */
export interface HitTestAdapterOptions {
  /** 命中容差，单位为 CSS 像素，默认 `0`。 */
  readonly hitTolerance?: number;
}

/** 通过 OpenLayers 完成 Element 命中和屏幕范围估算。 */
export class HitTestAdapter implements HitTestPort {
  readonly #map: Map;
  readonly #store: ElementStore;
  readonly #manager: LayerManager;
  readonly #layers: LayerAdapter;
  readonly #binding: FeatureBinding;
  readonly #hitTolerance: number;

  constructor(map: Map, store: ElementStore, manager: LayerManager, layers: LayerAdapter, binding: FeatureBinding, options: HitTestAdapterOptions = {}) {
    this.#map = map;
    this.#store = store;
    this.#manager = manager;
    this.#layers = layers;
    this.#binding = binding;
    const hitTolerance = options.hitTolerance ?? 0;
    if (!Number.isFinite(hitTolerance) || hitTolerance < 0) throw new InvalidArgumentError('hitTolerance must be a non-negative finite CSS-pixel value');
    this.#hitTolerance = hitTolerance;
  }

  /** 返回像素处最先命中的可见 Element。 */
  atPixel(pixel: Pixel): { readonly elementId: string; readonly layerId: string } | undefined {
    assertPixel(pixel);
    return this.#map.forEachFeatureAtPixel(
      [...pixel],
      (feature, actualLayer) => {
        if (!(feature instanceof Feature)) return undefined;
        const layerId = this.#layers.vectorLayerIdFor(actualLayer as BaseLayer);
        if (layerId === undefined) return undefined;
        const identity = this.#binding.resolveFeature(feature);
        if (identity === undefined || !identity.visible || identity.layerId !== layerId) return undefined;
        const layer = this.#manager.get(layerId);
        if (layer?.kind !== 'vector' || !layer.visible || layer.opacity === 0) return undefined;
        return Object.freeze({ elementId: identity.elementId, layerId });
      },
      {
        layerFilter: (layer) => this.#isHittableVectorLayer(layer),
        hitTolerance: this.#hitTolerance,
        checkWrapped: true
      }
    );
  }

  /** 根据实际 Geometry 与可见样式估算 Element 的屏幕范围。 */
  getScreenExtent(elementId: string): readonly [number, number, number, number] | undefined {
    const state = this.#store.get(elementId);
    if (state === undefined || !state.visible || isNativeStyleRef(state.style)) return undefined;
    const layer = this.#manager.get(state.layerId);
    if (layer?.kind !== 'vector' || !layer.visible || layer.opacity === 0) return undefined;

    let feature: Feature;
    try {
      feature = this.#binding.requireFeature(elementId);
    } catch {
      return undefined;
    }
    const geometry = feature.getGeometry();
    if (geometry === undefined) return undefined;
    const styles = resolveCompiledStyles(feature, resolutionOf(this.#map));
    if (styles.length === 0) return undefined;

    if (geometry instanceof Point) {
      const pixel = pixelFor(this.#map, geometry.getCoordinates());
      if (pixel === undefined) return undefined;
      const renderedExtents = styles.flatMap((style) => {
        const image = style.getImage();
        const imageBox = image === null ? undefined : compiledImageVisualExtentPx(pixel, image, rotationOf(this.#map));
        const text = style.getText();
        const textSize =
          text === null || text.getText() === undefined || String(text.getText()).length === 0 ? undefined : compiledTextVisualFootprintPx(style);
        const textBox =
          textSize === undefined ? undefined : ([pixel[0] - textSize[0], pixel[1] - textSize[1], pixel[0] + textSize[0], pixel[1] + textSize[1]] as const);
        return [imageBox, textBox].filter((extent): extent is readonly [number, number, number, number] => extent !== undefined);
      });
      if (renderedExtents.length === 0) return undefined;
      return unionExtents(renderedExtents);
    }

    if (!styles.some(isRenderableCompiledStyle)) return undefined;

    const declaredOutset = lineworkVisualOutsetPx(state.style);
    const canonicalExtent = geometry.getExtent();
    if (canonicalExtent.length < 4 || canonicalExtent.some((value) => !Number.isFinite(value))) return undefined;
    const derivedExtent = declaredOutset === undefined ? compiledStylesGeometryExtent(styles, feature) : undefined;
    const extent =
      derivedExtent === undefined
        ? canonicalExtent
        : [
            Math.min(canonicalExtent[0], derivedExtent[0]),
            Math.min(canonicalExtent[1], derivedExtent[1]),
            Math.max(canonicalExtent[2], derivedExtent[2]),
            Math.max(canonicalExtent[3], derivedExtent[3])
          ];
    const pixels = [
      pixelFor(this.#map, [extent[0], extent[1]]),
      pixelFor(this.#map, [extent[0], extent[3]]),
      pixelFor(this.#map, [extent[2], extent[1]]),
      pixelFor(this.#map, [extent[2], extent[3]])
    ];
    if (pixels.some((pixel) => pixel === undefined)) return undefined;
    const safePixels = pixels as [Pixel, Pixel, Pixel, Pixel];
    const compiledFootprint = compiledStylesVisualFootprintPx(styles, rotationOf(this.#map));
    const footprint =
      declaredOutset === undefined
        ? compiledFootprint
        : ([Math.max(compiledFootprint[0], declaredOutset), Math.max(compiledFootprint[1], declaredOutset)] as const);
    return Object.freeze([
      Math.min(...safePixels.map(([x]) => x)) - footprint[0],
      Math.min(...safePixels.map(([, y]) => y)) - footprint[1],
      Math.max(...safePixels.map(([x]) => x)) + footprint[0],
      Math.max(...safePixels.map(([, y]) => y)) + footprint[1]
    ]);
  }

  #isHittableVectorLayer(layer: Layer<Source>): boolean {
    if (!this.#layers.isRegisteredVectorLayer(layer)) return false;
    const id = this.#layers.vectorLayerIdFor(layer);
    const state = id === undefined ? undefined : this.#manager.get(id);
    return state?.kind === 'vector' && state.visible && state.opacity > 0;
  }
}

/** 高级路径线饰使用统一的保守视觉外扩；其他样式保留已编译的方向性范围。 */
function lineworkVisualOutsetPx(style: StyleSpec): number | undefined {
  return 'linework' in style && style.linework !== undefined ? styleVisualOutsetPx(style) : undefined;
}

function unionExtents(extents: readonly (readonly [number, number, number, number])[]): readonly [number, number, number, number] {
  return Object.freeze([
    Math.min(...extents.map(([minX]) => minX)),
    Math.min(...extents.map(([, minY]) => minY)),
    Math.max(...extents.map(([, , maxX]) => maxX)),
    Math.max(...extents.map(([, , , maxY]) => maxY))
  ]);
}

/** 地图坐标转换失败或返回非法像素时保留 `undefined`。 */
function pixelFor(map: Map, coordinate: readonly number[]): Pixel | undefined {
  let pixel: unknown;
  try {
    pixel = map.getPixelFromCoordinate([...coordinate]);
  } catch {
    return undefined;
  }
  if (!Array.isArray(pixel) || pixel.length < 2 || !Number.isFinite(pixel[0]) || !Number.isFinite(pixel[1])) return undefined;
  return [pixel[0], pixel[1]];
}

/** View 不可用时使用零旋转。 */
function rotationOf(map: Map): number {
  try {
    const rotation = map.getView().getRotation();
    return Number.isFinite(rotation) ? rotation : 0;
  } catch {
    return 0;
  }
}

/** View 不可用或分辨率非法时使用 `1`。 */
function resolutionOf(map: Map): number {
  try {
    const resolution = map.getView().getResolution();
    return resolution !== undefined && Number.isFinite(resolution) && resolution > 0 ? resolution : 1;
  } catch {
    return 1;
  }
}

function assertPixel(pixel: Pixel): void {
  if (!Array.isArray(pixel) || pixel.length !== 2 || pixel.some((value) => !Number.isFinite(value))) {
    throw new InvalidArgumentError('Pixel must contain two finite CSS-pixel numbers');
  }
}
