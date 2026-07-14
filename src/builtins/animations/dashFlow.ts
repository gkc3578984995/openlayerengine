import type { DashFlowAnimationSpec } from '../../core/animation/types.js';
import { cloneCoreState } from '../../core/common/clone.js';
import { CapabilityError, InvalidArgumentError } from '../../core/errors.js';
import type { StyleSpec } from '../../core/style/types.js';
import type { AnimationDefinition, AnimationFrameResult } from '../../services/animation/types.js';
import { animationRecord, arrayValues, channel, finite, optionalColor } from './validation.js';

export const dashFlowAnimationDefinition = Object.freeze({
  type: 'dash-flow',
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
  assertCompatible(_state, geometry) {
    if (geometry.type !== 'polyline') throw new CapabilityError('Dash-flow animation requires polyline render geometry');
  },
  frame(context, input): AnimationFrameResult {
    const spec = input as DashFlowAnimationSpec;
    const base = cloneCoreState(context.style) as StyleSpec;
    const sourceStrokes = base.strokes ?? [{ width: 2 }];
    const strokes = sourceStrokes.map((stroke, index) => ({
      ...stroke,
      lineDash: [...(index === sourceStrokes.length - 1 ? (spec.lineDash ?? stroke.lineDash ?? [10, 10]) : (stroke.lineDash ?? []))],
      ...(index === sourceStrokes.length - 1 ? { lineDashOffset: -((context.elapsedMs / 1000) * (spec.speed ?? 24)) } : {}),
      ...(index === sourceStrokes.length - 1 && spec.color !== undefined ? { color: spec.color } : {})
    }));
    const style = cloneCoreState({ ...base, strokes }) as StyleSpec;
    return Object.freeze({
      value: Object.freeze({ primitives: Object.freeze([Object.freeze({ geometry: context.geometry, style })]) }),
      finished: false
    });
  }
} satisfies AnimationDefinition);

function normalizeLineDash(value: unknown): readonly number[] | undefined {
  if (value === undefined) return undefined;
  const parts = arrayValues(value, 'Dash-flow lineDash');
  if (parts.length === 0 || parts.some((part) => typeof part !== 'number' || !Number.isFinite(part) || part < 0)) {
    throw new InvalidArgumentError('Dash-flow lineDash must be a non-empty array of finite non-negative numbers');
  }
  if (parts.every((part) => part === 0)) throw new InvalidArgumentError('Dash-flow lineDash cannot contain only zeros');
  return Object.freeze(parts as readonly number[]);
}
