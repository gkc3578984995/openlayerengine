import LineString from 'ol/geom/LineString.js';
import MultiLineString from 'ol/geom/MultiLineString.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import Text from 'ol/style/Text.js';
import type { Color } from '../../../core/common/types.js';
import type { LayerRenderPathReveal } from '../../../core/ports/LayerRenderPort.js';
import type { InlinePathTextSpec, LineworkSpec, PathGlyphPrimitiveSpec, PathGlyphSpec, PathGlyphStrokeSpec, StrokeSpec } from '../../../core/style/types.js';
import {
  extractPathContours,
  measurePath,
  projectLocalPoint,
  repeatPathAnchors,
  samplePath,
  sliceMeasuredPath,
  uprightTextRotation,
  visiblePathIntervals,
  type MeasuredPath,
  type PathCoordinate,
  type PathSample,
  type PathViewport,
  type RepeatPathAnchorExclusion
} from './pathLayout.js';

/** Adapter 注入的文字宽度度量函数。 */
export type LineworkTextMeasurer = (font: string, text: string) => number;

/** 编译 linework 所需的当前渲染上下文。 */
export interface LineworkCompilationContext {
  readonly geometry: object | undefined;
  readonly resolution: number;
  readonly viewRotation: number;
  readonly zIndex: number | undefined;
  readonly measureText: LineworkTextMeasurer;
  readonly viewport?: PathViewport;
}

/** 动画展示替身持有的稳定 linework Style/Geometry 池。 */
export interface CompiledLineworkStylePool {
  /** 更新当前展示 Geometry，并返回本帧生效的稳定 Style。 */
  resolve(
    geometry: object | undefined,
    resolution: number,
    viewRotation: number,
    viewport?: PathViewport,
    pathReveal?: LayerRenderPathReveal
  ): readonly Style[];
  /** 释放池内坐标与引用；重复调用不产生副作用。 */
  destroy(): void;
}

interface GlyphPlacement {
  readonly glyph: PathGlyphSpec;
  readonly sample: PathSample;
}

interface GlyphExtent {
  readonly minimumU: number;
  readonly maximumU: number;
}

interface SegmentBatch {
  readonly key: string;
  readonly order: number;
  readonly stroke: PathGlyphStrokeSpec;
  readonly coordinates: PathCoordinate[][];
}

interface CircleBatch {
  readonly key: string;
  readonly order: number;
  readonly radius: number;
  readonly fill: NonNullable<Extract<PathGlyphPrimitiveSpec, { type: 'circle' }>['fill']> | undefined;
  readonly stroke: PathGlyphStrokeSpec | undefined;
  readonly coordinates: PathCoordinate[];
}

interface PolygonBatch {
  readonly key: string;
  readonly order: number;
  readonly fill: NonNullable<Extract<PathGlyphPrimitiveSpec, { type: 'polygon' }>['fill']> | undefined;
  readonly stroke: PathGlyphStrokeSpec | undefined;
  readonly coordinates: PathCoordinate[][][];
}

interface OrderedStyle {
  readonly order: number;
  readonly style: Style;
}

interface StableLineTrackSlot {
  readonly style: Style;
  readonly geometry: LineString;
  readonly trackIndex: number;
  readonly contourIndex: number | undefined;
  readonly side: 'open' | 'reveal' | 'before' | 'after';
}

interface StableClosedTrackSlot {
  readonly style: Style;
  readonly geometry: Polygon;
  readonly trackIndex: number;
  readonly contourIndex: number | undefined;
  readonly side: 'closed';
}

type StableTrackSlot = StableLineTrackSlot | StableClosedTrackSlot;

interface StableGlyphSlot {
  readonly key: string;
  readonly order: number;
  readonly style: Style;
  readonly geometry: MultiLineString | MultiPoint | MultiPolygon;
}

interface StableTextSlot {
  readonly style: Style;
  readonly geometry: Point;
  readonly text: Text;
}

interface RevealedPathWindow {
  readonly maximum: MeasuredPath;
  readonly current: MeasuredPath | undefined;
  readonly startDistance: number;
  readonly endDistance: number;
  readonly full: boolean;
}

interface PathDistanceCandidate {
  readonly distance: number;
  readonly distanceSquared: number;
}

interface PathPlacement {
  readonly startDistance: number;
  readonly endDistance: number;
  readonly endpointError: number;
  readonly spanError: number;
  readonly score: number;
}

/** 把一套 linework 编译为标准 OL Style 与批量派生 Geometry。 */
export function compileLineworkStyles(spec: LineworkSpec, context: LineworkCompilationContext): Style[] {
  const expectedClosed = spec.contour?.kind === 'closed';
  const measured = measuredPaths(spec, context.geometry);
  if (measured.length === 0) return [];

  const styles: Style[] = [];
  const cutouts = measured.map((path) => lineworkCutout(spec, path, context));
  styles.push(...compileTracks(spec, measured, cutouts, context));

  const glyphPlacements: GlyphPlacement[] = [];
  if (!expectedClosed) collectCaps(spec, measured, glyphPlacements);
  collectDecorations(spec, measured, context.resolution, context.viewport, glyphPlacements);
  styles.push(...compileGlyphPlacements(glyphPlacements, context));

  if (spec.inlineText !== undefined) styles.push(...compileInlineText(spec.inlineText, measured, context));
  styles.push(compileHitCorridor(spec, measured, context));
  return styles;
}

/**
 * 依据规范完整 Geometry 预分配稳定 Style/Geometry。
 * 后续 resolve 只调用公开 setCoordinates/setRotation/setLineDashOffset 更新池内对象。
 */
