import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Map from 'ol/Map';
import Graticule from 'ol/layer/Graticule';
import ScaleLine from 'ol/control/ScaleLine';
import Controls from '../src/modules/Controls';

function makeControls() {
  const addLayer = vi.fn();
  const removeLayer = vi.fn();
  const addControl = vi.fn();
  const removeControl = vi.fn();
  const controls = new Controls({ addLayer, removeLayer, addControl, removeControl } as unknown as Map);
  return { controls, addLayer, removeLayer, addControl, removeControl };
}

describe('Controls', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: () => ({
        appendChild: vi.fn(),
        className: '',
        style: {}
      })
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rebuilds the graticule with new options', () => {
    const { controls, addLayer, removeLayer } = makeControls();

    const first = controls.enableGraticule();
    const second = controls.enableGraticule({ showLabels: false, zIndex: 120 });

    expect(first).toBeInstanceOf(Graticule);
    expect(removeLayer).toHaveBeenCalledWith(first);
    expect(second).toBeInstanceOf(Graticule);
    expect(second).not.toBe(first);
    expect(second.getZIndex()).toBe(120);
    expect(second.get('layerType')).toBe('graticule');
    expect(addLayer).toHaveBeenCalledTimes(2);
  });

  it('keeps the internal graticule marker when merging custom properties', () => {
    const { controls } = makeControls();

    const graticule = controls.enableGraticule({ properties: { layerType: 'custom', theme: 'night' } });

    expect(graticule.get('layerType')).toBe('graticule');
    expect(graticule.get('theme')).toBe('night');
  });

  it('rebuilds the scale line with new options', () => {
    const { controls, addControl, removeControl } = makeControls();

    const first = controls.enableScaleLine();
    const second = controls.enableScaleLine({ units: 'imperial', bar: false, minWidth: 240 });

    expect(first).toBeInstanceOf(ScaleLine);
    expect(removeControl).toHaveBeenCalledWith(first);
    expect(second).toBeInstanceOf(ScaleLine);
    expect(second).not.toBe(first);
    expect(second.getUnits()).toBe('imperial');
    expect(addControl).toHaveBeenCalledTimes(2);
  });
});
