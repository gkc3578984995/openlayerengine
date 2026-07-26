import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = async (path: string): Promise<string> => (await readFile(path, 'utf8')).replace(/\r\n?/gu, '\n');

describe('website Print documentation', () => {
  it('assigns every package-root Print symbol to the canonical Print page', async () => {
    const [index, modules, view] = await Promise.all([
      read('src/index.ts'),
      read('website/src/config/apiModules.ts'),
      read('website/src/views/services/PrintView.vue')
    ]);
    const names = (source: string) => [...new Set([...source.matchAll(/\bPrint[A-Za-z0-9]+\b/gu)].map((match) => match[0]))].sort();
    const printModule = modules.match(/id: 'services-print'[\s\S]*?runtimeNames: \[\]/u)?.[0] ?? '';
    const relatedTypes = view.match(/const relatedTypes = \[[\s\S]*?\] as const/u)?.[0] ?? '';

    expect(names(printModule)).toEqual(names(index));
    expect(names(relatedTypes)).toEqual(names(index));
  });

  it('publishes one canonical same-source Print page with the approved five-screen workflow', async () => {
    const [view, demo, earthView] = await Promise.all([
      read('website/src/views/services/PrintView.vue'),
      read('website/src/examples/services/PrintDemo.vue'),
      read('website/src/views/EarthInstanceView.vue')
    ]);

    expect(view).toContain("import PrintDemo from '../../examples/services/PrintDemo.vue'");
    expect(view).toContain("import printSource from '../../examples/services/PrintDemo.vue?raw'");
    expect(view).toContain("extractExampleSnippet(printSource, 'print-workflows')");
    expect(view).toContain('<template #preview><PrintDemo /></template>');
    expect(demo).toContain('// #region print-workflows');
    expect(demo).toContain('// #endregion print-workflows');
    expect(earthView).toContain("name: 'print'");
    expect(earthView).toContain("type: 'PrintFacade'");

    for (const screen of ['1. 版式设置', '2. 范围选择', '3. 自动图例', '4. 手动图例', '5. 最终预览与导出']) {
      expect(view).toContain(screen);
    }
    expect(view).toContain('再填写日期、签发人');
  });

  it('runs the public open and headless APIs only after an explicit user action', async () => {
    const demo = await read('website/src/examples/services/PrintDemo.vue');

    for (const call of [
      'earth.print.open({',
      'earth.print.create({',
      'session.update(',
      'session.selectArea()',
      'session.generateLegend()',
      "session.preview({ quality: 'final' })",
      "session.export({ format: 'png' })",
      "session.export({ format: 'browser-print'",
      'session.on(',
      'sessionRef.value?.cancel()',
      'dialogRef.value?.focus()',
      'dialogRef.value?.close()',
      'dialog.destroy()',
      'session?.destroy()',
      'earthRef.value?.destroy()'
    ]) {
      expect(demo, call).toContain(call);
    }

    const mountedBody = demo.match(/onMounted\(\(\) => \{([\s\S]*?)\n\}\);/u)?.[1] ?? '';
    expect(mountedBody).not.toContain('earth.print.open(');
    expect(mountedBody).not.toContain('earth.print.create(');
    expect(mountedBody).not.toContain('.export(');
  });

  it('keeps the runnable UI focused on view and box while documenting headless extent and optional PDF boundaries', async () => {
    const [view, demo] = await Promise.all([read('website/src/views/services/PrintView.vue'), read('website/src/examples/services/PrintDemo.vue')]);

    expect(demo).toContain("source: { mode: 'view' }, scale: { mode: 'fit' }");
    expect(demo).toContain("source: { mode: 'box' }, scale: { mode: 'fixed', denominator: denominator.value }");
    expect(demo).not.toContain("value: 'extent-fit'");
    expect(demo).not.toContain('导出 PDF</el-button>');
    expect(demo).not.toContain("session.export({ format: 'pdf' })");
    expect(demo).toContain("paper: { size: 'A4', orientation: 'landscape'");
    expect(demo).toContain("paper: { size: 'A3', orientation: 'portrait'");
    expect(demo).toContain("legend: { mode: 'auto', showCounts: true }");
    expect(demo).toContain("mode: 'manual'");
    expect(demo).toContain('（人工确认）');
    expect(demo).toContain("fill: { type: 'pattern', pattern: 'diagonal'");
    expect(view).toContain('unknown-dynamic-style');
    expect(view).toContain('外部/native VectorSource');
    expect(view).toContain('layer-not-printable');
    expect(view).toContain('extent（仅 headless）');
    expect(view).toContain('显式 extent 绑定 projection code');
    expect(view).toContain('同一组数值静默重解释到新投影');
    expect(view).toContain('内置五屏不提供该选项');
    expect(view).toContain("source: { mode: 'extent', extent:");
    expect(view).toContain('headless extent 与自定义纸张');
    expect(view).toContain('size: { widthMm: 320, heightMm: 180 }');
    expect(view).toContain('session.destroy();');
    expect(view).toContain('内置五屏和文档操作台不显示导出 PDF 按钮');

    expect(demo).toContain('if (!earth.print.capabilities.browserPrint)');
    expect(demo).toContain('没有伪造成功状态');
    expect(view).toContain('绝不伪装成功或退化为 PNG');
    expect(view).toContain('不表示已经打印');
  });

  it('documents the printable native Layer factory and its explicit ownership handle', async () => {
    const [index, modules, view, design] = await Promise.all([
      read('src/index.ts'),
      read('website/src/config/apiModules.ts'),
      read('website/src/views/services/PrintView.vue'),
      read('docs/superpowers/specs/2026-07-23-v2-map-printing-design.md')
    ]);

    for (const typeName of ['PrintPrintableLayerContext', 'PrintPrintableLayerFactory', 'PrintPrintableLayerOutput']) {
      expect(index).toContain(typeName);
      expect(modules).toContain(`'${typeName}'`);
      expect(view).toContain(`'${typeName}'`);
      expect(design).toContain(typeName);
    }

    expect(view).toContain('PrintCreateOptions.printableLayerFactory');
    expect(view).toContain("earth.layers.add({\n  kind: 'native'");
    expect(view).toContain('applicationFeatureStore.query(plan.range.actualExtent)');
    expect(view).toContain("ownership: 'session'");
    expect(view).toContain('layer.setSource(null)');
    expect(view).toContain("<code>ownership: 'external'</code>");
    expect(view).toContain('factory 输出只作为内部 snapshot clone/freeze 的输入');
    expect(view).toContain('external 输出不由引擎 dispose');
    expect(view).toContain('内部 snapshot clone');
    expect(view).toContain('Tile/Image Source 被内部 clone');
    expect(view).toContain('整个 snapshot 生命周期保持稳定');
    expect(view).toContain('factory 也不得返回活动 Layer 本身或其任一子 Layer');
    expect(view).toContain('子类即使继承这些类型也必须走 factory');
    expect(view).toContain('native Vector 样式必须可以隔离冻结');
    expect(view).toContain('OpenLayers Icon、自定义 ImageStyle、CanvasGradient 或 CanvasPattern');
    expect(view).toMatch(/IconSymbolSpec（含\s+color）与 PatternFillSpec/u);
    expect(view).toContain('PatternFillSpec');
    expect(view).toContain('new CircleStyle({');
    expect(view).toContain('new Stroke({');
    expect(view).toContain('new Fill({');
    expect(design).toContain('readonly printableLayerFactory?: PrintPrintableLayerFactory;');
    expect(design).toContain("ownership: 'external'");
    expect(design).toContain("ownership: 'session'");
    expect(design).toContain('显式 extent 在完整 PrintSpec 提交并成功确认范围时绑定当前 View 的 projection code');
  });

  it('documents and visualizes the fixed page composition and explicit cleanup', async () => {
    const [view, demo, styles] = await Promise.all([
      read('website/src/views/services/PrintView.vue'),
      read('website/src/examples/services/PrintDemo.vue'),
      read('website/src/assets/styles/index.scss')
    ]);

    for (const label of [
      '内部资料',
      '2026-07-23',
      '城市运行中心',
      '城市公共设施分布图',
      '打印能力集成样例',
      '图例',
      '医院',
      '学校',
      '交通站点',
      '重点区域（动态样式告警）',
      '1∶100,000',
      'N ↑'
    ]) {
      expect(demo).toContain(label);
    }
    expect(demo).toContain('class="print-demo__paper-map"');
    expect(demo).toContain('border: 3px solid var(--print-proof-ink);');
    expect(demo).toContain('outline: 1px solid var(--print-proof-ink);');
    expect(view).toContain('外粗内细双线框');
    expect(view).toContain('内细线的内缘严格等于 mapFrame');
    expect(view).toContain('外粗线位于其外');
    expect(view).toContain('右侧固定“日期：”与“签发人：”两个紧凑槽位并整体右对齐');
    expect(view).toContain('常用密级建议与自由手填');
    expect(view).toContain('与地图双线框保留独立物理间距');
    expect(view).toContain('左上、右上、左下、右下四个位置');
    expect(view).toContain('手动列表支持按组折叠');
    expect(view).toContain('颜色选择器和文本输入');
    expect(view).toContain('左侧图形比例尺与 1∶N，右侧指北针');
    expect(view).toContain('与双线框分开，不紧贴或侵入地图框');
    expect(view).toMatch(/默认按\s+40% \/ 60%\s+分配/u);
    expect(view).toContain('五个页面的操作区都固定在左侧面板底部');
    expect(view).toContain('手动图例修改任意值时会保持当前滚动位置');
    expect(view).toMatch(/分别在 420px 与 360px\s+的最小宽度处停止/u);
    expect(view).toContain('恢复桌面宽度后沿用此前比例');
    expect(view).toContain('适合窗口模式的纸张会随预览区宽高等比缩放');
    expect(view).toContain('框选步骤采用全宽平面控制区与底部操作区');
    expect(view).toContain('窄屏会隐藏纸张预览且不提供展开开关');

    for (const variable of ['--print-proof-desk', '--print-proof-page', '--print-proof-ink', '--print-proof-map', '--print-proof-legend']) {
      expect(styles.match(new RegExp(`${variable}:`, 'gu'))?.length, variable).toBe(2);
    }
    expect(styles).toContain('html.dark {');
    expect(demo).toContain('@container (max-width: 760px)');
    expect(demo).toContain('@media (max-width: 560px)');
    expect(demo).toContain('URL.revokeObjectURL(outputUrl.value)');
    expect(demo).toContain('onBeforeUnmount');
  });
});
