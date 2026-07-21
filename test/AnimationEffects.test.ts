import { describe, expect, it, vi } from 'vitest';
import { alertAnimationDefinition, normalizeAlertAnimationSpec } from '../src/builtins/animations/alert.js';
import { blinkAnimationDefinition, normalizeBlinkAnimationSpec } from '../src/builtins/animations/blink.js';
import { centerSpreadAnimationDefinition, normalizeCenterSpreadAnimationSpec } from '../src/builtins/animations/centerSpread.js';
import { fadeAnimationDefinition, normalizeFadeAnimationSpec } from '../src/builtins/animations/fade.js';
import { growAnimationDefinition, normalizeGrowAnimationSpec } from '../src/builtins/animations/grow.js';
import { highlightAnimationDefinition, normalizeHighlightAnimationSpec } from '../src/builtins/animations/highlight.js';
import { normalizeRadarScanAnimationSpec, radarScanAnimationDefinition } from '../src/builtins/animations/radarScan.js';
import {
  alertIntensityAt,
  animationFinishedAt,
  applyAnimationEasing,
  blinkOpacityAt,
  centerSpreadFinishedAt,
  centerSpreadRingProgressAt,
  fadeOpacityAt,
  growProgressAt,
  highlightIntensityAt,
  nextBlinkDeadlineAt,
  radarScanProgressAt,
  radarScanRoundTripTravelAt
} from '../src/builtins/animations/timeline.js';
import type { Coordinate } from '../src/core/common/types.js';
import { CapabilityError, InvalidArgumentError, UnsupportedOperationError } from '../src/core/errors.js';
import type { RenderGeometryState, ShapeAnimationProfile, ShapeDefinition, ShapeState, ShapeType } from '../src/core/shape/types.js';
import { createNativeStyleRef } from '../src/core/style/types.js';
import { createAnimationFrameBuffer } from '../src/services/animation/AnimationFrameBuffer.js';
import type { AnimationDefinition, AnimationFrameContext, AnimationRuntime, AnimationTargetProfile } from '../src/services/animation/types.js';

