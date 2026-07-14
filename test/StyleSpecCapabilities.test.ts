import { describe, expect, it } from 'vitest';
import { stylePresets, type StylePresetName } from '../src/builtins/styles/presets.js';
import type { PatternFillSpec, StyleSpec } from '../src/core/style/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

const presetNames = [
  'point-default',
  'icon-default',
  'line-default',
  'polygon-default',
  'measure-default',
  'draw-preview',
  'transform-handle'
] as const satisfies readonly StylePresetName[];

describe('StyleSpec capabilities', () => {
  coversCapabilities('style-fill-solid', 'style-fill-pattern', 'style-label-full', 'style-icon-full', 'style-layered-outline', 'style-polyline-static-arrow');

  it('keeps the complete mutable structured-style surface', () => {
    const style: StyleSpec = {
      symbol: {
        type: 'icon',
        src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
        size: [32, 24],
        color: [1, 2, 3, 0.5],
        offset: [4, 5],
        displacement: [6, 7],
        scale: [1.25, 0.75],
        rotation: 30,
        rotateWithView: true,
        anchor: [8, 9],
        anchorOrigin: 'bottom-right',
        anchorXUnits: 'pixels',
        anchorYUnits: 'fraction',
        origin: 'top-right',
        opacity: 0.8,
        crossOrigin: 'anonymous'
      },
      strokes: [
        {
          color: '#111111',
          width: 8,
          lineDash: [12, 6],
          lineDashOffset: 3,
          lineCap: 'round',
          lineJoin: 'bevel',
          miterLimit: 5,
          fitPatternOnce: true
        },
        { color: '#ffffff', width: 3 }
      ],
      fill: {
        type: 'pattern',
        pattern: 'cross',
        color: [20, 30, 40, 0.25],
        size: 32,
        lineWidth: 2,
        dotRadius: 3,
        backgroundColor: '#eeeeee'
      },
      text: {
        text: 'complete',
        font: '12px serif',
        fontFamily: 'Inter, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        fontStyle: 'italic',
        fill: { type: 'solid', color: '#222222' },
        stroke: { color: '#ffffff', width: 2 },
        backgroundFill: { type: 'solid', color: '#eeeeee' },
        backgroundStroke: { color: '#333333', width: 1 },
        padding: [1, 2, 3, 4],
        offsetX: 5,
        offsetY: 6,
        scale: [1, 1.5],
        textAlign: 'center',
        textBaseline: 'middle',
        rotation: 45,
        rotateWithView: true,
        overflow: true,
        placement: 'line',
        maxAngle: 60,
        repeat: 80,
        justify: 'right',
        keepUpright: false
      },
      decorations: [
        {
          type: 'arrow',
          placement: 'repeat',
          spacing: 30,
          offset: 5,
          symbol: {
            type: 'icon',
            src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
            displacement: [1, 2]
          }
        }
      ],
      zIndex: 9
    };

    style.strokes?.push({ color: '#ff0000', width: 1 });
    style.strokes?.[0].lineDash?.push(2);
    style.decorations?.push({ type: 'arrow', placement: 'end' });
    if (style.symbol?.type === 'icon') {
      style.symbol.size?.push(48);
      style.symbol.displacement?.splice(0, 1, 10);
    }
    style.text?.padding?.push(5);

    expect(style.strokes).toHaveLength(3);
    expect(style.strokes?.[0].lineDash).toEqual([12, 6, 2]);
    expect(style.decorations).toHaveLength(2);
    expect(style.symbol?.type === 'icon' ? style.symbol.displacement : undefined).toEqual([10, 7]);
    expect(style.text?.padding).toEqual([1, 2, 3, 4, 5]);
  });

  it('supports solid, every pattern variant, circle symbols, double outlines, and arrows', () => {
    const patterns: PatternFillSpec[] = ['diagonal', 'cross', 'dot', 'horizontal', 'vertical'].map((pattern) => ({
      type: 'pattern',
      pattern
    }));
    const circle: StyleSpec = {
      symbol: {
        type: 'circle',
        radius: 7,
        fill: { type: 'solid', color: '#1677ff' },
        stroke: { color: '#ffffff', width: 2 }
      },
      strokes: [
        { color: '#000000', width: 9 },
        { color: '#ffffff', width: 5 },
        { color: '#1677ff', width: 2, fitPatternOnce: true, lineDash: [4, 2] }
      ],
      decorations: [
        { type: 'arrow', placement: 'start' },
        { type: 'arrow', placement: 'end' },
        { type: 'arrow', placement: 'each-segment' },
        { type: 'arrow', placement: 'repeat', spacing: 20 }
      ]
    };

    expect(patterns.map((fill) => fill.pattern)).toEqual(['diagonal', 'cross', 'dot', 'horizontal', 'vertical']);
    expect(circle.symbol?.type).toBe('circle');
    expect(circle.strokes).toHaveLength(3);
    expect(circle.decorations?.map((decoration) => decoration.placement)).toEqual(['start', 'end', 'each-segment', 'repeat']);
  });

  it('provides exactly the stable preset names and returns deep independent mutable styles', () => {
    expect(Object.keys(stylePresets)).toEqual(presetNames);

    for (const name of presetNames) {
      const first = stylePresets[name];
      const second = stylePresets[name];

      expect(first).not.toBe(second);
      expect(first).toEqual(second);

      first.strokes?.push({ color: '#ff00ff', width: 99 });
      if (first.strokes?.[0].lineDash !== undefined) first.strokes[0].lineDash.push(99);
      if (first.symbol?.type === 'circle') first.symbol.radius += 1;
      if (first.text !== undefined) first.text.padding?.push(99);

      expect(stylePresets[name]).toEqual(second);
    }
  });
});
