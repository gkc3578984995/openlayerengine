# 2.0 地图打印补充设计

## 文档状态

- 状态：已批准（用户于 2026-07-23 确认初版；2026-07-27 确认五屏交互与成品版式修订）
- 日期：2026-07-23
- 目标版本：@vrsim/earth-engine-ol 2.0.0
- 性质：公共打印契约、内部渲染架构与内置五屏 UI 补充
- 补充：2026-07-13-v2-element-kernel-architecture-design.md
- 关联：2026-07-16-v2-coordinate-conversion-and-circle-radius-design.md
- 关联：2026-07-16-v2-interaction-visual-design.md
- 关联：2026-07-17-v2-animation-effect-kernel-design.md

本文补充架构总纲的总体分层、Earth 公共门面、交互协调、生命周期、公共发布边界、验证门槛和网站文档设计。未被本文明确补充的总纲条款继续有效；坐标、交互临时视觉和动画帧合成继续服从上述关联规格。

用户已确认采用“版式设置—框选范围—自动图例—手动图例—最终预览导出”五屏流程，成品使用固定地图整饰版式，同时保留不依赖内置 UI 的 headless 公共 API。本文是该能力的实现依据，不再把已确认的五屏结构、固定成品布局或公共入口留给实现阶段自行选择。

## 1. 背景、目标与非目标

地图打印同时依赖当前 View 投影、最终分辨率、图层可见性、Element 样式、交互互斥、动画展示帧和浏览器 Canvas。若每个外部系统分别读取 OpenLayers DOM 或临时修改活动 Map，会形成重复实现、比例尺漂移、私有 API 依赖和资源泄漏。本设计把通用地图打印能力纳入 Earth，由稳定服务完成范围规划、地图快照、版式合成和输出；外部系统只提供业务文字、图例调整和可选 PDF 编码能力。

本设计的目标是：

1. 在 Earth 上提供唯一公共 `PrintFacade`，支持内置五屏 UI 和独立 headless 调用。
2. headless API 支持当前视图 `view`、地图框选 `box` 和显式范围 `extent` 三种来源；内置 UI 只提供 `view` 与 `box`，两者均支持固定比例尺 `fixed` 和适配范围 `fit`。
3. 支持 A4、A3 和自定义纸张、横竖向、边距、DPI、密级、主副标题、日期和签发人。
4. 固定输出整饰：地图外粗内细双线框；页头左侧密级、右侧紧凑排列日期和签发人；居中主标题和副标题；图例可锚定地图内四角；页脚左侧图形比例尺及 `1∶N`，右侧指北针；标题带与页脚整饰均与地图框保持明确物理间距。
5. 自动图例只统计最终范围和最终比例尺下实际可见的目标，按图层分组、合并同一语义符号并显示命中数量；无法静态解析的动态样式必须显式告警。
6. 手动图例支持改名、分组、排序、显隐、自定义点线面符号、图标和版式；自动来源变化后保留用户覆盖并提示差异。
7. 五屏中的纸张预览与最终 PNG、浏览器打印以及 headless 可选 PDF 使用同一份 `PrintPlan`，不得维护两套范围、版式或图例算法；内置 UI 不展示 PDF 输出按钮。
8. 不修改 ElementState、活动 View、业务 Layer、Source、Feature 或动画运行状态；所有预览、选框、隐藏 Map、Canvas、iframe 和监听都有明确所有者和幂等清理路径。
9. 保持发布包零普通运行依赖，不为 PDF、DOM 截图或打印引入强制第三方依赖。

本次明确不做：

- 不提供多页图册、分页图例、地图册索引或批量图幅编号。
- 不提供任意 HTML 报表设计器，也不把用户 HTMLElement 直接栅格化为打印内容。
- 不打印浏览器控件、ContextMenu、Tooltip、Draw/Edit/Transform 临时视觉或任意 DOM Overlay。
- 不控制打印机驱动、纸盒、色彩配置、无边距能力或浏览器“适合页面”开关。
- 不绕过跨域策略，不内置代理下载瓦片、图片或字体。
- 不把 PDF 编码库打入 engine；没有可用 PDF encoder 时不得伪装为支持 PDF。
- 不使用 OpenLayers 私有 renderer、带下划线字段或私有 flat-coordinate API。
- 不把 headless 描述成 Node.js 服务端渲染。headless 只表示不依赖内置五屏 UI，仍要求所属 Earth 具备可用的浏览器地图与 Canvas 渲染端口。

## 2. 术语与不可变约束

本文使用以下术语：

- **PrintFacade**：Earth 对外暴露的稳定打印门面，即 `earth.print`。
- **PrintSession**：一次打印草稿、范围选择、预览和一个或多个输出操作的公共会话。
- **PrintSpec**：已经完整、可校验的公共打印配置。
- **PrintPlan**：由 PrintSpec、最终范围、投影比例和版式常量推导出的冻结纯数据计划。
- **净地图框**：扣除纸张边距、页头、标题带、页脚和双线框占位后，实际承载地图内容的物理矩形。
- **来源范围**：`view`、`box` 或 `extent` 提供的原始地图覆盖范围。
- **实际范围**：根据净地图框和 `fixed` / `fit` 规则得到的最终打印足迹。
- **逻辑 CSS 尺寸**：以固定 96 CSS px/in 换算的页面和地图尺寸，用于保持 StyleSpec 的 CSS 像素物理语义。
- **输出像素尺寸**：按纸张毫米和目标 DPI 计算的最终 PNG/PDF backing bitmap 尺寸。
- **自动图例来源**：最终实际范围、最终比例尺和当前图层/Element/样式快照共同生成的图例条目集合。
- **来源键**：自动图例条目的稳定身份，用于在自动来源变化后重放手动覆盖。
- **打印展示快照**：某个冻结 revision 和时间点下的图层、Element、样式、可选动画展示帧与图例来源，不属于 Store 快照。

以下约束不可被具体 UI 或输出格式覆盖：

1. ElementState 仍是唯一业务状态真源；打印不向 ElementStore、Snapshot、LayerManager 或动画记录写入状态。
2. Core 和 Services 不导入 OpenLayers、HTMLElement、Canvas、Blob、iframe 或打印窗口类型。
3. OpenLayers 类型只存在于 Adapter；DOM UI 不读取 OL Map、Layer、Feature、Geometry 或 FrameState。
4. 每个 Earth 只有一个 PrintFacade；PrintSession 和所有端口通过 EngineContext 显式获得依赖，不调用深层 `useEarth()`。
5. 内置 UI 和 headless API 必须生成相同 PrintPlan；UI 不自行计算比例尺、范围、指北方向或图例可见性。
6. 打印渲染不得临时改变活动 Map 的 target、size、View center、resolution、rotation、Layer 顺序或 Source 归属。
7. 每次预览或输出只使用一个冻结 snapshot revision 和一个冻结动画时间，不允许页内不同图层来自不同业务 revision 或动画时刻。
8. 最终输出的物理范围由毫米和比例尺决定；DPI 只决定 backing bitmap 采样密度，不改变地图地理范围或 StyleSpec 的 CSS 像素物理尺寸。
9. 未知动态样式、不可打印原生 Layer、资源超时和跨域污染不得静默遗漏。
10. 所有 Session、box interaction、隐藏 Map、打印图层投影、Canvas、object URL、iframe、listener、timer 和 AbortController 都必须有幂等清理路径。

## 3. 公共 API

### 3.1 Earth 入口与 PrintFacade

Earth 增加稳定只读属性：

```ts
readonly print: PrintFacade;
```

`PrintFacade` 不是可公开构造的实现类。根入口导出接口和公共配置类型，不导出内部 PrintService、Planner、LegendBuilder、OpenLayers Adapter 或 DOM controller。

```ts
export interface PrintFacade {
  readonly capabilities: Readonly<PrintCapabilities>;

  create(options?: PrintCreateOptions): PrintSession;
  open(options?: PrintDialogOptions): PrintDialogHandle;
}

export interface PrintCapabilities {
  readonly ui: boolean;
  readonly png: true;
  readonly pdf: boolean;
  readonly browserPrint: boolean;
  readonly limits: Readonly<PrintCapabilityLimits>;
}

export interface PrintCapabilityLimits {
  readonly minDpi: number;
  readonly maxDpi: number;
  readonly maxCanvasDimension: number;
  readonly maxCanvasPixels: number;
  readonly defaultResourceTimeoutMs: number;
}

export type PrintSessionConflictPolicy = 'replace' | 'reject';

export interface PrintPrintableLayerContext {
  readonly sourceLayer: BaseLayer;
  readonly subject: string;
  readonly layerId?: string;
  readonly plan: Readonly<PrintPlan>;
}

export type PrintPrintableLayerOutput =
  { readonly layer: BaseLayer; readonly ownership: 'external' } | { readonly layer: BaseLayer; readonly ownership: 'session'; destroy(): void };

export type PrintPrintableLayerFactory = (context: Readonly<PrintPrintableLayerContext>) => Readonly<PrintPrintableLayerOutput> | undefined;

export interface PrintCreateOptions {
  readonly initialSpec?: PrintSpec;
  readonly sessionConflictPolicy?: PrintSessionConflictPolicy;
  readonly interactionConflictPolicy?: 'replace' | 'reject';
  readonly pdfEncoder?: PrintPdfEncoder;
  readonly printableLayerFactory?: PrintPrintableLayerFactory;
}

export interface PrintDialogOptions extends PrintCreateOptions {
  readonly target?: HTMLElement;
}

export interface PrintDialogHandle {
  readonly session: PrintSession;
  readonly status: 'open' | 'closed' | 'destroyed';

  focus(): void;
  close(): void;
  destroy(): void;
}
```

