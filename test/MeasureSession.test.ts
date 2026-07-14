import { describe, expect, it, vi } from 'vitest';
import { MeasurementAdapter } from '../src/adapters/openlayers/MeasurementAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import type { Coordinate } from '../src/core/common/types.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import type { ElementState } from '../src/core/element/types.js';
import type {
  DrawInteractionEvent,
  DrawInteractionHandle,
  DrawInteractionPort,
  DrawInteractionRenderState,
  DrawInteractionSpec
} from '../src/core/ports/DrawInteractionPort.js';
import type { EditInteractionPort } from '../src/core/ports/EditInteractionPort.js';
import type { LineMeasurement, MeasurementPort, MeasurementSegment, SurfaceMeasurement } from '../src/core/ports/MeasurementPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { DrawService } from '../src/services/draw/DrawService.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import { MeasureService } from '../src/services/measure/MeasureService.js';
import { INTERNAL_MEASURE_MODULE, type MeasurementOverlayService, type MeasurementTooltipPort } from '../src/services/measure/types.js';
import { StyleService } from '../src/services/style/StyleService.js';
import { MeasureFacade } from '../src/facade/MeasureFacade.js';
import type { InternalMeasureService, InternalMeasureSession } from '../src/services/measure/types.js';
import type { InternalOverlaySpec } from '../src/services/overlay/types.js';
import type { OverlayHandle } from '../src/services/overlay/OverlayHandle.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

class FakeDrawPort implements DrawInteractionPort {
  readonly handles: Array<{ render: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  listener: ((event: Readonly<DrawInteractionEvent>) => void) | undefined;

  open(_spec: Readonly<DrawInteractionSpec>, listener: (event: Readonly<DrawInteractionEvent>) => void): DrawInteractionHandle {
    this.listener = listener;
    const handle = {
      render: vi.fn((preview: Readonly<DrawInteractionRenderState> | undefined) => void preview),
      destroy: vi.fn(() => {
        if (this.listener === listener) this.listener = undefined;
      })
    };
    this.handles.push(handle);
    return handle;
  }

  emit(event: DrawInteractionEvent): void {
    if (this.listener === undefined) throw new Error('Draw interaction is not open');
    this.listener(event);
  }
}

class FakeMeasurementPort implements MeasurementPort {
  measureLine(coordinates: readonly Coordinate[], mode: 'path' | 'radial'): LineMeasurement | undefined {
    if (coordinates.length < 2) return undefined;
    const pairs = mode === 'radial' ? coordinates.slice(1).map((coordinate) => [coordinates[0], coordinate] as const) : consecutivePairs(coordinates);
    const segments = pairs.map(([start, end]) => segment(start, end));
    return Object.freeze({
      meters: segments.reduce((total, item) => total + item.meters, 0),
      anchor: clone(coordinates[coordinates.length - 1]),
      segments: Object.freeze(segments)
    });
  }

  measureArea(ring: readonly Coordinate[]): SurfaceMeasurement | undefined {
    if (ring.length < 3) return undefined;
    let twiceArea = 0;
    for (let index = 0; index < ring.length; index += 1) {
      const current = ring[index];
      const next = ring[(index + 1) % ring.length];
      twiceArea += current[0] * next[1] - next[0] * current[1];
    }
    return Object.freeze({ squareMeters: Math.abs(twiceArea) / 2, anchor: clone(ring[0]), verticesGeographic: Object.freeze(ring.map(clone)) });
  }
}

class FakeTooltips implements MeasurementTooltipPort {
  readonly records = new Map<object, { text: string; style: unknown }>();
  readonly released: object[] = [];

  create(style: Parameters<MeasurementTooltipPort['create']>[0]): ReturnType<MeasurementTooltipPort['create']> {
    const reference = Object.freeze({}) as ReturnType<MeasurementTooltipPort['create']>;
    this.records.set(reference, { text: '', style });
    return reference;
  }

  setText(reference: Parameters<MeasurementTooltipPort['setText']>[0], text: string): void {
    const record = this.records.get(reference);
    if (record === undefined) throw new Error('Unknown tooltip');
    record.text = text;
  }

  release(reference: Parameters<MeasurementTooltipPort['release']>[0]): void {
    if (this.records.delete(reference)) this.released.push(reference);
  }
}

class FakeOverlays implements MeasurementOverlayService {
  readonly records = new Map<string, { module?: string; position?: Coordinate; reference: object; destroyed: boolean }>();
  #nextId = 0;

