import { InvalidArgumentError, InvalidSelectorError } from '../errors.js';
import type { ElementSelector, ElementState } from './types.js';

/** 检查选择器是否只使用一种 ID 选择方式。 */
function assertUnambiguousSelector<T>(selector: ElementSelector<T>): void {
  if (selector.id !== undefined && selector.ids !== undefined) {
    throw new InvalidArgumentError('Element selector cannot contain both id and ids');
  }
}

/** 把 ElementSelector 编译成状态判断函数。 */
export function compileSelector<T>(selector?: ElementSelector<T>): (state: Readonly<ElementState<T>>) => boolean {
  if (selector === undefined) return () => true;
  assertUnambiguousSelector(selector);

  const ids = selector.ids === undefined ? undefined : new Set(selector.ids);
  const { id, module, layerId, type, visible, predicate } = selector;

  return (state) => {
    if (id !== undefined && state.id !== id) return false;
    if (ids !== undefined && !ids.has(state.id)) return false;
    if (module !== undefined && state.module !== module) return false;
    if (layerId !== undefined && state.layerId !== layerId) return false;
    if (type !== undefined && state.type !== type) return false;
    if (visible !== undefined && state.visible !== visible) return false;
    return predicate === undefined || predicate(state);
  };
}

/** 拒绝没有明确筛选条件的破坏性操作。 */
export function assertDestructiveSelector(selector: ElementSelector): void {
  if (selector === null || typeof selector !== 'object' || Array.isArray(selector)) throw new InvalidSelectorError();
  assertUnambiguousSelector(selector);
  const hasCriterion =
    selector.id !== undefined ||
    selector.ids !== undefined ||
    selector.module !== undefined ||
    selector.layerId !== undefined ||
    selector.type !== undefined ||
    selector.visible !== undefined ||
    selector.predicate !== undefined;

  if (!hasCriterion) throw new InvalidSelectorError();
}
