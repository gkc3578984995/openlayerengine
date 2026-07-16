import type Map from 'ol/Map.js';
import type View from 'ol/View.js';
import DragPan from 'ol/interaction/DragPan.js';
import { transform } from 'ol/proj.js';
import type { ProjectionLike } from 'ol/proj.js';
import type { Coordinate, Pixel } from '../core/common/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';
import {
  getCoordinateAtPixel,
  getWorldIndex,
  getWorldWidth,
  normalizeCoordinatesToViewWorld,
  restoreCoordinatesToWorld,
  translateCoordinatesToPixel as translateToPixel
} from '../adapters/openlayers/world.js';

/** 一组有序坐标。 */
type CoordinateLine = readonly Coordinate[];
/** 多组有序坐标。 */
type CoordinateRings = readonly CoordinateLine[];

/** 视图动画配置。 */
export interface ViewAnimationOptions {
  /** 动画时长，单位为毫秒。 */
  readonly duration?: number;
  /** 将线性动画进度映射为新的进度。 */
  readonly easing?: (progress: number) => number;
  /** 动画完成或取消时调用。 */
  readonly callback?: (completed: boolean) => void;
}

/** 飞行定位动画配置。 */
export interface FlyToOptions extends ViewAnimationOptions {
  /** 目标缩放级别；省略时保留当前值。 */
  readonly zoom?: number;
}

