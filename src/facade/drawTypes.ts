import type { Coordinate } from '../core/common/types.js';
import type { ElementSelector } from '../core/element/types.js';
import type { ShapeState, ShapeType } from '../core/shape/types.js';
import type { InteractionPolicy, InteractionStatus } from '../services/events/types.js';
import type { Element } from './Element.js';
import type { StyleInput } from './styleTypes.js';

/**
 * 绘制会话的启动配置。
 *
 * @typeParam T 元素附加业务数据的类型。
 */
export interface DrawOptions<T = unknown> {
  /** 已注册且支持绘制能力的图形类型。 */
  type: ShapeType;
  /** 承载预览和完成元素的目标矢量图层 ID。 */
  layerId: string;
  /** 写入完成元素的可选业务模块标识。 */
  module?: string;
  /**
   * 元素样式。结构化样式和业务数据会在启动时复制；原生样式引用必须属于当前 Earth。
   */
  style?: StyleInput;
  /** 写入每个完成元素的业务数据；引擎在启动时保存独立副本。 */
  data?: T;
  /**
   * 自动结束会话前允许完成的元素数量；省略或 `0` 表示持续绘制。
   *
   * @defaultValue `0`
   */
  limit?: number;
  /**
   * 是否保留完成元素。设为 `false` 时，`complete` 监听器会同步收到有效元素，全部监听器返回后该元素即被移除，且不会进入 `results`。
   *
   * @defaultValue `true`
   */
  keepGraphics?: boolean;
  /**
   * 与当前互斥交互冲突时的处理策略；`replace` 结束旧交互，`reject` 则抛出冲突异常。
   *
   * @defaultValue `'replace'`
   */
  policy?: InteractionPolicy;
}

/** 编辑会话的启动配置。 */
export interface EditOptions {
  /**
   * 是否在临时编辑图层中同时绘制进入编辑时的原始几何；该底图不会写入元素状态。
   *
   * @defaultValue `false`
   */
  underlay?: boolean;
  /**
   * 与当前互斥交互冲突时的处理策略。
   *
   * @defaultValue `'replace'`
   */
  policy?: InteractionPolicy;
}

/**
 * 绘制会话的事件负载映射。
 *
 * @typeParam T 元素附加业务数据的类型。
 */
export interface DrawSessionEventMap<T = unknown> {
  /** 首个控制点或自由绘制手势开始时触发。 */
  readonly start: Readonly<{
    /** 事件判别字段。 */
    type: 'start';
    /** 起始坐标的只读快照。 */
    coordinate: Coordinate;
  }>;
  /** 当前草图的预览几何发生变化时触发。 */
  readonly change: Readonly<{
    /** 事件判别字段。 */
    type: 'change';
    /** 当前草图几何的只读快照。 */
    geometry: ShapeState;
    /** 触发本次预览变化的可选指针坐标快照。 */
    coordinate?: Coordinate;
  }>;
  /** 一个控制点被当前草图接受后触发。 */
  readonly click: Readonly<{
    /** 事件判别字段。 */
    type: 'click';
    /** 新增控制点的坐标快照。 */
    coordinate: Coordinate;
    /** 当前草图已经接受的控制点总数。 */
    controlPointCount: number;
  }>;
  /** 一个元素成功提交到元素存储后触发。 */
  readonly complete: Readonly<{
    /** 事件判别字段。 */
    type: 'complete';
    /** 完成元素的实时句柄；`keepGraphics` 为 `false` 时仅在同步监听阶段有效。 */
    element: Element<T>;
  }>;
  /** 当前草图或整个会话被取消时触发。 */
  readonly cancel: Readonly<{
    /** 事件判别字段。 */
    type: 'cancel';
    /** 取消来源：交互替换、销毁、主动取消、草图不完整、原生手势取消或内部错误。 */
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'incomplete' | 'native' | 'error';
  }>;
}

/**
 * 编辑会话的事件负载映射。
 *
 * @typeParam T 元素附加业务数据的类型。
 */
