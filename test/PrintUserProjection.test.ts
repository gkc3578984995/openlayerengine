import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import ImageState from 'ol/ImageState.js';
import Point from 'ol/geom/Point.js';
import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import { clearUserProjection, fromLonLat, getUserProjection, setUserProjection, useGeographic } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Icon from 'ol/style/Icon.js';
import Style from 'ol/style/Style.js';
import Text from 'ol/style/Text.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import type { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import type { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { PrintGeometryHitAdapter } from '../src/adapters/openlayers/PrintGeometryHitAdapter.js';
import { bindResourceErrors, PrintMapRenderer } from '../src/adapters/openlayers/PrintMapRenderer.js';
import type { LayerManager } from '../src/core/layer/LayerManager.js';
import type { PrintFootprint, PrintPlan } from '../src/core/print/types.js';

describe('Print userProjection isolation', () => {
  it('normalizes leaf and ancestor Layer extents before managed legend hit testing', () => {
    const previous = getUserProjection();
    clearUserProjection();
    const view = new View({ projection: 'EPSG:3857', center: fromLonLat([9, 9]), resolution: 1 });
    const center = fromLonLat([9, 9]);
    const feature = styledPoint(center);
    const layer = new VectorLayer({ source: new VectorSource({ features: [feature] }), extent: [8, 8, 10, 10] });
    const group = new LayerGroup({ layers: [layer], extent: [8.5, 8.5, 9.5, 9.5] });
    const adapter = layerAwareAdapter(feature, layer, [group], view);
    const footprint = squareFootprint(center, 10_000);

    try {
      useGeographic();
      expect(adapter.isVisibleAt('element', 1, footprint)).toBe(true);

      group.setExtent([20, 20, 21, 21]);
      expect(adapter.isVisibleAt('element', 1, footprint)).toBe(false);
    } finally {
      restoreUserProjection(previous);
    }
  });

  it('collects factory Vector font resources whose geometry uses the active user projection', () => {
    const previous = getUserProjection();
    clearUserProjection();
    const center = fromLonLat([9, 9]);
    const view = new View({ projection: 'EPSG:3857', center, resolution: 1 });
    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer('native', active, view);
    const feature = new Feature(new Point([9, 9]));
    feature.setStyle(new Style({ text: new Text({ text: '投影文字', font: '600 18px "Projection Sans"' }) }));
    const output = new VectorLayer({ source: new VectorSource({ features: [feature] }), extent: [8, 8, 10, 10] });
    let snapshot: ReturnType<PrintMapRenderer['capture']> | undefined;

    try {
      useGeographic();
      snapshot = renderer.capture(printPlan(center), { animations: 'base' }, () => ({ layer: output, ownership: 'external' }));
      expect(snapshot.fontSamples).toEqual([{ font: '600 18px "Projection Sans"', text: '投影文字' }]);
    } finally {
      snapshot?.destroy();
      renderer.destroy();
      restoreUserProjection(previous);
    }
  });

  it('normalizes factory Vector icon geometry and Layer extent before resource auditing', () => {
    const previous = getUserProjection();
    clearUserProjection();
    const center = fromLonLat([9, 9]);
    const projection = new View({ projection: 'EPSG:3857' }).getProjection();
    const icon = new Icon({ src: 'https://example.test/projection-icon.png' });
    const listen = vi.spyOn(icon, 'listenImageChange');
    vi.spyOn(icon, 'getImageState').mockReturnValue(ImageState.ERROR);
    const feature = new Feature(new Point([9, 9]));
    feature.setStyle(new Style({ image: icon }));
    const layer = new VectorLayer({ source: new VectorSource({ features: [feature] }), extent: [8, 8, 10, 10] });
    let resources: ReturnType<typeof bindResourceErrors> | undefined;

    try {
      useGeographic();
      const footprint = squareFootprint(center, 10_000);
      resources = bindResourceErrors([layer], 1, vi.fn(), {
        extent: [center[0] - 10_000, center[1] - 10_000, center[0] + 10_000, center[1] + 10_000],
        footprint,
        projection,
        pixelRatio: 1
      });
      expect(listen).toHaveBeenCalledOnce();
      expect(resources.hasError()).toBe(true);
    } finally {
      resources?.release();
      restoreUserProjection(previous);
    }
  });

  it('rematerializes frozen factory Feature, Style geometry, and Layer extent before every hidden render', async () => {
    const previous = getUserProjection();
    clearUserProjection();
    const center = fromLonLat([9, 9]);
    const view = new View({ projection: 'EPSG:3857', center, resolution: 1 });
    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer('native', active, view);
    const feature = new Feature(new Point([9.25, 9.25]));
    feature.setStyle(new Style({ geometry: new Point([9.5, 9.5]), text: new Text({ text: 'projection' }) }));
    const output = new VectorLayer({ source: new VectorSource({ features: [feature] }), extent: [8, 8, 10, 10] });
    const target = { className: '', style: {} as Record<string, string>, remove: vi.fn() };
    let snapshot: ReturnType<PrintMapRenderer['capture']> | undefined;

    try {
      useGeographic();
      const plan = printPlan(center);
      snapshot = renderer.capture(plan, { animations: 'base' }, () => ({ layer: output, ownership: 'external' }));
      vi.stubGlobal('document', { createElement: vi.fn(() => target), body: { append: vi.fn() } });
      vi.stubGlobal('window', undefined);

      clearUserProjection();
      await expect(renderer.renderSnapshot(snapshot, plan, { quality: 'draft', timeoutMs: 100, signal: new AbortController().signal })).rejects.toBeDefined();
      expectSnapshotCoordinates(snapshot.layers[0]!, fromLonLat([9.25, 9.25]), fromLonLat([9.5, 9.5]), [...fromLonLat([8, 8]), ...fromLonLat([10, 10])]);

      useGeographic();
      await expect(renderer.renderSnapshot(snapshot, plan, { quality: 'draft', timeoutMs: 100, signal: new AbortController().signal })).rejects.toBeDefined();
      expectSnapshotCoordinates(snapshot.layers[0]!, [9.25, 9.25], [9.5, 9.5], [8, 8, 10, 10]);
      expect(target.remove).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      snapshot?.destroy();
      renderer.destroy();
      restoreUserProjection(previous);
    }
  });
});

