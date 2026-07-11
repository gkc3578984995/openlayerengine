import { describe, expect, it } from 'vitest';
import Point from 'ol/geom/Point';
import { applyWrapOffset, movePoint, projectVector, vectorBetween } from '../src/extends/transform-interaction/geometryTransform';

describe('transform interaction geometry helpers', () => {
  it('handles vector operations', () => {
    expect(vectorBetween([1, 2], [4, 6])).toEqual([3, 4]);
    expect(movePoint([1, 2], [3, 4])).toEqual([4, 6]);
    expect(projectVector([2, 2], [1, 0])).toEqual([2, 0]);
    expect(projectVector([2, 2], [0, 0])).toEqual([0, 0]);
  });

  it('wraps point coordinates into the target world', () => {
    const point = new Point([190, 5]);
    applyWrapOffset(point, 0, 360);
    expect(point.getCoordinates()).toEqual([-170, 5]);
  });
});