/** 控制地图 View、光标、拖拽和世界坐标的公开服务。 */
export interface ViewService {
  /** 供高级 OpenLayers 互操作使用的原生 View。 */
  readonly olView: View;
  /**
   * 获取当前中心点。
   *
   * @returns 当前中心点；View 尚未初始化时返回 `undefined`。
   *
   * @example
   * ```ts
   * const center = earth.view.getCenter();
   * ```
   */
  getCenter(): Coordinate | undefined;
  /**
   * 设置当前中心点。
   *
   * @param center 当前 View 投影下的中心点。
   *
   * @example
   * ```ts
   * earth.view.setCenter([12956817, 4851819]);
   * ```
   */
  setCenter(center: Coordinate): void;
  /**
   * 获取当前缩放级别。
   *
   * @returns 当前缩放级别；View 尚未初始化时返回 `undefined`。
   *
   * @example
   * ```ts
   * const zoom = earth.view.getZoom();
   * ```
   */
  getZoom(): number | undefined;
  /**
   * 设置当前缩放级别。
   *
   * @param zoom 新的缩放级别；数值越大视图越近。
   *
   * @example
   * ```ts
   * earth.view.setZoom(8);
   * ```
   */
  setZoom(zoom: number): void;
  /**
   * 以动画返回初始中心点。
   *
   * @param options 动画时长、缓动函数和完成回调。
   *
   * @example
   * ```ts
   * earth.view.flyHome({ duration: 800 });
   * ```
   */
  flyHome(options?: ViewAnimationOptions): void;
  /**
   * 以动画飞行到指定中心点。
   *
   * @param center 当前 View 投影下的目标中心点。
   * @param options 目标缩放级别、动画时长、缓动函数和完成回调。
   *
   * @example
   * ```ts
   * earth.view.animateFlyTo([12956817, 4851819], { zoom: 10, duration: 1200 });
   * ```
   */
  animateFlyTo(center: Coordinate, options?: FlyToOptions): void;
  /**
   * 立即定位到指定中心点。
   *
   * @param center 当前 View 投影下的目标中心点。
   * @param zoom 目标缩放级别；省略时保留当前值。
   *
   * @example
   * ```ts
   * earth.view.flyTo([12956817, 4851819], 10);
   * ```
   */
  flyTo(center: Coordinate, zoom?: number): void;
  /**
   * 将单个二维经纬度坐标转换为当前 View 的投影坐标。
   *
   * @param coordinates EPSG:4326 坐标，经度在前、纬度在后。
   * @returns 当前 View 投影下的新坐标。
   *
   * @example
   * ```ts
   * const center = earth.view.toProjectedCoordinates([120, 0]);
   * earth.elements.add({ geometry: { type: 'circle', center, radius: 1_000 } });
   * ```
   */
  toProjectedCoordinates(coordinates: readonly [number, number]): readonly [number, number];
  /**
   * 将经纬度坐标转换为当前 View 的投影坐标。
   *
   * @param coordinates EPSG:4326 坐标；扁平数组每两个数字为一组经纬度，嵌套数组每项可为二维或三维坐标。
   * @returns 当前 View 投影下的新坐标；结构与输入一致，三维坐标的第三项保持不变。
   *
   * @example
   * ```ts
   * const projected = earth.view.toProjectedCoordinates([120, 0, 110, 0]);
   * const projectedWithHeight = earth.view.toProjectedCoordinates([[120, 0, 500]]);
   * ```
   */
  toProjectedCoordinates(coordinates: readonly number[]): readonly number[];
  /**
   * 将嵌套经纬度坐标转换为当前 View 的投影坐标。
   *
   * @param coordinates EPSG:4326 坐标，每项可为二维或三维坐标。
   * @returns 当前 View 投影下的新坐标；三维坐标的第三项保持不变。
   *
   * @example
   * ```ts
   * const projected = earth.view.toProjectedCoordinates([
   *   [120, 0],
   *   [110, 0, 500]
   * ]);
   * ```
   */
  toProjectedCoordinates(coordinates: readonly (readonly number[])[]): readonly Coordinate[];
  /**
   * 将单个二维投影坐标转换为经纬度坐标。
   *
   * @param coordinates 当前 View 投影下的坐标。
   * @returns 新的 EPSG:4326 坐标，经度在前、纬度在后。
   *
   * @example
   * ```ts
   * const center = earth.view.toGeographicCoordinates(element.state.geometry.center);
   * ```
   */
  toGeographicCoordinates(coordinates: readonly [number, number]): readonly [number, number];
  /**
   * 将当前 View 的投影坐标转换为经纬度坐标。
   *
   * @param coordinates 当前 View 投影下的坐标；扁平数组每两个数字为一组，嵌套数组每项可为二维或三维坐标。
   * @returns 新的 EPSG:4326 坐标；结构与输入一致，三维坐标的第三项保持不变。
   *
   * @example
   * ```ts
   * const geographic = earth.view.toGeographicCoordinates(projected);
   * const geographicWithHeight = earth.view.toGeographicCoordinates(projectedWithHeight);
   * ```
   */
  toGeographicCoordinates(coordinates: readonly number[]): readonly number[];
  /**
   * 将嵌套投影坐标转换为经纬度坐标。
   *
   * @param coordinates 当前 View 投影下的坐标，每项可为二维或三维坐标。
   * @returns 新的 EPSG:4326 坐标；三维坐标的第三项保持不变。
   *
   * @example
   * ```ts
   * const geographic = earth.view.toGeographicCoordinates(projected);
   * ```
   */
  toGeographicCoordinates(coordinates: readonly (readonly number[])[]): readonly Coordinate[];
  /**
   * 设置地图光标。
   *
   * @param cursor 有效的 CSS cursor 值。
   *
   * @example
   * ```ts
   * earth.view.setCursor('pointer');
   * ```
   */
  setCursor(cursor: string): void;
  /**
   * 恢复默认光标。
   *
   *
   * @example
   * ```ts
   * earth.view.useDefaultCursor();
   * ```
   */
  useDefaultCursor(): void;
  /**
   * 使用十字光标。
   *
   *
   * @example
   * ```ts
   * earth.view.useCrosshairCursor();
   * ```
   */
  useCrosshairCursor(): void;
  /**
   * 开启或关闭地图拖拽。
   *
   * @param enabled `true` 允许拖拽，`false` 禁止拖拽。
   *
   * @example
   * ```ts
   * earth.view.setDragEnabled(false);
   * ```
   */
  setDragEnabled(enabled: boolean): void;
  /**
   * 获取当前投影的世界宽度。
   *
   * @returns 当前投影的世界宽度；投影没有有限范围时返回 `undefined`。
   *
   * @example
   * ```ts
   * const width = earth.view.worldWidth();
   * ```
   */
  worldWidth(): number | undefined;
  /**
   * 获取横坐标所在的世界副本索引。
   *
   * @param x 当前投影下的 X 值。
   * @returns 所在世界副本的索引；投影没有有限范围时返回 `undefined`。
   *
   * @example
   * ```ts
   * const index = earth.view.worldIndex(20037508.34);
   * ```
   */
  worldIndex(x: number): number | undefined;
  /**
   * 将单个坐标移动到当前视图所在的世界副本。
   *
   * @param coordinates 待归一化的投影坐标。
   * @returns 归一化后的新坐标。
   *
   * @example
   * ```ts
   * const point = earth.view.normalizeToViewWorld([0, 0]);
   * ```
   */
  normalizeToViewWorld(coordinates: Coordinate): Coordinate;
  /**
   * 将一组坐标移动到当前视图所在的世界副本。
   *
   * @param coordinates 待归一化的一组投影坐标。
   * @returns 归一化后的新坐标列表。
   *
   * @example
   * ```ts
   * const line = earth.view.normalizeToViewWorld([[0, 0], [10, 10]]);
   * ```
   */
  normalizeToViewWorld(coordinates: readonly Coordinate[]): readonly Coordinate[];
  /**
   * 将多组坐标移动到当前视图所在的世界副本。
   *
   * @param coordinates 待归一化的多组投影坐标。
   * @returns 归一化后的新坐标组。
   *
   * @example
   * ```ts
   * const rings = earth.view.normalizeToViewWorld([[[0, 0], [10, 0], [0, 0]]]);
   * ```
   */
  normalizeToViewWorld(coordinates: readonly (readonly Coordinate[])[]): readonly (readonly Coordinate[])[];
  /**
   * 将单个坐标恢复到指定世界副本。
   *
   * @param coordinates 待恢复的投影坐标。
   * @param index 目标世界副本索引；传 `undefined` 时只复制坐标。
   * @returns 恢复后的新坐标。
   *
   * @example
   * ```ts
   * const point = earth.view.restoreToWorld([0, 0], 1);
   * ```
   */
  restoreToWorld(coordinates: Coordinate, index: number | undefined): Coordinate;
  /**
   * 将一组坐标恢复到指定世界副本。
   *
   * @param coordinates 待恢复的一组投影坐标。
   * @param index 目标世界副本索引；传 `undefined` 时只复制坐标。
   * @returns 恢复后的新坐标列表。
   *
   * @example
   * ```ts
   * const line = earth.view.restoreToWorld([[0, 0], [10, 10]], 1);
   * ```
   */
  restoreToWorld(coordinates: readonly Coordinate[], index: number | undefined): readonly Coordinate[];
  /**
   * 将多组坐标恢复到指定世界副本。
   *
   * @param coordinates 待恢复的多组投影坐标。
   * @param index 目标世界副本索引；传 `undefined` 时只复制坐标。
   * @returns 恢复后的新坐标组。
   *
   * @example
   * ```ts
   * const rings = earth.view.restoreToWorld([[[0, 0], [10, 0], [0, 0]]], 1);
   * ```
   */
  restoreToWorld(coordinates: readonly (readonly Coordinate[])[], index: number | undefined): readonly (readonly Coordinate[])[];
  /**
   * 将屏幕坐标转换为地图坐标。
   *
   * @param pixel 以地图视口左上角为原点的屏幕坐标。
   * @returns 对应的地图坐标。无法换算时返回 `undefined`。
   *
   * @example
   * ```ts
   * const coordinate = earth.view.coordinateAtPixel([120, 80]);
   * ```
   */
  coordinateAtPixel(pixel: Pixel): Coordinate | undefined;
  /**
   * 平移单个坐标，使其中心落到指定屏幕位置。
   *
   * @param pixel 目标屏幕位置。
   * @param coordinates 待平移的投影坐标。
   * @returns 平移后的新坐标。无法换算时返回 `undefined`。
   *
   * @example
   * ```ts
   * const point = earth.view.translateCoordinatesToPixel([120, 80], [0, 0]);
   * ```
   */
  translateCoordinatesToPixel(pixel: Pixel, coordinates: Coordinate): Coordinate | undefined;
  /**
   * 平移一组坐标，使其中心落到指定屏幕位置。
   *
   * @param pixel 目标屏幕位置。
   * @param coordinates 待平移的一组投影坐标。
   * @returns 平移后的新坐标列表。无法换算时返回 `undefined`。
   *
   * @example
   * ```ts
   * const line = earth.view.translateCoordinatesToPixel([120, 80], [[0, 0], [10, 10]]);
   * ```
   */
  translateCoordinatesToPixel(pixel: Pixel, coordinates: readonly Coordinate[]): readonly Coordinate[] | undefined;
  /**
   * 平移多组坐标，使其中心落到指定屏幕位置。
   *
   * @param pixel 目标屏幕位置。
   * @param coordinates 待平移的多组投影坐标。
   * @returns 平移后的新坐标组。无法换算时返回 `undefined`。
   *
   * @example
   * ```ts
   * const rings = earth.view.translateCoordinatesToPixel([120, 80], [[[0, 0], [10, 0], [0, 0]]]);
   * ```
   */
  translateCoordinatesToPixel(pixel: Pixel, coordinates: readonly (readonly Coordinate[])[]): readonly (readonly Coordinate[])[] | undefined;
}

