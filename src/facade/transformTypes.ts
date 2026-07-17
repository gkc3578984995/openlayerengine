import type { Coordinate } from '../core/common/types.js';
import type { ElementCopyOptions, ElementSelector } from '../core/element/types.js';
import type { StyleSpec } from '../core/style/types.js';
import type { InteractionPolicy, InteractionStatus } from '../services/events/types.js';
import type { Element } from './Element.js';

/** Transform 平移模式。 */
export type TransformTranslateMode = 'none' | 'center' | 'feature';

/** Transform 操作模式。 */
export type TransformMode = 'transform' | 'edit';

/** Transform 工具栏项目配置。 */
export interface TransformToolbarItemSpec {
  /** 工具栏命令的唯一标识。 */
  key: string;
  /** 按钮提示和辅助说明使用的标题。 */
  title: string;
  /** 作为按钮 HTML 写入的图标；只应传入可信内容。 */
  icon?: string;
  /** 附加到工具栏按钮的 CSS 类名。 */
  iconClass?: string;
  /** 工具栏项目是否可见。 */
  visible?: boolean;
  /** 工具栏项目是否禁用。 */
  disabled?: boolean;
  /** 工具栏项目是否显示激活样式。 */
  active?: boolean;
}

/** Transform 工具栏项目更新内容。 */
export interface TransformToolbarItemPatch {
  /** 新的按钮提示和辅助说明。 */
  title?: string;
  /** 新的按钮 HTML；只应传入可信内容。 */
  icon?: string;
  /** 新的按钮附加 CSS 类名。 */
  iconClass?: string;
  /** 是否显示该项目。 */
  visible?: boolean;
  /** 是否禁用该项目。 */
  disabled?: boolean;
  /** 是否显示该项目的激活样式。 */
  active?: boolean;
}

/** Transform 工具栏配置。 */
export interface TransformToolbarOptions {
  /** 替换默认工具栏的项目列表。 */
  items?: readonly TransformToolbarItemSpec[];
  /** 工具栏相对锚点的水平、垂直偏移，单位为 CSS 像素。 */
  offset?: readonly [number, number];
  /** 附加到工具栏根元素的类名。 */
  className?: string;
  /** 工具栏初始是否可见。 */
  visible?: boolean;
}

/** Transform 工具栏视图更新内容。 */
export interface TransformToolbarOptionsPatch {
  /** 工具栏在地图上的新锚点坐标。 */
  position?: Coordinate;
  /** 相对锚点的新偏移，单位为 CSS 像素。 */
  offset?: readonly [number, number];
  /** 工具栏根元素的新附加类名。 */
  className?: string;
  /** 工具栏是否可见。 */
  visible?: boolean;
}

/** Transform Session 的启动配置。 */
export interface TransformOptions {
  /** 限定 Session 可选 Element 的查询条件。 */
  selector?: ElementSelector;
  /** 对公共 Element 句柄进行二次筛选。 */
  predicate?: (element: Element) => boolean;
  /** Session 允许操作的图层 ID。 */
  layerIds?: readonly string[];
  /** 控制手柄和 Element 的命中容差，单位为 CSS 像素。 */
  hitTolerance?: number;
  /** 平移方式：禁用、中心手柄或直接拖动 Element。 */
  translate?: TransformTranslateMode;
  /** 是否允许等比或双轴缩放。 */
  scale?: boolean;
  /** 是否允许沿单轴拉伸。 */
  stretch?: boolean;
  /** 是否显示旋转手柄并接受旋转操作。 */
  rotate?: boolean;
  /** 是否允许直接拖动控制区域平移。 */
  translateBBox?: boolean;
  /** 是否禁止缩放和拉伸穿过零点后翻转。 */
  noFlip?: boolean;
  /** 矩形四角缩放时是否锁定宽高比，默认 false；拖动时按 Shift 可临时等比缩放。 */
  keepRectangle?: boolean;
  /** 几何外包框周围的缓冲，单位为 CSS 像素。 */
  buffer?: number;
  /** Point Element 控制区域的半径，单位为 CSS 像素。 */
  pointRadius?: number;
  /** 覆盖 Transform 控制手柄的结构化样式。 */
  handleStyle?: StyleSpec;
  /** 覆盖默认计算结果的操作中心坐标。 */
  handleCenter?: Coordinate;
  /** Session 最多保留的撤销和重做快照数量。 */
  historyLimit?: number;
  /** 用布尔值启停默认工具栏，或传入自定义配置。 */
  toolbar?: boolean | TransformToolbarOptions;
  /** 交互冲突策略：`replace` 替换旧交互，`reject` 拒绝新交互。 */
  policy?: InteractionPolicy;
}

/** 替换当前选中 Element 时的配置。 */
export interface TransformReplaceOptions {
  /** 替换 Element 后是否保留当前历史记录。 */
  retainHistory?: boolean;
}

/**
 * Transform Session 的事件载荷映射。
 *
 * @typeParam T Element 携带的业务数据类型。
 */
