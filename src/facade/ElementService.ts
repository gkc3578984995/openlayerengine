import type { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import type { FeatureBinding } from '../adapters/openlayers/FeatureBinding.js';
import { stylePresets } from '../builtins/styles/presets.js';
import { cloneCoreState } from '../core/common/clone.js';
import type { Pixel } from '../core/common/types.js';
import type { ElementStore } from '../core/element/ElementStore.js';
import type { ElementCopyOptions, ElementPatch, ElementSelector } from '../core/element/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { LayerManager } from '../core/layer/LayerManager.js';
import type { HitTestPort } from '../core/ports/HitTestPort.js';
import type { ShapeInput } from '../core/shape/types.js';
import type { NativeStyleRef, StyleSpec } from '../core/style/types.js';
import { constructElementHandle, Element, elementHandleFeature } from './Element.js';
import type { LayerServiceImpl } from './LayerService.js';
import { inspectStyleInput } from './StyleFacade.js';
import type { ElementCreateInput, ElementHit, ElementService, ScreenExtent } from './types.js';

/** Element Facade 的可选配置。 */
export interface ElementServiceOptions {
  /** 自定义 Element ID 生成器。 */
  readonly createId?: () => string;
}

/** 同代 OpenLayers Feature 与公共 Element 句柄的缓存项。 */
interface CachedElement {
  /** 当前绑定的 OpenLayers Feature。 */
  readonly feature: ReturnType<FeatureBinding['requireFeature']>;
  /** 返回给调用方的 Element 句柄。 */
  readonly handle: Element;
}

/** 连接 Element 状态、图层与 OpenLayers Feature 的 Facade。 */
export class ElementServiceImpl implements ElementService {
  /** Element 状态的唯一真源。 */
  readonly #store: ElementStore;
  /** 查询 Element 所属图层。 */
  readonly #manager: LayerManager;
  /** 将 Element 状态单向投影到 OpenLayers Feature。 */
  readonly #binding: FeatureBinding;
  /** 提供公共图层句柄。 */
  readonly #layers: LayerServiceImpl;
  /** 管理原生样式引用。 */
  readonly #nativeRefs: NativeRefRegistry;
  /** 处理像素命中和屏幕范围计算。 */
  readonly #hitTest: HitTestPort;
  /** 可选的 Element ID 生成器。 */
  readonly #createId: (() => string) | undefined;
  /** 按 Element ID 缓存当前代次的句柄。 */
  readonly #handles = new Map<string, CachedElement>();
  /** 默认 ID 的递增序号。 */
  #nextId = 0;

  /** 绑定 Element Store、OpenLayers Adapter 和依赖服务。 */
  constructor(
    store: ElementStore,
    manager: LayerManager,
    binding: FeatureBinding,
    layers: LayerServiceImpl,
    nativeRefs: NativeRefRegistry,
    hitTest: HitTestPort,
    options: ElementServiceOptions = {}
  ) {
    this.#store = store;
    this.#manager = manager;
    this.#binding = binding;
    this.#layers = layers;
    this.#nativeRefs = nativeRefs;
    this.#hitTest = hitTest;
    this.#createId = options.createId;
  }

  /** 校验并新增 Element，再返回当前代次的句柄。 */
  add<T>(input: ElementCreateInput<T>): Element<T> {
    let provisional: NativeStyleRef | undefined;
    try {
      const result = this.#store.transaction((transaction) => {
        const record = inspectCreateInput(input);
        const geometry = requireGeometry(record.geometry);
        const layerId = hasOwn(record, 'layerId') ? requireString(record.layerId, 'Element layerId') : this.#layers.ensureDefault().id;
        const styleInput = hasOwn(record, 'style') ? record.style : defaultStyle(this.#binding.renderKind(geometry));
        const inspectedStyle = inspectStyleInput(styleInput as never);
        const style = inspectedStyle.matched ? (provisional = this.#nativeRefs.registerProvisionalStyle(inspectedStyle.value)) : (styleInput as StyleSpec);
        const state = transaction.add<T>({
          id: hasOwn(record, 'id') ? requireString(record.id, 'Element id') : this.#generateId(),
          type: geometry.type,
          geometry,
          style,
          ...(hasOwn(record, 'data') ? { data: record.data as T } : {}),
          ...(hasOwn(record, 'module') ? { module: requireString(record.module, 'Element module') } : {}),
          layerId,
          visible: hasOwn(record, 'visible') ? requireBoolean(record.visible, 'Element visible') : true
        });
        this.#binding.preflight(state);
        return state;
      });
      if (provisional !== undefined) this.#nativeRefs.commitProvisionalStyle(provisional);
      return this.#currentHandle<T>(result.value.id);
    } catch (error) {
      if (provisional !== undefined) this.#discardStyle(provisional);
      throw error;
    }
  }

  /** 按 ID 获取 Element；不存在时清理旧句柄缓存。 */
  get<T>(id: string): Element<T> | undefined {
    if (this.#store.generationOf(id) === undefined) {
      this.#handles.delete(id);
      return undefined;
    }
    return this.#currentHandle<T>(id);
  }

  /**
   * 以 O(1) 判断公共句柄是否仍属于当前 Earth 和当前 Element 代次。
   *
   * @param element 待确认的公共 Element 句柄。
   * @returns 句柄仍在当前缓存中，且 OpenLayers Feature 身份一致时返回 `true`。
   * @internal
   */
  ownsCurrentHandle(element: Element): boolean {
    const feature = elementHandleFeature(element);
    if (feature === undefined) return false;
    const id = element.id;
    const cached = this.#handles.get(id);
    return cached?.handle === element && cached.feature === feature && this.#binding.isCurrentFeature(id, feature);
  }

  /** 按条件查询 Element，并转换为稳定的公共句柄。 */
  query<T>(selector?: ElementSelector<T>): readonly Element<T>[] {
    return Object.freeze(this.#store.query(selector).map(({ id }) => this.#currentHandle<T>(id)));
  }

  /** 批量更新 Element，并在提交前确认 OpenLayers 渲染投影可用。 */
  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): readonly Element<T>[] {
    const result = this.#store.transaction((transaction) => {
      const states = transaction.update(selector, patch);
      for (const state of states) this.#binding.preflight(state);
      return states;
    });
    return Object.freeze(result.value.map(({ id }) => this.#currentHandle<T>(id)));
  }

  /** 删除匹配的 Element，并清理对应句柄。 */
  remove(selector: ElementSelector): number {
    const changes = this.#store.remove(selector);
    for (const change of changes.changes) this.#handles.delete(change.id);
    return changes.changes.length;
  }

  /** 隐藏匹配的 Element，并返回当前句柄。 */
  hide(selector: ElementSelector): readonly Element[] {
    const changes = this.#store.hide(selector);
    return Object.freeze(changes.changes.map(({ id }) => this.#currentHandle(id)));
  }

  /** 显示匹配的 Element，并返回当前句柄。 */
  show(selector: ElementSelector): readonly Element[] {
    const changes = this.#store.show(selector);
    return Object.freeze(changes.changes.map(({ id }) => this.#currentHandle(id)));
  }

  /** 复制指定 Element，并返回副本句柄。 */
  copy<T>(id: string, overrides?: ElementCopyOptions<T>): Element<T> {
    const result = this.#store.transaction((transaction) => {
      const state = transaction.copy(id, overrides);
      this.#binding.preflight(state);
      return state;
    });
    return this.#currentHandle<T>(result.value.id);
  }

  /** 清空所有 Element 及其句柄缓存。 */
  clear(): void {
    this.#store.clear();
    this.#handles.clear();
  }

  /** 查询指定屏幕像素命中的 Element 和图层。 */
  atPixel<T = unknown>(pixel: Pixel): ElementHit<T> | undefined {
    const hit = this.#hitTest.atPixel(pixel);
    if (hit === undefined) return undefined;
    const state = this.#store.get<T>(hit.elementId);
    const layerState = this.#manager.get(hit.layerId);
    if (state === undefined || layerState === undefined || state.layerId !== hit.layerId) return undefined;
    const element = this.get<T>(hit.elementId);
    const layer = this.#layers.get(hit.layerId);
    return element === undefined || layer === undefined ? undefined : Object.freeze({ element, layer });
  }

  /** 获取 Element 在当前视口中的屏幕范围。 */
  getScreenExtent(target: string | Element): ScreenExtent | undefined {
    let id: string;
    let feature: ReturnType<FeatureBinding['requireFeature']>;
    if (typeof target === 'string') {
      id = target;
      const state = this.#store.get(id);
      if (state === undefined || this.#manager.get(state.layerId)?.kind !== 'vector') return undefined;
      try {
        feature = this.#binding.requireFeature(id);
      } catch {
        return undefined;
      }
      if (!this.#binding.isCurrentFeature(id, feature)) return undefined;
    } else {
      const feature = elementHandleFeature(target);
      if (feature === undefined || !this.#binding.isCurrentFeature(target.id, feature)) {
        throw new InvalidArgumentError('Element belongs to another Earth or generation');
      }
      id = target.id;
      const state = this.#store.get(id);
      if (state === undefined || this.#manager.get(state.layerId)?.kind !== 'vector') return undefined;
    }
    return this.#hitTest.getScreenExtent(id);
  }

  /** 获取当前代 Feature 对应的句柄，代次变化时重新创建。 */
  #currentHandle<T>(id: string): Element<T> {
    const feature = this.#binding.requireFeature(id);
    const cached = this.#handles.get(id);
    if (cached?.feature === feature) return cached.handle as Element<T>;
    const generation = this.#store.generationOf(id);
    if (generation === undefined) return missingElement(id);
    const handle = constructElementHandle<T>({
      id,
      feature,
      removedByHandle: false,
      isCurrent: () => this.#store.isGenerationCurrent(id, generation) && this.#binding.isCurrentFeature(id, feature),
      getState: () => this.#store.get<T>(id) ?? missingElement(id),
      update: (patch: ElementPatch<T>) => {
        this.update({ id }, patch);
      },
      remove: () => {
        this.remove({ id });
      }
    });
    this.#handles.set(id, { feature, handle });
    return handle;
  }

  /** 生成尚未占用的 Element ID。 */
  #generateId(): string {
    if (this.#createId !== undefined) return requireString(this.#createId(), 'Generated element id');
    let id: string;
    do id = `element-${++this.#nextId}`;
    while (this.#store.generationOf(id) !== undefined);
    return id;
  }

  /** 尽力释放尚未提交的原生样式引用。 */
  #discardStyle(reference: NativeStyleRef): void {
    try {
      this.#nativeRefs.discardProvisionalStyle(reference);
    } catch {
      // 引用已经提交，或注册表销毁时已统一终结，无需再次处理。
    }
  }
}

/** 安全读取并校验 Element 创建参数。 */
function inspectCreateInput(value: unknown): Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError('Element input must be a plain object');
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Element input must be a plain object');
    const result: Record<PropertyKey, unknown> = {};
    const allowed = new Set(['geometry', 'id', 'style', 'data', 'module', 'layerId', 'visible']);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown element input field: ${String(key)}`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Element input fields must be data properties');
      result[key] = descriptor.value;
    }
    if (!hasOwn(result, 'geometry')) throw new InvalidArgumentError('Element input requires geometry');
    return result;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError('Element input must be inspectable');
  }
}

/** 克隆输入，并由 ShapeRegistry 确认其为有效图形状态。 */
function requireGeometry(value: unknown): ShapeInput {
  const geometry = cloneCoreState(value);
  if (geometry === null || typeof geometry !== 'object' || typeof (geometry as { type?: unknown }).type !== 'string') {
    throw new InvalidArgumentError('Element geometry must be a ShapeInput');
  }
  return geometry as ShapeInput;
}

/** 按渲染类型选择默认样式。 */
function defaultStyle(kind: ReturnType<FeatureBinding['renderKind']>): StyleSpec {
  if (kind === 'point') return stylePresets['point-default'];
  if (kind === 'polyline') return stylePresets['line-default'];
  return stylePresets['polygon-default'];
}

/** 判断对象是否直接拥有指定字段。 */
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** 读取不能为空的字符串。 */
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

/** 读取布尔值。 */
function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}

/** 为已不存在的 Element 生成统一错误。 */
function missingElement(id: string): never {
  throw new InvalidArgumentError(`Element does not exist: ${id}`);
}
