import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import type { ErrorReporter } from '../src/core/ports/ErrorReporter.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { createNativeStyleRef } from '../src/core/style/types.js';
import type { ElementTransaction } from '../src/core/transaction/ElementTransaction.js';
import type { ElementChangeSet } from '../src/core/transaction/types.js';

function element(id: string, visible = true): ElementState<{ nested: { value: number } }> {
  return {
    id,
    type: 'point',
    geometry: { type: 'point', controlPoints: [[1, 2]] },
    style: { symbol: { type: 'circle', radius: 4 } },
    data: { nested: { value: 1 } },
    module: 'draw',
    layerId: 'business-layer',
    visible
  };
}

function createStore(options?: ConstructorParameters<typeof ElementStore>[1]): ElementStore {
  return new ElementStore(new ShapeRegistry(basicShapeDefinitions), options);
}

describe('ElementTransaction', () => {
  it('commits multiple writes atomically, exposes read-your-writes, and notifies once with entry/final snapshots', () => {
    const store = createStore();
    store.add(element('point-1'));
    const listener = vi.fn<(changes: ElementChangeSet) => void>();
    store.subscribe(listener);

    const result = store.transaction((transaction) => {
      transaction.hide({ id: 'point-1' });
      transaction.update({ id: 'point-1' }, { data: { nested: { value: 2 } } });
      transaction.add(element('point-2'));
      expect(transaction.get('point-1')?.visible).toBe(false);
      expect(transaction.query().map(({ id }) => id)).toEqual(['point-1', 'point-2']);
      return 'committed';
    });

    expect(result.value).toBe('committed');
    expect(result.changes.changes).toHaveLength(2);
    expect(result.changes.changes[0]).toMatchObject({
      kind: 'update',
      id: 'point-1',
      before: { visible: true, data: { nested: { value: 1 } } },
      after: { visible: false, data: { nested: { value: 2 } } }
    });
    expect(result.changes.changes[1]).toMatchObject({ kind: 'add', id: 'point-2' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(result.changes);
  });

  it('rolls back every staged write and emits nothing when transaction work throws', () => {
    const store = createStore();
    store.add(element('point-1'));
    const listener = vi.fn();
    store.subscribe(listener);
    const failure = new Error('work failed');

    expect(() =>
      store.transaction((transaction) => {
        transaction.hide({ id: 'point-1' });
        transaction.add(element('point-2'));
        throw failure;
      })
    ).toThrow(failure);

    expect(store.get('point-1')?.visible).toBe(true);
    expect(store.get('point-2')).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it('folds add-remove and update-back-to-entry-state into an empty net change without notification', () => {
    const store = createStore();
    store.add(element('point-1'));
    const listener = vi.fn();
    store.subscribe(listener);

    const result = store.transaction((transaction) => {
      transaction.add(element('temporary'));
      transaction.remove({ id: 'temporary' });
      transaction.hide({ id: 'point-1' });
      transaction.show({ id: 'point-1' });
    });

    expect(result.changes.changes).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
    expect(store.query().map(({ id }) => id)).toEqual(['point-1']);
  });

  it('treats distinct opaque native style references as a real identity change', () => {
    const firstStyle = createNativeStyleRef();
    const secondStyle = createNativeStyleRef();
    const store = createStore();
    store.add({ ...element('point-1'), style: firstStyle });

    const changes = store.update({ id: 'point-1' }, { style: secondStyle });

    expect(changes.changes).toHaveLength(1);
    expect(changes.changes[0].before?.style).toBe(firstStyle);
    expect(changes.changes[0].after?.style).toBe(secondStyle);
    expect(store.get('point-1')?.style).toBe(secondStyle);
  });

  it('rejects nested transactions and rolls back the outer transaction', () => {
    const store = createStore();

    expect(() =>
      store.transaction((transaction) => {
        transaction.add(element('point-1'));
        store.transaction(() => undefined);
      })
    ).toThrow(InvalidArgumentError);
    expect(store.query()).toEqual([]);
  });

  it('invalidates a captured transaction after either commit or rollback', () => {
    const store = createStore();
    let committed: ElementTransaction | undefined;
    let rolledBack: ElementTransaction | undefined;

    store.transaction((transaction) => {
      committed = transaction;
    });
    expect(() => committed?.query()).toThrow(ObjectDisposedError);

    expect(() =>
      store.transaction((transaction) => {
        rolledBack = transaction;
        throw new Error('rollback');
      })
    ).toThrow('rollback');
    expect(() => rolledBack?.query()).toThrow(ObjectDisposedError);
  });

  it('rejects Promise and hostile thenable work results synchronously and rolls back', () => {
    const store = createStore();
    const promise = Promise.resolve('later');
    const hostileThenable = Object.create(null) as { readonly then: unknown };
    Object.defineProperty(hostileThenable, 'then', {
      get: () => {
        throw new Error('then getter');
      }
    });

    expect(() => store.transaction((transaction) => (transaction.add(element('promise')), promise))).toThrow(InvalidArgumentError);
    expect(store.get('promise')).toBeUndefined();
    expect(() => store.transaction((transaction) => (transaction.add(element('thenable')), hostileThenable))).toThrow(InvalidArgumentError);
    expect(store.get('thenable')).toBeUndefined();
  });

  it('consumes a rejected Promise work result after rejecting the asynchronous transaction contract', async () => {
    const store = createStore();
    const failure = new Error('async work rejected');

    expect(() => store.transaction(() => Promise.reject(failure))).toThrow(InvalidArgumentError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.query()).toEqual([]);
  });

  it('generates a default copy id against staged additions in the same transaction', () => {
    const store = createStore();
    store.add(element('point-1'));

    const result = store.transaction((transaction) => {
      transaction.add(element('element-1'));
      return transaction.copy('point-1');
    });

    expect(result.value.id).toBe('element-2');
    expect(store.query().map(({ id }) => id)).toEqual(['point-1', 'element-1', 'element-2']);
  });

  it('treats duplicate listener registrations as independent subscriptions', () => {
    const store = createStore();
    const listener = vi.fn();
    const unsubscribeFirst = store.subscribe(listener);
    const unsubscribeSecond = store.subscribe(listener);

    store.add(element('point-1'));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribeFirst();
    unsubscribeFirst();
    store.hide({ id: 'point-1' });
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribeSecond();
  });

  it('freezes changes for every listener so one callback cannot pollute the next', () => {
    const store = createStore();
    store.add(element('point-1'));
    const observed: ElementChangeSet[] = [];
    store.subscribe((changes) => {
      expect(Object.isFrozen(changes)).toBe(true);
      expect(Object.isFrozen(changes.changes)).toBe(true);
      expect(Object.isFrozen(changes.changes[0].after?.data)).toBe(true);
      expect(Reflect.set(changes.changes[0].after?.data as object, 'polluted', true)).toBe(false);
    });
    store.subscribe((changes) => observed.push(changes));

    store.hide({ id: 'point-1' });

    expect(observed[0].changes[0].after?.data).toEqual({ nested: { value: 1 } });
    expect(observed[0].changes[0].after?.data).not.toHaveProperty('polluted');
  });

  it('isolates listener and error-reporter failures after commit while continuing later listeners', async () => {
    const listenerFailure = new Error('listener failed');
    const reports: unknown[] = [];
    const reporter = ((error: unknown) => {
      reports.push(error);
      return Promise.reject(new Error('reporter rejected'));
    }) as unknown as ErrorReporter;
    const store = createStore({ errorReporter: reporter });
    const laterListener = vi.fn();
    store.subscribe(() => {
      throw listenerFailure;
    });
    store.subscribe(laterListener);

    expect(() => store.add(element('point-1'))).not.toThrow();
    expect(store.get('point-1')).toBeDefined();
    expect(reports).toEqual([listenerFailure]);
    expect(laterListener).toHaveBeenCalledTimes(1);
    await Promise.resolve();

    const throwingReporter = (() => {
      throw new Error('reporter threw');
    }) as ErrorReporter;
    const secondStore = createStore({ errorReporter: throwingReporter });
    secondStore.subscribe(() => {
      throw listenerFailure;
    });
    expect(() => secondStore.add(element('point-2'))).not.toThrow();
    expect(secondStore.get('point-2')).toBeDefined();
  });

  it('observes and reports an async listener rejection without undoing the commit', async () => {
    const listenerFailure = new Error('async listener failed');
    const reports: unknown[] = [];
    const store = createStore({ errorReporter: (error) => reports.push(error) });
    store.subscribe(async () => {
      throw listenerFailure;
    });

    expect(() => store.add(element('point-1'))).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.get('point-1')).toBeDefined();
    expect(reports).toEqual([listenerFailure]);
  });

  it('rejects destroy during active work and rolls back instead of half-destroying', () => {
    const store = createStore();

    expect(() =>
      store.transaction((transaction) => {
        transaction.add(element('point-1'));
        store.destroy();
      })
    ).toThrow(InvalidArgumentError);
    expect(store.query()).toEqual([]);
  });
});
