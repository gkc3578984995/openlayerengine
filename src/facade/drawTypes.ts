import type { Coordinate } from '../core/common/types.js';
import type { ElementSelector } from '../core/element/types.js';
import type { ShapeState, ShapeType } from '../core/shape/types.js';
import type { InteractionPolicy, InteractionStatus } from '../services/events/types.js';
import type { Element } from './Element.js';
import type { StyleInput } from './styleTypes.js';

/**
 * Draw Session 的启动配置。
 *
 * @typeParam T 完成后的 Element 携带的业务数据类型。
 */
export interface DrawOptions<T = unknown> {
  /** 已注册且支持绘制的图形类型。 */
  type: ShapeType;
  /** 承载预览和完成结果的矢量图层 ID。 */
  layerId: string;
  /** 写入完成结果的业务模块标识。 */
  module?: string;
  /** 结构化样式，或属于当前 Earth 的原生 OpenLayers 样式。 */
  style?: StyleInput;
  /** 写入每个完成结果的业务数据；启动 Session 时会保存独立副本。 */
  data?: T;
  /** 自动结束前的完成数量；省略或设为 `0` 时持续绘制。 */
  limit?: number;
  /** 是否保留完成的 Element；设为 `false` 时只在同步 `complete` 回调期间提供临时句柄。 */
  keepGraphics?: boolean;
  /** 交互冲突策略：`replace` 替换旧交互，`reject` 拒绝新交互。 */
  policy?: InteractionPolicy;
}

/** Edit Session 的启动配置。 */
export interface EditOptions {
  /** 是否在临时编辑图层中保留进入编辑时的原始几何。 */
  underlay?: boolean;
  /** 交互冲突策略：`replace` 替换旧交互，`reject` 拒绝新交互。 */
  policy?: InteractionPolicy;
}

/**
 * Draw Session 的事件载荷映射。
 *
 * @typeParam T 完成后的 Element 携带的业务数据类型。
 */
