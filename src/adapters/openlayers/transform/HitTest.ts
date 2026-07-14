import Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import type BaseLayer from 'ol/layer/Base.js';
import type { Pixel } from '../../../core/common/types.js';
import type { ElementStore } from '../../../core/element/ElementStore.js';
import { InvalidArgumentError } from '../../../core/errors.js';
import type { LayerManager } from '../../../core/layer/LayerManager.js';
import type { FeatureBinding } from '../FeatureBinding.js';
import type { LayerAdapter } from '../LayerAdapter.js';

export interface TransformHit {
  readonly elementId: string;
  readonly layerId: string;
}

export class TransformHitTest {
  readonly #map: Map;
  readonly #store: ElementStore;
  readonly #manager: LayerManager;
  readonly #layers: LayerAdapter;
  readonly #binding: FeatureBinding;

  constructor(map: Map, store: ElementStore, manager: LayerManager, layers: LayerAdapter, binding: FeatureBinding) {
    this.#map = map;
    this.#store = store;
    this.#manager = manager;
    this.#layers = layers;
    this.#binding = binding;
  }

  atPixel(pixel: Pixel, hitTolerance: number): readonly TransformHit[] {
    assertPixel(pixel);
    if (!Number.isFinite(hitTolerance) || hitTolerance < 0) throw new InvalidArgumentError('Transform hitTolerance must be a finite non-negative number');
    const hits: TransformHit[] = [];
    const seen = new Set<string>();
    this.#map.forEachFeatureAtPixel(
      [...pixel],
      (candidate, layer) => {
        if (!(candidate instanceof Feature)) return undefined;
        const layerId = this.#layers.vectorLayerIdFor(layer as BaseLayer);
        const identity = this.#binding.resolveFeature(candidate);
        const state = identity === undefined ? undefined : this.#store.get(identity.elementId);
        const layerState = layerId === undefined ? undefined : this.#manager.get(layerId);
        if (
          identity === undefined ||
          state === undefined ||
          !identity.visible ||
          layerId === undefined ||
          identity.layerId !== layerId ||
          layerState?.kind !== 'vector' ||
          !layerState.visible ||
          layerState.opacity === 0 ||
          seen.has(identity.elementId)
        ) {
          return undefined;
        }
        seen.add(identity.elementId);
        hits.push(Object.freeze({ elementId: identity.elementId, layerId }));
        return undefined;
      },
      {
        hitTolerance,
        checkWrapped: true,
        layerFilter: (layer) => this.#layers.isRegisteredVectorLayer(layer)
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
