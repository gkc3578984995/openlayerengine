import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { InteractionConflictError, ObjectDisposedError } from '../src/core/errors.js';
import type { DrawInteractionEvent, DrawInteractionHandle, DrawInteractionPort, DrawInteractionSpec } from '../src/core/ports/DrawInteractionPort.js';
import type {
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState,
  EditInteractionSpec
} from '../src/core/ports/EditInteractionPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { ElementStyleState } from '../src/core/style/types.js';
import { DrawService } from '../src/services/draw/DrawService.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import type { RoutedPointerEvent } from '../src/services/events/types.js';
import { StyleService } from '../src/services/style/StyleService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

const style: ElementStyleState = { strokes: [{ color: '#ff3300', width: 2 }] };

class FakeDrawPort implements DrawInteractionPort {
  readonly destroy = vi.fn();
  listener: ((event: DrawInteractionEvent) => void) | undefined;
  onOpen: (() => void) | undefined;

  open(_spec: Readonly<DrawInteractionSpec>, listener: (event: DrawInteractionEvent) => void): DrawInteractionHandle {
    this.listener = listener;
    const onOpen = this.onOpen;
    this.onOpen = undefined;
    onOpen?.();
    return { render: vi.fn(), destroy: this.destroy };
  }
}

class FakeEditPort implements EditInteractionPort {
  readonly destroy = vi.fn();
  readonly renders: Readonly<EditInteractionRenderState>[] = [];
  listener: ((event: EditInteractionEvent) => void) | undefined;
  onOpen: (() => void) | undefined;
  onRender: (() => void) | undefined;
  spec: Readonly<EditInteractionSpec> | undefined;

  open(spec: Readonly<EditInteractionSpec>, listener: (event: EditInteractionEvent) => void): EditInteractionHandle {
    this.spec = spec;
    this.listener = listener;
    const onOpen = this.onOpen;
    this.onOpen = undefined;
    onOpen?.();
    return {
      placement: { controlPoints: spec.controlPoints.map((coordinate) => [...coordinate]), handoff: { kind: 'identity' } },
      render: (state) => {
        this.renders.push(state);
        const onRender = this.onRender;
        this.onRender = undefined;
        onRender?.();
      },
      destroy: this.destroy
    };
  }

  emit(event: EditInteractionEvent): void {
    this.listener?.(event);
  }
}

function setup() {
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  const store = new ElementStore(shapes);
  store.add({
    id: 'editable',
    type: 'polyline',
    geometry: {
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [4, 0]
      ]
    },
    style,
    layerId: 'draw-layer',
    visible: true
  });
  const coordinator = new InteractionCoordinator();
  const drawPort = new FakeDrawPort();
  const editPort = new FakeEditPort();
  const service = new DrawService({
    store,
    shapes,
    styles: new StyleService(store),
    coordinator,
    drawPort,
    editPort,
    defaultStyle: () => style,
    errorReporter: vi.fn()
  });
  return { coordinator, drawPort, editPort, service, store };
}

function rightClick(): RoutedPointerEvent<'rightclick'> {
  return {
    type: 'rightclick',
    coordinate: [0, 0],
    pixel: [0, 0],
    nativeEventRef: {} as RoutedPointerEvent<'rightclick'>['nativeEventRef']
  };
}