/** ViewService 依赖的实例级地图对象和光标端口。 */
interface ViewServiceContext {
  /** 地图对象。 */
  readonly map: Map;
  /** 原生视图。 */
  readonly olView: View;
  /** 地图视口。 */
  readonly viewport: HTMLElement;
  /** 更新交互光标基准值的可选入口。 */
  readonly setCursor?: (cursor: string) => void;
}

/** 归一化后的动画配置。 */
interface ParsedAnimationOptions {
  /** 动画时长。 */
  readonly duration: number;
  /** 缓动函数。 */
  readonly easing?: (progress: number) => number;
  /** 完成回调。 */
  readonly callback?: (completed: boolean) => void;
  /** 目标缩放级别。 */
  readonly zoom?: number;
}

/** ViewService 的内部实现。 */
export class ViewServiceImpl implements ViewService {
  /** 默认动画时长。 */
  static readonly DEFAULT_DURATION = 2_000;
  /** 返回初始位置时固定使用的缩放级别。 */
  static readonly HOME_ZOOM = 4;

  /** 原生视图。 */
  readonly olView: View;
  /** 地图对象。 */
  readonly #map: Map;
  /** 地图视口。 */
  readonly #viewport: HTMLElement;
  /** 更新外部光标基准值的入口。 */
  readonly #setCursor: (cursor: string) => void;
  /** 初始中心点。 */
  readonly #home: Coordinate;
  /** 防止销毁后继续访问。 */
  #disposed = false;