export function createLineworkPresentationPool(
  spec: LineworkSpec,
  maximumGeometry: object | undefined,
  initialGeometry: object | undefined,
  context: Omit<LineworkCompilationContext, 'geometry'>
): CompiledLineworkStylePool {
  const initialPaths = measuredPaths(spec, initialGeometry);
  const extractedMaximumPaths = measuredPaths(spec, maximumGeometry);
  const maximumPaths = extractedMaximumPaths.length > 0 ? extractedMaximumPaths : initialPaths;
  const maximumPathCount = Math.max(maximumPaths.length, initialPaths.length);
  const trackSlots = createStableTrackSlots(spec, maximumPathCount, context.zIndex);
  const glyphSlots = createStableGlyphSlots(spec, context);
  const textSlots = createStableTextSlots(spec.inlineText, maximumPathCount, context.zIndex);
  const activeStyles: Style[] = [];
  let destroyed = false;

  const resolve = (
    geometry: object | undefined,
    resolution: number,
    viewRotation: number,
    viewport: PathViewport | undefined = context.viewport,
    pathReveal?: LayerRenderPathReveal
  ): readonly Style[] => {
    if (destroyed) return [];
    const safeResolution = Number.isFinite(resolution) && resolution > 0 ? resolution : 1;
    const currentPaths = measuredPaths(spec, geometry);
    const windows = revealWindows(maximumPaths, currentPaths, viewport?.worldWidth, pathReveal);
    const cutouts = windows.map((window) => lineworkCutout(spec, window.maximum, { measureText: context.measureText, resolution: safeResolution }));
    activeStyles.length = 0;
    updateStableTrackSlots(spec, trackSlots, windows, cutouts, safeResolution, activeStyles);

    const placements: GlyphPlacement[] = [];
    collectPresentationPlacements(spec, windows, safeResolution, viewport, placements);
    updateStableGlyphSlots(glyphSlots, placements, safeResolution, activeStyles);
    updateStableTextSlots(spec.inlineText, textSlots, windows, viewRotation, activeStyles);

    return activeStyles;
  };
  resolve(initialGeometry, context.resolution, context.viewRotation, context.viewport);

  return {
    resolve,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      activeStyles.length = 0;
      for (const slot of trackSlots) slot.geometry.setCoordinates([]);
      for (const slot of glyphSlots) slot.geometry.setCoordinates([]);
      for (const slot of textSlots) slot.geometry.setCoordinates([0, 0]);
      trackSlots.length = 0;
      glyphSlots.length = 0;
      textSlots.length = 0;
    }
  };
}

/** 是否需要依赖 geometry、resolution 和 View rotation 重新布局。 */
export function lineworkDependencies(spec: LineworkSpec): {
  readonly geometry: true;
  readonly resolution: true;
  readonly viewRotation: boolean;
  readonly viewport: boolean;
} {
  return {
    geometry: true,
    resolution: true,
    viewRotation: spec.inlineText !== undefined,
    viewport: spec.decorations?.some((decoration) => decoration.placement.kind === 'repeat') ?? false
  };
}

function measuredPaths(spec: LineworkSpec, geometry: object | undefined): MeasuredPath[] {
  const expectedClosed = spec.contour?.kind === 'closed';
  return extractPathContours(geometry)
    .filter((contour) => contour.closed === expectedClosed)
    .map(measurePath)
    .filter((path) => path.length > 0);
}

function revealWindows(
  maximumPaths: readonly MeasuredPath[],
  currentPaths: readonly MeasuredPath[],
  worldWidth: number | undefined,
  pathReveal: LayerRenderPathReveal | undefined
): RevealedPathWindow[] {
  return maximumPaths.map((maximum, index) => revealWindow(maximum, currentPaths[index], worldWidth, pathReveal));
}

function revealWindow(
  maximum: MeasuredPath,
  current: MeasuredPath | undefined,
  worldWidth: number | undefined,
  pathReveal: LayerRenderPathReveal | undefined
): RevealedPathWindow {
  if (current === undefined || current.length <= 0) return { maximum, current: undefined, startDistance: 0, endDistance: 0, full: false };
  if (pathReveal !== undefined) {
    const alignedMaximum = alignMaximumRevealWorld(maximum, current, worldWidth, pathReveal.direction);
    const progress = clamp(pathReveal.progress, 0, 1);
    const startDistance = pathReveal.direction === 'forward' ? 0 : alignedMaximum.length * (1 - progress);
    const endDistance = pathReveal.direction === 'forward' ? alignedMaximum.length * progress : alignedMaximum.length;
    const revealedCurrent = alignedMaximum.contour.closed ? revealSlice(alignedMaximum, startDistance, endDistance) : current;
    return {
      maximum: alignedMaximum,
      current: revealedCurrent,
      startDistance,
      endDistance,
      full: progress >= 1 - Number.EPSILON
    };
  }
  if (maximum.contour.closed && current.contour.closed) {
    return { maximum: current, current, startDistance: 0, endDistance: current.length, full: true };
  }
  const alignedMaximum = alignMaximumWorld(maximum, current, worldWidth);
  const tolerance = Math.max(1e-7, alignedMaximum.length * 1e-6);
  const placement = findPathPlacement(alignedMaximum, current);
  if (placement === undefined || placement.endpointError > tolerance * 2 || placement.spanError > tolerance) {
    return { maximum: current, current, startDistance: 0, endDistance: current.length, full: true };
  }
  const full =
    placement.startDistance <= tolerance &&
    alignedMaximum.length - placement.endDistance <= tolerance &&
    Math.abs(current.length - alignedMaximum.length) <= tolerance;
  return {
    maximum: alignedMaximum,
    current,
    startDistance: placement.startDistance,
    endDistance: placement.endDistance,
    full
  };
}

function revealSlice(maximum: MeasuredPath, startDistance: number, endDistance: number): MeasuredPath | undefined {
  const coordinates = sliceMeasuredPath(maximum, startDistance, endDistance);
  if (coordinates.length < 2) return undefined;
  return measurePath({ closed: false, role: maximum.contour.role, coordinates });
}

function alignMaximumRevealWorld(
  maximum: MeasuredPath,
  current: MeasuredPath,
  worldWidth: number | undefined,
  direction: LayerRenderPathReveal['direction']
): MeasuredPath {
  if (!Number.isFinite(worldWidth) || (worldWidth ?? 0) <= 0) return maximum;
  const width = worldWidth as number;
  let deltaX: number | undefined;
  if (maximum.contour.closed && current.contour.closed) {
    const maximumCenter = contourCenterX(maximum);
    const currentCenter = contourCenterX(current);
    if (maximumCenter !== undefined && currentCenter !== undefined) deltaX = currentCenter - maximumCenter;
  } else if (direction === 'forward') {
    const maximumStart = maximum.segments[0]?.start;
    const currentStart = current.segments[0]?.start;
    if (maximumStart !== undefined && currentStart !== undefined) deltaX = currentStart[0] - maximumStart[0];
  } else {
    const maximumEnd = maximum.segments.at(-1)?.end;
    const currentEnd = current.segments.at(-1)?.end;
    if (maximumEnd !== undefined && currentEnd !== undefined) deltaX = currentEnd[0] - maximumEnd[0];
  }
  if (deltaX === undefined) return maximum;
  return shiftMeasuredPath(maximum, Math.round(deltaX / width) * width);
}

