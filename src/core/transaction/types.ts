import type { ElementSnapshot } from '../element/snapshot.js';

export type ElementChangeKind = 'add' | 'update' | 'remove';

export interface ElementChange {
  readonly kind: ElementChangeKind;
  readonly id: string;
  readonly before?: ElementSnapshot;
  readonly after?: ElementSnapshot;
}

export interface ElementChangeSet {
  readonly changes: readonly ElementChange[];
}

declare const elementGenerationBrand: unique symbol;

/**
 * 元素 ID 单次实例生命周期的不透明身份令牌。
 *
 * @internal
 */
export interface ElementGeneration {
  readonly [elementGenerationBrand]: true;
}

declare const elementRevisionBrand: unique symbol;

/**
 * 元素单次已提交内容版本的不透明令牌。
 *
 * @internal
 */
export interface ElementRevision {
  readonly [elementRevisionBrand]: true;
}

export interface TransactionResult<T> {
  readonly value: T;
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
