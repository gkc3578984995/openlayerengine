import { describe, expect, it } from 'vitest';
import { setDefaultEarthProvider } from '../src/earthContext';
import PointLayer from '../src/base/PointLayer';

function makeMockEarth() {
  const addedLayers: unknown[] = [];
  const registeredLayers: string[] = [];
  return {
    earth: {
      map: {
        addLayer: (layer: unknown) => addedLayers.push(layer)
      },
      _autoRegisterLayer: (key: string) => registeredLayers.push(key),
      removeLayer: () => undefined,
      removeRegisteredLayer: () => false
    } as any,
    addedLayers,
    registeredLayers
  };
}

describe('earthContext default provider', () => {
  it('allows layer constructors to use the registered default Earth without importing useEarth', () => {
    const { earth, addedLayers, registeredLayers } = makeMockEarth();
    setDefaultEarthProvider(() => earth);

    const layer = new PointLayer();

    expect(layer.getLayer()).toBe(addedLayers[0]);
    expect(registeredLayers).toEqual([layer.registryKey]);
  });
});
