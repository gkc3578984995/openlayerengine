import Style, { type StyleLike } from 'ol/style/Style.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import {
  createNativeRef,
  createTransientNativeRef,
  isNativeRef,
  isTransientNativeRef,
  type NativeRef,
  type NativeRefKind,
  type TransientNativeRef,
  type TransientNativeRefKind
} from '../../core/native/types.js';
import { createNativeStyleRef, isNativeStyleRef, type NativeStyleRef } from '../../core/style/types.js';

interface PersistentEntry {
  readonly kind: NativeRefKind;
  readonly value: unknown;
}

interface TransientEntry {
  readonly kind: TransientNativeRefKind;
  readonly value: unknown;
}

export class NativeRefRegistry {
  readonly #persistent = new Map<NativeRef, PersistentEntry>();
  readonly #provisionalPersistent = new Set<NativeRef>();
  readonly #styles = new Map<NativeStyleRef, StyleLike>();
  readonly #provisionalStyles = new Set<NativeStyleRef>();
  readonly #transient = new Map<TransientNativeRef, TransientEntry>();
  readonly #ownedTransient = new WeakSet<object>();
  #disposed = false;

  register<K extends NativeRefKind, T>(kind: K, value: T): NativeRef<K> {
    this.#assertActive();
    assertNativeValue(value, `Native ${kind}`);
    const reference = createNativeRef(kind);
    this.#persistent.set(reference, { kind, value });
    return reference;
  }

  registerProvisional<K extends NativeRefKind, T>(kind: K, value: T): NativeRef<K> {
    const reference = this.register(kind, value);
    this.#provisionalPersistent.add(reference);
    return reference;
  }

  require<T = unknown, K extends NativeRefKind = NativeRefKind>(kind: K, reference: NativeRef<K>): T {
    this.#assertActive();
    if (!isNativeRef(reference)) throw new InvalidArgumentError('Expected an issued persistent native reference');
    const entry = this.#persistent.get(reference);
    if (entry === undefined) throw new ObjectDisposedError('Persistent native reference does not belong to this Earth');
    if (entry.kind !== kind) throw new InvalidArgumentError(`Expected native reference kind ${kind}, received ${entry.kind}`);
    return entry.value as T;
  }

  release<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): void {
    this.#assertActive();
    // Persistent Store snapshots can share the token. Release is deliberately
    // only an ownership hint; Earth/registry destruction performs invalidation.
    void this.require(kind, reference);
  }

  isProvisional<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): boolean {
    this.#assertActive();
    void this.require(kind, reference);
    return this.#provisionalPersistent.has(reference);
  }

  commitProvisional<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): void {
    this.#assertActive();
    void this.require(kind, reference);
    if (!this.#provisionalPersistent.delete(reference)) throw new InvalidArgumentError('Persistent native reference is not provisional');
  }

  discardProvisional<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): void {
    this.#assertActive();
    void this.require(kind, reference);
    if (!this.#provisionalPersistent.delete(reference)) throw new InvalidArgumentError('Persistent native reference is not provisional');
    this.#persistent.delete(reference);
  }

  registerStyle(style: StyleLike): NativeStyleRef {
    this.#assertActive();
    assertStyleLike(style);
    const reference = createNativeStyleRef();
    this.#styles.set(reference, style);
    return reference;
  }

  registerProvisionalStyle(style: StyleLike): NativeStyleRef {
    const reference = this.registerStyle(style);
    this.#provisionalStyles.add(reference);
    return reference;
  }

  requireStyle(reference: NativeStyleRef): StyleLike {
    this.#assertActive();
    if (!isNativeStyleRef(reference)) throw new InvalidArgumentError('Expected an issued native style reference');
    const style = this.#styles.get(reference);
    if (style === undefined) throw new ObjectDisposedError('Native style reference does not belong to this Earth');
    return style;
  }

  releaseStyle(reference: NativeStyleRef): void {
    this.#assertActive();
    // See release(): styles are persistent because element copies/history share
    // their opaque token by identity.
    void this.requireStyle(reference);
  }

  commitProvisionalStyle(reference: NativeStyleRef): void {
    this.#assertActive();
    void this.requireStyle(reference);
    if (!this.#provisionalStyles.delete(reference)) throw new InvalidArgumentError('Native style reference is not provisional');
  }

  discardProvisionalStyle(reference: NativeStyleRef): void {
    this.#assertActive();
    void this.requireStyle(reference);
    if (!this.#provisionalStyles.delete(reference)) throw new InvalidArgumentError('Native style reference is not provisional');
    this.#styles.delete(reference);
  }

  registerTransient<K extends TransientNativeRefKind, T>(kind: K, value: T): TransientNativeRef<K> {
    this.#assertActive();
    assertNativeValue(value, `Transient native ${kind}`);
    const reference = createTransientNativeRef(kind);
    this.#ownedTransient.add(reference);
    this.#transient.set(reference, { kind, value });
    return reference;
  }

  requireTransient<T = unknown, K extends TransientNativeRefKind = TransientNativeRefKind>(kind: K, reference: TransientNativeRef<K>): T {
    this.#assertActive();
    if (!isTransientNativeRef(reference)) throw new InvalidArgumentError('Expected an issued transient native reference');
    const entry = this.#transient.get(reference);
    if (entry === undefined) throw new ObjectDisposedError('Transient native reference has been released or belongs to another Earth');
    if (entry.kind !== kind) throw new InvalidArgumentError(`Expected transient native reference kind ${kind}, received ${entry.kind}`);
    return entry.value as T;
  }

  releaseTransient<K extends TransientNativeRefKind>(kind: K, reference: TransientNativeRef<K>): void {
    this.#assertActive();
    if (!isTransientNativeRef(reference)) throw new InvalidArgumentError('Expected an issued transient native reference');
    const entry = this.#transient.get(reference);
    if (entry === undefined) {
      if (this.#ownedTransient.has(reference)) return;
      throw new ObjectDisposedError('Transient native reference does not belong to this Earth');
    }
    if (entry.kind !== kind) throw new InvalidArgumentError(`Expected transient native reference kind ${kind}, received ${entry.kind}`);
    this.#transient.delete(reference);
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#persistent.clear();
    this.#provisionalPersistent.clear();
    this.#styles.clear();
    this.#provisionalStyles.clear();
    this.#transient.clear();
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('NativeRefRegistry has been destroyed');
  }
}

function assertStyleLike(style: unknown): asserts style is StyleLike {
  if (style instanceof Style || typeof style === 'function') return;
  if (Array.isArray(style) && style.every((item) => item instanceof Style)) return;
  throw new InvalidArgumentError('nativeStyle must be a Style, an array of Style values, or a style function');
}

function assertNativeValue(value: unknown, label: string): void {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    throw new InvalidArgumentError(`${label} value must be an object or function`);
  }
}
