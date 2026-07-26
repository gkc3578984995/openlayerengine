import type { Coordinate } from '../common/types.js';

/** 当前 View 投影中的轴对齐范围。 */
export type PrintExtent = readonly [minX: number, minY: number, maxX: number, maxY: number];

/** 按纸面左上、右上、右下、左下排序的地图四角。 */
export type PrintFootprint = readonly [Coordinate, Coordinate, Coordinate, Coordinate];

/** 打印范围的数据来源。 */
export type PrintRangeSource =
  | {
      /** 使用当前 View 的四角足迹。 */
      readonly mode: 'view';
    }
  | {
      /** 使用地图交互完成的框选足迹。 */
      readonly mode: 'box';
    }
  | {
      /** 使用调用方提供的投影范围。 */
      readonly mode: 'extent';
      /** 当前 View 投影中的轴对齐来源范围。 */
      readonly extent: PrintExtent;
    };

/** 自动适配来源范围，或使用固定比例尺。 */
export type PrintScaleSpec =
  | {
      /** 调整比例尺以完整容纳来源范围。 */
      readonly mode: 'fit';
    }
  | {
      /** 使用指定的固定比例尺。 */
      readonly mode: 'fixed';
      /** 比例尺分母，例如 `50000` 表示 `1∶50000`。 */
      readonly denominator: number;
    };

/** 范围来源与比例尺约束。 */
export interface PrintRangeSpec {
  /** 确定待打印地图内容的范围来源。 */
  readonly source: PrintRangeSource;
  /** 确定最终范围采用适配或固定比例尺。 */
  readonly scale: PrintScaleSpec;
}

/** A4、A3 或自定义物理纸张。 */
export type PrintPaperSize =
  | 'A4'
  | 'A3'
  | {
      /** 自定义纸张宽度，单位为毫米。 */
      readonly widthMm: number;
      /** 自定义纸张高度，单位为毫米。 */
      readonly heightMm: number;
    };

/** 页面四边的毫米边距。 */
export interface PrintPageInsets {
  /** 上边距，单位为毫米。 */
  readonly top: number;
  /** 右边距，单位为毫米。 */
  readonly right: number;
  /** 下边距，单位为毫米。 */
  readonly bottom: number;
  /** 左边距，单位为毫米。 */
  readonly left: number;
}

/** 完整的纸张和输出分辨率配置。 */
export interface PrintPaperSpec {
  /** 标准纸张名称或自定义物理尺寸。 */
  readonly size: PrintPaperSize;
  /** 纸张使用纵向或横向排版。 */
  readonly orientation: 'portrait' | 'landscape';
  /** 统一边距或分别指定的四边毫米边距。 */
  readonly marginMm: number | PrintPageInsets;
  /** 整页输出的每英寸像素数。 */
  readonly dpi: number;
}

/** 固定版式中的确定文本。 */
export interface PrintLayoutSpec {
  /** 页头左侧显示的密级文本。 */
  readonly classification?: string;
  /** 标题带中必须显示的单行主标题。 */
  readonly title: string;
  /** 标题带中可选的单行副标题。 */
  readonly subtitle?: string;
  /** 页头右侧显示的已格式化日期文本。 */
  readonly date?: string;
  /** 页头右侧显示的签发人文本。 */
  readonly issuer?: string;
}

/** 地图运行态内容的纳入策略。 */
export interface PrintContentSpec {
  /** 打印当前冻结动画帧或仅打印基础状态。 */
  readonly animations?: 'current-frame' | 'base';
  /** DOM Overlay 的打印策略，当前只支持排除。 */
  readonly domOverlays?: 'exclude';
  /** OpenLayers Controls 的打印策略，当前只支持排除。 */
  readonly controls?: 'exclude';
}

/** 打印资源等待策略。 */
export interface PrintResourceSpec {
  /** 等待瓦片、图标和字体就绪的最长毫秒数。 */
  readonly timeoutMs?: number;
}

/** 一次实际可见文本使用的字体与字符样本，仅在打印资源等待链路内部传递。 */
export interface PrintFontSample {
  readonly font: string;
  readonly text: string;
}

