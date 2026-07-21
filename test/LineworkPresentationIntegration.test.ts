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
import { lineStyles } from '../src/builtins/styles/lineStyles.js';
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

  it('preserves repeat sequence index and stable slots after excluding the start cap anchor', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const canonical = line(100);
    const presentation = line(100);
    const compiled = compiler.compilePresentation(
      {
        linework: {
          tracks: [{ offset: 0, stroke: { color: '#f00', width: 2 } }],
          caps: {
            start: {
              glyph: { primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#f00' } }] }
            }
          },
          decorations: [
            {
              placement: { kind: 'repeat', spacing: 20 },
              sequence: [
                { primitives: [{ type: 'circle', center: [0, 0], radius: 4, fill: { type: 'solid', color: '#f00' } }] },
                { primitives: [{ type: 'circle', center: [0, 0], radius: 6, fill: { type: 'solid', color: '#f00' } }] }
              ]
            }
          ],
          contour: { kind: 'open' }
        }
      },
      canonical
    );
    const complete = compiled.resolve(presentation, 1);
    const evenStyle = circleStyleByRadius(complete, 4);
    const oddStyle = circleStyleByRadius(complete, 6);
    const evenGeometry = evenStyle?.getGeometry();
    const oddGeometry = oddStyle?.getGeometry();
    expect((evenGeometry as MultiPoint).getCoordinates()).toEqual([
      [40, 0],
      [80, 0]
    ]);
    expect((oddGeometry as MultiPoint).getCoordinates()).toEqual([
      [20, 0],
      [60, 0],
      [100, 0]
    ]);

    presentation.getGeometry().setCoordinates([
      [0, 0],
      [70, 0]
    ]);
    const partial = compiled.resolve(presentation, 1);
    expect(partial).toContain(evenStyle);
    expect(partial).toContain(oddStyle);
    expect(evenStyle?.getGeometry()).toBe(evenGeometry);
    expect(oddStyle?.getGeometry()).toBe(oddGeometry);
    expect((evenGeometry as MultiPoint).getCoordinates()).toEqual([[40, 0]]);
    expect((oddGeometry as MultiPoint).getCoordinates()).toEqual([
      [20, 0],
      [60, 0]
    ]);
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

  it('按完整路径锚点逐步 reveal 重复文字，并在稳定帧复用预热的文字与切口 slot', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry(), { measureTextWidth: () => 8 });
    const canonical = line(100);
    const compiled = compiler.compilePresentation(repeatInlineTextSpec(), canonical);
    const complete = compiled.resolve(canonical, 1);
    const completeStyles = [...complete];
    const textStyles = complete.filter((style) => style.getText() !== null);
    const textGeometries = textStyles.map((style) => style.getGeometry());
    const revision = compiled.revision;
    expect(textCoordinates(complete)).toEqual([
      [10, 0],
      [50, 0],
      [90, 0]
    ]);

    const firstPrefix = line(40);
    const first = compiled.resolve(firstPrefix, 1, { progress: 0.4, direction: 'forward' });
    expect(textCoordinates(first)).toEqual([[10, 0]]);
    expect(first.filter((style) => style.getText() !== null)).toEqual([textStyles[0]]);
    expect(activeLineCoordinates(first)).toEqual([
      [
        [0, 0],
        [4, 0]
      ],
      [
        [16, 0],
        [40, 0]
      ]
    ]);

    const secondPrefix = line(60);
    const second = compiled.resolve(secondPrefix, 1, { progress: 0.6, direction: 'forward' });
    expect(textCoordinates(second)).toEqual([
      [10, 0],
      [50, 0]
    ]);
    expect(second.filter((style) => style.getText() !== null)).toEqual(textStyles.slice(0, 2));
    expect(second.every((style) => completeStyles.includes(style))).toBe(true);

    for (let frame = 0; frame < 300; frame += 1) {
      const stable = compiled.resolve(secondPrefix, 1, { progress: 0.6, direction: 'forward' });
      expect(stable).toBe(complete);
      expect(stable.every((style) => completeStyles.includes(style))).toBe(true);
    }
    expect(compiled.revision).toBe(revision);
    expect(textStyles.map((style) => style.getGeometry())).toEqual(textGeometries);
    compiled.destroy();
  });

  it('反向 grow 只激活已 reveal 的重复文字锚点', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry(), { measureTextWidth: () => 8 });
    const canonical = line(100);
    const suffix = new Feature(
      new LineString([
        [60, 0],
        [100, 0]
      ])
    );
    const compiled = compiler.compilePresentation(repeatInlineTextSpec(), canonical);
    compiled.resolve(canonical, 1);

    const partial = compiled.resolve(suffix, 1, { progress: 0.4, direction: 'reverse' });
    expect(textCoordinates(partial)).toEqual([[90, 0]]);
    expect(activeLineCoordinates(partial)).toEqual([
      [
        [60, 0],
        [84, 0]
      ],
      [
        [96, 0],
        [100, 0]
      ]
    ]);
    compiled.destroy();
  });

  it('重复文字随 viewport 物化，并在平移到另一段路径时复用相同文字 slot', () => {
    let viewportExtent: [number, number, number, number] = [490, -10, 510, 10];
    const compiler = new StyleCompiler(new NativeRefRegistry(), {
      measureTextWidth: () => 8,
      getLineworkViewport: () => ({ extent: viewportExtent, renderBufferPx: 0 })
    });
    const canonical = line(100_000);
    const compiled = compiler.compilePresentation(repeatInlineTextSpec(10, false), canonical);
    const first = compiled.resolve(canonical, 1);
    const styles = first.filter((style) => style.getText() !== null);
    const geometries = styles.map((style) => style.getGeometry());
    expect(textCoordinates(first).map(([x]) => Math.round(x))).toEqual([480, 490, 500, 510, 520]);

    viewportExtent = [990, -10, 1_010, 10];
    const moved = compiled.resolve(canonical, 1);
    expect(moved.filter((style) => style.getText() !== null)).toEqual(styles);
    expect(styles.map((style) => style.getGeometry())).toEqual(geometries);
    expect(textCoordinates(moved).map(([x]) => Math.round(x))).toEqual([980, 990, 1_000, 1_010, 1_020]);
    compiled.destroy();
  });

  it.each(['forward', 'reverse'] as const)('闭环 %s grow 按 preserve-spacing 激活重复文字', (direction) => {
    const compiler = new StyleCompiler(new NativeRefRegistry(), { measureTextWidth: () => 8 });
    const canonical = square(0, 100);
    const compiled = compiler.compilePresentation(repeatClosedInlineTextSpec(), canonical);
    const complete = compiled.resolve(canonical, 1);
    const textStyles = complete.filter((style) => style.getText() !== null);
    const partial = compiled.resolve(canonical, 1, { progress: 0.4, direction });

    expect(textCoordinates(partial)).toEqual(
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
    expect(partial.filter((style) => style.getText() !== null).every((style) => textStyles.includes(style))).toBe(true);
    compiled.destroy();
  });

  it('presentation 为带 cutoutPadding 的重复 glyph 复用多切口轨道 slot', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const canonical = line(100);
    const spec: StyleSpec = {
      linework: {
        tracks: [{ offset: 0, stroke: { color: '#f00', width: 2, lineDash: [8, 6] } }],
        decorations: [
          {
            placement: { kind: 'repeat', spacing: 40 },
            sequence: [{ primitives: [{ type: 'circle', center: [0, 0], radius: 2, fill: { type: 'solid', color: '#f00' } }] }],
            cutoutPadding: 3
          }
        ],
        contour: { kind: 'open' }
      }
    };
    const compiled = compiler.compilePresentation(spec, canonical);
    const complete = compiled.resolve(canonical, 1);
    const lineStyles = complete.filter((style) => style.getGeometry() instanceof LineString && style.getStroke()?.getColor() === '#f00');
    const lineGeometries = lineStyles.map((style) => style.getGeometry());

    const prefix = line(60);
    const partial = compiled.resolve(prefix, 1, { progress: 0.6, direction: 'forward' });
    expect(activeLineCoordinates(partial)).toEqual([
      [
        [0, 0],
        [5, 0]
      ],
      [
        [15, 0],
        [45, 0]
      ],
      [
        [55, 0],
        [60, 0]
      ]
    ]);
    expect(partial.filter((style) => style.getGeometry() instanceof LineString && style.getStroke()?.getColor() === '#f00')).toEqual(lineStyles.slice(0, 3));
    expect(lineStyles.map((style) => style.getGeometry())).toEqual(lineGeometries);
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
    expect((repeatGeometry as MultiPoint).getCoordinates()).toEqual([[50, 0]]);

    presentation.getGeometry().setCoordinates([
      [60, 0],
      [100, 0]
    ]);
    const partial = compiled.resolve(presentation, 1);
    expect(partial).toContain(startStyle);
    expect(partial).not.toContain(repeatStyle);
    expect(partial).not.toContain(endStyle);
    expect(startStyle?.getGeometry()).toBe(startGeometry);
    expect(repeatStyle?.getGeometry()).toBe(repeatGeometry);
    expect((startGeometry as MultiPoint).getCoordinates()).toEqual([[60, 0]]);
    expect((repeatGeometry as MultiPoint).getCoordinates()).toEqual([]);
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
    expect((repeatGeometry as MultiPoint).getCoordinates()).toEqual([[50, 0]]);

    viewportExtent = [worldWidth, -10, worldWidth + 100, 10];
    presentation.getGeometry().setCoordinates([
      [worldWidth + 60, 0],
      [worldWidth + 100, 0]
    ]);
    const wrapped = compiled.resolve(presentation, 1);
    expect(wrapped).toContain(startStyle);
    expect(wrapped).not.toContain(repeatStyle);
    expect(wrapped).not.toContain(endStyle);
    expect(startStyle?.getGeometry()).toBe(startGeometry);
    expect(repeatStyle?.getGeometry()).toBe(repeatGeometry);
    expect((startGeometry as MultiPoint).getCoordinates()[0][0]).toBeCloseTo(worldWidth + 60);
    expect((repeatGeometry as MultiPoint).getCoordinates()).toEqual([]);

    presentation.getGeometry().setCoordinates([
      [worldWidth, 0],
      [worldWidth + 100, 0]
    ]);
    const wrappedComplete = compiled.resolve(presentation, 1);
    expect(wrappedComplete).toContain(endStyle);
    expect(wrappedComplete).toContain(repeatStyle);
    expect(endStyle?.getGeometry()).toBe(endGeometry);
    expect((endGeometry as MultiPoint).getCoordinates()[0][0]).toBeCloseTo(worldWidth + 100);
    expect((repeatGeometry as MultiPoint).getCoordinates()[0][0]).toBeCloseTo(worldWidth + 50);
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
    expect(roundedMarkerXs(repeatGeometry as MultiPoint)).toEqual(Array.from({ length: 19 }, (_, index) => (index + 1) * 40));

    viewportExtent = [600, -10, 800, 10];
    presentation.getGeometry().setCoordinates([
      [600, 0],
      [800, 0]
    ]);
    const sameWorld = compiled.resolve(presentation, 1);
    expect(sameWorld).toContain(startStyle);
    expect(sameWorld).toContain(repeatStyle);
    expect(sameWorld).not.toContain(endStyle);
    expect((startGeometry as MultiPoint).getCoordinates()).toEqual([[600, 0]]);
    expect(roundedMarkerXs(repeatGeometry as MultiPoint)).toEqual([640, 680, 720, 760]);

    viewportExtent = [1_600, -10, 1_800, 10];
    presentation.getGeometry().setCoordinates([
      [1_600, 0],
      [1_800, 0]
    ]);
    const adjacentWorld = compiled.resolve(presentation, 1);
    expect(adjacentWorld).toContain(startStyle);
    expect(adjacentWorld).toContain(repeatStyle);
    expect(adjacentWorld).not.toContain(endStyle);
    expect(startStyle?.getGeometry()).toBe(startGeometry);
    expect(repeatStyle?.getGeometry()).toBe(repeatGeometry);
    expect((startGeometry as MultiPoint).getCoordinates()).toEqual([[1_600, 0]]);
    expect(roundedMarkerXs(repeatGeometry as MultiPoint)).toEqual([1_640, 1_680, 1_720, 1_760]);
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

  it.each(['tick', 'alternating-tick', 'double-tick', 'square', 'circle'] as const)(
    '%s 闭环完整帧使用 Polygon offset，grow 中间帧复用开放 reveal slot',
    (decoration) => {
      const compiler = new StyleCompiler(new NativeRefRegistry());
      const canonical = square(0, 100);
      const compiled = compiler.compilePresentation(lineStyles.polygon({ lines: ['solid', 'dashed'], decoration }), canonical);

      const completeTracks = compiled.resolve(canonical, 1).filter((style) => style.getStroke()?.getWidth() === 2);
      expect(completeTracks).toHaveLength(2);
      expect(completeTracks.every((style) => style.getGeometry() instanceof Polygon)).toBe(true);
      expect(completeTracks.map((style) => style.getStroke()?.getOffset())).toEqual([3, -3]);

      const revealedTracks = compiled.resolve(canonical, 1, { progress: 0.5, direction: 'forward' }).filter((style) => style.getStroke()?.getWidth() === 2);
      expect(revealedTracks).toHaveLength(2);
      expect(revealedTracks.every((style) => style.getGeometry() instanceof LineString)).toBe(true);
      expect(revealedTracks.map((style) => style.getStroke()?.getOffset())).toEqual([-3, 3]);
      for (const style of revealedTracks) {
        const coordinates = (style.getGeometry() as LineString).getCoordinates();
        expect(coordinates[0]).not.toEqual(coordinates.at(-1));
      }

      const restored = compiled.resolve(canonical, 1, { progress: 1, direction: 'forward' });
      expect(restored.filter((style) => style.getStroke()?.getWidth() === 2)).toHaveLength(2);
      expect(completeTracks.every((style) => restored.includes(style))).toBe(true);
      compiled.destroy();
    }
  );

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
    if (geometry instanceof LineString) return [geometry.getCoordinates()];
    return geometry instanceof Polygon ? geometry.getCoordinates().slice(0, 1) : [];
  });
}

function roundedMarkerXs(geometry: MultiPoint): number[] {
  return geometry.getCoordinates().map(([x]) => Math.round(x));
}

function roundedMarkerCoordinates(geometry: MultiPoint): number[][] {
  return geometry.getCoordinates().map(([x, y]) => [Math.round(x), Math.round(y)]);
}

function textCoordinates(styles: readonly Style[]): number[][] {
  return styles
    .filter((style) => style.getText() !== null && style.getGeometry() instanceof Point)
    .map((style) => (style.getGeometry() as Point).getCoordinates());
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

function repeatInlineTextSpec(spacing = 40, tracks = true): StyleSpec {
  return {
    linework: {
      tracks: tracks ? [{ offset: 0, stroke: { color: '#f00', width: 2, lineDash: [8, 6] } }] : [],
      inlineText: {
        text: 'AB',
        placement: { kind: 'repeat', spacing, phase: 0 },
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

function repeatClosedInlineTextSpec(): StyleSpec {
  return {
    linework: {
      tracks: [{ offset: 0, stroke: { color: '#f00', width: 2, lineDash: [8, 6] } }],
      inlineText: {
        text: 'AB',
        placement: { kind: 'repeat', spacing: 100, phase: 0 },
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
