import type Map from 'ol/Map.js';
import { describe, expect, it } from 'vitest';
import { PrintBoxSelectionAdapter } from '../src/adapters/openlayers/PrintBoxSelectionAdapter.js';
import { CapabilityError } from '../src/core/errors.js';
import type { CursorPort } from '../src/core/ports/CursorPort.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';

describe('PrintBoxSelectionAdapter', () => {
  it('blocks a fixed-scale box that cannot fit without changing its requested scale', () => {
    const viewport = { clientWidth: 640, clientHeight: 480 } as HTMLElement;
    const adapter = new PrintBoxSelectionAdapter({} as Map, viewport, {} as InteractionCoordinator, {} as CursorPort);

    expect(() =>
      adapter.select({
        aspectRatio: 2,
        fixedSizeCssPixels: [800, 400]
      })
    ).toThrowError(CapabilityError);
  });

  it('rolls back the overlay and coordinator when CursorPort.open fails', async () => {
    const created: FakeElement[] = [];
    const fakeDocument = {
      createElement: () => {
        const element = new FakeElement();
        created.push(element);
        return element;
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    };
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
    try {
      const viewport = new FakeViewport();
      const coordinator = new InteractionCoordinator();
      const failure = new Error('cursor open failed');
      let failOpen = true;
      const cursor = {
        open: () => {
          if (failOpen) throw failure;
          return { set: () => undefined, reset: () => undefined, destroy: () => undefined };
        }
      } as CursorPort;
      const adapter = new PrintBoxSelectionAdapter({} as Map, viewport as unknown as HTMLElement, coordinator, cursor);

      expect(() => adapter.select({ aspectRatio: 2 })).toThrow(failure);
      expect(coordinator.active).toBeUndefined();
      expect(created[0]?.removed).toBe(true);

      failOpen = false;
      const nextSelection = adapter.select({ aspectRatio: 2 });
      expect(coordinator.active).toBeDefined();
      adapter.cancel();
      await expect(nextSelection).rejects.toMatchObject({ code: 'cancelled' });
      expect(coordinator.active).toBeUndefined();
      adapter.destroy();
    } finally {
      if (previousDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
      else Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    }
  });
});

class FakeElement {
  className = '';
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  removed = false;

  setAttribute(): void {}

  append(child: FakeElement): void {
    this.children.push(child);
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeViewport extends FakeElement {
  readonly clientWidth = 640;
  readonly clientHeight = 480;

  addEventListener(): void {}

  removeEventListener(): void {}
}
