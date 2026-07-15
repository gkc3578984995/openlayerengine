import type { Coordinate, Pixel } from '../core/common/types.js';

/** DOM 元素所有权。 */
export type OverlayOwnership = 'external' | 'earth';

/** Overlay 相对坐标的定位方式。 */
export type OverlayPositioning =
  'bottom-left' | 'bottom-center' | 'bottom-right' | 'center-left' | 'center-center' | 'center-right' | 'top-left' | 'top-center' | 'top-right';

/** 将 Overlay 平移到可视区域内的配置。 */
export interface PanIntoViewSpec {
  /** 边缘间距。指定 Overlay 与视口边缘保留的像素距离。 */
  readonly margin?: number;
  /** 动画时长。指定视图平移动画的毫秒数。 */
  readonly duration?: number;
  /** 缓动函数。根据零到一的进度返回变换后的动画进度。 */
  readonly easing?: (progress: number) => number;
}

/**
 * Overlay 的创建配置。
 *
 * @typeParam T 业务数据。表示 Overlay 附加数据的类型。
 */
export interface OverlaySpec<T = unknown> {
  /** Overlay 标识。省略时由服务生成唯一 ID。 */
  readonly id?: string;
  /** DOM 元素。指定 Overlay 展示的 HTML 元素。 */
  readonly element: HTMLElement;
  /** 地图坐标。指定 Overlay 初始定位坐标，省略时保持隐藏。 */
  readonly position?: Coordinate;
  /** 像素偏移。指定 Overlay 相对定位坐标的偏移。 */
  readonly offset?: Pixel;
  /** 定位方式。指定 DOM 元素相对地图坐标的锚点。 */
  readonly positioning?: OverlayPositioning;
  /** 事件阻断。控制 Overlay DOM 事件是否阻止地图交互。 */
  readonly stopEvent?: boolean;
  /** 插入顺序。控制 Overlay 是否插入容器首位。 */
  readonly insertFirst?: boolean;
  /** 自动平移。控制定位后是否将 Overlay 移入可视区域。 */
  readonly autoPan?: boolean | PanIntoViewSpec;
  /** 自定义类名。附加到 OpenLayers Overlay 容器。 */
  readonly className?: string;
  /** 业务模块。用于按模块查询和管理 Overlay。 */
  readonly module?: string;
  /** 业务数据。保存与 Overlay 关联的数据快照。 */
  readonly data?: T;
  /** DOM 所有权。指定销毁时是否同时移除传入的 DOM 元素。 */
  readonly ownership?: OverlayOwnership;
}

/**
 * Overlay 的更新内容。
 *
 * @typeParam T 业务数据。表示 Overlay 附加数据的类型。
 */
export interface OverlayPatch<T = unknown> {
  /** DOM 元素。替换 Overlay 当前展示的 HTML 元素。 */
  readonly element?: HTMLElement;
  /** 地图坐标。更新定位坐标，显式传入 `undefined` 时清除定位。 */
  readonly position?: Coordinate | undefined;
  /** 像素偏移。更新 Overlay 相对定位坐标的偏移。 */
  readonly offset?: Pixel;
  /** 定位方式。更新 DOM 元素相对地图坐标的锚点。 */
  readonly positioning?: OverlayPositioning;
  /** 可见状态。控制 Overlay 是否显示。 */
  readonly visible?: boolean;
  /** 业务数据。更新关联数据，显式传入 `undefined` 时清除数据。 */
  readonly data?: T | undefined;
  /** DOM 所有权。更新销毁时对当前 DOM 元素的处理方式。 */
  readonly ownership?: OverlayOwnership;
}

/**
 * Overlay 的查询条件。`id` 和 `ids` 不能同时设置；`remove()` 至少需要一个条件，要清空全部内容请使用 `clear()`。
 *
 * @typeParam T 业务数据。表示 Overlay 附加数据的类型。
 */
export interface OverlaySelector<T = unknown> {
  /** 单个标识。仅匹配指定 ID 的 Overlay。 */
  readonly id?: string;
  /** 标识列表。匹配列表中任一 ID 的 Overlay。 */
  readonly ids?: readonly string[];
  /** 业务模块。仅匹配指定模块的 Overlay。 */
  readonly module?: string;
  /** 可见状态。仅匹配当前可见或隐藏的 Overlay。 */
  readonly visible?: boolean;
  /** 自定义断言。根据只读业务数据和 Overlay 句柄决定是否匹配。 */
  readonly predicate?: (data: Readonly<T> | undefined, handle: OverlayHandle<T>) => boolean;
}

