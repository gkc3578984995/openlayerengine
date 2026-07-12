import { describe, expect, it } from 'vitest';
import Measure from '../src/components/Measure';

describe('Measure lifecycle', () => {
  it('keeps cached measure layers usable after clear for line and area sessions', () => {
    const layers = new Set<unknown>();
    const interactions: unknown[] = [];
    const map = {
      addLayer: (layer: unknown) => layers.add(layer),
      removeLayer: (layer: unknown) => layers.delete(layer),
      addInteraction: (interaction: unknown) => interactions.push(interaction),
      removeInteraction: (interaction: unknown) => {
        const index = interactions.indexOf(interaction);
        if (index >= 0) interactions.splice(index, 1);
      }
    };
    const earth = {
      map,
      _autoRegisterLayer: () => {},
      removeLayer: (layer: unknown) => map.removeLayer(layer),
      removeRegisteredLayer: () => true,
      setMouseStyle: () => {},
      setMouseStyleToDefault: () => {},
      useGlobalEvent: () => ({ addCancelableMouseOnceRightClickEventByGlobal: () => () => {} })
    } as any;
    const measure = new Measure(earth);

    expect(layers.size).toBe(2);
    measure.clear();

    expect(layers.size).toBe(2);
    measure.lineSegmentation({});
    measure.polygonMeasure({});

    expect(interactions).toHaveLength(1);
  });
});
