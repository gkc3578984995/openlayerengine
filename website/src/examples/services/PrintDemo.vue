<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth, PrintArtifact, PrintCapabilities, PrintDialogHandle, PrintSession, PrintSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-services-print';
const ELEMENT_LAYER_ID = 'print-demo-elements';
const DEFAULT_DENOMINATOR = 100_000;

type Scenario = 'view-fit' | 'box-fixed' | 'extent-fit';

const mapTarget = ref<HTMLDivElement | null>(null);
const dialogTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const dialogRef = shallowRef<PrintDialogHandle | null>(null);
const sessionRef = shallowRef<PrintSession | null>(null);
const printCapabilities = shallowRef<Readonly<PrintCapabilities> | null>(null);
const scenario = ref<Scenario>('extent-fit');
const denominator = ref(DEFAULT_DENOMINATOR);
const sessionStatus = ref('未创建');
const validationSummary = ref('创建 Session 后显示');
const operationResult = ref('等待用户操作；示例不会自动打开对话框或导出');
const outputUrl = ref<string | null>(null);
const outputName = ref<string | null>(null);
const outputSize = ref('—');
const busy = ref(false);
const manualLegendApplied = ref(false);
const resolvedRange = ref(false);
const legendReady = ref(false);

let eventDisposers: Array<() => void> = [];

const scenarioOptions = [
  { label: '视图范围 · fit', value: 'view-fit' },
  { label: '框选 · 固定比例尺', value: 'box-fixed' },
  { label: '指定范围 · 自定义纸张', value: 'extent-fit' }
];

const uiUnavailableReason = computed(() => {
  if (printCapabilities.value === null) return 'Earth 尚未就绪';
  return printCapabilities.value.ui ? '' : '当前环境没有 DOM UI port，无法打开内置五屏对话框';
});

const pdfUnavailableReason = computed(() => {
  if (printCapabilities.value === null) return 'Earth 尚未就绪';
  return printCapabilities.value.pdf ? '' : '当前 Session 未配置 PrintPdfEncoder，PDF 不可用';
});

const browserPrintUnavailableReason = computed(() => {
  if (printCapabilities.value === null) return 'Earth 尚未就绪';
  return printCapabilities.value.browserPrint ? '' : '当前环境没有隔离浏览器打印 port';
});

const sessionAvailable = computed(() => sessionRef.value !== null && !['cancelled', 'destroyed'].includes(sessionStatus.value));
const artifactReady = computed(() => outputUrl.value !== null && outputName.value !== null);

const createLayout = (): PrintSpec['layout'] => ({
  classification: '内部资料',
  title: '城市公共设施分布图',
  subtitle: '打印能力集成样例',
  date: '2026-07-23',
  issuer: '城市运行中心'
});

const createCommonContent = (): NonNullable<PrintSpec['content']> => ({
  animations: 'current-frame',
  domOverlays: 'exclude',
  controls: 'exclude'
});

const createViewFitSpec = (): PrintSpec => ({
  range: { source: { mode: 'view' }, scale: { mode: 'fit' } },
  paper: { size: 'A4', orientation: 'landscape', marginMm: 12, dpi: 150 },
  layout: createLayout(),
  legend: { mode: 'auto', showCounts: true },
  content: createCommonContent()
});

const createBoxFixedSpec = (): PrintSpec => ({
  range: { source: { mode: 'box' }, scale: { mode: 'fixed', denominator: denominator.value } },
  paper: { size: 'A3', orientation: 'portrait', marginMm: { top: 12, right: 12, bottom: 14, left: 12 }, dpi: 150 },
  layout: createLayout(),
  legend: { mode: 'auto', showCounts: true },
  content: createCommonContent()
});

const createExtentFitSpec = (earth: Earth): PrintSpec => {
  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  const extent = [center[0] - 52_000, center[1] - 34_000, center[0] + 52_000, center[1] + 34_000] as const;
  return {
    range: { source: { mode: 'extent', extent }, scale: { mode: 'fit' } },
    paper: { size: { widthMm: 320, heightMm: 180 }, orientation: 'landscape', marginMm: 10, dpi: 150 },
    layout: createLayout(),
    legend: { mode: 'auto', showCounts: true },
    content: createCommonContent(),
    resources: { timeoutMs: 12_000 }
  };
};

