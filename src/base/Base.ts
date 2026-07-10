/* eslint-disable @typescript-eslint/no-explicit-any */
import Earth from '../Earth';
import { IFill, ILabel, IStroke, IBillboardParam, IPolylineParam, IPolylineFlyParam } from '../interface';
import { Feature } from 'ol';
import { Geometry } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Fill, Text } from 'ol/style';
import Icon from 'ol/style/Icon';
import { Utils } from '../common';
import { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';
// import BaseEvent from 'ol/events/Event';
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
   * 缓存featur的集合
   */
  public hideFeatureMap: Map<string, Feature<Geometry>> = new Map();
  /**
   * 元素监听器
   */
  private featureListenerMap: Map<string, EventsKey> = new Map();
  /**
   * 图层构造类
   * @param earth 地图实例
   * @param layer 图层实例
   */
  constructor(protected earth: Earth, layer: VectorLayer<VectorSource<Geometry>>, type: string) {
    const layerId = Utils.GetGUID();
    this.registryKey = layerId;
    layer.set('type', type);
    layer.set('id', layerId);
    this.layer = layer;
    earth.map.addLayer(layer);
    // 可选自动注册封装层实例
    if (this.registryKey) {
      // 定义一个临时接口描述内部注册方法（不对外暴露）
      interface IRegisterableEarth {
        _autoRegisterLayer?: (key: string, layer: Base) => void;
      }
      const e = earth as unknown as IRegisterableEarth;
      if (typeof e._autoRegisterLayer === 'function') {
        e._autoRegisterLayer(this.registryKey, this);
      }
    }
  }
  /**
   * 设置描边样式
   * @param style style实例
   * @param param 描边参数，`可选的`。详见{@link IStroke}
   * @param width 宽度，`可选的`
   * @returns 返回style实例
   */
  protected setStroke(style: Style, param?: IStroke, width?: number): Style {
    const stroke = new Stroke(
      Object.assign(
        {
          color: param?.color || style.getStroke()?.getColor() || '#ffcc33',
          width: width || style.getStroke()?.getWidth() || 2,
          lineDash: param?.lineDash || style.getStroke()?.getLineDash()
        },
        param
      )
    );
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
    const fill = new Fill(
      Object.assign(
        {
          color: param?.color || style.getFill()?.getColor() || '#ffffff57'
        },
        param
      )
    );
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
      offsetY: param?.offsetY ? -param.offsetY : (offsetY || style.getText()?.getOffsetY()),
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
    return feature.get('labelOffset') as { offsetX: number; offsetY: number } | undefined;
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
    feature.set('labelOffset', { offsetX: effX, offsetY: effY });
    return style;
  }
  /**
   * 往图层添加一个矢量元素
   * @param feature 矢量元素实例
   * @returns 返回矢量元素实例
   */
  protected save(feature: Feature<Geometry>): Feature<Geometry> {
    feature.set('registryKey', this.registryKey);
    this.addFeaturelistener(feature);
    this.layer.getSource()?.addFeature(feature);
    return feature;
  }
  /**
   * 添加元素事件监听
   * @param feature 矢量元素实例
   */
  protected addFeaturelistener(feature: Feature<Geometry>): void {
    const featureChangeListener = feature.on('change', () => {
      if (feature.get('layerType') === 'Billboard') {
        // 如果是BillboardLayer，则根据{@link IBillboardParam}同步param参数
        this.updateBillboardParam(feature);
      } else if (feature.get('layerType') === 'Polyline') {
        // 如果是PolylineLayer，则根据{@link IPolylineParam}同步param参数
        this.updatePolylineParam(feature);
      } else if (feature.get('layerType') === 'Point') {
        // 如果是PointLayer，则根据{@link IPointParam}同步param参数
        this.updatePointParam(feature);
      } else if (feature.get('layerType') === 'Circle') {
        // 如果是CircleLayer，则根据{@link ICircleParam}同步param参数
        this.updateCircleParam(feature);
      } else if (feature.get('layerType') === 'Polygon') {
        // 如果是PolygonLayer，则根据{@link IPolygonParam}同步param参数
        this.updatePolygonParam(feature);
      }
    });
    this.featureListenerMap.set(feature.getId() as string, featureChangeListener);
  }
  /**
   * 更新Billboard图标参数
   */
  protected updateBillboardParam(feature: Feature<Geometry>): void {
    const param = feature.get('param') as IBillboardParam<unknown> | undefined;
    // 同步最新的几何与样式信息到 param
    if (param) {
      // 更新中心点
      const geometry = feature.getGeometry();
      // 仅在 Point 几何时同步中心
      if (geometry && geometry.getType && geometry.getType() === 'Point') {
        try {
          // 使用 (geometry as any) 以避免类型不兼容，但不直接访问未声明方法
          const pointGeom = geometry as import('ol/geom').Point;
          param.center = pointGeom.getCoordinates();
        } catch (_) {
          /* ignore */
        }
      }
      // 更新样式与图标属性
      const style = feature.getStyle() as Style | undefined;
      const icon = style?.getImage() as Icon | undefined;
      if (icon) {
        // 仅当有值时才覆盖，避免把 undefined 写回
        const src = icon.getSrc();
        if (src) param.src = src;
        const size = icon.getSize();
        if (size) param.size = size;
        const color = icon.getColor();
        if (typeof color === 'string') param.color = color;
        const displacement = <number[] | undefined>feature.get('screenDisplacement');
        if (Array.isArray(displacement)) param.displacement = displacement.slice();
        const scaleVal = icon.getScale();
        if (scaleVal) {
          param.scale = scaleVal;
        }
        const rotation = icon.getRotation();
        if (rotation != null) param.rotation = Utils.rad2deg(rotation);
        const anchor = (icon as any).anchor_; // 原始 anchor 数组;
        if (anchor && Array.isArray(anchor)) param.anchor = anchor as number[];
      }
      // 同步文本标签
      const text = style?.getText();
      // 文本 offset 已按 rotation 补偿为 OL 本地值，公共约定值需从 feature 存储回读
      const storedLabelOffset = <{ offsetX: number; offsetY: number } | undefined>feature.get('labelOffset');
      if (text) {
        const plainText = (() => {
          const t = text.getText();
          if (Array.isArray(t)) return t.join('');
          return t || '';
        })();
        param.label = {
          text: plainText || param.label?.text || '',
          font: text.getFont() || param.label?.font,
          offsetX: storedLabelOffset?.offsetX ?? param.label?.offsetX,
          offsetY: storedLabelOffset?.offsetY ?? param.label?.offsetY,
          scale:
            (typeof text.getScale === 'function'
              ? Array.isArray(text.getScale())
                ? (text.getScale() as number[])[0]
                : (text.getScale() as number)
              : undefined) || param.label?.scale,
          textAlign: text.getTextAlign() || param.label?.textAlign,
          textBaseline: text.getTextBaseline() || param.label?.textBaseline,
          rotation: (typeof text.getRotation === 'function' && text.getRotation() ? Utils.rad2deg(text.getRotation() ?? 0) : param.label?.rotation),
          fill: text.getFill() && typeof text.getFill().getColor === 'function' ? { color: text.getFill().getColor() as string } : param.label?.fill,
          stroke:
            text.getStroke() && typeof text.getStroke().getColor === 'function'
              ? {
                color: text.getStroke().getColor() as string,
                width: (typeof text.getStroke().getWidth === 'function' ? text.getStroke().getWidth() : undefined) || param.label?.stroke?.width
              }
              : param.label?.stroke,
          backgroundFill:
            text.getBackgroundFill() && typeof text.getBackgroundFill().getColor === 'function'
              ? { color: text.getBackgroundFill().getColor() as string }
              : param.label?.backgroundFill,
          backgroundStroke:
            text.getBackgroundStroke() && typeof text.getBackgroundStroke().getColor === 'function'
              ? {
                color: text.getBackgroundStroke().getColor() as string,
                width:
                  (typeof text.getBackgroundStroke().getWidth === 'function' ? text.getBackgroundStroke().getWidth() : undefined) ||
                  param.label?.backgroundStroke?.width
              }
              : param.label?.backgroundStroke,
          padding: text.getPadding() || param.label?.padding
        };
      }
      // 回写最新 param
      feature.set('param', param);
    }
  }
  /**
   * 更新Polyline参数(仅同步可推导的几何/样式字段)
   * @param feature Polyline要素
   */
  protected updatePolylineParam(feature: Feature<Geometry>): void {
    // 兼容普通 Polyline 与 飞行线 Polyline（IPolylineFlyParam 不继承 IPolylineParam，字段名称也不同: position vs positions）
    const param = feature.get('param') as (IPolylineParam<unknown> | IPolylineFlyParam<unknown>) | undefined;
    if (!param) return;
    const isNormalPolyline = (p: any): p is IPolylineParam<unknown> => 'positions' in p;
    const isFlyPolyline = (p: any): p is IPolylineFlyParam<unknown> => 'position' in p && !('positions' in p);
    const geometry = feature.getGeometry();
    if (geometry && geometry.getType && geometry.getType() === 'LineString') {
      try {
        const line = geometry as import('ol/geom').LineString;
        const coords = line.getCoordinates();
        if (isNormalPolyline(param)) param.positions = coords;
        if (isFlyPolyline(param)) param.position = coords as number[][];
      } catch (_) {
        /* ignore */
      }
    }
    // 同步样式: 仅在静态 Style 情况下（当 style 是函数时跳过，因为箭头/动态样式内部已同步 positions）
    const styleLike = feature.getStyle();
    let style: Style | undefined;
    if (styleLike instanceof Style) style = styleLike;
    else if (Array.isArray(styleLike) && styleLike.length && styleLike[0] instanceof Style) style = styleLike[0];
    // style 为函数 (StyleFunction) 时不处理，避免调用导致副作用或无法提供 resolution
    if (style && isNormalPolyline(param)) {
      const stroke = style.getStroke && style.getStroke();
      if (stroke && typeof stroke.getColor === 'function') {
        param.stroke = Object.assign({}, param.stroke, {
          color: stroke.getColor?.() || param.stroke?.color,
          width: stroke.getWidth?.() || param.stroke?.width,
          lineDash: stroke.getLineDash?.() || param.stroke?.lineDash,
          lineDashOffset: stroke.getLineDashOffset?.() || param.stroke?.lineDashOffset
        });
        if (param.stroke?.width && !param.width) {
          param.width = param.stroke.width;
        }
      }
      const fill = style.getFill && style.getFill();
      if (fill && typeof fill.getColor === 'function') {
        const fillColor = fill.getColor();
        if (fillColor) param.fill = { color: fillColor as string };
      }
      const text = style.getText && style.getText();
      if (text) {
        const plainText = (() => {
          const t = text.getText?.();
          if (Array.isArray(t)) return t.join('');
          return t || '';
        })();
        param.label = {
          text: plainText || param.label?.text || '',
          font: text.getFont?.() || param.label?.font,
          offsetX: this.getStoredLabelOffset(feature)?.offsetX ?? param.label?.offsetX,
          offsetY: this.getStoredLabelOffset(feature)?.offsetY ?? param.label?.offsetY,
          scale:
            (typeof text.getScale === 'function'
              ? Array.isArray(text.getScale())
                ? (text.getScale() as number[])[0]
                : (text.getScale() as number)
              : undefined) || param.label?.scale,
          textAlign: text.getTextAlign?.() || param.label?.textAlign,
          textBaseline: text.getTextBaseline?.() || param.label?.textBaseline,
          rotation: (typeof text.getRotation === 'function' && text.getRotation() ? Utils.rad2deg(text.getRotation() ?? 0) : param.label?.rotation),
          fill: (() => {
            const f = text.getFill && text.getFill();
            if (f && typeof f.getColor === 'function') {
              const c = f.getColor();
              if (c) return { color: c as string };
            }
            return param.label?.fill;
          })(),
          stroke: (() => {
            const s = text.getStroke && text.getStroke();
            if (s && typeof s.getColor === 'function') {
              const c = s.getColor();
              const w = typeof s.getWidth === 'function' ? s.getWidth() : undefined;
              return { color: c as string, width: w || param.label?.stroke?.width };
            }
            return param.label?.stroke;
          })(),
          backgroundFill: (() => {
            const bf = text.getBackgroundFill && text.getBackgroundFill();
            if (bf && typeof bf.getColor === 'function') {
              const c = bf.getColor();
              if (c) return { color: c as string };
            }
            return param.label?.backgroundFill;
          })(),
          backgroundStroke: (() => {
            const bs = text.getBackgroundStroke && text.getBackgroundStroke();
            if (bs && typeof bs.getColor === 'function') {
              const c = bs.getColor();
              const w = typeof bs.getWidth === 'function' ? bs.getWidth() : undefined;
              return { color: c as string, width: w || param.label?.backgroundStroke?.width };
            }
            return param.label?.backgroundStroke;
          })(),
          padding: text.getPadding?.() || param.label?.padding
        };
      }
    }
    feature.set('param', param);
  }
  /**
   * 更新Point参数(仅同步可推导的几何/样式字段)
   * @param feature Point要素
   */
  protected updatePointParam(feature: Feature<Geometry>): void {
    const param = feature.get('param') as any; // IPointParam<unknown> | undefined
    if (!param) return;
    // 同步几何中心
    const geometry = feature.getGeometry();
    if (geometry && geometry.getType && geometry.getType() === 'Point') {
      try {
        const point = geometry as import('ol/geom').Point;
        param.center = point.getCoordinates();
      } catch (_) {
        /* ignore */
      }
    }
    // 样式同步（仅静态 style）
    const styleLike = feature.getStyle();
    let style: Style | undefined;
    if (styleLike instanceof Style) style = styleLike;
    else if (Array.isArray(styleLike) && styleLike.length && styleLike[0] instanceof Style) style = styleLike[0];
    if (style) {
      const image: any = style.getImage && style.getImage();
      if (image) {
        // 半径 -> size
        if (typeof image.getRadius === 'function') {
          const r = image.getRadius();
          if (r != null) param.size = r;
        }
        // stroke
        const stroke = image.getStroke && image.getStroke();
        if (stroke && typeof stroke.getColor === 'function') {
          param.stroke = Object.assign({}, param.stroke, {
            color: stroke.getColor?.() || param.stroke?.color,
            width: stroke.getWidth?.() || param.stroke?.width,
            lineDash: stroke.getLineDash?.() || param.stroke?.lineDash,
            lineDashOffset: stroke.getLineDashOffset?.() || param.stroke?.lineDashOffset
          });
        }
        // fill
        const fill = image.getFill && image.getFill();
        if (fill && typeof fill.getColor === 'function') {
          const fillColor = fill.getColor();
          if (fillColor) param.fill = { color: fillColor as string };
        }
      }
      // label 同步
      const text = style.getText && style.getText();
      if (text) {
        const plainText = (() => {
          const t = text.getText?.();
          if (Array.isArray(t)) return t.join('');
          return t || '';
        })();
        param.label = {
          text: plainText || param.label?.text || '',
          font: text.getFont?.() || param.label?.font,
          offsetX: this.getStoredLabelOffset(feature)?.offsetX ?? param.label?.offsetX,
          offsetY: this.getStoredLabelOffset(feature)?.offsetY ?? param.label?.offsetY,
          scale:
            (typeof text.getScale === 'function'
              ? Array.isArray(text.getScale())
                ? (text.getScale() as number[])[0]
                : (text.getScale() as number)
              : undefined) || param.label?.scale,
          textAlign: text.getTextAlign?.() || param.label?.textAlign,
          textBaseline: text.getTextBaseline?.() || param.label?.textBaseline,
          rotation: (typeof text.getRotation === 'function' && text.getRotation() ? Utils.rad2deg(text.getRotation() ?? 0) : param.label?.rotation),
          fill: (() => {
            const f = text.getFill && text.getFill();
            if (f && typeof f.getColor === 'function') {
              const c = f.getColor();
              if (c) return { color: c as string };
            }
            return param.label?.fill;
          })(),
          stroke: (() => {
            const s = text.getStroke && text.getStroke();
            if (s && typeof s.getColor === 'function') {
              const c = s.getColor();
              const w = typeof s.getWidth === 'function' ? s.getWidth() : undefined;
              return { color: c as string, width: w || param.label?.stroke?.width };
            }
            return param.label?.stroke;
          })(),
          backgroundFill: (() => {
            const bf = text.getBackgroundFill && text.getBackgroundFill();
            if (bf && typeof bf.getColor === 'function') {
              const c = bf.getColor();
              if (c) return { color: c as string };
            }
            return param.label?.backgroundFill;
          })(),
          backgroundStroke: (() => {
            const bs = text.getBackgroundStroke && text.getBackgroundStroke();
            if (bs && typeof bs.getColor === 'function') {
              const c = bs.getColor();
              const w = typeof bs.getWidth === 'function' ? bs.getWidth() : undefined;
              return { color: c as string, width: w || param.label?.backgroundStroke?.width };
            }
            return param.label?.backgroundStroke;
          })(),
          padding: text.getPadding?.() || param.label?.padding
        };
      }
    }
    feature.set('param', param);
  }
  /**
   * 更新Circle参数(仅同步可推导的几何/样式字段)
   * @param feature Circle要素
   */
  protected updateCircleParam(feature: Feature<Geometry>): void {
    const param = feature.get('param') as any; // ICircleParam<unknown> | undefined
    if (!param) return;
    const geometry = feature.getGeometry();
    if (geometry && geometry.getType && geometry.getType() === 'Circle') {
      try {
        const circle = geometry as import('ol/geom').Circle;
        param.center = circle.getCenter();
        param.radius = circle.getRadius();
      } catch (_) {
        /* ignore */
      }
    }
    // 样式同步（静态样式）
    const styleLike = feature.getStyle();
    let style: Style | undefined;
    if (styleLike instanceof Style) style = styleLike;
    else if (Array.isArray(styleLike) && styleLike.length && styleLike[0] instanceof Style) style = styleLike[0];
    if (style) {
      const stroke = style.getStroke && style.getStroke();
      if (stroke && typeof stroke.getColor === 'function') {
        param.stroke = Object.assign({}, param.stroke, {
          color: stroke.getColor?.() || param.stroke?.color,
          width: stroke.getWidth?.() || param.stroke?.width,
          lineDash: stroke.getLineDash?.() || param.stroke?.lineDash,
          lineDashOffset: stroke.getLineDashOffset?.() || param.stroke?.lineDashOffset
        });
      }
      const fill = style.getFill && style.getFill();
      if (fill && typeof fill.getColor === 'function') {
        const fillColor = fill.getColor();
        if (fillColor) param.fill = { color: fillColor as string };
      }
      const text = style.getText && style.getText();
      if (text) {
        const plainText = (() => {
          const t = text.getText?.();
          if (Array.isArray(t)) return t.join('');
          return t || '';
        })();
        param.label = {
          text: plainText || param.label?.text || '',
          font: text.getFont?.() || param.label?.font,
          offsetX: this.getStoredLabelOffset(feature)?.offsetX ?? param.label?.offsetX,
          offsetY: this.getStoredLabelOffset(feature)?.offsetY ?? param.label?.offsetY,
          scale:
            (typeof text.getScale === 'function'
              ? Array.isArray(text.getScale())
                ? (text.getScale() as number[])[0]
                : (text.getScale() as number)
              : undefined) || param.label?.scale,
          textAlign: text.getTextAlign?.() || param.label?.textAlign,
          textBaseline: text.getTextBaseline?.() || param.label?.textBaseline,
          rotation: (typeof text.getRotation === 'function' && text.getRotation() ? Utils.rad2deg(text.getRotation() ?? 0) : param.label?.rotation),
          fill: (() => {
            const f = text.getFill && text.getFill();
            if (f && typeof f.getColor === 'function') {
              const c = f.getColor();
              if (c) return { color: c as string };
            }
            return param.label?.fill;
          })(),
          stroke: (() => {
            const s = text.getStroke && text.getStroke();
            if (s && typeof s.getColor === 'function') {
              const c = s.getColor();
              const w = typeof s.getWidth === 'function' ? s.getWidth() : undefined;
              return { color: c as string, width: w || param.label?.stroke?.width };
            }
            return param.label?.stroke;
          })(),
          backgroundFill: (() => {
            const bf = text.getBackgroundFill && text.getBackgroundFill();
            if (bf && typeof bf.getColor === 'function') {
              const c = bf.getColor();
              if (c) return { color: c as string };
            }
            return param.label?.backgroundFill;
          })(),
          backgroundStroke: (() => {
            const bs = text.getBackgroundStroke && text.getBackgroundStroke();
            if (bs && typeof bs.getColor === 'function') {
              const c = bs.getColor();
              const w = typeof bs.getWidth === 'function' ? bs.getWidth() : undefined;
              return { color: c as string, width: w || param.label?.backgroundStroke?.width };
            }
            return param.label?.backgroundStroke;
          })(),
          padding: text.getPadding?.() || param.label?.padding
        };
      }
    }
    feature.set('param', param);
  }
  /**
   * 更新Polygon参数(仅同步可推导的几何/样式字段)
   * @param feature Polygon要素
   */
  protected updatePolygonParam(feature: Feature<Geometry>): void {
    const param = feature.get('param') as any; // IPolygonParam<unknown> | undefined
    if (!param) return;
    const geometry = feature.getGeometry();
    if (geometry && geometry.getType && geometry.getType() === 'Polygon') {
      try {
        const polygon = geometry as import('ol/geom').Polygon;
        param.positions = polygon.getCoordinates();
      } catch (_) {
        /* ignore */
      }
    }
    // 样式同步
    const styleLike = feature.getStyle();
    let style: Style | undefined;
    if (styleLike instanceof Style) style = styleLike;
    else if (Array.isArray(styleLike) && styleLike.length && styleLike[0] instanceof Style) style = styleLike[0];
    if (style) {
      const stroke = style.getStroke && style.getStroke();
      if (stroke && typeof stroke.getColor === 'function') {
        param.stroke = Object.assign({}, param.stroke, {
          color: stroke.getColor?.() || param.stroke?.color,
          width: stroke.getWidth?.() || param.stroke?.width,
          lineDash: stroke.getLineDash?.() || param.stroke?.lineDash,
          lineDashOffset: stroke.getLineDashOffset?.() || param.stroke?.lineDashOffset
        });
      }
      const fill = style.getFill && style.getFill();
      if (fill && typeof fill.getColor === 'function') {
        const fillColor = fill.getColor();
        if (fillColor) param.fill = { color: fillColor as string };
      }
      const text = style.getText && style.getText();
      if (text) {
        const plainText = (() => {
          const t = text.getText?.();
          if (Array.isArray(t)) return t.join('');
          return t || '';
        })();
        param.label = {
          text: plainText || param.label?.text || '',
          font: text.getFont?.() || param.label?.font,
          offsetX: this.getStoredLabelOffset(feature)?.offsetX ?? param.label?.offsetX,
          offsetY: this.getStoredLabelOffset(feature)?.offsetY ?? param.label?.offsetY,
          scale:
            (typeof text.getScale === 'function'
              ? Array.isArray(text.getScale())
                ? (text.getScale() as number[])[0]
                : (text.getScale() as number)
              : undefined) || param.label?.scale,
          textAlign: text.getTextAlign?.() || param.label?.textAlign,
          textBaseline: text.getTextBaseline?.() || param.label?.textBaseline,
          rotation: (typeof text.getRotation === 'function' && text.getRotation() ? Utils.rad2deg(text.getRotation() ?? 0) : param.label?.rotation),
          fill: (() => {
            const f = text.getFill && text.getFill();
            if (f && typeof f.getColor === 'function') {
              const c = f.getColor();
              if (c) return { color: c as string };
            }
            return param.label?.fill;
          })(),
          stroke: (() => {
            const s = text.getStroke && text.getStroke();
            if (s && typeof s.getColor === 'function') {
              const c = s.getColor();
              const w = typeof s.getWidth === 'function' ? s.getWidth() : undefined;
              return { color: c as string, width: w || param.label?.stroke?.width };
            }
            return param.label?.stroke;
          })(),
          backgroundFill: (() => {
            const bf = text.getBackgroundFill && text.getBackgroundFill();
            if (bf && typeof bf.getColor === 'function') {
              const c = bf.getColor();
              if (c) return { color: c as string };
            }
            return param.label?.backgroundFill;
          })(),
          backgroundStroke: (() => {
            const bs = text.getBackgroundStroke && text.getBackgroundStroke();
            if (bs && typeof bs.getColor === 'function') {
              const c = bs.getColor();
              const w = typeof bs.getWidth === 'function' ? bs.getWidth() : undefined;
              return { color: c as string, width: w || param.label?.backgroundStroke?.width };
            }
            return param.label?.backgroundStroke;
          })(),
          padding: text.getPadding?.() || param.label?.padding
        };
      }
    }
    feature.set('param', param);
  }
  /**
   * 根据 feature 计算出最新的 param（不会回写 feature.set('param', param)）
   * 使用场景：需要临时获取最新状态用于显示 / 比较 / 自定义撤销等，而不改变要素本身。
   * @param feature 目标要素
   * @returns 复制并更新后的 param；若不存在 param 返回 undefined
   */
  public getUpdatedParam(feature: Feature<Geometry>): any | undefined {
    if (!feature) return undefined;
    const layerType = feature.get('layerType');
    const originParam = feature.get('param');
    if (!originParam) return undefined;
    // 深拷贝，避免修改绑定在 feature 上的原对象
    let param: any;
    try {
      param = JSON.parse(JSON.stringify(originParam));
    } catch (_) {
      // 兜底浅拷贝
      param = { ...originParam };
    }
    const geometry = feature.getGeometry();
    const styleLike = feature.getStyle();
    let style: Style | undefined;
    if (styleLike instanceof Style) style = styleLike;
    else if (Array.isArray(styleLike) && styleLike.length && styleLike[0] instanceof Style) style = styleLike[0];

    const syncLabelCommon = (text: Text | undefined) => {
      if (!text) return;
      const plainText = (() => {
        const t = text.getText?.();
        if (Array.isArray(t)) return t.join('');
        return t || '';
      })();
      param.label = {
        text: plainText || param.label?.text || '',
        font: text.getFont?.() || param.label?.font,
        offsetX: this.getStoredLabelOffset(feature)?.offsetX ?? param.label?.offsetX,
        offsetY: this.getStoredLabelOffset(feature)?.offsetY ?? param.label?.offsetY,
        scale:
          (typeof text.getScale === 'function'
            ? Array.isArray(text.getScale())
              ? (text.getScale() as number[])[0]
              : (text.getScale() as number)
            : undefined) || param.label?.scale,
        textAlign: text.getTextAlign?.() || param.label?.textAlign,
        textBaseline: text.getTextBaseline?.() || param.label?.textBaseline,
        rotation: (typeof text.getRotation === 'function' && text.getRotation() ? Utils.rad2deg(text.getRotation() ?? 0) : param.label?.rotation),
        fill: (() => {
          const f = text.getFill && text.getFill();
          if (f && typeof f.getColor === 'function') {
            const c = f.getColor();
            if (c) return { color: c as string };
          }
          return param.label?.fill;
        })(),
        stroke: (() => {
          const s = text.getStroke && text.getStroke();
          if (s && typeof s.getColor === 'function') {
            const c = s.getColor();
            const w = typeof s.getWidth === 'function' ? s.getWidth() : undefined;
            return { color: c as string, width: w || param.label?.stroke?.width };
          }
          return param.label?.stroke;
        })(),
        backgroundFill: (() => {
          const bf = text.getBackgroundFill && text.getBackgroundFill();
          if (bf && typeof bf.getColor === 'function') {
            const c = bf.getColor();
            if (c) return { color: c as string };
          }
          return param.label?.backgroundFill;
        })(),
        backgroundStroke: (() => {
          const bs = text.getBackgroundStroke && text.getBackgroundStroke();
          if (bs && typeof bs.getColor === 'function') {
            const c = bs.getColor();
            const w = typeof bs.getWidth === 'function' ? bs.getWidth() : undefined;
            return { color: c as string, width: w || param.label?.backgroundStroke?.width };
          }
          return param.label?.backgroundStroke;
        })(),
        padding: text.getPadding?.() || param.label?.padding
      };
    };

    // 分类型同步
    if (layerType === 'Billboard') {
      if (geometry && geometry.getType && geometry.getType() === 'Point') {
        try {
          const pointGeom = geometry as import('ol/geom').Point;
          param.center = pointGeom.getCoordinates();
        } catch (_) {
          /* ignore */
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
          const anchor = (icon as any).anchor_;
          if (anchor && Array.isArray(anchor)) param.anchor = anchor as number[];
        }
        syncLabelCommon(style.getText?.());
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
          /* ignore */
        }
      }
      if (style && 'positions' in param) {
        // 仅普通折线做样式同步
        const stroke = style.getStroke && style.getStroke();
        if (stroke && typeof stroke.getColor === 'function') {
          param.stroke = Object.assign({}, param.stroke, {
            color: stroke.getColor?.() || param.stroke?.color,
            width: stroke.getWidth?.() || param.stroke?.width,
            lineDash: stroke.getLineDash?.() || param.stroke?.lineDash,
            lineDashOffset: stroke.getLineDashOffset?.() || param.stroke?.lineDashOffset
          });
          if (param.stroke?.width && !param.width) param.width = param.stroke.width;
        }
        const fill = style.getFill && style.getFill();
        if (fill && typeof fill.getColor === 'function') {
          const fillColor = fill.getColor();
          if (fillColor) param.fill = { color: fillColor as string };
        }
        syncLabelCommon(style.getText?.());
      }
    } else if (layerType === 'Point') {
      if (geometry && geometry.getType && geometry.getType() === 'Point') {
        try {
          const point = geometry as import('ol/geom').Point;
          param.center = point.getCoordinates();
        } catch (_) {
          /* ignore */
        }
      }
      if (style) {
        const image: any = style.getImage && style.getImage();
        if (image) {
          if (typeof image.getRadius === 'function') {
            const r = image.getRadius();
            if (r != null) param.size = r;
          }
          const stroke = image.getStroke && image.getStroke();
          if (stroke && typeof stroke.getColor === 'function') {
            param.stroke = Object.assign({}, param.stroke, {
              color: stroke.getColor?.() || param.stroke?.color,
              width: stroke.getWidth?.() || param.stroke?.width,
              lineDash: stroke.getLineDash?.() || param.stroke?.lineDash,
              lineDashOffset: stroke.getLineDashOffset?.() || param.stroke?.lineDashOffset
            });
          }
          const fill = image.getFill && image.getFill();
          if (fill && typeof fill.getColor === 'function') {
            const fillColor = fill.getColor();
            if (fillColor) param.fill = { color: fillColor as string };
          }
        }
        syncLabelCommon(style.getText?.());
      }
    } else if (layerType === 'Circle') {
      if (geometry && geometry.getType && geometry.getType() === 'Circle') {
        try {
          const circle = geometry as import('ol/geom').Circle;
          param.center = circle.getCenter();
          param.radius = circle.getRadius();
        } catch (_) {
          /* ignore */
        }
      }
      if (style) {
        const stroke = style.getStroke && style.getStroke();
        if (stroke && typeof stroke.getColor === 'function') {
          param.stroke = Object.assign({}, param.stroke, {
            color: stroke.getColor?.() || param.stroke?.color,
            width: stroke.getWidth?.() || param.stroke?.width,
            lineDash: stroke.getLineDash?.() || param.stroke?.lineDash,
            lineDashOffset: stroke.getLineDashOffset?.() || param.stroke?.lineDashOffset
          });
        }
        const fill = style.getFill && style.getFill();
        if (fill && typeof fill.getColor === 'function') {
          const fillColor = fill.getColor();
          if (fillColor) param.fill = { color: fillColor as string };
        }
        syncLabelCommon(style.getText?.());
      }
    } else if (layerType === 'Polygon') {
      if (geometry && geometry.getType && geometry.getType() === 'Polygon') {
        try {
          const polygon = geometry as import('ol/geom').Polygon;
          param.positions = polygon.getCoordinates();
        } catch (_) {
          /* ignore */
        }
      }
      if (style) {
        const stroke = style.getStroke && style.getStroke();
        if (stroke && typeof stroke.getColor === 'function') {
          param.stroke = Object.assign({}, param.stroke, {
            color: stroke.getColor?.() || param.stroke?.color,
            width: stroke.getWidth?.() || param.stroke?.width,
            lineDash: stroke.getLineDash?.() || param.stroke?.lineDash,
            lineDashOffset: stroke.getLineDashOffset?.() || param.stroke?.lineDashOffset
          });
        }
        const fill = style.getFill && style.getFill();
        if (fill && typeof fill.getColor === 'function') {
          const fillColor = fill.getColor();
          if (fillColor) param.fill = { color: fillColor as string };
        }
        syncLabelCommon(style.getText?.());
      }
    }
    return param;
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
      this.layer.getSource()?.removeFeature(this.get(id)[0]);
      const listener = this.featureListenerMap.get(id);
      if (listener) {
        unByKey(listener);
        this.featureListenerMap.delete(id);
      }
    } else {
      this.layer.getSource()?.clear();
      this.featureListenerMap.forEach((listener) => {
        unByKey(listener);
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
      const feature = this.get(id);
      if (feature[0] == undefined) {
        console.warn('没有找到元素，请检查ID');
        return;
      }
      this.hideFeatureMap.set(id, feature[0]);
      this.remove(id);
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
      if (feature) this.save(feature);
      this.hideFeatureMap.delete(id);
    } else {
      this.hideFeatureMap.clear();
      this.layer.setVisible(true);
    }
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
