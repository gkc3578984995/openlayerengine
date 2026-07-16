import { InvalidArgumentError } from '../errors.js';
import type { Coordinate } from './types.js';

/**
 * 水平环绕计算使用的二维投影范围。
 *
 * @internal
 */
export type WorldExtent = readonly [minX: number, minY: number, maxX: number, maxY: number];

/**
 * 一个可水平重复世界的原点和宽度。
 *
 * @internal
 */
export interface HorizontalWorld {
  /** 规范世界的最小 X 坐标。 */
  readonly minX: number;
  /** 单个世界副本的正有限宽度。 */
  readonly width: number;
}

/**
 * 编辑世界坐标在提交时所需的规范化交接信息。
 *
 * @internal
 */
export type WorldEditHandoff =
  | Readonly<{
      /** 无需世界转换的交接类型。 */
      kind: 'identity';
    }>
  | Readonly<{
      /** 需要在提交时恢复规范世界的交接类型。 */
      kind: 'wrapped';
      /** 编辑期间使用的水平世界快照。 */
      world: HorizontalWorld;
    }>;

/**
 * 放置到当前编辑世界副本中的控制点及其提交交接信息。
 *
 * @internal
 */
export interface PreparedWorldEdit {
  /** 已复制并移动到同一编辑世界副本的控制点。 */
  readonly controlPoints: readonly Coordinate[];
  /** 成功提交时用于恢复规范世界的交接信息。 */
  readonly handoff: WorldEditHandoff;
}

/**
 * 视图世界副本计算所需的投影范围和视图中心。
 *
 * @internal
 */
export interface ViewWorldContext {
  /** 投影的规范世界范围。 */
  readonly extent: WorldExtent;
  /** 当前视图中心的 X 坐标。 */
  readonly viewCenterX: number;
}

/** 默认交接信息，表示坐标不需要切换世界副本。 */
const identityHandoff: WorldEditHandoff = Object.freeze({ kind: 'identity' });

/**
 * 从投影范围创建稳定的水平世界快照。
 *
 * @param extent 投影范围；缺失或无效时不产生世界元数据。
 * @param enabled 目标图层和投影是否共同启用水平环绕。
 * @returns 有效时返回冻结的世界快照，否则返回 `undefined`。
 * @internal
 */
export function horizontalWorldFromExtent(extent: readonly number[] | undefined, enabled: boolean): HorizontalWorld | undefined {
  if (!enabled || extent === undefined || extent.length !== 4 || !extent.every(Number.isFinite)) return undefined;
  const width = extent[2] - extent[0];
  if (!Number.isFinite(width) || width <= 0) return undefined;
  return Object.freeze({ minX: extent[0], width });
}

/**
 * 计算 X 坐标所在的水平世界副本索引。
 *
 * @param x 要定位的有限 X 坐标。
 * @param world 水平世界原点和宽度。
 * @returns 相对规范世界的整数副本索引。
 * @throws `InvalidArgumentError` 坐标或世界配置无效时抛出。
 * @internal
 */
export function horizontalWorldIndex(x: number, world: HorizontalWorld): number {
  assertWorld(world);
  if (!Number.isFinite(x)) throw new InvalidArgumentError('World coordinate X must be finite');
  const normalized = (x - world.minX) / world.width;
  if (!Number.isFinite(normalized)) throw new InvalidArgumentError('World index exceeds the finite numeric range');
  return Math.floor(normalized);
}

/**
 * 将进入编辑时的控制点整体移动到距离参考 X 最近的同一世界副本。
 *
 * @param controlPoints 规范世界控制点；函数会创建独立副本。
 * @param options 可选水平世界和参考 X；省略世界时保持坐标位置。
 * @returns 冻结的编辑放置结果和提交交接信息。
 * @throws `InvalidArgumentError` 坐标、世界或参考 X 无效时抛出。
 * @internal
 */
export function prepareWorldEdit(
  controlPoints: readonly Coordinate[],
  options: { readonly world?: HorizontalWorld; readonly referenceX?: number }
): PreparedWorldEdit {
  const clones = cloneCoordinates(controlPoints);
  const world = options.world === undefined ? undefined : snapshotWorld(options.world);
  if (world === undefined || clones.length === 0) return Object.freeze({ controlPoints: clones, handoff: identityHandoff });
  const referenceX = options.referenceX ?? clones[0][0];
  if (!Number.isFinite(referenceX)) throw new InvalidArgumentError('World edit reference X must be finite');
  const offset = nearestWorldOffset(clones[0][0], referenceX, world);
  return Object.freeze({
    controlPoints: shiftCoordinates(clones, offset),
    handoff: Object.freeze({ kind: 'wrapped' as const, world })
  });
}

/**
 * 将单个输入坐标放置到距离当前编辑参考点最近的世界副本。
 *
 * @param coordinate 要放置的坐标；函数会创建独立副本。
 * @param referenceX 当前编辑几何的有限参考 X。
 * @param handoff Edit Session 的世界交接信息。
 * @returns 放置后的坐标副本。
 * @throws `InvalidArgumentError` 坐标、参考 X 或世界配置无效时抛出。
 * @internal
 */
export function placeCoordinateInEditWorld(coordinate: Coordinate, referenceX: number, handoff: WorldEditHandoff): Coordinate {
  const clone = cloneCoordinate(coordinate);
  if (handoff.kind === 'identity') return clone;
  if (!Number.isFinite(referenceX)) throw new InvalidArgumentError('World edit reference X must be finite');
  const offset = nearestWorldOffset(clone[0], referenceX, handoff.world);
  return shiftCoordinate(clone, offset);
}

