import { FEATURE_KEYS, Utils } from '../common';
import type Earth from '../Earth';
import { Feature } from 'ol';
import { Circle } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Style } from 'ol/style';
import Base from './Base';
import type { ICircleParam, ISetCircleParam } from '../interface';
import { Coordinate } from 'ol/coordinate';
import { getDefaultEarth } from '../earthContext';
import { createPatternFill, isPatternFill } from '../common/PatternFill';
/**
 * 创建圆`Circle`
 */
export default class CircleLayer<T = Circle> extends Base {
  /**
   * 构造器
   * @param earth 地图实例
   * @example
   * ```
   * const circleLayer = new CircleLayer(useEarth());
   * ```
   */
  constructor(earth?: Earth, options?: { wrapX?: boolean }) {
    const layer = new VectorLayer({
      source: new VectorSource({
        wrapX: options?.wrapX !== undefined ? options.wrapX : true
      })
    });
    const e = earth ?? getDefaultEarth();
    super(e, layer, 'Circle');
  }
  /**
   * 创建矢量元素
   * @param param 圆参数，详见{@link ICircleParam}
   * @returns 返回`Feature<Circle>`矢量元素
   */
  private createFeature(param: ICircleParam<T>): Feature<Circle> {
    const feature = new Feature({
      geometry: new Circle(param.center, param.radius)
    });
    this.applyCircleStyle(feature, param);
    this.bindFeature(feature, param, 'Circle');
    return feature;
  }

  /** 根据声明式参数完整重建 Circle 样式 */
  private applyCircleStyle(feature: Feature<Circle>, param: ICircleParam<T>): void {
    let style = new Style();
    style = super.setStroke(style, param.stroke);
    if (isPatternFill(param.fill)) {
      style.setFill(new Fill({ color: createPatternFill(param.fill, param.stroke?.color) }));
    } else {
      style = super.setFill(style, param.fill);
    }
    style = this.applyText(style, param.label, feature);
    feature.setStyle(style);
  }
  /**
   * 创建一个圆形
   * @param param 圆详细参数，详见{@link ICircleParam}
   * @returns 返回`Feature<Circle>`矢量元素
   * @example
   * ```
   * const circleLayer = new CircleLayer(useEarth());
   * circleLayer.add({
   *  // ...
   * })
   * ```
   */
  add(param: ICircleParam<T>): Feature<Circle> {
    param.id = param.id || Utils.GetGUID();
    const feature = this.createFeature(param);
    return <Feature<Circle>>super.save(feature);
  }
  /**
   * 修改圆
   * @param param  圆参数，详见{@link ISetCircleParam}
   * @returns 返回`Feature<Circle>`矢量元素
   * @example
   * ```
   * const circleLayer = new CircleLayer(useEarth());
   * circleLayer.set({
   *  // ...
   * })
   * ```
   */
  set(param: ISetCircleParam): Feature<Circle>[] {
    const features = <Feature<Circle>[]>super.get(param.id);
    if (features[0] == undefined) {
      console.warn('没有找到元素，请检查ID');
      return [];
    }
    const feature = features[0];
    const stored = feature.get(FEATURE_KEYS.param) as ICircleParam<T>;
    const nextFill = isPatternFill(param.fill)
      ? { ...(isPatternFill(stored.fill) ? stored.fill : {}), ...param.fill }
      : param.fill ?? stored.fill;
    const next: ICircleParam<T> = {
      ...stored,
      center: param.center ?? stored.center,
      radius: param.radius ?? stored.radius,
      stroke: param.stroke ? { ...stored.stroke, ...param.stroke } : stored.stroke,
      fill: nextFill,
      label: param.label ? { ...stored.label, ...param.label } : stored.label
    };
    if (param.center) {
      this.setPosition(param.id, param.center);
    }
    if (param.radius !== undefined) {
      feature.getGeometry()?.setRadius(param.radius);
    }
    feature.set(FEATURE_KEYS.param, next);
    this.applyCircleStyle(feature, next);
    return features;
  }
  /**
   * 修改圆坐标位置
   * @param id 圆id
   * @param position 圆位置
   * @returns 返回`Feature<Circle>`矢量元素
   * @example
   * ```
   * const circleLayer = new CircleLayer(useEarth());
   * circleLayer.setPosition("circle_2", fromLonLat([120, 45]));
   * ```
   */
  setPosition(id: string, position: Coordinate): Feature<Circle>[] {
    const features = <Feature<Circle>[]>super.get(id);
    if (features[0] == undefined) {
      console.warn('没有找到元素，请检查ID');
      return [];
    }
    const geometry = <Circle>features[0].getGeometry();
    geometry.setCenter(position);
    return features;
  }
}
