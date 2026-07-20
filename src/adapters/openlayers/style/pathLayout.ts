/** OpenLayers Adapter 内部使用的二维坐标。 */
export type PathCoordinate = readonly [number, number];

/** 从最终 RenderGeometry 投影中提取的路径轮廓。 */
export interface PathContour {
  readonly coordinates: readonly PathCoordinate[];
  readonly closed: boolean;
  readonly role: 'line' | 'outer' | 'hole';
}

/** 路径中的一条非退化线段。 */
export interface MeasuredPathSegment {
  readonly start: PathCoordinate;
  readonly end: PathCoordinate;
  readonly length: number;
  readonly startDistance: number;
  readonly endDistance: number;
  readonly tangent: PathCoordinate;
}

/** 单条轮廓一次度量后的稳定结果。 */
export interface MeasuredPath {
  readonly contour: PathContour;
  readonly segments: readonly MeasuredPathSegment[];
  readonly length: number;
}

/** 路径累计距离处的坐标与局部坐标轴。 */
export interface PathSample {
  readonly coordinate: PathCoordinate;
  readonly tangent: PathCoordinate;
  readonly normal: PathCoordinate;
  readonly angle: number;
  readonly distance: number;
}

/** 重复装饰物化使用的保守 View 范围。 */
export interface PathViewport {
  readonly extent: readonly [minimumX: number, minimumY: number, maximumX: number, maximumY: number];
  readonly worldWidth?: number;
  readonly renderBufferPx?: number;
}

/** 带稳定序号的固定间距锚点。 */
export interface RepeatedPathAnchor {
  readonly index: number;
  readonly distance: number;
}

/** 开放路径需要从完整重复序列中排除的首末锚点边界。 */
export interface RepeatPathAnchorExclusion {
  readonly startBoundary?: number;
  readonly endBoundary?: number;
}

const TANGENT_EPSILON = 1e-9;

/**
 * 从常规 Geometry 或 RenderFeature Geometry 中提取开放线和 Polygon 外环。
 * 第一版有意忽略 Polygon hole，保持与已批准轮廓契约一致。
 */
export function extractPathContours(geometry: object | undefined): PathContour[] {
  if (geometry === undefined) return [];
  const type = callString(geometry, 'getType');
  const coordinates = callUnknown(geometry, 'getCoordinates');
  if (coordinates !== undefined) return contoursFromCoordinates(type, coordinates);
  return contoursFromFlatCoordinates(geometry, type);
}

/** 删除闭环尾部重复起点，并为有效线段建立累计长度。 */
export function measurePath(contour: PathContour): MeasuredPath {
  const coordinates = normalizeContourCoordinates(contour.coordinates, contour.closed);
  const normalizedContour: PathContour = {
    coordinates,
    closed: contour.closed,
    role: contour.role
  };
  const segments: MeasuredPathSegment[] = [];
  let total = 0;
  const segmentCount = contour.closed ? coordinates.length : Math.max(0, coordinates.length - 1);
  for (let index = 0; index < segmentCount; index += 1) {
    const start = coordinates[index];
    const end = coordinates[(index + 1) % coordinates.length];
    if (start === undefined || end === undefined) continue;
    const deltaX = end[0] - start[0];
    const deltaY = end[1] - start[1];
    const length = Math.hypot(deltaX, deltaY);
    if (!Number.isFinite(length) || length <= 0) continue;
    const startDistance = total;
    total += length;
    segments.push({
      start,
      end,
      length,
      startDistance,
      endDistance: total,
      tangent: [deltaX / length, deltaY / length]
    });
  }
  return { contour: normalizedContour, segments, length: total };
}

