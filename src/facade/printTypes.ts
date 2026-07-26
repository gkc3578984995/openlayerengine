import type BaseLayer from 'ol/layer/Base.js';
import type { PrintLegendResult, PrintPlan, PrintResolvedRange, PrintSpec, PrintValidationReport, PrintWarning } from '../core/print/types.js';

/** 当前运行环境对打印功能公开的能力和安全上限。 */
export interface PrintCapabilities {
  /** 是否可以打开内置五屏打印工作台。 */
  readonly ui: boolean;
  /** 当前实现始终支持 PNG 输出。 */
  readonly png: true;
  /** 是否已注入可用的 PDF encoder。 */
  readonly pdf: boolean;
  /** 是否可以调用浏览器打印对话框。 */
  readonly browserPrint: boolean;
  /** 当前平台在分配打印资源前采用的安全上限。 */
  readonly limits: Readonly<PrintCapabilityLimits>;
}

/** 在创建 Canvas 前执行校验的打印资源上限。 */
export interface PrintCapabilityLimits {
  /** 允许配置的最小 DPI。 */
  readonly minDpi: number;
  /** 允许配置的最大 DPI。 */
  readonly maxDpi: number;
  /** Canvas 任一边允许的最大像素数。 */
  readonly maxCanvasDimension: number;
  /** 单页 Canvas 允许的最大总像素数。 */
  readonly maxCanvasPixels: number;
  /** 未单独配置时采用的资源等待毫秒数。 */
  readonly defaultResourceTimeoutMs: number;
}

/** 同一 Earth 已有打印会话时的处理策略。 */
export type PrintSessionConflictPolicy = 'replace' | 'reject';

/** 为一个无法自动投影的原生 Layer 建立隔离打印副本时提供的冻结上下文。 */
export interface PrintPrintableLayerContext {
  /** 活动 Map 中的原始 Layer；factory 不得直接返回它或包含活动 Layer 的树。 */
  readonly sourceLayer: BaseLayer;
  /** validation 和错误信息使用的稳定来源标识。 */
  readonly subject: string;
  /** Layer 已注册到 Engine 时提供其公开 ID。 */
  readonly layerId?: string;
  /** 当前 revision 的冻结打印计划。 */
  readonly plan: Readonly<PrintPlan>;
}

/** printable factory 返回的 Layer 及其明确资源所有权。 */
export type PrintPrintableLayerOutput =
  | {
      /** 仅作为内部冻结快照的输入；Session 不会把该 Layer 树直接挂载到隐藏 Map。 */
      readonly layer: BaseLayer;
      /** 调用方保留资源所有权；Session 只销毁内部克隆，不 dispose 该 Layer 或 Source。 */
      readonly ownership: 'external';
    }
  | {
      /** 仅作为内部冻结快照的输入；Session 不会把该 Layer 树直接挂载到隐藏 Map。 */
      readonly layer: BaseLayer;
      /** 输入资源由当前 PrintSession 独占，并由配套 destroy 回调清理。 */
      readonly ownership: 'session';
      /**
       * Session 在正常完成、失败、取消、替换或销毁时幂等调用一次。
       *
       * @example
       * ```ts
       * destroy() {
       *   releasePrintableResources();
       * }
       * ```
       */
      destroy(): void;
    };

/**
 * 同步建立原生 Layer 的等价打印投影；返回 undefined 表示当前 Layer 不可打印。
 *
 * @param context 原始 Layer、稳定标识和当前冻结计划。
 * @returns 可供引擎立即克隆冻结的标准 Layer 树及其资源所有权，或 undefined。
 *
 * @example
 * ```ts
 * const printableLayerFactory: PrintPrintableLayerFactory = ({ sourceLayer }) => ({
 *   layer: createPrintableLayer(sourceLayer),
 *   ownership: 'external'
 * });
 * ```
 */
export type PrintPrintableLayerFactory = (context: Readonly<PrintPrintableLayerContext>) => Readonly<PrintPrintableLayerOutput> | undefined;

/** 创建 headless 打印会话的选项。 */
export interface PrintCreateOptions {
  /** 创建会话时立即提交的完整打印配置。 */
  readonly initialSpec?: PrintSpec;
  /** 当前 Earth 已存在会话时替换旧会话或拒绝创建。 */
  readonly sessionConflictPolicy?: PrintSessionConflictPolicy;
  /** 框选与其他地图交互冲突时采用的处理策略。 */
  readonly interactionConflictPolicy?: 'replace' | 'reject';
  /** 当前会话可选的单页 PDF 编码能力。 */
  readonly pdfEncoder?: PrintPdfEncoder;
  /** 为无法通过公开 API 自动投影的原生 Layer 提供隔离打印 Layer。 */
  readonly printableLayerFactory?: PrintPrintableLayerFactory;
}

