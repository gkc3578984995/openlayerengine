/**
 * 正三角形（等边三角形）
 * 交互：固定点数量为2，用户点击两点确定底边，自动计算第三点生成闭合等边三角形。
 * params 可支持：{ orientation?: 1 | -1 }  // 控制第三点在底边法线方向，默认 1（左旋或上方）
 */
import { Map } from 'ol';
import { Polygon } from 'ol/geom';
import * as PlotUtils from '../utils';
import { EPlotType } from '@/enum';
import { IPlotAssembleData } from '@/interface';

class EquilateralTrianglePolygon extends Polygon {
  private type: EPlotType;
  private map: any;
  private points: PlotUtils.Point[] = []; // 存储用户输入的底边两个点
  public fixPointCount: number; // 固定为2个点
  public assembleData: IPlotAssembleData | undefined;
  private orientation: 1 | -1; // 控制第三点方向

  constructor(coordinates: any, points: any, params: any = {}) {
    super([]);
    this.type = EPlotType.EquilateralTrianglePolygon;
    this.fixPointCount = 2;
    this.orientation = params.orientation === -1 ? -1 : 1;
    this.set('params', params);
    if (points && points.length > 0) {
      this.setPoints(points);
    } else if (coordinates && coordinates.length > 0) {
      this.setCoordinates(coordinates);
    }
  }

  /** 获取标绘类型 */
  getPlotType() { return this.type; }

  /** 执行动作 */
  generate() {
    const count = this.getPointCount();
    if (count < 1) return false;
    if (count === 1) {
      // 单点不生成面
      this.setCoordinates([]);
    } else if (count === 2) {
      const [p1, p2] = this.getPoints();
      // 如果两点重合则不生成
      if (PlotUtils.MathDistance(p1, p2) < PlotUtils.ZERO_TOLERANCE) {
        this.setCoordinates([]);
        return false;
      }
      // 计算第三点：底边向量与其法向（单位向量）
      const vx = p2[0] - p1[0];
      const vy = p2[1] - p1[1];
      const len = Math.sqrt(vx * vx + vy * vy);
      const ux = vx / len;
      const uy = vy / len;
      // 法向（逆时针旋转90度）：(-uy, ux); 顺时针则 (uy, -ux)
      const nx = this.orientation === 1 ? -uy : uy;
      const ny = this.orientation === 1 ? ux : -ux;
      // 高度 h = (sqrt(3)/2) * a
      const h = (Math.sqrt(3) / 2) * len;
      const midX = (p1[0] + p2[0]) / 2;
      const midY = (p1[1] + p2[1]) / 2;
      const p3: PlotUtils.Point = [midX + nx * h, midY + ny * h];
      this.setCoordinates([[p1, p2, p3, p1]]);
    }
  }

  /** 设置地图对象 */
  setMap(map: any) {
    if (map && map instanceof Map) { this.map = map; } else { throw new Error('传入的不是地图对象！'); }
  }
  /** 获取当前地图对象 */
  getMap() { return this.map; }
  /** 判断是否是Plot */
  isPlot() { return true; }

  /** 设置坐标点 */
  setPoints(value: any) {
    this.points = !value ? [] : value.slice(0, 2); // 只保留前两个点
    if (this.points.length >= 1) { this.generate(); }
  }
  /** 获取坐标点 */
  getPoints() { return this.points.slice(0); }
  /** 获取点数量 */
  getPointCount() { return this.points.length; }

  /** 更新当前坐标 */
  updatePoint(point: any, index: any) {
    if (index >= 0 && index < this.points.length) { this.points[index] = point; this.generate(); }
  }
  /** 更新最后一个坐标 */
  updateLastPoint(point: any) { this.updatePoint(point, this.points.length - 1); }
  /** 结束绘制 */
  finishDrawing() { }
}

export default EquilateralTrianglePolygon;
