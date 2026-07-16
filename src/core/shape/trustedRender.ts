import { InvalidArgumentError } from '../errors.js';
import type { Coordinate } from '../common/types.js';
import type { RenderGeometryState, ShapeDefinition, ShapeState } from './types.js';

/** 已知输入来自可信快照时可跳过重复状态规范化的内部渲染器。 */
type TrustedShapeRenderer = (state: ShapeState) => RenderGeometryState;

/** 更新 Session 规范状态控制点的内部快速路径。 */
type TrustedShapeMover = (state: ShapeState, index: number, coordinate: Coordinate) => ShapeState;

/** 快路径按 ShapeDefinition 身份隔离，避免外部定义因复用函数而意外继承。 */
const trustedShapeRenderers = new WeakMap<object, TrustedShapeRenderer>();

/** 可跳过旧状态重复规范化的控制点移动器，同样按定义身份隔离。 */
const trustedShapeMovers = new WeakMap<object, TrustedShapeMover>();

/** 标记可跳过重复快照校验的内置定义；注册表快照会显式继承此身份。 */
const trustedTransformDefinitions = new WeakSet<object>();

/** 为内置 ShapeDefinition 注册仅接收已校验快照的渲染快路径。 @internal */
export function registerTrustedShapeRenderer<S extends ShapeState>(definition: ShapeDefinition<S>, renderer: (state: S) => RenderGeometryState): void {
  trustedShapeRenderers.set(definition, renderer as TrustedShapeRenderer);
}

/** 为内置 ShapeDefinition 注册仅接收 Session 规范状态的控制点移动快路径。 @internal */
export function registerTrustedShapeMover<S extends ShapeState>(
  definition: ShapeDefinition<S>,
  mover: (state: S, index: number, coordinate: Coordinate) => S
): void {
  trustedShapeMovers.set(definition, mover as unknown as TrustedShapeMover);
}

/** 让 ShapeRegistry 快照继承原定义的可信渲染器。 @internal */
export function inheritTrustedShapeRenderer(source: ShapeDefinition, snapshot: ShapeDefinition): void {
  const renderer = trustedShapeRenderers.get(source);
  if (renderer !== undefined) trustedShapeRenderers.set(snapshot, renderer);
}

/** 让 ShapeRegistry 快照继承原定义的可信控制点移动器。 @internal */
export function inheritTrustedShapeMover(source: ShapeDefinition, snapshot: ShapeDefinition): void {
  const mover = trustedShapeMovers.get(source);
  if (mover !== undefined) trustedShapeMovers.set(snapshot, mover);
}

/** 标记变换不会破坏规范化和完成态约束的内置 ShapeDefinition。 @internal */
export function registerTrustedTransformDefinition(definition: ShapeDefinition): void {
  trustedTransformDefinitions.add(definition);
}

/** 让 ShapeRegistry 快照继承原定义的可信变换身份。 @internal */
export function inheritTrustedTransformDefinition(source: ShapeDefinition, snapshot: ShapeDefinition): void {
  if (trustedTransformDefinitions.has(source)) trustedTransformDefinitions.add(snapshot);
}

/** 判断 ShapeDefinition 是否允许直接派生变换快照。 @internal */
export function isTrustedTransformDefinition(definition: ShapeDefinition): boolean {
  return trustedTransformDefinitions.has(definition);
}

/**
 * 将已由 Element 快照隔离、校验并冻结的图形状态转换为渲染几何。
 *
 * 未登记快速路径的自定义定义仍调用公开 `toRenderGeometry`，保留其完整校验语义。
 * @internal
 */
export function renderTrustedShapeState<S extends ShapeState>(definition: ShapeDefinition<S>, state: S): RenderGeometryState {
  if (state.type !== definition.type) throw new InvalidArgumentError('Trusted shape state type must match its definition');
  const renderer = trustedShapeRenderers.get(definition);
  return renderer === undefined ? definition.toRenderGeometry(state) : renderer(state);
}

/**
 * 更新 EditSession 持有的规范图形状态；内置定义跳过旧状态重复校验，外部定义仍走完整拓扑契约。
 * @internal
 */
export function moveTrustedShapeState<S extends ShapeState>(definition: ShapeDefinition<S>, state: S, index: number, coordinate: Coordinate): S {
  if (state.type !== definition.type) throw new InvalidArgumentError('Trusted shape state type must match its definition');
  const topology = definition.editTopology;
  if (topology === undefined) throw new InvalidArgumentError(`Shape does not support control-point editing: ${definition.type}`);
  const mover = trustedShapeMovers.get(definition);
  return (mover === undefined ? topology.move(state, index, coordinate) : mover(state, index, coordinate)) as S;
}

/** 读取内置规范状态中的单个控制点；外部 ShapeDefinition 返回 `undefined`。 @internal */
export function trustedShapeControlPointAt<S extends ShapeState>(definition: ShapeDefinition<S>, state: S, index: number): Coordinate | undefined {
  if (!trustedShapeMovers.has(definition) || !Number.isSafeInteger(index) || index < 0) return undefined;
  const controlPoints = (state as ShapeState & { readonly controlPoints?: readonly Coordinate[] }).controlPoints;
  return controlPoints?.[index];
}

/** 判断控制点移动结果是否已由内置规范化路径保证完成态。 @internal */
export function isTrustedShapeMoveDefinition(definition: ShapeDefinition): boolean {
  return trustedShapeMovers.has(definition);
}
