import { describe, expect, it } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { createControlPointDefinition } from '../src/builtins/shapes/definition.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import type { ShapeDefinition, ShapeState, ShapeType } from '../src/core/shape/types.js';

const definitions = [...basicShapeDefinitions, ...plotShapeDefinitions] as const;

function definition<T extends ShapeType>(type: T): ShapeDefinition<ShapeState<T>> {
  const found = definitions.find((candidate) => candidate.type === type);
  if (found === undefined) throw new Error(`Missing shape definition: ${type}`);
  return found as ShapeDefinition<ShapeState<T>>;
}

describe('shape completion', () => {
  it('creates ordinary and double-arrow drafts without exposing shape-specific construction to callers', () => {
    const polygon = definition('polygon');
    expect(polygon.createDraft([[0, 0]])).toBeUndefined();
    expect(
      polygon.createDraft([
        [0, 0],
        [2, 0]
      ])
    ).toEqual({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [2, 0]
      ]
    });

    const doubleArrow = definition('double-arrow');
    expect(doubleArrow.createDraft([[0, 0]])).toBeUndefined();
    expect(
      doubleArrow.createDraft([
        [0, 0],
        [4, 0],
        [3, 3]
      ])
    ).toEqual({
      type: 'double-arrow',
      controlPoints: [
        [0, 0],
        [4, 0],
        [3, 3]
      ]
    });
  });

  it('creates a canonical circle draft from center and radius control points', () => {
    const circle = definition('circle');

    expect(circle.createDraft([[2, 3]])).toBeUndefined();
    expect(
      circle.createDraft([
        [2, 3, 9],
        [5, 7, 9]
      ])
    ).toEqual({ type: 'circle', center: [2, 3, 9], radius: 5 });
    expect(() =>
      circle.createDraft([
        [2, 3, 9],
        [5, 7, 10]
      ])
    ).toThrow(InvalidArgumentError);
  });

  it('returns ordinary incomplete previews as data instead of throwing', () => {
    const polygon = definition('polygon');
    const preview = polygon.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [2, 0]
      ]
    });

    expect(polygon.tryComplete(preview)).toEqual({ status: 'incomplete' });
  });

  it('keeps genuine custom completion failures distinguishable from incomplete input', () => {
    const failure = new Error('completion failed');
    const shape = createControlPointDefinition({
      type: 'polyline',
      previewMin: 1,
      completeMin: 2,
      render: (points) => ({ type: 'polyline', coordinates: points }),
      complete: () => {
        throw failure;
      }
    });
    const preview = shape.normalize({ type: 'polyline', controlPoints: [[0, 0]] });

    expect(() => shape.tryComplete(preview)).toThrow(failure);
  });

  it('rejects a custom complete outcome whose state remains incomplete', () => {
    const shape = createControlPointDefinition({
      type: 'polyline',
      previewMin: 1,
      completeMin: 2,
      render: (points) => ({ type: 'polyline', coordinates: points }),
      complete: (state) => ({ status: 'complete' as const, state })
    });
    const preview = shape.normalize({ type: 'polyline', controlPoints: [[0, 0]] });

    expect(() => shape.tryComplete(preview)).toThrow(InvalidArgumentError);
  });

  it('resolves double-arrow two, three, four, and five point states without exception-driven branching', () => {
    const doubleArrow = definition('double-arrow');
    const points = [
      [0, 0],
      [4, 0],
      [3, 3],
      [1, 3],
      [2, 0]
    ] as const;

    expect(doubleArrow.tryComplete(doubleArrow.normalize({ type: 'double-arrow', controlPoints: points.slice(0, 2) }))).toEqual({
      status: 'incomplete'
    });

    for (const count of [3, 4, 5] as const) {
      const source = doubleArrow.normalize({ type: 'double-arrow', controlPoints: points.slice(0, count) });
      const outcome = doubleArrow.tryComplete(source);

      expect(outcome.status, `${count} points did not complete`).toBe('complete');
      if (outcome.status === 'complete') {
        expect(outcome.state.controlPoints).toHaveLength(5);
        expect(outcome.state.controlPoints.slice(0, count)).toEqual(source.controlPoints);
        expect(doubleArrow.isComplete(outcome.state)).toBe(true);
      }
    }
  });
});
