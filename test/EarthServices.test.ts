import DoubleClickZoom from 'ol/interaction/DoubleClickZoom.js';
import MouseWheelZoom from 'ol/interaction/MouseWheelZoom.js';
import { describe, expect, it, vi } from 'vitest';

interface FakeCollection<T> {
  getArray(): T[];
  push(value: T): number;
  remove(value: T): T | undefined;
  clear(): void;
  forEach(listener: (value: T) => void): void;
}

interface FakeViewport {
  readonly style: { cursor: string };
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  dispatchEvent(event: Event): boolean;
  listenerCount(type: string): number;
}

interface FakeMapInspection {
  readonly viewport: FakeViewport;
  readonly disposeCount: number;
  readonly target: unknown;
  getLayers(): FakeCollection<unknown>;
  getOverlays(): FakeCollection<unknown>;
  getInteractions(): FakeCollection<unknown>;
  getControls(): FakeCollection<unknown>;
}

vi.mock('ol/interaction/defaults.js', async () => {
  const { default: DragPan } = await import('ol/interaction/DragPan.js');
  const { default: DoubleClickZoom } = await import('ol/interaction/DoubleClickZoom.js');
  const { default: MouseWheelZoom } = await import('ol/interaction/MouseWheelZoom.js');
  return {
    defaults: (options: { doubleClickZoom?: boolean; mouseWheelZoom?: boolean } = {}) => {
      const values: unknown[] = [new DragPan()];
      if (options.doubleClickZoom !== false) values.push(new DoubleClickZoom());
      if (options.mouseWheelZoom !== false) values.push(new MouseWheelZoom());
      return {
        getArray: () => values,
        push: (value: unknown) => values.push(value),
        remove: (value: unknown) => {
          const index = values.indexOf(value);
          return index < 0 ? undefined : values.splice(index, 1)[0];
        },
        clear: () => {
          values.length = 0;
        },
        forEach: (listener: (value: unknown) => void) => values.forEach(listener)
      };
    }
  };
});

vi.mock('ol/control/defaults.js', () => ({
  defaults: () => {
    const values: unknown[] = [];
    return {
      getArray: () => values,
      push: (value: unknown) => values.push(value),
      remove: (value: unknown) => {
        const index = values.indexOf(value);
        return index < 0 ? undefined : values.splice(index, 1)[0];
      },
      clear: () => {
        values.length = 0;
      },
      forEach: (listener: (value: unknown) => void) => values.forEach(listener)
    };
  }
}));

