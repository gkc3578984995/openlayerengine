import type { Coordinate } from '../core/common/types.js';
import type { ElementSelector } from '../core/element/types.js';
import type { ShapeState, ShapeType } from '../core/shape/types.js';
import type { InteractionPolicy, InteractionStatus } from '../services/events/types.js';
import type { Element } from './Element.js';
import type { StyleInput } from './styleTypes.js';

/**
 * 绘制会话的启动配置。
 *
 * @typeParam T 业务数据。表示元素附加数据的类型。
 */
export interface DrawOptions<T = unknown> {
  /** 图形类型。指定已注册且支持绘制的图形类型。 */
  type: ShapeType;
  /** 目标图层。指定承载预览和完成元素的矢量图层 ID。 */
  layerId: string;
  /** 业务模块。写入完成元素的可选模块标识。 */
  module?: string;
  /** 元素样式。接受结构化样式或属于当前 Earth 的原生样式。 */
  style?: StyleInput;
  /** 业务数据。写入每个完成元素并在启动时保存独立副本。 */
  data?: T;
  /** 完成数量。达到该数量后自动结束，省略或设为 `0` 时持续绘制。 */
  limit?: number;
  /** 保留元素。设为 `false` 时仅在同步 `complete` 监听期间提供临时元素。 */
  keepGraphics?: boolean;
  /** 冲突策略。使用 `replace` 替换旧交互，使用 `reject` 拒绝新交互。 */
  policy?: InteractionPolicy;
}

/** 编辑会话的启动配置。 */
export interface EditOptions {
  /** 原始底图。控制临时编辑图层是否绘制进入编辑时的原始几何。 */
  underlay?: boolean;
  /** 冲突策略。使用 `replace` 替换旧交互，使用 `reject` 拒绝新交互。 */
  policy?: InteractionPolicy;
}

/**
 * 绘制会话的事件载荷映射。
 *
 * @typeParam T 业务数据。表示元素附加数据的类型。
 */
export interface DrawSessionEventMap<T = unknown> {
  /** 开始事件。首个控制点或自由绘制手势开始时触发。 */
  readonly start: Readonly<{
    /** 事件类型。固定为 `start`。 */
    type: 'start';
    /** 起始坐标。提供触发绘制的坐标快照。 */
    coordinate: Coordinate;
  }>;
  /** 变化事件。当前草图的预览几何变化时触发。 */
  readonly change: Readonly<{
    /** 事件类型。固定为 `change`。 */
    type: 'change';
    /** 草图几何。提供当前预览几何的只读快照。 */
    geometry: ShapeState;
    /** 指针坐标。提供触发本次变化的可选坐标快照。 */
    coordinate?: Coordinate;
  }>;
  /** 点击事件。一个控制点被当前草图接受后触发。 */
  readonly click: Readonly<{
    /** 事件类型。固定为 `click`。 */
    type: 'click';
    /** 控制点坐标。提供新增控制点的坐标快照。 */
    coordinate: Coordinate;
    /** 控制点数量。表示当前草图已经接受的控制点总数。 */
    controlPointCount: number;
  }>;
  /** 完成事件。元素成功提交到元素存储后触发。 */
  readonly complete: Readonly<{
    /** 事件类型。固定为 `complete`。 */
    type: 'complete';
    /** 完成元素。提供本次创建的实时元素句柄。 */
    element: Element<T>;
  }>;
  /** 取消事件。当前草图或整个会话被取消时触发。 */
  readonly cancel: Readonly<{
    /** 事件类型。固定为 `cancel`。 */
    type: 'cancel';
    /** 取消原因。说明会话被替换、销毁、主动取消或异常终止的原因。 */
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'incomplete' | 'native' | 'error';
  }>;
}

/**
 * 编辑会话的事件载荷映射。
 *
 * @typeParam T 业务数据。表示元素附加数据的类型。
 */
export interface EditSessionEventMap<T = unknown> {
  /** 修改事件。工作几何发生变化且尚未提交时触发。 */
  readonly modifying: Readonly<{
    /** 事件类型。固定为 `modifying`。 */
    type: 'modifying';
    /** 目标元素。提供启动编辑时传入的元素句柄。 */
    element: Element<T>;
    /** 工作几何。提供当前编辑结果的只读快照。 */
    geometry: ShapeState;
    /** 编辑操作。说明本次变化来自移动、插入、删除、撤销或重做。 */
    operation: 'move' | 'insert' | 'remove' | 'undo' | 'redo';
    /** 操作坐标。提供移动、插入或删除操作涉及的可选坐标快照。 */
    coordinate?: Coordinate;
  }>;
  /** 完成事件。编辑结果成功提交到元素存储后触发。 */
  readonly complete: Readonly<{
    /** 事件类型。固定为 `complete`。 */
    type: 'complete';
    /** 目标元素。提供仍代表同一元素实例的实时句柄。 */
    element: Element<T>;
  }>;
  /** 取消事件。编辑会话未提交结果而结束时触发。 */
  readonly cancel: Readonly<{
    /** 事件类型。固定为 `cancel`。 */
    type: 'cancel';
    /** 取消原因。说明会话终止或目标元素被外部改变的原因。 */
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'external-change' | 'external-remove' | 'error';
  }>;
}

/**
 * 一次绘制交互的公开会话句柄。
 *
 * @typeParam T 业务数据。表示元素附加数据的类型。
 */