const createScenarioSpec = (earth: Earth): PrintSpec => {
  if (scenario.value === 'view-fit') return createViewFitSpec();
  if (scenario.value === 'box-fixed') return createBoxFixedSpec();
  return createExtentFitSpec(earth);
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const releaseOutputUrl = () => {
  if (outputUrl.value !== null) URL.revokeObjectURL(outputUrl.value);
  outputUrl.value = null;
  outputName.value = null;
  outputSize.value = '—';
};

const exposeArtifact = (artifact: PrintArtifact) => {
  releaseOutputUrl();
  outputUrl.value = URL.createObjectURL(artifact.blob);
  outputName.value = `print-demo.${artifact.format}`;
  outputSize.value = `${artifact.widthPx} × ${artifact.heightPx} px`;
};

const refreshSessionState = () => {
  const session = sessionRef.value;
  if (session === null) {
    sessionStatus.value = '未创建';
    validationSummary.value = '创建 Session 后显示';
    return;
  }
  sessionStatus.value = session.status;
  const report = session.validation;
  resolvedRange.value = session.plan !== undefined;
  legendReady.value = session.legendResult !== undefined;
  manualLegendApplied.value = session.spec?.legend?.mode === 'manual';
  validationSummary.value = `${report.issues.length} 个阻断项，${report.warnings.length} 个 warning；${report.canExport ? '允许输出' : '暂不可输出'}`;
};

const bindSession = (session: PrintSession) => {
  for (const dispose of eventDisposers.splice(0)) dispose();
  sessionRef.value = session;
  eventDisposers = [
    session.on('statuschange', refreshSessionState),
    session.on('specchange', refreshSessionState),
    session.on('rangechange', refreshSessionState),
    session.on('previewchange', refreshSessionState),
    session.on('validationchange', refreshSessionState),
    session.on('export', refreshSessionState),
    session.on('cancel', refreshSessionState),
    session.on('error', refreshSessionState)
  ];
  manualLegendApplied.value = session.spec?.legend?.mode === 'manual';
  resolvedRange.value = session.plan !== undefined;
  legendReady.value = session.legendResult !== undefined;
  refreshSessionState();
};

const destroyPrintState = () => {
  for (const dispose of eventDisposers.splice(0)) dispose();
  const dialog = dialogRef.value;
  const session = sessionRef.value;
  dialogRef.value = null;
  sessionRef.value = null;
  if (dialog !== null) dialog.destroy();
  else session?.destroy();
  manualLegendApplied.value = false;
  resolvedRange.value = false;
  legendReady.value = false;
  refreshSessionState();
};

const runOperation = async (label: string, operation: () => void | Promise<void>) => {
  if (busy.value) return;
  busy.value = true;
  operationResult.value = `${label}进行中…`;
  try {
    await operation();
    refreshSessionState();
  } catch (error) {
    operationResult.value = `${label}失败：${errorMessage(error)}`;
    refreshSessionState();
  } finally {
    busy.value = false;
  }
};

// #region print-workflows
const openFiveScreen = () =>
  runOperation('打开五屏 UI', () => {
    const earth = earthRef.value;
    const target = dialogTarget.value;
    if (earth === null || target === null) throw new Error('Earth 或 UI target 尚未就绪');
    if (!earth.print.capabilities.ui) throw new Error(uiUnavailableReason.value);
    destroyPrintState();
    const dialog = earth.print.open({
      target,
      initialSpec: createViewFitSpec(),
      sessionConflictPolicy: 'replace',
      interactionConflictPolicy: 'replace'
    });
    dialogRef.value = dialog;
    bindSession(dialog.session);
    operationResult.value = '已真实调用 earth.print.open()；请在下方五屏 UI 中继续';
  });

const createHeadless = () =>
  runOperation('创建 headless Session', () => {
    const earth = earthRef.value;
    if (earth === null) throw new Error('Earth 尚未就绪');
    destroyPrintState();
    const session = earth.print.create({
      initialSpec: createScenarioSpec(earth),
      sessionConflictPolicy: 'replace',
      interactionConflictPolicy: 'replace'
    });
    bindSession(session);
    operationResult.value = `已真实调用 earth.print.create()：${scenarioOptions.find((item) => item.value === scenario.value)?.label}`;
  });

const updateSession = () =>
  runOperation('更新完整 spec', () => {
    const earth = earthRef.value;
    const session = sessionRef.value;
    if (earth === null || session === null) throw new Error('请先创建 headless Session');
    session.update(createScenarioSpec(earth));
    manualLegendApplied.value = false;
    resolvedRange.value = false;
    legendReady.value = false;
    releaseOutputUrl();
    operationResult.value = 'session.update() 已原子提交当前场景的完整 PrintSpec';
  });

const selectArea = () =>
  runOperation('解析打印范围', async () => {
    const session = sessionRef.value;
    if (session === null) throw new Error('请先创建 Session');
    const range = await session.selectArea();
    resolvedRange.value = true;
    operationResult.value =
      range.sourceMode === 'box'
        ? `框选完成，实际比例尺 1∶${Math.round(range.denominator).toLocaleString('zh-CN')}`
        : `${range.sourceMode} 范围已冻结，实际比例尺 1∶${Math.round(range.denominator).toLocaleString('zh-CN')}`;
  });

const generateLegend = () =>
  runOperation('生成自动图例', async () => {
    const session = sessionRef.value;
    if (session === null) throw new Error('请先创建 Session');
    const legend = await session.generateLegend();
    legendReady.value = true;
    operationResult.value = `自动图例已生成：${legend.groups.length} 组、${legend.items.length} 项、${legend.warnings.length} 个 warning`;
  });

const retainAsManualLegend = () =>
  runOperation('转为手动图例', () => {
    const session = sessionRef.value;
    const current = session?.spec;
    const generated = session?.legendResult;
    if (session === null || current === undefined || generated === undefined) throw new Error('请先生成自动图例');
    const manualLegend: PrintSpec['legend'] = {
      mode: 'manual',
      groups: generated.groups.map((group) => ({ ...group })),
      items: generated.items.map((item, index) => ({ ...item, label: index === 0 ? `${item.label}（人工确认）` : item.label }))
    };
    session.update({ ...current, legend: manualLegend });
    manualLegendApplied.value = true;
    operationResult.value = '已保留自动图例结果并转成 manual；首项改名会随后续预览继续保留';
  });

const createPreview = () =>
  runOperation('生成最终预览', async () => {
    const session = sessionRef.value;
    if (session === null) throw new Error('请先创建 Session');
    const result = await session.preview({ quality: 'final' });
    releaseOutputUrl();
    outputUrl.value = URL.createObjectURL(result.blob);
    outputName.value = 'print-preview.png';
    outputSize.value = `${result.widthPx} × ${result.heightPx} px`;
    operationResult.value = `preview() 返回真实 Blob，revision ${result.revision}`;
  });

const exportPng = () =>
  runOperation('导出 PNG', async () => {
    const session = sessionRef.value;
    if (session === null) throw new Error('请先创建 Session');
    const result = await session.export({ format: 'png' });
    if (!('blob' in result) || result.format !== 'png') throw new Error('PNG 输出返回了不匹配的结果');
    exposeArtifact(result);
    operationResult.value = `PNG 已真实生成：${result.widthPx} × ${result.heightPx} px，${result.warnings.length} 个 warning`;
  });

const exportPdf = () =>
  runOperation('导出 PDF', async () => {
    const earth = earthRef.value;
    const session = sessionRef.value;
    if (earth === null || session === null) throw new Error('请先创建 Session');
    if (!earth.print.capabilities.pdf) throw new Error(pdfUnavailableReason.value);
    const result = await session.export({ format: 'pdf' });
    if (!('blob' in result) || result.format !== 'pdf') throw new Error('PDF 输出返回了不匹配的结果');
    exposeArtifact(result);
    operationResult.value = `PDF encoder 已返回真实 application/pdf Blob，${result.warnings.length} 个 warning`;
  });

const openBrowserPrint = () =>
  runOperation('打开浏览器打印', async () => {
    const earth = earthRef.value;
    const session = sessionRef.value;
    if (earth === null || session === null) throw new Error('请先创建 Session');
    if (!earth.print.capabilities.browserPrint) throw new Error(browserPrintUnavailableReason.value);
    const result = await session.export({ format: 'browser-print', documentTitle: '城市公共设施分布图' });
    if (!('dialogOpened' in result)) throw new Error('浏览器打印返回了不匹配的结果');
    operationResult.value = result.dialogOpened
      ? '浏览器打印对话框已打开；这不代表打印完成，也不保证打印机采用 100% 比例'
      : '浏览器未能打开打印对话框；没有伪造成功状态';
  });

const cancelSession = () => {
  sessionRef.value?.cancel();
  refreshSessionState();
  operationResult.value = '已调用 session.cancel()；进行中的选择、预览或输出均被取消';
};

const focusDialog = () => {
  dialogRef.value?.focus();
  operationResult.value = '已调用 dialog.focus()';
};

const closeDialog = () => {
  dialogRef.value?.close();
  refreshSessionState();
  operationResult.value = '已调用 dialog.close()；UI 已关闭且其 Session 已取消';
};

const destroySession = () => {
  destroyPrintState();
  releaseOutputUrl();
  operationResult.value = '已调用 destroy() 幂等释放 Print UI、Session 与示例 object URL';
};
// #endregion print-workflows

const addPrintElements = (earth: Earth) => {
  const layer = earth.layers.add({ kind: 'vector', id: ELEMENT_LAYER_ID, zIndex: 20, declutter: true });
  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  const points = [
    { id: 'print-hospital', label: '医院', offset: [-24_000, 11_000] as const, color: '#f56c6c' },
    { id: 'print-school', label: '学校', offset: [18_000, 14_000] as const, color: '#409eff' },
    { id: 'print-station', label: '交通站点', offset: [8_000, -17_000] as const, color: '#67c23a' }
  ];
  for (const point of points) {
    earth.elements.add({
      id: point.id,
      module: 'print-demo',
      layerId: layer.id,
      geometry: { type: 'point', controlPoints: [[center[0] + point.offset[0], center[1] + point.offset[1]]] },
      style: {
        symbol: { type: 'circle', radius: 5, fill: { type: 'solid', color: point.color }, stroke: { color: '#ffffff', width: 2 } },
        text: {
          text: point.label,
          offsetY: 18,
          fill: { type: 'solid', color: '#17233d' },
          stroke: { color: '#ffffff', width: 3 },
          backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.88)' },
          padding: [4, 6, 4, 6]
        }
      },
      data: { category: point.label }
    });
  }
  earth.elements.add({
    id: 'print-priority-zone',
    module: 'print-demo',
    layerId: layer.id,
    geometry: {
      type: 'polygon',
      controlPoints: [
        [center[0] - 17_000, center[1] - 7_000],
        [center[0] - 4_000, center[1] - 5_000],
        [center[0] - 6_000, center[1] + 6_000],
        [center[0] - 19_000, center[1] + 4_000]
      ]
    },
    style: {
      fill: { type: 'pattern', pattern: 'diagonal', color: '#e6a23c', backgroundColor: 'rgba(230, 162, 60, 0.18)', size: 14, lineWidth: 2 },
      strokes: [{ color: '#b45309', width: 3 }],
      text: {
        text: '重点区域',
        fill: { type: 'solid', color: '#7c2d12' },
        stroke: { color: '#ffffff', width: 3 },
        backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.86)' },
        padding: [4, 6, 4, 6]
      }
    },
    data: { category: '重点区域' }
  });
  earth.view.flyTo(center, 10);
};

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: 10 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector').update({ opacity: 0.66 });
  addPrintElements(earth);
  earthRef.value = earth;
  printCapabilities.value = earth.print.capabilities;
});

