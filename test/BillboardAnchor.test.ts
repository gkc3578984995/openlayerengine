import type Feature from 'ol/Feature.js';
import type Geometry from 'ol/geom/Geometry.js';
import { describe, expect, it, vi } from 'vitest';
import BillboardLayer from '../src/base/BillboardLayer.js';

function createEarth() {
  return {
    map: { addLayer: vi.fn() },
    _autoRegisterLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeRegisteredLayer: vi.fn()
  } as never;
}

describe('BillboardLayer anchor snapshots', () => {
  it('stores the default center anchor explicitly', () => {
    const layer = new BillboardLayer(createEarth());
    const feature = layer.add({
      id: 'billboard-default-anchor',
      center: [0, 0],
      src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'
    });

    expect(feature.get('param').anchor).toEqual([0.5, 0.5]);
    expect(layer.getUpdatedParam(feature as Feature<Geometry>)?.anchor).toEqual([0.5, 0.5]);
  });

  it('preserves the caller anchor instead of reading the normalized OpenLayers anchor', () => {
    const layer = new BillboardLayer(createEarth());
    const initialAnchor = [0.2, 0.75];
    const feature = layer.add({
      id: 'billboard-anchor',
      center: [0, 0],
      src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
      size: [16, 16],
      scale: 2,
      displacement: [8, 4],
      anchor: initialAnchor,
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction'
    });

    expect(layer.getUpdatedParam(feature as Feature<Geometry>)?.anchor).toEqual([0.2, 0.75]);
    expect(feature.get('param').anchor).not.toBe(initialAnchor);

    const nextAnchor = [0.8, 0.25];
    layer.set({ id: 'billboard-anchor', anchor: nextAnchor });

    expect(feature.get('param').anchor).toEqual([0.8, 0.25]);
    expect(feature.get('param').anchor).not.toBe(nextAnchor);
    expect(layer.getUpdatedParam(feature as Feature<Geometry>)?.anchor).toEqual([0.8, 0.25]);
  });
});
