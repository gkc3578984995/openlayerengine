import Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import type BaseLayer from 'ol/layer/Base.js';
import type { Pixel } from '../../../core/common/types.js';
import { InvalidArgumentError } from '../../../core/errors.js';
import type { LayerManager } from '../../../core/layer/LayerManager.js';
import type { FeatureBinding } from '../FeatureBinding.js';
import type { LayerAdapter } from '../LayerAdapter.js';

/** Transform 命中的元素和图层身份。 */
export interface TransformHit {
  /** 命中的元素 ID。 */
  readonly elementId: string;
  /** 命中的图层 ID。 */
  readonly layerId: string;
}

/** 为 Transform 交互筛选可操作的元素。 */
export class TransformHitTest {
  /** 用于执行像素命中的地图。 */
  readonly #map: Map;
  /** 提供图层状态。 */
  readonly #manager: LayerManager;
  /** 识别受管理的矢量图层。 */
  readonly #layers: LayerAdapter;
  /** 识别要素对应的元素。 */
  readonly #binding: FeatureBinding;

  /** 保存命中检测所需的地图和状态依赖。 */
  constructor(map: Map, manager: LayerManager, layers: LayerAdapter, binding: FeatureBinding) {
    this.#map = map;
    this.#manager = manager;
    this.#layers = layers;
    this.#binding = binding;
  }

  /** 返回指定像素处所有可操作且不重复的元素。 */
  atPixel(pixel: Pixel, hitTolerance: number): readonly TransformHit[] {
    assertPixel(pixel);
    if (!Number.isFinite(hitTolerance) || hitTolerance < 0) throw new InvalidArgumentError('Transform hitTolerance must be a finite non-negative number');
    const hits: TransformHit[] = [];
    const seen = new Set<string>();
    const eligibleLayers = new globalThis.Map<BaseLayer, string | undefined>();
    const eligibleLayerId = (layer: BaseLayer): string | undefined => {
      if (eligibleLayers.has(layer)) return eligibleLayers.get(layer);
      const layerId = this.#layers.vectorLayerIdFor(layer);
      const state = layerId === undefined ? undefined : this.#manager.get(layerId);
      const eligible = state?.kind === 'vector' && state.visible && state.opacity > 0 ? layerId : undefined;
      eligibleLayers.set(layer, eligible);
      return eligible;
    };
    this.#map.forEachFeatureAtPixel(
      [...pixel],
      (candidate, layer) => {
        if (!(candidate instanceof Feature)) return undefined;
        const layerId = eligibleLayerId(layer as BaseLayer);
        const identity = this.#binding.resolveFeature(candidate);
        if (identity === undefined || !identity.visible || layerId === undefined || identity.layerId !== layerId || seen.has(identity.elementId)) {
          return undefined;
        }
        seen.add(identity.elementId);
        hits.push(Object.freeze({ elementId: identity.elementId, layerId }));
        return undefined;
      },
      {
        hitTolerance,
        checkWrapped: true,
        layerFilter: (layer) => eligibleLayerId(layer) !== undefined
      }
    );
    return Object.freeze(hits);
  }
}

/** 确认输入是有效的屏幕像素。 */
function assertPixel(pixel: Pixel): void {
  if (!Array.isArray(pixel) || pixel.length !== 2 || pixel.some((value) => !Number.isFinite(value))) {
    throw new InvalidArgumentError('Transform pixel must contain two finite numbers');
  }
}
