import type { ShapeDefinition } from '../../../core/shape/types.js';
import { arrowShapeDefinitions } from './arrows.js';
import { polygonShapeDefinitions } from './polygons.js';
import { polylineShapeDefinitions } from './polylines.js';

export const plotShapeDefinitions = Object.freeze([
  ...arrowShapeDefinitions,
  ...polygonShapeDefinitions,
  ...polylineShapeDefinitions
] as const satisfies readonly ShapeDefinition[]);
