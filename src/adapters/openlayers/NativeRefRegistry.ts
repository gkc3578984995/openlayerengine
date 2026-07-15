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

/** 长期原生引用保存的类型和值。 */
interface PersistentEntry {
  /** 原生对象类型。 */
  readonly kind: NativeRefKind;
  /** 实际原生对象。 */
  readonly value: unknown;
}

/** 临时原生引用保存的类型和值。 */
interface TransientEntry {
  /** 临时原生对象类型。 */
  readonly kind: TransientNativeRefKind;
  /** 实际临时对象。 */
  readonly value: unknown;
}

/** 为单个 Earth 管理不透明的原生对象和样式引用。 */
export class NativeRefRegistry {
  /** 已注册的长期原生引用。 */
  readonly #persistent = new Map<NativeRef, PersistentEntry>();
  /** 尚未完成所有权交接的长期引用。 */
  readonly #provisionalPersistent = new Set<NativeRef>();
  /** 曾由本注册表发出的长期引用。 */
  readonly #ownedPersistent = new WeakSet<object>();
  /** 已注册的原生样式引用。 */
  readonly #styles = new Map<NativeStyleRef, StyleLike>();
  /** 尚未完成所有权交接的样式引用。 */
  readonly #provisionalStyles = new Set<NativeStyleRef>();
  /** 当前仍有效的临时引用。 */
  readonly #transient = new Map<TransientNativeRef, TransientEntry>();
  /** 曾由本注册表发出的临时引用。 */
  readonly #ownedTransient = new WeakSet<object>();
  /** 注册表是否已经销毁。 */
  #disposed = false;

  /** 注册一个长期原生对象并返回引用。 */
  register<K extends NativeRefKind, T>(kind: K, value: T): NativeRef<K> {
    this.#assertActive();
    assertNativeValue(value, `Native ${kind}`);
    const reference = createNativeRef(kind);
    this.#ownedPersistent.add(reference);
    this.#persistent.set(reference, { kind, value });
    return reference;
  }

  /** 注册等待后续提交或丢弃的长期原生对象。 */
  registerProvisional<K extends NativeRefKind, T>(kind: K, value: T): NativeRef<K> {
    const reference = this.register(kind, value);
    this.#provisionalPersistent.add(reference);
    return reference;
  }

  /** 获取并校验长期引用对应的原生对象。 */
  require<T = unknown, K extends NativeRefKind = NativeRefKind>(kind: K, reference: NativeRef<K>): T {
    this.#assertActive();
    if (!isNativeRef(reference)) throw new InvalidArgumentError('Expected an issued persistent native reference');
    const entry = this.#persistent.get(reference);
    if (entry === undefined) throw new ObjectDisposedError('Persistent native reference does not belong to this Earth');
    if (entry.kind !== kind) throw new InvalidArgumentError(`Expected native reference kind ${kind}, received ${entry.kind}`);
    return entry.value as T;
  }