/**
 * Overlay 的公开控制句柄。
 *
 * @typeParam T 业务数据。表示 Overlay 附加数据的类型。
 */
export interface OverlayHandle<T = unknown> {
  /** Overlay 标识。提供当前 Overlay 的唯一 ID。 */
  readonly id: string;
  /** 地图坐标。提供当前定位坐标的只读快照。 */
  readonly position: Coordinate | undefined;
  /** 可见状态。表示当前 Overlay 是否显示。 */
  readonly visible: boolean;
  /**
   * 批量更新当前 Overlay。
   *
   * @param patch Overlay 更新。指定要合并到当前 Overlay 的内容。
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const overlay = earth.overlays.add({ element: document.createElement('div') });
   * overlay.update({ position: [120, 30], visible: true });
   * ```
   */
  update(patch: OverlayPatch<T>): void;
  /**
   * 设置或清除 Overlay 的地图坐标。
   *
   * @param position 地图坐标。传入 `undefined` 时清除当前定位。
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const overlay = earth.overlays.add({ element: document.createElement('div') });
   * overlay.setPosition([120, 30]);
   * ```
   */
  setPosition(position: Coordinate | undefined): void;
  /**
   * 显示当前 Overlay。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.overlays.get('popup')?.show();
   * ```
   */
  show(): void;
  /**
   * 隐藏当前 Overlay。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.overlays.get('popup')?.hide();
   * ```
   */
  hide(): void;
  /**
   * 平移地图视图以完整显示当前 Overlay。
   *
   * @param options 平移配置。指定可选的边距、时长和缓动参数。
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.overlays.get('popup')?.panIntoView({ margin: 24, duration: 250 });
   * ```
   */
  panIntoView(options?: PanIntoViewSpec): void;
  /**
   * 销毁当前 Overlay 并释放其资源。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.overlays.get('popup')?.destroy();
   * ```
   */
  destroy(): void;
}

/**
 * Descriptor 列表中的单个项目。
 *
 * @typeParam Value 项目值。表示 Descriptor 项目值的类型。
 */
export interface DescriptorListItem<Value = string | number> {
  /** 项目标签。指定列表中展示的名称。 */
  readonly label: string;
  /** 项目值。保存列表项关联的业务值。 */
  readonly value: Value;
  /** 标识颜色。设置列表项可选的颜色提示。 */
  readonly color?: string;
  /** 自定义类名。附加到列表项 DOM 元素。 */
  readonly className?: string;
}

/** Descriptor 内容。接受列表项目、文本字符串或 DOM 元素。 */
export type DescriptorContent = readonly DescriptorListItem[] | string | HTMLElement;

/**
 * Descriptor 的公开事件载荷。
 *
 * @typeParam T 业务数据。表示 Descriptor 附加数据的类型。
 */
export interface DescriptorEvent<T = unknown> {
  /** 事件类型。表示列表点击或关闭操作。 */
  readonly type: 'click' | 'close';
  /** Descriptor 句柄。提供触发事件的实时控制句柄。 */
  readonly descriptor: DescriptorHandle<T>;
  /** 业务数据。提供 Descriptor 当前数据的只读值。 */
  readonly data: Readonly<T> | undefined;
  /** 列表项目。点击列表内容时提供对应项目。 */
  readonly item?: Readonly<DescriptorListItem>;
  /** 项目索引。点击列表内容时提供对应位置。 */
  readonly index?: number;
}

/**
 * Descriptor 的创建配置。
 *
 * @typeParam T 业务数据。表示 Descriptor 附加数据的类型。
 */
