import {
  Earth,
  InteractionConflictError,
  type Coordinate,
  type Element,
  type InteractionPolicy,
  type TransformEventMap,
  type TransformMode,
  type TransformOptions,
  type TransformSession,
  type TransformToolbarHandle,
  type TransformTranslateMode
} from '@vrsim/earth-engine-ol';
import type { ScenarioDefinition, SelectOption } from '../harness/types.js';

const layerId = 'acceptance-transform';
const translateOptions = [
  { label: 'none（禁止平移）', value: 'none' },
  { label: 'center（中心手柄）', value: 'center' },
  { label: 'feature（直接拖动元素）', value: 'feature' }
] as const satisfies readonly SelectOption<TransformTranslateMode>[];
const policyOptions = [
  { label: 'replace（替换当前交互）', value: 'replace' },
  { label: 'reject（拒绝冲突）', value: 'reject' }
] as const satisfies readonly SelectOption<InteractionPolicy>[];
const toolbarOptions = [
  { label: 'false（不显示）', value: 'false' },
  { label: 'true（默认工具栏）', value: 'true' },
  { label: 'options（自定义工具栏）', value: 'options' }
] as const;
const transformEvents = [
  'select',
  'selectEnd',
  'enterHandle',
  'leaveHandle',
  'translateStart',
  'translating',
  'translateEnd',
  'rotateStart',
  'rotating',
  'rotateEnd',
  'scaleStart',
  'scaling',
  'scaleEnd',
  'edit',
  'copyPreviewConfirm',
  'copyPreviewCancel',
  'remove',
  'error'
] as const satisfies readonly (keyof TransformEventMap)[];