- `create()` 创建不带内置 UI 的 PrintSession；没有 initialSpec 时 Session 处于 draft，调用方通过 `update()` 提交完整配置。headless 调用可以独立完成选区、图例、预览和输出。
- `open()` 使用与 `create()` 相同的 Session 模型打开内置五屏 UI，并返回同时持有该 Session 的 PrintDialogHandle。DOM UI 端口不可用时同步抛出 `CapabilityError`。
- 同一 Earth 同时只允许一个未销毁 PrintSession。默认 `sessionConflictPolicy` 为 `replace`：旧会话先收到 cancel、释放资源并进入失效状态，新会话才创建；`reject` 抛出 `InteractionConflictError`。
- `interactionConflictPolicy` 只在 box 子会话申请地图指针时生效，默认 `replace`，不因单纯打开 UI 或执行 headless PNG 导出而占用指针。
- `target` 只作为内置 UI 挂载点。服务只删除自己创建的后代节点，不删除 target、不清空调用方内容，也不删除调用方监听。
- `capabilities.pdf` 只在 EngineContext 或当前 Session 存在 PDF encoder 时为 true；`browserPrint` 只表示 DOM 端口可以创建隔离打印文档，不表示打印机接受自定义纸张或真实 100% 比例。
- `PrintDialogHandle.close()` 关闭 UI 并取消其 Session；`destroy()` 无条件幂等释放 UI 与 Session，`focus()` 只聚焦仍打开的对话框。调用方只需要 headless 能力时不创建该 Handle。

### 3.2 PrintSession

```ts
export type PrintSessionStatus = 'draft' | 'selecting' | 'planning' | 'previewing' | 'ready' | 'exporting' | 'printing' | 'cancelled' | 'destroyed';

export interface PrintSession {
  readonly status: PrintSessionStatus;
  readonly spec: Readonly<PrintSpec> | undefined;
  readonly plan: Readonly<PrintPlan> | undefined;
  readonly legendResult: Readonly<PrintLegendResult> | undefined;
  readonly previewResult: Readonly<PrintPreviewResult> | undefined;
  readonly validation: Readonly<PrintValidationReport>;

  update(spec: PrintSpec): void;
  selectArea(): Promise<Readonly<PrintResolvedRange>>;
  generateLegend(): Promise<PrintLegendResult>;
  preview(options?: PrintPreviewOptions): Promise<PrintPreviewResult>;
  export(options: PrintExportOptions): Promise<PrintExportResult>;
  cancel(): void;
  destroy(): void;
  on<T extends PrintSessionEventType>(type: T, listener: PrintSessionEventListener<T>): () => void;
}
```

- `update()` 对完整新配置执行同步、原子校验。失败时保留旧 spec、plan、box、图例和预览；成功时递增 session revision，并取消属于旧 revision 的异步工作。
- 内置五屏 UI 可以在 DOM controller 内维护未完成草稿，但只有形成完整 PrintSpec 后才调用 `update()`。公共 spec 不允许半合法状态。
- `selectArea()` 统一解析 view、extent 和 box。view/extent 直接生成冻结范围；box 创建 InteractionCoordinator 管理的子会话。box 取消时 Promise 以 `PrintError` 的 `cancelled` code 拒绝，但不销毁父 PrintSession。
- `generateLegend()` 基于当前 resolved range 和展示快照生成或重放图例。范围尚未解析时产生 `range-unresolved`，不得偷用活动 viewport 代替。
- `preview()` 可以重复调用。相同 spec revision、展示 snapshot revision、动画时间和 preview quality 命中缓存；任一输入变化后必须生成新结果。
- `export()` 统一处理 PNG、可选 PDF 和 browser-print，不隐式销毁 Session。内置最终屏允许重复执行 PNG 与 browser-print；headless 调用方还可在 encoder 可用时执行 PDF。调用方完成全部操作后显式 `destroy()`。
- 同一 Session 同时只运行一个 preview/export/print 操作。后发操作先取消旧操作；陈旧 Promise 拒绝为 `cancelled`，不得覆盖较新 previewResult 或 validation。
- `cancel()` 和 `destroy()` 均幂等。`cancel()` 发出 cancel 事件并释放资源；`destroy()` 无条件释放。终态之后除 status、validation、幂等 cancel/destroy 和注销函数外，其他方法抛出 `ObjectDisposedError`。
- `on()` 返回幂等 disposer。监听器异常必须隔离并通过 Earth 错误通道上报，不能破坏 Session 状态或其他监听器。

公开事件至少包括：

```ts
export type PrintSessionEventType = 'statuschange' | 'specchange' | 'rangechange' | 'previewchange' | 'validationchange' | 'export' | 'cancel' | 'error';
```

事件载荷只包含冻结公共 spec、plan、结果、warning、错误和 revision，不包含 OL Map、Layer、Feature、Geometry、Canvas 或内部 DOM controller。

### 3.3 PrintSpec

```ts
export interface PrintSpec {
  readonly range: PrintRangeSpec;
  readonly paper: PrintPaperSpec;
  readonly layout: PrintLayoutSpec;
  readonly legend?: PrintLegendSpec;
  readonly content?: PrintContentSpec;
  readonly resources?: PrintResourceSpec;
}

export interface PrintRangeSpec {
  readonly source: PrintRangeSource;
  readonly scale: PrintScaleSpec;
}

export type PrintRangeSource =
  { readonly mode: 'view' } | { readonly mode: 'box' } | { readonly mode: 'extent'; readonly extent: readonly [number, number, number, number] };

export type PrintScaleSpec = { readonly mode: 'fit' } | { readonly mode: 'fixed'; readonly denominator: number };

export type PrintPaperSize = 'A4' | 'A3' | { readonly widthMm: number; readonly heightMm: number };

export interface PrintPaperSpec {
  readonly size: PrintPaperSize;
  readonly orientation: 'portrait' | 'landscape';
  readonly marginMm: number | PrintPageInsets;
  readonly dpi: number;
}

export interface PrintPageInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PrintLayoutSpec {
  readonly classification?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly date?: string;
  readonly issuer?: string;
}

export interface PrintContentSpec {
  readonly animations?: 'current-frame' | 'base';
  readonly domOverlays?: 'exclude';
  readonly controls?: 'exclude';
}

export interface PrintResourceSpec {
  readonly timeoutMs?: number;
}

export interface PrintPlan {
  readonly revision: number;
  readonly pageSizeMm: readonly [width: number, height: number];
  readonly mapFrameMm: Readonly<PrintPageRect>;
  readonly outputSizePx: readonly [width: number, height: number];
  readonly range: Readonly<PrintResolvedRange>;
  readonly dpi: number;
}

export interface PrintPageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
```

`paper`、`range` 和 `layout.title` 是完整 headless spec 的必填项。内置 UI 可以提供 A4、常用方向、边距和 DPI 初值，但这些 UI 初值必须在界面可见并写入完整 PrintSpec，不能成为隐藏的环境差异。可选字段省略时，语义默认值固定为自动图例、`content.animations: 'current-frame'`、`domOverlays: 'exclude'` 和 `controls: 'exclude'`；资源 timeout 使用 `PrintCapabilities` 对应平台的公开安全默认值。

`title` 是非空、去除首尾空白后仍有内容的字符串。`classification`、`subtitle`、`date` 和 `issuer` 是已经格式化的纯文本；内核不解析 Date、不隐式读取时区。内置 UI 可以为 classification 提供常用密级建议，但必须继续允许自由手填，不把建议值变成受限枚举。内置 UI 初次打开时可以按当前本地日期预填 date，但写入 PrintSpec 的始终是确定字符串。

所有 spec 使用严格普通对象校验：拒绝未知字段、accessor、symbol 字段、非法原型、NaN、Infinity 和稀疏数组，不修改或冻结调用方对象。A4 固定为 `210mm × 297mm`，A3 固定为 `297mm × 420mm`，orientation 只决定最终宽高次序。自定义尺寸、边距和 DPI 必须是有限正数或非负数，并在任何 Canvas 分配前通过第 5 节的净地图框和像素预算校验。

### 3.4 结果与输出类型

```ts
export interface PrintPreviewOptions {
  readonly quality?: 'draft' | 'final';
}

export interface PrintPreviewResult {
  readonly blob: Blob;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly revision: number;
  readonly plan: Readonly<PrintPlan>;
  readonly validation: Readonly<PrintValidationReport>;
}

export type PrintExportOptions =
  | { readonly format: 'png' }
  | { readonly format: 'pdf'; readonly encoder?: PrintPdfEncoder }
  | { readonly format: 'browser-print'; readonly documentTitle?: string };

export type PrintExportResult = PrintArtifact | BrowserPrintResult;

export interface PrintArtifact {
  readonly format: 'png' | 'pdf';
  readonly blob: Blob;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly plan: Readonly<PrintPlan>;
  readonly snapshotRevision: number;
  readonly warnings: readonly PrintWarning[];
}

export interface PrintPdfEncoder {
  encode(input: Readonly<PrintPdfEncodeInput>): Promise<Blob>;
}

export interface PrintPdfEncodeInput {
  readonly png: Blob;
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly dpi: number;
  readonly signal: AbortSignal;
}

export interface BrowserPrintResult {
  readonly dialogOpened: boolean;
}
```

