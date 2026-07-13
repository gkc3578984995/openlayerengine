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

export type ShapeCapability = 'draw' | 'edit' | 'translate' | 'rotate' | 'scale' | 'vertexEdit' | 'anchor' | 'path';

export interface ControlPointPolicy {
  readonly previewMin: number;
  readonly completeMin: number;
  readonly completeMax?: number;
  readonly autoFinish?: number;
}

export interface ShapeDefinition<S extends ShapeState = ShapeState> {
  readonly type: S['type'];
  readonly capabilities: ReadonlySet<ShapeCapability>;
  readonly controlPointPolicy?: ControlPointPolicy;
  normalize(input: unknown): S;
  clone(state: S): S;
  isComplete(state: S): boolean;
  finalize?(state: S): S;
  toRenderGeometry(state: S): RenderGeometryState;
  getControlPoints?(state: S): readonly Coordinate[];
  updateControlPoint?(state: S, index: number, coordinate: Coordinate): S;
}
