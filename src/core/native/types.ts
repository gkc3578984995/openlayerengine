/** 受控原生引用的内部品牌。 */
const nativeRefBrand: unique symbol = Symbol('ol-engine.native-ref');
/** 同步调用期原生引用的内部品牌。 */
const transientNativeRefBrand: unique symbol = Symbol('ol-engine.transient-native-ref');
/** 记录当前模块签发的原生引用及其类别。 */
const issuedNativeRefs = new WeakMap<object, NativeRefKind>();
/** 记录当前模块签发的临时引用及其类别。 */
const issuedTransientNativeRefs = new WeakMap<object, TransientNativeRefKind>();

/** 受控原生引用的资源类别。 */
export type NativeRefKind = 'layer' | 'source' | 'element';
/** 临时引用类别；目前仅有输入事件。 */
export type TransientNativeRefKind = 'input-event';

/** 指向 Adapter 注册表中原生对象的不透明引用。 */
export interface NativeRef<K extends NativeRefKind = NativeRefKind> {
  /** 仅由引擎签发的资源类别品牌。 */
  readonly [nativeRefBrand]: K;
}

/** 仅在一次同步调用期间有效的不透明原生引用。 */
export interface TransientNativeRef<K extends TransientNativeRefKind = TransientNativeRefKind> {
  /** 仅由引擎签发的临时资源类别品牌。 */
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
