import type Feature from 'ol/Feature.js';
import type OlMap from 'ol/Map.js';
import type Collection from 'ol/Collection.js';
import type Geometry from 'ol/geom/Geometry.js';
import BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import ImageTileSource, { type UrlGetter } from 'ol/source/ImageTile.js';
import OSM from 'ol/source/OSM.js';
import TileSource from 'ol/source/Tile.js';
import VectorSource from 'ol/source/Vector.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { CoreLayerSpec, CoreLayerState, LayerOwnership, LayerPresentation, TileSourcePresetState } from '../../core/layer/types.js';
import { isNativeRef } from '../../core/native/types.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { LayerPort } from '../../core/ports/LayerPort.js';
import type { NativeRefRegistry } from './NativeRefRegistry.js';

/** 矢量图层使用的要素数据源。 */
type VectorFeatureSource = VectorSource<Feature<Geometry>>;
/** 公开瓦片地址回调的签名。 */
type PublicTileUrlFunction = (coordinate: [z: number, x: number, y: number]) => string;

/** 图层适配器的可选配置。 */
export interface LayerAdapterOptions {
  /** 接收适配器内部非致命错误。 */
  readonly errorReporter?: ErrorReporter;
}

/** 单个已挂载图层及其资源所有权信息。 */
interface AdapterRecord {
  /** 核心图层 ID。 */
  readonly id: string;
  /** 图层类型。 */
  readonly kind: CoreLayerState['kind'];
  /** 实际 OpenLayers 图层。 */
  readonly layer: BaseLayer;
  /** 图层是否由 Earth 负责销毁。 */
  readonly layerOwned: boolean;
  /** 图层是否由适配器创建。 */
  readonly adapterCreatedLayer: boolean;
  /** 外部资源的所有权是否已经完成交接。 */
  resourceOwnershipActive: boolean;
  /** 图层使用的数据源。 */
  readonly source?: TileSource | VectorFeatureSource;
  /** 数据源是独占使用还是可共享。 */
  readonly sourceMode?: 'exclusive' | 'shared';
  /** 数据源的销毁责任。 */
  readonly sourceOwnership?: LayerOwnership;
  /** 矢量图层的数据源。 */
  readonly vectorSource?: VectorFeatureSource;
  /** 图层挂载后的展示状态。 */
  readonly presentation: LayerPresentation;
}

/** 共享瓦片数据源的引用计数和所有权状态。 */
interface SharedSourceRecord {
  /** 数据源的销毁责任。 */
  readonly ownership: LayerOwnership;
  /** 当前使用该数据源的图层数量。 */
  count: number;
  /** Earth 是否已经接管数据源所有权。 */
  ownershipTransferred: boolean;
}

/** 将核心图层配置映射为 OpenLayers 图层和数据源。 */
export class LayerAdapter implements LayerPort {
  /** 图层所属的地图。 */
  readonly #map: OlMap;
  /** 地图根图层集合。 */
  readonly #rootLayers: Collection<BaseLayer>;
  /** 解析外部传入的原生资源引用。 */
  readonly #nativeRefs: NativeRefRegistry;
  /** 接收非致命清理和监听器错误。 */
  readonly #errorReporter: ErrorReporter;
  /** 按 ID 保存已挂载图层。 */
  readonly #records = new Map<string, AdapterRecord>();
  /** 从任意已注册图层反查图层 ID。 */
  readonly #layerIds = new WeakMap<BaseLayer, string>();
  /** 从已注册矢量图层反查图层 ID。 */
  readonly #vectorLayerIds = new WeakMap<BaseLayer, string>();
  /** 跟踪共享瓦片数据源的使用情况。 */
  readonly #sharedSources = new Map<TileSource, SharedSourceRecord>();
  /** 适配器是否已经销毁。 */
  #disposed = false;

