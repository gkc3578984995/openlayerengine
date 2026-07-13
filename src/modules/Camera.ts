import { Coordinate } from 'ol/coordinate.js';
import View from 'ol/View.js';

/**
 * 相机模块：封装与视图（View）相关的平移 / 缩放 / 飞行动画。
 *
 * 从 `Earth` 中拆分而来，便于单独测试与复用。`Earth` 通过组合持有该实例并对外委托调用。
 */
export default class Camera {
  constructor(
    private readonly view: View,
    /** 获取"home"中心点（随 Earth.center 变化） */
    private readonly getHome: () => number[]
  ) {}

  /** 默认飞行动画时长（ms） */
  static readonly DEFAULT_DURATION = 2000;
  /** 默认 home 缩放等级 */
  static readonly HOME_ZOOM = 4;

  /**
   * 移动相机到默认位置
   */
  flyHome(duration: number = Camera.DEFAULT_DURATION): void {
    this.view.animate({
      center: this.getHome(),
      zoom: Camera.HOME_ZOOM,
      duration
    });
  }

  /**
   * 移动相机到指定位置(动画)
   * @param position 位置
   * @param zoom 缩放，缺省时保持当前
   * @param duration 动画时间(毫秒)，缺省 2000
   */
  animateFlyTo(position: Coordinate, zoom?: number, duration?: number): void {
    this.view.animate({
      center: position,
      zoom: zoom ?? this.view.getZoom(),
      duration: duration ?? Camera.DEFAULT_DURATION
    });
  }

  /**
   * 移动相机到指定位置(无动画)
   * @param position 位置
   * @param zoom 缩放
   */
  flyTo(position: Coordinate, zoom?: number): void {
    this.view.setCenter(position);
    if (zoom) this.view.setZoom(zoom);
  }
}
