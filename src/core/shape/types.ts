import type { Coordinate } from '../common/types.js';

/** 引擎内置并注册的图形类型。 */
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

/** 内置图形类型名称。 */
export type ShapeType = (typeof shapeTypes)[number];

/**
 * 图形输入。写入 Element 时可使用扁平坐标或嵌套坐标。
 *
 * 扁平的 `controlPoints` 始终按二维坐标依次分组。三维坐标请使用嵌套数组。
 *
 * @typeParam T 要写入的图形类型。
 */
export type ShapeInput<T extends ShapeType = ShapeType> = T extends 'circle'
  ? {
      /** 圆的判别字段。 */
      readonly type: 'circle';
      /** 二维或三维圆心坐标。 */
      readonly center: readonly number[];
      /** 米制半径。 */
      readonly radius: number;
    }
  : {
      /** 图形类型判别字段。 */
      readonly type: T;
      /** 二维扁平数组，或二维、三维嵌套坐标。 */
      readonly controlPoints: readonly number[] | readonly (readonly number[])[];
    };

/**
 * 图形状态。圆使用圆心和半径，其他图形使用有序控制点。
 *
 * @typeParam T 状态对应的图形类型。
 */
export type ShapeState<T extends ShapeType = ShapeType> = T extends 'circle'
  ? {
      /** 圆的判别字段。 */
      readonly type: 'circle';
      /** 当前 View 投影中的圆心。 */
      readonly center: Coordinate;
      /** 米制半径。 */
      readonly radius: number;
    }
  : {
      /** 图形类型判别字段。 */
      readonly type: T;
      /** 按顺序定义图形的控制点。 */
      readonly controlPoints: readonly Coordinate[];
    };

/** 已转换到当前 View 工作单位的渲染几何快照。 */
export type RenderGeometryState =
  | {
      /** 点几何判别字段。 */
      readonly type: 'point';
      /** 点所在的位置。 */
      readonly coordinates: Coordinate;
    }
  | {
      /** 折线几何判别字段。 */
      readonly type: 'polyline';
      /** 折线的有序顶点。 */
      readonly coordinates: readonly Coordinate[];
    }
  | {
      /** 多边形几何判别字段。 */
      readonly type: 'polygon';
      /** 多边形各个环的坐标。 */
      readonly coordinates: readonly (readonly Coordinate[])[];
    }
  | {
      /** 圆几何判别字段。 */
      readonly type: 'circle';
      /** 圆的中心坐标。 */
      readonly center: Coordinate;
      /** 圆在当前 View 投影中的渲染半径。 */
      readonly radius: number;
    };

/** 图形可声明的绘制、编辑和变换能力。 */
export type ShapeCapability =
  'draw' | 'edit' | 'translate' | 'rotate' | 'scale' | 'vertexEdit' | 'controlPointInsert' | 'controlPointRemove' | 'freehand' | 'anchor' | 'path';

/** 点击绘制的控制点数量约束。 */
export interface ControlPointPolicy {
  /** 开始生成预览所需的最少控制点数。 */
  readonly previewMin: number;
  /** 允许完成所需的最少控制点数。 */
  readonly completeMin: number;
  /** 允许完成的最多控制点数；省略时不设上限。 */
  readonly completeMax?: number;
  /** 达到该点数后自动尝试完成。 */
  readonly autoFinish?: number;
}

/**
 * 草图能否提交的判别结果。
 *
 * @typeParam S 完成后返回的图形状态类型。
 */
export type ShapeCompletion<S extends ShapeState = ShapeState> =
  | {
      /** 已完成。 */
      readonly status: 'complete';
      /** 可以提交的完整图形状态。 */
      readonly state: S;
    }
  | {
      /** 控制点或几何尚不完整。 */
      readonly status: 'incomplete';
    };

/** 编辑时可移动的现有控制点。 */
export interface ControlPointHandle {
  /** 控制点在图形中的位置。 */
  readonly index: number;
  /** 控制点当前的位置。 */
  readonly coordinate: Coordinate;
  /** ShapeDefinition 为控制点声明的可选角色。 */
  readonly role?: string;
  /** 是否允许从当前拓扑中移除。 */
  readonly removable: boolean;
}

/** ShapeDefinition 声明的合法控制点插入位置。 */
export interface ControlPointInsertion {
  /** 新控制点要插入的位置。 */
  readonly index: number;
  /** 新控制点建议放置的位置。 */
  readonly coordinate: Coordinate;
}

/** 当前图形的完整编辑锚点快照。 */
export interface ControlPointTopology {
  /** 按索引排列的可移动控制点。 */
  readonly handles: readonly ControlPointHandle[];
  /** 当前允许添加控制点的位置。 */
  readonly insertions: readonly ControlPointInsertion[];
}