vi.mock('ol/Map.js', () => {
  class Collection<T> implements FakeCollection<T> {
    readonly #values: T[];

    constructor(values: readonly T[] = []) {
      this.#values = [...values];
    }

    getArray(): T[] {
      return this.#values;
    }

    push(value: T): number {
      this.#values.push(value);
      return this.#values.length;
    }

    remove(value: T): T | undefined {
      const index = this.#values.indexOf(value);
      if (index < 0) return undefined;
      return this.#values.splice(index, 1)[0];
    }

    clear(): void {
      this.#values.length = 0;
    }

    forEach(listener: (value: T) => void): void {
      this.#values.forEach(listener);
    }
  }

  class Viewport implements FakeViewport {
    readonly style = { cursor: '' };
    readonly #listeners = new globalThis.Map<string, Set<EventListenerOrEventListenerObject>>();

    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      let listeners = this.#listeners.get(type);
      if (listeners === undefined) {
        listeners = new Set();
        this.#listeners.set(type, listeners);
      }
      listeners.add(listener);
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      this.#listeners.get(type)?.delete(listener);
    }

    dispatchEvent(event: Event): boolean {
      for (const listener of [...(this.#listeners.get(event.type) ?? [])]) {
        if (typeof listener === 'function') listener.call(this, event);
        else listener.handleEvent(event);
      }
      return !event.defaultPrevented;
    }

    listenerCount(type: string): number {
      return this.#listeners.get(type)?.size ?? 0;
    }
  }

  return {
    default: class FakeMap {
      readonly viewport = new Viewport();
      readonly #layers = new Collection();
      readonly #overlays = new Collection();
      readonly #listeners = new globalThis.Map<string, Set<(event: unknown) => void>>();
      readonly #view: unknown;
      readonly #interactions: FakeCollection<unknown>;
      readonly #controls: FakeCollection<unknown>;
      disposeCount = 0;
      target: unknown;

      constructor(options: { target: unknown; view: unknown; interactions: FakeCollection<unknown>; controls: FakeCollection<unknown> }) {
        this.target = options.target;
        this.#view = options.view;
        this.#interactions = options.interactions;
        this.#controls = options.controls;
      }

      getViewport(): FakeViewport {
        return this.viewport;
      }

      getTargetElement(): FakeViewport {
        return this.viewport;
      }

      getView(): unknown {
        return this.#view;
      }

      getLayers(): FakeCollection<unknown> {
        return this.#layers;
      }

      getAllLayers(): unknown[] {
        return [...this.#layers.getArray()];
      }

      getOverlays(): FakeCollection<unknown> {
        return this.#overlays;
      }

      getInteractions(): FakeCollection<unknown> {
        return this.#interactions;
      }

      getControls(): FakeCollection<unknown> {
        return this.#controls;
      }

      addLayer(layer: unknown): void {
        this.#layers.push(layer);
      }

      removeLayer(layer: unknown): unknown {
        return this.#layers.remove(layer);
      }

      addOverlay(overlay: unknown): void {
        this.#overlays.push(overlay);
      }

      removeOverlay(overlay: unknown): unknown {
        return this.#overlays.remove(overlay);
      }

      addInteraction(interaction: unknown): void {
        this.#interactions.push(interaction);
      }

      removeInteraction(interaction: unknown): unknown {
        return this.#interactions.remove(interaction);
      }

      addControl(control: unknown): void {
        this.#controls.push(control);
      }

      removeControl(control: unknown): unknown {
        return this.#controls.remove(control);
      }

      on(type: string, listener: (event: unknown) => void): object {
        let listeners = this.#listeners.get(type);
        if (listeners === undefined) {
          listeners = new Set();
          this.#listeners.set(type, listeners);
        }
        listeners.add(listener);
        return { target: this, type, listener };
      }

      un(type: string, listener: (event: unknown) => void): void {
        this.#listeners.get(type)?.delete(listener);
      }

      forEachFeatureAtPixel(): undefined {
        return undefined;
      }

      getEventPixel(): [number, number] {
        return [0, 0];
      }

      getCoordinateFromPixel(): [number, number] {
        return [0, 0];
      }

      getPixelFromCoordinate(): [number, number] {
        return [0, 0];
      }

      setTarget(target: unknown): void {
        this.target = target;
      }

      dispose(): void {
        this.disposeCount += 1;
      }
    }
  };
});

import { ObjectDisposedError } from '../src/core/errors.js';
import { createEngineContext } from '../src/internal/createEngineContext.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

describe('Earth v2 服务装配', () => {
  coversCapabilities(
    'earth-owned-service-reuse',
    'earth-default-layer-bundle',
    'earth-default-interaction-policy',
    'earth-browser-contextmenu-suppression',
    'earth-destroy-lifecycle'
  );

  it('提供稳定服务引用和唯一默认 vector layer', () => {
    const context = createEngineContext({ target: 'map-a' });
    const references = [
      context.elements,
      context.layers,
      context.styles,
      context.animations,
      context.draw,
      context.transform,
      context.measure,
      context.events,
      context.contextMenu,
      context.overlays,
      context.view,
      context.controls
    ];

    expect([
      context.elements,
      context.layers,
      context.styles,
      context.animations,
      context.draw,
      context.transform,
      context.measure,
      context.events,
      context.contextMenu,
      context.overlays,
      context.view,
      context.controls
    ]).toEqual(references);
    expect(context.layers.query().map(({ state }) => state)).toEqual([
      { kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }
    ]);
    expect(context.layers.query('vector')).toHaveLength(1);
    expect(context.layers.query('tile')).toEqual([]);
    context.destroy();
  });

  it('移除 DoubleClickZoom 并保留一个默认平滑 MouseWheelZoom 交互', () => {
    const context = createEngineContext({ target: 'map-a' });
    const map = context.map as unknown as FakeMapInspection;
    const interactions = map.getInteractions().getArray();

    expect(interactions.some((interaction) => interaction instanceof DoubleClickZoom)).toBe(false);
    expect(interactions.filter((interaction) => interaction instanceof MouseWheelZoom)).toHaveLength(1);
    context.destroy();
  });

  it('始终只在当前 viewport 屏蔽浏览器右键并在 destroy 后解除', () => {
    const first = createEngineContext({ target: 'map-a' });
    const second = createEngineContext({ target: 'map-b' });
    const firstMap = first.map as unknown as FakeMapInspection;
    const secondMap = second.map as unknown as FakeMapInspection;
    const firstEvent = new Event('contextmenu', { cancelable: true });
    const secondEvent = new Event('contextmenu', { cancelable: true });

    firstMap.viewport.dispatchEvent(firstEvent);
    secondMap.viewport.dispatchEvent(secondEvent);
    expect(firstEvent.defaultPrevented).toBe(true);
    expect(secondEvent.defaultPrevented).toBe(true);
    expect(firstMap.viewport.listenerCount('contextmenu')).toBe(2);
    expect(secondMap.viewport.listenerCount('contextmenu')).toBe(2);

    first.destroy();
    const afterDestroy = new Event('contextmenu', { cancelable: true });
    const secondAfterDestroy = new Event('contextmenu', { cancelable: true });
    firstMap.viewport.dispatchEvent(afterDestroy);
    secondMap.viewport.dispatchEvent(secondAfterDestroy);
    expect(afterDestroy.defaultPrevented).toBe(false);
    expect(secondAfterDestroy.defaultPrevented).toBe(true);
    expect(firstMap.viewport.listenerCount('contextmenu')).toBe(0);
    second.destroy();
  });

  it('销毁完整服务树并同步失效 ViewService 和 Map', () => {
    const context = createEngineContext({ target: 'map-a' });
    const map = context.map as unknown as FakeMapInspection;

    context.destroy();
    context.destroy();

    expect(map.disposeCount).toBe(1);
    expect(map.target).toBeUndefined();
    expect(map.getLayers().getArray()).toEqual([]);
    expect(map.getInteractions().getArray()).toEqual([]);
    expect(() => context.view.getCenter()).toThrowError(ObjectDisposedError);
  });
});
