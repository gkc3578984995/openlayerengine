import Map from 'ol/Map.js';
import ScaleLine, { type Options as OlScaleLineOptions } from 'ol/control/ScaleLine.js';
import Graticule, { type Options as OlGraticuleOptions } from 'ol/layer/Graticule.js';
import Stroke from 'ol/style/Stroke.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';

/** OpenLayers Graticule 的公开配置。 */
export type GraticuleOptions = OlGraticuleOptions;
/** OpenLayers ScaleLine 的公开配置。 */
export type ScaleLineOptions = OlScaleLineOptions;

/** 管理经纬网和比例尺的公开服务。 */
export interface ControlService {
  /** 经纬网。未启用时为 `undefined`。 */
  readonly graticule: Graticule | undefined;
  /** 比例尺。未启用时为 `undefined`。 */
  readonly scaleLine: ScaleLine | undefined;
  /**
   * 启用经纬网。
   *
   * 再次调用会先移除旧经纬网，再使用新配置创建。
   *
   * @param options 线样式、标签和层级等 Graticule 选项。
   * @returns 新创建的 OpenLayers 经纬网图层。
   *
   * @example
   * ```ts
   * const graticule = earth.controls.enableGraticule({ showLabels: true });
   * ```
   */
  enableGraticule(options?: GraticuleOptions): Graticule;
  /**
   * 关闭经纬网。
   *
   *
   * @example
   * ```ts
   * earth.controls.disableGraticule();
   * ```
   */
  disableGraticule(): void;
  /**
   * 启用比例尺。
   *
   * 再次调用会先移除旧比例尺，再使用新配置创建。
   *
   * @param options 单位、样式和最小宽度等 ScaleLine 选项。
   * @returns 新创建的 OpenLayers 比例尺控件。
   *
   * @example
   * ```ts
   * const scaleLine = earth.controls.enableScaleLine({ units: 'metric' });
   * ```
   */
  enableScaleLine(options?: ScaleLineOptions): ScaleLine;
  /**
   * 关闭比例尺。
   *
   *
   * @example
   * ```ts
   * earth.controls.disableScaleLine();
   * ```
   */
  disableScaleLine(): void;
}

/** ControlService 依赖的实例级地图对象。 */
interface ControlServiceContext {
  /** 地图对象。 */
  readonly map: Map;
}

/** ControlService 的内部实现。 */
export class ControlServiceImpl implements ControlService {
  /** 地图对象。 */
  readonly #map: Map;
  /** 当前经纬网图层。 */
  #graticule: Graticule | undefined;
  /** 当前比例尺控件。 */
  #scaleLine: ScaleLine | undefined;
  /** 服务是否已销毁。 */
  #disposed = false;

  /** 绑定控件服务所属的 OpenLayers Map。 */
  constructor(context: ControlServiceContext) {
    this.#map = context.map;
  }

  /** 获取当前经纬网。 */
  get graticule(): Graticule | undefined {
    return this.#graticule;
  }

  /** 获取当前比例尺。 */
  get scaleLine(): ScaleLine | undefined {
    return this.#scaleLine;
  }

  /** 启用经纬网。 */
  enableGraticule(options: GraticuleOptions = {}): Graticule {
    this.#assertActive();
    const inspected = copyOptions(options, 'Graticule options');
    this.disableGraticule();
    const properties = copyProperties(inspected.properties);
    const graticule = new Graticule({
      strokeStyle: new Stroke({ color: 'rgba(0, 0, 0, 0.3)', width: 1 }),
      showLabels: true,
      wrapX: true,
      lonLabelPosition: 0.985,
      latLabelPosition: 0.985,
      ...inspected,
      properties: { ...properties, layerType: 'graticule' }
    });
    graticule.setZIndex(inspected.zIndex ?? 9_999);
    try {
      this.#map.addLayer(graticule);
    } catch (error) {
      if (this.#map.getLayers().getArray().includes(graticule)) this.#graticule = graticule;
      throw error;
    }
    this.#graticule = graticule;
    return graticule;
  }

  /** 关闭经纬网。 */
  disableGraticule(): void {
    this.#assertActive();
    const graticule = this.#graticule;
    if (graticule === undefined) return;
    try {
      this.#map.removeLayer(graticule);
    } catch (error) {
      if (!this.#map.getLayers().getArray().includes(graticule)) this.#graticule = undefined;
      throw error;
    }
    this.#graticule = undefined;
  }

  /** 启用比例尺。 */
  enableScaleLine(options: ScaleLineOptions = {}): ScaleLine {
    this.#assertActive();
    const inspected = copyOptions(options, 'Scale line options');
    this.disableScaleLine();
    const scaleLine = new ScaleLine({ bar: true, text: true, minWidth: 100, ...inspected });
    try {
      this.#map.addControl(scaleLine);
    } catch (error) {
      if (this.#map.getControls().getArray().includes(scaleLine)) this.#scaleLine = scaleLine;
      throw error;
    }
    this.#scaleLine = scaleLine;
    return scaleLine;
  }

  /** 关闭比例尺。 */
  disableScaleLine(): void {
    this.#assertActive();
    const scaleLine = this.#scaleLine;
    if (scaleLine === undefined) return;
    try {
      this.#map.removeControl(scaleLine);
    } catch (error) {
      if (!this.#map.getControls().getArray().includes(scaleLine)) this.#scaleLine = undefined;
      throw error;
    }
    this.#scaleLine = undefined;
  }

  /** 销毁控件服务并移除已启用控件。 */
  destroy(): void {
    if (this.#disposed) return;
    let failed = false;
    let firstError: unknown;
    for (const disable of [() => this.disableGraticule(), () => this.disableScaleLine()]) {
      try {
        disable();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    this.#disposed = true;
    if (failed) throw firstError;
  }

  /** 拒绝销毁后的服务调用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('ControlService has been destroyed');
  }
}

/** 校验并浅复制控件配置，避免读取访问器属性。 */
function copyOptions<T extends object>(value: T, label: string): T {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
    const result = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} fields must be data properties`);
      result[key] = descriptor.value;
    }
    return result as T;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

/** 复制经纬网的自定义属性。 */
function copyProperties(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const copied = copyOptions(value as object, 'Graticule properties') as Record<PropertyKey, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(copied)) {
    if (typeof key !== 'string') throw new InvalidArgumentError('Graticule properties keys must be strings');
    result[key] = copied[key];
  }
  return result;
}