onBeforeUnmount(() => {
  try {
    destroyPrintState();
    releaseOutputUrl();
  } finally {
    earthRef.value?.destroy();
    earthRef.value = null;
    printCapabilities.value = null;
  }
});
</script>

<template>
  <div class="example-demo print-demo">
    <el-alert
      class="example-demo__alert"
      type="info"
      :closable="false"
      show-icon
      title="所有输出按钮都调用真实 PrintSession；能力不可用时明确禁用，不用静态图片冒充导出结果。"
    />

    <div class="example-demo__control-panel print-demo__controls">
      <div class="example-demo__control-grid">
        <label class="example-demo__field">
          <span>headless 场景</span>
          <el-segmented v-model="scenario" :options="scenarioOptions" :disabled="busy" aria-label="选择打印范围和比例尺场景" />
        </label>
        <label v-if="scenario === 'box-fixed'" class="example-demo__field">
          <span>固定比例尺分母</span>
          <el-input-number v-model="denominator" :min="10_000" :max="2_000_000" :step="10_000" :disabled="busy" controls-position="right" />
        </label>
      </div>

      <div class="example-demo__actions">
        <div class="example-demo__action-group" role="group" aria-label="创建打印工作流">
          <span>1. 创建</span>
          <div class="example-demo__action-buttons">
            <el-tooltip :disabled="!uiUnavailableReason" :content="uiUnavailableReason">
              <span><el-button type="primary" :disabled="busy || !!uiUnavailableReason" @click="openFiveScreen">earth.print.open()</el-button></span>
            </el-tooltip>
            <el-button type="primary" plain :loading="busy" @click="createHeadless">earth.print.create()</el-button>
            <el-button :disabled="busy || !sessionAvailable" @click="updateSession">update spec</el-button>
          </div>
        </div>

        <div class="example-demo__action-group" role="group" aria-label="准备打印内容">
          <span>2. 范围与图例</span>
          <div class="example-demo__action-buttons">
            <el-button :disabled="busy || !sessionAvailable" @click="selectArea">selectArea</el-button>
            <el-button :disabled="busy || !sessionAvailable" @click="generateLegend">自动图例</el-button>
            <el-button :disabled="busy || !legendReady" @click="retainAsManualLegend">保留为手动图例</el-button>
          </div>
        </div>

        <div class="example-demo__action-group" role="group" aria-label="预览与输出">
          <span>3. 预览与输出</span>
          <div class="example-demo__action-buttons">
            <el-button :disabled="busy || !sessionAvailable" @click="createPreview">final preview</el-button>
            <el-button type="success" :disabled="busy || !sessionAvailable" @click="exportPng">导出 PNG</el-button>
            <el-tooltip :disabled="!pdfUnavailableReason" :content="pdfUnavailableReason">
              <span><el-button :disabled="busy || !sessionAvailable || !!pdfUnavailableReason" @click="exportPdf">导出 PDF</el-button></span>
            </el-tooltip>
            <el-tooltip :disabled="!browserPrintUnavailableReason" :content="browserPrintUnavailableReason">
              <span>
                <el-button :disabled="busy || !sessionAvailable || !!browserPrintUnavailableReason" @click="openBrowserPrint">浏览器打印</el-button>
              </span>
            </el-tooltip>
          </div>
        </div>

        <div class="example-demo__action-group" role="group" aria-label="打印生命周期">
          <span>生命周期</span>
          <div class="example-demo__action-buttons">
            <el-button :disabled="dialogRef === null" @click="focusDialog">dialog.focus</el-button>
            <el-button :disabled="dialogRef === null" @click="closeDialog">dialog.close</el-button>
            <el-button :disabled="!sessionAvailable" type="warning" plain @click="cancelSession">session.cancel</el-button>
            <el-button :disabled="sessionRef === null && dialogRef === null" type="danger" plain @click="destroySession">destroy</el-button>
          </div>
        </div>
      </div>
    </div>

    <div class="print-demo__workspace">
      <section class="print-demo__map-panel" aria-label="打印范围地图">
        <header><strong>活动地图</strong><span>box 模式请在此完成框选</span></header>
        <div ref="mapTarget" class="example-stage print-demo__map"></div>
      </section>

      <section class="print-demo__proof-panel" aria-label="固定打印版式结构预检">
        <header><strong>版式结构预检</strong><span>仅说明固定位置，不冒充导出结果</span></header>
        <div class="print-demo__paper">
          <div class="print-demo__paper-sheet">
            <div class="print-demo__header"><span>内部资料</span><span>2026-07-23 · 城市运行中心</span></div>
            <div class="print-demo__titles"><strong>城市公共设施分布图</strong><span>打印能力集成样例</span></div>
            <div class="print-demo__paper-map">
              <div class="print-demo__legend">
                <strong>图例</strong><span><i class="print-demo__dot print-demo__dot--red"></i>医院</span
                ><span><i class="print-demo__dot print-demo__dot--blue"></i>学校</span
                ><span><i class="print-demo__dot print-demo__dot--green"></i>交通站点</span
                ><span><i class="print-demo__area"></i>重点区域（动态样式告警）</span>
              </div>
            </div>
            <div class="print-demo__footer"><span class="print-demo__scale">0 ━━━ 10 km · 1∶100,000</span><span class="print-demo__north">N ↑</span></div>
          </div>
        </div>
      </section>
    </div>

    <section class="print-demo__dialog-panel" aria-label="内置五屏打印界面挂载点">
      <header>
        <strong>内置五屏 UI target</strong>
        <span v-if="dialogRef === null">点击 earth.print.open() 后才会在这里挂载；不会随页面自动打开</span>
      </header>
      <div ref="dialogTarget" class="print-demo__dialog-target"></div>
    </section>

    <section v-if="outputUrl !== null" class="print-demo__artifact" aria-live="polite">
      <header>
        <div>
          <strong>真实 Blob 结果</strong><span>{{ outputName }} · {{ outputSize }}</span>
        </div>
        <el-link :href="outputUrl" :download="outputName ?? 'print-output'" type="primary">保存此结果</el-link>
      </header>
      <img :src="outputUrl" alt="PrintSession 返回的真实整页打印预览" />
    </section>

    <el-descriptions class="print-demo__state" :column="1" border aria-live="polite">
      <el-descriptions-item label="capabilities">
        <template v-if="printCapabilities">
          UI {{ printCapabilities.ui ? '可用' : '不可用' }} · PNG 可用 · PDF {{ printCapabilities.pdf ? '可用' : '不可用' }} · browser-print
          {{ printCapabilities.browserPrint ? '可用' : '不可用' }}
        </template>
        <template v-else>Earth 尚未就绪</template>
      </el-descriptions-item>
      <el-descriptions-item label="Session 状态">{{ sessionStatus }}</el-descriptions-item>
      <el-descriptions-item label="工作流">
        范围 {{ resolvedRange ? '已解析' : '未解析' }} · 图例 {{ legendReady ? '已生成' : '未生成' }} · manual {{ manualLegendApplied ? '已保留' : '未启用' }}
      </el-descriptions-item>
      <el-descriptions-item label="Validation">{{ validationSummary }}</el-descriptions-item>
      <el-descriptions-item label="最近操作">{{ operationResult }}</el-descriptions-item>
      <el-descriptions-item v-if="artifactReady" label="可保存结果">{{ outputName }}（{{ outputSize }}）</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.print-demo {
  container-type: inline-size;
}

