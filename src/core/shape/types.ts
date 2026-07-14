import type { Coordinate } from '../common/types.js';

/** 引擎内置并通过统一图形注册表支持的图形类型列表。 */
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

/** 内置图形类型的字符串联合。 */
export type ShapeType = (typeof shapeTypes)[number];

/**
 * 图形的语义状态。圆使用圆心与半径，其余图形使用有序控制点。
 *
 * @typeParam T 图形类型。
 */
export type ShapeState<T extends ShapeType = ShapeType> = T extends 'circle'
  ? {
      /** 圆状态判别字段。 */
      readonly type: 'circle';
      /** 圆心坐标。 */
      readonly center: Coordinate;
      /** 非负有限半径。 */
      readonly radius: number;
    }
  : {
      /** 图形状态判别字段。 */
      readonly type: T;
      /** 定义图形语义的有序控制点。 */
      readonly controlPoints: readonly Coordinate[];
    };

/** 与渲染器解耦的纯几何快照。 */
export type RenderGeometryState =
  | {
      /** 点几何判别字段。 */
      readonly type: 'point';
      /** 点坐标。 */
      readonly coordinates: Coordinate;
    }
  | {
      /** 折线几何判别字段。 */
      readonly type: 'polyline';
      /** 折线顶点坐标。 */
      readonly coordinates: readonly Coordinate[];
    }
  | {
      /** 多边形几何判别字段。 */
      readonly type: 'polygon';
      /** 多边形线性环坐标。 */
      readonly coordinates: readonly (readonly Coordinate[])[];
    }
  | {
      /** 圆几何判别字段。 */
      readonly type: 'circle';
      /** 圆心坐标。 */
      readonly center: Coordinate;
      /** 非负有限半径。 */
      readonly radius: number;
    };

/** 图形定义可声明的语义能力。 */
export type ShapeCapability =
  'draw' | 'edit' | 'translate' | 'rotate' | 'scale' | 'vertexEdit' | 'controlPointInsert' | 'controlPointRemove' | 'freehand' | 'anchor' | 'path';

/** 图形在点击绘制中的控制点数量策略。 */
export interface ControlPointPolicy {
  /** 生成可见预览所需的最少控制点数。 */
  readonly previewMin: number;
  /** 允许完成图形所需的最少控制点数。 */
  readonly completeMin: number;
  /** 允许完成图形的最大控制点数；省略时不限制。 */
  readonly completeMax?: number;
  /** 达到该控制点数量时自动尝试完成；省略时由用户显式完成。 */
  readonly autoFinish?: number;
}

/**
 * 图形完成尝试的判别结果。
 *
 * @typeParam S 图形语义状态类型。
 */
export type ShapeCompletion<S extends ShapeState = ShapeState> =
  | {
      /** 完成结果判别字段。 */
      readonly status: 'complete';
      /** 可以提交的完整图形状态。 */
      readonly state: S;
    }
  | {
      /** 控制点或几何仍不足的结果判别字段。 */
      readonly status: 'incomplete';
    };

/** 编辑时可移动的语义控制点。 */
export interface ControlPointHandle {
  /** 控制点在语义序列中的零基索引。 */
  readonly index: number;
  /** 控制点坐标快照。 */
  readonly coordinate: Coordinate;
  /** 图形定义提供的可选业务角色。 */
  readonly role?: string;
  /** 当前拓扑状态下是否允许移除。 */
  readonly removable: boolean;
}

/** 编辑时可插入新控制点的语义候选位置。 */
export interface ControlPointInsertion {
  /** 新控制点应插入的零基索引。 */
  readonly index: number;
  /** 插入候选位置的坐标快照。 */
  readonly coordinate: Coordinate;
}

/** 当前图形状态的完整编辑控制点与插入候选快照。 */
export interface ControlPointTopology {
  /** 按索引排列的可移动控制点。 */
  readonly handles: readonly ControlPointHandle[];
  /** 当前状态允许的插入候选位置。 */
  readonly insertions: readonly ControlPointInsertion[];
}

/**
 * 由具体图形定义拥有的编辑拓扑操作。
 *
 * @typeParam S 图形语义状态类型。
 */