/** 图例描边的物理样式。 */
export interface PrintLegendStrokeSpec {
  /** Canvas 可识别的描边颜色。 */
  readonly color: string;
  /** 描边宽度，单位为毫米。 */
  readonly widthMm: number;
  /** 可选的毫米虚线段序列。 */
  readonly dashMm?: readonly number[];
}

/** 图例填充的纯色样式。 */
export interface PrintLegendFillSpec {
  /** Canvas 可识别的填充颜色。 */
  readonly color: string;
}

/** 点图例符号。 */
export interface PrintPointLegendSymbol {
  /** 标识点符号变体。 */
  readonly kind: 'point';
  /** 点符号半径，单位为毫米。 */
  readonly radiusMm: number;
  /** 可选的点符号填充样式。 */
  readonly fill?: PrintLegendFillSpec;
  /** 可选的点符号描边样式。 */
  readonly stroke?: PrintLegendStrokeSpec;
}

/** 线图例符号。 */
export interface PrintLineLegendSymbol {
  /** 标识线符号变体。 */
  readonly kind: 'line';
  /** 线符号的描边样式。 */
  readonly stroke: PrintLegendStrokeSpec;
}

/** 面图例符号。 */
export interface PrintPolygonLegendSymbol {
  /** 标识面符号变体。 */
  readonly kind: 'polygon';
  /** 可选的面符号填充样式。 */
  readonly fill?: PrintLegendFillSpec;
  /** 可选的面符号描边样式。 */
  readonly stroke?: PrintLegendStrokeSpec;
}

/** 图标图例符号。 */
export interface PrintIconLegendSymbol {
  /** 标识图标符号变体。 */
  readonly kind: 'icon';
  /** 用于解析图例图像的资源地址。 */
  readonly src: string;
  /** 图像自身的逻辑宽高，仅决定装入固定物理符号槽时的宽高比。 */
  readonly size: readonly [width: number, height: number];
  /** 图像逻辑尺寸中的对齐锚点。 */
  readonly anchor: readonly [x: number, y: number];
  /** 加载跨域图标时采用的凭据模式。 */
  readonly crossOrigin?: 'anonymous' | 'use-credentials';
}

/** 打印域支持的结构化图例符号。 */
export type PrintLegendSymbolSpec = PrintPointLegendSymbol | PrintLineLegendSymbol | PrintPolygonLegendSymbol | PrintIconLegendSymbol;

/** 一个可显隐和排序的图例分组。 */
export interface PrintLegendGroup {
  /** 分组的稳定唯一标识。 */
  readonly id: string;
  /** 图例中显示的分组标题。 */
  readonly title: string;
  /** 是否显示该分组，省略时视为显示。 */
  readonly visible?: boolean;
  /** 分组的稳定排序序号。 */
  readonly order?: number;
}

/** 一个可追踪自动来源的图例条目。 */
export interface PrintLegendItem {
  /** 图例条目的稳定唯一标识。 */
  readonly id: string;
  /** 条目所属分组的标识。 */
  readonly groupId: string;
  /** 图例中显示的条目名称。 */
  readonly label: string;
  /** 条目使用的结构化符号。 */
  readonly symbol: PrintLegendSymbolSpec;
  /** 是否显示该条目，省略时视为显示。 */
  readonly visible?: boolean;
  /** 条目在分组内的稳定排序序号。 */
  readonly order?: number;
  /** 自动图例命中的目标数量。 */
  readonly count?: number;
  /** 追踪自动图例来源的稳定键。 */
  readonly sourceKey?: string;
}

/** 图例固定锚点内允许调整的排版参数。 */
export interface PrintLegendLayoutSpec {
  /** 图例内容使用的列数。 */
  readonly columns?: number;
  /** 图例条目按行或按列填充。 */
  readonly direction?: 'row' | 'column';
  /** 图例允许占用的最大毫米宽度。 */
  readonly maxWidthMm?: number;
  /** 图例统一或四边毫米内边距。 */
  readonly paddingMm?: number | PrintPageInsets;
  /** Canvas 可识别的图例背景颜色。 */
  readonly background?: string;
  /** 图例分组之间的毫米间距。 */
  readonly groupGapMm?: number;
  /** 图例条目之间的毫米间距。 */
  readonly itemGapMm?: number;
}

