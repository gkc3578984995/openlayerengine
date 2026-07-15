import {
  Earth,
  InteractionConflictError,
  shapeTypes,
  type DrawSession,
  type EditSession,
  type Element,
  type InteractionPolicy,
  type ShapeType
} from '@vrsim/earth-engine-ol';
import type { ScenarioDefinition, SelectOption } from '../harness/types.js';

const layerId = 'acceptance-draw-edit';
const shapeOptions = [
  { label: '点（point）', value: 'point' },
  { label: '折线（polyline）', value: 'polyline' },
  { label: '多边形（polygon）', value: 'polygon' },
  { label: '圆（circle）', value: 'circle' },
  { label: '椭圆（ellipse）', value: 'ellipse' },
  { label: '进攻箭头（attack-arrow）', value: 'attack-arrow' },
  { label: '燕尾进攻箭头（tailed-attack-arrow）', value: 'tailed-attack-arrow' },
  { label: '细直箭头（fine-arrow）', value: 'fine-arrow' },
  { label: '燕尾分队战斗箭头（tailed-squad-combat-arrow）', value: 'tailed-squad-combat-arrow' },
  { label: '突击方向箭头（assault-direction-arrow）', value: 'assault-direction-arrow' },
  { label: '双箭头（double-arrow）', value: 'double-arrow' },
  { label: '矩形（rectangle）', value: 'rectangle' },
  { label: '三角形（triangle）', value: 'triangle' },
  { label: '等边三角形（equilateral-triangle）', value: 'equilateral-triangle' },
  { label: '集结区域（assemble-polygon）', value: 'assemble-polygon' },
  { label: '闭合曲面（closed-curve-polygon）', value: 'closed-curve-polygon' },
  { label: '扇形（sector）', value: 'sector' },
  { label: '弓形面（lune-polygon）', value: 'lune-polygon' },
  { label: '弓形线（lune-polyline）', value: 'lune-polyline' },
  { label: '曲线（curve-polyline）', value: 'curve-polyline' }
] as const satisfies readonly SelectOption<ShapeType>[];
const policyOptions = [
  { label: 'replace（替换当前交互）', value: 'replace' },
  { label: 'reject（拒绝冲突）', value: 'reject' }
] as const satisfies readonly SelectOption<InteractionPolicy>[];

