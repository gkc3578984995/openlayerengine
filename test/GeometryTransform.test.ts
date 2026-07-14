import { describe, expect, it } from 'vitest';
import { lerp2, quadraticBezier2 } from '../src/utils/math.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

describe('v2 二维插值工具（utils-linear-interpolation）', () => {
  it('计算线段端点、中点与外插点', () => {
    coversCapabilities('utils-linear-interpolation');
    expect(lerp2([2, 3], [8, 9], 0)).toEqual([2, 3]);
    expect(lerp2([2, 3], [8, 9], 1)).toEqual([8, 9]);
    expect(lerp2([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
    expect(lerp2([0, 0], [10, 20], 1.5)).toEqual([15, 30]);
  });
});

describe('v2 二次贝塞尔工具（utils-quadratic-bezier）', () => {
  it('保持曲线端点并计算中间控制结果', () => {
    coversCapabilities('utils-quadratic-bezier');
    const start = [0, 0] as const;
    const control = [5, 10] as const;
    const end = [10, 0] as const;
    expect(quadraticBezier2(start, control, end, 0)).toEqual(start);
    expect(quadraticBezier2(start, control, end, 1)).toEqual(end);
    expect(quadraticBezier2(start, control, end, 0.5)).toEqual([5, 5]);
  });

  it('计算时不修改任何输入坐标', () => {
    const start = [1, 2] as const;
    const control = [3, 8] as const;
    const end = [9, 4] as const;
    quadraticBezier2(start, control, end, 0.25);
    expect(start).toEqual([1, 2]);
    expect(control).toEqual([3, 8]);
    expect(end).toEqual([9, 4]);
  });
});