/** 打开内置打印工作台的选项。 */
export interface PrintDialogOptions extends PrintCreateOptions {
  /** 内置打印工作台的挂载容器。 */
  readonly target?: HTMLElement;
}

/** 内置打印工作台的生命周期句柄。 */
export interface PrintDialogHandle {
  /** 工作台正在使用的公共打印会话。 */
  readonly session: PrintSession;
  /** 工作台当前的生命周期状态。 */
  readonly status: 'open' | 'closed' | 'destroyed';
  /**
   * 将键盘焦点移入仍然打开的打印工作台。
   *
   * @example
   * ```ts
   * dialog.focus();
   * ```
   */
  focus(): void;
  /**
   * 关闭工作台并取消其打印会话。
   *
   * @example
   * ```ts
   * dialog.close();
   * ```
   */
  close(): void;
  /**
   * 幂等销毁工作台及其打印会话。
   *
   * @example
   * ```ts
   * dialog.destroy();
   * ```
   */
  destroy(): void;
}

/** Earth 上唯一的地图打印公共入口。 */
export interface PrintFacade {
  /** 当前 Earth 的打印能力和资源上限快照。 */
  readonly capabilities: Readonly<PrintCapabilities>;
  /**
   * 创建不挂载内置 UI 的打印会话。
   *
   * @param options 会话初始配置、冲突策略和可选 PDF encoder。
   * @returns 新创建的打印会话。
   *
   * @example
   * ```ts
   * const session = earth.print.create({ initialSpec });
   * ```
   */
  create(options?: PrintCreateOptions): PrintSession;
  /**
   * 创建打印会话并打开内置五屏工作台。
   *
   * @param options 工作台挂载点和会话创建选项。
   * @returns 可聚焦、关闭和销毁的工作台句柄。
   *
   * @example
   * ```ts
   * const dialog = earth.print.open({ target: document.body });
   * ```
   */
  open(options?: PrintDialogOptions): PrintDialogHandle;
}

/** 打印会话的可观察生命周期阶段。 */
export type PrintSessionStatus = 'draft' | 'selecting' | 'planning' | 'previewing' | 'ready' | 'exporting' | 'printing' | 'cancelled' | 'destroyed';

/** 打印会话可订阅的稳定事件名称。 */
export type PrintSessionEventType = 'statuschange' | 'specchange' | 'rangechange' | 'previewchange' | 'validationchange' | 'export' | 'cancel' | 'error';

/** 打印会话事件只携带公共冻结数据。 */
export interface PrintSessionEventMap {
  /** 会话生命周期状态改变时发布的数据。 */
  readonly statuschange: {
    /** 标识状态变化事件。 */
    readonly type: 'statuschange';
    /** 变化后的会话状态。 */
    readonly status: PrintSessionStatus;
    /** 事件所属的会话 revision。 */
    readonly revision: number;
  };
  /** 完整打印配置改变时发布的数据。 */
  readonly specchange: {
    /** 标识配置变化事件。 */
    readonly type: 'specchange';
    /** 变化后已冻结的完整配置。 */
    readonly spec: Readonly<PrintSpec>;
    /** 事件所属的会话 revision。 */
    readonly revision: number;
  };
  /** 最终打印范围改变时发布的数据。 */
  readonly rangechange: {
    /** 标识范围变化事件。 */
    readonly type: 'rangechange';
    /** 变化后已解析的最终范围。 */
    readonly range: Readonly<PrintResolvedRange>;
    /** 事件所属的会话 revision。 */
    readonly revision: number;
  };
  /** 新页面预览完成时发布的数据。 */
  readonly previewchange: {
    /** 标识预览变化事件。 */
    readonly type: 'previewchange';
    /** 新完成的页面预览结果。 */
    readonly result: Readonly<PrintPreviewResult>;
    /** 事件所属的会话 revision。 */
    readonly revision: number;
  };
  /** 当前校验结论改变时发布的数据。 */
  readonly validationchange: {
    /** 标识校验变化事件。 */
    readonly type: 'validationchange';
    /** 变化后的完整校验结论。 */
    readonly validation: Readonly<PrintValidationReport>;
    /** 事件所属的会话 revision。 */
    readonly revision: number;
  };
  /** 最终输出成功完成时发布的数据。 */
  readonly export: {
    /** 标识最终输出事件。 */
    readonly type: 'export';
    /** 已完成的文件或浏览器打印结果。 */
    readonly result: Readonly<PrintExportResult>;
    /** 事件所属的会话 revision。 */
    readonly revision: number;
  };
  /** 会话取消时发布的数据。 */
  readonly cancel: {
    /** 标识会话取消事件。 */
    readonly type: 'cancel';
    /** 事件所属的会话 revision。 */
    readonly revision: number;
  };
  /** 会话异步操作失败时发布的数据。 */
  readonly error: {
    /** 标识异步错误事件。 */
    readonly type: 'error';
    /** 未被吞掉的原始错误对象。 */
    readonly error: unknown;
    /** 事件所属的会话 revision。 */
    readonly revision: number;
  };
}

