import type { Coordinate } from '../common/types.js';
import type { ControlPointTopology, ShapeDefinition, ShapePresentationResult, ShapeState } from '../shape/types.js';
import type { ElementStyleState } from '../style/types.js';

/** 一次脱离活动 View 的确定性 Shape presentation 帧。 @internal */
export interface ShapePresentationFrame {
  readonly center: Coordinate;
  readonly resolution: number;
  readonly rotation: number;
}

/** 在 Shape 语义与当前 View presentation 之间建立统一入口。 @internal */
export interface ShapePresentationPort {
  /** 把允许省略 View 相关字段的输入解析为完整 ShapeState。 */
  materialize(definition: ShapeDefinition, input: unknown, referenceState?: ShapeState): ShapeState;

  /** 生成当前帧可直接投影的几何，并返回已应用自动布局的工作状态。 */
  present(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState): ShapePresentationResult;

  /** 使用调用方冻结的 View 帧生成展示，不读取活动 Map 的 presentation。 */
  presentAt(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState, frame: Readonly<ShapePresentationFrame>): ShapePresentationResult;

  /** 派生独立 Edit 当前帧的全部控制点。 */
  describeEdit(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState): ControlPointTopology;

  /** 通过 Shape 自己的普通或上下文拓扑移动一个控制点。 */
  moveEdit(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState, index: number, coordinate: Coordinate): ShapeState;

  /** 订阅按 Map 帧合并后的 resolution、rotation 或字体 presentation revision。 */
  subscribe(listener: () => void): () => void;

  /** 订阅会使像素布局暂时失效的 View 运动状态。 */
  subscribeMotion?(listener: (moving: boolean) => void): () => void;
}
