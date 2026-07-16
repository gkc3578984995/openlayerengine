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
  readonly kind: NativeRefKind;
  readonly value: unknown;
}

/** 临时原生引用保存的类型和值。 */
interface TransientEntry {
  readonly kind: TransientNativeRefKind;
  readonly value: unknown;
}

/** 为单个 Earth 管理不透明原生对象、样式及事件期引用。 */
export class NativeRefRegistry {
  readonly #persistent = new Map<NativeRef, PersistentEntry>();
  readonly #provisionalPersistent = new Set<NativeRef>();
  readonly #ownedPersistent = new WeakSet<object>();
  readonly #styles = new Map<NativeStyleRef, StyleLike>();
  readonly #provisionalStyles = new Set<NativeStyleRef>();
  readonly #transient = new Map<TransientNativeRef, TransientEntry>();
  readonly #ownedTransient = new WeakSet<object>();
  #disposed = false;

  /** 创建与当前 Earth 绑定的长期不透明引用。 */
  register<K extends NativeRefKind, T>(kind: K, value: T): NativeRef<K> {
    this.#assertActive();
    assertNativeValue(value, `Native ${kind}`);
    const reference = createNativeRef(kind);
    this.#ownedPersistent.add(reference);
    this.#persistent.set(reference, { kind, value });
    return reference;
  }

  /** 创建尚未完成所有权交接的长期引用。 */
  registerProvisional<K extends NativeRefKind, T>(kind: K, value: T): NativeRef<K> {
    const reference = this.register(kind, value);
    this.#provisionalPersistent.add(reference);
    return reference;
  }

  /** 解析长期引用，并同时校验来源 Earth 与对象类型。 */
  require<T = unknown, K extends NativeRefKind = NativeRefKind>(kind: K, reference: NativeRef<K>): T {
    this.#assertActive();
    if (!isNativeRef(reference)) throw new InvalidArgumentError('Expected an issued persistent native reference');
    const entry = this.#persistent.get(reference);
    if (entry === undefined) throw new ObjectDisposedError('Persistent native reference does not belong to this Earth');
    if (entry.kind !== kind) throw new InvalidArgumentError(`Expected native reference kind ${kind}, received ${entry.kind}`);
    return entry.value as T;
  }

  /** 仅确认长期引用仍归当前 Earth 所有；共享快照要求它随注册表统一失效。 */
  release<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): void {
    this.#assertActive();
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

  /** 检查同一 DOM 节点是否仍被其他已提交引用持有。 */
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

  isProvisional<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): boolean {
    this.#assertActive();
    void this.require(kind, reference);
    return this.#provisionalPersistent.has(reference);
  }

  /** 完成长期引用的所有权交接。 */
  commitProvisional<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): void {
    this.#assertActive();
    void this.require(kind, reference);
    if (!this.#provisionalPersistent.delete(reference)) throw new InvalidArgumentError('Persistent native reference is not provisional');
  }

  /** 丢弃尚未交接的长期引用。 */
  discardProvisional<K extends NativeRefKind>(kind: K, reference: NativeRef<K>): void {
    this.#assertActive();
    void this.require(kind, reference);
    if (!this.#provisionalPersistent.delete(reference)) throw new InvalidArgumentError('Persistent native reference is not provisional');
    this.#persistent.delete(reference);
  }

  /** 为 OpenLayers 原生样式创建不透明引用。 */
  registerStyle(style: StyleLike): NativeStyleRef {
    this.#assertActive();
    assertStyleLike(style);
    const reference = createNativeStyleRef();
    this.#styles.set(reference, style);
    return reference;
  }

  /** 创建尚未完成所有权交接的原生样式引用。 */
  registerProvisionalStyle(style: StyleLike): NativeStyleRef {
    const reference = this.registerStyle(style);
    this.#provisionalStyles.add(reference);
    return reference;
  }

  /** 解析属于当前 Earth 的原生样式引用。 */
  requireStyle(reference: NativeStyleRef): StyleLike {
    this.#assertActive();
    if (!isNativeStyleRef(reference)) throw new InvalidArgumentError('Expected an issued native style reference');
    const style = this.#styles.get(reference);
    if (style === undefined) throw new ObjectDisposedError('Native style reference does not belong to this Earth');
    return style;
  }

  /** 仅确认样式引用有效；副本与历史共享它，因此不在此处撤销。 */
  releaseStyle(reference: NativeStyleRef): void {
    this.#assertActive();
    void this.requireStyle(reference);
  }

  /** 完成原生样式引用的所有权交接。 */
  commitProvisionalStyle(reference: NativeStyleRef): void {
    this.#assertActive();
    void this.requireStyle(reference);
    if (!this.#provisionalStyles.delete(reference)) throw new InvalidArgumentError('Native style reference is not provisional');
  }

  /** 丢弃尚未交接的原生样式引用。 */
  discardProvisionalStyle(reference: NativeStyleRef): void {
    this.#assertActive();
    void this.requireStyle(reference);
    if (!this.#provisionalStyles.delete(reference)) throw new InvalidArgumentError('Native style reference is not provisional');
    this.#styles.delete(reference);
  }

  /** 创建只在一次同步事件派发期间有效的原生引用。 */
  registerTransient<K extends TransientNativeRefKind, T>(kind: K, value: T): TransientNativeRef<K> {
    this.#assertActive();
    assertNativeValue(value, `Transient native ${kind}`);
    const reference = createTransientNativeRef(kind);
    this.#ownedTransient.add(reference);
    this.#transient.set(reference, { kind, value });
    return reference;
  }

  /** 当前仍有效的事件期引用数量。 */
  get activeTransientCount(): number {
    return this.#transient.size;
  }

  /** 解析事件期引用，并校验来源 Earth 与对象类型。 */
  requireTransient<T = unknown, K extends TransientNativeRefKind = TransientNativeRefKind>(kind: K, reference: TransientNativeRef<K>): T {
    this.#assertActive();
    if (!isTransientNativeRef(reference)) throw new InvalidArgumentError('Expected an issued transient native reference');
    const entry = this.#transient.get(reference);
    if (entry === undefined) throw new ObjectDisposedError('Transient native reference has been released or belongs to another Earth');
    if (entry.kind !== kind) throw new InvalidArgumentError(`Expected transient native reference kind ${kind}, received ${entry.kind}`);
    return entry.value as T;
  }

  /** 使事件期引用失效；重复释放当前注册表发出的引用不会报错。 */
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

  /** 销毁注册表，使所有长期、样式和事件期引用同时失效。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#persistent.clear();
    this.#provisionalPersistent.clear();
    this.#styles.clear();
    this.#provisionalStyles.clear();
    this.#transient.clear();
  }

  /** 销毁后拒绝创建或解析引用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('NativeRefRegistry has been destroyed');
  }
}

/** 只接受 OpenLayers 公开支持的 StyleLike 形态。 */
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
