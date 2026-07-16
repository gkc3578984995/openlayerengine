import type { Coordinate } from '../common/types.js';

export interface MeasurementSegment {
  /** 线段起点，使用当前 View 投影。 */
  readonly start: Coordinate;
  /** 线段终点，使用当前 View 投影。 */
  readonly end: Coordinate;
  /** 转换后的地理起点。 */
  readonly startGeographic: Coordinate;
  /** 转换后的地理终点。 */
  readonly endGeographic: Coordinate;
  /** 建议显示测量结果的位置。 */
  readonly anchor: Coordinate;
  /** 距离，单位为米。 */
  readonly meters: number;
}

export interface LineMeasurement {
  /** 总距离，单位为米。 */
  readonly meters: number;
  /** 建议显示总结果的位置。 */
  readonly anchor: Coordinate;
  /** 各线段的测量结果。 */
  readonly segments: readonly MeasurementSegment[];
}

export interface SurfaceMeasurement {
  /** 面积，单位为平方米。 */
  readonly squareMeters: number;
  /** 建议显示面积结果的位置。 */
  readonly anchor: Coordinate;
  /** 转换后的地理顶点。 */
  readonly verticesGeographic: readonly Coordinate[];
}

export interface MeasurementPort {
  /** 计算线段或路径长度。 */
  measureLine(coordinates: readonly Coordinate[], mode: 'path' | 'radial'): LineMeasurement | undefined;
  /** 计算多边形面积。 */
  measureArea(ring: readonly Coordinate[]): SurfaceMeasurement | undefined;
}
