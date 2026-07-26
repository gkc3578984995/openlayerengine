import { Earth, useEarth, type EarthOptions, type PrintDialogHandle, type PrintSession, type PrintSpec, type UseEarthOptions } from '@vrsim/earth-engine-ol';
import type { ScenarioDefinition } from '../harness/types.js';

export const earthScenario: ScenarioDefinition = {
  id: 'earth',
  group: '核心与实例',
  title: 'Earth 与 useEarth 实例管理',
  summary: '验证 Earth 实例管理、完整服务入口，以及 headless 打印会话和内置打印工作台的公共契约。',
  steps: [
    '确认当前四个有效地图视口均能显示蓝色定位点，且无参、无 id 配置、命名和带 id 配置分支的检查均为通过。',
    '点击“销毁并重新创建默认实例”，确认旧实例进入 destroyed，新实例重新显示地图。',
    '点击“销毁并重新创建独立实例”，确认 new Earth() 不进入 useEarth 注册表且可以自行管理生命周期。',
    '检查当前状态中的 target、lifecycle、isDestroyed 以及全部服务入口。',
    '按顺序操作打印区按钮，验证视图范围、指定范围、框选、固定比例尺、自定义纸张、预览与 PNG 输出。',
    '打开内置打印工作台，确认五屏流程可聚焦、关闭和销毁，且场景加载时不会自动启动打印。'
  ],
  mount(context) {
    const defaultTarget = context.createMapTarget('默认实例：useEarth()');
    defaultTarget.id = 'olContainer';
    const configuredDefaultTarget = context.createMapTarget('无 id 配置默认实例：useEarth({ target, view, controls })');
    const namedTarget = context.createMapTarget('命名实例：useEarth(id)');
    const namedId = 'acceptance-named-earth';
    namedTarget.id = namedId;
    const configuredTarget = context.createMapTarget('配置实例：useEarth(options)');
    const standaloneTarget = context.createMapTarget('独立实例：new Earth(options)');

    const configuredDefaultOptions: UseEarthOptions = {
      target: configuredDefaultTarget,
      view: { center: [1_000_000, -1_000_000], zoom: 4 },
      controls: { attribution: false, rotate: false, zoom: false }
    };
    const configuredOptions: UseEarthOptions = {
      id: 'acceptance-configured-earth',
      target: configuredTarget,
      view: { center: [2_000_000, 1_000_000], zoom: 3 },
      controls: { attribution: false, rotate: false, zoom: true }
    };
    const standaloneOptions: EarthOptions = {
      target: standaloneTarget,
      view: { center: [-2_000_000, -1_000_000], zoom: 3 },
      controls: { attribution: true, rotate: false, zoom: false }
    };

    const unconfiguredDefaultEarth = context.trackEarth(useEarth());
    addMarker(unconfiguredDefaultEarth, 'earth-default-no-arguments', [0, 0], '无参默认实例');
    context.render(unconfiguredDefaultEarth);
    context.check('useEarth() 无参首次调用创建默认实例', useEarth() === unconfiguredDefaultEarth && unconfiguredDefaultEarth.lifecycle === 'ready');
    unconfiguredDefaultEarth.destroy();
    context.check('无参默认实例销毁后释放默认注册项', unconfiguredDefaultEarth.isDestroyed);

    let defaultEarth = context.trackEarth(useEarth(configuredDefaultOptions));
    const namedEarth = context.trackEarth(useEarth(namedId));
    const configuredEarth = context.trackEarth(useEarth(configuredOptions));
    let standaloneEarth = context.trackEarth(new Earth(standaloneOptions));

    addMarker(defaultEarth, 'earth-default-configured', [1_000_000, -1_000_000], '无 id 配置默认实例');
    addMarker(namedEarth, 'earth-named', [0, 0], '命名实例');
    addMarker(configuredEarth, 'earth-options', [2_000_000, 1_000_000], '配置实例');
    addMarker(standaloneEarth, 'earth-standalone', [-2_000_000, -1_000_000], '独立实例');

    for (const earth of [defaultEarth, namedEarth, configuredEarth, standaloneEarth]) context.render(earth);

    context.check(
      'useEarth({ target, view, controls }) 不带 id 创建配置默认实例',
      !Object.prototype.hasOwnProperty.call(configuredDefaultOptions, 'id') &&
        defaultEarth.target === configuredDefaultTarget &&
        defaultEarth.view.getZoom() === 4 &&
        useEarth(configuredDefaultOptions) === defaultEarth &&
        useEarth() === defaultEarth
    );
    context.check('useEarth(id) 重复调用返回命名实例', useEarth(namedId) === namedEarth);
    context.check('useEarth(options) 重复调用返回配置实例', useEarth(configuredOptions) === configuredEarth);
    context.check('new Earth() 创建独立实例', standaloneEarth !== defaultEarth && standaloneEarth !== namedEarth && standaloneEarth !== configuredEarth);
    context.check('Earth.target 保留 HTMLElement', configuredEarth.target === configuredTarget && standaloneEarth.target === standaloneTarget);

    inspectEarth(context, '无 id 配置默认实例', defaultEarth);
    inspectEarth(context, '命名实例', namedEarth);
    inspectEarth(context, '配置实例', configuredEarth);
    inspectEarth(context, '独立实例', standaloneEarth);

    const lifecycleSection = context.section('生命周期操作', '所有销毁操作都是幂等的；useEarth 管理的实例销毁后，相同 key 会创建新实例。');
    const lifecycleActions = context.actions(lifecycleSection);
    context.button(
      lifecycleActions,
      '销毁并重新创建默认实例',
      () => {
        const previous = defaultEarth;
        previous.destroy();
        context.check('旧默认实例已销毁', previous.lifecycle === 'destroyed' && previous.isDestroyed);
        defaultEarth = context.trackEarth(useEarth());
        addMarker(defaultEarth, 'earth-default-recreated', [0, 0], '重新创建');
        context.render(defaultEarth);
        context.check('useEarth() 返回全新的默认实例', defaultEarth !== previous && useEarth() === defaultEarth);
        inspectEarth(context, '默认实例', defaultEarth);
      },
      '主要'
    );
    context.button(lifecycleActions, '重复调用默认实例 destroy()', () => {
      defaultEarth.destroy();
      defaultEarth.destroy();
      context.check('destroy() 重复调用保持 destroyed', defaultEarth.lifecycle === 'destroyed' && defaultEarth.isDestroyed);
    });
    context.button(
      lifecycleActions,
      '销毁并重新创建独立实例',
      () => {
        const previous = standaloneEarth;
        previous.destroy();
        standaloneEarth = context.trackEarth(new Earth(standaloneOptions));
        addMarker(standaloneEarth, 'earth-standalone-recreated', [-2_000_000, -1_000_000], '重新创建');
        context.render(standaloneEarth);
        context.check('new Earth() 可独立重新创建', previous.isDestroyed && standaloneEarth !== previous && standaloneEarth.lifecycle === 'ready');
        inspectEarth(context, '独立实例', standaloneEarth);
      },
      '主要'
    );

    const serviceSection = context.section('公开服务入口', '点击后逐一读取 Earth 的公开属性，验证外部用户可以从单一实例访问全部能力。');
    context.button(context.actions(serviceSection), '检查全部 Earth 属性', () => {
      inspectEarth(context, '配置实例', configuredEarth);
      context.log('已读取 Earth 的全部公开属性', '成功');
    });

    let printSession: PrintSession | undefined;
    let printDialog: PrintDialogHandle | undefined;
    let unsubscribePrint: (() => void) | undefined;

    const watchPrintSession = (session: PrintSession): PrintSession => {
      unsubscribePrint?.();
      printSession = session;
      unsubscribePrint = session.on('statuschange', (event) => {
        context.status('打印会话状态', { status: event.status, revision: event.revision });
      });
      return session;
    };

    const createHeadlessPrintSession = (): PrintSession => {
      printDialog?.destroy();
      printDialog = undefined;
      printSession?.destroy();
      return watchPrintSession(
        configuredEarth.print.create({
          initialSpec: createPrintSpec(),
          sessionConflictPolicy: 'replace',
          interactionConflictPolicy: 'replace'
        })
      );
    };

    const activePrintSession = (): PrintSession => {
      if (printSession === undefined || printSession.status === 'cancelled' || printSession.status === 'destroyed') return createHeadlessPrintSession();
      return printSession;
    };

    const printableSession = (): PrintSession => {
      const session = activePrintSession();
      if (!session.validation.canPreview) session.update(createPrintSpec());
      return session;
    };

    context.track(() => {
      unsubscribePrint?.();
      printDialog?.destroy();
      printSession?.destroy();
    });

    const printSection = context.section(
      '地图打印',
      '打印只会在点击按钮后启动。默认采用当前视图和自定义横向纸张，也可更新为指定范围、固定比例尺或在地图上框选。'
    );
    context.status('打印能力', configuredEarth.print.capabilities);
    const printActions = context.actions(printSection);

    context.button(printActions, '创建 headless 打印会话', () => {
      const session = createHeadlessPrintSession();
      context.status('打印会话快照', printSessionSnapshot(session));
      context.check('headless 会话已创建且初始配置有效', session.spec !== undefined && session.validation.canPreview);
    });

    context.button(printActions, '更新为指定范围和固定比例尺', () => {
      const session = activePrintSession();
      session.update(createPrintSpec({ mode: 'extent', extent: [1_000_000, 0, 3_000_000, 2_000_000] }, { mode: 'fixed', denominator: 5_000_000 }));
      context.status('打印会话快照', printSessionSnapshot(session));
      context.check('固定比例尺已进入打印计划', session.plan?.range.denominator === 5_000_000);
    });

    context.button(printActions, '框选打印范围并规划', async () => {
      const session = activePrintSession();
      session.update(createPrintSpec({ mode: 'box' }));
      context.note(printSection, '请在“配置实例”地图上拖拽框选打印范围。', '提示');
      const range = await session.selectArea();
      context.status('框选范围', range);
      context.check('框选范围已解析', range.sourceMode === 'box');
    });

    context.button(printActions, '生成当前范围图例', async () => {
      const session = printableSession();
      const legend = await session.generateLegend();
      context.status('图例结果', legend);
      context.check('图例结果与当前会话一致', session.legendResult === legend);
    });

    context.button(printActions, '生成草稿预览', async () => {
      const session = printableSession();
      const preview = await session.preview({ quality: 'draft' });
      context.status('预览结果', { widthPx: preview.widthPx, heightPx: preview.heightPx, revision: preview.revision });
      context.check('预览结果已写回会话', session.previewResult === preview && preview.blob.size > 0);
    });

    context.button(printActions, '导出 PNG 打印成品', async () => {
      const session = printableSession();
      const result = await session.export({ format: 'png' });
      context.status('导出结果', result);
      context.check('PNG 成品已生成', 'format' in result && result.format === 'png' && result.blob.size > 0);
    });

    context.button(printActions, '取消当前打印会话', () => {
      const session = activePrintSession();
      session.cancel();
      context.status('打印会话快照', printSessionSnapshot(session));
      context.check('打印会话已取消', session.status === 'cancelled');
    });

    context.button(printActions, '销毁当前打印会话', () => {
      const session = activePrintSession();
      session.destroy();
      unsubscribePrint?.();
      unsubscribePrint = undefined;
      printSession = undefined;
      context.status('打印会话状态', 'destroyed');
    });

    const dialogActions = context.actions(printSection);
    context.button(dialogActions, '打开内置五屏打印工作台', () => {
      unsubscribePrint?.();
      printSession?.destroy();
      printDialog?.destroy();
      printDialog = configuredEarth.print.open({ initialSpec: createPrintSpec(), sessionConflictPolicy: 'replace' });
      watchPrintSession(printDialog.session);
      printDialog.focus();
      context.status('打印工作台状态', printDialog.status);
    });
    context.button(dialogActions, '关闭内置打印工作台', () => {
      printDialog?.close();
      context.status('打印工作台状态', printDialog?.status ?? '未打开');
    });
    context.button(dialogActions, '销毁内置打印工作台', () => {
      printDialog?.destroy();
      printDialog = undefined;
      printSession = undefined;
      unsubscribePrint?.();
      unsubscribePrint = undefined;
      context.status('打印工作台状态', 'destroyed');
    });

    context.setCode(`
import { Earth, useEarth, type PrintSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

const defaultEarth = useEarth();
const sameDefault = useEarth();

defaultEarth.destroy();
const configuredDefault = useEarth({
  target: document.querySelector<HTMLElement>('#configured-default-map')!,
  view: { center: [0, 0], zoom: 4 },
  controls: { attribution: false, rotate: false }
});

const namedEarth = useEarth('planning-map');
const sameNamed = useEarth('planning-map');

const configuredEarth = useEarth({
  id: 'configured-map',
  target: document.querySelector<HTMLElement>('#configured-map')!,
  view: { center: [0, 0], zoom: 4 },
  controls: { rotate: false }
});

const standalone = new Earth({ target: 'preview-map' });
standalone.destroy();

const printSpec: PrintSpec = {
  range: { source: { mode: 'view' }, scale: { mode: 'fixed', denominator: 50000 } },
  paper: { size: { widthMm: 260, heightMm: 180 }, orientation: 'landscape', marginMm: 10, dpi: 150 },
  layout: {
    classification: '内部资料',
    title: '规划态势图',
    subtitle: '当前视图打印',
    date: '2026-07-23',
    issuer: '规划处'
  },
  legend: { mode: 'auto', showCounts: true },
  content: { animations: 'current-frame', domOverlays: 'exclude', controls: 'exclude' }
};

async function exportCurrentView(): Promise<Blob> {
  const session = configuredEarth.print.create({ initialSpec: printSpec });
  const unsubscribe = session.on('statuschange', ({ status }) => console.info(status));
  try {
    session.update(printSpec);
    await session.selectArea();
    await session.generateLegend();
    await session.preview({ quality: 'final' });
    const result = await session.export({ format: 'png' });
    if (!('blob' in result)) throw new Error('未生成 PNG 文件');
    return result.blob;
  } finally {
    unsubscribe();
    session.cancel();
    session.destroy();
  }
}

function openPrintWorkbench() {
  const dialog = configuredEarth.print.open({ initialSpec: printSpec });
  dialog.focus();
  return dialog;
}
`);
  }
};

