import { describe, expect, it } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import * as publicBuiltinShapes from '../src/builtins/shapes/index.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import { CapabilityError, InvalidArgumentError } from '../src/core/errors.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { shapeTypes as coreShapeTypes } from '../src/core/shape/types.js';
import type { ShapeDefinition, ShapeState, ShapeType } from '../src/core/shape/types.js';

const { shapeTypes } = publicBuiltinShapes;

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
  it('keeps the public builtins index limited to the stable shape tuple', () => {
    expect(Object.keys(publicBuiltinShapes)).toEqual(['shapeTypes']);
  });

  it('rejects duplicate registration without replacing the first definition', () => {
    const registry = new ShapeRegistry();
    const first: ShapeDefinition<ShapeState<'point'>> = {
      type: 'point',
      capabilities: new Set(['draw']),
      normalize: (input) => input as ShapeState<'point'>,
      clone: (state) => state,
      isComplete: () => true,
      toRenderGeometry: () => ({ type: 'point', coordinates: [0, 0] })
    };

    registry.register(first);

    expect(() => registry.register({ ...first, capabilities: new Set(['edit']) })).toThrow(InvalidArgumentError);
    expect(registry.get('point')).toBe(first);
  });

  it('throws the stable capability error for an unknown runtime type', () => {
    const registry = new ShapeRegistry();

    expect(() => registry.get('not-a-shape' as ShapeType)).toThrow(CapabilityError);
    expect(() => registry.supports('not-a-shape' as ShapeType, 'draw')).toThrow(CapabilityError);
  });

  it('reports the exact deliberate capability matrix instead of treating every shape alike', () => {
    const registry = createBuiltinShapeRegistry();
    const standard = ['draw', 'edit', 'translate', 'rotate', 'scale', 'vertexEdit'] as const;
    const expected = new Map<ShapeType, readonly string[]>([
      ['point', [...standard, 'anchor']],
      ['polyline', [...standard, 'path']],
      ['polygon', standard],
      ['circle', ['draw', 'edit', 'translate', 'scale', 'vertexEdit']],
      ['ellipse', ['draw', 'edit', 'translate', 'scale', 'vertexEdit']],
      ['attack-arrow', standard],
      ['tailed-attack-arrow', standard],
      ['fine-arrow', standard],
      ['tailed-squad-combat-arrow', standard],
      ['assault-direction-arrow', standard],
      ['double-arrow', standard],
      ['rectangle', ['draw', 'edit', 'translate', 'scale', 'vertexEdit']],
      ['triangle', standard],
      ['equilateral-triangle', standard],
      ['assemble-polygon', standard],
      ['closed-curve-polygon', standard],
      ['sector', standard],
      ['lune-polygon', standard],
      ['lune-polyline', [...standard, 'path']],
      ['curve-polyline', [...standard, 'path']]
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

      expect(definition.type).toBe(type);
      expect(definition.isComplete(state), `${type} fixture was not a completed state`).toBe(true);
      expect(coordinatesAreFinite(geometry), `${type} emitted a non-finite geometry`).toBe(true);
    }
  });
});
