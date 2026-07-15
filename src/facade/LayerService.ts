import BaseLayer from 'ol/layer/Base.js';
import ImageTileSource from 'ol/source/ImageTile.js';
import TileSource from 'ol/source/Tile.js';
import { createCallbackImageTileSource, type LayerAdapter } from '../adapters/openlayers/LayerAdapter.js';
import type { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { CoreLayerSpec, CoreLayerState, LayerKind } from '../core/layer/types.js';
import type { LayerManager } from '../core/layer/LayerManager.js';
import type { NativeRef } from '../core/native/types.js';
import { constructLayerHandle, Layer } from './Layer.js';
import type { LayerService, LayerState, PublicLayerSpec, TileUrlFunction } from './types.js';

/** 图层门面实现使用的可选配置。 */
export interface LayerServiceOptions {
  /** 自定义图层 ID 的生成方式。 */
  readonly createId?: () => string;
}

/** 已解析的内部图层配置和临时原生资源。 */
interface ParsedLayer {
  /** 可交给核心图层管理器的配置。 */
  readonly spec: CoreLayerSpec;
  /** 等待提交的原生图层或数据源引用。 */
  readonly provisional?: { readonly kind: 'layer' | 'source'; readonly ref: NativeRef<'layer'> | NativeRef<'source'> };
  /** 门面为回调瓦片地址创建的数据源。 */
  readonly internallyCreatedSource?: ImageTileSource;
}

/** 缓存同一代原生图层和对应的公开句柄。 */
interface CachedLayer {
  /** 当前绑定的 OpenLayers 图层。 */
  readonly layer: BaseLayer;
  /** 返回给调用方的图层句柄。 */
  readonly handle: Layer;
  /** 用于识别句柄代次的标记。 */
  readonly generation: object;
}

/** 连接公开图层 API、核心状态和 OpenLayers 图层的门面实现。 */
export class LayerServiceImpl implements LayerService {
  /** 保存和修改图层状态。 */
  readonly #manager: LayerManager;
  /** 同步核心图层与 OpenLayers。 */
  readonly #adapter: LayerAdapter;
  /** 管理外部传入的图层和数据源引用。 */
  readonly #nativeRefs: NativeRefRegistry;
  /** 可选的图层 ID 生成器。 */
  readonly #createId: (() => string) | undefined;
  /** 按图层 ID 缓存当前句柄。 */
  readonly #handles = new Map<string, CachedLayer>();
  /** 默认 ID 的递增序号。 */
  #nextId = 0;
  /** 标记当前是否正在执行图层修改。 */
  #mutating = false;

  /** 保存依赖并确保默认矢量图层存在。 */
  constructor(manager: LayerManager, adapter: LayerAdapter, nativeRefs: NativeRefRegistry, options: LayerServiceOptions = {}) {
    this.#manager = manager;
    this.#adapter = adapter;
    this.#nativeRefs = nativeRefs;
    this.#createId = options.createId;
    this.ensureDefault();
  }

  /** 校验并新增图层，完成原生资源的所有权交接。 */
  add(spec: PublicLayerSpec): Layer {
    return this.#mutation(() => {
      const parsed = this.#parse(spec);
      let attached = false;
      let rolledBack = false;
      try {
        this.#manager.add(parsed.spec);
        attached = true;
        if (parsed.provisional !== undefined) {
          this.#commit(parsed.provisional);
          this.#adapter.completeResourceHandoff(parsed.spec.id);
        }
      } catch (error) {
        if (attached) {
          try {
            rolledBack = this.#manager.remove(parsed.spec.id);
          } catch {
            // 清理错误由适配器记录，这里保留最初的新增错误。
          }
        } else {
          rolledBack = true;
        }
        if (rolledBack && parsed.internallyCreatedSource !== undefined) {
          try {
            parsed.internallyCreatedSource.dispose();
          } catch {
            // 数据源已不能继续交接，这里保留最初的挂载错误。
          }
        }
        if (parsed.provisional !== undefined) this.#discard(parsed.provisional);
        throw error;
      }
      return this.#currentHandle(parsed.spec.id);
    });
  }

  /** 按 ID 获取图层；不存在时清理旧句柄缓存。 */
  get(id: string): Layer | undefined {
    const state = this.#manager.get(id);
    if (state === undefined) {
      this.#handles.delete(id);
      return undefined;
    }
    return this.#currentHandle(id);
  }

  /** 查询全部图层或指定类型的图层。 */
  query(kind?: LayerKind): readonly Layer[] {
    if (kind !== undefined && kind !== 'vector' && kind !== 'tile' && kind !== 'native') throw new InvalidArgumentError('Unknown layer kind');
    return Object.freeze(
      this.#manager
        .query()
        .filter((state) => kind === undefined || state.kind === kind)
        .map(({ id }) => this.#currentHandle(id))
    );
  }

  /** 删除指定图层并清理对应句柄。 */
  remove(id: string): boolean {
    return this.#mutation(() => {
      const removed = this.#manager.remove(id);
      if (removed) this.#handles.delete(id);
      return removed;
    });
  }

  /** 清空可删除的图层和句柄缓存。 */
  clear(): void {
    this.#mutation(() => {
      this.#manager.clear();
      this.#handles.clear();
    });
  }

  /** 获取默认矢量图层，不存在时自动创建。 */
  ensureDefault(): Layer {
    const state = this.#manager.ensureDefaultVector();
    return this.#currentHandle(state.id);
  }

  /** 获取当前一代原生图层对应的句柄。 */
  #currentHandle(id: string): Layer {
    const nativeLayer = this.#adapter.requireLayer(id);
    const cached = this.#handles.get(id);
    if (cached?.layer === nativeLayer) return cached.handle;
    const generation = Object.freeze({});
    const handle = constructLayerHandle({
      id,
      nativeLayer,
      removedByHandle: false,
      isCurrent: () =>
        this.#handles.get(id)?.generation === generation && this.#manager.get(id) !== undefined && this.#adapter.requireLayer(id) === nativeLayer,
      getState: () => toPublicState(this.#manager.get(id) ?? missingLayer(id)),
      update: (patch: Parameters<Layer['update']>[0]) => {
        this.#manager.update(id, patch);
      },
      remove: () => {
        this.remove(id);
      }
    });
    this.#handles.set(id, { layer: nativeLayer, handle, generation });
    return handle;
  }

  /** 校验公开配置，并转换为核心图层配置。 */
  #parse(input: PublicLayerSpec): ParsedLayer {
    const record = inspectRecord(input, 'Layer spec');
    const kind = requireOwn(record, 'kind');
    const id = hasOwn(record, 'id') ? requireString(record.id, 'Layer id') : this.#generateId();
    const visible = hasOwn(record, 'visible') ? requireBoolean(record.visible, 'visible') : true;
    const opacity = hasOwn(record, 'opacity') ? requireOpacity(record.opacity) : 1;
    const zIndex = hasOwn(record, 'zIndex') ? requireFinite(record.zIndex, 'zIndex') : undefined;
    const presentation = { visible, opacity, ...(zIndex === undefined ? {} : { zIndex }) };

    if (kind === 'vector') {
      assertKeys(record, new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'wrapX', 'declutter']), 'vector layer');
      return {
        spec: {
          kind,
          id,
          ...presentation,
          wrapX: hasOwn(record, 'wrapX') ? requireBoolean(record.wrapX, 'wrapX') : true,
          declutter: hasOwn(record, 'declutter') ? requireBoolean(record.declutter, 'declutter') : false
        }
      };
    }

    if (kind === 'native') {
      assertKeys(record, new Set(['kind', 'id', 'layer', 'ownership']), 'native layer');
      const layer = requireOwn(record, 'layer');
      if (!(layer instanceof BaseLayer)) throw new InvalidArgumentError('Native layer requires an OpenLayers BaseLayer');
      const ownership = hasOwn(record, 'ownership') ? requireOwnership(record.ownership) : 'external';
      const ref = this.#nativeRefs.registerProvisional('layer', layer);
      return { spec: { kind, id, ref, ownership }, provisional: { kind: 'layer', ref } };
    }

    if (kind !== 'tile') throw new InvalidArgumentError('Unknown layer kind');
    const preset = hasOwn(record, 'preset') ? record.preset : undefined;
    if (preset === 'osm') {
      assertKeys(record, new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'preset']), 'OSM layer');
      return { spec: { kind, id, ...presentation, source: { preset }, sourceOwnership: 'earth' } };
    }
    if (preset === 'compact-xyz') {
      assertKeys(record, new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'preset', 'baseUrl']), 'compact layer');
      return {
        spec: {
          kind,
          id,
          ...presentation,
          source: { preset, baseUrl: requireString(requireOwn(record, 'baseUrl'), 'Compact base URL') },
          sourceOwnership: 'earth'
        }
      };
    }
    if (preset === 'xyz') {
      assertKeys(record, new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'preset', 'url', 'tileUrlFunction', 'attributions']), 'XYZ layer');
      const hasUrl = hasOwn(record, 'url');
      const hasCallback = hasOwn(record, 'tileUrlFunction');
      if (hasUrl === hasCallback) throw new InvalidArgumentError('XYZ requires exactly one of url or tileUrlFunction');
      const attributions = hasOwn(record, 'attributions') ? requireAttributions(record.attributions) : undefined;
      if (hasUrl) {
        return {
          spec: {
            kind,
            id,
            ...presentation,
            source: { preset, url: requireString(record.url, 'XYZ URL'), ...(attributions === undefined ? {} : { attributions }) },
            sourceOwnership: 'earth'
          }
        };
      }
      const callback = record.tileUrlFunction;
      if (typeof callback !== 'function') throw new InvalidArgumentError('tileUrlFunction must be a function');
      const source = createCallbackImageTileSource(callback as TileUrlFunction, attributions);
      let ref: NativeRef<'source'>;
      try {
        ref = this.#nativeRefs.registerProvisional('source', source);
      } catch (error) {
        try {
          source.dispose();
        } catch {
          // 保留最初的注册错误。
        }
        throw error;
      }
      return {
        spec: { kind, id, ...presentation, source: ref, sourceOwnership: 'earth' },
        provisional: { kind: 'source', ref },
        internallyCreatedSource: source
      };
    }

    if (preset !== undefined) throw new InvalidArgumentError('Unknown tile preset');
    assertKeys(record, new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'source', 'ownership']), 'custom tile layer');
    const source = requireOwn(record, 'source');
    if (!(source instanceof TileSource)) throw new InvalidArgumentError('Custom tile layer requires an OpenLayers TileSource');
    const ownership = hasOwn(record, 'ownership') ? requireOwnership(record.ownership) : 'external';
    const ref = this.#nativeRefs.registerProvisional('source', source);
    return { spec: { kind, id, ...presentation, source: ref, sourceOwnership: ownership }, provisional: { kind: 'source', ref } };
  }

  /** 提交临时原生资源引用。 */
  #commit(provisional: NonNullable<ParsedLayer['provisional']>): void {
    if (provisional.kind === 'layer') this.#nativeRefs.commitProvisional('layer', provisional.ref as NativeRef<'layer'>);
    else this.#nativeRefs.commitProvisional('source', provisional.ref as NativeRef<'source'>);
  }

  /** 尽力释放尚未提交的原生资源引用。 */
  #discard(provisional: NonNullable<ParsedLayer['provisional']>): void {
    try {
      if (provisional.kind === 'layer') this.#nativeRefs.discardProvisional('layer', provisional.ref as NativeRef<'layer'>);
      else this.#nativeRefs.discardProvisional('source', provisional.ref as NativeRef<'source'>);
    } catch {
      // 注册表销毁后，临时引用已经失效。
    }
  }

  /** 生成一个尚未占用的图层 ID。 */
  #generateId(): string {
    if (this.#createId !== undefined) return requireString(this.#createId(), 'Generated layer id');
    let id: string;
    do id = `layer-${++this.#nextId}`;
    while (this.#manager.get(id) !== undefined);
    return id;
  }

  /** 串行执行图层修改，避免重入造成状态错乱。 */
  #mutation<T>(work: () => T): T {
    if (this.#mutating) throw new InvalidArgumentError('Reentrant LayerService mutations are not supported');
    this.#mutating = true;
    try {
      return work();
    } finally {
      this.#mutating = false;
    }
  }
}

