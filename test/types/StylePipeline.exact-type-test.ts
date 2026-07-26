import type { PathTrackStrokeSpec, StrokeSpec, StylePatch, StyleSpec } from '../../src/core/style/types.js';
import type { LineCasingOptions, LineCasingType, LineDecorationOptions, LineTracksOptions, PathCasingSpec } from '../../src/index.js';

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
const pathCasing: PathCasingSpec = { color: '#ffff00', type: 'center', width: 2 };
const casingType: LineCasingType = 'inner';
const inlineDecoration: LineDecorationOptions = { type: 'inline-text', text: '管线', repeatSpacingPx: 80 };
// @ts-expect-error normalized PathCasingSpec requires an explicit type
const invalidPathCasingType: PathCasingSpec = { color: '#ffff00', width: 2 };
// @ts-expect-error normalized PathCasingSpec requires an explicit width
const invalidPathCasingWidth: PathCasingSpec = { color: '#ffff00', type: 'center' };
// @ts-expect-error optional factory casing width cannot be explicitly undefined
const invalidFactoryCasingWidth: LineCasingOptions = { color: '#ffff00', width: undefined };
// @ts-expect-error decoration-only tracks cannot explicitly contain width
const invalidDecorationOnlyTrackWidth: LineTracksOptions = { mode: 'none', width: undefined };

void [
  invalidSymbolTypeDeletion,
  invalidFillTypeDeletion,
  invalidCircleRadiusDeletion,
  invalidIconSourceDeletion,
  invalidTextDeletion,
  invalidPatternDeletion,
  invalidPartialLinework,
  invalidTrackFitPattern,
  invalidAssignedTrackStroke,
  pathCasing,
  casingType,
  inlineDecoration,
  invalidPathCasingType,
  invalidPathCasingWidth,
  invalidFactoryCasingWidth,
  invalidDecorationOnlyTrackWidth
];
