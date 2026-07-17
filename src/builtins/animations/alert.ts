import type { AlertAnimationSpec } from '../../core/animation/types.js';
import type { AnimationDefinition, AnimationRuntime, AnimationSlotDefinition, AnimationTargetProfile } from '../../services/animation/types.js';
import {
  assertClosedSurface,
  continuousSample,
  continuousUntil,
  finishedSample,
  pauseAndSuppressInteractionPolicy,
  requirements,
  stableSample,
  stableUntil,
  writeDomains
} from './effectRuntime.js';
import { alertIntensityAt, animationFinishedAt } from './timeline.js';
import { animationRecord, boolean, channel, color, literal, nonNegative, positive, unitInterval } from './validation.js';

/** 已补齐默认值并通过严格校验的 alert 配置。 */
export type NormalizedAlertAnimationSpec = Readonly<Required<AlertAnimationSpec>>;

/** 严格校验并补齐 alert 配置。 */
export function normalizeAlertAnimationSpec(input: unknown): NormalizedAlertAnimationSpec {
  const record = animationRecord(input, 'alert', ['type', 'channel', 'periodMs', 'color', 'fillOpacity', 'strokeWidth', 'repeat']);
  return Object.freeze({
    type: literal(record.type, 'alert', 'Alert type'),
    channel: channel(record.channel, 'alert', 'Alert channel'),
    periodMs: positive(record.periodMs, 1200, 'Alert periodMs'),
    color: color(record.color, '#ff3b30', 'Alert color'),
    fillOpacity: unitInterval(record.fillOpacity, 0.22, 'Alert fillOpacity'),
    strokeWidth: nonNegative(record.strokeWidth, 3, 'Alert strokeWidth'),
    repeat: boolean(record.repeat, true, 'Alert repeat')
  });
}

/** 在闭合面有效展示几何上绘制固定双峰告警 overlay 的内置定义。 */
export const alertAnimationDefinition = Object.freeze({
  type: 'alert',
  writeDomains: writeDomains('overlay'),
  requirements: requirements('structured-presentation', 'closed-surface'),
  interactionPolicy: pauseAndSuppressInteractionPolicy,
  normalize: normalizeAlertAnimationSpec,
  assertCompatible: assertClosedSurface,
  create(target, input) {
    assertClosedSurface(target);
    return alertRuntime(input as NormalizedAlertAnimationSpec);
  }
} satisfies AnimationDefinition<AlertAnimationSpec>);

function alertRuntime(spec: NormalizedAlertAnimationSpec): AnimationRuntime {
  const visible = spec.fillOpacity > 0 || spec.strokeWidth > 0;
  const runningSample = visible ? (spec.repeat ? continuousSample : continuousUntil(spec.periodMs)) : spec.repeat ? stableSample : stableUntil(spec.periodMs);
  const slots: readonly AnimationSlotDefinition[] = Object.freeze([
    Object.freeze({
      slotKey: 'alert-fill',
      style: Object.freeze({ fill: Object.freeze({ type: 'solid' as const, color: spec.color }) })
    }),
    Object.freeze({
      slotKey: 'alert-stroke',
      style: Object.freeze({ strokes: [Object.freeze({ color: spec.color, width: spec.strokeWidth })] })
    }),
    Object.freeze({
      slotKey: 'alert-glow',
      style: Object.freeze({ strokes: [Object.freeze({ color: spec.color, width: spec.strokeWidth * 3 })] })
    })
  ]);
  return {
    slots,
    rebind(target: AnimationTargetProfile) {
      assertClosedSurface(target);
    },
    sample(context, output) {
      output.reset();
      if (animationFinishedAt(context.elapsedMs, spec.periodMs, spec.repeat)) return finishedSample;
      const intensity = alertIntensityAt(context.elapsedMs, spec.periodMs, spec.repeat);
      const fill = output.overlay('alert-fill');
      fill.active = intensity > 0 && spec.fillOpacity > 0;
      fill.geometryKind = 'effective-target';
      fill.opacity = intensity * spec.fillOpacity;
      const stroke = output.overlay('alert-stroke');
      stroke.active = intensity > 0 && spec.strokeWidth > 0;
      stroke.geometryKind = 'effective-target';
      stroke.opacity = intensity;
      const glow = output.overlay('alert-glow');
      glow.active = intensity > 0 && spec.strokeWidth > 0;
      glow.geometryKind = 'effective-target';
      glow.opacity = intensity * 0.35;
      return runningSample;
    },
    destroy() {}
  };
}
