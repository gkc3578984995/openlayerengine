import type { FadeAnimationSpec } from '../../core/animation/types.js';
import type { AnimationDefinition, AnimationRuntime, AnimationTargetProfile } from '../../services/animation/types.js';
import {
  assertStructuredPresentation,
  continuousUntil,
  finishedSample,
  pauseAndSuppressInteractionPolicy,
  requirements,
  retainedFinishedSample,
  writeDomains
} from './effectRuntime.js';
import { animationFinishedAt, fadeOpacityAt } from './timeline.js';
import { animationRecord, channel, choice, literal, positive, requiredChoice } from './validation.js';

/** 已补齐默认值并通过严格校验的 fade 配置。 */
export type NormalizedFadeAnimationSpec = Readonly<Required<FadeAnimationSpec>>;

/** 严格校验并补齐 fade 配置。 */
export function normalizeFadeAnimationSpec(input: unknown): NormalizedFadeAnimationSpec {
  const record = animationRecord(input, 'fade', ['type', 'channel', 'direction', 'durationMs', 'easing']);
  return Object.freeze({
    type: literal(record.type, 'fade', 'Fade type'),
    channel: channel(record.channel, 'fade', 'Fade channel'),
    direction: requiredChoice(record.direction, ['in', 'out'], 'Fade direction'),
    durationMs: positive(record.durationMs, 500, 'Fade durationMs'),
    easing: choice(record.easing, 'ease-in-out', ['linear', 'ease-in', 'ease-out', 'ease-in-out'], 'Fade easing')
  });
}

/** 修改结构化目标整体透明度的内置 fade 定义。 */
export const fadeAnimationDefinition = Object.freeze({
  type: 'fade',
  writeDomains: writeDomains('target-opacity'),
  requirements: requirements('structured-presentation'),
  interactionPolicy: pauseAndSuppressInteractionPolicy,
  normalize: normalizeFadeAnimationSpec,
  assertCompatible: assertStructuredPresentation,
  create(target, input) {
    assertStructuredPresentation(target);
    return fadeRuntime(input as NormalizedFadeAnimationSpec);
  }
} satisfies AnimationDefinition<FadeAnimationSpec>);

function fadeRuntime(spec: NormalizedFadeAnimationSpec): AnimationRuntime {
  const runningSample = continuousUntil(spec.durationMs);
  return {
    slots: Object.freeze([]),
    rebind(target: AnimationTargetProfile) {
      assertStructuredPresentation(target);
    },
    sample(context, output) {
      output.reset();
      const finished = animationFinishedAt(context.elapsedMs, spec.durationMs, false);
      if (finished && spec.direction === 'in') return finishedSample;
      output.targetOpacity = fadeOpacityAt(context.elapsedMs, spec.durationMs, spec.direction, spec.easing);
      return finished ? retainedFinishedSample : runningSample;
    },
    destroy() {}
  };
}
