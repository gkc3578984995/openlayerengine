import { FEATURE_KEYS, Utils } from '../common';
import type Earth from '../Earth';
import type { IPolygonParam, ISetPolygonParam } from '../interface';
import { Feature } from 'ol';
import { Polygon } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Style } from 'ol/style';
import Base from './Base';
import { Coordinate } from 'ol/coordinate';
import { resolveEarth } from '../earthContext';
import { createPatternFill, isPatternFill } from '../common/PatternFill';

/**
 * 创建区域`Polygon`
 */
export default class PolygonLayer<T = Polygon> extends Base {
  /**
   * 构造器
   * @param earth 地图实例
   * @example
   * ```
   * const polygonLayer = new PolygonLayer(useEarth());
   * ```
   */
  constructor(earth?: Earth, options?: { wrapX?: boolean; register?: boolean }) {
    // 增加 wrapX 可配置（编辑模式下需要关闭以避免多世界复制导致交互命中失败）
    const layer = new VectorLayer({
      source: new VectorSource({
        wrapX: options?.wrapX !== undefined ? options.wrapX : true
      })
    });
    const e = resolveEarth(earth);
    super(e, layer, 'Polygon', options);
  }
  /**
   * 创建矢量元素
   * @param param 详细参数，详见{@link IPolygonParam}
   * @returns 返回`Feature<Polygon>`实例
   */
  private createFeature(param: IPolygonParam<T>): Feature<Polygon> {
    const feature = new Feature({
      geometry: new Polygon(param.positions)
    });
    this.applyPolygonStyle(feature, param);
    this.bindFeature(feature, param, 'Polygon');
    return feature;
  }

  /** 根据声明式参数完整重建 Polygon 样式 */
  private applyPolygonStyle(feature: Feature<Polygon>, param: IPolygonParam<T>): void {
    let style = new Style();
    if (isPatternFill(param.fill)) {
      style.setFill(new Fill({ color: createPatternFill(param.fill, param.stroke?.color) }));
    } else {
      style = super.setFill(style, param.fill);
    }
    style = this.applyText(style, param.label, feature);
    feature.setStyle(this.setLayeredStroke(style, param.stroke, param.backgroundStroke));
  }
  /**
   * 添加多边形
   * @param param 详细参数，详见{@link IPolygonParam}
   * @returns 返回`Feature<Polygon>`实例
   * @example
   * ```
   * const polygonLayer = new PolygonLayer(useEarth());
   * polygonLayer.add({
   *  // ...
   * })
   * ```
   */
  add(param: IPolygonParam<T>): Feature<Polygon> {
    param.id = param.id || Utils.GetGUID();
    const feature = this.createFeature(param);
    return <Feature<Polygon>>super.save(feature);
  }
  /**
   * 修改多边形
   * @param param 详细参数，详见{@link ISetPolygonParam}
   * @returns 返回`Feature<Polygon>`实例数组
   * @example
   * ```
   * const polygonLayer = new PolygonLayer(useEarth());
   * polygonLayer.set({
   *  // ...
   * })
   * ```
   */
  set(param: ISetPolygonParam): Feature<Polygon>[] {
    const features = <Feature<Polygon>[]>super.get(param.id);
    if (features[0] == undefined) {
      console.warn('没有找到元素，请检查ID');
      return [];
    }
    if (param.positions) {
      features[0].getGeometry()?.setCoordinates(param.positions);
    }
    const feature = features[0];
    const stored = feature.get(FEATURE_KEYS.param) as IPolygonParam<T>;
    const nextFill = isPatternFill(param.fill) ? { ...(isPatternFill(stored.fill) ? stored.fill : {}), ...param.fill } : (param.fill ?? stored.fill);
    const next: IPolygonParam<T> = {
      ...stored,
      positions: param.positions ?? stored.positions,
      stroke: param.stroke ? { ...stored.stroke, ...param.stroke } : stored.stroke,
      backgroundStroke: param.backgroundStroke ? { ...stored.backgroundStroke, ...param.backgroundStroke } : stored.backgroundStroke,
      fill: nextFill,
      label: param.label ? { ...stored.label, ...param.label } : stored.label
    };
    feature.set(FEATURE_KEYS.param, next);
    this.applyPolygonStyle(feature, next);
    return features;
  }
  /**
   * 修改多边形
   * @param id `polygon`id
   * @param position 坐标
   * @returns 返回`Feature<Polygon>`实例数组
   * @example
   * ```
   * const polygonLayer = new PolygonLayer(useEarth());
   * polygonLayer.setPosition("polygon_2", [[fromLonLat([100, 50]), fromLonLat([130, 30]), fromLonLat([140, 30]), fromLonLat([140, 50])]]);
   * ```
   */
  setPosition(id: string, position: Coordinate[][]): Feature<Polygon>[] {
    const features = <Feature<Polygon>[]>super.get(id);
    if (features[0] == undefined) {
      console.warn('没有找到元素，请检查ID');
      return [];
    }
    features[0].getGeometry()?.setCoordinates(position);
    return features;
  }
}