/** 自动图例配置。 */
export interface PrintAutoLegendSpec {
  /** 使用最终打印范围自动生成图例。 */
  readonly mode: 'auto';
  /** 是否在图例名称后显示命中数量。 */
  readonly showCounts?: boolean;
}

/** 完整的手动图例数据。 */
export interface PrintManualLegendSpec {
  /** 使用调用方提供的完整图例。 */
  readonly mode: 'manual';
  /** 手动图例的分组集合。 */
  readonly groups: readonly PrintLegendGroup[];
  /** 手动图例的条目集合。 */
  readonly items: readonly PrintLegendItem[];
  /** 可选的图例排版覆盖。 */
  readonly layout?: PrintLegendLayoutSpec;
}

/** 自动或手动图例。 */
export type PrintLegendSpec = PrintAutoLegendSpec | PrintManualLegendSpec;

/** 一次完整打印工作的确定配置。 */
export interface PrintSpec {
  /** 打印范围来源和比例尺约束。 */
  readonly range: PrintRangeSpec;
  /** 纸张尺寸、方向、边距和 DPI。 */
  readonly paper: PrintPaperSpec;
  /** 固定版式中显示的业务文本。 */
  readonly layout: PrintLayoutSpec;
  /** 自动或手动图例配置。 */
  readonly legend?: PrintLegendSpec;
  /** 地图运行态内容的纳入策略。 */
  readonly content?: PrintContentSpec;
  /** 瓦片、图标和字体的等待策略。 */
  readonly resources?: PrintResourceSpec;
}

/** 已规范化为四边边距的纸张配置。 */
export interface NormalizedPrintPaperSpec {
  readonly size: PrintPaperSize;
  readonly orientation: 'portrait' | 'landscape';
  readonly marginMm: Readonly<PrintPageInsets>;
  readonly dpi: number;
}

/** 已复制、补齐默认语义并冻结的配置。 */
export interface NormalizedPrintSpec {
  readonly range: Readonly<PrintRangeSpec>;
  readonly paper: Readonly<NormalizedPrintPaperSpec>;
  readonly layout: Readonly<PrintLayoutSpec>;
  readonly legend: Readonly<PrintLegendSpec>;
  readonly content: Readonly<Required<PrintContentSpec>>;
  readonly resources?: Readonly<PrintResourceSpec>;
}

/** Adapter 在一次规划前冻结的 View 数据。 */
export interface PrintViewSnapshot {
  readonly center: Coordinate;
  readonly footprint: PrintFootprint;
  readonly rotation: number;
  /** 规划中心处一个 View 投影单位对应的米数。 */
  readonly metersPerViewUnitAtCenter: number;
  /** 当前投影的局部比例是否随位置变化。 */
  readonly scaleVariesByPosition?: boolean;
}

/** 已完成 box 交互后交给 Planner 的纯数据结果。 */
export interface PrintBoxRangeSnapshot {
  readonly center: Coordinate;
  readonly footprint: PrintFootprint;
  readonly rotation: number;
}

/** 当前平台公开的规划硬限制。 */
export interface PrintPlannerLimits {
  readonly minDpi: number;
  readonly maxDpi: number;
  readonly maxCanvasDimension: number;
  readonly maxCanvasPixels: number;
}

/** 一次纯 Core 规划的上下文。 */
export interface PrintPlannerContext {
  readonly revision: number;
  readonly limits: PrintPlannerLimits;
  readonly boxRange?: PrintBoxRangeSnapshot;
  /** 真北在打印纸面中的有限弧度角；缺失时阻断输出。 */
  readonly northDirection?: number;
}

