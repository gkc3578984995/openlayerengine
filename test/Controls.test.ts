import Map from 'ol/Map.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import Graticule from 'ol/layer/Graticule.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlServiceImpl } from '../src/facade/ControlService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

function createControls() {
  const addLayer = vi.fn();
  const removeLayer = vi.fn();
  const addControl = vi.fn();
  const removeControl = vi.fn();
  const map = { addLayer, removeLayer, addControl, removeControl } as unknown as Map;
  return { controls: new ControlServiceImpl({ map }), addLayer, removeLayer, addControl, removeControl };
}

describe('ControlServiceImpl 控件回归', () => {
  coversCapabilities('control-graticule-lifecycle', 'control-scale-line-lifecycle');

  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: () => ({ appendChild: vi.fn(), className: '', style: {}, setAttribute: vi.fn() })
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('使用新参数重建经纬网并移除旧实例', () => {
    const { controls, addLayer, removeLayer } = createControls();

    const first = controls.enableGraticule();
    const second = controls.enableGraticule({ showLabels: false, zIndex: 120 });

    expect(first).toBeInstanceOf(Graticule);
    expect(removeLayer).toHaveBeenCalledWith(first);
    expect(second).toBeInstanceOf(Graticule);
    expect(second).not.toBe(first);
    expect(second.getZIndex()).toBe(120);
    expect(second.get('layerType')).toBe('graticule');
    expect(addLayer).toHaveBeenCalledTimes(2);
    expect(controls.graticule).toBe(second);
  });

  it('合并自定义 properties 时保留内部经纬网标记', () => {
    const { controls } = createControls();

    const graticule = controls.enableGraticule({ properties: { layerType: 'custom', theme: 'night' } });

    expect(graticule.get('layerType')).toBe('graticule');
    expect(graticule.get('theme')).toBe('night');
  });

  it('使用新参数重建比例尺并移除旧实例', () => {
    const { controls, addControl, removeControl } = createControls();

    const first = controls.enableScaleLine();
    const second = controls.enableScaleLine({ units: 'imperial', bar: false, minWidth: 240 });

    expect(first).toBeInstanceOf(ScaleLine);
    expect(removeControl).toHaveBeenCalledWith(first);
    expect(second).toBeInstanceOf(ScaleLine);
    expect(second).not.toBe(first);
    expect(second.getUnits()).toBe('imperial');
    expect(addControl).toHaveBeenCalledTimes(2);
    expect(controls.scaleLine).toBe(second);
  });
});
