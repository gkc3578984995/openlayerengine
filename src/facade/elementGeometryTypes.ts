import type { Coordinate } from '../core/common/types.js';

/** 当前 View 投影坐标中纯 Shape 几何的二维外接矩形，顺序为 `[minX, minY, maxX, maxY]`。 */
export type MapExtent = readonly [minX: number, minY: number, maxX: number, maxY: number];

/** Element 最新已提交 Shape 状态解析出的完整静态渲染几何判别联合。 */
export type ElementRenderGeometry =
  | {
      /** 点几何判别字段。 */
      readonly type: 'point';
      /** 点所在的位置。 */
      readonly coordinates: Coordinate;
    }
  | {
      /** 折线几何判别字段。 */
      readonly type: 'polyline';
      /** 折线的完整有序顶点。 */
      readonly coordinates: readonly Coordinate[];
    }
  | {
      /** 多边形几何判别字段。 */
      readonly type: 'polygon';
      /** 多边形的全部坐标环。 */
      readonly coordinates: readonly (readonly Coordinate[])[];
    }
  | {
      /** 圆几何判别字段。 */
      readonly type: 'circle';
      /** 圆在当前 View 投影中的中心。 */
      readonly center: Coordinate;
      /** 圆在当前 View 投影单位中的渲染半径。 */
      readonly radius: number;
    };

/** Element 完整静态渲染几何、当前 View 投影范围及统一控制参数。 */
export interface ElementGeometryDetails {
  /** 从最新已提交 Shape 状态派生的完整静态渲染几何；Circle 的 radius 使用 View 投影单位。 */
  readonly renderGeometry: ElementRenderGeometry;
  /** 裸渲染几何的二维外接矩形，不包含样式、动画、交互预览或 world-wrap 展示副本。 */
  readonly extent: MapExtent;
  /** `extent` 的四个二维角点，顺序为左下、右下、右上、左上。 */
  readonly extentPoints: readonly [
    lowerLeft: readonly [number, number],
    lowerRight: readonly [number, number],
    upperRight: readonly [number, number],
    upperLeft: readonly [number, number]
  ];
  /** 最终渲染坐标的统一分组；Point、Polyline、Polygon 分别返回点组、路径组和 rings，Circle 返回空数组。 */
  readonly rangePoints: readonly (readonly Coordinate[])[];
  /** 最新已提交的规范控制点；Circle 不使用控制点，因此返回 `null`。 */
  readonly controlPoints: readonly Coordinate[] | null;
  /** Circle 在当前 View 投影中的圆心；其他 Shape 返回 `null`。 */
  readonly center: Coordinate | null;
  /** Circle 的米制业务半径和当前 View 投影半径；其他 Shape 返回 `null`。 */
  readonly radius: Readonly<{
    /** 规范 Element 状态中的业务半径，单位为米。 */
    readonly meters: number;
    /** 当前 View 投影单位下的渲染半径。 */
    readonly projected: number;
  }> | null;
}