describe('Draw interaction coordination', () => {
  coversCapabilities('earth-default-interaction-policy', 'edit-session-rightclick-commit');

  it('opens Edit through DrawService, replaces by default, and rejects explicitly', () => {
    const { coordinator, editPort, service } = setup();
    const edit = service.edit('editable');
    expect(editPort.spec).toMatchObject({ elementId: 'editable', underlay: false });
    expect(coordinator.active).toBe(edit);

    const draw = service.start({ type: 'point', layerId: 'draw-layer', style });
    expect(edit.status).toBe('cancelled');
    expect(coordinator.active).toBe(draw);
    expect(() => service.edit('editable', { policy: 'reject' })).toThrow(InteractionConflictError);
    expect(coordinator.active).toBe(draw);
  });

  it('rejects a Draw session cancelled before its native handle returns and retries late-handle cleanup', () => {
    const { coordinator, drawPort, service } = setup();
    let replacement: ReturnType<DrawService['start']> | undefined;
    drawPort.destroy.mockImplementationOnce(() => {
      throw new Error('first late Draw cleanup failed');
    });
    drawPort.onOpen = () => {
      replacement = service.start({ type: 'point', layerId: 'draw-layer', style });
    };

    expect(() => service.start({ type: 'point', layerId: 'draw-layer', style })).toThrow(ObjectDisposedError);
    expect(drawPort.destroy).toHaveBeenCalledTimes(2);
    expect(replacement?.status).toBe('active');
    expect(coordinator.active).toBe(replacement);
    replacement?.cancel();
  });

  it('rejects an Edit session cancelled before its native handle returns and retries late-handle cleanup', () => {
    const { coordinator, editPort, service, store } = setup();
    editPort.destroy.mockImplementationOnce(() => {
      throw new Error('first late Edit cleanup failed');
    });
    editPort.onOpen = () => {
      store.update({ id: 'editable' }, { visible: false });
    };

    expect(() => service.edit('editable')).toThrow(ObjectDisposedError);
    expect(editPort.destroy).toHaveBeenCalledTimes(2);
    expect(coordinator.active).toBeUndefined();
  });

  it('rejects an Edit session cancelled during its initial render', () => {
    const { coordinator, editPort, service, store } = setup();
    editPort.onRender = () => {
      store.update({ id: 'editable' }, { visible: false });
    };

    expect(() => service.edit('editable')).toThrow(ObjectDisposedError);
    expect(editPort.destroy).toHaveBeenCalledOnce();
    expect(coordinator.active).toBeUndefined();
  });

  it('commits a service-owned edit on right-click and releases coordination', () => {
    const { coordinator, editPort, service, store } = setup();
    const edit = service.edit('editable', { underlay: true });
    const anchor = editPort.renders[0].anchors.find((candidate) => candidate.kind === 'control' && candidate.index === 1);
    if (anchor?.kind !== 'control') throw new Error('Missing edit anchor');
    editPort.emit({ type: 'move-start', anchor, coordinate: anchor.coordinate });
    editPort.emit({ type: 'move-end', anchor, coordinate: [6, 2] });

    expect(coordinator.handleContextMenu(rightClick())).toBe('consume');

    expect(edit.status).toBe('finished');
    expect(coordinator.active).toBeUndefined();
    expect(store.get('editable')?.geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [6, 2]
      ]
    });
  });

  it('retries failed Edit cleanup when DrawService destruction is called again', () => {
    const { editPort, service } = setup();
    service.edit('editable');
    editPort.destroy.mockImplementationOnce(() => {
      throw new Error('native cleanup failed');
    });

    service.destroy();
    service.destroy();

    expect(editPort.destroy).toHaveBeenCalledTimes(2);
  });

  it('retains a Draw handle when native cleanup reenters the session before failing', () => {
    const { drawPort, service } = setup();
    const session = service.start({ type: 'point', layerId: 'draw-layer', style });
    drawPort.destroy.mockImplementationOnce(() => {
      session.destroy();
      throw new Error('outer Draw cleanup failed');
    });

    service.destroy();
    expect(drawPort.destroy).toHaveBeenCalledOnce();

    service.destroy();
    expect(drawPort.destroy).toHaveBeenCalledTimes(2);
  });

  it('retains an Edit handle when native cleanup reenters the session before failing', () => {
    const { editPort, service } = setup();
    const session = service.edit('editable');
    editPort.destroy.mockImplementationOnce(() => {
      session.destroy();
      throw new Error('outer Edit cleanup failed');
    });

    service.destroy();
    expect(editPort.destroy).toHaveBeenCalledOnce();

    service.destroy();
    expect(editPort.destroy).toHaveBeenCalledTimes(2);
  });
});
