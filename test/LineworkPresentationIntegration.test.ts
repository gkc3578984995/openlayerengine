import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import MultiLineString from 'ol/geom/MultiLineString.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import { getWidth } from 'ol/extent.js';
import { get as getProjection } from 'ol/proj.js';
import CircleStyle from 'ol/style/Circle.js';
import Style from 'ol/style/Style.js';
import { describe, expect, it, vi } from 'vitest';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import type { StyleSpec } from '../src/core/style/types.js';

describe('linework animation presentation integration', () => {
  it('materializes repeat markers only inside the explicitly supplied viewport', () => {
    let viewportExtent: [number, number, number, number] = [490, -10, 510, 10];
    const compiler = new StyleCompiler(new NativeRefRegistry(), {
      getLineworkViewport: () => ({ extent: viewportExtent, renderBufferPx: 0 })
    });
    const feature = line(100_000);
    const compiled = compiler.compile({
      linework: {
        tracks: [],
        decorations: [
          {
            placement: { kind: 'repeat', spacing: 10 },
            sequence: [
              {
                primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#f00' } }]
              }
            ]
          }
        ],
        contour: { kind: 'open' }
      }
    });
    if (typeof compiled !== 'function') throw new Error('Viewport-dependent linework must compile to a StyleFunction');
    const first = compiled(feature, 1) as Style[];
    const firstMarkers = circleStyleByRadius(first, 3)?.getGeometry();
    expect(firstMarkers).toBeInstanceOf(MultiPoint);
    expect(roundedMarkerXs(firstMarkers as MultiPoint)).toEqual([480, 490, 500, 510, 520]);

    viewportExtent = [990, -10, 1_010, 10];
    const moved = compiled(feature, 1) as Style[];
    const movedMarkers = circleStyleByRadius(moved, 3)?.getGeometry();
    expect(roundedMarkerXs(movedMarkers as MultiPoint)).toEqual([980, 990, 1_000, 1_010, 1_020]);
  });

  it('bounds marker materialization during the first presentation pool build', () => {
    const setCoordinates = vi.spyOn(MultiPoint.prototype, 'setCoordinates');
    try {
      const compiler = new StyleCompiler(new NativeRefRegistry(), {
        getLineworkViewport: () => ({ extent: [490, -10, 510, 10], renderBufferPx: 0 })
      });
      const maximum = line(100_000);
      const current = line(100_000);
      const presentation = compiler.compilePresentation(
        {
          linework: {
            tracks: [],
            decorations: [
              {
                placement: { kind: 'repeat', spacing: 10 },
                sequence: [
                  {
                    primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#f00' } }]
                  }
                ]
              }
            ],
            contour: { kind: 'open' }
          }
        },
        maximum
      );

      const styles = presentation.resolve(current, 1);
      const markers = circleStyleByRadius(styles, 3)?.getGeometry();
      expect(markers).toBeInstanceOf(MultiPoint);
      expect(roundedMarkerXs(markers as MultiPoint)).toEqual([480, 490, 500, 510, 520]);
      const maximumBatchSize = Math.max(0, ...setCoordinates.mock.calls.map(([coordinates]) => (Array.isArray(coordinates) ? coordinates.length : 0)));
      expect(maximumBatchSize).toBe(5);
      presentation.destroy();
    } finally {
      setCoordinates.mockRestore();
    }
  });

  it('reveals tracks and fixed repeat anchors in place without re-centering the current prefix', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const canonical = line(100);
    const presentation = line(100);
    const spec: StyleSpec = {
      linework: {
        tracks: [{ offset: 0, stroke: { color: '#f00', width: 2, lineDash: [8, 6] } }],
        decorations: [
          {
            placement: { kind: 'repeat', spacing: 40 },
            sequence: [
              {
                primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#f00' } }]
              }
            ]
          }
        ],
        contour: { kind: 'open' }
      }
    };
    const compiled = compiler.compilePresentation(spec, canonical);
    const warmed = compiled.resolve(presentation, 1);
    const warmedStyles = [...warmed];
    const warmedGeometries = warmedStyles.map((style) => style.getGeometry());
    const repeatStyle = circleStyleByRadius(warmed, 3);
    const repeatGeometry = repeatStyle?.getGeometry();
    expect(repeatGeometry).toBeInstanceOf(MultiPoint);
    expect((repeatGeometry as MultiPoint).getCoordinates()).toEqual([
      [10, 0],
      [50, 0],
      [90, 0]
    ]);

    presentation.getGeometry().setCoordinates([
      [0, 0],
      [40, 0]
    ]);
    const shortened = compiled.resolve(presentation, 1);
    expect(shortened).toBe(warmed);
    expect([...shortened]).toEqual(warmedStyles);
    expect(shortened.map((style) => style.getGeometry())).toEqual(warmedGeometries);
    expect(maximumRenderedX(shortened)).toBeLessThanOrEqual(40);
    expect(repeatStyle?.getGeometry()).toBe(repeatGeometry);
    expect((repeatGeometry as MultiPoint).getCoordinates()).toEqual([[10, 0]]);

    for (let frame = 0; frame < 300; frame += 1) {
      presentation.getGeometry().setCoordinates([
        [0, 0],
        [40, 0]
      ]);
      const stable = compiled.resolve(presentation, 1);
      expect([...stable]).toEqual(warmedStyles);
      expect(stable.map((style) => style.getGeometry())).toEqual(warmedGeometries);
    }
    compiled.destroy();
  });

  it('reveals inline text only after the fixed full-path midpoint', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry(), { measureTextWidth: () => 8 });
    const canonical = line(100);
    const presentation = line(100);
    const compiled = compiler.compilePresentation(
      {
        linework: {
          tracks: [{ offset: 0, stroke: { color: '#f00', width: 2, lineDash: [8, 6] } }],
          inlineText: {
            text: 'AB',
            fontFamily: 'sans-serif',
            fontSize: 12,
            fontWeight: 'normal',
            fontStyle: 'normal',
            fill: { type: 'solid', color: '#000' },
            gapPadding: 2
          },
          contour: { kind: 'open' }
        }
      },
      canonical
    );
    const warmed = compiled.resolve(presentation, 1);
    const warmedStyles = [...warmed];
    const textStyle = warmed.find((style) => style.getText() !== null);
    const textPoint = textStyle?.getGeometry();
    expect(textPoint).toBeInstanceOf(Point);
    expect((textPoint as Point).getCoordinates()).toEqual([50, 0]);

    presentation.getGeometry().setCoordinates([
      [0, 0],
      [40, 0]
    ]);
    const beforeMidpoint = compiled.resolve(presentation, 1);
    expect(beforeMidpoint).toBe(warmed);
    expect(beforeMidpoint).not.toContain(textStyle);
    expect(textStyle?.getGeometry()).toBe(textPoint);
    expect(activeLineCoordinates(beforeMidpoint)).toEqual([
      [
        [0, 0],
        [40, 0]
      ]
    ]);

    presentation.getGeometry().setCoordinates([
      [0, 0],
      [60, 0]
    ]);
    const afterMidpoint = compiled.resolve(presentation, 1);
    expect(afterMidpoint).toContain(textStyle);
    expect(textStyle?.getGeometry()).toBe(textPoint);
    expect((textPoint as Point).getCoordinates()).toEqual([50, 0]);
    expect(activeLineCoordinates(afterMidpoint)).toEqual([
      [
        [0, 0],
        [44, 0]
      ],
      [
        [56, 0],
        [60, 0]
      ]
    ]);
    expect(afterMidpoint.every((style) => warmedStyles.includes(style))).toBe(true);
    compiled.destroy();
  });

  it('reveals a center glyph at the fixed full-path midpoint without replacing its batch', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const canonical = line(100);
    const presentation = line(100);
    const compiled = compiler.compilePresentation(
      {
        linework: {
          tracks: [{ offset: 0, stroke: { color: '#f00', width: 2 } }],
          decorations: [
            {
              placement: { kind: 'center' },
              glyph: {
                primitives: [{ type: 'circle', center: [0, 0], radius: 4, fill: { type: 'solid', color: '#f00' } }]
              }
            }
          ],
          contour: { kind: 'open' }
        }
      },
      canonical
    );
    const complete = compiled.resolve(presentation, 1);
    const centerStyle = circleStyleByRadius(complete, 4);
    const centerGeometry = centerStyle?.getGeometry();
    expect(centerGeometry).toBeInstanceOf(MultiPoint);
    expect((centerGeometry as MultiPoint).getCoordinates()).toEqual([[50, 0]]);

    presentation.getGeometry().setCoordinates([
      [0, 0],
      [40, 0]
    ]);
    expect(compiled.resolve(presentation, 1)).not.toContain(centerStyle);

    presentation.getGeometry().setCoordinates([
      [0, 0],
      [60, 0]
    ]);
    const revealed = compiled.resolve(presentation, 1);
    expect(revealed).toContain(centerStyle);
    expect(centerStyle?.getGeometry()).toBe(centerGeometry);
    expect((centerGeometry as MultiPoint).getCoordinates()).toEqual([[50, 0]]);
    compiled.destroy();
  });

  it('shows the start cap after reveal begins and reuses the end cap only at completion', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const canonical = line(100);
    const presentation = line(100);
    const compiled = compiler.compilePresentation(
      {
        linework: {
          tracks: [{ offset: 0, stroke: { color: '#f00', width: 2 } }],
          caps: {
            start: {
              glyph: {
                primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#f00' } }]
              }
            },
            end: {
              glyph: {
                primitives: [{ type: 'circle', center: [0, 0], radius: 5, fill: { type: 'solid', color: '#f00' } }]
              }
            }
          },
          contour: { kind: 'open' }
        }
      },
      canonical
    );
    const complete = compiled.resolve(presentation, 1);
    const startStyle = circleStyleByRadius(complete, 3);
    const endStyle = circleStyleByRadius(complete, 5);
    const startGeometry = startStyle?.getGeometry();
    const endGeometry = endStyle?.getGeometry();
    expect((startGeometry as MultiPoint).getCoordinates()).toEqual([[0, 0]]);
    expect((endGeometry as MultiPoint).getCoordinates()).toEqual([[100, 0]]);

    presentation.getGeometry().setCoordinates([
      [0, 0],
      [40, 0]
    ]);
    const partial = compiled.resolve(presentation, 1);
    expect(partial).toContain(startStyle);
    expect(partial).not.toContain(endStyle);
    expect(startStyle?.getGeometry()).toBe(startGeometry);

    presentation.getGeometry().setCoordinates([
      [0, 0],
      [100, 0]
    ]);
    const restored = compiled.resolve(presentation, 1);
    expect(restored).toContain(startStyle);
    expect(restored).toContain(endStyle);
    expect(startStyle?.getGeometry()).toBe(startGeometry);
    expect(endStyle?.getGeometry()).toBe(endGeometry);
    expect((endGeometry as MultiPoint).getCoordinates()).toEqual([[100, 0]]);
    compiled.destroy();
  });

  it('recognizes reverse grow as a full-path suffix without re-centering repeat anchors', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const canonical = line(100);
    const presentation = line(100);
    const compiled = compiler.compilePresentation(capAndRepeatSpec(), canonical);
    const complete = compiled.resolve(presentation, 1);
    const startStyle = circleStyleByRadius(complete, 3);
    const repeatStyle = circleStyleByRadius(complete, 4);
    const endStyle = circleStyleByRadius(complete, 5);
    const startGeometry = startStyle?.getGeometry();
    const repeatGeometry = repeatStyle?.getGeometry();

    presentation.getGeometry().setCoordinates([
      [60, 0],
      [100, 0]
    ]);
    const partial = compiled.resolve(presentation, 1);
    expect(partial).toContain(startStyle);
    expect(partial).toContain(repeatStyle);
    expect(partial).not.toContain(endStyle);
    expect(startStyle?.getGeometry()).toBe(startGeometry);
    expect(repeatStyle?.getGeometry()).toBe(repeatGeometry);
    expect((startGeometry as MultiPoint).getCoordinates()).toEqual([[60, 0]]);
    expect((repeatGeometry as MultiPoint).getCoordinates()).toEqual([[90, 0]]);
    compiled.destroy();
  });

  it('keeps the reverse reveal window after the current suffix moves to an adjacent world', () => {
    const projection = getProjection('EPSG:3857');
    if (projection === null) throw new Error('EPSG:3857 projection is unavailable');
    const worldWidth = getWidth(projection.getExtent());
    let viewportExtent: [number, number, number, number] = [0, -10, 100, 10];
    const compiler = new StyleCompiler(new NativeRefRegistry(), {
      getLineworkViewport: () => ({ extent: viewportExtent, worldWidth })
    });
    const canonical = line(100);
    const presentation = line(100);
    const compiled = compiler.compilePresentation(capAndRepeatSpec(), canonical);
    const complete = compiled.resolve(presentation, 1);
    const startStyle = circleStyleByRadius(complete, 3);
    const repeatStyle = circleStyleByRadius(complete, 4);
    const endStyle = circleStyleByRadius(complete, 5);
    const startGeometry = startStyle?.getGeometry();
    const repeatGeometry = repeatStyle?.getGeometry();
    const endGeometry = endStyle?.getGeometry();

    viewportExtent = [worldWidth, -10, worldWidth + 100, 10];
    presentation.getGeometry().setCoordinates([
      [worldWidth + 60, 0],
      [worldWidth + 100, 0]
    ]);
    const wrapped = compiled.resolve(presentation, 1);
    expect(wrapped).toContain(startStyle);
    expect(wrapped).toContain(repeatStyle);
    expect(wrapped).not.toContain(endStyle);
    expect(startStyle?.getGeometry()).toBe(startGeometry);
    expect(repeatStyle?.getGeometry()).toBe(repeatGeometry);
    expect((startGeometry as MultiPoint).getCoordinates()[0][0]).toBeCloseTo(worldWidth + 60);
    expect((repeatGeometry as MultiPoint).getCoordinates()[0][0]).toBeCloseTo(worldWidth + 90);

    presentation.getGeometry().setCoordinates([
      [worldWidth, 0],
      [worldWidth + 100, 0]
    ]);
    const wrappedComplete = compiled.resolve(presentation, 1);
    expect(wrappedComplete).toContain(endStyle);
    expect(endStyle?.getGeometry()).toBe(endGeometry);
    expect((endGeometry as MultiPoint).getCoordinates()[0][0]).toBeCloseTo(worldWidth + 100);
    compiled.destroy();
  });

  it('scores reverse suffix alignment before rounding to an adjacent world', () => {
    const worldWidth = 1_000;
    let viewportExtent: [number, number, number, number] = [0, -10, 800, 10];
    const compiler = new StyleCompiler(new NativeRefRegistry(), {
      getLineworkViewport: () => ({ extent: viewportExtent, worldWidth })
    });
    const canonical = line(800);
    const presentation = line(800);
    const compiled = compiler.compilePresentation(capAndRepeatSpec(), canonical);
    const complete = compiled.resolve(presentation, 1);
    const startStyle = circleStyleByRadius(complete, 3);
    const repeatStyle = circleStyleByRadius(complete, 4);
    const endStyle = circleStyleByRadius(complete, 5);
    const startGeometry = startStyle?.getGeometry();
    const repeatGeometry = repeatStyle?.getGeometry();

    viewportExtent = [600, -10, 800, 10];
    presentation.getGeometry().setCoordinates([
      [600, 0],
      [800, 0]
    ]);
    const sameWorld = compiled.resolve(presentation, 1);
    expect(sameWorld).toContain(startStyle);
    expect(sameWorld).not.toContain(endStyle);
    expect((startGeometry as MultiPoint).getCoordinates()).toEqual([[600, 0]]);
    expect(roundedMarkerXs(repeatGeometry as MultiPoint)).toEqual([600, 640, 680, 720, 760, 800]);

    viewportExtent = [1_600, -10, 1_800, 10];
    presentation.getGeometry().setCoordinates([
      [1_600, 0],
      [1_800, 0]
    ]);
    const adjacentWorld = compiled.resolve(presentation, 1);
    expect(adjacentWorld).toContain(startStyle);
    expect(adjacentWorld).not.toContain(endStyle);
    expect(startStyle?.getGeometry()).toBe(startGeometry);
    expect(repeatStyle?.getGeometry()).toBe(repeatGeometry);
    expect((startGeometry as MultiPoint).getCoordinates()).toEqual([[1_600, 0]]);
    expect(roundedMarkerXs(repeatGeometry as MultiPoint)).toEqual([1_600, 1_640, 1_680, 1_720, 1_760, 1_800]);
    compiled.destroy();
  });

  it.each([
    [
      'forward',
      [
        [0, 0],
        [10, 0],
        [5, 0]
      ]
    ],
    [
      'reverse',
      [
        [5, 0],
        [10, 0],
        [0, 0]
      ]
    ]
  ] as const)('matches %s reveal by cumulative span when an open path folds over itself', (_direction, currentCoordinates) => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const canonical = new Feature(
      new LineString([
        [0, 0],
        [10, 0],
        [0, 0]
      ])
    );
    const current = new Feature(new LineString(currentCoordinates.map((coordinate) => [...coordinate])));
    const compiled = compiler.compilePresentation(centerAndEndSpec(), canonical);
    const complete = compiled.resolve(canonical, 1);
    const centerStyle = circleStyleByRadius(complete, 4);
    const endStyle = circleStyleByRadius(complete, 5);
    const centerGeometry = centerStyle?.getGeometry();

    const partial = compiled.resolve(current, 1);
    expect(partial).toContain(centerStyle);
    expect(partial).not.toContain(endStyle);
    expect(centerStyle?.getGeometry()).toBe(centerGeometry);
    expect((centerGeometry as MultiPoint).getCoordinates()).toEqual([[10, 0]]);
    compiled.destroy();
  });

  it.each(['forward', 'reverse'] as const)('uses explicit %s progress for closed tracks, repeat anchors, and midpoint text', (direction) => {
    const compiler = new StyleCompiler(new NativeRefRegistry(), { measureTextWidth: () => 8 });
    const canonical = square(0, 100);
    const provider = new Feature(
      new Polygon([
        [
          [0, 0],
          [30, 0],
          [0, 20],
          [0, 0]
        ]
      ])
    );
    const compiled = compiler.compilePresentation(closedTextAndRepeatSpec(), canonical);
    const complete = compiled.resolve(canonical, 1);
    const textStyle = complete.find((style) => style.getText() !== null);
    const textGeometry = textStyle?.getGeometry();
    const repeatStyle = circleStyleByRadius(complete, 4);
    const repeatGeometry = repeatStyle?.getGeometry();

    const beforeMidpoint = compiled.resolve(provider, 1, { progress: 0.4, direction });
    expect(beforeMidpoint).not.toContain(textStyle);
    expect(repeatStyle?.getGeometry()).toBe(repeatGeometry);
    expect(roundedMarkerCoordinates(repeatGeometry as MultiPoint)).toEqual(
      direction === 'forward'
        ? [
            [50, 0],
            [100, 50]
          ]
        : [
            [50, 100],
            [0, 50]
          ]
    );
    expect(activeLineCoordinates(beforeMidpoint)).toEqual(
      direction === 'forward'
        ? [
            [
              [0, 0],
              [100, 0],
              [100, 60]
            ]
          ]
        : [
            [
              [60, 100],
              [0, 100],
              [0, 0]
            ]
          ]
    );

    const afterMidpoint = compiled.resolve(provider, 1, { progress: 0.6, direction });
    expect(afterMidpoint).toContain(textStyle);
    expect(textStyle?.getGeometry()).toBe(textGeometry);
    expect((textGeometry as Point).getCoordinates()).toEqual([100, 100]);
    compiled.destroy();
  });

  it('lays out a transformed closed contour as a complete current path when no grow metadata exists', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const canonical = square(0, 100);
    const transformed = square(200, 200);
    const compiled = compiler.compilePresentation(closedTrackRepeatSpec(), canonical);
    const complete = compiled.resolve(canonical, 1);
    const repeatStyle = circleStyleByRadius(complete, 4);
    const repeatGeometry = repeatStyle?.getGeometry();

    const current = compiled.resolve(transformed, 1);
    expect(current).toContain(repeatStyle);
    expect(roundedMarkerCoordinates(repeatGeometry as MultiPoint)).toEqual([
      [300, 0],
      [400, 100],
      [300, 200],
      [200, 100]
    ]);
    expect(activeLineCoordinates(current)).toEqual([
      [
        [200, 0],
        [400, 0],
        [400, 200],
        [200, 200],
        [200, 0]
      ]
    ]);
    compiled.destroy();
  });

  it('requests worldWidth for grow linework without repeat decorations', () => {
    const worldWidth = 1_000;
    const getLineworkViewport = vi.fn(() => ({ extent: [worldWidth, -10, worldWidth + 100, 10] as const, worldWidth }));
    const compiler = new StyleCompiler(new NativeRefRegistry(), { getLineworkViewport, measureTextWidth: () => 8 });
    const canonical = line(100);
    const current = new Feature(
      new LineString([
        [worldWidth, 0],
        [worldWidth + 60, 0]
      ])
    );
    const compiled = compiler.compilePresentation(inlineTextSpec(), canonical);

    const styles = compiled.resolve(current, 1, { progress: 0.6, direction: 'forward' });
    const text = styles.find((style) => style.getText() !== null)?.getGeometry();
    expect(getLineworkViewport).toHaveBeenCalled();
    expect((text as Point).getCoordinates()).toEqual([worldWidth + 50, 0]);
    compiled.destroy();
  });

  it.each(['forward', 'reverse'] as const)('keeps closed fixed anchors in the adjacent world under explicit %s grow metadata', (direction) => {
    const worldWidth = 1_000;
    const compiler = new StyleCompiler(new NativeRefRegistry(), {
      getLineworkViewport: () => ({ extent: [worldWidth, -100, worldWidth + 100, 100], worldWidth })
    });
    const canonical = square(0, 100);
    const provider = new Feature(
      new Polygon([
        [
          [worldWidth, 0],
          [worldWidth + 30, 0],
          [worldWidth, 20],
          [worldWidth, 0]
        ]
      ])
    );
    const compiled = compiler.compilePresentation(closedCenterSpec(), canonical);
    const complete = compiled.resolve(canonical, 1);
    const centerStyle = circleStyleByRadius(complete, 4);
    const centerGeometry = centerStyle?.getGeometry();

    const partial = compiled.resolve(provider, 1, { progress: 0.6, direction });
    expect(partial).toContain(centerStyle);
    expect((centerGeometry as MultiPoint).getCoordinates()).toEqual([[worldWidth + 100, 100]]);
    expect(
      activeLineCoordinates(partial)
        .flat(1)
        .map(([x]) => x)
    ).toEqual(expect.arrayContaining([worldWidth, worldWidth + 100]));
    compiled.destroy();
  });
});

