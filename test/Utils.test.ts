import { afterEach, describe, expect, it, vi } from 'vitest';
import { stylePresets } from '../src/builtins/styles/presets.js';
import type { AnimationManager } from '../src/services/animation/types.js';
import { createId } from '../src/utils/id.js';
import { add2, closeRing, degToRad, lerp2, quadraticBezier2, radToDeg, scale2, toFlatCoordinates, trimClosingCoordinate } from '../src/utils/math.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createAnimationHarness, pointElement } from './helpers/animationHarness.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('v2 公共标识工具（utils-guid）', () => {
  it('生成符合 UUID v4 结构且互不重复的标识', () => {
    coversCapabilities('utils-guid');
    const ids = new Set(Array.from({ length: 256 }, createId));
    expect(ids.size).toBe(256);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('优先使用运行环境提供的 randomUUID', () => {
    const randomUUID = vi.fn(() => '123e4567-e89b-42d3-a456-426614174000' as `${string}-${string}-${string}-${string}-${string}`);
    vi.stubGlobal('crypto', { randomUUID });
    expect(createId()).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('在 Web Crypto 不可用时仍生成合法 UUID v4', () => {
    vi.stubGlobal('crypto', undefined);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(createId()).toBe('00000000-0000-4000-8000-000000000000');
  });
});

describe('v2 角度换算工具（utils-degree-radian）', () => {
  it('在角度和弧度之间往返换算', () => {
    coversCapabilities('utils-degree-radian');
    expect(degToRad(180)).toBeCloseTo(Math.PI, 12);
    for (const degrees of [0, 45, 90, 180, 270, 359.9]) expect(radToDeg(degToRad(degrees))).toBeCloseTo(degrees, 10);
  });

  it('将弧度换算结果归一化到零至三百六十度', () => {
    expect(radToDeg(-Math.PI / 2)).toBeCloseTo(270, 12);
    expect(radToDeg(Math.PI * 2)).toBe(0);
    expect(radToDeg(Math.PI * 5)).toBeCloseTo(180, 12);
  });
});

describe('v2 二维向量工具（utils-vector-math）', () => {
  it('支持向量相加与按比例缩放且不修改输入', () => {
    coversCapabilities('utils-vector-math');
    const left = [1, 2] as const;
    const right = [3, 4] as const;
    expect(add2(left, right)).toEqual([4, 6]);
    expect(scale2(right, 2)).toEqual([6, 8]);
    expect(left).toEqual([1, 2]);
    expect(right).toEqual([3, 4]);
  });
});

describe('v2 曲线计算工具', () => {
  it('通过 lerp2 提供二维线性插值（utils-linear-interpolation）', () => {
    coversCapabilities('utils-linear-interpolation');
    expect(lerp2([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
  });

  it('通过 quadraticBezier2 提供二次贝塞尔计算（utils-quadratic-bezier）', () => {
    coversCapabilities('utils-quadratic-bezier');
    expect(quadraticBezier2([0, 0], [5, 10], [10, 0], 0.5)).toEqual([5, 5]);
  });
});

describe('v2 环坐标工具（utils-ring-close-trim）', () => {
  it('为未闭合环补充首坐标并返回独立副本', () => {
    coversCapabilities('utils-ring-close-trim');
    const ring = [
      [0, 0],
      [1, 0],
      [1, 1]
    ] as const;
    const closed = closeRing(ring);
    expect(closed).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0]
    ]);
    expect(closed).not.toBe(ring);
    expect(closed[0]).not.toBe(ring[0]);
    expect(closed.at(-1)).not.toBe(closed[0]);
  });

  it('不会为已闭合环重复补点，并能移除一个闭合坐标', () => {
    const ring = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0]
    ] as const;
    expect(closeRing(ring)).toEqual(ring);
    expect(trimClosingCoordinate(ring)).toEqual(ring.slice(0, -1));
  });

  it('保留三维坐标维度并安全处理空环和单点环', () => {
    const ring = [
      [0, 0, 2],
      [1, 0, 3]
    ] as const;
    expect(closeRing(ring)).toEqual([
      [0, 0, 2],
      [1, 0, 3],
      [0, 0, 2]
    ]);
    expect(closeRing([])).toEqual([]);
    expect(trimClosingCoordinate([[2, 3]])).toEqual([[2, 3]]);
  });
});

describe('v2 坐标数组转换工具', () => {
  it('把二维坐标按原顺序展开成独立的一维数组', () => {
    const coordinates = Object.freeze([Object.freeze([120, 0]), Object.freeze([110, 0])]);
    const result = toFlatCoordinates(coordinates);

    expect(result).toEqual([120, 0, 110, 0]);
    expect(result).not.toBe(coordinates);
    expect(coordinates).toEqual([
      [120, 0],
      [110, 0]
    ]);
  });

  it('支持空数组和三维坐标，但不推断坐标含义或转换投影', () => {
    expect(toFlatCoordinates([])).toEqual([]);
    expect(
      toFlatCoordinates([
        [1, 2, 3],
        [4, 5, 6]
      ])
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('旧样式与动画工具的 v2 能力映射', () => {
  it('使用内置箭头预设替代旧 createStyle（utils-arrow-style）', () => {
    coversCapabilities('utils-arrow-style');
    const style = stylePresets['arrow-default'];
    expect(style.strokes).toEqual([{ color: '#1677ff', width: 3, lineCap: 'round', lineJoin: 'round' }]);
    expect(style.decorations).toEqual([{ type: 'arrow', placement: 'end' }]);
    expect(stylePresets['arrow-default']).not.toBe(style);
  });

  it('使用统一 AnimationManager 的 pulse 替代旧 flash（utils-point-flash）', () => {
    coversCapabilities('utils-point-flash');
    const { manager, render } = createAnimationHarness([pointElement('flashing-point')]);
    const animations: AnimationManager = manager;
    const handle = animations.play({ id: 'flashing-point' }, { type: 'pulse', periodMs: 1_000, color: '#336699' });

    render.frame('default', 0);
    const batch = render.frame('default', 500);
    expect(handle.status).toBe('running');
    expect(batch.contributions).toEqual([
      expect.objectContaining({
        targetId: 'flashing-point',
        channel: 'pulse',
        value: expect.objectContaining({ primitives: [expect.objectContaining({ style: expect.objectContaining({ symbol: expect.any(Object) }) })] })
      })
    ]);

    handle.stop();
    manager.destroy();
    expect(render.activeLoopCount).toBe(0);
  });
});
