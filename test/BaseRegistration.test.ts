/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import PointLayer from '../src/base/PointLayer';

describe('Base 图层注册', () => {
  it('临时图层可保持在地图上但不登记到 Earth', () => {
    const addLayer = vi.fn();
    const autoRegisterLayer = vi.fn();
    const earth = {
      map: { addLayer },
      _autoRegisterLayer: autoRegisterLayer
    } as any;

    new PointLayer(earth, { register: false });

    expect(addLayer).toHaveBeenCalledTimes(1);
    expect(autoRegisterLayer).not.toHaveBeenCalled();
  });
});