export interface TransformEventMap<T = unknown> {
  /** 选择事件。Element 进入当前 Transform Session 时触发。 */
  select: Readonly<{
    /** 固定为 `select`。 */
    type: 'select';
    /** 当前选中的实时 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 选择结束事件。Element 离开当前 Transform 选择时触发。 */
  selectEnd: Readonly<{
    /** 固定为 `selectEnd`。 */
    type: 'selectEnd';
    /** 结束选择的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 进入手柄事件。指针进入控制手柄时触发。 */
  enterHandle: Readonly<{
    /** 固定为 `enterHandle`。 */
    type: 'enterHandle';
    /** 当前选中的 Element 句柄。 */
    element: Element<T>;
    /** 当前进入的控制手柄标识。 */
    key: string;
    /** 该手柄建议使用的 CSS cursor。 */
    cursor?: string;
  }>;
  /** 离开手柄事件。指针离开控制手柄时触发。 */
  leaveHandle: Readonly<{
    /** 固定为 `leaveHandle`。 */
    type: 'leaveHandle';
    /** 当前选中的 Element 句柄。 */
    element: Element<T>;
    /** 当前离开的控制手柄标识。 */
    key: string;
    /** 该手柄建议使用的 CSS cursor。 */
    cursor?: string;
  }>;
  /** 平移开始事件。一次平移操作开始时触发。 */
  translateStart: Readonly<{
    /** 固定为 `translateStart`。 */
    type: 'translateStart';
    /** 当前操作的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 平移过程事件。平移预览发生变化时触发。 */
  translating: Readonly<{
    /** 固定为 `translating`。 */
    type: 'translating';
    /** 当前操作的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 平移结束事件。一次平移操作结束时触发。 */
  translateEnd: Readonly<{
    /** 固定为 `translateEnd`。 */
    type: 'translateEnd';
    /** 当前操作的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 旋转开始事件。一次旋转操作开始时触发。 */
  rotateStart: Readonly<{
    /** 固定为 `rotateStart`。 */
    type: 'rotateStart';
    /** 当前操作的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 旋转过程事件。旋转预览发生变化时触发。 */
  rotating: Readonly<{
    /** 固定为 `rotating`。 */
    type: 'rotating';
    /** 当前操作的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 旋转结束事件。一次旋转操作结束时触发。 */
  rotateEnd: Readonly<{
    /** 固定为 `rotateEnd`。 */
    type: 'rotateEnd';
    /** 当前操作的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 缩放开始事件。一次缩放或拉伸操作开始时触发。 */
  scaleStart: Readonly<{
    /** 固定为 `scaleStart`。 */
    type: 'scaleStart';
    /** 当前操作的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 缩放过程事件。缩放或拉伸预览发生变化时触发。 */
  scaling: Readonly<{
    /** 固定为 `scaling`。 */
    type: 'scaling';
    /** 当前操作的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 缩放结束事件。一次缩放或拉伸操作结束时触发。 */
  scaleEnd: Readonly<{
    /** 固定为 `scaleEnd`。 */
    type: 'scaleEnd';
    /** 当前操作的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 编辑事件。顶点编辑结果发生变化时触发。 */
  edit: Readonly<{
    /** 固定为 `edit`。 */
    type: 'edit';
    /** 当前编辑的 Element 句柄。 */
    element: Element<T>;
  }>;
  /** 复制完成事件。直接复制成功或确认复制预览并创建 Element 时触发。 */
  copyPreviewConfirm: Readonly<{
    /** 固定为 `copyPreviewConfirm`。 */
    type: 'copyPreviewConfirm';
    /** 新创建 Element 的实时句柄。 */
    element: Element<T>;
  }>;
  /** 复制取消事件。复制预览被取消时触发。 */
  copyPreviewCancel: Readonly<{
    /** 固定为 `copyPreviewCancel`。 */
    type: 'copyPreviewCancel';
  }>;
  /** 删除事件。当前选中的 Element 被移除时触发。 */
  remove: Readonly<{
    /** 固定为 `remove`。 */
    type: 'remove';
    /** 刚被移除的句柄；仍可读取 ID，但不能继续操作。 */
    element: Element<T>;
  }>;
  /** 错误事件。Session 捕获操作错误时触发。 */
  error: Readonly<{
    /** 固定为 `error`。 */
    type: 'error';
    /** 本次失败捕获到的原始错误。 */
    error: unknown;
  }>;
}

/** Transform 工具栏的公开控制句柄。 */
export interface TransformToolbarHandle {
  /**
   * 激活指定工具栏项目的视图状态。
   *
   * @param key 要显示为激活状态的项目标识。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) {
   *   const session = earth.transform.select(element, { toolbar: true });
   *   session.toolbar?.setActive('edit');
   * }
   * ```
   */
  setActive(key: string): void;
  /**
   * 更新指定工具栏项目的视图属性。
   *
   * @param key 待更新的项目标识。
   * @param patch 要合并到项目状态的内容。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) {
   *   const session = earth.transform.select(element, { toolbar: true });
   *   session.toolbar?.updateItem('remove', { disabled: true });
   * }
   * ```
   */
  updateItem(key: string, patch: TransformToolbarItemPatch): void;
  /**
   * 更新工具栏的位置、偏移、类名或可见状态。
   *
   * @param patch 要合并到工具栏视图的内容。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) {
   *   const session = earth.transform.select(element, { toolbar: true });
   *   session.toolbar?.updateOptions({ offset: [20, 8] });
   * }
   * ```
   */
  updateOptions(patch: TransformToolbarOptionsPatch): void;
  /**
   * 显示当前工具栏。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) {
   *   const session = earth.transform.select(element, { toolbar: true });
   *   session.toolbar?.show();
   * }
   * ```
   */
  show(): void;
  /**
   * 隐藏当前工具栏。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) {
   *   const session = earth.transform.select(element, { toolbar: true });
   *   session.toolbar?.hide();
   * }
   * ```
   */
  hide(): void;
  /**
   * 销毁当前工具栏视图。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) {
   *   const session = earth.transform.select(element, { toolbar: true });
   *   session.toolbar?.destroy();
   * }
   * ```
   */
  destroy(): void;
}

/**
 * 一次 Transform 交互的公共 Session 句柄。
 *
 * @typeParam T Element 携带的业务数据类型。
 */
export interface TransformSession<T = unknown> {
  /** 当前选中的实时 Element 句柄。 */
  readonly selected: Element<T> | undefined;
  /** Session 当前处于活动、完成或取消状态。 */
  readonly status: InteractionStatus;
  /** 当前使用外包框变换还是顶点编辑。 */
  readonly mode: TransformMode;
  /** 启用工具栏并选中 Element 后可用的控制句柄。 */
  readonly toolbar: TransformToolbarHandle | undefined;
  /**
   * 在当前 Session 中选择一个 Element。
   *
   * @param element 属于当前 Earth、且仍有效的 Element 句柄。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.transform.start();
   * const element = earth.elements.get('target');
   * if (element) session.select(element);
   * ```
   */
  select(element: Element<T>): void;
  /**
   * 切换外包框变换或顶点编辑模式。
   *
   * @param mode 要进入的 Transform 模式。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.transform.select(element).setMode('edit');
   * ```
   */
  setMode(mode: TransformMode): void;
  /**
   * 提交当前预览并结束 Session。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.transform.start().finish();
   * ```
   */
  finish(): void;
  /**
   * 取消 Session，并丢弃尚未提交的预览。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.transform.start().cancel();
   * ```
   */
  cancel(): void;
  /**
   * 撤销当前 Session 的最近一次操作。
   *
   * @returns 成功撤销时返回 `true`，没有可撤销操作时返回 `false`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const changed = earth.transform.start().undo();
   * ```
   */
  undo(): boolean;
  /**
   * 重做当前 Session 的下一次操作。
   *
   * @returns 成功重做时返回 `true`，没有可重做操作时返回 `false`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const changed = earth.transform.start().redo();
   * ```
   */
  redo(): boolean;
  /**
   * 立即复制当前选中的 Element。
   *
   * @param options 新 Element 的可选字段覆盖值。
   * @returns 新 Element 的实时句柄。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.transform.select(element).copy({ module: 'copies' });
   * ```
   */
  copy(options?: ElementCopyOptions<T>): Element<T>;
  /**
   * 使用另一个 Element 替换当前选择。
   *
   * @param element 属于当前 Earth、且仍有效的 Element 句柄。
   * @param options 是否保留当前 Session 历史。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const first = earth.elements.get('first');
   * const second = earth.elements.get('second');
   * if (first && second) earth.transform.select(first).replaceSelected(second);
   * ```
   */
  replaceSelected(element: Element<T>, options?: TransformReplaceOptions): void;
  /**
   * 删除当前选中的 Element。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.transform.select(element).remove();
   * ```
   */
  remove(): void;
  /**
   * 订阅指定的 Transform Session 事件。
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
   * const session = earth.transform.start();
   * const off = session.on('select', ({ element }) => console.log(element.id));
   * off();
   * ```
   */
  on<K extends keyof TransformEventMap<T>>(type: K, listener: (event: TransformEventMap<T>[K]) => void): () => void;
}

/** 变换和顶点编辑 Element 的公开服务。 */
export interface TransformService {
  /**
   * 启动一个等待选择 Element 的 Transform Session。
   *
   * @param options 目标范围、变换能力、工具栏和交互冲突策略。
   * @returns 已打开且处于活动状态的 Transform Session。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.transform.start({ toolbar: true });
   * ```
   */
  start(options?: TransformOptions): TransformSession;
  /**
   * 启动 Transform Session 并立即选择指定 Element。
   *
   * @typeParam T Element 携带的业务数据类型。
   * @param element 属于当前 Earth、且仍有效的 Element 句柄。
   * @param options 目标范围、变换能力、工具栏和交互冲突策略。
   * @returns 已选择目标且处于活动状态的 Transform Session。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const element = earth.elements.get('target');
   * if (element) earth.transform.select(element, { toolbar: true });
   * ```
   */
  select<T>(element: Element<T>, options?: TransformOptions): TransformSession<T>;
}
