import { IPointParam } from '../interface';
import { Feature } from 'ol';
import { Map } from 'ol';
import { Coordinate } from 'ol/coordinate';
import { easeOut } from 'ol/easing';
import { getWidth } from 'ol/extent';
import { getCenter, boundingExtent } from 'ol/extent';
import { Geometry, Point } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import { unByKey } from 'ol/Observable';
import { getVectorContext } from 'ol/render';
import RenderEvent from 'ol/render/Event';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Icon } from 'ol/style';
import CircleStyle from 'ol/style/Circle';
import throttle from 'lodash/throttle';
import arrowSvg from '../assets/image/arrow.svg';

/**
 * 通用工具类
 *
 * 说明：本类不再依赖 `useEarth()` 全局单例，所有需要地图实例的方法均显式接收 `map` 参数，
 * 以支持同页面多地图实例并便于单元测试。调用方负责传入所属的 `Map`。
 */
export default class Utils {
  /** 获取指定地图视图投影的 worldWidth；若不可得返回 undefined */
  static getWorldWidth(map: Map): number | undefined {
    try {
      const projExtent = map.getView().getProjection().getExtent?.();
      if (projExtent) return projExtent[2] - projExtent[0];
    } catch {
      /* 投影不可用时回退到 undefined */
    }
    return undefined;
  }
  /** 计算指定 x 所在的 world 索引（Math.floor(x / worldWidth)）；若无法获取 worldWidth 返回 undefined */
  static getWorldIndex(map: Map, x: number): number | undefined {
    const ww = this.getWorldWidth(map);
    if (!ww || !isFinite(ww) || ww === 0) return undefined;
    return Math.floor(x / ww);
  }
  /**
   * 屏幕像素 pixel作为元素的新中心点，重新计算元素坐标
   * 支持 Point、LineString、Polygon、Circle
   * 返回新的坐标数组或参数对象（不直接修改原 feature）
   * @param map 地图实例
   * @param pixel 屏幕像素坐标 [x, y]
   * @param position 原始坐标
   */
  static getFeatureToPixel(
    map: Map,
    pixel: number[],
    position: Coordinate | Coordinate[] | Coordinate[][]
  ): Coordinate | Coordinate[] | Coordinate[][] | null {
    if (!pixel || pixel.length !== 2 || position == null) return null;
    const target = map.getCoordinateFromPixel(pixel);
    if (!target) return null;

    // 处理跨屏(world wrap)问题：在 EPSG:3857 下当地图平移穿越国际换日线或重复世界时，
    // 原中心与目标点可能相差一个或多个 worldWidth，直接相减会得到巨大 dx，导致要素跳跃或不可见。
    // 通过将 X 方向的平移压缩为最短距离 (|dx| <= worldWidth/2) 来修复。
    const projectionExtent = map.getView().getProjection().getExtent();
    const worldWidth = projectionExtent ? projectionExtent[2] - projectionExtent[0] : undefined;
    const minX = projectionExtent ? projectionExtent[0] : undefined;
    const maxX = projectionExtent ? projectionExtent[2] : undefined;
    const shortestDeltaX = (from: number, to: number): number => {
      if (!worldWidth || !isFinite(worldWidth)) return to - from;
      let dx = to - from;
      if (dx > worldWidth / 2) dx -= worldWidth;
      else if (dx < -worldWidth / 2) dx += worldWidth;
      return dx;
    };
    const adjustX = (x: number): number => {
      if (!worldWidth || minX == null || maxX == null) return x;
      if (x > maxX) return x - worldWidth;
      if (x < minX) return x + worldWidth;
      return x;
    };

    // 判断结构层级：
    // Point: [x,y]
    // Line / MultiPoint: [[x,y],[x,y],...]
    // Polygon(单环或多环): [[[x,y],...],[...],...]
    const isNumberArray = (arr: unknown): arr is number[] =>
      Array.isArray(arr) && arr.length === 2 && arr.every((n) => typeof n === 'number');
    const isLineLike = (p: Coordinate | Coordinate[] | Coordinate[][]): p is Coordinate[] =>
      Array.isArray(p) && p.length > 0 && isNumberArray(p[0]);
    const isPolygonLike = (p: Coordinate | Coordinate[] | Coordinate[][]): p is Coordinate[][] =>
      Array.isArray(p) && p.length > 0 && Array.isArray(p[0]) && !isNumberArray(p[0]) && isNumberArray(p[0][0]);

    // 直接 Point / Circle center
    if (isNumberArray(position)) {
      const base = position as Coordinate;
      const dx = shortestDeltaX(base[0], target[0]);
      const dy = target[1] - base[1];
      return [adjustX(base[0] + dx), base[1] + dy] as Coordinate;
    }

    // 线或多点
    if (isLineLike(position)) {
      const extent = boundingExtent(position as Coordinate[]);
      const center = getCenter(extent);
      const dx = shortestDeltaX(center[0], target[0]);
      const dy = target[1] - center[1];
      return (position as Coordinate[]).map((c) => [adjustX(c[0] + dx), c[1] + dy]);
    }

    // 多边形（多环）
    if (isPolygonLike(position)) {
      const flat: Coordinate[] = (position as Coordinate[][]).reduce((acc: Coordinate[], ring) => {
        (ring || []).forEach((pt) => acc.push(pt as Coordinate));
        return acc;
      }, []);
      if (!flat.length) return null;
      const extent = boundingExtent(flat);
      const center = getCenter(extent);
      const dx = shortestDeltaX(center[0], target[0]);
      const dy = target[1] - center[1];
      return (position as Coordinate[][]).map((ring) => ring.map((c) => [adjustX(c[0] + dx), c[1] + dy] as Coordinate));
    }

    return null;
  }
  /**
   * 将一组坐标(点/线/单环面)归一化到当前视图所在的 world copy。
   * @param map 地图实例
   * @param coords 坐标
   */
  static normalizeToViewWorld<TC extends Coordinate | Coordinate[]>(map: Map, coords: TC): TC {
    const center = map.getView().getCenter();
    const worldWidth = this.getWorldWidth(map);
    if (!center || !worldWidth) return Array.isArray(coords) ? (JSON.parse(JSON.stringify(coords)) as TC) : coords;
    const centerWorld = this.getWorldIndex(map, center[0]);
    if (centerWorld === undefined) return Array.isArray(coords) ? (JSON.parse(JSON.stringify(coords)) as TC) : coords;
    const normPoint = (p: Coordinate): Coordinate => {
      const w = this.getWorldIndex(map, p[0]);
      if (w === undefined) return [p[0], p[1]];
      const dw = centerWorld - w;
      return [p[0] + dw * worldWidth, p[1]] as Coordinate;
    };
    if (typeof (coords as Coordinate)[0] === 'number') return normPoint(coords as Coordinate) as TC;
    if (Array.isArray(coords) && coords.length && Array.isArray((coords as Coordinate[])[0])) {
      return (coords as Coordinate[]).map((c) => normPoint(c)) as TC;
    }
    return coords;
  }
  /** 将已归一化坐标恢复到指定 world 索引 */
  static restoreToWorldIndex<TC extends Coordinate | Coordinate[]>(
    map: Map,
    coords: TC,
    targetWorldIndex: number | undefined
  ): TC {
    if (targetWorldIndex === undefined) return coords;
    const worldWidth = this.getWorldWidth(map);
    if (!worldWidth) return coords;
    const restorePoint = (p: Coordinate): Coordinate => {
      const curW = this.getWorldIndex(map, p[0]);
      if (curW === undefined) return p;
      const dw = targetWorldIndex - curW;
      return dw === 0 ? p : ([p[0] + dw * worldWidth, p[1]] as Coordinate);
    };
    if (typeof (coords as Coordinate)[0] === 'number') return restorePoint(coords as Coordinate) as TC;
    if (Array.isArray(coords) && coords.length && Array.isArray((coords as Coordinate[])[0])) {
      return (coords as Coordinate[]).map((c) => restorePoint(c)) as TC;
    }
    return coords;
  }
  /** 保证 ring 闭合 */
  static ensureClosedRing(ring: Coordinate[]): Coordinate[] {
    if (!ring || ring.length < 2) return ring.slice();
    const h = ring[0];
    const t = ring[ring.length - 1];
    return h[0] === t[0] && h[1] === t[1] ? ring.slice() : [...ring, [h[0], h[1]] as Coordinate];
  }
  /** 去掉 ring 尾部重复闭合点 */
  static trimClosedRing(ring: Coordinate[]): Coordinate[] {
    if (!ring || ring.length < 2) return ring.slice();
    const h = ring[0];
    const t = ring[ring.length - 1];
    return h[0] === t[0] && h[1] === t[1] ? ring.slice(0, ring.length - 1) : ring.slice();
  }
  /**
   * 获取一个新的 GUID
   *
   * 优先使用 `crypto.randomUUID()`（非浏览器/不支持时回退到基于 `Math.random` 的 v4 UUID）。
   * @param format 输出样式：`D`-减号连接（默认），`N`-无连接符
   */
  static GetGUID(format: 'N' | 'D' = 'D'): string {
    let uuid: string;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      uuid = crypto.randomUUID();
    } else {
      uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    return format === 'N' ? uuid.replace(/-/g, '') : uuid;
  }
  /**
   * 线性插值函数 此处的计算只处理二维带 x , y 的向量
   * @param startPos
   * @param endPos
   * @param t
   */
  static linearInterpolation(startPos: number[], endPos: number[], t: number): number[] {
    const a = this.constantMultiVector2(1 - t, startPos);
    const b = this.constantMultiVector2(t, endPos);
    return this.vector2Add(a, b);
  }
  /**
   * 常数乘以二维向量数组的函数
   * @param constant
   * @param vector2
   */
  static constantMultiVector2(constant: number, vector2: number[]): number[] {
    return [constant * vector2[0], constant * vector2[1]];
  }
  /**
   * 计算曲线点
   * @param a
   * @param b
   */
  static vector2Add(a: number[], b: number[]): number[] {
    return [a[0] + b[0], a[1] + b[1]];
  }

