import type { HighlightAnimationSpec } from '../../core/animation/types.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type { AnimationDefinition, AnimationRuntime, AnimationSlotDefinition, AnimationTargetProfile } from '../../services/animation/types.js';
import { assertClosedSurface, continuousSample, pauseAndSuppressInteractionPolicy, requirements, stableSample, writeDomains } from './effectRuntime.js';
import { highlightIntensityAt } from './timeline.js';
import { animationRecord, channel, choice, color, literal, nonNegative, positive, unitInterval } from './validation.js';

/** 已补齐默认值并通过严格校验的 highlight 配置。 */
export type NormalizedHighlightAnimationSpec = Readonly<Required<HighlightAnimationSpec>>;

/** 严格校验并补齐 highlight 配置。 */
export function normalizeHighlightAnimationSpec(input: unknown): NormalizedHighlightAnimationSpec {
  const record = animationRecord(input, 'highlight', ['type', 'channel', 'mode', 'color', 'fillOpacity', 'strokeWidth', 'periodMs']);
  const mode = choice(record.mode, 'steady', ['steady', 'breathe'], 'Highlight mode');
  if (mode === 'steady' && record.periodMs !== undefined) {
    throw new InvalidArgumentError('Highlight periodMs is only available in breathe mode');
  }
  return Object.freeze({
    type: literal(record.type, 'highlight', 'Highlight type'),
    channel: channel(record.channel, 'highlight', 'Highlight channel'),
    mode,
    color: color(record.color, '#ffc107', 'Highlight color'),
    fillOpacity: unitInterval(record.fillOpacity, 0.18, 'Highlight fillOpacity'),
    strokeWidth: nonNegative(record.strokeWidth, 3, 'Highlight strokeWidth'),
    periodMs: positive(record.periodMs, 1200, 'Highlight periodMs')
  });
}

/** 在闭合面有效展示几何上绘制高亮 overlay 的内置定义。 */
export const highlightAnimationDefinition = Object.freeze({
  type: 'highlight',
  writeDomains: writeDomains('overlay'),
  requirements: requirements('structured-presentation', 'closed-surface'),
  interactionPolicy: pauseAndSuppressInteractionPolicy,
  normalize: normalizeHighlightAnimationSpec,
  assertCompatible: assertClosedSurface,
  create(target, input) {
    assertClosedSurface(target);
    return highlightRuntime(input as NormalizedHighlightAnimationSpec);
  }
} satisfies AnimationDefinition<HighlightAnimationSpec>);

function highlightRuntime(spec: NormalizedHighlightAnimationSpec): AnimationRuntime {
  const visible = spec.fillOpacity > 0 || spec.strokeWidth > 0;
  const slots: readonly AnimationSlotDefinition[] = Object.freeze([
    Object.freeze({
      slotKey: 'highlight-fill',
      style: Object.freeze({ fill: Object.freeze({ type: 'solid' as const, color: spec.color }) })
    }),
    Object.freeze({
      slotKey: 'highlight-stroke',
      style: Object.freeze({ strokes: [Object.freeze({ color: spec.color, width: spec.strokeWidth })] })
    })
  ]);
  return {
    slots,
    rebind(target: AnimationTargetProfile) {
      assertClosedSurface(target);
    },
    sample(context, output) {
      output.reset();
      const intensity = highlightIntensityAt(context.elapsedMs, spec.periodMs, spec.mode);
      const fill = output.overlay('highlight-fill');
      fill.active = spec.fillOpacity * intensity > 0;
      fill.geometryKind = 'effective-target';
      fill.opacity = spec.fillOpacity * intensity;
      const stroke = output.overlay('highlight-stroke');
      stroke.active = spec.strokeWidth > 0 && intensity > 0;
      stroke.geometryKind = 'effective-target';
      stroke.opacity = intensity;
      return spec.mode === 'steady' || !visible ? stableSample : continuousSample;
    },
    destroy() {}
  };
}
