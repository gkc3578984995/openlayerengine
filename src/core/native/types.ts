const nativeRefBrand: unique symbol = Symbol('ol-engine.native-ref');
const transientNativeRefBrand: unique symbol = Symbol('ol-engine.transient-native-ref');

export type NativeRefKind = 'layer' | 'source' | 'element';
export type TransientNativeRefKind = 'input-event';

export interface NativeRef<K extends NativeRefKind = NativeRefKind> {
  readonly [nativeRefBrand]: K;
}

export interface TransientNativeRef<K extends TransientNativeRefKind = TransientNativeRefKind> {
  readonly [transientNativeRefBrand]: K;
}

export function createNativeRef<K extends NativeRefKind>(kind: K): NativeRef<K> {
  return Object.freeze({ [nativeRefBrand]: kind }) as NativeRef<K>;
}

export function createTransientNativeRef<K extends TransientNativeRefKind>(kind: K): TransientNativeRef<K> {
  return Object.freeze({ [transientNativeRefBrand]: kind }) as TransientNativeRef<K>;
}

export function isNativeRef(value: unknown): value is NativeRef {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { readonly [nativeRefBrand]?: unknown })[nativeRefBrand];
  return kind === 'layer' || kind === 'source' || kind === 'element';
}

export function isTransientNativeRef(value: unknown): value is TransientNativeRef {
  if (typeof value !== 'object' || value === null) return false;
  return (value as { readonly [transientNativeRefBrand]?: unknown })[transientNativeRefBrand] === 'input-event';
}
