import { InvalidArgumentError } from '../errors.js';
import { isNativeRef, isTransientNativeRef } from '../native/types.js';
import { isNativeStyleRef } from '../style/types.js';

export function cloneCoreState<T>(value: T): T {
  return cloneValue(value, new WeakSet<object>(), '$') as T;
}

function cloneValue(value: unknown, ancestors: WeakSet<object>, path: string): unknown {
  if (value === null || value === undefined) return value;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') return value;
  if (valueType === 'function') throw new InvalidArgumentError(`Cannot clone a function at ${path}`);
  if (valueType === 'symbol') throw new InvalidArgumentError(`Cannot clone a symbol at ${path}`);

  if (isTransientNativeRef(value)) throw new InvalidArgumentError(`Cannot clone a transient native reference at ${path}`);
  if (isNativeRef(value) || isNativeStyleRef(value)) return value;

  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new InvalidArgumentError(`Cannot clone a circular array at ${path}`);
    ancestors.add(value);
    const cloned = value.map((item, index) => cloneValue(item, ancestors, `${path}[${index}]`));
    ancestors.delete(value);
    return cloned;
  }

  if (typeof value !== 'object') throw new InvalidArgumentError(`Cannot clone unsupported state at ${path}`);

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new InvalidArgumentError(`Cannot clone an unknown class instance at ${path}`);
  }
  if (ancestors.has(value)) throw new InvalidArgumentError(`Cannot clone a circular object at ${path}`);

  ancestors.add(value);
  const cloned: Record<string, unknown> = Object.create(prototype) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') throw new InvalidArgumentError(`Cannot clone a symbol property at ${path}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new InvalidArgumentError(`Cannot clone an accessor property at ${path}.${key}`);
    }
    cloned[key] = cloneValue(descriptor.value, ancestors, `${path}.${key}`);
  }
  ancestors.delete(value);
  return cloned;
}
