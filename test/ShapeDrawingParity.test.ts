import { describe, expect, it, vi } from 'vitest';
import { identityShapeProjection } from './helpers/shapeProjection.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import type { Coordinate } from '../src/core/common/types.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type {
  DrawInteractionEvent,
  DrawInteractionHandle,
  DrawInteractionPort,
  DrawInteractionRenderState,
  DrawInteractionSpec
} from '../src/core/ports/DrawInteractionPort.js';
import type { EditInteractionPort } from '../src/core/ports/EditInteractionPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { shapeTypes, type ShapeType } from '../src/core/shape/types.js';
import type { ElementStyleState } from '../src/core/style/types.js';
import { DrawService } from '../src/services/draw/DrawService.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import { StyleService } from '../src/services/style/StyleService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

const style: ElementStyleState = { strokes: [{ color: '#3366ff', width: 2 }] };

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

class FakeDrawPort implements DrawInteractionPort {
  readonly previews: Array<Readonly<DrawInteractionRenderState> | undefined> = [];
  readonly destroy = vi.fn();
  listener: ((event: Readonly<DrawInteractionEvent>) => void) | undefined;

  open(_spec: Readonly<DrawInteractionSpec>, listener: (event: Readonly<DrawInteractionEvent>) => void): DrawInteractionHandle {
    this.listener = listener;
    return {
      render: (preview) => this.previews.push(preview),
      destroy: this.destroy
    };
  }

  click(coordinate: Coordinate): void {
    this.listener?.({ type: 'click', coordinate });
  }
}

describe('Shape drawing parity', () => {
  coversCapabilities(
    'draw-shape-point',
    'draw-shape-polyline',
    'draw-shape-polygon',
    'draw-shape-circle',
    'draw-shape-ellipse',
    'draw-shape-attack-arrow',
    'draw-shape-tailed-attack-arrow',
    'draw-shape-fine-arrow',
    'draw-shape-tailed-squad-combat-arrow',
    'draw-shape-assault-direction-arrow',
    'draw-shape-double-arrow',
    'draw-shape-rectangle',
    'draw-shape-triangle',
    'draw-shape-equilateral-triangle',
    'draw-shape-assemble-polygon',
    'draw-shape-closed-curve-polygon',
    'draw-shape-sector',
    'draw-shape-lune-polygon',
    'draw-shape-lune-polyline',
    'draw-shape-curve-polyline'
  );

  it.each(shapeTypes)('draws %s through the registered semantic definition', (type) => {
    const shapes = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
    const store = new ElementStore(shapes);
    const port = new FakeDrawPort();
    let nextId = 0;
    const service = new DrawService({
      store,
      shapes,
      shapeProjection: identityShapeProjection,
      styles: new StyleService(store),
      coordinator: new InteractionCoordinator(),
      drawPort: port,
      editPort: {} as EditInteractionPort,
      defaultStyle: () => style,
      createId: () => `${type}-${++nextId}`
    });
    const session = service.start({ type, layerId: 'draw-layer', style });
    const points = representativePoints[type];

    for (const coordinate of points) port.click(coordinate);
    session.finish();

    const definition = shapes.get(type);
    const draft = definition.createDraft(points);
    expect(draft).toBeDefined();
    const completion = definition.tryComplete(draft as never);
    expect(completion.status).toBe('complete');
    if (completion.status !== 'complete') throw new Error(`${type} representative state is incomplete`);
    expect(session.results).toHaveLength(1);
    expect(session.results[0].geometry).toEqual(completion.state);
    expect(port.previews.some((preview) => preview !== undefined)).toBe(true);
    expect(store.query()).toHaveLength(1);
  });

  it.each([
    ['polyline', { kind: 'open' }],
    ['curve-polyline', { kind: 'open' }],
    ['polygon', { kind: 'closed', rings: 'outer', seam: 'preserve-spacing' }]
  ] as const)('keeps one linework StyleSpec from %s preview through the committed Element', (type, contour) => {
    const lineworkStyle: ElementStyleState = {
      linework: {
        tracks: [
          { offset: -3, stroke: { color: '#f00', width: 2, lineDash: [8, 6] } },
          { offset: 3, stroke: { color: '#f00', width: 2 } }
        ],
        decorations: [
          {
            placement: { kind: 'repeat', spacing: 24 },
            sequence: [
              {
                primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#f00' } }]
              }
            ]
          }
        ],
        contour
      }
    };
    const shapes = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
    const store = new ElementStore(shapes);
    const port = new FakeDrawPort();
    const service = new DrawService({
      store,
      shapes,
      shapeProjection: identityShapeProjection,
      styles: new StyleService(store),
      coordinator: new InteractionCoordinator(),
      drawPort: port,
      editPort: {} as EditInteractionPort,
      defaultStyle: () => lineworkStyle,
      createId: () => `linework-${type}`
    });
    const session = service.start({ type, layerId: 'draw-layer', style: lineworkStyle });
    for (const coordinate of representativePoints[type]) port.click(coordinate);

    const lastPreview = port.previews.filter((preview) => preview !== undefined).at(-1);
    expect(lastPreview?.style).toEqual(lineworkStyle);
    session.finish();

    expect(session.results[0]?.style).toEqual(lineworkStyle);
    expect(store.get(`linework-${type}`)?.style).toEqual(lineworkStyle);
    expect(port.destroy).toHaveBeenCalledOnce();
  });
});
