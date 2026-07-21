import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import MultiLineString from 'ol/geom/MultiLineString.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import CircleStyle from 'ol/style/Circle.js';
import Style, { type StyleFunction } from 'ol/style/Style.js';
import { describe, expect, it, vi } from 'vitest';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { lineStyles } from '../src/builtins/styles/lineStyles.js';
import type { PathGlyphSpec, StyleSpec } from '../src/core/style/types.js';

const redSegment = (from: [number, number], to: [number, number]): PathGlyphSpec => ({
  primitives: [{ type: 'segment', from, to, stroke: { color: '#ff0000', width: 2 } }]
});

function render(compiler: StyleCompiler, spec: StyleSpec, feature: Feature, resolution = 1): Style[] {
  const compiled = compiler.compile(spec) as StyleFunction;
  const result = compiled(feature, resolution);
  if (result === undefined) return [];
  return Array.isArray(result) ? result : [result];
}

describe('StyleCompiler linework', () => {
  it('在编译边界拒绝轨道使用仅属于顶层 Stroke 的 fitPatternOnce', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    expect(() =>
      compiler.compile({
        linework: {
          contour: { kind: 'open' },
          tracks: [{ offset: 0, stroke: { color: '#ff0000', lineDash: [8, 6], fitPatternOnce: true } }]
        }
      } as never)
    ).toThrow(/fitPatternOnce/);
  });

  it('用独立 Stroke.offset 编译双轨实虚线，并保留透明中心命中走廊', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const feature = new Feature(
      new LineString([
        [0, 0],
        [100, 0]
      ])
    );
    const styles = render(
      compiler,
      {
        linework: {
          contour: { kind: 'open' },
          tracks: [
            { offset: -3, stroke: { color: '#ff0000', width: 2, lineDash: [8, 6] } },
            { offset: 3, stroke: { color: '#ff0000', width: 2 } }
          ]
        }
      },
      feature
    );

    expect(styles).toHaveLength(3);
    expect(styles[0].getGeometry()).toBeInstanceOf(MultiLineString);
    expect(styles[0].getStroke()?.getOffset()).toBe(-3);
    expect(styles[0].getStroke()?.getLineDash()).toEqual([8, 6]);
    expect(styles[1].getStroke()?.getOffset()).toBe(3);
    expect(styles[1].getStroke()?.getLineDash()).toBeNull();
    expect(styles[2].getStroke()?.getColor()).toEqual([0, 0, 0, 0]);
    expect(styles[2].getStroke()?.getWidth()).toBe(8);
  });

  it('按 contour 生成起终端帽，并把重复 circle 与 polygon 原语批量编译', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const feature = new Feature(
      new LineString([
        [0, 0],
        [100, 0]
      ])
    );
    const styles = render(
      compiler,
      {
        linework: {
          contour: { kind: 'open' },
          tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
          caps: {
            start: { glyph: redSegment([0, -6], [0, 6]) },
            end: {
              glyph: {
                primitives: [
                  {
                    type: 'polygon',
                    points: [
                      [0, 0],
                      [-10, -5],
                      [-10, 5]
                    ],
                    fill: { type: 'solid', color: '#ff0000' }
                  }
                ]
              }
            }
          },
          decorations: [
            {
              placement: { kind: 'repeat', spacing: 40 },
              sequence: [
                {
                  primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#ff0000' } }]
                }
              ]
            }
          ]
        }
      },
      feature
    );

    const capSegments = styles.find(
      (style) => style.getGeometry() instanceof MultiLineString && style.getStroke()?.getColor() === '#ff0000' && style.getStroke()?.getOffset() === undefined
    );
    const arrow = styles.find((style) => style.getGeometry() instanceof MultiPolygon);
    const circles = styles.find((style) => style.getGeometry() instanceof MultiPoint);
    expect((capSegments?.getGeometry() as MultiLineString).getCoordinates()).toContainEqual([
      [0, -6],
      [0, 6]
    ]);
    expect((arrow?.getGeometry() as MultiPolygon).getPolygons()).toHaveLength(1);
    expect((circles?.getGeometry() as MultiPoint).getCoordinates()).toEqual([[50, 0]]);
  });

  it.each([
    ['none', undefined, [10, 50, 90]],
    ['start', { start: { glyph: redSegment([0, -6], [0, 6]) } }, [50, 90]],
    ['end', { end: { glyph: redSegment([0, -6], [0, 6]) } }, [10, 50]],
    [
      'both',
      {
        start: { glyph: redSegment([0, -6], [0, 6]) },
        end: { glyph: redSegment([0, -6], [0, 6]) }
      },
      [50]
    ]
  ] as const)('%s cap 只跳过对应端点的重复装饰', (_name, caps, expectedXs) => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const styles = render(
      compiler,
      {
        linework: {
          contour: { kind: 'open' },
          tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
          ...(caps === undefined ? {} : { caps }),
          decorations: [
            {
              placement: { kind: 'repeat', spacing: 40 },
              sequence: [
                {
                  primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#ff0000' } }]
                }
              ]
            }
          ]
        }
      },
      new Feature(
        new LineString([
          [0, 0],
          [100, 0]
        ])
      )
    );

    const markers = styles.find((style) => style.getGeometry() instanceof MultiPoint)?.getGeometry();
    expect((markers as MultiPoint).getCoordinates().map(([x]) => x)).toEqual(expectedXs);
  });

  it('让 bar、arrow 与 tick 工厂组合只保留路径内部装饰', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const styles = render(
      compiler,
      lineStyles.polyline({ lines: 'dashed', caps: { start: 'bar', end: 'arrow' }, decoration: 'tick' }),
      new Feature(
        new LineString([
          [0, 0],
          [300, 0]
        ])
      )
    );

    const tickGeometry = styles.find((style) => style.getGeometry() instanceof MultiLineString && style.getStroke()?.getWidth() === 1.5)?.getGeometry();
    expect(tickGeometry).toBeInstanceOf(MultiLineString);
    expect((tickGeometry as MultiLineString).getCoordinates().map((segment) => segment.map(([x, y]) => [Math.round(x), y]))).toEqual(
      [38, 70, 102, 134, 166, 198, 230, 262].map((x) => [
        [x, 7],
        [x, -7]
      ])
    );
  });

  it('极短路径的首末装饰为同一锚点时只跳过一次', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const styles = render(
      compiler,
      {
        linework: {
          contour: { kind: 'open' },
          tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
          caps: { start: { glyph: redSegment([0, -6], [0, 6]) } },
          decorations: [
            {
              placement: { kind: 'repeat', spacing: 40 },
              sequence: [
                {
                  primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#ff0000' } }]
                }
              ]
            }
          ]
        }
      },
      new Feature(
        new LineString([
          [0, 0],
          [20, 0]
        ])
      )
    );

    expect(styles.some((style) => style.getGeometry() instanceof MultiPoint)).toBe(false);
  });

  it('跳过起点装饰后保留交替序列的全局 index', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const styles = render(
      compiler,
      {
        linework: {
          contour: { kind: 'open' },
          tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
          caps: { start: { glyph: redSegment([0, -6], [0, 6]) } },
          decorations: [
            {
              placement: { kind: 'repeat', spacing: 20 },
              sequence: [
                { primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#ff0000' } }] },
                { primitives: [{ type: 'circle', center: [0, 0], radius: 4, fill: { type: 'solid', color: '#ff0000' } }] }
              ]
            }
          ]
        }
      },
      new Feature(
        new LineString([
          [0, 0],
          [100, 0]
        ])
      )
    );

    const markerCoordinates = (radius: number) => {
      const geometry = styles
        .find((style) => style.getImage() instanceof CircleStyle && (style.getImage() as CircleStyle).getRadius() === radius)
        ?.getGeometry();
      expect(geometry).toBeInstanceOf(MultiPoint);
      return (geometry as MultiPoint).getCoordinates();
    };
    expect(markerCoordinates(3)).toEqual([
      [40, 0],
      [80, 0]
    ]);
    expect(markerCoordinates(4)).toEqual([
      [20, 0],
      [60, 0],
      [100, 0]
    ]);
  });

  it('为 MultiLineString 的每个开放 contour 独立跳过首末装饰', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const styles = render(
      compiler,
      {
        linework: {
          contour: { kind: 'open' },
          tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
          caps: {
            start: { glyph: redSegment([0, -6], [0, 6]) },
            end: { glyph: redSegment([0, -6], [0, 6]) }
          },
          decorations: [
            {
              placement: { kind: 'repeat', spacing: 40 },
              sequence: [
                {
                  primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#ff0000' } }]
                }
              ]
            }
          ]
        }
      },
      new Feature(
        new MultiLineString([
          [
            [0, 0],
            [100, 0]
          ],
          [
            [0, 20],
            [100, 20]
          ]
        ])
      )
    );

    const markers = styles.find((style) => style.getGeometry() instanceof MultiPoint)?.getGeometry();
    expect((markers as MultiPoint).getCoordinates()).toEqual([
      [50, 0],
      [50, 20]
    ]);
  });

  it('严格按累计长度 L/2 放置文本、切断轨道并延续虚线相位', () => {
    const measureTextWidth = vi.fn(() => 8);
    const compiler = new StyleCompiler(new NativeRefRegistry(), { measureTextWidth });
    const feature = new Feature(
      new LineString([
        [0, 0],
        [10, 0],
        [10, 30]
      ])
    );
    const styles = render(
      compiler,
      {
        linework: {
          contour: { kind: 'open' },
          tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2, lineDash: [8, 6], lineDashOffset: 1 } }],
          inlineText: {
            text: 'AB',
            fontFamily: 'sans-serif',
            fontSize: 12,
            fontWeight: 'normal',
            fontStyle: 'normal',
            fill: { type: 'solid', color: '#000000' },
            gapPadding: 2
          }
        }
      },
      feature
    );

    const trackStyles = styles.filter((style) => style.getGeometry() instanceof LineString && style.getStroke()?.getColor() === '#ff0000');
    expect(trackStyles).toHaveLength(2);
    expect((trackStyles[0].getGeometry() as LineString).getCoordinates()).toEqual([
      [0, 0],
      [10, 0],
      [10, 4]
    ]);
    expect((trackStyles[1].getGeometry() as LineString).getCoordinates()).toEqual([
      [10, 16],
      [10, 30]
    ]);
    expect(trackStyles[1].getStroke()?.getLineDashOffset()).toBe(-25);

    const textStyle = styles.find((style) => style.getGeometry() instanceof Point && style.getText() !== null);
    expect((textStyle?.getGeometry() as Point).getCoordinates()).toEqual([10, 10]);
    expect(textStyle?.getText()?.getFont()).toBe('normal normal 12px sans-serif');
    expect(textStyle?.getText()?.getRotateWithView()).toBe(false);
    expect(textStyle?.getText()?.getRotation()).toBeCloseTo(-Math.PI / 2);
    expect(measureTextWidth).toHaveBeenCalledWith('normal normal 12px sans-serif', 'AB');
  });

  it('文本切口覆盖短路径时只隐藏轨道，不隐藏文本和逻辑命中路径', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry(), { measureTextWidth: () => 100 });
    const styles = render(
      compiler,
      {
        linework: {
          contour: { kind: 'open' },
          tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
          inlineText: {
            text: 'too long',
            fontFamily: 'sans-serif',
            fontSize: 12,
            fontWeight: 'normal',
            fontStyle: 'normal',
            fill: { type: 'solid', color: '#000000' },
            gapPadding: 6
          }
        }
      },
      new Feature(
        new LineString([
          [0, 0],
          [20, 0]
        ])
      )
    );

    expect(styles.filter((style) => style.getStroke()?.getColor() === '#ff0000')).toHaveLength(0);
    expect(styles.some((style) => style.getGeometry() instanceof Point && style.getText() !== null)).toBe(true);
    expect(styles.some((style) => style.getStroke()?.getColor() instanceof Array)).toBe(true);
  });

  it('Polygon 只派生规范化的逆时针 outer ring，双轨稳定映射 inside/outside', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const polygon = new Polygon([
      [
        [0, 0],
        [0, 20],
        [20, 20],
        [20, 0],
        [0, 0]
      ],
      [
        [5, 5],
        [15, 5],
        [15, 15],
        [5, 15],
        [5, 5]
      ]
    ]);
    const styles = render(
      compiler,
      {
        fill: { type: 'solid', color: [255, 0, 0, 0.1] },
        linework: {
          contour: { kind: 'closed', rings: 'outer', seam: 'preserve-spacing' },
          tracks: [
            { offset: -3, stroke: { color: '#ff0000', width: 2 } },
            { offset: 3, stroke: { color: '#ff0000', width: 2, lineDash: [8, 6] } }
          ]
        }
      },
      new Feature(polygon)
    );

    expect(styles[0].getFill()?.getColor()).toEqual([255, 0, 0, 0.1]);
    const tracks = styles.filter((style) => style.getGeometry() instanceof MultiPolygon && style.getStroke()?.getColor() === '#ff0000');
    expect(tracks).toHaveLength(2);
    expect((tracks[0].getGeometry() as MultiPolygon).getCoordinates()).toEqual([
      [
        [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 20],
          [0, 0]
        ]
      ]
    ]);
    expect(tracks[0].getStroke()?.getOffset()).toBe(3);
    expect(tracks[1].getStroke()?.getOffset()).toBe(-3);
  });

  it.each(['tick', 'alternating-tick', 'double-tick', 'square', 'circle'] as const)('Polygon 双轨与 %s 重复装饰始终编译为完整闭环', (decoration) => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const polygon = new Polygon([
      [
        [0, 0],
        [40, 0],
        [40, 30],
        [0, 30],
        [0, 0]
      ]
    ]);
    const styles = render(compiler, lineStyles.polygon({ lines: ['solid', 'dashed'], decoration }), new Feature(polygon));
    const tracks = styles.filter((style) => style.getGeometry() instanceof MultiPolygon && style.getStroke()?.getWidth() === 2);

    expect(tracks).toHaveLength(2);
    expect(tracks.map((style) => style.getStroke()?.getOffset())).toEqual([3, -3]);
    expect(tracks.every((style) => (style.getGeometry() as MultiPolygon).getCoordinates()[0]?.[0]?.length === 5)).toBe(true);
  });

  it('同 geometry revision、resolution 和 rotation 复用缓存 Style，rotation 变化才重编译文本', () => {
    let viewRotation = 0;
    const compiler = new StyleCompiler(new NativeRefRegistry(), { getViewRotation: () => viewRotation, measureTextWidth: () => 20 });
    const feature = new Feature(
      new LineString([
        [0, 0],
        [100, 0]
      ])
    );
    const spec: StyleSpec = {
      linework: {
        contour: { kind: 'open' },
        tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
        inlineText: {
          text: 'rotation',
          fontFamily: 'sans-serif',
          fontSize: 12,
          fontWeight: 'normal',
          fontStyle: 'normal',
          fill: { type: 'solid', color: '#000000' },
          gapPadding: 6
        }
      }
    };
    const compiled = compiler.compile(spec) as StyleFunction;
    const first = compiled(feature, 1) as Style[];
    const second = compiled(feature, 1) as Style[];
    expect(second).toBe(first);
    expect(second.every((style, index) => style === first[index])).toBe(true);

    viewRotation = Math.PI / 4;
    const rotated = compiled(feature, 1) as Style[];
    expect(rotated).not.toBe(first);
    expect(
      rotated
        .find((style) => style.getText() !== null)
        ?.getText()
        ?.getRotation()
    ).toBeCloseTo(Math.PI / 4);
  });

  it('presentation pool 原位更新 grow 几何并保持 Style、Geometry 与 revision 稳定', () => {
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const maximum = new Feature(
      new LineString([
        [0, 0],
        [100, 0]
      ])
    );
    const currentGeometry = new LineString([
      [0, 0],
      [40, 0]
    ]);
    const current = new Feature(currentGeometry);
    const presentation = compiler.compilePresentation(
      {
        linework: {
          contour: { kind: 'open' },
          tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
          decorations: [
            {
              placement: { kind: 'repeat', spacing: 20 },
              sequence: [
                {
                  primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#ff0000' } }]
                }
              ]
            }
          ]
        }
      },
      maximum
    );

    const first = presentation.resolve(current, 1) as Style[];
    const track = first.find((style) => style.getGeometry() instanceof LineString && style.getStroke()?.getColor() === '#ff0000');
    const markers = first.find((style) => style.getGeometry() instanceof MultiPoint);
    const trackGeometry = track?.getGeometry() as LineString;
    const markerGeometry = markers?.getGeometry() as MultiPoint;
    const revision = presentation.revision;
    expect(trackGeometry.getCoordinates()).toEqual([
      [0, 0],
      [40, 0]
    ]);
    expect(markerGeometry.getCoordinates()).toEqual([
      [0, 0],
      [20, 0],
      [40, 0]
    ]);

    currentGeometry.setCoordinates([
      [0, 0],
      [80, 0]
    ]);
    const second = presentation.resolve(current, 1) as Style[];
    expect(second.find((style) => style.getStroke()?.getColor() === '#ff0000')).toBe(track);
    expect(second.find((style) => style.getGeometry() instanceof MultiPoint)).toBe(markers);
    expect(track?.getGeometry()).toBe(trackGeometry);
    expect(markers?.getGeometry()).toBe(markerGeometry);
    expect(trackGeometry.getCoordinates()).toEqual([
      [0, 0],
      [80, 0]
    ]);
    expect(markerGeometry.getCoordinates()).toEqual([
      [0, 0],
      [20, 0],
      [40, 0],
      [60, 0],
      [80, 0]
    ]);

    for (let index = 0; index < 300; index += 1) presentation.resolve(current, 1);
    expect(presentation.revision).toBe(revision);
    expect(track?.getGeometry()).toBe(trackGeometry);
    expect(markers?.getGeometry()).toBe(markerGeometry);
    presentation.destroy();
  });

  it('字体完成加载后按 font revision 重新测量切口，并注册 OL 全局文字重绘', () => {
    let fontRevision = 0;
    let measuredWidth = 8;
    const registerFont = vi.fn();
    const compiler = new StyleCompiler(new NativeRefRegistry(), {
      getFontRevision: () => fontRevision,
      registerFont,
      measureTextWidth: () => measuredWidth
    });
    const feature = new Feature(
      new LineString([
        [0, 0],
        [100, 0]
      ])
    );
    const compiled = compiler.compile({
      linework: {
        contour: { kind: 'open' },
        tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
        inlineText: {
          text: 'font',
          fontFamily: 'Map Font, sans-serif',
          fontSize: 12,
          fontWeight: 'bold',
          fontStyle: 'italic',
          fill: { type: 'solid', color: '#000000' },
          gapPadding: 2
        }
      }
    }) as StyleFunction;

    const first = compiled(feature, 1) as Style[];
    const firstBefore = first.find((style) => style.getGeometry() instanceof LineString && style.getStroke()?.getColor() === '#ff0000');
    expect((firstBefore?.getGeometry() as LineString).getLastCoordinate()).toEqual([44, 0]);
    expect(registerFont).toHaveBeenCalledOnce();
    expect(registerFont).toHaveBeenCalledWith('italic bold 12px Map Font, sans-serif');

    measuredWidth = 20;
    expect(compiled(feature, 1)).toBe(first);
    fontRevision += 1;
    const updated = compiled(feature, 1) as Style[];
    const updatedBefore = updated.find((style) => style.getGeometry() instanceof LineString && style.getStroke()?.getColor() === '#ff0000');
    expect(updated).not.toBe(first);
    expect((updatedBefore?.getGeometry() as LineString).getLastCoordinate()).toEqual([38, 0]);
  });
});
