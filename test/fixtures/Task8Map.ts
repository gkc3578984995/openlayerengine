import Collection from 'ol/Collection.js';
import type { FeatureLike } from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import type Layer from 'ol/layer/Layer.js';
import type Source from 'ol/source/Source.js';

class PublicMapFake {
  readonly layers = new Collection<BaseLayer>();
  rotation = 0.25;
  resolution = 1;

  getLayers(): Collection<BaseLayer> {
    return this.layers;
  }

  getAllLayers(): Layer<Source>[] {
    const visit = (layers: readonly BaseLayer[]): Layer<Source>[] =>
      layers.flatMap((layer) => (layer instanceof LayerGroup ? visit(layer.getLayers().getArray()) : [layer as Layer<Source>]));
    return visit(this.layers.getArray());
  }

  forEachFeatureAtPixel<T>(
    _pixel: readonly number[],
    _callback: (feature: FeatureLike, layer: Layer<Source>, geometry: unknown) => T,
    _options?: unknown
  ): T | undefined {
    void _pixel;
    void _callback;
    void _options;
    return undefined;
  }

  getPixelFromCoordinate(): [number, number] | null {
    return null;
  }

  getView(): { getRotation(): number; getResolution(): number } {
    return { getRotation: () => this.rotation, getResolution: () => this.resolution };
  }
}

export function createTestMap(): Map {
  return new PublicMapFake() as unknown as Map;
}