describe('可组合动画效果配置', () => {
  it('严格补齐已批准的默认值', () => {
    expect(normalizeBlinkAnimationSpec({ type: 'blink' })).toEqual({
      type: 'blink',
      channel: 'blink',
      periodMs: 800,
      dutyCycle: 0.5,
      minOpacity: 0,
      maxOpacity: 1,
      repeat: true
    });
    expect(normalizeHighlightAnimationSpec({ type: 'highlight' })).toEqual({
      type: 'highlight',
      channel: 'highlight',
      mode: 'steady',
      color: '#ffc107',
      fillOpacity: 0.18,
      strokeWidth: 3,
      periodMs: 1200
    });
    expect(normalizeAlertAnimationSpec({ type: 'alert' })).toEqual({
      type: 'alert',
      channel: 'alert',
      periodMs: 1200,
      color: '#ff3b30',
      fillOpacity: 0.22,
      strokeWidth: 3,
      repeat: true
    });
    expect(normalizeGrowAnimationSpec({ type: 'grow' })).toEqual({
      type: 'grow',
      channel: 'grow',
      durationMs: 1200,
      direction: 'forward',
      easing: 'linear',
      repeat: false
    });
    expect(normalizeRadarScanAnimationSpec({ type: 'radar-scan' })).toEqual({
      type: 'radar-scan',
      channel: 'radar-scan',
      periodMs: 2000,
      direction: 'clockwise',
      scanMode: 'one-way',
      color: '#00e676',
      opacity: 0.35,
      beamWidthDeg: 45,
      repeat: true
    });
    expect(normalizeCenterSpreadAnimationSpec({ type: 'center-spread' })).toEqual({
      type: 'center-spread',
      channel: 'center-spread',
      periodMs: 1600,
      color: '#00e676',
      opacity: 0.7,
      trailLength: 0.18,
      strokeWidth: 2,
      ringCount: 3,
      repeat: true
    });
    expect(normalizeFadeAnimationSpec({ type: 'fade', direction: 'out' })).toEqual({
      type: 'fade',
      channel: 'fade',
      direction: 'out',
      durationMs: 500,
      easing: 'ease-in-out'
    });
  });

  it('拒绝非法范围、互斥字段和缺失的 fade direction', () => {
    const invalidInputs: readonly (() => unknown)[] = [
      () => normalizeBlinkAnimationSpec({ type: 'blink', periodMs: 0 }),
      () => normalizeBlinkAnimationSpec({ type: 'blink', dutyCycle: 1 }),
      () => normalizeBlinkAnimationSpec({ type: 'blink', minOpacity: 0.5, maxOpacity: 0.5 }),
      () => normalizeBlinkAnimationSpec({ type: 'blink', maxOpacity: 1.01 }),
      () => normalizeHighlightAnimationSpec({ type: 'highlight', periodMs: 900 }),
      () => normalizeHighlightAnimationSpec({ type: 'highlight', mode: 'breathe', strokeWidth: -1 }),
      () => normalizeAlertAnimationSpec({ type: 'alert', fillOpacity: -0.01 }),
      () => normalizeGrowAnimationSpec({ type: 'grow', direction: 'backward' }),
      () => normalizeGrowAnimationSpec({ type: 'grow', easing: 'quadratic' }),
      () => normalizeRadarScanAnimationSpec({ type: 'radar-scan', beamWidthDeg: 361 }),
      () => normalizeRadarScanAnimationSpec({ type: 'radar-scan', scanMode: 'alternate' }),
      () => normalizeRadarScanAnimationSpec({ type: 'radar-scan', opacity: Number.NaN }),
      () => normalizeCenterSpreadAnimationSpec({ type: 'center-spread', ringCount: 0 }),
      () => normalizeCenterSpreadAnimationSpec({ type: 'center-spread', ringCount: 2.5 }),
      () => normalizeCenterSpreadAnimationSpec({ type: 'center-spread', ringCount: 6 }),
      () => normalizeCenterSpreadAnimationSpec({ type: 'center-spread', opacity: -0.01 }),
      () => normalizeCenterSpreadAnimationSpec({ type: 'center-spread', opacity: Number.NaN }),
      () => normalizeCenterSpreadAnimationSpec({ type: 'center-spread', trailLength: -0.01 }),
      () => normalizeCenterSpreadAnimationSpec({ type: 'center-spread', trailLength: 1.01 }),
      () => normalizeFadeAnimationSpec({ type: 'fade' }),
      () => normalizeFadeAnimationSpec({ type: 'fade', direction: 'in', durationMs: Number.POSITIVE_INFINITY })
    ];
    for (const invalid of invalidInputs) expect(invalid).toThrowError(InvalidArgumentError);
    expect(normalizeHighlightAnimationSpec({ type: 'highlight', mode: 'breathe', periodMs: 900 }).periodMs).toBe(900);
  });

  it('拒绝未知字段、accessor、symbol 与非法原型，且不修改调用方对象', () => {
    const input = { type: 'blink' as const, channel: 'attention' };
    const original = structuredClone(input);
    const normalized = normalizeBlinkAnimationSpec(input);
    expect(input).toEqual(original);
    expect(normalized).not.toBe(input);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(() => normalizeBlinkAnimationSpec({ ...input, unknown: true })).toThrowError(InvalidArgumentError);

    const getter = vi.fn(() => 800);
    const accessor = { type: 'blink' };
    Object.defineProperty(accessor, 'periodMs', { enumerable: true, get: getter });
    expect(() => normalizeBlinkAnimationSpec(accessor)).toThrowError(InvalidArgumentError);
    expect(getter).not.toHaveBeenCalled();

    const symbolInput = { type: 'blink', [Symbol('hidden')]: true };
    expect(() => normalizeBlinkAnimationSpec(symbolInput)).toThrowError(InvalidArgumentError);
    expect(() => normalizeBlinkAnimationSpec(Object.assign(Object.create({}), { type: 'blink' }))).toThrowError(InvalidArgumentError);
  });

  it('radar-scan 复制并冻结合法渐变，且不修改调用方输入', () => {
    const input = {
      type: 'radar-scan',
      channel: 'custom-radar',
      gradient: [
        [0, [0, 32, 0, 0.1]],
        [0.4, '#00aa44'],
        [1, [0, 255, 0, 1]]
      ]
    };
    const original = structuredClone(input);

    const normalized = normalizeRadarScanAnimationSpec(input);

    expect(input).toEqual(original);
    expect(normalized).toEqual({
      type: 'radar-scan',
      channel: 'custom-radar',
      periodMs: 2000,
      direction: 'clockwise',
      scanMode: 'one-way',
      gradient: [
        [0, [0, 32, 0, 0.1]],
        [0.4, [0, 170, 68, 1]],
        [1, [0, 255, 0, 1]]
      ],
      opacity: 0.35,
      beamWidthDeg: 45,
      repeat: true
    });
    expect('color' in normalized).toBe(false);
    expect(normalized.gradient).not.toBe(input.gradient);
    expect(normalized.gradient?.[0]).not.toBe(input.gradient[0]);
    expect(normalized.gradient?.[0][1]).not.toBe(input.gradient[0][1]);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.gradient)).toBe(true);
    expect(normalized.gradient?.every(Object.isFrozen)).toBe(true);
    expect(normalized.gradient?.every((stop) => Array.isArray(stop[1]) && Object.isFrozen(stop[1]))).toBe(true);
  });

  it('radar-scan 沿用严格渐变色标规则并拒绝 color 与 gradient 同时出现', () => {
    expect(
      normalizeRadarScanAnimationSpec({
        type: 'radar-scan',
        gradient: [
          [0.2, '#001100'],
          [0.8, '#00ff00']
        ]
      }).gradient
    ).toEqual([
      [0.2, [0, 17, 0, 1]],
      [0.8, [0, 255, 0, 1]]
    ]);

    const invalidGradients: readonly unknown[] = [
      [[0, '#001100']],
      [
        [0, '#001100', 'extra'],
        [1, '#00ff00']
      ],
      [
        [-0.01, '#001100'],
        [1, '#00ff00']
      ],
      [
        [0, '#001100'],
        [1.01, '#00ff00']
      ],
      [
        [Number.NaN, '#001100'],
        [1, '#00ff00']
      ],
      [
        [0, '#001100'],
        [Number.POSITIVE_INFINITY, '#00ff00']
      ],
      [
        [0, '#001100'],
        [0, '#00ff00']
      ],
      [
        [0.8, '#001100'],
        [0.2, '#00ff00']
      ],
      [
        [0, ''],
        [1, '#00ff00']
      ]
    ];
    for (const gradient of invalidGradients) {
      expect(() => normalizeRadarScanAnimationSpec({ type: 'radar-scan', gradient })).toThrowError(InvalidArgumentError);
    }
    expect(() =>
      normalizeRadarScanAnimationSpec({
        type: 'radar-scan',
        color: '#00e676',
        gradient: [
          [0, '#001100'],
          [1, '#00ff00']
        ]
      })
    ).toThrowError(InvalidArgumentError);

    const colorGetter = vi.fn(() => '#00ff00');
    const accessorStop = [0];
    Object.defineProperty(accessorStop, 1, { enumerable: true, get: colorGetter });
    Object.defineProperty(accessorStop, 'length', { value: 2 });
    expect(() => normalizeRadarScanAnimationSpec({ type: 'radar-scan', gradient: [accessorStop, [1, '#00ff00']] })).toThrowError(InvalidArgumentError);
    expect(colorGetter).not.toHaveBeenCalled();
  });

  it('center-spread 复制并冻结合法渐变，且不修改调用方输入', () => {
    const input = {
      type: 'center-spread',
      channel: 'custom-spread',
      gradient: [
        [0, [0, 32, 0, 0.1]],
        [0.4, '#00aa44'],
        [1, [0, 255, 0, 1]]
      ]
    };
    const original = structuredClone(input);

    const normalized = normalizeCenterSpreadAnimationSpec(input);

    expect(input).toEqual(original);
    expect(normalized).toEqual({
      type: 'center-spread',
      channel: 'custom-spread',
      periodMs: 1600,
      gradient: [
        [0, [0, 32, 0, 0.1]],
        [0.4, [0, 170, 68, 1]],
        [1, [0, 255, 0, 1]]
      ],
      opacity: 0.7,
      trailLength: 0.18,
      strokeWidth: 2,
      ringCount: 3,
      repeat: true
    });
    expect('color' in normalized).toBe(false);
    expect(normalized.gradient).not.toBe(input.gradient);
    expect(normalized.gradient?.[0]).not.toBe(input.gradient[0]);
    expect(normalized.gradient?.[0][1]).not.toBe(input.gradient[0][1]);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.gradient)).toBe(true);
    expect(normalized.gradient?.every(Object.isFrozen)).toBe(true);
    expect(normalized.gradient?.every((stop) => Array.isArray(stop[1]) && Object.isFrozen(stop[1]))).toBe(true);
  });

  it('center-spread 沿用严格渐变色标规则并拒绝 color 与 gradient 同时出现', () => {
    expect(
      normalizeCenterSpreadAnimationSpec({
        type: 'center-spread',
        gradient: [
          [0.2, '#001100'],
          [0.8, '#00ff00']
        ]
      }).gradient
    ).toEqual([
      [0.2, [0, 17, 0, 1]],
      [0.8, [0, 255, 0, 1]]
    ]);

    const invalidGradients: readonly unknown[] = [
      [[0, '#001100']],
      [
        [0, '#001100', 'extra'],
        [1, '#00ff00']
      ],
      [
        [-0.01, '#001100'],
        [1, '#00ff00']
      ],
      [
        [0, '#001100'],
        [1.01, '#00ff00']
      ],
      [
        [Number.NaN, '#001100'],
        [1, '#00ff00']
      ],
      [
        [0, '#001100'],
        [Number.POSITIVE_INFINITY, '#00ff00']
      ],
      [
        [0, '#001100'],
        [0, '#00ff00']
      ],
      [
        [0.8, '#001100'],
        [0.2, '#00ff00']
      ],
      [
        [0, ''],
        [1, '#00ff00']
      ]
    ];
    for (const gradient of invalidGradients) {
      expect(() => normalizeCenterSpreadAnimationSpec({ type: 'center-spread', gradient })).toThrowError(InvalidArgumentError);
    }
    expect(() =>
      normalizeCenterSpreadAnimationSpec({
        type: 'center-spread',
        color: '#00e676',
        gradient: [
          [0, '#001100'],
          [1, '#00ff00']
        ]
      })
    ).toThrowError(InvalidArgumentError);

    const colorGetter = vi.fn(() => '#00ff00');
    const accessorStop = [0];
    Object.defineProperty(accessorStop, 1, { enumerable: true, get: colorGetter });
    Object.defineProperty(accessorStop, 'length', { value: 2 });
    expect(() => normalizeCenterSpreadAnimationSpec({ type: 'center-spread', gradient: [accessorStop, [1, '#00ff00']] })).toThrowError(InvalidArgumentError);
    expect(colorGetter).not.toHaveBeenCalled();
  });
});

