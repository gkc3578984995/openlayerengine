import { AnimationRegistry } from '../../services/animation/AnimationRegistry.js';
import { dashFlowAnimationDefinition } from './dashFlow.js';
import { pathTravelAnimationDefinition } from './pathTravel.js';
import { pulseAnimationDefinition } from './pulse.js';

/** 引擎内置动画类型。 */
export const animationTypes = ['pulse', 'dash-flow', 'path-travel'] as const;

/** 内置动画类型名称。 */
export type AnimationType = (typeof animationTypes)[number];

/** 统一载入 AnimationRegistry 的内置动画定义。 */
export const builtinAnimationDefinitions = Object.freeze([pulseAnimationDefinition, dashFlowAnimationDefinition, pathTravelAnimationDefinition]);

/** 创建已载入全部内置动画的 AnimationRegistry。 */
export function createBuiltinAnimationRegistry(): AnimationRegistry {
  return new AnimationRegistry(builtinAnimationDefinitions);
}