export interface DrawSession<T = unknown> {
  /** 会话状态。表示会话当前处于活动、完成或取消状态。 */
  readonly status: InteractionStatus;
  /** 绘制结果。包含本会话已完成、选择保留且仍然有效的元素。 */
  readonly results: readonly Element<T>[];
  /** 完成结果。会话进入终态后解析为最终绘制结果。 */
  readonly finished: Promise<readonly Element<T>[]>;
  /**
   * 完成当前草图并结束绘制会话。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.draw.start({ type: 'point', layerId: 'default' });
   * session.finish();
   * ```
   */
  finish(): void;
  /**
   * 取消当前会话并丢弃尚未完成的草图。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.draw.start({ type: 'polyline', layerId: 'default' });
   * session.cancel();
   * ```
   */
  cancel(): void;
  /**
   * 销毁会话并释放其交互资源。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.draw.start({ type: 'polygon', layerId: 'default' });
   * session.destroy();
   * ```
   */
  destroy(): void;
  /**
   * 撤销当前未完成草图的最近一步。
   *
   * @returns 成功撤销时返回 `true`，没有可撤销步骤时返回 `false`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.draw.start({ type: 'polyline', layerId: 'default' });
   * const changed = session.undo();
   * ```
   */
  undo(): boolean;
  /**
   * 重做当前未完成草图的下一步。
   *
   * @returns 成功重做时返回 `true`，没有可重做步骤时返回 `false`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.draw.start({ type: 'polyline', layerId: 'default' });
   * const changed = session.redo();
   * ```
   */
  redo(): boolean;
  /**
   * 订阅指定的绘制会话事件。
   *
   * @typeParam K 事件类型。表示订阅事件名称的类型。
   * @param type 事件名称。指定要订阅的事件。
   * @param listener 监听函数。接收对应的只读事件载荷。
   * @returns 用于取消本次订阅的幂等函数。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.draw.start({ type: 'point', layerId: 'default' });
   * const off = session.on('complete', ({ element }) => console.log(element.id));
   * off();
   * ```
   */
  on<K extends keyof DrawSessionEventMap<T>>(type: K, listener: (event: DrawSessionEventMap<T>[K]) => void): () => void;
}

/**
 * 一次动态编辑交互的公开会话句柄。
 *
 * @typeParam T 业务数据。表示元素附加数据的类型。
 */
export interface EditSession<T = unknown> {
  /** 目标元素。提供启动编辑时传入的实时元素句柄。 */
  readonly element: Element<T>;
  /** 会话状态。表示会话当前处于活动、完成或取消状态。 */
  readonly status: InteractionStatus;
  /** 完成结果。成功提交时解析为目标元素，取消时解析为 `undefined`。 */
  readonly finished: Promise<Element<T> | undefined>;
  /**
   * 原子提交当前工作几何并结束编辑。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.draw.edit(element).finish();
   * ```
   */
  finish(): void;
  /**
   * 取消编辑且不提交当前工作几何。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.draw.edit(element).cancel();
   * ```
   */
  cancel(): void;
  /**
   * 销毁编辑会话并释放其交互资源。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.draw.edit(element).destroy();
   * ```
   */
  destroy(): void;
  /**
   * 撤销当前编辑历史的最近一步。
   *
   * @returns 成功撤销时返回 `true`，没有可撤销步骤时返回 `false`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.draw.edit(element).undo();
   * ```
   */
  undo(): boolean;
  /**
   * 重做当前编辑历史的下一步。
   *
   * @returns 成功重做时返回 `true`，没有可重做步骤时返回 `false`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.draw.edit(element).redo();
   * ```
   */
  redo(): boolean;
  /**
   * 订阅指定的编辑会话事件。
   *
   * @typeParam K 事件类型。表示订阅事件名称的类型。
   * @param type 事件名称。指定要订阅的事件。
   * @param listener 监听函数。接收对应的只读事件载荷。
   * @returns 用于取消本次订阅的幂等函数。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.draw.edit(element).on('modifying', ({ geometry }) => console.log(geometry));
   * ```
   */
  on<K extends keyof EditSessionEventMap<T>>(type: K, listener: (event: EditSessionEventMap<T>[K]) => void): () => void;
}

/** 绘制和动态编辑能力的公开入口。 */
export interface DrawService {
  /**
   * 启动一个绘制会话。
   *
   * @typeParam T 业务数据。表示元素附加数据的类型。
   * @param options 绘制配置。指定图形类型、目标图层、样式、业务数据和冲突策略。
   * @returns 已打开并处于活动状态的绘制会话。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.draw.start({ type: 'point', layerId: 'default' });
   * ```
   */
  start<T>(options: DrawOptions<T>): DrawSession<T>;
  /**
   * 为当前 Earth 中仍然有效的元素启动动态编辑。
   *
   * @typeParam T 业务数据。表示元素附加数据的类型。
   * @param element 元素句柄。指定要编辑且属于当前 Earth 的实时元素。
   * @param options 编辑配置。指定临时底图和交互冲突策略。
   * @returns 已打开并处于活动状态的编辑会话。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.draw.edit(element, { underlay: true });
   * ```
   */
  edit<T>(element: Element<T>, options?: EditOptions): EditSession<T>;
  /**
   * 查询由绘制服务创建且仍然存在的元素。
   *
   * @typeParam T 业务数据。表示元素附加数据的类型。
   * @param selector 元素选择器。省略时查询当前服务拥有的全部元素。
   * @returns 匹配条件且仍然有效的实时元素只读列表。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const results = earth.draw.query({ module: 'planning' });
   * ```
   */
  query<T>(selector?: ElementSelector<T>): readonly Element<T>[];
  /**
   * 移除由绘制服务创建且匹配条件的元素。
   *
   * @param selector 元素选择器。省略时清除当前服务拥有的全部元素。
   * @returns 实际移除的元素数量。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const removed = earth.draw.clear({ module: 'planning' });
   * ```
   */
  clear(selector?: ElementSelector): number;
}