export type DescriptorSpec<T = unknown> = {
  /** Descriptor 标识。省略时由服务生成唯一 ID。 */
  readonly id?: string;
  /** 地图坐标。指定 Descriptor 的初始定位坐标。 */
  readonly position: Coordinate;
  /** 像素偏移。指定 Descriptor 相对定位坐标的偏移。 */
  readonly offset?: Pixel;
  /** 头部文本。设置 Descriptor 可选的标题内容。 */
  readonly header?: string;
  /** 底部文本。设置 Descriptor 可选的底部内容。 */
  readonly footer?: string;
  /** 关闭按钮。控制是否显示内置关闭按钮。 */
  readonly close?: boolean;
  /** 关闭行为。控制关闭时隐藏或销毁 Descriptor。 */
  readonly closeAction?: 'hide' | 'destroy';
  /** 关闭回调。Descriptor 执行关闭行为时调用。 */
  readonly onClose?: (event: DescriptorEvent<T>) => void;
  /** 项目回调。用户点击列表项目时调用。 */
  readonly onItemClick?: (event: DescriptorEvent<T>) => void;
  /** 拖拽能力。控制用户是否可以拖动 Descriptor。 */
  readonly draggable?: boolean;
  /** 固定连线。控制是否绘制定位点到 Descriptor 的连线。 */
  readonly fixedLine?: boolean;
  /** 连线颜色。设置固定连线的 CSS 颜色。 */
  readonly fixedLineColor?: string;
  /** 固定模式。控制拖拽后保持地图坐标或屏幕像素位置。 */
  readonly fixedMode?: 'position' | 'pixel';
  /** 业务数据。保存与 Descriptor 关联的数据快照。 */
  readonly data?: T;
} & (
  | {
      /** 内容类型。固定为列表内容。 */
      readonly type: 'list';
      /** 列表内容。指定 Descriptor 展示的只读项目列表。 */
      readonly content: readonly DescriptorListItem[];
    }
  | {
      /** 内容类型。固定为自定义内容。 */
      readonly type: 'custom';
      /** 自定义内容。指定 Descriptor 展示的文本字符串或 DOM 元素。 */
      readonly content: string | HTMLElement;
    }
);

/**
 * Descriptor 的更新内容。
 *
 * @typeParam T 业务数据。表示 Descriptor 附加数据的类型。
 */
export interface DescriptorPatch<T = unknown> {
  /** 展示内容。更新列表、文本或 DOM 内容。 */
  readonly content?: DescriptorContent;
  /** 地图坐标。更新 Descriptor 的定位坐标。 */
  readonly position?: Coordinate;
  /** 像素偏移。更新 Descriptor 相对定位坐标的偏移。 */
  readonly offset?: Pixel;
  /** 头部文本。更新标题，显式传入 `undefined` 时清除。 */
  readonly header?: string | undefined;
  /** 底部文本。更新底部内容，显式传入 `undefined` 时清除。 */
  readonly footer?: string | undefined;
  /** 关闭按钮。更新是否显示内置关闭按钮。 */
  readonly close?: boolean;
  /** 关闭行为。更新关闭时隐藏或销毁 Descriptor。 */
  readonly closeAction?: 'hide' | 'destroy';
  /** 关闭回调。更新关闭事件处理函数，显式传入 `undefined` 时清除。 */
  readonly onClose?: ((event: DescriptorEvent<T>) => void) | undefined;
  /** 项目回调。更新列表点击处理函数，显式传入 `undefined` 时清除。 */
  readonly onItemClick?: ((event: DescriptorEvent<T>) => void) | undefined;
  /** 拖拽能力。更新用户是否可以拖动 Descriptor。 */
  readonly draggable?: boolean;
  /** 固定连线。更新是否绘制定位点到 Descriptor 的连线。 */
  readonly fixedLine?: boolean;
  /** 连线颜色。更新固定连线的 CSS 颜色。 */
  readonly fixedLineColor?: string;
  /** 固定模式。更新拖拽后保持地图坐标或屏幕像素位置。 */
  readonly fixedMode?: 'position' | 'pixel';
  /** 业务数据。更新关联数据，显式传入 `undefined` 时清除。 */
  readonly data?: T | undefined;
}

/**
 * Descriptor 的公开控制句柄。
 *
 * @typeParam T 业务数据。表示 Descriptor 附加数据的类型。
 */
