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

    getTargetElement(): HTMLElement {
      return this.target as HTMLElement;
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
    const target = { append } as unknown as HTMLElement;
    const descriptorElement = {} as HTMLDivElement;
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
    expect(earth.containerId).toBe(target);
    expect(earth.map.getTargetElement()).toBe(target);

    const descriptor = Object.assign(Object.create(Descriptor.prototype) as Descriptor, {
      earth,
      options: { type: 'custom' }
    });
    const init = Reflect.get(descriptor, 'init') as () => void;
    init.call(descriptor);

    expect(append).toHaveBeenCalledWith(descriptorElement);
    expect(getElementById).not.toHaveBeenCalled();
  });
});
