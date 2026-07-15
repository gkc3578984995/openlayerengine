import type { Coordinate, Pixel } from '../common/types.js';
import type { NativeRef } from '../native/types.js';

/** 内部类型。描述 CoreOverlayOwnership 的可用数据。 */
export type CoreOverlayOwnership = 'external' | 'earth';
/** 内部类型。描述 CoreOverlayPositioning 的可用数据。 */
export type CoreOverlayPositioning =
  'bottom-left' | 'bottom-center' | 'bottom-right' | 'center-left' | 'center-center' | 'center-right' | 'top-left' | 'top-center' | 'top-right';

/** 内部接口。约定 CorePanIntoViewSpec 使用的数据和操作。 */
export interface CorePanIntoViewSpec {
  /** 边距。保存视图需要预留的像素。 */
  readonly margin?: number;
  /** 时长。保存动画持续的毫秒数。 */
  readonly duration?: number;
  /** 缓动函数。控制动画的变化速度。 */
  readonly easing?: (progress: number) => number;
}

/** 内部接口。约定 OverlayRenderState 使用的数据和操作。 */
export interface OverlayRenderState {
  /** 标识。保存当前对象的唯一 ID。 */
  readonly id: string;
  /** 元素引用。指向覆盖物使用的原生元素。 */
  readonly elementRef: NativeRef<'element'>;
  /** 位置。保存当前地图坐标。 */
  readonly position: Coordinate | undefined;
  /** 偏移。保存界面的像素偏移。 */
  readonly offset: Pixel;
  /** 定位方式。控制元素相对坐标的方向。 */
  readonly positioning: CoreOverlayPositioning;
  /** 是否阻止事件。控制事件是否继续传给地图。 */
  readonly stopEvent: boolean;
  /** 是否前插。控制元素插入容器的位置。 */
  readonly insertFirst: boolean;
  /** 自动平移。控制覆盖物是否自动进入视口。 */
  readonly autoPan: false | CorePanIntoViewSpec;
  /** 类名。保存界面使用的 CSS 类名。 */
  readonly className: string | undefined;
  /** 是否显示。控制内容是否可见。 */
  readonly visible: boolean;
  /** 归属。决定资源由谁负责释放。 */
  readonly ownership: CoreOverlayOwnership;
}

/** 内部接口。约定 PixelBounds 使用的数据和操作。 */
export interface PixelBounds {
  /** 左边界。保存矩形左侧像素。 */
  readonly left: number;
  /** 上边界。保存矩形顶部像素。 */
  readonly top: number;
  /** 右边界。保存矩形右侧像素。 */
  readonly right: number;
  /** 下边界。保存矩形底部像素。 */
  readonly bottom: number;
}

/** 内部类型。描述 DescriptorPortAction 的可用数据。 */
export type DescriptorPortAction =
  | {
      /** 类型。表示用户关闭了描述框。 */
      readonly type: 'close';
    }
  | {
      /** 类型。表示用户选择了列表项。 */
      readonly type: 'item';
      /** 索引。保存被选择项目的位置。 */
      readonly index: number;
    };

/** 内部接口。约定 OverlayDragEvent 使用的数据和操作。 */
export interface OverlayDragEvent {
  /** 类型。标识当前数据或事件的类型。 */
  readonly type: 'start' | 'move' | 'end' | 'cancel';
  /** 指针 ID。标识当前拖拽指针。 */
  readonly pointerId: number;
  /** 像素。保存当前屏幕像素位置。 */
  readonly pixel: Pixel;
}

/** 内部接口。约定 OverlayPort 使用的数据和操作。 */
export interface OverlayPort {
  /** 挂载一个底层对象。 */
  attach(state: Readonly<OverlayRenderState>): void;
  /** 更新已经挂载的对象。 */
  update(before: Readonly<OverlayRenderState>, after: Readonly<OverlayRenderState>): void;
  /** 卸载指定对象。 */
  detach(id: string): void;
  /** 把覆盖物平移到可视区域。 */
  panIntoView(id: string, options?: CorePanIntoViewSpec): void;
  /** 按归属释放原生元素。 */
  releaseElement(ref: NativeRef<'element'>, ownership: CoreOverlayOwnership): void;
  /** 把地图坐标转换为像素。 */
  coordinateToPixel(coordinate: Coordinate): Pixel | undefined;
  /** 把像素转换为地图坐标。 */
  pixelToCoordinate(pixel: Pixel): Coordinate | undefined;
  /** 读取覆盖物的像素边界。 */
  getBounds(id: string): PixelBounds | undefined;
  /** 订阅界面布局变化。 */
  subscribeLayout(listener: () => void): () => void;
  /** 订阅描述框操作。 */
  subscribeDescriptorActions(id: string, listener: (action: DescriptorPortAction) => void): () => void;
  /** 绑定描述框拖拽事件。 */
  bindDrag(id: string, listener: (event: OverlayDragEvent) => void): () => void;
}