- `draft` preview 使用同一 PrintPlan 和页面绘制算法，但可以降低 backing bitmap DPI；不得降低地理范围精度、改变图例来源或改用简化版式。`final` preview 与最终 PNG 使用目标 DPI 和同一冻结展示快照。
- Blob 归调用方所有，不需要 Session dispose。内部只撤销自己为 UI 创建的临时 object URL。
- PDF encoder 是调用方拥有的无状态能力；PrintSession 不 dispose，也不跨 Earth 缓存。encoder 返回值必须是 `application/pdf` Blob，否则 `pdf-encode-failed`。
- `export({ format: 'browser-print' })` 使用最终 PNG 页面位图创建隔离打印文档。它不等价于 PDF，不返回打印机结果，也不自动关闭父 PrintSession。

## 4. 范围与比例尺

### 4.1 公共坐标语义

`extent` 和所有 resolved range 坐标继续使用当前 Earth 的 View 投影，不接受每次调用的 dataProjection，也不读取 OpenLayers 全局 user projection。`PrintResolvedRange` 至少包含：

```ts
export interface PrintResolvedRange {
  readonly sourceMode: 'view' | 'box' | 'extent';
  readonly sourceExtent: readonly [number, number, number, number];
  readonly actualExtent: readonly [number, number, number, number];
  readonly footprint: readonly [Coordinate, Coordinate, Coordinate, Coordinate];
  readonly center: Coordinate;
  readonly rotation: number;
  readonly denominator: number;
  readonly resolution: number;
}
```

`footprint` 按打印纸面左上、右上、右下、左下顺序表示净地图框四角在 View 投影中的坐标。`actualExtent` 是该四边形的轴对齐外包范围。打印保留创建 plan 时的当前 View rotation；`extent` 在非零 rotation 下按四个角完整包含，不以轴对齐外包范围替代真实足迹。

### 4.2 fit

`scale.mode === 'fit'` 时，来源范围是约束真源：

- 完整来源足迹必须进入净地图框，不裁剪、不拉伸。
- 来源宽高比与净地图框不一致时，沿短边方向对称扩展实际地图范围，显示额外地图内容，不生成空白 letterbox。
- 最终 denominator 从扩展后的 resolution、输出中心局部投影比例和 96 CSS px/in 物理基准推导。
- `view` 与 `extent` 允许因宽高比发生对称扩展。
- `box` 的来源矩形由用户自由拖拽；PrintPlanner 与其他来源一样按净地图框宽高比对称扩展为实际范围。活动地图必须同时区分原始框选范围与扩展后的实际打印框，不能让纸张比例限制主拖拽框跟随指针。

### 4.3 fixed

`scale.mode === 'fixed'` 时，denominator 和净地图框是约束真源：

- `view` 使用当前 View 中心作为打印中心。
- `extent` 使用显式 extent 中心作为打印中心；来源 extent 只用于检查是否会被裁剪，不覆盖 denominator。
- `box` 的选框物理大小由 denominator 和净地图框反算；活动地图显示一个随指针移动的固定尺寸打印框，用户单击或完成主指针操作只确定中心，不把任意拖拽尺寸解释成第二个比例尺。
- `view` 或 `extent` 来源不能被实际范围完全包含时，validation 增加阻断 issue `fixed-scale-crops-source`。内置 UI 必须让用户返回调整比例尺、纸张或中心；headless 输出不得静默裁剪，除非未来以新的显式公共字段补充该契约。

denominator 必须是有限正数。固定比例尺只保证输出中心处的局部比例；对点分辨率随位置变化的投影，validation 增加说明 warning `scale-valid-at-center`，不能宣称整张纸每一点都保持相同比例。

### 4.4 view

`view` 来源读取当前 viewport 四角在 View 投影中的足迹，而不是只读取一个裸轴对齐 extent。Session 订阅 View center、resolution、rotation 和 size revision：

- 在最终 preview 之前发生变化时，使旧 plan 和 preview 失效并重新规划。
- 最终 preview 或 export 开始后冻结该操作的 View revision；中途 View 变化只使结果标记为 stale 并取消旧操作，不混合新旧范围。
- 不修改活动 View，也不要求调用方把 Earth 调整成纸张宽高比。

### 4.5 extent

`extent` 必须是四个有限数，满足 `minX < maxX`、`minY < maxY`。它表示 View 投影中的轴对齐来源矩形；PrintPlanner 根据当前 rotation 计算实际足迹。跨 wrap 世界的范围必须先规范为一个有限、明确的连续世界区间；不接受 Infinity 或用反序 min/max 隐式表达跨世界。

显式 extent 在完整 PrintSpec 提交并成功确认范围时绑定当前 View 的 projection code，该投影身份属于 resolved range 与后续 preview/export 的冻结输入。同一 projection code 下发生 center、resolution、rotation 或 size 变化时，Session 可以按现有 extent 数值重新规划；活动 View 的 projection code 一旦改变，旧 resolved range、plan、图例、preview 和输出能力立即失效并产生 `range-unresolved`，不得把同一组数值静默解释到新投影。调用方或内置 UI 必须在新投影下重新提交或明确确认 extent，再调用 `selectArea()` 建立新的冻结范围。

### 4.6 box

`box` 没有合法完成结果前，preview/export/print 均产生阻断 issue `range-unresolved`。选框规则固定为：

- 左侧活动地图的主选择范围显示一条蓝色边线和选框外遮罩，不显示 Transform 手柄、双线框或临时 Element；`fit` 需要扩展时，以次要虚线显示实际打印框，不能用次要框替代跟随指针的主选择框。
- 主选择框边线使用内置交互主题的单一蓝色强调线，扩展实际框使用同色次要虚线，选框外使用半透明中性遮罩；其 CSS 视觉尺寸由统一 print interaction token 管理，DPR 只改变 backing 像素。
- `fit` 下 pointerdown 到 pointerup 的主选择框保持任意宽高比并逐帧跟随指针；拖拽完成后 Planner 以该来源矩形为真源，对称扩展实际打印框，不裁剪、不拉伸来源范围。
- `fixed` 下选框尺寸由比例尺确定并随指针移动，单击或 pointerup 确认中心；靠近视口边缘时仍保持指针为中心，允许固定框的非交互部分超出当前可见视口；纸张、方向、边距、布局或 denominator 改变时围绕现有中心重算。
- `fixed` 框本身宽或高超过当前活动地图视口时阻断本次框选，并提示调整比例尺、纸张或地图缩放；这一上限不改变靠近边缘时保持指针中心的规则。
- `fit` 的已完成 box 在净地图框宽高比变化后保留原始来源矩形并重新规划扩展实际范围，不要求仅因纸张比例变化重新框选；fixed 仍按新物理参数围绕原中心重算。
- 屏幕矩形转换成四角 footprint 后保持当前 View rotation；不先取轴对齐 extent 再反推矩形。
- 一帧最多发布一次 pointermove 预览；pointerup 前冲刷最后一个待处理位置。
- pointerup 或 fixed 中心确认后，Session 必须立即发布最终范围 revision、取消旧预览并启动右侧 draft 预览刷新；迟到的旧预览不得覆盖新范围。

### 4.7 物理比例计算

页面和地图框先以毫米计算。设净地图框宽度为 `frameWidthMm`、输出 DPI 为 `dpi`：

```text
logicalWidthCssPx = frameWidthMm / 25.4 * 96
outputWidthPx = round(frameWidthMm / 25.4 * dpi)
renderPixelRatio = dpi / 96
```

固定比例尺 denominator 为 `N`，输出中心处“一 View 投影单位对应的米数”为：

```text
metersPerViewUnit = getPointResolution(projection, 1, center, 'm')
metersPerCssPixel = N * 0.0254 / 96
resolution = metersPerCssPixel / metersPerViewUnit
```

fit 模式反算：

```text
N = resolution * metersPerViewUnit * 96 / 0.0254
```

`metersPerViewUnit` 和所有中间结果必须是有限正数。无法获得有效局部比例时抛出 `CapabilityError`，不得退化成“一投影单位等于一米”。DPI 不出现在地理 extent 的物理宽度公式中；提高 DPI 只增加采样和文件尺寸。

图形比例尺与 `1∶N` 使用同一冻结 denominator 和中心局部比例。指北针通过中心点向地理北方向的短向量投影并叠加 View rotation 得到，不允许只用 `-rotation` 假设所有投影的网格北等于真北；当前投影无法计算真北时产生阻断 `north-direction-unavailable`。

## 5. 纸张与固定版式

### 5.1 页面网格

PrintPlanner 使用物理毫米建立单页页面网格，顺序固定为：

1. 纸张边距。
2. 页头元数据带。
3. 标题带，其中主标题和副标题各占稳定行，副标题为空时仍保留该行，避免范围因文字有无漂移。
4. 标题与地图间距；该间距必须扣除双线框外扩后仍留下可辨认空白。
5. 净地图框及其双线框。
6. 地图与页脚间距；该间距必须扣除双线框外扩后仍留下可辨认空白。
7. 页脚带。

边距以内剩余高度扣除上述固定带后全部分配给净地图框；净地图框宽度使用边距以内完整宽度。版式行高、最小地图框、字体、间距和双线框使用 builtin 的物理单位 token，并通过 `PrintCapabilities` 与视觉基线约束；它们不由 DPI、DPR、DOM 字体测量结果或内容长度临时改变。本文冻结区域关系和物理确定性，不把具体毫米数扩大为公共可配置字段。

