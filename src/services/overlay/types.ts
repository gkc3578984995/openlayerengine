import type { Coordinate, Pixel } from '../../core/common/types.js';
import type { NativeRef } from '../../core/native/types.js';
import type { CoreOverlayOwnership, CoreOverlayPositioning, CorePanIntoViewSpec } from '../../core/ports/OverlayPort.js';

/** Public Facade 校验后交给 OverlayService 的普通 Overlay 配置。 */
export interface InternalOverlaySpec<T = unknown> {
  /** 可选的 Overlay ID。 */
  readonly id?: string;
  /** Overlay 承载的原生元素引用。 */
  readonly elementRef: NativeRef<'element'>;
  /** Overlay 的地图坐标。 */
  readonly position?: Coordinate;
  /** 相对定位点的像素偏移。 */
  readonly offset?: Pixel;
  /** 元素相对坐标的定位方式。 */
  readonly positioning?: CoreOverlayPositioning;
  /** 是否阻止事件传播到地图。 */
  readonly stopEvent?: boolean;
  /** 是否插入容器首部。 */
  readonly insertFirst?: boolean;
  /** 是否在显示时自动平移到视野内。 */
  readonly autoPan?: boolean | CorePanIntoViewSpec;
  /** 附加到 Overlay 元素的类名。 */
  readonly className?: string;
  /** 所属业务模块。 */
  readonly module?: string;
  /** Overlay 附加业务数据。 */
  readonly data?: T;
  /** 原生 DOM 引用的所有权；external 资源只解绑，不清空或销毁。 */
  readonly ownership?: CoreOverlayOwnership;
}

/** 更新普通 Overlay 时使用的内部补丁。 */
export interface InternalOverlayPatch<T = unknown> {
  /** 新的原生元素引用。 */
  readonly elementRef?: NativeRef<'element'>;
  /** 新的地图坐标。 */
  readonly position?: Coordinate | undefined;
  /** 新的像素偏移。 */
  readonly offset?: Pixel;
  /** 新的定位方式。 */
  readonly positioning?: CoreOverlayPositioning;
  /** 新的可见状态。 */
  readonly visible?: boolean;
  /** 新的业务数据。 */
  readonly data?: T | undefined;
  /** 替换 DOM 引用时采用的新所有权规则。 */
  readonly ownership?: CoreOverlayOwnership;
}

/** 查询普通 Overlay 时使用的内部选择器。 */
export interface InternalOverlaySelector<T = unknown> {
  /** 匹配单个 Overlay ID。 */
  readonly id?: string;
  /** 匹配一组 Overlay ID。 */
  readonly ids?: readonly string[];
  /** 匹配业务模块。 */
  readonly module?: string;
  /** 匹配可见状态。 */
  readonly visible?: boolean;
  /** 使用业务数据和句柄进行自定义匹配。 */
  readonly predicate?: (data: Readonly<T> | undefined, handle: import('./OverlayHandle.js').OverlayHandle<T>) => boolean;
}

/** 普通 Overlay 的不可变内部状态。 */
export interface InternalOverlayState<T = unknown> {
  /** Overlay ID。 */
  readonly id: string;
  /** 当前原生元素引用。 */
  readonly elementRef: NativeRef<'element'>;
  /** 当前地图坐标。 */
  readonly position: Coordinate | undefined;
  /** 当前像素偏移。 */
  readonly offset: Pixel;
  /** 当前定位方式。 */
  readonly positioning: CoreOverlayPositioning;
  /** 是否阻止事件传播到地图。 */
  readonly stopEvent: boolean;
  /** 是否插入容器首部。 */
  readonly insertFirst: boolean;
  /** 自动平移配置。 */
  readonly autoPan: false | CorePanIntoViewSpec;
  /** 当前附加类名。 */
  readonly className: string | undefined;
  /** 所属业务模块。 */
  readonly module: string | undefined;
  /** 冻结后的业务数据。 */
  readonly data: Readonly<T> | undefined;
  /** 当前 DOM 引用的所有权规则。 */
  readonly ownership: CoreOverlayOwnership;
  /** 当前是否可见。 */
  readonly visible: boolean;
  /** 记录对应普通 Overlay 还是 Descriptor。 */
  readonly kind: 'overlay' | 'descriptor';
}

/** Descriptor 中的一行数据。 */
export interface InternalDescriptorItem<Value = string | number> {
  /** 项目标签。 */
  readonly label: string;
  /** 项目值。 */
  readonly value: Value;
  /** 项目文字颜色。 */
  readonly color?: string;
  /** 项目附加类名。 */
  readonly className?: string;
}

/** Descriptor 的内容类型。 */
export type InternalDescriptorType = 'list' | 'custom';
/** Descriptor 关闭时执行的行为。 */
export type InternalDescriptorCloseAction = 'hide' | 'destroy';
/** 固定线跟随地图坐标或屏幕像素的方式。 */
export type InternalDescriptorFixedMode = 'position' | 'pixel';

