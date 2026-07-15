import { cloneCoreState } from '../common/clone.js';
import { DuplicateElementIdError, InvalidArgumentError, ObjectDisposedError } from '../errors.js';
import { isNativeRef } from '../native/types.js';
import type { ShapeRegistry } from '../shape/ShapeRegistry.js';
import { isNativeStyleRef } from '../style/types.js';
import { cloneElementSnapshot, createElementSnapshot, type ElementSnapshot } from '../element/snapshot.js';
import { assertDestructiveSelector, compileSelector } from '../element/selector.js';
import type { ElementCopyOptions, ElementPatch, ElementSelector, ElementState } from '../element/types.js';
import type { ElementChange, ElementChangeSet } from './types.js';

/** 内部类型。描述 StoredElement 使用的数据。 */
type StoredElement = ElementSnapshot<unknown>;
/** 内部常量。保存 deletedElement 使用的数据。 */
const deletedElement = Symbol('deleted element');
/** 内部类型。描述 OverlayElement 使用的数据。 */
type OverlayElement = StoredElement | typeof deletedElement;
/** 内部类型。描述 ElementIdFactory 使用的数据。 */
type ElementIdFactory = (isOccupied: (id: string) => boolean) => string;

/** 内部接口。约定 TransactionState 的数据结构。 */
interface TransactionState {
  /** 图形注册表。用于校验元素几何。 */
  readonly shapeRegistry: ShapeRegistry;
  /** 基础数据。保存事务开始时的数据。 */
  readonly base: Map<string, StoredElement>;
  /** 覆盖数据。保存事务中的临时修改。 */
  readonly overlay: Map<string, OverlayElement>;
  /** 内部字段。保存 appendOrder 相关状态。 */
  readonly appendOrder: string[];
  /** 内部字段。保存 appendedAt 相关状态。 */
  readonly appendedAt: Map<string, number>;
  /** ID 工厂。用于创建新元素 ID。 */
  readonly createId: ElementIdFactory;
  /** 原始状态。保存修改前的数据。 */
  readonly before: Map<string, StoredElement | undefined>;
  /** 顺序。保存元素排列顺序。 */
  readonly order: string[];
  /** 内部字段。保存 isSelectorEvaluationActive 相关状态。 */
  readonly isSelectorEvaluationActive: () => boolean;
  /** 内部字段。保存 validateElement 相关状态。 */
  readonly validateElement: (state: Readonly<ElementState>) => void;
  /** 活动状态。表示对象是否仍可使用。 */
  active: boolean;
  /** 内部字段。保存 evaluatingSelector 相关状态。 */
  evaluatingSelector: boolean;
}

/** 内部常量。保存 transactionStates 使用的数据。 */
const transactionStates = new WeakMap<ElementTransactionImpl, TransactionState>();
/** 内部常量。保存 patchFields 使用的数据。 */
const patchFields: ReadonlySet<string> = new Set(['geometry', 'style', 'data', 'module', 'layerId', 'visible']);

/** 内部接口。约定 ElementTransaction 的数据结构。 */
export interface ElementTransaction {
  /** 添加一个元素。 */
  add<T>(input: ElementState<T>): Readonly<ElementState<T>>;
  /** 读取指定对象。 */
  get<T>(id: string): Readonly<ElementState<T>> | undefined;
  /** 查询匹配的数据。 */
  query<T>(selector?: ElementSelector<T>): readonly Readonly<ElementState<T>>[];
  /** 更新匹配的数据。 */
  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): readonly Readonly<ElementState<T>>[];
  /** 移除匹配的数据。 */
  remove(selector: ElementSelector): readonly string[];
  /** 隐藏匹配的元素。 */
  hide(selector: ElementSelector): readonly Readonly<ElementState>[];
  /** 显示匹配的元素。 */
  show(selector: ElementSelector): readonly Readonly<ElementState>[];
  /** 复制指定元素。 */
  copy<T>(id: string, overrides?: ElementCopyOptions<T>): Readonly<ElementState<T>>;
  /** 清空当前数据。 */
  clear(): readonly string[];
}

/** 内部接口。约定 ElementTransactionScope 的数据结构。 */
export interface ElementTransactionScope {
  /** 内部字段。保存 transaction 相关状态。 */
  readonly transaction: ElementTransaction;
  /** 完成当前事务。 */
  complete(): ElementChangeSet;
  /** 中止当前事务。 */
  abort(): void;
  /** 内部方法。处理 isEvaluatingSelector 相关数据。 */
  isEvaluatingSelector(): boolean;
}

