import type { Coordinate } from '../common/types.js';

/** 内部接口。约定 MeasurementSegment 使用的数据和操作。 */
export interface MeasurementSegment {
  /** 起点。保存线段开始坐标。 */
  readonly start: Coordinate;
  /** 终点。保存线段结束坐标。 */
  readonly end: Coordinate;
  /** 地理起点。保存转换后的起点坐标。 */
  readonly startGeographic: Coordinate;
  /** 地理终点。保存转换后的终点坐标。 */
  readonly endGeographic: Coordinate;
  /** 锚点。保存结果建议显示的位置。 */
  readonly anchor: Coordinate;
  /** 长度。保存以米为单位的距离。 */
  readonly meters: number;
}

/** 内部接口。约定 LineMeasurement 使用的数据和操作。 */
export interface LineMeasurement {
  /** 长度。保存以米为单位的距离。 */
  readonly meters: number;
  /** 锚点。保存结果建议显示的位置。 */
  readonly anchor: Coordinate;
  /** 线段。保存各段测量结果。 */
  readonly segments: readonly MeasurementSegment[];
}

/** 内部接口。约定 SurfaceMeasurement 使用的数据和操作。 */
export interface SurfaceMeasurement {
  /** 面积。保存以平方米为单位的面积。 */
  readonly squareMeters: number;
  /** 锚点。保存结果建议显示的位置。 */
  readonly anchor: Coordinate;
  /** 地理顶点。保存转换后的面坐标。 */
  readonly verticesGeographic: readonly Coordinate[];
}

/** 内部接口。约定 MeasurementPort 使用的数据和操作。 */
export interface MeasurementPort {
  /** 计算线段或路径长度。 */
  measureLine(coordinates: readonly Coordinate[], mode: 'path' | 'radial'): LineMeasurement | undefined;
  /** 计算多边形面积。 */
  measureArea(ring: readonly Coordinate[]): SurfaceMeasurement | undefined;
}
