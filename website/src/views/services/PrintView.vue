<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import CodeBlock from '../../components/docs/CodeBlock.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import PrintDemo from '../../examples/services/PrintDemo.vue';
import printSource from '../../examples/services/PrintDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const printSnippet = extractExampleSnippet(printSource, 'print-workflows');

const printableLayerFactoryCode = `import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import type { PrintPrintableLayerFactory } from '@vrsim/earth-engine-ol';

earth.layers.add({
  kind: 'native',
  id: 'business-native',
  layer: businessNativeLayer,
  ownership: 'external'
});

// applicationFeatureStore.query() 必须返回覆盖目标范围的完整业务快照，不能只复制当前地图缓存。
const printableLayerFactory: PrintPrintableLayerFactory = ({ layerId, plan }) => {
  if (layerId !== 'business-native') return undefined;

  const style = new Style({
    image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#1677ff' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }),
    fill: new Fill({ color: 'rgba(22, 119, 255, 0.2)' }),
    stroke: new Stroke({ color: '#1677ff', width: 2 })
  });
  const source = new VectorSource({
    features: applicationFeatureStore.query(plan.range.actualExtent).map((feature) => {
      const clone = feature.clone();
      clone.setStyle(style);
      return clone;
    })
  });
  const layer = new VectorLayer({ source });
  let destroyed = false;

  return {
    layer,
    ownership: 'session',
    destroy() {
      if (destroyed) return;
      destroyed = true;
      layer.setSource(null);
      source.clear(true);
    }
  };
};

const session = earth.print.create({
  initialSpec,
  printableLayerFactory
});`;

const anchors = [
  { id: 'overview', label: '职责与适用边界' },
  { id: 'example-print-workflows', label: '五屏 UI 与 headless 输出' },
  { id: 'five-screens', label: '内置五屏流程' },
  { id: 'range-and-scale', label: '范围与比例尺' },
  { id: 'page-layout', label: '纸张、版式与图例' },
  { id: 'output-boundaries', label: 'PNG、PDF 与浏览器打印' },
  { id: 'native-layer-printing', label: '原生 Layer 打印工厂' },
  { id: 'lifecycle', label: 'Validation 与生命周期' },
  { id: 'method-reference', label: '门面与会话方法' },
  { id: 'api', label: '完整 API' }
];

const rangeColumns = [
  { prop: 'source', label: '范围来源', width: 150 },
  { prop: 'fit', label: 'fit', width: 340 },
  { prop: 'fixed', label: 'fixed', width: 420 }
];

const rangeRows = [
  {
    source: 'view（视图范围）',
    fit: '完整容纳当前 View 足迹，按纸面宽高比对称扩展',
    fixed: '以当前 View 中心和 denominator 反算范围；不能完整容纳来源时阻断输出'
  },
  { source: 'box（框选）', fit: '从按净地图框宽高比锁定的框选范围生成计划', fixed: '比例尺决定选框大小，指针只决定中心；纸张或比例尺改变后围绕中心重算' },
  { source: 'extent（指定范围）', fit: '完整容纳显式 extent，必要时对称扩展', fixed: '以 extent 中心为中心；来源只用于检查是否裁剪，不覆盖 denominator' }
];

const outputColumns = [
  { prop: 'format', label: '输出', width: 150 },
  { prop: 'capability', label: '能力条件', width: 280 },
  { prop: 'boundary', label: '结果与边界', width: 520 }
];

const outputRows = [
  { format: 'PNG', capability: 'capabilities.png 恒为 true', boundary: '库内置生成不透明白底的整页位图；Blob 归调用方所有，Session 不替调用方回收' },
  { format: 'PDF', capability: '需要 PrintPdfEncoder', boundary: '库只把已经排版完成的 PNG 交给 encoder；能力不可用时明确禁用，绝不伪装成功或退化为 PNG' },
  {
    format: 'browser-print',
    capability: '需要 DOM print port 与用户手势',
    boundary: '返回值只表示系统打印对话框是否打开，不表示已经打印，也不保证打印机按自定义纸张或 100% 比例输出'
  }
];