  /** 绑定地图、View、视口和初始中心点。 */
  constructor(context: ViewServiceContext, home?: readonly number[]) {
    this.#map = context.map;
    this.olView = context.olView;
    this.#viewport = context.viewport;
    this.#setCursor = context.setCursor ?? ((cursor) => (this.#viewport.style.cursor = cursor));
    const initialCenter = home ?? context.olView.getCenter();
    this.#home = initialCenter === undefined ? Object.freeze([0, 0]) : copyCoordinate(initialCenter, 'Home center');
  }

  /** 获取当前中心点。 */
  getCenter(): Coordinate | undefined {
    this.#assertActive();
    const center = this.olView.getCenter();
    return center === undefined ? undefined : copyCoordinate(center, 'View center');
  }

  /** 设置当前中心点。 */
  setCenter(center: Coordinate): void {
    this.#assertActive();
    this.olView.setCenter([...copyCoordinate(center, 'View center')]);
  }

  /** 获取当前缩放级别。 */
  getZoom(): number | undefined {
    this.#assertActive();
    const zoom = this.olView.getZoom();
    return zoom === undefined ? undefined : requireFinite(zoom, 'View zoom');
  }

  /** 设置当前缩放级别。 */
  setZoom(zoom: number): void {
    this.#assertActive();
    this.olView.setZoom(requireFinite(zoom, 'View zoom'));
  }

