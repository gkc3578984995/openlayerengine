import { describe, expect, it, vi } from 'vitest';

vi.mock('ol/dom', () => ({
  createCanvasContext2D: () => {
    const context = {
      canvas: {},
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      createPattern: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0
    };
    context.createPattern.mockImplementation(() => ({ color: context.strokeStyle }));
    return context;
  }
}));

import { Style } from 'ol/style';
import CircleLayer from '../src/base/CircleLayer';

function createEarth() {
  return {
    map: { addLayer: vi.fn() },
    _autoRegisterLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeRegisteredLayer: vi.fn()
  } as any;
}

function getFillColor(feature: ReturnType<CircleLayer['add']>) {
  return (feature.getStyle() as Style).getFill()?.getColor();
}

describe('CircleLayer pattern fills', () => {
  it('inherits an explicit stroke color without mutating the declared pattern', () => {
    const layer = new CircleLayer(createEarth());
    const feature = layer.add({ id: 'circle-pattern', center: [0, 0], radius: 10, fill: { type: 'dot' } });

    expect(getFillColor(feature)).toEqual({ color: '#000000' });
    layer.set({ id: 'circle-pattern', stroke: { color: '#1677ff' } });

    expect(getFillColor(feature)).toEqual({ color: '#1677ff' });
    expect(feature.get('param').fill).toEqual({ type: 'dot' });
  });

  it('preserves pattern parameters after radius and center changes', () => {
    const layer = new CircleLayer(createEarth());
    const feature = layer.add({ id: 'circle-transform', center: [0, 0], radius: 10, fill: { type: 'vertical' } });

    layer.set({ id: 'circle-transform', center: [5, 5], radius: 20 });

    expect(feature.get('param').fill).toEqual({ type: 'vertical' });
    expect(layer.getUpdatedParam(feature as any)?.fill).toEqual({ type: 'vertical' });
  });
});
