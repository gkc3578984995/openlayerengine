import type OlMap from 'ol/Map.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputAdapter } from '../src/adapters/openlayers/InputAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import type { Pixel } from '../src/core/common/types.js';
import type { HitTestPort } from '../src/core/ports/HitTestPort.js';
import type { InputEventMap, InputType } from '../src/core/ports/InputPort.js';
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

  emit(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  getTargetElement(): HTMLElement | null {
    return this.target as unknown as HTMLElement;
  }

  getViewport(): HTMLElement {
    return this.viewport as unknown as HTMLElement;
  }

  getEventPixel(event: Event): [number, number] {
    const pointer = event as Event & { clientX?: number; clientY?: number };
    return [pointer.clientX ?? 0, pointer.clientY ?? 0];
  }

  getCoordinateFromPixel(pixel: number[]): [number, number] {
    return [pixel[0] + 100, pixel[1] + 200];
  }
}

class FakeHitTest implements HitTestPort {
  atPixel(pixel: Pixel): { readonly elementId: string; readonly layerId: string } | undefined {
    return { elementId: `element-${pixel[0]}`, layerId: 'layer' };
  }

  getScreenExtent(): undefined {
    return undefined;
  }
}

function eventWith(type: string, fields: Readonly<Record<string, unknown>> = {}, cancelable = false): Event {
  const event = new Event(type, { cancelable });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { configurable: true, enumerable: true, value });
  return event;
}

const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

afterEach(() => {
  if (originalDocumentDescriptor === undefined) Reflect.deleteProperty(globalThis, 'document');
  else Object.defineProperty(globalThis, 'document', originalDocumentDescriptor);
});

