import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { describe, expect, it, vi } from 'vitest';
import { createFacadeHarness } from './helpers/facadeHarness.js';

describe('原生图层注册 v2 回归', () => {
  it('external ownership 移除图层但不销毁调用方对象', () => {
    const harness = createFacadeHarness();
    const native = new VectorLayer({ source: new VectorSource() });
    const dispose = vi.spyOn(native, 'dispose');
    const layer = harness.layers.add({ kind: 'native', id: 'external', layer: native, ownership: 'external' });

    layer.remove();

    expect(harness.map.getAllLayers()).not.toContain(native);
    expect(dispose).not.toHaveBeenCalled();
    harness.destroy();
  });
});