### 5.2 固定成品布局

成品位置和层级固定为：

- 页头左侧显示 classification；右侧同一行以固定“日期：”和“签发人：”标签显示 date 与 issuer。二者使用紧凑的相邻固定槽位，日期右对齐、签发人左对齐，字段之间只保留稳定的小间距；任何一项为空时都不改变另一项位置。
- 主标题和副标题在标题带水平居中。文本只允许单行；溢出形成阻断 issue `layout-text-overflow`，不自动缩小到不可读字号、不换行改变地图框，也不裁切。
- 地图外框使用外粗内细双线，线宽和间距由固定 builtin 物理 token 给出。内细线内缘严格等于 mapFrame 边界，外粗线位于其外；双线框都绘制在净地图框边界外侧预留区，不覆盖地图内容。
- 图例默认锚定在地图内左下角，手动版式可选择左上、右上、左下或右下；还可调整列数、条目方向、宽度、内边距、背景和组间距，但不能把图例移动到地图外。
- 页脚左侧显示图形比例尺和 `1∶N`；右侧显示指北针。两者与地图双线框之间必须保留稳定的物理空白，不得压入地图框或占用标题带。
- 页面背景固定为不透明白色。地图透明区域以白色合成，PNG 不输出依赖查看器背景的透明纸张。

标题、元数据、图例和页脚使用内置可回退字体栈。最终渲染必须等待已声明字体就绪；超时按资源错误处理。DOM UI 只用 `textContent` 展示用户文字，不允许 innerHTML。PDF encoder 只接收已经完成版式合成的 PNG，因此不得重新排版这些内容。

### 5.3 纸张与像素预算

最终整页像素固定为：

```text
pageWidthPx = round(pageWidthMm / 25.4 * dpi)
pageHeightPx = round(pageHeightMm / 25.4 * dpi)
```

Canvas 单边和整页像素硬上限由 `PrintCapabilities.limits` 对外报告，并由当前平台验证证据确定。规范化后任一上限超出时同步抛出 `InvalidArgumentError`，消息必须包含纸张、DPI、预计像素和当前上限；不得先尝试分配 Canvas 再依赖浏览器崩溃。调整上限必须同步性能证据和兼容测试，不能因单台开发机可用而静默放宽。

## 6. 图例模型

### 6.1 公共类型

```ts
export type PrintLegendSpec = PrintAutoLegendSpec | PrintManualLegendSpec;

export interface PrintLegendResult {
  readonly groups: readonly PrintLegendGroup[];
  readonly items: readonly PrintLegendItem[];
  readonly sourceRevision: number;
  readonly warnings: readonly PrintWarning[];
}

export interface PrintAutoLegendSpec {
  readonly mode: 'auto';
  readonly showCounts?: boolean;
}

export interface PrintManualLegendSpec {
  readonly mode: 'manual';
  readonly groups: readonly PrintLegendGroup[];
  readonly items: readonly PrintLegendItem[];
  readonly layout?: PrintLegendLayoutSpec;
}

export interface PrintLegendLayoutSpec {
  readonly position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  readonly columns?: number;
  readonly direction?: 'row' | 'column';
  readonly maxWidthMm?: number;
  readonly paddingMm?: number | PrintPageInsets;
  readonly background?: string;
  readonly groupGapMm?: number;
  readonly itemGapMm?: number;
}

export interface PrintLegendGroup {
  readonly id: string;
  readonly title: string;
  readonly visible?: boolean;
  readonly order?: number;
}

export interface PrintLegendItem {
  readonly id: string;
  readonly groupId: string;
  readonly label: string;
  readonly symbol: PrintLegendSymbolSpec;
  readonly visible?: boolean;
  readonly order?: number;
  readonly count?: number;
  readonly sourceKey?: string;
}

export type PrintLegendSymbolSpec = PrintPointLegendSymbol | PrintLineLegendSymbol | PrintPolygonLegendSymbol | PrintIconLegendSymbol;
```

点、线、面符号使用结构化颜色、描边、填充、尺寸和虚线字段；图标使用显式 `src`、size、anchor 和 crossOrigin。它们是打印域纯数据，不包含 OL Style、StyleFunction、Feature、CanvasGradient 或 HTMLElement。所有 ID 在各自集合中唯一，groupId 必须存在，order 为有限数，输入数组不被修改。

### 6.2 自动图例

自动图例基于最终 PrintPlan，而不是活动地图当前屏幕截图。一个 Element 计入命中必须同时满足：

1. Element 业务 `visible` 为 true，所属 Layer 在打印 snapshot 中可见。
2. Layer 的 min/max resolution、extent 和其他公开可见性约束在最终 resolution 下允许渲染。
3. Element 的可信 RenderGeometry 与实际 footprint 相交；只命中轴对齐外包范围但真实几何不相交的目标不得计数。
4. 结构化 StyleSpec 在最终 resolution 和 rotation 下解析为可见符号。

自动条目先按最终 Layer 渲染顺序分组，默认组标题依次取公开 Layer title 和 layerId；组内按首次稳定渲染顺序排列。相同 Layer 内拥有相同语义符号指纹和相同默认标签的目标合并为一个条目，count 是上述命中 Element 数量。默认标签使用公开 Shape type 的内置中文显示名；外部系统需要业务分类时应在手动图例中改名，不从任意 `data.name`、私有 Feature 字段或 DOM 文本隐式推断。

内置 UI 保持 `showCounts: true`，因此第 3 屏展示完整命中 count；headless 调用方显式设置 `showCounts: false` 时仍按既有契约省略 count。为避免在纸张图例中重复呈现没有额外信息的单目标数量，内置纸张预览和最终成品仅在已有 count 不等于 1 时把数量附加到条目名称；`PrintLegendItem.count` 数据本身不因纸张展示规则改变，合并条目的数量继续输出。

语义符号指纹由规范化后的结构化图例符号纯数据生成，忽略对象身份和 OL 编译实例。分辨率相关 StyleSpec 必须先在最终 resolution 下解析。动画 overlay、target-opacity、target-geometry 和临时 presentation slot 不创建新的图例条目；自动图例表达业务基础符号，动画是否打印只影响地图展示帧。

下列来源不能被自动可靠归类：

- nativeStyle 或任意 OL StyleFunction。
- 输出依赖未纳入结构化 StyleSpec 的运行时闭包、CanvasGradient、Pattern 或外部 mutable 对象。
- 无法归一化为点、线、面或图标图例符号的组合样式。

这些目标按 Layer 聚合为“动态样式（无法自动解析）”占位项并保留命中 count，同时产生 warning `unknown-dynamic-style`。UI 第 3 屏必须列出受影响 Layer 和数量；最终清单要求用户确认或在第 4 屏替换/隐藏。不得静默跳过，也不得从 OL Style 反向恢复 StyleSpec。

### 6.3 手动图例与来源变化

进入第 4 屏时，Session 从当前自动图例建立来源键。来源键至少包含 layerId、规范 Layer generation、语义符号指纹和默认标签身份，不使用数组下标或 OL 对象地址。

用户覆盖以来源键关联，支持：

- 条目和组改名。
- 新建、删除、重组和排序。
- 组或条目显隐。
- 替换为自定义点、线、面或图标符号。
- 调整左上、右上、左下或右下位置，以及列数、条目排列方向、最大宽度、内边距、背景、组间距和条目间距。
- 新增没有自动来源的纯手动条目。

当范围、比例尺、图层、Element 或 Style revision 改变时，自动来源重新生成，然后按来源键重放覆盖：

1. 仍存在的来源保留所有覆盖，并更新 count。
2. 新来源按自动默认值加入并标记 `legend-source-added`。
3. 暂时消失的来源不从覆盖表删除，而进入 dormant 状态并标记 `legend-source-missing`；默认不输出，来源再次出现时恢复原覆盖。
4. 来源键相同但基础符号 revision 改变时，保留文字、分组、排序和显隐；如果用户没有自定义 symbol，则更新自动 symbol；如果已有自定义 symbol，则继续使用覆盖并标记 `legend-source-changed`。
5. 纯手动条目不随自动来源删除。

所有提示携带 sourceKey 和当前 session revision。用户确认只对该 revision 有效；来源再次变化后必须重新提示。headless `PrintArtifact.warnings` 保留同样信息。

图例默认位于地图左下，并可按手动版式锚定到地图内任一角，不能超出净地图框。单页放不下或所选锚点的最终边界越界时产生阻断 issue `legend-overflow`；本版不自动缩放文字、不分页、不移动到地图外。用户必须隐藏、重排、减少内容、调整位置或增大纸张。

## 7. 内置五屏 UI 与实时预览

### 7.1 共同规则

五屏由 DOM UI Adapter 提供，默认挂载到 Earth 的 UI root，也允许传入外部 target。左侧为当前步骤，右侧为完整纸张预览，默认宽度比例为 40% / 60%；桌面宽度下两区之间提供可拖拽、可键盘操作且带无障碍名称的分隔条。拖拽和键盘调整必须在输入区 `420px`、预览区 `360px` 的固定最小宽度处停止，不能继续压缩导致控件裁切；整个工作台宽度不超过 `800px` 时改为上下布局并停用横向拖拽，恢复桌面宽度时继续使用进入窄屏前的桌面分栏比例。适合窗口模式的纸张不使用固定最大宽度，必须在分栏、工作台或页面尺寸变化时依据预览区剩余宽高等比缩放；最终页 `100%` 模式仍保持真实输出像素与滚动查看语义。第 2 屏左侧切换为活动地图框选区域：顶部控制面板和底部操作区都横向铺满输入区，沿用其他步骤的平面表面，不使用悬浮卡片、阴影或额外圆角；顶部主体限制高度并独立滚动，底部操作区固定在分栏底边，两者之间的透明区域透传地图指针。右侧在桌面宽度下仍保留完整实时纸张预览。窄屏框选时隐藏纸张预览且不提供展开/收起操作，把顶部控制面板与底部操作区之间的剩余区域完整留给地图交互。前进、后退不销毁 PrintSession，已有草稿、box 和手动图例覆盖保持到其依赖失效。