/** 将核心图层状态转换为只读的公开状态。 */
function toPublicState(state: Readonly<CoreLayerState>): Readonly<LayerState> {
  const presentation = {
    kind: state.kind,
    id: state.id,
    visible: state.visible,
    opacity: state.opacity,
    ...(state.zIndex === undefined ? {} : { zIndex: state.zIndex })
  };
  return Object.freeze(state.kind === 'vector' ? { ...presentation, wrapX: state.wrapX, declutter: state.declutter } : presentation) as Readonly<LayerState>;
}

/** 为已不存在的图层生成统一错误。 */
function missingLayer(id: string): never {
  throw new InvalidArgumentError(`Layer does not exist: ${id}`);
}

/** 安全读取一个普通对象，并保留其数据字段。 */
function inspectRecord(value: unknown, label: string): Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
    const result = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} fields must be data properties`);
      Object.defineProperty(result, key, {
        value: descriptor.value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return result;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

/** 确认对象只包含允许的字段。 */
function assertKeys(record: Record<PropertyKey, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

/** 读取必须存在的自有字段。 */
function requireOwn(record: Record<PropertyKey, unknown>, key: string): unknown {
  if (!hasOwn(record, key)) throw new InvalidArgumentError(`Layer spec requires ${key}`);
  return record[key];
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
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`Layer ${label} must be a boolean`);
  return value;
}

/** 读取 0 到 1 之间的不透明度。 */
function requireOpacity(value: unknown): number {
  const opacity = requireFinite(value, 'opacity');
  if (opacity < 0 || opacity > 1) throw new InvalidArgumentError('Layer opacity must be between 0 and 1');
  return opacity;
}

/** 读取有限数值。 */
function requireFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidArgumentError(`Layer ${label} must be finite`);
  return value;
}

/** 读取原生资源的所有权设置。 */
function requireOwnership(value: unknown): 'external' | 'earth' {
  if (value !== 'external' && value !== 'earth') throw new InvalidArgumentError('Layer ownership must be external or earth');
  return value;
}

/** 读取单条或多条版权说明。 */
function requireAttributions(value: unknown): string | readonly string[] {
  if (typeof value === 'string') return requireString(value, 'Attribution');
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new InvalidArgumentError('Attributions must be a string or string array');
  }
  return Object.freeze([...value]) as readonly string[];
}
