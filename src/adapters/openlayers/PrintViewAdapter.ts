import Map from 'ol/Map.js';
import type { EventsKey } from 'ol/events.js';
import { unByKey } from 'ol/Observable.js';
import { fromLonLat, getPointResolution, toLonLat } from 'ol/proj.js';
import type { Coordinate } from '../../core/common/types.js';
import { CapabilityError, ObjectDisposedError } from '../../core/errors.js';
import { printPixelToCoordinate, readPrintViewTransform } from './PrintCoordinateTransform.js';

export interface OpenLayersPrintViewSnapshot {
  readonly revision: number;
  readonly projectionCode: string;
  readonly center: Coordinate;
  readonly sourceExtent: readonly [number, number, number, number];
  readonly footprint: readonly [Coordinate, Coordinate, Coordinate, Coordinate];
  readonly resolution: number;
  readonly rotation: number;
  readonly metersPerViewUnit: number;
  readonly scaleVariesByPosition: boolean;
  readonly northAngle?: number;
}

/** 通过 OpenLayers 公共投影 API提供打印规划需要的 View 纯数据。 */
export class PrintViewAdapter {
  readonly #map: Map;
  readonly #listeners = new Set<() => void>();
  readonly #mapKeys: EventsKey[] = [];
  #viewKeys: EventsKey[] = [];
  #revision = 1;
  #disposed = false;

  constructor(map: Map) {
    this.#map = map;
    try {
      this.#mapKeys.push(map.on('change:size', this.#changed));
      this.#mapKeys.push(map.on('change:view', this.#onViewChanged));
      this.#bindView();
    } catch (error) {
      this.#releaseKeys(this.#viewKeys);
      this.#releaseKeys(this.#mapKeys);
      throw error;
    }
  }

  get revision(): number {
    return this.#revision;
  }

  snapshot(): Readonly<OpenLayersPrintViewSnapshot> {
    this.#assertActive();
    const view = this.#map.getView();
    const transform = readPrintViewTransform(this.#map);
    const { center, resolution, size } = transform;
    const footprint = [
      printPixelToCoordinate([0, 0], transform),
      printPixelToCoordinate([size[0], 0], transform),
      printPixelToCoordinate([size[0], size[1]], transform),
      printPixelToCoordinate([0, size[1]], transform)
    ] as [Coordinate, Coordinate, Coordinate, Coordinate];
    const sourceExtent = extentOf(footprint);
    const safeCenter = Object.freeze([center[0], center[1]]) as Coordinate;
    const metersPerViewUnit = this.metersPerViewUnitAt(safeCenter);
    let northAngle: number | undefined;
    try {
      northAngle = this.northAngleAt(safeCenter, view.getRotation());
    } catch {
      northAngle = undefined;
    }
    return Object.freeze({
      revision: this.#revision,
      projectionCode: view.getProjection().getCode(),
      center: safeCenter,
      sourceExtent,
      footprint: freezeFootprint(footprint),
      resolution,
      rotation: view.getRotation(),
      metersPerViewUnit,
      scaleVariesByPosition: this.scaleVariesByPositionAt(safeCenter, footprint),
      ...(northAngle === undefined ? {} : { northAngle })
    });
  }

  metersPerViewUnitAt(center: Coordinate): number {
    this.#assertActive();
    let value: number;
    try {
      value = getPointResolution(this.#map.getView().getProjection(), 1, [center[0], center[1]], 'm');
    } catch (cause) {
      throw new CapabilityError(`Current projection cannot calculate local scale: ${String(cause)}`);
    }
    if (!Number.isFinite(value) || value <= 0) throw new CapabilityError('Current projection cannot calculate a finite local scale');
    return value;
  }

  northAngleAt(center: Coordinate, rotation = this.#map.getView().getRotation()): number {
    this.#assertActive();
    const projection = this.#map.getView().getProjection();
    try {
      const lonLat = toLonLat([center[0], center[1]], projection);
      if (lonLat.some((value) => !Number.isFinite(value))) throw new Error('non-finite geographic center');
      if (Math.abs(lonLat[1]) >= 89.999) throw new Error('true north is undefined at the geographic poles');
      const latitudeStep = 0.0001;
      const north = fromLonLat([lonLat[0], lonLat[1] + latitudeStep], projection);
      const dx = north[0] - center[0];
      const dy = north[1] - center[1];
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || length <= 1e-9) throw new Error('degenerate geographic north vector');
      const sine = Math.sin(rotation);
      const cosine = Math.cos(rotation);
      const paperX = cosine * dx + sine * dy;
      const paperY = sine * dx - cosine * dy;
      return Math.atan2(paperX, -paperY);
    } catch (cause) {
      throw new CapabilityError(`Current projection cannot calculate true north: ${String(cause)}`);
    }
  }

  scaleVariesByPositionAt(center: Coordinate, footprint: readonly Coordinate[]): boolean {
    const centerValue = this.metersPerViewUnitAt(center);
    const projection = this.#map.getView().getProjection();
    try {
      return footprint.some((coordinate) => {
        const value = getPointResolution(projection, 1, [coordinate[0], coordinate[1]], 'm');
        return Number.isFinite(value) && Math.abs(value - centerValue) / centerValue > 1e-6;
      });
    } catch {
      return false;
    }
  }

  subscribe(listener: () => void): () => void {
    this.#assertActive();
    this.#listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#releaseKeys(this.#viewKeys);
    this.#releaseKeys(this.#mapKeys);
    this.#listeners.clear();
  }

  readonly #onViewChanged = (): void => {
    if (this.#disposed) return;
    this.#releaseKeys(this.#viewKeys);
    this.#bindView();
    this.#changed();
  };

  readonly #changed = (): void => {
    if (this.#disposed) return;
    this.#revision += 1;
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch {
        // View invalidation is best effort; Session owns listener error reporting.
      }
    }
  };

  #bindView(): void {
    if (this.#disposed) return;
    const view = this.#map.getView();
    this.#viewKeys.push(view.on('change:center', this.#changed));
    this.#viewKeys.push(view.on('change:resolution', this.#changed));
    this.#viewKeys.push(view.on('change:rotation', this.#changed));
  }

  #releaseKeys(keys: EventsKey[]): void {
    for (const key of keys.splice(0)) {
      const target = key?.target as { removeEventListener?: unknown; un?: (type: string, listener: EventsKey['listener']) => void } | undefined;
      try {
        if (typeof target?.removeEventListener === 'function') unByKey(key);
        else target?.un?.(key.type, key.listener);
      } catch {
        // 测试替身或已释放的 Observable 不能阻断 Earth 的其余清理。
      }
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('Print view adapter has been destroyed');
  }
}

function extentOf(footprint: readonly Coordinate[]): readonly [number, number, number, number] {
  const xs = footprint.map((coordinate) => coordinate[0]);
  const ys = footprint.map((coordinate) => coordinate[1]);
  return Object.freeze([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]) as readonly [number, number, number, number];
}

function freezeFootprint(footprint: readonly Coordinate[]): readonly [Coordinate, Coordinate, Coordinate, Coordinate] {
  return Object.freeze(footprint.map((coordinate) => Object.freeze([coordinate[0], coordinate[1]]) as Coordinate)) as unknown as readonly [
    Coordinate,
    Coordinate,
    Coordinate,
    Coordinate
  ];
}
