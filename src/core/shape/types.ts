import type { Coordinate } from '../common/types.js';

export const shapeTypes = Object.freeze([
  'point',
  'polyline',
  'polygon',
  'circle',
  'ellipse',
  'attack-arrow',
  'tailed-attack-arrow',
  'fine-arrow',
  'tailed-squad-combat-arrow',
  'assault-direction-arrow',
  'double-arrow',
  'rectangle',
  'triangle',
  'equilateral-triangle',
  'assemble-polygon',
  'closed-curve-polygon',
  'sector',
  'lune-polygon',
  'lune-polyline',
  'curve-polyline'
] as const);

export type ShapeType = (typeof shapeTypes)[number];

export type ShapeState<T extends ShapeType = ShapeType> = T extends 'circle'
  ? { readonly type: 'circle'; readonly center: Coordinate; readonly radius: number }
  : { readonly type: T; readonly controlPoints: readonly Coordinate[] };

export type RenderGeometryState =
  | { readonly type: 'point'; readonly coordinates: Coordinate }
  | { readonly type: 'polyline'; readonly coordinates: readonly Coordinate[] }
  | { readonly type: 'polygon'; readonly coordinates: readonly (readonly Coordinate[])[] }
  | { readonly type: 'circle'; readonly center: Coordinate; readonly radius: number };
