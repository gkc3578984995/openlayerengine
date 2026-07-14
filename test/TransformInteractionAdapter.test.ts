import Collection from 'ol/Collection.js';
import type Interaction from 'ol/interaction/Interaction.js';
import type BaseLayer from 'ol/layer/Base.js';
import type OlMap from 'ol/Map.js';
import Observable from 'ol/Observable.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import type { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import { TransformInteractionAdapter } from '../src/adapters/openlayers/interactions/TransformInteractionAdapter.js';
import type { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import type { TransformHitTest } from '../src/adapters/openlayers/transform/HitTest.js';
import type { LayerRenderPort } from '../src/core/ports/LayerRenderPort.js';
import type { TransformInteractionOptions } from '../src/core/ports/TransformInteractionPort.js';

class MapHarness extends Observable {
  readonly layers = new Collection<BaseLayer>();
  readonly interactions = new Collection<Interaction>();
  readonly viewport = new EventTarget();
  readonly view = new View({ projection: 'EPSG:4326', center: [0, 0], zoom: 2 });

  addLayer(layer: BaseLayer): void {
    this.layers.push(layer);
  }

  removeLayer(layer: BaseLayer): BaseLayer | undefined {
    return this.layers.remove(layer);
  }

  addInteraction(interaction: Interaction): void {
    this.interactions.push(interaction);
    interaction.setMap(this as unknown as OlMap);
  }

  removeInteraction(interaction: Interaction): Interaction | undefined {
    const removed = this.interactions.remove(interaction);
    if (removed !== undefined) interaction.setMap(null);
    return removed;
  }

  getViewport(): HTMLElement {
    return this.viewport as unknown as HTMLElement;
  }

  getView(): View {
    return this.view;
  }
}

const options: TransformInteractionOptions = {
  hitTolerance: 2,
  translate: 'feature',
  scale: true,
  stretch: true,
  rotate: true,
  translateBBox: false,
  noFlip: true,
  keepRectangle: true,
  buffer: 16,
  pointRadius: 8
};

describe('TransformInteractionAdapter', () => {
  it('removes a singleclick listener when map.on mutates before throwing', () => {
    const map = new MapHarness();
    const installationFailure = new Error('singleclick installation failed');
    const nativeOn = map.on.bind(map) as unknown as (type: string, listener: (event: unknown) => void) => unknown;
    vi.spyOn(map, 'on').mockImplementation(((type: string, listener: (event: unknown) => void) => {
      nativeOn(type, listener);
      throw installationFailure;
    }) as never);
    const adapter = new TransformInteractionAdapter(
      map as unknown as OlMap,
      { atPixel: () => [] } as unknown as TransformHitTest,
      {} as FeatureBinding,
      {} as StyleCompiler,
      {} as LayerRenderPort
    );

    expect(() => adapter.open('transform-singleclick', options, vi.fn())).toThrow(installationFailure);
    expect(map.interactions.getLength()).toBe(0);
    expect(map.getListeners('singleclick') ?? []).toHaveLength(0);
    expect(map.layers.getLength()).toBe(0);
  });

  it('removes the interaction, map listener, viewport listener, and handle layer after a partial open failure', () => {
    const map = new MapHarness();
    const installationFailure = new Error('contextmenu installation failed');
    const nativeAdd = map.viewport.addEventListener.bind(map.viewport);
    vi.spyOn(map.viewport, 'addEventListener').mockImplementation((type, listener, eventOptions) => {
      nativeAdd(type, listener, eventOptions);
      if (type === 'contextmenu') throw installationFailure;
    });
    const removeViewport = vi.spyOn(map.viewport, 'removeEventListener');
    const adapter = new TransformInteractionAdapter(
      map as unknown as OlMap,
      { atPixel: () => [] } as unknown as TransformHitTest,
      {} as FeatureBinding,
      {} as StyleCompiler,
      {} as LayerRenderPort
    );

    expect(() => adapter.open('transform-test', options, vi.fn())).toThrow(installationFailure);
    expect(map.interactions.getLength()).toBe(0);
    expect(map.getListeners('singleclick') ?? []).toHaveLength(0);
    expect(removeViewport).toHaveBeenCalledWith('contextmenu', expect.any(Function), true);
    expect(map.layers.getLength()).toBe(0);
  });
});