/**
 * 图形编辑拓扑。由具体图形实现控制点编辑。
 *
 * @typeParam S 当前图形使用的状态类型。
 */
export interface ShapeEditTopology<S extends ShapeState = ShapeState> {
  /**
   * 获取当前图形的控制点和插入位置。
   *
   * @param state 当前图形状态。
   * @returns 当前图形的拓扑快照。
   */
  describe(state: S): ControlPointTopology;
  /**
   * 移动一个控制点并返回新状态。
   *
   * @param state 当前图形状态。
   * @param index 要移动的控制点索引。
   * @param coordinate 控制点的新坐标。
   * @returns 移动后的新图形状态。
   * @throws `InvalidArgumentError` 索引、坐标或结果几何无效时抛出。
   */
  move(state: S, index: number, coordinate: Coordinate): S;
  /**
   * 插入一个控制点并返回新状态。
   *
   * @param state 当前图形状态。
   * @param index 新控制点的插入索引。
   * @param coordinate 新控制点的坐标。
   * @returns 插入后的新图形状态。
   * @throws `InvalidArgumentError` 图形当前不允许插入或输入无效时抛出。
   */
  insert?(state: S, index: number, coordinate: Coordinate): S;
  /**
   * 移除一个控制点并返回新状态。
   *
   * @param state 当前图形状态。
   * @param index 要移除的控制点索引。
   * @returns 移除后的新图形状态。
   * @throws `InvalidArgumentError` 图形当前不允许移除或结果不满足最小拓扑时抛出。
   */
  remove?(state: S, index: number): S;
}

/** 自由绘制采样的处理阶段。 */
export type FreehandPhase = 'preview' | 'complete';

/**
 * 自由绘制策略。由具体图形处理连续采样点。
 *
 * @typeParam S 采样后生成的图形状态类型。
 */
export interface ShapeFreehandPolicy<S extends ShapeState = ShapeState> {
  /**
   * 接受一个新的自由绘制采样点。
   *
   * @param samples 已收集的坐标。
   * @param coordinate 本次追加的坐标。
   * @returns 追加、过滤或简化后的采样坐标快照。
   */
  appendSample(samples: readonly Coordinate[], coordinate: Coordinate): readonly Coordinate[];
  /**
   * 将采样点转换为预览或最终图形。
   *
   * @param samples 已收集的坐标。
   * @param phase 按预览或完成阶段处理。
   * @returns 有效图形状态；采样不足时返回 `undefined`。
   */
  normalizeSamples(samples: readonly Coordinate[], phase: FreehandPhase): S | undefined;
}

/**
 * ShapeDefinition 统一声明图形的绘制、编辑、变换和渲染规则。
 *
 * @typeParam S 当前图形使用的状态类型。
 */
export interface ShapeDefinition<S extends ShapeState = ShapeState> {
  /** 此定义注册的图形类型。 */
  readonly type: S['type'];
  /** 图形支持的能力集合。 */
  readonly capabilities: ReadonlySet<ShapeCapability>;
  /** 点击绘制的点数约束。 */
  readonly controlPointPolicy?: ControlPointPolicy;
  /** 提供控制点编辑规则。 */
  readonly editTopology?: ShapeEditTopology<S>;
  /** 提供连续采样处理规则。 */
  readonly freehand?: ShapeFreehandPolicy<S>;
  /**
   * 从控制点创建可预览的草图。
   *
   * @param controlPoints 按顺序排列的控制点。
   * @returns 可预览的草图状态；控制点不足时返回 `undefined`。
   * @throws `InvalidArgumentError` 控制点值或数量超过图形允许范围时抛出。
   */
  createDraft(controlPoints: readonly Coordinate[]): S | undefined;
  /**
   * 校验并整理外部图形输入。
   *
   * @param input 待校验的图形状态。
   * @returns 经过复制和规范化的图形状态。
   * @throws `InvalidArgumentError` 输入不符合图形契约时抛出。
   */
  normalize(input: unknown): S;
  /**
   * 复制一个独立的图形状态。
   *
   * @param state 要复制的图形状态。
   * @returns 与输入无共享可变数据的新状态。
   */
  clone(state: S): S;
  /**
   * 确认图形是否满足完成条件。
   *
   * @param state 要检查的图形状态。
   * @returns 可以作为完整 Element 提交时返回 `true`。
   */
  isComplete(state: S): boolean;
  /**
   * 尝试把草图转换为可提交状态。
   *
   * @param state 当前草图状态。
   * @returns 带判别字段的完成结果；完整结果包含独立状态快照。
   */
  tryComplete(state: S): ShapeCompletion<S>;
  /**
   * 把图形状态转换为渲染几何。
   *
   * @param state 要转换的图形状态。
   * @returns 点、折线、多边形或圆渲染几何。
   */
  toRenderGeometry(state: S): RenderGeometryState;
}
