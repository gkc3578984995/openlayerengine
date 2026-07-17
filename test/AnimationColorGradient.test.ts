import { describe, expect, it } from 'vitest';
import { normalizeCenterSpreadAnimationSpec } from '../src/builtins/animations/centerSpread.js';
import { normalizeColorGradient, sampleColorGradient } from '../src/builtins/animations/colorGradient.js';
import { pathTravelAnimationDefinition } from '../src/builtins/animations/pathTravel.js';
import { normalizeRadarScanAnimationSpec } from '../src/builtins/animations/radarScan.js';
import { color } from '../src/builtins/animations/validation.js';
import type { Color } from '../src/core/common/types.js';
import { InvalidArgumentError } from '../src/core/errors.js';

describe('动画渐变颜色归一化', () => {
  it('确定性解析 named、hex、现代与传统 rgb/hsl 以及 transparent', () => {
    const input = [
      [0, 'RebeccaPurple'],
      [0.15, '#0f08'],
      [0.3, 'rgb(100% 0% 50% / 25%)'],
      [0.45, 'rgba(0, 255, 0, 0.5)'],
      [0.6, 'hsl(240 100% 50% / 75%)'],
      [0.75, 'hsla(120, 100%, 25%, 0.25)'],
      [0.9, 'hsl(0.5turn 100% 50%)'],
      [1, 'transparent']
    ];
    const original = structuredClone(input);
    const gradient = normalizeColorGradient(input, 'Test gradient');

    expect(input).toEqual(original);
    expect(rgbaAt(gradient, 0)).toEqual([102, 51, 153, 1]);
    expect(rgbaAt(gradient, 1)).toEqual([0, 255, 0, 136 / 255]);
    expect(rgbaAt(gradient, 2)).toEqual([255, 0, 127.5, 0.25]);
    expect(rgbaAt(gradient, 3)).toEqual([0, 255, 0, 0.5]);
    expectRgbaCloseTo(rgbaAt(gradient, 4), [0, 0, 255, 0.75]);
    expectRgbaCloseTo(rgbaAt(gradient, 5), [0, 127.5, 0, 0.25]);
    expectRgbaCloseTo(rgbaAt(gradient, 6), [0, 255, 255, 1]);
    expect(rgbaAt(gradient, 7)).toEqual([0, 0, 0, 0]);
    expect(gradient.every(Object.isFrozen)).toBe(true);
    expect(gradient.every((stop) => Array.isArray(stop[1]) && Object.isFrozen(stop[1]))).toBe(true);
  });

  it('在已解析的 RGBA 通道和 alpha 上连续线性插值，并把范围外进度钳制到端点', () => {
    const gradient = normalizeColorGradient(
      [
        [0, 'red'],
        [1, 'hsl(240 100% 50% / 0)']
      ],
      'Test gradient'
    );

    expect(sampleColorGradient(gradient, -1)).toEqual([255, 0, 0, 1]);
    expect(sampleColorGradient(gradient, 0.5)).toEqual([127.5, 0, 127.5, 0.5]);
    expectRgbaCloseTo(rgbaValue(sampleColorGradient(gradient, 2)), [0, 0, 255, 0]);
  });

  it('path-travel、radar-scan 与 center-spread 共用同一套 RGBA 归一化', () => {
    const gradient = [
      [0, 'navy'],
      [1, 'rgb(0 255 0 / 50%)']
    ];
    const path = pathTravelAnimationDefinition.normalize({ type: 'path-travel', gradient });
    const radar = normalizeRadarScanAnimationSpec({ type: 'radar-scan', gradient });
    const spread = normalizeCenterSpreadAnimationSpec({ type: 'center-spread', gradient });

    for (const normalized of [path.gradient, radar.gradient, spread.gradient]) {
      expect(normalized).toBeDefined();
      expect(rgbaAt(normalized!, 0)).toEqual([0, 0, 128, 1]);
      expect(rgbaAt(normalized!, 1)).toEqual([0, 255, 0, 0.5]);
    }
  });

  it('严格拒绝越界 RGB/RGBA tuple，边界值和小数通道保持有效', () => {
    expect(color([0, 127.5, 255], '#000000', 'Test color')).toEqual([0, 127.5, 255]);
    expect(color([0, 127.5, 255, 0], '#000000', 'Test color')).toEqual([0, 127.5, 255, 0]);
    expect(color([0, 127.5, 255, 1], '#000000', 'Test color')).toEqual([0, 127.5, 255, 1]);

    const invalidColors: readonly unknown[] = [
      [-0.01, 0, 0],
      [0, -0.01, 0],
      [0, 0, -0.01],
      [255.01, 0, 0],
      [0, 255.01, 0],
      [0, 0, 255.01],
      [0, 0, 0, -0.01],
      [0, 0, 0, 1.01],
      [0, 0, 0, Number.NaN],
      [0, 0, Number.POSITIVE_INFINITY]
    ];
    for (const invalid of invalidColors) {
      expect(() => color(invalid, '#000000', 'Test color')).toThrowError(InvalidArgumentError);
      expect(() =>
        normalizeColorGradient(
          [
            [0, invalid],
            [1, '#ffffff']
          ],
          'Test gradient'
        )
      ).toThrowError(InvalidArgumentError);
    }
  });

  it('拒绝无法脱离 DOM 上下文确定解析或尚未纳入契约的 CSS 颜色语法', () => {
    const unsupported = [
      'currentColor',
      'var(--trail-color)',
      'lab(50% 0 0)',
      'lch(50% 30 120)',
      'hwb(120 0% 0%)',
      'color(display-p3 0 1 0)',
      'blueish',
      'constructor',
      'toString',
      '__proto__'
    ];
    for (const candidate of unsupported) {
      expect(() =>
        normalizeColorGradient(
          [
            [0, candidate],
            [1, '#ffffff']
          ],
          'Test gradient'
        )
      ).toThrowError(InvalidArgumentError);
    }
  });

  it('传统逗号 rgb/rgba 三通道必须统一使用 number 或 percentage', () => {
    for (const candidate of ['rgb(0, 50%, 255)', 'rgba(0%, 128, 100%, 0.5)']) {
      expect(() =>
        normalizeColorGradient(
          [
            [0, candidate],
            [1, '#ffffff']
          ],
          'Test gradient'
        )
      ).toThrowError(InvalidArgumentError);
    }
    expect(
      rgbaAt(
        normalizeColorGradient(
          [
            [0, 'rgb(0%, 50%, 100%)'],
            [1, '#ffffff']
          ],
          'Test gradient'
        ),
        0
      )
    ).toEqual([0, 127.5, 255, 1]);
  });

  it('CSS rgb/hsl 字符串按 CSS 语义钳制通道，数值 tuple 仍保持严格范围', () => {
    const gradient = normalizeColorGradient(
      [
        [0, 'rgb(300 -20 50 / 200%)'],
        [1, 'hsl(-120 150% -10% / -1)']
      ],
      'Test gradient'
    );

    expect(rgbaAt(gradient, 0)).toEqual([255, 0, 50, 1]);
    expectRgbaCloseTo(rgbaAt(gradient, 1), [0, 0, 0, 0]);
  });
});

function rgbaAt(stops: readonly (readonly [number, Color])[], index: number): readonly number[] {
  return rgbaValue(stops[index][1]);
}

function rgbaValue(value: Color): readonly number[] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error('Expected a normalized RGBA color');
  return value;
}

function expectRgbaCloseTo(actual: readonly number[], expected: readonly [number, number, number, number]): void {
  expect(actual).toHaveLength(4);
  for (let index = 0; index < expected.length; index += 1) expect(actual[index]).toBeCloseTo(expected[index], 10);
}
