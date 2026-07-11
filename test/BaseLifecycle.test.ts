import { describe, expect, it } from 'vitest';
import Base from '../src/base/Base';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';

describe('Base lifecycle', () => {
  it('destroy removes OL layer and unregisters from Earth', () => {
    const removedLayers: unknown[] = [];
    const removedKeys: string[] = [];
    const layer = new VectorLayer({ source: new VectorSource() });
    const earth = {
      map: { addLayer: () => {} },
      _autoRegisterLayer: () => {},
      removeLayer: (target: unknown) => {
        removedLayers.push(target);
        return target;
      },
      removeRegisteredLayer: (key: string) => {
        removedKeys.push(key);
        return true;
      }
    } as any;
    const base = new Base(earth, layer, 'Point');

    expect(base.destroy()).toBe(true);
    expect(removedLayers).toEqual([layer]);
    expect(removedKeys).toEqual([base.registryKey]);
  });
});