/** 内部方法。处理 createElementTransactionScope 相关数据。 */
export function createElementTransactionScope(
  shapeRegistry: ShapeRegistry,
  base: Map<string, StoredElement>,
  createId: ElementIdFactory,
  isSelectorEvaluationActive: () => boolean = () => false,
  validateElement: (state: Readonly<ElementState>) => void = () => undefined
): ElementTransactionScope {
  const transaction = new ElementTransactionImpl(shapeRegistry, base, createId, isSelectorEvaluationActive, validateElement);
  return Object.freeze({
    transaction,
    complete: () => completeElementTransaction(transaction),
    abort: () => abortElementTransaction(transaction),
    isEvaluatingSelector: () => transactionStates.get(transaction)?.evaluatingSelector === true
  });
}

/** 内部类。管理 ElementTransactionImpl 相关状态。 */
class ElementTransactionImpl implements ElementTransaction {
  /** 创建一个元素事务实现。 */
  constructor(
    shapeRegistry: ShapeRegistry,
    base: Map<string, StoredElement>,
    createId: ElementIdFactory,
    isSelectorEvaluationActive: () => boolean,
    validateElement: (state: Readonly<ElementState>) => void
  ) {
    transactionStates.set(this, {
      shapeRegistry,
      base,
      overlay: new Map(),
      appendOrder: [],
      appendedAt: new Map(),
      createId,
      before: new Map(),
      order: [],
      isSelectorEvaluationActive,
      validateElement,
      active: true,
      evaluatingSelector: false
    });
  }

  /** 添加一个元素。 */
  add<T>(input: ElementState<T>): Readonly<ElementState<T>> {
    const transaction = writableState(this);
    const state = createElementSnapshot(transaction.shapeRegistry, input);
    if (hasElement(transaction, state.id)) throw new DuplicateElementIdError(`Element id already exists: ${state.id}`);
    transaction.validateElement(state);
    remember(transaction, state.id, undefined);
    setElement(transaction, state.id, state as StoredElement);
    return snapshot(transaction, state);
  }

  /** 读取指定对象。 */
  get<T>(id: string): Readonly<ElementState<T>> | undefined {
    const transaction = activeState(this);
    const state = getElement(transaction, id);
    return state === undefined ? undefined : snapshot<T>(transaction, state);
  }

  /** 查询匹配的数据。 */
  query<T>(selector?: ElementSelector<T>): readonly Readonly<ElementState<T>>[] {
    const transaction = selectableState(this);
    return withSelectorEvaluation(transaction, () =>
      Object.freeze(matchingEntries<T>(transaction, selector).map(([, state]) => snapshot<T>(transaction, state)))
    );
  }

  /** 更新匹配的数据。 */
  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): readonly Readonly<ElementState<T>>[] {
    const transaction = writableState(this);
    return withSelectorEvaluation(transaction, () => {
      assertDestructiveSelector(selector as ElementSelector);
      const safePatch = clonePatch(patch);
      if (Reflect.ownKeys(safePatch).length === 0) return Object.freeze([]);

      const replacements = matchingEntries(transaction, selector).map(([id, state]) => {
        const candidate = mergeState(state, safePatch, id);
        return [id, state, createElementSnapshot(transaction.shapeRegistry, candidate)] as const;
      });
      for (const [, , after] of replacements) transaction.validateElement(after);
      for (const [id, before, after] of replacements) {
        remember(transaction, id, before);
        setElement(transaction, id, after as StoredElement);
      }
      return Object.freeze(replacements.map(([, , state]) => snapshot<T>(transaction, state)));
    });
  }

  /** 移除匹配的数据。 */
  remove(selector: ElementSelector): readonly string[] {
    const transaction = writableState(this);
    const matches = matchingEntries(transaction, selector, true);
    for (const [id, before] of matches) {
      remember(transaction, id, before);
      deleteElement(transaction, id);
    }
    return Object.freeze(matches.map(([id]) => id));
  }

  /** 隐藏匹配的元素。 */
  hide(selector: ElementSelector): readonly Readonly<ElementState>[] {
    return this.update(selector, { visible: false });
  }

  /** 显示匹配的元素。 */
  show(selector: ElementSelector): readonly Readonly<ElementState>[] {
    return this.update(selector, { visible: true });
  }

  /** 复制指定元素。 */
  copy<T>(id: string, overrides: ElementCopyOptions<T> = {}): Readonly<ElementState<T>> {
    const transaction = writableState(this);
    const source = getElement(transaction, id);
    if (source === undefined) throw new InvalidArgumentError(`Element does not exist: ${id}`);
    const safeOverrides = clonePatch(overrides);
    const generatedId = transaction.createId((candidateId) => hasElement(transaction, candidateId));
    const candidate = mergeState(source, safeOverrides, generatedId);
    const copied = createElementSnapshot(transaction.shapeRegistry, candidate);
    if (hasElement(transaction, copied.id)) throw new DuplicateElementIdError(`Element id already exists: ${copied.id}`);
    transaction.validateElement(copied);
    remember(transaction, copied.id, undefined);
    setElement(transaction, copied.id, copied as StoredElement);
    return snapshot<T>(transaction, copied);
  }

  /** 清空当前数据。 */
  clear(): readonly string[] {
    const transaction = writableState(this);
    const entries = currentEntries(transaction);
    for (const [id, before] of entries) {
      remember(transaction, id, before);
      deleteElement(transaction, id);
    }
    return Object.freeze(entries.map(([id]) => id));
  }
}

