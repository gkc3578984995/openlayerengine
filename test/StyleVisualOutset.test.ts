import { describe, expect, it } from 'vitest';
import type { StyleSpec } from '../src/core/style/types.js';
import { styleVisualOutsetPx } from '../src/core/style/visualOutset.js';

describe('styleVisualOutsetPx linework', () => {
  it('covers offset tracks, endpoint glyphs and nested decoration primitives', () => {
    const style: StyleSpec = {
      linework: {
        tracks: [{ offset: -3, stroke: { color: '#f00', width: 2, lineJoin: 'round' } }],
        caps: {
          end: {
            glyph: {
              primitives: [
                {
                  type: 'segment',
                  from: [-12, -6],
                  to: [0, 0],
                  stroke: { color: '#f00', width: 2, lineJoin: 'round' }
                }
              ]
            }
          }
        },
        decorations: [
          {
            placement: { kind: 'repeat', spacing: 24 },
            sequence: [
              {
                primitives: [
                  {
                    type: 'group',
                    primitives: [
                      {
                        type: 'circle',
                        center: [2, 0],
                        radius: 4,
                        fill: { type: 'solid', color: '#f00' },
                        stroke: { color: '#f00', width: 2, lineJoin: 'round' }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        contour: { kind: 'open' }
      }
    };

    expect(styleVisualOutsetPx(style)).toBeCloseTo(Math.hypot(12, 6) + 1);
    expect(styleVisualOutsetPx(style, { strokeWidth: 6 })).toBeCloseTo(Math.hypot(12, 6) + 3);
  });

  it('uses the largest independent double-track offset', () => {
    const style: StyleSpec = {
      linework: {
        tracks: [
          { offset: -3, stroke: { color: '#f00', width: 2, lineJoin: 'round' } },
          { offset: 5, stroke: { color: '#f00', width: 4, lineJoin: 'round' } }
        ],
        contour: { kind: 'open' }
      }
    };

    expect(styleVisualOutsetPx(style)).toBe(7);
  });

  it('disables conservative culling when inline text requires runtime font metrics', () => {
    const style: StyleSpec = {
      linework: {
        tracks: [{ offset: 0, stroke: { color: '#f00', width: 2 } }],
        inlineText: {
          text: '供水管线',
          fontFamily: 'sans-serif',
          fontSize: 12,
          fontWeight: 'normal',
          fontStyle: 'normal',
          fill: { type: 'solid', color: '#000' },
          gapPadding: 6
        },
        contour: { kind: 'open' }
      }
    };

    expect(styleVisualOutsetPx(style)).toBeUndefined();
  });
});
