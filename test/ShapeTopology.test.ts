import { describe, expect, it } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import type { Coordinate } from '../src/core/common/types.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import { shapeTypes, type ShapeDefinition, type ShapeState, type ShapeType } from '../src/core/shape/types.js';

const definitions = [...basicShapeDefinitions, ...plotShapeDefinitions] as const;

function definition(type: ShapeType): ShapeDefinition {
  const found = definitions.find((candidate) => candidate.type === type);
  if (found === undefined) throw new Error(`Missing shape definition: ${type}`);
  return found as ShapeDefinition;
}

const variableOpen = new Set<ShapeType>(['polyline', 'curve-polyline', 'attack-arrow', 'tailed-attack-arrow']);
const variableClosed = new Set<ShapeType>(['polygon', 'closed-curve-polygon']);
const structural = new Set<ShapeType>([...variableOpen, ...variableClosed]);
const freehand = new Set<ShapeType>(['polyline', 'polygon']);

const fixedAutoFinish = new Map<ShapeType, number>([
  ['point', 1],
  ['circle', 2],
  ['ellipse', 2],
  ['fine-arrow', 2],
  ['tailed-squad-combat-arrow', 2],
  ['assault-direction-arrow', 2],
  ['double-arrow', 4],
  ['rectangle', 2],
  ['triangle', 3],
  ['equilateral-triangle', 2],
  ['assemble-polygon', 3],
  ['sector', 3],
  ['lune-polygon', 3],
  ['lune-polyline', 3]
]);

describe('shape editing topology', () => {
  it('declares the exact semantic topology and freehand matrix for all 20 shapes', () => {
    expect(shapeTypes).toHaveLength(20);

    for (const type of shapeTypes) {
      const shape = definition(type);
      expect(shape.editTopology, `${type} did not declare edit topology`).toBeDefined();
      expect(shape.capabilities.has('vertexEdit')).toBe(true);
      expect(shape.capabilities.has('controlPointInsert'), `${type} insert capability drifted`).toBe(structural.has(type));
      expect(shape.capabilities.has('controlPointRemove'), `${type} remove capability drifted`).toBe(structural.has(type));
      expect(shape.editTopology?.insert !== undefined, `${type} insert operation drifted`).toBe(structural.has(type));
      expect(shape.editTopology?.remove !== undefined, `${type} remove operation drifted`).toBe(structural.has(type));
      expect(shape.capabilities.has('freehand'), `${type} freehand capability drifted`).toBe(freehand.has(type));
      expect(shape.freehand !== undefined, `${type} freehand policy drifted`).toBe(freehand.has(type));
      expect(shape.controlPointPolicy?.autoFinish, `${type} auto-finish policy drifted`).toBe(fixedAutoFinish.get(type));
    }
  });

  it('describes insertion candidates from control topology instead of render geometry classes', () => {
    const polyline = definition('polyline');
    const polylineState = polyline.normalize({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [2, 0],
        [4, 0]
      ]
    });
    const polygon = definition('polygon');
    const polygonState = polygon.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [4, 0],
        [0, 4]
      ]
    });
    const attack = definition('attack-arrow');
    const attackState = attack.normalize({
      type: 'attack-arrow',
      controlPoints: [
        [0, 0],
        [2, 0],
        [3, 2],
        [5, 3]
      ]
    });

    expect(polyline.editTopology?.describe(polylineState).insertions.map(({ index }) => index)).toEqual([1, 2]);
    expect(polygon.editTopology?.describe(polygonState).insertions.map(({ index }) => index)).toEqual([1, 2, 3]);
    expect(attack.editTopology?.describe(attackState).insertions).toEqual([
      { index: 2, coordinate: [2, 1] },
      { index: 3, coordinate: [4, 2.5] }
    ]);

    const lune = definition('lune-polyline');
    const luneState = lune.normalize({
      type: 'lune-polyline',
      controlPoints: [
        [0, 0],
        [4, 0],
        [2, 3]
      ]
    });
    expect(lune.toRenderGeometry(luneState).type).toBe('polyline');
    expect(lune.editTopology?.describe(luneState).insertions).toEqual([]);
  });

  it.each([
    [
      'polyline',
      [
        [0, 0],
        [4, 0]
      ],
      1,
      [2, 1]
    ],
    [
      'curve-polyline',
      [
        [0, 0],
        [4, 0]
      ],
      1,
      [2, 1]
    ],
    [
      'polygon',
      [
        [0, 0],
        [4, 0],
        [0, 4]
      ],
      3,
      [0, 2]
    ],
    [
      'closed-curve-polygon',
      [
        [0, 0],
        [4, 0],
        [0, 4]
      ],
      3,
      [0, 2]
    ],
    [
      'attack-arrow',
      [
        [0, 0],
        [2, 0],
        [4, 3]
      ],
      2,
      [2.5, 1.5]
    ],
    [
      'tailed-attack-arrow',
      [
        [0, 0],
        [2, 0],
        [4, 3]
      ],
      2,
      [2.5, 1.5]
    ]
  ] as const)('%s inserts and removes a control point without mutating its source', (type, input, index, coordinate) => {
    const shape = definition(type);
    const state = shape.normalize({ type, controlPoints: input });
    const before = structuredClone(state);
    const inserted = shape.editTopology?.insert?.(state, index, coordinate);
    if (inserted === undefined) throw new Error(`Missing insert operation: ${type}`);

    expect(state).toEqual(before);
    expect(inserted).not.toBe(state);
    expect(shape.editTopology?.remove?.(inserted, index)).toEqual(state);
  });

  it.each([
    [
      'polyline',
      [
        [0, 0],
        [4, 0]
      ]
    ],
    [
      'curve-polyline',
      [
        [0, 0],
        [4, 0]
      ]
    ],
    [
      'polygon',
      [
        [0, 0],
        [4, 0],
        [0, 4]
      ]
    ],
    [
      'closed-curve-polygon',
      [
        [0, 0],
        [4, 0],
        [0, 4]
      ]
    ],
    [
      'attack-arrow',
      [
        [0, 0],
        [2, 0],
        [4, 3]
      ]
    ],
    [
      'tailed-attack-arrow',
      [
        [0, 0],
        [2, 0],
        [4, 3]
      ]
    ]
  ] as const)('%s rejects removal at its completed minimum atomically', (type, input) => {
    const shape = definition(type);
    const state = shape.normalize({ type, controlPoints: input });
    const before = structuredClone(state);

    expect(shape.editTopology?.describe(state).handles.every(({ removable }) => !removable)).toBe(true);
    expect(() => shape.editTopology?.remove?.(state, input.length - 1)).toThrow(InvalidArgumentError);
    expect(state).toEqual(before);
  });

  it('marks a control point removable only when the resulting shape remains valid and complete', () => {
    const shape = definition('polygon');
    const state = shape.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1]
      ]
    });
    const topology = shape.editTopology;
    if (topology?.remove === undefined) throw new Error('Missing polygon remove operation');

    expect(topology.describe(state).handles.map(({ removable }) => removable)).toEqual([true, true, true, false]);
    expect(() => topology.remove?.(state, 3)).toThrow(InvalidArgumentError);
  });

  it('rejects unsafe structural operations without changing the source', () => {
    const shape = definition('polyline');
    const state = shape.normalize({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [4, 0]
      ]
    });
    const before = structuredClone(state);

    expect(() => shape.editTopology?.insert?.(state, 0, [2, 1])).toThrow(InvalidArgumentError);
    expect(() => shape.editTopology?.insert?.(state, 1, [Infinity, 1])).toThrow(InvalidArgumentError);
    expect(() => shape.editTopology?.move(state, 1, [4, 0, 1])).toThrow(InvalidArgumentError);
    expect(state).toEqual(before);
  });

  it('keeps insertion handles finite when a representable midpoint has an overflowing sum', () => {
    const shape = definition('polyline');
    const state = shape.normalize({
      type: 'polyline',
      controlPoints: [
        [Number.MAX_VALUE, Number.MAX_VALUE],
        [Number.MAX_VALUE / 2, Number.MAX_VALUE / 2]
      ]
    });
    const insertion = shape.editTopology?.describe(state).insertions[0];

    expect(insertion).toBeDefined();
    expect(insertion?.coordinate.every(Number.isFinite)).toBe(true);
  });

  it('omits an insertion candidate when its midpoint collapses onto an existing control point', () => {
    const shape = definition('curve-polyline');
    const state = shape.normalize({
      type: 'curve-polyline',
      controlPoints: [
        [1e16, 0],
        [1e16 + 2, 0]
      ]
    });

    expect(shape.editTopology?.describe(state).insertions).toEqual([]);
  });
});

