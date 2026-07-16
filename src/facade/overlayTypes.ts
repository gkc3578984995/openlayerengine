import type { Coordinate, Pixel } from '../core/common/types.js';

/** DOM 元素所有权。 */
export type OverlayOwnership = 'external' | 'earth';

/** Overlay 相对坐标的定位方式。 */
export type OverlayPositioning =
  'bottom-left' | 'bottom-center' | 'bottom-right' | 'center-left' | 'center-center' | 'center-right' | 'top-left' | 'top-center' | 'top-right';

/** 将 Overlay 平移到可视区域内的配置。 */
export interface PanIntoViewSpec {
  /** Overlay 与视口边缘保留的距离，单位为 CSS 像素。 */
  readonly margin?: number;
  /** 视图平移动画的时长，单位为毫秒。 */
  readonly duration?: number;
  /** 将 `0` 到 `1` 的线性进度映射为动画进度。 */
  readonly easing?: (progress: number) => number;
}

/**
 * Overlay 的创建配置。
 *
 * @typeParam T Overlay 携带的业务数据类型。
 */
export interface OverlaySpec<T = unknown> {
  /** Overlay ID；省略时由服务生成。 */
  readonly id?: string;
  /** Overlay 展示的 HTML 元素。 */
  readonly element: HTMLElement;
  /** 初始地图坐标；省略时 Overlay 保持隐藏。 */
  readonly position?: Coordinate;
  /** 相对定位坐标的偏移，单位为 CSS 像素。 */
  readonly offset?: Pixel;
  /** DOM 元素相对地图坐标的锚点。 */
  readonly positioning?: OverlayPositioning;
  /** Overlay 上的 DOM 事件是否阻止地图交互。 */
  readonly stopEvent?: boolean;
  /** 是否将 Overlay 插入容器首位。 */
  readonly insertFirst?: boolean;
  /** 定位后是否自动平移 View，使 Overlay 进入可视区域。 */
  readonly autoPan?: boolean | PanIntoViewSpec;
  /** 附加到 OpenLayers Overlay 容器的类名。 */
  readonly className?: string;
  /** 供查询和批量管理使用的业务模块标识。 */
  readonly module?: string;
  /** 与 Overlay 关联的业务数据快照。 */
  readonly data?: T;
  /** DOM 所有权；默认为 `external`，只有 `earth` 会在销毁时移除元素。 */
  readonly ownership?: OverlayOwnership;
}

/**
 * Overlay 的更新内容。
 *
 * @typeParam T Overlay 携带的业务数据类型。
 */
export interface OverlayPatch<T = unknown> {
  /** 替换当前展示的 HTML 元素；未同时指定所有权时按 `external` 处理。 */
  readonly element?: HTMLElement;
  /** 新的地图坐标；显式传入 `undefined` 时清除定位。 */
  readonly position?: Coordinate | undefined;
  /** 相对定位坐标的新偏移，单位为 CSS 像素。 */
  readonly offset?: Pixel;
  /** DOM 元素相对地图坐标的新锚点。 */
  readonly positioning?: OverlayPositioning;
  /** Overlay 是否可见。 */
  readonly visible?: boolean;
  /** 新的业务数据；显式传入 `undefined` 时清除数据。 */
  readonly data?: T | undefined;
  /** 当前 DOM 元素的新所有权。 */
  readonly ownership?: OverlayOwnership;
}

/**
 * Overlay 的查询条件。`id` 和 `ids` 不能同时设置；`remove()` 至少需要一个条件，要清空全部内容请使用 `clear()`。
 *
 * @typeParam T Overlay 携带的业务数据类型。
 */
export interface OverlaySelector<T = unknown> {
  /** 只匹配该 ID 的 Overlay。 */
  readonly id?: string;
  /** 匹配列表中任一 ID 的 Overlay。 */
  readonly ids?: readonly string[];
  /** 只匹配该业务模块的 Overlay。 */
  readonly module?: string;
  /** 只匹配当前可见或隐藏的 Overlay。 */
  readonly visible?: boolean;
  /** 根据只读业务数据和 Overlay 句柄进行额外筛选。 */
  readonly predicate?: (data: Readonly<T> | undefined, handle: OverlayHandle<T>) => boolean;
}

/**
 * Overlay 的公开控制句柄。
 *
 * @typeParam T Overlay 携带的业务数据类型。
 */