.print-demo__controls :deep(.el-segmented) {
  max-width: 100%;
}

.print-demo__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  gap: 14px;
}

.print-demo__map-panel,
.print-demo__proof-panel,
.print-demo__dialog-panel,
.print-demo__artifact {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--doc-border);
  border-radius: 10px;
  background: var(--doc-surface);
}

.print-demo__map-panel > header,
.print-demo__proof-panel > header,
.print-demo__dialog-panel > header,
.print-demo__artifact > header,
.print-demo__artifact > header > div {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.print-demo__map-panel > header,
.print-demo__proof-panel > header,
.print-demo__dialog-panel > header,
.print-demo__artifact > header {
  padding: 10px 12px;
  color: var(--doc-text);
  border-bottom: 1px solid var(--doc-border);
  background: var(--doc-surface-soft);
  font-size: 13px;
}

.print-demo__map-panel > header span,
.print-demo__proof-panel > header span,
.print-demo__dialog-panel > header span,
.print-demo__artifact > header span {
  color: var(--doc-muted);
  font-size: 12px;
}

.print-demo__map {
  min-height: 420px;
}

.print-demo__proof-panel {
  display: flex;
  flex-direction: column;
}

.print-demo__paper {
  display: grid;
  flex: 1 1 auto;
  place-items: center;
  min-height: 420px;
  padding: 22px;
  background: var(--print-proof-desk);
}

.print-demo__paper-sheet {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  width: min(100%, 410px);
  aspect-ratio: 1.42;
  padding: 11px;
  color: var(--print-proof-ink);
  border: 1px solid var(--doc-border);
  background: var(--print-proof-page);
  box-shadow: var(--print-proof-shadow);
  font-size: clamp(8px, 1.8cqi, 11px);
}

.print-demo__header,
.print-demo__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px;
}

