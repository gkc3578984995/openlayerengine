import { describe, expect, it } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import { CapabilityError, InvalidArgumentError } from '../src/core/errors.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { shapeTypes as coreShapeTypes } from '../src/core/shape/types.js';
import type { ShapeCapability, ShapeDefinition, ShapeState, ShapeType } from '../src/core/shape/types.js';

const shapeTypes = coreShapeTypes;

function createBuiltinShapeRegistry(): ShapeRegistry {
  return new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
}

const inputs: Record<ShapeType, unknown> = {
  point: { type: 'point', controlPoints: [[1, 2]] },
  polyline: {
    type: 'polyline',
    controlPoints: [
      [0, 0],
      [2, 1]
    ]
  },
  polygon: {
    type: 'polygon',
    controlPoints: [
      [0, 0],
      [3, 0],
      [1, 2]
    ]
  },
  circle: { type: 'circle', center: [0, 0], radius: 2 },
  ellipse: {
    type: 'ellipse',
    controlPoints: [
      [0, 0],
      [3, 2]
    ]
  },
  'attack-arrow': {
    type: 'attack-arrow',
    controlPoints: [
      [0, 0],
      [2, 0],
      [3, 3],
      [5, 4]
    ]
  },
  'tailed-attack-arrow': {
    type: 'tailed-attack-arrow',
    controlPoints: [
      [0, 0],
      [2, 0],
      [3, 3],
      [5, 4]
    ]
  },
  'fine-arrow': {
    type: 'fine-arrow',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'tailed-squad-combat-arrow': {
    type: 'tailed-squad-combat-arrow',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'assault-direction-arrow': {
    type: 'assault-direction-arrow',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'double-arrow': {
    type: 'double-arrow',
    controlPoints: [
      [0, 0],
      [4, 0],
      [3, 3],
      [1, 3],
      [2, 0]
    ]
  },
  rectangle: {
    type: 'rectangle',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  triangle: {
    type: 'triangle',
    controlPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'equilateral-triangle': {
    type: 'equilateral-triangle',
    controlPoints: [
      [0, 0],
      [4, 0]
    ]
  },
  'assemble-polygon': {
    type: 'assemble-polygon',
    controlPoints: [
      [0, 0],
      [2, 3],
      [4, 0]
    ]
  },
  'closed-curve-polygon': {
    type: 'closed-curve-polygon',
    controlPoints: [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3]
    ]
  },
  sector: {
    type: 'sector',
    controlPoints: [
      [0, 0],
      [4, 0],
      [0, 4]
    ]
  },
  'lune-polygon': {
    type: 'lune-polygon',
    controlPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'lune-polyline': {
    type: 'lune-polyline',
    controlPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'curve-polyline': {
    type: 'curve-polyline',
    controlPoints: [
      [0, 0],
      [2, 3],
      [4, 0]
    ]
  }
};

function coordinatesAreFinite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0 && value.every(coordinatesAreFinite);
  if (value !== null && typeof value === 'object') return Object.values(value).every(coordinatesAreFinite);
  return true;
}

describe('ShapeRegistry', () => {
  it('snapshots and freezes semantic completion, edit topology, and freehand policies', () => {
    const editTopology = {
      describe: () => ({ handles: [{ index: 0, coordinate: [0, 0] as const, removable: false }], insertions: [] }),
      move: (_state: ShapeState<'point'>, _index: number, coordinate: readonly [number, number]) => ({
        type: 'point' as const,
        controlPoints: [coordinate]
      })
    };
    const freehand = {
      appendSample: (_samples: readonly (readonly [number, number])[], coordinate: readonly [number, number]) => [coordinate],
      normalizeSamples: () => ({ type: 'point' as const, controlPoints: [[0, 0] as const] })
    };
    const original: ShapeDefinition<ShapeState<'point'>> = {
      type: 'point',
      capabilities: new Set(['draw', 'edit', 'vertexEdit', 'freehand']),
      editTopology,
      freehand,
      createDraft: (controlPoints) => ({ type: 'point', controlPoints }),
      normalize: (input) => input as ShapeState<'point'>,
      clone: (state) => ({ type: 'point', controlPoints: state.controlPoints.map((coordinate) => [...coordinate]) }),
      isComplete: () => true,
      tryComplete: (state) => ({ status: 'complete', state }),
      toRenderGeometry: (state) => ({ type: 'point', coordinates: state.controlPoints[0] })
    };
    const snapshot = new ShapeRegistry([original]).get('point');

    editTopology.describe = () => ({ handles: [], insertions: [] });
    freehand.normalizeSamples = () => undefined;

    expect(Object.isFrozen(snapshot.editTopology)).toBe(true);
    expect(Object.isFrozen(snapshot.freehand)).toBe(true);
    expect(snapshot.editTopology?.describe({ type: 'point', controlPoints: [[9, 9]] }).handles).toHaveLength(1);
    expect(snapshot.freehand?.normalizeSamples([], 'preview')).toEqual({ type: 'point', controlPoints: [[0, 0]] });
    expect(snapshot.tryComplete({ type: 'point', controlPoints: [[1, 1]] })).toMatchObject({ status: 'complete' });
  });

  it('rejects accessor-backed nested shape policies without invoking getters', () => {
    let reads = 0;
    const topology = { move: (state: ShapeState<'point'>) => state } as Record<string, unknown>;
    Object.defineProperty(topology, 'describe', {
      enumerable: true,
      get() {
        reads += 1;
        return () => ({ handles: [], insertions: [] });
      }
    });
    const definition: ShapeDefinition<ShapeState<'point'>> = {
      type: 'point',
      capabilities: new Set(['edit', 'vertexEdit']),
      editTopology: topology as never,
      createDraft: (controlPoints) => ({ type: 'point', controlPoints }),
      normalize: (input) => input as ShapeState<'point'>,
      clone: (state) => state,
      isComplete: () => true,
      tryComplete: (state) => ({ status: 'complete', state }),
      toRenderGeometry: () => ({ type: 'point', coordinates: [0, 0] })
    };

    expect(() => new ShapeRegistry([definition])).toThrow(InvalidArgumentError);
    expect(reads).toBe(0);
  });

  it('rejects capability and topology operation drift', () => {
    const base: ShapeDefinition<ShapeState<'point'>> = {
      type: 'point',
      capabilities: new Set(['edit', 'vertexEdit', 'controlPointInsert']),
      editTopology: {
        describe: () => ({ handles: [{ index: 0, coordinate: [0, 0], removable: false }], insertions: [] }),
        move: (state) => state
      },
      createDraft: (controlPoints) => ({ type: 'point', controlPoints }),
      normalize: (input) => input as ShapeState<'point'>,
      clone: (state) => state,
      isComplete: () => true,
      tryComplete: (state) => ({ status: 'complete', state }),
      toRenderGeometry: () => ({ type: 'point', coordinates: [0, 0] })
    };

    expect(() => new ShapeRegistry([base])).toThrow(InvalidArgumentError);
    expect(
      () =>
        new ShapeRegistry([
          {
            ...base,
            capabilities: new Set(['edit', 'vertexEdit']),
            editTopology: { ...base.editTopology, insert: (state: ShapeState<'point'>) => state }
          }
        ])
    ).toThrow(InvalidArgumentError);
    expect(
      () =>
        new ShapeRegistry([
          {
            ...base,
            capabilities: new Set(['vertexEdit']),
            editTopology: {
              describe: base.editTopology?.describe as NonNullable<typeof base.editTopology>['describe'],
              move: base.editTopology?.move as NonNullable<typeof base.editTopology>['move']
            }
          }
        ])
    ).toThrow(InvalidArgumentError);
  });

  it('rejects duplicate registration without replacing the first definition', () => {
    const registry = new ShapeRegistry();
    const first: ShapeDefinition<ShapeState<'point'>> = {
      type: 'point',
      capabilities: new Set(['draw']),
      createDraft: (controlPoints) => ({ type: 'point', controlPoints }),
      normalize: (input) => input as ShapeState<'point'>,
      clone: (state) => state,
      isComplete: () => true,
      tryComplete: (state) => ({ status: 'complete', state }),
      toRenderGeometry: () => ({ type: 'point', coordinates: [0, 0] })
    };

    registry.register(first);

    expect(() => registry.register({ ...first, capabilities: new Set(['edit']) })).toThrow(InvalidArgumentError);
    expect(registry.get('point')).not.toBe(first);
    expect(registry.get('point').type).toBe(first.type);
  });

  it('snapshots and freezes definitions, policies, and capabilities at registration time', () => {
    const capabilities = new Set<ShapeCapability>(['draw']);
    const controlPointPolicy = { previewMin: 1, completeMin: 1, completeMax: 1 };
    const original: ShapeDefinition<ShapeState<'point'>> = {
      type: 'point',
      capabilities,
      controlPointPolicy,
      createDraft() {
        return { type: this.type, controlPoints: [[0, 0]] };
      },
      normalize() {
        return { type: this.type, controlPoints: [[0, 0]] };
      },
      clone(state) {
        return this.normalize(state);
      },
      isComplete() {
        return this.type === 'point';
      },
      tryComplete(state) {
        return { status: 'complete', state: this.normalize(state) };
      },
      toRenderGeometry(state) {
        return { type: 'point', coordinates: this.normalize(state).controlPoints[0] };
      }
    };
    const registry = new ShapeRegistry([original]);
    const snapshot = registry.get('point');

    capabilities.clear();
    capabilities.add('edit');
    controlPointPolicy.previewMin = 99;
    (original as { type: ShapeType }).type = 'polyline';
    (original as { normalize: ShapeDefinition<ShapeState<'point'>>['normalize'] }).normalize = () => {
      throw new Error('mutated original method');
    };

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.controlPointPolicy)).toBe(true);
    expect(snapshot.controlPointPolicy).toEqual({ previewMin: 1, completeMin: 1, completeMax: 1 });
    expect(snapshot.clone({ type: 'point', controlPoints: [[9, 9]] })).toEqual({ type: 'point', controlPoints: [[0, 0]] });
    expect(snapshot.toRenderGeometry({ type: 'point', controlPoints: [[9, 9]] })).toEqual({ type: 'point', coordinates: [0, 0] });
    expect(registry.supports('point', 'draw')).toBe(true);
    expect(registry.supports('point', 'edit')).toBe(false);
    expect(() => (snapshot.capabilities as Set<ShapeCapability>).add('edit')).toThrow();
  });

  it('rejects accessor-backed definitions and policies without invoking getters', () => {
    let definitionReads = 0;
    let policyReads = 0;
    const methods = {
      capabilities: new Set<ShapeCapability>(['draw']),
      createDraft: (controlPoints: readonly (readonly [number, number])[]) => ({ type: 'point' as const, controlPoints }),
      normalize: (input: unknown) => input as ShapeState<'point'>,
      clone: (state: ShapeState<'point'>) => state,
      isComplete: () => true,
      tryComplete: (state: ShapeState<'point'>) => ({ status: 'complete' as const, state }),
      toRenderGeometry: () => ({ type: 'point' as const, coordinates: [0, 0] as const })
    };
    const accessorDefinition = { ...methods } as Record<PropertyKey, unknown>;
    Object.defineProperty(accessorDefinition, 'type', {
      enumerable: true,
      get() {
        definitionReads += 1;
        return 'point';
      }
    });
    const accessorPolicy = { completeMin: 1 } as Record<PropertyKey, unknown>;
    Object.defineProperty(accessorPolicy, 'previewMin', {
      enumerable: true,
      get() {
        policyReads += 1;
        return 1;
      }
    });

    expect(() => new ShapeRegistry().register(accessorDefinition as unknown as ShapeDefinition<ShapeState<'point'>>)).toThrow(InvalidArgumentError);
    expect(() =>
      new ShapeRegistry().register({ type: 'point', controlPointPolicy: accessorPolicy, ...methods } as unknown as ShapeDefinition<ShapeState<'point'>>)
    ).toThrow(InvalidArgumentError);
    expect(definitionReads).toBe(0);
    expect(policyReads).toBe(0);
  });

  it('throws the stable capability error for an unknown runtime type', () => {
    const registry = new ShapeRegistry();

    expect(() => registry.get('not-a-shape' as ShapeType)).toThrow(CapabilityError);
    expect(() => registry.supports('not-a-shape' as ShapeType, 'draw')).toThrow(CapabilityError);
  });

  it('reports the exact deliberate capability matrix instead of treating every shape alike', () => {
    const registry = createBuiltinShapeRegistry();
    const standard = ['draw', 'edit', 'translate', 'rotate', 'scale', 'vertexEdit'] as const;
    const structural = ['controlPointInsert', 'controlPointRemove'] as const;
    const expected = new Map<ShapeType, readonly string[]>([
      ['point', [...standard, 'anchor']],
      ['polyline', [...standard, ...structural, 'path', 'freehand']],
      ['polygon', [...standard, ...structural, 'freehand']],
      ['circle', ['draw', 'edit', 'translate', 'scale', 'vertexEdit']],
      ['ellipse', ['draw', 'edit', 'translate', 'scale', 'vertexEdit']],
      ['attack-arrow', [...standard, ...structural]],
      ['tailed-attack-arrow', [...standard, ...structural]],
      ['fine-arrow', standard],
      ['tailed-squad-combat-arrow', standard],
      ['assault-direction-arrow', standard],
      ['double-arrow', standard],
      ['rectangle', ['draw', 'edit', 'translate', 'scale', 'vertexEdit']],
      ['triangle', standard],
      ['equilateral-triangle', standard],
      ['assemble-polygon', standard],
      ['closed-curve-polygon', [...standard, ...structural]],
      ['sector', standard],
      ['lune-polygon', standard],
      ['lune-polyline', [...standard, 'path']],
      ['curve-polyline', [...standard, ...structural, 'path']]
    ]);

    for (const type of shapeTypes) expect(new Set(registry.get(type).capabilities), type).toEqual(new Set(expected.get(type)));
  });

  it('keeps registered capability sets immutable at runtime', () => {
    const registry = createBuiltinShapeRegistry();
    const capabilities = registry.get('point').capabilities as Set<'draw' | 'path'>;

    expect(() => capabilities.add('path')).toThrow();
    expect(() => capabilities.delete('draw')).toThrow();
    expect(registry.supports('point', 'path')).toBe(false);
    expect(registry.supports('point', 'draw')).toBe(true);
  });

  it('contains the frozen canonical 20-type tuple and renders every definition with pure finite data', () => {
    const registry = createBuiltinShapeRegistry();

    expect(shapeTypes).toHaveLength(20);
    expect(Object.isFrozen(shapeTypes)).toBe(true);
    expect(shapeTypes).toBe(coreShapeTypes);
    expect(registry.types()).toEqual(shapeTypes);

    for (const type of shapeTypes) {
      const definition = registry.get(type);
      const state = definition.normalize(inputs[type]);
      const geometry = definition.toRenderGeometry(state);
      const controlPoints = definition.editTopology?.describe(state).handles.map(({ coordinate }) => coordinate);
      const draft = controlPoints === undefined ? undefined : definition.createDraft(controlPoints);

      expect(definition.type).toBe(type);
      expect(draft, `${type} did not recreate a draft from its semantic handles`).toBeDefined();
      expect(draft?.type).toBe(type);
      expect(definition.isComplete(state), `${type} fixture was not a completed state`).toBe(true);
      expect(coordinatesAreFinite(geometry), `${type} emitted a non-finite geometry`).toBe(true);
    }
  });
});