export const transformScenario: ScenarioDefinition = {
  id: 'transform',
  group: '交互能力',
  title: 'Transform 变换',
  summary: '覆盖 TransformOptions、三种平移模式、选择过滤、事务历史、复制替换删除、自定义 Toolbar 及全部 TransformEventMap。',
  steps: [
    '点击“select(element, options)”直接选中橙色矩形，拖动主体与各手柄验证平移、缩放、拉伸、旋转和顶点编辑。',
    '切换 translate 的 none/center/feature，并组合 scale、stretch、rotate、translateBBox、noFlip、keepRectangle 后重新启动。',
    '点击“复制选中元素 copy(options)”执行确定性确认路径，核对新元素以及 copyPreviewConfirm 事件自动检查；再执行 undo()、redo()、replaceSelected()、remove()。',
    '分别选择默认和自定义 toolbar，执行 setActive()、updateItem()、updateOptions()、show()、hide()、destroy()；点击工具栏“复制”进入预览后右键取消，确认 copyPreviewCancel 事件。',
    '使用 finish() 提交或 cancel() 回滚，再运行 replace/reject 冲突探针。'
  ],
  mount(context) {
    const target = context.createMapTarget('Transform 交互地图');
    const earth = context.trackEarth(
      new Earth({
        target,
        view: { center: [0, 0], zoom: 3 },
        controls: { zoom: true, rotate: false, attribution: false }
      })
    );
    earth.layers.add({ kind: 'vector', id: layerId, zIndex: 40, wrapX: true, declutter: false });

    const primary = earth.elements.add({
      id: 'transform-primary',
      layerId,
      module: 'transform-demo',
      data: { name: '橙色矩形', enabled: true },
      geometry: {
        type: 'rectangle',
        controlPoints: [
          [-3_200_000, -1_500_000],
          [-400_000, 1_200_000]
        ]
      },
      style: {
        strokes: [{ color: '#f97316', width: 3 }],
        fill: { type: 'solid', color: 'rgba(249, 115, 22, 0.28)' },
        text: { text: '主元素', fontSize: 14, fill: { type: 'solid', color: '#7c2d12' } }
      }
    });
    const replacement = earth.elements.add({
      id: 'transform-replacement',
      layerId,
      module: 'transform-demo',
      data: { name: '蓝色三角形', enabled: true },
      geometry: {
        type: 'triangle',
        controlPoints: [
          [800_000, -1_400_000],
          [3_400_000, -1_100_000],
          [2_000_000, 1_400_000]
        ]
      },
      style: {
        strokes: [{ color: '#2563eb', width: 3 }],
        fill: { type: 'solid', color: 'rgba(37, 99, 235, 0.24)' },
        text: { text: '替换元素', fontSize: 14, fill: { type: 'solid', color: '#1e3a8a' } }
      }
    });

    let session: TransformSession | undefined;
    let lastCopy: Element | undefined;
    let errorEventCount = 0;
    let copyPreviewConfirmCount = 0;
    let copyPreviewCancelCount = 0;

    const optionsSection = context.section('变换参数（TransformOptions）', '修改字段后需重新启动会话；selector、predicate 与 layerIds 会同时参与选择过滤。');
    const translate = context.select(optionsSection, '平移模式（translate）', translateOptions, 'feature');
    const scale = context.checkbox(optionsSection, '允许缩放（scale）', true);
    const stretch = context.checkbox(optionsSection, '允许拉伸（stretch）', true);
    const rotate = context.checkbox(optionsSection, '允许旋转（rotate）', true);
    const translateBBox = context.checkbox(optionsSection, '平移包围框（translateBBox）', false);
    const noFlip = context.checkbox(optionsSection, '禁止翻转（noFlip）', true);
    const keepRectangle = context.checkbox(optionsSection, '保持矩形（keepRectangle）', true);
    const hitTolerance = context.number(optionsSection, '命中容差（hitTolerance）', 5, { min: 0, step: 1 });
    const buffer = context.number(optionsSection, '手柄缓冲（buffer）', 16, { min: 0, step: 1 });
    const pointRadius = context.number(optionsSection, '点手柄半径（pointRadius）', 8, { min: 1, step: 1 });
    const historyLimit = context.number(optionsSection, '历史上限（historyLimit）', 12, { min: 1, step: 1 });
    const includeSelector = context.checkbox(optionsSection, '启用选择器（selector）', true);
    const includePredicate = context.checkbox(optionsSection, '启用谓词（predicate）', true);
    const includeLayerIds = context.checkbox(optionsSection, '限制图层（layerIds）', true);
    const includeHandleStyle = context.checkbox(optionsSection, '使用自定义控制柄（handleStyle）', false);
    const includeHandleCenter = context.checkbox(optionsSection, '指定手柄中心（handleCenter）', false);
    const toolbarMode = context.select(optionsSection, '工具栏模式（toolbar）', toolbarOptions, 'true');
    const toolbarVisible = context.checkbox(optionsSection, '工具栏可见（toolbar.visible）', true);
    const policy = context.select(optionsSection, '冲突策略（policy）', policyOptions, 'replace');
    const startActions = context.actions(optionsSection);

    const sessionSection = context.section('变换会话（TransformSession）', '按钮覆盖会话的公开方法；几何操作本身请直接在地图中拖动。');
    const retainHistory = context.checkbox(sessionSection, '保留历史（retainHistory）', true);
    const sessionActions = context.actions(sessionSection);

    const toolbarSection = context.section('工具栏句柄（TransformToolbarHandle）', '先选择元素并启用 toolbar，然后逐项执行工具栏句柄方法。');
    context.note(toolbarSection, '触发 copyPreviewCancel：点击地图工具栏中的“复制”，移动复制预览后在地图内右键取消。', '提示');
    const toolbarActions = context.actions(toolbarSection);

    const conflictSection = context.section('冲突策略', 'replace 应取消旧会话；reject 应保留旧会话并抛出 InteractionConflictError。');
    const conflictActions = context.actions(conflictSection);

    const refresh = (): void => {
      context.status('TransformSession.status', session?.status ?? '未创建');
      context.status('TransformSession.selected', session?.selected?.id ?? '未选择');
      context.status('TransformSession.mode', session?.mode ?? '未选择');
      context.status('TransformSession.toolbar', session?.toolbar === undefined ? '无' : '已创建');
      context.status('最近 copy()', lastCopy?.id ?? '无');
      context.status('copyPreviewConfirm 事件数', copyPreviewConfirmCount);
      context.status('copyPreviewCancel 事件数', copyPreviewCancelCount);
      context.status('主元素几何', earth.elements.get(primary.id)?.state.geometry ?? '已移除');
      context.status('替换元素几何', earth.elements.get(replacement.id)?.state.geometry ?? '已移除');
      context.render(earth);
    };

    const closeActive = (): void => {
      if (session?.status === 'active') session.cancel();
      session = undefined;
    };

    const buildOptions = (): TransformOptions => ({
      ...(includeSelector.checked ? { selector: { module: 'transform-demo', visible: true } } : {}),
      ...(includePredicate.checked ? { predicate: (element) => (element.state.data as { enabled?: boolean } | undefined)?.enabled === true } : {}),
      ...(includeLayerIds.checked ? { layerIds: [layerId] } : {}),
      hitTolerance: Math.max(0, hitTolerance.valueAsNumber || 0),
      translate: translate.value as TransformTranslateMode,
      scale: scale.checked,
      stretch: stretch.checked,
      rotate: rotate.checked,
      translateBBox: translateBBox.checked,
      noFlip: noFlip.checked,
      keepRectangle: keepRectangle.checked,
      buffer: Math.max(0, buffer.valueAsNumber || 0),
      pointRadius: Math.max(1, pointRadius.valueAsNumber || 1),
      ...(includeHandleStyle.checked
        ? {
            handleStyle: {
              symbol: {
                type: 'circle' as const,
                radius: 7,
                fill: { type: 'solid' as const, color: '#ffffff' },
                stroke: { color: '#dc2626', width: 2 }
              },
              text: { text: '', fontSize: 11, fill: { type: 'solid' as const, color: '#111827' } },
              zIndex: 1_000
            }
          }
        : {}),
      ...(includeHandleCenter.checked ? { handleCenter: [0, 2_000_000] as Coordinate } : {}),
      historyLimit: Math.max(1, Math.trunc(historyLimit.valueAsNumber || 1)),
      toolbar:
        toolbarMode.value === 'false'
          ? false
          : toolbarMode.value === 'true'
            ? true
            : {
                items: [
                  {
                    key: 'exit',
                    title: '确认并退出',
                    icon: '✓',
                    iconClass: 'acceptance-toolbar-exit',
                    visible: true,
                    disabled: false,
                    active: true
                  },
                  { key: 'undo', title: '撤销', icon: '↶', iconClass: 'acceptance-toolbar-undo', visible: true, disabled: true, active: false },
                  { key: 'redo', title: '重做', icon: '↷', iconClass: 'acceptance-toolbar-redo', visible: true, disabled: true, active: false },
                  { key: 'copy', title: '复制', icon: '⧉', iconClass: 'acceptance-toolbar-copy', visible: true, disabled: false, active: false },
                  { key: 'edit', title: '编辑', icon: '✎', iconClass: 'acceptance-toolbar-edit', visible: true, disabled: false, active: false },
                  { key: 'remove', title: '删除', icon: '×', iconClass: 'acceptance-toolbar-remove', visible: true, disabled: false, active: false }
                ],
                offset: [12, -44],
                className: 'acceptance-transform-toolbar',
                visible: toolbarVisible.checked
              },
      policy: policy.value as InteractionPolicy
    });

    const subscribe = (current: TransformSession): void => {
      for (const eventName of transformEvents) {
        context.track(
          current.on(eventName, (event) => {
            if (eventName === 'error') errorEventCount += 1;
            if (eventName === 'copyPreviewConfirm') copyPreviewConfirmCount += 1;
            if (eventName === 'copyPreviewCancel') copyPreviewCancelCount += 1;
            context.log(`Transform ${eventName} 事件`, eventName === 'error' ? '错误' : '信息', serializeEvent(event));
            refresh();
          })
        );
      }
    };

    const activate = (current: TransformSession): void => {
      session = current;
      context.track(() => {
        if (current.status === 'active') current.cancel();
      });
      subscribe(current);
      context.check('TransformSession 已进入 active', current.status === 'active', current.status);
      refresh();
    };

    context.button(
      startActions,
      '按配置启动 start(options)',
      () => {
        closeActive();
        activate(earth.transform.start(buildOptions()));
      },
      '主要'
    );
    context.button(startActions, 'start() 默认参数', () => {
      closeActive();
      activate(earth.transform.start());
    });
    context.button(
      startActions,
      '选择元素并启动 select(element, options)',
      () => {
        closeActive();
        activate(earth.transform.select(requireElement(earth.elements.get(primary.id), primary.id), buildOptions()));
      },
      '主要'
    );

    context.button(sessionActions, '选择主元素 select()', () => {
      session?.select(requireElement(earth.elements.get(primary.id), primary.id));
      refresh();
    });
    context.button(sessionActions, '选择替换元素 select()', () => {
      session?.select(requireElement(earth.elements.get(replacement.id), replacement.id));
      refresh();
    });
    context.button(sessionActions, '进入变换模式 setMode("transform")', () => {
      session?.setMode('transform' satisfies TransformMode);
      refresh();
    });
    context.button(sessionActions, '进入顶点编辑 setMode("edit")', () => {
      session?.setMode('edit' satisfies TransformMode);
      refresh();
    });
    context.button(sessionActions, '完成变换 finish()', () => {
      session?.finish();
      refresh();
    });
    context.button(
      sessionActions,
      '取消变换 cancel()',
      () => {
        session?.cancel();
        refresh();
      },
      '危险'
    );
    context.button(sessionActions, '撤销变换 undo()', () => {
      context.status('undo() 返回值', session?.undo() ?? false);
      refresh();
    });
    context.button(sessionActions, '重做变换 redo()', () => {
      context.status('redo() 返回值', session?.redo() ?? false);
      refresh();
    });
    context.button(sessionActions, '复制选中元素 copy(options)', () => {
      const selected = session?.selected;
      if (session === undefined || selected === undefined) throw new Error('请先选择一个元素');
      const before = copyPreviewConfirmCount;
      lastCopy = session.copy({
        geometry: selected.state.geometry,
        style: {
          strokes: [{ color: '#22c55e', width: 3 }],
          fill: { type: 'solid', color: 'rgba(34, 197, 94, 0.2)' },
          text: { text: 'copy()', fontSize: 12, fill: { type: 'solid', color: '#14532d' } }
        },
        data: { copiedBy: 'TransformSession.copy' },
        module: 'transform-copy',
        layerId,
        visible: true
      });
      context.check('copy() 返回新的 Element', lastCopy.id !== selected.id, lastCopy.id);
      context.check('copy(options) 同步触发 copyPreviewConfirm', copyPreviewConfirmCount === before + 1, {
        before,
        after: copyPreviewConfirmCount
      });
      refresh();
    });
    context.button(sessionActions, '替换选中元素 replaceSelected()', () => {
      if (session === undefined) throw new Error('请先启动 TransformSession');
      const selectedId = session.selected?.id;
      const next =
        selectedId === primary.id
          ? requireElement(earth.elements.get(replacement.id), replacement.id)
          : requireElement(earth.elements.get(primary.id), primary.id);
      session.replaceSelected(next, { retainHistory: retainHistory.checked });
      refresh();
    });
    context.button(
      sessionActions,
      '移除选中元素 remove()',
      () => {
        session?.remove();
        refresh();
      },
      '危险'
    );

    const requireToolbar = (): TransformToolbarHandle => {
      const toolbar = session?.toolbar;
      if (toolbar === undefined) throw new Error('当前会话没有 Toolbar，请启用并选择元素');
      return toolbar;
    };
    context.button(toolbarActions, '激活编辑项 setActive("edit")', () => requireToolbar().setActive('edit'));
    context.button(toolbarActions, '更新撤销项 updateItem("undo")', () =>
      requireToolbar().updateItem('undo', {
        title: '撤销（已更新）',
        icon: '↶',
        iconClass: 'acceptance-toolbar-undo-updated',
        visible: true,
        disabled: false,
        active: true
      })
    );
    context.button(toolbarActions, '更新工具栏选项 updateOptions()', () =>
      requireToolbar().updateOptions({
        position: [0, 2_100_000],
        offset: [24, -58],
        className: 'acceptance-transform-toolbar-updated',
        visible: true
      })
    );
    context.button(toolbarActions, '显示工具栏 show()', () => requireToolbar().show());
    context.button(toolbarActions, '隐藏工具栏 hide()', () => requireToolbar().hide());
    context.button(toolbarActions, '销毁工具栏 destroy()', () => requireToolbar().destroy(), '危险');

    context.button(conflictActions, '验证 policy=replace', () => {
      closeActive();
      const first = earth.transform.start({ toolbar: false, policy: 'replace' });
      const second = earth.transform.start({ toolbar: false, policy: 'replace' });
      context.check('新 Transform 替换旧 Transform', first.status === 'cancelled' && second.status === 'active', {
        first: first.status,
        second: second.status
      });
      second.cancel();
      refresh();
    });
    context.button(conflictActions, '验证 policy=reject', () => {
      closeActive();
      const blocker = earth.transform.start({ toolbar: false, policy: 'replace' });
      let rejected = false;
      try {
        const unexpected = earth.transform.start({ toolbar: false, policy: 'reject' });
        unexpected.cancel();
      } catch (error) {
        rejected = error instanceof InteractionConflictError;
        context.log('reject 冲突结果', rejected ? '成功' : '错误', error);
      } finally {
        blocker.cancel();
      }
      context.check('policy=reject 抛出 InteractionConflictError', rejected);
      refresh();
    });
    context.button(conflictActions, '触发 Transform error 事件', () => {
      closeActive();
      const targetElement = requireElement(earth.elements.get(primary.id), primary.id);
      const before = errorEventCount;
      const probe = earth.transform.select(targetElement, { toolbar: false, policy: 'replace' });
      activate(probe);
      targetElement.update({ data: { name: '橙色矩形', enabled: true, errorProbe: Date.now() } });
      context.check('外部更新选中元素会触发 error 并取消会话', errorEventCount === before + 1 && probe.status === 'cancelled', {
        errorEvents: errorEventCount - before,
        status: probe.status
      });
      refresh();
    });

    context.setCode(`
import { useEarth, type TransformSession } from '@vrsim/earth-engine-ol';

const earth = useEarth();
const element = earth.elements.get('transform-primary');
if (element) {
  const session: TransformSession = earth.transform.select(element, {
    selector: { module: 'transform-demo' },
    layerIds: ['acceptance-transform'],
    translate: 'feature',
    scale: true,
    stretch: true,
    rotate: true,
    historyLimit: 12,
    toolbar: true,
    policy: 'replace'
  });
  session.on('translating', (event) => console.log(event));
}
`);

    context.track(closeActive);
    refresh();
  }
};

function requireElement(element: Element | undefined, id: string): Element {
  if (element === undefined) throw new Error(`元素 ${id} 已不存在，请重置场景`);
  return element;
}

function serializeEvent(event: TransformEventMap[keyof TransformEventMap]): unknown {
  if ('error' in event) return { type: event.type, error: event.error instanceof Error ? event.error.message : String(event.error) };
  if ('element' in event) return { ...event, element: { id: event.element.id, state: event.element.state } };
  return event;
}
