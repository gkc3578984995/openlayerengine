import type { ShapeState } from '../shape/types.js';

/**
 * 在 Element 规范状态与当前 View 工作状态之间转换图形。
 *
 * Core 只依赖该协议，不接触具体投影实现。
 *
 * @internal
 */
export interface ShapeProjectionPort {
  /**
   * 将 Element 规范状态转换为当前 View 使用的工作状态。
   *
   * @param state ElementStore 中的规范图形状态。
   * @returns 供预览、控制点和渲染使用的 View 工作状态。
   */
  toViewState(state: ShapeState): ShapeState;

  /**
   * 将当前 View 的工作状态转换为 Element 规范状态。
   *
   * @param state 使用当前 View 单位的工作状态。
   * @param referenceState 控制点编辑前的 Element 规范状态，用于保留未改变的业务距离。
   * @returns 可提交到 ElementStore 的规范状态。
   */
  toElementState(state: ShapeState, referenceState?: ShapeState): ShapeState;
}
