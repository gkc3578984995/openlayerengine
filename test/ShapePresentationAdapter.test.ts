import type Map from 'ol/Map.js';
import { checkedFonts } from 'ol/render/canvas.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { ShapePresentationAdapter } from '../src/adapters/openlayers/ShapePresentationAdapter.js';
import { calloutDefinition } from '../src/builtins/shapes/callout.js';
import { ObjectDisposedError } from '../src/core/errors.js';
import type { Coordinate } from '../src/core/common/types.js';

class FrameMapHarness {
  readonly view: View;
  readonly render = vi.fn();
  readonly precomposeListeners = new Set<() => void>();
  frameReady: boolean;
  frameResolution: number;
  frameRotation: number;

  constructor(view: View, frameReady = true) {
    this.view = view;
    this.frameReady = frameReady;
    this.frameResolution = view.getResolution() ?? 1;
    this.frameRotation = view.getRotation();
  }

  getView(): View {
    return this.view;
  }

  on(type: string, listener: () => void): void {
    if (type === 'precompose') this.precomposeListeners.add(listener);
  }

  un(type: string, listener: () => void): void {
    if (type === 'precompose') this.precomposeListeners.delete(listener);
  }

  getListeners(type: string): readonly (() => void)[] | undefined {
    if (type === 'precompose') return [...this.precomposeListeners];
    return undefined;
  }

  getPixelFromCoordinate(coordinate: number[]): number[] | null {
    if (!this.frameReady) return null;
    return toPixel(coordinate, this.view.getCenter() ?? [0, 0], this.frameResolution, this.frameRotation);
  }

  getCoordinateFromPixel(pixel: number[]): number[] | null {
    if (!this.frameReady) return null;
    return toCoordinate(pixel, this.view.getCenter() ?? [0, 0], this.frameResolution, this.frameRotation);
  }

  emitPrecompose(): void {
    this.frameResolution = this.view.getResolution() ?? this.frameResolution;
    this.frameRotation = this.view.getRotation();
    this.frameReady = true;
    for (const listener of [...this.precomposeListeners]) listener();
  }
}

const calloutStyle = Object.freeze({
  strokes: Object.freeze([{ color: '#000000', width: 2 }]),
  fill: Object.freeze({ type: 'solid' as const, color: '#ffffff' }),
  text: Object.freeze({ text: '测试', fontSize: 16, fill: Object.freeze({ type: 'solid' as const, color: '#000000' }) })
});