describe('可组合动画纯时间函数', () => {
  it('使用固定三次 easing 并限制输入进度', () => {
    expect(applyAnimationEasing('linear', -1)).toBe(0);
    expect(applyAnimationEasing('linear', 2)).toBe(1);
    expect(applyAnimationEasing('ease-in', 0.5)).toBe(0.125);
    expect(applyAnimationEasing('ease-out', 0.5)).toBe(0.875);
    expect(applyAnimationEasing('ease-in-out', 0.25)).toBe(0.0625);
    expect(applyAnimationEasing('ease-in-out', 0.75)).toBe(0.9375);
  });

  it('精确处理 blink 阶跃边界与下一截止时间', () => {
    expect(blinkOpacityAt(0, 800, 0.5, 0.2, 0.9, true)).toBe(0.9);
    expect(blinkOpacityAt(399.999, 800, 0.5, 0.2, 0.9, true)).toBe(0.9);
    expect(blinkOpacityAt(400, 800, 0.5, 0.2, 0.9, true)).toBe(0.2);
    expect(blinkOpacityAt(800, 800, 0.5, 0.2, 0.9, true)).toBe(0.9);
    expect(nextBlinkDeadlineAt(0, 800, 0.5, true)).toBe(400);
    expect(nextBlinkDeadlineAt(400, 800, 0.5, true)).toBe(800);
    expect(nextBlinkDeadlineAt(800, 800, 0.5, false)).toBeUndefined();
  });

  it('精确采样呼吸高亮、告警双峰、grow、radar 和 fade', () => {
    expect(highlightIntensityAt(0, 1200, 'steady')).toBe(1);
    expect(highlightIntensityAt(0, 1200, 'breathe')).toBeCloseTo(0.35);
    expect(highlightIntensityAt(600, 1200, 'breathe')).toBeCloseTo(1);
    expect(alertIntensityAt(144, 1200, false)).toBe(1);
    expect(alertIntensityAt(288, 1200, false)).toBe(0);
    expect(alertIntensityAt(432, 1200, false)).toBe(1);
    expect(alertIntensityAt(624, 1200, false)).toBe(0);
    expect(growProgressAt(500, 1000, false, 'ease-in')).toBe(0.125);
    expect(radarScanProgressAt(500, 2000, true)).toBe(0.25);
    expect(radarScanRoundTripTravelAt(0, 2000, true)).toBe(0);
    expect(radarScanRoundTripTravelAt(1000, 2000, true)).toBe(1);
    expect(radarScanRoundTripTravelAt(2000, 2000, true)).toBe(2);
    expect(radarScanRoundTripTravelAt(2500, 2000, true)).toBe(2.5);
    expect(radarScanRoundTripTravelAt(4000, 2000, true)).toBe(2);
    expect(radarScanRoundTripTravelAt(3000, 2000, false)).toBe(2);
    expect(fadeOpacityAt(250, 500, 'in', 'ease-in-out')).toBe(0.5);
    expect(fadeOpacityAt(250, 500, 'out', 'ease-in-out')).toBe(0.5);
    expect(animationFinishedAt(1000, 1000, false)).toBe(true);
    expect(animationFinishedAt(1000, 1000, true)).toBe(false);
  });

  it('按固定 slot 计算 center-spread 发射和完成边界', () => {
    expect(centerSpreadRingProgressAt(0, 1200, 3, 0, false)).toBe(0);
    expect(centerSpreadRingProgressAt(399, 1200, 3, 1, false)).toBeUndefined();
    expect(centerSpreadRingProgressAt(400, 1200, 3, 1, false)).toBe(0);
    expect(centerSpreadRingProgressAt(1600, 1200, 3, 1, false)).toBeUndefined();
    expect(centerSpreadRingProgressAt(1600, 1200, 3, 1, true)).toBe(0);
    expect(centerSpreadFinishedAt(1999, 1200, 3, false)).toBe(false);
    expect(centerSpreadFinishedAt(2000, 1200, 3, false)).toBe(true);
  });
});

