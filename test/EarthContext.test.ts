import { afterEach, describe, expect, it, vi } from 'vitest';
import PointLayer from '../src/base/PointLayer';
import { destroyEarth, useEarth } from '../src/useEarth';

const state = vi.hoisted(() => ({
  addedLayers: [] as unknown[],
  registeredLayers: [] as string[]
}));

vi.mock('../src/Earth', () => ({
  default: class MockEarth {
    isDestroyed = false;
    map = {
      addLayer: (layer: unknown) => state.addedLayers.push(layer)
    };

    _autoRegisterLayer(key: string): void {
      state.registeredLayers.push(key);
    }

    removeLayer(): undefined {
      return undefined;
    }

    removeRegisteredLayer(): boolean {
      return false;
    }

    destroy(): void {
      this.isDestroyed = true;
    }
  }
}));

afterEach(() => {
  destroyEarth();
  state.addedLayers.length = 0;
  state.registeredLayers.length = 0;
});

describe('earthContext default registry', () => {
  it('allows layer constructors to use the registered default Earth', () => {
    useEarth();

    const layer = new PointLayer();

    expect(layer.getLayer()).toBe(state.addedLayers[0]);
    expect(state.registeredLayers).toEqual([layer.registryKey]);
  });
});
