import type Earth from '../Earth';
import { IFill, ILabel, IStroke, IBillboardParam, IPolylineParam, IPolylineFlyParam, IPointParam, ICircleParam, IPolygonParam } from '../interface';
import { Feature } from 'ol';
import { Geometry } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Fill, Text } from 'ol/style';
import Icon from 'ol/style/Icon';
import CircleStyle from 'ol/style/Circle';
import { Utils } from '../common';
import { FEATURE_KEYS, LAYER_TYPE } from '../common/featureKeys';
import { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';
import cloneDeep from 'lodash/cloneDeep';
// import BaseEvent from 'ol/events/Event';
/** 所有图层参数的联合类型（用于 {@link Base.getUpdatedParam} 的返回） */
export type AnyParam =
  IBillboardParam<unknown> | IPolylineParam<unknown> | IPolylineFlyParam<unknown> | IPointParam<unknown> | ICircleParam<unknown> | IPolygonParam<unknown>;

/**
 * 基类，提供图层常见的获取，删除及更新方法
 */
export default class Base {
  /**
   * 注册key
   */
  public registryKey: string;
  /**
   * 销毁标记
   */
  public allowDestroyed: boolean = true;
  /**
   * 图层
   */
  public layer: VectorLayer<VectorSource<Geometry>>;
  /**
   * feature `change` 事件同步 param 的节流间隔(ms)，默认 33（约 30fps）。
   * 拖拽高频变更时控制同步开销；在 add 元素前修改可调节粒度，设为 0 则每次变更立即同步。
   */
  public syncThrottleMs: number = 33;
  /**
   * 缓存featur的集合
   */
  public hideFeatureMap: Map<string, Feature<Geometry>> = new Map();
  /**
   * 元素监听器（key -> change 监听 key 与节流取消函数）
   */
  private featureListenerMap: Map<string, { key: EventsKey; cancel: () => void }> = new Map();
  /**
   * 图层构造类
   * @param earth 地图实例
   * @param layer 图层实例
   */
  constructor(
    protected earth: Earth,
    layer: VectorLayer<VectorSource<Geometry>>,
    type: string
  ) {
    const layerId = Utils.GetGUID();
    this.registryKey = layerId;
    layer.set('type', type);
    layer.set('id', layerId);
    this.layer = layer;
    earth.map.addLayer(layer);
    // 自动注册封装层实例到 Earth（key 为 registryKey，便于通过 earth.getLayer 反查）
    this.earth._autoRegisterLayer(this.registryKey, this);
  }
  /**
   * 设置描边样式
   * @param style style实例
   * @param param 描边参数，`可选的`。详见{@link IStroke}
   * @param width 宽度，`可选的`
   * @returns 返回style实例
   */
  protected setStroke(style: Style, param?: IStroke, width?: number): Style {
    const stroke = new Stroke({
      color: param?.color || style.getStroke()?.getColor() || '#ffcc33',
      width: width || style.getStroke()?.getWidth() || 2,
      lineDash: (param?.lineDash || style.getStroke()?.getLineDash()) ?? undefined,
      ...param
    });
    style.setStroke(stroke);
    return style;
  }
  /**
   * 设置填充样式
   * @param style style实例
   * @param param 填充参数，`可选的`。详见{@link IFill}
   * @returns 返回style实例
   */
  protected setFill(style: Style, param?: IFill): Style {
    const fill = new Fill({
      color: param?.color || style.getFill()?.getColor() || '#ffffff57',
      ...param
    });
    style.setFill(fill);
    return style;
  }
  /**
   * 设置文本样式
   * @param style style实例
   * @param param 文本参数，`可选的`。详见{@link ILabel}
   * @param offsetY 纵向偏移量，`可选的`。
   * @returns 返回style实例
   */
  protected setText(style: Style, param?: ILabel, offsetY?: number): Style {
    const text = new Text({
      text: param?.text || style.getText()?.getText(),
      font: param?.font || style.getText()?.getFont(),
      offsetX: param?.offsetX || style.getText()?.getOffsetX(),
      // offsetY 公共约定为"正值向上"（与 OL 原生"正值向下"相反），写入 OL 时取反
      offsetY: param?.offsetY ? -param.offsetY : offsetY || style.getText()?.getOffsetY(),
      scale: param?.scale || style.getText()?.getScale(),
      textAlign: param?.textAlign || style.getText()?.getTextAlign(),
      textBaseline: param?.textBaseline || style.getText()?.getTextBaseline(),
      rotation: param?.rotation != null ? Utils.deg2rad(param.rotation) : style.getText()?.getRotation(),
      fill: new Fill({
        color: param?.fill?.color || style.getText()?.getFill().getColor()
      }),
      stroke: new Stroke({
        color: param?.stroke?.color || style.getText()?.getStroke().getColor() || '#0000',
        width: param?.stroke?.width || style.getText()?.getStroke().getWidth() || 0
      }),
      backgroundFill: new Fill({
        color: param?.backgroundFill?.color || style.getText()?.getBackgroundFill().getColor() || '#0000'
      }),
      backgroundStroke: new Stroke({
        color: param?.backgroundStroke?.color || style.getText()?.getBackgroundStroke().getColor() || '#0000',
        width: param?.backgroundStroke?.width || style.getText()?.getBackgroundStroke().getWidth() || 0
      }),
      padding: param?.padding || style.getText()?.getPadding() || undefined,
      overflow: true
    });
    style.setText(text);
    return style;
  }
  /**
   * 屏幕空间偏移反向旋转为本地坐标系偏移：`local = R(-rotation) · screen`。
   *
   * OL 会把 displacement / 文本 offset 折叠进 anchor 并随 rotation 绕几何点旋转，
   * 预先反向旋转偏移向量后，偏移方向便始终以屏幕为准（正值向右、向上）。
   *
   * @param sx 屏幕X（向右为正）
   * @param sy 屏幕Y（向上为正）
   * @param rotationRad 旋转弧度（顺时针为正）
   * @returns 本地坐标系偏移 [dx, dy]（同为右/上为正）
   */
  protected compensateOffset(sx: number, sy: number, rotationRad: number): [number, number] {
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);
    return [sx * cos - sy * sin, sx * sin + sy * cos];
  }
  /**
   * 将屏幕空间文本偏移按 label rotation 补偿后写入 Text（OL 本地坐标系）。
   *
   * 文本 offset 公共约定"向上为正"，OL 文本 offsetY"向下为正"，故写入时 Y 取反。
   *
   * @param text 目标 Text 样式
   * @param sx 屏幕X偏移（向右为正）
   * @param sy 屏幕Y偏移（向上为正）
   * @param rotationRad 文本旋转弧度（顺时针为正）
   */
  protected applyCompensatedLabelOffset(text: Text, sx: number, sy: number, rotationRad: number): void {
    const [compX, compY] = this.compensateOffset(sx, sy, rotationRad);
    text.setOffsetX(compX);
    text.setOffsetY(-compY); // OL offsetY 向下为正，公共约定向上为正 → 取反
  }
  /**
   * 读取 feature 上存储的屏幕空间文本偏移（未补偿的公共值）。
   * 文本 offset 已按 rotation 补偿为 OL 本地值，公共值需从此处回读。
   */
  protected getStoredLabelOffset(feature: Feature<Geometry>): { offsetX: number; offsetY: number } | undefined {
    return feature.get(FEATURE_KEYS.labelOffset) as { offsetX: number; offsetY: number } | undefined;
  }
  /**
   * 设置文本样式并按 label rotation 补偿 offset（屏幕方向为准）。
   *
   * 在 {@link setText} 基础上：解析有效公共偏移与有效旋转，重算补偿后的本地偏移并写入 Text，
   * 同时把公共偏移存到 feature 的 `labelOffset`，供下次 set 与快照回读。
   *
   * @param style style 实例
   * @param param 文本参数，`可选的`。详见{@link ILabel}
   * @param feature 所属要素（用于存取屏幕空间偏移）
   * @param internalOffsetY 内部默认纵向偏移（OL 约定，向下为正），仅当用户未提供且无存储时使用
   * @returns 返回 style 实例
   */
  protected applyText(style: Style, param: ILabel | undefined, feature: Feature<Geometry>, internalOffsetY?: number): Style {
    style = this.setText(style, param, internalOffsetY);
    const text = style.getText();
    if (!text) return style;
    const stored = this.getStoredLabelOffset(feature);
    const hasX = param?.offsetX !== undefined && param?.offsetX !== null;
    const hasY = param?.offsetY !== undefined && param?.offsetY !== null;
    const effX = hasX ? (param!.offsetX as number) : (stored?.offsetX ?? 0);
    let effY: number;
    if (hasY) {
      effY = param!.offsetY as number;
    } else if (internalOffsetY !== undefined) {
      // 内部默认偏移（如 Point 的 -(radius+15)）每次按当前几何重算，优先于缓存值
      effY = -internalOffsetY; // OL 向下为正 → 公共向上为正
    } else if (stored) {
      effY = stored.offsetY;
    } else {
      effY = 0;
    }
    // setText 已将 param.rotation（度）转为弧度写入 text，这里直接读回弧度用于补偿
    const effRot = text.getRotation() ?? 0;
    this.applyCompensatedLabelOffset(text, effX, effY, effRot);
    feature.set(FEATURE_KEYS.labelOffset, { offsetX: effX, offsetY: effY });
    return style;
  }
  /**
   * 从 feature.getStyle() 中解析出静态 `Style` 实例。
   * - style 为单个 Style → 直接返回
   * - style 为数组且首元素是 Style → 返回首元素
   * - style 为函数或空 → 返回 undefined（函数样式无法在无 resolution 下安全求值）
   */
  protected resolveStaticStyle(feature: Feature<Geometry>): Style | undefined {
    const styleLike = feature.getStyle();
    if (styleLike instanceof Style) return styleLike;
    if (Array.isArray(styleLike) && styleLike.length && styleLike[0] instanceof Style) return styleLike[0];
    return undefined;
  }
  /**
   * 从一个具备 `getStroke`/`getFill` 的样式对象（Style 或 CircleStyle 等）同步 stroke/fill 到 param。
   * 仅在能取到 color 时覆盖，保留 param 上既有字段作为回退。
   * @param target 具有 getStroke()/getFill() 的对象（如 Style、CircleStyle）
   * @param param 待同步的参数对象（会被原地修改）
   */
  protected syncStrokeFillFromStyle<P extends { stroke?: IStroke; fill?: IFill }>(
    target: { getStroke?: () => Stroke | null; getFill?: () => Fill | null } | undefined,
    param: P
  ): void {
    if (!target) return;
    const stroke = target.getStroke && target.getStroke();
    if (stroke && typeof stroke.getColor === 'function') {
      param.stroke = {
        ...param.stroke,
        color: (stroke.getColor?.() || param.stroke?.color) as string | undefined,
        width: stroke.getWidth?.() || param.stroke?.width,
        lineDash: (stroke.getLineDash?.() || param.stroke?.lineDash) ?? undefined,
        lineDashOffset: stroke.getLineDashOffset?.() || param.stroke?.lineDashOffset
      };
    }
    const fill = target.getFill && target.getFill();
    if (fill && typeof fill.getColor === 'function') {
      const fillColor = fill.getColor();
      if (fillColor) param.fill = { color: fillColor as string };
    }
  }
  /**
   * 从 `Text` 样式构建公共 label 对象（同步到 {@link ILabel}）。
   * 文本 offset 公共值从 feature 的 `labelOffset` 存储回读（已按 rotation 补偿前的屏幕值）。
   * @param text 文本样式，为空时原样返回 prev
   * @param prev 既有 label（作为各字段的回退）
   * @param feature 所属要素（用于读取存储的屏幕空间偏移）
   */
  protected buildLabelFromText(text: Text | undefined, prev: ILabel | undefined, feature: Feature<Geometry>): ILabel | undefined {
    if (!text) return prev;
    const plainText = (() => {
      const t = text.getText?.();
      if (Array.isArray(t)) return t.join('');
      return t || '';
    })();
    const stored = this.getStoredLabelOffset(feature);
    const scale =
      (typeof text.getScale === 'function' ? (Array.isArray(text.getScale()) ? (text.getScale() as number[])[0] : (text.getScale() as number)) : undefined) ||
      prev?.scale;
    const fillFrom = (() => {
      const f = text.getFill && text.getFill();
      if (f && typeof f.getColor === 'function') {
        const c = f.getColor();
        if (c) return { color: c as string };
      }
      return prev?.fill;
    })();
    const strokeFrom = (() => {
      const s = text.getStroke && text.getStroke();
      if (s && typeof s.getColor === 'function') {
        const c = s.getColor();
        const w = typeof s.getWidth === 'function' ? s.getWidth() : undefined;
        return { color: c as string, width: w || prev?.stroke?.width };
      }
      return prev?.stroke;
    })();
    const backgroundFillFrom = (() => {
      const bf = text.getBackgroundFill && text.getBackgroundFill();
      if (bf && typeof bf.getColor === 'function') {
        const c = bf.getColor();
        if (c) return { color: c as string };
      }
      return prev?.backgroundFill;
    })();
    const backgroundStrokeFrom = (() => {
      const bs = text.getBackgroundStroke && text.getBackgroundStroke();
      if (bs && typeof bs.getColor === 'function') {
        const c = bs.getColor();
        const w = typeof bs.getWidth === 'function' ? bs.getWidth() : undefined;
        return { color: c as string, width: w || prev?.backgroundStroke?.width };
      }
      return prev?.backgroundStroke;
    })();
    return {
      text: plainText || prev?.text || '',
      font: text.getFont?.() || prev?.font,
      offsetX: stored?.offsetX ?? prev?.offsetX,
      offsetY: stored?.offsetY ?? prev?.offsetY,
      scale,
      textAlign: text.getTextAlign?.() || prev?.textAlign,
      textBaseline: text.getTextBaseline?.() || prev?.textBaseline,
      rotation: typeof text.getRotation === 'function' && text.getRotation() ? Utils.rad2deg(text.getRotation() ?? 0) : prev?.rotation,
      fill: fillFrom,
      stroke: strokeFrom,
      backgroundFill: backgroundFillFrom,
      backgroundStroke: backgroundStrokeFrom,
      padding: text.getPadding?.() || prev?.padding
    };
  }
  /**
   * 绑定 feature 的公共属性（id / data / module / layerId / layerType / param）。
   * 各图层 createFeature 末尾统一调用，避免重复样板。
   * @param feature 矢量元素
   * @param param 创建参数（须已确保 id）
   * @param layerType 图层类型标识
   */
  protected bindFeature(feature: Feature<Geometry>, param: { id?: string; data?: unknown; module?: string }, layerType: string): void {
    feature.setId(param.id);
    feature.set(FEATURE_KEYS.data, param.data);
    feature.set(FEATURE_KEYS.module, param.module);
    feature.set(FEATURE_KEYS.layerId, this.layer.get('id'));
    feature.set(FEATURE_KEYS.layerType, layerType);
    feature.set(FEATURE_KEYS.param, param);
  }
  /**
   * 往图层添加一个矢量元素
   * @param feature 矢量元素实例
   * @returns 返回矢量元素实例
   */
  protected save(feature: Feature<Geometry>): Feature<Geometry> {
    feature.set(FEATURE_KEYS.registryKey, this.registryKey);
    this.addFeaturelistener(feature);
    this.layer.getSource()?.addFeature(feature);
    return feature;
  }
  /**
   * 添加元素事件监听
   *
   * `change` 事件在拖拽过程中高频触发，对 param 的全量样式同步开销较大，
   * 故对回调做节流（约 30fps）。trailing 保证最终位置一定会同步一次。
   * @param feature 矢量元素实例
   */
  protected addFeaturelistener(feature: Feature<Geometry>): void {
    const handler = () => {
      const layerType = feature.get(FEATURE_KEYS.layerType);
      if (layerType === LAYER_TYPE.Billboard) {
        this.updateBillboardParam(feature);
      } else if (layerType === LAYER_TYPE.Polyline) {
        this.updatePolylineParam(feature);
      } else if (layerType === LAYER_TYPE.Point) {
        this.updatePointParam(feature);
      } else if (layerType === LAYER_TYPE.Circle) {
        this.updateCircleParam(feature);
      } else if (layerType === LAYER_TYPE.Polygon) {
        this.updatePolygonParam(feature);
      }
    };
    // syncThrottleMs <= 0 时跳过节流，每次 change 立即同步
    type Throttled = (() => void) & { cancel?: () => void };
    const throttled: Throttled = this.syncThrottleMs > 0 ? (Utils.throttle(handler, this.syncThrottleMs) as Throttled) : handler;
    const featureChangeListener = feature.on('change', throttled);
    this.featureListenerMap.set(feature.getId() as string, {
      key: featureChangeListener,
      cancel: throttled.cancel ?? (() => void 0)
    });
  }
  /**
   * 更新Billboard图标参数
   */
  protected updateBillboardParam(feature: Feature<Geometry>): void {
    const param = feature.get(FEATURE_KEYS.param) as IBillboardParam<unknown> | undefined;
    if (!param) return;
    // 更新中心点（仅 Point 几何）
    const geometry = feature.getGeometry();
    if (geometry && geometry.getType && geometry.getType() === 'Point') {
      try {
        param.center = (geometry as import('ol/geom').Point).getCoordinates();
      } catch {
        /* 预期异常:几何类型与断言不符时跳过该字段同步，不向上抛出 */
      }
    }
    // 更新图标属性
    const style = this.resolveStaticStyle(feature);
    const icon = style?.getImage() as Icon | undefined;
    if (icon) {
      const src = icon.getSrc();
      if (src) param.src = src;
      const size = icon.getSize();
      if (size) param.size = size;
      const color = icon.getColor();
      if (typeof color === 'string') param.color = color;
      const displacement = <number[] | undefined>feature.get(FEATURE_KEYS.screenDisplacement);
      if (Array.isArray(displacement)) param.displacement = displacement.slice();
      const scaleVal = icon.getScale();
      if (scaleVal) param.scale = scaleVal;
      const rotation = icon.getRotation();
      if (rotation != null) param.rotation = Utils.rad2deg(rotation);
      const anchor = (icon as unknown as { anchor_?: number[] }).anchor_; // 原始 anchor 数组
      if (anchor && Array.isArray(anchor)) param.anchor = anchor as number[];
    }
    // 同步文本标签
    param.label = this.buildLabelFromText(style?.getText(), param.label, feature);
    feature.set(FEATURE_KEYS.param, param);
  }
  /**
   * 更新Polyline参数(仅同步可推导的几何/样式字段)
   * @param feature Polyline要素
   */
  protected updatePolylineParam(feature: Feature<Geometry>): void {
    // 兼容普通 Polyline 与 飞行线 Polyline（IPolylineFlyParam 不继承 IPolylineParam，字段名称也不同: position vs positions）
    const param = feature.get(FEATURE_KEYS.param) as (IPolylineParam<unknown> | IPolylineFlyParam<unknown>) | undefined;
    if (!param) return;
    const isNormalPolyline = (p: IPolylineParam<unknown> | IPolylineFlyParam<unknown>): p is IPolylineParam<unknown> => 'positions' in p;
    const isFlyPolyline = (p: IPolylineParam<unknown> | IPolylineFlyParam<unknown>): p is IPolylineFlyParam<unknown> => 'position' in p && !('positions' in p);
    const geometry = feature.getGeometry();
    if (geometry && geometry.getType && geometry.getType() === 'LineString') {
      try {
        const coords = (geometry as import('ol/geom').LineString).getCoordinates();
        if (isNormalPolyline(param)) param.positions = coords;
        if (isFlyPolyline(param)) param.position = coords as number[][];
      } catch {
        /* 预期异常:几何类型与断言不符时跳过该字段同步，不向上抛出 */
      }
    }
    // 样式同步：仅静态 Style，且仅普通折线（飞行线样式为函数，内部已同步 positions）
    const style = this.resolveStaticStyle(feature);
    if (style && isNormalPolyline(param)) {
      this.syncStrokeFillFromStyle(style, param);
      if (param.stroke?.width && !param.width) param.width = param.stroke.width;
      param.label = this.buildLabelFromText(style.getText(), param.label, feature);
    }
    feature.set(FEATURE_KEYS.param, param);
  }
  /**
   * 更新Point参数(仅同步可推导的几何/样式字段)
   * @param feature Point要素
   */
  protected updatePointParam(feature: Feature<Geometry>): void {
    const param = feature.get(FEATURE_KEYS.param) as IPointParam<unknown> | undefined;
    if (!param) return;
    // 同步几何中心
    const geometry = feature.getGeometry();
    if (geometry && geometry.getType && geometry.getType() === 'Point') {
      try {
        param.center = (geometry as import('ol/geom').Point).getCoordinates();
      } catch {
        /* 预期异常:几何类型与断言不符时跳过该字段同步，不向上抛出 */
      }
    }
    // 样式同步（仅静态 style）
    const style = this.resolveStaticStyle(feature);
    if (style) {
      const image = (style.getImage && style.getImage()) as CircleStyle | undefined;
      if (image) {
        // 半径 -> size
        const r = image.getRadius();
        if (r != null) param.size = r;
        // stroke / fill 同步自 image（CircleStyle）
        this.syncStrokeFillFromStyle(image, param);
      }
      // label 同步
      param.label = this.buildLabelFromText(style.getText(), param.label, feature);
    }
    feature.set(FEATURE_KEYS.param, param);
  }
  /**
   * 更新Circle参数(仅同步可推导的几何/样式字段)
   * @param feature Circle要素
   */
  protected updateCircleParam(feature: Feature<Geometry>): void {
    const param = feature.get(FEATURE_KEYS.param) as ICircleParam<unknown> | undefined;
    if (!param) return;
    const geometry = feature.getGeometry();
    if (geometry && geometry.getType && geometry.getType() === 'Circle') {
      try {
        const circle = geometry as import('ol/geom').Circle;
        param.center = circle.getCenter();
        param.radius = circle.getRadius();
      } catch {
        /* 预期异常:几何类型与断言不符时跳过该字段同步，不向上抛出 */
      }
    }
    // 样式同步（静态样式）
    const style = this.resolveStaticStyle(feature);
    if (style) {
      this.syncStrokeFillFromStyle(style, param);
      param.label = this.buildLabelFromText(style.getText(), param.label, feature);
    }
    feature.set(FEATURE_KEYS.param, param);
  }
  /**
   * 更新Polygon参数(仅同步可推导的几何/样式字段)
   * @param feature Polygon要素
   */
  protected updatePolygonParam(feature: Feature<Geometry>): void {
    const param = feature.get(FEATURE_KEYS.param) as IPolygonParam<unknown> | undefined;
    if (!param) return;
    const geometry = feature.getGeometry();
    if (geometry && geometry.getType && geometry.getType() === 'Polygon') {
      try {
        param.positions = (geometry as import('ol/geom').Polygon).getCoordinates();
      } catch {
        /* 预期异常:几何类型与断言不符时跳过该字段同步，不向上抛出 */
      }
    }
    // 样式同步
    const style = this.resolveStaticStyle(feature);
    if (style) {
      this.syncStrokeFillFromStyle(style, param);
      param.label = this.buildLabelFromText(style.getText(), param.label, feature);
    }
    feature.set(FEATURE_KEYS.param, param);
  }
  /**
   * 根据 feature 计算出最新的 param（不会回写 feature.set(FEATURE_KEYS.param, param)）
   * 使用场景：需要临时获取最新状态用于显示 / 比较 / 自定义撤销等，而不改变要素本身。
   * @param feature 目标要素
   * @returns 复制并更新后的 param；若不存在 param 返回 undefined
   */
  public getUpdatedParam(feature: Feature<Geometry>): AnyParam | undefined {
    if (!feature) return undefined;
    const layerType = feature.get(FEATURE_KEYS.layerType);
    const originParam = feature.get(FEATURE_KEYS.param);
    if (!originParam) return undefined;
    // 深拷贝，避免修改绑定在 feature 上的原对象；param 为跨类型的动态对象，内部按 any 处理
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const param: any = cloneDeep(originParam);
    const geometry = feature.getGeometry();
    const style = this.resolveStaticStyle(feature);

    // 分类型同步
    if (layerType === 'Billboard') {
      if (geometry && geometry.getType && geometry.getType() === 'Point') {
        try {
          const pointGeom = geometry as import('ol/geom').Point;
          param.center = pointGeom.getCoordinates();
        } catch (_) {
          /* 预期异常:几何类型与断言不符时跳过该字段同步，不向上抛出 */
        }
      }
      if (style) {
        const icon = style.getImage?.() as Icon | undefined;
        if (icon) {
          const src = icon.getSrc();
          if (src) param.src = src;
          const size = icon.getSize();
          if (size) param.size = size;
          const color = icon.getColor();
          if (typeof color === 'string') param.color = color;
          const displacement = icon.getDisplacement();
          if (Array.isArray(displacement)) param.displacement = displacement as number[];
          const scaleVal = icon.getScale?.();
          if (scaleVal) param.scale = scaleVal;
          const rotation = icon.getRotation?.();
          if (rotation != null) param.rotation = Utils.rad2deg(rotation);
          const anchor = (icon as unknown as { anchor_?: number[] }).anchor_;
          if (anchor && Array.isArray(anchor)) param.anchor = anchor as number[];
        }
        param.label = this.buildLabelFromText(style.getText?.(), param.label, feature);
      }
    } else if (layerType === 'Polyline') {
      if (geometry && geometry.getType && geometry.getType() === 'LineString') {
        try {
          const line = geometry as import('ol/geom').LineString;
          const coords = line.getCoordinates();
          // 兼容普通与飞行线
          if ('positions' in param) param.positions = coords;
          if ('position' in param && !('positions' in param)) param.position = coords as number[][];
        } catch (_) {
          /* 预期异常:几何类型与断言不符时跳过该字段同步，不向上抛出 */
        }
      }
      if (style && 'positions' in param) {
        // 仅普通折线做样式同步
        this.syncStrokeFillFromStyle(style, param);
        if (param.stroke?.width && !param.width) param.width = param.stroke.width;
        param.label = this.buildLabelFromText(style.getText?.(), param.label, feature);
      }
    } else if (layerType === 'Point') {
      if (geometry && geometry.getType && geometry.getType() === 'Point') {
        try {
          const point = geometry as import('ol/geom').Point;
          param.center = point.getCoordinates();
        } catch (_) {
          /* 预期异常:几何类型与断言不符时跳过该字段同步，不向上抛出 */
        }
      }
      if (style) {
        const image = (style.getImage && style.getImage()) as CircleStyle | undefined;
        if (image) {
          const r = image.getRadius();
          if (r != null) param.size = r;
          // stroke / fill 同步自 image（CircleStyle）
          this.syncStrokeFillFromStyle(image, param);
        }
        param.label = this.buildLabelFromText(style.getText?.(), param.label, feature);
      }
    } else if (layerType === 'Circle') {
      if (geometry && geometry.getType && geometry.getType() === 'Circle') {
        try {
          const circle = geometry as import('ol/geom').Circle;
          param.center = circle.getCenter();
          param.radius = circle.getRadius();
        } catch (_) {
          /* 预期异常:几何类型与断言不符时跳过该字段同步，不向上抛出 */
        }
      }
      if (style) {
        this.syncStrokeFillFromStyle(style, param);
        param.label = this.buildLabelFromText(style.getText?.(), param.label, feature);
      }
    } else if (layerType === 'Polygon') {
      if (geometry && geometry.getType && geometry.getType() === 'Polygon') {
        try {
          const polygon = geometry as import('ol/geom').Polygon;
          param.positions = polygon.getCoordinates();
        } catch (_) {
          /* 预期异常:几何类型与断言不符时跳过该字段同步，不向上抛出 */
        }
      }
      if (style) {
        this.syncStrokeFillFromStyle(style, param);
        param.label = this.buildLabelFromText(style.getText?.(), param.label, feature);
      }
    }
    return param;
  }
  /**
   * 解除 feature 上的闪烁监听（`listenerKey`），避免移除/隐藏后 postrender 仍持续触发。
   * @param feature 矢量元素
   */
  protected unbindFeatureFlash(feature: Feature<Geometry>): void {
    const listenerKey = feature.get(FEATURE_KEYS.listenerKey);
    if (listenerKey) {
      unByKey(listenerKey);
      feature.set(FEATURE_KEYS.listenerKey, null);
    }
  }
  /**
   * 元素被隐藏时的钩子（默认无操作）。子类可覆写以停止与渲染绑定的副作用（如闪烁）。
   * @param feature 被隐藏的元素
   */
  protected onFeatureHide(_feature: Feature<Geometry>): void {
    /* default no-op */
  }
  /**
   * 元素被重新显示时的钩子（默认无操作）。子类可覆写以恢复与渲染绑定的副作用。
   * @param feature 被显示的元素
   */
  protected onFeatureShow(_feature: Feature<Geometry>): void {
    /* default no-op */
  }
  /**
   * 删除图层所有矢量元素
   * @example
   * ```
   * layer.remove();
   * ```
   */
  remove(): void;
  /**
   * 删除图层指定矢量元素元素
   * @param id 矢量元素id
   * @example
   * ```
   * layer.remove("1");
   * ```
   */
  remove(id: string): void;
  remove(id?: string): void {
    if (id) {
      const feature = this.get(id)[0];
      if (feature) {
        // 先解除闪烁监听，再从数据源移除，防止 postrender 泄漏
        this.unbindFeatureFlash(feature);
        this.layer.getSource()?.removeFeature(feature);
      }
      const entry = this.featureListenerMap.get(id);
      if (entry) {
        entry.cancel();
        unByKey(entry.key);
        this.featureListenerMap.delete(id);
      }
    } else {
      // 解除所有闪烁监听与 change 监听
      this.layer
        .getSource()
        ?.getFeatures()
        .forEach((f) => this.unbindFeatureFlash(f));
      this.layer.getSource()?.clear();
      this.featureListenerMap.forEach((entry) => {
        entry.cancel();
        unByKey(entry.key);
      });
      this.featureListenerMap.clear();
    }
  }
  /**
   * 获取图层中所有矢量元素
   * @returns 返回矢量元素数组
   * @example
   * ```
   * const features:Feature<Geometry>[] = layer.get();
   * ```
   */
  get(): Feature<Geometry>[];
  /**
   * 获取图层中指定矢量元素
   * @param id 矢量元素id
   * @returns 返回矢量元素数组
   * @example
   * ```
   * const features:Feature<Geometry>[] = layer.get("1");
   * ```
   */
  get(id: string): Feature<Geometry>[];
  get(id?: string): Feature<Geometry>[] {
    let features: Feature<Geometry>[] = [];
    if (id) {
      const feature = this.layer.getSource()?.getFeatureById(id);
      if (feature) features.push(feature);
    } else {
      const feature = this.layer.getSource()?.getFeatures();
      if (feature) features = feature;
    }
    return features;
  }
  /**
   * 隐藏图层所有矢量元素
   * @example
   * ```
   * layer.hide();
   * ```
   */
  hide(): void;
  /**
   * 隐藏图层指定矢量元素
   * @param id 矢量元素id
   * @example
   * ```
   * layer.hide("1");
   * ```
   */
  hide(id: string): void;
  hide(id?: string): void {
    if (id) {
      const feature = this.get(id)[0];
      if (!feature) {
        console.warn('没有找到元素，请检查ID');
        return;
      }
      this.hideFeatureMap.set(id, feature);
      // 仅从数据源移除，不解绑 change 监听（show 时不需重新绑定），并通知子类停止副作用
      this.onFeatureHide(feature);
      this.layer.getSource()?.removeFeature(feature);
    } else {
      this.layer.setVisible(false);
    }
  }
  /**
   * 显示图层所有矢量元素
   * @example
   * ```
   * layer.show();
   * ```
   */
  show(): void;
  /**
   * 显示图层指定矢量元素
   * @param id 矢量元素id
   * @example
   * ```
   * layer.show("1");
   * ```
   */
  show(id: string): void;
  show(id?: string): void {
    if (id) {
      const feature = this.hideFeatureMap.get(id);
      if (feature) {
        // 直接加回数据源，不重新绑定监听（监听在 hide 时已保留）
        this.layer.getSource()?.addFeature(feature);
        this.onFeatureShow(feature);
      }
      this.hideFeatureMap.delete(id);
    } else {
      // 恢复所有单独隐藏的元素
      this.hideFeatureMap.forEach((feature) => {
        this.layer.getSource()?.addFeature(feature);
        this.onFeatureShow(feature);
      });
      this.hideFeatureMap.clear();
      this.layer.setVisible(true);
    }
  }
  /**
   * 设置图层透明度。
   * @param opacity 透明度百分比，取值范围为 `0` 到 `100`，默认 `100`。
   * @returns 参数有效且修改成功时返回 `true`，否则返回 `false`。
   * @example
   * ```
   * layer.setLayerOpacity(50);
   * ```
   */
  setLayerOpacity(opacity: number = 100): boolean {
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) return false;
    this.layer.setOpacity(opacity / 100);
    return true;
  }
  /**
   * 设置图层`z-index`等级
   * @param index 等级
   * @example
   * ```
   * layer.setLayerIndex(999)
   * ```
   */
  setLayerIndex(index: number): void {
    this.layer.setZIndex(index);
  }
  /**
   * 获取图层
   */
  getLayer(): VectorLayer<VectorSource<Geometry>> {
    return this.layer;
  }
  /**
   * 销毁图层，同时销毁该图层所有元素，不可恢复
   * @returns 返回boolean值
   * @example
   * ```
   * const flag:boolean = layer.destroy();
   * ```
   */
  destroy(): boolean {
    if (this.allowDestroyed) {
      // 清理所有 change 监听、闪烁监听与隐藏缓存，避免内存泄漏
      this.remove();
      this.hideFeatureMap.clear();
      const flag = this.earth.removeLayer(this.layer);
      if (flag) {
        this.earth.removeRegisteredLayer(this.registryKey);
        return true;
      } else {
        return false;
      }
    } else {
      console.warn('该图层受到保护，无法被销毁');
      return false;
    }
  }
}