.print-demo__titles {
  display: grid;
  place-items: center;
  padding: 3px 8px 8px;
  line-height: 1.35;
}

.print-demo__titles strong {
  font-size: 1.35em;
}

.print-demo__paper-map {
  position: relative;
  overflow: hidden;
  margin-inline: 8px;
  border: 3px solid var(--print-proof-ink);
  outline: 1px solid var(--print-proof-ink);
  outline-offset: -7px;
  background-color: var(--print-proof-map);
  background-image:
    linear-gradient(var(--print-proof-grid) 1px, transparent 1px), linear-gradient(90deg, var(--print-proof-grid) 1px, transparent 1px),
    radial-gradient(circle at 68% 35%, var(--print-proof-water) 0 11%, transparent 12%);
  background-size:
    18px 18px,
    18px 18px,
    100% 100%;
}

.print-demo__legend {
  position: absolute;
  bottom: 8px;
  left: 8px;
  display: grid;
  min-width: 86px;
  gap: 3px;
  padding: 6px 8px;
  border: 1px solid var(--print-proof-legend-border);
  background: var(--print-proof-legend);
}

.print-demo__legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}

.print-demo__dot {
  width: 7px;
  height: 7px;
  border: 1px solid var(--print-proof-page);
  border-radius: 50%;
}

