import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import VectorSource from 'ol/source/Vector.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { PrintGeometryHitAdapter } from '../src/adapters/openlayers/PrintGeometryHitAdapter.js';
import type { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import type { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import type { PrintFootprint } from '../src/core/print/types.js';

const footprint: PrintFootprint = [
  [0, 10],
  [10, 0],
  [0, -10],
  [-10, 0]
];

describe('PrintGeometryHitAdapter', () => {
  it('excludes geometry in the rotated footprint bounding-box corners', () => {
    const features = new Map([
      ['inside', new Feature(new Point([2, 2]))],
      ['corner', new Feature(new Point([8, 8]))]
    ]);
    const adapter = new PrintGeometryHitAdapter(binding(features));

    expect(adapter.intersectsFootprint('inside', footprint)).toBe(true);
    expect(adapter.intersectsFootprint('corner', footprint)).toBe(false);
  });

  it('includes a line that crosses the footprint even when its vertices are outside', () => {
    const features = new Map([
      [
        'route',
        new Feature(
          new LineString([
            [-20, 0],
            [20, 0]
          ])
        )
      ]
    ]);
    const adapter = new PrintGeometryHitAdapter(binding(features));

    expect(adapter.intersectsFootprint('route', footprint)).toBe(true);
  });

  it('hits wrapped geometry in a repeated world without mutating the canonical geometry', () => {
    const point = new Point([-179, 0]);
    const features = new Map([['wrapped', new Feature(point)]]);
    const adapter = new PrintGeometryHitAdapter(binding(features, true), 360);
    const repeatedWorld: PrintFootprint = [
      [179, 2],
      [183, 2],
      [183, -2],
      [179, -2]
    ];

    expect(adapter.intersectsFootprint('wrapped', repeatedWorld)).toBe(true);
    expect(point.getCoordinates()).toEqual([-179, 0]);
  });

  it('does not repeat geometry whose source has wrapX disabled', () => {
    const features = new Map([['fixed', new Feature(new Point([-179, 0]))]]);
    const adapter = new PrintGeometryHitAdapter(binding(features, false), 360);
    const repeatedWorld: PrintFootprint = [
      [179, 2],
      [183, 2],
      [183, -2],
      [179, -2]
    ];

    expect(adapter.intersectsFootprint('fixed', repeatedWorld)).toBe(false);
  });

  it('resolves the canonical style at the final print resolution', () => {
    const feature = new Feature(new Point([0, 0]));
    feature.setStyle((_candidate, resolution) =>
      resolution <= 10 ? new Style({ image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#1677ff' }) }) }) : []
    );
    const adapter = new PrintGeometryHitAdapter(binding(new Map([['scaled', feature]])));

    expect(adapter.isVisibleAt('scaled', 5)).toBe(true);
    expect(adapter.isVisibleAt('scaled', 20)).toBe(false);
  });

  it('requires the same renderable resolved Style geometry to hit the final footprint', () => {
    const insideStyleGeometry = new Feature(new Point([100, 100]));
    insideStyleGeometry.setStyle(new Style({ geometry: new Point([0, 0]), image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#1677ff' }) }) }));
    const outsideStyleGeometry = new Feature(new Point([0, 0]));
    outsideStyleGeometry.setStyle(new Style({ geometry: new Point([100, 100]), image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#1677ff' }) }) }));
    const undefinedStyleGeometry = new Feature(new Point([0, 0]));
    undefinedStyleGeometry.setStyle(new Style({ geometry: () => undefined, image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#1677ff' }) }) }));
    const splitStyles = new Feature(new Point([0, 0]));
    splitStyles.setStyle([
      new Style({ geometry: new Point([100, 100]), image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#1677ff' }) }) }),
      new Style({ geometry: new Point([0, 0]) })
    ]);
    const adapter = new PrintGeometryHitAdapter(
      binding(
        new Map([
          ['inside-style', insideStyleGeometry],
          ['outside-style', outsideStyleGeometry],
          ['undefined-style', undefinedStyleGeometry],
          ['split-styles', splitStyles]
        ])
      )
    );

    expect(adapter.isVisibleAt('inside-style', 1, footprint)).toBe(true);
    expect(adapter.intersectsFootprint('inside-style', footprint, 1)).toBe(true);
    expect(adapter.isVisibleAt('outside-style', 1, footprint)).toBe(false);
    expect(adapter.isVisibleAt('undefined-style', 1, footprint)).toBe(false);
    expect(adapter.isVisibleAt('split-styles', 1, footprint)).toBe(false);
  });

  it('applies the actual managed VectorLayer resolution constraints', () => {
    const feature = styledPoint([0, 0]);
    const layer = new VectorLayer({ source: new VectorSource({ features: [feature] }), minResolution: 10 });
    const adapter = layerAwareAdapter(feature, layer, [layer]);

    expect(adapter.isVisibleAt('element', 5)).toBe(false);
    expect(adapter.isVisibleAt('element', 10)).toBe(true);
  });

  it('clips geometry against the actual managed VectorLayer extent', () => {
    const feature = styledPoint([0, 0]);
    const layer = new VectorLayer({ source: new VectorSource({ features: [feature] }), extent: [5, -1, 10, 1] });
    const adapter = layerAwareAdapter(feature, layer, [layer]);

    expect(adapter.intersectsFootprint('element', footprint)).toBe(false);
  });

  it('clips geometry against ancestor Group visibility and extent constraints', () => {
    const feature = styledPoint([0, 0]);
    const layer = new VectorLayer({ source: new VectorSource({ features: [feature] }) });
    const group = new LayerGroup({ layers: [layer], extent: [5, -1, 10, 1] });
    const adapter = layerAwareAdapter(feature, layer, [group]);

    expect(adapter.intersectsFootprint('element', footprint)).toBe(false);
    group.setVisible(false);
    expect(adapter.isVisibleAt('element', 10)).toBe(false);
  });

  it('uses the current Map View projection world width after View replacement', () => {
    const feature = styledPoint([-179, 0]);
    const layer = new VectorLayer({ source: new VectorSource({ features: [feature] }) });
    let view = new View({ projection: 'EPSG:3857', center: [0, 0], resolution: 1 });
    const adapter = mapAwareAdapter(feature, layer, [layer], () => view, true);
    const repeatedWorld: PrintFootprint = [
      [179, 2],
      [183, 2],
      [183, -2],
      [179, -2]
    ];

    expect(adapter.isVisibleAt('element', 1, repeatedWorld)).toBe(false);
    view = new View({ projection: 'EPSG:4326', center: [0, 0], resolution: 1 });
    expect(adapter.isVisibleAt('element', 1, repeatedWorld)).toBe(true);
  });

  it('inspects every feasible repeated world when a wide footprint meets a far-world Layer extent', () => {
    const feature = styledPoint([0, 0]);
    const layer = new VectorLayer({ source: new VectorSource({ features: [feature] }), extent: [3599, -1, 3601, 1] });
    const view = new View({ projection: 'EPSG:4326', center: [1800, 0], resolution: 1 });
    const adapter = mapAwareAdapter(feature, layer, [layer], () => view, true);
    const wideFootprint: PrintFootprint = [
      [0, 2],
      [3600, 2],
      [3600, -2],
      [0, -2]
    ];

    expect(adapter.isVisibleAt('element', 1, wideFootprint)).toBe(true);
  });

  it('normalizes a repeated-world footprint before querying canonical Feature spatial candidates', () => {
    const feature = styledPoint([-179, 0]);
    const source = new VectorSource({ features: [feature], wrapX: true });
    const layer = new VectorLayer({ source });
    const queryPrintCandidateIds = vi.fn(() => ['wrapped']);
    const featureBinding = { queryPrintCandidateIds } as unknown as FeatureBinding;
    const view = new View({ projection: 'EPSG:4326', center: [181, 0], resolution: 1 });
    const map = { getLayers: () => new Collection([layer]), getView: () => view } as unknown as OlMap;
    const layers = { requireVectorSource: () => source } as unknown as LayerAdapter;
    const adapter = new PrintGeometryHitAdapter(featureBinding, { map, layers });
    const repeatedWorld: PrintFootprint = [
      [179, 2],
      [183, 2],
      [183, -2],
      [179, -2]
    ];

    expect(adapter.candidateElementIds(repeatedWorld, 1, ['managed'])).toEqual(['wrapped']);
    expect(queryPrintCandidateIds).toHaveBeenCalledWith('managed', [[-181, -2, -177, 2]]);
  });
});

function styledPoint(coordinate: readonly [number, number]): Feature<Point> {
  const feature = new Feature(new Point([...coordinate]));
  feature.setStyle(new Style({ image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#1677ff' }) }) }));
  return feature;
}

function layerAwareAdapter(feature: Feature, layer: BaseLayer, roots: readonly BaseLayer[]): PrintGeometryHitAdapter {
  const view = new View({ center: [0, 0], resolution: 1 });
  return mapAwareAdapter(feature, layer, roots, () => view, false);
}

function mapAwareAdapter(feature: Feature, layer: BaseLayer, roots: readonly BaseLayer[], getView: () => View, wrapX: boolean): PrintGeometryHitAdapter {
  const featureBinding = {
    ...binding(new Map([['element', feature]]), wrapX),
    resolveFeature: (candidate: Feature) => (candidate === feature ? { elementId: 'element', layerId: 'managed', visible: true } : undefined)
  } as unknown as FeatureBinding;
  const collection = new Collection([...roots]);
  const map = { getLayers: () => collection, getView } as unknown as OlMap;
  const layers = { requireLayer: () => layer } as unknown as LayerAdapter;
  return new PrintGeometryHitAdapter(featureBinding, { map, layers });
}

function binding(features: ReadonlyMap<string, Feature>, wrapX = false): FeatureBinding {
  return {
    requireFeature: (id: string) => {
      const feature = features.get(id);
      if (feature === undefined) throw new Error(`missing feature: ${id}`);
      return feature;
    },
    renderOrderOf: () => 0,
    wrapsX: () => wrapX,
    cloneCanonicalFeature: (id: string) => {
      const feature = features.get(id);
      if (feature === undefined) throw new Error(`missing feature: ${id}`);
      const clone = feature.clone();
      clone.setStyle(feature.getStyle());
      return clone;
    }
  } as unknown as FeatureBinding;
}
