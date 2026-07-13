import { readdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { Color, Coordinate } from '../src/core/common/types.js';
import type { ElementState } from '../src/core/element/types.js';
import {
  CapabilityError,
  DuplicateElementIdError,
  InteractionConflictError,
  InvalidArgumentError,
  InvalidSelectorError,
  ObjectDisposedError,
  UnsupportedOperationError
} from '../src/core/errors.js';
import { createAsyncErrorReporter, type ErrorReportContext, type ErrorReporter } from '../src/core/ports/ErrorReporter.js';
import { shapeTypes, type RenderGeometryState, type ShapeState } from '../src/core/shape/types.js';
import type { ArrowDecorationSpec, NativeStyleRef, StyleSpec } from '../src/core/style/types.js';

const coreRoot = resolve('src/core');
const forbiddenDomNames = new Set([
  'Element',
  'Document',
  'Window',
  'CanvasRenderingContext2D',
  'OffscreenCanvas',
  'OffscreenCanvasRenderingContext2D',
  'CanvasGradient',
  'CanvasPattern',
  'ImageBitmap',
  'ImageData',
  'Path2D',
  'DOMRect',
  'DOMMatrix',
  'Event',
  'EventTarget',
  'UIEvent',
  'MouseEvent',
  'PointerEvent',
  'KeyboardEvent',
  'WheelEvent',
  'TouchEvent',
  'DragEvent',
  'FocusEvent',
  'InputEvent',
  'ClipboardEvent',
  'CustomEvent',
  'AnimationEvent',
  'BeforeUnloadEvent',
  'CompositionEvent',
  'ErrorEvent',
  'FormDataEvent',
  'HashChangeEvent',
  'MessageEvent',
  'PageTransitionEvent',
  'PopStateEvent',
  'ProgressEvent',
  'PromiseRejectionEvent',
  'StorageEvent',
  'SubmitEvent',
  'TransitionEvent'
]);

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTypeScriptFiles(path);
      return extname(entry.name) === '.ts' ? [path] : [];
    })
  );
  return nested.flat();
}

function findForbiddenDomIdentifiers(source: string, fileName = 'core.ts'): string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      (forbiddenDomNames.has(node.text) || /^(?:HTML|SVG)[A-Za-z0-9]*Element$/.test(node.text) || /^(?:HTML)?CanvasElement$/.test(node.text))
    ) {
      matches.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...matches].sort();
}

