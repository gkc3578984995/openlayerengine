import type { PulseAnimationSpec } from '../../core/animation/types.js';
import { CapabilityError } from '../../core/errors.js';
import type {
  AnimationDefinition,
  AnimationFrameBuffer,
  AnimationFrameContext,
  AnimationRuntime,
  AnimationSample,
  AnimationTargetProfile
} from '../../services/animation/types.js';
import { animationRecord, boolean, channel, color, positive } from './validation.js';

const continuousSample = Object.freeze({ finished: false, schedule: Object.freeze({ kind: 'continuous' as const }) });
const finishedSample = Object.freeze({ finished: true, schedule: Object.freeze({ kind: 'stable' as const }) });

export const pulseAnimationDefinition = Object.freeze({
  type: 'pulse',
  writeDomains: new Set(['overlay'] as const),
  requirements: new Set(['structured-presentation'] as const),
  interactionPolicy: Object.freeze({ edit: 'pause-and-suppress', transform: 'pause-and-suppress' }),
  normalize(input) {
    const record = animationRecord(input, 'pulse', ['type', 'channel', 'periodMs', 'color', 'repeat', 'radius']);
    if (record.type !== 'pulse') throw new CapabilityError('Pulse animation type must be pulse');
    return Object.freeze({
      type: 'pulse',
      channel: channel(record.channel, 'pulse', 'Pulse channel'),
      periodMs: positive(record.periodMs, 1000, 'Pulse periodMs'),
      color: color(record.color, '#ff0000', 'Pulse color'),
      repeat: boolean(record.repeat, true, 'Pulse repeat'),
      radius: positive(record.radius, 6, 'Pulse radius')
    }) satisfies PulseAnimationSpec;
  },
  assertCompatible(target) {
    if (target.geometry.type !== 'point') throw new CapabilityError('Pulse animation requires point render geometry');
  },
  create(target, input) {
    this.assertCompatible(target);
    return createPulseRuntime(target, input);
  }
} satisfies AnimationDefinition<PulseAnimationSpec>);

function createPulseRuntime(initialTarget: AnimationTargetProfile, spec: Readonly<PulseAnimationSpec>): AnimationRuntime {
  let target = initialTarget;
  const runningSample: AnimationSample =
    spec.repeat === true
      ? continuousSample
      : Object.freeze({ finished: false, schedule: Object.freeze({ kind: 'continuous' as const }), wakeAtElapsedMs: spec.periodMs ?? 1000 });
  const slots = Object.freeze([
    Object.freeze({
      slotKey: 'pulse-ring',
      style: Object.freeze({
        symbol: Object.freeze({
          type: 'circle' as const,
          radius: spec.radius ?? 6,
          stroke: Object.freeze({ color: spec.color ?? '#ff0000', width: 1 })
        })
      }),
      dynamicParameters: Object.freeze(['symbolRadius', 'strokeWidth'] as const)
    })
  ]);
  return {
    slots,
    visualOutsetPx: (spec.radius ?? 6) + 11,
    rebind(next) {
      if (next.geometry.type !== 'point') throw new CapabilityError('Pulse animation requires point render geometry');
      target = next;
    },
    sample(context: AnimationFrameContext, output: AnimationFrameBuffer): AnimationSample {
      output.reset();
      const periodMs = spec.periodMs ?? 1000;
      if (spec.repeat !== true && context.elapsedMs >= periodMs) return finishedSample;
      const phase = (context.elapsedMs % periodMs) / periodMs;
      const radiusProgress = easeOut(phase);
      const opacity = easeOut(1 - phase);
      const slot = output.overlay('pulse-ring');
      slot.active = true;
      slot.geometryKind = 'snapshot';
      slot.geometry = target.geometry;
      slot.opacity = opacity;
      slot.symbolRadius = (spec.radius ?? 6) + radiusProgress * 10;
      slot.strokeWidth = 0.25 + opacity;
      return runningSample;
    },
    destroy() {
      return;
    }
  };
}

function easeOut(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}
