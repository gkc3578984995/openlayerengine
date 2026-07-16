import type { Coordinate } from '../common/types.js';
import type { PreparedWorldEdit } from '../common/worldWrap.js';
import type { ControlPointHandle, ControlPointInsertion, RenderGeometryState } from '../shape/types.js';
import type { ElementStyleState } from '../style/types.js';

/**
 * 原生编辑适配器渲染的可移动控制点。
 *
 * @internal
 */
export interface EditControlAnchor extends ControlPointHandle {
  /** 控制点判别字段。 */
  readonly kind: 'control';
}

/**
 * 由图形拓扑提供的语义插入候选点。
 *
 * @internal
 */
export interface EditInsertionAnchor extends ControlPointInsertion {
  /** 插入点判别字段。 */
  readonly kind: 'insertion';
}

/**
 * 编辑交互可命中的控制点或插入点。
 *
 * @internal
 */
export type EditInteractionAnchor = EditControlAnchor | EditInsertionAnchor;

/**
 * 打开一次编辑交互所需的纯配置。适配器不得修改传入的控制点快照，底图选项只影响临时原生投影。
 *
 * @internal
 */
export interface EditInteractionSpec {
  /** 目标元素 ID。 */
  readonly elementId: string;
  /** 进入编辑时的规范世界控制点快照。 */
  readonly controlPoints: readonly Coordinate[];
  /** 是否在临时编辑图层中显示原始几何底图。 */
  readonly underlay: boolean;
}

/**
 * 纯编辑预览。锚点已经位于句柄准备好的编辑世界中，且只能来自图形拓扑。
 *
 * @internal
 */
export interface EditInteractionRenderState {
  /** 当前工作几何的渲染快照。 */
  readonly geometry: RenderGeometryState;
  /** 当前元素样式快照。 */
  readonly style: ElementStyleState;
  /** 控制点与插入点的完整命中测试快照。 */
  readonly anchors: readonly EditInteractionAnchor[];
}

/**
 * 原生适配器发出的脱离原生对象的语义编辑输入。拖动严格发出一次开始、零到多次移动，以及一次结束或取消。
 * 插入和删除是单次原子请求；校验、历史、渲染与元素事务仍由服务负责。
 *
 * @internal
 */
export type EditInteractionEvent =
  | {
      /** 普通指针移动事件判别字段。 */
      readonly type: 'pointer-move';
      /** 指针当前所在的展示世界坐标。 */
      readonly coordinate: Coordinate;
      /** 当前命中的最近控制点或插入点；未命中时不存在。 */
      readonly anchor?: EditInteractionAnchor;
    }
  | {
      /** 控制点拖动开始事件判别字段。 */
      readonly type: 'move-start';
      /** 开始拖动的控制点快照。 */
      readonly anchor: EditControlAnchor;
      /** 拖动开始坐标。 */
      readonly coordinate: Coordinate;
    }
  | {
      /** 控制点拖动过程事件判别字段。 */
      readonly type: 'move';
      /** 正在拖动的控制点快照。 */
      readonly anchor: EditControlAnchor;
      /** 当前拖动坐标。 */
      readonly coordinate: Coordinate;
    }
  | {
      /** 控制点拖动完成事件判别字段。 */
      readonly type: 'move-end';
      /** 完成拖动的控制点快照。 */
      readonly anchor: EditControlAnchor;
      /** 拖动完成坐标。 */
      readonly coordinate: Coordinate;
    }
  | {
      /** 控制点拖动取消事件判别字段。 */
      readonly type: 'move-cancel';
      /** 取消拖动的控制点快照。 */
      readonly anchor: EditControlAnchor;
    }
  | {
      /** 插入控制点请求的事件判别字段。 */
      readonly type: 'insert';
      /** 被选择的插入候选快照。 */
      readonly anchor: EditInsertionAnchor;
    }
  | {
      /** 移除控制点请求的事件判别字段。 */
      readonly type: 'remove';
      /** 被选择的可移除控制点快照。 */
      readonly anchor: EditControlAnchor;
    };

/**
 * 一次已安装原生编辑交互的完整所有权句柄。
 *
 * @internal
 */
export interface EditInteractionHandle {
  /**
   * 打开时准备的稳定编辑世界放置结果；服务在其中编辑，并通过交接信息规范化最终提交。
   */
  readonly placement: PreparedWorldEdit;

  /**
   * 原子替换几何、样式和全部命中锚点；失败时保留此前可用的完整预览。
   *
   * @param state 新的编辑预览快照。
   * @returns 无返回值。
   * @throws 预览准备、安装或回滚失败时抛出对应错误。
   */
  render(state: Readonly<EditInteractionRenderState>): void;

  /**
   * 停止事件并释放全部预览、监听器和原始元素投影抑制资源。成功后幂等；失败后可只重试未完成步骤。
   *
   * @returns 无返回值。
   * @throws 任一清理步骤失败时抛出首个错误。
   */
  destroy(): void;
}

/**
 * 语义编辑服务依赖的原生交互端口。
 *
 * @internal
 */
export interface EditInteractionPort {
  /**
   * 准备编辑世界并原子安装一次交互。返回完整句柄前不会调用监听器；打开失败时先释放投影抑制和全部部分安装资源。
   *
   * @param spec 目标元素、控制点和临时底图配置。
   * @param listener 接收脱离原生对象的语义编辑输入快照。
   * @returns 完整安装的编辑交互句柄。
   * @throws 配置、目标元素、安装或回滚无效时抛出对应错误。
   */
  open(spec: Readonly<EditInteractionSpec>, listener: (event: EditInteractionEvent) => void): EditInteractionHandle;
}
