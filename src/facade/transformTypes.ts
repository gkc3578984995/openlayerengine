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
  /** 项目标识。用于识别工具栏命令。 */
  key: string;
  /** 项目标题。用于按钮提示和辅助说明。 */
  title: string;
  /** 项目图标。会作为按钮 HTML 写入，请只传入可信内容。 */
  icon?: string;
  /** 图标类名。附加到工具栏按钮的 CSS 类名。 */
  iconClass?: string;
  /** 可见状态。控制工具栏项目是否显示。 */
  visible?: boolean;
  /** 禁用状态。控制工具栏项目是否不可操作。 */
  disabled?: boolean;
  /** 激活状态。控制工具栏项目是否显示为激活样式。 */
  active?: boolean;
}

/** Transform 工具栏项目更新内容。 */
export interface TransformToolbarItemPatch {
  /** 项目标题。更新按钮提示和辅助说明。 */
  title?: string;
  /** 项目图标。更新按钮 HTML，请只传入可信内容。 */
  icon?: string;
  /** 图标类名。更新按钮附加的 CSS 类名。 */
  iconClass?: string;
  /** 可见状态。更新工具栏项目是否显示。 */
  visible?: boolean;
  /** 禁用状态。更新工具栏项目是否不可操作。 */
  disabled?: boolean;
  /** 激活状态。更新工具栏项目是否显示为激活样式。 */
  active?: boolean;
}

/** Transform 工具栏配置。 */
export interface TransformToolbarOptions {
  /** 工具栏项目。替换默认工具栏项目列表。 */
  items?: readonly TransformToolbarItemSpec[];
  /** 像素偏移。指定工具栏相对锚点的水平和垂直偏移。 */
  offset?: readonly [number, number];
  /** 自定义类名。附加到工具栏根元素。 */
  className?: string;
  /** 可见状态。控制工具栏初始是否显示。 */
  visible?: boolean;
}

/** Transform 工具栏视图更新内容。 */
export interface TransformToolbarOptionsPatch {
  /** 锚点坐标。更新工具栏在地图上的定位坐标。 */
  position?: Coordinate;
  /** 像素偏移。更新工具栏相对锚点的偏移。 */
  offset?: readonly [number, number];
  /** 自定义类名。更新工具栏根元素的附加类名。 */
  className?: string;
  /** 可见状态。更新工具栏是否显示。 */
  visible?: boolean;
}

/** Transform 会话的启动配置。 */
export interface TransformOptions {
  /** 元素选择器。限制会话可以选中的元素范围。 */
  selector?: ElementSelector;
  /** 元素断言。进一步限制会话可以选中的公开元素。 */
  predicate?: (element: Element) => boolean;
  /** 图层范围。限制会话可以操作的图层 ID。 */
  layerIds?: readonly string[];
  /** 命中容差。指定控制手柄和元素的像素命中范围。 */
  hitTolerance?: number;
  /** 平移模式。控制禁用平移、使用中心手柄或直接拖动元素。 */
  translate?: TransformTranslateMode;
  /** 缩放能力。控制是否允许等比或双轴缩放。 */
  scale?: boolean;
  /** 拉伸能力。控制是否允许沿单轴拉伸。 */
  stretch?: boolean;
  /** 旋转能力。控制是否显示并接受旋转操作。 */
  rotate?: boolean;
  /** 边框平移。控制是否允许直接拖动控制区域平移。 */
  translateBBox?: boolean;
  /** 禁止翻转。控制缩放和拉伸是否可以穿过零点翻转。 */
  noFlip?: boolean;
  /** 保持矩形。控制矩形缩放时是否维持矩形语义。 */
  keepRectangle?: boolean;
  /** 控制区域留白。指定几何外包框周围的像素缓冲。 */
  buffer?: number;
  /** 点元素半径。指定点元素控制区域的像素半径。 */
  pointRadius?: number;
  /** 手柄样式。覆盖 Transform 控制手柄的结构化样式。 */
  handleStyle?: StyleSpec;
  /** 变换中心。覆盖默认计算得到的操作中心坐标。 */
  handleCenter?: Coordinate;
  /** 历史上限。限制会话保存的撤销和重做快照数量。 */
  historyLimit?: number;
  /** 工具栏配置。使用布尔值启停默认工具栏，或传入自定义配置。 */
  toolbar?: boolean | TransformToolbarOptions;
  /** 冲突策略。使用 `replace` 替换旧交互，使用 `reject` 拒绝新交互。 */
  policy?: InteractionPolicy;
}

/** 替换当前选中元素时的配置。 */
export interface TransformReplaceOptions {
  /** 保留历史。控制替换元素后是否继续使用当前历史记录。 */
  retainHistory?: boolean;
}

