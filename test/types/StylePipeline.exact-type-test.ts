import type { PathTrackStrokeSpec, StrokeSpec, StylePatch, StyleSpec } from '../../src/core/style/types.js';

// @ts-expect-error a non-discriminating symbol patch cannot delete its discriminator
const invalidSymbolTypeDeletion: StylePatch = { symbol: { type: undefined } };
// @ts-expect-error a non-discriminating fill patch cannot delete its discriminator
const invalidFillTypeDeletion: StylePatch = { fill: { type: undefined } };
// @ts-expect-error circle radius is required and cannot be deleted
const invalidCircleRadiusDeletion: StylePatch = { symbol: { radius: undefined } };
// @ts-expect-error icon src is required and cannot be deleted
const invalidIconSourceDeletion: StylePatch = { symbol: { src: undefined, scale: 2 } };
// @ts-expect-error text content is required and cannot be deleted
const invalidTextDeletion: StylePatch = { text: { text: undefined } };
// @ts-expect-error the pattern discriminator is required and cannot be deleted
const invalidPatternDeletion: StylePatch = { fill: { pattern: undefined, size: 16 } };
// @ts-expect-error linework patches replace the complete branch and require tracks
const invalidPartialLinework: StylePatch = { linework: { contour: { kind: 'open' } } };
// @ts-expect-error fitPatternOnce is reserved for top-level StrokeSpec and cannot be used by a path track
const invalidTrackFitPattern: StyleSpec = { linework: { tracks: [{ offset: 0, stroke: { lineDash: [4, 2], fitPatternOnce: true } }] } };
const fittedStroke: StrokeSpec = { lineDash: [4, 2], fitPatternOnce: true };
// @ts-expect-error a StrokeSpec that may contain fitPatternOnce is not assignable to a path track stroke
const invalidAssignedTrackStroke: PathTrackStrokeSpec = fittedStroke;

void [
  invalidSymbolTypeDeletion,
  invalidFillTypeDeletion,
  invalidCircleRadiusDeletion,
  invalidIconSourceDeletion,
  invalidTextDeletion,
  invalidPatternDeletion,
  invalidPartialLinework,
  invalidTrackFitPattern,
  invalidAssignedTrackStroke
];