  /** 以动画返回初始中心点。 */
  flyHome(options?: ViewAnimationOptions): void {
    this.#assertActive();
    const parsed = inspectAnimationOptions(options, false);
    this.#animate(
      {
        center: [...this.#home],
        zoom: ViewServiceImpl.HOME_ZOOM,
        duration: parsed.duration,
        ...(parsed.easing === undefined ? {} : { easing: parsed.easing })
      },
      parsed.callback
    );
  }

  /** 以动画飞行到指定中心点。 */
  animateFlyTo(center: Coordinate, options?: FlyToOptions): void {
    this.#assertActive();
    const target = copyCoordinate(center, 'Fly-to center');
    const parsed = inspectAnimationOptions(options, true);
    const zoom = parsed.zoom ?? this.getZoom();
    this.#animate(
      {
        center: [...target],
        ...(zoom === undefined ? {} : { zoom }),
        duration: parsed.duration,
        ...(parsed.easing === undefined ? {} : { easing: parsed.easing })
      },
      parsed.callback
    );
  }

  /** 立即定位到指定中心点。 */
  flyTo(center: Coordinate, zoom?: number): void {
    this.#assertActive();
    const target = copyCoordinate(center, 'Fly-to center');
    this.olView.setCenter([...target]);
    if (zoom !== undefined) this.olView.setZoom(requireFinite(zoom, 'Fly-to zoom'));
  }

  /** 将 EPSG:4326 坐标转换为当前 View 的投影坐标。 */
  toProjectedCoordinates(coordinates: readonly [number, number]): readonly [number, number];
  toProjectedCoordinates(coordinates: readonly number[]): readonly number[];
  toProjectedCoordinates(coordinates: readonly (readonly number[])[]): CoordinateLine;
  /** 保持输入结构，统一处理扁平与嵌套坐标。 */
  toProjectedCoordinates(coordinates: readonly number[] | readonly (readonly number[])[]): readonly number[] | CoordinateLine {
    this.#assertActive();
    const projection = this.olView.getProjection();
    return transformCoordinateStructure(
      coordinates,
      (coordinate) => transformCoordinate(coordinate, 'EPSG:4326', projection, 'Geographic coordinates'),
      'Geographic coordinates'
    );
  }

  /** 将当前 View 的投影坐标转换为经纬度坐标。 */
  toGeographicCoordinates(coordinates: readonly [number, number]): readonly [number, number];
  toGeographicCoordinates(coordinates: readonly number[]): readonly number[];
  toGeographicCoordinates(coordinates: readonly (readonly number[])[]): CoordinateLine;
  /** 保持输入结构，统一处理扁平与嵌套坐标。 */
  toGeographicCoordinates(coordinates: readonly number[] | readonly (readonly number[])[]): readonly number[] | CoordinateLine {
    this.#assertActive();
    const projection = this.olView.getProjection();
    return transformCoordinateStructure(
      coordinates,
      (coordinate) => transformCoordinate(coordinate, projection, 'EPSG:4326', 'Projected coordinates'),
      'Projected coordinates'
    );
  }

  /** 设置地图光标。 */
  setCursor(cursor: string): void {
    this.#assertActive();
    if (typeof cursor !== 'string' || cursor.trim().length === 0) throw new InvalidArgumentError('Cursor must be a non-empty string');
    this.#setCursor(cursor);
  }

  /** 恢复默认光标。 */
  useDefaultCursor(): void {
    this.setCursor('auto');
  }

  /** 使用十字光标。 */
  useCrosshairCursor(): void {
    this.setCursor('crosshair');
  }

  /** 开启或关闭地图拖拽。 */
  setDragEnabled(enabled: boolean): void {
    this.#assertActive();
    if (typeof enabled !== 'boolean') throw new InvalidArgumentError('Drag enabled must be a boolean');
    this.#map.getInteractions().forEach((interaction) => {
      if (interaction instanceof DragPan) interaction.setActive(enabled);
    });
  }

  /** 获取当前投影的世界宽度。 */
  worldWidth(): number | undefined {
    this.#assertActive();
    return getWorldWidth(this.olView);
  }

  /** 获取横坐标所在的世界副本索引。 */
  worldIndex(x: number): number | undefined {
    this.#assertActive();
    return getWorldIndex(this.olView, x);
  }

  /** 将坐标移动到当前视图所在的世界副本。 */
  normalizeToViewWorld(coordinates: Coordinate): Coordinate;
  normalizeToViewWorld(coordinates: CoordinateLine): CoordinateLine;
  normalizeToViewWorld(coordinates: CoordinateRings): CoordinateRings;
  /** 保持输入层级，统一处理单点、线和多组坐标。 */
  normalizeToViewWorld(coordinates: Coordinate | CoordinateLine | CoordinateRings): Coordinate | CoordinateLine | CoordinateRings {
    this.#assertActive();
    return normalizeCoordinatesToViewWorld(this.olView, coordinates as CoordinateRings);
  }

  /** 将坐标恢复到指定世界副本。 */
  restoreToWorld(coordinates: Coordinate, index: number | undefined): Coordinate;
  restoreToWorld(coordinates: CoordinateLine, index: number | undefined): CoordinateLine;
  restoreToWorld(coordinates: CoordinateRings, index: number | undefined): CoordinateRings;
  /** 保持输入层级，统一处理单点、线和多组坐标。 */
  restoreToWorld(coordinates: Coordinate | CoordinateLine | CoordinateRings, index: number | undefined): Coordinate | CoordinateLine | CoordinateRings {
    this.#assertActive();
    return restoreCoordinatesToWorld(this.olView, coordinates as CoordinateRings, index);
  }

  /** 将屏幕坐标转换为地图坐标。 */
  coordinateAtPixel(pixel: Pixel): Coordinate | undefined {
    this.#assertActive();
    return getCoordinateAtPixel(this.#map, pixel);
  }

  /** 平移坐标，使其中心落到指定屏幕位置。 */
  translateCoordinatesToPixel(pixel: Pixel, coordinates: Coordinate): Coordinate | undefined;
  translateCoordinatesToPixel(pixel: Pixel, coordinates: CoordinateLine): CoordinateLine | undefined;
  translateCoordinatesToPixel(pixel: Pixel, coordinates: CoordinateRings): CoordinateRings | undefined;
  /** 保持输入层级，统一处理单点、线和多组坐标。 */
  translateCoordinatesToPixel(
    pixel: Pixel,
    coordinates: Coordinate | CoordinateLine | CoordinateRings
  ): Coordinate | CoordinateLine | CoordinateRings | undefined {
    this.#assertActive();
    return translateToPixel(this.#map, this.olView, pixel, coordinates as CoordinateRings);
  }

  /** 销毁视图服务并取消动画。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.olView.cancelAnimations();
  }

  /** 调用原生视图动画。 */
  #animate(options: Parameters<View['animate']>[0], callback: ((completed: boolean) => void) | undefined): void {
    if (callback === undefined) this.olView.animate(options);
    else this.olView.animate(options, callback);
  }

  /** 拒绝销毁后的服务调用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('ViewService has been destroyed');
  }
}

/** 校验动画配置，并补齐默认值。 */
function inspectAnimationOptions(options: ViewAnimationOptions | FlyToOptions | undefined, allowZoom: boolean): ParsedAnimationOptions {
  if (options === undefined) return { duration: ViewServiceImpl.DEFAULT_DURATION };
  const record = inspectRecord(options, 'View animation options');
  const allowed = allowZoom ? new Set(['duration', 'easing', 'callback', 'zoom']) : new Set(['duration', 'easing', 'callback']);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown view animation option: ${String(key)}`);
  }
  const duration = hasOwn(record, 'duration') ? requireNonNegative(record.duration, 'Animation duration') : ViewServiceImpl.DEFAULT_DURATION;
  const easing = hasOwn(record, 'easing') ? requireFunction<(progress: number) => number>(record.easing, 'Animation easing') : undefined;
  const callback = hasOwn(record, 'callback') ? requireFunction<(completed: boolean) => void>(record.callback, 'Animation callback') : undefined;
  const zoom = allowZoom && hasOwn(record, 'zoom') ? requireFinite(record.zoom, 'Fly-to zoom') : undefined;
  return {
    duration,
    ...(easing === undefined ? {} : { easing }),
    ...(callback === undefined ? {} : { callback }),
    ...(zoom === undefined ? {} : { zoom })
  };
}

/** 校验并复制只含数据属性的普通对象。 */
function inspectRecord(value: unknown, label: string): Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
    const record = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} fields must be data properties`);
      record[key] = descriptor.value;
    }
    return record;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