describe('ShapePresentationAdapter', () => {
  it('coalesces View and font revisions at the public precompose frame boundary and releases every listener', async () => {
    const view = new View({ projection: 'EPSG:4326', center: [0, 0], resolution: 1 });
    const map = new FrameMapHarness(view);
    const initialResolutionListeners = view.getListeners('change:resolution')?.length ?? 0;
    const initialRotationListeners = view.getListeners('change:rotation')?.length ?? 0;
    const initialFontListeners = checkedFonts.getListeners('change')?.length ?? 0;
    const adapter = new ShapePresentationAdapter(map as unknown as Map);
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);

    expect(view.getListeners('change:resolution')?.length ?? 0).toBe(initialResolutionListeners + 1);
    expect(view.getListeners('change:rotation')?.length ?? 0).toBe(initialRotationListeners + 1);
    expect(checkedFonts.getListeners('change')?.length ?? 0).toBe(initialFontListeners + 1);
    expect(map.getListeners('precompose')).toHaveLength(1);

    view.setResolution(2);
    view.setRotation(Math.PI / 4);
    checkedFonts.changed();
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
    expect(map.render).toHaveBeenCalledTimes(1);

    map.emitPrecompose();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    view.setResolution(3);
    map.emitPrecompose();
    expect(listener).toHaveBeenCalledTimes(1);

    adapter.destroy();
    adapter.destroy();
    expect(view.getListeners('change:resolution')?.length ?? 0).toBe(initialResolutionListeners);
    expect(view.getListeners('change:rotation')?.length ?? 0).toBe(initialRotationListeners);
    expect(checkedFonts.getListeners('change')?.length ?? 0).toBe(initialFontListeners);
    expect(map.getListeners('precompose')).toHaveLength(0);
    expect(() => adapter.subscribe(vi.fn())).toThrowError(ObjectDisposedError);
    expect(() => adapter.subscribeMotion(vi.fn())).toThrowError(ObjectDisposedError);
  });

  it('gates pixel-dependent presentation from the first View size change until a settled precompose', () => {
    const view = new View({ projection: 'EPSG:4326', center: [0, 0], resolution: 1 });
    const map = new FrameMapHarness(view);
    let animating = true;
    let interacting = false;
    vi.spyOn(view, 'getAnimating').mockImplementation(() => animating);
    vi.spyOn(view, 'getInteracting').mockImplementation(() => interacting);
    const adapter = new ShapePresentationAdapter(map as unknown as Map);
    const events: string[] = [];
    const revisionListener = vi.fn(() => events.push('revision'));
    const motionListener = vi.fn((moving: boolean) => events.push(`motion:${moving}`));
    adapter.subscribe(revisionListener);
    adapter.subscribeMotion(motionListener);

    view.setResolution(2);
    view.setRotation(Math.PI / 8);
    expect(motionListener.mock.calls).toEqual([[true]]);
    expect(revisionListener).not.toHaveBeenCalled();
    expect(map.render).toHaveBeenCalledTimes(1);

    map.emitPrecompose();
    expect(revisionListener).toHaveBeenCalledTimes(1);
    expect(motionListener.mock.calls).toEqual([[true]]);

    animating = false;
    interacting = true;
    map.emitPrecompose();
    expect(motionListener.mock.calls).toEqual([[true]]);

    view.setResolution(3);
    view.setRotation(Math.PI / 4);
    expect(motionListener.mock.calls).toEqual([[true]]);
    expect(map.render).toHaveBeenCalledTimes(2);

    interacting = false;
    map.emitPrecompose();
    expect(revisionListener).toHaveBeenCalledTimes(2);
    expect(motionListener.mock.calls).toEqual([[true], [false]]);
    expect(events.slice(-2)).toEqual(['revision', 'motion:false']);
    expect(map.render).toHaveBeenCalledTimes(3);

    animating = true;
    view.setResolution(4);
    expect(motionListener.mock.calls).toEqual([[true], [false], [true]]);
    expect(map.render).toHaveBeenCalledTimes(4);
    map.emitPrecompose();
    expect(revisionListener).toHaveBeenCalledTimes(3);
    expect(motionListener.mock.calls).toEqual([[true], [false], [true]]);

    animating = false;
    map.emitPrecompose();
    expect(motionListener.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(map.render).toHaveBeenCalledTimes(5);

    map.emitPrecompose();
    expect(motionListener.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(map.render).toHaveBeenCalledTimes(5);
    adapter.destroy();
  });

  it('does not enter motion for font or center-only revisions and releases motion subscriptions', () => {
    const view = new View({ projection: 'EPSG:4326', center: [0, 0], resolution: 1 });
    const map = new FrameMapHarness(view);
    const adapter = new ShapePresentationAdapter(map as unknown as Map);
    const revisionListener = vi.fn();
    const motionListener = vi.fn();
    const unsubscribeMotion = adapter.subscribeMotion(motionListener);
    adapter.subscribe(revisionListener);

    checkedFonts.changed();
    expect(map.render).toHaveBeenCalledTimes(1);
    expect(motionListener).not.toHaveBeenCalled();
    map.emitPrecompose();
    expect(revisionListener).toHaveBeenCalledTimes(1);
    expect(motionListener).not.toHaveBeenCalled();

    view.setCenter([10, 20]);
    expect(map.render).toHaveBeenCalledTimes(1);
    expect(revisionListener).toHaveBeenCalledTimes(1);
    expect(motionListener).not.toHaveBeenCalled();

    unsubscribeMotion();
    view.setResolution(2);
    expect(motionListener).not.toHaveBeenCalled();
    adapter.destroy();
  });

  it('uses current public View state before the first Map frame and while a newer frame is pending', () => {
    const view = new View({ projection: 'EPSG:4326', center: [10, 20], resolution: 1 });
    const map = new FrameMapHarness(view, false);
    const adapter = new ShapePresentationAdapter(map as unknown as Map);
    const state = adapter.materialize(calloutDefinition, {
      type: 'callout',
      anchor: [10, 20] as Coordinate,
      center: [10, 20] as Coordinate,
      size: [100, 40] as const
    });

    expect(frameWidth(adapter.present(calloutDefinition, state, calloutStyle).geometry)).toBeCloseTo(100);

    map.frameReady = true;
    view.setResolution(2);
    const pendingResolution = view.getResolution();
    if (pendingResolution === undefined) throw new Error('View resolution is required');
    expect(frameWidth(adapter.present(calloutDefinition, state, calloutStyle).geometry)).toBeCloseTo(100);
    expect(map.frameResolution).toBe(1);

    map.emitPrecompose();
    expect(frameWidth(adapter.present(calloutDefinition, state, calloutStyle).geometry)).toBeCloseTo(100);
    adapter.destroy();
  });

  it('presents a Callout from an explicit frozen frame instead of the active View', () => {
    const view = new View({ projection: 'EPSG:4326', center: [0, 0], resolution: 1, rotation: 0 });
    const map = new FrameMapHarness(view);
    const adapter = new ShapePresentationAdapter(map as unknown as Map);
    const state = adapter.materialize(calloutDefinition, {
      type: 'callout',
      anchor: [10, 20] as Coordinate,
      center: [10, 20] as Coordinate,
      size: [100, 40] as const
    });

    const active = adapter.present(calloutDefinition, state, calloutStyle).geometry;
    const printed = adapter.presentAt(calloutDefinition, state, calloutStyle, {
      center: [1000, -500],
      resolution: 2,
      rotation: Math.PI / 2
    }).geometry;
    if (printed.type !== 'polygon') throw new Error('Callout print presentation must be a polygon');

    expect(frameWidth(active)).toBeCloseTo(100);
    expect(frameHeight(active)).toBeCloseTo(40);
    expect(frameWidth(printed)).toBeCloseTo(40);
    expect(frameHeight(printed)).toBeCloseTo(100);
    expect(printed.label).toEqual({ coordinate: [10, 20], text: '测试', visualScale: 0.5 });
    expect(view.getResolution()).toBe(1);
    expect(view.getRotation()).toBe(0);
    adapter.destroy();
  });
});

function frameWidth(geometry: ReturnType<ShapePresentationAdapter['present']>['geometry']): number {
  if (geometry.type !== 'polygon') throw new Error('Callout presentation must be a polygon');
  const xs = geometry.coordinates[0].map((coordinate) => coordinate[0]);
  return Math.max(...xs) - Math.min(...xs);
}

function frameHeight(geometry: ReturnType<ShapePresentationAdapter['present']>['geometry']): number {
  if (geometry.type !== 'polygon') throw new Error('Callout presentation must be a polygon');
  const ys = geometry.coordinates[0].map((coordinate) => coordinate[1]);
  return Math.max(...ys) - Math.min(...ys);
}

function toPixel(coordinate: readonly number[], center: readonly number[], resolution: number, rotation: number): number[] {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const x = coordinate[0] - center[0];
  const y = coordinate[1] - center[1];
  return [(cosine * x + sine * y) / resolution, (sine * x - cosine * y) / resolution];
}

function toCoordinate(pixel: readonly number[], center: readonly number[], resolution: number, rotation: number): number[] {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return [center[0] + resolution * (cosine * pixel[0] + sine * pixel[1]), center[1] + resolution * (sine * pixel[0] - cosine * pixel[1])];
}
