import type { Coordinate } from '../../core/common/types.js';
import type { ShapeRadialFrame } from '../../core/shape/types.js';

interface MutablePolygonGeometry {
  readonly type: 'polygon';
  readonly coordinates: Coordinate[][];
}

/** 复用径向波纹带的 Polygon、环和坐标容器。 */
export interface RadialBandGeometryBuffer {
  readonly geometry: MutablePolygonGeometry;
  readonly outerRing: Coordinate[];
  readonly innerRing: Coordinate[];
  readonly sectorRing: Coordinate[];
  readonly outerPool: number[][];
  readonly innerPool: number[][];
  readonly sectorPool: number[][];
}

/** 创建尚未按采样预算分配坐标的径向波纹带缓冲。 */
export function createRadialBandGeometryBuffer(): RadialBandGeometryBuffer {
  return {
    geometry: { type: 'polygon', coordinates: [] },
    outerRing: [],
    innerRing: [],
    sectorRing: [],
    outerPool: [],
    innerPool: [],
    sectorPool: []
  };
}

/** 按当前 radial-frame 拓扑和固定弧线采样数准备稳定坐标容器。 */
export function prepareRadialBandGeometryBuffer(buffer: RadialBandGeometryBuffer, segmentCount: number, dimension: number, fullCircle: boolean): void {
  if (fullCircle) {
    prepareRing(buffer.outerRing, buffer.outerPool, segmentCount + 2, dimension);
    prepareRing(buffer.innerRing, buffer.innerPool, segmentCount + 2, dimension);
    return;
  }
  prepareRing(buffer.sectorRing, buffer.sectorPool, 2 * (segmentCount + 1) + 1, dimension);
}

/** 写入完整环带或严格裁剪在 radial-frame 内的环形扇面。 */
export function writeRadialBandGeometry(
  buffer: RadialBandGeometryBuffer,
  frame: ShapeRadialFrame,
  innerRadius: number,
  outerRadius: number,
  fullCircle: boolean,
  segmentCount: number
): MutablePolygonGeometry {
  if (fullCircle) {
    writeFullCircleBand(buffer, frame, innerRadius, outerRadius, segmentCount);
  } else {
    writeSectorBand(buffer, frame, innerRadius, outerRadius, segmentCount);
  }
  return buffer.geometry;
}

/** 释放径向波纹带持有的稳定容器。 */
export function destroyRadialBandGeometryBuffer(buffer: RadialBandGeometryBuffer): void {
  buffer.geometry.coordinates.length = 0;
  buffer.outerRing.length = 0;
  buffer.innerRing.length = 0;
  buffer.sectorRing.length = 0;
  buffer.outerPool.length = 0;
  buffer.innerPool.length = 0;
  buffer.sectorPool.length = 0;
}

function writeFullCircleBand(buffer: RadialBandGeometryBuffer, frame: ShapeRadialFrame, innerRadius: number, outerRadius: number, segmentCount: number): void {
  for (let index = 0; index <= segmentCount; index += 1) {
    const progress = index / segmentCount;
    writeRadialCoordinate(buffer.outerRing[index] as unknown as number[], frame.center, outerRadius, frame.startAngleRad + frame.sweepAngleRad * progress);
  }
  writeCoordinate(buffer.outerRing[segmentCount + 1] as unknown as number[], buffer.outerRing[0]);

  const coordinates = buffer.geometry.coordinates;
  coordinates[0] = buffer.outerRing;
  if (innerRadius > Number.EPSILON) {
    for (let index = 0; index <= segmentCount; index += 1) {
      const progress = 1 - index / segmentCount;
      writeRadialCoordinate(buffer.innerRing[index] as unknown as number[], frame.center, innerRadius, frame.startAngleRad + frame.sweepAngleRad * progress);
    }
    writeCoordinate(buffer.innerRing[segmentCount + 1] as unknown as number[], buffer.innerRing[0]);
    coordinates[1] = buffer.innerRing;
    coordinates.length = 2;
  } else {
    coordinates.length = 1;
  }
}

function writeSectorBand(buffer: RadialBandGeometryBuffer, frame: ShapeRadialFrame, innerRadius: number, outerRadius: number, segmentCount: number): void {
  const ring = buffer.sectorRing;
  for (let index = 0; index <= segmentCount; index += 1) {
    const progress = index / segmentCount;
    writeRadialCoordinate(ring[index] as unknown as number[], frame.center, outerRadius, frame.startAngleRad + frame.sweepAngleRad * progress);
    writeRadialCoordinate(
      ring[segmentCount + 1 + index] as unknown as number[],
      frame.center,
      innerRadius,
      frame.startAngleRad + frame.sweepAngleRad * (1 - progress)
    );
  }
  writeCoordinate(ring[2 * (segmentCount + 1)] as unknown as number[], ring[0]);
  buffer.geometry.coordinates[0] = ring;
  buffer.geometry.coordinates.length = 1;
}

function prepareRing(ring: Coordinate[], pool: number[][], coordinateCount: number, dimension: number): void {
  for (let index = 0; index < coordinateCount; index += 1) ring[index] = coordinateAt(pool, index, dimension) as unknown as Coordinate;
  ring.length = coordinateCount;
}

function writeCoordinate(coordinate: number[], source: Coordinate): void {
  coordinate[0] = source[0];
  coordinate[1] = source[1];
  if (coordinate.length === 3) coordinate[2] = source[2] ?? 0;
}

function writeRadialCoordinate(coordinate: number[], center: Coordinate, radius: number, angle: number): void {
  coordinate[0] = center[0] + radius * Math.cos(angle);
  coordinate[1] = center[1] + radius * Math.sin(angle);
  if (coordinate.length === 3) coordinate[2] = center[2] ?? 0;
}

function coordinateAt(pool: number[][], index: number, dimension: number): number[] {
  const current = pool[index];
  if (current !== undefined && current.length === dimension) return current;
  const created = Array.from({ length: dimension }, () => 0);
  pool[index] = created;
  return created;
}
