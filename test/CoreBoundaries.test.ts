import { readdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CapabilityError,
  DuplicateElementIdError,
  InteractionConflictError,
  InvalidArgumentError,
  InvalidSelectorError,
  ObjectDisposedError,
  UnsupportedOperationError
} from '../src/core/errors.js';
import { createAsyncErrorReporter, type ErrorReportContext } from '../src/core/ports/ErrorReporter.js';
import { shapeTypes, type RenderGeometryState, type ShapeState } from '../src/core/shape/types.js';
import type { ArrowDecorationSpec, StyleSpec } from '../src/core/style/types.js';

const coreRoot = resolve('src/core');

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

describe('pure Core boundaries', () => {
  it('contains no OpenLayers, browser-global, service, adapter, or facade dependency', async () => {
    const files = await collectTypeScriptFiles(coreRoot);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source, file).not.toMatch(/\bfrom\s+['"]ol(?:\/|['"])/);
      expect(source, file).not.toMatch(/\b(?:HTMLElement|document|window)\b/);
      expect(source, file).not.toMatch(/(?:^|\/)services(?:\/|$)|(?:^|\/)adapters(?:\/|$)|(?:^|\/)facade(?:\/|$)/m);
    }
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
        origin: [0, 0],
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
            origin: [5, 6],
            opacity: 0.75,
            crossOrigin: 'anonymous'
          },
          offset: 4,
          spacing: 40
        }
      ],
      zIndex: 7
    } as const satisfies StyleSpec;

    const circleStyle = {
      symbol: {
        type: 'circle',
        radius: 6,
        fill: { type: 'solid', color: [255, 0, 0, 0.5] },
        stroke: { color: '#fff', width: 2 }
      }
    } as const satisfies StyleSpec;

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
});
