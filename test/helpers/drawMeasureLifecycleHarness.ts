import { basicShapeDefinitions } from '../../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../../src/builtins/shapes/plot/index.js';
import type { Coordinate } from '../../src/core/common/types.js';
import type { PreparedWorldEdit } from '../../src/core/common/worldWrap.js';
import { ElementStore } from '../../src/core/element/ElementStore.js';
import { createNativeRef, createTransientNativeRef, type NativeRef } from '../../src/core/native/types.js';
import type { InputEventMap } from '../../src/core/ports/InputPort.js';
import type {
  DrawInteractionEvent,
  DrawInteractionHandle,
  DrawInteractionPort,
  DrawInteractionRenderState,
  DrawInteractionSpec
} from '../../src/core/ports/DrawInteractionPort.js';
import type {
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState,
  EditInteractionSpec
} from '../../src/core/ports/EditInteractionPort.js';
import type { LineMeasurement, MeasurementPort, MeasurementSegment, SurfaceMeasurement } from '../../src/core/ports/MeasurementPort.js';
import { ShapeRegistry } from '../../src/core/shape/ShapeRegistry.js';
import type { ElementStyleState } from '../../src/core/style/types.js';
import { DrawService } from '../../src/services/draw/DrawService.js';
import type { SessionKeyboardInput } from '../../src/services/draw/types.js';
import { InteractionCoordinator } from '../../src/services/events/InteractionCoordinator.js';
import type { RoutedPointerEvent } from '../../src/services/events/types.js';
import { MeasureService } from '../../src/services/measure/MeasureService.js';
import type { MeasurementOverlayService, MeasurementTooltipPort } from '../../src/services/measure/types.js';
import type { OverlayHandle } from '../../src/services/overlay/OverlayHandle.js';
import type { InternalOverlaySelector, InternalOverlaySpec } from '../../src/services/overlay/types.js';
import { StyleService } from '../../src/services/style/StyleService.js';

export class TrackedDrawRecord {
  readonly renders: Array<Readonly<DrawInteractionRenderState> | undefined> = [];
  destroyCalls = 0;
  active = true;

  constructor(
    readonly spec: Readonly<DrawInteractionSpec>,
    readonly listener: (event: DrawInteractionEvent) => void,
    private readonly onDestroy: (record: TrackedDrawRecord) => void
  ) {}

  emit(event: DrawInteractionEvent): void {
    if (!this.active) throw new Error('绘制端口句柄已经释放');
    this.listener(event);
  }

  render(state: Readonly<DrawInteractionRenderState> | undefined): void {
    if (!this.active) throw new Error('绘制端口句柄已经释放');
    this.renders.push(state);
  }

  destroy(): void {
    this.destroyCalls += 1;
    if (!this.active) return;
    this.active = false;
    this.onDestroy(this);
  }
}

export class TrackedDrawPort implements DrawInteractionPort {
  readonly records: TrackedDrawRecord[] = [];
  #active: TrackedDrawRecord | undefined;

  get active(): TrackedDrawRecord | undefined {
    return this.#active;
  }

  get activeCount(): number {
    return this.records.filter(({ active }) => active).length;
  }

  open(spec: Readonly<DrawInteractionSpec>, listener: (event: DrawInteractionEvent) => void): DrawInteractionHandle {
    const record = new TrackedDrawRecord(spec, listener, (destroyed) => {
      if (this.#active === destroyed) this.#active = undefined;
    });
    this.records.push(record);
    this.#active = record;
    return {
      render: (state) => record.render(state),
      destroy: () => record.destroy()
    };
  }

  emit(event: DrawInteractionEvent): void {
    const record = this.#active;
    if (record === undefined) throw new Error('绘制端口尚未打开');
    record.emit(event);
  }
}

export class TrackedEditRecord {
  readonly renders: Readonly<EditInteractionRenderState>[] = [];
  destroyCalls = 0;
  active = true;

  constructor(
    readonly spec: Readonly<EditInteractionSpec>,
    readonly listener: (event: EditInteractionEvent) => void,
    readonly placement: PreparedWorldEdit,
    private readonly onDestroy: (record: TrackedEditRecord) => void
  ) {}

  emit(event: EditInteractionEvent): void {
    if (!this.active) throw new Error('编辑端口句柄已经释放');
    this.listener(event);
  }