/**
 * 指定打印会话事件的监听器。
 *
 * @typeParam T 需要监听的稳定事件名称。
 * @param event 与事件名称对应的冻结事件数据。
 * @returns 监听器不返回业务结果。
 *
 * @example
 * ```ts
 * const listener: PrintSessionEventListener<'statuschange'> = (event) => {
 *   console.log(event.status);
 * };
 * ```
 */
export type PrintSessionEventListener<T extends PrintSessionEventType> = (event: Readonly<PrintSessionEventMap[T]>) => void;

/** 一次地图打印草稿、预览与输出的公共会话。 */
export interface PrintSession {
  /** 当前可观察的会话生命周期状态。 */
  readonly status: PrintSessionStatus;
  /** 当前 revision 的完整打印配置。 */
  readonly spec: Readonly<PrintSpec> | undefined;
  /** 当前 revision 已解析的打印计划。 */
  readonly plan: Readonly<PrintPlan> | undefined;
  /** 当前 revision 已生成或手动覆盖的图例。 */
  readonly legendResult: Readonly<PrintLegendResult> | undefined;
  /** 最近一次成功发布的页面预览。 */
  readonly previewResult: Readonly<PrintPreviewResult> | undefined;
  /** 当前 revision 的完整校验结论。 */
  readonly validation: Readonly<PrintValidationReport>;
  /**
   * 原子提交新的完整打印配置并递增 revision。
   *
   * @param spec 新的完整打印配置。
   *
   * @example
   * ```ts
   * session.update(nextSpec);
   * ```
   */
  update(spec: PrintSpec): void;
  /**
   * 解析当前 View、显式 extent 或等待用户完成地图框选。
   *
   * @returns 当前 revision 已解析的最终打印范围。
   *
   * @example
   * ```ts
   * const range = await session.selectArea();
   * ```
   */
  selectArea(): Promise<Readonly<PrintResolvedRange>>;
  /**
   * 根据最终范围生成自动图例或重放手动图例配置。
   *
   * @returns 当前 revision 的冻结图例结果。
   *
   * @example
   * ```ts
   * const legend = await session.generateLegend();
   * ```
   */
  generateLegend(): Promise<PrintLegendResult>;
  /**
   * 使用当前冻结计划合成完整纸张预览。
   *
   * @param options 选择实时草稿或最终像素质量。
   * @returns 已编码为 PNG Blob 的完整纸张预览。
   *
   * @example
   * ```ts
   * const preview = await session.preview({ quality: 'final' });
   * ```
   */
  preview(options?: PrintPreviewOptions): Promise<PrintPreviewResult>;
  /**
   * 输出 PNG、可选 PDF 或打开浏览器打印对话框；headless 显式调用表示已确认当前 revision 的非阻断 warning，产物仍保留这些 warning。
   *
   * @param options 目标输出格式及其专用选项。
   * @returns 已生成的文件信息或浏览器打印结果。
   *
   * @example
   * ```ts
   * const result = await session.export({ format: 'png' });
   * ```
   */
  export(options: PrintExportOptions): Promise<PrintExportResult>;
  /**
   * 取消当前异步操作并使会话进入取消状态。
   *
   * @example
   * ```ts
   * session.cancel();
   * ```
   */
  cancel(): void;
  /**
   * 幂等释放会话拥有的交互、渲染和监听资源。
   *
   * @example
   * ```ts
   * session.destroy();
   * ```
   */
  destroy(): void;
  /**
   * 订阅一种打印会话事件。
   *
   * @typeParam T 需要订阅的稳定事件名称。
   * @param type 需要订阅的事件名称。
   * @param listener 接收对应冻结事件数据的监听器。
   * @returns 可重复调用的监听注销函数。
   *
   * @example
   * ```ts
   * const off = session.on('statuschange', ({ status }) => console.log(status));
   * off();
   * ```
   */
  on<T extends PrintSessionEventType>(type: T, listener: PrintSessionEventListener<T>): () => void;
}