function addMarker(earth: Earth, id: string, coordinate: readonly [number, number], label: string): void {
  earth.elements.add({
    id,
    geometry: { type: 'point', controlPoints: [coordinate] },
    style: {
      symbol: {
        type: 'circle',
        radius: 8,
        fill: { type: 'solid', color: '#1677ff' },
        stroke: { color: '#ffffff', width: 3 }
      },
      text: {
        text: label,
        fontSize: 14,
        fontWeight: 'bold',
        fill: { type: 'solid', color: '#16324f' },
        backgroundFill: { type: 'solid', color: [255, 255, 255, 0.9] },
        padding: [4, 7, 4, 7],
        offsetY: -22
      }
    }
  });
}

function inspectEarth(context: Parameters<ScenarioDefinition['mount']>[0], label: string, earth: Earth): void {
  const services = {
    map: earth.map,
    target: earth.target,
    elements: earth.elements,
    layers: earth.layers,
    styles: earth.styles,
    animations: earth.animations,
    draw: earth.draw,
    transform: earth.transform,
    measure: earth.measure,
    events: earth.events,
    contextMenu: earth.contextMenu,
    overlays: earth.overlays,
    print: earth.print,
    view: earth.view,
    controls: earth.controls
  };
  context.status(`${label} lifecycle`, earth.lifecycle);
  context.status(`${label} isDestroyed`, earth.isDestroyed);
  context.status(`${label} target`, typeof earth.target === 'string' ? earth.target : `#${earth.target.id}`);
  context.status(`${label} 公开服务`, Object.keys(services));
  context.check(
    `${label}全部公开服务可访问`,
    Object.values(services).every((service) => service !== undefined)
  );
}

function createPrintSpec(source: PrintSpec['range']['source'] = { mode: 'view' }, scale: PrintSpec['range']['scale'] = { mode: 'fit' }): PrintSpec {
  return {
    range: { source, scale },
    paper: {
      size: { widthMm: 260, heightMm: 180 },
      orientation: 'landscape',
      marginMm: { top: 12, right: 10, bottom: 12, left: 10 },
      dpi: 96
    },
    layout: {
      classification: '人工验收',
      title: 'Earth 打印验收图',
      subtitle: '自定义横向纸张',
      date: new Date().toLocaleDateString('zh-CN'),
      issuer: 'OpenLayers 工具库'
    },
    legend: { mode: 'auto', showCounts: true },
    content: { animations: 'current-frame', domOverlays: 'exclude', controls: 'exclude' },
    resources: { timeoutMs: 10_000 }
  };
}

function printSessionSnapshot(session: PrintSession): object {
  return {
    status: session.status,
    spec: session.spec,
    plan: session.plan,
    legendResult: session.legendResult,
    previewResult: session.previewResult,
    validation: session.validation
  };
}
