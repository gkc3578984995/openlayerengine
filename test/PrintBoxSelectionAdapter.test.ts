import type Map from 'ol/Map.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
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

  it('keeps the fit source box under the pointer and shows the expanded print frame separately', async () => {
    await withFakeDocument(async () => {
      const viewport = new FakeViewport();
      const coordinator = new InteractionCoordinator();
      const onChange = vi.fn();
      const cursorHandle = { set: vi.fn(), reset: vi.fn(), destroy: vi.fn() };
      const adapter = new PrintBoxSelectionAdapter(fakeMap(), viewport as unknown as HTMLElement, coordinator, {
        open: () => cursorHandle
      } as unknown as CursorPort);

      const selection = adapter.select({ aspectRatio: 2, onChange });
      viewport.dispatch('pointerdown', pointer(100, 100));
      viewport.dispatch('pointermove', pointer(180, 160));
      viewport.dispatch('pointermove', pointer(190, 170));
      viewport.dispatch('pointerup', pointer(200, 200));
      const result = await selection;

      const root = viewport.children[0]!;
      const sourceBox = root.children.find((child) => child.className === 'ol-print-selection-box')!;
      const outputBox = root.children.find((child) => child.className === 'ol-print-selection-output')!;
      const leftMask = root.children.find((child) => child.className.endsWith('--left'))!;
      expect(sourceBox.style).toMatchObject({ left: '100px', top: '100px', width: '100px', height: '100px' });
      expect(outputBox.style).toMatchObject({ left: '50px', top: '100px', width: '200px', height: '100px' });
      expect(leftMask.style.width).toBe('50px');
      expect(result.sourceExtent).toEqual([100, 280, 200, 380]);
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenLastCalledWith(result);
      expect(root.removed).toBe(true);
      expect(cursorHandle.destroy).toHaveBeenCalledOnce();
      expect(coordinator.active).toBeUndefined();
      adapter.destroy();
    });
  });

  it('lets a fixed-size frame follow the pointer before a click places its center', async () => {
    vi.useFakeTimers();
    try {
      await withFakeDocument(async () => {
        const viewport = new FakeViewport();
        const onChange = vi.fn();
        const adapter = new PrintBoxSelectionAdapter(fakeMap(), viewport as unknown as HTMLElement, new InteractionCoordinator(), fakeCursor());

        const selection = adapter.select({ aspectRatio: 2, fixedSizeCssPixels: [100, 50], onChange });
        viewport.dispatch('pointermove', pointer(300, 200, 7));
        await vi.advanceTimersByTimeAsync(16);
        const root = viewport.children[0]!;
        const sourceBox = root.children.find((child) => child.className === 'ol-print-selection-box')!;
        expect(sourceBox.style).toMatchObject({ left: '250px', top: '175px', width: '100px', height: '50px' });
        expect(onChange).toHaveBeenCalledOnce();

        viewport.dispatch('pointerdown', pointer(320, 220, 7));
        viewport.dispatch('pointerup', pointer(320, 220, 7));
        const result = await selection;

        expect(result.center).toEqual([320, 260]);
        expect(result.sourceExtent).toEqual([270, 235, 370, 285]);
        expect(root.removed).toBe(true);
        adapter.destroy();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the pointer as the fixed frame center at the viewport edge', async () => {
    await withFakeDocument(async () => {
      const viewport = new FakeViewport();
      const adapter = new PrintBoxSelectionAdapter(fakeMap(), viewport as unknown as HTMLElement, new InteractionCoordinator(), fakeCursor());

      const selection = adapter.select({ aspectRatio: 2, fixedSizeCssPixels: [100, 50] });
      viewport.dispatch('pointerdown', pointer(0, 0));
      viewport.dispatch('pointerup', pointer(0, 0));
      const result = await selection;

      expect(result.center).toEqual([0, 480]);
      expect(result.sourceExtent).toEqual([-50, 455, 50, 505]);
      adapter.destroy();
    });
  });

  it('allows a sub-pixel fixed frame to be placed by clicking its center', async () => {
    await withFakeDocument(async () => {
      const viewport = new FakeViewport();
      const onChange = vi.fn();
      const adapter = new PrintBoxSelectionAdapter(fakeMap(), viewport as unknown as HTMLElement, new InteractionCoordinator(), fakeCursor());

      const selection = adapter.select({ aspectRatio: 2, fixedSizeCssPixels: [1, 0.5], onChange });
      viewport.dispatch('pointerdown', pointer(320, 240));
      viewport.dispatch('pointerup', pointer(320, 240));
      const result = await selection;

      expect(result.center).toEqual([320, 240]);
      expect(result.sourceExtent).toEqual([319.5, 239.75, 320.5, 240.25]);
      expect(onChange).toHaveBeenCalled();
      adapter.destroy();
    });
  });

  it('ignores the dialog splitter while a box selection is active', async () => {
    await withFakeDocument(async () => {
      const viewport = new FakeViewport();
      const adapter = new PrintBoxSelectionAdapter(fakeMap(), viewport as unknown as HTMLElement, new InteractionCoordinator(), fakeCursor());
      const splitter = new FakeElement('ol-print-dialog__splitter');

      const selection = adapter.select({ aspectRatio: 2 });
      viewport.dispatch('pointerdown', pointer(300, 200, 1, splitter));
      viewport.dispatch('pointermove', pointer(400, 300, 1, splitter));
      viewport.dispatch('pointerup', pointer(400, 300, 1, splitter));
      expect(viewport.children[0]!.children.find((child) => child.className === 'ol-print-selection-box')!.style.display).toBeUndefined();

      viewport.dispatch('pointerdown', pointer(100, 100, 2));
      viewport.dispatch('pointerup', pointer(200, 200, 2));
      await expect(selection).resolves.toMatchObject({ center: [150, 330] });
      adapter.destroy();
    });
  });

  it('cancels an active selection on pointer cancellation and releases the pending frame', async () => {
    vi.useFakeTimers();
    try {
      await withFakeDocument(async () => {
        const viewport = new FakeViewport();
        const coordinator = new InteractionCoordinator();
        const cursorHandle = { set: vi.fn(), reset: vi.fn(), destroy: vi.fn() };
        const adapter = new PrintBoxSelectionAdapter(fakeMap(), viewport as unknown as HTMLElement, coordinator, {
          open: () => cursorHandle
        } as unknown as CursorPort);

        const selection = adapter.select({ aspectRatio: 2 });
        viewport.dispatch('pointerdown', pointer(100, 100));
        viewport.dispatch('pointermove', pointer(200, 200));
        viewport.dispatch('pointercancel', pointer(200, 200));

        await expect(selection).rejects.toMatchObject({ code: 'cancelled' });
        await vi.advanceTimersByTimeAsync(16);
        expect(viewport.children[0]!.removed).toBe(true);
        expect(cursorHandle.destroy).toHaveBeenCalledOnce();
        expect(coordinator.active).toBeUndefined();
        adapter.destroy();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

class FakeElement {
  className: string;
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  removed = false;

  constructor(className = '') {
    this.className = className;
  }

  setAttribute(): void {}

  closest(selector: string): FakeElement | null {
    return selector
      .split(',')
      .map((part) => part.trim().replace(/^\./, ''))
      .includes(this.className)
      ? this
      : null;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeViewport extends FakeElement {
  readonly clientWidth = 640;
  readonly clientHeight = 480;
  readonly #listeners = new Map<string, Set<(event: PointerEvent) => void>>();
  readonly #capturedPointers = new Set<number>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    let listeners = this.#listeners.get(type);
    if (listeners === undefined) {
      listeners = new Set();
      this.#listeners.set(type, listeners);
    }
    listeners.add(listener as (event: PointerEvent) => void);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.#listeners.get(type)?.delete(listener as (event: PointerEvent) => void);
  }

  dispatch(type: string, event: PointerEvent): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) listener(event);
  }

  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0 } as DOMRect;
  }

  setPointerCapture(pointerId: number): void {
    this.#capturedPointers.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.#capturedPointers.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.#capturedPointers.delete(pointerId);
  }
}

async function withFakeDocument(run: () => Promise<void>): Promise<void> {
  const fakeDocument = {
    createElement: () => new FakeElement(),
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  };
  const previousDocument = globalThis.document;
  const previousElement = globalThis.Element;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeElement });
  try {
    await run();
  } finally {
    if (previousDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
    else Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    if (previousElement === undefined) Reflect.deleteProperty(globalThis, 'Element');
    else Object.defineProperty(globalThis, 'Element', { configurable: true, value: previousElement });
  }
}

function fakeMap(): Map {
  const view = new View({ center: [320, 240], resolution: 1, rotation: 0, projection: 'EPSG:3857' });
  return {
    getView: () => view,
    getSize: () => [640, 480]
  } as unknown as Map;
}

function fakeCursor(): CursorPort {
  return {
    open: () => ({ set: () => undefined, reset: () => undefined, destroy: () => undefined })
  } as unknown as CursorPort;
}

function pointer(clientX: number, clientY: number, pointerId = 1, target: EventTarget | null = null): PointerEvent {
  return {
    button: 0,
    isPrimary: true,
    pointerId,
    clientX,
    clientY,
    target,
    preventDefault: () => undefined,
    stopPropagation: () => undefined
  } as unknown as PointerEvent;
}
