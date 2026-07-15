import { InvalidArgumentError } from '../errors.js';
import type { RenderGeometryState, ShapeDefinition, ShapeState } from './types.js';

/** 已知输入来自可信快照时可跳过重复状态规范化的内部渲染器。 */
type TrustedShapeRenderer = (state: ShapeState) => RenderGeometryState;

/** 按具体定义身份保存可信快照渲染器，避免复用公开函数的自定义定义意外继承快路径。 */
const trustedShapeRenderers = new WeakMap<object, TrustedShapeRenderer>();

/** 保存允许跳过重复快照校验的内置图形定义；注册表复制定义时会显式继承该身份。 */
const trustedTransformDefinitions = new WeakSet<object>();

/** 为图形定义登记只接受已校验快照的快速渲染器。 @internal */
export function registerTrustedShapeRenderer<S extends ShapeState>(definition: ShapeDefinition<S>, renderer: (state: S) => RenderGeometryState): void {
  trustedShapeRenderers.set(definition, renderer as TrustedShapeRenderer);
}

/** 让 ShapeRegistry 的不可变定义快照继承原定义的可信渲染器。@internal */
export function inheritTrustedShapeRenderer(source: ShapeDefinition, snapshot: ShapeDefinition): void {
  const renderer = trustedShapeRenderers.get(source);
  if (renderer !== undefined) trustedShapeRenderers.set(snapshot, renderer);
}

/** 标记变换不会破坏其规范化与完成态约束的内置图形定义。@internal */
export function registerTrustedTransformDefinition(definition: ShapeDefinition): void {
  trustedTransformDefinitions.add(definition);
}

/** 让 ShapeRegistry 的不可变定义快照继承内置定义的受信身份。@internal */
export function inheritTrustedTransformDefinition(source: ShapeDefinition, snapshot: ShapeDefinition): void {
  if (trustedTransformDefinitions.has(source)) trustedTransformDefinitions.add(snapshot);
}

/** 判断具体图形定义是否允许直接派生变换快照。@internal */
export function isTrustedTransformDefinition(definition: ShapeDefinition): boolean {
  return trustedTransformDefinitions.has(definition);
}

/**
 * 将已经由元素快照隔离、校验并冻结的图形状态转换为渲染几何。
 *
 * 未登记快速路径的自定义定义仍调用公开 `toRenderGeometry`，保留其完整校验语义。
 * @internal
 */
export function renderTrustedShapeState<S extends ShapeState>(definition: ShapeDefinition<S>, state: S): RenderGeometryState {
  if (state.type !== definition.type) throw new InvalidArgumentError('Trusted shape state type must match its definition');
  const renderer = trustedShapeRenderers.get(definition);
  return renderer === undefined ? definition.toRenderGeometry(state) : renderer(state);
}