const factoryColumns = [
  { prop: 'contract', label: '契约', width: 300, linkTypes: true },
  { prop: 'shape', label: '关键字段', width: 400, linkTypes: true },
  { prop: 'boundary', label: '边界与所有权', width: 560 }
];

const factoryRows = [
  {
    contract: 'PrintCreateOptions.printableLayerFactory',
    shape: 'PrintPrintableLayerFactory',
    boundary: '仅为已经注册到 Earth、但 Adapter 无法自动隔离投影的 native Layer 建立打印副本；同步返回 undefined 会保留 layer-not-printable 阻断项'
  },
  {
    contract: 'PrintPrintableLayerContext',
    shape: 'sourceLayer、subject、layerId?、plan',
    boundary: 'plan 是当前 revision 的冻结计划；sourceLayer 是活动 Map 资源，只能读取，不能直接返回、搬移或修改'
  },
  {
    contract: 'PrintPrintableLayerOutput',
    shape: '标准具体 layer、ownership、destroy?',
    boundary:
      'factory 输出只作为内部 snapshot clone/freeze 的输入，不直接挂载隐藏 Map；external 输出不由引擎 dispose，session 必须提供幂等 destroy()；内部 clone 始终由 snapshot 清理'
  }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 220, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 390, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 250, linkTypes: true },
  { prop: 'desc', label: '说明', width: 430 }
];

const facadeRows = [
  {
    anchor: 'api-facade-create',
    href: '#api-type-print-facade-method-create',
    name: 'create',
    params: 'options?: PrintCreateOptions',
    returns: 'PrintSession',
    desc: '创建不带内置 UI 的 headless 会话；支持 initialSpec、冲突策略、PDF encoder 与 printableLayerFactory'
  },
  {
    anchor: 'api-facade-open',
    href: '#api-type-print-facade-method-open',
    name: 'open',
    params: 'options?: PrintDialogOptions',
    returns: 'PrintDialogHandle',
    desc: '由用户操作打开内置五屏 UI；UI port 不可用时抛出 CapabilityError'
  }
];

const sessionRows = [
  {
    anchor: 'api-session-update',
    href: '#api-type-print-session-method-update',
    name: 'update',
    params: 'spec: PrintSpec',
    returns: 'void',
    desc: '同步、原子提交一份完整 spec；校验失败时保留旧 revision'
  },
  {
    anchor: 'api-session-select-area',
    href: '#api-type-print-session-method-select-area',
    name: 'selectArea',
    params: '—',
    returns: 'Promise<Readonly<PrintResolvedRange>>',
    desc: '解析 view/extent，或进入受交互协调器管理的 box 子会话；extent 同时绑定当前 projection code'
  },
  {
    anchor: 'api-session-generate-legend',
    href: '#api-type-print-session-method-generate-legend',
    name: 'generateLegend',
    params: '—',
    returns: 'Promise<PrintLegendResult>',
    desc: '按最终范围生成自动图例，或重放手动图例'
  },
  {
    anchor: 'api-session-preview',
    href: '#api-type-print-session-method-preview',
    name: 'preview',
    params: 'options?: PrintPreviewOptions',
    returns: 'Promise<PrintPreviewResult>',
    desc: '生成 draft/final 整页预览；两种质量共享范围与版式算法'
  },
  {
    anchor: 'api-session-export',
    href: '#api-type-print-session-method-export',
    name: 'export',
    params: 'options: PrintExportOptions',
    returns: 'Promise<PrintExportResult>',
    desc: '输出 PNG、可选 PDF 或发起浏览器打印；不会隐式销毁会话'
  },
  {
    anchor: 'api-session-cancel',
    href: '#api-type-print-session-method-cancel',
    name: 'cancel',
    params: '—',
    returns: 'void',
    desc: '幂等取消当前会话并释放短期资源'
  },
  {
    anchor: 'api-session-destroy',
    href: '#api-type-print-session-method-destroy',
    name: 'destroy',
    params: '—',
    returns: 'void',
    desc: '幂等销毁会话、框选、隐藏 Map、Canvas、URL 与监听'
  },
  {
    anchor: 'api-session-on',
    href: '#api-type-print-session-method-on',
    name: 'on',
    params: 'type, listener',
    returns: '() => void',
    desc: '订阅状态、spec、范围、预览、校验、输出、取消或错误事件'
  }
];