export const drawEditScenario: ScenarioDefinition = {
  id: 'draw-edit',
  group: '交互能力',
  title: 'Draw 与动态 Edit',
  summary: '逐项验收 20 种 ShapeType、DrawOptions、EditOptions、会话控制、冲突策略、结果查询及全部公开事件。',
  steps: [
    '从 ShapeType 下拉框逐项选择图形，点击“启动 Draw”，再按地图提示完成绘制；不定长图形可右键或点击“finish()”结束。',
    '绘制过程中使用 undo()、redo()，并观察 start、change、click、complete、cancel 事件和 finished Promise。',
    '选择保留的元素后启动 Edit，拖动、插入或删除控制点，再分别验证 finish()、cancel()、destroy() 以及 underlay。',
    '执行 replace/reject 冲突探针，确认同一 Earth 始终只有一个互斥交互会话。',
    '使用 query()、clear(selector) 和 clear() 验证 DrawService 只管理自身完成的元素。'
  ],
  mount(context) {
    const target = context.createMapTarget('Draw / Edit 交互地图');
    const earth = context.trackEarth(
      new Earth({
        target,
        view: { center: [0, 0], zoom: 3 },
        controls: { zoom: true, rotate: false, attribution: false }
      })
    );
    earth.layers.add({ kind: 'vector', id: layerId, zIndex: 20, wrapX: true, declutter: false });

    let mounted = true;
    let drawSession: DrawSession | undefined;
    let editSession: EditSession | undefined;
    const seed = earth.elements.add({
      id: 'acceptance-edit-seed',
      layerId,
      module: 'draw-edit-seed',
      data: { source: '预置编辑元素' },
      geometry: {
        type: 'polygon',
        controlPoints: [
          [-2_800_000, -900_000],
          [-700_000, -900_000],
          [-1_750_000, 1_050_000]
        ]
      },
      style: {
        strokes: [{ color: '#f59e0b', width: 3 }],
        fill: { type: 'solid', color: 'rgba(245, 158, 11, 0.25)' },
        text: { text: '可编辑种子', fontSize: 13, fill: { type: 'solid', color: '#7c2d12' }, offsetY: -18 }
      }
    });
    let editable: Element | undefined = seed;

    const drawOptionsSection = context.section('绘制参数（DrawOptions）', '所有字段都会写入下一次 start() 调用。ShapeType 下拉框包含全部 20 种内置图形。');
    const shape = context.select(drawOptionsSection, '图形类型（type）', shapeOptions, 'polygon');
    const module = context.text(drawOptionsSection, '业务模块（module）', 'acceptance-draw');
    const limit = context.number(drawOptionsSection, '数量上限（limit）', 1, { min: 0, step: 1 });
    const keepGraphics = context.checkbox(drawOptionsSection, '保留图形（keepGraphics）', true);
    const policy = context.select(drawOptionsSection, '绘制冲突策略（policy）', policyOptions, 'replace');
    context.note(drawOptionsSection, '图形类型下拉框与公开 shapeTypes 一一对应，并为每个枚举值补充中文名称。', '提示');
    context.check(
      '图形类型选项完整覆盖 shapeTypes',
      shapeOptions.length === shapeTypes.length && shapeTypes.every((value) => shapeOptions.some((option) => option.value === value))
    );
    const drawActions = context.actions(drawOptionsSection);

    const editOptionsSection = context.section('编辑参数（EditOptions）', '编辑目标优先采用最近一次保留的绘制结果，没有结果时使用地图上的预置多边形。');
    const underlay = context.checkbox(editOptionsSection, '显示原始底图（underlay）', true);
    const editPolicy = context.select(editOptionsSection, '编辑冲突策略（policy）', policyOptions, 'replace');
    const editActions = context.actions(editOptionsSection);

    const serviceSection = context.section('服务与冲突探针', '直接验证 DrawService.query()、clear() 以及 replace/reject 两种互斥策略。');
    const serviceActions = context.actions(serviceSection);

    const refresh = (): void => {
      if (!mounted) return;
      if (editable !== undefined && earth.elements.get(editable.id) !== editable) editable = earth.elements.get(seed.id);
      context.status('DrawSession.status', drawSession?.status ?? '未创建');
      context.status('DrawSession.results', drawSession?.results.map((element) => element.id) ?? []);
      context.status('EditSession.status', editSession?.status ?? '未创建');
      context.status('EditSession.element', editSession?.element.id ?? '未创建');
      context.status(
        'DrawService.query()',
        earth.draw.query().map((element) => element.id)
      );
      context.status('当前编辑目标', editable?.id ?? '无');
      context.render(earth);
    };

    const closeExclusive = (): void => {
      if (drawSession?.status === 'active') drawSession.destroy();
      if (editSession?.status === 'active') editSession.destroy();
      drawSession = undefined;
      editSession = undefined;
    };

    const subscribeDraw = (session: DrawSession): void => {
      context.track(session.on('start', (event) => context.log('Draw start 事件', '信息', event)));
      context.track(session.on('change', (event) => context.log('Draw change 事件', '信息', event)));
      context.track(session.on('click', (event) => context.log('Draw click 事件', '信息', event)));
      context.track(
        session.on('complete', (event) => {
          context.log('Draw complete 事件', '成功', { id: event.element.id, state: event.element.state });
          if (keepGraphics.checked) editable = event.element;
          refresh();
        })
      );
      context.track(
        session.on('cancel', (event) => {
          context.log('Draw cancel 事件', '警告', event);
          refresh();
        })
      );
      void session.finished.then((results) => {
        if (!mounted) return;
        context.log(
          'DrawSession.finished 已解析',
          '成功',
          results.map((element) => element.id)
        );
        refresh();
      });
    };

    const subscribeEdit = (session: EditSession): void => {
      context.track(session.on('modifying', (event) => context.log('Edit modifying 事件', '信息', event)));
      context.track(
        session.on('complete', (event) => {
          editable = event.element;
          context.log('Edit complete 事件', '成功', { id: event.element.id, geometry: event.element.state.geometry });
          refresh();
        })
      );
      context.track(
        session.on('cancel', (event) => {
          context.log('Edit cancel 事件', '警告', event);
          refresh();
        })
      );
      void session.finished.then((element) => {
        if (!mounted) return;
        context.log('EditSession.finished 已解析', '成功', element?.id ?? 'undefined');
        refresh();
      });
    };

    context.button(
      drawActions,
      '启动 Draw',
      () => {
        closeExclusive();
        const session = earth.draw.start<{ createdBy: string; selectedType: ShapeType }>({
          type: shape.value as ShapeType,
          layerId,
          module: module.value,
          style: {
            strokes: [{ color: '#2563eb', width: 3, lineDash: [10, 6], lineCap: 'round', lineJoin: 'round' }],
            fill: { type: 'solid', color: 'rgba(37, 99, 235, 0.2)' },
            symbol: {
              type: 'circle',
              radius: 7,
              fill: { type: 'solid', color: '#2563eb' },
              stroke: { color: '#ffffff', width: 2 }
            },
            text: { text: shape.value, fontSize: 12, fill: { type: 'solid', color: '#0f172a' }, offsetY: -16 }
          },
          data: { createdBy: 'draw-edit 验收场景', selectedType: shape.value as ShapeType },
          limit: Math.max(0, Math.trunc(limit.valueAsNumber || 0)),
          keepGraphics: keepGraphics.checked,
          policy: policy.value as InteractionPolicy
        });
        drawSession = session;
        context.track(() => {
          if (session.status === 'active') session.destroy();
        });
        subscribeDraw(session);
        context.check('DrawSession 已进入 active', session.status === 'active', session.status);
        refresh();
      },
      '主要'
    );
    context.button(drawActions, '完成绘制 finish()', () => {
      drawSession?.finish();
      refresh();
    });
    context.button(drawActions, '取消绘制 cancel()', () => {
      drawSession?.cancel();
      refresh();
    });
    context.button(
      drawActions,
      '销毁绘制会话 destroy()',
      () => {
        drawSession?.destroy();
        refresh();
      },
      '危险'
    );
    context.button(drawActions, '撤销绘制 undo()', () => {
      context.status('Draw undo() 返回值', drawSession?.undo() ?? false);
      refresh();
    });
    context.button(drawActions, '重做绘制 redo()', () => {
      context.status('Draw redo() 返回值', drawSession?.redo() ?? false);
      refresh();
    });

    context.button(
      editActions,
      '启动 Edit',
      () => {
        closeExclusive();
        const targetElement = editable;
        if (targetElement === undefined) throw new Error('当前没有可编辑元素');
        const session = earth.draw.edit(targetElement, {
          underlay: underlay.checked,
          policy: editPolicy.value as InteractionPolicy
        });
        editSession = session;
        context.track(() => {
          if (session.status === 'active') session.destroy();
        });
        subscribeEdit(session);
        context.check('EditSession.element 保持原句柄', session.element === targetElement, session.element.id);
        refresh();
      },
      '主要'
    );
    context.button(editActions, '完成编辑 finish()', () => {
      editSession?.finish();
      refresh();
    });
    context.button(editActions, '取消编辑 cancel()', () => {
      editSession?.cancel();
      refresh();
    });
    context.button(
      editActions,
      '销毁编辑会话 destroy()',
      () => {
        editSession?.destroy();
        refresh();
      },
      '危险'
    );
    context.button(editActions, '撤销编辑 undo()', () => {
      context.status('Edit undo() 返回值', editSession?.undo() ?? false);
      refresh();
    });
    context.button(editActions, '重做编辑 redo()', () => {
      context.status('Edit redo() 返回值', editSession?.redo() ?? false);
      refresh();
    });

    context.button(serviceActions, '按选择器查询 query(selector)', () => {
      const results = earth.draw.query({ module: module.value, type: shape.value as ShapeType });
      context.status(
        'query(selector) 结果',
        results.map((element) => element.id)
      );
      context.check(
        'query() 结果都属于指定 module',
        results.every((element) => element.state.module === module.value)
      );
    });
    context.button(
      serviceActions,
      '按选择器清理 clear(selector)',
      () => {
        const removed = earth.draw.clear({ module: module.value });
        editable = earth.elements.get(seed.id);
        context.status('clear(selector) 返回值', removed);
        refresh();
      },
      '危险'
    );
    context.button(
      serviceActions,
      '清理全部绘制 clear()',
      () => {
        const removed = earth.draw.clear();
        editable = earth.elements.get(seed.id);
        context.status('clear() 返回值', removed);
        refresh();
      },
      '危险'
    );
    context.button(serviceActions, '验证 policy=replace', () => {
      closeExclusive();
      const first = earth.draw.start({ type: 'point', layerId, policy: 'replace' });
      const second = earth.draw.start({ type: 'point', layerId, policy: 'replace' });
      context.check('新会话替换旧会话', first.status === 'cancelled' && second.status === 'active', { first: first.status, second: second.status });
      second.cancel();
      first.destroy();
      second.destroy();
      refresh();
    });
    context.button(serviceActions, '验证 policy=reject', () => {
      closeExclusive();
      const blocker = earth.draw.start({ type: 'point', layerId, policy: 'replace' });
      let rejected = false;
      try {
        const unexpected = earth.draw.start({ type: 'point', layerId, policy: 'reject' });
        unexpected.destroy();
      } catch (error) {
        rejected = error instanceof InteractionConflictError;
        context.log('reject 冲突结果', rejected ? '成功' : '错误', error);
      } finally {
        blocker.destroy();
      }
      context.check('policy=reject 抛出 InteractionConflictError', rejected);
      refresh();
    });
    context.button(serviceActions, '验证 Edit policy=replace', () => {
      closeExclusive();
      const targetElement = requireCurrentElement(earth.elements.get(seed.id), seed.id);
      const blocker = earth.draw.start({ type: 'point', layerId, policy: 'replace' });
      let editor: EditSession | undefined;
      try {
        editor = earth.draw.edit(targetElement, { underlay: true, policy: 'replace' });
        context.check('Edit replace 取消旧 Draw 并进入 active', blocker.status === 'cancelled' && editor.status === 'active', {
          draw: blocker.status,
          edit: editor.status
        });
      } finally {
        editor?.destroy();
        blocker.destroy();
      }
      refresh();
    });
    context.button(serviceActions, '验证 Edit policy=reject', () => {
      closeExclusive();
      const targetElement = requireCurrentElement(earth.elements.get(seed.id), seed.id);
      const blocker = earth.draw.start({ type: 'point', layerId, policy: 'replace' });
      let rejected = false;
      let blockerPreserved = false;
      try {
        const unexpected = earth.draw.edit(targetElement, { underlay: false, policy: 'reject' });
        unexpected.destroy();
      } catch (error) {
        rejected = error instanceof InteractionConflictError;
        blockerPreserved = blocker.status === 'active';
        context.log('Edit reject 冲突结果', rejected ? '成功' : '错误', error);
      } finally {
        blocker.destroy();
      }
      context.check('Edit reject 抛错且保留旧 Draw', rejected && blockerPreserved, { rejected, blockerPreserved });
      refresh();
    });

    context.setCode(`
import { useEarth, type DrawSession, type EditSession } from '@vrsim/earth-engine-ol';

const earth = useEarth();
earth.layers.add({ kind: 'vector', id: 'acceptance-draw-edit' });
const draw: DrawSession = earth.draw.start({
  type: 'polygon',
  layerId: 'acceptance-draw-edit',
  module: 'acceptance-draw',
  limit: 1,
  keepGraphics: true,
  policy: 'replace'
});
draw.on('complete', ({ element }) => {
  const edit: EditSession = earth.draw.edit(element, { underlay: true, policy: 'replace' });
  edit.on('modifying', (event) => console.log(event));
});
`);

    context.track(closeExclusive);
    context.track(() => {
      mounted = false;
    });
    refresh();
  }
};

function requireCurrentElement(element: Element | undefined, id: string): Element {
  if (element === undefined) throw new Error(`元素 ${id} 已不存在，请重置场景`);
  return element;
}