describe('可组合动画 Runtime 草案', () => {
  it('为所有新增 Definition 声明确定的写入域、能力与交互策略', () => {
    const definitions = [
      blinkAnimationDefinition,
      highlightAnimationDefinition,
      alertAnimationDefinition,
      growAnimationDefinition,
      radarScanAnimationDefinition,
      centerSpreadAnimationDefinition,
      fadeAnimationDefinition
    ] as const;
    expect(definitions.map(({ type }) => type)).toEqual(['blink', 'highlight', 'alert', 'grow', 'radar-scan', 'center-spread', 'fade']);
    for (const definition of definitions) {
      expect(definition.interactionPolicy).toEqual({ edit: 'pause-and-suppress', transform: 'pause-and-suppress' });
      expect(definition.requirements.has('structured-presentation')).toBe(true);
    }
    expect([...blinkAnimationDefinition.writeDomains]).toEqual(['target-opacity']);
    expect([...fadeAnimationDefinition.writeDomains]).toEqual(['target-opacity']);
    expect([...growAnimationDefinition.writeDomains]).toEqual(['target-geometry']);
    expect([...highlightAnimationDefinition.writeDomains]).toEqual(['overlay']);
  });

  it('blink 仅在阶跃边界调度，fade-in remove 且 fade-out retain', () => {
    const target = targetProfile({ type: 'point', coordinates: [0, 0] });
    const blink = createRuntime(blinkAnimationDefinition, target, { type: 'blink', periodMs: 800, repeat: false });
    const blinkBuffer = createAnimationFrameBuffer(blink.slots);
    expect(sample(blink, blinkBuffer, target, 0)).toEqual({ finished: false, schedule: { kind: 'deadline', atElapsedMs: 400 } });
    expect(blinkBuffer.targetOpacity).toBe(1);
    blinkBuffer.reset();
    expect(sample(blink, blinkBuffer, target, 400).schedule).toEqual({ kind: 'deadline', atElapsedMs: 800 });
    expect(blinkBuffer.targetOpacity).toBe(0);
    blinkBuffer.reset();
    expect(sample(blink, blinkBuffer, target, 800).finished).toBe(true);
    expect(blinkBuffer.targetOpacity).toBeUndefined();

    const fadeIn = createRuntime(fadeAnimationDefinition, target, { type: 'fade', direction: 'in' });
    const fadeInBuffer = createAnimationFrameBuffer(fadeIn.slots);
    sample(fadeIn, fadeInBuffer, target, 250);
    expect(fadeInBuffer.targetOpacity).toBe(0.5);
    fadeInBuffer.reset();
    expect(sample(fadeIn, fadeInBuffer, target, 500)).toEqual({ finished: true, schedule: { kind: 'stable' } });
    expect(fadeInBuffer.targetOpacity).toBeUndefined();

    const fadeOut = createRuntime(fadeAnimationDefinition, target, { type: 'fade', direction: 'out' });
    const fadeOutBuffer = createAnimationFrameBuffer(fadeOut.slots);
    expect(sample(fadeOut, fadeOutBuffer, target, 500)).toEqual({ finished: true, retain: true, schedule: { kind: 'stable' } });
    expect(fadeOutBuffer.targetOpacity).toBe(0);
  });

  it('highlight 与 alert 只更新稳定 overlay slot', () => {
    const target = targetProfile(polygonGeometry());
    const highlight = createRuntime(highlightAnimationDefinition, target, { type: 'highlight', mode: 'breathe' });
    const highlightBuffer = createAnimationFrameBuffer(highlight.slots);
    expect(sample(highlight, highlightBuffer, target, 600).schedule).toEqual({ kind: 'continuous' });
    expect(highlightBuffer.overlays).toHaveLength(2);
    expect(highlightBuffer.overlays[0]).toEqual(expect.objectContaining({ active: true, geometryKind: 'effective-target', opacity: 0.18 }));
    expect(highlightBuffer.overlays[1]).toEqual(expect.objectContaining({ active: true, geometryKind: 'effective-target', opacity: 1 }));

    const alert = createRuntime(alertAnimationDefinition, target, { type: 'alert', repeat: false });
    const alertBuffer = createAnimationFrameBuffer(alert.slots);
    sample(alert, alertBuffer, target, 144);
    expect(alertBuffer.overlays).toHaveLength(3);
    expect(alertBuffer.overlays.map(({ active, opacity }) => ({ active, opacity }))).toEqual([
      { active: true, opacity: 0.22 },
      { active: true, opacity: 1 },
      { active: true, opacity: 0.35 }
    ]);
    alertBuffer.reset();
    expect(sample(alert, alertBuffer, target, 1200).finished).toBe(true);
    expect(alertBuffer.overlays.every(({ active }) => !active)).toBe(true);
  });

  it('不可见的合法 repeat 配置保持稳定且不请求连续帧', () => {
    const surface = targetProfile(polygonGeometry());
    const highlight = createRuntime(highlightAnimationDefinition, surface, {
      type: 'highlight',
      mode: 'breathe',
      fillOpacity: 0,
      strokeWidth: 0
    });
    const alert = createRuntime(alertAnimationDefinition, surface, { type: 'alert', fillOpacity: 0, strokeWidth: 0, repeat: true });
    const radial = radialTarget();
    const radar = createRuntime(radarScanAnimationDefinition, radial, { type: 'radar-scan', opacity: 0, repeat: true });
    const spread = createRuntime(centerSpreadAnimationDefinition, radial, { type: 'center-spread', opacity: 0, strokeWidth: 0, repeat: true });

    for (const [runtime, target] of [
      [highlight, surface],
      [alert, surface],
      [radar, radial],
      [spread, radial]
    ] as const) {
      expect(sample(runtime, createAnimationFrameBuffer(runtime.slots), target, 0).schedule).toEqual({ kind: 'stable' });
      runtime.destroy();
    }
  });

  it('grow 按累计长度生成正向前缀和反向后缀', () => {
    const target = targetProfile({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [10, 0],
        [10, 10]
      ]
    });
    const forward = createRuntime(growAnimationDefinition, target, { type: 'grow', durationMs: 1000 });
    const forwardBuffer = createAnimationFrameBuffer(forward.slots);
    sample(forward, forwardBuffer, target, 500);
    expect(forwardBuffer.targetGeometry).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [10, 0]
      ]
    });
    expect(forwardBuffer.targetReveal).toEqual({ progress: 0.5, direction: 'forward' });
    const stableForwardGeometry = forwardBuffer.targetGeometry;
    sample(forward, forwardBuffer, target, 750);
    expect(forwardBuffer.targetGeometry).toBe(stableForwardGeometry);

    const reverse = createRuntime(growAnimationDefinition, target, { type: 'grow', durationMs: 1000, direction: 'reverse' });
    const reverseBuffer = createAnimationFrameBuffer(reverse.slots);
    sample(reverse, reverseBuffer, target, 500);
    expect(reverseBuffer.targetGeometry).toEqual(
      expect.objectContaining({
        type: 'polyline',
        coordinates: expect.arrayContaining([
          [10, 0],
          [10, 10]
        ])
      })
    );
    expect(reverseBuffer.targetReveal).toEqual({ progress: 0.5, direction: 'reverse' });
  });

  it('grow 优先复用 Shape reveal session，并在 rebind 与 destroy 时转交资源生命周期', () => {
    const stableGeometry = polygonGeometry();
    const reveal = vi.fn(() => stableGeometry);
    const rebind = vi.fn();
    const destroy = vi.fn();
    const revealGeometry = vi.fn(() => {
      throw new Error('legacy reveal provider should not run');
    });
    const createRevealSession = vi.fn(() => ({ reveal, rebind, destroy }));
    const target = targetProfile(polygonGeometry(), { revealGeometry, createRevealSession });
    const runtime = createRuntime(growAnimationDefinition, target, { type: 'grow', durationMs: 1000 });
    const buffer = createAnimationFrameBuffer(runtime.slots);

    sample(runtime, buffer, target, 250);
    expect(buffer.targetGeometry).toBe(stableGeometry);
    sample(runtime, buffer, target, 500);
    expect(buffer.targetGeometry).toBe(stableGeometry);
    expect(createRevealSession).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenNthCalledWith(1, 0.25, 'forward');
    expect(reveal).toHaveBeenNthCalledWith(2, 0.5, 'forward');
    expect(revealGeometry).not.toHaveBeenCalled();

    const reboundViewShape: ShapeState = { type: 'polygon', controlPoints: [[3, 4]] };
    const rebound = { ...target, viewShape: reboundViewShape } as AnimationTargetProfile;
    runtime.rebind(rebound);
    expect(rebind).toHaveBeenCalledWith(reboundViewShape);
    sample(runtime, buffer, rebound, 750);
    expect(buffer.targetGeometry).toBe(stableGeometry);
    expect(createRevealSession).toHaveBeenCalledTimes(1);

    runtime.destroy();
    runtime.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('radar-scan 与 center-spread 使用 radial provider 和有界稳定 slot', () => {
    const target = radialTarget();
    const radar = createRuntime(radarScanAnimationDefinition, target, { type: 'radar-scan' });
    const radarBuffer = createAnimationFrameBuffer(radar.slots);
    sample(radar, radarBuffer, target, 500);
    expect(radar.slots).toHaveLength(10);
    expect(radarBuffer.overlays.filter(({ active }) => active).length).toBeGreaterThan(0);
    expect(radarBuffer.overlays.filter(({ active }) => active).every(({ geometry }) => geometry?.type === 'polygon')).toBe(true);
    expect(radarBuffer.overlays[0].opacity).toBe(0.35);
    const stableRadarGeometry = radarBuffer.overlays[0].geometry;
    sample(radar, radarBuffer, target, 600);
    expect(radarBuffer.overlays[0].geometry).toBe(stableRadarGeometry);

    const spread = createRuntime(centerSpreadAnimationDefinition, target, { type: 'center-spread', periodMs: 1200, ringCount: 3 });
    const spreadBuffer = createAnimationFrameBuffer(spread.slots);
    sample(spread, spreadBuffer, target, 600);
    expect(spread.slots).toHaveLength(15);
    expect(spread.slots.slice(0, 4).every(({ style }) => style.fill !== undefined)).toBe(true);
    expect(spread.slots[4].style.strokes).toEqual([{ color: '#00e676', width: 2 }]);
    expect(spreadBuffer.overlays[0].geometry?.type).toBe('polygon');
    expect(spreadBuffer.overlays[4].geometry).toEqual({ type: 'circle', center: [0, 0], radius: 50 });
    expect(spreadBuffer.overlays.filter(({ active }) => active).every(({ opacity }) => opacity === 0.7)).toBe(true);
    expect(spreadBuffer.overlays.slice(10).every(({ active }) => !active)).toBe(true);
    const stableSpreadGeometry = spreadBuffer.overlays[0].geometry;
    sample(spread, spreadBuffer, target, 700);
    expect(spreadBuffer.overlays[0].geometry).toBe(stableSpreadGeometry);
  });

  it('纯色径向效果的全部 active 槽保持所选颜色和恒定透明度', () => {
    const target = radialTarget();
    const selectedColor = '#14c86a';
    for (const scanMode of ['one-way', 'round-trip'] as const) {
      const radar = createRuntime(radarScanAnimationDefinition, target, {
        type: 'radar-scan',
        periodMs: 1000,
        scanMode,
        color: selectedColor,
        opacity: 0.8,
        beamWidthDeg: 90
      });
      expect(radar.slots).toHaveLength(10);
      expect(radar.slots.every(({ style }) => style.fill?.type === 'solid' && style.fill.color === selectedColor && style.strokes === undefined)).toBe(true);
      const radarBuffer = createAnimationFrameBuffer(radar.slots);
      sample(radar, radarBuffer, target, scanMode === 'one-way' ? 500 : 750);
      const activeRadarSlots = radarBuffer.overlays.filter(({ active }) => active);
      expect(activeRadarSlots).toHaveLength(10);
      expect(activeRadarSlots.every(({ opacity }) => opacity === 0.8)).toBe(true);
    }

    const spread = createRuntime(centerSpreadAnimationDefinition, target, {
      type: 'center-spread',
      periodMs: 1000,
      color: selectedColor,
      opacity: 0.8,
      trailLength: 0.4,
      ringCount: 1,
      strokeWidth: 2,
      repeat: false
    });
    expect(
      spread.slots.slice(0, 4).every(({ style }) => style.fill?.type === 'solid' && style.fill.color === selectedColor && style.strokes === undefined)
    ).toBe(true);
    expect(spread.slots[4].style).toEqual({ strokes: [{ color: selectedColor, width: 2 }] });
    const spreadBuffer = createAnimationFrameBuffer(spread.slots);
    for (const elapsedMs of [500, 800]) {
      sample(spread, spreadBuffer, target, elapsedMs);
      expect(spreadBuffer.overlays.slice(0, 4).every(({ active, opacity }) => active && opacity === 0.8)).toBe(true);
      expect(spreadBuffer.overlays[4]).toEqual(expect.objectContaining({ active: true, opacity: 0.8 }));
    }
    expect(sample(spread, spreadBuffer, target, 1000).finished).toBe(true);
    expect(spreadBuffer.overlays.every(({ active }) => !active)).toBe(true);
  });

  it('center-spread 每环固定四个尾迹填充槽和一个独立前沿槽', () => {
    const target = radialTarget();
    const spread = createRuntime(centerSpreadAnimationDefinition, target, {
      type: 'center-spread',
      periodMs: 1000,
      ringCount: 2,
      trailLength: 0
    });
    const buffer = createAnimationFrameBuffer(spread.slots);

    expect(spread.slots).toHaveLength(10);
    for (let ringIndex = 0; ringIndex < 2; ringIndex += 1) {
      const ringSlots = spread.slots.slice(ringIndex * 5, ringIndex * 5 + 5);
      expect(ringSlots.slice(0, 4).every(({ style }) => style.fill !== undefined && style.strokes === undefined)).toBe(true);
      expect(ringSlots[4].style.fill).toBeUndefined();
      expect(ringSlots[4].style.strokes).toEqual([{ color: '#00e676', width: 2 }]);
    }

    sample(spread, buffer, target, 500);
    expect(buffer.overlays.slice(0, 4).every(({ active }) => !active)).toBe(true);
    expect(buffer.overlays[4]).toEqual(expect.objectContaining({ active: true, geometry: { type: 'circle', center: [0, 0], radius: 50 }, opacity: 0.7 }));
    expect(buffer.overlays.slice(5).every(({ active }) => !active)).toBe(true);
  });

  it('center-spread 的渐变 offset 从内侧最旧端指向外侧前沿，并按尾迹强度与扩散进度合成透明度', () => {
    const target = radialTarget();
    const spread = createRuntime(centerSpreadAnimationDefinition, target, {
      type: 'center-spread',
      periodMs: 1000,
      ringCount: 1,
      gradient: [
        [0, [0, 16, 0, 0.2]],
        [1, [0, 240, 0, 0.8]]
      ],
      opacity: 0.6,
      trailLength: 0.4
    });
    const buffer = createAnimationFrameBuffer(spread.slots);

    expect(spread.slots[0].style.fill).toEqual({ type: 'solid', color: [0, 240, 0, 0.8] });
    expect(spread.slots[3].style.fill).toEqual({ type: 'solid', color: [0, 16, 0, 0.2] });
    expect(spread.slots[4].style.strokes).toEqual([{ color: [0, 240, 0, 0.8], width: 2 }]);

    sample(spread, buffer, target, 500);
    const expectedOpacities = [0.3, 0.225, 0.15, 0.075];
    for (let index = 0; index < expectedOpacities.length; index += 1) expect(buffer.overlays[index].opacity).toBeCloseTo(expectedOpacities[index]);
    expect(buffer.overlays[4].opacity).toBeCloseTo(0.3);
    expect(0.8 * buffer.overlays[0].opacity).toBeCloseTo(0.24);
    expect(0.2 * buffer.overlays[3].opacity).toBeCloseTo(0.015);
  });

  it('center-spread 在 Circle 上绘制无接缝环形带，并保持外到内的固定径向分段', () => {
    const target = radialTarget();
    const spread = createRuntime(centerSpreadAnimationDefinition, target, {
      type: 'center-spread',
      periodMs: 1000,
      ringCount: 1,
      trailLength: 0.18
    });
    const buffer = createAnimationFrameBuffer(spread.slots);

    sample(spread, buffer, target, 500);

    const expectedBands = [
      [45.5, 50],
      [41, 45.5],
      [36.5, 41],
      [32, 36.5]
    ] as const;
    for (let index = 0; index < expectedBands.length; index += 1) {
      const geometry = polygonGeometryFrom(buffer.overlays[index].geometry);
      expect(geometry.coordinates).toHaveLength(2);
      for (const ring of geometry.coordinates) expect(ring.at(-1)).toEqual(ring[0]);
      expectRadialRange(geometry.coordinates.flat(), [0, 0], expectedBands[index][0], expectedBands[index][1]);
    }
    expect(buffer.overlays[4].geometry).toEqual({ type: 'circle', center: [0, 0], radius: 50 });
  });

  it('center-spread 在 Sector 上绘制受两条边界射线裁剪的环形扇面带', () => {
    const target = sectorRadialTarget();
    const spread = createRuntime(centerSpreadAnimationDefinition, target, {
      type: 'center-spread',
      periodMs: 1000,
      ringCount: 1,
      trailLength: 0.18
    });
    const buffer = createAnimationFrameBuffer(spread.slots);

    sample(spread, buffer, target, 500);

    for (const overlay of buffer.overlays.slice(0, 4)) {
      const geometry = polygonGeometryFrom(overlay.geometry);
      expect(geometry.coordinates).toHaveLength(1);
      expect(geometry.coordinates[0].at(-1)).toEqual(geometry.coordinates[0][0]);
      for (const coordinate of geometry.coordinates[0]) expect(coordinate[1]).toBeGreaterThanOrEqual(-1e-10);
    }
    const front = polylineGeometryFrom(buffer.overlays[4].geometry).coordinates;
    expectCoordinateCloseTo(front[0], [50, 0]);
    expectCoordinateCloseTo(front.at(-1), [-50, 0]);
    for (const coordinate of front) expect(coordinate[1]).toBeGreaterThanOrEqual(-1e-10);
  });

  it.each(['one-way', 'round-trip'] as const)('radar-scan %s 渐变从旧端过渡到扫描前沿并保留年龄透明度衰减', (scanMode) => {
    const target = radialTarget();
    const radar = createRuntime(radarScanAnimationDefinition, target, {
      type: 'radar-scan',
      periodMs: 1000,
      scanMode,
      gradient: [
        [0, '#001100'],
        [1, '#00ff00']
      ],
      opacity: 0.8,
      beamWidthDeg: 90
    });

    expect(radar.slots[0].style.fill).toEqual({ type: 'solid', color: [0, 255, 0, 1] });
    expect(radar.slots.at(-1)?.style.fill).toEqual({ type: 'solid', color: [0, 17, 0, 1] });
    const buffer = createAnimationFrameBuffer(radar.slots);
    sample(radar, buffer, target, scanMode === 'one-way' ? 500 : 750);
    expect(buffer.overlays.filter(({ active }) => active)).toHaveLength(10);
    for (let index = 0; index < 10; index += 1) {
      expect(buffer.overlays[index].active).toBe(true);
      expect(buffer.overlays[index].opacity).toBeCloseTo(0.8 * (1 - index / 10));
    }
  });

  it.each(['clockwise', 'counterclockwise'] as const)('radar-scan full Circle repeat 在非 slot 对齐的早期 %s 帧完整跨越正北', (direction) => {
    const target = radialTarget();
    const periodMs = 2000;
    const elapsedMs = 12.5;
    const beamWidthRad = Math.PI / 4;
    const radar = createRuntime(radarScanAnimationDefinition, target, {
      type: 'radar-scan',
      periodMs,
      direction,
      beamWidthDeg: 45,
      repeat: true
    });
    const buffer = createAnimationFrameBuffer(radar.slots);

    sample(radar, buffer, target, elapsedMs);

    expect(buffer.overlays.filter(({ active }) => active)).toHaveLength(10);
    expect(activeRadarSweep(buffer)).toBeCloseTo(beamWidthRad, 10);
    const frontArc = activeRadarArcCoordinateSets(buffer)[0];
    expect(radarArcSweep(frontArc)).toBeCloseTo(beamWidthRad / 10, 10);
    expect(frontArc.some(([x]) => x > 1)).toBe(true);
    expect(frontArc.some(([x]) => x < -1)).toBe(true);
  });

  it('radar-scan 的 360 度 beam 在早期跨界帧覆盖完整圆周', () => {
    const target = radialTarget();
    const radar = createRuntime(radarScanAnimationDefinition, target, {
      type: 'radar-scan',
      periodMs: 2000,
      direction: 'clockwise',
      beamWidthDeg: 360,
      repeat: true
    });
    const buffer = createAnimationFrameBuffer(radar.slots);

    sample(radar, buffer, target, 12.5);

    expect(buffer.overlays.filter(({ active }) => active)).toHaveLength(10);
    expect(activeRadarSweep(buffer)).toBeCloseTo(Math.PI * 2, 10);
    expect(radarArcSweep(activeRadarArcCoordinateSets(buffer)[0])).toBeCloseTo((Math.PI * 2) / 10, 10);
  });

  it('radar-scan 保持 Sector 边界与 non-repeat 起始阶段裁剪', () => {
    for (const direction of ['clockwise', 'counterclockwise'] as const) {
      const sector = sectorRadialTarget();
      const sectorRadar = createRuntime(radarScanAnimationDefinition, sector, {
        type: 'radar-scan',
        periodMs: 1000,
        direction,
        beamWidthDeg: 90,
        repeat: true
      });
      const sectorBuffer = createAnimationFrameBuffer(sectorRadar.slots);
      sample(sectorRadar, sectorBuffer, sector, 100);
      expect(activeRadarSweep(sectorBuffer)).toBeCloseTo(Math.PI * 0.1, 10);
      for (const coordinate of activeRadarArcCoordinates(sectorBuffer)) expect(coordinate[1]).toBeGreaterThanOrEqual(-1e-10);
    }

    const circle = radialTarget();
    const oneShotRadar = createRuntime(radarScanAnimationDefinition, circle, {
      type: 'radar-scan',
      periodMs: 1000,
      direction: 'clockwise',
      beamWidthDeg: 90,
      repeat: false
    });
    const oneShotBuffer = createAnimationFrameBuffer(oneShotRadar.slots);
    sample(oneShotRadar, oneShotBuffer, circle, 100);
    expect(activeRadarSweep(oneShotBuffer)).toBeCloseTo(Math.PI * 0.2, 10);
  });

  it('radar-scan 往返模式以最近行程折叠尾迹，并在折返点保持连续且优先保留新尾迹', () => {
    const sector = sectorRadialTarget();
    const radar = createRuntime(radarScanAnimationDefinition, sector, {
      type: 'radar-scan',
      periodMs: 1000,
      direction: 'counterclockwise',
      scanMode: 'round-trip',
      beamWidthDeg: 90,
      repeat: true
    });
    const buffer = createAnimationFrameBuffer(radar.slots);
    const beamWidthRad = Math.PI / 2;

    sample(radar, buffer, sector, 499.999);
    expect(activeRadarSweep(buffer)).toBeCloseTo(beamWidthRad, 5);
    sample(radar, buffer, sector, 500);
    expect(activeRadarSweep(buffer)).toBeCloseTo(beamWidthRad, 10);
    const turnGeometries = buffer.overlays.map(({ geometry }) => geometry);
    expect(activeRadarAngularRange(buffer)).toEqual([expect.closeTo(Math.PI / 2, 10), expect.closeTo(Math.PI, 10)]);

    sample(radar, buffer, sector, 500.0001);
    expect(activeRadarSweep(buffer)).toBeCloseTo(beamWidthRad, 5);
    sample(radar, buffer, sector, 625);
    expect(activeRadarSweep(buffer)).toBeCloseTo(beamWidthRad / 2, 10);
    expect(buffer.overlays.filter(({ active }) => active)).toHaveLength(5);

    sample(radar, buffer, sector, 750);
    expect(activeRadarSweep(buffer)).toBeCloseTo(beamWidthRad, 10);
    expect(buffer.overlays.map(({ geometry }) => geometry)).toEqual(turnGeometries);
    sample(radar, buffer, sector, 1000);
    expect(activeRadarSweep(buffer)).toBeCloseTo(beamWidthRad, 10);
    expect(activeRadarAngularRange(buffer)).toEqual([expect.closeTo(0, 10), expect.closeTo(Math.PI / 2, 10)]);
  });

  it.each([
    ['counterclockwise', [Math.PI / 2, Math.PI], [0, Math.PI / 2]],
    ['clockwise', [0, Math.PI / 2], [Math.PI / 2, Math.PI]]
  ] as const)('radar-scan 往返模式由 %s 决定首程方向，并在完整周期返回对应起点', (direction, turnRange, returnRange) => {
    const sector = sectorRadialTarget();
    const radar = createRuntime(radarScanAnimationDefinition, sector, {
      type: 'radar-scan',
      periodMs: 1000,
      direction,
      scanMode: 'round-trip',
      beamWidthDeg: 90,
      repeat: true
    });
    const buffer = createAnimationFrameBuffer(radar.slots);

    sample(radar, buffer, sector, 500);
    expect(activeRadarAngularRange(buffer)).toEqual([expect.closeTo(turnRange[0], 10), expect.closeTo(turnRange[1], 10)]);
    sample(radar, buffer, sector, 1000);
    expect(activeRadarAngularRange(buffer)).toEqual([expect.closeTo(returnRange[0], 10), expect.closeTo(returnRange[1], 10)]);
  });

  it('radar-scan 单次往返在完整周期自然完成', () => {
    const sector = sectorRadialTarget();
    const radar = createRuntime(radarScanAnimationDefinition, sector, {
      type: 'radar-scan',
      periodMs: 1000,
      scanMode: 'round-trip',
      repeat: false
    });
    const buffer = createAnimationFrameBuffer(radar.slots);

    expect(sample(radar, buffer, sector, 999.999).finished).toBe(false);
    expect(buffer.overlays.some(({ active }) => active)).toBe(true);
    expect(sample(radar, buffer, sector, 1000).finished).toBe(true);
    expect(buffer.overlays.every(({ active }) => !active)).toBe(true);
  });

  it('radar-scan 按 resolution 桶调整采样并保持槽内几何与坐标容器稳定', () => {
    const target = radialTarget();
    const radar = createRuntime(radarScanAnimationDefinition, target, { type: 'radar-scan', beamWidthDeg: 360 });
    const buffer = createAnimationFrameBuffer(radar.slots);

    sample(radar, buffer, target, 500, 1);
    const geometry = polygonGeometryFrom(buffer.overlays[0].geometry);
    const ring = geometry.coordinates[0];
    const coarseCoordinates = [...ring];
    const coarseLength = ring.length;
    expect(maxChordErrorCssPx(ring.slice(1, -1), [0, 0], 100, 1)).toBeLessThanOrEqual(0.75 + Number.EPSILON);

    sample(radar, buffer, target, 500, 1.5);
    const sameBucketRing = polygonGeometryFrom(buffer.overlays[0].geometry).coordinates[0];
    expect(sameBucketRing).toBe(ring);
    expect(sameBucketRing).toHaveLength(coarseLength);
    for (let index = 0; index < coarseCoordinates.length; index += 1) expect(sameBucketRing[index]).toBe(coarseCoordinates[index]);

    sample(radar, buffer, target, 500, 0.5);
    const fineRing = polygonGeometryFrom(buffer.overlays[0].geometry).coordinates[0];
    expect(fineRing).toBe(ring);
    expect(fineRing.length).toBeGreaterThan(coarseLength);
    const fineCoordinates = [...fineRing];

    sample(radar, buffer, target, 500, 0.75);
    const sameFineBucketRing = polygonGeometryFrom(buffer.overlays[0].geometry).coordinates[0];
    expect(sameFineBucketRing).toBe(fineRing);
    expect(sameFineBucketRing).toHaveLength(fineCoordinates.length);
    for (let index = 0; index < fineCoordinates.length; index += 1) expect(sameFineBucketRing[index]).toBe(fineCoordinates[index]);
    expect(maxChordErrorCssPx(sameFineBucketRing.slice(1, -1), [0, 0], 100, 0.75)).toBeLessThanOrEqual(0.75 + Number.EPSILON);
  });

  it('center-spread 的 Sector 弧线按外半径预算采样且同 resolution 桶不改变拓扑', () => {
    const target = sectorRadialTarget();
    const spread = createRuntime(centerSpreadAnimationDefinition, target, { type: 'center-spread', periodMs: 1000, ringCount: 1 });
    const buffer = createAnimationFrameBuffer(spread.slots);

    sample(spread, buffer, target, 900, 1);
    const stableFillGeometry = buffer.overlays[0].geometry;
    const geometry = polylineGeometryFrom(buffer.overlays[4].geometry);
    const coordinates = geometry.coordinates;
    const coarseCoordinates = [...coordinates];
    const coarseLength = coordinates.length;
    expect(maxChordErrorCssPx(coordinates, [0, 0], 90, 1)).toBeLessThanOrEqual(0.75 + Number.EPSILON);

    sample(spread, buffer, target, 900, 1.5);
    const sameBucketCoordinates = polylineGeometryFrom(buffer.overlays[4].geometry).coordinates;
    expect(buffer.overlays[0].geometry).toBe(stableFillGeometry);
    expect(sameBucketCoordinates).toBe(coordinates);
    expect(sameBucketCoordinates).toHaveLength(coarseLength);
    for (let index = 0; index < coarseCoordinates.length; index += 1) expect(sameBucketCoordinates[index]).toBe(coarseCoordinates[index]);

    sample(spread, buffer, target, 900, 0.5);
    const fineCoordinates = polylineGeometryFrom(buffer.overlays[4].geometry).coordinates;
    expect(buffer.overlays[0].geometry).toBe(stableFillGeometry);
    expect(fineCoordinates).toBe(coordinates);
    expect(fineCoordinates.length).toBeGreaterThan(coarseLength);
    const fineCoordinateRefs = [...fineCoordinates];

    sample(spread, buffer, target, 900, 0.75);
    const sameFineBucketCoordinates = polylineGeometryFrom(buffer.overlays[4].geometry).coordinates;
    expect(sameFineBucketCoordinates).toBe(fineCoordinates);
    expect(sameFineBucketCoordinates).toHaveLength(fineCoordinateRefs.length);
    for (let index = 0; index < fineCoordinateRefs.length; index += 1) expect(sameFineBucketCoordinates[index]).toBe(fineCoordinateRefs[index]);
    expect(maxChordErrorCssPx(sameFineBucketCoordinates, [0, 0], 90, 0.75)).toBeLessThanOrEqual(0.75 + Number.EPSILON);

    const sameRadiusBucketTarget = sectorRadialTarget(120);
    spread.rebind(sameRadiusBucketTarget);
    sample(spread, buffer, sameRadiusBucketTarget, 900, 0.75);
    const sameRadiusBucketCoordinates = polylineGeometryFrom(buffer.overlays[4].geometry).coordinates;
    expect(buffer.overlays[0].geometry).toBe(stableFillGeometry);
    expect(sameRadiusBucketCoordinates).toBe(coordinates);
    expect(sameRadiusBucketCoordinates).toHaveLength(fineCoordinateRefs.length);
    for (let index = 0; index < fineCoordinateRefs.length; index += 1) expect(sameRadiusBucketCoordinates[index]).toBe(fineCoordinateRefs[index]);
    expect(maxChordErrorCssPx(sameRadiusBucketCoordinates, [0, 0], 108, 0.75)).toBeLessThanOrEqual(0.75 + Number.EPSILON);

    const largerRadiusBucketTarget = sectorRadialTarget(200);
    spread.rebind(largerRadiusBucketTarget);
    sample(spread, buffer, largerRadiusBucketTarget, 900, 0.75);
    const largerRadiusBucketCoordinates = polylineGeometryFrom(buffer.overlays[4].geometry).coordinates;
    expect(buffer.overlays[0].geometry).toBe(stableFillGeometry);
    expect(largerRadiusBucketCoordinates).toBe(coordinates);
    expect(largerRadiusBucketCoordinates.length).toBeGreaterThan(fineCoordinateRefs.length);
    expect(maxChordErrorCssPx(largerRadiusBucketCoordinates, [0, 0], 180, 0.75)).toBeLessThanOrEqual(0.75 + Number.EPSILON);
  });

  it('在创建记录前拒绝不具备目标能力的 Shape 和 NativeStyleRef', () => {
    const point = targetProfile({ type: 'point', coordinates: [0, 0] });
    expect(() => highlightAnimationDefinition.assertCompatible(point)).toThrowError(CapabilityError);
    expect(() => radarScanAnimationDefinition.assertCompatible(point)).toThrowError(CapabilityError);
    expect(() =>
      growAnimationDefinition.assertCompatible(
        targetProfile({
          type: 'polyline',
          coordinates: [
            [0, 0],
            [0, 0]
          ]
        })
      )
    ).toThrowError(CapabilityError);

    const structured = targetProfile({ type: 'point', coordinates: [0, 0] });
    const native = { ...structured, state: Object.freeze({ ...structured.state, style: createNativeStyleRef() }) } as AnimationTargetProfile;
    expect(() => blinkAnimationDefinition.assertCompatible(native)).toThrowError(UnsupportedOperationError);
  });
});