/** Public Facade 校验后交给 OverlayService 的 Descriptor 配置。 */
export interface InternalDescriptorSpec<T = unknown> {
  /** 可选的 Descriptor ID。 */
  readonly id?: string;
  /** Descriptor 使用的原生元素引用。 */
  readonly elementRef: NativeRef<'element'>;
  /** Descriptor 内容类型。 */
  readonly type: InternalDescriptorType;
  /** 列表内容项目。 */
  readonly items?: readonly InternalDescriptorItem[];
  /** Descriptor 的地图坐标。 */
  readonly position: Coordinate;
  /** 相对定位点的像素偏移。 */
  readonly offset?: Pixel;
  /** 是否显示关闭入口。 */
  readonly close?: boolean;
  /** 关闭时执行的行为。 */
  readonly closeAction?: InternalDescriptorCloseAction;
  /** Descriptor 关闭后的回调。 */
  readonly onClose?: (event: InternalDescriptorEvent<T>) => void;
  /** 内容项目被点击时的回调。 */
  readonly onItemClick?: (event: InternalDescriptorEvent<T>) => void;
  /** 是否允许拖动。 */
  readonly draggable?: boolean;
  /** 是否显示固定连线。 */
  readonly fixedLine?: boolean;
  /** 固定连线颜色。 */
  readonly fixedLineColor?: string;
  /** 固定连线的跟随方式。 */
  readonly fixedMode?: InternalDescriptorFixedMode;
  /** Descriptor 附加业务数据。 */
  readonly data?: T;
}

/** 更新 Descriptor 时使用的内部补丁。 */
export interface InternalDescriptorPatch<T = unknown> {
  /** 新的原生元素引用。 */
  readonly elementRef?: NativeRef<'element'>;
  /** 新的内容类型。 */
  readonly type?: InternalDescriptorType;
  /** 新的列表内容项目。 */
  readonly items?: readonly InternalDescriptorItem[];
  /** 新的地图坐标。 */
  readonly position?: Coordinate;
  /** 新的像素偏移。 */
  readonly offset?: Pixel;
  /** Descriptor 与其内部 OverlayHandle 同步可见性时使用的桥接值。 */
  readonly visible?: boolean;
  /** 是否显示关闭入口。 */
  readonly close?: boolean;
  /** 新的关闭行为。 */
  readonly closeAction?: InternalDescriptorCloseAction;
  /** 新的关闭回调。 */
  readonly onClose?: ((event: InternalDescriptorEvent<T>) => void) | undefined;
  /** 新的项目点击回调。 */
  readonly onItemClick?: ((event: InternalDescriptorEvent<T>) => void) | undefined;
  /** 是否允许拖动。 */
  readonly draggable?: boolean;
  /** 是否显示固定连线。 */
  readonly fixedLine?: boolean;
  /** 新的固定连线颜色。 */
  readonly fixedLineColor?: string;
  /** 新的固定连线跟随方式。 */
  readonly fixedMode?: InternalDescriptorFixedMode;
  /** 新的业务数据。 */
  readonly data?: T | undefined;
}

/** Descriptor 的不可变内部状态。 */
export interface InternalDescriptorState<T = unknown> {
  /** Descriptor ID。 */
  readonly id: string;
  /** 当前原生元素引用。 */
  readonly elementRef: NativeRef<'element'>;
  /** 当前内容类型。 */
  readonly type: InternalDescriptorType;
  /** 当前列表内容项目。 */
  readonly items: readonly Readonly<InternalDescriptorItem>[];
  /** 当前地图坐标。 */
  readonly position: Coordinate;
  /** 当前像素偏移。 */
  readonly offset: Pixel;
  /** 是否显示关闭入口。 */
  readonly close: boolean;
  /** 当前关闭行为。 */
  readonly closeAction: InternalDescriptorCloseAction;
  /** 当前是否允许拖动。 */
  readonly draggable: boolean;
  /** 当前是否显示固定连线。 */
  readonly fixedLine: boolean;
  /** 当前固定连线颜色。 */
  readonly fixedLineColor: string;
  /** 当前固定连线跟随方式。 */
  readonly fixedMode: InternalDescriptorFixedMode;
  /** 冻结后的业务数据。 */
  readonly data: Readonly<T> | undefined;
  /** 当前是否可见。 */
  readonly visible: boolean;
}

/** Descriptor 回调接收的内部事件。 */
export interface InternalDescriptorEvent<T = unknown> {
  /** 事件类型。 */
  readonly type: 'click' | 'close';
  /** 触发事件的 Descriptor 句柄。 */
  readonly descriptor: import('./DescriptorHandle.js').DescriptorHandle<T>;
  /** Descriptor 附加业务数据。 */
  readonly data: Readonly<T> | undefined;
  /** 被点击的内容项目。 */
  readonly item?: Readonly<InternalDescriptorItem>;
  /** 被点击项目的索引。 */
  readonly index?: number;
}

export type { Coordinate, Pixel };