function line(length: number): Feature<LineString> {
  return new Feature(
    new LineString([
      [0, 0],
      [length, 0]
    ])
  );
}

function maximumRenderedX(styles: readonly Style[]): number {
  let maximum = Number.NEGATIVE_INFINITY;
  for (const style of styles) {
    const geometry = style.getGeometry();
    if (geometry instanceof MultiLineString) {
      for (const path of geometry.getCoordinates()) for (const coordinate of path) maximum = Math.max(maximum, coordinate[0]);
    } else if (geometry instanceof MultiPoint) {
      for (const coordinate of geometry.getCoordinates()) maximum = Math.max(maximum, coordinate[0]);
    } else if (geometry instanceof Point) maximum = Math.max(maximum, geometry.getCoordinates()[0]);
  }
  return maximum;
}

function circleStyleByRadius(styles: readonly Style[], radius: number): Style | undefined {
  return styles.find((style) => {
    const image = style.getImage();
    return image instanceof CircleStyle && image.getRadius() === radius;
  });
}

function activeLineCoordinates(styles: readonly Style[]): number[][][] {
  return styles.flatMap((style) => {
    const geometry = style.getGeometry();
    return geometry instanceof LineString ? [geometry.getCoordinates()] : [];
  });
}

function roundedMarkerXs(geometry: MultiPoint): number[] {
  return geometry.getCoordinates().map(([x]) => Math.round(x));
}

