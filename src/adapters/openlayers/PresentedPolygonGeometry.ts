import Polygon from 'ol/geom/Polygon.js';
import type { Coordinate } from '../../core/common/types.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type { RenderTextLabel } from '../../core/shape/types.js';

type PolygonCoordinates = readonly (readonly Coordinate[])[];

/**
 * 同时承载 Callout 显式文本定位信息的 Polygon。
 *
 * label 只属于 OpenLayers 展示帧，不写入 Feature 属性，也不会进入公共几何详情。
 */
export class PresentedPolygonGeometry extends Polygon {
  #label: RenderTextLabel | undefined;

  constructor(coordinates: PolygonCoordinates, label?: RenderTextLabel, worldOffset = 0) {
    super(copyPolygonCoordinates(coordinates, worldOffset));
    this.#label = copyLabel(label, worldOffset);
  }

  /** 返回不可变的当前帧文本定位快照。 */
  getPresentationLabel(): RenderTextLabel | undefined {
    return this.#label;
  }

  /** 更新显式文本定位；只有内容发生变化时才推进 Geometry revision。 */
  setPresentationLabel(label?: RenderTextLabel, worldOffset = 0): void {
    const next = copyLabel(label, worldOffset);
    if (labelsEqual(this.#label, next)) return;
    this.#label = next;
    this.changed();
  }

  /** world-wrap 与 Transform 的原生平移必须同步移动显式文本定位点。 */
  override translate(deltaX: number, deltaY: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) throw new InvalidArgumentError('Presented Polygon translation must be finite');
    if (this.#label !== undefined) this.#label = translatedLabel(this.#label, deltaX, deltaY);
    super.translate(deltaX, deltaY);
  }

  override clone(): PresentedPolygonGeometry {
    const clone = new PresentedPolygonGeometry(this.getCoordinates() as unknown as PolygonCoordinates, this.#label);
    clone.applyProperties(this);
    return clone;
  }
}

/** 从任意 OL Geometry 安全读取显式文本定位信息。 */
export function presentationLabel(geometry: object | undefined): RenderTextLabel | undefined {
  return geometry instanceof PresentedPolygonGeometry ? geometry.getPresentationLabel() : undefined;
}

/** 为 Adapter 的创建路径统一复制 Polygon 与可选 label。 */
export function createPresentedPolygonGeometry(
  state: Extract<import('../../core/shape/types.js').RenderGeometryState, { type: 'polygon' }>,
  worldOffset = 0
): PresentedPolygonGeometry {
  return new PresentedPolygonGeometry(state.coordinates, state.label, worldOffset);
}

/** 为 Adapter 的原位更新路径统一同步可选 label。 */
export function updatePresentationLabel(geometry: Polygon, label: RenderTextLabel | undefined, worldOffset = 0): void {
  if (geometry instanceof PresentedPolygonGeometry) geometry.setPresentationLabel(label, worldOffset);
}

/** 复制 Polygon 坐标，并只在 X 轴应用展示世界偏移。 */
export function copyPolygonCoordinates(coordinates: PolygonCoordinates, worldOffset = 0): number[][][] {
  if (worldOffset === 0) {
    for (const ring of coordinates) for (const coordinate of ring) assertCoordinate(coordinate, worldOffset);
    return coordinates as unknown as number[][][];
  }
  return coordinates.map((ring) => ring.map((coordinate) => copyCoordinate(coordinate, worldOffset)));
}

function copyLabel(label: RenderTextLabel | undefined, worldOffset: number): RenderTextLabel | undefined {
  if (label === undefined) return undefined;
  if (typeof label.text !== 'string') throw new InvalidArgumentError('Presented Polygon label text must be a string');
  const coordinate = copyCoordinate(label.coordinate, worldOffset);
  return Object.freeze({ coordinate: Object.freeze(coordinate) as Coordinate, text: label.text });
}

function translatedLabel(label: RenderTextLabel, deltaX: number, deltaY: number): RenderTextLabel {
  const coordinate = label.coordinate;
  const translated: Coordinate =
    coordinate.length === 3 ? [coordinate[0] + deltaX, coordinate[1] + deltaY, coordinate[2]] : [coordinate[0] + deltaX, coordinate[1] + deltaY];
  return Object.freeze({ coordinate: Object.freeze(translated), text: label.text });
}

function copyCoordinate(coordinate: Coordinate, worldOffset: number): number[] {
  assertCoordinate(coordinate, worldOffset);
  return coordinate.length === 3 ? [coordinate[0] + worldOffset, coordinate[1], coordinate[2]] : [coordinate[0] + worldOffset, coordinate[1]];
}

function assertCoordinate(coordinate: Coordinate, worldOffset: number): void {
  if (
    (coordinate.length !== 2 && coordinate.length !== 3) ||
    !coordinate.every(Number.isFinite) ||
    !Number.isFinite(worldOffset) ||
    !Number.isFinite(coordinate[0] + worldOffset)
  ) {
    throw new InvalidArgumentError('Presented Polygon coordinate must contain finite values');
  }
}

function labelsEqual(left: RenderTextLabel | undefined, right: RenderTextLabel | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.text === right.text && left.coordinate.length === right.coordinate.length && left.coordinate.every((value, index) => value === right.coordinate[index])
  );
}
