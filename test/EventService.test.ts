import { describe, expect, it, vi } from 'vitest';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementSelector, ElementState } from '../src/core/element/types.js';
import { ObjectDisposedError } from '../src/core/errors.js';
import { createTransientNativeRef } from '../src/core/native/types.js';
import type { InputEventMap, InputPort, InputType, PointerInputType } from '../src/core/ports/InputPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { Element } from '../src/facade/Element.js';
import { EventFacade } from '../src/facade/EventFacade.js';
import type { Layer } from '../src/facade/Layer.js';
import type { ElementService, LayerService } from '../src/facade/types.js';
import { EventService } from '../src/services/events/EventService.js';
import { InputRouter } from '../src/services/events/InputRouter.js';
import type { RoutedEventMap, RoutedEventType } from '../src/services/events/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

type InputListener = (event: InputEventMap[InputType]) => void;

class FakeInputPort implements InputPort {
  readonly listeners = new Map<InputType, InputListener>();
  readonly listenCounts = new Map<InputType, number>();

  listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
    this.listenCounts.set(type, (this.listenCounts.get(type) ?? 0) + 1);
    this.listeners.set(type, listener as InputListener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(type);
    };
  }

  emit<T extends InputType>(type: T, event: InputEventMap[T]): void {
    this.listeners.get(type)?.(event);
  }
}

const eventRef = createTransientNativeRef('input-event');

function element(overrides: Partial<ElementState<{ owner: string }>> = {}): ElementState<{ owner: string }> {
  return {
    id: 'a',
    type: 'point',
    geometry: { type: 'point', controlPoints: [[1, 2]] },
    style: { symbol: { type: 'circle', radius: 5, fill: { type: 'solid', color: '#f00' } } },
    data: { owner: 'first' },
    module: 'shared',
    layerId: 'layer-a',
    visible: true,
    ...overrides
  };
}

function setup() {
  const port = new FakeInputPort();
  const router = new InputRouter(port);
  const reports = vi.fn();
  const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
  store.add(element());
  store.add(element({ id: 'b', data: { owner: 'second' }, layerId: 'layer-b' }));
  const events = new EventService(router, store, reports);
  const pointer = <T extends PointerInputType>(type: T, elementId?: string): void =>
    port.emit(
      type,
      Object.freeze({
        type,
        coordinate: Object.freeze([10, 20] as const),
        pixel: Object.freeze([30, 40] as const),
        ...(elementId === undefined ? {} : { elementId }),
        nativeEventRef: eventRef
      }) as unknown as InputEventMap[T]
    );
  const key = (): void =>
    port.emit(
      'keydown',
      Object.freeze({
        type: 'keydown',
        key: 'Enter',
        code: 'Enter',
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        nativeEventRef: eventRef
      })
    );
  return { events, key, pointer, port, reports, store };
}

