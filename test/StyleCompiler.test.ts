import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import RenderFeature from 'ol/render/Feature.js';
import CircleStyle from 'ol/style/Circle.js';
import Icon from 'ol/style/Icon.js';
import RegularShape from 'ol/style/RegularShape.js';
import Style, { type StyleFunction, type StyleLike } from 'ol/style/Style.js';
import { describe, expect, it, vi } from 'vitest';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { createPatternFill, drawPatternFill, normalizePatternFill, type PatternCanvasContext } from '../src/adapters/openlayers/style/pattern.js';
import type { PatternFillSpec, StyleSpec } from '../src/core/style/types.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

const iconSource = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="24"/%3E';

function styleFunction(style: StyleLike): StyleFunction {
  expect(typeof style).toBe('function');
  return style as StyleFunction;
}

function render(compiler: StyleCompiler, spec: StyleSpec, feature: Feature | RenderFeature, resolution = 1): Style[] {
  const output = styleFunction(compiler.compile(spec))(feature, resolution);
  if (output === undefined) return [];
  return Array.isArray(output) ? output : [output];
}

function point(coordinate: [number, number] = [0, 0]): Feature<Point> {
  return new Feature(new Point(coordinate));
}

function line(
  coordinates: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10]
  ]
): Feature<LineString> {
  return new Feature(new LineString(coordinates));
}

function geometryCoordinate(style: Style): number[] | undefined {
  const geometry = style.getGeometry();
  return geometry instanceof Point ? geometry.getCoordinates() : undefined;
}

interface CanvasHarness {
  readonly context: PatternCanvasContext;
  readonly pattern: CanvasPattern;
  readonly fillRect: ReturnType<typeof vi.fn>;
  readonly stroke: ReturnType<typeof vi.fn>;
  readonly fill: ReturnType<typeof vi.fn>;
  readonly arc: ReturnType<typeof vi.fn>;
  readonly moveTo: ReturnType<typeof vi.fn>;
  readonly lineTo: ReturnType<typeof vi.fn>;
  readonly createPattern: ReturnType<typeof vi.fn>;
}

function canvasHarness(): CanvasHarness {
  const pattern = { kind: 'canvas-pattern' } as unknown as CanvasPattern;
  const canvas = { width: 0, height: 0 };
  const fillRect = vi.fn();
  const stroke = vi.fn();
  const fill = vi.fn();
  const arc = vi.fn();
  const moveTo = vi.fn();
  const lineTo = vi.fn();
  const createPattern = vi.fn(() => pattern);
  const context = {
    canvas,
    beginPath: vi.fn(),
    moveTo,
    lineTo,
    stroke,
    arc,
    fill,
    fillRect,
    createPattern,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0
  } as unknown as PatternCanvasContext;
  return { context, pattern, fillRect, stroke, fill, arc, moveTo, lineTo, createPattern };
}

