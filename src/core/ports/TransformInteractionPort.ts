import type { Coordinate, Pixel } from '../common/types.js';
import type { RenderGeometryState, ShapeType } from '../shape/types.js';
import type { ElementStyleState, StyleSpec } from '../style/types.js';
import type { EditControlAnchor, EditInsertionAnchor, EditInteractionAnchor } from './EditInteractionPort.js';

export type TransformOperation = 'translate' | 'rotate' | 'scale' | 'stretch' | 'vertex';

export type TransformEditOperation = 'vertex' | 'insert' | 'remove';

export type TransformInteractionMode = 'transform' | 'edit';

export type TransformDelta =
  | Readonly<{ type: 'translate'; x: number; y: number }>
  | Readonly<{ type: 'rotate'; angle: number; center: Coordinate }>
  | Readonly<{ type: 'scale' | 'stretch'; scaleX: number; scaleY: number; center: Coordinate }>
  | Readonly<{ type: 'vertex'; index: number; coordinate: Coordinate }>;

export interface TransformInteractionOptions {
  /** 手柄命中的 CSS 像素容差。 */
  readonly hitTolerance: number;
  /** 允许的平移命中方式。 */
  readonly translate: 'none' | 'center' | 'feature';
  /** 是否启用缩放手柄。 */
  readonly scale: boolean;
  /** 是否启用单轴拉伸手柄。 */
  readonly stretch: boolean;
  /** 是否启用旋转手柄。 */
  readonly rotate: boolean;
  /** 是否允许拖动选中框平移。 */
  readonly translateBBox: boolean;
  /** 是否禁止缩放越过中心后翻转图形。 */
  readonly noFlip: boolean;
  /** 矩形缩放时是否保持宽高比。 */
  readonly keepRectangle: boolean;
  /** 选中框外扩的 CSS 像素。 */
  readonly buffer: number;
  /** Point 控制区的 CSS 像素半径。 */
  readonly pointRadius: number;
  /** 自定义手柄样式。 */
  readonly handleStyle?: StyleSpec;
  /** 自定义变换中心。 */
  readonly handleCenter?: Coordinate;
}

export interface TransformInteractionTarget {
  /** 目标 Element ID。 */
  readonly elementId: string;
  /** 目标图形类型。 */
  readonly type: ShapeType;
  /** 目标所在的渲染图层 ID。 */
  readonly layerId: string;
  /** 当前工作几何的渲染快照。 */
  readonly geometry: RenderGeometryState;
  /** 目标 Element 的样式快照。 */
  readonly style: ElementStyleState;
  /** 区分 Transform 与 Edit 模式。 */
  readonly mode: TransformInteractionMode;
  /** 当前工作状态的控制点。 */
  readonly controlPoints: readonly Coordinate[];
  /** ShapeDefinition 声明的控制点与合法插入候选。 */
  readonly editAnchors: readonly EditInteractionAnchor[];
  /** 当前展示世界中的自定义变换中心。 */
  readonly handleCenter?: Coordinate;
  /** 图形是否声明平移能力。 */
  readonly canTranslate: boolean;
  /** 图形是否声明旋转能力。 */
  readonly canRotate: boolean;
  /** 图形是否声明缩放能力。 */
  readonly canScale: boolean;
  /** 图形是否声明拉伸能力。 */
  readonly canStretch: boolean;
  /** 图形是否声明控制点编辑能力。 */
  readonly canEditVertices: boolean;
}

export interface TransformCopyPreview {
  /** 复制预览几何。 */
  readonly geometry: RenderGeometryState;
  /** 复制预览样式。 */
  readonly style: ElementStyleState;
}

export type TransformInteractionEvent =
  | Readonly<{ type: 'select-request'; pixel: Pixel; coordinate?: Coordinate; candidateIds: readonly string[] }>
  | Readonly<{ type: 'pointer-move'; pixel: Pixel; coordinate: Coordinate }>
  | Readonly<{ type: 'bounds-change'; topRight: Coordinate }>
  | Readonly<{
      /** 进入手柄事件。 */
      type: 'enter-handle';
      /** 手柄稳定键。 */
      key: string;
      /** 手柄对应的操作。 */
      operation?: TransformOperation;
      /** 手柄控制的坐标轴。 */
      axis?: 'x' | 'y' | 'xy';
      /** 当前屏幕像素。 */
      pixel?: Pixel;
      /** 当前地图坐标。 */
      coordinate?: Coordinate;
      /** 手柄建议使用的 CSS cursor。 */
      cursor?: string;
      /** 编辑模式下提供当前命中的控制点或插入点。 */
      anchor?: EditInteractionAnchor;
    }>
  | Readonly<{
      /** 离开手柄事件。 */
      type: 'leave-handle';
      /** 手柄稳定键。 */
      key: string;
      /** 手柄对应的操作。 */
      operation?: TransformOperation;
      /** 手柄控制的坐标轴。 */
      axis?: 'x' | 'y' | 'xy';
      /** 当前屏幕像素。 */
      pixel?: Pixel;
      /** 当前地图坐标。 */
      coordinate?: Coordinate;
      /** 手柄建议使用的 CSS cursor。 */
      cursor?: string;
      /** 编辑模式下提供刚离开的控制点或插入点。 */
      anchor?: EditInteractionAnchor;
    }>
  | Readonly<{
      type: 'operation-start' | 'operation-change' | 'operation-end' | 'operation-cancel';
      operation: TransformOperation;
      delta: TransformDelta;
      pixel?: Pixel;
      coordinate?: Coordinate;
      axis?: 'x' | 'y' | 'xy';
      cursor?: string;
      anchor?: EditControlAnchor;
    }>
  | Readonly<{ type: 'edit-insert'; anchor: EditInsertionAnchor }>
  | Readonly<{ type: 'edit-remove'; anchor: EditControlAnchor }>
  | Readonly<{ type: 'copy-preview-confirm'; delta: Readonly<{ x: number; y: number }> }>
  | Readonly<{ type: 'copy-preview-cancel' }>;

export interface TransformInteractionHandle {
  /** 临时内容所在的渲染图层 ID。 */
  readonly renderLayerId: string;
  /** 临时渲染目标 ID。 */
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
  /** 释放交互、临时图层和监听器。 */
  destroy(): void;
}

export interface TransformInteractionPort {
  /** 打开由 Session 独占的 Transform 交互。 */
  open(sessionId: string, options: TransformInteractionOptions, listener: (event: TransformInteractionEvent) => void): TransformInteractionHandle;
}
