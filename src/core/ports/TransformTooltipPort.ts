import type { Coordinate } from '../common/types.js';

/** 内部接口。约定 TransformTooltipViewState 使用的数据和操作。 */
export interface TransformTooltipViewState {
  /** 位置。保存当前地图坐标。 */
  readonly position: Coordinate;
  /** 提示内容。保存需要显示的多行文字。 */
  readonly lines: readonly string[];
  /** 偏移。保存界面的像素偏移。 */
  readonly offset: readonly [number, number];
  /** 是否显示。控制内容是否可见。 */
  readonly visible: boolean;
}

/** 内部接口。约定 TransformTooltipViewSpec 使用的数据和操作。 */
export interface TransformTooltipViewSpec extends TransformTooltipViewState {
  /** 拥有者 ID。标识资源所属会话。 */
  readonly ownerId: string;
}

/** 内部接口。约定 TransformTooltipViewHandle 使用的数据和操作。 */
export interface TransformTooltipViewHandle {
  /** 更新已经挂载的对象。 */
  update(patch: Partial<TransformTooltipViewState>): void;
  /** 显示当前界面。 */
  show(): void;
  /** 隐藏当前界面。 */
  hide(): void;
  /** 释放当前对象占用的资源。 */
  destroy(): void;
}

/** 内部接口。约定 TransformTooltipPort 使用的数据和操作。 */
export interface TransformTooltipPort {
  /** 打开一个内部交互或视图。 */
  open(spec: TransformTooltipViewSpec): TransformTooltipViewHandle;
}