UI 只编辑公共草稿、调用 PrintSession 并展示 validation，不读取内部 Store、OL Map、Layer、Canvas renderer 或 AnimationRuntime。所有文字输入用 textContent 展示，表单有可见 label、键盘焦点和错误说明；不能只靠颜色表达 warning、当前步骤或选中状态。五个页面的操作区固定在左侧面板底部，只有主体内容独立滚动；表单、提示、列表和按钮之间使用统一间距，不得互相挤压。手动图例在同一步内因文本、数值、下拉项、颜色或折叠操作重绘时，必须保持主体滚动位置，不能把用户送回列表顶部；切换到另一屏时则从该屏默认顶部开始。面向用户的标题、状态、warning 与 issue 主文案必须为中文，稳定英文 code 只可作为次要开发信息展示。

内置 UI 不允许选择 `extent`。以 `extent` initialSpec 打开界面，或通过公开的 dialog.session 在界面存续期间外部提交 `extent` 时，DOM UI Adapter 必须立即把该 Session 原子规范为 `view` 并给出中文提示，不能让界面显示当前视图而预览或输出仍使用 extent；需要保留显式坐标的调用方使用独立 headless Session。

### 7.2 第 1 屏：版式设置

必须提供：

- 密级（常用预设建议 + 自由手填）、主标题、副标题、日期和签发人。
- A4、A3、自定义纸张；横向、竖向。
- 统一或四边独立边距、DPI。
- `view`、`box` 范围来源；`extent` 仅保留给 headless API，内置 UI 不提供该选项或输入框。
- `fit` 或 `fixed`；fixed 时输入 `1∶N` 的 N。

页面实时显示净地图框毫米尺寸、预计输出像素、预计文件/内存级别和 validation。自定义纸张或 DPI 超出预算时不能进入下一屏。

### 7.3 第 2 屏：范围选择

- box-fit 模式激活第 4.6 节自由矩形选择，主框逐帧跟随指针，并在需要时以次要虚线显示扩展后的实际打印框；box-fixed 模式显示随指针移动的固定尺寸框并确认中心。
- view 模式显示当前 View 足迹及 fit/fixed 后实际足迹的只读对比，不创建可拖拽 Transform 手柄。
- 右侧完整纸张预览同时显示页头、标题、双线框、地图、图例占位和页脚，不只显示裁剪后的地图 Canvas。
- 左侧不显示“最终足迹”坐标串、窄屏成品预览或展开/收起成品预览操作；这些信息由右侧完整纸张预览和简明状态承担。
- 框选完成或 fixed 中心确认后立即显示“正在更新预览”状态，并以最终范围 revision 刷新右侧预览，不要求用户切换步骤或手动刷新。
- fixed 造成来源裁剪、投影比例只在中心准确或真北不可用时，预览和步骤导航同时展示对应 issue/warning。

### 7.4 第 3 屏：自动图例

必须展示：

- 按图层分组的自动条目、语义符号和最终范围命中 count。
- 合并后的条目数和被合并目标数量。
- 最终比例尺与图例可见性依据。
- unknown dynamic style 的 Layer、数量、占位符和可操作告警。
- “重新扫描”操作；它基于新 snapshot revision 重建来源，不读取上次截图像素反推样式。

### 7.5 第 4 屏：手动图例

必须提供改名、分组、排序、显隐、自定义点线面符号、图标和图例版式编辑。图例版式包含左上、右上、左下、右下位置下拉项；图例列表按分组折叠并保留组显隐语义；所有颜色字段同时提供颜色选择器和可编辑文本值，文本值继续承载 alpha 等原生颜色能力。自动来源变化后，界面分别显示新增、消失和改变来源；已保存覆盖按第 6.3 节重放，不能因为 count 或范围变化全部丢失。

图标编辑必须在选择时检查 URL/Blob 可加载性和 crossOrigin；预览成功不代表最终 Canvas 一定可读，最终导出仍执行 CORS readback 验证。

### 7.6 第 5 屏：最终预览与导出

最终屏固定包含：

- validation 检查清单：范围、比例尺、页面溢出、图例来源提示、资源就绪、CORS、像素预算、动画快照和浏览器打印限制。PDF capability 属于 headless API，不进入内置 UI 清单。
- 完整输出像素预览。缩放 100% 明确定义为一个输出 bitmap 像素对应一个 CSS 像素，超出容器时使用滚动和平移；“适合窗口”是另一个显示模式，不把二者混淆。
- PNG 导出。
- 内置 UI 不显示 PDF 按钮或 PDF 注入说明；外部系统仍可在 headless Session 注入 encoder 后调用 PDF 输出。
- 浏览器打印入口，以及“实际大小/100%、关闭浏览器页眉页脚、打印机可能不支持自定义纸张”的可见提示。

存在 blocking issue 时所有最终输出按钮禁用。非阻断 warning 必须在清单中确认；确认只作用于当前 revision。

### 7.7 实时预览一致性

实时预览使用 revision 和取消令牌：

1. spec、View、Layer、Element、Style、自动图例来源、手动覆盖或资源状态改变时递增 revision。
2. 旧 revision 的规划、tile/image/font 等待和页面合成全部取消。
3. 旧 Promise 即使迟到完成也不得写回 UI、previewResult 或 validation。
4. 高频 box pointermove 每个浏览器帧最多发布一次 draft preview；重型地图渲染可以合并中间 revision，但 pointerup 必须冲刷最终范围。
5. draft preview 与 final preview 共用 PrintPlan、地图 snapshot、图例和页面绘制代码，只允许 backing DPI 和缓存策略不同。
6. 最终 PNG/PDF/print 默认复用第 5 屏已经完成的 final preview snapshot；revision 未变时不得在导出瞬间悄悄换成另一动画帧或另一组瓦片。

## 8. 打印展示快照与内容边界

### 8.1 图层快照

Services 通过纯数据 PrintSnapshotPort 冻结：

- Layer 顺序、可见性、opacity、extent、min/max resolution 和公开渲染属性。
- Element generation、geometry revision、style revision、Layer 归属和业务可见性。
- 当前 View projection、center、rotation、world 信息和 snapshot revision。
- 当前图例来源所需的结构化样式与 RenderGeometry。

`ShapeDefinition.presentation.viewDependent === true` 的 Element 必须从冻结的 ElementState 与结构化 Style 真源，使用同一 PrintPlan 的 `center`、`resolution` 和 `rotation` 重新执行一次确定性 presentation。普通基础展示、自动图例命中和动画 `current-frame` 都复用该打印帧语义；不得克隆活动 View 已投影的 Feature 作为结果，也不得读取只服务活动地图的 Callout companion label layer。打印副本应把 presentation 产生的框体、尾巴与显式 label 作为一个 Session 所有的完整展示冻结下来，且不能把派生结果写回 Store 或活动 Feature。本条只补充内部 Adapter 契约，不新增公共 Shape 或打印 API。

OpenLayers Adapter 为该 snapshot 创建 Session 所有的隐藏 Map 和打印 Layer 投影，使用公开 OL API 在隔离 target 中渲染。它不得修改、搬移或重设活动 Map、活动 Layer 和活动 View。库创建的 LayerSpec 必须提供可打印投影；Source 可以只读共享，但打印 Layer、renderer、listener 和 target 由 Session 独占。

用户传入的原生 Layer 默认仍是 external ownership。只有 Adapter 能通过公开 API 为标准具体 `LayerGroup`、`VectorLayer`、`TileLayer` 或 `ImageLayer` 建立等价打印投影，或调用方通过 `PrintCreateOptions.printableLayerFactory` 为已经注册到 Earth 的 native Layer 提供显式隔离副本时才参与打印；自定义 Layer 子类必须走 factory。否则产生阻断 `layer-not-printable`，不得把同一个 Layer 从活动 Map 临时移走，也不得静默忽略。`PrintPrintableLayerFactory` 必须同步返回以标准具体 Layer/Group 为根的 `PrintPrintableLayerOutput` 或 `undefined`，不得返回活动 Layer 本身、其子树、自定义 Layer 子类、循环树或共享子树。Adapter 必须先把 factory output 的 Layer 状态、Vector Feature、动态 Style、RenderGeometry 和字体样本复制并冻结到 Session 内部 snapshot clone，再把内部 clone 挂载到隐藏 Map；factory output 本身不得直接挂载。

factory/native Vector 的 OL Style 冻结只接受能用公开 API 深复制的标准 Circle、RegularShape、Fill、Stroke 和 Text 数据。任意 OpenLayers Icon（全局 image cache 会共享 img/src）、自定义 ImageStyle、CanvasGradient 或任意 CanvasPattern 都产生阻断 `layer-not-printable`，不得把共享对象直接带进 snapshot。Earth 管理图层中由结构化 StyleSpec 编译的 `IconSymbolSpec`（含 color）与 `PatternFillSpec` 仍按规范支持；这类数据从结构化真源重新生成，不依赖 native Style 反向冻结。