export interface DrawSessionEventMap<T = unknown> {
  /** 开始事件。首个控制点或自由绘制手势开始时触发。 */
  readonly start: Readonly<{
    /** 固定为 `start`。 */
    type: 'start';
    /** 触发绘制的坐标快照。 */
    coordinate: Coordinate;
  }>;
  /** 变化事件。当前草图的预览几何变化时触发。 */
  readonly change: Readonly<{
    /** 固定为 `change`。 */
    type: 'change';
    /** 当前预览几何的只读快照。 */
    geometry: ShapeState;
    /** 触发本次变化的指针坐标快照。 */
    coordinate?: Coordinate;
  }>;
  /** 点击事件。一个控制点被当前草图接受后触发。 */
  readonly click: Readonly<{
    /** 固定为 `click`。 */
    type: 'click';
    /** 新增控制点的坐标快照。 */
    coordinate: Coordinate;
    /** 当前草图已接受的控制点总数。 */
    controlPointCount: number;
  }>;
  /** 完成事件。Element 成功提交到 Store 后触发。 */
  readonly complete: Readonly<{
    /** 固定为 `complete`。 */
    type: 'complete';
    /** 本次创建的实时 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 取消事件。当前草图或整个 Session 被取消时触发。 */
  readonly cancel: Readonly<{
    /** 固定为 `cancel`。 */
    type: 'cancel';
    /** Session 被替换、销毁、主动取消或异常终止的具体原因。 */
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'incomplete' | 'native' | 'error';
  }>;
}

/**
 * Edit Session 的事件载荷映射。
 *
 * @typeParam T 目标 Element 携带的业务数据类型。
 */
export interface EditSessionEventMap<T = unknown> {
  /** 修改事件。工作几何发生变化且尚未提交时触发。 */
  readonly modifying: Readonly<{
    /** 固定为 `modifying`。 */
    type: 'modifying';
    /** 启动编辑时传入的 Element 句柄。 */
    element: Element<T>;
    /** 当前工作几何的只读快照，尚未提交到 Store。 */
    geometry: ShapeState;
    /** 引发本次变化的编辑操作。 */
    operation: 'move' | 'insert' | 'remove' | 'undo' | 'redo';
    /** 移动、插入或删除涉及的坐标快照。 */
    coordinate?: Coordinate;
  }>;
  /** 完成事件。编辑结果成功提交到 Store 后触发。 */
  readonly complete: Readonly<{
    /** 固定为 `complete`。 */
    type: 'complete';
    /** 仍指向同一 Element 的实时句柄。 */
    element: Element<T>;
  }>;
  /** 取消事件。Edit Session 未提交结果而结束时触发。 */
  readonly cancel: Readonly<{
    /** 固定为 `cancel`。 */
    type: 'cancel';
    /** Session 终止或目标 Element 被外部改变的具体原因。 */
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'external-change' | 'external-remove' | 'error';
  }>;
}

/**
 * 一次 Draw 交互的公共 Session 句柄。
 *
 * @typeParam T 绘制结果携带的业务数据类型。
 */
export interface DrawSession<T = unknown> {
  /** Session 当前处于活动、完成或取消状态。 */
  readonly status: InteractionStatus;
  /** 本次 Session 已完成、选择保留且仍有效的 Element。 */
  readonly results: readonly Element<T>[];
  /** Session 进入终态后解析为最终绘制结果。 */
  readonly finished: Promise<readonly Element<T>[]>;
  /**
   * 完成当前草图并结束 Draw Session。
   *
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
   * 取消当前 Session，并丢弃尚未完成的草图。
   *
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
   * 销毁 Session 并释放其交互资源。
   *
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
   * 订阅指定的 Draw Session 事件。
   *
   * @typeParam K 要订阅的事件名称类型。
   * @param type 事件名称。
   * @param listener 接收对应只读载荷的监听函数。
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
 * 一次动态编辑交互的公共 Session 句柄。
 *
 * @typeParam T 目标 Element 携带的业务数据类型。
 */
export interface EditSession<T = unknown> {
  /** 启动编辑时传入的实时 Element 句柄。 */
  readonly element: Element<T>;
  /** Session 当前处于活动、完成或取消状态。 */
  readonly status: InteractionStatus;
  /** 成功提交时解析为目标 Element，取消时解析为 `undefined`。 */
  readonly finished: Promise<Element<T> | undefined>;
  /**
   * 原子提交当前工作几何并结束编辑。
   *
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
   * 销毁 Edit Session 并释放其交互资源。
   *
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
   * 订阅指定的 Edit Session 事件。
   *
   * @typeParam K 要订阅的事件名称类型。
   * @param type 事件名称。
   * @param listener 接收对应只读载荷的监听函数。
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

/** 绘制图形和启动动态 Edit Session 的公开服务。 */
export interface DrawService {
  /**
   * 启动 Draw Session。
   *
   * @typeParam T 完成后的 Element 携带的业务数据类型。
   * @param options 图形类型、目标图层、样式、业务数据和冲突策略。
   * @returns 已打开且处于活动状态的 Draw Session。
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
   * 为当前 Earth 中仍有效的 Element 启动动态编辑。
   *
   * @typeParam T 目标 Element 携带的业务数据类型。
   * @param element 属于当前 Earth、且仍有效的 Element 句柄。
   * @param options 临时底图和交互冲突策略。
   * @returns 已打开且处于活动状态的 Edit Session。
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
   * 查询由绘制服务创建且仍然存在的 Element。
   *
   * @typeParam T Element 携带的业务数据类型。
   * @param selector 查询条件；省略时返回当前服务拥有的全部 Element。
   * @returns 匹配条件且仍有效的实时 Element 只读列表。
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
   * 移除由绘制服务创建且匹配条件的 Element。
   *
   * @param selector 移除条件；省略时清除当前服务拥有的全部 Element。
   * @returns 实际移除的 Element 数量。
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
