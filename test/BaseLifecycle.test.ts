import { describe, expect, it } from 'vitest';
import { ObjectDisposedError } from '../src/core/errors.js';
import { createFacadeHarness } from './helpers/facadeHarness.js';

describe('Layer 生命周期 v2 回归', () => {
  it('remove 同时移除原生图层并使旧句柄失效', () => {
    const harness = createFacadeHarness();
    const layer = harness.layers.add({ kind: 'vector', id: 'temporary' });
    const native = layer.olLayer;

    layer.remove();

    expect(harness.map.getAllLayers()).not.toContain(native);
    expect(harness.layers.get('temporary')).toBeUndefined();
    expect(() => layer.state).toThrow(ObjectDisposedError);
    expect(() => layer.remove()).not.toThrow();
    harness.destroy();
  });
});