  constructor(private readonly tooltips: FakeTooltips) {}

  add<T>(spec: InternalOverlaySpec<T>): OverlayHandle<T> {
    const id = spec.id ?? `measure-overlay-${++this.#nextId}`;
    const record = { module: spec.module, position: spec.position, reference: spec.elementRef as object, destroyed: false };
    this.records.set(id, record);
    return {
      id,
      get position() {
        return record.position;
      },
      get visible() {
        return !record.destroyed && record.position !== undefined;
      },
      setPosition: (position: Coordinate | undefined) => {
        record.position = position;
      },
      update: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      panIntoView: vi.fn(),
      destroy: () => {
        if (record.destroyed) return;
        record.destroyed = true;
        this.records.delete(id);
        this.tooltips.release(spec.elementRef);
      }
    } as unknown as OverlayHandle<T>;
  }

  remove(selector: { module?: string }): number {
    const ids = [...this.records].filter(([, record]) => selector.module === undefined || record.module === selector.module).map(([id]) => id);
    for (const id of ids) {
      const record = this.records.get(id);
      if (record !== undefined) {
        this.records.delete(id);
        this.tooltips.release(record.reference as Parameters<MeasurementTooltipPort['release']>[0]);
      }
    }
    return ids.length;
  }
}

function setup() {
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  const store = new ElementStore(shapes);
  const drawPort = new FakeDrawPort();
  const coordinator = new InteractionCoordinator();
  const styles = new StyleService(store);
  let drawId = 0;
  const draw = new DrawService({
    store,
    shapes,
    styles,
    coordinator,
    drawPort,
    editPort: {} as EditInteractionPort,
    defaultStyle: () => ({ strokes: [{ color: '#ffcc33', width: 2 }] }),
    createId: () => `draw-${++drawId}`
  });
  const tooltips = new FakeTooltips();
  const overlays = new FakeOverlays(tooltips);
  const reports: unknown[] = [];
  let markerId = 0;
  const service = new MeasureService({
    draw,
    store,
    styles,
    overlays,
    measurement: new FakeMeasurementPort(),
    tooltips,
    defaultLayerId: 'measure-layer',
    createId: () => `measure-${++markerId}`,
    errorReporter: (error) => reports.push(error)
  });
  return { coordinator, drawPort, overlays, reports, service, store, tooltips };
}

function completeLine(drawPort: FakeDrawPort, coordinator: InteractionCoordinator, coordinates: readonly Coordinate[]): void {
  for (const coordinate of coordinates) drawPort.emit({ type: 'click', coordinate });
  expect(coordinator.handleContextMenu(rightClick(coordinates[coordinates.length - 1]))).toBe('consume');
}

function completeArea(drawPort: FakeDrawPort, coordinator: InteractionCoordinator, coordinates: readonly Coordinate[]): void {
  for (const coordinate of coordinates) drawPort.emit({ type: 'click', coordinate });
  expect(coordinator.handleContextMenu(rightClick(coordinates[coordinates.length - 1]))).toBe('consume');
}

function rightClick(coordinate: Coordinate) {
  return { type: 'rightclick' as const, coordinate, pixel: [0, 0] as const, nativeEventRef: {} as never };
}

describe('MeasureSession', () => {
  coversCapabilities(
    'measure-distance-segments',
    'measure-distance-total',
    'measure-distance-radial',
    'measure-area',
    'measure-dynamic-tooltip',
    'measure-point-markers',
    'measure-line-style',
    'measure-text-style',
    'measure-result-payload',
    'measure-rightclick-finish',
    'measure-clear-reuse'
  );

  it.each([
    [
      'distance-segments',
      [
        [0, 0],
        [3, 4],
        [6, 8]
      ],
      10,
      2
    ],
    [
      'distance-total',
      [
        [0, 0],
        [3, 4],
        [6, 8]
      ],
      10,
      2
    ],
    [
      'distance-radial',
      [
        [0, 0],
        [3, 4],
        [0, 12]
      ],
      17,
      2
    ]
  ] as const)('completes %s through the shared Draw session', async (type, rawCoordinates, expectedValue, expectedSegments) => {
    const { coordinator, drawPort, service, store } = setup();
    const session = service.start({ type, unit: 'm', precision: 2 });
    const completes = vi.fn();
    session.on('complete', completes);

    completeLine(drawPort, coordinator, rawCoordinates);

    const result = await session.finished;
    expect(session.status).toBe('finished');
    expect(result).toMatchObject({ type, value: expectedValue, unit: 'm', formatted: `${expectedValue} m` });
    expect(result?.segments).toHaveLength(expectedSegments);
    expect(completes).toHaveBeenCalledOnce();
    expect(store.query({ module: INTERNAL_MEASURE_MODULE }).some(({ type: elementType }) => elementType === 'polyline')).toBe(true);
  });

  it('completes area measurement and exposes immutable formatted results', async () => {
    const { coordinator, drawPort, service } = setup();
    const session = service.start({ type: 'area', unit: 'm²', formatter: (value, unit) => `${value}:${unit}` });
    completeArea(drawPort, coordinator, [
      [0, 0],
      [4, 0],
      [4, 3]
    ]);

    const result = await session.finished;
    expect(result).toMatchObject({ type: 'area', value: 6, unit: 'm²', formatted: '6:m²' });
    expect(result?.segments).toHaveLength(3);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.geometry)).toBe(true);
  });