function createRuntime(definition: AnimationDefinition, target: AnimationTargetProfile, spec: unknown): AnimationRuntime {
  const normalized = definition.normalize(spec);
  definition.assertCompatible(target);
  return definition.create(target, normalized);
}

function sample(
  runtime: AnimationRuntime,
  buffer: ReturnType<typeof createAnimationFrameBuffer>,
  target: AnimationTargetProfile,
  elapsedMs: number,
  resolution = 1
) {
  const context: AnimationFrameContext = { target, elapsedMs, resolution, rotation: 0, pixelRatio: 1 };
  return runtime.sample(context, buffer);
}

function activeRadarSweep(buffer: ReturnType<typeof createAnimationFrameBuffer>): number {
  return activeRadarArcCoordinateSets(buffer).reduce((total, arc) => total + radarArcSweep(arc), 0);
}

function activeRadarArcCoordinates(buffer: ReturnType<typeof createAnimationFrameBuffer>): readonly Coordinate[] {
  return activeRadarArcCoordinateSets(buffer).flat();
}

function activeRadarArcCoordinateSets(buffer: ReturnType<typeof createAnimationFrameBuffer>): readonly (readonly Coordinate[])[] {
  const arcs: Coordinate[][] = [];
  for (const overlay of buffer.overlays) {
    if (!overlay.active || overlay.geometry?.type !== 'polygon') continue;
    arcs.push(overlay.geometry.coordinates[0].slice(1, -1));
  }
  return arcs;
}

