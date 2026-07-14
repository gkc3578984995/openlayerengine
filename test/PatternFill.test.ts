import { describe, expect, it, vi } from 'vitest';
import { drawPatternFill, normalizePatternFill, type PatternCanvasContext } from '../src/adapters/openlayers/style/pattern.js';

function createContext(): PatternCanvasContext {
  return {
    canvas: {},
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    createPattern: vi.fn(() => ({}) as CanvasPattern),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0
  };
}

describe('PatternFill v2 回归', () => {
  it('使用默认值并按 fill、stroke、默认色的顺序解析颜色', () => {
    expect(normalizePatternFill({ type: 'pattern', pattern: 'diagonal' })).toEqual({
      pattern: 'diagonal',
      color: '#000000',
      size: 16,
      lineWidth: 1,
      dotRadius: 1.5
    });
    expect(normalizePatternFill({ type: 'pattern', pattern: 'dot' }, '#1677ff').color).toBe('#1677ff');
    expect(normalizePatternFill({ type: 'pattern', pattern: 'dot', color: '#f00' }, '#1677ff').color).toBe('#f00');
  });

  it('规范化无效数值并绘制所有内置纹理', () => {
    expect(normalizePatternFill({ type: 'pattern', pattern: 'horizontal', size: 30, lineWidth: 0, dotRadius: Number.NaN })).toMatchObject({
      size: 16,
      lineWidth: 1,
      dotRadius: 1.5
    });
    for (const pattern of ['horizontal', 'vertical', 'diagonal', 'cross'] as const) {
      const context = createContext();
      drawPatternFill(context, normalizePatternFill({ type: 'pattern', pattern }));
      expect(context.stroke).toHaveBeenCalled();
    }
    const dots = createContext();
    drawPatternFill(dots, normalizePatternFill({ type: 'pattern', pattern: 'dot' }));
    expect(dots.arc).toHaveBeenCalledWith(8, 8, 1.5, 0, Math.PI * 2);
    expect(dots.fill).toHaveBeenCalledOnce();
  });
});
