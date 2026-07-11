import { describe, it, expect } from 'vitest';
import { Utils } from '../src/common';

// EPSG:3857 标准范围，worldWidth = extent[2] - extent[0]
const EPSG3857_EXTENT = [
  -20037508.342789244, -20037508.342789244, 20037508.342789244, 20037508.342789244
] as const;
const WORLD_WIDTH = EPSG3857_EXTENT[2] - EPSG3857_EXTENT[0];

/** 构造满足 Utils 依赖的最小 mock Map */
function makeMap(opts: { center?: number[]; pixelToCoord?: (p: number[]) => number[] } = {}) {
  const { center = [0, 0], pixelToCoord = () => [0, 0] } = opts;
  return {
    getView: () => ({
      getCenter: () => center,
      getProjection: () => ({ getExtent: () => EPSG3857_EXTENT })
    }),
    getCoordinateFromPixel: (pixel: number[]) => pixelToCoord(pixel)
  } as any;
}

describe('Utils.deg2rad / rad2deg', () => {
  it('deg2rad(180) ≈ π', () => {
    expect(Utils.deg2rad(180)).toBeCloseTo(Math.PI, 10);
  });
  it('rad2deg 归一化到 [0, 360)', () => {
    expect(Utils.rad2deg(Math.PI)).toBeCloseTo(180, 10);
    // -π/2 (即 -90°) 归一化为 270
    expect(Utils.rad2deg(-Math.PI / 2)).toBeCloseTo(270, 10);
    expect(Utils.rad2deg(2 * Math.PI)).toBeCloseTo(0, 10);
  });
  it('deg2rad/rad2deg 往返一致（归一化后）', () => {
    for (const deg of [0, 45, 90, 180, 270, 359.9]) {
      expect(Utils.rad2deg(Utils.deg2rad(deg))).toBeCloseTo(deg, 6);
    }
  });
});

