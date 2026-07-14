import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { createTransientNativeRef } from '../src/core/native/types.js';
import type { InputEventMap, InputPort, InputType } from '../src/core/ports/InputPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { EventService } from '../src/services/events/EventService.js';
import { InputRouter } from '../src/services/events/InputRouter.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

type InputListener = (event: InputEventMap[InputType]) => void;

class FakeInputPort implements InputPort {
  readonly listeners = new Map<InputType, InputListener>();

  listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
    this.listeners.set(type, listener as InputListener);
    return () => this.listeners.delete(type);
  }

  emit<T extends InputType>(type: T, event: InputEventMap[T]): void {
    this.listeners.get(type)?.(event);
  }
}

describe('EventService 一次性右键监听回归', () => {
  coversCapabilities('event-once-right-click', 'event-once-right-click-cancelable', 'event-listener-disposer');

  it('取消一次性右键订阅后不再调用回调', () => {
    const port = new FakeInputPort();
    const router = new InputRouter(port);
    const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
    const events = new EventService(router, store, vi.fn());
    const callback = vi.fn();

    const cancel = events.once('rightclick', callback);
    expect(events.has('rightclick')).toBe(true);
    cancel();
    cancel();
    expect(events.has('rightclick')).toBe(false);

    port.emit('rightclick', {
      type: 'rightclick',
      coordinate: Object.freeze([120, 30]),
      pixel: Object.freeze([12, 24]),
      nativeEventRef: createTransientNativeRef('input-event')
    });

    expect(callback).not.toHaveBeenCalled();
    expect(port.listeners.has('rightclick')).toBe(true);

    events.destroy();
    router.destroy();
  });
});
