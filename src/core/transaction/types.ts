import type { ElementSnapshot } from '../element/snapshot.js';

/** Element 变更类型。 */
export type ElementChangeKind = 'add' | 'update' | 'remove';

/** 单个 Element 变更及其前后快照。 */
export interface ElementChange {
  /** 变更类型。 */
  readonly kind: ElementChangeKind;
  /** Element ID。 */
  readonly id: string;
  /** 变更前的 Element 快照。 */
  readonly before?: ElementSnapshot;
  /** 变更后的 Element 快照。 */
  readonly after?: ElementSnapshot;
}

/** 一次事务提交产生的 Element 变更集。 */
export interface ElementChangeSet {
  /** 按执行顺序记录的 Element 变更。 */
  readonly changes: readonly ElementChange[];
}

/** Element 实例令牌的类型标记。 */
declare const elementGenerationBrand: unique symbol;

/**
 * 同一 Element ID 在一次实例生命周期内保持不变的身份令牌。
 *
 * @internal
 */
export interface ElementGeneration {
  /** 不允许普通对象伪装成实例令牌。 */
  readonly [elementGenerationBrand]: true;
}

/** Element 版本令牌的类型标记。 */
declare const elementRevisionBrand: unique symbol;

/**
 * Element 每次提交后更新的内容版本令牌。
 *
 * @internal
 */
export interface ElementRevision {
  /** 不允许普通对象伪装成版本令牌。 */
  readonly [elementRevisionBrand]: true;
}

/** Element 事务的返回值与变更结果。 */
export interface TransactionResult<T> {
  /** 事务回调返回的值。 */
  readonly value: T;
  /** 本次事务提交的 Element 变更。 */
  readonly changes: ElementChangeSet;
  /**
   * 读取本次事务提交后、同步通知监听器前捕获的实例令牌。
   *
   * @param id 本次事务涉及的 Element ID。
   * @returns Element 提交后仍存在时返回实例令牌，否则返回 `undefined`。
   * @internal
   */
  generation(id: string): ElementGeneration | undefined;
}
