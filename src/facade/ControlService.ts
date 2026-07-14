import Map from 'ol/Map.js';
import ScaleLine, { type Options as OlScaleLineOptions } from 'ol/control/ScaleLine.js';
import Graticule, { type Options as OlGraticuleOptions } from 'ol/layer/Graticule.js';
import Stroke from 'ol/style/Stroke.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';

export type GraticuleOptions = OlGraticuleOptions;
export type ScaleLineOptions = OlScaleLineOptions;

export interface ControlService {
  readonly graticule: Graticule | undefined;
  readonly scaleLine: ScaleLine | undefined;
  enableGraticule(options?: GraticuleOptions): Graticule;
  disableGraticule(): void;
  enableScaleLine(options?: ScaleLineOptions): ScaleLine;
  disableScaleLine(): void;
}

interface ControlServiceContext {
  readonly map: Map;
}

export class ControlServiceImpl implements ControlService {
  readonly #map: Map;
  #graticule: Graticule | undefined;
  #scaleLine: ScaleLine | undefined;
  #disposed = false;

  constructor(context: ControlServiceContext) {
    this.#map = context.map;
  }

  get graticule(): Graticule | undefined {
    return this.#graticule;
  }

  get scaleLine(): ScaleLine | undefined {
    return this.#scaleLine;
  }

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

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('ControlService has been destroyed');
  }
}

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
