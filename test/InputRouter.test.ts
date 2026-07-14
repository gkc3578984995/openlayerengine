import type OlMap from 'ol/Map.js';
import { describe, expect, it, vi } from 'vitest';
import { InputAdapter } from '../src/adapters/openlayers/InputAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { ObjectDisposedError } from '../src/core/errors.js';
import { createTransientNativeRef } from '../src/core/native/types.js';
import type { HitTestPort } from '../src/core/ports/HitTestPort.js';
import type { InputEventMap, InputPort, InputType } from '../src/core/ports/InputPort.js';
import { InputRouter } from '../src/services/events/InputRouter.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

type InputListener = (event: InputEventMap[InputType]) => void;

class FakeInputPort implements InputPort {
  readonly listenCounts = new Map<InputType, number>();
  readonly disposeCounts = new Map<InputType, number>();
  readonly listeners = new Map<InputType, InputListener>();

  listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
    this.listenCounts.set(type, (this.listenCounts.get(type) ?? 0) + 1);
    if (this.listeners.has(type)) throw new Error(`duplicate port listener: ${type}`);
    this.listeners.set(type, listener as InputListener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.disposeCounts.set(type, (this.disposeCounts.get(type) ?? 0) + 1);
      this.listeners.delete(type);
    };
  }

  emit<T extends InputType>(type: T, event: InputEventMap[T]): void {
    this.listeners.get(type)?.(event);
  }
}

const eventRef = createTransientNativeRef('input-event');
const pointer = <T extends Exclude<InputType, 'keydown'>>(type: T): InputEventMap[T] =>
  Object.freeze({
    type,
    coordinate: Object.freeze([1, 2]),
    pixel: Object.freeze([3, 4]),
    elementId: 'element',
    nativeEventRef: eventRef
  }) as unknown as InputEventMap[T];
const keydown = Object.freeze({
  type: 'keydown',
  key: 'Enter',
  code: 'Enter',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  nativeEventRef: eventRef
}) satisfies InputEventMap['keydown'];

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

  emit(type: string, originalEvent: Event): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ coordinate: [1, 2], pixel: [3, 4], originalEvent });
    }
  }

  getTargetElement(): HTMLElement {
    return this.target as unknown as HTMLElement;
  }

  getViewport(): HTMLElement {
    return this.viewport as unknown as HTMLElement;
  }

  getEventPixel(event: Event): [number, number] {
    const pointerEvent = event as Event & { clientX?: number; clientY?: number };
    return [pointerEvent.clientX ?? 0, pointerEvent.clientY ?? 0];
  }

  getCoordinateFromPixel(pixel: number[]): [number, number] {
    return [pixel[0] + 10, pixel[1] + 20];
  }
}

function nativeEvent(type: string, fields: Readonly<Record<string, unknown>> = {}, cancelable = false): Event {
  const event = new Event(type, { cancelable });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { configurable: true, value });
  return event;
}

