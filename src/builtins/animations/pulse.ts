import type { PulseAnimationSpec } from '../../core/animation/types.js';
import { CapabilityError } from '../../core/errors.js';
import type { AnimationDefinition, AnimationFrameResult } from '../../services/animation/types.js';
import { animationRecord, boolean, channel, color, colorWithOpacity, positive } from './validation.js';

/** 内部常量。保存 pulseAnimationDefinition 使用的数据。 */
export const pulseAnimationDefinition = Object.freeze({
  type: 'pulse',
  /** 校验并整理输入数据。 */
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
  /** 检查动画和图形是否兼容。 */
  assertCompatible(_state, geometry) {
    if (geometry.type !== 'point') throw new CapabilityError('Pulse animation requires point render geometry');
  },
  /** 计算当前动画帧。 */
  frame(context, input): AnimationFrameResult {
    const spec = input as Required<PulseAnimationSpec>;
    const complete = !spec.repeat && context.elapsedMs >= spec.periodMs;
    if (complete) return Object.freeze({ value: Object.freeze({ primitives: Object.freeze([]) }), finished: true });
    const phase = (context.elapsedMs % spec.periodMs) / spec.periodMs;
    const radiusProgress = easeOut(phase);
    const opacity = easeOut(1 - phase);
    return Object.freeze({
      value: Object.freeze({
        primitives: Object.freeze([
          Object.freeze({
            geometry: context.geometry,
            style: Object.freeze({
              symbol: Object.freeze({
                type: 'circle',
                radius: spec.radius + radiusProgress * 10,
                stroke: Object.freeze({ color: colorWithOpacity(spec.color, opacity), width: 0.25 + opacity })
              })
            })
          })
        ])
      }),
      finished: false
    });
  }
} satisfies AnimationDefinition);

/** 内部方法。处理 easeOut 相关数据。 */
function easeOut(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}
