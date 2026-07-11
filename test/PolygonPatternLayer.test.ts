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
import PolygonLayer from '../src/base/PolygonLayer';

const positions = [
  [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 0]
  ]
];

function createEarth() {
  return {
    map: { addLayer: vi.fn() },
    _autoRegisterLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeRegisteredLayer: vi.fn()
  } as any;
}

function getFillColor(feature: ReturnType<PolygonLayer['add']>) {
  return (feature.getStyle() as Style).getFill()?.getColor();
}

describe('PolygonLayer pattern fills', () => {
  it('inherits a later explicit stroke color without mutating the declared pattern', () => {
    const layer = new PolygonLayer(createEarth());
    const feature = layer.add({ id: 'inherited', positions, fill: { type: 'dot' } });

    expect(getFillColor(feature)).toEqual({ color: '#000000' });
    expect(feature.get('param').fill).toEqual({ type: 'dot' });

    layer.set({ id: 'inherited', stroke: { color: '#1677ff' } });

    expect(getFillColor(feature)).toEqual({ color: '#1677ff' });
    expect(feature.get('param').fill).toEqual({ type: 'dot' });
  });

  it('does not change an explicit pattern color when the stroke changes', () => {
    const layer = new PolygonLayer(createEarth());
    const feature = layer.add({ id: 'explicit', positions, fill: { type: 'horizontal', color: '#f00' } });

    layer.set({ id: 'explicit', stroke: { color: '#1677ff' } });

    expect(getFillColor(feature)).toEqual({ color: '#f00' });
    expect(feature.get('param').fill).toEqual({ type: 'horizontal', color: '#f00' });
  });

  it('keeps existing solid fill behavior', () => {
    const layer = new PolygonLayer(createEarth());
    const feature = layer.add({ id: 'solid', positions, fill: { color: '#abcdef' } });

    expect(getFillColor(feature)).toBe('#abcdef');
  });

  it('preserves a pattern declaration after geometry changes and parameter reads', () => {
    const layer = new PolygonLayer(createEarth());
    const feature = layer.add({ id: 'transform', positions, fill: { type: 'vertical' } });

    layer.setPosition('transform', [
      [
        [1, 1],
        [11, 1],
        [11, 11],
        [1, 1]
      ]
    ]);

    expect(feature.get('param').fill).toEqual({ type: 'vertical' });
    expect(layer.getUpdatedParam(feature as any)?.fill).toEqual({ type: 'vertical' });
  });
});