const dialogRows = [
  {
    anchor: 'api-dialog-focus',
    href: '#api-type-print-dialog-handle-method-focus',
    name: 'focus',
    params: '—',
    returns: 'void',
    desc: '把键盘焦点移回仍打开的内置对话框'
  },
  {
    anchor: 'api-dialog-close',
    href: '#api-type-print-dialog-handle-method-close',
    name: 'close',
    params: '—',
    returns: 'void',
    desc: '关闭 UI 并取消其 Session'
  },
  {
    anchor: 'api-dialog-destroy',
    href: '#api-type-print-dialog-handle-method-destroy',
    name: 'destroy',
    params: '—',
    returns: 'void',
    desc: '幂等释放 UI 和 Session，但不删除调用方提供的 target'
  }
];

const relatedTypes = [
  'PrintFacade',
  'PrintCapabilities',
  'PrintCapabilityLimits',
  'PrintSessionConflictPolicy',
  'PrintCreateOptions',
  'PrintPrintableLayerContext',
  'PrintPrintableLayerFactory',
  'PrintPrintableLayerOutput',
  'PrintDialogOptions',
  'PrintDialogHandle',
  'PrintSession',
  'PrintSessionStatus',
  'PrintSessionEventType',
  'PrintSessionEventMap',
  'PrintSessionEventListener',
  'PrintSpec',
  'PrintExtent',
  'PrintFootprint',
  'PrintRangeSpec',
  'PrintRangeSource',
  'PrintScaleSpec',
  'PrintPaperSize',
  'PrintPaperSpec',
  'PrintPageInsets',
  'PrintLayoutSpec',
  'PrintContentSpec',
  'PrintResourceSpec',
  'PrintPlan',
  'PrintPageRect',
  'PrintResolvedRange',
  'PrintPreviewOptions',
  'PrintPreviewResult',
  'PrintExportOptions',
  'PrintExportResult',
  'PrintArtifact',
  'PrintPdfEncoder',
  'PrintPdfEncodeInput',
  'BrowserPrintResult',
  'PrintLegendSpec',
  'PrintLegendResult',
  'PrintAutoLegendSpec',
  'PrintManualLegendSpec',
  'PrintLegendGroup',
  'PrintLegendItem',
  'PrintLegendFillSpec',
  'PrintLegendStrokeSpec',
  'PrintLegendSymbolSpec',
  'PrintPointLegendSymbol',
  'PrintLineLegendSymbol',
  'PrintPolygonLegendSymbol',
  'PrintIconLegendSymbol',
  'PrintLegendLayoutSpec',
  'PrintValidationReport',
  'PrintValidationIssue',
  'PrintWarning',
  'PrintErrorCode',
  'PrintErrorOptions',
  'PrintError'
] as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图服务</span>
        <h1>地图打印（Print）</h1>
        <p>Print 把当前 Earth 的范围、纸张、比例尺、图例和固定版式冻结成可验证的打印计划，并以同一 PrintSession 同时服务内置五屏 UI 与 headless 集成。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">职责与适用边界</h2>
        <p>
          这项能力属于工具库，因为范围解析、投影局部比例、图层冻结快照、动画帧、自动图例和资源清理都依赖 Earth
          内部一致性。外部系统仍负责业务模板编排、权限、归档、审签和远程打印服务；不要让引擎读取业务 DOM 再猜测这些规则。
        </p>
        <el-alert type="info" :closable="false" show-icon title="两种入口，共用一个状态真源">
          <ApiReference kind="method" to="#api-facade-open">earth.print.open()</ApiReference> 提供内置五屏 UI；
          <ApiReference kind="method" to="#api-facade-create">earth.print.create()</ApiReference> 提供 headless Session。两者使用相同的
          PrintSpec、PrintPlan、validation 和输出实现。
        </el-alert>
      </section>

      <section id="example-print-workflows" class="doc-prose">
        <ExampleBlock title="五屏 UI、框选固定比例尺与 headless 输出" :source="printSource" :snippet="printSnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              示例不会在挂载时自动打开对话框或导出文件。点击后会真实调用 earth.print.open/create、Session 的范围、图例、预览和 export API；当前环境没有 PDF
              encoder 或浏览器打印 port 时，按钮保持禁用并直接说明原因，不模拟成功结果。
            </p>
            <p>
              示例地图使用 Earth 管理的 VectorLayer，因此不需要额外工厂；外部系统接入无法自动投影的 native Layer 时，应按下文配置
              <code>printableLayerFactory</code>，不能只复制当前视图缓存。
            </p>
          </template>
          <template #preview><PrintDemo /></template>
        </ExampleBlock>
      </section>

      <section id="five-screens" class="doc-prose">
        <h2 class="doc-h2">内置五屏流程</h2>
        <el-steps direction="vertical" :active="5" finish-status="success">
          <el-step
            title="1. 版式设置"
            description="从常用建议选择或自由手填密级，再填写日期、签发人、主副标题，选择纸张、方向、边距、DPI、范围来源和 fit/fixed。"
          />
          <el-step title="2. 范围选择" description="box 模式在活动地图上框选；view/extent 显示只读范围对照。右侧始终保留完整纸张预览。" />
          <el-step title="3. 自动图例" description="按最终 PrintPlan 汇总可见 Element，展示分组、计数及动态样式无法自动解析的 warning。" />
          <el-step title="4. 手动图例" description="保留自动结果后改名、分组、排序、显隐和符号；来源变化以 added/missing/changed warning 明示。" />
          <el-step
            title="5. 最终预览与导出"
            description="集中展示阻断项与 warning，在适应窗口和 100% 查看之间切换，并按 capabilities 启用 PNG、PDF 和浏览器打印。"
          />
        </el-steps>
      </section>

      <section id="range-and-scale" class="doc-prose">
        <h2 class="doc-h2">范围与比例尺</h2>
        <ApiTable :columns="rangeColumns" :rows="rangeRows" />
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="固定比例尺是中心局部比例">
          extent 和框选坐标使用当前 View 投影。固定比例尺只保证输出中心附近的局部比例；DPI
          只改变位图采样密度，不改变地理范围。无法获得有效局部比例或真北方向时会阻断，而不是假定“一投影单位等于一米”。
        </el-alert>
        <el-alert class="doc-prose__alert" type="info" :closable="false" show-icon title="显式 extent 绑定 projection code">
          extent 在完整 spec 提交并确认范围时绑定当前 View projection。同一 projection code 下的 View 变化可以重新规划；projection code
          改变后，旧范围、图例、预览和输出全部以 <code>range-unresolved</code> 阻断失效，调用方必须在新投影下重新提交或明确确认并再次调用
          <code>selectArea()</code>。引擎不会把同一组数值静默重解释到新投影。
        </el-alert>
      </section>

      <section id="page-layout" class="doc-prose">
        <h2 class="doc-h2">纸张、固定版式与图例</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="纸张">内置 A4、A3，也接受 widthMm × heightMm 自定义纸张；方向、四边边距和 DPI 都写入 PrintSpec。</el-descriptions-item>
          <el-descriptions-item label="页眉"
            >左侧 classification 支持常用密级建议与自由手填；右侧固定“日期：”与“签发人：”两个槽位，任一空值都不改变另一项位置。</el-descriptions-item
          >
          <el-descriptions-item label="标题">主标题与副标题居中、各占固定单行；溢出是阻断问题，不偷偷缩小、换行或裁切。</el-descriptions-item>
          <el-descriptions-item label="地图框"
            >页面为不透明白底，地图采用固定外粗内细双线框：内细线的内缘严格等于 mapFrame
            边界，外粗线位于其外，因此两条线都不覆盖地图内容；临时交互、控件、Tooltip、ContextMenu 和 DOM Overlay 默认排除。</el-descriptions-item
          >
          <el-descriptions-item label="图例"
            >图例固定在地图内左下。自动图例只转换最终范围内可无损表达的结构化 StyleSpec；纹理、雪碧裁剪、染色或纯文字等无法归一化的样式按 Layer
            聚合为占位项并要求确认，不会伪造近似符号。手动图例可改分组、顺序、显隐和符号，但不改变固定锚点。</el-descriptions-item
          >
          <el-descriptions-item label="页脚">左侧图形比例尺与 1∶N，右侧指北针；两者使用同一冻结 plan，不侵入地图框。</el-descriptions-item>
        </el-descriptions>
      </section>

      <section id="output-boundaries" class="doc-prose">
        <h2 class="doc-h2">PNG、PDF 与浏览器打印</h2>
        <ApiTable :columns="outputColumns" :rows="outputRows" />
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="浏览器打印不是制图输出承诺">
          浏览器和打印机驱动仍可能缩放页面。内置 UI 会提醒用户选择“实际大小 / 100%”并关闭浏览器页眉页脚；需要可审计的物理尺寸时，优先输出 PNG 或由受控 encoder
          生成 PDF。
        </el-alert>
      </section>

      <section id="native-layer-printing" class="doc-prose">
        <h2 class="doc-h2">原生 Layer 的打印工厂</h2>
        <p>
          标准具体 TileLayer、ImageLayer（含 ImageWMS）和 Earth 管理的 VectorLayer 可通过公开 OpenLayers API 建立隔离打印投影；自定义 Layer
          子类即使继承这些类型也必须走 factory。外部/native VectorSource 无法证明自定义 loader 已完整覆盖目标范围，即使当前已有部分 Feature 也会保留
          <code>layer-not-printable</code> 阻断；无法识别的 Layer 也不会被静默忽略。
        </p>
        <ApiTable :columns="factoryColumns" :rows="factoryRows" />
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="先注册，再提供隔离副本">
          factory 只处理通过 <code>earth.layers.add({ kind: 'native', ... })</code> 注册的 Layer。直接塞进活动 Map、未进入 Engine Layer registry 的 Layer
          仍会阻断；factory 也不得返回活动 Layer 本身或其任一子 Layer。
        </el-alert>
        <p>
          factory 必须把自定义来源转换为标准具体 LayerGroup、VectorLayer、TileLayer 或 ImageLayer。引擎会在挂载隐藏 Map 前立即投影并冻结成内部 snapshot
          clone；下例的 Vector Feature 与动态 Style 因而冻结在当前 revision。原始 output Layer 不会被引擎直接 dispose；若返回
          <code>ownership: 'external'</code> 且 Tile/Image Source 被内部 clone 只读共享，调用方须让它在整个 snapshot 生命周期保持稳定并自行清理。返回
          <code>ownership: 'session'</code> 时必须提供 <code>destroy()</code>，Session 会在完成、失败、取消、替换或销毁路径幂等调用。
        </p>
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="native Vector 样式必须可以隔离冻结">
          factory/native Vector 的任意 OpenLayers Icon、自定义 ImageStyle、CanvasGradient 或 CanvasPattern 都会以 <code>layer-not-printable</code>
          阻断，因为 OpenLayers 全局 image cache 或 Canvas 对象会共享不可冻结的 img/src 状态。Earth 管理图层中由结构化 StyleSpec 生成的 IconSymbolSpec（含
          color）与 PatternFillSpec 不走这条 native 反向冻结路径，仍完整支持。
        </el-alert>
        <CodeBlock :code="printableLayerFactoryCode" lang="ts" />
      </section>

      <section id="lifecycle" class="doc-prose">
        <h2 class="doc-h2">Validation、资源与生命周期</h2>
        <p>最终渲染会冻结 Layer、Element、动画当前帧和资源 revision。跨域图片、瓦片、图标或字体失败会产生明确错误；不会返回空 Blob，也不会静默漏图。</p>
        <el-alert class="doc-prose__alert" type="info" :closable="false" show-icon title="Warning 确认语义">
          内置 UI 会要求用户针对当前 revision 勾选确认，revision 变化后必须重新确认。headless 调用方显式调用 export() 即表示确认当前 warning；产物仍完整保留
          warning，便于归档和审计。
        </el-alert>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="阻断 issue"
            >range-unresolved、fixed-scale-crops-source、north-direction-unavailable、layout-text-overflow、legend-overflow、layer-not-printable、resource-not-ready、pixel-budget-exceeded。</el-descriptions-item
          >
          <el-descriptions-item label="Warning"
            >scale-valid-at-center、unknown-dynamic-style、legend-source-added/missing/changed、animations-excluded、printer-scaling-not-guaranteed。</el-descriptions-item
          >
          <el-descriptions-item label="异步 PrintError"
            >cancelled、resource-timeout、resource-load-failed、cors-tainted-canvas、render-failed、png-encode-failed、pdf-encode-failed、print-window-blocked；失败
            Promise 不会 resolve 空 Blob。</el-descriptions-item
          >
          <el-descriptions-item label="Session 所有权"
            >每个 Earth 同时只有一个活动 PrintSession。默认 replace 会先取消旧会话；需要保护旧会话时使用 reject。</el-descriptions-item
          >
          <el-descriptions-item label="Blob 所有权">preview/export 返回的 Blob 归调用方；调用方创建的 object URL 也由调用方 revoke。</el-descriptions-item>
          <el-descriptions-item label="factory 所有权"
            >factory output 不直接挂载隐藏 Map。external 输出不由引擎 dispose；只有 ownership 为 session 的输出会由 Session 调用其 destroy()；内部 snapshot
            clone 始终由 Session 清理。两种情况都不能复用活动 Map 的 Layer。</el-descriptions-item
          >
          <el-descriptions-item label="target 所有权"
            >PrintDialogHandle 只删除自己创建的后代节点，不删除 target、不清空调用方内容，也不清理调用方监听。</el-descriptions-item
          >
          <el-descriptions-item label="显式清理"
            >完成全部输出后调用 session.destroy() 或 dialog.destroy()；Earth.destroy() 仍是最终兜底，并会取消未完成任务。</el-descriptions-item
          >
        </el-descriptions>
      </section>

      <section id="method-reference" class="doc-prose">
        <h2 class="doc-h2">门面、会话与对话框方法</h2>
        <h3 class="doc-h3">PrintFacade</h3>
        <ApiTable :columns="methodColumns" :rows="facadeRows" />
        <h3 class="doc-h3">PrintSession</h3>
        <ApiTable :columns="methodColumns" :rows="sessionRows" />
        <h3 class="doc-h3">PrintDialogHandle</h3>
        <ApiTable :columns="methodColumns" :rows="dialogRows" />
      </section>

      <PublicApiSection
        :type-names="relatedTypes"
        title="Print 完整 API"
        description="这里集中列出 PrintFacade、五屏句柄、headless Session、范围与纸张、图例、计划、结果、capabilities、validation 和错误类型。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="地图打印（Print）" :items="anchors" /></aside>
  </div>
</template>
