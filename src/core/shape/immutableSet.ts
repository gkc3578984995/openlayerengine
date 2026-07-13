import { InvalidArgumentError } from '../errors.js';

const immutableSetSources = new WeakMap<object, ReadonlySet<unknown>>();

export function createImmutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const source = new Set(values);
  const result: ReadonlySet<T> = Object.freeze({
    get size() {
      return source.size;
    },
    has: (value: T) => source.has(value),
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    forEach: (callback: (value: T, value2: T, set: ReadonlySet<T>) => void, thisArg?: unknown) => {
      source.forEach((value) => callback.call(thisArg, value, value, result));
    },
    [Symbol.iterator]: () => source[Symbol.iterator](),
    [Symbol.toStringTag]: 'Set'
  });
  immutableSetSources.set(result as object, source);
  return result;
}

export function snapshotImmutableSet<T>(input: unknown, parseValue: (value: unknown) => T, label: string): ReadonlySet<T> {
  if (input === null || typeof input !== 'object') throw new InvalidArgumentError(`${label} must be a Set`);
  const trustedSource = immutableSetSources.get(input);
  const values: T[] = [];
  if (trustedSource !== undefined) {
    Set.prototype.forEach.call(trustedSource, (value: unknown) => values.push(parseValue(value)));
    return createImmutableSet(values);
  }
  if (Object.getPrototypeOf(input) !== Set.prototype) throw new InvalidArgumentError(`${label} must be a native Set or immutable set view`);
  Set.prototype.forEach.call(input, (value: unknown) => values.push(parseValue(value)));
  return createImmutableSet(values);
}