/**
 * Transform 会话的事件载荷映射。
 *
 * @typeParam T 业务数据。表示元素附加数据的类型。
 */
export interface TransformEventMap<T = unknown> {
  /** 选择事件。元素进入当前 Transform 会话时触发。 */
  select: Readonly<{
    /** 事件类型。固定为 `select`。 */
    type: 'select';
    /** 目标元素。提供当前选中的实时元素句柄。 */
    element: Element<T>;
  }>;
  /** 选择结束事件。元素离开当前 Transform 选择时触发。 */
  selectEnd: Readonly<{
    /** 事件类型。固定为 `selectEnd`。 */
    type: 'selectEnd';
    /** 目标元素。提供结束选择的元素句柄。 */
    element: Element<T>;
  }>;
  /** 进入手柄事件。指针进入控制手柄时触发。 */
  enterHandle: Readonly<{
    /** 事件类型。固定为 `enterHandle`。 */
    type: 'enterHandle';
    /** 目标元素。提供当前选中的元素句柄。 */
    element: Element<T>;
    /** 手柄标识。表示当前进入的控制手柄。 */
    key: string;
    /** 鼠标指针。提供该手柄建议使用的可选 CSS cursor。 */
    cursor?: string;
  }>;
  /** 离开手柄事件。指针离开控制手柄时触发。 */
  leaveHandle: Readonly<{
    /** 事件类型。固定为 `leaveHandle`。 */
    type: 'leaveHandle';
    /** 目标元素。提供当前选中的元素句柄。 */
    element: Element<T>;
    /** 手柄标识。表示当前离开的控制手柄。 */
    key: string;
    /** 鼠标指针。提供该手柄建议使用的可选 CSS cursor。 */
    cursor?: string;
  }>;
  /** 平移开始事件。一次平移操作开始时触发。 */
  translateStart: Readonly<{
    /** 事件类型。固定为 `translateStart`。 */
    type: 'translateStart';
    /** 目标元素。提供当前操作的元素句柄。 */
    element: Element<T>;
  }>;
  /** 平移过程事件。平移预览发生变化时触发。 */
  translating: Readonly<{
    /** 事件类型。固定为 `translating`。 */
    type: 'translating';
    /** 目标元素。提供当前操作的元素句柄。 */
    element: Element<T>;
  }>;
  /** 平移结束事件。一次平移操作结束时触发。 */
  translateEnd: Readonly<{
    /** 事件类型。固定为 `translateEnd`。 */
    type: 'translateEnd';
    /** 目标元素。提供当前操作的元素句柄。 */
    element: Element<T>;
  }>;
  /** 旋转开始事件。一次旋转操作开始时触发。 */
  rotateStart: Readonly<{
    /** 事件类型。固定为 `rotateStart`。 */
    type: 'rotateStart';
    /** 目标元素。提供当前操作的元素句柄。 */
    element: Element<T>;
  }>;
  /** 旋转过程事件。旋转预览发生变化时触发。 */
  rotating: Readonly<{
    /** 事件类型。固定为 `rotating`。 */
    type: 'rotating';
    /** 目标元素。提供当前操作的元素句柄。 */
    element: Element<T>;
  }>;
  /** 旋转结束事件。一次旋转操作结束时触发。 */
  rotateEnd: Readonly<{
    /** 事件类型。固定为 `rotateEnd`。 */
    type: 'rotateEnd';
    /** 目标元素。提供当前操作的元素句柄。 */
    element: Element<T>;
  }>;
  /** 缩放开始事件。一次缩放或拉伸操作开始时触发。 */
  scaleStart: Readonly<{
    /** 事件类型。固定为 `scaleStart`。 */
    type: 'scaleStart';
    /** 目标元素。提供当前操作的元素句柄。 */
    element: Element<T>;
  }>;
  /** 缩放过程事件。缩放或拉伸预览发生变化时触发。 */
  scaling: Readonly<{
    /** 事件类型。固定为 `scaling`。 */
    type: 'scaling';
    /** 目标元素。提供当前操作的元素句柄。 */
    element: Element<T>;
  }>;
  /** 缩放结束事件。一次缩放或拉伸操作结束时触发。 */
  scaleEnd: Readonly<{
    /** 事件类型。固定为 `scaleEnd`。 */
    type: 'scaleEnd';
    /** 目标元素。提供当前操作的元素句柄。 */
    element: Element<T>;
  }>;
  /** 编辑事件。顶点编辑结果发生变化时触发。 */
  edit: Readonly<{
    /** 事件类型。固定为 `edit`。 */
    type: 'edit';
    /** 目标元素。提供当前编辑的元素句柄。 */
    element: Element<T>;
  }>;
  /** 复制完成事件。直接复制成功或复制预览确认并创建元素时触发。 */
  copyPreviewConfirm: Readonly<{
    /** 事件类型。固定为 `copyPreviewConfirm`。 */
    type: 'copyPreviewConfirm';
    /** 复制元素。提供新创建元素的实时句柄。 */
    element: Element<T>;
  }>;
  /** 复制取消事件。复制预览被取消时触发。 */
  copyPreviewCancel: Readonly<{
    /** 事件类型。固定为 `copyPreviewCancel`。 */
    type: 'copyPreviewCancel';
  }>;
  /** 删除事件。当前选中元素被移除时触发。 */
  remove: Readonly<{
    /** 事件类型。固定为 `remove`。 */
    type: 'remove';
    /** 删除元素。提供刚被移除的句柄，可读取 ID，但不能继续操作。 */
    element: Element<T>;
  }>;
  /** 错误事件。会话捕获操作错误时触发。 */
  error: Readonly<{
    /** 事件类型。固定为 `error`。 */
    type: 'error';
    /** 错误内容。提供本次失败捕获到的原始错误。 */
    error: unknown;
  }>;
}