function contourCenterX(path: MeasuredPath): number | undefined {
  if (path.contour.coordinates.length === 0) return undefined;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const coordinate of path.contour.coordinates) {
    minimum = Math.min(minimum, coordinate[0]);
    maximum = Math.max(maximum, coordinate[0]);
  }
  return Number.isFinite(minimum) && Number.isFinite(maximum) ? minimum / 2 + maximum / 2 : undefined;
}

function alignMaximumWorld(maximum: MeasuredPath, current: MeasuredPath, worldWidth: number | undefined): MeasuredPath {
  if (!Number.isFinite(worldWidth) || (worldWidth ?? 0) <= 0) return maximum;
  const maximumStart = maximum.segments[0]?.start;
  const maximumEnd = maximum.segments.at(-1)?.end;
  const currentStart = current.segments[0]?.start;
  const currentEnd = current.segments.at(-1)?.end;
  if (maximumStart === undefined || maximumEnd === undefined || currentStart === undefined || currentEnd === undefined) return maximum;

  const width = worldWidth as number;
  const shifts = new Set<number>([0]);
  collectWorldShiftCandidates(shifts, currentStart[0] - maximumStart[0], width);
  collectWorldShiftCandidates(shifts, currentEnd[0] - maximumEnd[0], width);

  let shiftX = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of shifts) {
    const placement = findPathPlacement(maximum, current, -candidate);
    const score = placement?.score ?? directWorldAlignmentScore(maximumStart, maximumEnd, currentStart, currentEnd, candidate, current.length);
    if (score < bestScore || (Math.abs(score - bestScore) <= 1e-9 && Math.abs(candidate) < Math.abs(shiftX))) {
      bestScore = score;
      shiftX = candidate;
    }
  }
  return shiftMeasuredPath(maximum, shiftX);
}

function shiftMeasuredPath(path: MeasuredPath, shiftX: number): MeasuredPath {
  if (shiftX === 0) return path;
  return measurePath({
    closed: path.contour.closed,
    role: path.contour.role,
    coordinates: path.contour.coordinates.map((coordinate) => [coordinate[0] + shiftX, coordinate[1]])
  });
}

function collectWorldShiftCandidates(output: Set<number>, deltaX: number, worldWidth: number): void {
  const world = deltaX / worldWidth;
  output.add(Math.floor(world) * worldWidth);
  output.add(Math.round(world) * worldWidth);
  output.add(Math.ceil(world) * worldWidth);
}

function findPathPlacement(path: MeasuredPath, current: MeasuredPath, currentShiftX = 0): PathPlacement | undefined {
  const startCoordinate = current.segments[0]?.start;
  const endCoordinate = current.segments.at(-1)?.end;
  if (startCoordinate === undefined || endCoordinate === undefined) return undefined;
  const tolerance = Math.max(1e-7, path.length * 1e-9);
  const starts = pathDistanceCandidates(path, [startCoordinate[0] + currentShiftX, startCoordinate[1]], tolerance);
  const ends = pathDistanceCandidates(path, [endCoordinate[0] + currentShiftX, endCoordinate[1]], tolerance);
  if (starts.length === 0 || ends.length === 0) return undefined;

  let best: PathPlacement | undefined;
  for (const start of starts) {
    const expectedEnd = start.distance + current.length;
    const insertion = lowerBoundDistance(ends, expectedEnd);
    for (const index of [insertion - 1, insertion, insertion + 1]) {
      const end = ends[index];
      if (end === undefined || end.distance + tolerance < start.distance) continue;
      const endpointError = Math.sqrt(start.distanceSquared) + Math.sqrt(end.distanceSquared);
      const spanError = Math.abs(current.length - (end.distance - start.distance));
      const score = endpointError + spanError;
      if (best === undefined || score < best.score - 1e-12 || (Math.abs(score - best.score) <= 1e-12 && start.distance < best.startDistance)) {
        best = {
          startDistance: start.distance,
          endDistance: end.distance,
          endpointError,
          spanError,
          score
        };
      }
    }
  }
  return best;
}

function pathDistanceCandidates(path: MeasuredPath, coordinate: PathCoordinate, tolerance: number): PathDistanceCandidate[] {
  const candidates: PathDistanceCandidate[] = [];
  for (const segment of path.segments) {
    const deltaX = segment.end[0] - segment.start[0];
    const deltaY = segment.end[1] - segment.start[1];
    const ratio = clamp(((coordinate[0] - segment.start[0]) * deltaX + (coordinate[1] - segment.start[1]) * deltaY) / (segment.length * segment.length), 0, 1);
    const projectedX = segment.start[0] + deltaX * ratio;
    const projectedY = segment.start[1] + deltaY * ratio;
    const distanceSquared = (coordinate[0] - projectedX) ** 2 + (coordinate[1] - projectedY) ** 2;
    if (!Number.isFinite(distanceSquared)) continue;
    candidates.push({ distance: segment.startDistance + segment.length * ratio, distanceSquared });
  }
  if (candidates.length === 0) return [];
  const minimumError = Math.min(...candidates.map((candidate) => Math.sqrt(candidate.distanceSquared)));
  const eligible = candidates
    .filter((candidate) => Math.sqrt(candidate.distanceSquared) <= minimumError + tolerance)
    .sort((left, right) => left.distance - right.distance);
  const result: PathDistanceCandidate[] = [];
  for (const candidate of eligible) {
    const previous = result.at(-1);
    if (previous === undefined || Math.abs(previous.distance - candidate.distance) > tolerance) {
      result.push(candidate);
    } else if (candidate.distanceSquared < previous.distanceSquared) {
      result[result.length - 1] = candidate;
    }
  }
  return result;
}

function lowerBoundDistance(candidates: readonly PathDistanceCandidate[], distance: number): number {
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((candidates[middle]?.distance ?? Number.POSITIVE_INFINITY) < distance) low = middle + 1;
    else high = middle;
  }
  return low;
}

function directWorldAlignmentScore(
  maximumStart: PathCoordinate,
  maximumEnd: PathCoordinate,
  currentStart: PathCoordinate,
  currentEnd: PathCoordinate,
  shiftX: number,
  currentLength: number
): number {
  const startError = Math.hypot(currentStart[0] - (maximumStart[0] + shiftX), currentStart[1] - maximumStart[1]);
  const endError = Math.hypot(currentEnd[0] - (maximumEnd[0] + shiftX), currentEnd[1] - maximumEnd[1]);
  return startError + endError + currentLength;
}