describe('shape freehand policies', () => {
  it('samples and normalizes polyline drafts without publishing an undersized ShapeState', () => {
    const shape = definition('polyline');
    const policy = shape.freehand;
    if (policy === undefined) throw new Error('Missing polyline freehand policy');

    const first = policy.appendSample([], [0, 0]);
    const duplicate = policy.appendSample(first, [0, 0]);
    const second = policy.appendSample(duplicate, [2, 1]);

    expect(first).toEqual([[0, 0]]);
    expect(duplicate).toEqual(first);
    expect(duplicate).not.toBe(first);
    expect(policy.normalizeSamples(first, 'preview')).toBeUndefined();
    expect(policy.normalizeSamples(second, 'preview')).toEqual({ type: 'polyline', controlPoints: second });
    expect(shape.tryComplete(policy.normalizeSamples(second, 'complete') as ShapeState)).toMatchObject({ status: 'complete' });
  });

  it('keeps polygon preview and completion thresholds explicit during freehand normalization', () => {
    const shape = definition('polygon');
    const policy = shape.freehand;
    if (policy === undefined) throw new Error('Missing polygon freehand policy');

    const two: readonly Coordinate[] = [
      [0, 0],
      [4, 0]
    ];
    const three: readonly Coordinate[] = [...two, [0, 4]];
    const preview = policy.normalizeSamples(two, 'preview');
    const incompleteCompletion = policy.normalizeSamples(two, 'complete');
    const complete = policy.normalizeSamples(three, 'complete');

    expect(preview).toBeDefined();
    expect(preview === undefined ? undefined : shape.tryComplete(preview)).toEqual({ status: 'incomplete' });
    expect(incompleteCompletion).toBeUndefined();
    expect(complete === undefined ? undefined : shape.tryComplete(complete)).toMatchObject({ status: 'complete' });
  });

  it('treats a degenerate freehand polygon as unavailable without preventing a later valid preview', () => {
    const shape = definition('polygon');
    const policy = shape.freehand;
    if (policy === undefined) throw new Error('Missing polygon freehand policy');
    const collinear: readonly Coordinate[] = [
      [0, 0],
      [2, 0],
      [4, 0]
    ];

    expect(policy.normalizeSamples(collinear, 'preview')).toBeUndefined();
    expect(policy.normalizeSamples(collinear, 'complete')).toBeUndefined();
    expect(policy.normalizeSamples([...collinear, [0, 2]], 'preview')).toBeDefined();
  });
});
