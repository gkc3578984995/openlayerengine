import Earth from 'Earth';
import { IBillboardParam, ISetBillboardParam } from '../interface';
import { IconOrigin, IconAnchorUnits } from 'ol/style/Icon';
import { Point } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Icon, Style } from 'ol/style';
import Base from './Base';
import { Utils } from '../common';
import { Coordinate } from 'ol/coordinate';
import { useEarth } from '../useEarth';
import { Feature } from 'ol';

/**
 * 创建广告牌`Billboard`
 */
export default class BillboardLayer<T = Point> extends Base {
  /**
   * 构造器
   * @param earth 地图实例
   * @example
   * ```
   * const billboardLayer = new  BillboardLayer(useEarth());
   * ```
   */
  constructor(earth?: Earth, options?: { wrapX?: boolean }) {
    const layer = new VectorLayer({
      source: new VectorSource({
        wrapX: options?.wrapX !== undefined ? options.wrapX : true
      })
    });
    const e = earth ?? useEarth();
    super(e, layer, 'Billboard');
  }
  /**
   * 创建矢量元素
   * @param param 广告牌详细参数，详见{@link IBillboardParam}
   * @returns 返回`Feature<Point>`矢量元素
   */
  private createFeature(param: IBillboardParam<T>): Feature<Point> {
    const feature = new Feature({
      geometry: new Point(param.center)
    });
    const icon = new Icon({
      src: param.src,
      size: param.size,
      color: param.color,
      displacement: this.compensateDisplacement(param.displacement, param.rotation),
      scale: param.scale,
      rotation: Utils.deg2rad(param.rotation || 0),
      anchor: param.anchor,
      anchorOrigin: param.anchorOrigin,
      anchorXUnits: param.anchorXUnits,
      anchorYUnits: param.anchorYUnits
    });
    let style = new Style();
    style = this.applyText(style, param.label, feature);
    style.setImage(icon);
    feature.setStyle(style);
    this.bindFeature(feature, param, 'Billboard');
    // 记录屏幕空间偏移（未补偿），供 set() 只传 rotation 时重新补偿使用
    feature.set('screenDisplacement', param.displacement ? param.displacement.slice() : [0, 0]);
    return feature;
  }
  /**
   * 将屏幕空间偏移补偿为 OL Icon 本地坐标系的 displacement，
   * 使图标位移方向不受 rotation 影响（始终满足"正值向右、向上"的契约）。
   *
   * @param screenDisp 屏幕空间偏移，默认 [0, 0]（dx 向右、dy 向上为正）
   * @param rotationDeg 旋转角度（度，顺时针为正）
   * @returns 传入 OL Icon 的本地坐标系 displacement
   */
  private compensateDisplacement(screenDisp: number[] | undefined, rotationDeg: number | undefined): number[] {
    const sx = screenDisp ? screenDisp[0] : 0;
    const sy = screenDisp ? screenDisp[1] : 0;
    if (!sx && !sy) return [0, 0];
    return this.compensateOffset(sx, sy, Utils.deg2rad(rotationDeg || 0));
  }
  /**
   * 创建广告牌`Billboard`
   * @param param 广告牌详细参数，详见{@link IBillboardParam}
   * @returns 返回`Feature<Point>`矢量元素
   * @example
   * ```
   * const billboardLayer = new  BillboardLayer(useEarth());
   * billboardLayer.add({
   *  // ...
   * })
   * ```
   */
  add(param: IBillboardParam<T>): Feature<Point> {
    param.id = param.id || Utils.GetGUID();
    const feature = this.createFeature(param);
    return <Feature<Point>>super.save(feature);
  }
  /**
   * 修改广告牌`Billboard`
   * @param param 广告牌详细参数，详见{@link ISetBillboardParam}
   * @returns 返回修改后的`Feature<Point>`矢量元素
   * @example
   * ```
   * const billboardLayer = new  BillboardLayer(useEarth());
   * billboardLayer.set({
   *  // ...
   * })
   * ```
   */
  set(param: ISetBillboardParam): Feature<Point>[] {
    const features = <Feature<Point>[]>super.get(param.id);
    if (param.center) {
      this.setPosition(param.id, param.center);
    }
    if (features[0] == undefined) {
      console.warn('没有找到元素，请检查ID');
      return [];
    }
    const style = <Style>features[0].getStyle();
    const oldIcon = <Icon>style.getImage();
    // rotation: 允许 0；只有 undefined / null 才回退旧值
    const nextRotationDeg = param.rotation !== undefined && param.rotation !== null ? param.rotation : undefined;
    const resolvedRotation = nextRotationDeg !== undefined ? Utils.deg2rad(nextRotationDeg) : oldIcon.getRotation();
    const resolvedRotationDeg = nextRotationDeg !== undefined ? nextRotationDeg : Utils.rad2deg(oldIcon.getRotation());
    // 屏幕空间偏移：优先用传入值，否则回退已存储的屏幕空间偏移（不能用 oldIcon.getDisplacement()，那是已补偿过的本地值）
    const oldScreenDisp = <number[] | undefined>features[0].get('screenDisplacement');
    const screenDisp = param.displacement !== undefined && param.displacement !== null
      ? param.displacement
      : (oldScreenDisp || [0, 0]);
    // size 必须是数组（宽高），否则使用旧值
    const nextSize: [number, number] | undefined = Array.isArray(param.size)
      ? (param.size as [number, number])
      : (oldIcon.getSize() as [number, number] | undefined);
    interface IIconOptions {
      src?: string;
      size?: [number, number];
      color?: string | import('ol/color').Color;
      displacement?: number[];
      scale?: number | number[];
      rotation?: number;
      anchor?: number[];
      anchorOrigin?: IconOrigin;
      anchorXUnits?: IconAnchorUnits;
      anchorYUnits?: IconAnchorUnits;
    }
    // anchor 规则：如果调用者未显式传入 anchor（undefined / null），强制回退 [0.5,0.5]（fraction 默认）
    // 这样在撤销回到初始快照时不会意外复用内部像素锚点（出现 [128,128] 等错误值）
    const anchorProvided = param.anchor !== undefined && param.anchor !== null;
    const iconOptions: IIconOptions = {
      src: param.src || oldIcon.getSrc(),
      size: nextSize,
      color: param.color || oldIcon.getColor(),
      displacement: this.compensateDisplacement(screenDisp, resolvedRotationDeg),
      scale: param.scale || oldIcon.getScale(),
      rotation: resolvedRotation,
      anchor: anchorProvided ? param.anchor : [0.5, 0.5]
    };
    // 清理 undefined 字段（手动列出避免索引签名）
    if (iconOptions.src == null) delete iconOptions.src;
    if (iconOptions.size == null) delete iconOptions.size;
    if (iconOptions.color == null) delete iconOptions.color;
    if (iconOptions.displacement == null) delete iconOptions.displacement;
    if (iconOptions.scale == null) delete iconOptions.scale;
    if (iconOptions.rotation == null) delete iconOptions.rotation;
    if (iconOptions.anchor == null) delete iconOptions.anchor;
    if (iconOptions.anchorOrigin == null) delete iconOptions.anchorOrigin;
    if (iconOptions.anchorXUnits == null) delete iconOptions.anchorXUnits;
    if (iconOptions.anchorYUnits == null) delete iconOptions.anchorYUnits;
    const newIcon = new Icon(iconOptions);
    // 文本偏移旋转补偿（屏幕方向为准），公共偏移存于 feature 的 labelOffset
    this.applyText(style, param.label, features[0]);
    style.setImage(newIcon);
    features[0].setStyle(style);
    // 同步屏幕空间偏移，供下一次 set() 重新补偿使用
    features[0].set('screenDisplacement', screenDisp.slice());
    return features;
  }
  /**
   * 修改广告牌坐标位置
   * @param id 广告牌ID
   * @param position 位置信息
   * @returns 返回修改后的`Feature<Point>`矢量元素
   * @example
   * ```
   * const billboardLayer = new  BillboardLayer(useEarth());
   * billboardLayer.setPosition("billboard_1", fromLonLat([160, 60]));
   * ```
   */
  setPosition(id: string, position: Coordinate): Feature<Point>[] {
    const features = <Feature<Point>[]>super.get(id);
    if (features[0] == undefined) {
      console.warn('没有找到元素，请检查ID');
      return [];
    }
    const geometry = <Point>features[0].getGeometry();
    geometry.setCoordinates(position);
    return features;
  }
  /**
   * 计算广告牌(Point)图标在地图上的经纬度范围
   * @param feature 广告牌要素
   * @returns [minLon, minLat, maxLon, maxLat]
   */
  getIconExtent(feature: Feature<Point>): [number, number, number, number] | null {
    const map = useEarth().map;
    const style = feature.getStyle() as Style;
    const icon = style.getImage() as Icon;
    if (!icon || !icon.getSize()) return null;

    const center = (feature.getGeometry() as Point).getCoordinates();
    const sizeRaw = icon.getSize();
    if (!sizeRaw) return null;
    const size: [number, number] = [sizeRaw[0], sizeRaw[1]];
    const iconScale = icon.getScale();
    const scale: [number, number] = Array.isArray(iconScale)
      ? [iconScale[0] || 1, iconScale[1] || 1]
      : [(iconScale as number) || 1, (iconScale as number) || 1];
    const anchor = icon.getAnchor() || [0, 0];
    const displacement = icon.getDisplacement() || [0, 0];

    // 计算像素四角相对中心的偏移
    const w = size[0] * scale[0];
    const h = size[1] * scale[1];
    const anchorPx = [anchor[0], anchor[1]];
    // 以左上为(0,0)，anchor为图标锚点像素
    const offsets = [
      [-anchorPx[0], -anchorPx[1]], // 左上
      [w - anchorPx[0], -anchorPx[1]], // 右上
      [w - anchorPx[0], h - anchorPx[1]], // 右下
      [-anchorPx[0], h - anchorPx[1]] // 左下
    ].map(([dx, dy]) => [dx + displacement[0], dy + displacement[1]]);

    // 中心点转像素
    const centerPx = map.getPixelFromCoordinate(center);

    // 四角像素转经纬度
    const corners = offsets.map(([dx, dy]) => {
      const px = [centerPx[0] + dx, centerPx[1] + dy];
      return map.getCoordinateFromPixel(px);
    });

    // 计算经纬度范围
    const lons = corners.map((c) => c[0]);
    const lats = corners.map((c) => c[1]);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  }
}