function mapMaximumCutoutToCurrent(cutout: readonly [number, number], window: RevealedPathWindow): readonly [number, number] | undefined {
  const current = window.current;
  if (current === undefined || cutout[1] <= window.startDistance || cutout[0] >= window.endDistance) return undefined;
  const maximumSpan = window.endDistance - window.startDistance;
  if (maximumSpan <= 0) return [0, current.length];
  const scale = current.length / maximumSpan;
  return [clamp((cutout[0] - window.startDistance) * scale, 0, current.length), clamp((cutout[1] - window.startDistance) * scale, 0, current.length)];
}

function collectPresentationPlacements(
  spec: LineworkSpec,
  windows: readonly RevealedPathWindow[],
  resolution: number,
  viewport: PathViewport | undefined,
  output: GlyphPlacement[]
): void {
  for (const window of windows) {
    if (window.current === undefined) continue;
    const path = window.maximum;
    if (spec.contour?.kind !== 'closed') {
      const start = samplePath(window.current, 0);
      const end = samplePath(path, path.length);
      if (spec.caps?.start !== undefined && start !== undefined) output.push({ glyph: spec.caps.start.glyph, sample: reverseSample(start) });
      if (window.full && spec.caps?.end !== undefined && end !== undefined) output.push({ glyph: spec.caps.end.glyph, sample: end });
    }
    for (const decoration of spec.decorations ?? []) {
      if (decoration.placement.kind === 'center') {
        if (decoration.glyph === undefined || !glyphHasVisiblePaint(decoration.glyph) || !windowReveals(window, path.length / 2)) continue;
        const sample = samplePath(path, path.length / 2);
        if (sample !== undefined) output.push({ glyph: decoration.glyph, sample });
        continue;
      }
      const sequence = decoration.sequence;
      if (sequence === undefined || sequence.length === 0) continue;
      const spacing = decoration.placement.spacing * resolution;
      const phase = (decoration.placement.phase ?? 0) * resolution;
      const renderBuffer = (viewport?.renderBufferPx ?? 0) * resolution;
      const intervals = visiblePathIntervals(path, viewport, spacing + renderBuffer);
      const anchors = repeatPathAnchors(
        path.length,
        spacing,
        path.contour.closed,
        intervals,
        phase,
        repeatAnchorExclusion(spec, window.startDistance, path.length)
      );
      for (const anchor of anchors) {
        if (!windowReveals(window, anchor.distance)) continue;
        const sample = samplePath(path, anchor.distance);
        const glyph = sequence[anchor.index % sequence.length];
        if (sample !== undefined && glyph !== undefined && glyphHasVisiblePaint(glyph)) output.push({ glyph, sample });
      }
    }
  }
}

function windowReveals(window: RevealedPathWindow, distance: number): boolean {
  const epsilon = Math.max(1e-7, window.maximum.length * 1e-9);
  return distance >= window.startDistance - epsilon && distance <= window.endDistance + epsilon;
}

function createStableTrackSlots(spec: LineworkSpec, maximumPathCount: number, zIndex: number | undefined): StableTrackSlot[] {
  const slots: StableTrackSlot[] = [];
  const cutout = hasTrackCutout(spec);
  const closed = spec.contour?.kind === 'closed';
  for (let trackIndex = 0; trackIndex < spec.tracks.length; trackIndex += 1) {
    const track = spec.tracks[trackIndex];
    if (!cutout) {
      for (let contourIndex = 0; contourIndex < maximumPathCount; contourIndex += 1) {
        const geometry = new LineString([]);
        slots.push({
          style: new Style({ geometry, stroke: compileTrackStroke(track.stroke, track.offset), ...(zIndex === undefined ? {} : { zIndex }) }),
          geometry,
          trackIndex,
          contourIndex,
          side: closed ? 'reveal' : 'open'
        });
        if (!closed) continue;

        const closedGeometry = new Polygon([]);
        slots.push({
          style: new Style({
            geometry: closedGeometry,
            stroke: compileTrackStroke(track.stroke, closedTrackOffset(track.offset)),
            ...(zIndex === undefined ? {} : { zIndex })
          }),
          geometry: closedGeometry,
          trackIndex,
          contourIndex,
          side: 'closed'
        });
      }
      continue;
    }
    for (let contourIndex = 0; contourIndex < maximumPathCount; contourIndex += 1) {
      for (const side of ['before', 'after'] as const) {
        const geometry = new LineString([]);
        slots.push({
          style: new Style({ geometry, stroke: compileTrackStroke(track.stroke, track.offset), ...(zIndex === undefined ? {} : { zIndex }) }),
          geometry,
          trackIndex,
          contourIndex,
          side
        });
      }
      if (!closed) continue;

      const closedGeometry = new Polygon([]);
      slots.push({
        style: new Style({
          geometry: closedGeometry,
          stroke: compileTrackStroke(track.stroke, closedTrackOffset(track.offset)),
          ...(zIndex === undefined ? {} : { zIndex })
        }),
        geometry: closedGeometry,
        trackIndex,
        contourIndex,
        side: 'closed'
      });
    }
  }
  return slots;
}

function updateStableTrackSlots(
  spec: LineworkSpec,
  slots: readonly StableTrackSlot[],
  windows: readonly RevealedPathWindow[],
  cutouts: readonly (readonly [number, number] | undefined)[],
  resolution: number,
  active: Style[]
): void {
  for (const slot of slots) {
    const track = spec.tracks[slot.trackIndex];
    if (track === undefined) continue;
    const stroke = slot.style.getStroke();
    const window = windows[slot.contourIndex ?? -1];
    const current = window?.current;
    if (window === undefined || current === undefined) {
      slot.geometry.setCoordinates([]);
      continue;
    }
    if (slot.side === 'closed') {
      const cutout = cutouts[slot.contourIndex ?? -1];
      if (!window.full || cutout !== undefined) {
        slot.geometry.setCoordinates([]);
        continue;
      }
      const coordinates = renderPathCoordinates(window.maximum);
      slot.geometry.setCoordinates([coordinates as [number, number][]]);
      stroke?.setLineDashOffset(track.stroke.lineDashOffset ?? 0);
      if (coordinates.length >= 4) active.push(slot.style);
      continue;
    }
    if (slot.side === 'open' || slot.side === 'reveal') {
      if (slot.side === 'reveal' && window.full) {
        slot.geometry.setCoordinates([]);
        continue;
      }
      const coordinates = renderPathCoordinates(current);
      slot.geometry.setCoordinates(coordinates as [number, number][]);
      stroke?.setLineDashOffset((track.stroke.lineDashOffset ?? 0) - window.startDistance / resolution);
      if (coordinates.length >= 2) active.push(slot.style);
      continue;
    }

    const cutout = cutouts[slot.contourIndex ?? -1];
    if (cutout === undefined && window.full && spec.contour?.kind === 'closed') {
      slot.geometry.setCoordinates([]);
      continue;
    }
    let coordinates: PathCoordinate[];
    let globalStartDistance = window.startDistance;
    const mappedCutout = cutout === undefined ? undefined : mapMaximumCutoutToCurrent(cutout, window);
    if (mappedCutout === undefined) {
      coordinates = slot.side === 'before' ? renderPathCoordinates(current) : [];
    } else if (slot.side === 'before') {
      coordinates = sliceMeasuredPath(current, 0, mappedCutout[0]);
    } else {
      coordinates = sliceMeasuredPath(current, mappedCutout[1], current.length);
      globalStartDistance = Math.max(window.startDistance, cutout?.[1] ?? window.startDistance);
    }
    slot.geometry.setCoordinates(coordinates as [number, number][]);
    stroke?.setLineDashOffset((track.stroke.lineDashOffset ?? 0) - globalStartDistance / resolution);
    if (coordinates.length >= 2) active.push(slot.style);
  }
}