/** 内部方法。处理 completeElementTransaction 相关数据。 */
function completeElementTransaction(transaction: ElementTransactionImpl): ElementChangeSet {
  const state = activeState(transaction);
  state.active = false;
  const changes: ElementChange[] = [];
  const mutations = new Map<string, StoredElement | undefined>();
  for (const id of state.order) {
    const before = state.before.get(id);
    const after = getElement(state, id);
    if (before === undefined && after === undefined) continue;
    if (before !== undefined && after !== undefined && equalCoreState(before, after)) continue;
    const kind = before === undefined ? 'add' : after === undefined ? 'remove' : 'update';
    changes.push(
      Object.freeze({
        kind,
        id,
        ...(before === undefined ? {} : { before: snapshot(state, before) }),
        ...(after === undefined ? {} : { after: snapshot(state, after) })
      })
    );
    mutations.set(id, after);
  }

  const frozenChanges = Object.freeze({ changes: Object.freeze(changes) });
  for (const after of mutations.values()) {
    if (after !== undefined) state.validateElement(after);
  }
  // 先创建所有可能失败的规范快照，确认无误后再修改共享 Map。
  // 原位置的数据直接更新；删除项和需要移到末尾的项先移除，
  // 最后再按事务顺序追加最终数据。
  for (const [id, after] of mutations) {
    if (after === undefined || state.appendedAt.has(id)) state.base.delete(id);
    else state.base.set(id, after);
  }
  for (let index = 0; index < state.appendOrder.length; index += 1) {
    const id = state.appendOrder[index];
    if (state.appendedAt.get(id) !== index) continue;
    const after = mutations.get(id);
    if (after !== undefined) state.base.set(id, after);
  }

  return frozenChanges;
}

/** 内部方法。处理 abortElementTransaction 相关数据。 */
function abortElementTransaction(transaction: ElementTransactionImpl): void {
  const state = transactionStates.get(transaction);
  if (state !== undefined) state.active = false;
}

/** 内部方法。处理 activeState 相关数据。 */
function activeState(transaction: ElementTransactionImpl): TransactionState {
  const state = transactionStates.get(transaction);
  if (state === undefined || !state.active) throw new ObjectDisposedError('Element transaction is no longer active');
  return state;
}

/** 内部方法。处理 selectableState 相关数据。 */
function selectableState(transaction: ElementTransactionImpl): TransactionState {
  const state = activeState(transaction);
  if (state.evaluatingSelector || state.isSelectorEvaluationActive()) {
    throw new InvalidArgumentError('Element selector predicates are read-only');
  }
  return state;
}

/** 内部方法。处理 writableState 相关数据。 */
function writableState(transaction: ElementTransactionImpl): TransactionState {
  return selectableState(transaction);
}

/** 内部方法。处理 remember 相关数据。 */
function remember(transaction: TransactionState, id: string, before: StoredElement | undefined): void {
  if (transaction.before.has(id)) return;
  transaction.before.set(id, before);
  transaction.order.push(id);
}

/** 内部方法。处理 matchingEntries 相关数据。 */
function matchingEntries<T>(transaction: TransactionState, selector?: ElementSelector<T>, destructive = false): Array<readonly [string, StoredElement]> {
  return withSelectorEvaluation(transaction, () => {
    if (destructive) assertDestructiveSelector(selector as ElementSelector);
    const matches = compileSelector(selector);
    const ids = selectorIds(selector);
    const result: Array<readonly [string, StoredElement]> = [];
    const candidates =
      ids === undefined
        ? currentEntries(transaction)
        : ids.flatMap((id) => {
            const state = getElement(transaction, id);
            return state === undefined ? [] : [[id, state] as const];
          });
    for (const [id, state] of candidates) {
      if (matches(state as ElementSnapshot<T>)) result.push([id, state]);
    }
    return result;
  });
}

/** 内部方法。处理 withSelectorEvaluation 相关数据。 */
function withSelectorEvaluation<T>(transaction: TransactionState, work: () => T): T {
  const wasEvaluatingSelector = transaction.evaluatingSelector;
  transaction.evaluatingSelector = true;
  try {
    return work();
  } finally {
    transaction.evaluatingSelector = wasEvaluatingSelector;
  }
}

