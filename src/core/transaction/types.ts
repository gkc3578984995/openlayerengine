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

export interface TransactionResult<T> {
  readonly value: T;
  readonly changes: ElementChangeSet;
}