function createStableGlyphSlots(spec: LineworkSpec, context: Omit<LineworkCompilationContext, 'geometry'>): StableGlyphSlot[] {
  const sample: PathSample = { coordinate: [0, 0], tangent: [1, 0], normal: [0, -1], angle: 0, distance: 0 };
  const placements = declaredGlyphs(spec).map((glyph) => ({ glyph, sample }));
  const { segments, circles, polygons } = buildGlyphBatches(placements, context.resolution);
  const slots: StableGlyphSlot[] = [];
  for (const batch of segments.values()) {
    const geometry = new MultiLineString([]);
    slots.push({
      key: batch.key,
      order: batch.order,
      geometry,
      style: new Style({ geometry, stroke: compileGlyphStroke(batch.stroke), ...(context.zIndex === undefined ? {} : { zIndex: context.zIndex }) })
    });
  }
  for (const batch of circles.values()) {
    const geometry = new MultiPoint([]);
    slots.push({
      key: batch.key,
      order: batch.order,
      geometry,
      style: new Style({
        geometry,
        image: new CircleStyle({
          radius: batch.radius,
          ...(batch.fill === undefined ? {} : { fill: new Fill({ color: copyColor(batch.fill.color) }) }),
          ...(batch.stroke === undefined ? {} : { stroke: compileGlyphStroke(batch.stroke) })
        }),
        ...(context.zIndex === undefined ? {} : { zIndex: context.zIndex })
      })
    });
  }
  for (const batch of polygons.values()) {
    const geometry = new MultiPolygon([]);
    slots.push({
      key: batch.key,
      order: batch.order,
      geometry,
      style: new Style({
        geometry,
        ...(batch.fill === undefined ? {} : { fill: new Fill({ color: copyColor(batch.fill.color) }) }),
        ...(batch.stroke === undefined ? {} : { stroke: compileGlyphStroke(batch.stroke) }),
        ...(context.zIndex === undefined ? {} : { zIndex: context.zIndex })
      })
    });
  }
  slots.sort((left, right) => left.order - right.order);
  return slots;
}

function updateStableGlyphSlots(slots: readonly StableGlyphSlot[], placements: readonly GlyphPlacement[], resolution: number, active: Style[]): void {
  const batches = buildGlyphBatches(placements, resolution);
  for (const slot of slots) {
    if (slot.geometry instanceof MultiLineString) {
      const batch = batches.segments.get(slot.key);
      slot.geometry.setCoordinates((batch?.coordinates ?? []) as [number, number][][]);
      if ((batch?.coordinates.length ?? 0) > 0) active.push(slot.style);
    } else if (slot.geometry instanceof MultiPoint) {
      const batch = batches.circles.get(slot.key);
      slot.geometry.setCoordinates((batch?.coordinates ?? []) as [number, number][]);
      if ((batch?.coordinates.length ?? 0) > 0) active.push(slot.style);
    } else {
      const batch = batches.polygons.get(slot.key);
      slot.geometry.setCoordinates((batch?.coordinates ?? []) as [number, number][][][]);
      if ((batch?.coordinates.length ?? 0) > 0) active.push(slot.style);
    }
  }
}

function createStableTextSlots(spec: InlinePathTextSpec | undefined, maximumPathCount: number, zIndex: number | undefined): StableTextSlot[] {
  if (spec === undefined || !inlineTextHasVisiblePaint(spec)) return [];
  const slots: StableTextSlot[] = [];
  const backgroundPadding = spec.backgroundFill === undefined ? 0 : (spec.backgroundPadding ?? 0);
  for (let index = 0; index < maximumPathCount; index += 1) {
    const geometry = new Point([0, 0]);
    const text = new Text({
      text: spec.text,
      font: inlineTextFont(spec),
      fill: new Fill({ color: copyColor(spec.fill.color) }),
      ...(spec.stroke === undefined ? {} : { stroke: compileGlyphStroke(spec.stroke) }),
      ...(spec.backgroundFill === undefined ? {} : { backgroundFill: new Fill({ color: copyColor(spec.backgroundFill.color) }) }),
      ...(backgroundPadding === 0 ? {} : { padding: [backgroundPadding, backgroundPadding, backgroundPadding, backgroundPadding] }),
      textAlign: 'center',
      textBaseline: 'middle',
      overflow: true,
      placement: 'point',
      rotateWithView: false,
      rotation: 0
    });
    slots.push({ style: new Style({ geometry, text, ...(zIndex === undefined ? {} : { zIndex }) }), geometry, text });
  }
  return slots;
}

function updateStableTextSlots(
  spec: InlinePathTextSpec | undefined,
  slots: readonly StableTextSlot[],
  windows: readonly RevealedPathWindow[],
  viewRotation: number,
  active: Style[]
): void {
  if (spec === undefined) return;
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const window = windows[index];
    const path = window?.maximum;
    const middle = path?.length === undefined ? undefined : path.length / 2;
    const sample = window === undefined || path === undefined || middle === undefined || !windowReveals(window, middle) ? undefined : samplePath(path, middle);
    if (sample === undefined) continue;
    slot.geometry.setCoordinates(sample.coordinate as [number, number]);
    slot.text.setRotation(uprightTextRotation(sample, viewRotation));
    active.push(slot.style);
  }
}

