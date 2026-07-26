import type { Coordinate, Pixel } from '../common/types.js';
import type { ElementStyleState } from '../style/types.js';

/** 引擎内置并注册的图形类型。 */
export const shapeTypes = Object.freeze([
  'point',
  'polyline',
  'polygon',
  'circle',
  'ellipse',
  'callout',
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
  : T extends 'callout'
    ? {
        /** 文本标注框的判别字段。 */
        readonly type: 'callout';
        /** 尾巴指向的二维或三维定位点。 */
        readonly anchor: readonly number[];
        /** 文本框中心的二维或三维坐标。 */
        readonly center: readonly number[];
        /** 文本框宽高，单位为 CSS 像素；公共 Element 写入必须为正值，Draw 会根据文本自动计算初始值。 */
        readonly size: readonly [widthPx: number, heightPx: number];
      }
    : {
        /** 图形类型判别字段。 */
        readonly type: T;
        /** 二维扁平数组，或二维、三维嵌套坐标。 */
        readonly controlPoints: readonly number[] | readonly (readonly number[])[];
      };

/**
 * 图形状态。圆使用圆心和半径，Callout 使用定位点、文本框中心和 CSS 像素尺寸，其余图形使用有序控制点。
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
  : T extends 'callout'
    ? {
        /** 文本标注框的判别字段。 */
        readonly type: 'callout';
        /** 尾巴指向的规范投影坐标。 */
        readonly anchor: Coordinate;
        /** 文本框中心的规范投影坐标。 */
        readonly center: Coordinate;
        /** 文本框宽高，单位为 CSS 像素。 */
        readonly size: readonly [widthPx: number, heightPx: number];
      }
    : {
        /** 图形类型判别字段。 */
        readonly type: T;
        /** 按顺序定义图形的控制点。 */
        readonly controlPoints: readonly Coordinate[];
      };

/** Polygon 上仅供展示编译器消费的临时中心文字。 @internal */
export interface RenderTextLabel {
  /** 文字固定使用的显式定位点。 */
  readonly coordinate: Coordinate;
  /** 已完成自动换行、但不会写回 StyleSpec 的展示文字。 */
  readonly text: string;
}

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
      /** 显式位于框体中心的临时文字；公共几何详情会剥离该字段。 @internal */
      readonly label?: RenderTextLabel;
    }
  | {
      /** 圆几何判别字段。 */
      readonly type: 'circle';
      /** 圆的中心坐标。 */
      readonly center: Coordinate;
      /** 圆在当前 View 投影中的渲染半径。 */
      readonly radius: number;
    };

/** ShapeDefinition 为最终路径几何声明的轮廓语义。 */
export type ShapePathContourKind = 'open' | 'closed';

/** 路径或面箭头的揭示方向。 */
export type ShapeAnimationDirection = 'forward' | 'reverse';

/** 圆形和扇面动画使用的 View 径向语义。 */
export interface ShapeRadialFrame {
  /** 径向效果的中心。 */
  readonly center: Coordinate;
  /** 当前 View 投影单位中的外半径。 */
  readonly radius: number;
  /** 起始边界角；0 沿 View 坐标正 X。 */
  readonly startAngleRad: number;
  /** 从起始边界沿角度增加方向覆盖的弧度。 */
  readonly sweepAngleRad: number;
}

/** Shape reveal provider 为单条动画记录持有的可复用工作会话。 */
export interface ShapeRevealSession<S extends ShapeState = ShapeState> {
  /** 在目标 View 工作状态变化时重建控制点、路径指标和算法工作区。 */
  rebind(viewState: Readonly<S>): void;
  /** 把当前进度写入会话持有的稳定 RenderGeometry 容器。 */
  reveal(progress: number, direction: ShapeAnimationDirection): RenderGeometryState | undefined;
  /** 释放会话持有的引用与工作区；重复调用保持幂等。 */
  destroy(): void;
}