export interface ShapeEditTopology<S extends ShapeState = ShapeState> {
  /**
   * 描述当前状态的控制点和插入位置。
   *
   * @param state 要描述的图形状态。
   * @returns 不依赖原生几何对象的拓扑快照。
   */
  describe(state: S): ControlPointTopology;
  /**
   * 移动一个控制点。
   *
   * @param state 当前图形状态；实现不得原地修改该状态。
   * @param index 要移动的控制点索引。
   * @param coordinate 新坐标。
   * @returns 移动后的新图形状态。
   * @throws `InvalidArgumentError` 索引、坐标或结果几何无效时抛出。
   */
  move(state: S, index: number, coordinate: Coordinate): S;
  /**
   * 在语义序列中插入一个控制点。
   *
   * @param state 当前图形状态；实现不得原地修改该状态。
   * @param index 新控制点的插入索引。
   * @param coordinate 新控制点坐标。
   * @returns 插入后的新图形状态。
   * @throws `InvalidArgumentError` 图形当前不允许插入或输入无效时抛出。
   */
  insert?(state: S, index: number, coordinate: Coordinate): S;
  /**
   * 移除一个控制点。
   *
   * @param state 当前图形状态；实现不得原地修改该状态。
   * @param index 要移除的控制点索引。
   * @returns 移除后的新图形状态。
   * @throws `InvalidArgumentError` 图形当前不允许移除或结果不满足最小拓扑时抛出。
   */
  remove?(state: S, index: number): S;
}

/** 自由绘制采样归一化所处的阶段。 */
export type FreehandPhase = 'preview' | 'complete';

/**
 * 由具体图形定义拥有的自由绘制采样策略。
 *
 * @typeParam S 图形语义状态类型。
 */
export interface ShapeFreehandPolicy<S extends ShapeState = ShapeState> {
  /**
   * 接受一个新的自由绘制采样点。
   *
   * @param samples 当前采样坐标；实现不得原地修改该数组。
   * @param coordinate 新采样坐标。
   * @returns 追加、过滤或简化后的采样坐标快照。
   */
  appendSample(samples: readonly Coordinate[], coordinate: Coordinate): readonly Coordinate[];
  /**
   * 将采样坐标转换为图形预览或最终语义状态。
   *
   * @param samples 当前采样坐标。
   * @param phase 预览或完成阶段。
   * @returns 有效图形状态；采样不足时返回 `undefined`。
   */
  normalizeSamples(samples: readonly Coordinate[], phase: FreehandPhase): S | undefined;
}

/**
 * 一个图形类型的完整语义定义，是绘制、编辑、变换和渲染能力的唯一来源。
 *
 * @typeParam S 图形语义状态类型。
 */
export interface ShapeDefinition<S extends ShapeState = ShapeState> {
  /** 此定义注册的图形类型。 */
  readonly type: S['type'];
  /** 此图形明确支持的语义能力集合。 */
  readonly capabilities: ReadonlySet<ShapeCapability>;
  /** 点击绘制的可选控制点策略。 */
  readonly controlPointPolicy?: ControlPointPolicy;
  /** 可选编辑拓扑；存在时仍需同时声明对应编辑能力。 */
  readonly editTopology?: ShapeEditTopology<S>;
  /** 可选自由绘制策略；存在时仍需同时声明自由绘制能力。 */
  readonly freehand?: ShapeFreehandPolicy<S>;
  /**
   * 从控制点创建允许用于预览的草图状态。
   *
   * @param controlPoints 有序控制点快照。
   * @returns 可预览的草图状态；控制点不足时返回 `undefined`。
   * @throws `InvalidArgumentError` 控制点值或数量超过图形允许范围时抛出。
   */
  createDraft(controlPoints: readonly Coordinate[]): S | undefined;
  /**
   * 校验并规范化未知输入。
   *
   * @param input 未受信任的图形状态输入。
   * @returns 经过复制和规范化的图形状态。
   * @throws `InvalidArgumentError` 输入不符合图形契约时抛出。
   */
  normalize(input: unknown): S;
  /**
   * 深复制图形状态。
   *
   * @param state 要复制的图形状态。
   * @returns 与输入无共享可变数据的新状态。
   */
  clone(state: S): S;
  /**
   * 判断图形状态是否已经满足完成条件。
   *
   * @param state 要检查的图形状态。
   * @returns 可以作为完成元素提交时返回 `true`。
   */
  isComplete(state: S): boolean;
  /**
   * 尝试将草图转换为可提交的完整状态。
   *
   * @param state 当前草图状态。
   * @returns 带判别字段的完成结果；完整结果包含独立状态快照。
   */
  tryComplete(state: S): ShapeCompletion<S>;
  /**
   * 将语义状态转换为渲染器可消费的纯几何快照。
   *
   * @param state 图形语义状态。
   * @returns 点、折线、多边形或圆渲染几何。
   */
  toRenderGeometry(state: S): RenderGeometryState;
}
