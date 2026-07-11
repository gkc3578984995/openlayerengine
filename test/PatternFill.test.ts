import { describe, expect, it, vi } from 'vitest';
import { drawPatternFill, isPatternFill, normalizePatternFill } from '../src/common/PatternFill';

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

describe('PatternFill', () => {
  it('uses defaults and resolves color in priority order', () => {
    expect(normalizePatternFill({ type: 'diagonal' })).toMatchObject({
      type: 'diagonal',
      color: '#000000',
      size: 16,
      lineWidth: 1,
      dotRadius: 1.5
    });
    expect(normalizePatternFill({ type: 'dot' }, '#1677ff').color).toBe('#1677ff');
    expect(normalizePatternFill({ type: 'dot', color: '#f00' }, '#1677ff').color).toBe('#f00');
  });

  it('normalizes invalid numeric options and recognizes pattern fills', () => {
    expect(normalizePatternFill({ type: 'horizontal', size: 32, lineWidth: 2, dotRadius: 3 })).toMatchObject({ size: 32, lineWidth: 2, dotRadius: 3 });
    expect(normalizePatternFill({ type: 'horizontal', size: 30, lineWidth: 0, dotRadius: Number.NaN })).toMatchObject({ size: 16, lineWidth: 1, dotRadius: 1.5 });
    expect(isPatternFill({ type: 'vertical' })).toBe(true);
    expect(isPatternFill({ color: '#fff' })).toBe(false);
  });

  it.each(['horizontal', 'vertical', 'diagonal', 'cross'] as const)('draws line paths for %s', (type) => {
    const context = createContext();
    drawPatternFill(context, normalizePatternFill({ type }));
    expect(context.stroke).toHaveBeenCalled();
  });

  it('draws two diagonal path groups for cross', () => {
    const diagonal = createContext();
    const cross = createContext();

    drawPatternFill(diagonal, normalizePatternFill({ type: 'diagonal' }));
    drawPatternFill(cross, normalizePatternFill({ type: 'cross' }));

    expect(cross.lineTo.mock.calls.length).toBeGreaterThan(diagonal.lineTo.mock.calls.length);
  });

  it('draws dots as filled circles', () => {
    const context = createContext();
    drawPatternFill(context, normalizePatternFill({ type: 'dot' }));
    expect(context.arc).toHaveBeenCalledWith(8, 8, 1.5, 0, Math.PI * 2);
    expect(context.fill).toHaveBeenCalledTimes(1);
  });
});
