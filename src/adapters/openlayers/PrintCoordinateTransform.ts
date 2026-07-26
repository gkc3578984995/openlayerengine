import type Map from 'ol/Map.js';
import { fromUserCoordinate } from 'ol/proj.js';
import type { Coordinate } from '../../core/common/types.js';
import { CapabilityError } from '../../core/errors.js';

export interface PrintViewTransform {
  readonly center: Coordinate;
  readonly resolution: number;
  readonly rotation: number;
  readonly size: readonly [width: number, height: number];
}

/**
 * 打印交互只处理 View 投影坐标，不经过 OpenLayers 的全局 userProjection。
 */
export function readPrintViewTransform(map: Map): Readonly<PrintViewTransform> {
  const view = map.getView();
  const publicCenter = view.getCenter();
  const center = publicCenter === undefined ? undefined : fromUserCoordinate(publicCenter, view.getProjection());
  const resolution = view.getResolution();
  const size = map.getSize();
  if (
    center === undefined ||
    center.length < 2 ||
    center.some((value) => !Number.isFinite(value)) ||
    resolution === undefined ||
    !Number.isFinite(resolution) ||
    resolution <= 0 ||
    size === undefined ||
    size.length < 2 ||
    size[0] <= 0 ||
    size[1] <= 0
  ) {
    throw new CapabilityError('当前地图 View 缺少可打印的尺寸、中心点或分辨率。');
  }
  return Object.freeze({
    center: Object.freeze([center[0], center[1]]) as Coordinate,
    resolution,
    rotation: view.getRotation(),
    size: Object.freeze([size[0], size[1]]) as readonly [number, number]
  });
}

export function printPixelToCoordinate(pixel: readonly [number, number], transform: Readonly<PrintViewTransform>): Coordinate {
  const x = (pixel[0] - transform.size[0] / 2) * transform.resolution;
  const y = (pixel[1] - transform.size[1] / 2) * transform.resolution;
  const sin = Math.sin(transform.rotation);
  const cos = Math.cos(transform.rotation);
  return Object.freeze([transform.center[0] + cos * x + sin * y, transform.center[1] + sin * x - cos * y]) as Coordinate;
}

export function printCoordinateToPixel(coordinate: Coordinate, transform: Readonly<PrintViewTransform>): readonly [number, number] {
  const x = coordinate[0] - transform.center[0];
  const y = coordinate[1] - transform.center[1];
  const sin = Math.sin(transform.rotation);
  const cos = Math.cos(transform.rotation);
  return Object.freeze([
    transform.size[0] / 2 + (cos * x + sin * y) / transform.resolution,
    transform.size[1] / 2 + (sin * x - cos * y) / transform.resolution
  ]);
}