  /** 校验长期引用；实际失效统一由注册表销毁处理。 */
  release<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): void {
    this.#assertActive();
    // Store 快照可能共享同一个引用，因此这里仅确认所有权，不立即失效。
    void this.require(kind, reference);
  }

  /** 立即撤销只能独占使用的 DOM 元素引用。 */
  revoke(kind: 'element', reference: NativeRef<'element'>): void {
    if (kind !== 'element') throw new InvalidArgumentError('Only exclusive element references can be revoked');
    if (!isNativeRef(reference)) throw new InvalidArgumentError('Expected an issued persistent native reference');
    if (this.#disposed) {
      if (this.#ownedPersistent.has(reference)) return;
      throw new ObjectDisposedError('Persistent native reference does not belong to this Earth');
    }
    const entry = this.#persistent.get(reference);
    if (entry === undefined) {
      if (this.#ownedPersistent.has(reference)) return;
      throw new ObjectDisposedError('Persistent native reference does not belong to this Earth');
    }
    if (entry.kind !== kind) throw new InvalidArgumentError(`Expected native reference kind ${kind}, received ${entry.kind}`);
    this.#provisionalPersistent.delete(reference);
    this.#persistent.delete(reference);
  }

  /** 判断同一 DOM 元素是否还有其他已提交引用。 */
  hasOtherCommittedReference(kind: 'element', reference: NativeRef<'element'>): boolean {
    this.#assertActive();
    if (kind !== 'element') throw new InvalidArgumentError('Only exclusive element references support identity checks');
    if (!isNativeRef(reference)) throw new InvalidArgumentError('Expected an issued persistent native reference');
    const entry = this.#persistent.get(reference);
    if (entry === undefined) throw new ObjectDisposedError('Persistent native reference does not belong to this Earth');
    if (entry.kind !== kind) throw new InvalidArgumentError(`Expected native reference kind ${kind}, received ${entry.kind}`);
    for (const [candidate, other] of this.#persistent) {
      if (candidate !== reference && !this.#provisionalPersistent.has(candidate) && other.kind === kind && other.value === entry.value) return true;
    }
    return false;
  }

  /** 判断长期引用是否仍处于临时状态。 */
  isProvisional<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): boolean {
    this.#assertActive();
    void this.require(kind, reference);
    return this.#provisionalPersistent.has(reference);
  }

  /** 提交一个临时长期引用。 */
  commitProvisional<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): void {
    this.#assertActive();
    void this.require(kind, reference);
    if (!this.#provisionalPersistent.delete(reference)) throw new InvalidArgumentError('Persistent native reference is not provisional');
  }

  /** 丢弃一个临时长期引用。 */
  discardProvisional<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): void {
    this.#assertActive();
    void this.require(kind, reference);
    if (!this.#provisionalPersistent.delete(reference)) throw new InvalidArgumentError('Persistent native reference is not provisional');
    this.#persistent.delete(reference);
  }

  /** 注册 OpenLayers 原生样式并返回引用。 */
  registerStyle(style: StyleLike): NativeStyleRef {
    this.#assertActive();
    assertStyleLike(style);
    const reference = createNativeStyleRef();
    this.#styles.set(reference, style);
    return reference;
  }

  /** 注册等待后续提交或丢弃的原生样式。 */
  registerProvisionalStyle(style: StyleLike): NativeStyleRef {
    const reference = this.registerStyle(style);
    this.#provisionalStyles.add(reference);
    return reference;
  }

  /** 获取并校验原生样式引用。 */
  requireStyle(reference: NativeStyleRef): StyleLike {
    this.#assertActive();
    if (!isNativeStyleRef(reference)) throw new InvalidArgumentError('Expected an issued native style reference');
    const style = this.#styles.get(reference);
    if (style === undefined) throw new ObjectDisposedError('Native style reference does not belong to this Earth');
    return style;
  }

  /** 校验样式引用；实际失效统一由注册表销毁处理。 */
  releaseStyle(reference: NativeStyleRef): void {
    this.#assertActive();
    // 元素副本和历史记录可能共享样式引用，因此这里不立即失效。
    void this.requireStyle(reference);
  }

  /** 提交一个临时样式引用。 */
  commitProvisionalStyle(reference: NativeStyleRef): void {
    this.#assertActive();
    void this.requireStyle(reference);
    if (!this.#provisionalStyles.delete(reference)) throw new InvalidArgumentError('Native style reference is not provisional');
  }

  /** 丢弃一个临时样式引用。 */
  discardProvisionalStyle(reference: NativeStyleRef): void {
    this.#assertActive();
    void this.requireStyle(reference);
    if (!this.#provisionalStyles.delete(reference)) throw new InvalidArgumentError('Native style reference is not provisional');
    this.#styles.delete(reference);
  }

  /** 注册只在一次事件派发期间有效的原生对象。 */
  registerTransient<K extends TransientNativeRefKind, T>(kind: K, value: T): TransientNativeRef<K> {
    this.#assertActive();
    assertNativeValue(value, `Transient native ${kind}`);
    const reference = createTransientNativeRef(kind);
    this.#ownedTransient.add(reference);
    this.#transient.set(reference, { kind, value });
    return reference;
  }

  /** 返回当前仍有效的临时引用数量。 */
  get activeTransientCount(): number {
    return this.#transient.size;
  }

  /** 获取并校验临时引用对应的原生对象。 */
  requireTransient<T = unknown, K extends TransientNativeRefKind = TransientNativeRefKind>(kind: K, reference: TransientNativeRef<K>): T {
    this.#assertActive();
    if (!isTransientNativeRef(reference)) throw new InvalidArgumentError('Expected an issued transient native reference');
    const entry = this.#transient.get(reference);
    if (entry === undefined) throw new ObjectDisposedError('Transient native reference has been released or belongs to another Earth');
    if (entry.kind !== kind) throw new InvalidArgumentError(`Expected transient native reference kind ${kind}, received ${entry.kind}`);
    return entry.value as T;
  }

  /** 释放一个临时原生引用。 */
  releaseTransient<K extends TransientNativeRefKind>(kind: K, reference: TransientNativeRef<K>): void {
    if (!isTransientNativeRef(reference)) throw new InvalidArgumentError('Expected an issued transient native reference');
    if (this.#disposed) {
      if (this.#ownedTransient.has(reference)) return;
      throw new ObjectDisposedError('Transient native reference does not belong to this Earth');
    }
    const entry = this.#transient.get(reference);
    if (entry === undefined) {
      if (this.#ownedTransient.has(reference)) return;
      throw new ObjectDisposedError('Transient native reference does not belong to this Earth');
    }
    if (entry.kind !== kind) throw new InvalidArgumentError(`Expected transient native reference kind ${kind}, received ${entry.kind}`);
    this.#transient.delete(reference);
  }

  /** 销毁注册表并让全部引用失效。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#persistent.clear();
    this.#provisionalPersistent.clear();
    this.#styles.clear();
    this.#provisionalStyles.clear();
    this.#transient.clear();
  }

  /** 确认注册表仍可使用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('NativeRefRegistry has been destroyed');
  }
}

/** 确认输入是 OpenLayers 支持的样式值。 */
function assertStyleLike(style: unknown): asserts style is StyleLike {
  if (style instanceof Style || typeof style === 'function') return;
  if (Array.isArray(style) && style.every((item) => item instanceof Style)) return;
  throw new InvalidArgumentError('nativeStyle must be a Style, an array of Style values, or a style function');
}

/** 确认原生引用保存的是对象或函数。 */
function assertNativeValue(value: unknown, label: string): void {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    throw new InvalidArgumentError(`${label} value must be an object or function`);
  }
}