export interface EditSessionEventMap<T = unknown> {
  /** 编辑中的工作几何发生变化时触发；元素存储尚未在此事件中提交。 */
  readonly modifying: Readonly<{
    /** 事件判别字段。 */
    type: 'modifying';
    /** 启动编辑时传入的元素句柄。 */
    element: Element<T>;
    /** 当前工作几何的只读快照。 */
    geometry: ShapeState;
    /** 引起变化的编辑操作。 */
    operation: 'move' | 'insert' | 'remove' | 'undo' | 'redo';
    /** 移动、插入或删除操作涉及的可选坐标快照。 */
    coordinate?: Coordinate;
  }>;
  /** 编辑结果成功提交到元素存储后触发。 */
  readonly complete: Readonly<{
    /** 事件判别字段。 */
    type: 'complete';
    /** 启动编辑时传入且仍代表同一元素实例的句柄。 */
    element: Element<T>;
  }>;
  /** 编辑会话未提交结果而结束时触发。 */
  readonly cancel: Readonly<{
    /** 事件判别字段。 */
    type: 'cancel';
    /** 取消来源，包括目标元素在编辑期间被外部更新或移除。 */
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'external-change' | 'external-remove' | 'error';
  }>;
}

/**
 * 一次绘制交互的公开会话句柄。
 *
 * @typeParam T 元素附加业务数据的类型。
 */
export interface DrawSession<T = unknown> {
  /** 当前会话状态。 */
  readonly status: InteractionStatus;
  /** 本会话已完成、选择保留且仍代表原实例的元素列表。 */
  readonly results: readonly Element<T>[];
  /**
   * 会话进入终态后解析为最终 `results` 的 Promise。监听器异常不会使该 Promise 拒绝。
   */
  readonly finished: Promise<readonly Element<T>[]>;
  /**
   * 尝试完成当前草图并结束会话；草图不完整时触发 `incomplete` 取消事件，先前结果仍保留。重复调用不会产生第二次终态。
   *
   * @returns 无返回值。
   */
  finish(): void;
  /**
   * 取消当前会话并丢弃未完成草图；先前已完成的结果仍保留。
   *
   * @returns 无返回值。
   */
  cancel(): void;
  /**
   * 销毁会话并释放交互资源；活动会话以 `destroyed` 原因取消，重复调用用于重试尚未完成的清理。
   *
   * @returns 无返回值。
   */
  destroy(): void;
  /**
   * 撤销当前未完成草图的最近一步，不影响已经完成的元素。
   *
   * @returns 成功撤销时返回 `true`；没有可撤销步骤或会话不再活动时返回 `false`。
   * @throws 底层预览渲染失败时原样抛出该错误，并恢复撤销前状态。
   */
  undo(): boolean;
  /**
   * 重做当前未完成草图的下一步，不影响已经完成的元素。
   *
   * @returns 成功重做时返回 `true`；没有可重做步骤或会话不再活动时返回 `false`。
   * @throws 底层预览渲染失败时原样抛出该错误，并恢复重做前状态。
   */
  redo(): boolean;
  /**
   * 订阅绘制事件。监听器同步按注册顺序执行，单个监听器失败不会阻断后续监听器。
   *
   * @typeParam K 事件名称。
   * @param type 要订阅的事件名称。
   * @param listener 接收对应只读事件负载的监听器。
   * @returns 幂等的注销函数。
   * @throws `ObjectDisposedError` 会话已经进入终态时抛出。
   * @throws `InvalidArgumentError` 事件名称或监听器无效时抛出。
   */
  on<K extends keyof DrawSessionEventMap<T>>(type: K, listener: (event: DrawSessionEventMap<T>[K]) => void): () => void;
}

/**
 * 一次动态编辑交互的公开会话句柄。
 *
 * @typeParam T 元素附加业务数据的类型。
 */