function roundedMarkerCoordinates(geometry: MultiPoint): number[][] {
  return geometry.getCoordinates().map(([x, y]) => [Math.round(x), Math.round(y)]);
}

function capAndRepeatSpec(): StyleSpec {
  return {
    linework: {
      tracks: [{ offset: 0, stroke: { color: '#f00', width: 2 } }],
      caps: {
        start: {
          glyph: {
            primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#f00' } }]
          }
        },
        end: {
          glyph: {
            primitives: [{ type: 'circle', center: [0, 0], radius: 5, fill: { type: 'solid', color: '#f00' } }]
          }
        }
      },
      decorations: [
        {
          placement: { kind: 'repeat', spacing: 40 },
          sequence: [
            {
              primitives: [{ type: 'circle', center: [0, 0], radius: 4, fill: { type: 'solid', color: '#f00' } }]
            }
          ]
        }
      ],
      contour: { kind: 'open' }
    }
  };
}

function centerAndEndSpec(): StyleSpec {
  return {
    linework: {
      tracks: [{ offset: 0, stroke: { color: '#f00', width: 2 } }],
      caps: {
        end: {
          glyph: { primitives: [{ type: 'circle', center: [0, 0], radius: 5, fill: { type: 'solid', color: '#f00' } }] }
        }
      },
      decorations: [
        {
          placement: { kind: 'center' },
          glyph: { primitives: [{ type: 'circle', center: [0, 0], radius: 4, fill: { type: 'solid', color: '#f00' } }] }
        }
      ],
      contour: { kind: 'open' }
    }
  };
}