  /**
   * 计算贝塞尔曲线
   * @param startPos
   * @param center
   * @param endPos
   * @param t
   */
  static bezierSquareCalc(startPos: number[], center: number[], endPos: number[], t: number): number[] {
    const a = this.constantMultiVector2(Math.pow(1 - t, 2), startPos);
    const b = this.constantMultiVector2(2 * t * (1 - t), center);
    const c = this.constantMultiVector2(Math.pow(t, 2), endPos);
    return this.vector2Add(this.vector2Add(a, b), c);
  }
  /**
   * 创建样式
   * @param start 开始点
   * @param end 结束点
   * @param color 填充颜色
   * @returns 返回`Style`
   */
  static createStyle(start: Coordinate, end: Coordinate, color?: string): Style {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const rotation = Math.atan2(dy, dx);
    const style = new Style({
      geometry: new Point(end),
      image: new Icon({
        src: arrowSvg,
        anchor: [0.75, 0.5],
        imgSize: [16, 16],
        rotateWithView: true,
        rotation: -rotation,
        color: color || '#ffcc33'
      })
    });
    return style;
  }
  /**
   * 动态点闪烁刷新方法
   * @param map 地图实例
   * @param feature `Point` 实例
   * @param param 详细参数，详见{@link IPointParam}
   * @param layer 所属矢量图层
   */
  static flash<T>(
    map: Map,
    feature: Feature<Geometry>,
    param: IPointParam<T>,
    layer: VectorLayer<VectorSource<Geometry>>
  ): void {
    const options = {
      duration: 1000,
      flashColor: param.flashColor || { R: 255, G: 0, B: 0 },
      isRepeat: true,
      size: param.size || 6,
      ...param
    };
    let start = Date.now();
    const geometry = feature.getGeometry();
    if (geometry) {
      const flashGeom = geometry.clone();
      const listenerKey = layer.on('postrender', (event: RenderEvent) => {
        const worldWidth = getWidth(map.getView().getProjection().getExtent());
        const center = <Coordinate>map.getView().getCenter();
        const offset = Math.floor(center[0] / worldWidth);
        const frameState = event.frameState;
        if (frameState) {
          const elapsed = frameState.time - start;
          if (elapsed >= options.duration) {
            if (options.isRepeat) {
              start = Date.now();
            } else {
              unByKey(listenerKey);
              return;
            }
          }
          const vectorContext = getVectorContext(event);
          const elapsedRatio = elapsed / options.duration;
          const radius = easeOut(elapsedRatio) * 10 + options.size;
          const opacity = easeOut(1 - elapsedRatio);
          const style = new Style({
            image: new CircleStyle({
              radius: radius,
              stroke: new Stroke({
                color: `rgba(${options.flashColor.R}, ${options.flashColor.G}, ${options.flashColor.B},${opacity})`,
                width: 0.25 + opacity
              })
            })
          });
          const flashGeomClone = flashGeom.clone();
          vectorContext.setStyle(style);
          flashGeomClone.translate(offset * worldWidth, 0);
          vectorContext.drawGeometry(flashGeomClone);
          flashGeomClone.translate(worldWidth, 0);
          vectorContext.drawGeometry(flashGeomClone);
          layer.changed();
        }
      });
      feature.set('listenerKey', listenerKey);
    }
  }

