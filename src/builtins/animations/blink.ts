import type { BlinkAnimationSpec } from '../../core/animation/types.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type { AnimationDefinition, AnimationRuntime, AnimationTargetProfile } from '../../services/animation/types.js';
import { assertStructuredPresentation, finishedSample, pauseAndSuppressInteractionPolicy, requirements, writeDomains } from './effectRuntime.js';
import { animationFinishedAt, blinkOpacityAt, nextBlinkDeadlineAt } from './timeline.js';
import { animationRecord, boolean, channel, exclusiveUnitInterval, literal, positive, unitInterval } from './validation.js';

/** 已补齐默认值并通过严格校验的 blink 配置。 */
export type NormalizedBlinkAnimationSpec = Readonly<Required<BlinkAnimationSpec>>;

/** 严格校验并补齐 blink 配置。 */
export function normalizeBlinkAnimationSpec(input: unknown): NormalizedBlinkAnimationSpec {
  const record = animationRecord(input, 'blink', ['type', 'channel', 'periodMs', 'dutyCycle', 'minOpacity', 'maxOpacity', 'repeat']);
  const minOpacity = unitInterval(record.minOpacity, 0, 'Blink minOpacity');
  const maxOpacity = unitInterval(record.maxOpacity, 1, 'Blink maxOpacity');
  if (minOpacity >= maxOpacity) throw new InvalidArgumentError('Blink minOpacity must be less than maxOpacity');
  return Object.freeze({
    type: literal(record.type, 'blink', 'Blink type'),
    channel: channel(record.channel, 'blink', 'Blink channel'),
    periodMs: positive(record.periodMs, 800, 'Blink periodMs'),
    dutyCycle: exclusiveUnitInterval(record.dutyCycle, 0.5, 'Blink dutyCycle'),
    minOpacity,
    maxOpacity,
    repeat: boolean(record.repeat, true, 'Blink repeat')
  });
}

/** 阶跃修改目标整体透明度的内置 blink 定义。 */
export const blinkAnimationDefinition = Object.freeze({
  type: 'blink',
  writeDomains: writeDomains('target-opacity'),
  requirements: requirements('structured-presentation'),
  interactionPolicy: pauseAndSuppressInteractionPolicy,
  normalize: normalizeBlinkAnimationSpec,
  assertCompatible: assertStructuredPresentation,
  create(target, input) {
    assertStructuredPresentation(target);
    const spec = input as NormalizedBlinkAnimationSpec;
    return blinkRuntime(spec);
  }
} satisfies AnimationDefinition<BlinkAnimationSpec>);

function blinkRuntime(spec: NormalizedBlinkAnimationSpec): AnimationRuntime {
  return {
    slots: Object.freeze([]),
    rebind(target: AnimationTargetProfile) {
      assertStructuredPresentation(target);
    },
    sample(context, output) {
      output.reset();
      const elapsedMs = context.elapsedMs;
      if (animationFinishedAt(elapsedMs, spec.periodMs, spec.repeat)) return finishedSample;
      output.targetOpacity = blinkOpacityAt(elapsedMs, spec.periodMs, spec.dutyCycle, spec.minOpacity, spec.maxOpacity, spec.repeat);
      const deadline = nextBlinkDeadlineAt(elapsedMs, spec.periodMs, spec.dutyCycle, spec.repeat);
      return Object.freeze({
        finished: false,
        schedule: deadline === undefined ? Object.freeze({ kind: 'stable' as const }) : Object.freeze({ kind: 'deadline' as const, atElapsedMs: deadline })
      });
    },
    destroy() {}
  };
}