打印 Map 不安装 Controls、Interactions、ContextMenu、Overlay 或业务输入监听。图层 opacity、顺序、可见范围、wrap 和背景必须与 snapshot 一致；世界副本由 Adapter 使用公开投影信息处理。

### 8.2 动画

默认 `content.animations: 'current-frame'`。Session 在 final preview 建立时从 Earth 统一 AnimationManager 获取一个纯数据展示快照：

- 所有目标使用同一个冻结 Clock 时间和同一个合成 revision。
- 展示快照包括当前 effective target geometry、target opacity 和可见 overlay slot，遵循动画补充设计的确定性合成顺序。
- 获取快照不 pause/resume、不推进或重置 elapsed、不建立新 Runtime、不改变 Handle status，也不请求独立 RAF、timer 或逐 Element render listener。
- 打印快照必须复制为 Session 所有的有限纯数据，不能持有可在下一动画帧被原地更新的 Runtime buffer。
- hidden、pause-and-suppress 或当前不参与展示的动画不打印；retained final frame 按当前展示语义打印。
- final preview 完成后，同一 revision 的 PNG/PDF/print 复用该冻结帧，不随活动地图动画继续变化。

`content.animations: 'base'` 只打印规范 Element 的结构化基础展示，忽略全部动画 modifier 和 overlay，并产生信息 warning `animations-excluded`。自动图例无论哪种模式都只表达业务基础符号，不为动画生成条目。

### 8.3 Overlay 与临时视觉

DOM Overlay、Descriptor 的 DOM 部分、ContextMenu、Tooltip、Controls、选择框、编辑锚点、Draw/Edit/Transform/Measure 临时 DOM 和内置打印 UI 均不进入地图输出。原因是它们不属于 ElementStore，且任意 DOM 栅格化会引入布局、字体、跨域、脚本和所有权不确定性。

Descriptor 的连接线若是普通可见 Element，则按 Element 规则打印；其 DOM 卡片不打印。Measure 的持久或临时线面 Element 只有在 snapshot 中属于可见 Element 时打印，DOM 标签不打印。首版 `domOverlays` 和 `controls` 只接受 `'exclude'`；未来若需要结构化可打印 Overlay，必须设计纯数据 OverlayPrintSpec，不能从 HTMLElement 反向截图。

box 的主选择线、扩展实际框和外遮罩只属于第 2 屏交互，不进入右侧成品预览或最终输出。

### 8.4 资源就绪与 CORS

最终输出必须等待 snapshot 中实际可见的瓦片、图片、图标和字体达到就绪或明确失败状态。等待使用一个 Session 级 timeout 和 AbortSignal，不为每个资源建立不可控 timer。

- preview 可以在资源加载中展示带状态的草稿，但 final preview/export/print 在 strict 资源检查通过前阻断。
- Canvas 可读性必须在最终合成后执行真实 readback/toBlob 验证；仅检查 URL 或响应头不算 CORS 成功。
- 跨域瓦片、图标或图片没有正确 CORS 时抛出 `PrintError` code `cors-tainted-canvas`，并携带公开 layerId、资源类型和已清除凭据/查询敏感信息的来源标识。
- 资源加载失败为 `resource-load-failed`，超时为 `resource-timeout`。不得输出看似成功但缺块的最终文件。
- engine 不自动添加代理、不重写 URL、不注入 token。文档和示例只使用符合仓库地图源规则的配置。

## 9. PNG、PDF 与浏览器打印边界

### 9.1 PNG

PNG 是首版内置且始终可用的规范输出：

- 单页、不透明白色、`image/png` Blob。
- 像素尺寸严格等于纸张毫米和目标 DPI 计算结果。
- 页面全部内容已栅格合成，外部查看器不需要字体、StyleSpec、OL 或 DOM。
- PNG 文件本身不能强制物理打印尺寸；PrintArtifact 同时返回 pageWidthMm、pageHeightMm、DPI 和 denominator 对应的 PrintPlan，文档说明导入其他软件时必须使用实际大小。

### 9.2 可选 PDF

PDF 通过 `PrintPdfEncoder` 注入，不属于 engine 普通运行依赖。encoder 的首版契约是把完整单页 PNG 以精确 pageWidthMm/pageHeightMm 嵌入单页 PDF：

- 不允许 encoder 重新布局标题、图例或地图，也不重新采样范围。
- encoder 接收 AbortSignal，Session 取消或 Earth.destroy 后必须停止；迟到结果不得发布。
- encoder 不存在时 `capabilities.pdf` 为 false；headless 请求 PDF 抛出 `CapabilityError`。
- encoder 抛错、返回非 PDF Blob 或产生空文件时，包装为 `PrintError` code `pdf-encode-failed` 并保留 cause。
- PDF 的字体可搜索性、矢量地图和 GeoPDF 不在首版范围；首版 PDF 是精确纸张上的栅格页面。

### 9.3 浏览器打印

`session.export({ format: 'browser-print' })` 只能在显式用户操作或浏览器允许的上下文中调用。DOM Adapter 创建隔离 iframe/窗口，写入：

- 单张 final PNG 页面。
- `@page { size: <widthMm>mm <heightMm>mm; margin: 0; }`。
- 页面和图片的精确毫米宽高、白色背景，以及不额外生成浏览器内容的最小 DOM。

调用 `window.print()` 前等待图片 decode 和打印文档 ready。弹窗或打印能力被浏览器阻止时抛出 `print-window-blocked`。iframe 在 `afterprint`、取消、Session.destroy 或安全超时后清理；用户关闭对话框不等于已成功出纸，`BrowserPrintResult.dialogOpened` 只表示对话框已被接受。

浏览器、系统和打印机可能忽略自定义 @page、加入硬件不可打印边距或执行“适合页面”。UI 和网站必须提示选择实际大小/100%、关闭浏览器页眉页脚，并核对打印机纸张。库不能把该限制描述成固定比例尺打印的成功保证。

## 10. 架构分层

### 10.1 Core

Core 只承载或复用与 OL/DOM 无关的纯数据和纯计算：

- PrintSpec 规范化后的内部值对象。
- PrintPlan、页面毫米网格、范围 footprint、fixed/fit 算法、比例尺公式和像素预算。
- 图例分组、来源键、覆盖重放和 validation 数据结构。
- PrintSnapshot、AnimationPresentationSnapshot 和各 Adapter port 的纯数据协议。

Core 不保存 PrintSession，不访问 ElementStore 的可变实现，不创建 Canvas/Blob/Map/Layer，也不把 PrintPlan 写入 ElementState、Snapshot 或事务。

### 10.2 Services

内部 PrintService 和公共 PrintSession controller 负责：

- Session 状态机、revision、原子 update、取消和事件顺序。
- 通过 View/Projection port 生成 plan。
- 通过 LayerManager、ElementStore 只读快照和 StyleService 建立打印展示快照。
- 自动图例、手动覆盖、warning 和最终检查清单。
- 协调 box 子会话、动画展示快照、隐藏 Map renderer、页面 renderer、PNG/PDF/print 输出。
- 保证所有异步操作属于一个 revision，并在异常路径回滚和清理。

Services 不查询 OL DOM，不创建 OL Interaction，不从 OL Style/Feature 反向恢复业务参数，也不直接操作 HTMLElement。

### 10.3 OpenLayers Adapter

OpenLayers Adapter 只负责：

- 当前 View 四角、投影 point resolution、真北方向、world 信息和像素/坐标转换。
- box 指针输入、屏幕矩形到 View footprint 转换、主选择线、扩展实际框与外遮罩展示。
- 为打印 snapshot 建立、更新和销毁隐藏 Map 与 printable Layer 投影。
- 使用 OL 公开 API 等待图层渲染、生成地图 bitmap，并按冻结动画展示快照绘制 presentation/overlay。
- 保持图层顺序、opacity、resolution 可见性、rotation、wrap 和 Canvas pixel ratio。

Adapter 不决定标题、页头页脚、纸张、图例业务分组、Session 状态、fixed/fit 规则或 warning 确认。它不得修改业务 Store、历史、活动 Map、活动 Layer 或动画 Runtime。

### 10.4 DOM UI 与页面渲染 Adapter

DOM UI Adapter 负责五屏组件、表单、可访问性、mount/unmount、纸张预览容器、浏览器打印文档和临时 object URL。页面渲染 Adapter 按 PrintPlan 把地图 bitmap、固定版式、图例、比例尺和指北针合成为页面 bitmap。

DOM Adapter 不推导地图范围、比例尺、真北、图例命中或 Element 可见性。页面 renderer 只消费冻结纯数据，不读取活动 DOM 的 computed style 截图，也不用 innerHTML 解释用户文本。

### 10.5 Builtins 与 Public Facade

纸张 preset、固定版式物理常量、默认字体、默认图例样式、图形比例尺和指北针定义位于 builtins。PrintFacade 只暴露本文批准的方法和类型，内部物理目录不等于 package 子路径；不增加 `./print` 深层导出。

## 11. InteractionCoordinator

PrintSession 本身不是长期指针会话；只有 box 模式下 `selectArea()` 创建的 PrintBoxSelectionSession 进入 InteractionCoordinator。它与 Draw、Edit、Transform、Measure 使用同一 replace/reject 规则：

1. 申请新 box 会话。
2. `replace` 时当前指针会话先收到 cancel，回滚临时工作态并幂等释放资源。
3. 当前会话清理完成后，box 才获取 CursorPort、输入路由和临时遮罩。
4. `reject` 时抛出 `InteractionConflictError`，PrintSession 保持原 spec 和 preview。

