import { AnimationRegistry } from '../../services/animation/AnimationRegistry.js';
import { dashFlowAnimationDefinition } from './dashFlow.js';
import { pathTravelAnimationDefinition } from './pathTravel.js';
import { pulseAnimationDefinition } from './pulse.js';

export const animationTypes = ['pulse', 'dash-flow', 'path-travel'] as const;

export type AnimationType = (typeof animationTypes)[number];

export const builtinAnimationDefinitions = Object.freeze([pulseAnimationDefinition, dashFlowAnimationDefinition, pathTravelAnimationDefinition]);

export function createBuiltinAnimationRegistry(): AnimationRegistry {
  return new AnimationRegistry(builtinAnimationDefinitions);
}