describe('internal EventService', () => {
  coversCapabilities(
    'event-global-move',
    'event-global-click',
    'event-global-left-down',
    'event-global-left-up',
    'event-global-double-click',
    'event-global-right-click',
    'event-module-move',
    'event-module-click',
    'event-module-left-down',
    'event-module-left-up',
    'event-module-double-click',
    'event-module-right-click',
    'event-global-key-down',
    'event-module-routing-payload',
    'event-module-hover-transition',
    'event-listener-auto-enable',
    'event-listener-disposer',
    'event-once-click',
    'event-once-click-cancelable',
    'event-once-right-click',
    'event-once-right-click-cancelable',
    'event-listener-state-query',
    'event-module-scoped-cleanup',
    'event-manual-enable-disable'
  );

  it('routes all seven event types through one lazy listener and current element snapshots', () => {
    const { events, key, pointer, port } = setup();
    const received: Array<RoutedEventMap[RoutedEventType]> = [];
    const types = ['pointermove', 'click', 'leftdown', 'leftup', 'doubleclick', 'rightclick', 'keydown'] as const;
    types.forEach((type) => events.on(type, (event) => received.push(event)));
    types.forEach((type) => expect(port.listenCounts.get(type)).toBe(1));
    pointer('pointermove', 'a');
    pointer('click', 'a');
    pointer('leftdown', 'a');
    pointer('leftup', 'a');
    pointer('doubleclick', 'a');
    pointer('rightclick', 'a');
    key();
    expect(received.map(({ type }) => type)).toEqual(types);
    expect(received[1]).toMatchObject({ coordinate: [10, 20], pixel: [30, 40], element: { id: 'a' } });
    expect(Object.isFrozen(received[1])).toBe(true);
    expect(Object.isFrozen((received[1] as RoutedEventMap['click']).coordinate)).toBe(true);
    expect(received[6]).toMatchObject({ key: 'Enter', ctrlKey: true, shiftKey: true });
  });

  it('matches every selector field and module shorthand without Store scans', () => {
    const { events, pointer, store } = setup();
    const query = vi.spyOn(store, 'query');
    const selectors: ElementSelector<{ owner: string }>[] = [
      { id: 'a' },
      { ids: ['a'] },
      { module: 'shared' },
      { layerId: 'layer-a' },
      { type: 'point' },
      { visible: true },
      { predicate: (state) => state.data?.owner === 'first' }
    ];
    const calls = selectors.map(() => vi.fn());
    selectors.forEach((selector, index) => events.on('click', calls[index], { selector: selector as ElementSelector }));
    const moduleCall = vi.fn();
    events.on('click', moduleCall, { module: 'shared' });
    pointer('click', 'a');
    expect(calls.every((call) => call.mock.calls.length === 1)).toBe(true);
    expect(moduleCall).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalled();
  });

  it('routes module shorthand for every non-move pointer type', () => {
    const { events, pointer } = setup();
    for (const type of ['click', 'leftdown', 'leftup', 'doubleclick', 'rightclick'] as const) {
      const listener = vi.fn();
      const dispose = events.on(type, listener, { module: 'shared' });
      pointer(type);
      pointer(type, 'a');
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({ type, element: { id: 'a', module: 'shared' } });
      dispose();
    }
  });

  it('unregisters once before recursion and isolates sync, async, and predicate errors', async () => {
    const { events, pointer, reports } = setup();
    const once = vi.fn(() => pointer('click', 'a'));
    events.once('click', once);
    pointer('click', 'a');
    expect(once).toHaveBeenCalledOnce();
    const calls: string[] = [];
    events.on('click', vi.fn(), {
      selector: {
        predicate: (): boolean => {
          throw new Error('predicate');
        }
      }
    });
    events.on('click', () => {
      calls.push('sync');
      throw new Error('sync');
    });
    events.on('click', (() => {
      calls.push('async');
      return Promise.reject(new Error('async'));
    }) as () => void);
    events.on('click', () => calls.push('later'));
    expect(() => pointer('click', 'a')).not.toThrow();
    await Promise.resolve();
    expect(calls).toEqual(['sync', 'async', 'later']);
    expect(reports.mock.calls.map(([error]) => (error as Error).message)).toEqual(['predicate', 'sync', 'async']);
  });

  it('supports once and disposer cancellation independently for click and rightclick', () => {
    const { events, pointer } = setup();
    const onceClick = vi.fn();
    const cancelledClick = vi.fn();
    const onceRight = vi.fn();
    const cancelledRight = vi.fn();
    events.once('click', onceClick);
    const cancelClick = events.once('click', cancelledClick);
    events.once('rightclick', onceRight);
    const cancelRight = events.once('rightclick', cancelledRight);
    cancelClick();
    cancelRight();

    pointer('click');
    pointer('click');
    pointer('rightclick');
    pointer('rightclick');
    expect(onceClick).toHaveBeenCalledOnce();
    expect(cancelledClick).not.toHaveBeenCalled();
    expect(onceRight).toHaveBeenCalledOnce();
    expect(cancelledRight).not.toHaveBeenCalled();
  });

  it('supports global/module state and exact module cleanup while rejecting scoped keydown', () => {
    const { events, pointer } = setup();
    const global = vi.fn();
    const moduleClick = vi.fn();
    const selectorOnly = vi.fn();
    events.on('click', global);
    events.on('click', moduleClick, { module: 'shared' });
    events.on('click', selectorOnly, { selector: { module: 'shared' } });
    events.on('pointermove', vi.fn(), { module: 'shared' });
    expect(events.has('click')).toBe(true);
    expect(events.has('click', 'shared')).toBe(true);
    expect(events.has('pointermove')).toBe(false);
    events.clearModule('shared', 'click');
    pointer('click', 'a');
    expect(global).toHaveBeenCalledOnce();
    expect(moduleClick).not.toHaveBeenCalled();
    expect(selectorOnly).toHaveBeenCalledOnce();
    events.clearModule('shared');
    expect(events.has('pointermove', 'shared')).toBe(false);
    expect(() => events.on('keydown', vi.fn(), { module: 'shared' })).toThrow();
    expect(() => events.once('keydown', vi.fn(), { selector: { id: 'a' } })).toThrow();
  });

  it('emits hover transitions and prevents recursive leave from installing stale enter state', () => {
    const { events, pointer } = setup();
    const global: string[] = [];
    const scoped: string[] = [];
    let recurseOnSwap = false;
    events.on('pointermove', (event) => global.push(`${event.phase}:${event.element?.id ?? '-'}`));
    events.on(
      'pointermove',
      (event) => {
        scoped.push(`${event.phase}:${event.element?.id ?? '-'}`);
        if (recurseOnSwap && event.phase === 'leave' && event.element?.id === 'a') {
          recurseOnSwap = false;
          pointer('pointermove');
        }
      },
      { module: 'shared' }
    );
    pointer('pointermove');
    pointer('pointermove', 'a');
    pointer('pointermove', 'a');
    pointer('pointermove');
    pointer('pointermove', 'a');
    recurseOnSwap = true;
    pointer('pointermove', 'b');
    pointer('pointermove', 'b');
    expect(global).toEqual(['move:-', 'move:a', 'move:a', 'move:-', 'move:a', 'move:b', 'move:-', 'move:b']);
    expect(scoped).toEqual(['enter:a', 'move:a', 'leave:a', 'enter:a', 'leave:a', 'enter:b']);
  });

  it('invalidates an outer hover route when its selector recursively routes newer input', () => {
    const { events, pointer } = setup();
    const phases: string[] = [];
    let recurse = false;
    events.on('pointermove', (event) => phases.push(`${event.phase}:${event.element?.id}`), {
      selector: {
        predicate(state) {
          if (recurse && state.id === 'a') {
            recurse = false;
            pointer('pointermove', 'b');
          }
          return true;
        }
      }
    });
    pointer('pointermove', 'a');
    recurse = true;
    pointer('pointermove', 'a');

    expect(phases).toEqual(['enter:a', 'leave:a', 'enter:b']);
  });

  it('snapshots ids, respects removals immediately, and destroys idempotently', () => {
    const { events, pointer, port } = setup();
    const calls: string[] = [];
    let added = false;
    let removeSecond: () => void = () => undefined;
    events.on('click', () => {
      calls.push('first');
      removeSecond();
      if (!added) {
        added = true;
        events.on('click', () => calls.push('late'));
      }
    });
    removeSecond = events.on('click', () => calls.push('second'));
    pointer('click');
    pointer('click');
    expect(calls).toEqual(['first', 'first', 'late']);
    events.destroy();
    events.destroy();
    expect(port.listeners.has('click')).toBe(false);
    expect(() => events.on('click', vi.fn())).toThrow(ObjectDisposedError);
    expect(() => events.has('click')).toThrow(ObjectDisposedError);
    expect(() => events.clearModule('shared')).toThrow(ObjectDisposedError);
  });

  it('makes EventService attempt every router disposer when one removal throws', () => {
    class ThrowingDisposePort extends FakeInputPort {
      readonly disposed: InputType[] = [];

      override listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
        const dispose = super.listen(type, listener);
        return () => {
          dispose();
          this.disposed.push(type);
          if (type === 'click') throw new Error('click removal failed');
        };
      }
    }

    const port = new ThrowingDisposePort();
    const router = new InputRouter(port);
    const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
    const events = new EventService(router, store);
    events.on('click', vi.fn());
    events.on('keydown', vi.fn());

    expect(() => events.destroy()).toThrowError('click removal failed');
    expect(port.disposed).toEqual(['click', 'keydown']);
    expect(port.listeners.has('click')).toBe(false);
    expect(port.listeners.has('keydown')).toBe(false);
    router.destroy();
  });

  it('resolves frozen public Element/Layer/native payloads synchronously through EventFacade', () => {
    const { events: internal, port } = setup();
    const refs = new NativeRefRegistry();
    const olFeature = Object.freeze({ feature: 'a' });
    const elementHandle = { id: 'a', olFeature } as unknown as Element;
    const layerHandle = { id: 'layer-a' } as unknown as Layer;
    const elements = { get: (id: string) => (id === 'a' ? elementHandle : undefined) } as unknown as ElementService;
    const layers = { get: (id: string) => (id === 'layer-a' ? layerHandle : undefined) } as unknown as LayerService;
    const facade = new EventFacade(internal, elements, layers, refs);
    const listener = vi.fn();
    facade.on('click', listener, { module: 'shared' });
    const originalEvent = new Event('click');
    const nativeEventRef = refs.registerTransient('input-event', originalEvent);
    try {
      port.emit('click', {
        type: 'click',
        coordinate: [10, 20],
        pixel: [30, 40],
        elementId: 'a',
        nativeEventRef
      });
    } finally {
      refs.releaseTransient('input-event', nativeEventRef);
    }

    expect(listener).toHaveBeenCalledOnce();
    const payload = listener.mock.calls[0][0];
    expect(payload).toMatchObject({
      type: 'click',
      coordinate: [10, 20],
      pixel: [30, 40],
      element: elementHandle,
      module: 'shared',
      layer: layerHandle,
      olFeature
    });
    expect(payload.originalEvent).toBe(originalEvent);
    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload.coordinate)).toBe(true);
    expect(Object.isFrozen(payload.pixel)).toBe(true);
  });

  it('preserves the exact Earth-local keydown event identity through EventFacade', () => {
    const { events: internal, port } = setup();
    const refs = new NativeRefRegistry();
    const facade = new EventFacade(internal, { get: () => undefined } as unknown as ElementService, { get: () => undefined } as unknown as LayerService, refs);
    const listener = vi.fn();
    facade.on('keydown', listener);
    const originalEvent = new Event('keydown') as KeyboardEvent;
    const nativeEventRef = refs.registerTransient('input-event', originalEvent);
    try {
      port.emit('keydown', {
        type: 'keydown',
        key: 'k',
        code: 'KeyK',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: true,
        nativeEventRef
      });
    } finally {
      refs.releaseTransient('input-event', nativeEventRef);
    }

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({ type: 'keydown', key: 'k', code: 'KeyK', shiftKey: true });
    expect(listener.mock.calls[0][0].originalEvent).toBe(originalEvent);
  });

  it('makes Facade AbortSignal registration pre-abort/dispose/abort/once cleanup idempotent', () => {
    const { events: internal, port } = setup();
    const refs = new NativeRefRegistry();
    const facade = new EventFacade(internal, { get: () => undefined } as unknown as ElementService, { get: () => undefined } as unknown as LayerService, refs);
    const preAborted = new AbortController();
    preAborted.abort();
    const skipped = vi.fn();
    facade.on('click', skipped, { signal: preAborted.signal });

    const aborted = new AbortController();
    const removedByAbort = vi.fn();
    facade.on('click', removedByAbort, { signal: aborted.signal });
    aborted.abort();

    const disposed = new AbortController();
    const removeDisposed = vi.spyOn(disposed.signal, 'removeEventListener');
    const dispose = facade.on('click', vi.fn(), { signal: disposed.signal });
    dispose();
    dispose();

    const once = new AbortController();
    const removeOnce = vi.spyOn(once.signal, 'removeEventListener');
    const onceListener = vi.fn();
    facade.once('click', onceListener, { signal: once.signal });
    const reference = refs.registerTransient('input-event', new Event('click'));
    try {
      port.emit('click', { type: 'click', coordinate: [1, 2], pixel: [3, 4], nativeEventRef: reference });
    } finally {
      refs.releaseTransient('input-event', reference);
    }

    expect(skipped).not.toHaveBeenCalled();
    expect(removedByAbort).not.toHaveBeenCalled();
    expect(onceListener).toHaveBeenCalledOnce();
    expect(removeDisposed).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(removeOnce).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('finalizes AbortSignal listeners on module cleanup and Facade destruction', () => {
    const { events: internal } = setup();
    const facade = new EventFacade(
      internal,
      { get: () => undefined } as unknown as ElementService,
      { get: () => undefined } as unknown as LayerService,
      new NativeRefRegistry()
    );
    const moduleSignal = new AbortController();
    const globalSignal = new AbortController();
    const removeModule = vi.spyOn(moduleSignal.signal, 'removeEventListener');
    const removeGlobal = vi.spyOn(globalSignal.signal, 'removeEventListener');
    facade.on('click', vi.fn(), { module: 'shared', signal: moduleSignal.signal });
    facade.on('click', vi.fn(), { signal: globalSignal.signal });

    facade.clearModule('shared');
    expect(removeModule).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(removeGlobal).not.toHaveBeenCalled();
    facade.destroy();
    facade.destroy();
    expect(removeGlobal).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(() => facade.on('click', vi.fn())).toThrow(ObjectDisposedError);
  });

  it('makes Facade destruction attempt subscription and service cleanup after earlier finalizers throw', () => {
    const internalDispose = vi.fn(() => {
      throw new Error('internal disposal failed');
    });
    const serviceDestroy = vi.fn();
    const internal = {
      on: vi.fn(() => internalDispose),
      once: vi.fn(() => internalDispose),
      has: vi.fn(() => false),
      clearModule: vi.fn(),
      destroy: serviceDestroy
    } as unknown as ConstructorParameters<typeof EventFacade>[0];
    const signal = new AbortController();
    vi.spyOn(signal.signal, 'removeEventListener').mockImplementation(() => {
      throw new Error('abort removal failed');
    });
    const facade = new EventFacade(
      internal,
      { get: () => undefined } as unknown as ElementService,
      { get: () => undefined } as unknown as LayerService,
      new NativeRefRegistry()
    );
    facade.on('click', vi.fn(), { signal: signal.signal });

    expect(() => facade.destroy()).toThrowError('abort removal failed');
    expect(internalDispose).toHaveBeenCalledOnce();
    expect(serviceDestroy).toHaveBeenCalledOnce();
  });
});
