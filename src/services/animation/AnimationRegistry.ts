import type { AnimationSpec } from '../../core/animation/types.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type { AnimationDefinition } from './types.js';

export class AnimationRegistry {
  readonly #definitions = new Map<AnimationSpec['type'], AnimationDefinition>();

  constructor(definitions: readonly AnimationDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: AnimationDefinition): void {
    if (definition === null || typeof definition !== 'object') throw new InvalidArgumentError('Animation definition must be an object');
    if (this.#definitions.has(definition.type)) throw new InvalidArgumentError(`Animation type is already registered: ${definition.type}`);
    if (typeof definition.normalize !== 'function' || typeof definition.assertCompatible !== 'function' || typeof definition.frame !== 'function') {
      throw new InvalidArgumentError('Animation definition is incomplete');
    }
    this.#definitions.set(definition.type, definition);
  }

  get(type: AnimationSpec['type']): AnimationDefinition {
    const definition = this.#definitions.get(type);
    if (definition === undefined) throw new InvalidArgumentError(`Animation type is not registered: ${type}`);
    return definition;
  }

  has(type: AnimationSpec['type']): boolean {
    return this.#definitions.has(type);
  }
}