/** 解析后用于渲染、命中和比例尺标注的最终范围。 */
export interface PrintResolvedRange {
  /** 生成该范围的来源模式。 */
  readonly sourceMode: 'view' | 'box' | 'extent';
  /** 调整比例尺或宽高比前的来源轴对齐范围。 */
  readonly sourceExtent: PrintExtent;
  /** 最终打印足迹对应的轴对齐范围。 */
  readonly actualExtent: PrintExtent;
  /** 按纸面四角顺序记录的最终打印足迹。 */
  readonly footprint: PrintFootprint;
  /** 当前 View 投影中的最终范围中心。 */
  readonly center: Coordinate;
  /** 最终地图相对投影坐标轴的旋转弧度。 */
  readonly rotation: number;
  /** 最终比例尺分母。 */
  readonly denominator: number;
  /** 最终地图每个逻辑 CSS 像素对应的投影分辨率。 */
  readonly resolution: number;
}

/** 页面毫米坐标中的矩形。 */
export interface PrintPageRect {
  /** 矩形左上角的毫米横坐标。 */
  readonly x: number;
  /** 矩形左上角的毫米纵坐标。 */
  readonly y: number;
  /** 矩形的毫米宽度。 */
  readonly width: number;
  /** 矩形的毫米高度。 */
  readonly height: number;
}

/** 单页栅格输出所需的确定规划。 */
export interface PrintPlan {
  /** 生成计划时所属的会话 revision。 */
  readonly revision: number;
  /** 最终纸张的毫米宽高。 */
  readonly pageSizeMm: readonly [width: number, height: number];
  /** 页面毫米坐标中的净地图框。 */
  readonly mapFrameMm: Readonly<PrintPageRect>;
  /** 最终整页 backing bitmap 的像素宽高。 */
  readonly outputSizePx: readonly [width: number, height: number];
  /** 已按纸张和比例尺解析的最终地图范围。 */
  readonly range: Readonly<PrintResolvedRange>;
  /** 生成 backing bitmap 使用的目标 DPI。 */
  readonly dpi: number;
}

/** 阻止预览或输出的问题。 */
export interface PrintValidationIssue {
  /** 供程序稳定分支处理的问题代码。 */
  readonly code: string;
  /** 可直接呈现给调用方的问题说明。 */
  readonly message: string;
  /** 可选的字段、图层或资源标识。 */
  readonly subject?: string;
}

/** 需要呈现给调用方的非阻断提示。 */
export interface PrintWarning {
  /** 供程序稳定分支处理的提示代码。 */
  readonly code: string;
  /** 可直接呈现给调用方的提示说明。 */
  readonly message: string;
  /** 可选的字段、图层或资源标识。 */
  readonly subject?: string;
  /** 输出前是否需要调用方明确确认。 */
  readonly requiresAcknowledgement: boolean;
}

/** 当前 revision 的完整校验结论。 */
export interface PrintValidationReport {
  /** 校验结论所属的会话 revision。 */
  readonly revision: number;
  /** 阻止预览或输出的问题集合。 */
  readonly issues: readonly PrintValidationIssue[];
  /** 不阻断操作但需要展示的提示集合。 */
  readonly warnings: readonly PrintWarning[];
  /** 当前状态是否允许生成预览。 */
  readonly canPreview: boolean;
  /** 当前状态是否无需额外 warning 确认即可生成最终输出；headless 显式调用 export 视为对当前 revision 的确认。 */
  readonly canExport: boolean;
}

/** Planner 同时返回可选计划和阻断/提示清单。 */
export interface PrintPlanningResult {
  readonly plan: Readonly<PrintPlan> | undefined;
  readonly validation: Readonly<PrintValidationReport>;
}

/** 已生成的图例与其来源 revision。 */
export interface PrintLegendResult {
  /** 已生成并排序的图例分组。 */
  readonly groups: readonly PrintLegendGroup[];
  /** 已生成并排序的图例条目。 */
  readonly items: readonly PrintLegendItem[];
  /** 图例来源快照所属的会话 revision。 */
  readonly sourceRevision: number;
  /** 图例生成或覆盖重放产生的提示。 */
  readonly warnings: readonly PrintWarning[];
}