describe('multi-Earth input isolation', () => {
  coversCapabilities(
    'event-global-move',
    'event-global-click',
    'event-global-key-down',
    'event-global-right-click',
    'earth-browser-contextmenu-suppression',
    'contextmenu-browser-default-suppression'
  );

  it('isolates map, viewport, keyboard target, registry, contextmenu, and destroy lifecycles without document listeners', () => {
    const documentTarget = new EventTarget();
    const documentAdd = vi.spyOn(documentTarget, 'addEventListener');
    const documentRemove = vi.spyOn(documentTarget, 'removeEventListener');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentTarget });

    const firstMap = new MapHarness();
    const secondMap = new MapHarness();
    const firstRefs = new NativeRefRegistry();
    const secondRefs = new NativeRefRegistry();
    const firstAdapter = new InputAdapter(firstMap as unknown as OlMap, new FakeHitTest(), firstRefs);
    const secondAdapter = new InputAdapter(secondMap as unknown as OlMap, new FakeHitTest(), secondRefs);
    const firstRouter = new InputRouter(firstAdapter);
    const secondRouter = new InputRouter(secondAdapter);
    const firstEvents: string[] = [];
    const secondEvents: string[] = [];
    const capture = (name: string, refs: NativeRefRegistry, calls: string[]) => (event: InputEventMap[InputType]) => {
      const native = refs.requireTransient<Event>('input-event', event.nativeEventRef);
      calls.push(`${name}:${event.type}:${native.type}`);
    };
    firstRouter.on('pointermove', capture('first', firstRefs, firstEvents));
    firstRouter.on('click', capture('first', firstRefs, firstEvents));
    firstRouter.on('keydown', capture('first', firstRefs, firstEvents));
    firstRouter.on('rightclick', capture('first', firstRefs, firstEvents));
    secondRouter.on('pointermove', capture('second', secondRefs, secondEvents));
    secondRouter.on('click', capture('second', secondRefs, secondEvents));
    secondRouter.on('keydown', capture('second', secondRefs, secondEvents));
    secondRouter.on('rightclick', capture('second', secondRefs, secondEvents));

    firstMap.emit('pointermove', {
      coordinate: [1, 2],
      pixel: [3, 4],
      originalEvent: eventWith('pointermove')
    });
    secondMap.emit('click', { coordinate: [5, 6], pixel: [7, 8], originalEvent: eventWith('click') });
    firstMap.target.dispatchEvent(eventWith('keydown', { key: 'a', code: 'KeyA', repeat: false }));
    secondMap.target.dispatchEvent(eventWith('keydown', { key: 'b', code: 'KeyB', repeat: true }));
    const firstContext = eventWith('contextmenu', { clientX: 9, clientY: 10 }, true);
    const secondContext = eventWith('contextmenu', { clientX: 11, clientY: 12 }, true);
    firstMap.viewport.dispatchEvent(firstContext);
    secondMap.viewport.dispatchEvent(secondContext);

    expect(firstEvents).toEqual(['first:pointermove:pointermove', 'first:keydown:keydown', 'first:rightclick:contextmenu']);
    expect(secondEvents).toEqual(['second:click:click', 'second:rightclick:contextmenu']);
    expect(firstContext.defaultPrevented).toBe(true);
    expect(secondContext.defaultPrevented).toBe(true);
    expect(firstRefs.activeTransientCount).toBe(0);
    expect(secondRefs.activeTransientCount).toBe(0);
    expect(documentAdd).not.toHaveBeenCalled();
    expect(documentRemove).not.toHaveBeenCalled();

    firstRouter.destroy();
    firstAdapter.destroy();
    firstRefs.destroy();
    firstMap.emit('click', { coordinate: [0, 0], pixel: [0, 0], originalEvent: eventWith('click') });
    const destroyedContext = eventWith('contextmenu', {}, true);
    firstMap.viewport.dispatchEvent(destroyedContext);
    secondMap.emit('click', { coordinate: [0, 0], pixel: [0, 0], originalEvent: eventWith('click') });

    expect(firstEvents).toHaveLength(3);
    expect(secondEvents.at(-1)).toBe('second:click:click');
    expect(destroyedContext.defaultPrevented).toBe(false);
  });

  it('maps every native source, filters non-primary/repeated input, and freezes copied geometry', () => {
    const map = new MapHarness();
    const refs = new NativeRefRegistry();
    const adapter = new InputAdapter(map as unknown as OlMap, new FakeHitTest(), refs);
    const router = new InputRouter(adapter);
    const received: InputEventMap[InputType][] = [];
    for (const type of ['pointermove', 'click', 'leftdown', 'leftup', 'doubleclick', 'keydown'] as const) {
      router.on(type, (event) => received.push(event));
    }

    const coordinate = [1, 2];
    const pixel = [3, 4];
    map.emit('pointermove', { coordinate, pixel, originalEvent: eventWith('pointermove') });
    map.emit('click', { coordinate: [5, 6], pixel: [7, 8], originalEvent: eventWith('click') });
    map.emit('dblclick', { coordinate: [9, 10], pixel: [11, 12], originalEvent: eventWith('dblclick') });
    map.viewport.dispatchEvent(eventWith('pointerdown', { button: 2, clientX: 1, clientY: 2 }));
    map.viewport.dispatchEvent(eventWith('pointerdown', { button: 0, clientX: 13, clientY: 14 }));
    map.viewport.dispatchEvent(eventWith('pointerup', { button: 0, clientX: 15, clientY: 16 }));
    map.target.dispatchEvent(eventWith('keydown', { key: 'x', code: 'KeyX', repeat: true }));
    map.target.dispatchEvent(eventWith('keydown', { key: 'y', code: 'KeyY', repeat: false, ctrlKey: true }));
    coordinate[0] = 99;
    pixel[0] = 99;

    expect(received.map(({ type }) => type)).toEqual(['pointermove', 'click', 'doubleclick', 'leftdown', 'leftup', 'keydown']);
    expect(received[0]).toMatchObject({ coordinate: [1, 2], pixel: [3, 4], elementId: 'element-3' });
    expect(Object.isFrozen((received[0] as InputEventMap['pointermove']).coordinate)).toBe(true);
    expect(Object.isFrozen((received[0] as InputEventMap['pointermove']).pixel)).toBe(true);
    expect(received.at(-1)).toMatchObject({ key: 'y', code: 'KeyY', ctrlKey: true });
    expect(refs.activeTransientCount).toBe(0);
  });

  it('orders rightclick suppression before arbitration without stopping DOM propagation', () => {
    const map = new MapHarness();
    const refs = new NativeRefRegistry();
    const adapter = new InputAdapter(map as unknown as OlMap, new FakeHitTest(), refs);
    const router = new InputRouter(adapter);
    const order: string[] = [];
    const disposeArbiter = router.setContextMenuArbiter(() => {
      order.push('arbiter-consume');
      expect(refs.activeTransientCount).toBe(1);
      return 'consume';
    });
    router.on('rightclick', () => order.push('library'));
    map.viewport.addEventListener('contextmenu', () => order.push('dom-later'));

    const consumed = eventWith('contextmenu', { clientX: 1, clientY: 2 }, true);
    const nativePrevent = consumed.preventDefault.bind(consumed);
    const prevent = vi.spyOn(consumed, 'preventDefault').mockImplementation(() => {
      order.push('preventDefault');
      nativePrevent();
    });
    const stop = vi.spyOn(consumed, 'stopPropagation');
    const stopImmediate = vi.spyOn(consumed, 'stopImmediatePropagation');
    map.viewport.dispatchEvent(consumed);
    expect(order).toEqual(['preventDefault', 'arbiter-consume', 'dom-later']);
    expect(consumed.defaultPrevented).toBe(true);
    expect(prevent).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    expect(stopImmediate).not.toHaveBeenCalled();
    expect(refs.activeTransientCount).toBe(0);

    disposeArbiter();
    router.setContextMenuArbiter(() => {
      order.push('arbiter-pass');
      return 'pass';
    });
    order.length = 0;
    const passed = eventWith('contextmenu', { clientX: 3, clientY: 4 }, true);
    const passedPrevent = passed.preventDefault.bind(passed);
    vi.spyOn(passed, 'preventDefault').mockImplementation(() => {
      order.push('preventDefault');
      passedPrevent();
    });
    map.viewport.dispatchEvent(passed);
    expect(order).toEqual(['preventDefault', 'arbiter-pass', 'library', 'dom-later']);
    expect(passed.defaultPrevented).toBe(true);
    expect(refs.activeTransientCount).toBe(0);
  });

  it('捕获阶段屏蔽右键，使 viewport 子节点可停止业务路由但不会恢复浏览器菜单', () => {
    const map = new MapHarness();
    const add = vi.spyOn(map.viewport, 'addEventListener');
    const remove = vi.spyOn(map.viewport, 'removeEventListener');
    const adapter = new InputAdapter(map as unknown as OlMap, new FakeHitTest(), new NativeRefRegistry());
    const router = new InputRouter(adapter);
    const routed = vi.fn();
    router.on('rightclick', routed);

    const registrations = add.mock.calls.filter(([type]) => type === 'contextmenu');
    expect(registrations).toHaveLength(2);
    const captureRegistration = registrations.find(([, , options]) => options === true || (typeof options === 'object' && options?.capture === true));
    const capture = captureRegistration?.[1];
    expect(capture).toBeTypeOf('function');

    const event = eventWith('contextmenu', { clientX: 1, clientY: 2 }, true);
    if (typeof capture === 'function') capture.call(map.viewport, event);

    expect(event.defaultPrevented).toBe(true);
    expect(routed).not.toHaveBeenCalled();

    router.destroy();
    adapter.destroy();
    expect(
      remove.mock.calls.some(
        ([type, listener, options]) =>
          type === 'contextmenu' && listener === capture && (options === true || (typeof options === 'object' && options?.capture === true))
      )
    ).toBe(true);
  });

  it('uses the viewport as the Earth-local keydown fallback when the map target is detached', () => {
    const map = new MapHarness();
    vi.spyOn(map, 'getTargetElement').mockReturnValue(null);
    const adapter = new InputAdapter(map as unknown as OlMap, new FakeHitTest(), new NativeRefRegistry());
    const router = new InputRouter(adapter);
    const keydown = vi.fn();
    router.on('keydown', keydown);

    map.target.dispatchEvent(eventWith('keydown', { key: 'target', code: 'KeyT', repeat: false }));
    map.viewport.dispatchEvent(eventWith('keydown', { key: 'viewport', code: 'KeyV', repeat: false }));
    expect(keydown).toHaveBeenCalledOnce();
    expect(keydown.mock.calls[0][0]).toMatchObject({ key: 'viewport', code: 'KeyV' });
    router.destroy();
    adapter.destroy();
  });
});
