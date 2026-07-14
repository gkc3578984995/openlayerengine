import type OlMap from 'ol/Map.js';
import { describe, expect, it, vi } from 'vitest';
import { InputAdapter } from '../src/adapters/openlayers/InputAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { ObjectDisposedError } from '../src/core/errors.js';
import type { HitTestPort } from '../src/core/ports/HitTestPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { EventFacade } from '../src/facade/EventFacade.js';
import type { ElementService, LayerService } from '../src/facade/types.js';
import { EventService as InternalEventService } from '../src/services/events/EventService.js';
import { InputRouter } from '../src/services/events/InputRouter.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

class MapHarness {
  readonly target = new EventTarget();
  readonly viewport = new EventTarget();
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  on(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  un(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, originalEvent = new Event(type)): void {
    const event = { coordinate: [1, 2], pixel: [3, 4], originalEvent };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  getTargetElement(): HTMLElement {
    return this.target as unknown as HTMLElement;
  }

  getViewport(): HTMLElement {
    return this.viewport as unknown as HTMLElement;
  }

  getEventPixel(): [number, number] {
    return [3, 4];
  }

  getCoordinateFromPixel(): [number, number] {
    return [1, 2];
  }
}

const noHits: HitTestPort = {
  atPixel: () => undefined,
  getScreenExtent: () => undefined
};

function setup() {
  const map = new MapHarness();
  const refs = new NativeRefRegistry();
  const adapter = new InputAdapter(map as unknown as OlMap, noHits, refs);
  const router = new InputRouter(adapter);
  const reports = vi.fn();
  const internal = new InternalEventService(router, new ElementStore(new ShapeRegistry()), reports);
  const elements = { get: () => undefined } as unknown as ElementService;
  const layers = { get: () => undefined } as unknown as LayerService;
  const events = new EventFacade(internal, elements, layers, refs);
  return { adapter, events, internal, map, refs, reports, router };
}

describe('transient native input event references', () => {
  coversCapabilities('public-ol-native-escape', 'event-global-click', 'event-listener-disposer', 'event-once-click', 'event-once-click-cancelable');

  it('exposes the exact synchronous Event and shares one ref scope across public listeners', () => {
    const { events, map, refs } = setup();
    const native = new Event('click');
    const received: Event[] = [];
    const counts: number[] = [];
    events.on('click', (event) => {
      received.push(event.originalEvent);
      counts.push(refs.activeTransientCount);
    });
    events.on('click', (event) => {
      received.push(event.originalEvent);
      counts.push(refs.activeTransientCount);
    });

    map.emit('click', native);
    expect(received).toEqual([native, native]);
    expect(counts).toEqual([1, 1]);
    expect(refs.activeTransientCount).toBe(0);
  });

  it('nests recursive native inputs as 1 -> 2 -> 1 -> 0 without persisting or cloning refs', () => {
    const { events, map, refs } = setup();
    const counts: number[] = [];
    let recursive = false;
    events.on('click', () => {
      counts.push(refs.activeTransientCount);
      if (recursive) return;
      recursive = true;
      map.emit('click', new Event('inner'));
      counts.push(refs.activeTransientCount);
    });

    map.emit('click', new Event('outer'));
    expect(counts).toEqual([1, 2, 1]);
    expect(refs.activeTransientCount).toBe(0);
  });

  it('releases after throwing and once callbacks while continuing later listeners', () => {
    const { events, map, refs, reports } = setup();
    const later = vi.fn();
    events.once('click', () => {
      expect(refs.activeTransientCount).toBe(1);
      throw new Error('listener failed');
    });
    events.on('click', later);

    expect(() => map.emit('click')).not.toThrow();
    expect(refs.activeTransientCount).toBe(0);
    expect(later).toHaveBeenCalledOnce();
    expect(reports).toHaveBeenCalledOnce();
    map.emit('click');
    expect(later).toHaveBeenCalledTimes(2);
  });

  it('rejects foreign registries and makes owned release idempotent after registry destroy', () => {
    const first = new NativeRefRegistry();
    const second = new NativeRefRegistry();
    const native = new Event('click');
    const reference = first.registerTransient('input-event', native);

    expect(first.activeTransientCount).toBe(1);
    expect(() => second.requireTransient('input-event', reference)).toThrow(ObjectDisposedError);
    expect(() => second.releaseTransient('input-event', reference)).toThrow(ObjectDisposedError);
    first.destroy();
    expect(first.activeTransientCount).toBe(0);
    expect(() => first.releaseTransient('input-event', reference)).not.toThrow();
    expect(() => second.releaseTransient('input-event', reference)).toThrow(ObjectDisposedError);
  });

  it('allows callback-time registry destroy and adapter finally cleanup without masking the callback', () => {
    const { events, map, refs } = setup();
    const native = new Event('click');
    const listener = vi.fn((original: Event) => {
      expect(original).toBe(native);
      expect(refs.activeTransientCount).toBe(1);
      refs.destroy();
    });
    events.on('click', (event) => listener(event.originalEvent));

    expect(() => map.emit('click', native)).not.toThrow();
    expect(listener).toHaveBeenCalledOnce();
    expect(refs.activeTransientCount).toBe(0);
  });
});