/** Shape 为动画内核提供的可选几何语义。 */
export interface ShapeAnimationProfile<S extends ShapeState = ShapeState> {
  /**
   * 生成从空状态到完整状态的中间展示几何。
   *
   * @param viewState 已转换到当前 View 工作单位的 Shape 状态。
   * @param progress 限制到 `[0, 1]` 的揭示进度。
   * @param direction 几何的揭示顺序。
   * @returns 有限、非退化的中间几何；尚不足以成形时返回 `undefined`。
   */
  revealGeometry?(viewState: Readonly<S>, progress: number, direction: ShapeAnimationDirection): RenderGeometryState | undefined;
  /**
   * 为一条动画记录创建可复用 reveal 工作会话。
   *
   * 热路径优先使用该会话；`revealGeometry` 保留为无状态语义入口和兼容回退。
   */
  createRevealSession?(viewState: Readonly<S>): ShapeRevealSession<S>;
  /**
   * 返回当前 Shape 的径向语义。
   *
   * @param viewState 已转换到当前 View 工作单位的 Shape 状态。
   * @returns 径向效果使用的中心、半径和角度范围。
   */
  radialFrame?(viewState: Readonly<S>): ShapeRadialFrame;
}

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

/** View-dependent Shape presentation 使用的显式像素、坐标与字体能力。 @internal */
export interface ShapePresentationContext {
  /** 把当前 View 工作坐标转换为 viewport CSS 像素。 */
  readonly toPixel: (coordinate: Coordinate) => Pixel;
  /** 把 viewport CSS 像素转换回当前 View 工作坐标。 */
  readonly toCoordinate: (pixel: Pixel, template?: Coordinate) => Coordinate;
  /** 使用最终 CSS font 测量文字宽度。 */
  readonly measureTextWidth: (font: string, text: string) => number;
  /** 使用最终 CSS font 测量单行文字高度。 */
  readonly measureTextHeight: (font: string) => number;
}

/** View-dependent presentation 原子返回的已布局状态与标准渲染几何。 @internal */
export interface ShapePresentationResult<S extends ShapeState = ShapeState> {
  /** 已应用自动尺寸和边界约束的工作状态。 */
  readonly state: S;
  /** 可直接投影到原生 Feature 的标准渲染几何。 */
  readonly geometry: RenderGeometryState;
  /**
   * Transform 选中框使用的权威基准几何。
   *
   * 它只描述可操作主体，不替代业务预览、命中或 Feature extent。
   */
  readonly selectionGeometry?: RenderGeometryState;
}

/** 依赖当前 View 与 Style 的独立 Edit 拓扑。 @internal */
export interface ShapeContextualEditTopology<S extends ShapeState = ShapeState> {
  /** 派生当前帧的完整编辑控制点。 */
  describe(state: S, style: ElementStyleState, context: ShapePresentationContext): ControlPointTopology;
  /** 按当前帧上下文移动一个派生控制点。 */
  move(state: S, index: number, coordinate: Coordinate, style: ElementStyleState, context: ShapePresentationContext): S;
}

/** Shape 自己持有的 View-dependent 展示与上下文编辑语义。 @internal */
export interface ShapePresentationProfile<S extends ShapeState = ShapeState> {
  /** 标记 resolution 或 rotation 改变时必须重新投影真实 Feature。 */
  readonly viewDependent: boolean;
  /** 在状态提交前校验该 presentation 对 Style 的额外约束。 */
  readonly validateStyle?: (style: ElementStyleState) => void;
  /** 原子生成已布局状态和最终标准 RenderGeometry。 */
  present(state: S, style: ElementStyleState, context: ShapePresentationContext): ShapePresentationResult<S>;
  /** 可选的上下文编辑语义；独立 Edit 可用，但不会自动开放 Transform Edit。 */
  readonly edit?: ShapeContextualEditTopology<S>;
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
  /** 提供依赖当前 View、字体和结构化 Style 的展示及独立编辑语义。 */
  readonly presentation?: ShapePresentationProfile<S>;
  /** 提供连续采样处理规则。 */
  readonly freehand?: ShapeFreehandPolicy<S>;
  /** 提供动画揭示或径向语义；provider 的存在即为对应能力声明。 */
  readonly animation?: ShapeAnimationProfile<S>;
  /** 最终 RenderGeometry 可被路径样式提取时声明其开放或闭合语义。 */
  readonly pathContour?: ShapePathContourKind;
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
  /** 按当前坐标单位整体平移 Shape 的全部位置字段；声明 translate capability 时必需。 */
  translate?(state: S, x: number, y: number): S;
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
