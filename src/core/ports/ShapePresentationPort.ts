import type { Coordinate } from '../common/types.js';
import type { ControlPointTopology, ShapeDefinition, ShapePresentationResult, ShapeState } from '../shape/types.js';
import type { ElementStyleState } from '../style/types.js';

/** 在 Shape 语义与当前 View presentation 之间建立统一入口。 @internal */
export interface ShapePresentationPort {
  /** 生成当前帧可直接投影的几何，并返回已应用自动布局的工作状态。 */
  present(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState): ShapePresentationResult;

  /** 派生独立 Edit 当前帧的全部控制点。 */
  describeEdit(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState): ControlPointTopology;

  /** 通过 Shape 自己的普通或上下文拓扑移动一个控制点。 */
  moveEdit(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState, index: number, coordinate: Coordinate): ShapeState;

  /** 订阅按 Map 帧合并后的 resolution、rotation 或字体 presentation revision。 */
  subscribe(listener: () => void): () => void;

  /** 订阅会使像素布局暂时失效的 View 运动状态。 */
  subscribeMotion?(listener: (moving: boolean) => void): () => void;
}
