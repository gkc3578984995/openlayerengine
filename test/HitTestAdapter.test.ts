import Feature, { type FeatureLike } from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import RenderFeature from 'ol/render/Feature.js';
import VectorSource from 'ol/source/Vector.js';
import NativeStyle from 'ol/style/Style.js';
import type Icon from 'ol/style/Icon.js';
import type Style from 'ol/style/Style.js';
import { describe, expect, it, vi } from 'vitest';
import { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../src/adapters/openlayers/GeometryCodec.js';
import { HitTestAdapter } from '../src/adapters/openlayers/HitTestAdapter.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { isNativeStyleRef } from '../src/core/style/types.js';
import { ElementServiceImpl } from '../src/facade/ElementService.js';
import { LayerServiceImpl } from '../src/facade/LayerService.js';
import { assertStructuredStyleSpec } from '../src/services/style/StyleService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createTestMap } from './fixtures/Task8Map.js';

function setup() {
  const map = createTestMap();
  const refs = new NativeRefRegistry();
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  const store = new ElementStore(shapes, {
    validateElement(state) {
      manager.requireVector(state.layerId);
      if (isNativeStyleRef(state.style)) void refs.requireStyle(state.style);
      else assertStructuredStyleSpec(state.style);
    }
  });
  const adapter = new LayerAdapter(map, refs);
  const manager = new LayerManager(store, adapter);
  const layers = new LayerServiceImpl(manager, adapter, refs);
  layers.add({ kind: 'vector', id: 'second' });
  const compiler = new StyleCompiler(refs, { getViewRotation: () => 0.25 });
  const binding = new FeatureBinding(store, adapter, new GeometryCodec(shapes), compiler);
  const hitTest = new HitTestAdapter(map, store, manager, adapter, binding, { hitTolerance: 7 });
  const elements = new ElementServiceImpl(store, manager, binding, layers, refs, hitTest);
  return { adapter, binding, elements, hitTest, layers, manager, map, store };
}

function expectedIconExtent(pixel: readonly [number, number], image: Icon, viewRotation: number): readonly [number, number, number, number] {
  const size = image.getSize();
  const anchor = image.getAnchor();
  if (size === null || anchor === null) throw new Error('Expected loaded icon metrics');
  const [scaleX, scaleY] = image.getScaleArray();
  const rotation = image.getRotation() + (image.getRotateWithView() ? viewRotation : 0);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const xs = [-anchor[0] * scaleX, (size[0] - anchor[0]) * scaleX];
  const ys = [-anchor[1] * scaleY, (size[1] - anchor[1]) * scaleY];
  const corners = xs.flatMap((x) => ys.map((y) => [pixel[0] + x * cosine - y * sine, pixel[1] + x * sine + y * cosine] as const));
  return [
    Math.min(...corners.map(([x]) => x)),
    Math.min(...corners.map(([, y]) => y)),
    Math.max(...corners.map(([x]) => x)),
    Math.max(...corners.map(([, y]) => y))
  ];
}

describe('HitTestAdapter', () => {
  coversCapabilities('earth-feature-hit-at-pixel', 'public-ol-native-escape');

  it('returns the first valid bound hit and configures public OL hit detection exactly', () => {
    const { adapter, binding, elements, hitTest, map } = setup();
    const element = elements.add({ geometry: { type: 'point', controlPoints: [[1, 2]] } });
    const validFeature = element.olFeature;
    const external = new Feature<Geometry>(new Point([1, 2]));
    external.setId(element.id);
    const render = new RenderFeature('Point', [1, 2], [], 2, {}, 'render');
    const defaultLayer = adapter.requireLayer('default');
    const secondLayer = adapter.requireLayer('second');
    const unregisteredLayer = new VectorLayer({ source: new VectorSource() });
    vi.spyOn(map, 'forEachFeatureAtPixel').mockImplementation(((pixel, callback, options) => {
      expect(pixel).toEqual([10, 20]);
      expect(options).toMatchObject({ hitTolerance: 7, checkWrapped: true });
      expect(options?.layerFilter?.(defaultLayer as never)).toBe(true);
      expect(options?.layerFilter?.(secondLayer as never)).toBe(true);
      expect(options?.layerFilter?.(unregisteredLayer)).toBe(false);
      expect(callback(validFeature, secondLayer as never, validFeature.getGeometry() as never)).toBeUndefined();
      const candidates: Array<readonly [FeatureLike, typeof defaultLayer]> = [
        [render, defaultLayer],
        [external, defaultLayer],
        [validFeature, secondLayer],
        [validFeature, defaultLayer]
      ];
      for (const [feature, layer] of candidates) {
        const result = callback(feature, layer as never, feature.getGeometry() as never);
        if (result) return result;
      }
      return undefined;
    }) as typeof map.forEachFeatureAtPixel);

    expect(hitTest.atPixel([10, 20])).toEqual({ elementId: element.id, layerId: 'default' });
    expect(binding.elementIdFor(external)).toBeUndefined();
  });

  it('filters external layers and ignores hidden elements/layers', () => {
    const { adapter, elements, hitTest, layers, map, store } = setup();
    const element = elements.add({ geometry: { type: 'point', controlPoints: [[1, 2]] } });
    const layer = adapter.requireLayer('default');
    vi.spyOn(map, 'forEachFeatureAtPixel').mockImplementation(((pixel, callback, options) => {
      void pixel;
      if (options?.layerFilter?.(layer as never) !== true) return undefined;
      return callback(element.olFeature, layer as never, element.olFeature.getGeometry() as never);
    }) as typeof map.forEachFeatureAtPixel);

    store.hide({ id: element.id });
    expect(hitTest.atPixel([0, 0])).toBeUndefined();
    expect(hitTest.getScreenExtent(element.id)).toBeUndefined();
    store.show({ id: element.id });
    layers.get('default')?.hide();
    expect(hitTest.atPixel([0, 0])).toBeUndefined();
    expect(hitTest.getScreenExtent(element.id)).toBeUndefined();
    layers.get('default')?.show();
    layers.get('default')?.update({ opacity: 0 });
    expect(hitTest.atPixel([0, 0])).toBeUndefined();
    expect(hitTest.getScreenExtent(element.id)).toBeUndefined();
  });

  it('computes extents for the default point symbol and a structured text-only point', () => {
    const { elements, hitTest, map } = setup();
    const point = elements.add({ geometry: { type: 'point', controlPoints: [[1, 2]] } });
    const text = elements.add({
      geometry: { type: 'point', controlPoints: [[3, 4]] },
      style: {
        text: {
          text: 'first\nsecond',
          fontSize: 18,
          rotation: 30,
          fill: { type: 'solid', color: '#fff' },
          backgroundFill: { type: 'solid', color: '#000' },
          backgroundStroke: { color: '#f00', width: 2 },
          padding: [2, 4, 2, 4],
          offsetX: 6,
          offsetY: -3
        }
      }
    });
    vi.spyOn(map, 'getPixelFromCoordinate').mockImplementation(((coordinate: number[]) => [coordinate[0] * 10, coordinate[1] * 10]) as never);

    const pointExtent = hitTest.getScreenExtent(point.id);
    const textExtent = hitTest.getScreenExtent(text.id);
    expect(pointExtent).toBeDefined();
    expect(pointExtent?.every(Number.isFinite)).toBe(true);
    expect(pointExtent?.[0]).toBeLessThan(10);
    expect(pointExtent?.[2]).toBeGreaterThan(10);
    expect(textExtent).toBeDefined();
    expect(textExtent?.[0]).toBeLessThan(30);
    expect(textExtent?.[1]).toBeLessThan(40);
    expect(textExtent?.[2]).toBeGreaterThan(30);
    expect(textExtent?.[3]).toBeGreaterThan(40);
  });

  it('computes an unclamped CSS-pixel icon extent from public icon metrics', () => {
    const { elements, hitTest, map } = setup();
    const element = elements.add({
      geometry: { type: 'point', controlPoints: [[1, 2]] },
      style: {
        symbol: {
          type: 'icon',
          src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
          size: [20, 10],
          anchor: [0.5, 0.5],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          displacement: [4, 2],
          scale: [2, -1],
          rotation: 30,
          rotateWithView: true
        }
      }
    });
    vi.spyOn(map, 'getPixelFromCoordinate').mockReturnValue([5, 6]);
    const styleFunction = element.olFeature.getStyleFunction();
    const styles = styleFunction?.(element.olFeature, 1) as Style[];
    const image = styles[0].getImage() as Icon;

    const extent = hitTest.getScreenExtent(element.id);
    const expected = expectedIconExtent([5, 6], image, 0.25);
    expect(extent?.map((value) => Number(value.toFixed(8)))).toEqual(expected.map((value) => Number(value.toFixed(8))));
    expect(extent?.[0]).toBeLessThan(0);

    Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: 4 });
    try {
      expect(hitTest.getScreenExtent(element.id)?.map((value) => Number(value.toFixed(8)))).toEqual(expected.map((value) => Number(value.toFixed(8))));
    } finally {
      Reflect.deleteProperty(globalThis, 'devicePixelRatio');
    }
  });

  it('does not apply view rotation when an icon has rotateWithView disabled', () => {
    const { elements, hitTest, map } = setup();
    const element = elements.add({
      geometry: { type: 'point', controlPoints: [[1, 2]] },
      style: {
        symbol: {
          type: 'icon',
          src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
          size: [20, 10],
          anchor: [0.5, 0.5],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          rotation: 15,
          rotateWithView: false
        }
      }
    });
    vi.spyOn(map, 'getPixelFromCoordinate').mockReturnValue([5, 6]);

    const before = hitTest.getScreenExtent(element.id);
    (map as unknown as { rotation: number }).rotation = 1.75;
    expect(hitTest.getScreenExtent(element.id)).toEqual(before);
  });

  it.each([
    [
      'polyline',
      {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [2, 1]
        ]
      }
    ],
    [
      'polygon',
      {
        type: 'polygon',
        controlPoints: [
          [0, 0],
          [2, 0],
          [1, 2]
        ]
      }
    ],
    ['circle', { type: 'circle', center: [1, 1], radius: 1 }]
  ] as const)('computes a conservative structured %s CSS-pixel extent with stroke expansion', (_label, geometry) => {
    const { elements, hitTest, map } = setup();
    const element = elements.add({ geometry, style: { strokes: [{ color: '#f00', width: 4 }] } } as never);
    vi.spyOn(map, 'getPixelFromCoordinate').mockImplementation(((coordinate: number[]) => [coordinate[0] * 10, coordinate[1] * 10]) as never);

    const extent = hitTest.getScreenExtent(element.id);
    expect(extent).toBeDefined();
    expect(extent?.every(Number.isFinite)).toBe(true);
    expect(extent?.[0]).toBeLessThanOrEqual(-2);
    expect(extent?.[1]).toBeLessThanOrEqual(-2);
    expect(extent?.[2]).toBeGreaterThanOrEqual(20);
    expect(extent?.[3]).toBeGreaterThanOrEqual(12);
  });

  it('conservatively expands non-point extents for rotated image footprints', () => {
    const { elements, hitTest, map } = setup();
    const element = elements.add({
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [10, 0]
        ]
      },
      style: {
        symbol: {
          type: 'icon',
          src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
          size: [100, 10],
          rotation: 90,
          rotateWithView: false
        }
      }
    });
    vi.spyOn(map, 'getPixelFromCoordinate').mockImplementation(((coordinate: number[]) => [coordinate[0], coordinate[1]]) as never);

    const extent = hitTest.getScreenExtent(element.id);
    expect(extent?.[0]).toBeCloseTo(-5);
    expect(extent?.[1]).toBeCloseTo(-50);
    expect(extent?.[2]).toBeCloseTo(15);
    expect(extent?.[3]).toBeCloseTo(50);
  });

  it('returns undefined for a native style whose safe footprint cannot be established', () => {
    const { elements, hitTest, map } = setup();
    const element = elements.add({
      geometry: { type: 'point', controlPoints: [[1, 2]] },
      style: { nativeStyle: new NativeStyle() }
    });
    vi.spyOn(map, 'getPixelFromCoordinate').mockReturnValue([10, 20]);

    expect(hitTest.getScreenExtent(element.id)).toBeUndefined();
  });

  it('returns undefined for zero-scale icons and empty structured styles', () => {
    const { elements, hitTest, map } = setup();
    const zeroScale = elements.add({
      geometry: { type: 'point', controlPoints: [[1, 2]] },
      style: {
        symbol: {
          type: 'icon',
          src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
          size: [20, 10],
          scale: 0
        }
      }
    });
    const empty = elements.add({ geometry: { type: 'point', controlPoints: [[2, 3]] }, style: {} });
    vi.spyOn(map, 'getPixelFromCoordinate').mockReturnValue([10, 20]);

    expect(hitTest.getScreenExtent(zeroScale.id)).toBeUndefined();
    expect(hitTest.getScreenExtent(empty.id)).toBeUndefined();
  });

  it('transforms all four geometry-extent corners under a non-monotonic affine projection', () => {
    const { elements, hitTest, map } = setup();
    const element = elements.add({
      geometry: {
        type: 'polygon',
        controlPoints: [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2]
        ]
      },
      style: { fill: { type: 'solid', color: '#1677ff' } }
    });
    vi.spyOn(map, 'getPixelFromCoordinate').mockImplementation(((coordinate: number[]) => [
      2 * coordinate[0] + coordinate[1],
      coordinate[0] - 3 * coordinate[1]
    ]) as never);

    expect(hitTest.getScreenExtent(element.id)).toEqual([0, -6, 6, 2]);
  });

  it('returns undefined for missing frame pixels, unloaded icon size, and hidden state', () => {
    const { elements, hitTest, map, store } = setup();
    const element = elements.add({
      geometry: { type: 'point', controlPoints: [[1, 2]] },
      style: { symbol: { type: 'icon', src: 'https://example.invalid/unloaded.png' } }
    });
    vi.spyOn(map, 'getPixelFromCoordinate').mockReturnValue([10, 20]);
    expect(hitTest.getScreenExtent(element.id)).toBeUndefined();
    map.getPixelFromCoordinate = vi.fn(() => null) as never;
    expect(hitTest.getScreenExtent(element.id)).toBeUndefined();
    store.hide({ id: element.id });
    expect(hitTest.getScreenExtent(element.id)).toBeUndefined();
  });

  it('wraps Element and Layer through the facade and rejects a foreign Element handle', () => {
    const first = setup();
    const second = setup();
    const element = first.elements.add({ id: 'first', geometry: { type: 'point', controlPoints: [[0, 0]] } });
    first.hitTest.atPixel = vi.fn(() => ({ elementId: 'first', layerId: 'default' }));
    first.hitTest.getScreenExtent = vi.fn(() => [1, 2, 3, 4]);

    expect(first.elements.atPixel([0, 0])).toMatchObject({ element: { id: 'first' }, layer: { id: 'default' } });
    expect(first.elements.getScreenExtent(element)).toEqual([1, 2, 3, 4]);
    const foreign = second.elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] } });
    expect(() => first.elements.getScreenExtent(foreign)).toThrow(InvalidArgumentError);
  });
});