.print-demo__dot--red {
  background: #f56c6c;
}

.print-demo__dot--blue {
  background: #409eff;
}

.print-demo__dot--green {
  background: #67c23a;
}

.print-demo__area {
  width: 11px;
  height: 7px;
  border: 1px solid #b45309;
  background: repeating-linear-gradient(135deg, rgb(230 162 60 / 22%) 0 2px, #e6a23c 2px 3px);
}

.print-demo__scale,
.print-demo__north {
  font-weight: 700;
}

.print-demo__north {
  font-size: 1.3em;
}

.print-demo__dialog-panel,
.print-demo__artifact,
.print-demo__state {
  margin-top: 14px;
}

.print-demo__dialog-target:empty {
  display: none;
}

.print-demo__dialog-target:not(:empty) {
  min-height: 460px;
}

.print-demo__artifact > header > div {
  align-items: flex-start;
  flex-direction: column;
  gap: 2px;
}

.print-demo__artifact img {
  display: block;
  width: 100%;
  max-height: 620px;
  object-fit: contain;
  background: var(--print-proof-desk);
}

.print-demo__state :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}

@container (max-width: 760px) {
  .print-demo__workspace {
    grid-template-columns: 1fr;
  }

  .print-demo__map {
    min-height: 340px;
  }

  .print-demo__paper {
    min-height: 320px;
  }
}

@media (max-width: 560px) {
  .print-demo__controls :deep(.el-segmented),
  .print-demo__controls :deep(.el-segmented__group),
  .print-demo__action-group,
  .print-demo__action-buttons,
  .print-demo__action-buttons > span,
  .print-demo__action-buttons :deep(.el-button) {
    width: 100%;
  }

  .print-demo__controls :deep(.el-segmented__group),
  .print-demo__action-buttons {
    display: grid;
    grid-template-columns: 1fr;
  }

  .print-demo__map-panel > header,
  .print-demo__proof-panel > header,
  .print-demo__dialog-panel > header,
  .print-demo__artifact > header {
    align-items: flex-start;
    flex-direction: column;
  }

  .print-demo__paper {
    min-height: 250px;
    padding: 14px;
  }
}
</style>
