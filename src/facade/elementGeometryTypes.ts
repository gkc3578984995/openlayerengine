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

/** Element 完整静态渲染几何及其当前 View 投影地图坐标范围。 */
export interface ElementGeometryDetails {
  /** 从最新已提交 Shape 状态派生的完整静态渲染几何；Circle 的 radius 使用 View 投影单位。 */
  readonly renderGeometry: ElementRenderGeometry;
  /** 裸渲染几何的二维外接矩形，不包含样式、动画、交互预览或 world-wrap 展示副本。 */
  readonly extent: MapExtent;
}
