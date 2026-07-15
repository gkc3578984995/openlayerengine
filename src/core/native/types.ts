/** 原生引用的内部标记。 */
const nativeRefBrand: unique symbol = Symbol('ol-engine.native-ref');
/** 临时原生引用的内部标记。 */
const transientNativeRefBrand: unique symbol = Symbol('ol-engine.transient-native-ref');
/** 已创建的原生引用及其类型。 */
const issuedNativeRefs = new WeakMap<object, NativeRefKind>();
/** 已创建的临时原生引用及其类型。 */
const issuedTransientNativeRefs = new WeakMap<object, TransientNativeRefKind>();

/** 原生引用类型。区分图层、数据源和元素。 */
export type NativeRefKind = 'layer' | 'source' | 'element';
/** 临时原生引用类型。当前只用于输入事件。 */
export type TransientNativeRefKind = 'input-event';

/** 原生引用。安全指向注册表中的原生对象。 */
export interface NativeRef<K extends NativeRefKind = NativeRefKind> {
  /** 内部标记。记录原生对象的类型。 */
  readonly [nativeRefBrand]: K;
}

/** 临时原生引用。只在一次同步调用期间有效。 */
export interface TransientNativeRef<K extends TransientNativeRefKind = TransientNativeRefKind> {
  /** 内部标记。记录临时原生对象的类型。 */
  readonly [transientNativeRefBrand]: K;
}

/** 创建一个受控的原生引用。 */
export function createNativeRef<K extends NativeRefKind>(kind: K): NativeRef<K> {
  const reference = Object.freeze({ [nativeRefBrand]: kind }) as NativeRef<K>;
  issuedNativeRefs.set(reference, kind);
  return reference;
}

/** 创建一个受控的临时原生引用。 */
export function createTransientNativeRef<K extends TransientNativeRefKind>(kind: K): TransientNativeRef<K> {
  const reference = Object.freeze({ [transientNativeRefBrand]: kind }) as TransientNativeRef<K>;
  issuedTransientNativeRefs.set(reference, kind);
  return reference;
}

/** 判断一个值是否是受控的原生引用。 */
export function isNativeRef(value: unknown): value is NativeRef {
  if (typeof value !== 'object' || value === null) return false;
  if (!Object.isFrozen(value)) return false;
  const kind = issuedNativeRefs.get(value);
  return kind === 'layer' || kind === 'source' || kind === 'element';
}

/** 判断一个值是否是受控的临时原生引用。 */
export function isTransientNativeRef(value: unknown): value is TransientNativeRef {
  if (typeof value !== 'object' || value === null) return false;
  return Object.isFrozen(value) && issuedTransientNativeRefs.get(value) === 'input-event';
}