/**
 * 将完成编辑的控制点整体恢复到规范世界副本。
 *
 * @param controlPoints 编辑世界中的控制点；函数会创建独立副本。
 * @param handoff 进入编辑时生成的世界交接信息。
 * @returns 规范世界控制点副本。
 * @throws `InvalidArgumentError` 坐标或世界配置无效时抛出。
 * @internal
 */
export function canonicalizeWorldEdit(controlPoints: readonly Coordinate[], handoff: WorldEditHandoff): readonly Coordinate[] {
  const clones = cloneCoordinates(controlPoints);
  if (handoff.kind === 'identity') return clones;
  assertWorld(handoff.world);
  if (clones.length === 0) return clones;
  const sourceWorld = horizontalWorldIndex(clones[0][0], handoff.world);
  const offset = -sourceWorld * handoff.world.width;
  if (!Number.isFinite(offset)) throw new InvalidArgumentError('Canonical world offset exceeds the finite numeric range');
  return shiftCoordinates(clones, offset);
}

/**
 * 将坐标移动到距离参考坐标最近的世界副本。
 *
 * @param reference 目标世界副本中的参考坐标。
 * @param coordinate 要移动的坐标。
 * @param extent 投影的规范世界范围。
 * @returns 移动后的坐标副本。
 * @throws `InvalidArgumentError` 坐标或范围无效时抛出。
 * @internal
 */
export function shiftCoordinateToNearestWorld(reference: Coordinate, coordinate: Coordinate, extent: WorldExtent): Coordinate {
  const referenceClone = cloneCoordinate(reference);
  const coordinateClone = cloneCoordinate(coordinate);
  const world = horizontalWorldFromExtent(extent, true);
  if (world === undefined) return coordinateClone;
  return placeCoordinateInEditWorld(coordinateClone, referenceClone[0], { kind: 'wrapped', world });
}

/**
 * 将一组坐标整体移动到当前视图中心所在的世界副本。
 *
 * @param coordinates 要移动的坐标列表。
 * @param context 投影范围与视图中心上下文。
 * @returns 移动后的坐标副本列表。
 * @throws `InvalidArgumentError` 坐标、范围或视图中心无效时抛出。
 * @internal
 */
export function shiftCoordinatesToViewWorld(coordinates: readonly Coordinate[], context: ViewWorldContext): readonly Coordinate[] {
  const world = horizontalWorldFromExtent(context.extent, true);
  return prepareWorldEdit(coordinates, { world, referenceX: context.viewCenterX }).controlPoints;
}

/**
 * 将一组坐标整体恢复到投影的规范世界副本。
 *
 * @param coordinates 要规范化的坐标列表。
 * @param extent 投影的规范世界范围。
 * @returns 规范世界坐标副本列表。
 * @throws `InvalidArgumentError` 坐标或范围无效时抛出。
 * @internal
 */
export function shiftCoordinatesToCanonicalWorld(coordinates: readonly Coordinate[], extent: WorldExtent): readonly Coordinate[] {
  const world = horizontalWorldFromExtent(extent, true);
  return canonicalizeWorldEdit(coordinates, world === undefined ? identityHandoff : { kind: 'wrapped', world });
}

/** 计算坐标移到参考位置附近所需的水平偏移量。 */
function nearestWorldOffset(x: number, referenceX: number, world: HorizontalWorld): number {
  assertWorld(world);
  if (!Number.isFinite(x)) throw new InvalidArgumentError('World coordinate X must be finite');
  const difference = referenceX - x;
  if (!Number.isFinite(difference)) throw new InvalidArgumentError('World-copy distance exceeds the finite numeric range');
  const offset = Math.round(difference / world.width) * world.width;
  if (!Number.isFinite(offset)) throw new InvalidArgumentError('World-copy offset exceeds the finite numeric range');
  return offset;
}

/** 使用同一个水平偏移量移动一组坐标。 */
function shiftCoordinates(coordinates: readonly Coordinate[], offset: number): Coordinate[] {
  const shifted = new Array<Coordinate>(coordinates.length);
  for (let index = 0; index < coordinates.length; index += 1) shifted[index] = shiftCoordinate(coordinates[index], offset);
  return shifted;
}

/** 移动单个坐标的水平位置。 */
function shiftCoordinate(coordinate: Coordinate, offset: number): Coordinate {
  assertCoordinate(coordinate);
  const x = coordinate[0] + offset;
  if (!Number.isFinite(x)) throw new InvalidArgumentError('Shifted world coordinate exceeds the finite numeric range');
  return coordinate.length === 3 ? [x, coordinate[1], coordinate[2]] : [x, coordinate[1]];
}

/** 检查水平世界配置是否有效。 */
function assertWorld(world: HorizontalWorld): void {
  if (!Number.isFinite(world.minX) || !Number.isFinite(world.width) || world.width <= 0) {
    throw new InvalidArgumentError('Horizontal world requires a finite origin and positive width');
  }
}

/** 检查坐标是否包含有效数字。 */
function assertCoordinate(coordinate: Coordinate): void {
  if ((coordinate.length !== 2 && coordinate.length !== 3) || !coordinate.every(Number.isFinite)) {
    throw new InvalidArgumentError('World coordinate must contain two or three finite numbers');
  }
}

/** 创建不可变的水平世界快照。 */
function snapshotWorld(world: HorizontalWorld): HorizontalWorld {
  const snapshot = { minX: world.minX, width: world.width };
  assertWorld(snapshot);
  return Object.freeze(snapshot);
}

/** 复制一组坐标，避免后续修改原数据。 */
function cloneCoordinates(coordinates: readonly Coordinate[]): Coordinate[] {
  return coordinates.map(cloneCoordinate);
}

/** 复制一个二维或三维坐标。 */
function cloneCoordinate(coordinate: Coordinate): Coordinate {
  assertCoordinate(coordinate);
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}
