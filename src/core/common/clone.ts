import { InvalidArgumentError } from '../errors.js';
import { isNativeRef, isTransientNativeRef } from '../native/types.js';
import { isNativeStyleRef } from '../style/types.js';

/** 深复制核心状态，只接受可以安全复制的数据。 */
export function cloneCoreState<T>(value: T): T {
  return cloneValue(value, new WeakSet<object>(), new WeakMap<object, unknown>(), '$') as T;
}

/** 按数据类型递归复制一个值。 */
function cloneValue(value: unknown, activeAncestors: WeakSet<object>, memo: WeakMap<object, unknown>, path: string): unknown {
  if (value === null || value === undefined) return value;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') return value;
  if (valueType === 'function') throw new InvalidArgumentError(`Cannot clone a function at ${path}`);
  if (valueType === 'symbol') throw new InvalidArgumentError(`Cannot clone a symbol at ${path}`);

  if (isTransientNativeRef(value)) throw new InvalidArgumentError(`Cannot clone a transient native reference at ${path}`);
  if (isNativeRef(value) || isNativeStyleRef(value)) return value;
  if (typeof value !== 'object') throw new InvalidArgumentError(`Cannot clone unsupported state at ${path}`);

  if (activeAncestors.has(value)) throw new InvalidArgumentError(`Cannot clone a circular state at ${path}`);
  const previousClone = memo.get(value);
  if (previousClone !== undefined) return previousClone;

  if (Array.isArray(value)) return cloneArray(value, activeAncestors, memo, path);
  return clonePlainObject(value, activeAncestors, memo, path);
}

/** 复制普通数组，并拒绝稀疏项和额外属性。 */
function cloneArray(value: unknown[], activeAncestors: WeakSet<object>, memo: WeakMap<object, unknown>, path: string): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new InvalidArgumentError(`Cannot clone an array subclass at ${path}`);
  }

  const cloned = new Array<unknown>(value.length);
  memo.set(value, cloned);
  activeAncestors.add(value);
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') continue;
      if (typeof key === 'symbol') throw new InvalidArgumentError(`Cannot clone a symbol property at ${path}`);
      if (!isArrayIndex(key)) throw new InvalidArgumentError(`Cannot clone an attached array property at ${path}.${key}`);

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new InvalidArgumentError(`Cannot clone an array accessor at ${path}[${key}]`);
      }
      Object.defineProperty(cloned, key, {
        ...descriptor,
        value: cloneValue(descriptor.value, activeAncestors, memo, `${path}[${key}]`)
      });
    }

    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (lengthDescriptor !== undefined) Object.defineProperty(cloned, 'length', lengthDescriptor);
    return cloned;
  } finally {
    activeAncestors.delete(value);
  }
}

/** 复制普通对象，并拒绝访问器和特殊原型。 */
function clonePlainObject(value: object, activeAncestors: WeakSet<object>, memo: WeakMap<object, unknown>, path: string): object {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new InvalidArgumentError(`Cannot clone an unknown class instance at ${path}`);
  }

  const cloned = Object.create(prototype) as object;
  memo.set(value, cloned);
  activeAncestors.add(value);
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') throw new InvalidArgumentError(`Cannot clone a symbol property at ${path}`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new InvalidArgumentError(`Cannot clone an accessor property at ${path}.${key}`);
      }
      Object.defineProperty(cloned, key, {
        ...descriptor,
        value: cloneValue(descriptor.value, activeAncestors, memo, `${path}.${key}`)
      });
    }
    return cloned;
  } finally {
    activeAncestors.delete(value);
  }
}

/** 判断属性名是否是有效的数组索引。 */
function isArrayIndex(key: string): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 4_294_967_295 && String(index) === key;
}