/** 实时预览的像素质量。 */
export interface PrintPreviewOptions {
  /** 草稿使用较低采样成本，最终预览使用目标 DPI。 */
  readonly quality?: 'draft' | 'final';
}

/** 已合成完整纸张的实时预览。 */
export interface PrintPreviewResult {
  /** 已编码为 `image/png` 的完整白底纸张。 */
  readonly blob: Blob;
  /** 完整纸张位图的像素宽度。 */
  readonly widthPx: number;
  /** 完整纸张位图的像素高度。 */
  readonly heightPx: number;
  /** 该预览所属的会话 revision。 */
  readonly revision: number;
  /** 生成预览时使用的冻结打印计划。 */
  readonly plan: Readonly<PrintPlan>;
  /** 生成预览时对应的完整校验结论。 */
  readonly validation: Readonly<PrintValidationReport>;
}

/** 支持的最终输出操作。 */
export type PrintExportOptions =
  | {
      /** 将完整纸张输出为 PNG 文件。 */
      readonly format: 'png';
    }
  | {
      /** 将完整纸张嵌入单页 PDF。 */
      readonly format: 'pdf';
      /** 覆盖会话创建时提供的 PDF encoder。 */
      readonly encoder?: PrintPdfEncoder;
    }
  | {
      /** 使用完整纸张 PNG 打开浏览器打印对话框。 */
      readonly format: 'browser-print';
      /** 隔离打印文档使用的可选标题。 */
      readonly documentTitle?: string;
    };

/** PNG 或可选 PDF 的单页文件。 */
export interface PrintArtifact {
  /** 已生成文件的格式。 */
  readonly format: 'png' | 'pdf';
  /** 由调用方拥有的单页文件 Blob。 */
  readonly blob: Blob;
  /** 文件中完整纸张位图的像素宽度。 */
  readonly widthPx: number;
  /** 文件中完整纸张位图的像素高度。 */
  readonly heightPx: number;
  /** 生成文件时使用的冻结打印计划。 */
  readonly plan: Readonly<PrintPlan>;
  /** 生成文件时使用的展示快照 revision。 */
  readonly snapshotRevision: number;
  /** 输出时仍需呈现给调用方的提示。 */
  readonly warnings: readonly PrintWarning[];
}

/** 浏览器已经接受打开打印对话框。 */
export interface BrowserPrintResult {
  /** 浏览器是否已接受打开系统打印对话框。 */
  readonly dialogOpened: boolean;
}

/** 打印输出结果。 */
export type PrintExportResult = PrintArtifact | BrowserPrintResult;

/** 调用方提供的可选单页 PDF 编码能力。 */
export interface PrintPdfEncoder {
  /**
   * 将完整页面 PNG 按指定毫米尺寸嵌入单页 PDF。
   *
   * @param input 页面 PNG、物理尺寸、DPI 和取消信号。
   * @returns MIME 类型为 `application/pdf` 的单页文件 Blob。
   *
   * @example
   * ```ts
   * const pdf = await encoder.encode({
   *   png,
   *   pageWidthMm: 297,
   *   pageHeightMm: 210,
   *   dpi: 300,
   *   signal
   * });
   * ```
   */
  encode(input: Readonly<PrintPdfEncodeInput>): Promise<Blob>;
}

/** PDF encoder 接收的完整 PNG 页面和物理尺寸。 */
export interface PrintPdfEncodeInput {
  /** 已完成全部版式合成的 PNG 页面。 */
  readonly png: Blob;
  /** PDF 页面宽度，单位为毫米。 */
  readonly pageWidthMm: number;
  /** PDF 页面高度，单位为毫米。 */
  readonly pageHeightMm: number;
  /** PNG 页面生成时使用的 DPI。 */
  readonly dpi: number;
  /** 会话取消或销毁时触发的终止信号。 */
  readonly signal: AbortSignal;
}
