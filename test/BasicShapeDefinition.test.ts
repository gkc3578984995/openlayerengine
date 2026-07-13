import { describe, expect, it } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import type { ShapeDefinition, ShapeState, ShapeType } from '../src/core/shape/types.js';

function definition<T extends ShapeType>(type: T): ShapeDefinition<ShapeState<T>> {
  const found = basicShapeDefinitions.find((candidate) => candidate.type === type);
  if (found === undefined) throw new Error(`Missing basic shape definition: ${type}`);
  return found as ShapeDefinition<ShapeState<T>>;
}

describe('basic shape definitions', () => {
  it('normalize validates and copies coordinates without mutating caller data', () => {
    const input = {
      type: 'polyline',
      controlPoints: [
        [0, 1],
        [2, 3, 4]
      ]
    };
    const before = structuredClone(input);

    const state = definition('polyline').normalize(input);

    expect(input).toEqual(before);
    expect(state).toEqual(input);
    expect(state).not.toBe(input);
    expect(state.controlPoints).not.toBe(input.controlPoints);
    expect(state.controlPoints[0]).not.toBe(input.controlPoints[0]);
  });

  it('clone creates independent coordinates and updateControlPoint leaves the source unchanged', () => {
    const polygon = definition('polygon');
    const state = polygon.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [4, 0],
        [2, 3]
      ]
    });
    const cloned = polygon.clone(state);
    const updated = polygon.updateControlPoint?.(state, 1, [5, 1]);

    expect(cloned).toEqual(state);
    expect(cloned).not.toBe(state);
    expect(cloned.controlPoints[0]).not.toBe(state.controlPoints[0]);
    expect(updated?.controlPoints).toEqual([
      [0, 0],
      [5, 1],
      [2, 3]
    ]);
    expect(state.controlPoints).toEqual([
      [0, 0],
      [4, 0],
      [2, 3]
    ]);
  });

  it('emits canonical point, polyline, closed polygon, circle, and ellipse geometry', () => {
    expect(definition('point').toRenderGeometry(definition('point').normalize({ type: 'point', controlPoints: [[3, 4]] }))).toEqual({
      type: 'point',
      coordinates: [3, 4]
    });
    expect(
      definition('polyline').toRenderGeometry(
        definition('polyline').normalize({
          type: 'polyline',
          controlPoints: [
            [0, 0],
            [2, 1]
          ]
        })
      )
    ).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [2, 1]
      ]
    });
    expect(
      definition('polygon').toRenderGeometry(
        definition('polygon').normalize({
          type: 'polygon',
          controlPoints: [
            [0, 0],
            [2, 0],
            [1, 1]
          ]
        })
      )
    ).toEqual({
      type: 'polygon',
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [1, 1],
          [0, 0]
        ]
      ]
    });
    expect(definition('circle').toRenderGeometry(definition('circle').normalize({ type: 'circle', center: [3, 4], radius: 5 }))).toEqual({
      type: 'circle',
      center: [3, 4],
      radius: 5
    });

    const ellipseGeometry = definition('ellipse').toRenderGeometry(
      definition('ellipse').normalize({
        type: 'ellipse',
        controlPoints: [
          [0, 0],
          [3, 2]
        ]
      })
    );
    expect(ellipseGeometry.type).toBe('polygon');
    if (ellipseGeometry.type !== 'polygon') throw new Error('Expected ellipse polygon');
    expect(ellipseGeometry.coordinates[0]).toHaveLength(101);
    expect(ellipseGeometry.coordinates[0][0]).toEqual(ellipseGeometry.coordinates[0].at(-1));
  });

  it('keeps circle canonical while exposing editable center and radius handles', () => {
    const circle = definition('circle');
    const state = circle.normalize({ type: 'circle', center: [2, 3], radius: 4 });

    expect('controlPoints' in state).toBe(false);
    expect(circle.getControlPoints?.(state)).toEqual([
      [2, 3],
      [6, 3]
    ]);
    expect(circle.updateControlPoint?.(state, 0, [7, 8])).toEqual({ type: 'circle', center: [7, 8], radius: 4 });
    expect(circle.updateControlPoint?.(state, 1, [2, 8])).toEqual({ type: 'circle', center: [2, 3], radius: 5 });
  });

  it.each([
    ['point arity', 'point', { type: 'point', controlPoints: [] }],
    ['polyline arity', 'polyline', { type: 'polyline', controlPoints: [[0, 0]] }],
    ['polygon arity', 'polygon', { type: 'polygon', controlPoints: [[0, 0]] }],
    ['non-finite coordinate', 'point', { type: 'point', controlPoints: [[Number.NaN, 0]] }],
    ['negative circle radius', 'circle', { type: 'circle', center: [0, 0], radius: -1 }]
  ] as const)('rejects invalid %s input', (_label, type, input) => {
    expect(() => definition(type).normalize(input)).toThrow(InvalidArgumentError);
  });

  it('rejects unsafe control-point indexes and invalid replacement coordinates', () => {
    const polygon = definition('polygon');
    const state = polygon.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [4, 0],
        [2, 3]
      ]
    });

    expect(() => polygon.updateControlPoint?.(state, -1, [1, 1])).toThrow(InvalidArgumentError);
    expect(() => polygon.updateControlPoint?.(state, 3, [1, 1])).toThrow(InvalidArgumentError);
    expect(() => polygon.updateControlPoint?.(state, 1, [Infinity, 1])).toThrow(InvalidArgumentError);
  });

  it('distinguishes renderable previews from complete canonical states', () => {
    const polygon = definition('polygon');
    const preview = polygon.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [2, 0]
      ]
    });
    const complete = polygon.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [2, 0],
        [1, 1]
      ]
    });

    expect(polygon.controlPointPolicy).toEqual({ previewMin: 2, completeMin: 3 });
    expect(polygon.isComplete(preview)).toBe(false);
    expect(polygon.isComplete(complete)).toBe(true);
    expect(() => polygon.finalize?.(preview)).toThrow(InvalidArgumentError);
    expect(polygon.finalize?.(complete)).toEqual(complete);
  });

  it.each([
    [
      'ellipse without width',
      'ellipse',
      {
        type: 'ellipse',
        controlPoints: [
          [0, 0],
          [0, 2]
        ]
      }
    ],
    [
      'ellipse without height',
      'ellipse',
      {
        type: 'ellipse',
        controlPoints: [
          [0, 0],
          [2, 0]
        ]
      }
    ],
    [
      'degenerate polygon',
      'polygon',
      {
        type: 'polygon',
        controlPoints: [
          [0, 0],
          [1, 0],
          [2, 0]
        ]
      }
    ]
  ] as const)('rejects %s', (_label, type, input) => {
    expect(() => definition(type).normalize(input)).toThrow(InvalidArgumentError);
  });
});