function activeRadarAngularRange(buffer: ReturnType<typeof createAnimationFrameBuffer>): readonly [number, number] {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const coordinate of activeRadarArcCoordinates(buffer)) {
    const angle = Math.atan2(coordinate[1], coordinate[0]);
    minimum = Math.min(minimum, angle);
    maximum = Math.max(maximum, angle);
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) throw new Error('Expected active radar arc coordinates');
  return [minimum, maximum];
}

function radarArcSweep(arc: readonly Coordinate[]): number {
  let sweep = 0;
  for (let index = 1; index < arc.length; index += 1) {
    const previous = Math.atan2(arc[index - 1][1], arc[index - 1][0]);
    const current = Math.atan2(arc[index][1], arc[index][0]);
    sweep += Math.abs(signedAngularDelta(current - previous));
  }
  return sweep;
}

function signedAngularDelta(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function polygonGeometry(): RenderGeometryState {
  return {
    type: 'polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0]
      ]
    ]
  };
}

function radialTarget(): AnimationTargetProfile {
  return targetProfile(
    { type: 'circle', center: [0, 0], radius: 100 },
    {
      radialFrame: () => ({ center: [0, 0], radius: 100, startAngleRad: Math.PI / 2, sweepAngleRad: Math.PI * 2 })
    }
  );
}