box 使用 `crosshair` 表示范围框选，不改变 Draw 规格中 `pointer` 的既有语义。它通过 CursorPort 持有独占光标句柄，结束后恢复交互期间最新外部光标，不硬编码 `auto`。

box 子会话状态至少为 `ready`、`active`、`ending`：

- pointerdown 进入 active；pointermove 按 RAF 合并并更新主选择框、可选扩展实际框和遮罩；pointerup 冲刷最终采样并完成。
- Esc 取消当前 box，移除范围但保留父 PrintSession；父 Session 回到 draft，并产生 `range-unresolved`。
- 另一个交互替换 box、View target 失效、父 Session cancel/destroy、Earth.destroy 或打开失败时都走同一 ending 清理。
- 临时选框、遮罩、Tooltip 和输入监听不进入 ElementStore、业务 Source、Snapshot 或打印成品。
- 选框 Adapter 只发出冻结的像素语义请求，Services 负责固定/适配范围和宽高比规则。

## 12. 生命周期、所有权与并发

### 12.1 Earth 销毁顺序补充

总纲第 15 节的 Earth.destroy 顺序补充为：

1. 取消并回滚活动交互会话，包括 PrintBoxSelectionSession。
2. 取消并销毁活动 PrintSession、所有预览/导出/打印任务、隐藏 Map 和 DOM UI。
3. 停止 AnimationManager。
4. 移除 InputRouter、EventService 和 ContextMenu 监听。
5. 销毁 Overlay 和 Descriptor。
6. 清理 ElementStore 与 LayerManager。
7. 解除并销毁活动 OL Map。
8. 从 useEarth 注册表注销相同引用。

PrintSession 必须在 AnimationManager、LayerManager 和活动 Map 之前销毁，因为其冻结快照和隐藏打印投影依赖这些服务；取消后不得再请求 render 或回调 DOM。

### 12.2 资源所有权

- PrintService 创建的隐藏 Map、打印 Layer、临时 target、Canvas、ImageBitmap、AbortController、listener、timer、object URL 和 iframe 全部由 Session 清理。
- 共享 Source、用户原生 Layer、用户 UI target、用户 PDF encoder 和用户 Blob 属于 external ownership；Session 只解绑或停止调用，不主动 dispose。
- `PrintPrintableLayerOutput` 的原始 Layer 不由引擎直接 dispose。返回 `ownership: 'external'` 时调用方自行清理；若 Tile/Image Source 被内部 clone 只读共享，调用方必须让它在整个 snapshot 生命周期保持稳定。返回 `ownership: 'session'` 时必须提供 `destroy()`，且只有这种 factory output 由 Session 在完成、失败、取消、替换或销毁路径幂等释放。两种 output 都不直接挂载隐藏 Map，Session 内部 snapshot clone 始终由 Session 清理。
- 页面 renderer 和 PDF encoder 的迟到异步结果用 generation token 丢弃；即使底层 Promise 不支持取消，也不能重新挂载 UI、恢复监听或发布 artifact。
- Session.destroy、replace、Earth.destroy 和异常回滚可以重复进入同一 cleanup，结果必须幂等。

### 12.3 状态与并发

任何 planning、previewing、exporting 或 printing 状态失败后，如果 Session 和 spec 仍有效，状态回到 draft 或 ready，并保留最后一个已成功 preview；失败结果不得覆盖成功缓存。box 选择期间不启动 final render。export 或 print 期间 spec 变化先取消输出，再接受新 revision。

多 Earth 的 PrintFacade、隐藏 Map、DOM root、animation snapshot、projection、resource tracker、PDF encoder 和 destroy 必须隔离；一个 Earth 的 box replace、CORS 失败或销毁不得取消另一个 Earth 的 Session。

## 13. Validation、warning 与错误模型

### 13.1 Validation

```ts
export interface PrintValidationReport {
  readonly revision: number;
  readonly issues: readonly PrintValidationIssue[];
  readonly warnings: readonly PrintWarning[];
  readonly canPreview: boolean;
  readonly canExport: boolean;
}

export interface PrintValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
}

export interface PrintWarning {
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
  readonly requiresAcknowledgement: boolean;
}
```

blocking issue 至少包括：`range-unresolved`、`fixed-scale-crops-source`、`north-direction-unavailable`、`layout-text-overflow`、`legend-overflow`、`layer-not-printable`、`resource-not-ready` 和 `pixel-budget-exceeded`。warning 至少包括：`scale-valid-at-center`、`unknown-dynamic-style`、`legend-source-added`、`legend-source-missing`、`legend-source-changed`、`animations-excluded` 和 `printer-scaling-not-guaranteed`。

UI 文案可以本地化，但 code 和语义是稳定公共契约。确认 warning 不删除它，只把当前 revision 的 `requiresAcknowledgement` 视为已满足；PrintArtifact 仍携带 warning。

### 13.2 同步错误

- spec、纸张、范围、比例尺、图例结构或对象形状非法：`InvalidArgumentError`。
- 当前投影不能提供有效 point resolution/真北、缺少 PDF encoder、DOM UI/print port 不可用或 Layer 不具备打印能力：`CapabilityError`。
- PrintSession 或 box 与现有会话在 reject 策略下冲突：`InteractionConflictError`。
- 已销毁 Earth、Facade 或 Session 的非幂等操作：`ObjectDisposedError`。
- 不支持的 nativeStyle 结构化反向解析或未来未知输出操作：`UnsupportedOperationError`。

同步校验必须在修改旧 Session、box、preview 和资源前完成。批量图层快照任一 required Layer 不可打印时，整个 final 操作失败，不部分跳过。

### 13.3 异步 PrintError

```ts
export type PrintErrorCode =
  | 'cancelled'
  | 'resource-timeout'
  | 'resource-load-failed'
  | 'cors-tainted-canvas'
  | 'render-failed'
  | 'png-encode-failed'
  | 'pdf-encode-failed'
  | 'print-window-blocked';

export class PrintError extends Error {
  readonly code: PrintErrorCode;
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}
```

用户 cancel、session replace、revision 取代或 Earth.destroy 使进行中的异步方法拒绝为 `cancelled`；幂等 cancel/destroy 自身不抛错。错误 details 不包含 token、凭据、完整敏感 URL、OL 私有对象或 DOM 节点。运行期错误发出一次 error 事件并拒绝对应 Promise，不得既 resolve 空 Blob 又记录 console warning。

## 14. 性能与资源预算

- 一个 PrintSession 最多一个隐藏 Map、一个当前页面合成 surface 和一个活动异步 operation。
- box pointermove 每帧最多一次范围更新，复用同一选框和遮罩，不重建 Layer、Canvas 或 DOM tree。
- 实时 draft preview 合并高频 revision；固定 revision 不重复生成自动图例、打印 Layer 投影或静态页面文字。
- final render 可以分块准备图层，但合成后仍必须是单个冻结 snapshot；不能用不同时间的局部截图拼接。
- 自动图例只遍历最终可见 Layer 的候选 Element，使用空间索引筛选实际 footprint；不得每次文字输入都全量扫描整个 ElementStore。
- DPI 提升不增加 OL 逻辑 CSS 尺寸，只提高 renderPixelRatio；StyleCompiler 和动画 presentation 按固定 snapshot 缓存，不能因每个 backing pixel 重建 Style。
- 连续 50 次 create/open—preview—cancel 后，PrintSession、hidden Map、print Layer、Canvas、iframe、object URL、listener、timer 和 Interaction 数量恢复基线。
- Earth.destroy 后所有上述资源计数为 0，不再产生 preview、render 或 DOM 回调。

## 15. 实施分解

批准后按以下阶段实施，每阶段保持类型检查、测试和构建通过，并设置独立审查点。

### 阶段 0：OpenLayers 与浏览器验证 Spike

- 验证不修改活动 Map 的隐藏 Map 打印投影，覆盖 Vector、Tile、Image、Layer opacity、rotation、world wrap 和共享 Source。
- 验证公开 API 下的资源就绪、rendercomplete、Canvas pixel ratio、CORS readback 和最终 toBlob。
- 验证动画纯数据展示快照能在相同时间重现 replacement、overlay 和 opacity，且不改变 Runtime elapsed/Handle。
- 验证 browser print iframe 的自定义 @page、afterprint 和清理；记录 Chromium 的边界，不把结果扩大为打印机保证。
- 验证 A3 300 DPI、A4 600 DPI 和 64M 像素边界的内存行为。

隐藏 Map、动画快照或 Canvas 合成的关键假设失败时，先修订本文并重新评审，不允许退化为临时修改活动 View、查询私有 renderer、逐 Layer 隐式截图或静默降低 DPI。

### 阶段 1：Core 与公共契约

- 建立 PrintSpec、PrintPlan、fixed/fit、纸张网格、比例尺、真北请求、像素预算和 validation。
- 建立 PrintFacade、PrintSession 状态机、revision/cancel、结果、事件和错误类型。
- 更新 Earth、EngineContext、根导出、公共 API manifest 和 consumer 类型快照。

### 阶段 2：打印快照与 OpenLayers Adapter

- 建立 PrintSnapshotPort、printable Layer 投影、隐藏 Map、地图 bitmap 和资源 tracker。
- 接入 View footprint、point resolution、box 子会话、rotation/world wrap 和真北。
- 接入 AnimationPresentationSnapshot，并固定 Overlay/Controls 排除边界。

