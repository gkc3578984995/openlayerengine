import type { ElementStore } from '../../src/core/element/ElementStore.js';

declare const store: ElementStore;

const synchronous = store.transaction(() => 1);
const value: number = synchronous.value;
void value;

// @ts-expect-error Element transactions intentionally reject Promise-returning work.
store.transaction(async () => 1);

const promiseLike: PromiseLike<number> = Promise.resolve(1);
// @ts-expect-error Structurally thenable work is excluded at the public type boundary too.
store.transaction(() => promiseLike);