/** 在累计距离处采样；折点切线由相邻有效线段合成，反向折返退化为进入段切线。 */
export function samplePath(path: MeasuredPath, distance: number): PathSample | undefined {
  if (path.segments.length === 0 || !Number.isFinite(distance)) return undefined;
  const normalizedDistance = path.contour.closed ? normalizeClosedDistance(distance, path.length) : clamp(distance, 0, path.length);
  const segmentIndex = locateSegment(path.segments, normalizedDistance);
  const segment = path.segments[segmentIndex];
  if (segment === undefined) return undefined;
  const localDistance = clamp(normalizedDistance - segment.startDistance, 0, segment.length);
  const ratio = localDistance / segment.length;
  const coordinate: PathCoordinate = [
    segment.start[0] + (segment.end[0] - segment.start[0]) * ratio,
    segment.start[1] + (segment.end[1] - segment.start[1]) * ratio
  ];
  const tangent = tangentAtSample(path, segmentIndex, localDistance);
  return {
    coordinate,
    tangent,
    normal: [tangent[1], -tangent[0]],
    angle: Math.atan2(tangent[1], tangent[0]),
    distance: normalizedDistance
  };
}

/**
 * 计算严格固定间距的装饰锚点。
 * 开放路径把余量对称分配到两端；闭环把额外余量集中到第一坐标对应的 seam。
 */
export function repeatPathDistances(length: number, spacing: number, closed: boolean): number[] {
  return repeatPathAnchors(length, spacing, closed).map((anchor) => anchor.distance);
}

/** 只物化给定累计距离区间内的固定间距锚点，同时保留完整 contour 的全局相位与端点避让。 */
export function repeatPathAnchors(
  length: number,
  spacing: number,
  closed: boolean,
  intervals?: readonly (readonly [start: number, end: number])[],
  phase = 0,
  exclusion?: RepeatPathAnchorExclusion
): RepeatedPathAnchor[] {
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(spacing) || spacing <= 0) return [];
  const normalizedIntervals = intervals === undefined ? ([[0, length]] as const) : mergeIntervals(intervals, length);
  if (normalizedIntervals.length === 0) return [];
  let count: number;
  let first: number;
  if (!closed) {
    count = Math.floor(length / spacing) + 1;
    first = (length - (count - 1) * spacing) / 2 + phase;
    return excludeOpenEndpointAnchors(anchorsInIntervals(count, first, spacing, length, normalizedIntervals, false), count, first, spacing, length, exclusion);
  }
  count = Math.max(1, Math.floor(length / spacing));
  if (count === 1) {
    const distance = normalizeClosedDistance(length / 2 + phase, length);
    return normalizedIntervals.some((interval) => distance >= interval[0] && distance <= interval[1]) ? [{ index: 0, distance }] : [];
  }
  const seamGap = length - (count - 1) * spacing;
  first = seamGap / 2 + normalizeClosedDistance(phase, length);
  return anchorsInIntervals(count, first, spacing, length, normalizedIntervals, true);
}

function excludeOpenEndpointAnchors(
  anchors: RepeatedPathAnchor[],
  count: number,
  first: number,
  spacing: number,
  length: number,
  exclusion: RepeatPathAnchorExclusion | undefined
): RepeatedPathAnchor[] {
  if (exclusion === undefined || anchors.length === 0) return anchors;
  const firstValidIndex = Math.max(0, Math.ceil((-first - TANGENT_EPSILON) / spacing));
  const lastValidIndex = Math.min(count - 1, Math.floor((length - first + TANGENT_EPSILON) / spacing));
  if (lastValidIndex < firstValidIndex) return anchors;
  const startIndex =
    exclusion.startBoundary === undefined
      ? undefined
      : Math.max(firstValidIndex, Math.ceil((clamp(exclusion.startBoundary, 0, length) - first - TANGENT_EPSILON) / spacing));
  const endIndex =
    exclusion.endBoundary === undefined
      ? undefined
      : Math.min(lastValidIndex, Math.floor((clamp(exclusion.endBoundary, 0, length) - first + TANGENT_EPSILON) / spacing));
  return anchors.filter(
    (anchor) =>
      (startIndex === undefined || startIndex > lastValidIndex || anchor.index !== startIndex) &&
      (endIndex === undefined || endIndex < firstValidIndex || anchor.index !== endIndex)
  );
}

