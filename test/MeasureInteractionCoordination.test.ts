import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { InteractionConflictError, ObjectDisposedError } from '../src/core/errors.js';
import type { DrawInteractionEvent, DrawInteractionHandle, DrawInteractionPort, DrawInteractionSpec } from '../src/core/ports/DrawInteractionPort.js';
import type { EditInteractionPort } from '../src/core/ports/EditInteractionPort.js';
import type { LineMeasurement, MeasurementPort, SurfaceMeasurement } from '../src/core/ports/MeasurementPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { DrawService } from '../src/services/draw/DrawService.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import { MeasureService } from '../src/services/measure/MeasureService.js';
import type { MeasurementOverlayService, MeasurementTooltipPort } from '../src/services/measure/types.js';
import { StyleService } from '../src/services/style/StyleService.js';

class DrawPort implements DrawInteractionPort {
  listener: ((event: Readonly<DrawInteractionEvent>) => void) | undefined;
  destroys = 0;

  open(_spec: Readonly<DrawInteractionSpec>, listener: (event: Readonly<DrawInteractionEvent>) => void): DrawInteractionHandle {
    this.listener = listener;
    return {
      render: () => undefined,
      destroy: () => {
        this.destroys += 1;
        if (this.listener === listener) this.listener = undefined;
      }
    };
  }

  click(coordinate: readonly [number, number]): void {
    this.listener?.({ type: 'click', coordinate });
  }

  emit(event: DrawInteractionEvent): void {
    this.listener?.(event);
  }
}

function setup() {
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  const store = new ElementStore(shapes);
  const styles = new StyleService(store);
  const coordinator = new InteractionCoordinator();
  const port = new DrawPort();
  let id = 0;
  const draw = new DrawService({
    store,
    shapes,
    styles,
    coordinator,
    drawPort: port,
    editPort: {} as EditInteractionPort,
    defaultStyle: () => ({ strokes: [{ color: '#ffcc33', width: 2 }] }),
    createId: () => `draw-${++id}`
  });
  const measurement: MeasurementPort = {
    measureLine: (coordinates) =>
      coordinates.length < 2
        ? undefined
        : ({
            meters: 1,
            anchor: coordinates[coordinates.length - 1],
            segments: [
              {
                start: coordinates[0],
                end: coordinates[1],
                startGeographic: coordinates[0],
                endGeographic: coordinates[1],
                anchor: coordinates[1],
                meters: 1
              }
            ]
          } as LineMeasurement),
    measureArea: () => undefined as SurfaceMeasurement | undefined
  };
  const tooltips: MeasurementTooltipPort = {
    create: () => Object.freeze({}) as never,
    setText: () => undefined,
    release: () => undefined
  };
  const overlays: MeasurementOverlayService = {
    add: () => ({ setPosition: () => undefined, destroy: () => undefined }) as never,
    remove: () => 0
  };
  const measure = new MeasureService({ draw, store, styles, overlays, measurement, tooltips, defaultLayerId: 'measure' });
  return { coordinator, measure, port };
}

describe('Measure interaction coordination', () => {
  it('replaces the active measure session and releases its interaction exactly once', async () => {
    const { measure, port } = setup();
    const first = measure.start({ type: 'distance-total' });
    const cancelled = vi.fn();
    first.on('cancel', cancelled);

    const second = measure.start({ type: 'distance-segments' });

    await expect(first.finished).resolves.toBeUndefined();
    expect(first.status).toBe('cancelled');
    expect(cancelled).toHaveBeenCalledOnce();
    expect(second.status).toBe('active');
    expect(port.destroys).toBe(1);
  });

  it('rejects a conflicting session without changing the active session', () => {
    const { measure } = setup();
    const active = measure.start({ type: 'distance-total' });

    expect(() => measure.start({ type: 'area', policy: 'reject' })).toThrow(InteractionConflictError);
    expect(active.status).toBe('active');
  });

  it('lets right-click finish the measure before map-menu routing', async () => {
    const { coordinator, measure, port } = setup();
    const session = measure.start({ type: 'distance-total', unit: 'm' });
    port.click([0, 0]);
    port.click([1, 0]);

    const decision = coordinator.handleContextMenu({ type: 'rightclick', coordinate: [1, 0], pixel: [1, 1], nativeEventRef: {} as never });

    expect(decision).toBe('consume');
    await expect(session.finished).resolves.toMatchObject({ value: 1 });
  });

  it('keeps the measure active after a non-terminal freehand cancellation and later releases it', async () => {
    const { measure, port } = setup();
    const session = measure.start({ type: 'distance-total' });

    port.emit({ type: 'freehand-start', coordinate: [0, 0] });
    port.emit({ type: 'freehand-cancel' });

    expect(session.status).toBe('active');
    expect(() => measure.start({ type: 'distance-segments', policy: 'reject' })).toThrow(InteractionConflictError);
    session.cancel();
    await expect(session.finished).resolves.toBeUndefined();
    expect(measure.start({ type: 'distance-segments', policy: 'reject' }).status).toBe('active');
  });

  it('blocks reentrant starts while destroy callbacks are running', () => {
    const { measure } = setup();
    const session = measure.start({ type: 'distance-total' });
    let reentrantError: unknown;
    session.on('cancel', () => {
      try {
        measure.start({ type: 'distance-segments' });
      } catch (error) {
        reentrantError = error;
      }
    });

    measure.destroy();

    expect(reentrantError).toBeInstanceOf(ObjectDisposedError);
    expect(() => measure.start({ type: 'distance-segments' })).toThrow(ObjectDisposedError);
  });
});