function sectorRadialTarget(radius = 100): AnimationTargetProfile {
  return targetProfile(
    {
      type: 'polygon',
      coordinates: [
        [
          [0, 0],
          [radius, 0],
          [-radius, 0],
          [0, 0]
        ]
      ]
    },
    {
      radialFrame: () => ({ center: [0, 0], radius, startAngleRad: 0, sweepAngleRad: Math.PI })
    }
  );
}

function polygonGeometryFrom(geometry: RenderGeometryState | undefined): Extract<RenderGeometryState, { type: 'polygon' }> {
  if (geometry?.type !== 'polygon') throw new Error('Expected polygon animation geometry');
  return geometry;
}

function polylineGeometryFrom(geometry: RenderGeometryState | undefined): Extract<RenderGeometryState, { type: 'polyline' }> {
  if (geometry?.type !== 'polyline') throw new Error('Expected polyline animation geometry');
  return geometry;
}

function expectRadialRange(coordinates: readonly Coordinate[], center: Coordinate, expectedMinimum: number, expectedMaximum: number): void {
  const radii = coordinates.map((coordinate) => Math.hypot(coordinate[0] - center[0], coordinate[1] - center[1]));
  expect(Math.min(...radii)).toBeCloseTo(expectedMinimum, 10);
  expect(Math.max(...radii)).toBeCloseTo(expectedMaximum, 10);
}

