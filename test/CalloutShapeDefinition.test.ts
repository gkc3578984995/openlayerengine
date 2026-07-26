import { describe, expect, it } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { calloutDefinition } from '../src/builtins/shapes/callout.js';
import type { Coordinate, Pixel } from '../src/core/common/types.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { ShapePresentationContext, ShapeState } from '../src/core/shape/types.js';
import type { StyleSpec } from '../src/core/style/types.js';
import { StyleService } from '../src/services/style/StyleService.js';

const context: ShapePresentationContext = Object.freeze({
  toPixel: (coordinate: Coordinate): Pixel => [coordinate[0], -coordinate[1]],
  toCoordinate: (pixel: Pixel, template?: Coordinate): Coordinate => (template?.length === 3 ? [pixel[0], -pixel[1], template[2]] : [pixel[0], -pixel[1]]),
  measureTextWidth: (_font, text) => Array.from(text).length * 10,
  measureTextHeight: () => 20,
  getResolution: () => 1
});

const style: StyleSpec = {
  fill: { type: 'solid', color: '#ffffff' },
  strokes: [{ color: '#111111', width: 2 }],
  text: {
    text: '测试 callout text',
    fontSize: 16,
    padding: [8, 12, 8, 12],
    maxWidth: 80,
    fill: { type: 'solid', color: '#111111' }
  }
};

const autoFitStyle: StyleSpec = {
  text: { text: 'ABCDEFGHIJKL', fontSize: 10, padding: [0, 0, 0, 0] }
};

function unmaterializedDraft(anchor: Coordinate = [0, 0], center: Coordinate = [100, 50]): ShapeState<'callout'> {
  const state = calloutDefinition.createDraft([anchor, center]);
  if (state === undefined) throw new Error('Callout draft should be available after two points');
  return state;
}

function draft(anchor: Coordinate = [0, 0], center: Coordinate = [100, 50]): ShapeState<'callout'> {
  const materialize = calloutDefinition.presentation?.materialize;
  if (materialize === undefined) throw new Error('Callout must expose a materialize provider');
  return materialize(unmaterializedDraft(anchor, center), context);
}

function resolutionContext(resolution: number): ShapePresentationContext {
  return Object.freeze({
    ...context,
    toPixel: (coordinate: Coordinate): Pixel => [coordinate[0] / resolution, -coordinate[1] / resolution],
    toCoordinate: (pixel: Pixel, template?: Coordinate): Coordinate =>
      template?.length === 3 ? [pixel[0] * resolution, -pixel[1] * resolution, template[2]] : [pixel[0] * resolution, -pixel[1] * resolution],
    getResolution: () => resolution
  });
}

