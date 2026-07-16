import type { Coordinate } from '../common/types.js';

/** 内置图形。列出引擎已经注册的全部图形类型。 */
export const shapeTypes = Object.freeze([
  'point',
  'polyline',
  'polygon',
  'circle',
  'ellipse',
  'attack-arrow',
  'tailed-attack-arrow',
  'fine-arrow',
  'tailed-squad-combat-arrow',
  'assault-direction-arrow',
  'double-arrow',
  'rectangle',
  'triangle',
  'equilateral-triangle',
  'assemble-polygon',
  'closed-curve-polygon',
  'sector',
  'lune-polygon',
  'lune-polyline',
  'curve-polyline'
] as const);

/** 图形类型。取值来自内置图形列表。 */
export type ShapeType = (typeof shapeTypes)[number];

/**
 * 图形输入。写入元素时可使用扁平坐标或嵌套坐标。
 *
 * 扁平的 `controlPoints` 始终按二维坐标依次分组。三维坐标请使用嵌套数组。
 *
 * @typeParam T 图形类型。需要写入的图形类型。
 */
export type ShapeInput<T extends ShapeType = ShapeType> = T extends 'circle'
  ? {
      /** 类型。固定为圆。 */
      readonly type: 'circle';
      /** 圆心。接受 OpenLayers 返回的普通坐标数组。 */
      readonly center: readonly number[];
      /** 半径。表示圆的现实距离，单位为米。 */
      readonly radius: number;
    }
  : {
      /** 类型。当前图形的类型。 */
      readonly type: T;
      /** 控制点。可传二维扁平数组，也可传二维或三维嵌套坐标。 */
      readonly controlPoints: readonly number[] | readonly (readonly number[])[];
    };

/**
 * 图形状态。圆使用圆心和半径，其他图形使用有序控制点。
 *
 * @typeParam T 图形类型。需要描述的图形类型。
 */
export type ShapeState<T extends ShapeType = ShapeType> = T extends 'circle'
  ? {
      /** 类型。固定为圆。 */
      readonly type: 'circle';
      /** 圆心。圆的中心坐标。 */
      readonly center: Coordinate;
      /** 半径。表示圆的现实距离，单位为米。 */
      readonly radius: number;
    }
  : {
      /** 类型。当前图形的类型。 */
      readonly type: T;
      /** 控制点。按顺序定义图形形状的坐标。 */
      readonly controlPoints: readonly Coordinate[];
    };

/** 渲染几何。供渲染器直接使用的几何快照。 */
export type RenderGeometryState =
  | {
      /** 类型。固定为点。 */
      readonly type: 'point';
      /** 坐标。点所在的位置。 */
      readonly coordinates: Coordinate;
    }
  | {
      /** 类型。固定为折线。 */
      readonly type: 'polyline';
      /** 坐标。折线的有序顶点。 */
      readonly coordinates: readonly Coordinate[];
    }
  | {
      /** 类型。固定为多边形。 */
      readonly type: 'polygon';
      /** 坐标。多边形各个环的坐标。 */
      readonly coordinates: readonly (readonly Coordinate[])[];
    }
  | {
      /** 类型。固定为圆。 */
      readonly type: 'circle';
      /** 圆心。圆的中心坐标。 */
      readonly center: Coordinate;
      /** 半径。圆在当前 View 投影中的渲染半径。 */
      readonly radius: number;
    };

/** 图形能力。表示图形支持的绘制、编辑和变换操作。 */
export type ShapeCapability =
  'draw' | 'edit' | 'translate' | 'rotate' | 'scale' | 'vertexEdit' | 'controlPointInsert' | 'controlPointRemove' | 'freehand' | 'anchor' | 'path';

/** 控制点策略。设置点击绘制需要的控制点数量。 */
export interface ControlPointPolicy {
  /** 预览最少点数。达到这个数量后显示预览。 */
  readonly previewMin: number;
  /** 完成最少点数。达到这个数量后允许完成。 */
  readonly completeMin: number;
  /** 完成最多点数。省略时不限制数量。 */
  readonly completeMax?: number;
  /** 自动完成点数。达到这个数量后自动尝试完成。 */
  readonly autoFinish?: number;
}

/**
 * 图形完成结果。说明草图是否已经可以提交。
 *
 * @typeParam S 图形状态。完成后返回的图形状态类型。
 */
export type ShapeCompletion<S extends ShapeState = ShapeState> =
  | {
      /** 状态。表示图形已经完成。 */
      readonly status: 'complete';
      /** 图形。可以提交的完整图形状态。 */
      readonly state: S;
    }
  | {
      /** 状态。表示控制点或几何还不完整。 */
      readonly status: 'incomplete';
    };

/** 控制点手柄。描述编辑时可以移动的控制点。 */
export interface ControlPointHandle {
  /** 索引。控制点在图形中的位置。 */
  readonly index: number;
  /** 坐标。控制点当前的位置。 */
  readonly coordinate: Coordinate;
  /** 角色。图形为控制点提供的可选用途。 */
  readonly role?: string;
  /** 是否可删除。控制当前控制点能否被移除。 */
  readonly removable: boolean;
}

/** 控制点插入位置。描述可以添加新控制点的位置。 */
export interface ControlPointInsertion {
  /** 索引。新控制点要插入的位置。 */
  readonly index: number;
  /** 坐标。新控制点建议放置的位置。 */
  readonly coordinate: Coordinate;
}