/** 计算 path 与当前 View（含 wrapX 世界副本）相交的累计距离区间。 */
export function visiblePathIntervals(
  path: MeasuredPath,
  viewport: PathViewport | undefined,
  padding: number
): readonly (readonly [number, number])[] | undefined {
  if (viewport === undefined) return undefined;
  const [minimumX, minimumY, maximumX, maximumY] = viewport.extent;
  if (![minimumX, minimumY, maximumX, maximumY].every(Number.isFinite) || minimumX > maximumX || minimumY > maximumY) return undefined;
  const safePadding = Number.isFinite(padding) && padding > 0 ? padding : 0;
  const extent: readonly [number, number, number, number] = [minimumX - safePadding, minimumY - safePadding, maximumX + safePadding, maximumY + safePadding];
  const worldWidth = viewport.worldWidth;
  const intervals: Array<readonly [number, number]> = [];
  for (const segment of path.segments) {
    const shifts = visibleWorldShifts(segment, extent, worldWidth);
    if (shifts === undefined) return undefined;
    for (const shift of shifts) {
      const clipped = clipSegmentToExtent(segment.start, segment.end, shift, extent);
      if (clipped === undefined) continue;
      intervals.push([segment.startDistance + clipped[0] * segment.length, segment.startDistance + clipped[1] * segment.length]);
    }
  }
  return mergeIntervals(intervals, path.length);
}

/** 返回路径 `[from, to]` 的连续坐标切片，保留区间内的原始折点。 */
export function sliceMeasuredPath(path: MeasuredPath, from: number, to: number): PathCoordinate[] {
  if (path.segments.length === 0 || !Number.isFinite(from) || !Number.isFinite(to)) return [];
  const startDistance = clamp(from, 0, path.length);
  const endDistance = clamp(to, 0, path.length);
  if (endDistance <= startDistance) return [];
  const start = samplePathForSlice(path, startDistance);
  const end = samplePathForSlice(path, endDistance);
  if (start === undefined || end === undefined) return [];
  const coordinates: PathCoordinate[] = [start.coordinate];
  for (const segment of path.segments) {
    if (segment.endDistance <= startDistance + TANGENT_EPSILON) continue;
    if (segment.endDistance >= endDistance - TANGENT_EPSILON) break;
    pushDistinct(coordinates, segment.end);
  }
  pushDistinct(coordinates, end.coordinate);
  return coordinates.length >= 2 ? coordinates : [];
}

/** 把 glyph 的局部 CSS 像素坐标转换为当前 View 投影坐标。 */
export function projectLocalPoint(sample: PathSample, local: PathCoordinate, resolution: number): PathCoordinate {
  const safeResolution = Number.isFinite(resolution) && resolution > 0 ? resolution : 1;
  const u = local[0] * safeResolution;
  const v = local[1] * safeResolution;
  return [sample.coordinate[0] + sample.tangent[0] * u + sample.normal[0] * v, sample.coordinate[1] + sample.tangent[1] * u + sample.normal[1] * v];
}

/** 保持 Point Text 在屏幕上正向的路径旋转角。 */
export function uprightTextRotation(sample: PathSample, viewRotation: number): number {
  let screenAngle = sample.angle - (Number.isFinite(viewRotation) ? viewRotation : 0);
  screenAngle = normalizeSignedAngle(screenAngle);
  if (screenAngle > Math.PI / 2 || screenAngle < -Math.PI / 2) screenAngle = normalizeSignedAngle(screenAngle + Math.PI);
  return -screenAngle;
}