function styledPoint(coordinate: readonly [number, number]): Feature<Point> {
  const feature = new Feature(new Point([...coordinate]));
  feature.setStyle(new Style({ image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#1677ff' }) }) }));
  return feature;
}

function layerAwareAdapter(feature: Feature, layer: BaseLayer, roots: readonly BaseLayer[], view: View): PrintGeometryHitAdapter {
  const binding = {
    requireFeature: () => feature,
    resolveFeature: (candidate: Feature) => (candidate === feature ? { elementId: 'element', layerId: 'managed', visible: true } : undefined),
    renderOrderOf: () => 0,
    wrapsX: () => false,
    cloneCanonicalFeature: () => {
      const clone = feature.clone();
      clone.setStyle(feature.getStyle());
      return clone;
    }
  } as unknown as FeatureBinding;
  const collection = new Collection([...roots]);
  const map = { getLayers: () => collection, getView: () => view } as unknown as OlMap;
  const layers = { requireLayer: () => layer } as unknown as LayerAdapter;
  return new PrintGeometryHitAdapter(binding, { map, layers });
}

function nativeLayerRenderer(id: string, layer: BaseLayer, view: View): PrintMapRenderer {
  const collection = new Collection([layer]);
  const map = { getLayers: () => collection, getView: () => view } as unknown as OlMap;
  return new PrintMapRenderer(map, {
    layers: {
      query: () => [{ kind: 'native' as const, id, ref: {} as never, ownership: 'external' as const }],
      subscribe: () => () => undefined
    } as unknown as LayerManager,
    layerAdapter: {
      requireLayer: () => layer,
      vectorLayerIdFor: () => undefined
    } as unknown as LayerAdapter
  });
}

function squareFootprint(center: readonly [number, number], radius: number): PrintFootprint {
  return [
    [center[0] - radius, center[1] + radius],
    [center[0] + radius, center[1] + radius],
    [center[0] + radius, center[1] - radius],
    [center[0] - radius, center[1] - radius]
  ];
}

function printPlan(center: readonly [number, number]): PrintPlan {
  const footprint = squareFootprint(center, 10_000);
  return {
    revision: 1,
    pageSizeMm: [297, 210],
    mapFrameMm: { x: 10, y: 10, width: 277, height: 190 },
    outputSizePx: [1123, 794],
    range: {
      sourceMode: 'view',
      sourceExtent: [center[0] - 10_000, center[1] - 10_000, center[0] + 10_000, center[1] + 10_000],
      actualExtent: [center[0] - 10_000, center[1] - 10_000, center[0] + 10_000, center[1] + 10_000],
      footprint,
      center: [...center],
      rotation: 0,
      denominator: 10_000,
      resolution: 1
    },
    dpi: 96
  };
}

function expectSnapshotCoordinates(
  layer: BaseLayer,
  featureCoordinate: readonly number[],
  styleCoordinate: readonly number[],
  extent: readonly number[]
): void {
  const vector = layer as VectorLayer<VectorSource<Feature<Point>>>;
  const feature = vector.getSource()?.getFeatures()[0];
  const resolved = feature?.getStyleFunction()?.(feature, 1);
  const style = Array.isArray(resolved) ? resolved[0] : resolved;
  const styleGeometry = style?.getGeometryFunction()(feature!) as Point;
  expectCoordinateClose(feature?.getGeometry()?.getCoordinates(), featureCoordinate);
  expectCoordinateClose(styleGeometry.getCoordinates(), styleCoordinate);
  expectCoordinateClose(vector.getExtent(), extent);
}

function expectCoordinateClose(actual: readonly number[] | undefined, expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (const [index, value] of expected.entries()) expect(actual?.[index]).toBeCloseTo(value, 6);
}

function restoreUserProjection(previous: ReturnType<typeof getUserProjection>): void {
  if (previous === null) clearUserProjection();
  else setUserProjection(previous);
}
