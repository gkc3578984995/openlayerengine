import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { animationTypes, createBuiltinAnimationRegistry } from '../src/builtins/animations/index.js';
import { dashFlowAnimationDefinition } from '../src/builtins/animations/dashFlow.js';
import { pathTravelAnimationDefinition } from '../src/builtins/animations/pathTravel.js';
import { pulseAnimationDefinition } from '../src/builtins/animations/pulse.js';
import { CapabilityError, InvalidArgumentError } from '../src/core/errors.js';
import type { RenderGeometryState } from '../src/core/shape/types.js';
import type { StyleSpec } from '../src/core/style/types.js';
import type { AnimationFrameContext } from '../src/services/animation/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { pointElement, polylineElement } from './helpers/animationHarness.js';

describe('内置动画定义', () => {
  it('以固定顺序公开三种 AnimationType 并完成注册', () => {
    expect(animationTypes).toEqual(['pulse', 'dash-flow', 'path-travel']);

    const registry = createBuiltinAnimationRegistry();
    expect(animationTypes.map((type) => registry.has(type))).toEqual([true, true, true]);
    expect(registry.get('pulse')).toBe(pulseAnimationDefinition);
    expect(registry.get('dash-flow')).toBe(dashFlowAnimationDefinition);
    expect(registry.get('path-travel')).toBe(pathTravelAnimationDefinition);
  });

  it('pulse 支持 Point 的 circle 与 icon 样式，并按周期完成单次播放', () => {
    coversCapabilities('animation-point-pulse');
    const state = pointElement('icon', {
      style: { symbol: { type: 'icon', src: 'data:image/png;base64,AA==', size: [24, 24], offset: [2, 3] } }
    });
    const geometry = { type: 'point', coordinates: [10, 20] } as const;
    const spec = pulseAnimationDefinition.normalize({ type: 'pulse', periodMs: 400, repeat: false, radius: 12, color: '#336699' });

    expect(() => pulseAnimationDefinition.assertCompatible(state, geometry)).not.toThrow();
    const active = pulseAnimationDefinition.frame(frameContext(state, geometry, state.style as StyleSpec, 200), spec);
    expect(active.finished).toBe(false);
    expect(active.value.primitives).toEqual([
      expect.objectContaining({
        geometry,
        style: expect.objectContaining({
          symbol: expect.objectContaining({
            type: 'circle',
            radius: 20.75,
            stroke: expect.objectContaining({ color: [51, 102, 153, 0.875], width: 1.125 })
          })
        })
      })
    ]);

    const complete = pulseAnimationDefinition.frame(frameContext(state, geometry, state.style as StyleSpec, 400), spec);
    expect(complete).toEqual({ value: { primitives: [] }, finished: true });
    expect(() => pulseAnimationDefinition.assertCompatible(state, polylineGeometry())).toThrowError(CapabilityError);
  });

  it('dash-flow 基于统一时间计算偏移且不修改元素原始 StyleSpec', () => {
    coversCapabilities('animation-polyline-dash-flow');
    const state = polylineElement('line');
    const geometry = polylineGeometry();
    const style: StyleSpec = {
      strokes: [
        { color: '#111111', width: 5, lineDash: [2, 3], lineDashOffset: 9 },
        { color: '#222222', width: 2 }
      ],
      decorations: [{ type: 'arrow', placement: 'end' }]
    };
    const original = structuredClone(style);
    const spec = dashFlowAnimationDefinition.normalize({ type: 'dash-flow', speed: 30, lineDash: [6, 2], color: '#abcdef' });

    const result = dashFlowAnimationDefinition.frame(frameContext(state, geometry, style, 1_500), spec);
    const rendered = result.value.primitives?.[0]?.style;

    expect(result.finished).toBe(false);
    expect(rendered?.strokes).toEqual([
      expect.objectContaining({ color: '#111111', lineDash: [2, 3], lineDashOffset: 9 }),
      expect.objectContaining({ color: '#abcdef', lineDash: [6, 2], lineDashOffset: -45 })
    ]);
    expect(rendered?.decorations).toEqual(style.decorations);
    expect(style).toEqual(original);
    const solid = dashFlowAnimationDefinition.frame(
      frameContext(state, geometry, { strokes: [{ color: '#123456', width: 2 }] }, 500),
      dashFlowAnimationDefinition.normalize({ type: 'dash-flow' })
    );
    expect(solid.value.primitives?.[0]?.style.strokes?.[0]).toEqual(expect.objectContaining({ lineDash: [10, 10], lineDashOffset: -12 }));
    expect(() => dashFlowAnimationDefinition.assertCompatible(state, { type: 'point', coordinates: [0, 0] })).toThrowError(CapabilityError);
  });

  it('path-travel 生成曲线路径、渐变尾迹、箭头和起终锚点', () => {
    coversCapabilities('animation-polyline-path-flight', 'animation-polyline-path-control');
    const state = polylineElement('flight');
    const geometry = polylineGeometry();
    const spec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 1_000,
      repeat: false,
      trailLength: 0.5,
      gradient: [
        [0, '#ff0000'],
        [0.5, '#00ff00'],
        [1, '#0000ff']
      ],
      width: 6,
      curvature: 0.6,
      smoothness: 20,
      arrow: true,
      arrowColor: '#ffffff',
      showStart: true,
      showEnd: true
    });

    const result = pathTravelAnimationDefinition.frame(frameContext(state, geometry, state.style as StyleSpec, 500), spec);
    const primitives = result.value.primitives ?? [];
    const lines = primitives.filter(({ geometry: candidate }) => candidate.type === 'polyline');
    const anchors = primitives.filter(({ geometry: candidate }) => candidate.type === 'point');

    expect(result.finished).toBe(false);
    expect(lines.length).toBeGreaterThan(2);
    expect(anchors).toHaveLength(2);
    expect(
      lines.some(({ geometry: candidate }) => candidate.type === 'polyline' && candidate.coordinates.some((coordinate) => Math.abs(coordinate[1]) > 0))
    ).toBe(true);
    expect(lines.at(-1)?.style).toEqual(
      expect.objectContaining({
        strokes: [expect.objectContaining({ width: 6 })],
        decorations: [expect.objectContaining({ type: 'arrow', placement: 'end', symbol: expect.objectContaining({ color: '#ffffff' }) })]
      })
    );
    expect(new Set(lines.map(({ style }) => style.strokes?.[0]?.color)).size).toBeGreaterThan(1);
    expect(
      lines.some(({ style }) => {
        const candidate = style.strokes?.[0]?.color;
        return Array.isArray(candidate) && candidate[0] > 0 && candidate[1] > 0;
      })
    ).toBe(true);
  });

  it('path-travel 单次建立累计长度并在几何未变化时复用路径缓存', () => {
    const state = polylineElement('cached-flight');
    const geometry = polylineGeometry();
    const spec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 1_000,
      curvature: 0.5,
      smoothness: 32,
      trailLength: 0.75,
      showStart: false,
      showEnd: false
    });
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      pathTravelAnimationDefinition.frame(frameContext(state, geometry, state.style as StyleSpec, 250), spec);
      expect(hypot).toHaveBeenCalledTimes(32);

      pathTravelAnimationDefinition.frame(frameContext(state, geometry, state.style as StyleSpec, 500), spec);
      expect(hypot).toHaveBeenCalledTimes(32);

      pathTravelAnimationDefinition.frame(frameContext(state, polylineGeometry(), state.style as StyleSpec, 600), spec);
      expect(hypot).toHaveBeenCalledTimes(64);

      pathTravelAnimationDefinition.frame(
        frameContext(
          state,
          {
            type: 'polyline',
            coordinates: [
              [0, 0],
              [200, 0]
            ]
          },
          state.style as StyleSpec,
          750
        ),
        spec
      );
      expect(hypot).toHaveBeenCalledTimes(96);
    } finally {
      hypot.mockRestore();
    }
  });

  it('path-travel 仅在同一动画记录实例内复用缓存，不与同 ID 的替换记录共享', () => {
    const state = polylineElement('cache-record');
    const geometry = polylineGeometry();
    const spec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 1_000,
      curvature: 0.5,
      smoothness: 8,
      showStart: false,
      showEnd: false
    });
    const firstInstance = {};
    const replacementInstance = {};
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      pathTravelAnimationDefinition.frame(frameContext(state, geometry, state.style as StyleSpec, 100, firstInstance), spec);
      pathTravelAnimationDefinition.frame(frameContext(state, geometry, state.style as StyleSpec, 200, firstInstance), spec);
      expect(hypot).toHaveBeenCalledTimes(8);

      pathTravelAnimationDefinition.frame(frameContext(state, geometry, state.style as StyleSpec, 200, replacementInstance), spec);
      expect(hypot).toHaveBeenCalledTimes(16);
    } finally {
      hypot.mockRestore();
    }
  });

  it('path-travel 为一万条并行动画保留独立弱缓存，连续帧不因固定容量发生重算', () => {
    const geometry = polylineGeometry();
    const spec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 1_000,
      curvature: 0,
      smoothness: 2,
      arrow: false,
      showStart: false,
      showEnd: false
    });
    const records = Array.from({ length: 10_000 }, (_, index) => ({ instance: {}, state: polylineElement(`cached-${index}`) }));
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      for (const record of records) {
        pathTravelAnimationDefinition.frame(frameContext(record.state, geometry, record.state.style as StyleSpec, 100, record.instance), spec);
      }
      expect(hypot).toHaveBeenCalledTimes(10_000);

      for (const record of records) {
        pathTravelAnimationDefinition.frame(frameContext(record.state, geometry, record.state.style as StyleSpec, 200, record.instance), spec);
      }
      expect(hypot).toHaveBeenCalledTimes(10_000);
    } finally {
      hypot.mockRestore();
    }
  });

  it('path-travel 记录缓存保持 WeakMap GC 语义且不复制整条源坐标', () => {
    const source = readFileSync(new URL('../src/builtins/animations/pathTravel.ts', import.meta.url), 'utf8');

    expect(source).toContain('const travelPathCache = new WeakMap<object, TravelPathMetrics>()');
    expect(source).toContain('sourceCoordinates: coordinates');
    expect(source).not.toContain('sourceCoordinates: coordinates.map');
    expect(source).not.toMatch(/const travelPathCache\s*=\s*new Map/);
  });

  it('path-travel 分别实现 remove 与 retain 结束行为和纯色结束锚线', () => {
    const state = polylineElement('flight');
    const geometry = polylineGeometry();
    const removedSpec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 100,
      repeat: false,
      finishBehavior: 'remove'
    });
    const retainedSpec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 100,
      repeat: false,
      finishBehavior: 'retain',
      color: '#123456',
      endLineColor: '#fedcba',
      gradient: [
        [0, '#ff0000'],
        [1, '#0000ff']
      ],
      arrow: false,
      showStart: false,
      showEnd: false
    });

    expect(pathTravelAnimationDefinition.frame(frameContext(state, geometry, state.style as StyleSpec, 100), removedSpec)).toEqual({
      value: { primitives: [] },
      finished: true
    });
    const retained = pathTravelAnimationDefinition.frame(frameContext(state, geometry, state.style as StyleSpec, 100), retainedSpec);
    expect(retained.finished).toBe(true);
    expect(retained.retain).toBe(true);
    expect(retained.value.primitives).toHaveLength(1);
    expect(retained.value.primitives?.[0]?.style.strokes?.[0]?.color).toBe('#fedcba');
    const retainedGeometry = retained.value.primitives?.[0]?.geometry;
    expect(retainedGeometry?.type).toBe('polyline');
    if (retainedGeometry?.type !== 'polyline') throw new Error('应生成折线路径');
    expect(retainedGeometry.coordinates[0]).toEqual([0, 0]);
    expect(retainedGeometry.coordinates.at(-1)).toEqual([100, 0]);
  });

  it('严格拒绝互斥参数、未知字段和无效渐变', () => {
    expect(() => pathTravelAnimationDefinition.normalize({ type: 'path-travel', speed: 10, durationMs: 100 } as never)).toThrowError(InvalidArgumentError);
    expect(() => pathTravelAnimationDefinition.normalize({ type: 'path-travel', gradient: [[0, '#fff']] } as never)).toThrowError(InvalidArgumentError);
    expect(() =>
      pathTravelAnimationDefinition.normalize({
        type: 'path-travel',
        gradient: [
          [0.5, '#fff'],
          [0.2, '#000']
        ]
      } as never)
    ).toThrowError(InvalidArgumentError);
    expect(() => pulseAnimationDefinition.normalize({ type: 'pulse', unknown: true } as never)).toThrowError(InvalidArgumentError);
    expect(() => dashFlowAnimationDefinition.normalize({ type: 'dash-flow', lineDash: [0, 0] })).toThrowError(InvalidArgumentError);
  });

  it('严格拒绝动画数组访问器且不执行 getter', () => {
    const getter = vi.fn(() => 4);
    const lineDash = [2];
    Object.defineProperty(lineDash, 1, { enumerable: true, get: getter });
    Object.defineProperty(lineDash, 'length', { value: 2 });

    expect(() => dashFlowAnimationDefinition.normalize({ type: 'dash-flow', lineDash })).toThrowError(InvalidArgumentError);
    expect(getter).not.toHaveBeenCalled();

    const colorGetter = vi.fn(() => 255);
    const colorTuple = [0, 0, 0];
    Object.defineProperty(colorTuple, 1, { enumerable: true, get: colorGetter });
    expect(() => pulseAnimationDefinition.normalize({ type: 'pulse', color: colorTuple as never })).toThrowError(InvalidArgumentError);
    expect(colorGetter).not.toHaveBeenCalled();

    const stopGetter = vi.fn(() => '#ffffff');
    const stop = [0];
    Object.defineProperty(stop, 1, { enumerable: true, get: stopGetter });
    Object.defineProperty(stop, 'length', { value: 2 });
    expect(() => pathTravelAnimationDefinition.normalize({ type: 'path-travel', gradient: [stop, [1, '#000000']] } as never)).toThrowError(
      InvalidArgumentError
    );
    expect(stopGetter).not.toHaveBeenCalled();
  });
});

function frameContext(
  state: ReturnType<typeof pointElement> | ReturnType<typeof polylineElement>,
  geometry: RenderGeometryState,
  style: StyleSpec,
  elapsedMs: number,
  instance: object = state
): AnimationFrameContext {
  return { instance, state, geometry, style, elapsedMs, resolution: 1 };
}

function polylineGeometry(): RenderGeometryState {
  return {
    type: 'polyline',
    coordinates: [
      [0, 0],
      [100, 0]
    ]
  };
}