function square(originX: number, size: number): Feature<Polygon> {
  return new Feature(
    new Polygon([
      [
        [originX, 0],
        [originX + size, 0],
        [originX + size, size],
        [originX, size],
        [originX, 0]
      ]
    ])
  );
}

function closedTextAndRepeatSpec(): StyleSpec {
  return {
    linework: {
      tracks: [{ offset: 0, stroke: { color: '#f00', width: 2, lineDash: [8, 6] } }],
      decorations: [
        {
          placement: { kind: 'repeat', spacing: 100 },
          sequence: [
            {
              primitives: [{ type: 'circle', center: [0, 0], radius: 4, fill: { type: 'solid', color: '#f00' } }]
            }
          ]
        }
      ],
      inlineText: {
        text: 'AB',
        fontFamily: 'sans-serif',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        fill: { type: 'solid', color: '#000' },
        gapPadding: 2
      },
      contour: { kind: 'closed', rings: 'outer', seam: 'preserve-spacing' }
    }
  };
}

function closedCenterSpec(): StyleSpec {
  return {
    linework: {
      tracks: [{ offset: 0, stroke: { color: '#f00', width: 2 } }],
      decorations: [
        {
          placement: { kind: 'center' },
          glyph: { primitives: [{ type: 'circle', center: [0, 0], radius: 4, fill: { type: 'solid', color: '#f00' } }] }
        }
      ],
      contour: { kind: 'closed', rings: 'outer', seam: 'preserve-spacing' }
    }
  };
}

function closedTrackRepeatSpec(): StyleSpec {
  return {
    linework: {
      tracks: [{ offset: 0, stroke: { color: '#f00', width: 2 } }],
      decorations: [
        {
          placement: { kind: 'repeat', spacing: 200 },
          sequence: [
            {
              primitives: [{ type: 'circle', center: [0, 0], radius: 4, fill: { type: 'solid', color: '#f00' } }]
            }
          ]
        }
      ],
      contour: { kind: 'closed', rings: 'outer', seam: 'preserve-spacing' }
    }
  };
}

function inlineTextSpec(): StyleSpec {
  return {
    linework: {
      tracks: [{ offset: 0, stroke: { color: '#f00', width: 2 } }],
      inlineText: {
        text: 'AB',
        fontFamily: 'sans-serif',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        fill: { type: 'solid', color: '#000' },
        gapPadding: 2
      },
      contour: { kind: 'open' }
    }
  };
}