export interface OverlayHandle<T = unknown> {
  /** 当前 Overlay 的唯一 ID。 */
  readonly id: string;
  /** 当前地图坐标的只读快照。 */
  readonly position: Coordinate | undefined;
  /** 当前 Overlay 是否可见。 */
  readonly visible: boolean;
  /**
   * 批量更新当前 Overlay。
   *
   * @param patch 要合并到当前 Overlay 的内容。
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
   * @param position 新的地图坐标；传入 `undefined` 时清除定位。
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
   * @param options 边距、动画时长和缓动参数。
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
 * @typeParam Value Descriptor 项目的业务值类型。
 */
export interface DescriptorListItem<Value = string | number> {
  /** 列表中展示的名称。 */
  readonly label: string;
  /** 列表项关联的业务值。 */
  readonly value: Value;
  /** 列表项可选的提示颜色。 */
  readonly color?: string;
  /** 附加到列表项 DOM 元素的类名。 */
  readonly className?: string;
}

/** Descriptor 可展示列表项目、文本字符串或 DOM 元素。 */
export type DescriptorContent = readonly DescriptorListItem[] | string | HTMLElement;

/**
 * Descriptor 的公开事件载荷。
 *
 * @typeParam T Descriptor 携带的业务数据类型。
 */
export interface DescriptorEvent<T = unknown> {
  /** 列表点击或关闭。 */
  readonly type: 'click' | 'close';
  /** 触发事件的实时 Descriptor 句柄。 */
  readonly descriptor: DescriptorHandle<T>;
  /** Descriptor 当前业务数据的只读值。 */
  readonly data: Readonly<T> | undefined;
  /** 点击列表内容时对应的项目。 */
  readonly item?: Readonly<DescriptorListItem>;
  /** 点击列表内容时对应的项目索引。 */
  readonly index?: number;
}

/**
 * Descriptor 的创建配置。
 *
 * @typeParam T Descriptor 携带的业务数据类型。
 */
export type DescriptorSpec<T = unknown> = {
  /** Descriptor ID；省略时由服务生成。 */
  readonly id?: string;
  /** Descriptor 的初始地图坐标。 */
  readonly position: Coordinate;
  /** 相对定位坐标的偏移，单位为 CSS 像素。 */
  readonly offset?: Pixel;
  /** 可选的标题文本。 */
  readonly header?: string;
  /** 可选的底部文本。 */
  readonly footer?: string;
  /** 是否显示内置关闭按钮。 */
  readonly close?: boolean;
  /** 关闭时隐藏还是销毁 Descriptor。 */
  readonly closeAction?: 'hide' | 'destroy';
  /** Descriptor 执行关闭行为时调用。 */
  readonly onClose?: (event: DescriptorEvent<T>) => void;
  /** 用户点击列表项目时调用。 */
  readonly onItemClick?: (event: DescriptorEvent<T>) => void;
  /** 用户是否可以拖动 Descriptor。 */
  readonly draggable?: boolean;
  /** 是否绘制定位点到 Descriptor 的连线。 */
  readonly fixedLine?: boolean;
  /** 固定连线的 CSS 颜色。 */
  readonly fixedLineColor?: string;
  /** 拖拽后保持地图坐标还是屏幕像素位置。 */
  readonly fixedMode?: 'position' | 'pixel';
  /** 与 Descriptor 关联的业务数据快照。 */
  readonly data?: T;
} & (
  | {
      /** 固定为列表内容。 */
      readonly type: 'list';
      /** Descriptor 展示的只读项目列表。 */
      readonly content: readonly DescriptorListItem[];
    }
  | {
      /** 固定为自定义内容。 */
      readonly type: 'custom';
      /** Descriptor 展示的文本或 DOM 元素。 */
      readonly content: string | HTMLElement;
    }
);

/**
 * Descriptor 的更新内容。
 *
 * @typeParam T Descriptor 携带的业务数据类型。
 */
export interface DescriptorPatch<T = unknown> {
  /** 新的列表、文本或 DOM 内容。 */
  readonly content?: DescriptorContent;
  /** 新的地图坐标。 */
  readonly position?: Coordinate;
  /** 相对定位坐标的新偏移，单位为 CSS 像素。 */
  readonly offset?: Pixel;
  /** 新标题；显式传入 `undefined` 时清除。 */
  readonly header?: string | undefined;
  /** 新的底部文本；显式传入 `undefined` 时清除。 */
  readonly footer?: string | undefined;
  /** 是否显示内置关闭按钮。 */
  readonly close?: boolean;
  /** 关闭时隐藏还是销毁 Descriptor。 */
  readonly closeAction?: 'hide' | 'destroy';
  /** 新的关闭回调；显式传入 `undefined` 时清除。 */
  readonly onClose?: ((event: DescriptorEvent<T>) => void) | undefined;
  /** 新的列表点击回调；显式传入 `undefined` 时清除。 */
  readonly onItemClick?: ((event: DescriptorEvent<T>) => void) | undefined;
  /** 用户是否可以拖动 Descriptor。 */
  readonly draggable?: boolean;
  /** 是否绘制定位点到 Descriptor 的连线。 */
  readonly fixedLine?: boolean;
  /** 固定连线的新 CSS 颜色。 */
  readonly fixedLineColor?: string;
  /** 拖拽后保持地图坐标还是屏幕像素位置。 */
  readonly fixedMode?: 'position' | 'pixel';
  /** 新的业务数据；显式传入 `undefined` 时清除。 */
  readonly data?: T | undefined;
}

/**
 * Descriptor 的公开控制句柄。
 *
 * @typeParam T Descriptor 携带的业务数据类型。
 */
export interface DescriptorHandle<T = unknown> {
  /** 当前 Descriptor 的唯一 ID。 */
  readonly id: string;
  /** 当前 Descriptor 是否可见。 */
  readonly visible: boolean;
  /**
   * 批量更新当前 Descriptor。
   *
   * @param patch 要合并到当前 Descriptor 的内容。
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
   * @param position 新的地图坐标。
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
   * @param type 要订阅的 Descriptor 事件名称。
   * @param listener 接收对应载荷的监听函数。
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

/** 管理 Overlay 和 Descriptor 的公开服务。 */
export interface OverlayService {
  /**
   * 创建并注册一个 Overlay。
   *
   * @typeParam T Overlay 携带的业务数据类型。
   * @param spec DOM 元素、定位、行为和业务数据。
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
   * @typeParam T Overlay 携带的业务数据类型。
   * @param id 要获取的 Overlay ID。
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
   * @typeParam T Overlay 携带的业务数据类型。
   * @param selector ID、业务模块、可见状态和自定义筛选条件。
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
   * @param selector 待移除 Overlay 的查询条件。
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
   * @typeParam T Descriptor 携带的业务数据类型。
   * @param spec 内容、定位、交互和业务数据。
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
