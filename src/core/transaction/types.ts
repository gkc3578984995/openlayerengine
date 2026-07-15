import type { ElementSnapshot } from '../element/snapshot.js';

/** 元素变更的操作类型。 */
export type ElementChangeKind = 'add' | 'update' | 'remove';

/** 一次元素变更的前后快照。 */
export interface ElementChange {
  /** 变更类型。 */
  readonly kind: ElementChangeKind;
  /** 元素 ID。 */
  readonly id: string;
  /** 变更前的元素快照。 */
  readonly before?: ElementSnapshot;
  /** 变更后的元素快照。 */
  readonly after?: ElementSnapshot;
}

/** 一次事务提交产生的元素变更集合。 */
export interface ElementChangeSet {
  /** 按执行顺序记录的元素变更。 */
  readonly changes: readonly ElementChange[];
}

/** 元素实例令牌使用的类型标记。 */
declare const elementGenerationBrand: unique symbol;

/**
 * 元素 ID 单次实例生命周期的不透明身份令牌。
 *
 * @internal
 */
export interface ElementGeneration {
  /** 防止普通对象被当作元素实例令牌。 */
  readonly [elementGenerationBrand]: true;
}

/** 元素版本令牌使用的类型标记。 */
declare const elementRevisionBrand: unique symbol;

/**
 * 元素单次已提交内容版本的不透明令牌。
 *
 * @internal
 */
export interface ElementRevision {
  /** 防止普通对象被当作元素版本令牌。 */
  readonly [elementRevisionBrand]: true;
}

/** 元素事务的返回值和变更结果。 */
export interface TransactionResult<T> {
  /** 事务回调返回的值。 */
  readonly value: T;
  /** 本次事务提交的元素变更。 */
  readonly changes: ElementChangeSet;
  /**
   * 读取本次事务在同步通知监听器之前提交的实例令牌快照。
   *
   * @param id 本次事务涉及的元素 ID。
   * @returns 元素在本次提交后仍存在时返回实例令牌，否则返回 `undefined`。
   * @internal
   */
  generation(id: string): ElementGeneration | undefined;
}