### 阶段 3：图例与页面合成

- 实现最终范围/比例尺可见性、Layer 分组、符号指纹、合并和 count。
- 实现未知动态样式占位与 warning、手动覆盖和来源变化重放。
- 实现固定双线框、页头、标题、图例、图形比例尺、`1∶N`、指北针和溢出检查。

### 阶段 4：五屏 UI 与实时预览

- 实现五屏、完整纸张预览、box 左右布局、检查清单和 100% 预览。
- 覆盖 revision 取消、键盘/屏幕阅读器、浅色/深色主题和窄屏。
- 保证 UI 与 headless 复用同一 Session、Planner、LegendBuilder 和 PageRenderer。

### 阶段 5：PNG、可选 PDF 与浏览器打印

- 完成规范 PNG、PrintArtifact、PDF encoder port 和 browser print iframe。
- 完成 CORS、资源超时、弹窗阻止、encoder 失败与全生命周期清理。
- 保持 package 零普通运行依赖，PDF fixture 只属于测试或可选消费方。

### 阶段 6：公共切换与代码门槛

- 完成 Core、OL 集成、浏览器 UI、视觉、资源泄漏、API 快照、tarball 和真实消费者测试。
- 运行总纲规定的 `npm run verify:code` 或等价门槛。
- 冻结 Print 公共 API 后再进入 website 文档步骤。

### 阶段 7：website、TypeDoc 与示例

- 按第 17 节建立唯一规范归属页、行为族页面和同源可运行示例。
- 从源码 JSDoc 生成 TypeDoc，不手工编辑 `website/public/api`。
- 运行 `npm run docs:build` 和完整 `npm run verify`。

## 16. 自动化测试矩阵

测试至少覆盖：

1. PrintSpec 严格对象、默认值、未知字段、非法原型、输入不变性和稳定错误。
2. A4、A3、自定义纸张、横竖向、统一/四边边距、固定页面带、双线框、最小地图框和像素预算。
3. 96 CSS px/in、不同 DPI 的 backing 尺寸、固定比例尺公式、fit 反算、中心 point resolution 和 DPI 不改变地理范围。
4. view 四角 footprint、rotation、extent 宽高比扩展、box-fit 任意来源矩形与实际范围扩展、box-fixed 随指针定位、纸张变化重规划和 fixed 裁剪阻断。
5. EPSG:3857 赤道/高纬度、自定义投影、真北、跨世界和无 point resolution/真北能力的错误。
6. 自动图例仅命中最终范围和比例尺可见目标，按 Layer 分组、同符号合并、count、稳定顺序和动画不产生条目。
7. nativeStyle、StyleFunction 和未知动态样式占位/warning；不从 OL Style 反向恢复业务字段。
8. 手动改名、分组、排序、显隐、点线面/图标、版式、来源新增/消失/改变、dormant 恢复和 revision 确认失效。
9. 标题与地图间距、四角图例位置及溢出、紧凑页头元数据、地图与页脚间距、比例尺、`1∶N`、指北针和完整页面像素 golden。
10. PrintSession update 原子性、状态、事件、重复 generateLegend/preview/export、revision 取消、replace/reject、listener 异常隔离和幂等 destroy。
11. PrintBoxSelectionSession 与 Draw/Edit/Transform/Measure 的 replace/reject，光标恢复、最后采样冲刷、Esc、外部替换、打开失败和临时视觉不入 Store。
12. 隐藏 Map 不修改活动 Map/View/Layer/Source，图层顺序、opacity、resolution 可见性、rotation、world wrap 和 printable native Layer 能力。
13. 动画 current-frame 使用同一时间、replacement/overlay/opacity 合成、retained/hidden/pause，且不改变 elapsed、Handle、Runtime 或 Store；base 模式产生 warning。
14. DOM Overlay、Controls、ContextMenu、Tooltip 和 box 遮罩不进入输出，Descriptor 连接线 Element 的正常打印边界。
15. 瓦片、图标、字体就绪、timeout、load failure、CORS taint、敏感 URL 清理和无残缺成功文件。
16. PNG MIME、毫米/DPI 像素尺寸、不透明背景和 artifact metadata。
17. PDF capability、encoder 输入毫米、AbortSignal、非 PDF Blob、异常包装和零 engine 运行依赖。
18. browser print @page、图片 decode、用户手势/弹窗阻止、afterprint/timeout 和 iframe 清理。
19. 五屏流程、默认 40% / 60% 可拖拽分栏、五屏固定底部操作区、中文提示、简化范围页、分组折叠与颜色选择器、检查清单、100%/适合窗口区别、blocking 禁用、warning 确认、浅色/深色/窄屏和无障碍名称。
20. 多 Earth 的 Session、projection、hidden Map、DOM root、animation snapshot、resource tracker 和 destroy 隔离。
21. 连续 50 次创建/预览/取消及 Earth.destroy 后无 Map、Layer、Canvas、object URL、iframe、listener、timer、Interaction 或注册表泄漏。
22. 根导出、公共 API 快照、strict consumer、npm pack、零普通依赖和预置 OL 后的真实浏览器消费。

浏览器视觉基线至少覆盖 A4 横向 view-fit、A3 纵向 box-fixed、box 范围页全宽平面控制区与底部操作区、内置 UI 自定义纸张 view-fit、自动图例动态样式告警、手动多组图例和最终 100% 页面。像素差异测试必须锁定 Chromium、字体、DPR、地图源 fixture 和动画时间，不依赖公网瓦片。

## 17. website 文档与可运行示例

PrintFacade 只有一个规范归属页，记录 Earth 入口、PrintFacade、PrintSession、PrintSpec、PrintPlan、结果、validation、错误和生命周期。大型行为按以下页面或同等层级拆分：

1. 打印总览与五屏 UI。
2. view/box/extent、fixed/fit、比例尺、投影与 DPI。
3. A4/A3/自定义纸张、固定版式、标题、页眉页脚、比例尺和指北针。
4. 自动图例、手动图例、动态样式和来源变化。
5. PNG、可选 PDF、浏览器打印、CORS、资源和生命周期。

至少提供以下同源可运行示例：

- `earth.print.open()` 完成 view-fit 五屏流程。
- box-fit 展示自由主选择框、扩展实际框、外遮罩、完成即更新预览和取消清理；box-fixed 展示随指针移动的固定尺寸框。
- `earth.print.create()` 的可运行流程覆盖 headless view/box 与 PNG；另提供 headless extent-fit + 自定义纸张的集成代码，明确 extent 不进入内置 UI。
- 自动图例切换手动覆盖，并演示来源变化保留覆盖。
- 可选 PDF encoder capability 和浏览器打印限制；示例不得在页面加载时自动打开打印对话框。

每个核心方法必须在规范归属页的运行示例中至少调用一次。示例必须展示 Session.destroy 和 Earth.destroy，运行组件与展示源码引用同一 Vue 文件，使用稳定 `example-*` 锚点和正确 API 页内链接。地图源统一通过 `createConfiguredLayer` 和 `map-sources.json`，不得包含 token、账号或内网地址。

文档必须明确：

- extent 使用当前 View 投影，DPI 不改变地理范围，fixed 只保证中心局部比例。
- PNG/PDF/浏览器打印的能力差异，PDF encoder 可选且不是普通依赖。
- 浏览器/打印机可能缩放或忽略自定义纸张，用户需要选择实际大小并关闭浏览器页眉页脚。
- DOM Overlay/Controls 不打印，动画 current-frame 是冻结帧，自动图例只表达基础符号。
- 瓦片、图标和字体的 CORS 要求，以及 engine 不提供代理绕过。
- 未知动态样式、不可打印 Layer 和图例溢出的解决方式。

页面在浅色、深色和窄屏下检查；纸张成品自身保持白底黑字，不随 website 深色主题改变输出配色。TypeDoc 从源码 JSDoc 生成，不手工编辑生成页面。

## 18. 完成定义

只有同时满足以下条件，地图打印能力才算完成：

- Earth 根门面提供唯一 PrintFacade，内置五屏 UI 与 headless API 使用同一 PrintSession 和 PrintPlan。
- view、box、extent 与 fixed、fit 的范围、比例尺、rotation、投影和 DPI 契约全部落地。
- A4、A3、自定义纸张和固定整饰版式与本文一致，双线框、页头、标题、地图内四角图例、页脚比例尺和指北针无第二套实现。
- 自动图例按最终范围和比例尺过滤、按 Layer 分组、合并、计数并告警动态样式；手动覆盖在来源变化后可追踪地保留。
- 实时预览、final preview、PNG、可选 PDF 和浏览器打印共享一个冻结 snapshot revision；最终输出不混合业务 revision 或动画时刻。
- 打印不写 ElementState、不改变活动 View/Layer/Source/Feature、不修改动画 elapsed 或 Handle，不依赖 OL 私有 API。
- box 通过 InteractionCoordinator 仲裁，所有完成、取消、替换、异常和 Earth.destroy 路径恢复光标并清理遮罩。
- DOM Overlay/Controls、CORS、资源等待、PDF optional capability 和打印机缩放边界具有明确 UI、错误、测试和文档证据。
- 多 Earth 隔离、反复创建销毁、像素预算和所有资源泄漏门槛通过。
- 根导出、公共 API manifest、strict consumer、零普通依赖、TypeDoc、website、同源示例和迁移说明同步。
- 代码阶段和用户文档阶段分别通过总纲规定的验证门槛。