export interface DescriptorHandle<T = unknown> {
  /** Descriptor 标识。提供当前 Descriptor 的唯一 ID。 */
  readonly id: string;
  /** 可见状态。表示当前 Descriptor 是否显示。 */
  readonly visible: boolean;
  /**
   * 批量更新当前 Descriptor。
   *
   * @param patch Descriptor 更新。指定要合并到当前 Descriptor 的内容。
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const descriptor = earth.overlays.createDescriptor({ type: 'custom', content: '信息', position: [120, 30] });
   * descriptor.update({ header: '目标信息' });
   * ```
   */
  update(patch: DescriptorPatch<T>): void;
  /**
   * 设置 Descriptor 的地图坐标。
   *
   * @param position 地图坐标。指定新的地图定位位置。
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const descriptor = earth.overlays.createDescriptor({ type: 'custom', content: '信息', position: [120, 30] });
   * descriptor.setPosition([121, 31]);
   * ```
   */
  setPosition(position: Coordinate): void;
  /**
   * 显示当前 Descriptor。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.overlays.createDescriptor({ type: 'custom', content: '信息', position: [120, 30] }).show();
   * ```
   */
  show(): void;
  /**
   * 隐藏当前 Descriptor。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.overlays.createDescriptor({ type: 'custom', content: '信息', position: [120, 30] }).hide();
   * ```
   */
  hide(): void;
  /**
   * 按配置执行隐藏或销毁关闭行为。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.overlays.createDescriptor({ type: 'custom', content: '信息', position: [120, 30] }).close();
   * ```
   */
  close(): void;
  /**
   * 订阅 Descriptor 的点击或关闭事件。
   *
   * @param type 事件名称。指定要订阅的 Descriptor 事件。
   * @param listener 监听函数。接收对应的 Descriptor 事件载荷。
   * @returns 用于取消本次订阅的幂等函数。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const descriptor = earth.overlays.createDescriptor({ type: 'custom', content: '信息', position: [120, 30] });
   * const off = descriptor.on('close', () => console.log('closed'));
   * off();
   * ```
   */
  on(type: 'click' | 'close', listener: (event: DescriptorEvent<T>) => void): () => void;
  /**
   * 销毁当前 Descriptor 并释放其资源。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.overlays.createDescriptor({ type: 'custom', content: '信息', position: [120, 30] }).destroy();
   * ```
   */
  destroy(): void;
}

/** Overlay 和 Descriptor 能力的公开入口。 */
export interface OverlayService {
  /**
   * 创建并注册一个 Overlay。
   *
   * @typeParam T 业务数据。表示 Overlay 附加数据的类型。
   * @param spec Overlay 配置。指定 DOM 元素、定位、行为和业务数据。
   * @returns 新创建的 Overlay 控制句柄。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const overlay = earth.overlays.add({ id: 'popup', element: document.createElement('div'), position: [120, 30] });
   * ```
   */
  add<T>(spec: OverlaySpec<T>): OverlayHandle<T>;
  /**
   * 按 ID 获取仍然有效的 Overlay。
   *
   * @typeParam T 业务数据。表示 Overlay 附加数据的类型。
   * @param id Overlay ID。指定要获取的 Overlay。
   * @returns 匹配的 Overlay 句柄，不存在时返回 `undefined`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const overlay = earth.overlays.get('popup');
   * ```
   */
  get<T>(id: string): OverlayHandle<T> | undefined;
  /**
   * 查询匹配条件的 Overlay。
   *
   * @typeParam T 业务数据。表示 Overlay 附加数据的类型。
   * @param selector Overlay 选择器。指定可选的 ID、模块、可见状态和自定义断言。
   * @returns 匹配条件的 Overlay 句柄只读列表。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const overlays = earth.overlays.query({ module: 'planning', visible: true });
   * ```
   */
  query<T>(selector?: OverlaySelector<T>): readonly OverlayHandle<T>[];
  /**
   * 移除匹配条件的 Overlay。
   *
   * @param selector Overlay 选择器。用于定位待移除的 Overlay。
   * @returns 实际移除的 Overlay 数量。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const removed = earth.overlays.remove({ module: 'planning' });
   * ```
   */
  remove(selector: OverlaySelector): number;
  /**
   * 清除服务管理的全部 Overlay 和 Descriptor。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.overlays.clear();
   * ```
   */
  clear(): void;
  /**
   * 创建一个内置样式的 Descriptor。
   *
   * @typeParam T 业务数据。表示 Descriptor 附加数据的类型。
   * @param spec Descriptor 配置。指定内容、定位、交互和业务数据。
   * @returns 新创建的 Descriptor 控制句柄。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const descriptor = earth.overlays.createDescriptor({ type: 'custom', content: '目标', position: [120, 30] });
   * ```
   */
  createDescriptor<T>(spec: DescriptorSpec<T>): DescriptorHandle<T>;
}
