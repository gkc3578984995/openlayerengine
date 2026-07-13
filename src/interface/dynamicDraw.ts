import { IPlotEditEventPayload } from '../extends/plot/plotEdit.js';
import Feature from 'ol/Feature.js';
import { Coordinate } from 'ol/coordinate.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import { IGeometryFill, IStroke } from './default.js';

export enum DrawType {
  /**
   * 绘制开始
   */
  Drawstart = 'drawstart',
  /**
   * 绘制中
   */
  Drawing = 'drawing',
  /**
   * 绘制完成
   */
  Drawend = 'drawend',
  /**
   * 绘制中点击
   */
  DrawingClick = 'drawingClick',
  /**
   * 退出绘制
   */
  Drawexit = 'drawexit'
}
export enum ModifyType {
  /**
   * 修改中
   */
  Modifying = 'modifying',
  /**
   * 退出修改
   */
  Modifyexit = 'modifyexit'
}
export interface IDrawBase {
  /**
   * 保留绘制图像。默认为true
   */
  keepGraphics?: boolean;
  /**
   * 回调函数
   */
  callback?: (event: IDrawEvent) => void;
}
export interface IDrawEvent {
  /**
   * 绘制类型
   */
  type: DrawType;
  /**
   * 事件发生坐标
   */
  eventPosition: Coordinate | Coordinate[];
  /**
   * 元素坐标
   */
  featurePosition?: Coordinate | Coordinate[];
  /**
   * 元素
   */
  feature?: Feature<Geometry>;
  /**
   * 元素控制点
   */
  ctlPoints?: Coordinate[];
  /**
   * 点中心 仅circle有效
   */
  center?: Coordinate;
  /**
   * 点半径 仅circle有效
   */
  radius?: number;
}
export interface IModifyEvent {
  /**
   * 修改类型
   */
  type: ModifyType;
  /**
   * 元素坐标
   */
  position?: Coordinate | Coordinate[];
  /**
   * plot编辑回调
   */
  plotParam?: IPlotEditEventPayload;
}
export interface IDrawPoint extends IDrawBase {
  /**
   * 绘制次数。默认为0次：代表重复绘制
   */
  limit?: number;
  /**
   * 大小,默认2
   */
  size?: number;
  /**
   * 填充颜色
   */
  fillColor?: string;
}
export interface IDrawLine extends IDrawBase {
  /** 背景描边，绘制在 stroke 之前。 */
  backgroundStroke?: IStroke;
  /**
   * 边框颜色
   */
  strokeColor?: string;
  /**
   * 边框大小
   */
  strokeWidth?: number;
}
export interface IDrawPolygon extends IDrawBase {
  /** 背景描边，绘制在 stroke 之前。 */
  backgroundStroke?: IStroke;
  /**
   * 边框颜色
   */
  strokeColor?: string;
  /**
   * 边框大小
   */
  strokeWidth?: number;
  /**
   * 填充颜色
   */
  fillColor?: string;
  /**
   * Polygon 填充样式，优先于 fillColor
   */
  fill?: IGeometryFill;
}
export interface IEditParam {
  /**
   * 元素
   */
  feature: Feature<Geometry>;
  /**
   * 是否显示参考底图，默认false
   */
  isShowUnderlay?: boolean;
  /**
   * 回调函数
   */
  callback?: (e: IModifyEvent) => void;
}
