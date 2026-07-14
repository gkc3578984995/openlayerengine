import type { Coordinate } from '../common/types.js';

export interface MeasurementSegment {
  readonly start: Coordinate;
  readonly end: Coordinate;
  readonly startGeographic: Coordinate;
  readonly endGeographic: Coordinate;
  readonly anchor: Coordinate;
  readonly meters: number;
}

export interface LineMeasurement {
  readonly meters: number;
  readonly anchor: Coordinate;
  readonly segments: readonly MeasurementSegment[];
}

export interface SurfaceMeasurement {
  readonly squareMeters: number;
  readonly anchor: Coordinate;
  readonly verticesGeographic: readonly Coordinate[];
}

export interface MeasurementPort {
  measureLine(coordinates: readonly Coordinate[], mode: 'path' | 'radial'): LineMeasurement | undefined;
  measureArea(ring: readonly Coordinate[]): SurfaceMeasurement | undefined;
}