describe('pure Core boundaries', () => {
  it('contains no OpenLayers, browser DOM/event, service, adapter, or facade dependency', async () => {
    const files = await collectTypeScriptFiles(coreRoot);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source, file).not.toMatch(/\bfrom\s+['"]ol(?:\/|['"])/);
      expect(findForbiddenDomIdentifiers(source, file), file).toEqual([]);
      expect(source, file).not.toMatch(/\b(?:document|window)\b/);
      expect(source, file).not.toMatch(/(?:^|\/)services(?:\/|$)|(?:^|\/)adapters(?:\/|$)|(?:^|\/)facade(?:\/|$)/m);
    }
  });

  it('recognizes HTML/SVG elements, canvas APIs, documents, windows, and common browser event types', () => {
    const source = [
      'type Html = HTMLDivElement;',
      'type Svg = SVGPathElement;',
      'type Canvas = OffscreenCanvasRenderingContext2D;',
      'type DocumentPort = Document;',
      'type WindowPort = Window;',
      'type Pointer = PointerEvent;',
      'type Keyboard = KeyboardEvent;',
      'type Message = MessageEvent;',
      'type Animation = AnimationEvent;'
    ].join('\n');

    expect(findForbiddenDomIdentifiers(source)).toEqual([
      'AnimationEvent',
      'Document',
      'HTMLDivElement',
      'KeyboardEvent',
      'MessageEvent',
      'OffscreenCanvasRenderingContext2D',
      'PointerEvent',
      'SVGPathElement',
      'Window'
    ]);
  });

  it('provides all stable error classes with their public names', () => {
    const errorTypes = [
      InvalidArgumentError,
      DuplicateElementIdError,
      InvalidSelectorError,
      ObjectDisposedError,
      CapabilityError,
      InteractionConflictError,
      UnsupportedOperationError
    ];

    for (const ErrorType of errorTypes) {
      const error = new ErrorType('contract failure');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(ErrorType.name);
      expect(error.message).toBe('contract failure');
    }
  });

  it('reports callback failures asynchronously through an injected reporter', async () => {
    const reports: Array<{ error: unknown; context: ErrorReportContext }> = [];
    const reporter = createAsyncErrorReporter((error, context) => reports.push({ error, context }));
    const error = new Error('callback failed');
    const context = { source: 'test', operation: 'callback' } as const;

    reporter(error, context);
    expect(reports).toEqual([]);

    await Promise.resolve();
    expect(reports).toEqual([{ error, context }]);
  });

  it('keeps the reporter port void while consuming an actual async sink rejection', async () => {
    const sinkFailure = new Error('async sink failed');
    let sinkPromise: Promise<void> | undefined;
    let catchCalls = 0;
    const sink: ErrorReporter = () => {
      sinkPromise = Promise.reject(sinkFailure);
      const nativeCatch = sinkPromise.catch.bind(sinkPromise);
      sinkPromise.catch = ((...args: Parameters<Promise<void>['catch']>) => {
        catchCalls += 1;
        return nativeCatch(...args);
      }) as Promise<void>['catch'];
      return sinkPromise;
    };
    const reporter = createAsyncErrorReporter(sink);

    reporter(sinkFailure, { source: 'test', operation: 'async-report' });
    await Promise.resolve();
    try {
      expect(catchCalls).toBe(1);
    } finally {
      await sinkPromise?.catch(() => undefined);
    }

    type ReporterResult = ReturnType<ErrorReporter>;
    const reporterResult: ReporterResult = undefined;
    expect(reporterResult).toBeUndefined();
  });

  it('freezes the complete 20-shape contract and pure render geometry values', () => {
    expect(shapeTypes).toEqual([
      'point',
      'polyline',
      'polygon',
      'circle',
      'ellipse',
      'attack-arrow',
      'tailed-attack-arrow',
      'fine-arrow',
      'tailed-squad-combat-arrow',
      'assault-direction-arrow',
      'double-arrow',
      'rectangle',
      'triangle',
      'equilateral-triangle',
      'assemble-polygon',
      'closed-curve-polygon',
      'sector',
      'lune-polygon',
      'lune-polyline',
      'curve-polyline'
    ]);
    expect(Object.isFrozen(shapeTypes)).toBe(true);

    const shape: ShapeState<'polyline'> = {
      type: 'polyline',
      controlPoints: [
        [0, 1],
        [2, 3, 4]
      ]
    };
    const renderGeometry: RenderGeometryState = { type: 'polyline', coordinates: shape.controlPoints };
    expect(renderGeometry.coordinates).toEqual(shape.controlPoints);

    const circle: ShapeState<'circle'> = { type: 'circle', center: [4, 5], radius: 6 };
    type CircleHasControlPoints = 'controlPoints' extends keyof ShapeState<'circle'> ? true : false;
    const circleHasControlPoints: CircleHasControlPoints = false;
    expect(circle).toEqual({ type: 'circle', center: [4, 5], radius: 6 });
    expect(circleHasControlPoints).toBe(false);
  });

  it('retains the complete pure-data style capability surface', () => {
    const style = {
      symbol: {
        type: 'icon',
        src: 'marker.svg',
        size: [32, 48],
        color: '#fff',
        offset: [4, 8],
        displacement: [2, -3],
        scale: [1, 1.5],
        rotation: 30,
        rotateWithView: false,
        anchor: [0.5, 1],
        anchorOrigin: 'top-left',
        anchorXUnits: 'fraction',
        anchorYUnits: 'pixels',
        origin: 'top-right',
        opacity: 0.8,
        crossOrigin: 'anonymous'
      },
      strokes: [
        {
          color: '#000',
          width: 6,
          lineDash: [8, 4],
          lineDashOffset: 2,
          lineCap: 'round',
          lineJoin: 'miter',
          miterLimit: 10,
          fitPatternOnce: true
        },
        { color: '#fff', width: 2 }
      ],
      fill: {
        type: 'pattern',
        pattern: 'dot',
        color: '#f00',
        size: 16,
        lineWidth: 2,
        dotRadius: 3,
        backgroundColor: '#fff'
      },
      text: {
        text: 'label',
        font: 'italic 600 16px sans-serif',
        fontFamily: 'sans-serif',
        fontSize: 16,
        fontWeight: 600,
        fontStyle: 'italic',
        fill: { type: 'solid', color: '#222' },
        stroke: { color: '#fff', width: 3 },
        backgroundFill: { type: 'solid', color: '#eee' },
        backgroundStroke: { color: '#333', width: 1 },
        padding: [2, 4, 2, 4],
        offsetX: 5,
        offsetY: -6,
        scale: [1, 1.2],
        textAlign: 'center',
        textBaseline: 'middle',
        rotation: 15,
        rotateWithView: false,
        overflow: true,
        placement: 'line',
        maxAngle: 45,
        repeat: 120,
        justify: 'center',
        keepUpright: true
      },
      decorations: [
        {
          type: 'arrow',
          placement: 'end',
          symbol: {
            type: 'icon',
            src: 'custom-arrow.svg',
            size: [24, 16],
            color: '#0f0',
            offset: [1, 2],
            displacement: [3, 4],
            scale: [1, 1.5],
            rotation: 10,
            rotateWithView: true,
            anchor: [0.5, 0.5],
            anchorOrigin: 'bottom-right',
            anchorXUnits: 'pixels',
            anchorYUnits: 'fraction',
            origin: 'bottom-left',
            opacity: 0.75,
            crossOrigin: 'anonymous'
          },
          offset: 4,
          spacing: 40
        }
      ],
      zIndex: 7
    } satisfies StyleSpec;

    const circleStyle = {
      symbol: {
        type: 'circle',
        radius: 6,
        fill: { type: 'solid', color: [255, 0, 0, 0.5] },
        stroke: { color: '#fff', width: 2 }
      }
    } satisfies StyleSpec;

    expect(style.symbol.anchor).toEqual([0.5, 1]);
    expect(style.strokes).toHaveLength(2);
    expect(style.fill.pattern).toBe('dot');
    expect(style.text.backgroundFill.color).toBe('#eee');
    expect(style.decorations[0].placement).toBe('end');
    expect(style.decorations[0].symbol.anchorOrigin).toBe('bottom-right');
    expect(circleStyle.symbol.radius).toBe(6);

    type FlatArrowAppearanceKey = 'src' | 'color' | 'size' | 'rotation' | 'rotateWithView';
    type ArrowHasFlatAppearance = Extract<FlatArrowAppearanceKey, keyof ArrowDecorationSpec> extends never ? false : true;
    const arrowHasFlatAppearance: ArrowHasFlatAppearance = false;
    expect(arrowHasFlatAppearance).toBe(false);
  });

  it('keeps StyleSpec data mutable while ElementState and Coordinate retain their intended readonly boundaries', () => {
    const style: StyleSpec = {
      symbol: { type: 'icon', src: 'marker.svg', offset: [1, 2], origin: 'top-left' },
      strokes: [{ color: [1, 2, 3, 0.5], width: 2, lineDash: [4, 2] }],
      fill: { type: 'solid', color: [4, 5, 6] },
      text: { text: 'mutable', padding: [1, 2, 3, 4] },
      decorations: [],
      zIndex: 1
    };

    const firstStroke = style.strokes?.[0];
    if (firstStroke === undefined || firstStroke.lineDash === undefined || style.strokes === undefined) throw new Error('Expected mutable stroke fixtures');
    if (style.fill?.type !== 'solid' || typeof style.fill.color === 'string') throw new Error('Expected a mutable tuple color fixture');

    style.zIndex = 2;
    firstStroke.width = 3;
    style.strokes.push({ width: 1 });
    firstStroke.lineDash.push(1);
    if (style.symbol?.type === 'icon') style.symbol.offset = [3, 4];
    const color: Exclude<Color, string> = style.fill.color;
    color[0] = 9;

    expect(style.zIndex).toBe(2);
    expect(style.strokes).toHaveLength(2);
    expect(firstStroke.lineDash).toEqual([4, 2, 1]);
    expect(style.symbol?.type === 'icon' ? style.symbol.offset : undefined).toEqual([3, 4]);
    expect(color[0]).toBe(9);

    type CoordinateIsMutableTuple = Coordinate extends [number, number] | [number, number, number] ? true : false;
    type TypeEqual<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
    type ElementStyleIsReadonly = TypeEqual<Pick<ElementState, 'style'>, Readonly<Pick<ElementState, 'style'>>>;
    type NativeStyleBrandIsReadonly = TypeEqual<NativeStyleRef, Readonly<NativeStyleRef>>;
    const coordinateIsMutableTuple: CoordinateIsMutableTuple = false;
    const elementStyleIsReadonly: ElementStyleIsReadonly = true;
    const nativeStyleBrandIsReadonly: NativeStyleBrandIsReadonly = true;
    expect({ coordinateIsMutableTuple, elementStyleIsReadonly, nativeStyleBrandIsReadonly }).toEqual({
      coordinateIsMutableTuple: false,
      elementStyleIsReadonly: true,
      nativeStyleBrandIsReadonly: true
    });
  });
});