  it('implements measure-text-size and measure-total-distance-toggle with line and point styles', async () => {
    const { coordinator, drawPort, overlays, service, store, tooltips } = setup();
    const session = service.start({
      type: 'distance-segments',
      unit: 'm',
      showTotal: true,
      line: { color: '#123456', width: 7 },
      point: { type: 'circle', radius: 9, fill: { type: 'solid', color: '#abcdef' } },
      text: { fontSize: 18, fill: { type: 'solid', color: '#fedcba' }, backgroundFill: { type: 'solid', color: '#111111' } }
    });
    drawPort.emit({ type: 'click', coordinate: [0, 0] });
    drawPort.emit({ type: 'move', coordinate: [3, 4] });
    expect(overlays.records).toHaveLength(2);
    expect([...tooltips.records.values()].every(({ style }) => (style as { fontSize?: number }).fontSize === 18)).toBe(true);
    completeLine(drawPort, coordinator, [[3, 4]]);
    await session.finished;

    const states = store.query({ module: INTERNAL_MEASURE_MODULE });
    expect(states.find(({ type }) => type === 'polyline')?.style).toMatchObject({ strokes: [{ color: '#123456', width: 7 }] });
    expect(states.filter(({ type }) => type === 'point')).toHaveLength(2);
    expect(states.find(({ type }) => type === 'point')?.style).toMatchObject({ symbol: { type: 'circle', radius: 9 } });
  });

  it('cancels temporary overlays, isolates listener errors, and resolves undefined', async () => {
    const { drawPort, overlays, reports, service } = setup();
    const session = service.start({ type: 'distance-total', unit: 'm' });
    const later = vi.fn();
    session.on('change', () => {
      throw new Error('listener failed');
    });
    session.on('change', later);
    drawPort.emit({ type: 'click', coordinate: [0, 0] });
    drawPort.emit({ type: 'move', coordinate: [3, 4] });
    expect(later).toHaveBeenCalledOnce();
    expect(reports).toHaveLength(1);
    expect(overlays.records.size).toBeGreaterThan(0);

    session.cancel();
    await expect(session.finished).resolves.toBeUndefined();
    expect(session.status).toBe('cancelled');
    expect(overlays.records).toHaveLength(0);
  });

  it('clear removes only measure-owned elements and overlays and remains reusable', async () => {
    const { coordinator, drawPort, overlays, service, store } = setup();
    store.add(userElement());
    const first = service.start({ type: 'distance-total', unit: 'm' });
    completeLine(drawPort, coordinator, [
      [0, 0],
      [3, 4]
    ]);
    await first.finished;

    service.clear();
    expect(store.query({ module: INTERNAL_MEASURE_MODULE })).toHaveLength(0);
    expect(overlays.records).toHaveLength(0);
    expect(store.get('user-element')).toBeDefined();

    const second = service.start({ type: 'area', unit: 'm²' });
    completeArea(drawPort, coordinator, [
      [0, 0],
      [4, 0],
      [4, 3]
    ]);
    await expect(second.finished).resolves.toMatchObject({ value: 6 });
  });