export interface EditSession<T = unknown> {
  /** 启动编辑时传入的元素句柄。 */
  readonly element: Element<T>;
  /** 当前会话状态。 */
  readonly status: InteractionStatus;
  /**
   * 成功提交且目标仍为同一实例时解析为 `element`；取消、外部替换或移除时解析为 `undefined`，监听器异常不会使其拒绝。
   */
  readonly finished: Promise<Element<T> | undefined>;
  /**
   * 原子提交当前工作几何并结束编辑；目标在编辑期间被外部更新或移除时改为取消，不覆盖外部结果。
   *
   * @returns 无返回值。
   */
  finish(): void;
  /**
   * 取消编辑且不提交工作几何。
   *
   * @returns 无返回值。
   */
  cancel(): void;
  /**
   * 销毁编辑会话并释放交互资源；活动会话以 `destroyed` 原因取消。
   *
   * @returns 无返回值。
   */
  destroy(): void;
  /**
   * 撤销当前编辑历史的最近一步。
   *
   * @returns 成功撤销时返回 `true`；没有可撤销步骤或会话不再活动时返回 `false`。
   * @throws 底层编辑预览渲染失败时原样抛出该错误，并恢复撤销前状态。
   */
  undo(): boolean;
  /**
   * 重做当前编辑历史的下一步。
   *
   * @returns 成功重做时返回 `true`；没有可重做步骤或会话不再活动时返回 `false`。
   * @throws 底层编辑预览渲染失败时原样抛出该错误，并恢复重做前状态。
   */
  redo(): boolean;
  /**
   * 订阅编辑事件。监听器同步按注册顺序执行，单个监听器失败不会阻断后续监听器。
   *
   * @typeParam K 事件名称。
   * @param type 要订阅的事件名称。
   * @param listener 接收对应只读事件负载的监听器。
   * @returns 幂等的注销函数。
   * @throws `ObjectDisposedError` 会话已经进入终态时抛出。
   * @throws `InvalidArgumentError` 事件名称或监听器无效时抛出。
   */
  on<K extends keyof EditSessionEventMap<T>>(type: K, listener: (event: EditSessionEventMap<T>[K]) => void): () => void;
}

/** 绘制与动态编辑能力的统一公开入口。 */
export interface DrawService {
  /**
   * 启动一个绘制会话。
   *
   * @typeParam T 元素附加业务数据的类型。
   * @param options 图形类型、目标图层、样式、数据和交互策略。
   * @returns 已打开且处于 `active` 状态的新会话。
   * @throws `InvalidArgumentError` 配置对象、字段或取值无效时抛出。
   * @throws `CapabilityError` 图形未注册或不支持绘制时抛出。
   * @throws `InteractionConflictError` 存在互斥交互且策略为 `reject` 时抛出。
   * @throws `ObjectDisposedError` 服务已销毁时抛出。
   * @throws 底层交互初始化失败时原样抛出该错误，并回滚已经安装的资源。
   */
  start<T>(options: DrawOptions<T>): DrawSession<T>;
  /**
   * 对当前 Earth 中仍有效的元素启动动态编辑。
   *
   * @typeParam T 元素附加业务数据的类型。
   * @param element 要编辑的实时元素句柄，必须属于当前 Earth 且仍代表原实例。
   * @param options 临时底图和交互冲突策略。
   * @returns 已打开且处于 `active` 状态的新编辑会话。
   * @throws `InvalidArgumentError` 元素、配置或元素归属无效时抛出。
   * @throws `CapabilityError` 目标图形不支持编辑时抛出。
   * @throws `InteractionConflictError` 存在互斥交互且策略为 `reject` 时抛出。
   * @throws `ObjectDisposedError` 服务或目标元素已销毁时抛出。
   */
  edit<T>(element: Element<T>, options?: EditOptions): EditSession<T>;
  /**
   * 查询由本服务完成且仍存在的元素；选择器始终与服务自有 ID 范围取交集。
   *
   * @typeParam T 元素附加业务数据的类型。
   * @param selector 可选元素选择器；省略时返回该服务当前拥有的全部元素。
   * @returns 仍有效的实时元素句柄只读列表，不包含其他服务或外部创建的元素。
   * @throws `InvalidArgumentError` 选择器无效时抛出。
   * @throws `ObjectDisposedError` 服务已销毁时抛出。
   */
  query<T>(selector?: ElementSelector<T>): readonly Element<T>[];
  /**
   * 移除由本服务完成且匹配选择器的元素，不会删除其他来源的元素。
   *
   * @param selector 可选元素选择器；省略时清除该服务当前拥有的全部元素。
   * @returns 实际移除的元素数量。
   * @throws `InvalidArgumentError` 选择器无效时抛出。
   * @throws `ObjectDisposedError` 服务已销毁时抛出。
   */
  clear(selector?: ElementSelector): number;
}
