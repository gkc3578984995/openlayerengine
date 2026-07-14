import { describe, expect, it } from 'vitest';
import { createFacadeHarness } from './helpers/facadeHarness.js';

describe('Layer 句柄 v2 回归', () => {
  it('按稳定 ID 返回独立句柄并只删除目标图层', () => {
    const harness = createFacadeHarness();
    const osm = harness.layers.add({ kind: 'tile', id: 'osm', preset: 'osm' });
    const xyz = harness.layers.add({ kind: 'tile', id: 'xyz', preset: 'xyz', url: 'https://tiles.example/{z}/{x}/{y}.png' });

    expect(harness.layers.get('osm')).toBe(osm);
    expect(harness.layers.get('xyz')).toBe(xyz);
    expect(harness.layers.remove('unknown')).toBe(false);
    expect(harness.layers.remove('osm')).toBe(true);
    expect(harness.layers.get('osm')).toBeUndefined();
    expect(harness.layers.get('xyz')).toBe(xyz);
    harness.destroy();
  });
});