  it('uses OL public sphere and geometry APIs behind MeasurementAdapter', () => {
    const adapter = new MeasurementAdapter({ projection: 'EPSG:3857' });
    const line = adapter.measureLine(
      [
        [0, 0],
        [1000, 0]
      ],
      'path'
    );
    const area = adapter.measureArea([
      [0, 0],
      [1000, 0],
      [1000, 1000],
      [0, 1000]
    ]);

    expect(line?.meters).toBeGreaterThan(990);
    expect(line?.meters).toBeLessThan(1010);
    expect(area?.squareMeters).toBeGreaterThan(980_000);
    expect(area?.squareMeters).toBeLessThan(1_020_000);
  });

  it('maps the supported structured text fields to tooltip CSS', () => {
    const refs = new NativeRefRegistry();
    const assigned = new Map<string, string>();
    const style = new Proxy({ setProperty: (key: string, value: string) => assigned.set(key, value) } as Record<string, unknown>, {
      set: (target, key, value) => {
        target[String(key)] = value;
        assigned.set(String(key), String(value));
        return true;
      }
    });
    const element = { className: '', style, textContent: '' } as unknown as HTMLElement;
    const adapter = new MeasurementAdapter({ nativeRefs: refs, createElement: () => element });

    adapter.create({
      fontSize: 18,
      fill: { type: 'pattern', pattern: 'diagonal', color: '#f00' },
      stroke: { color: '#000', width: 2 },
      backgroundFill: { type: 'solid', color: '#fff' },
      backgroundStroke: { color: '#00f', width: 3 },
      scale: [2, 3],
      rotation: 0.5,
      textBaseline: 'middle',
      justify: 'right'
    });

    expect(assigned.get('fontSize')).toBe('18px');
    expect(assigned.get('-webkit-text-stroke')).toBe('2px #000');
    expect(assigned.get('borderWidth')).toBe('3px');
    expect(assigned.get('transform')).toBe('scale(2, 3) rotate(0.5rad)');
    expect(assigned.get('verticalAlign')).toBe('middle');
    expect(assigned.get('textAlign')).toBe('right');
    expect(assigned.get('backgroundImage')).toContain('repeating-linear-gradient');
  });

  it('rejects unknown facade options and event names instead of silently changing behavior', () => {
    const listeners = new Map<string, (event: never) => void>();
    const session: InternalMeasureSession = {
      status: 'active',
      finished: new Promise(() => undefined),
      finish: () => undefined,
      cancel: () => undefined,
      destroy: () => undefined,
      on: ((type: string, listener: (event: never) => void) => {
        listeners.set(type, listener);
        return () => listeners.delete(type);
      }) as InternalMeasureSession['on']
    };
    const service = {
      start: vi.fn(() => session),
      clear: vi.fn(),
      destroy: vi.fn()
    } as InternalMeasureService;
    const facade = new MeasureFacade(service);

    expect(() => facade.start({ type: 'distance-total', showTotals: true } as never)).toThrow(InvalidArgumentError);
    expect(service.start).not.toHaveBeenCalled();
    const publicSession = facade.start({ type: 'distance-total' });
    expect(() => publicSession.on('bogus' as never, vi.fn())).toThrow(InvalidArgumentError);
    expect(listeners.size).toBe(0);
  });
});

function consecutivePairs(coordinates: readonly Coordinate[]): ReadonlyArray<readonly [Coordinate, Coordinate]> {
  return coordinates.slice(1).map((coordinate, index) => [coordinates[index], coordinate] as const);
}

function segment(start: Coordinate, end: Coordinate): MeasurementSegment {
  const meters = Math.hypot(end[0] - start[0], end[1] - start[1]);
  return Object.freeze({
    start: clone(start),
    end: clone(end),
    startGeographic: clone(start),
    endGeographic: clone(end),
    anchor: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
    meters
  });
}

function clone(coordinate: Coordinate): Coordinate {
  return Object.freeze([...coordinate]) as Coordinate;
}

function userElement(): ElementState {
  return {
    id: 'user-element',
    type: 'point',
    geometry: { type: 'point', controlPoints: [[99, 99]] },
    style: { symbol: { type: 'circle', radius: 3 } },
    module: 'user',
    layerId: 'measure-layer',
    visible: true
  };
}