  /**
   * 角度转弧度
   * @param deg 角度 (degree)
   * @returns 弧度 (radian)
   * @example
   * const rad = Utils.deg2rad(90); // Math.PI / 2
   */
  static deg2rad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  /**
   * 弧度转角度
   * @param rad 弧度 (radian)
   * @returns 角度 (degree)
   * @example
   * const deg = Utils.rad2deg(Math.PI); // 180
   */
  static rad2deg(rad: number): number {
    const deg = (rad * 180) / Math.PI;
    return ((deg % 360) + 360) % 360;
  }

  /**
   * 函数节流：在等待窗口期内只执行一次
   *
   * 委托给 `lodash/throttle` 实现。返回的函数附带 `cancel` / `flush` 方法。
   * （注：原自实现版本曾提供 `pending`，lodash throttle 不暴露该方法，已移除。）
   * @param fn 需要节流的函数
   * @param wait 等待时间(ms)，默认100
   * @param options 配置: leading(默认true) / trailing(默认true)
   * @example
   * const onMove = Utils.throttle((e) => { console.log(e.pixel); }, 200);
   * map.on('pointermove', onMove);
   * onMove.cancel();
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 通用函数包装约束，需 any 表示任意函数签名
  static throttle<F extends (...args: any[]) => any>(
    fn: F,
    wait = 100,
    options: { leading?: boolean; trailing?: boolean } = {}
  ) {
    return throttle(fn, wait, options);
  }
}
