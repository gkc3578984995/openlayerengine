import type { ShapeState } from '../shape/types.js';

/**
 * 图形投影端口。负责在元素规范状态和当前 View 工作状态之间转换。
 *
 * Core 只依赖该协议，不接触具体投影实现。
 *
 * @internal
 */
export interface ShapeProjectionPort {
  /**
   * 将元素规范状态转换为当前 View 使用的工作状态。
   *
   * @param state 图形状态。来自 ElementStore 的规范状态。
   * @returns View 工作状态。供预览、控制点和渲染使用。
   */
  toViewState(state: ShapeState): ShapeState;

  /**
   * 将当前 View 的工作状态转换为元素规范状态。
   *
   * @param state 图形状态。使用当前 View 单位的工作状态。
   * @param referenceState 参考状态。控制点编辑前的元素规范状态，用于保留未改变的业务距离。
   * @returns 元素规范状态。可提交到 ElementStore。
   */
  toElementState(state: ShapeState, referenceState?: ShapeState): ShapeState;
}
