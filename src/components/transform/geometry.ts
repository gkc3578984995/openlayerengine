import { Circle, LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon } from 'ol/geom';

export interface GeometryInfo {
  type: string | undefined;
  coords: unknown;
}

export function extractGeometryInfo(geometry: unknown): GeometryInfo {
  const geom = geometry as {
    getType?: () => string;
    getCoordinates?: () => unknown;
  };
  const type = geom?.getType?.();
  try {
    if (
      geometry instanceof Point ||
      geometry instanceof LineString ||
      geometry instanceof Polygon ||
      geometry instanceof MultiPoint ||
      geometry instanceof MultiLineString ||
      geometry instanceof MultiPolygon
    ) {
      return { type, coords: geometry.getCoordinates() };
    }
    if (geometry instanceof Circle) {
      return { type, coords: { center: geometry.getCenter(), radius: geometry.getRadius() } };
    }
    return { type, coords: geom?.getCoordinates?.() };
  } catch {
    return { type, coords: undefined };
  }
}

export function coordinatesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;
  if (!aIsArray || !bIsArray) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
    return a === b;
  }
  if (a.length !== b.length) return false;
  return a.every((value, index) => coordinatesEqual(value, b[index]));
}

export function geometriesEqual(a: unknown, b: unknown): boolean {
  const aInfo = extractGeometryInfo(a);
  const bInfo = extractGeometryInfo(b);
  return aInfo.type === bInfo.type && coordinatesEqual(aInfo.coords, bInfo.coords);
}