/** 控制点拓扑。汇总当前图形的控制点和插入位置。 */
export interface ControlPointTopology {
  /** 控制点。按索引排列的可移动控制点。 */
  readonly handles: readonly ControlPointHandle[];
  /** 插入位置。当前允许添加控制点的位置。 */
  readonly insertions: readonly ControlPointInsertion[];
}

/**
 * 图形编辑拓扑。由具体图形实现控制点编辑。
 *
 * @typeParam S 图形状态。当前图形使用的状态类型。
 */
export interface ShapeEditTopology<S extends ShapeState = ShapeState> {
  /**
   * 获取当前图形的控制点和插入位置。
   *
   * @param state 图形。要读取的图形状态。
   * @returns 当前图形的拓扑快照。
   */
  describe(state: S): ControlPointTopology;
  /**
   * 移动一个控制点并返回新状态。
   *
   * @param state 图形。当前图形状态。
   * @param index 索引。要移动的控制点位置。
   * @param coordinate 坐标。控制点的新位置。
   * @returns 移动后的新图形状态。
   * @throws `InvalidArgumentError` 索引、坐标或结果几何无效时抛出。
   */
  move(state: S, index: number, coordinate: Coordinate): S;
  /**
   * 插入一个控制点并返回新状态。
   *
   * @param state 图形。当前图形状态。
   * @param index 索引。新控制点的插入位置。
   * @param coordinate 坐标。新控制点的位置。
   * @returns 插入后的新图形状态。
   * @throws `InvalidArgumentError` 图形当前不允许插入或输入无效时抛出。
   */
  insert?(state: S, index: number, coordinate: Coordinate): S;
  /**
   * 移除一个控制点并返回新状态。
   *
   * @param state 图形。当前图形状态。
   * @param index 索引。要移除的控制点位置。
   * @returns 移除后的新图形状态。
   * @throws `InvalidArgumentError` 图形当前不允许移除或结果不满足最小拓扑时抛出。
   */
  remove?(state: S, index: number): S;
}

/** 自由绘制阶段。区分预览和完成时的采样处理。 */
export type FreehandPhase = 'preview' | 'complete';

/**
 * 自由绘制策略。由具体图形处理连续采样点。
 *
 * @typeParam S 图形状态。采样后生成的图形状态类型。
 */
export interface ShapeFreehandPolicy<S extends ShapeState = ShapeState> {
  /**
   * 接受一个新的自由绘制采样点。
   *
   * @param samples 采样点。当前已经收集的坐标。
   * @param coordinate 坐标。本次加入的新坐标。
   * @returns 追加、过滤或简化后的采样坐标快照。
   */
  appendSample(samples: readonly Coordinate[], coordinate: Coordinate): readonly Coordinate[];
  /**
   * 将采样点转换为预览或最终图形。
   *
   * @param samples 采样点。当前已经收集的坐标。
   * @param phase 阶段。选择预览或完成处理。
   * @returns 有效图形状态；采样不足时返回 `undefined`。
   */
  normalizeSamples(samples: readonly Coordinate[], phase: FreehandPhase): S | undefined;
}

/**
 * 图形定义。统一提供图形的绘制、编辑、变换和渲染规则。
 *
 * @typeParam S 图形状态。当前图形使用的状态类型。
 */
export interface ShapeDefinition<S extends ShapeState = ShapeState> {
  /** 类型。当前定义注册的图形类型。 */
  readonly type: S['type'];
  /** 能力。当前图形支持的操作集合。 */
  readonly capabilities: ReadonlySet<ShapeCapability>;
  /** 控制点策略。设置点击绘制需要的点数。 */
  readonly controlPointPolicy?: ControlPointPolicy;
  /** 编辑拓扑。提供控制点编辑规则。 */
  readonly editTopology?: ShapeEditTopology<S>;
  /** 自由绘制。提供连续采样处理规则。 */
  readonly freehand?: ShapeFreehandPolicy<S>;
  /**
   * 从控制点创建可预览的草图。
   *
   * @param controlPoints 控制点。按顺序排列的坐标。
   * @returns 可预览的草图状态；控制点不足时返回 `undefined`。
   * @throws `InvalidArgumentError` 控制点值或数量超过图形允许范围时抛出。
   */
  createDraft(controlPoints: readonly Coordinate[]): S | undefined;
  /**
   * 校验并整理外部图形输入。
   *
   * @param input 输入。需要校验的图形状态。
   * @returns 经过复制和规范化的图形状态。
   * @throws `InvalidArgumentError` 输入不符合图形契约时抛出。
   */
  normalize(input: unknown): S;
  /**
   * 复制一个独立的图形状态。
   *
   * @param state 图形。要复制的图形状态。
   * @returns 与输入无共享可变数据的新状态。
   */
  clone(state: S): S;
  /**
   * 判断图形是否已经可以完成。
   *
   * @param state 图形。要检查的图形状态。
   * @returns 可以作为完成元素提交时返回 `true`。
   */
  isComplete(state: S): boolean;
  /**
   * 尝试把草图转换为可提交状态。
   *
   * @param state 草图。当前图形状态。
   * @returns 带判别字段的完成结果；完整结果包含独立状态快照。
   */
  tryComplete(state: S): ShapeCompletion<S>;
  /**
   * 把图形状态转换为渲染几何。
   *
   * @param state 图形。要转换的图形状态。
   * @returns 点、折线、多边形或圆渲染几何。
   */
  toRenderGeometry(state: S): RenderGeometryState;
}