/** Transform 工具栏的公开控制句柄。 */
export interface TransformToolbarHandle {
  /**
   * 激活指定工具栏项目的视图状态。
   *
   * @param key 项目标识。指定要显示为激活状态的工具栏项目。
   * @returns 无返回值。
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
   * @param key 项目标识。指定要更新的工具栏项目。
   * @param patch 项目更新。指定要合并到项目状态的内容。
   * @returns 无返回值。
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
   * @param patch 工具栏更新。指定要合并到工具栏视图的内容。
   * @returns 无返回值。
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
   * @returns 无返回值。
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
   * @returns 无返回值。
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
   * @returns 无返回值。
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
 * 一次 Transform 交互的公开会话句柄。
 *
 * @typeParam T 业务数据。表示元素附加数据的类型。
 */
export interface TransformSession<T = unknown> {
  /** 选中元素。提供当前选择的实时元素句柄。 */
  readonly selected: Element<T> | undefined;
  /** 会话状态。表示会话当前处于活动、完成或取消状态。 */
  readonly status: InteractionStatus;
  /** 操作模式。区分外包框变换和顶点编辑。 */
  readonly mode: TransformMode;
  /** 工具栏句柄。启用工具栏并选中元素后提供其控制句柄。 */
  readonly toolbar: TransformToolbarHandle | undefined;
  /**
   * 在当前会话中选择一个元素。
   *
   * @param element 元素句柄。指定要选择且属于当前 Earth 的实时元素。
   * @returns 无返回值。
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
   * @param mode 操作模式。指定要进入的 Transform 模式。
   * @returns 无返回值。
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
   * 提交当前预览并结束会话。
   *
   * @returns 无返回值。
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
   * 取消会话并丢弃尚未提交的预览。
   *
   * @returns 无返回值。
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
   * 撤销当前会话的最近一次操作。
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
   * 重做当前会话的下一次操作。
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
   * 立即复制当前选中元素。
   *
   * @param options 复制配置。指定可选的新元素字段覆盖内容。
   * @returns 新创建元素的实时句柄。
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
   * 使用另一个元素替换当前选择。
   *
   * @param element 元素句柄。指定要选中且属于当前 Earth 的元素。
   * @param options 替换配置。指定是否保留当前会话历史。
   * @returns 无返回值。
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
   * 删除当前选中的元素。
   *
   * @returns 无返回值。
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
   * 订阅指定的 Transform 会话事件。
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
   * const session = earth.transform.start();
   * const off = session.on('select', ({ element }) => console.log(element.id));
   * off();
   * ```
   */
  on<K extends keyof TransformEventMap<T>>(type: K, listener: (event: TransformEventMap<T>[K]) => void): () => void;
}

/** Transform 能力的公开入口。 */
export interface TransformService {
  /**
   * 启动一个等待选择元素的 Transform 会话。
   *
   * @param options 变换配置。指定可选的目标范围、变换能力、工具栏和冲突策略。
   * @returns 已打开并处于活动状态的 Transform 会话。
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
   * 启动 Transform 会话并立即选择指定元素。
   *
   * @typeParam T 业务数据。表示元素附加数据的类型。
   * @param element 元素句柄。指定要选择且属于当前 Earth 的实时元素。
   * @param options 变换配置。指定可选的目标范围、变换能力、工具栏和冲突策略。
   * @returns 已选择目标并处于活动状态的 Transform 会话。
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