  render(state: Readonly<EditInteractionRenderState>): void {
    if (!this.active) throw new Error('编辑端口句柄已经释放');
    this.renders.push(state);
  }

  destroy(): void {
    this.destroyCalls += 1;
    if (!this.active) return;
    this.active = false;
    this.onDestroy(this);
  }
}

export class TrackedEditPort implements EditInteractionPort {
  readonly records: TrackedEditRecord[] = [];
  #active: TrackedEditRecord | undefined;

  get active(): TrackedEditRecord | undefined {
    return this.#active;
  }

  get activeCount(): number {
    return this.records.filter(({ active }) => active).length;
  }

  open(spec: Readonly<EditInteractionSpec>, listener: (event: EditInteractionEvent) => void): EditInteractionHandle {
    const placement = Object.freeze({
      controlPoints: Object.freeze(spec.controlPoints.map(cloneCoordinate)),
      handoff: Object.freeze({ kind: 'identity' as const })
    });
    const record = new TrackedEditRecord(spec, listener, placement, (destroyed) => {
      if (this.#active === destroyed) this.#active = undefined;
    });
    this.records.push(record);
    this.#active = record;
    return {
      placement,
      render: (state) => record.render(state),
      destroy: () => record.destroy()
    };
  }

  emit(event: EditInteractionEvent): void {
    const record = this.#active;
    if (record === undefined) throw new Error('编辑端口尚未打开');
    record.emit(event);
  }
}

export class TrackedKeyboardInput implements SessionKeyboardInput {
  readonly #listeners = new Map<number, (event: InputEventMap['keydown']) => void>();
  subscriptions = 0;
  disposals = 0;
  #nextId = 0;

  get activeCount(): number {
    return this.#listeners.size;
  }

  on(type: 'keydown', listener: (event: InputEventMap['keydown']) => void): () => void {
    if (type !== 'keydown') throw new Error('只支持 keydown');
    const id = ++this.#nextId;
    this.subscriptions += 1;
    this.#listeners.set(id, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.disposals += 1;
      this.#listeners.delete(id);
    };
  }