function declaredGlyphs(spec: LineworkSpec): PathGlyphSpec[] {
  const glyphs: PathGlyphSpec[] = [];
  if (spec.caps?.start !== undefined) glyphs.push(spec.caps.start.glyph);
  if (spec.caps?.end !== undefined) glyphs.push(spec.caps.end.glyph);
  for (const decoration of spec.decorations ?? []) {
    if (decoration.placement.kind === 'center') {
      if (decoration.glyph !== undefined && glyphHasVisiblePaint(decoration.glyph)) glyphs.push(decoration.glyph);
    } else if (decoration.sequence !== undefined) {
      glyphs.push(...decoration.sequence.filter(glyphHasVisiblePaint));
    }
  }
  return glyphs;
}

function hasTrackCutout(spec: LineworkSpec): boolean {
  return spec.inlineText !== undefined || (spec.decorations?.some((decoration) => decoration.placement.kind === 'center') ?? false);
}

function compileTracks(
  spec: LineworkSpec,
  paths: readonly MeasuredPath[],
  cutouts: readonly (readonly [number, number] | undefined)[],
  context: LineworkCompilationContext
): Style[] {
  const styles: Style[] = [];
  const closed = spec.contour?.kind === 'closed';
  for (const track of spec.tracks) {
    if (cutouts.every((cutout) => cutout === undefined)) {
      const coordinates = paths.map(renderPathCoordinates);
      styles.push(
        new Style({
          geometry: closed
            ? new MultiPolygon(coordinates.map((ring) => [ring]) as [number, number][][][])
            : new MultiLineString(coordinates as [number, number][][]),
          stroke: compileTrackStroke(track.stroke, closed ? closedTrackOffset(track.offset) : track.offset),
          ...(context.zIndex === undefined ? {} : { zIndex: context.zIndex })
        })
      );
      continue;
    }

    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      const cutout = cutouts[index];
      if (cutout === undefined) {
        const coordinates = renderPathCoordinates(path);
        styles.push(
          new Style({
            geometry: path.contour.closed ? new Polygon([coordinates as [number, number][]]) : new LineString(coordinates as [number, number][]),
            stroke: compileTrackStroke(track.stroke, path.contour.closed ? closedTrackOffset(track.offset) : track.offset),
            ...(context.zIndex === undefined ? {} : { zIndex: context.zIndex })
          })
        );
        continue;
      }
      const [cutoutStart, cutoutEnd] = cutout;
      const before = sliceMeasuredPath(path, 0, cutoutStart);
      const after = sliceMeasuredPath(path, cutoutEnd, path.length);
      if (before.length >= 2) {
        styles.push(
          new Style({
            geometry: new LineString(before as [number, number][]),
            stroke: compileTrackStroke(track.stroke, track.offset),
            ...(context.zIndex === undefined ? {} : { zIndex: context.zIndex })
          })
        );
      }
      if (after.length >= 2) {
        styles.push(
          new Style({
            geometry: new LineString(after as [number, number][]),
            stroke: compileTrackStroke(track.stroke, track.offset, -cutoutEnd / context.resolution),
            ...(context.zIndex === undefined ? {} : { zIndex: context.zIndex })
          })
        );
      }
    }
  }
  return styles;
}

function compileTrackStroke(spec: StrokeSpec, offset: number, additionalDashOffset = 0): Stroke {
  return new Stroke({
    ...(spec.color === undefined ? {} : { color: copyColor(spec.color) }),
    ...(spec.width === undefined ? {} : { width: spec.width }),
    ...(spec.lineDash === undefined ? {} : { lineDash: [...spec.lineDash] }),
    ...(spec.lineDashOffset === undefined && additionalDashOffset === 0 ? {} : { lineDashOffset: (spec.lineDashOffset ?? 0) + additionalDashOffset }),
    ...(spec.lineCap === undefined ? {} : { lineCap: spec.lineCap }),
    ...(spec.lineJoin === undefined ? {} : { lineJoin: spec.lineJoin }),
    ...(spec.miterLimit === undefined ? {} : { miterLimit: spec.miterLimit }),
    offset
  });
}

/** Polygon renderer 会按左手规则重排 outer ring，因此反转 offset 以保持工厂轨道的内外侧语义。 */
function closedTrackOffset(offset: number): number {
  return offset === 0 ? 0 : -offset;
}

function collectCaps(spec: LineworkSpec, paths: readonly MeasuredPath[], output: GlyphPlacement[]): void {
  for (const path of paths) {
    const start = samplePath(path, 0);
    const end = samplePath(path, path.length);
    if (spec.caps?.start !== undefined && start !== undefined) output.push({ glyph: spec.caps.start.glyph, sample: reverseSample(start) });
    if (spec.caps?.end !== undefined && end !== undefined) output.push({ glyph: spec.caps.end.glyph, sample: end });
  }
}

function collectDecorations(
  spec: Pick<LineworkSpec, 'caps' | 'decorations'>,
  paths: readonly MeasuredPath[],
  resolution: number,
  viewport: PathViewport | undefined,
  output: GlyphPlacement[]
): void {
  const decorations = spec.decorations;
  if (decorations === undefined) return;
  for (const decoration of decorations) {
    for (const path of paths) {
      if (decoration.placement.kind === 'center') {
        const sample = samplePath(path, path.length / 2);
        if (sample !== undefined && decoration.glyph !== undefined && glyphHasVisiblePaint(decoration.glyph)) {
          output.push({ glyph: decoration.glyph, sample });
        }
        continue;
      }
      const sequence = decoration.sequence;
      if (sequence === undefined || sequence.length === 0) continue;
      const spacing = decoration.placement.spacing * resolution;
      const phase = (decoration.placement.phase ?? 0) * resolution;
      const renderBuffer = (viewport?.renderBufferPx ?? 0) * resolution;
      const intervals = visiblePathIntervals(path, viewport, spacing + renderBuffer);
      const anchors = repeatPathAnchors(path.length, spacing, path.contour.closed, intervals, phase, repeatAnchorExclusion(spec, 0, path.length));
      for (const anchor of anchors) {
        const sample = samplePath(path, anchor.distance);
        const glyph = sequence[anchor.index % sequence.length];
        if (sample !== undefined && glyph !== undefined && glyphHasVisiblePaint(glyph)) output.push({ glyph, sample });
      }
    }
  }
}

function repeatAnchorExclusion(spec: Pick<LineworkSpec, 'caps'>, startBoundary: number, endBoundary: number): RepeatPathAnchorExclusion | undefined {
  const hasStart = spec.caps?.start !== undefined;
  const hasEnd = spec.caps?.end !== undefined;
  if (!hasStart && !hasEnd) return undefined;
  return {
    ...(hasStart ? { startBoundary } : {}),
    ...(hasEnd ? { endBoundary } : {})
  };
}