function contoursFromCoordinates(type: string | undefined, coordinates: unknown): PathContour[] {
  if (type === 'LineString') return contourList([coordinateArray(coordinates)], false, 'line');
  if (type === 'LinearRing') return contourList([coordinateArray(coordinates)], true, 'line');
  if (type === 'MultiLineString') return contourList(nestedCoordinateArrays(coordinates), false, 'line');
  if (type === 'Polygon') {
    const rings = nestedCoordinateArrays(coordinates);
    return rings.length === 0 ? [] : contourList([rings[0]], true, 'outer');
  }
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    const contours: PathContour[] = [];
    for (const polygon of coordinates) {
      const rings = nestedCoordinateArrays(polygon);
      if (rings.length > 0) contours.push(...contourList([rings[0]], true, 'outer'));
    }
    return contours;
  }
  return [];
}

function contoursFromFlatCoordinates(geometry: object, type: string | undefined): PathContour[] {
  const flat = callUnknown(geometry, 'getFlatCoordinates');
  const stride = callUnknown(geometry, 'getStride');
  if (!Array.isArray(flat) || typeof stride !== 'number' || stride < 2) return [];
  const all = flatToCoordinates(flat, 0, flat.length, stride);
  if (type === 'LineString') return contourList([all], false, 'line');
  if (type === 'LinearRing') return contourList([all], true, 'line');
  const ends = callUnknown(geometry, 'getEnds');
  if (type === 'MultiLineString' && Array.isArray(ends)) return contourList(flatPaths(flat, stride, ends), false, 'line');
  if (type === 'Polygon' && Array.isArray(ends)) {
    const rings = flatPaths(flat, stride, ends);
    return rings.length === 0 ? [] : contourList([rings[0]], true, 'outer');
  }
  const endss = callUnknown(geometry, 'getEndss');
  if (type === 'MultiPolygon' && Array.isArray(endss)) {
    const result: PathContour[] = [];
    let start = 0;
    for (const polygonEnds of endss) {
      if (!Array.isArray(polygonEnds) || polygonEnds.length === 0) continue;
      const outerEnd = polygonEnds[0];
      if (typeof outerEnd !== 'number') continue;
      const outer = flatToCoordinates(flat, start, outerEnd, stride);
      result.push(...contourList([outer], true, 'outer'));
      const lastEnd = polygonEnds.at(-1);
      if (typeof lastEnd === 'number') start = lastEnd;
    }
    return result;
  }
  return [];
}

function contourList(paths: readonly PathCoordinate[][], closed: boolean, role: PathContour['role']): PathContour[] {
  return paths
    .map((coordinates) => normalizeContourCoordinates(coordinates, closed))
    .filter((coordinates) => coordinates.length >= (closed ? 3 : 2))
    .map((coordinates) => (closed && role === 'outer' ? normalizeOuterWinding(coordinates) : coordinates))
    .map((coordinates) => ({ coordinates, closed, role }));
}

function normalizeContourCoordinates(coordinates: readonly PathCoordinate[], closed: boolean): PathCoordinate[] {
  const result = coordinates.filter(isFiniteCoordinate).map((coordinate) => [coordinate[0], coordinate[1]] as PathCoordinate);
  if (closed && result.length > 1 && sameCoordinate(result[0], result[result.length - 1])) result.pop();
  return result;
}

/** 把 outer ring 统一为逆时针，同时保留调用方声明的 seam 起点。 */
function normalizeOuterWinding(coordinates: PathCoordinate[]): PathCoordinate[] {
  if (signedArea(coordinates) >= 0 || coordinates.length < 3) return coordinates;
  return [coordinates[0], ...coordinates.slice(1).reverse()];
}