  emit(key: string): void {
    const event: InputEventMap['keydown'] = {
      type: 'keydown',
      key,
      code: `Key${key.toUpperCase()}`,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      nativeEventRef: createTransientNativeRef('input-event')
    };
    for (const listener of [...this.#listeners.values()]) listener(event);
  }
}

const defaultStyle: ElementStyleState = { strokes: [{ color: '#ffcc33', width: 2 }] };

export function createDrawLifecycleHarness(style: ElementStyleState = defaultStyle) {
  const shapes = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
  const store = new ElementStore(shapes);
  const styles = new StyleService(store);
  const coordinator = new InteractionCoordinator();
  const drawPort = new TrackedDrawPort();
  const editPort = new TrackedEditPort();
  const input = new TrackedKeyboardInput();
  let nextId = 0;
  const draw = new DrawService({
    store,
    shapes,
    styles,
    coordinator,
    drawPort,
    editPort,
    input,
    defaultStyle: () => style,
    createId: () => `lifecycle-draw-${++nextId}`
  });
  const destroy = (): void => {
    draw.destroy();
    coordinator.destroy();
    store.destroy();
  };
  return { coordinator, destroy, draw, drawPort, editPort, input, shapes, store, styles };
}

export class EuclideanMeasurementPort implements MeasurementPort {
  measureLine(coordinates: readonly Coordinate[], mode: 'path' | 'radial'): LineMeasurement | undefined {
    if (coordinates.length < 2) return undefined;
    const pairs =
      mode === 'radial'
        ? coordinates.slice(1).map((coordinate) => [coordinates[0], coordinate] as const)
        : coordinates.slice(1).map((coordinate, index) => [coordinates[index], coordinate] as const);
    const segments = pairs.map(([start, end]) => createSegment(start, end));
    return Object.freeze({
      meters: segments.reduce((total, segment) => total + segment.meters, 0),
      anchor: cloneCoordinate(coordinates[coordinates.length - 1]),
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
    return Object.freeze({
      squareMeters: Math.abs(twiceArea) / 2,
      anchor: cloneCoordinate(ring[0]),
      verticesGeographic: Object.freeze(ring.map(cloneCoordinate))
    });
  }
}

export class TrackedTooltips implements MeasurementTooltipPort {
  readonly records = new Map<NativeRef<'element'>, { text: string; style: Parameters<MeasurementTooltipPort['create']>[0] }>();
  readonly released: NativeRef<'element'>[] = [];

  get activeCount(): number {
    return this.records.size;
  }

  create(style: Parameters<MeasurementTooltipPort['create']>[0]): NativeRef<'element'> {
    const reference = createNativeRef('element');
    this.records.set(reference, { text: '', style });
    return reference;
  }

  setText(reference: NativeRef<'element'>, text: string): void {
    const record = this.records.get(reference);
    if (record === undefined) throw new Error('测量 tooltip 不存在');
    record.text = text;
  }

  release(reference: NativeRef<'element'>): void {
    if (!this.records.delete(reference)) return;
    this.released.push(reference);
  }
}

export interface TrackedOverlayRecord {
  readonly id: string;
  readonly module: string | undefined;
  readonly reference: NativeRef<'element'>;
  position: Coordinate | undefined;
  active: boolean;
  destroyCalls: number;
}

export class TrackedOverlays implements MeasurementOverlayService {
  readonly records = new Map<string, TrackedOverlayRecord>();
  removeCalls = 0;
  #nextId = 0;

  constructor(private readonly tooltips: TrackedTooltips) {}

  get activeCount(): number {
    return this.records.size;
  }

  add<T>(spec: InternalOverlaySpec<T>): OverlayHandle<T> {
    const id = spec.id ?? `lifecycle-overlay-${++this.#nextId}`;
    const record: TrackedOverlayRecord = {
      id,
      module: spec.module,
      reference: spec.elementRef,
      position: spec.position,
      active: true,
      destroyCalls: 0
    };
    this.records.set(id, record);
    const destroy = (): void => {
      record.destroyCalls += 1;
      if (!record.active) return;
      record.active = false;
      this.records.delete(id);
      this.tooltips.release(record.reference);
    };
    return {
      id,
      get position() {
        return record.position;
      },
      get visible() {
        return record.active && record.position !== undefined;
      },
      setPosition: (position: Coordinate | undefined) => {
        record.position = position;
      },
      destroy
    } as unknown as OverlayHandle<T>;
  }

  addExternal(module = 'external'): TrackedOverlayRecord {
    const handle = this.add({ elementRef: createNativeRef('element'), position: [99, 99], module });
    const record = this.records.get(handle.id);
    if (record === undefined) throw new Error('外部 overlay 创建失败');
    return record;
  }

  remove(selector: InternalOverlaySelector): number {
    this.removeCalls += 1;
    const selected = [...this.records.values()].filter((record) => selector.module === undefined || record.module === selector.module);
    for (const record of selected) {
      if (!record.active) continue;
      record.active = false;
      record.destroyCalls += 1;
      this.records.delete(record.id);
      this.tooltips.release(record.reference);
    }
    return selected.length;
  }
}

export function createMeasureLifecycleHarness() {
  const base = createDrawLifecycleHarness();
  const tooltips = new TrackedTooltips();
  const overlays = new TrackedOverlays(tooltips);
  let nextId = 0;
  const measure = new MeasureService({
    draw: base.draw,
    store: base.store,
    styles: base.styles,
    overlays,
    measurement: new EuclideanMeasurementPort(),
    tooltips,
    defaultLayerId: 'measure-layer',
    createId: () => `lifecycle-measure-${++nextId}`
  });
  const destroy = (): void => {
    measure.destroy();
    base.destroy();
  };
  return { ...base, destroy, measure, overlays, tooltips };
}

export function finishActiveSession(coordinator: InteractionCoordinator, coordinate: Coordinate): 'consume' | 'pass' {
  return coordinator.handleContextMenu(rightClick(coordinate));
}

function rightClick(coordinate: Coordinate): RoutedPointerEvent<'rightclick'> {
  return {
    type: 'rightclick',
    coordinate: cloneCoordinate(coordinate),
    pixel: [0, 0],
    nativeEventRef: createTransientNativeRef('input-event')
  };
}

function createSegment(start: Coordinate, end: Coordinate): MeasurementSegment {
  const anchor: Coordinate = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  return Object.freeze({
    start: cloneCoordinate(start),
    end: cloneCoordinate(end),
    startGeographic: cloneCoordinate(start),
    endGeographic: cloneCoordinate(end),
    anchor,
    meters: Math.hypot(end[0] - start[0], end[1] - start[1])
  });
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}
