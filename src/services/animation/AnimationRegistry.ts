import type { AnimationSpec } from '../../core/animation/types.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type { AnimationDefinition } from './types.js';

/** 保存并按类型查找动画定义。 */
export class AnimationRegistry {
  /** 已注册的动画定义。 */
  readonly #definitions = new Map<AnimationSpec['type'], AnimationDefinition>();

  /** 创建注册表并装载初始定义。 */
  constructor(definitions: readonly AnimationDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  /** 注册一个新的动画定义。 */
  register(definition: AnimationDefinition): void {
    if (definition === null || typeof definition !== 'object') throw new InvalidArgumentError('Animation definition must be an object');
    if (this.#definitions.has(definition.type)) throw new InvalidArgumentError(`Animation type is already registered: ${definition.type}`);
    if (
      !(definition.writeDomains instanceof Set) ||
      !(definition.requirements instanceof Set) ||
      definition.interactionPolicy === null ||
      typeof definition.interactionPolicy !== 'object' ||
      typeof definition.normalize !== 'function' ||
      typeof definition.assertCompatible !== 'function' ||
      typeof definition.create !== 'function'
    ) {
      throw new InvalidArgumentError('Animation definition is incomplete');
    }
    this.#definitions.set(definition.type, definition);
  }

  /** 获取指定类型的动画定义。 */
  get(type: AnimationSpec['type']): AnimationDefinition {
    const definition = this.#definitions.get(type);
    if (definition === undefined) throw new InvalidArgumentError(`Animation type is not registered: ${type}`);
    return definition;
  }

  /** 判断指定动画类型是否已注册。 */
  has(type: AnimationSpec['type']): boolean {
    return this.#definitions.has(type);
  }
}
