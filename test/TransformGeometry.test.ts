import { describe, expect, it } from 'vitest';
import { Circle, LineString, Point } from 'ol/geom';
import { coordinatesEqual, extractGeometryInfo, geometriesEqual } from '../src/components/transform/geometry';

describe('transform geometry helpers', () => {
  it('compares nested coordinates with floating point tolerance', () => {
    expect(coordinatesEqual([[1, 2]], [[1 + 1e-10, 2]])).toBe(true);
    expect(coordinatesEqual([[1, 2]], [[1, 3]])).toBe(false);
  });

  it('compares geometry type and coordinates', () => {
    expect(
      geometriesEqual(
        new LineString([
          [0, 0],
          [1, 1]
        ]),
        new LineString([
          [0, 0],
          [1, 1]
        ])
      )
    ).toBe(true);
    expect(
      geometriesEqual(
        new Point([0, 0]),
        new LineString([
          [0, 0],
          [1, 1]
        ])
      )
    ).toBe(false);
  });

  it('extracts circle center and radius', () => {
    expect(extractGeometryInfo(new Circle([3, 4], 5))).toEqual({ type: 'Circle', coords: { center: [3, 4], radius: 5 } });
  });
});