function polygonPixelSize(
  geometry: { readonly coordinates: readonly (readonly Coordinate[])[] },
  presentationContext: ShapePresentationContext
): readonly [number, number] {
  const pixels = geometry.coordinates[0].map(presentationContext.toPixel);
  const xs = pixels.map(([x]) => x);
  const ys = pixels.map(([, y]) => y);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

describe('Callout ShapeDefinition', () => {
  it('uses anchor then center, auto-finishes after two points and derives a positive CSS-pixel size from text', () => {
    expect(calloutDefinition.controlPointPolicy).toEqual({ previewMin: 2, completeMin: 2, completeMax: 2, autoFinish: 2 });
    expect(calloutDefinition.createDraft([[0, 0]])).toBeUndefined();
    const raw = unmaterializedDraft();
    expect(raw).toEqual({ type: 'callout', anchor: [0, 0], center: [100, 50], size: [0, 0] });
    const state = calloutDefinition.presentation!.materialize!(raw, context);
    expect(state).toEqual({ type: 'callout', anchor: [0, 0], center: [100, 50], size: [0, 0], referenceResolution: 1 });

    const presentation = calloutDefinition.presentation!.present(state, style, context);
    expect(presentation.state.size[0]).toBeGreaterThan(0);
    expect(presentation.state.size[1]).toBeGreaterThan(0);
    expect(presentation.geometry.type).toBe('polygon');
    if (presentation.geometry.type !== 'polygon') throw new Error('Callout must present as Polygon');
    expect(presentation.geometry.label?.coordinate).toEqual([100, 50]);
    expect(presentation.geometry.label?.text).toContain('\n');
    expect(presentation.selectionGeometry).toMatchObject({ type: 'polygon' });
    if (presentation.selectionGeometry?.type !== 'polygon') throw new Error('Callout must expose a frame-only selection Polygon');
    expect(presentation.selectionGeometry.label).toBeUndefined();
    expect(presentation.selectionGeometry.coordinates[0]).not.toContainEqual([0, 0]);
    expect(style.text?.text).toBe('测试 callout text');
  });

  it('materializes one immutable reference resolution with explicit, previous-state and current-view precedence', () => {
    const materialize = calloutDefinition.presentation!.materialize!;
    const anchor = [0, 0];
    const center = [100, 50];
    const size = [120, 40];
    const previous = materialize({ type: 'callout', anchor, center, size, referenceResolution: 3 }, resolutionContext(7));
    const explicit = materialize({ type: 'callout', anchor, center, size, referenceResolution: 5 }, resolutionContext(7), previous);
    const inherited = materialize({ type: 'callout', anchor, center, size }, resolutionContext(7), previous);
    const captured = materialize({ type: 'callout', anchor, center, size }, resolutionContext(7));
    const ignoredOtherType = materialize({ type: 'callout', anchor, center, size }, resolutionContext(7), {
      type: 'point',
      controlPoints: [[1, 2]]
    } as unknown as ShapeState<'callout'>);

    expect(explicit.referenceResolution).toBe(5);
    expect(inherited.referenceResolution).toBe(3);
    expect(captured.referenceResolution).toBe(7);
    expect(ignoredOtherType.referenceResolution).toBe(7);
    expect(explicit.anchor).not.toBe(anchor);
    expect(explicit.center).not.toBe(center);
    expect(explicit.size).not.toBe(size);
    expect(Object.isFrozen(explicit)).toBe(true);
    expect(Object.isFrozen(explicit.anchor)).toBe(true);
    expect(Object.isFrozen(explicit.size)).toBe(true);

    expect(() => materialize({ type: 'callout', anchor, center, size, referenceResolution: 0 }, context)).toThrow('positive finite');
    expect(() => materialize({ type: 'callout', anchor, center, size, referenceResolution: undefined }, context)).toThrow('positive finite');
    expect(() => materialize({ type: 'callout', anchor, center, size, extra: true }, context)).toThrow('Unknown Callout field');
    expect(() => calloutDefinition.normalize({ type: 'callout', anchor, center, size })).toThrow('referenceResolution');
    expect(() => calloutDefinition.isComplete(unmaterializedDraft())).toThrow('referenceResolution');
  });

  it('defaults to map scaling while screen mode keeps the frame and label at fixed CSS-pixel size', () => {
    const state: ShapeState<'callout'> = {
      type: 'callout',
      anchor: [10, 20],
      center: [10, 20],
      size: [180, 72],
      referenceResolution: 2
    };
    const zoomedIn = resolutionContext(1);
    const zoomedOut = resolutionContext(4);
    const mapIn = calloutDefinition.presentation!.present(state, style, zoomedIn);
    const mapOut = calloutDefinition.presentation!.present(state, style, zoomedOut);
    const screenIn = calloutDefinition.presentation!.present(state, { ...style, callout: { sizeMode: 'screen' } }, zoomedIn);
    const screenOut = calloutDefinition.presentation!.present(state, { ...style, callout: { sizeMode: 'screen' } }, zoomedOut);
    if (
      mapIn.geometry.type !== 'polygon' ||
      mapOut.geometry.type !== 'polygon' ||
      screenIn.geometry.type !== 'polygon' ||
      screenOut.geometry.type !== 'polygon' ||
      mapIn.selectionGeometry?.type !== 'polygon' ||
      mapOut.selectionGeometry?.type !== 'polygon' ||
      screenIn.selectionGeometry?.type !== 'polygon' ||
      screenOut.selectionGeometry?.type !== 'polygon'
    ) {
      throw new Error('Callout must expose Polygon presentation geometry');
    }

    expect(polygonPixelSize(mapIn.selectionGeometry, zoomedIn)).toEqual([360, 144]);
    expect(polygonPixelSize(mapOut.selectionGeometry, zoomedOut)).toEqual([90, 36]);
    expect(mapIn.geometry.label?.visualScale).toBe(2);
    expect(mapOut.geometry.label?.visualScale).toBe(0.5);
    expect(mapIn.geometry.label?.text).toBe(mapOut.geometry.label?.text);
    expect(mapIn.state.size).toEqual(state.size);
    expect(mapOut.state.size).toEqual(state.size);

    expect(polygonPixelSize(screenIn.selectionGeometry, zoomedIn)).toEqual([180, 72]);
    expect(polygonPixelSize(screenOut.selectionGeometry, zoomedOut)).toEqual([180, 72]);
    expect(screenIn.geometry.label?.visualScale).toBe(1);
    expect(screenOut.geometry.label?.visualScale).toBe(1);
  });

  it('preserves explicit newlines and wraps CJK plus long tokens without mutating the source text', () => {
    const sourceText = '第一行\nSupercalifragilistic中文';
    const wrappedStyle: StyleSpec = {
      ...style,
      text: { ...style.text!, text: sourceText, maxWidth: 50 }
    };
    const presentation = calloutDefinition.presentation!.present(draft(), wrappedStyle, context);
    if (presentation.geometry.type !== 'polygon' || presentation.geometry.label === undefined) throw new Error('Callout must expose a Polygon label');
    const availableWidth = presentation.state.size[0] - 26;
    const lines = presentation.geometry.label.text.split('\n');

    expect(lines[0]).toBe('第一行');
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line) => Array.from(line).length * 10 <= availableWidth)).toBe(true);
    expect(wrappedStyle.text?.text).toBe(sourceText);
  });

  it('derives ten non-removable handles and moves the anchor or frame center independently', () => {
    const presentation = calloutDefinition.presentation!;
    const laidOut = presentation.present(draft(), style, context).state;
    const topology = presentation.edit!.describe(laidOut, style, context);
    expect(topology.handles.map(({ role }) => role)).toEqual([
      'anchor',
      'resize-nw',
      'resize-n',
      'resize-ne',
      'resize-e',
      'resize-se',
      'resize-s',
      'resize-sw',
      'resize-w',
      'center'
    ]);
    expect(topology.handles.every(({ removable }) => removable === false)).toBe(true);
    expect(topology.insertions).toEqual([]);

    const moved = presentation.edit!.move(laidOut, 0, [-30, 20], style, context);
    expect(moved.anchor).toEqual([-30, 20]);
    expect(moved.center).toEqual(laidOut.center);
    expect(moved.size).toEqual(laidOut.size);

    const movedCenter = presentation.edit!.move(laidOut, 9, [140, 80], style, context);
    expect(movedCenter.anchor).toEqual(laidOut.anchor);
    expect(movedCenter.center).toEqual([140, 80]);
    expect(movedCenter.size).toEqual(laidOut.size);
    expect(movedCenter.referenceResolution).toBe(laidOut.referenceResolution);

    const undersized: ShapeState<'callout'> = {
      type: 'callout',
      anchor: [0, 100],
      center: [0, 0],
      size: [40, 20],
      referenceResolution: 1
    };
    const movedUndersized = presentation.edit!.move(undersized, 9, [10, 20], autoFitStyle, context);
    expect(movedUndersized.size).toEqual([40, 20]);
  });

  it('preserves Z values when OpenLayers supplies two-dimensional edit pointers', () => {
    const presentation = calloutDefinition.presentation!;
    const laidOut = presentation.present(draft([0, 0, 11], [100, 50, 22]), style, context).state;

    const movedAnchor = presentation.edit!.move(laidOut, 0, [-30, 20], style, context);
    expect(movedAnchor.anchor).toEqual([-30, 20, 11]);
    expect(movedAnchor.center).toEqual([100, 50, 22]);

    const east = presentation.edit!.describe(movedAnchor, style, context).handles[4];
    const resized = presentation.edit!.move(movedAnchor, 4, [east.coordinate[0] + 40, east.coordinate[1]], style, context);
    expect(resized.anchor).toEqual([-30, 20, 11]);
    expect(resized.center).toHaveLength(3);
    expect(resized.center[2]).toBe(22);

    const movedCenter = presentation.edit!.move(resized, 9, [130, 70], style, context);
    expect(movedCenter.anchor).toEqual(resized.anchor);
    expect(movedCenter.center).toEqual([130, 70, 22]);
  });

  it('clamps resize handles to the wrapped text minimum and uses the recomputed authoritative handle', () => {
    const presentation = calloutDefinition.presentation!;
    const laidOut = presentation.present(draft(), style, context).state;
    const before = presentation.edit!.describe(laidOut, style, context);
    const west = before.handles[8];
    const moved = presentation.edit!.move(laidOut, 8, [200, west.coordinate[1]], style, context);
    expect(moved.size[0]).toBeGreaterThanOrEqual(40);
    expect(moved.size[1]).toBeGreaterThanOrEqual(laidOut.size[1]);
    const after = presentation.edit!.describe(moved, style, context);
    expect(after.handles[8].coordinate[0]).toBeLessThan(after.handles[4].coordinate[0]);
  });

  it('converts displayed resize distances back to logical size in map mode', () => {
    const presentation = calloutDefinition.presentation!;
    const scaledContext = resolutionContext(0.5);
    const initial: ShapeState<'callout'> = {
      type: 'callout',
      anchor: [0, 100],
      center: [0, 0],
      size: [120, 20],
      referenceResolution: 1
    };
    const narrowed = presentation.edit!.move(initial, 4, scaledContext.toCoordinate([-40, 0], initial.center), autoFitStyle, scaledContext);
    expect(narrowed.size).toEqual([40, 60]);
    const narrowedTopology = presentation.edit!.describe(narrowed, autoFitStyle, scaledContext);
    const narrowedWest = scaledContext.toPixel(narrowedTopology.handles[8].coordinate);
    const narrowedEast = scaledContext.toPixel(narrowedTopology.handles[4].coordinate);
    expect(narrowedEast[0] - narrowedWest[0]).toBeCloseTo(80);

    const widened = presentation.edit!.move(narrowed, 4, scaledContext.toCoordinate([120, 0], narrowed.center), autoFitStyle, scaledContext);
    expect(widened.size).toEqual([120, 20]);
  });

  it.each([
    { index: 4, narrowPixel: [-20, 0] as Pixel, widePixel: [60, 0] as Pixel },
    { index: 8, narrowPixel: [20, 0] as Pixel, widePixel: [-60, 0] as Pixel }
  ])('auto-fits height in both directions when resize handle $index changes width', ({ index, narrowPixel, widePixel }) => {
    const presentation = calloutDefinition.presentation!;
    const initial: ShapeState<'callout'> = { type: 'callout', anchor: [0, 100], center: [0, 0], size: [120, 20], referenceResolution: 1 };
    const narrowed = presentation.edit!.move(initial, index, context.toCoordinate(narrowPixel, initial.center), autoFitStyle, context);
    const narrowedPresentation = presentation.present(narrowed, autoFitStyle, context);
    if (narrowedPresentation.geometry.type !== 'polygon' || narrowedPresentation.geometry.label === undefined) {
      throw new Error('Callout must expose a Polygon label');
    }

    expect(narrowed.size).toEqual([40, 60]);
    expect(narrowed.center[1]).toBeCloseTo(0);
    expect(narrowedPresentation.geometry.label.text.split('\n')).toHaveLength(3);

    const widened = presentation.edit!.move(narrowed, index, context.toCoordinate(widePixel, narrowed.center), autoFitStyle, context);
    const widenedPresentation = presentation.present(widened, autoFitStyle, context);
    if (widenedPresentation.geometry.type !== 'polygon' || widenedPresentation.geometry.label === undefined) {
      throw new Error('Callout must expose a Polygon label');
    }

    expect(widened.size).toEqual([120, 20]);
    expect(widened.center[1]).toBeCloseTo(0);
    expect(widenedPresentation.geometry.label.text.split('\n')).toHaveLength(1);
  });

  it('keeps explicit vertical control for corner handles while enforcing the text minimum', () => {
    const presentation = calloutDefinition.presentation!;
    const laidOut = presentation.present(draft(), style, context).state;
    const topology = presentation.edit!.describe(laidOut, style, context);
    const eastPixel = context.toPixel(topology.handles[4].coordinate);
    const southEastPixel = context.toPixel(topology.handles[5].coordinate);
    const horizontalOnly = presentation.edit!.move(laidOut, 4, context.toCoordinate([eastPixel[0] + 80, eastPixel[1]], laidOut.center), style, context);
    const corner = presentation.edit!.move(laidOut, 5, context.toCoordinate([southEastPixel[0] + 80, southEastPixel[1] + 30], laidOut.center), style, context);

    expect(corner.size[0]).toBeCloseTo(horizontalOnly.size[0]);
    expect(corner.size[1]).toBeCloseTo(laidOut.size[1] + 30);
    expect(corner.size[1]).toBeGreaterThan(horizontalOnly.size[1]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('supports resize handle %i without flipping the frame or overflowing text', (index) => {
    const presentation = calloutDefinition.presentation!;
    const laidOut = presentation.present(draft(), style, context).state;
    const moved = presentation.edit!.move(laidOut, index, laidOut.center, style, context);
    const topology = presentation.edit!.describe(moved, style, context);
    const west = context.toPixel(topology.handles[8].coordinate);
    const east = context.toPixel(topology.handles[4].coordinate);
    const north = context.toPixel(topology.handles[2].coordinate);
    const south = context.toPixel(topology.handles[6].coordinate);
    const rendered = presentation.present(moved, style, context);
    if (rendered.geometry.type !== 'polygon' || rendered.geometry.label === undefined) throw new Error('Callout must expose a Polygon label');
    const availableWidth = rendered.state.size[0] - 26;

    expect(west[0]).toBeLessThan(east[0]);
    expect(north[1]).toBeLessThan(south[1]);
    expect(rendered.geometry.label.text.split('\n').every((line) => Array.from(line).length * 10 <= availableWidth)).toBe(true);
  });

  it('hides the tail while the anchor is inside the frame and emits side variants otherwise', () => {
    const presentation = calloutDefinition.presentation!;
    const inside = presentation.present(draft([100, 50], [100, 50]), style, context).geometry;
    expect(inside.type).toBe('polygon');
    if (inside.type !== 'polygon') throw new Error('Callout must present as Polygon');
    expect(inside.coordinates[0]).toHaveLength(5);

    for (const anchor of [
      [100, 200],
      [300, 50],
      [100, -100],
      [-100, 50]
    ] as const) {
      const geometry = presentation.present(draft(anchor, [100, 50]), style, context).geometry;
      if (geometry.type !== 'polygon') throw new Error('Callout must present as Polygon');
      expect(geometry.coordinates[0].some((coordinate) => coordinate[0] === anchor[0] && coordinate[1] === anchor[1])).toBe(true);
      expect(geometry.coordinates[0].length).toBeGreaterThan(5);
    }
  });

  it('translates anchor and center together while preserving logical size and reference resolution', () => {
    const state = calloutDefinition.presentation!.present(draft(), style, context).state;
    const moved = calloutDefinition.translate!(state, 5, -3);
    expect(moved.anchor).toEqual([5, -3]);
    expect(moved.center).toEqual([105, 47]);
    expect(moved.size).toEqual(state.size);
    expect(moved.referenceResolution).toBe(state.referenceResolution);
    expect([...calloutDefinition.capabilities]).toEqual(['draw', 'edit', 'translate']);
  });

  it('keeps the frame screen-aligned and CSS-pixel sized under a rotated and scaled coordinate transform', () => {
    const scale = 3;
    const angle = Math.PI / 5;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rotatedContext: ShapePresentationContext = Object.freeze({
      ...context,
      toPixel: (coordinate): Pixel => [
        20 + scale * (coordinate[0] * cosine - coordinate[1] * sine),
        30 + scale * (coordinate[0] * sine + coordinate[1] * cosine)
      ],
      toCoordinate: (pixel, template): Coordinate => {
        const x = (pixel[0] - 20) / scale;
        const y = (pixel[1] - 30) / scale;
        const coordinate = [x * cosine + y * sine, -x * sine + y * cosine];
        return template?.length === 3 ? [coordinate[0], coordinate[1], template[2]] : coordinate;
      }
    });
    const requested: ShapeState<'callout'> = { type: 'callout', anchor: [10, 20], center: [10, 20], size: [180, 72], referenceResolution: 1 };
    const rendered = calloutDefinition.presentation!.present(requested, { ...style, callout: { sizeMode: 'screen' } }, rotatedContext);
    if (rendered.geometry.type !== 'polygon') throw new Error('Callout must present as Polygon');
    const pixels = rendered.geometry.coordinates[0].map(rotatedContext.toPixel);
    const xs = pixels.map(([x]) => x);
    const ys = pixels.map(([, y]) => y);

    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(180);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(72);
  });

  it('rejects partial automatic sizes', () => {
    expect(() => calloutDefinition.normalize({ type: 'callout', anchor: [0, 0], center: [1, 1], size: [0, 40] })).toThrow('Callout size must be either [0, 0]');
  });

  it('atomically rejects Style updates that would violate Callout presentation constraints', () => {
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes, {
      validateElement: (state) => shapes.get(state.type).presentation?.validateStyle?.(state.style)
    });
    store.add({
      id: 'callout',
      type: 'callout',
      geometry: { type: 'callout', anchor: [0, 0], center: [100, 50], size: [160, 60], referenceResolution: 1 },
      style,
      layerId: 'default',
      visible: true
    });
    const styles = new StyleService(store);
    const before = store.get('callout');

    expect(() => styles.set({ id: 'callout' }, { fill: { type: 'solid', color: '#ffffff' } })).toThrow('requires TextSpec.text');
    expect(() => styles.patch({ id: 'callout' }, { text: { placement: 'line' } })).toThrow('placement must be point');
    expect(() => styles.patch({ id: 'callout' }, { text: { fontSize: 0 } })).toThrow('fontSize must be positive');
    expect(() => styles.patch({ id: 'callout' }, { text: { padding: [-1, 8, 8, 8] } })).toThrow('four non-negative finite values');
    expect(store.get('callout')).toEqual(before);
  });
});
