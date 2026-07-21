import { describe, expect, it, vi } from 'vitest';
import { animationTypes, createBuiltinAnimationRegistry } from '../src/builtins/animations/index.js';
import { dashFlowAnimationDefinition } from '../src/builtins/animations/dashFlow.js';
import { pathTravelAnimationDefinition } from '../src/builtins/animations/pathTravel.js';
import { pulseAnimationDefinition } from '../src/builtins/animations/pulse.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import type { ElementState } from '../src/core/element/types.js';
import { CapabilityError, InvalidArgumentError } from '../src/core/errors.js';
import type { RenderGeometryState, ShapeDefinition } from '../src/core/shape/types.js';
import type { StyleSpec } from '../src/core/style/types.js';
import { createAnimationFrameBuffer } from '../src/services/animation/AnimationFrameBuffer.js';
import type {
  AnimationFrameBuffer,
  AnimationFrameContext,
  AnimationRuntime,
  AnimationSlotDefinition,
  AnimationTargetProfile
} from '../src/services/animation/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { pointElement, polylineElement } from './helpers/animationHarness.js';

describe('内置动画定义', () => {
  it('以固定追加顺序公开全部 AnimationType 并完成注册', () => {
    expect(animationTypes).toEqual(['pulse', 'dash-flow', 'path-travel', 'blink', 'highlight', 'alert', 'grow', 'radar-scan', 'center-spread', 'fade']);

    const registry = createBuiltinAnimationRegistry();
    expect(animationTypes.every((type) => registry.has(type))).toBe(true);
    expect(registry.get('pulse')).toBe(pulseAnimationDefinition);
    expect(registry.get('dash-flow')).toBe(dashFlowAnimationDefinition);
    expect(registry.get('path-travel')).toBe(pathTravelAnimationDefinition);
  });

  it('保留旧动画的关键默认值', () => {
    expect(pulseAnimationDefinition.normalize({ type: 'pulse' })).toMatchObject({
      channel: 'pulse',
      periodMs: 1_000,
      color: '#ff0000',
      repeat: true,
      radius: 6
    });
    expect(dashFlowAnimationDefinition.normalize({ type: 'dash-flow' })).toMatchObject({ channel: 'dash-flow', speed: 24 });
    expect(pathTravelAnimationDefinition.normalize({ type: 'path-travel' })).toMatchObject({
      channel: 'path-travel',
      durationMs: 2_000,
      repeat: true,
      trailLength: 0.25,
      width: 2,
      curvature: 0,
      smoothness: 180,
      showStart: true,
      showEnd: true,
      finishBehavior: 'remove'
    });
  });

  it('pulse 支持 Point 的 circle 与 icon 样式，并按周期完成单次播放', () => {
    coversCapabilities('animation-point-pulse');
    const state = pointElement('icon', {
      style: { symbol: { type: 'icon', src: 'data:image/png;base64,AA==', size: [24, 24], offset: [2, 3] } }
    });
    const geometry = { type: 'point', coordinates: [10, 20] } as const;
    const target = targetProfile(state, geometry, state.style as StyleSpec);
    const spec = pulseAnimationDefinition.normalize({ type: 'pulse', periodMs: 400, repeat: false, radius: 12, color: '#336699' });

    expect(() => pulseAnimationDefinition.assertCompatible(target)).not.toThrow();
    const runtime = pulseAnimationDefinition.create(target, spec);
    const buffer = createAnimationFrameBuffer(runtime.slots);
    const active = sample(runtime, buffer, target, 200);
    const ring = buffer.overlay('pulse-ring');

    expect(active).toEqual({ finished: false, schedule: { kind: 'continuous' }, wakeAtElapsedMs: 400 });
    expect(runtime.slots).toEqual([
      expect.objectContaining({
        slotKey: 'pulse-ring',
        style: expect.objectContaining({
          symbol: expect.objectContaining({ type: 'circle', radius: 12, stroke: expect.objectContaining({ color: '#336699', width: 1 }) })
        }),
        dynamicParameters: ['symbolRadius', 'strokeWidth']
      })
    ]);
    expect(ring).toEqual(
      expect.objectContaining({
        active: true,
        geometryKind: 'snapshot',
        geometry,
        opacity: 0.875,
        symbolRadius: 20.75,
        strokeWidth: 1.125
      })
    );

    expect(sample(runtime, buffer, target, 400)).toEqual({ finished: true, schedule: { kind: 'stable' } });
    expect(buffer.overlays.every(({ active: visible }) => !visible)).toBe(true);
    expect(() => pulseAnimationDefinition.assertCompatible(targetProfile(polylineElement('line'), polylineGeometry(), { strokes: [] }))).toThrowError(
      CapabilityError
    );
  });

  it('dash-flow 基于统一时间写入动态偏移且不修改元素原始 StyleSpec', () => {
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
    const target = targetProfile(state, geometry, style);
    const spec = dashFlowAnimationDefinition.normalize({ type: 'dash-flow', speed: 30, lineDash: [6, 2], color: '#abcdef' });
    const runtime = dashFlowAnimationDefinition.create(target, spec);
    const buffer = createAnimationFrameBuffer(runtime.slots);

    const result = sample(runtime, buffer, target, 1_500);
    const rendered = runtime.slots[0].style;

    expect(result).toEqual({ finished: false, schedule: { kind: 'continuous' } });
    expect(rendered.strokes).toEqual([
      expect.objectContaining({ color: '#111111', lineDash: [2, 3], lineDashOffset: 9 }),
      expect.objectContaining({ color: '#abcdef', lineDash: [6, 2] })
    ]);
    expect(rendered.decorations).toEqual(style.decorations);
    expect(buffer.overlay('dash-flow')).toEqual(
      expect.objectContaining({ active: true, geometryKind: 'effective-target', lineDashOffset: -45, lineDashOffsetStrokeIndex: 1 })
    );
    expect(style).toEqual(original);

    const solidStyle: StyleSpec = { strokes: [{ color: '#123456', width: 2 }] };
    const solidTarget = targetProfile(state, geometry, solidStyle);
    const solidSpec = dashFlowAnimationDefinition.normalize({ type: 'dash-flow' });
    const solidRuntime = dashFlowAnimationDefinition.create(solidTarget, solidSpec);
    const solidBuffer = createAnimationFrameBuffer(solidRuntime.slots);
    sample(solidRuntime, solidBuffer, solidTarget, 500);
    expect(solidRuntime.slots[0].style.strokes?.[0]).toEqual(expect.objectContaining({ lineDash: [10, 10] }));
    expect(solidBuffer.overlay('dash-flow').lineDashOffset).toBe(-12);
    expect(solidBuffer.overlay('dash-flow').lineDashOffsetStrokeIndex).toBe(0);

    const emptyStrokeTarget = targetProfile(state, geometry, { strokes: [] });
    const emptyStrokeRuntime = dashFlowAnimationDefinition.create(emptyStrokeTarget, solidSpec);
    const emptyStrokeBuffer = createAnimationFrameBuffer(emptyStrokeRuntime.slots);
    sample(emptyStrokeRuntime, emptyStrokeBuffer, emptyStrokeTarget, 500);
    expect(emptyStrokeBuffer.overlay('dash-flow')).toEqual(
      expect.objectContaining({ active: true, lineDashOffset: undefined, lineDashOffsetStrokeIndex: undefined })
    );
    expect(() => dashFlowAnimationDefinition.assertCompatible(targetProfile(pointElement('point'), pointGeometry(), pointStyle()))).toThrowError(
      CapabilityError
    );
  });

  it('dash-flow 为每条 linework 虚线轨道建立独立 slot，并保留各自基础相位', () => {
    const state = polylineElement('linework-dash');
    const geometry = polylineGeometry();
    const style: StyleSpec = {
      linework: {
        tracks: [
          { offset: -3, stroke: { color: '#111111', width: 2, lineDash: [8, 6], lineDashOffset: 2 } },
          { offset: 3, stroke: { color: '#222222', width: 2 } },
          { offset: 7, stroke: { color: '#333333', width: 1, lineDash: [3, 4], lineDashOffset: 9 } }
        ],
        decorations: [
          {
            placement: { kind: 'repeat', spacing: 24 },
            sequence: [
              {
                primitives: [{ type: 'segment', from: [0, -5], to: [0, 5], stroke: { color: '#111111', width: 1 } }]
              }
            ]
          }
        ],
        contour: { kind: 'open' }
      }
    };
    const original = structuredClone(style);
    const target = targetProfile(state, geometry, style);
    const spec = dashFlowAnimationDefinition.normalize({ type: 'dash-flow', speed: 30, lineDash: [5, 5], color: '#abcdef' });
    const runtime = dashFlowAnimationDefinition.create(target, spec);
    const buffer = createAnimationFrameBuffer(runtime.slots);

    expect(runtime.slots.map(({ slotKey }) => slotKey)).toEqual(['dash-flow-track-0', 'dash-flow-track-2']);
    for (const slot of runtime.slots) {
      expect(slot.style.linework?.tracks).toHaveLength(1);
      expect(slot.style.linework?.tracks[0].stroke).toEqual(expect.objectContaining({ color: '#abcdef', lineDash: [5, 5] }));
      expect(slot.style.linework?.decorations).toBeUndefined();
      expect(slot.style.linework?.caps).toBeUndefined();
      expect(slot.style.linework?.inlineText).toBeUndefined();
    }

    sample(runtime, buffer, target, 1_000);
    expect(buffer.overlay('dash-flow-track-0')).toEqual(
      expect.objectContaining({ active: true, geometryKind: 'effective-target', lineDashOffset: -28, lineDashOffsetStrokeIndex: undefined })
    );
    expect(buffer.overlay('dash-flow-track-2')).toEqual(
      expect.objectContaining({ active: true, geometryKind: 'effective-target', lineDashOffset: -21, lineDashOffsetStrokeIndex: undefined })
    );
    expect(style).toEqual(original);

    const solid = targetProfile(state, geometry, {
      linework: { tracks: [{ offset: 0, stroke: { color: '#f00', width: 2 } }], contour: { kind: 'open' } }
    });
    expect(() => dashFlowAnimationDefinition.assertCompatible(solid)).toThrowError(CapabilityError);
    expect(() => dashFlowAnimationDefinition.create(solid, spec)).toThrowError(CapabilityError);
  });

  it('dash-flow accepts a closed Polygon linework track', () => {
    const state: ElementState = {
      id: 'polygon-dash',
      type: 'polygon',
      geometry: {
        type: 'polygon',
        controlPoints: [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100]
        ]
      },
      style: {},
      module: 'areas',
      layerId: 'default',
      visible: true
    };
    const geometry: RenderGeometryState = {
      type: 'polygon',
      coordinates: [
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0]
        ]
      ]
    };
    const style: StyleSpec = {
      linework: {
        tracks: [{ offset: 0, stroke: { color: '#f00', width: 2, lineDash: [8, 4], lineDashOffset: 2 } }],
        contour: { kind: 'closed', rings: 'outer', seam: 'preserve-spacing' }
      }
    };
    const target = targetProfile(state, geometry, style);
    const spec = dashFlowAnimationDefinition.normalize({ type: 'dash-flow', speed: 24 });

    expect(() => dashFlowAnimationDefinition.assertCompatible(target)).not.toThrow();
    const runtime = dashFlowAnimationDefinition.create(target, spec);
    const buffer = createAnimationFrameBuffer(runtime.slots);
    sample(runtime, buffer, target, 500);

    expect(runtime.slots).toHaveLength(1);
    expect(runtime.slots[0].style.linework?.contour?.kind).toBe('closed');
    expect(buffer.overlay('dash-flow-track-0')).toEqual(expect.objectContaining({ active: true, geometryKind: 'effective-target', lineDashOffset: -10 }));
  });

  it.each([
    {
      name: 'inline text',
      style: {
        linework: {
          tracks: [{ offset: 0, stroke: { color: '#f00', width: 2, lineDash: [8, 4] } }],
          inlineText: {
            text: 'AB',
            fontFamily: 'sans-serif',
            fontSize: 12,
            fontWeight: 'normal',
            fontStyle: 'normal',
            fill: { type: 'solid', color: '#000' },
            gapPadding: 2
          },
          contour: { kind: 'open' }
        }
      } satisfies StyleSpec
    },
    {
      name: 'center decoration',
      style: {
        linework: {
          tracks: [{ offset: 0, stroke: { color: '#f00', width: 2, lineDash: [8, 4] } }],
          decorations: [
            {
              placement: { kind: 'center' },
              glyph: { primitives: [{ type: 'circle', center: [0, 0], radius: 4, fill: { type: 'solid', color: '#000' } }] }
            }
          ],
          contour: { kind: 'open' }
        }
      } satisfies StyleSpec
    },
    {
      name: 'repeated center decoration',
      style: {
        linework: {
          tracks: [{ offset: 0, stroke: { color: '#f00', width: 2, lineDash: [8, 4] } }],
          decorations: [
            {
              placement: { kind: 'repeat', spacing: 32, phase: 0 },
              sequence: [{ primitives: [{ type: 'circle', center: [0, 0], radius: 4, fill: { type: 'solid', color: '#000' } }] }],
              cutoutPadding: 3
            }
          ],
          contour: { kind: 'open' }
        }
      } satisfies StyleSpec
    }
  ])('dash-flow keeps a transparent $name placeholder for the linework cutout', ({ style }) => {
    const state = polylineElement('cutout');
    const target = targetProfile(state, polylineGeometry(), style);
    const runtime = dashFlowAnimationDefinition.create(target, dashFlowAnimationDefinition.normalize({ type: 'dash-flow' }));
    const overlay = runtime.slots[0].style.linework;

    if (style.linework?.inlineText !== undefined) {
      expect(overlay?.inlineText?.fill.color).toEqual([0, 0, 0, 0]);
    } else {
      const decoration = overlay?.decorations?.[0];
      const primitive = decoration?.placement.kind === 'repeat' ? decoration.sequence[0]?.primitives[0] : decoration?.glyph.primitives[0];
      expect(primitive?.type).toBe('circle');
      if (primitive?.type === 'circle') expect(primitive.fill?.color).toEqual([0, 0, 0, 0]);
      if (decoration?.placement.kind === 'repeat') {
        expect(decoration.placement).toEqual({ kind: 'repeat', spacing: 32, phase: 0 });
        expect(decoration.cutoutPadding).toBe(3);
      }
    }
  });

  it('path-travel 使用固定渐变槽生成曲线路径和起终锚点', () => {
    coversCapabilities('animation-polyline-path-flight', 'animation-polyline-path-control');
    const state = polylineElement('flight');
    const geometry = polylineGeometry();
    const target = targetProfile(state, geometry, state.style as StyleSpec);
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
      showStart: true,
      showEnd: true
    });
    const runtime = pathTravelAnimationDefinition.create(target, spec);
    const slots = runtime.slots;
    const buffer = createAnimationFrameBuffer(slots);

    const result = sample(runtime, buffer, target, 500);
    const active = activeSlots(slots, buffer);
    const trail = active.filter(({ definition }) => definition.slotKey.startsWith('trail-'));
    const anchors = active.filter(({ definition }) => definition.slotKey === 'start' || definition.slotKey === 'end');

    expect(result).toEqual({ finished: false, schedule: { kind: 'continuous' }, wakeAtElapsedMs: 1_000 });
    expect(slots.filter(({ slotKey }) => slotKey.startsWith('trail-'))).toHaveLength(24);
    expect(trail.length).toBeGreaterThan(2);
    expect(trail.length).toBeLessThanOrEqual(24);
    expect(anchors).toHaveLength(2);
    expect(trail.some(({ value }) => value.geometry?.type === 'polyline' && value.geometry.coordinates.some((coordinate) => Math.abs(coordinate[1]) > 0))).toBe(
      true
    );
    expect(slots.some(({ slotKey }) => slotKey === 'arrow')).toBe(false);
    expect(slots.every(({ style }) => style.decorations === undefined)).toBe(true);
    expect(new Set(trail.map(({ definition }) => JSON.stringify(definition.style.strokes?.[0]?.color))).size).toBeGreaterThan(1);
    expect(
      trail.some(({ definition }) => {
        const candidate = definition.style.strokes?.[0]?.color;
        return Array.isArray(candidate) && candidate[0] > 0 && candidate[1] > 0;
      })
    ).toBe(true);

    sample(runtime, buffer, target, 750);
    expect(runtime.slots).toBe(slots);
  });

  it('path-travel 的默认纯色尾迹不创建方向 Decoration', () => {
    const state = polylineElement('solid-flight');
    const target = targetProfile(state, polylineGeometry(), state.style as StyleSpec);
    const spec = pathTravelAnimationDefinition.normalize({ type: 'path-travel', showStart: false, showEnd: false });
    const runtime = pathTravelAnimationDefinition.create(target, spec);

    expect(runtime.slots.map(({ slotKey }) => slotKey)).toEqual(['trail-0', 'retained-line']);
    expect(runtime.slots.every(({ style }) => style.decorations === undefined)).toBe(true);
  });

  it('path-travel 在 Runtime 内复用路径缓存，并在 rebind 时重建', () => {
    const state = polylineElement('cached-flight');
    const geometry = polylineGeometry();
    const style = state.style as StyleSpec;
    const target = targetProfile(state, geometry, style);
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
      const runtime = pathTravelAnimationDefinition.create(target, spec);
      const buffer = createAnimationFrameBuffer(runtime.slots);
      expect(hypot).toHaveBeenCalledTimes(32);

      sample(runtime, buffer, target, 250);
      sample(runtime, buffer, target, 500);
      expect(hypot).toHaveBeenCalledTimes(32);

      const rebound = targetProfile(state, polylineGeometry(), style);
      runtime.rebind(rebound);
      expect(hypot).toHaveBeenCalledTimes(64);
      sample(runtime, buffer, rebound, 600);
      expect(hypot).toHaveBeenCalledTimes(64);

      const changed = targetProfile(
        state,
        {
          type: 'polyline',
          coordinates: [
            [0, 0],
            [200, 0]
          ]
        },
        style
      );
      runtime.rebind(changed);
      expect(hypot).toHaveBeenCalledTimes(96);
      sample(runtime, buffer, changed, 750);
      expect(hypot).toHaveBeenCalledTimes(96);
      runtime.destroy();
    } finally {
      hypot.mockRestore();
    }
  });

  it('path-travel 用固定槽把低采样渐变铺满完整色域', () => {
    const state = polylineElement('low-smoothness');
    const target = targetProfile(state, polylineGeometry(), state.style as StyleSpec);
    const spec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 1_000,
      repeat: false,
      trailLength: 0.5,
      gradient: [
        [0, '#ff0000'],
        [1, '#0000ff']
      ],
      smoothness: 8,
      showStart: false,
      showEnd: false
    });
    const runtime = pathTravelAnimationDefinition.create(target, spec);
    const buffer = createAnimationFrameBuffer(runtime.slots);

    sample(runtime, buffer, target, 250);
    const active = activeSlots(runtime.slots, buffer).filter(({ definition }) => definition.slotKey.startsWith('trail-'));
    expect(active.map(({ definition }) => definition.slotKey)).toEqual(['trail-0', 'trail-23']);
    expect(active.map(({ definition }) => definition.style.strokes?.[0]?.color)).toEqual([
      [255, 0, 0, 1],
      [0, 0, 255, 1]
    ]);

    const singleSpec = pathTravelAnimationDefinition.normalize({ ...spec, smoothness: 1 });
    const singleRuntime = pathTravelAnimationDefinition.create(target, singleSpec);
    const singleBuffer = createAnimationFrameBuffer(singleRuntime.slots);
    sample(singleRuntime, singleBuffer, target, 100);
    const single = activeSlots(singleRuntime.slots, singleBuffer).filter(({ definition }) => definition.slotKey.startsWith('trail-'));
    expect(single.map(({ definition }) => definition.slotKey)).toEqual(['trail-0', 'trail-23']);

    sample(singleRuntime, singleBuffer, target, 0);
    const stationary = activeSlots(singleRuntime.slots, singleBuffer).filter(({ definition }) => definition.slotKey.startsWith('trail-'));
    expect(stationary.map(({ definition }) => definition.slotKey)).toEqual(['trail-23']);
    expect(stationary[0]?.definition.style.strokes?.[0]?.color).toEqual([0, 0, 255, 1]);
  });

  it('path-travel 的替换记录拥有独立 Runtime 缓存', () => {
    const state = polylineElement('cache-record');
    const target = targetProfile(state, polylineGeometry(), state.style as StyleSpec);
    const spec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 1_000,
      curvature: 0.5,
      smoothness: 8,
      showStart: false,
      showEnd: false
    });
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      const firstRuntime = pathTravelAnimationDefinition.create(target, spec);
      const firstBuffer = createAnimationFrameBuffer(firstRuntime.slots);
      sample(firstRuntime, firstBuffer, target, 100);
      sample(firstRuntime, firstBuffer, target, 200);
      expect(hypot).toHaveBeenCalledTimes(8);

      const replacementRuntime = pathTravelAnimationDefinition.create(target, spec);
      const replacementBuffer = createAnimationFrameBuffer(replacementRuntime.slots);
      sample(replacementRuntime, replacementBuffer, target, 200);
      expect(hypot).toHaveBeenCalledTimes(16);
      firstRuntime.destroy();
      replacementRuntime.destroy();
    } finally {
      hypot.mockRestore();
    }
  });

  it('path-travel 为一万条并行动画保留独立 Runtime 缓存，连续帧不重算', () => {
    const geometry = polylineGeometry();
    const spec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 1_000,
      curvature: 0,
      smoothness: 2,
      showStart: false,
      showEnd: false
    });
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      const records = Array.from({ length: 10_000 }, (_, index) => {
        const state = polylineElement(`cached-${index}`);
        const target = targetProfile(state, geometry, state.style as StyleSpec);
        const runtime = pathTravelAnimationDefinition.create(target, spec);
        return { target, runtime, buffer: createAnimationFrameBuffer(runtime.slots) };
      });
      expect(hypot).toHaveBeenCalledTimes(10_000);

      for (const record of records) sample(record.runtime, record.buffer, record.target, 100);
      for (const record of records) sample(record.runtime, record.buffer, record.target, 200);
      expect(hypot).toHaveBeenCalledTimes(10_000);
      for (const record of records) record.runtime.destroy();
    } finally {
      hypot.mockRestore();
    }
  });

  it('path-travel 分别实现 remove 与 retain 结束行为和纯色结束锚线', () => {
    const state = polylineElement('flight');
    const geometry = polylineGeometry();
    const target = targetProfile(state, geometry, state.style as StyleSpec);
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
      showStart: false,
      showEnd: false
    });

    const removedRuntime = pathTravelAnimationDefinition.create(target, removedSpec);
    const removedBuffer = createAnimationFrameBuffer(removedRuntime.slots);
    expect(sample(removedRuntime, removedBuffer, target, 100)).toEqual({ finished: true, schedule: { kind: 'stable' } });
    expect(removedBuffer.overlays.every(({ active }) => !active)).toBe(true);

    const retainedRuntime = pathTravelAnimationDefinition.create(target, retainedSpec);
    const retainedBuffer = createAnimationFrameBuffer(retainedRuntime.slots);
    expect(sample(retainedRuntime, retainedBuffer, target, 100)).toEqual({ finished: true, retain: true, schedule: { kind: 'stable' } });
    const retainedSlot = retainedRuntime.slots.find(({ slotKey }) => slotKey === 'retained-line');
    const retainedFrame = retainedBuffer.overlay('retained-line');
    expect(retainedSlot?.style.strokes?.[0]?.color).toBe('#fedcba');
    expect(retainedFrame.active).toBe(true);
    expect(retainedBuffer.overlays.filter(({ active }) => active)).toHaveLength(1);
    expect(retainedFrame.geometry?.type).toBe('polyline');
    if (retainedFrame.geometry?.type !== 'polyline') throw new Error('应生成折线路径');
    expect(retainedFrame.geometry.coordinates[0]).toEqual([0, 0]);
    expect(retainedFrame.geometry.coordinates.at(-1)).toEqual([100, 0]);

    const gradientSpec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 100,
      repeat: false,
      finishBehavior: 'retain',
      gradient: [
        [0, '#ff0000'],
        [1, '#0000ff']
      ],
      showStart: false,
      showEnd: false
    });
    const gradientRuntime = pathTravelAnimationDefinition.create(target, gradientSpec);
    const gradientBuffer = createAnimationFrameBuffer(gradientRuntime.slots);
    sample(gradientRuntime, gradientBuffer, target, 100);
    const gradientSlots = gradientRuntime.slots.filter(({ slotKey }) => slotKey.startsWith('trail-'));
    expect(gradientRuntime.slots.some(({ slotKey }) => slotKey === 'retained-line')).toBe(false);
    expect(gradientSlots).toHaveLength(24);
    expect(gradientBuffer.overlays.filter(({ active }) => active)).toHaveLength(24);
    expect(gradientSlots[0].style.strokes?.[0]?.color).not.toEqual(gradientSlots.at(-1)?.style.strokes?.[0]?.color);

    const bentState = polylineElement('bent', {
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [1, 0],
          [1, 100]
        ]
      }
    });
    const bentTarget = targetProfile(bentState, { type: 'polyline', coordinates: bentState.geometry.controlPoints }, bentState.style as StyleSpec);
    const bentRuntime = pathTravelAnimationDefinition.create(bentTarget, gradientSpec);
    const bentBuffer = createAnimationFrameBuffer(bentRuntime.slots);
    sample(bentRuntime, bentBuffer, bentTarget, 5);
    const bentRunningSegments = bentBuffer.overlays
      .filter(({ active, geometry }) => active && geometry?.type === 'polyline')
      .flatMap(({ geometry }) => (geometry?.type === 'polyline' ? geometry.coordinates : []));
    expect(bentRunningSegments).toContainEqual([1, 0]);

    sample(bentRuntime, bentBuffer, bentTarget, 100);
    const bentSegments = bentBuffer.overlays
      .filter(({ active, geometry }) => active && geometry?.type === 'polyline')
      .flatMap(({ geometry }) => (geometry?.type === 'polyline' ? geometry.coordinates : []));
    expect(bentSegments).toContainEqual([1, 0]);

    const anchoredSpec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 100,
      repeat: false,
      finishBehavior: 'retain',
      color: '#123456',
      endLineColor: '#fedcba',
      showStart: true,
      showEnd: true
    });
    const anchoredRuntime = pathTravelAnimationDefinition.create(target, anchoredSpec);
    const anchoredBuffer = createAnimationFrameBuffer(anchoredRuntime.slots);
    sample(anchoredRuntime, anchoredBuffer, target, 100);
    expect(['retained-line', 'retained-start', 'retained-end'].map((key) => anchoredBuffer.overlay(key).active)).toEqual([true, true, true]);
    expect(['start', 'end'].map((key) => anchoredBuffer.overlay(key).active)).toEqual([false, false]);
    expect(
      anchoredRuntime.slots
        .filter(({ slotKey }) => slotKey === 'retained-start' || slotKey === 'retained-end')
        .map(({ style }) => style.symbol?.type === 'circle' && style.symbol.fill?.color)
    ).toEqual(['#fedcba', '#fedcba']);
  });

  it('严格拒绝不兼容目标、互斥参数、未知字段和无效渐变', () => {
    const point = targetProfile(pointElement('point'), pointGeometry(), pointStyle());
    expect(() => pathTravelAnimationDefinition.assertCompatible(point)).toThrowError(CapabilityError);
    expect(() => pathTravelAnimationDefinition.normalize({ type: 'path-travel', speed: 10, durationMs: 100 } as never)).toThrowError(InvalidArgumentError);
    expect(() => pathTravelAnimationDefinition.normalize({ type: 'path-travel', arrow: true } as never)).toThrowError(InvalidArgumentError);
    expect(() => pathTravelAnimationDefinition.normalize({ type: 'path-travel', arrowColor: '#fff' } as never)).toThrowError(InvalidArgumentError);
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

function sample(
  runtime: AnimationRuntime,
  buffer: AnimationFrameBuffer,
  target: AnimationTargetProfile,
  elapsedMs: number
): ReturnType<AnimationRuntime['sample']> {
  const context: AnimationFrameContext = { target, elapsedMs, resolution: 1, rotation: 0, pixelRatio: 1 };
  return runtime.sample(context, buffer);
}

function activeSlots(
  definitions: readonly AnimationSlotDefinition[],
  buffer: AnimationFrameBuffer
): readonly { definition: AnimationSlotDefinition; value: AnimationFrameBuffer['overlays'][number] }[] {
  return definitions.flatMap((definition, index) => {
    const value = buffer.overlays[index];
    return value.active ? [{ definition, value }] : [];
  });
}

function targetProfile(state: ElementState, geometry: RenderGeometryState, style: StyleSpec): AnimationTargetProfile {
  const shape = basicShapeDefinitions.find(({ type }) => type === state.type);
  if (shape === undefined) throw new Error(`未找到图形定义：${state.type}`);
  return {
    state: Object.freeze({ ...state, style }),
    viewShape: state.geometry,
    geometry,
    style,
    shape: shape as ShapeDefinition
  };
}

function pointGeometry(): RenderGeometryState {
  return { type: 'point', coordinates: [0, 0] };
}

function pointStyle(): StyleSpec {
  return { symbol: { type: 'circle', radius: 4 } };
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
