import type { Coordinate } from '../common/types.js';
import type { HorizontalWorld } from '../common/worldWrap.js';
import type { RenderGeometryState } from '../shape/types.js';
import type { ElementStyleState } from '../style/types.js';

/**
 * Draw Session 要求的原生输入模式。`vertices` 覆盖全部非点图形，具体控制点数量仍由 ShapeDefinition 负责。
 *
 * @internal
 */
export type DrawInteractionMode = 'point' | 'vertices';

/**
 * 安装一次原生绘制交互所需的纯配置。
 *
 * @internal
 */
export interface DrawInteractionSpec {
  /** 用于确定原生预览放置和水平环绕行为的目标图层 ID。 */
  readonly layerId: string;
  /** 点输入或通用控制点输入模式。 */
  readonly mode: DrawInteractionMode;
  /** 是否在普通点击之外启用 Shift 自由绘制手势。 */
  readonly freehand: boolean;
}

/**
 * Adapter 发出的纯输入快照。坐标使用当前用户投影；未设置用户投影时使用地图活动投影。
 *
 * 自由绘制手势严格发出一次开始、零到多次采样，以及一次完成或取消；同一手势不会额外发出普通点击事件。
 *
 * @internal
 */
export type DrawInteractionEvent =
  | {
      /** 普通指针移动事件判别字段。 */
      readonly type: 'move';
      /** 指针坐标快照。 */
      readonly coordinate: Coordinate;
    }
  | {
      /** 普通点击事件判别字段。 */
      readonly type: 'click';
      /** 点击坐标快照。 */
      readonly coordinate: Coordinate;
    }
  | {
      /** 自由绘制开始事件判别字段。 */
      readonly type: 'freehand-start';
      /** 首个有效采样坐标。 */
      readonly coordinate: Coordinate;
    }
  | {
      /** 自由绘制采样事件判别字段。 */
      readonly type: 'freehand-sample';
      /** 中间采样坐标。 */
      readonly coordinate: Coordinate;
    }
  | {
      /** 自由绘制批量采样事件判别字段。 */
      readonly type: 'freehand-samples';
      /** 同一动画帧内按输入顺序收集的中间采样坐标。 */
      readonly coordinates: readonly Coordinate[];
    }
  | {
      /** 自由绘制完成事件判别字段。 */
      readonly type: 'freehand-complete';
      /** 最后一个有效采样坐标。 */
      readonly coordinate: Coordinate;
    }
  | {
      /** 自由绘制取消事件判别字段。 */
      readonly type: 'freehand-cancel';
    };

/**
 * 纯绘制预览数据，永远不会作为持久 Element 状态发布。
 *
 * @internal
 */
export interface DrawInteractionRenderState {
  /** 已脱离调用方所有权的渲染几何快照。 */
  readonly geometry: RenderGeometryState;
  /** 已脱离调用方所有权的 Element 样式快照。 */
  readonly style: ElementStyleState;
}

/**
 * 一次已安装原生绘制交互的完整所有权句柄。
 *
 * @internal
 */
export interface DrawInteractionHandle {
  /**
   * 本次交互稳定的水平世界元数据。投影或目标图层不支持水平环绕时不存在。
   */
  readonly world?: HorizontalWorld;

  /**
   * 原子替换临时预览；传入 `undefined` 时清空。失败替换必须保留此前仍可用的完整预览。
   *
   * @param state 新的几何与样式快照；`undefined` 表示清空预览。
   * @throws 预览准备、安装或回滚失败时抛出对应错误。
   */
  render(state: Readonly<DrawInteractionRenderState> | undefined): void;

  /**
   * 停止事件并释放全部原生监听器和预览资源。成功后幂等；清理失败时仍尝试其他步骤，并允许后续调用只重试未完成工作。
   *
   * @throws 任一清理步骤失败时抛出首个错误。
   */
  destroy(): void;
}

/**
 * 语义绘制服务依赖的原生交互端口。
 *
 * @internal
 */
export interface DrawInteractionPort {
  /**
   * 原子安装一次交互并返回完整所有权句柄。该方法返回前不会调用监听器；安装失败时先回滚全部已获取资源再抛出。
   *
   * @param spec 目标图层、输入模式和自由绘制能力配置。
   * @param listener 接收脱离原生对象的语义输入快照。
   * @returns 完整安装的交互句柄。
   * @throws 配置、目标图层、安装或回滚无效时抛出对应错误。
   */
  open(spec: Readonly<DrawInteractionSpec>, listener: (event: DrawInteractionEvent) => void): DrawInteractionHandle;
}
