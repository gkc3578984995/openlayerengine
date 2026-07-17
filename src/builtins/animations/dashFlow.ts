import type { DashFlowAnimationSpec } from '../../core/animation/types.js';
import { cloneCoreState } from '../../core/common/clone.js';
import { CapabilityError, InvalidArgumentError } from '../../core/errors.js';
import type { StyleSpec } from '../../core/style/types.js';
import type {
  AnimationDefinition,
  AnimationFrameBuffer,
  AnimationFrameContext,
  AnimationRuntime,
  AnimationSlotDefinition,
  AnimationTargetProfile
} from '../../services/animation/types.js';
import { animationRecord, arrayValues, channel, finite, optionalColor } from './validation.js';

const continuousSample = Object.freeze({ finished: false, schedule: Object.freeze({ kind: 'continuous' as const }) });

export const dashFlowAnimationDefinition = Object.freeze({
  type: 'dash-flow',
  writeDomains: new Set(['overlay'] as const),
  requirements: new Set(['structured-presentation'] as const),
  interactionPolicy: Object.freeze({ edit: 'pause-and-suppress', transform: 'follow-preview' }),
  normalize(input) {
    const record = animationRecord(input, 'dash-flow', ['type', 'channel', 'speed', 'lineDash', 'color']);
    if (record.type !== 'dash-flow') throw new CapabilityError('Dash-flow animation type must be dash-flow');
    const lineDash = normalizeLineDash(record.lineDash);
    const animation: DashFlowAnimationSpec = {
      type: 'dash-flow',
      channel: channel(record.channel, 'dash-flow', 'Dash-flow channel'),
      speed: finite(record.speed, 24, 'Dash-flow speed'),
      ...(lineDash === undefined ? {} : { lineDash }),
      ...(record.color === undefined ? {} : { color: optionalColor(record.color, 'Dash-flow color') })
    };
    return Object.freeze(animation);
  },
  assertCompatible(target) {
    assertPolyline(target);
  },
  create(target, spec) {
    assertPolyline(target);
    return createDashFlowRuntime(target, spec);
  }
} satisfies AnimationDefinition<DashFlowAnimationSpec>);

function createDashFlowRuntime(initialTarget: AnimationTargetProfile, spec: Readonly<DashFlowAnimationSpec>): AnimationRuntime {
  let target = initialTarget;
  let slots = createSlots(target, spec);
  return {
    get slots() {
      return slots;
    },
    rebind(next) {
      assertPolyline(next);
      target = next;
      slots = createSlots(target, spec);
    },
    sample(context: AnimationFrameContext, output: AnimationFrameBuffer) {
      output.reset();
      const slot = output.overlay('dash-flow');
      slot.active = true;
      slot.geometryKind = 'effective-target';
      const strokeCount = target.style.strokes?.length ?? 1;
      if (strokeCount > 0) {
        slot.lineDashOffset = -((context.elapsedMs / 1000) * (spec.speed ?? 24));
        slot.lineDashOffsetStrokeIndex = strokeCount - 1;
      }
      return continuousSample;
    },
    destroy() {
      return;
    }
  };
}

function createSlots(target: AnimationTargetProfile, spec: Readonly<DashFlowAnimationSpec>): readonly AnimationSlotDefinition[] {
  const base = cloneCoreState(target.style) as StyleSpec;
  const sourceStrokes = base.strokes ?? [{ width: 2 }];
  const strokes = sourceStrokes.map((stroke, index) => ({
    ...stroke,
    lineDash: [...(index === sourceStrokes.length - 1 ? (spec.lineDash ?? stroke.lineDash ?? [10, 10]) : (stroke.lineDash ?? []))],
    ...(index === sourceStrokes.length - 1 && spec.color !== undefined ? { color: spec.color } : {})
  }));
  const style = cloneCoreState({ ...base, strokes }) as StyleSpec;
  return Object.freeze([Object.freeze({ slotKey: 'dash-flow', style, dynamicParameters: Object.freeze(['lineDashOffset'] as const) })]);
}

function assertPolyline(target: AnimationTargetProfile): void {
  if (target.geometry.type !== 'polyline') throw new CapabilityError('Dash-flow animation requires polyline render geometry');
}

function normalizeLineDash(value: unknown): readonly number[] | undefined {
  if (value === undefined) return undefined;
  const parts = arrayValues(value, 'Dash-flow lineDash');
  if (parts.length === 0 || parts.some((part) => typeof part !== 'number' || !Number.isFinite(part) || part < 0)) {
    throw new InvalidArgumentError('Dash-flow lineDash must be a non-empty array of finite non-negative numbers');
  }
  if (parts.every((part) => part === 0)) throw new InvalidArgumentError('Dash-flow lineDash cannot contain only zeros');
  return Object.freeze(parts as readonly number[]);
}
