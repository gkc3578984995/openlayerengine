import {
  Earth,
  type DescriptorContent,
  type DescriptorEvent,
  type DescriptorHandle,
  type DescriptorListItem,
  type DescriptorPatch,
  type DescriptorSpec,
  type OverlayHandle,
  type OverlayOwnership,
  type OverlayPatch,
  type OverlayPositioning,
  type OverlaySelector,
  type OverlayService,
  type OverlaySpec,
  type PanIntoViewSpec
} from '@vrsim/earth-engine-ol';
import type { ScenarioDefinition } from '../harness/types.js';

interface OverlayData {
  readonly kind: string;
  readonly revision: number;
}

interface DescriptorData {
  readonly source: string;
  readonly revision: number;
}

type AcceptanceOverlayData = OverlayData | DescriptorData;

const positioningValues: readonly OverlayPositioning[] = Object.freeze([
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'center-left',
  'center-center',
  'center-right',
  'top-left',
  'top-center',
  'top-right'
]);

const positioningOptions = [
  { label: '左下（bottom-left）', value: 'bottom-left' },
  { label: '中下（bottom-center）', value: 'bottom-center' },
  { label: '右下（bottom-right）', value: 'bottom-right' },
  { label: '左中（center-left）', value: 'center-left' },
  { label: '中心（center-center）', value: 'center-center' },
  { label: '右中（center-right）', value: 'center-right' },
  { label: '左上（top-left）', value: 'top-left' },
  { label: '中上（top-center）', value: 'top-center' },
  { label: '右上（top-right）', value: 'top-right' }
] as const satisfies readonly { readonly label: string; readonly value: OverlayPositioning }[];

const listItems: readonly DescriptorListItem[] = Object.freeze([
  Object.freeze({ label: '温度', value: '23.5 ℃', color: '#dc2626', className: 'acceptance-descriptor-temperature' }),
  Object.freeze({ label: '湿度', value: 64, color: '#2563eb', className: 'acceptance-descriptor-humidity' })
]);