function compileGlyphPlacements(placements: readonly GlyphPlacement[], context: LineworkCompilationContext): Style[] {
  const { segments, circles, polygons } = buildGlyphBatches(placements, context.resolution);
  return compileGlyphBatches(segments, circles, polygons, context.zIndex);
}

function buildGlyphBatches(
  placements: readonly GlyphPlacement[],
  resolution: number
): { segments: Map<string, SegmentBatch>; circles: Map<string, CircleBatch>; polygons: Map<string, PolygonBatch> } {
  const segments = new Map<string, SegmentBatch>();
  const circles = new Map<string, CircleBatch>();
  const polygons = new Map<string, PolygonBatch>();
  for (const placement of placements) {
    const primitives = flattenPrimitives(placement.glyph.primitives);
    for (let order = 0; order < primitives.length; order += 1) {
      const primitive = primitives[order];
      if (primitive.type === 'segment') {
        const key = `${order}:segment:${paintKey(undefined, primitive.stroke)}`;
        let batch = segments.get(key);
        if (batch === undefined) {
          batch = { key, order, stroke: primitive.stroke, coordinates: [] };
          segments.set(key, batch);
        }
        batch.coordinates.push([
          projectLocalPoint(placement.sample, primitive.from, resolution),
          projectLocalPoint(placement.sample, primitive.to, resolution)
        ]);
      } else if (primitive.type === 'circle') {
        const key = `${order}:circle:${primitive.radius}:${paintKey(primitive.fill, primitive.stroke)}`;
        let batch = circles.get(key);
        if (batch === undefined) {
          batch = { key, order, radius: primitive.radius, fill: primitive.fill, stroke: primitive.stroke, coordinates: [] };
          circles.set(key, batch);
        }
        batch.coordinates.push(projectLocalPoint(placement.sample, primitive.center, resolution));
      } else {
        const key = `${order}:polygon:${paintKey(primitive.fill, primitive.stroke)}`;
        let batch = polygons.get(key);
        if (batch === undefined) {
          batch = { key, order, fill: primitive.fill, stroke: primitive.stroke, coordinates: [] };
          polygons.set(key, batch);
        }
        const ring = primitive.points.map((point) => projectLocalPoint(placement.sample, point, resolution));
        if (ring.length > 0) ring.push(ring[0]);
        batch.coordinates.push([ring]);
      }
    }
  }
  return { segments, circles, polygons };
}

function compileGlyphBatches(
  segments: ReadonlyMap<string, SegmentBatch>,
  circles: ReadonlyMap<string, CircleBatch>,
  polygons: ReadonlyMap<string, PolygonBatch>,
  zIndex: number | undefined
): Style[] {
  const ordered: OrderedStyle[] = [];
  for (const batch of segments.values()) {
    ordered.push({
      order: batch.order,
      style: new Style({
        geometry: new MultiLineString(batch.coordinates as [number, number][][]),
        stroke: compileGlyphStroke(batch.stroke),
        ...(zIndex === undefined ? {} : { zIndex })
      })
    });
  }
  for (const batch of circles.values()) {
    ordered.push({
      order: batch.order,
      style: new Style({
        geometry: new MultiPoint(batch.coordinates as [number, number][]),
        image: new CircleStyle({
          radius: batch.radius,
          ...(batch.fill === undefined ? {} : { fill: new Fill({ color: copyColor(batch.fill.color) }) }),
          ...(batch.stroke === undefined ? {} : { stroke: compileGlyphStroke(batch.stroke) })
        }),
        ...(zIndex === undefined ? {} : { zIndex })
      })
    });
  }
  for (const batch of polygons.values()) {
    ordered.push({
      order: batch.order,
      style: new Style({
        geometry: new MultiPolygon(batch.coordinates as [number, number][][][]),
        ...(batch.fill === undefined ? {} : { fill: new Fill({ color: copyColor(batch.fill.color) }) }),
        ...(batch.stroke === undefined ? {} : { stroke: compileGlyphStroke(batch.stroke) }),
        ...(zIndex === undefined ? {} : { zIndex })
      })
    });
  }
  ordered.sort((left, right) => left.order - right.order);
  return ordered.map((entry) => entry.style);
}

function compileInlineText(spec: InlinePathTextSpec, paths: readonly MeasuredPath[], context: LineworkCompilationContext): Style[] {
  if (!inlineTextHasVisiblePaint(spec)) return [];
  const font = inlineTextFont(spec);
  return paths.flatMap((path) => {
    const sample = samplePath(path, path.length / 2);
    if (sample === undefined) return [];
    const backgroundPadding = spec.backgroundFill === undefined ? 0 : (spec.backgroundPadding ?? 0);
    return [
      new Style({
        geometry: new Point([...sample.coordinate]),
        text: new Text({
          text: spec.text,
          font,
          fill: new Fill({ color: copyColor(spec.fill.color) }),
          ...(spec.stroke === undefined ? {} : { stroke: compileGlyphStroke(spec.stroke) }),
          ...(spec.backgroundFill === undefined ? {} : { backgroundFill: new Fill({ color: copyColor(spec.backgroundFill.color) }) }),
          ...(backgroundPadding === 0 ? {} : { padding: [backgroundPadding, backgroundPadding, backgroundPadding, backgroundPadding] }),
          textAlign: 'center',
          textBaseline: 'middle',
          overflow: true,
          placement: 'point',
          rotateWithView: false,
          rotation: uprightTextRotation(sample, context.viewRotation)
        }),
        ...(context.zIndex === undefined ? {} : { zIndex: context.zIndex })
      })
    ];
  });
}

function compileHitCorridor(spec: LineworkSpec, paths: readonly MeasuredPath[], context: LineworkCompilationContext): Style {
  const coordinates = paths.map(renderPathCoordinates);
  const maximumTrackWidth = spec.tracks.reduce((maximum, track) => Math.max(maximum, (track.stroke.width ?? 1) + Math.abs(track.offset) * 2), 0);
  return new Style({
    geometry: new MultiLineString(coordinates as [number, number][][]),
    stroke: new Stroke({ color: [0, 0, 0, 0], width: Math.max(6, maximumTrackWidth) }),
    ...(context.zIndex === undefined ? {} : { zIndex: context.zIndex })
  });
}

