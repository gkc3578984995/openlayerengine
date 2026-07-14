import Point from 'ol/geom/Point.js';
import { describe, expect, it } from 'vitest';
import { ObjectDisposedError } from '../src/core/errors.js';
import { createFacadeHarness } from './helpers/facadeHarness.js';

describe('Base 能力迁移到 Element/Layer facade', () => {
  it('图层透明度使用 0 到 1 的公共状态并原子校验', () => {
    const harness = createFacadeHarness();
    const layer = harness.layers.add({ kind: 'vector', id: 'business', opacity: 0.5 });

    expect(layer.opacity).toBe(0.5);
    layer.update({ opacity: 0 });
    expect(layer.opacity).toBe(0);
    expect(() => layer.update({ opacity: 2 })).toThrow();
    expect(layer.opacity).toBe(0);
    harness.destroy();
  });

  it('元素状态是唯一真源，业务输入和原生 Feature 修改不会反向污染快照', () => {
    const harness = createFacadeHarness();
    const data = { name: '原始' };
    const element = harness.elements.add({
      id: 'point',
      geometry: { type: 'point', controlPoints: [[1, 2]] },
      style: { symbol: { type: 'circle', radius: 5, fill: { type: 'solid', color: '#f00' } } },
      module: 'planning',
      data
    });

    data.name = '外部修改';
    (element.olFeature.getGeometry() as Point).setCoordinates([99, 99]);
    expect(element.state.data).toEqual({ name: '原始' });
    expect(element.state.geometry.controlPoints).toEqual([[1, 2]]);
    expect(Object.isFrozen(element.state)).toBe(true);

    element.update({ geometry: { type: 'point', controlPoints: [[3, 4]] } });
    expect((element.olFeature.getGeometry() as Point).getCoordinates()).toEqual([3, 4]);
    expect(harness.elements.query({ module: 'planning' })).toEqual([element]);
    element.remove();
    expect(() => element.state).toThrow(ObjectDisposedError);
    harness.destroy();
  });
});
