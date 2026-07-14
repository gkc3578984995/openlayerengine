import Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import Point from 'ol/geom/Point.js';
import type BaseLayer from 'ol/layer/Base.js';
import type Layer from 'ol/layer/Layer.js';
import type Source from 'ol/source/Source.js';
import type ImageStyle from 'ol/style/Image.js';
import Style from 'ol/style/Style.js';
import type Stroke from 'ol/style/Stroke.js';
import type { Pixel } from '../../core/common/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type { LayerManager } from '../../core/layer/LayerManager.js';
import type { HitTestPort } from '../../core/ports/HitTestPort.js';
import { isNativeStyleRef } from '../../core/style/types.js';
import type { FeatureBinding } from './FeatureBinding.js';
import type { LayerAdapter } from './LayerAdapter.js';

export interface HitTestAdapterOptions {
  readonly hitTolerance?: number;
}

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
    const styles = evaluatedStyles(feature, resolutionOf(this.#map));
    if (styles.length === 0) return undefined;

    if (geometry instanceof Point) {
      const pixel = pixelFor(this.#map, geometry.getCoordinates());
      if (pixel === undefined) return undefined;
      const renderedExtents = styles.flatMap((style) => {
        const image = style.getImage();
        const imageBox = image === null ? undefined : imageExtent(pixel, image, rotationOf(this.#map));
        const text = style.getText();
        const textSize = text === null || text.getText() === undefined || String(text.getText()).length === 0 ? undefined : textFootprint(style);
        const textBox =
          textSize === undefined ? undefined : ([pixel[0] - textSize[0], pixel[1] - textSize[1], pixel[0] + textSize[0], pixel[1] + textSize[1]] as const);
        return [imageBox, textBox].filter((extent): extent is readonly [number, number, number, number] => extent !== undefined);
      });
      if (renderedExtents.length === 0) return undefined;
      return unionExtents(renderedExtents);
    }

    if (!styles.some(isRenderableStyle)) return undefined;

    const extent = geometry.getExtent();
    if (extent.length < 4 || extent.some((value) => !Number.isFinite(value))) return undefined;
    const pixels = [
      pixelFor(this.#map, [extent[0], extent[1]]),
      pixelFor(this.#map, [extent[0], extent[3]]),
      pixelFor(this.#map, [extent[2], extent[1]]),
      pixelFor(this.#map, [extent[2], extent[3]])
    ];
    if (pixels.some((pixel) => pixel === undefined)) return undefined;
    const safePixels = pixels as [Pixel, Pixel, Pixel, Pixel];
    const footprint = maxStyleFootprint(styles, rotationOf(this.#map));
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

function evaluatedStyles(feature: Feature, resolution: number): Style[] {
  const styleFunction = feature.getStyleFunction();
  if (styleFunction === undefined) return [];
  try {
    const result = styleFunction(feature, resolution);
    if (result === undefined) return [];
    if (result instanceof Style) return [result];
    return result.filter((style): style is Style => style instanceof Style);
  } catch {
    return [];
  }
}

function imageExtent(pixel: Pixel, image: ImageStyle, viewRotation: number): readonly [number, number, number, number] | undefined {
  const size = image.getSize();
  const anchor = image.getAnchor();
  const scale = image.getScaleArray();
  if (size === null || anchor === null || size.length < 2 || anchor.length < 2 || scale.length < 2) return undefined;
  const values = [size[0], size[1], anchor[0], anchor[1], scale[0], scale[1], image.getRotation(), viewRotation];
  if (values.some((value) => !Number.isFinite(value)) || size[0] <= 0 || size[1] <= 0 || scale[0] === 0 || scale[1] === 0) return undefined;

  const rotation = image.getRotation() + (image.getRotateWithView() ? viewRotation : 0);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const xs = [-anchor[0] * scale[0], (size[0] - anchor[0]) * scale[0]];
  const ys = [-anchor[1] * scale[1], (size[1] - anchor[1]) * scale[1]];
  const corners = xs.flatMap((x) => ys.map((y) => [pixel[0] + x * cosine - y * sine, pixel[1] + x * sine + y * cosine] as const));
  return Object.freeze([
    Math.min(...corners.map(([x]) => x)),
    Math.min(...corners.map(([, y]) => y)),
    Math.max(...corners.map(([x]) => x)),
    Math.max(...corners.map(([, y]) => y))
  ]);
}

function maxStyleFootprint(styles: readonly Style[], viewRotation: number): readonly [number, number] {
  let x = 0;
  let y = 0;
  for (const style of styles) {
    const stroke = style.getStroke();
    if (stroke !== null) x = y = Math.max(x, y, strokeFootprint(stroke));

    const image = style.getImage();
    if (image !== null) {
      const imageBox = imageExtent([0, 0], image, viewRotation);
      if (imageBox !== undefined) {
        x = Math.max(x, Math.abs(imageBox[0]), Math.abs(imageBox[2]));
        y = Math.max(y, Math.abs(imageBox[1]), Math.abs(imageBox[3]));
      }
    }

    const text = textFootprint(style);
    x = Math.max(x, text[0]);
    y = Math.max(y, text[1]);
  }
  return [x, y];
}

function textFootprint(style: Style): readonly [number, number] {
  const text = style.getText();
  if (text === null || text.getText() === undefined || String(text.getText()).length === 0) return [0, 0];
  const fontSize = parseFontSize(text.getFont());
  const scale = text.getScaleArray();
  if (![...scale, fontSize].every(Number.isFinite)) return [0, 0];
  const padding = text.getPadding() ?? [0, 0, 0, 0];
  const paddingMax = Math.max(0, ...padding.filter(Number.isFinite).map(Math.abs));
  const textStroke = text.getStroke();
  const background = text.getBackgroundStroke();
  const stroke = textStroke === null ? 0 : strokeFootprint(textStroke);
  const backgroundStroke = background === null ? 0 : strokeFootprint(background);
  const lines = String(text.getText()).split(/\r?\n/u);
  const width = Math.max(...lines.map((line) => line.length), 1) * fontSize * 0.75 * Math.abs(scale[0]);
  const height = Math.max(lines.length, 1) * fontSize * 1.5 * Math.abs(scale[1]);
  const radius = Math.hypot(width, height) + paddingMax + stroke + backgroundStroke;
  return [Math.abs(text.getOffsetX()) + radius, Math.abs(text.getOffsetY()) + radius];
}

function strokeFootprint(stroke: Stroke): number {
  const width = stroke.getWidth() ?? 1;
  if (!Number.isFinite(width)) return 0;
  let multiplier = stroke.getLineCap() === 'square' ? Math.SQRT2 : 1;
  if (stroke.getLineJoin() === 'miter') {
    const miterLimit = stroke.getMiterLimit() ?? 10;
    if (Number.isFinite(miterLimit)) multiplier = Math.max(multiplier, 1, Math.abs(miterLimit));
  }
  return (Math.abs(width) / 2) * multiplier;
}

function isRenderableStyle(style: Style): boolean {
  return style.getStroke() !== null || style.getFill() !== null || style.getImage() !== null || (style.getText()?.getText() ?? '') !== '';
}

function parseFontSize(font: string | undefined): number {
  const match = font?.match(/(?:^|\s)(\d+(?:\.\d+)?)px\b/u);
  return match === undefined || match === null ? 10 : Number(match[1]);
}

function unionExtents(extents: readonly (readonly [number, number, number, number])[]): readonly [number, number, number, number] {
  return Object.freeze([
    Math.min(...extents.map(([minX]) => minX)),
    Math.min(...extents.map(([, minY]) => minY)),
    Math.max(...extents.map(([, , maxX]) => maxX)),
    Math.max(...extents.map(([, , , maxY]) => maxY))
  ]);
}

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

function rotationOf(map: Map): number {
  try {
    const rotation = map.getView().getRotation();
    return Number.isFinite(rotation) ? rotation : 0;
  } catch {
    return 0;
  }
}

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
