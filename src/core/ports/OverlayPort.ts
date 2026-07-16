import type { Coordinate, Pixel } from '../common/types.js';
import type { NativeRef } from '../native/types.js';

export type CoreOverlayOwnership = 'external' | 'earth';
export type CoreOverlayPositioning =
  'bottom-left' | 'bottom-center' | 'bottom-right' | 'center-left' | 'center-center' | 'center-right' | 'top-left' | 'top-center' | 'top-right';

export interface CorePanIntoViewSpec {
  /** Overlay 与视口边缘预留的像素。 */
  readonly margin?: number;
  /** 平移动画时长，单位为毫秒。 */
  readonly duration?: number;
  /** 平移动画的缓动函数。 */
  readonly easing?: (progress: number) => number;
}

export interface OverlayRenderState {
  /** 当前 Earth 内唯一的 Overlay ID。 */
  readonly id: string;
  /** Overlay 使用的原生 DOM 元素引用。 */
  readonly elementRef: NativeRef<'element'>;
  /** 地图坐标；`undefined` 表示暂不定位。 */
  readonly position: Coordinate | undefined;
  /** 相对定位坐标的像素偏移。 */
  readonly offset: Pixel;
  /** DOM 元素相对坐标的定位方向。 */
  readonly positioning: CoreOverlayPositioning;
  /** 是否阻止 DOM 事件继续传给地图。 */
  readonly stopEvent: boolean;
  /** 是否插到 Overlay 容器最前方。 */
  readonly insertFirst: boolean;
  /** 自动移入视口的配置；`false` 表示关闭。 */
  readonly autoPan: false | CorePanIntoViewSpec;
  /** 附加到 Overlay 的 CSS 类名。 */
  readonly className: string | undefined;
  /** Overlay 可见状态。 */
  readonly visible: boolean;
  /** 原生 DOM 元素的生命周期所有权。 */
  readonly ownership: CoreOverlayOwnership;
}

export interface PixelBounds {
  /** 左边界像素。 */
  readonly left: number;
  /** 上边界像素。 */
  readonly top: number;
  /** 右边界像素。 */
  readonly right: number;
  /** 下边界像素。 */
  readonly bottom: number;
}

export type DescriptorPortAction =
  | {
      /** 用户关闭 Descriptor。 */
      readonly type: 'close';
    }
  | {
      /** 用户选择 Descriptor 列表项。 */
      readonly type: 'item';
      /** 被选择项的索引。 */
      readonly index: number;
    };

export interface OverlayDragEvent {
  /** 拖拽阶段。 */
  readonly type: 'start' | 'move' | 'end' | 'cancel';
  /** 当前拖拽指针 ID。 */
  readonly pointerId: number;
  /** 当前屏幕像素。 */
  readonly pixel: Pixel;
}

export interface OverlayPort {
  /** 挂载 Overlay 的原生投影。 */
  attach(state: Readonly<OverlayRenderState>): void;
  /** 更新已挂载的 Overlay。 */
  update(before: Readonly<OverlayRenderState>, after: Readonly<OverlayRenderState>): void;
  /** 解绑指定 Overlay。 */
  detach(id: string): void;
  /** 把 Overlay 平移到可视区域。 */
  panIntoView(id: string, options?: CorePanIntoViewSpec): void;
  /** 按归属释放原生元素。 */
  releaseElement(ref: NativeRef<'element'>, ownership: CoreOverlayOwnership): void;
  /** 把地图坐标转换为像素。 */
  coordinateToPixel(coordinate: Coordinate): Pixel | undefined;
  /** 把像素转换为地图坐标。 */
  pixelToCoordinate(pixel: Pixel): Coordinate | undefined;
  /** 读取 Overlay 的像素边界。 */
  getBounds(id: string): PixelBounds | undefined;
  /** 订阅界面布局变化。 */
  subscribeLayout(listener: () => void): () => void;
  /** 订阅 Descriptor 操作。 */
  subscribeDescriptorActions(id: string, listener: (action: DescriptorPortAction) => void): () => void;
  /** 绑定 Descriptor 拖拽事件。 */
  bindDrag(id: string, listener: (event: OverlayDragEvent) => void): () => void;
}
