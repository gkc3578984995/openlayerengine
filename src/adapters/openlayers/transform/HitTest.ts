import Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import type BaseLayer from 'ol/layer/Base.js';
import type { Pixel } from '../../../core/common/types.js';
import { InvalidArgumentError } from '../../../core/errors.js';
import type { LayerManager } from '../../../core/layer/LayerManager.js';
import type { FeatureBinding } from '../FeatureBinding.js';
import type { LayerAdapter } from '../LayerAdapter.js';

/** Transform 命中的 Element 和图层身份。 */
export interface TransformHit {
  readonly elementId: string;
  readonly layerId: string;
}

/** 从 OpenLayers 命中结果中筛出可参与 Transform 的 Element。 */
export class TransformHitTest {
  readonly #map: Map;
  readonly #manager: LayerManager;
  readonly #layers: LayerAdapter;
  readonly #binding: FeatureBinding;

  constructor(map: Map, manager: LayerManager, layers: LayerAdapter, binding: FeatureBinding) {
    this.#map = map;
    this.#manager = manager;
    this.#layers = layers;
    this.#binding = binding;
  }

  /** 返回像素处可操作的 Element，同一 Element 只保留首次命中。 */
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

function assertPixel(pixel: Pixel): void {
  if (!Array.isArray(pixel) || pixel.length !== 2 || pixel.some((value) => !Number.isFinite(value))) {
    throw new InvalidArgumentError('Transform pixel must contain two finite numbers');
  }
}
