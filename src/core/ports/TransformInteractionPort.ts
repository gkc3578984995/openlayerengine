import type { Coordinate, Pixel } from '../common/types.js';
import type { RenderGeometryState, ShapeType } from '../shape/types.js';
import type { ElementStyleState, StyleSpec } from '../style/types.js';

/** 内部类型。描述 TransformOperation 的可用数据。 */
export type TransformOperation = 'translate' | 'rotate' | 'scale' | 'stretch' | 'vertex';

/** 内部类型。描述 TransformInteractionMode 的可用数据。 */
export type TransformInteractionMode = 'transform' | 'edit';

/** 内部类型。描述 TransformDelta 的可用数据。 */
export type TransformDelta =
  | Readonly<{ type: 'translate'; x: number; y: number }>
  | Readonly<{ type: 'rotate'; angle: number; center: Coordinate }>
  | Readonly<{ type: 'scale' | 'stretch'; scaleX: number; scaleY: number; center: Coordinate }>
  | Readonly<{ type: 'vertex'; index: number; coordinate: Coordinate }>;

/** 内部接口。约定 TransformInteractionOptions 使用的数据和操作。 */
export interface TransformInteractionOptions {
  /** 命中范围。保存点击允许的像素误差。 */
  readonly hitTolerance: number;
  /** 平移方式。控制允许的平移操作。 */
  readonly translate: 'none' | 'center' | 'feature';
  /** 是否缩放。控制是否允许等比缩放。 */
  readonly scale: boolean;
  /** 是否拉伸。控制是否允许单轴缩放。 */
  readonly stretch: boolean;
  /** 是否旋转。控制是否允许旋转。 */
  readonly rotate: boolean;
  /** 控制框平移。控制是否允许拖动控制框。 */
  readonly translateBBox: boolean;
  /** 禁止翻转。控制缩放时能否翻转图形。 */
  readonly noFlip: boolean;
  /** 保持矩形。控制矩形缩放时是否保持比例。 */
  readonly keepRectangle: boolean;
  /** 外边距。保存控制框扩展的像素。 */
  readonly buffer: number;
  /** 点半径。保存点元素控制区的像素半径。 */
  readonly pointRadius: number;
  /** 手柄样式。保存自定义控制手柄样式。 */
  readonly handleStyle?: StyleSpec;
  /** 手柄中心。保存自定义变换中心。 */
  readonly handleCenter?: Coordinate;
}

/** 内部接口。约定 TransformInteractionTarget 使用的数据和操作。 */
export interface TransformInteractionTarget {
  /** 元素 ID。标识关联的元素。 */
  readonly elementId: string;
  /** 类型。标识当前数据或事件的类型。 */
  readonly type: ShapeType;
  /** 图层 ID。标识关联的图层。 */
  readonly layerId: string;
  /** 几何。保存本次渲染使用的几何。 */
  readonly geometry: RenderGeometryState;
  /** 样式。保存本次渲染使用的样式。 */
  readonly style: ElementStyleState;
  /** 模式。区分变换和顶点编辑。 */
  readonly mode: TransformInteractionMode;
  /** 控制点。保存可编辑的图形控制点。 */
  readonly controlPoints: readonly Coordinate[];
  /** 可平移。表示当前图形是否支持平移。 */
  readonly canTranslate: boolean;
  /** 可旋转。表示当前图形是否支持旋转。 */
  readonly canRotate: boolean;
  /** 可缩放。表示当前图形是否支持缩放。 */
  readonly canScale: boolean;
  /** 可拉伸。表示当前图形是否支持拉伸。 */
  readonly canStretch: boolean;
  /** 可编辑顶点。表示当前图形是否支持顶点编辑。 */
  readonly canEditVertices: boolean;
}

/** 内部接口。约定 TransformCopyPreview 使用的数据和操作。 */
export interface TransformCopyPreview {
  /** 几何。保存本次渲染使用的几何。 */
  readonly geometry: RenderGeometryState;
  /** 样式。保存本次渲染使用的样式。 */
  readonly style: ElementStyleState;
}

/** 内部类型。描述 TransformInteractionEvent 的可用数据。 */
export type TransformInteractionEvent =
  | Readonly<{ type: 'select-request'; pixel: Pixel; coordinate?: Coordinate; candidateIds: readonly string[] }>
  | Readonly<{ type: 'pointer-move'; pixel: Pixel; coordinate: Coordinate }>
  | Readonly<{
      /** 类型。标识当前数据或事件的类型。 */
      type: 'enter-handle';
      /** 键。保存项目或按键的标识。 */
      key: string;
      /** 操作。保存当前内部操作。 */
      operation?: TransformOperation;
      /** 方向。保存手柄控制的坐标轴。 */
      axis?: 'x' | 'y' | 'xy';
      /** 像素。保存当前屏幕像素位置。 */
      pixel?: Pixel;
      /** 坐标。保存当前地图坐标。 */
      coordinate?: Coordinate;
      /** 鼠标样式。保存手柄建议使用的光标。 */
      cursor?: string;
    }>
  | Readonly<{
      /** 类型。标识当前数据或事件的类型。 */
      type: 'leave-handle';
      /** 键。保存项目或按键的标识。 */
      key: string;
      /** 操作。保存当前内部操作。 */
      operation?: TransformOperation;
      /** 方向。保存手柄控制的坐标轴。 */
      axis?: 'x' | 'y' | 'xy';
      /** 像素。保存当前屏幕像素位置。 */
      pixel?: Pixel;
      /** 坐标。保存当前地图坐标。 */
      coordinate?: Coordinate;
      /** 鼠标样式。保存手柄建议使用的光标。 */
      cursor?: string;
    }>
  | Readonly<{ type: 'operation-start'; operation: TransformOperation; delta: TransformDelta; pixel?: Pixel; coordinate?: Coordinate }>
  | Readonly<{ type: 'operation-change'; operation: TransformOperation; delta: TransformDelta; pixel?: Pixel; coordinate?: Coordinate }>
  | Readonly<{ type: 'operation-end'; operation: TransformOperation; delta: TransformDelta; pixel?: Pixel; coordinate?: Coordinate }>
  | Readonly<{ type: 'copy-preview-confirm'; delta: Readonly<{ x: number; y: number }> }>
  | Readonly<{ type: 'copy-preview-cancel' }>;

/** 内部接口。约定 TransformInteractionHandle 使用的数据和操作。 */
export interface TransformInteractionHandle {
  /** 渲染图层 ID。标识临时内容所在图层。 */
  readonly renderLayerId: string;
  /** 渲染目标 ID。标识临时渲染目标。 */
  readonly renderTargetId: string;
  /** 设置当前变换目标。 */
  setTarget(target: TransformInteractionTarget): void;
  /** 清除当前变换目标。 */
  clearTarget(): void;
  /** 更新变换操作的活动状态。 */
  setOperationActive(active: boolean, operation?: TransformOperation): void;
  /** 开始显示复制预览。 */
  startCopyPreview(preview: TransformCopyPreview): void;
  /** 取消复制预览。 */
  cancelCopyPreview(): void;
  /** 释放当前对象占用的资源。 */
  destroy(): void;
}

/** 内部接口。约定 TransformInteractionPort 使用的数据和操作。 */
export interface TransformInteractionPort {
  /** 打开一个内部交互或视图。 */
  open(sessionId: string, options: TransformInteractionOptions, listener: (event: TransformInteractionEvent) => void): TransformInteractionHandle;
}
