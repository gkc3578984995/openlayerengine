/* eslint-disable @typescript-eslint/no-explicit-any */
import type Geometry from 'ol/geom/Geometry.js';
import Point from 'ol/geom/Point.js';

export function projectVector(displacement: number[], base: number[]): number[] {
  const denominator = base[0] * base[0] + base[1] * base[1];
  if (denominator === 0) return [0, 0];
  const scale = (displacement[0] * base[0] + displacement[1] * base[1]) / denominator;
  return [base[0] * scale, base[1] * scale];
}

export function vectorBetween(start: number[], end: number[]): number[] {
  return [end[0] - start[0], end[1] - start[1]];
}

export function movePoint(point: number[], displacement: number[]): number[] {
  return [point[0] + displacement[0], point[1] + displacement[1]];
}

export function applyWrapOffset(geometry: Geometry, wrapOffset: number, extentWidth: number): void {
  const wrapX = (x: number): number => {
    const half = extentWidth / 2;
    return ((((x + half) % extentWidth) + extentWidth) % extentWidth) - half;
  };
  const moveCoordinate = (coordinate: number[]) => [wrapX(coordinate[0] + wrapOffset), coordinate[1]];
  const type = geometry.getType();
  if (type === 'Point') {
    const point = geometry as Point;
    point.setCoordinates(moveCoordinate(point.getCoordinates()));
  } else if (type === 'LineString' || type === 'MultiPoint') {
    (geometry as any).setCoordinates((geometry as any).getCoordinates().map(moveCoordinate));
  } else if (type === 'Polygon' || type === 'MultiLineString') {
    (geometry as any).setCoordinates((geometry as any).getCoordinates().map((line: number[][]) => line.map(moveCoordinate)));
  } else if (type === 'MultiPolygon') {
    (geometry as any).setCoordinates(
      (geometry as any).getCoordinates().map((polygon: number[][][]) => polygon.map((ring: number[][]) => ring.map(moveCoordinate)))
    );
  } else if (type === 'Circle') {
    const circle = geometry as any;
    circle.setCenterAndRadius(moveCoordinate(circle.getCenter()), circle.getRadius());
  }
}