/** 检查并复制二维或三维坐标。 */
function copyCoordinate(value: unknown, label: string): Coordinate {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  const numbers: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} items must be data properties`);
    numbers.push(requireFinite(descriptor.value, label));
  }
  return Object.freeze(numbers) as Coordinate;
}

/** 转换扁平或单层嵌套坐标，同时保持输入结构。 */
function transformCoordinateStructure(
  value: unknown,
  transformCoordinate: (coordinate: Coordinate) => readonly number[],
  label: string
): readonly number[] | CoordinateLine {
  const items = inspectArrayItems(value, label);
  if (items.length === 0) throw new InvalidArgumentError(`${label} cannot be empty`);

  if (isArrayValue(items[0], `${label}[0]`)) {
    const coordinates = items.map((item, index) => {
      const coordinate = inspectCoordinate(item, `${label}[${index}]`);
      return copyCoordinate(transformCoordinate(coordinate), `${label}[${index}] result`);
    });
    return Object.freeze(coordinates);
  }

  if (items.length % 2 !== 0) throw new InvalidArgumentError(`${label} flat array must contain coordinate pairs`);
  const transformed: number[] = [];
  for (let index = 0; index < items.length; index += 2) {
    const coordinate = Object.freeze([
      requireFinite(items[index], `${label}[${index}]`),
      requireFinite(items[index + 1], `${label}[${index + 1}]`)
    ]) as Coordinate;
    const result = copyCoordinate(transformCoordinate(coordinate), `${label}[${index / 2}] result`);
    transformed.push(result[0], result[1]);
  }
  return Object.freeze(transformed);
}

/** 转换单个坐标，并将底层投影异常统一为公共参数错误。 */
function transformCoordinate(coordinate: Coordinate, source: ProjectionLike, destination: ProjectionLike, label: string): readonly number[] {
  try {
    return transform([...coordinate], source, destination);
  } catch {
    throw new InvalidArgumentError(`${label} cannot be transformed with the current View projection`);
  }
}

/** 安全判断数组，屏蔽不可读取代理对象抛出的异常。 */
function isArrayValue(value: unknown, label: string): boolean {
  try {
    return Array.isArray(value);
  } catch {
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

/** 检查二维或三维坐标。 */
function inspectCoordinate(value: unknown, label: string): Coordinate {
  const items = inspectArrayItems(value, label);
  if (items.length !== 2 && items.length !== 3) throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  return Object.freeze(items.map((item, index) => requireFinite(item, `${label}[${index}]`))) as Coordinate;
}

/** 从普通数组中安全读取数据项。 */
function inspectArrayItems(value: unknown, label: string): readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new InvalidArgumentError(`${label} must be an array`);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (lengthDescriptor === undefined || !('value' in lengthDescriptor)) throw new InvalidArgumentError(`${label} must have a data length`);
    const length = lengthDescriptor.value as number;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1) throw new InvalidArgumentError(`${label} cannot contain extra properties`);

    const items: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} cannot contain holes or accessor properties`);
      items.push(descriptor.value);
    }
    return items;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

/** 读取大于或等于零的有限数字。 */
function requireNonNegative(value: unknown, label: string): number {
  const number = requireFinite(value, label);
  if (number < 0) throw new InvalidArgumentError(`${label} must be non-negative`);
  return number;
}

/** 读取有限数字。 */
function requireFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidArgumentError(`${label} must be finite`);
  return value;
}

/** 读取函数。 */
function requireFunction<T extends (...args: never[]) => unknown>(value: unknown, label: string): T {
  if (typeof value !== 'function') throw new InvalidArgumentError(`${label} must be a function`);
  return value as T;
}

/** 判断对象是否直接拥有指定属性。 */
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