function expectCoordinateCloseTo(actual: Coordinate | undefined, expected: Coordinate): void {
  if (actual === undefined) throw new Error('Expected coordinate');
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index += 1) expect(actual[index]).toBeCloseTo(expected[index], 10);
}

function maxChordErrorCssPx(coordinates: readonly Coordinate[], center: Coordinate, radius: number, resolution: number): number {
  let maximum = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const left = coordinates[index - 1];
    const right = coordinates[index];
    const midpointX = (left[0] + right[0]) / 2;
    const midpointY = (left[1] + right[1]) / 2;
    maximum = Math.max(maximum, (radius - Math.hypot(midpointX - center[0], midpointY - center[1])) / resolution);
  }
  return maximum;
}

function targetProfile(geometry: RenderGeometryState, animation?: ShapeAnimationProfile): AnimationTargetProfile {
  const type: ShapeType =
    geometry.type === 'point' || geometry.type === 'polyline' || geometry.type === 'polygon' || geometry.type === 'circle' ? geometry.type : 'point';
  const viewShape = (
    type === 'circle'
      ? { type: 'circle', center: geometry.type === 'circle' ? geometry.center : [0, 0], radius: geometry.type === 'circle' ? geometry.radius : 1 }
      : { type, controlPoints: [] }
  ) as ShapeState;
  const style = geometry.type === 'point' ? { symbol: { type: 'circle' as const, radius: 4 } } : { strokes: [{ color: '#000000', width: 2 }] };
  const profile = {
    state: Object.freeze({ id: 'target', type, geometry: viewShape, style, layerId: 'default', visible: true }),
    viewShape,
    geometry,
    style,
    shape: shapeDefinition(type, animation)
  };
  return profile as AnimationTargetProfile;
}

function shapeDefinition(type: ShapeType, animation?: ShapeAnimationProfile): ShapeDefinition {
  return {
    type,
    capabilities: new Set(),
    ...(animation === undefined ? {} : { animation }),
    createDraft: () => undefined,
    normalize: (input) => input as ShapeState,
    clone: (state) => state,
    isComplete: () => true,
    tryComplete: (state) => ({ status: 'complete', state }),
    toRenderGeometry: () => ({ type: 'point', coordinates: [0, 0] })
  } as ShapeDefinition;
}