/** 内部方法。处理 getElement 相关数据。 */
function getElement(transaction: TransactionState, id: string): StoredElement | undefined {
  const overlaid = transaction.overlay.get(id);
  if (overlaid === deletedElement) return undefined;
  return overlaid ?? transaction.base.get(id);
}

/** 内部方法。处理 hasElement 相关数据。 */
function hasElement(transaction: TransactionState, id: string): boolean {
  return getElement(transaction, id) !== undefined;
}

/** 内部方法。处理 setElement 相关数据。 */
function setElement(transaction: TransactionState, id: string, state: StoredElement): void {
  const wasPresent = hasElement(transaction, id);
  transaction.overlay.set(id, state);
  if (wasPresent) return;
  const appendIndex = transaction.appendOrder.length;
  transaction.appendOrder.push(id);
  transaction.appendedAt.set(id, appendIndex);
}

/** 内部方法。处理 deleteElement 相关数据。 */
function deleteElement(transaction: TransactionState, id: string): void {
  transaction.overlay.set(id, deletedElement);
  transaction.appendedAt.delete(id);
}

/** 内部方法。处理 currentEntries 相关数据。 */
function currentEntries(transaction: TransactionState): Array<readonly [string, StoredElement]> {
  const result: Array<readonly [string, StoredElement]> = [];
  for (const [id] of transaction.base) {
    if (transaction.appendedAt.has(id)) continue;
    const state = getElement(transaction, id);
    if (state !== undefined) result.push([id, state]);
  }
  for (let index = 0; index < transaction.appendOrder.length; index += 1) {
    const id = transaction.appendOrder[index];
    if (transaction.appendedAt.get(id) !== index) continue;
    const state = getElement(transaction, id);
    if (state !== undefined) result.push([id, state]);
  }
  return result;
}

/** 内部方法。处理 selectorIds 相关数据。 */
function selectorIds<T>(selector?: ElementSelector<T>): readonly string[] | undefined {
  if (selector === undefined || selector === null || typeof selector !== 'object' || Array.isArray(selector)) return undefined;
  if (selector.id !== undefined) return [selector.id];
  return selector.ids === undefined ? undefined : [...new Set(selector.ids)];
}

/** 内部方法。处理 clonePatch 相关数据。 */
function clonePatch<T>(patch: ElementPatch<T> | ElementCopyOptions<T>): ElementPatch<T> {
  const cloned = cloneCoreState(patch) as ElementPatch<T>;
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned) || Object.getPrototypeOf(cloned) !== Object.prototype) {
    throw new InvalidArgumentError('Element patch must be a plain object');
  }
  for (const key of Reflect.ownKeys(cloned)) {
    if (typeof key !== 'string' || !patchFields.has(key)) throw new InvalidArgumentError(`Unknown element patch field: ${String(key)}`);
  }
  return cloned;
}

/** 内部方法。处理 mergeState 相关数据。 */
function mergeState<T>(source: StoredElement, patch: ElementPatch<T>, id: string): ElementState<T> {
  const has = (key: keyof ElementPatch<T>): boolean => Object.prototype.hasOwnProperty.call(patch, key);
  return {
    id,
    type: source.type,
    geometry: has('geometry') ? (patch.geometry as ElementState<T>['geometry']) : source.geometry,
    style: has('style') ? (patch.style as ElementState<T>['style']) : source.style,
    ...(has('data') || Object.prototype.hasOwnProperty.call(source, 'data') ? { data: has('data') ? patch.data : (source.data as T | undefined) } : {}),
    ...(has('module') || Object.prototype.hasOwnProperty.call(source, 'module') ? { module: has('module') ? patch.module : source.module } : {}),
    layerId: has('layerId') ? (patch.layerId as string) : source.layerId,
    visible: has('visible') ? (patch.visible as boolean) : source.visible
  };
}

/** 内部方法。处理 snapshot 相关数据。 */
function snapshot<T>(transaction: TransactionState, state: StoredElement): ElementSnapshot<T> {
  return cloneElementSnapshot(transaction.shapeRegistry, state as ElementState<T>);
}

/** 内部方法。处理 equalCoreState 相关数据。 */
function equalCoreState(left: unknown, right: unknown, seen = new WeakMap<object, WeakSet<object>>()): boolean {
  if (Object.is(left, right)) return true;
  if (isNativeRef(left) || isNativeRef(right) || isNativeStyleRef(left) || isNativeStyleRef(right)) return false;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  const previous = seen.get(left);
  if (previous?.has(right)) return true;
  if (previous === undefined) seen.set(left, new WeakSet([right]));
  else previous.add(right);
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  const rightKeySet = new Set(rightKeys);
  if (leftKeys.some((key) => !rightKeySet.has(key))) return false;
  return leftKeys.every((key) => equalCoreState(Reflect.get(left, key), Reflect.get(right, key), seen));
}