function lineworkCutout(
  spec: LineworkSpec,
  path: MeasuredPath,
  context: Pick<LineworkCompilationContext, 'measureText' | 'resolution'>
): readonly [number, number] | undefined {
  let minimumU = Number.POSITIVE_INFINITY;
  let maximumU = Number.NEGATIVE_INFINITY;
  for (const decoration of spec.decorations ?? []) {
    if (decoration.placement.kind !== 'center') continue;
    if (decoration.glyph === undefined) continue;
    const extent = glyphExtent(decoration.glyph);
    const padding = decoration.cutoutPadding ?? 0;
    minimumU = Math.min(minimumU, extent.minimumU - padding);
    maximumU = Math.max(maximumU, extent.maximumU + padding);
  }
  if (spec.inlineText !== undefined) {
    const text = spec.inlineText;
    const measuredWidth = safeMeasuredWidth(context.measureText(inlineTextFont(text), text.text), text.fontSize, text.text);
    const backgroundPadding = text.backgroundFill === undefined ? 0 : (text.backgroundPadding ?? 0);
    const outlineWidth = text.stroke?.width ?? 0;
    const halfWidth = measuredWidth / 2 + backgroundPadding + outlineWidth / 2 + text.gapPadding;
    minimumU = Math.min(minimumU, -halfWidth);
    maximumU = Math.max(maximumU, halfWidth);
  }
  if (!Number.isFinite(minimumU) || !Number.isFinite(maximumU)) return undefined;
  const middle = path.length / 2;
  const start = clamp(middle + minimumU * context.resolution, 0, path.length);
  const end = clamp(middle + maximumU * context.resolution, 0, path.length);
  return start < end ? [start, end] : undefined;
}

function glyphExtent(glyph: PathGlyphSpec): GlyphExtent {
  let minimumU = Number.POSITIVE_INFINITY;
  let maximumU = Number.NEGATIVE_INFINITY;
  for (const primitive of flattenPrimitives(glyph.primitives)) {
    const strokeHalf = (primitive.stroke?.width ?? 0) / 2;
    if (primitive.type === 'segment') {
      minimumU = Math.min(minimumU, primitive.from[0] - strokeHalf, primitive.to[0] - strokeHalf);
      maximumU = Math.max(maximumU, primitive.from[0] + strokeHalf, primitive.to[0] + strokeHalf);
    } else if (primitive.type === 'circle') {
      minimumU = Math.min(minimumU, primitive.center[0] - primitive.radius - strokeHalf);
      maximumU = Math.max(maximumU, primitive.center[0] + primitive.radius + strokeHalf);
    } else {
      for (const point of primitive.points) {
        minimumU = Math.min(minimumU, point[0] - strokeHalf);
        maximumU = Math.max(maximumU, point[0] + strokeHalf);
      }
    }
  }
  return {
    minimumU: Number.isFinite(minimumU) ? minimumU : 0,
    maximumU: Number.isFinite(maximumU) ? maximumU : 0
  };
}

function flattenPrimitives(primitives: readonly PathGlyphPrimitiveSpec[]): Exclude<PathGlyphPrimitiveSpec, { type: 'group' }>[] {
  const result: Exclude<PathGlyphPrimitiveSpec, { type: 'group' }>[] = [];
  for (const primitive of primitives) {
    if (primitive.type === 'group') result.push(...flattenPrimitives(primitive.primitives));
    else result.push(primitive);
  }
  return result;
}

function renderPathCoordinates(path: MeasuredPath): PathCoordinate[] {
  const coordinates = path.contour.coordinates.map((coordinate) => [coordinate[0], coordinate[1]] as PathCoordinate);
  if (path.contour.closed && coordinates.length > 0) coordinates.push(coordinates[0]);
  return coordinates;
}

function reverseSample(sample: PathSample): PathSample {
  const tangent: PathCoordinate = [-sample.tangent[0], -sample.tangent[1]];
  return {
    ...sample,
    tangent,
    normal: [tangent[1], -tangent[0]],
    angle: Math.atan2(tangent[1], tangent[0])
  };
}

function compileGlyphStroke(spec: PathGlyphStrokeSpec): Stroke {
  return new Stroke({
    ...(spec.color === undefined ? {} : { color: copyColor(spec.color) }),
    ...(spec.width === undefined ? {} : { width: spec.width }),
    ...(spec.lineCap === undefined ? {} : { lineCap: spec.lineCap }),
    ...(spec.lineJoin === undefined ? {} : { lineJoin: spec.lineJoin }),
    ...(spec.miterLimit === undefined ? {} : { miterLimit: spec.miterLimit })
  });
}

function inlineTextFont(spec: InlinePathTextSpec): string {
  return `${spec.fontStyle} ${spec.fontWeight} ${spec.fontSize}px ${spec.fontFamily}`;
}

function safeMeasuredWidth(measured: number, fontSize: number, text: string): number {
  return Number.isFinite(measured) && measured >= 0 ? measured : Array.from(text).length * fontSize * 0.6;
}

/** 透明的内部占位仍参与切口，但不为 dash-flow overlay 创建重复可见内容。 */
function glyphHasVisiblePaint(glyph: PathGlyphSpec): boolean {
  return flattenPrimitives(glyph.primitives).some((primitive) => {
    if (primitive.type === 'segment') return strokeHasVisiblePaint(primitive.stroke);
    return fillHasVisiblePaint(primitive.fill) || strokeHasVisiblePaint(primitive.stroke);
  });
}

function inlineTextHasVisiblePaint(spec: InlinePathTextSpec): boolean {
  return fillHasVisiblePaint(spec.fill) || strokeHasVisiblePaint(spec.stroke) || fillHasVisiblePaint(spec.backgroundFill);
}

function fillHasVisiblePaint(fill: { readonly color: Color } | undefined): boolean {
  return fill !== undefined && !isTransparentColor(fill.color);
}

function strokeHasVisiblePaint(stroke: PathGlyphStrokeSpec | undefined): boolean {
  return stroke !== undefined && !isTransparentColor(stroke.color);
}

function isTransparentColor(color: Color | undefined): boolean {
  if (color === undefined) return false;
  if (typeof color === 'string') return color.trim().toLowerCase() === 'transparent';
  return color.length === 4 && color[3] <= 0;
}

function paintKey(fill: { readonly color: Color } | undefined, stroke: PathGlyphStrokeSpec | undefined): string {
  return JSON.stringify([fill?.color ?? null, stroke ?? null]);
}

function copyColor(color: Color): Color {
  return typeof color === 'string' ? color : ([...color] as Color);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