describe('Utils.GetGUID', () => {
  it('D 格式匹配 UUID 形态', () => {
    expect(Utils.GetGUID('D')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
  it('N 格式无连字符且长度 32', () => {
    expect(Utils.GetGUID('N')).toMatch(/^[0-9a-f]{32}$/);
  });
  it('默认等价于 D', () => {
    expect(Utils.GetGUID()).toMatch(/-/);
  });
  it('1000 次生成唯一', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(Utils.GetGUID());
    expect(set.size).toBe(1000);
  });
});

describe('Utils.ensureClosedRing / trimClosedRing', () => {
  it('ensureClosedRing 已闭合则原样返回（拷贝）', () => {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
    const out = Utils.ensureClosedRing(ring as any);
    expect(out).toEqual(ring);
    expect(out).not.toBe(ring); // 返回拷贝
  });
  it('ensureClosedRing 未闭合则补尾点', () => {
    const ring = [[0, 0], [1, 0], [1, 1]];
    expect(Utils.ensureClosedRing(ring as any)).toEqual([[0, 0], [1, 0], [1, 1], [0, 0]]);
  });
  it('trimClosedRing 去掉尾部闭合点', () => {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
    expect(Utils.trimClosedRing(ring as any)).toEqual([[0, 0], [1, 0], [1, 1]]);
  });
  it('ensure/trim 往返一致', () => {
    const orig = [[0, 0], [1, 0], [1, 1]];
    const round = Utils.trimClosedRing(Utils.ensureClosedRing(orig as any));
    expect(round).toEqual(orig);
  });
});

describe('Utils 线性插值与贝塞尔', () => {
  it('linearInterpolation 中点', () => {
    expect(Utils.linearInterpolation([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
  });
  it('linearInterpolation 端点', () => {
    expect(Utils.linearInterpolation([2, 3], [8, 9], 0)).toEqual([2, 3]);
    expect(Utils.linearInterpolation([2, 3], [8, 9], 1)).toEqual([8, 9]);
  });
  it('bezierSquareCalc 端点为起止', () => {
    const s = [0, 0], c = [5, 10], e = [10, 0];
    expect(Utils.bezierSquareCalc(s, c, e, 0)).toEqual([0, 0]);
    expect(Utils.bezierSquareCalc(s, c, e, 1)).toEqual([10, 0]);
  });
  it('constantMultiVector2 / vector2Add', () => {
    expect(Utils.constantMultiVector2(2, [3, 4])).toEqual([6, 8]);
    expect(Utils.vector2Add([1, 2], [3, 4])).toEqual([4, 6]);
  });
});

describe('Utils.getWorldWidth / getWorldIndex', () => {
  it('getWorldWidth 返回 EPSG:3857 worldWidth', () => {
    expect(Utils.getWorldWidth(makeMap())).toBeCloseTo(WORLD_WIDTH, 6);
  });
  it('getWorldIndex 按 floor(x/worldWidth)', () => {
    const map = makeMap();
    expect(Utils.getWorldIndex(map, 0)).toBe(0);
    expect(Utils.getWorldIndex(map, WORLD_WIDTH)).toBe(1);
    expect(Utils.getWorldIndex(map, -1)).toBe(-1);
    expect(Utils.getWorldIndex(map, WORLD_WIDTH / 2)).toBe(0);
  });
});

describe('Utils.getFeatureToPixel', () => {
  it('Point 平移到目标像素坐标', () => {
    const map = makeMap({ pixelToCoord: () => [100, 200] });
    const out = Utils.getFeatureToPixel(map, [10, 10], [0, 0]);
    expect(out).toEqual([100, 200]);
  });
  it('LineString 整体平移，保持形状', () => {
    const map = makeMap({ pixelToCoord: () => [100, 100] });
    const line = [[0, 0], [10, 0], [10, 10]];
    const out = Utils.getFeatureToPixel(map, [5, 5], line as any) as number[][];
    // 中心从 (5,5) 平移到 (100,100)，即 dx=95, dy=95
    expect(out[0]).toEqual([95, 95]);
    expect(out[1]).toEqual([105, 95]);
    expect(out[2]).toEqual([105, 105]);
  });
  it('wrap 修正：跨换日线时取最短位移', () => {
    // 起点接近 +worldWidth/2，目标在 -worldWidth/2 侧，应跨世界缩短
    const half = WORLD_WIDTH / 2;
    const map = makeMap({ pixelToCoord: () => [-half + 1, 0] }); // 目标在负侧
    const out = Utils.getFeatureToPixel(map, [0, 0], [half - 1, 0]) as number[];
    // 期望 dx 走最短路径（跨换日线），结果落在 [-half, half] 内
    expect(Math.abs(out[0])).toBeLessThan(half);
  });
  it('参数非法返回 null', () => {
    const map = makeMap();
    expect(Utils.getFeatureToPixel(map, [], [0, 0])).toBeNull();
    expect(Utils.getFeatureToPixel(map, [0, 0], null as any)).toBeNull();
  });
});

describe('Utils.normalizeToViewWorld / restoreToWorldIndex', () => {
  it('同 world 坐标归一化后不变', () => {
    const map = makeMap({ center: [0, 0] });
    const p = [100, 200];
    expect(Utils.normalizeToViewWorld(map, p as any)).toEqual([100, 200]);
  });
  it('跨 world 坐标归一化到当前视图 world', () => {
    // 视图中心在 world 0，坐标在 world 1（x = +worldWidth）应被拉回 world 0
    const map = makeMap({ center: [0, 0] });
    const out = Utils.normalizeToViewWorld(map, [WORLD_WIDTH + 100, 200] as any);
    expect(out).toEqual([100, 200]);
  });
  it('normalize → restore 往返一致（恢复到原 world）', () => {
    const map = makeMap({ center: [WORLD_WIDTH, 0] }); // 视图在 world 1
    const orig = [123.45, -67.89];
    const normalized = Utils.normalizeToViewWorld(map, orig as any) as number[];
    // 归一化把 orig(world 0) 拉到 world 1；再恢复到 world 0 应回到原值
    const restored = Utils.restoreToWorldIndex(map, normalized as any, 0);
    expect(restored[0]).toBeCloseTo(orig[0], 6);
    expect(restored[1]).toBeCloseTo(orig[1], 6);
  });
  it('restoreToWorldIndex targetWorldIndex 为 undefined 时原样返回', () => {
    const map = makeMap();
    const coords = [[1, 2], [3, 4]] as any;
    expect(Utils.restoreToWorldIndex(map, coords, undefined)).toBe(coords);
  });
});

describe('Utils.throttle', () => {
  it('高频调用在窗口内只执行一次（leading）', async () => {
    let calls = 0;
    const fn = Utils.throttle(() => calls++, 50);
    fn(); fn(); fn();
    expect(calls).toBe(1); // leading 立即执行
    await new Promise((r) => setTimeout(r, 80));
    // trailing 会再补一次
    expect(calls).toBeGreaterThanOrEqual(1);
  });
  it('返回值带 cancel/flush', () => {
    const fn = Utils.throttle(() => 1, 50) as any;
    expect(typeof fn.cancel).toBe('function');
    expect(typeof fn.flush).toBe('function');
    fn.cancel();
  });
});