function compilerWithCanvas(viewRotation: () => number = () => 0): { compiler: StyleCompiler; canvases: CanvasHarness[] } {
  const canvases: CanvasHarness[] = [];
  const compiler = new StyleCompiler(new NativeRefRegistry(), {
    getViewRotation: viewRotation,
    createCanvasContext: (width, height) => {
      const harness = canvasHarness();
      (harness.context.canvas as { width: number; height: number }).width = width;
      (harness.context.canvas as { width: number; height: number }).height = height;
      canvases.push(harness);
      return harness.context;
    }
  });
  return { compiler, canvases };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

describe('StyleCompiler', () => {
  coversCapabilities(
    'style-stroke-basic',
    'style-stroke-dash',
    'style-stroke-fit-pattern-once',
    'style-layered-outline',
    'style-fill-solid',
    'style-fill-pattern',
    'style-label-full',
    'style-icon-full',
    'style-screen-stable-offset',
    'style-native-feature-override',
    'style-polyline-static-arrow',
    'utils-pattern-fill-normalize',
    'utils-pattern-fill-render'
  );

  it('compiles circle points and every icon option from frozen structured input', () => {
    const { compiler } = compilerWithCanvas();
    const circleStyles = render(
      compiler,
      {
        symbol: {
          type: 'circle',
          radius: 7,
          fill: { type: 'solid', color: [22, 119, 255, 0.5] },
          stroke: { color: '#ffffff', width: 2, lineDash: [2, 1], lineCap: 'round', lineJoin: 'bevel', miterLimit: 4 }
        },
        zIndex: 3
      },
      point()
    );
    const circle = circleStyles[0].getImage();
    expect(circle).toBeInstanceOf(CircleStyle);
    expect((circle as CircleStyle).getRadius()).toBe(7);
    expect((circle as CircleStyle).getFill()?.getColor()).toEqual([22, 119, 255, 0.5]);
    expect((circle as CircleStyle).getStroke()?.getLineDash()).toEqual([2, 1]);
    expect(circleStyles[0].getZIndex()).toBe(3);

    const spec = deepFreeze<StyleSpec>({
      symbol: {
        type: 'icon',
        src: iconSource,
        size: [32, 24],
        color: [10, 20, 30, 0.5],
        offset: [3, 4],
        displacement: [6, 8],
        scale: [1.5, 0.75],
        rotation: 30,
        rotateWithView: false,
        anchor: [2, 3],
        anchorOrigin: 'bottom-right',
        anchorXUnits: 'pixels',
        anchorYUnits: 'pixels',
        origin: 'top-right',
        opacity: 0.6,
        crossOrigin: 'anonymous'
      }
    });
    const icon = render(compiler, spec, point())[0].getImage();

    expect(icon).toBeInstanceOf(Icon);
    expect((icon as Icon).getSrc()).toBe(iconSource);
    expect((icon as Icon).getSize()).toEqual([32, 24]);
    expect((icon as Icon).getColor()).toEqual([10, 20, 30, 0.5]);
    expect((icon as Icon).getOpacity()).toBe(0.6);
    expect((icon as Icon).getScale()).toEqual([1.5, 0.75]);
    expect((icon as Icon).getRotation()).toBeCloseTo(Math.PI / 6);
    expect((icon as Icon).getRotateWithView()).toBe(false);
    const displacement = (icon as Icon).getDisplacement();
    const anchor = (icon as Icon).getAnchor();
    expect(anchor?.[0]).toBeCloseTo(30 - displacement[0] / 1.5);
    expect(anchor?.[1]).toBeCloseTo(21 + displacement[1] / 0.75);
    expect((icon as Icon).getOrigin()).toBeNull();
  });

  it('composes split fonts, background styles, padding, angles, and screen-space offsets', () => {
    let viewRotation = Math.PI / 2;
    const { compiler } = compilerWithCanvas(() => viewRotation);
    const spec: StyleSpec = {
      symbol: {
        type: 'icon',
        src: iconSource,
        displacement: [10, 5],
        rotation: 90,
        rotateWithView: true
      },
      text: {
        text: 'screen',
        font: '99px ignored',
        fontFamily: 'Inter, sans-serif',
        fontSize: 14,
        fontWeight: 'bold',
        fontStyle: 'italic',
        fill: { type: 'solid', color: '#111111' },
        stroke: { color: '#ffffff', width: 2 },
        backgroundFill: { type: 'solid', color: '#eeeeee' },
        backgroundStroke: { color: '#333333', width: 1 },
        padding: [1, 2, 3, 4],
        offsetX: 10,
        offsetY: 5,
        scale: [1, 1.25],
        textAlign: 'right',
        textBaseline: 'alphabetic',
        rotation: 90,
        rotateWithView: true,
        overflow: true,
        placement: 'line',
        maxAngle: 45,
        repeat: 80,
        justify: 'left',
        keepUpright: false
      }
    };

    const first = render(compiler, spec, point())[0];
    const icon = first.getImage() as Icon;
    const text = first.getText();

    expect(icon.getDisplacement()[0]).toBeCloseTo(-10);
    expect(icon.getDisplacement()[1]).toBeCloseTo(-5);
    expect(text?.getOffsetX()).toBeCloseTo(-10);
    expect(text?.getOffsetY()).toBeCloseTo(5);
    expect(text?.getFont()).toBe('italic bold 14px Inter, sans-serif');
    expect(text?.getFill()?.getColor()).toBe('#111111');
    expect(text?.getStroke()?.getColor()).toBe('#ffffff');
    expect(text?.getBackgroundFill()?.getColor()).toBe('#eeeeee');
    expect(text?.getBackgroundStroke()?.getColor()).toBe('#333333');
    expect(text?.getPadding()).toEqual([1, 2, 3, 4]);
    expect(text?.getScale()).toEqual([1, 1.25]);
    expect(text?.getTextAlign()).toBe('right');
    expect(text?.getTextBaseline()).toBe('alphabetic');
    expect(text?.getRotation()).toBeCloseTo(Math.PI / 2);
    expect(text?.getMaxAngle()).toBeCloseTo(Math.PI / 4);
    expect(text?.getRepeat()).toBe(80);
    expect(text?.getJustify()).toBe('left');
    expect(text?.getKeepUpright()).toBe(false);

    viewRotation = Math.PI;
    const changedView = render(compiler, spec, point())[0];
    expect(changedView.getImage()).not.toBe(icon);

    const noViewCompensation = render(
      compiler,
      {
        symbol: { type: 'icon', src: iconSource, displacement: [10, 5], rotation: 90, rotateWithView: false },
        text: { text: 'fixed', offsetX: 10, offsetY: 5, rotation: 90, rotateWithView: false }
      },
      point()
    )[0];
    expect((noViewCompensation.getImage() as Icon).getDisplacement()[0]).toBeCloseTo(-5);
    expect((noViewCompensation.getImage() as Icon).getDisplacement()[1]).toBeCloseTo(10);
    expect(noViewCompensation.getText()?.getOffsetX()).toBeCloseTo(-5);
    expect(noViewCompensation.getText()?.getOffsetY()).toBeCloseTo(-10);
  });

  it('orders multiple strokes back-to-front and keeps fill, symbol, and text only on the foreground style', () => {
    const { compiler } = compilerWithCanvas();
    const styles = render(
      compiler,
      {
        strokes: [
          { color: '#000000', width: 12 },
          { color: '#ffffff', width: 7 },
          { color: '#1677ff', width: 3 }
        ],
        fill: { type: 'solid', color: '#1677ff33' },
        symbol: { type: 'circle', radius: 5, fill: { type: 'solid', color: '#1677ff' } },
        text: { text: 'foreground' },
        zIndex: 10
      },
      new Feature(
        new Polygon([
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 0]
          ]
        ])
      )
    );

    expect(styles.map((style) => style.getStroke()?.getColor())).toEqual(['#000000', '#ffffff', '#1677ff']);
    expect(styles.map((style) => style.getZIndex())).toEqual([10, 10, 10]);
    expect(styles[0].getFill()).toBeNull();
    expect(styles[0].getImage()).toBeNull();
    expect(styles[0].getText()).toBeNull();
    expect(styles[1].getFill()).toBeNull();
    expect(styles[2].getFill()?.getColor()).toBe('#1677ff33');
    expect(styles[2].getImage()).toBeInstanceOf(CircleStyle);
    expect(styles[2].getText()?.getText()).toBe('foreground');

    expect(render(compiler, { fill: { type: 'solid', color: '#f00' } }, point())).toHaveLength(1);
  });

  it('normalizes and draws every pattern variant with color inheritance and defaults', () => {
    const { compiler, canvases } = compilerWithCanvas();
    const variants = ['diagonal', 'cross', 'dot', 'horizontal', 'vertical'] as const;

    for (const pattern of variants) {
      const styles = render(
        compiler,
        {
          strokes: [{ color: '#111111', width: 8 }, { width: 4 }, { color: [22, 119, 255, 0.5], width: 2 }],
          fill: { type: 'pattern', pattern }
        },
        new Feature(
          new Polygon([
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 0]
            ]
          ])
        )
      );
      expect(styles.at(-1)?.getFill()?.getColor()).toBe(canvases.at(-1)?.pattern);
      expect(canvases.at(-1)?.context.strokeStyle).toBe('rgba(22, 119, 255, 0.5)');
    }

    const invalid: PatternFillSpec = {
      type: 'pattern',
      pattern: 'dot',
      color: [255, 0, 0],
      size: 30,
      lineWidth: 0,
      dotRadius: Number.NaN,
      backgroundColor: [255, 255, 255, 0.25]
    };
    const normalized = normalizePatternFill(invalid);
    expect(normalized).toMatchObject({
      pattern: 'dot',
      color: 'rgba(255, 0, 0, 1)',
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      size: 16,
      lineWidth: 1,
      dotRadius: 1.5
    });
    const harness = canvasHarness();
    expect(createPatternFill(invalid, undefined, () => harness.context)).toBe(harness.pattern);
    expect(harness.fillRect).toHaveBeenCalledWith(0, 0, 16, 16);
    expect(harness.arc).toHaveBeenCalledWith(8, 8, 1.5, 0, Math.PI * 2);

    for (const pattern of variants) {
      const drawHarness = canvasHarness();
      drawPatternFill(drawHarness.context, normalizePatternFill({ type: 'pattern', pattern }));
      if (pattern === 'dot') expect(drawHarness.fill).toHaveBeenCalledTimes(1);
      else expect(drawHarness.stroke).toHaveBeenCalled();
    }
  });

  it('inherits circle pattern color from its own stroke, the foreground stroke, then black', () => {
    const { compiler, canvases } = compilerWithCanvas();

    render(
      compiler,
      {
        strokes: [{ color: '#background' }, { color: '#foreground' }, { width: 2 }],
        symbol: {
          type: 'circle',
          radius: 6,
          fill: { type: 'pattern', pattern: 'dot' },
          stroke: { color: '#circle' }
        }
      },
      point()
    );
    expect(canvases.at(-1)?.context.strokeStyle).toBe('#circle');

    render(
      compiler,
      {
        strokes: [{ color: '#background' }, { color: '#foreground' }, { width: 2 }],
        symbol: {
          type: 'circle',
          radius: 6,
          fill: { type: 'pattern', pattern: 'dot' },
          stroke: { width: 1 }
        }
      },
      point()
    );
    expect(canvases.at(-1)?.context.strokeStyle).toBe('#foreground');

    render(
      compiler,
      {
        symbol: {
          type: 'circle',
          radius: 6,
          fill: { type: 'pattern', pattern: 'dot' }
        }
      },
      point()
    );
    expect(canvases.at(-1)?.context.strokeStyle).toBe('#000000');
  });

  it('uses an OffscreenCanvas structurally when no document is available', () => {
    const harness = canvasHarness();
    class FakeOffscreenCanvas {
      readonly width: number;
      readonly height: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }

      getContext(kind: string): PatternCanvasContext | null {
        return kind === '2d' ? harness.context : null;
      }
    }
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    try {
      expect(createPatternFill({ type: 'pattern', pattern: 'dot' })).toBe(harness.pattern);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fits one complete dash cycle to rendered path length with positive safe values', () => {
    const { compiler } = compilerWithCanvas();
    const feature = line([
      [0, 0],
      [60, 0],
      [60, 40]
    ]);
    const spec: StyleSpec = { strokes: [{ color: '#f00', width: 2, lineDash: [2, 3], fitPatternOnce: true }] };

    const dashAtTwo = render(compiler, spec, feature, 2)[0].getStroke()?.getLineDash() ?? [];
    const dashAtFour = render(compiler, spec, feature, 4)[0].getStroke()?.getLineDash() ?? [];

    expect(dashAtTwo.reduce((sum, value) => sum + value, 0)).toBeCloseTo(50);
    expect(dashAtTwo[1] / dashAtTwo[0]).toBeCloseTo(1.5);
    expect(dashAtFour.reduce((sum, value) => sum + value, 0)).toBeCloseTo(25);
    expect(dashAtFour.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
  });

  it('duplicates an odd dash array before fitting one complete canvas cycle', () => {
    const { compiler } = compilerWithCanvas();
    const feature = line([
      [0, 0],
      [60, 0]
    ]);
    const dash = render(compiler, { strokes: [{ color: '#f00', lineDash: [1, 2, 3], fitPatternOnce: true }] }, feature, 2)[0]
      .getStroke()
      ?.getLineDash();

    expect(dash).toEqual([2.5, 5, 7.5, 2.5, 5, 7.5]);
    expect(dash?.reduce((sum, value) => sum + value, 0)).toBeCloseTo(30);
  });

  it('places start, end, per-segment, repeated, and custom-icon arrows without mutating base geometry', () => {
    const { compiler } = compilerWithCanvas();
    const feature = line();
    const geometry = feature.getGeometry();
    const base: StyleSpec = { strokes: [{ color: '#1677ff', width: 3 }] };

    const start = render(compiler, { ...base, decorations: [{ type: 'arrow', placement: 'start' }] }, feature);
    const end = render(compiler, { ...base, decorations: [{ type: 'arrow', placement: 'end' }] }, feature);
    const segments = render(compiler, { ...base, decorations: [{ type: 'arrow', placement: 'each-segment' }] }, feature);
    const repeated = render(compiler, { ...base, decorations: [{ type: 'arrow', placement: 'repeat', offset: 2, spacing: 5 }] }, feature, 1);
    const custom = render(
      compiler,
      {
        ...base,
        decorations: [{ type: 'arrow', placement: 'end', symbol: { type: 'icon', src: iconSource, scale: 2 } }]
      },
      feature
    );

    expect(geometryCoordinate(start[1])).toEqual([0, 0]);
    expect(geometryCoordinate(end[1])).toEqual([10, 10]);
    expect(segments.slice(1).map(geometryCoordinate)).toEqual([
      [10, 0],
      [10, 10]
    ]);
    expect(repeated.slice(1).map(geometryCoordinate)).toEqual([
      [2, 0],
      [7, 0],
      [10, 2],
      [10, 7]
    ]);
    expect(start[1].getImage()).toBeInstanceOf(RegularShape);
    expect((start[1].getImage() as RegularShape).getFill()?.getColor() as string).toBe('#1677ff');
    expect((start[1].getImage() as RegularShape).getRotation()).toBeCloseTo(-Math.PI / 2);
    expect((end[1].getImage() as RegularShape).getRotation()).toBeCloseTo(0);
    expect(custom[1].getImage()).toBeInstanceOf(Icon);
    expect((custom[1].getImage() as Icon).getColor()).toEqual([22, 119, 255, 1]);
    expect(feature.getGeometry()).toBe(geometry);
    expect(render(compiler, { ...base, decorations: [{ type: 'arrow', placement: 'end' }] }, point())).toHaveLength(1);
  });

  it('uses repeat defaults and rejects unsafe arrow spacing or offsets', () => {
    const { compiler } = compilerWithCanvas();
    const feature = line();
    const defaults = render(compiler, { strokes: [{ color: '#f00' }], decorations: [{ type: 'arrow', placement: 'repeat' }] }, feature, 1);

    expect(defaults.slice(1).map(geometryCoordinate)).toEqual([[0, 0]]);
    expect(() => compiler.compile({ decorations: [{ type: 'arrow', placement: 'repeat', spacing: 0 }] })).toThrow(InvalidArgumentError);
    expect(() => compiler.compile({ decorations: [{ type: 'arrow', placement: 'repeat', spacing: -1 }] })).toThrow(InvalidArgumentError);
    expect(() => compiler.compile({ decorations: [{ type: 'arrow', placement: 'repeat', offset: -1 }] })).toThrow(InvalidArgumentError);
  });

  it('只在几何或分辨率依赖发生变化时重建样式', () => {
    let viewRotation = 0;
    const getViewRotation = vi.fn(() => viewRotation);
    const { compiler } = compilerWithCanvas(getViewRotation);
    const spec: StyleSpec = {
      strokes: [{ color: '#f00', lineDash: [2, 2], fitPatternOnce: true }],
      decorations: [{ type: 'arrow', placement: 'end' }]
    };
    const firstFeature = line();
    const secondFeature = line();
    const compiled = styleFunction(compiler.compile(spec));

    const first = compiled(firstFeature, 1) as Style[];
    expect(compiled(firstFeature, 1)).toBe(first);
    const other = compiled(secondFeature, 1) as Style[];
    expect(other).not.toBe(first);
    expect(other[0]).not.toBe(first[0]);

    firstFeature.changed();
    const featureChanged = compiled(firstFeature, 1) as Style[];
    expect(featureChanged).toBe(first);

    firstFeature.getGeometry()?.setCoordinates([
      [0, 0],
      [20, 0]
    ]);
    const geometryChanged = compiled(firstFeature, 1) as Style[];
    expect(geometryChanged).not.toBe(featureChanged);
    expect(geometryCoordinate(geometryChanged.at(-1) as Style)).toEqual([20, 0]);

    const resolutionChanged = compiled(firstFeature, 2) as Style[];
    expect(resolutionChanged).not.toBe(geometryChanged);

    firstFeature.setGeometry(
      new LineString([
        [0, 0],
        [40, 0]
      ])
    );
    const geometryReplaced = compiled(firstFeature, 2) as Style[];
    expect(geometryReplaced).not.toBe(resolutionChanged);
    expect(geometryCoordinate(geometryReplaced.at(-1) as Style)).toEqual([40, 0]);

    viewRotation = Math.PI / 3;
    const viewChanged = compiled(firstFeature, 2) as Style[];
    expect(viewChanged).toBe(geometryReplaced);
    expect(getViewRotation).not.toHaveBeenCalled();
  });

  it('要素、几何、分辨率和视图变化时复用静态样式对象', () => {
    let viewRotation = 0;
    const getViewRotation = vi.fn(() => viewRotation);
    const { compiler, canvases } = compilerWithCanvas(getViewRotation);
    const feature = line([
      [0, 0],
      [10, 0]
    ]);
    const originalGeometry = feature.getGeometry();
    const getCoordinates = vi.spyOn(originalGeometry, 'getCoordinates');
    const compiled = styleFunction(
      compiler.compile({
        strokes: [{ color: '#000', width: 2 }],
        fill: { type: 'pattern', pattern: 'dot', color: '#1677ff' },
        symbol: { type: 'icon', src: iconSource, rotateWithView: true },
        text: { text: 'static', rotateWithView: true }
      })
    );

    const first = compiled(feature, 1) as Style[];
    expect(
      compiled(
        line([
          [100, 100],
          [110, 110]
        ]),
        1
      )
    ).toBe(first);
    feature.changed();
    expect(compiled(feature, 1)).toBe(first);
    originalGeometry.setCoordinates([
      [0, 0],
      [30, 0]
    ]);
    expect(compiled(feature, 2)).toBe(first);
    feature.setGeometry(
      new LineString([
        [100, 100],
        [200, 200]
      ])
    );
    viewRotation = Math.PI / 2;
    expect(compiled(feature, 4)).toBe(first);

    expect(canvases).toHaveLength(1);
    expect(getCoordinates).not.toHaveBeenCalled();
    expect(getViewRotation).not.toHaveBeenCalled();
  });

  it('重复箭头随分辨率重建且不读取视图旋转', () => {
    const getViewRotation = vi.fn(() => Math.PI / 2);
    const { compiler } = compilerWithCanvas(getViewRotation);
    const feature = line([
      [0, 0],
      [20, 0]
    ]);
    const compiled = styleFunction(compiler.compile({ strokes: [{ color: '#000' }], decorations: [{ type: 'arrow', placement: 'repeat', spacing: 5 }] }));

    const atOne = compiled(feature, 1) as Style[];
    expect(compiled(feature, 1)).toBe(atOne);
    const atTwo = compiled(feature, 2) as Style[];
    expect(atTwo).not.toBe(atOne);
    expect(atOne.slice(1).map(geometryCoordinate)).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [15, 0],
      [20, 0]
    ]);
    expect(atTwo.slice(1).map(geometryCoordinate)).toEqual([
      [0, 0],
      [10, 0],
      [20, 0]
    ]);
    expect(getViewRotation).not.toHaveBeenCalled();
  });

  it('视图旋转时只重建具有屏幕偏移的样式', () => {
    let viewRotation = 0;
    const getViewRotation = vi.fn(() => viewRotation);
    const { compiler } = compilerWithCanvas(getViewRotation);
    const feature = point();
    const compiled = styleFunction(
      compiler.compile({
        symbol: { type: 'icon', src: iconSource, displacement: [10, 5], rotateWithView: true },
        text: { text: 'offset', offsetX: 6, offsetY: 2, rotateWithView: true }
      })
    );

    const first = compiled(feature, 1) as Style[];
    expect(compiled(feature, 2)).toBe(first);
    viewRotation = Math.PI / 2;
    const rotated = compiled(feature, 2) as Style[];
    expect(rotated).not.toBe(first);
    expect((rotated[0].getImage() as Icon).getDisplacement()[0]).toBeCloseTo(-5);
    expect((rotated[0].getImage() as Icon).getDisplacement()[1]).toBeCloseTo(10);
    expect(rotated[0].getText()?.getOffsetX()).toBeCloseTo(-2);
    expect(rotated[0].getText()?.getOffsetY()).toBeCloseTo(-6);
    expect(getViewRotation).toHaveBeenCalledTimes(3);
  });

  it('几何或屏幕偏移旋转变化前复用自定义箭头样式', () => {
    let viewRotation = 0;
    const getViewRotation = vi.fn(() => viewRotation);
    const { compiler } = compilerWithCanvas(getViewRotation);
    const feature = line([
      [0, 0],
      [10, 0]
    ]);
    const compiled = styleFunction(
      compiler.compile({
        strokes: [{ color: '#1677ff' }],
        decorations: [{ type: 'arrow', placement: 'end', symbol: { type: 'icon', src: iconSource, displacement: [8, 0] } }]
      })
    );

    const first = compiled(feature, 1) as Style[];
    expect(compiled(feature, 2)).toBe(first);
    viewRotation = Math.PI / 2;
    const rotated = compiled(feature, 2) as Style[];
    expect(rotated).not.toBe(first);
    expect((rotated[1].getImage() as Icon).getDisplacement()[0]).toBeCloseTo(0);
    expect((rotated[1].getImage() as Icon).getDisplacement()[1]).toBeCloseTo(8);
  });

  it('does not read Feature coordinates for geometry-independent styles', () => {
    const { compiler } = compilerWithCanvas();
    const feature = line();
    const geometry = feature.getGeometry();
    const getCoordinates = vi.spyOn(geometry, 'getCoordinates');
    const compiled = styleFunction(compiler.compile({ strokes: [{ color: '#000', width: 2 }] }));

    const first = compiled(feature, 1) as Style[];
    expect(compiled(feature, 1)).toBe(first);
    expect(getCoordinates).not.toHaveBeenCalled();
  });

  it('extracts one path per compile when fit dashes and arrows both need geometry', () => {
    const { compiler } = compilerWithCanvas();
    const feature = line();
    const getCoordinates = vi.spyOn(feature.getGeometry(), 'getCoordinates');
    const compiled = styleFunction(
      compiler.compile({
        strokes: [{ color: '#000', lineDash: [2, 2], fitPatternOnce: true }],
        decorations: [{ type: 'arrow', placement: 'end' }]
      })
    );

    const first = compiled(feature, 1) as Style[];
    expect(getCoordinates).toHaveBeenCalledTimes(1);
    expect(compiled(feature, 1)).toBe(first);
    expect(getCoordinates).toHaveBeenCalledTimes(1);
  });

  it('caches static RenderFeature styles without reading flat coordinates', () => {
    const { compiler } = compilerWithCanvas();
    const renderFeature = new RenderFeature('LineString', [0, 0, 10, 0, 10, 10], [6], 2, {}, 'render-line');
    const getGeometry = vi.spyOn(renderFeature, 'getGeometry');
    const getFlatCoordinates = vi.spyOn(renderFeature, 'getFlatCoordinates');
    const getEnds = vi.spyOn(renderFeature, 'getEnds');
    const compiled = styleFunction(compiler.compile({ strokes: [{ color: '#000', width: 2 }] }));

    const styles = compiled(renderFeature, 1) as Style[];
    expect(styles[0].getStroke()?.getColor()).toBe('#000');
    expect(compiled(renderFeature, 1)).toBe(styles);
    expect(getGeometry).not.toHaveBeenCalled();
    expect(getFlatCoordinates).not.toHaveBeenCalled();
    expect(getEnds).not.toHaveBeenCalled();
  });

  it('does not cache fitPatternOnce for a RenderFeature without revisions', () => {
    const { compiler } = compilerWithCanvas();
    const renderFeature = new RenderFeature('LineString', [0, 0, 10, 0, 10, 10], [6], 2, {}, 'render-line');
    const getFlatCoordinates = vi.spyOn(renderFeature, 'getFlatCoordinates');
    const compiled = styleFunction(compiler.compile({ strokes: [{ color: '#000', lineDash: [2, 2], fitPatternOnce: true }] }));

    const first = compiled(renderFeature, 1) as Style[];
    const second = compiled(renderFeature, 1) as Style[];
    expect(second).not.toBe(first);
    expect(getFlatCoordinates).toHaveBeenCalledTimes(2);
  });

  it('recompiles RenderFeature arrows and observes public ends changes without a coordinate fingerprint', () => {
    const { compiler } = compilerWithCanvas();
    const renderFeature = new RenderFeature('MultiLineString', [0, 0, 10, 0, 20, 0, 30, 0], [4, 8], 2, {}, 'render-lines');
    const ends = renderFeature.getEnds();
    expect(ends).not.toBeNull();
    const getFlatCoordinates = vi.spyOn(renderFeature, 'getFlatCoordinates');
    const compiled = styleFunction(compiler.compile({ strokes: [{ color: '#000', width: 2 }], decorations: [{ type: 'arrow', placement: 'end' }] }));

    const first = compiled(renderFeature, 1) as Style[];
    expect(first.slice(1).map(geometryCoordinate)).toEqual([
      [10, 0],
      [30, 0]
    ]);
    const unchanged = compiled(renderFeature, 1) as Style[];
    expect(unchanged).not.toBe(first);

    (ends as number[])[0] = 6;
    const changed = compiled(renderFeature, 1) as Style[];
    expect(changed).not.toBe(unchanged);
    expect(changed.slice(1).map(geometryCoordinate)).toEqual([[20, 0]]);
    expect(getFlatCoordinates).toHaveBeenCalledTimes(3);
  });

  it('resolves native styles one-way to the exact registered identity', () => {
    const registry = new NativeRefRegistry();
    const native = [new Style(), new Style()];
    const reference = registry.registerStyle(native);
    const compiler = new StyleCompiler(registry);

    expect(compiler.compile(reference)).toBe(native);
  });
});
