import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import type { Coordinate } from '../src/core/common/types.js';
import type { PreparedWorldEdit } from '../src/core/common/worldWrap.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { DrawInteractionPort } from '../src/core/ports/DrawInteractionPort.js';
import type {
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState,
  EditInteractionSpec
} from '../src/core/ports/EditInteractionPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { shapeTypes, type ShapeState, type ShapeType } from '../src/core/shape/types.js';
import type { ElementStyleState } from '../src/core/style/types.js';
import { DrawService } from '../src/services/draw/DrawService.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import { StyleService } from '../src/services/style/StyleService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

const style: ElementStyleState = {
  symbol: { type: 'circle', radius: 5, fill: { type: 'solid', color: '#3366ff' } },
  strokes: [{ color: '#3366ff', width: 2 }],
  fill: { type: 'solid', color: 'rgba(51, 102, 255, 0.2)' }
};

const representativePoints = {
  point: [[1, 2]],
  polyline: [
    [0, 0],
    [4, 2]
  ],
  polygon: [
    [0, 0],
    [4, 0],
    [2, 3]
  ],
  circle: [
    [0, 0],
    [2, 0]
  ],
  ellipse: [
    [0, 0],
    [4, 2]
  ],
  'attack-arrow': [
    [0, 0],
    [2, 0],
    [3, 3],
    [5, 4]
  ],
  'tailed-attack-arrow': [
    [0, 0],
    [2, 0],
    [3, 3],
    [5, 4]
  ],
  'fine-arrow': [
    [0, 0],
    [4, 3]
  ],
  'tailed-squad-combat-arrow': [
    [0, 0],
    [4, 3]
  ],
  'assault-direction-arrow': [
    [0, 0],
    [4, 3]
  ],
  'double-arrow': [
    [0, 0],
    [4, 0],
    [3, 3],
    [1, 3]
  ],
  rectangle: [
    [0, 0],
    [4, 3]
  ],
  triangle: [
    [0, 0],
    [4, 0],
    [2, 3]
  ],
  'equilateral-triangle': [
    [0, 0],
    [4, 0]
  ],
  'assemble-polygon': [
    [0, 0],
    [2, 3],
    [4, 0]
  ],
  'closed-curve-polygon': [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3]
  ],
  sector: [
    [0, 0],
    [4, 0],
    [0, 4]
  ],
  'lune-polygon': [
    [0, 0],
    [4, 0],
    [2, 3]
  ],
  'lune-polyline': [
    [0, 0],
    [4, 0],
    [2, 3]
  ],
  'curve-polyline': [
    [0, 0],
    [2, 3],
    [4, 0]
  ]
} satisfies Record<ShapeType, readonly Coordinate[]>;

class FakeEditPort implements EditInteractionPort {
  readonly renders: Readonly<EditInteractionRenderState>[] = [];
  readonly destroy = vi.fn();
  listener: ((event: Readonly<EditInteractionEvent>) => void) | undefined;
  spec: Readonly<EditInteractionSpec> | undefined;
  placement: PreparedWorldEdit | undefined;

  open(spec: Readonly<EditInteractionSpec>, listener: (event: Readonly<EditInteractionEvent>) => void): EditInteractionHandle {
    this.spec = spec;
    this.listener = listener;
    const placement =
      this.placement ??
      Object.freeze({
        controlPoints: spec.controlPoints.map((coordinate) => [...coordinate] as Coordinate),
        handoff: Object.freeze({ kind: 'identity' as const })
      });
    return {
      placement,
      render: (state) => this.renders.push(state),
      destroy: this.destroy
    };
  }
}

function completeRepresentative(shapes: ShapeRegistry, type: ShapeType): ShapeState {
  const definition = shapes.get(type);
  const draft = definition.createDraft(representativePoints[type]);
  if (draft === undefined) throw new Error(`${type} representative draft is unavailable`);
  const completion = definition.tryComplete(draft as never);
  if (completion.status === 'incomplete') throw new Error(`${type} representative draft is incomplete`);
  return definition.clone(completion.state as never) as ShapeState;
}

describe('Shape editing parity', () => {
  coversCapabilities(
    'edit-shape-point',
    'edit-shape-polyline',
    'edit-shape-polygon',
    'edit-shape-circle',
    'edit-shape-ellipse',
    'edit-shape-attack-arrow',
    'edit-shape-tailed-attack-arrow',
    'edit-shape-fine-arrow',
    'edit-shape-tailed-squad-combat-arrow',
    'edit-shape-assault-direction-arrow',
    'edit-shape-double-arrow',
    'edit-shape-rectangle',
    'edit-shape-triangle',
    'edit-shape-equilateral-triangle',
    'edit-shape-assemble-polygon',
    'edit-shape-closed-curve-polygon',
    'edit-shape-sector',
    'edit-shape-lune-polygon',
    'edit-shape-lune-polyline',
    'edit-shape-curve-polyline'
  );

  it.each(shapeTypes)('edits %s through its registered semantic definition in one commit', async (type) => {
    const shapes = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
    const definition = shapes.get(type);
    const topology = definition.editTopology;
    expect(definition.capabilities.has('edit')).toBe(true);
    expect(topology).toBeDefined();
    if (topology === undefined) throw new Error(`${type} edit topology is unavailable`);
    const geometry = completeRepresentative(shapes, type);
    const store = new ElementStore(shapes);
    const id = `edit-parity-${type}`;
    const original = store.add({
      id,
      type,
      geometry,
      style,
      data: { shape: type },
      module: 'shape-editing-parity',
      layerId: 'edit-layer',
      visible: false
    });
    const port = new FakeEditPort();
    const service = new DrawService({
      store,
      shapes,
      styles: new StyleService(store),
      coordinator: new InteractionCoordinator(),
      drawPort: {} as DrawInteractionPort,
      editPort: port,
      defaultStyle: () => style
    });
    const session = service.edit(id);

    const description = topology.describe(geometry as never);
    const expectedControlPoints = [...description.handles].sort((left, right) => left.index - right.index).map(({ coordinate }) => coordinate);
    expect(port.spec).toEqual({ elementId: id, controlPoints: expectedControlPoints, underlay: false });
    expect(port.renders).toHaveLength(1);
    expect(port.renders[0]).toEqual({
      geometry: definition.toRenderGeometry(geometry as never),
      style,
      anchors: [
        ...description.handles.map((anchor) => ({ ...anchor, kind: 'control' })),
        ...description.insertions.map((anchor) => ({ ...anchor, kind: 'insertion' }))
      ]
    });

    const transaction = vi.spyOn(store, 'transaction');
    session.finish();

    expect(session.status).toBe('finished');
    expect(port.destroy).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledOnce();
    const final = store.get(id);
    expect(final).toEqual(original);
    expect(final?.geometry).toEqual(geometry);
    expect(definition.isComplete(final?.geometry as never)).toBe(true);
    expect(definition.toRenderGeometry(final?.geometry as never)).toEqual(definition.toRenderGeometry(geometry as never));
    expect(topology.describe(final?.geometry as never)).toEqual(description);
    await expect(session.finished).resolves.toEqual(final);
  });
});
