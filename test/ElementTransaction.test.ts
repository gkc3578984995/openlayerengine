import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementSelector, ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import type { ErrorReporter } from '../src/core/ports/ErrorReporter.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { ShapeDefinition, ShapeState } from '../src/core/shape/types.js';
import { createNativeStyleRef } from '../src/core/style/types.js';
import * as elementTransactionModule from '../src/core/transaction/ElementTransaction.js';
import { createElementTransactionScope, type ElementTransaction } from '../src/core/transaction/ElementTransaction.js';
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
  it('does not scan the full Store map for sequential adds or id-targeted selectors', () => {
    const store = createStore();
    const iteratedSizes: number[] = [];
    const originalIterator = Map.prototype[Symbol.iterator];
    const iteratorSpy = vi.spyOn(Map.prototype, Symbol.iterator).mockImplementation(function (this: Map<unknown, unknown>) {
      iteratedSizes.push(this.size);
      return originalIterator.call(this);
    });
    try {
      for (let index = 0; index < 32; index += 1) store.add(element(`point-${index}`));

      const sequentialScans = iteratedSizes.filter((size) => size >= 8);
      expect(sequentialScans).toEqual([]);

      iteratedSizes.length = 0;
      const enteredSizes: number[] = [];
      const originalEntries = Map.prototype.entries;
      const entriesSpy = vi.spyOn(Map.prototype, 'entries').mockImplementation(function (this: Map<unknown, unknown>) {
        enteredSizes.push(this.size);
        return originalEntries.call(this);
      });
      try {
        store.hide({ id: 'point-16' });
        const idsChanges = store.hide({ ids: ['point-17', 'point-3', 'point-17'] });
        store.transaction((transaction) => {
          for (let index = 0; index < 16; index += 1) {
            transaction.hide({ id: 'point-20' });
            transaction.show({ id: 'point-20' });
          }
        });
        const predicateOrder: string[] = [];
        const combinedQuery = store.query({
          ids: ['point-18', 'point-2', 'point-18', 'point-4'],
          module: 'draw',
          visible: true,
          predicate: ({ id }) => {
            predicateOrder.push(id);
            return id !== 'point-4';
          }
        });
        const combinedUpdate = store.hide({ id: 'point-19', module: 'draw', visible: true });

        const idTargetedScans = [...iteratedSizes, ...enteredSizes].filter((size) => size === 32);
        expect(idTargetedScans).toEqual([]);
        expect(idsChanges.changes.map(({ id }) => id)).toEqual(['point-17', 'point-3']);
        expect(combinedQuery.map(({ id }) => id)).toEqual(['point-18', 'point-2']);
        expect(predicateOrder).toEqual(['point-18', 'point-2', 'point-4']);
        expect(combinedUpdate.changes.map(({ id }) => id)).toEqual(['point-19']);
      } finally {
        entriesSpy.mockRestore();
      }
    } finally {
      iteratorSpy.mockRestore();
    }
  });

  it('keeps the base Map untouched until an atomic commit and through rollback or snapshot failure', () => {
    const pointDefinition = basicShapeDefinitions.find(({ type }) => type === 'point') as ShapeDefinition<ShapeState<'point'>>;
    const snapshotFailure = new Error('snapshot failed');
    let failClone = false;
    const definition: ShapeDefinition<ShapeState<'point'>> = {
      ...pointDefinition,
      clone: (shape) => {
        if (failClone) throw snapshotFailure;
        return pointDefinition.clone(shape);
      }
    };
    const registry = new ShapeRegistry([definition]);
    const base = new Map();
    const rolledBack = createElementTransactionScope(registry, base, () => 'unused');

    rolledBack.transaction.add(element('rolled-back'));
    expect(base.size).toBe(0);
    rolledBack.abort();
    expect(base.size).toBe(0);

    const failedCommit = createElementTransactionScope(registry, base, () => 'unused');
    failedCommit.transaction.add(element('failed-commit'));
    failClone = true;
    expect(() => failedCommit.complete()).toThrow(snapshotFailure);
    expect(base.size).toBe(0);
    failedCommit.abort();
  });

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

  it('does not expose commit authority to a transaction callback and never commits after callback failure', () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const failure = new Error('work failed after attempted early commit');
    const exposedComplete = Reflect.get(elementTransactionModule, 'completeElementTransaction');
    let captured: ElementTransaction | undefined;

    expect(() =>
      store.transaction((transaction) => {
        captured = transaction;
        transaction.add(element('point-1'));
        if (typeof exposedComplete === 'function') Reflect.apply(exposedComplete, undefined, [transaction]);
        throw failure;
      })
    ).toThrow(failure);

    expect(exposedComplete).toBeUndefined();
    if (captured === undefined) throw new Error('Transaction callback did not receive a transaction');
    expect(Reflect.get(captured, 'complete')).toBeUndefined();
    expect(Reflect.get(captured, 'abort')).toBeUndefined();
    expect(store.query()).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('seals a captured transaction before fallible commit snapshots can reenter it', () => {
    const pointDefinition = basicShapeDefinitions.find(({ type }) => type === 'point') as ShapeDefinition<ShapeState<'point'>>;
    let captured: ElementTransaction | undefined;
    let commitSnapshotArmed = false;
    let attemptedLateWrite = false;
    const definition: ShapeDefinition<ShapeState<'point'>> = {
      ...pointDefinition,
      clone: (shape) => {
        if (commitSnapshotArmed && !attemptedLateWrite) {
          attemptedLateWrite = true;
          if (captured === undefined) throw new Error('Transaction callback did not capture its transaction');
          captured.add(element('late-write'));
        }
        return pointDefinition.clone(shape);
      }
    };
    const store = new ElementStore(new ShapeRegistry([definition]));
    const listener = vi.fn();
    store.subscribe(listener);

    expect(() =>
      store.transaction((transaction) => {
        captured = transaction;
        transaction.add(element('point-1'));
        commitSnapshotArmed = true;
      })
    ).toThrow(ObjectDisposedError);

    expect(attemptedLateWrite).toBe(true);
    expect(store.query()).toEqual([]);
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

  it('restores the entry snapshot when structural equality hides an alias-topology-only update', () => {
    const store = createStore();
    const shared = { value: 1 };
    store.add({ ...element('point-1'), data: { first: shared, second: shared } });

    const changes = store.update<{ first: { value: number }; second: { value: number } }>(
      { id: 'point-1' },
      {
        data: { first: { value: 1 }, second: { value: 1 } }
      }
    );
    const finalState = store.get<{ first: { value: number }; second: { value: number } }>('point-1');

    expect(changes.changes).toEqual([]);
    expect(finalState?.data?.first).toBe(finalState?.data?.second);
  });

  it('compares wide structurally equal states without repeated linear key membership scans', () => {
    const store = createStore();
    const fieldCount = 128;
    const data = Object.fromEntries(Array.from({ length: fieldCount }, (_, index) => [`field-${index}`, index]));
    store.add({ ...element('point-1'), data });
    const originalIncludes = Array.prototype.includes;
    let wideIncludes = 0;
    const includesSpy = vi.spyOn(Array.prototype, 'includes').mockImplementation(function (this: unknown[], searchElement: unknown, fromIndex?: number) {
      if (this.length === fieldCount) wideIncludes += 1;
      return originalIncludes.call(this, searchElement, fromIndex);
    });

    const changes = (() => {
      try {
        return store.update({ id: 'point-1' }, { data: { ...data } });
      } finally {
        includesSpy.mockRestore();
      }
    })();

    expect(changes.changes).toEqual([]);
    expect(wideIncludes).toBe(0);
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

  it('rejects a hostile non-Promise thenable without invoking its then body', async () => {
    const store = createStore();
    let thenCalls = 0;
    const hostileThenable = {
      then: () => {
        thenCalls += 1;
        store.add(element('hostile-side-effect'));
      }
    };

    expect(() => store.transaction(() => hostileThenable)).toThrow(InvalidArgumentError);
    await Promise.resolve();
    await Promise.resolve();

    expect(thenCalls).toBe(0);
    expect(store.get('hostile-side-effect')).toBeUndefined();
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

  it('rolls back the entire transaction when a selector predicate attempts a reentrant write', () => {
    const store = createStore();
    store.add(element('point-1'));
    store.add(element('point-2'));
    const before = store.query();

    expect(() =>
      store.transaction((transaction) => {
        transaction.update(
          {
            id: 'point-1',
            predicate: () => {
              transaction.update({ id: 'point-2' }, { data: { nested: { value: 2 } } });
              return true;
            }
          },
          { visible: false }
        );
      })
    ).toThrowError(new InvalidArgumentError('Element selector predicates are read-only'));

    expect(store.query()).toEqual(before);
  });

  it('rejects every transaction write and query inside a selector predicate while allowing get', () => {
    const store = createStore();
    store.add(element('point-1'));
    store.add(element('point-2'));

    store.transaction((transaction) => {
      transaction.update(
        {
          id: 'point-1',
          predicate: () => {
            expect(transaction.get('point-2')?.id).toBe('point-2');
            const operations = [
              () => transaction.add(element('side-effect')),
              () => transaction.update({ id: 'point-2' }, { visible: false }),
              () => transaction.remove({ id: 'point-2' }),
              () => transaction.hide({ id: 'point-2' }),
              () => transaction.show({ id: 'point-2' }),
              () => transaction.copy('point-2'),
              () => transaction.clear(),
              () => transaction.query({ id: 'point-2' })
            ];
            for (const operation of operations) {
              expect(operation).toThrowError(new InvalidArgumentError('Element selector predicates are read-only'));
            }
            return true;
          }
        },
        { visible: false }
      );
    });

    expect(store.get('point-1')?.visible).toBe(false);
    expect(store.get('point-2')?.visible).toBe(true);
    expect(store.query().map(({ id }) => id)).toEqual(['point-1', 'point-2']);
  });

  it('propagates the selector read-only scope to Store operations while allowing Store get', () => {
    const store = createStore();
    store.add(element('point-1'));
    store.add(element('point-2'));
    const listener = vi.fn();
    store.subscribe(listener);

    const queried = store.query({
      id: 'point-1',
      predicate: () => {
        expect(store.get('point-2')?.id).toBe('point-2');
        const operations = [
          () => store.add(element('side-effect')),
          () => store.hide({ id: 'point-2' }),
          () => store.query({ id: 'point-2' }),
          () => store.destroy(),
          () => store.subscribe(() => undefined)
        ];
        for (const operation of operations) {
          expect(operation).toThrowError(new InvalidArgumentError('Element selector predicates are read-only'));
        }
        return true;
      }
    });

    expect(queried.map(({ id }) => id)).toEqual(['point-1']);
    expect(store.get('point-2')?.visible).toBe(true);
    expect(store.get('side-effect')).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps selector read-only scopes isolated between Store instances', () => {
    const firstStore = createStore();
    const secondStore = createStore();
    firstStore.add(element('first'));
    secondStore.add(element('second'));

    const queried = firstStore.query({
      id: 'first',
      predicate: () => {
        expect(secondStore.hide({ id: 'second' }).changes.map(({ id }) => id)).toEqual(['second']);
        return true;
      }
    });

    expect(queried.map(({ id }) => id)).toEqual(['first']);
    expect(firstStore.get('first')?.visible).toBe(true);
    expect(secondStore.get('second')?.visible).toBe(false);
  });

  it('applies a nested Store query selector guard to every active transaction from that Store', () => {
    const store = createStore();
    store.add(element('point-1'));
    store.add(element('point-2'));
    const listener = vi.fn();
    store.subscribe(listener);

    const result = store.transaction((transaction) => {
      transaction.hide({ id: 'point-2' });
      const queried = store.query({
        id: 'point-1',
        predicate: () => {
          expect(store.get('point-2')?.visible).toBe(true);
          expect(transaction.get('point-2')?.visible).toBe(false);
          const operations = [
            () => transaction.add(element('side-effect')),
            () => transaction.hide({ id: 'point-1' }),
            () => transaction.query({ id: 'point-1' })
          ];
          for (const operation of operations) {
            expect(operation).toThrowError(new InvalidArgumentError('Element selector predicates are read-only'));
          }
          return true;
        }
      });
      transaction.add(element('allowed-after-query'));
      return queried;
    });

    expect(result.value.map(({ id }) => id)).toEqual(['point-1']);
    expect(result.changes.changes.map(({ id }) => id)).toEqual(['point-2', 'allowed-after-query']);
    expect(store.get('point-1')?.visible).toBe(true);
    expect(store.get('point-2')?.visible).toBe(false);
    expect(store.get('side-effect')).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('rolls back an uncaught Store write from a query predicate and restores the selector guard', () => {
    const store = createStore();
    store.add(element('point-1'));
    store.add(element('point-2'));
    const listener = vi.fn();
    store.subscribe(listener);

    expect(() =>
      store.query({
        id: 'point-1',
        predicate: () => {
          store.hide({ id: 'point-2' });
          return true;
        }
      })
    ).toThrowError(new InvalidArgumentError('Element selector predicates are read-only'));

    expect(store.get('point-2')?.visible).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(store.hide({ id: 'point-2' }).changes.map(({ id }) => id)).toEqual(['point-2']);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('enters the selector read-only scope before reading query or destructive selector accessors', () => {
    const store = createStore();
    store.add(element('point-1'));
    const listener = vi.fn();
    store.subscribe(listener);
    let queryGetterCalls = 0;
    let updateGetterCalls = 0;
    const querySelector = Object.defineProperty({}, 'id', {
      enumerable: true,
      get: () => {
        queryGetterCalls += 1;
        store.add(element('query-side-effect'));
        return 'point-1';
      }
    }) as ElementSelector;
    const updateSelector = Object.defineProperty({}, 'id', {
      enumerable: true,
      get: () => {
        updateGetterCalls += 1;
        store.add(element('update-side-effect'));
        return 'point-1';
      }
    }) as ElementSelector;

    expect(() => store.query(querySelector)).toThrowError(new InvalidArgumentError('Element selector predicates are read-only'));
    expect(queryGetterCalls).toBe(1);
    expect(store.get('query-side-effect')).toBeUndefined();
    expect(() => store.hide(updateSelector)).toThrowError(new InvalidArgumentError('Element selector predicates are read-only'));
    expect(updateGetterCalls).toBe(1);
    expect(store.get('update-side-effect')).toBeUndefined();
    expect(store.get('point-1')?.visible).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the selector read-only scope continuous while cloning an update patch', () => {
    const store = createStore();
    store.add(element('point-1'));
    const listener = vi.fn();
    const leakedListener = vi.fn();
    store.subscribe(listener);
    let selectorRead = false;
    const selector = Object.defineProperty({}, 'id', {
      enumerable: true,
      get: () => {
        selectorRead = true;
        return 'point-1';
      }
    }) as ElementSelector;
    const patch = new Proxy(
      { visible: false },
      {
        getPrototypeOf: (target) => {
          if (selectorRead) store.subscribe(leakedListener);
          return Reflect.getPrototypeOf(target);
        }
      }
    );

    expect(() => store.update(selector, patch)).toThrowError(new InvalidArgumentError('Element selector predicates are read-only'));
    expect(store.get('point-1')?.visible).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(leakedListener).not.toHaveBeenCalled();
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

  it('queues reentrant commits so every listener observes FIFO changes and converges with the Store', () => {
    const store = createStore();
    const order: string[] = [];
    const projection = new Map<string, Readonly<ElementState>>();
    store.subscribe((changes) => {
      const change = changes.changes[0];
      order.push(`first:${change.kind}`);
      if (change.kind === 'add') store.hide({ id: change.id });
    });
    store.subscribe((changes) => {
      const change = changes.changes[0];
      order.push(`second:${change.kind}:${String(change.after?.visible)}`);
      if (change.after === undefined) projection.delete(change.id);
      else projection.set(change.id, change.after);
    });

    store.add(element('point-1'));

    expect(order).toEqual(['first:add', 'second:add:true', 'first:update', 'second:update:false']);
    expect(projection.get('point-1')).toEqual(store.get('point-1'));
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