  /** 保存地图、原生引用注册表和错误上报器。 */
  constructor(map: OlMap, nativeRefs: NativeRefRegistry, options: LayerAdapterOptions = {}) {
    this.#map = map;
    this.#rootLayers = map.getLayers();
    this.#nativeRefs = nativeRefs;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
  }

  /** 创建或解析图层，并将其挂到地图。 */
  attach(spec: Readonly<CoreLayerSpec>): LayerPresentation {
    this.#assertActive();
    if (this.#records.has(spec.id)) throw new InvalidArgumentError(`Layer adapter id already exists: ${spec.id}`);

    const prepared = this.#prepare(spec);
    let inserted = false;
    try {
      this.#rootLayers.push(prepared.layer);
      inserted = this.#rootLayers.getArray().includes(prepared.layer);
    } catch (error) {
      inserted = this.#rootLayers.getArray().includes(prepared.layer);
      if (!inserted) {
        this.#rollbackPrepared(prepared);
        throw error;
      }
      this.#report(error, 'attach-listener');
    }
    if (!inserted) {
      this.#rollbackPrepared(prepared);
      throw new InvalidArgumentError(`OpenLayers did not attach layer: ${spec.id}`);
    }

    this.#records.set(spec.id, prepared);
    this.#layerIds.set(prepared.layer, spec.id);
    if (prepared.vectorSource !== undefined) this.#vectorLayerIds.set(prepared.layer, spec.id);
    if (prepared.sourceMode === 'shared' && prepared.source instanceof TileSource && prepared.sourceOwnership !== undefined) {
      const shared = this.#sharedSources.get(prepared.source);
      if (shared === undefined) {
        this.#sharedSources.set(prepared.source, {
          ownership: prepared.sourceOwnership,
          count: 1,
          ownershipTransferred: prepared.sourceOwnership === 'earth' && prepared.resourceOwnershipActive
        });
      } else {
        shared.count += 1;
        if (prepared.sourceOwnership === 'earth' && prepared.resourceOwnershipActive) shared.ownershipTransferred = true;
      }
    }
    return prepared.presentation;
  }

  /** 标记指定图层的原生资源已经完成所有权交接。 */
  completeResourceHandoff(id: string): void {
    const record = this.#records.get(id);
    if (record === undefined || record.resourceOwnershipActive) return;
    record.resourceOwnershipActive = true;
    if (record.sourceMode === 'shared' && record.source instanceof TileSource && record.sourceOwnership === 'earth') {
      const shared = this.#sharedSources.get(record.source);
      if (shared !== undefined) shared.ownershipTransferred = true;
    }
  }

  /** 将核心图层展示状态同步到 OpenLayers 图层。 */
  update(before: Readonly<CoreLayerState>, after: Readonly<CoreLayerState>): void {
    this.#assertActive();
    if (before.id !== after.id || before.kind !== after.kind) throw new InvalidArgumentError('Layer adapter update cannot change id or kind');
    const record = this.#records.get(before.id);
    if (record === undefined) throw new InvalidArgumentError(`Layer adapter record does not exist: ${before.id}`);
    this.#applyPresentation(record.layer, after);
  }

  /** 从地图移除图层并按所有权清理资源。 */
  detach(id: string): void {
    this.#assertActive();
    const record = this.#records.get(id);
    if (record === undefined) throw new InvalidArgumentError(`Layer adapter record does not exist: ${id}`);
    this.#records.delete(id);
    this.#layerIds.delete(record.layer);
    this.#vectorLayerIds.delete(record.layer);

    try {
      this.#rootLayers.remove(record.layer);
    } catch (error) {
      this.#report(error, 'detach-listener');
      if (this.#rootLayers.getArray().includes(record.layer)) {
        try {
          this.#rootLayers.remove(record.layer);
        } catch (retryError) {
          this.#report(retryError, 'detach-listener-retry');
        }
      }
    }

    if (record.vectorSource !== undefined) this.#attempt(() => record.vectorSource?.clear(true), 'clear-vector-source');
    if (record.layerOwned && (record.adapterCreatedLayer || record.resourceOwnershipActive)) this.#attempt(() => record.layer.dispose(), 'dispose-layer');
    this.#releaseSource(record);
  }

  /** 获取指定 ID 对应的 OpenLayers 图层。 */
  requireLayer(id: string): BaseLayer {
    this.#assertActive();
    const layer = this.#records.get(id)?.layer;
    if (layer === undefined) throw new ObjectDisposedError(`Layer is not attached: ${id}`);
    return layer;
  }

  /** 获取指定矢量图层的数据源。 */
  requireVectorSource(id: string): VectorFeatureSource {
    this.#assertActive();
    const source = this.#records.get(id)?.vectorSource;
    if (source === undefined) throw new InvalidArgumentError(`Registered layer is not vector: ${id}`);
    return source;
  }

  /** 从已注册图层反查核心图层 ID。 */
  layerIdFor(layer: BaseLayer): string | undefined {
    this.#assertActive();
    return this.#layerIds.get(layer);
  }

  /** 从已注册矢量图层反查核心图层 ID。 */
  vectorLayerIdFor(layer: BaseLayer): string | undefined {
    this.#assertActive();
    return this.#vectorLayerIds.get(layer);
  }

  /** 判断图层是否是当前适配器管理的矢量图层。 */
  isRegisteredVectorLayer(layer: BaseLayer): boolean {
    this.#assertActive();
    return this.#vectorLayerIds.has(layer);
  }

  /** 返回当前全部矢量数据源。 */
  vectorSources(): readonly VectorFeatureSource[] {
    this.#assertActive();
    return Object.freeze([...this.#records.values()].flatMap(({ vectorSource }) => (vectorSource === undefined ? [] : [vectorSource])));
  }

  /** 移除全部图层并销毁适配器。 */
  destroy(): void {
    if (this.#disposed) return;
    for (const id of [...this.#records.keys()]) this.detach(id);
    this.#disposed = true;
  }

  /** 根据核心配置准备一个尚未挂载的图层记录。 */
  #prepare(spec: Readonly<CoreLayerSpec>): AdapterRecord {
    if (spec.kind === 'vector') {
      const source = new VectorSource<Feature<Geometry>>({ wrapX: spec.wrapX });
      try {
        const layer = new VectorLayer({
          source,
          declutter: spec.declutter,
          style: null,
          visible: spec.visible,
          opacity: spec.opacity,
          ...(spec.zIndex === undefined ? {} : { zIndex: spec.zIndex })
        });
        return {
          id: spec.id,
          kind: spec.kind,
          layer,
          layerOwned: true,
          adapterCreatedLayer: true,
          resourceOwnershipActive: true,
          source,
          sourceMode: 'exclusive',
          sourceOwnership: 'earth',
          vectorSource: source,
          presentation: presentationOf(layer)
        };
      } catch (error) {
        this.#disposeRollback(source);
        throw error;
      }
    }

    if (spec.kind === 'tile') {
      const preset = !isNativeRef(spec.source);
      const resourceOwnershipActive = preset || !this.#nativeRefs.isProvisional('source', spec.source as Parameters<NativeRefRegistry['isProvisional']>[1]);
      const source = preset
        ? createPresetSource(spec.source as TileSourcePresetState)
        : this.#nativeRefs.require<TileSource>('source', spec.source as Parameters<NativeRefRegistry['require']>[1]);
      if (!(source instanceof TileSource)) {
        if (preset) this.#disposeRollback(source);
        throw new InvalidArgumentError('Custom tile source reference must resolve to an OpenLayers TileSource');
      }
      if (!preset) this.#assertSourceOwnership(source, spec.sourceOwnership);
      try {
        const layer = new TileLayer({
          source,
          visible: spec.visible,
          opacity: spec.opacity,
          ...(spec.zIndex === undefined ? {} : { zIndex: spec.zIndex })
        });
        return {
          id: spec.id,
          kind: spec.kind,
          layer,
          layerOwned: true,
          adapterCreatedLayer: true,
          resourceOwnershipActive,
          source,
          sourceMode: preset ? 'exclusive' : 'shared',
          sourceOwnership: spec.sourceOwnership,
          presentation: presentationOf(layer)
        };
      } catch (error) {
        if (preset) this.#disposeRollback(source);
        throw error;
      }
    }

    const layer = this.#nativeRefs.require<BaseLayer>('layer', spec.ref);
    if (!(layer instanceof BaseLayer)) throw new InvalidArgumentError('Native layer reference must resolve to an OpenLayers BaseLayer');
    if (this.#layerIds.has(layer) || containsManagedLayer(this.#map, layer)) throw new InvalidArgumentError('Native layer is already attached to this map');
    return {
      id: spec.id,
      kind: spec.kind,
      layer,
      layerOwned: spec.ownership === 'earth',
      adapterCreatedLayer: false,
      resourceOwnershipActive: !this.#nativeRefs.isProvisional('layer', spec.ref),
      presentation: presentationOf(layer)
    };
  }

  /** 确认共享数据源没有混用不同所有权。 */
  #assertSourceOwnership(source: TileSource, ownership: LayerOwnership): void {
    const existing = this.#sharedSources.get(source);
    if (existing !== undefined && existing.ownership !== ownership) {
      throw new InvalidArgumentError('A custom tile source cannot mix external and earth ownership');
    }
  }

  /** 将可见性、不透明度和层级应用到图层。 */
  #applyPresentation(layer: BaseLayer, state: Readonly<CoreLayerState>): void {
    this.#setAndRecover(layer, 'visible', state.visible, () => layer.setVisible(state.visible));
    this.#setAndRecover(layer, 'opacity', state.opacity, () => layer.setOpacity(state.opacity));
    if (state.zIndex === undefined) {
      try {
        layer.unset('zIndex');
      } catch (error) {
        this.#report(error, 'update-z-index');
        this.#attempt(() => layer.unset('zIndex', true), 'recover-z-index');
      }
    } else {
      const zIndex = state.zIndex;
      this.#setAndRecover(layer, 'zIndex', zIndex, () => layer.setZIndex(zIndex));
    }
  }

  /** 执行标准 setter，失败时用静默属性写入恢复状态。 */
  #setAndRecover(layer: BaseLayer, key: string, value: unknown, setter: () => void): void {
    try {
      setter();
    } catch (error) {
      this.#report(error, `update-${key}`);
      this.#attempt(() => layer.set(key, value, true), `recover-${key}`);
    }
  }

  /** 按独占、共享和所有权规则释放数据源。 */
  #releaseSource(record: AdapterRecord): void {
    const source = record.source;
    if (source === undefined) return;
    if (record.sourceMode === 'exclusive') {
      this.#attempt(() => source.dispose(), 'dispose-source');
      return;
    }
    if (!(source instanceof TileSource) || record.sourceOwnership === undefined) return;
    const shared = this.#sharedSources.get(source);
    if (shared === undefined) return;
    shared.count -= 1;
    if (shared.count > 0) return;
    this.#sharedSources.delete(source);
    if (shared.ownership === 'earth' && shared.ownershipTransferred) this.#attempt(() => source.dispose(), 'dispose-source');
  }

  /** 回滚尚未挂载成功的图层和独占数据源。 */
  #rollbackPrepared(record: AdapterRecord): void {
    if (record.adapterCreatedLayer) this.#disposeRollback(record.layer);
    if (record.sourceMode === 'exclusive' && record.source !== undefined) this.#disposeRollback(record.source);
  }

  /** 尽力销毁回滚过程中的临时资源。 */
  #disposeRollback(value: { dispose(): void }): void {
    try {
      value.dispose();
    } catch (error) {
      this.#report(error, 'rollback-dispose');
    }
  }

  /** 执行清理操作，并把错误交给上报器。 */
  #attempt(work: () => void, operation: string): void {
    try {
      work();
    } catch (error) {
      this.#report(error, operation);
    }
  }

  /** 安全上报适配器内部错误。 */
  #report(error: unknown, operation: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, { source: 'LayerAdapter', operation });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // 错误上报失败不能破坏已经请求的图层状态。
    }
  }

  /** 确认适配器仍可使用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('LayerAdapter has been destroyed');
  }
}

/** 生成紧凑目录格式的瓦片地址。 */
export function compactTileUrl(baseUrl: string, z: number, x: number, y: number): string {
  const base = requireNonEmptyUrl(baseUrl).replace(/\/+$/u, '');
  if (base.length === 0) throw new InvalidArgumentError('Compact tile base URL must not contain only slashes');
  for (const [label, value] of [
    ['z', z],
    ['x', x],
    ['y', y]
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new InvalidArgumentError(`Compact tile ${label} must be a non-negative safe integer`);
  }
  return `${base}/L${z.toString(10).padStart(2, '0')}/R${y.toString(16).toUpperCase().padStart(8, '0')}/C${x.toString(16).toUpperCase().padStart(8, '0')}.jpg`;
}

/** 将公开瓦片回调包装为 OpenLayers URL 获取函数。 */
export function wrapTileUrlFunction(callback: PublicTileUrlFunction): UrlGetter {
  if (typeof callback !== 'function') throw new InvalidArgumentError('tileUrlFunction must be a function');
  return (z, x, y) => {
    const result = callback([z, x, y]);
    if (typeof result !== 'string' || result.trim().length === 0) throw new InvalidArgumentError('tileUrlFunction must return a non-empty string');
    return result;
  };
}

/** 使用公开瓦片回调创建 ImageTileSource。 */
export function createCallbackImageTileSource(callback: PublicTileUrlFunction, attributions?: string | readonly string[]): ImageTileSource {
  return new ImageTileSource({
    url: wrapTileUrlFunction(callback),
    ...(attributions === undefined ? {} : { attributions: typeof attributions === 'string' ? attributions : [...attributions] })
  });
}

/** 根据内置瓦片配置创建数据源。 */
function createPresetSource(source: TileSourcePresetState): TileSource {
  if (source.preset === 'osm') return new OSM();
  if (source.preset === 'xyz') {
    return new ImageTileSource({
      url: source.url,
      ...(source.attributions === undefined ? {} : { attributions: typeof source.attributions === 'string' ? source.attributions : [...source.attributions] })
    });
  }
  return new ImageTileSource({ url: (z, x, y) => compactTileUrl(source.baseUrl, z, x, y) });
}

/** 读取并校验 OpenLayers 图层的展示状态。 */
function presentationOf(layer: BaseLayer): LayerPresentation {
  const visible = layer.getVisible();
  const opacity = layer.getOpacity();
  const zIndex = layer.getZIndex();
  if (typeof visible !== 'boolean') throw new InvalidArgumentError('Native layer visible must be boolean');
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new InvalidArgumentError('Native layer opacity must be between 0 and 1');
  if (zIndex !== undefined && !Number.isFinite(zIndex)) throw new InvalidArgumentError('Native layer zIndex must be finite');
  return Object.freeze({ visible, opacity, ...(zIndex === undefined ? {} : { zIndex }) });
}

/** 递归判断地图中是否已经包含目标图层。 */
function containsManagedLayer(map: OlMap, target: BaseLayer): boolean {
  const visit = (layers: readonly BaseLayer[]): boolean =>
    layers.some((layer) => layer === target || (layer instanceof LayerGroup && visit(layer.getLayers().getArray())));
  return visit(map.getLayers().getArray()) || map.getAllLayers().some((layer) => layer === target);
}

/** 读取不能为空的瓦片地址。 */
function requireNonEmptyUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError('Tile URL must be a non-empty string');
  return value;
}