describe('InputRouter', () => {
  coversCapabilities(
    'earth-default-interaction-policy',
    'earth-browser-contextmenu-suppression',
    'contextmenu-browser-default-suppression',
    'event-listener-auto-enable',
    'event-listener-disposer',
    'event-manual-enable-disable'
  );

  it('installs rightclick immediately and multiplexes every input type through one port listener', () => {
    const port = new FakeInputPort();
    const router = new InputRouter(port);
    expect(port.listenCounts.get('rightclick')).toBe(1);

    const types = ['pointermove', 'click', 'leftdown', 'leftup', 'doubleclick', 'rightclick', 'keydown'] as const;
    for (const type of types) {
      const first = vi.fn();
      const second = vi.fn();
      const disposeFirst = router.on(type, first);
      const disposeSecond = router.on(type, second);
      expect(port.listenCounts.get(type)).toBe(1);

      if (type === 'keydown') port.emit(type, keydown);
      else port.emit(type, pointer(type));
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);

      disposeFirst();
      disposeFirst();
      expect(port.listeners.has(type)).toBe(true);
      disposeSecond();
      if (type === 'rightclick') expect(port.listeners.has(type)).toBe(true);
      else expect(port.listeners.has(type)).toBe(false);
    }
  });

  it('arbitrates rightclick before library listeners and stops only library routing on consume', () => {
    const port = new FakeInputPort();
    const router = new InputRouter(port);
    const order: string[] = [];
    const listener = vi.fn(() => order.push('event'));
    router.on('rightclick', listener);
    const disposeArbiter = router.setContextMenuArbiter(() => {
      order.push('coordinator');
      return 'consume';
    });

    order.push('preventDefault');
    port.emit('rightclick', pointer('rightclick'));
    expect(order).toEqual(['preventDefault', 'coordinator']);
    expect(listener).not.toHaveBeenCalled();

    disposeArbiter();
    router.setContextMenuArbiter(() => {
      order.push('coordinator-pass');
      return 'pass';
    });
    order.length = 0;
    order.push('preventDefault');
    port.emit('rightclick', pointer('rightclick'));
    expect(order).toEqual(['preventDefault', 'coordinator-pass', 'event']);
  });

  it('snapshots rightclick listeners before arbitration so arbiter additions wait for the next event', () => {
    const port = new FakeInputPort();
    const router = new InputRouter(port);
    const calls: string[] = [];
    let added = false;
    router.on('rightclick', () => calls.push('existing'));
    router.setContextMenuArbiter(() => {
      if (!added) {
        added = true;
        router.on('rightclick', () => calls.push('added'));
      }
      return 'pass';
    });

    port.emit('rightclick', pointer('rightclick'));
    expect(calls).toEqual(['existing']);
    port.emit('rightclick', pointer('rightclick'));
    expect(calls).toEqual(['existing', 'existing', 'added']);
  });

  it('uses dispatch snapshots, rejects duplicate arbiters, and destroys idempotently', () => {
    const port = new FakeInputPort();
    const router = new InputRouter(port);
    const calls: string[] = [];
    let disposeSecond: () => void = () => undefined;
    router.on('click', () => {
      calls.push('first');
      disposeSecond();
      router.on('click', () => calls.push('late'));
    });
    disposeSecond = router.on('click', () => calls.push('second'));
    router.setContextMenuArbiter(() => 'pass');
    expect(() => router.setContextMenuArbiter(() => 'pass')).toThrow();

    port.emit('click', pointer('click'));
    expect(calls).toEqual(['first']);
    port.emit('click', pointer('click'));
    expect(calls).toEqual(['first', 'first', 'late']);

    router.destroy();
    router.destroy();
    expect(port.disposeCounts.get('rightclick')).toBe(1);
    expect(port.listeners.size).toBe(0);
    expect(() => router.on('click', () => undefined)).toThrow(ObjectDisposedError);
  });

  it('rolls back a subscription when the first port listener installation fails', () => {
    class FailingPort extends FakeInputPort {
      failClick = true;

      override listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
        if (type === 'click' && this.failClick) throw new Error('install failed');
        return super.listen(type, listener);
      }
    }

    const port = new FailingPort();
    const router = new InputRouter(port);
    const failed = vi.fn();
    expect(() => router.on('click', failed)).toThrowError('install failed');
    port.failClick = false;
    const installed = vi.fn();
    router.on('click', installed);
    port.emit('click', pointer('click'));

    expect(failed).not.toHaveBeenCalled();
    expect(installed).toHaveBeenCalledOnce();
  });

  it('stops the current dispatch after destroy and attempts every port disposer even when one throws', () => {
    class ThrowingDisposePort extends FakeInputPort {
      override listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
        const dispose = super.listen(type, listener);
        return () => {
          dispose();
          if (type === 'click') throw new Error('click dispose failed');
        };
      }
    }

    const port = new ThrowingDisposePort();
    const router = new InputRouter(port);
    const calls: string[] = [];
    router.on('click', () => {
      calls.push('first');
      expect(() => router.destroy()).toThrowError('click dispose failed');
    });
    router.on('click', () => calls.push('second'));
    router.on('keydown', vi.fn());

    port.emit('click', pointer('click'));
    expect(calls).toEqual(['first']);
    expect(port.disposeCounts.get('rightclick')).toBe(1);
    expect(port.disposeCounts.get('click')).toBe(1);
    expect(port.disposeCounts.get('keydown')).toBe(1);
    expect(port.listeners.size).toBe(0);
  });

  it('maps all native sources, filters non-left/repeated input, prevents context default first, and never stops propagation', () => {
    const map = new MapHarness();
    const refs = new NativeRefRegistry();
    const hitTest: HitTestPort = {
      atPixel: ([x]) => ({ elementId: `element-${x}`, layerId: 'layer' }),
      getScreenExtent: () => undefined
    };
    const adapter = new InputAdapter(map as unknown as OlMap, hitTest, refs);
    const router = new InputRouter(adapter);
    const received: string[] = [];
    for (const type of ['pointermove', 'click', 'doubleclick', 'leftdown', 'leftup', 'rightclick', 'keydown'] as const) {
      router.on(type, (event) => {
        const native = refs.requireTransient<Event>('input-event', event.nativeEventRef);
        received.push(`${event.type}:${native.type}:${native.defaultPrevented}`);
      });
    }

    map.emit('pointermove', nativeEvent('pointermove'));
    map.emit('click', nativeEvent('click'));
    map.emit('dblclick', nativeEvent('dblclick'));
    map.viewport.dispatchEvent(nativeEvent('pointerdown', { button: 1, clientX: 5, clientY: 6 }));
    map.viewport.dispatchEvent(nativeEvent('pointerdown', { button: 0, clientX: 5, clientY: 6 }));
    map.viewport.dispatchEvent(nativeEvent('pointerup', { button: 0, clientX: 7, clientY: 8 }));
    const contextmenu = nativeEvent('contextmenu', { clientX: 9, clientY: 10 }, true);
    const stopPropagation = vi.spyOn(contextmenu, 'stopPropagation');
    const stopImmediatePropagation = vi.spyOn(contextmenu, 'stopImmediatePropagation');
    map.viewport.dispatchEvent(contextmenu);
    map.target.dispatchEvent(nativeEvent('keydown', { key: 'x', code: 'KeyX', repeat: true }));
    map.target.dispatchEvent(nativeEvent('keydown', { key: 'x', code: 'KeyX', repeat: false }));

    expect(received).toEqual([
      'pointermove:pointermove:false',
      'click:click:false',
      'doubleclick:dblclick:false',
      'leftdown:pointerdown:false',
      'leftup:pointerup:false',
      'rightclick:contextmenu:true',
      'keydown:keydown:false'
    ]);
    expect(contextmenu.defaultPrevented).toBe(true);
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
    expect(refs.activeTransientCount).toBe(0);
    router.destroy();
    adapter.destroy();
  });

  it('makes InputAdapter attempt every native disposer when one removal throws', () => {
    const map = new MapHarness();
    const nativeUn = map.un.bind(map);
    const un = vi.spyOn(map, 'un').mockImplementation((type, listener) => {
      nativeUn(type, listener);
      if (type === 'pointermove') throw new Error('pointermove removal failed');
    });
    const removeTarget = vi.spyOn(map.target, 'removeEventListener');
    const removeViewport = vi.spyOn(map.viewport, 'removeEventListener');
    const adapter = new InputAdapter(map as unknown as OlMap, { atPixel: () => undefined, getScreenExtent: () => undefined }, new NativeRefRegistry());
    adapter.listen('pointermove', vi.fn());
    adapter.listen('click', vi.fn());
    adapter.listen('keydown', vi.fn());
    adapter.listen('rightclick', vi.fn());

    expect(() => adapter.destroy()).toThrowError('pointermove removal failed');
    expect(un.mock.calls.map(([type]) => type)).toEqual(['pointermove', 'click']);
    expect(removeTarget).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeViewport).toHaveBeenCalledWith('contextmenu', expect.any(Function));
  });

  it('rolls back both contextmenu listeners when the second native installation fails', () => {
    const map = new MapHarness();
    const nativeAdd = map.viewport.addEventListener.bind(map.viewport);
    const nativeRemove = map.viewport.removeEventListener.bind(map.viewport);
    let contextMenuAdds = 0;
    vi.spyOn(map.viewport, 'addEventListener').mockImplementation((type, listener, options) => {
      nativeAdd(type, listener, options);
      if (type === 'contextmenu' && ++contextMenuAdds === 2) throw new Error('contextmenu route installation failed');
    });
    const remove = vi.spyOn(map.viewport, 'removeEventListener').mockImplementation((type, listener, options) => nativeRemove(type, listener, options));
    const routed = vi.fn();
    const adapter = new InputAdapter(map as unknown as OlMap, { atPixel: () => undefined, getScreenExtent: () => undefined }, new NativeRefRegistry());

    expect(() => adapter.listen('rightclick', routed)).toThrowError('contextmenu route installation failed');

    const event = nativeEvent('contextmenu', { clientX: 4, clientY: 5 }, true);
    map.viewport.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(routed).not.toHaveBeenCalled();
    expect(remove.mock.calls.filter(([type]) => type === 'contextmenu')).toHaveLength(2);
    adapter.destroy();
  });
});
