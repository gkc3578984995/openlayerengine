import { describe, expect, it, vi } from 'vitest';
import { drawPolygonPattern, isPolygonPatternFill, normalizePolygonPatternFill } from '../src/base/PolygonPatternFill';

function createContext() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0
  } as unknown as CanvasRenderingContext2D;
}

describe('PolygonPatternFill', () => {
  it('uses defaults and resolves pattern color in priority order', () => {
    expect(normalizePolygonPatternFill({ type: 'diagonal' })).toEqual({
      type: 'diagonal',
      color: '#000000',
      backgroundColor: undefined,
      size: 16,
      lineWidth: 1,
      dotRadius: 1.5
    });
    expect(normalizePolygonPatternFill({ type: 'dot' }, '#1677ff').color).toBe('#1677ff');
    expect(normalizePolygonPatternFill({ type: 'dot', color: '#f00' }, '#1677ff').color).toBe('#f00');
  });

  it('normalizes invalid numeric options and recognizes only pattern fills', () => {
    expect(normalizePolygonPatternFill({ type: 'horizontal', size: 32, lineWidth: 2, dotRadius: 3 })).toMatchObject({
      size: 32,
      lineWidth: 2,
      dotRadius: 3
    });
    expect(normalizePolygonPatternFill({ type: 'horizontal', size: 30, lineWidth: 0, dotRadius: Number.NaN })).toMatchObject({
      size: 16,
      lineWidth: 1,
      dotRadius: 1.5
    });
    expect(isPolygonPatternFill({ type: 'vertical' })).toBe(true);
    expect(isPolygonPatternFill({ color: '#fff' })).toBe(false);
  });

  it.each(['horizontal', 'vertical', 'diagonal', 'cross'] as const)('draws line paths for %s', (type) => {
    const context = createContext();

    drawPolygonPattern(context, normalizePolygonPatternFill({ type }));

    expect(context.beginPath).toHaveBeenCalled();
    expect(context.moveTo).toHaveBeenCalled();
    expect(context.lineTo).toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalled();
  });

  it('draws more line paths for cross than a single diagonal', () => {
    const diagonal = createContext();
    const cross = createContext();

    drawPolygonPattern(diagonal, normalizePolygonPatternFill({ type: 'diagonal' }));
    drawPolygonPattern(cross, normalizePolygonPatternFill({ type: 'cross' }));

    expect(cross.lineTo.mock.calls.length).toBeGreaterThan(diagonal.lineTo.mock.calls.length);
  });

  it('draws dots as filled circles', () => {
    const context = createContext();

    drawPolygonPattern(context, normalizePolygonPatternFill({ type: 'dot' }));

    expect(context.arc).toHaveBeenCalledWith(8, 8, 1.5, 0, Math.PI * 2);
    expect(context.fill).toHaveBeenCalledTimes(1);
  });
});
