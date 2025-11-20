/**
 * 三角形
 */
import { Map } from 'ol';
import { Polygon } from 'ol/geom';
import * as PlotUtils from '../utils';
import { EPlotType } from '@/enum';
import { IPlotAssembleData } from '@/interface';

class TrianglePolygon extends Polygon {
  private type: EPlotType;
  private map: any;
  private points: PlotUtils.Point[] = [];
  public fixPointCount: number; // 固定为3个点
  public assembleData: IPlotAssembleData | undefined;

  constructor(coordinates: any, points: any, params: any) {
    super([]);
    this.type = EPlotType.TrianglePolygon;
    this.fixPointCount = 3;
    this.set('params', params);
    if (points && points.length > 0) {
      this.setPoints(points);
    } else if (coordinates && coordinates.length > 0) {
      this.setCoordinates(coordinates);
    }
  }

  /** 获取标绘类型 */
  getPlotType() {
    return this.type;
  }

  /** 执行动作 */
  generate() {
    const count = this.getPointCount();
    if (count < 1) return false;
    if (count === 1) {
      // 单点不生成面
      this.setCoordinates([]);
    } else if (count === 2) {
      // 两点阶段：显示两点的折线，用于动态预览
      this.setCoordinates([this.points]);
    } else {
      // 三点生成闭合三角形
      const [p1, p2, p3] = this.getPoints();
      this.setCoordinates([[p1, p2, p3, p1]]);
    }
  }

  /** 设置地图对象 */
  setMap(map: any) {
    if (map && map instanceof Map) {
      this.map = map;
    } else {
      throw new Error('传入的不是地图对象！');
    }
  }

  /** 获取当前地图对象 */
  getMap() {
    return this.map;
  }

  /** 判断是否是Plot */
  isPlot() {
    return true;
  }

  /** 设置坐标点 */
  setPoints(value: any) {
    this.points = !value ? [] : value;
    if (this.points.length >= 1) {
      this.generate();
    }
  }

  /** 获取坐标点 */
  getPoints() {
    return this.points.slice(0);
  }

  /** 获取点数量 */
  getPointCount() {
    return this.points.length;
  }

  /** 更新当前坐标 */
  updatePoint(point: any, index: any) {
    if (index >= 0 && index < this.points.length) {
      this.points[index] = point;
      this.generate();
    }
  }

  /** 更新最后一个坐标 */
  updateLastPoint(point: any) {
    this.updatePoint(point, this.points.length - 1);
  }

  /** 结束绘制 */
  finishDrawing() { }
}

export default TrianglePolygon;
