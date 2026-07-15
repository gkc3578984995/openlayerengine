import { AnimationRegistry } from '../../services/animation/AnimationRegistry.js';
import { dashFlowAnimationDefinition } from './dashFlow.js';
import { pathTravelAnimationDefinition } from './pathTravel.js';
import { pulseAnimationDefinition } from './pulse.js';

/** 动画类型。列出引擎内置的全部动画。 */
export const animationTypes = ['pulse', 'dash-flow', 'path-travel'] as const;

/** 动画类型名称。取值来自内置动画列表。 */
export type AnimationType = (typeof animationTypes)[number];

/** 内置动画定义。供内部动画注册表统一加载。 */
export const builtinAnimationDefinitions = Object.freeze([pulseAnimationDefinition, dashFlowAnimationDefinition, pathTravelAnimationDefinition]);

/** 创建已经加载内置动画的注册表。 */
export function createBuiltinAnimationRegistry(): AnimationRegistry {
  return new AnimationRegistry(builtinAnimationDefinitions);
}