function signedArea(coordinates: readonly PathCoordinate[]): number {
  let twiceArea = 0;
  for (let index = 0; index < coordinates.length; index += 1) {
    const current = coordinates[index];
    const next = coordinates[(index + 1) % coordinates.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function tangentAtSample(path: MeasuredPath, segmentIndex: number, localDistance: number): PathCoordinate {
  const segment = path.segments[segmentIndex];
  if (segment === undefined) return [1, 0];
  if (localDistance <= TANGENT_EPSILON) {
    const previousIndex = segmentIndex > 0 ? segmentIndex - 1 : path.contour.closed ? path.segments.length - 1 : -1;
    const previous = path.segments[previousIndex];
    if (previous !== undefined) return combineTangents(previous.tangent, segment.tangent);
  }
  if (segment.length - localDistance <= TANGENT_EPSILON) {
    const nextIndex = segmentIndex + 1 < path.segments.length ? segmentIndex + 1 : path.contour.closed ? 0 : -1;
    const next = path.segments[nextIndex];
    if (next !== undefined) return combineTangents(segment.tangent, next.tangent);
  }
  return segment.tangent;
}

function combineTangents(incoming: PathCoordinate, outgoing: PathCoordinate): PathCoordinate {
  const x = incoming[0] + outgoing[0];
  const y = incoming[1] + outgoing[1];
  const length = Math.hypot(x, y);
  return length <= TANGENT_EPSILON ? incoming : [x / length, y / length];
}

function locateSegment(segments: readonly MeasuredPathSegment[], distance: number): number {
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (distance <= segments[middle].endDistance) high = middle;
    else low = middle + 1;
  }
  return low;
}

function samplePathForSlice(path: MeasuredPath, distance: number): PathSample | undefined {
  if (!path.contour.closed || distance < path.length) return samplePath(path, distance);
  const last = path.segments.at(-1);
  if (last === undefined) return undefined;
  return {
    coordinate: last.end,
    tangent: last.tangent,
    normal: [last.tangent[1], -last.tangent[0]],
    angle: Math.atan2(last.tangent[1], last.tangent[0]),
    distance
  };
}

function anchorsInIntervals(
  count: number,
  first: number,
  spacing: number,
  length: number,
  intervals: readonly (readonly [number, number])[],
  closed: boolean
): RepeatedPathAnchor[] {
  const indices = new Set<number>();
  const cycles = closed ? [0, 1] : [0];
  for (const interval of intervals) {
    for (const cycle of cycles) {
      const cycleOffset = cycle * length;
      const minimum = Math.max(0, Math.ceil((interval[0] + cycleOffset - first - TANGENT_EPSILON) / spacing));
      const maximum = Math.min(count - 1, Math.floor((interval[1] + cycleOffset - first + TANGENT_EPSILON) / spacing));
      for (let index = minimum; index <= maximum; index += 1) indices.add(index);
    }
  }
  return [...indices]
    .sort((left, right) => left - right)
    .map((index) => ({ index, distance: closed ? normalizeClosedDistance(first + index * spacing, length) : first + index * spacing }))
    .filter((anchor) => anchor.distance >= 0 && anchor.distance <= length);
}

function visibleWorldShifts(
  segment: MeasuredPathSegment,
  extent: readonly [number, number, number, number],
  worldWidth: number | undefined
): number[] | undefined {
  if (worldWidth === undefined) return [0];
  if (!Number.isFinite(worldWidth) || worldWidth <= 0) return undefined;
  const segmentMinimumX = Math.min(segment.start[0], segment.end[0]);
  const segmentMaximumX = Math.max(segment.start[0], segment.end[0]);
  const minimumWorld = Math.ceil((extent[0] - segmentMaximumX) / worldWidth);
  const maximumWorld = Math.floor((extent[2] - segmentMinimumX) / worldWidth);
  if (maximumWorld < minimumWorld) return [];
  if (maximumWorld - minimumWorld > 64) return undefined;
  const result: number[] = [];
  for (let world = minimumWorld; world <= maximumWorld; world += 1) result.push(world * worldWidth);
  return result;
}

/** Liang–Barsky 裁剪，返回线段参数区间。 */
function clipSegmentToExtent(
  start: PathCoordinate,
  end: PathCoordinate,
  shiftX: number,
  extent: readonly [number, number, number, number]
): readonly [number, number] | undefined {
  const startX = start[0] + shiftX;
  const endX = end[0] + shiftX;
  const deltaX = endX - startX;
  const deltaY = end[1] - start[1];
  let minimum = 0;
  let maximum = 1;
  const constraints: readonly (readonly [number, number])[] = [
    [-deltaX, startX - extent[0]],
    [deltaX, extent[2] - startX],
    [-deltaY, start[1] - extent[1]],
    [deltaY, extent[3] - start[1]]
  ];
  for (const [direction, distance] of constraints) {
    if (Math.abs(direction) <= TANGENT_EPSILON) {
      if (distance < 0) return undefined;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum > maximum) return undefined;
  }
  return [minimum, maximum];
}

function mergeIntervals(intervals: readonly (readonly [number, number])[], length: number): Array<readonly [number, number]> {
  const normalized = intervals
    .map(([start, end]) => [clamp(start, 0, length), clamp(end, 0, length)] as const)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .sort((left, right) => left[0] - right[0]);
  const result: Array<readonly [number, number]> = [];
  for (const interval of normalized) {
    const previous = result.at(-1);
    if (previous === undefined || interval[0] > previous[1] + TANGENT_EPSILON) {
      result.push(interval);
    } else {
      result[result.length - 1] = [previous[0], Math.max(previous[1], interval[1])];
    }
  }
  return result;
}

function normalizeClosedDistance(distance: number, length: number): number {
  if (length <= 0) return 0;
  const remainder = distance % length;
  return remainder < 0 ? remainder + length : remainder;
}

function normalizeSignedAngle(angle: number): number {
  let normalized = angle % (Math.PI * 2);
  if (normalized > Math.PI) normalized -= Math.PI * 2;
  if (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function flatPaths(flat: readonly unknown[], stride: number, ends: readonly unknown[]): PathCoordinate[][] {
  const result: PathCoordinate[][] = [];
  let start = 0;
  for (const end of ends) {
    if (typeof end !== 'number') continue;
    result.push(flatToCoordinates(flat, start, end, stride));
    start = end;
  }
  return result;
}

function flatToCoordinates(flat: readonly unknown[], start: number, end: number, stride: number): PathCoordinate[] {
  const result: PathCoordinate[] = [];
  for (let index = start; index + 1 < end; index += stride) {
    const x = flat[index];
    const y = flat[index + 1];
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) result.push([x, y]);
  }
  return result;
}

function coordinateArray(value: unknown): PathCoordinate[] {
  if (!Array.isArray(value)) return [];
  const result: PathCoordinate[] = [];
  for (const coordinate of value) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
    const [x, y] = coordinate;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) result.push([x, y]);
  }
  return result;
}

function nestedCoordinateArrays(value: unknown): PathCoordinate[][] {
  if (!Array.isArray(value)) return [];
  return value.map(coordinateArray).filter((path) => path.length > 0);
}

function isFiniteCoordinate(coordinate: PathCoordinate): boolean {
  return Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]);
}

function sameCoordinate(first: PathCoordinate, second: PathCoordinate): boolean {
  return first[0] === second[0] && first[1] === second[1];
}

function pushDistinct(coordinates: PathCoordinate[], coordinate: PathCoordinate): void {
  const previous = coordinates.at(-1);
  if (previous === undefined || !sameCoordinate(previous, coordinate)) coordinates.push(coordinate);
}

function callUnknown(value: object, name: string): unknown {
  const candidate = (value as Record<string, unknown>)[name];
  return typeof candidate === 'function' ? (candidate as () => unknown).call(value) : undefined;
}

function callString(value: object, name: string): string | undefined {
  const result = callUnknown(value, name);
  return typeof result === 'string' ? result : undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
