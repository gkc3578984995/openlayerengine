const nativeRefBrand: unique symbol = Symbol('ol-engine.native-ref');
const transientNativeRefBrand: unique symbol = Symbol('ol-engine.transient-native-ref');
const issuedNativeRefs = new WeakMap<object, NativeRefKind>();
const issuedTransientNativeRefs = new WeakMap<object, TransientNativeRefKind>();

export type NativeRefKind = 'layer' | 'source' | 'element';
export type TransientNativeRefKind = 'input-event';

export interface NativeRef<K extends NativeRefKind = NativeRefKind> {
  readonly [nativeRefBrand]: K;
}

export interface TransientNativeRef<K extends TransientNativeRefKind = TransientNativeRefKind> {
  readonly [transientNativeRefBrand]: K;
}

export function createNativeRef<K extends NativeRefKind>(kind: K): NativeRef<K> {
  const reference = Object.freeze({ [nativeRefBrand]: kind }) as NativeRef<K>;
  issuedNativeRefs.set(reference, kind);
  return reference;
}

export function createTransientNativeRef<K extends TransientNativeRefKind>(kind: K): TransientNativeRef<K> {
  const reference = Object.freeze({ [transientNativeRefBrand]: kind }) as TransientNativeRef<K>;
  issuedTransientNativeRefs.set(reference, kind);
  return reference;
}

export function isNativeRef(value: unknown): value is NativeRef {
  if (typeof value !== 'object' || value === null) return false;
  if (!Object.isFrozen(value)) return false;
  const kind = issuedNativeRefs.get(value);
  return kind === 'layer' || kind === 'source' || kind === 'element';
}

export function isTransientNativeRef(value: unknown): value is TransientNativeRef {
  if (typeof value !== 'object' || value === null) return false;
  return Object.isFrozen(value) && issuedTransientNativeRefs.get(value) === 'input-event';
}
