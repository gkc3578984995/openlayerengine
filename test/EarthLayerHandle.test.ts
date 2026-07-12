import { describe, expect, it } from 'vitest';
import BaseLayer from 'ol/layer/Base';
import Earth from '../src/Earth';

function makeEarth(): Earth {
  const layers: BaseLayer[] = [];
  const earth = Object.create(Earth.prototype) as Earth;
  earth.map = {
    addLayer: (layer: BaseLayer) => layers.push(layer),
    removeLayer: (layer: BaseLayer) => {
      const index = layers.indexOf(layer);
      return index === -1 ? undefined : layers.splice(index, 1)[0];
    },
    getAllLayers: () => [...layers]
  } as unknown as Earth['map'];
  return earth;
}

describe('Earth base-layer handles', () => {
  it('returns distinct handles and removes only the matching base layer', () => {
    const earth = makeEarth();
    const osm = earth.createOsmLayer();
    const xyz = earth.createXyzLayer('https://tiles.example');

    const osmId = earth.addLayer(osm);
    const xyzId = earth.addLayer(xyz);

    expect(osmId).toMatch(/^[0-9a-f-]{36}$/);
    expect(xyzId).toMatch(/^[0-9a-f-]{36}$/);
    expect(osmId).not.toBe(xyzId);
    expect(earth.removeLayer(osmId)).toBe(osm);
    expect(earth.map.getAllLayers()).toEqual([xyz]);
  });

  it('keeps multiple base layers until each handle is removed', () => {
    const earth = makeEarth();
    const firstId = earth.addLayer(earth.createOsmLayer());
    const secondId = earth.addLayer(earth.createXyzLayer('https://tiles.example'));

    expect(earth.map.getAllLayers()).toHaveLength(2);
    earth.removeLayer(firstId);
    expect(earth.map.getAllLayers()).toHaveLength(1);
    earth.removeLayer(secondId);
    expect(earth.map.getAllLayers()).toHaveLength(0);
  });

  it('returns undefined for an unknown handle without changing map layers', () => {
    const earth = makeEarth();
    earth.addLayer(earth.createOsmLayer());

    expect(earth.removeLayer('unknown-handle')).toBeUndefined();
    expect(earth.map.getAllLayers()).toHaveLength(1);
  });

  it('keeps layer-object and no-argument removal compatible for base layers', () => {
    const earth = makeEarth();
    const osm = earth.createOsmLayer();
    const xyz = earth.createXyzLayer('https://tiles.example');

    earth.addLayer(osm);
    earth.addLayer(xyz);

    expect(earth.removeLayer(osm)).toBe(osm);
    expect(earth.removeLayer()).toBe(xyz);
    expect(earth.map.getAllLayers()).toHaveLength(0);
  });
});