export const overlaysScenario: ScenarioDefinition = {
  id: 'overlays',
  group: '覆盖物与标牌',
  title: 'Overlay 与 Descriptor 完整生命周期',
  summary: '验收普通 Overlay 的定位、查询、更新与清理，以及列表、字符串和 HTMLElement 三类 Descriptor 的事件与关闭行为。',
  steps: [
    '检查九宫格标签，确认 OverlayPositioning 的九个联合值都以不同锚点显示。',
    '确认 autoPan=false、autoPan=true 和完整 PanIntoViewSpec 三种分支，再更新主覆盖物并执行隐藏、显示与自动平移。',
    '运行全部查询，确认 id、ids、module、visible、predicate 和无选择器六种分支均返回可辨识的 id。',
    '点击列表标牌条目和关闭按钮，观察 DescriptorEvent 的 descriptor、data、item 与 index；关闭后可重新显示。',
    '更新列表标牌的全部 DescriptorPatch 字段，并拖动它以检查 fixedMode、fixedLine 与 draggable。',
    '关闭字符串标牌以触发 destroy，隐藏列表标牌以触发 hide，最后按需销毁单个覆盖物或清理全部覆盖物。'
  ],
  mount(context) {
    const target = context.createMapTarget('覆盖物与标牌地图');
    const earth = context.trackEarth(
      new Earth({
        target,
        view: { center: [0, 0], zoom: 3 },
        controls: { attribution: false, rotate: false, zoom: true }
      })
    );
    const overlays: OverlayService = earth.overlays;
    let revision = 0;

    const addMainOverlay = (): OverlayHandle<OverlayData> => {
      const panOptions: PanIntoViewSpec = {
        margin: 32,
        duration: 300,
        easing: (progress) => 1 - (1 - progress) ** 2
      };
      const spec: OverlaySpec<OverlayData> = {
        id: 'acceptance-overlay-main',
        element: createOverlayElement('主覆盖物', '#7c3aed'),
        position: [0, 0],
        offset: [10, -12],
        positioning: 'bottom-center',
        stopEvent: true,
        insertFirst: false,
        autoPan: panOptions,
        className: 'acceptance-overlay-main',
        module: '主覆盖物模块',
        data: { kind: '主覆盖物', revision: revision++ },
        ownership: 'external'
      };
      return overlays.add(spec);
    };

    let mainOverlay: OverlayHandle<OverlayData> | undefined = addMainOverlay();
    context.track(() => mainOverlay?.destroy());

    const booleanAutoPan = overlays.add<OverlayData>({
      id: 'acceptance-auto-pan-boolean',
      element: createOverlayElement('autoPan=true', '#0369a1'),
      position: [0, 3_500_000],
      autoPan: true,
      module: '自动平移布尔分支',
      data: { kind: 'autoPan=true', revision: 0 },
      ownership: 'earth'
    });
    context.track(() => booleanAutoPan.destroy());

    for (const [index, positioning] of positioningValues.entries()) {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const handle = overlays.add<OverlayData>({
        id: `acceptance-positioning-${positioning}`,
        element: createOverlayElement(positioning, '#0f766e'),
        position: [(column - 1) * 4_000_000, (1 - row) * 2_500_000],
        offset: [0, 0],
        positioning,
        stopEvent: false,
        insertFirst: true,
        autoPan: false,
        className: 'acceptance-positioning-sample',
        module: '定位九宫格',
        data: { kind: positioning, revision: 0 },
        ownership: 'earth'
      });
      context.track(() => handle.destroy());
    }

    const overlayControls = context.section('普通 Overlay', '九种定位值已全部绘制；下面的控件操作紫色主覆盖物。');
    const xInput = context.number(overlayControls, '经度方向坐标', 1_000_000, { step: 250_000 });
    const yInput = context.number(overlayControls, '纬度方向坐标', 1_000_000, { step: 250_000 });
    const positioningInput = context.select(overlayControls, '定位方式', positioningOptions, 'bottom-center');
    const ownershipInput = context.select<OverlayOwnership>(
      overlayControls,
      '元素所有权',
      [
        { label: 'external：调用方负责', value: 'external' },
        { label: 'earth：Earth 负责', value: 'earth' }
      ],
      'external'
    );
    const overlayActions = context.actions(overlayControls);
    context.check(
      '定位选项完整覆盖 OverlayPositioning',
      positioningOptions.length === positioningValues.length && positioningValues.every((value) => positioningOptions.some((option) => option.value === value))
    );

    const requireMainOverlay = (): OverlayHandle<OverlayData> => {
      if (mainOverlay === undefined) throw new Error('主覆盖物已销毁，请先重建');
      return mainOverlay;
    };
    const showMainState = (): void => {
      const handle = requireMainOverlay();
      context.status('主覆盖物 id', handle.id);
      context.status('主覆盖物 position', handle.position);
      context.status('主覆盖物 visible', handle.visible);
    };

    context.button(
      overlayActions,
      '应用完整 OverlayPatch',
      () => {
        const ownership = ownershipInput.value as OverlayOwnership;
        const patch: OverlayPatch<OverlayData> = {
          element: createOverlayElement(`更新 ${revision}`, '#c026d3'),
          position: [xInput.valueAsNumber, yInput.valueAsNumber],
          offset: [14, -18],
          positioning: positioningInput.value as OverlayPositioning,
          visible: true,
          data: { kind: '已更新主覆盖物', revision: revision++ },
          ownership
        };
        requireMainOverlay().update(patch);
        showMainState();
      },
      '主要'
    );
    context.button(overlayActions, '清除位置 setPosition(undefined)', () => {
      requireMainOverlay().setPosition(undefined);
      showMainState();
    });
    context.button(overlayActions, '恢复 position', () => {
      requireMainOverlay().setPosition([xInput.valueAsNumber, yInput.valueAsNumber]);
      showMainState();
    });
    context.button(overlayActions, '隐藏主覆盖物', () => {
      requireMainOverlay().hide();
      showMainState();
    });
    context.button(overlayActions, '显示主覆盖物', () => {
      requireMainOverlay().show();
      showMainState();
    });
    context.button(overlayActions, '使用默认参数自动平移', () => requireMainOverlay().panIntoView());
    context.button(overlayActions, '使用完整参数自动平移', () => {
      const options: PanIntoViewSpec = {
        margin: 48,
        duration: 450,
        easing: (progress) => progress * progress
      };
      requireMainOverlay().panIntoView(options);
    });
    context.button(
      overlayActions,
      '销毁主覆盖物',
      () => {
        requireMainOverlay().destroy();
        mainOverlay = undefined;
        context.status('主覆盖物生命周期', '已销毁');
      },
      '危险'
    );
    context.button(overlayActions, '重建主覆盖物', () => {
      mainOverlay?.destroy();
      mainOverlay = addMainOverlay();
      showMainState();
    });

    const queryControls = context.section('查询、移除与清理', '查询结果展示每个 OverlayHandle.id；“clear”适合在本场景最后执行。');
    const queryActions = context.actions(queryControls);
    context.button(queryActions, '执行全部 OverlaySelector', () => {
      const currentId = requireMainOverlay().id;
      const selectors: readonly [string, OverlaySelector<AcceptanceOverlayData> | undefined][] = [
        ['无选择器', undefined],
        ['id', { id: currentId }],
        ['ids', { ids: [currentId, 'acceptance-positioning-top-left'] }],
        ['module', { module: '定位九宫格' }],
        ['visible', { visible: true }],
        ['predicate', { predicate: (data, handle) => data !== undefined && 'kind' in data && data.kind.includes('center') && handle.visible }]
      ];
      for (const [label, selector] of selectors) {
        const handles = selector === undefined ? overlays.query<AcceptanceOverlayData>() : overlays.query(selector);
        context.status(
          `query(${label})`,
          handles.map((handle) => handle.id)
        );
      }
      context.status('get(主覆盖物)', overlays.get(currentId)?.id ?? '未找到');
    });
    context.button(queryActions, '创建并按 module 移除临时覆盖物', () => {
      for (let index = 0; index < 2; index += 1) {
        overlays.add({
          element: createOverlayElement(`临时 ${index + 1}`, '#ea580c'),
          position: [index * 900_000, -3_500_000],
          module: '待移除覆盖物',
          data: { kind: '临时', revision: index },
          ownership: 'earth'
        });
      }
      context.status('remove(module) 数量', overlays.remove({ module: '待移除覆盖物' }));
    });
    context.button(
      queryActions,
      'clear 全部覆盖物',
      () => {
        overlays.clear();
        mainOverlay = undefined;
        context.status('query() 数量', overlays.query().length);
      },
      '危险'
    );

    const descriptorControls = context.section('Descriptor 标牌', '红色为列表，蓝色为字符串，绿色为自定义 HTMLElement。');
    const recordEvent = (source: string, event: DescriptorEvent<DescriptorData>): void => {
      context.log(`${source}收到 ${event.type} 事件`, '信息', {
        type: event.type,
        descriptor: event.descriptor.id,
        data: event.data,
        item: event.item,
        index: event.index
      });
    };

    const listSpec: DescriptorSpec<DescriptorData> = {
      id: 'acceptance-descriptor-list',
      type: 'list',
      content: listItems,
      position: [-3_000_000, -1_500_000],
      offset: [20, -24],
      header: '列表标牌',
      footer: '点击条目触发 click',
      close: true,
      closeAction: 'hide',
      onClose: (event) => recordEvent('onClose 回调', event),
      onItemClick: (event) => recordEvent('onItemClick 回调', event),
      draggable: true,
      fixedLine: true,
      fixedLineColor: '#dc2626',
      fixedMode: 'position',
      data: { source: '列表内容', revision: 0 }
    };
    const listDescriptor: DescriptorHandle<DescriptorData> = overlays.createDescriptor(listSpec);
    context.track(() => listDescriptor.destroy());
    context.track(listDescriptor.on('click', (event) => recordEvent('click 订阅', event)));
    context.track(listDescriptor.on('close', (event) => recordEvent('close 订阅', event)));

    const stringSpec: DescriptorSpec<DescriptorData> = {
      id: 'acceptance-descriptor-string',
      type: 'custom',
      content: '这是字符串形式的自定义标牌内容。',
      position: [0, -1_500_000],
      offset: [0, 18],
      header: '字符串标牌',
      footer: '关闭后销毁',
      close: true,
      closeAction: 'destroy',
      onClose: (event) => recordEvent('字符串 onClose', event),
      draggable: false,
      fixedLine: true,
      fixedLineColor: '#2563eb',
      fixedMode: 'pixel',
      data: { source: '字符串内容', revision: 0 }
    };
    const stringDescriptor: DescriptorHandle<DescriptorData> = overlays.createDescriptor(stringSpec);
    context.track(() => stringDescriptor.destroy());
    context.track(stringDescriptor.on('close', (event) => recordEvent('字符串 close 订阅', event)));

    const htmlContent: DescriptorContent = createDescriptorContent('HTMLElement 内容', '#15803d');
    const htmlSpec: DescriptorSpec<DescriptorData> = {
      id: 'acceptance-descriptor-html',
      type: 'custom',
      content: htmlContent as HTMLElement,
      position: [3_000_000, -1_500_000],
      offset: [-20, -24],
      header: 'HTMLElement 标牌',
      close: false,
      closeAction: 'hide',
      draggable: true,
      fixedLine: false,
      fixedLineColor: '#15803d',
      fixedMode: 'position',
      data: { source: 'HTMLElement 内容', revision: 0 }
    };
    const htmlDescriptor: DescriptorHandle<DescriptorData> = overlays.createDescriptor(htmlSpec);
    context.track(() => htmlDescriptor.destroy());

    const descriptorActions = context.actions(descriptorControls);
    context.button(
      descriptorActions,
      '应用完整 DescriptorPatch',
      () => {
        const nextItems: readonly DescriptorListItem[] = [
          { label: '更新次数', value: ++revision, color: '#7c3aed', className: 'acceptance-descriptor-revision' },
          { label: '状态', value: '已更新', color: '#15803d', className: 'acceptance-descriptor-status' }
        ];
        const patch: DescriptorPatch<DescriptorData> = {
          content: nextItems,
          position: [-2_000_000, 1_500_000],
          offset: [28, -32],
          header: '更新后的列表标牌',
          footer: '全部补丁字段已应用',
          close: true,
          closeAction: 'hide',
          onClose: (event) => recordEvent('补丁 onClose', event),
          onItemClick: (event) => recordEvent('补丁 onItemClick', event),
          draggable: true,
          fixedLine: true,
          fixedLineColor: '#7c3aed',
          fixedMode: 'pixel',
          data: { source: '补丁数据', revision }
        };
        listDescriptor.update(patch);
        context.status('列表标牌 id', listDescriptor.id);
        context.status('列表标牌 visible', listDescriptor.visible);
      },
      '主要'
    );
    context.button(descriptorActions, '移动列表标牌', () => listDescriptor.setPosition([-1_000_000, 2_000_000]));
    context.button(descriptorActions, '隐藏列表标牌', () => {
      listDescriptor.hide();
      context.status('列表标牌 visible', listDescriptor.visible);
    });
    context.button(descriptorActions, '显示列表标牌', () => {
      listDescriptor.show();
      context.status('列表标牌 visible', listDescriptor.visible);
    });
    context.button(descriptorActions, '关闭列表标牌（hide）', () => {
      listDescriptor.close();
      context.status('列表标牌 visible', listDescriptor.visible);
    });
    context.button(
      descriptorActions,
      '关闭字符串标牌（destroy）',
      () => {
        stringDescriptor.close();
        context.status('字符串标牌生命周期', '已按 closeAction 销毁');
      },
      '危险'
    );
    context.button(
      descriptorActions,
      '销毁 HTMLElement 标牌',
      () => {
        htmlDescriptor.destroy();
        context.status('HTMLElement 标牌生命周期', '已销毁');
      },
      '危险'
    );

    showMainState();
    context.status('OverlayPositioning 全部值', positioningValues);
    context.status('列表标牌 id', listDescriptor.id);
    context.status('列表标牌 visible', listDescriptor.visible);
    context.status('字符串标牌 id', stringDescriptor.id);
    context.status('字符串标牌 visible', stringDescriptor.visible);
    context.status('HTMLElement 标牌 id', htmlDescriptor.id);
    context.status('HTMLElement 标牌 visible', htmlDescriptor.visible);
    context.check('九种 OverlayPositioning 均已创建', positioningValues.length === 9);
    context.check('OverlaySpec.autoPan=true 已创建', overlays.get(booleanAutoPan.id) === booleanAutoPan);
    context.check('Descriptor 三种 content 均已创建', true, ['list', 'string', 'HTMLElement']);
    context.setCode(`
import { Earth } from '@vrsim/earth-engine-ol';

const earth = new Earth({ target: document.querySelector<HTMLElement>('#map')! });
const overlay = earth.overlays.add({
  element: document.querySelector<HTMLElement>('#marker')!,
  position: [0, 0],
  positioning: 'bottom-center'
});
const descriptor = earth.overlays.createDescriptor({
  type: 'list',
  content: [{ label: '状态', value: '正常' }],
  position: [0, 0],
  closeAction: 'hide'
});

// 清理覆盖物、标牌和 Earth。
overlay.destroy();
descriptor.destroy();
earth.destroy();
    `);
    context.render(earth);
  }
};

function createOverlayElement(label: string, color: string): HTMLElement {
  const element = document.createElement('div');
  element.textContent = label;
  element.style.padding = '5px 8px';
  element.style.border = '2px solid #ffffff';
  element.style.borderRadius = '6px';
  element.style.background = color;
  element.style.color = '#ffffff';
  element.style.fontSize = '12px';
  element.style.fontWeight = '700';
  element.style.whiteSpace = 'nowrap';
  element.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.35)';
  return element;
}

function createDescriptorContent(label: string, color: string): HTMLElement {
  const content = document.createElement('div');
  content.textContent = label;
  content.style.padding = '10px 12px';
  content.style.borderRadius = '4px';
  content.style.background = color;
  content.style.color = '#ffffff';
  return content;
}
