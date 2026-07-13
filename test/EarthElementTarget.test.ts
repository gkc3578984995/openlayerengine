import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('ol/control/defaults', () => ({
  defaults: () => []
}));

vi.mock('ol', async () => {
  const actual = await vi.importActual<typeof import('ol')>('ol');

  class TestView {
    constructor(_options?: unknown) {}
  }

  class TestMap {
    private target?: string | HTMLElement;
    private readonly view: TestView;
    private readonly interactions = { getArray: () => [], forEach: () => undefined, clear: () => undefined };

    constructor(options: { target?: string | HTMLElement; view: TestView }) {
      this.target = options.target;
      this.view = options.view;
    }

    getView(): TestView {
      return this.view;
    }

    getTargetElement(): HTMLElement | null {
      return typeof this.target === 'string' ? null : (this.target ?? null);
    }

    getInteractions() {
      return this.interactions;
    }

    getOverlays() {
      return { clear: () => undefined };
    }

    getLayers() {
      return { clear: () => undefined };
    }

    getControls() {
      return { clear: () => undefined };
    }

    removeInteraction(): void {}

    addInteraction(): void {}

    addOverlay(): void {}

    setTarget(target?: string | HTMLElement): void {
      this.target = target;
    }

    dispose(): void {}
  }

  return { ...actual, Map: TestMap, View: TestView };
});

import Descriptor from '../src/components/Descriptor';
import { destroyEarth, useEarth } from '../src/useEarth';

const originalDocument = globalThis.document;

afterEach(() => {
  destroyEarth('element-target');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

describe('HTMLElement Earth target', () => {
  it('preserves the element through Earth and uses the map target for Descriptor DOM attachment', () => {
    const append = vi.fn();
    const target = { id: 'earth-target', append } as unknown as HTMLElement;
    const descriptorElement = { style: {}, innerHTML: '', appendChild: vi.fn() } as unknown as HTMLDivElement;
    const getElementById = vi.fn(() => null);
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        createElement: () => descriptorElement,
        getElementById
      }
    });

    const earth = useEarth({ id: 'element-target', target });
    expect(earth.target).toBe(target);
    expect(earth.containerId).toBe('earth-target');
    expect(earth.map.getTargetElement()).toBe(target);
    earth.useDefaultLayer = () => ({ polyline: { get: () => [] } }) as unknown as ReturnType<typeof earth.useDefaultLayer>;

    const descriptor = new Descriptor(earth, {
      type: 'custom',
      drag: false,
      isShowFixedline: false,
      isShowClose: false
    });
    descriptor.set({ position: [0, 0] });

    expect(append).toHaveBeenCalledWith(descriptorElement);
    expect(getElementById).not.toHaveBeenCalled();
  });

  it('allows Descriptor.set when the map target is detached', () => {
    const target = { id: 'earth-target', append: vi.fn() } as unknown as HTMLElement;
    const descriptorElement = { style: {}, innerHTML: '', appendChild: vi.fn() } as unknown as HTMLDivElement;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        createElement: () => descriptorElement
      }
    });
    const earth = useEarth({ id: 'element-target', target });
    earth.useDefaultLayer = () => ({ polyline: { get: () => [] } }) as unknown as ReturnType<typeof earth.useDefaultLayer>;
    earth.map.setTarget(undefined);
    const descriptor = new Descriptor(earth, {
      type: 'custom',
      drag: false,
      isShowFixedline: false,
      isShowClose: false
    });

    expect(() => descriptor.set({ position: [0, 0] })).not.toThrow();
  });
});
