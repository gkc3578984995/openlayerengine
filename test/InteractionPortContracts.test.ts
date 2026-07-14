import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../src/core/common/types.js';
import type { PreparedWorldEdit } from '../src/core/common/worldWrap.js';
import type {
  DrawInteractionEvent,
  DrawInteractionHandle,
  DrawInteractionPort,
  DrawInteractionRenderState,
  DrawInteractionSpec
} from '../src/core/ports/DrawInteractionPort.js';
import type {
  EditControlAnchor,
  EditInsertionAnchor,
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState,
  EditInteractionSpec
} from '../src/core/ports/EditInteractionPort.js';

class RecordingDrawPort implements DrawInteractionPort {
  spec: Readonly<DrawInteractionSpec> | undefined;
  listener: ((event: DrawInteractionEvent) => void) | undefined;
  readonly renders: Array<Readonly<DrawInteractionRenderState> | undefined> = [];
  readonly handle: DrawInteractionHandle;

  constructor(world: DrawInteractionHandle['world']) {
    this.handle = {
      world,
      render: (state) => this.renders.push(state),
      destroy: () => undefined
    };
  }

  open(spec: Readonly<DrawInteractionSpec>, listener: (event: DrawInteractionEvent) => void): DrawInteractionHandle {
    this.spec = spec;
    this.listener = listener;
    return this.handle;
  }
}

class RecordingEditPort implements EditInteractionPort {
  spec: Readonly<EditInteractionSpec> | undefined;
  listener: ((event: EditInteractionEvent) => void) | undefined;
  readonly renders: Readonly<EditInteractionRenderState>[] = [];
  readonly handle: EditInteractionHandle;

  constructor(placement: PreparedWorldEdit) {
    this.handle = {
      placement,
      render: (state) => this.renders.push(state),
      destroy: () => undefined
    };
  }

  open(spec: Readonly<EditInteractionSpec>, listener: (event: EditInteractionEvent) => void): EditInteractionHandle {
    this.spec = spec;
    this.listener = listener;
    return this.handle;
  }
}

describe('interaction port contracts', () => {
  it('keeps ordinary clicks and Shift freehand available in the same vertex session', () => {
    const port = new RecordingDrawPort({ minX: -180, width: 360 });
    const events: DrawInteractionEvent[] = [];
    const handle = port.open({ layerId: 'draw', mode: 'vertices', freehand: true }, (event) => events.push(event));

    port.listener?.({ type: 'click', coordinate: [179, 1] });
    port.listener?.({ type: 'freehand-start', coordinate: [179, 1] });
    port.listener?.({ type: 'freehand-sample', coordinate: [-179, 2] });
    port.listener?.({ type: 'freehand-complete', coordinate: [-178, 3] });

    expect(port.spec).toEqual({ layerId: 'draw', mode: 'vertices', freehand: true });
    expect(events.map(({ type }) => type)).toEqual(['click', 'freehand-start', 'freehand-sample', 'freehand-complete']);
    expect(handle.world).toEqual({ minX: -180, width: 360 });
  });

  it('separates editable control anchors from semantic insertion anchors', () => {
    const placement = {
      controlPoints: [[360, 0] as Coordinate],
      handoff: { kind: 'wrapped' as const, world: { minX: -180, width: 360 } }
    } satisfies PreparedWorldEdit;
    const port = new RecordingEditPort(placement);
    const events: EditInteractionEvent[] = [];
    const handle = port.open({ elementId: 'target', controlPoints: [[0, 0]], underlay: false }, (event) => events.push(event));
    const control = {
      kind: 'control',
      index: 0,
      coordinate: [360, 0],
      role: 'tail-left',
      removable: false
    } satisfies EditControlAnchor;
    const insertion = { kind: 'insertion', index: 1, coordinate: [361, 0] } satisfies EditInsertionAnchor;

    port.listener?.({ type: 'move-start', anchor: control, coordinate: [360, 0] });
    port.listener?.({ type: 'move', anchor: control, coordinate: [362, 1] });
    port.listener?.({ type: 'move-end', anchor: control, coordinate: [362, 1] });
    port.listener?.({ type: 'insert', anchor: insertion });
    port.listener?.({ type: 'remove', anchor: control });

    expect(handle.placement).toBe(placement);
    expect(events.map(({ type }) => type)).toEqual(['move-start', 'move', 'move-end', 'insert', 'remove']);
    expect(events.at(-2)).toEqual({ type: 'insert', anchor: insertion });
  });
});
