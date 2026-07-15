import {
  Earth,
  InteractionConflictError,
  measureTypes,
  type InteractionPolicy,
  type MeasureResult,
  type MeasureSession,
  type MeasureType
} from '@vrsim/earth-engine-ol';
import type { ScenarioDefinition, SelectOption } from '../harness/types.js';

const layerId = 'acceptance-measure';
const measureOptions = [
  { label: '分段距离（distance-segments）', value: 'distance-segments' },
  { label: '总距离（distance-total）', value: 'distance-total' },
  { label: '径向距离（distance-radial）', value: 'distance-radial' },
  { label: '面积（area）', value: 'area' }
] as const satisfies readonly SelectOption<MeasureType>[];
const unitOptions = [
  { label: '米（m）', value: 'm' },
  { label: '千米（km）', value: 'km' },
  { label: '平方米（m²）', value: 'm²' },
  { label: '平方千米（km²）', value: 'km²' }
] as const;
const policyOptions = [
  { label: 'replace（替换当前交互）', value: 'replace' },
  { label: 'reject（拒绝冲突）', value: 'reject' }
] as const satisfies readonly SelectOption<InteractionPolicy>[];

export const measureScenario: ScenarioDefinition = {
  id: 'measure',
  group: '交互能力',
  title: 'Measure 测量',
  summary: '覆盖四种 MeasureType、全部 MeasureOptions、MeasureResult 字段、会话终态以及 replace/reject 冲突策略。',
  steps: [
    '依次选择 distance-segments、distance-total、distance-radial、area，点击“启动 Measure”并在地图上绘制。',
    '观察 change 事件的实时 MeasureResult；右键或点击 finish() 完成，并核对 complete 与 finished Promise。',
    '切换四种 unit、precision、自定义 formatter、point=false、line/text 样式和 showTotal 后重复测量。',
    '点击 cancel() 验证取消原因，再点击 clear() 清除已经保留的测量图形与标注。',
    '运行 replace/reject 冲突探针，确认测量与其他互斥交互使用同一协调策略。'
  ],
  mount(context) {
    const target = context.createMapTarget('Measure 交互地图');
    const earth = context.trackEarth(
      new Earth({
        target,
        view: { center: [0, 0], zoom: 4 },
        controls: { zoom: true, rotate: false, attribution: false }
      })
    );
    earth.layers.add({ kind: 'vector', id: layerId, zIndex: 30, wrapX: true, declutter: true });

    let mounted = true;
    let session: MeasureSession | undefined;
    let lastResult: MeasureResult | undefined;

    const optionsSection = context.section('测量参数（MeasureOptions）', '本实验台构造完整样式对象；单位与类型不匹配时会显示公开参数校验错误。');
    const type = context.select(optionsSection, '测量类型（type）', measureOptions, 'distance-total');
    const includeLayer = context.checkbox(optionsSection, '指定图层（layerId）', true);
    const includeUnit = context.checkbox(optionsSection, '显式传入单位（unit）', true);
    const unit = context.select(optionsSection, '测量单位（unit）', unitOptions, 'km');
    const precision = context.number(optionsSection, '小数精度（precision）', 2, { min: 0, max: 12, step: 1 });
    const customFormatter = context.checkbox(optionsSection, '自定义格式化（formatter）', true);
    const showTotal = context.checkbox(optionsSection, '显示总计（showTotal）', true);
    const showPoint = context.checkbox(optionsSection, '显示节点（point）', true);
    const policy = context.select(optionsSection, '冲突策略（policy）', policyOptions, 'replace');
    const lineColor = context.color(optionsSection, '测量线颜色（line.color）', '#2563eb');
    const pointColor = context.color(optionsSection, '节点填充色（point.fill.color）', '#f97316');
    const textColor = context.color(optionsSection, '文字填充色（text.fill.color）', '#ffffff');
    context.note(optionsSection, 'distance-* 仅接受 m/km，area 仅接受 m²/km²；取消“传入 unit”可验证默认单位。', '提示');
    const sessionActions = context.actions(optionsSection);

    const probeSection = context.section('服务与冲突探针', 'clear() 会清除 MeasureService 管理的全部测量结果，不删除普通业务元素。');
    const probeActions = context.actions(probeSection);

    type.addEventListener('change', () => {
      unit.value = type.value === 'area' ? 'km²' : 'km';
    });
    context.check(
      '测量类型选项完整覆盖 measureTypes',
      measureOptions.length === measureTypes.length && measureTypes.every((value) => measureOptions.some((option) => option.value === value))
    );

    const refresh = (): void => {
      if (!mounted) return;
      context.status('measureTypes', measureTypes);
      context.status('MeasureSession.status', session?.status ?? '未创建');
      context.status('MeasureResult', lastResult === undefined ? '尚无结果' : serializeResult(lastResult));
      context.render(earth);
    };

    const closeActive = (): void => {
      if (session?.status === 'active') session.cancel();
      session = undefined;
    };

    const subscribe = (current: MeasureSession): void => {
      context.track(
        current.on('change', (event) => {
          lastResult = event.result;
          context.log('Measure change 事件', '信息', serializeResult(event.result));
          refresh();
        })
      );
      context.track(
        current.on('complete', (event) => {
          lastResult = event.result;
          context.log('Measure complete 事件', '成功', serializeResult(event.result));
          context.check('complete 结果包含坐标与格式化值', event.result.coordinates.length > 0 && event.result.formatted.length > 0);
          refresh();
        })
      );
      context.track(
        current.on('cancel', (event) => {
          context.log('Measure cancel 事件', '警告', event);
          refresh();
        })
      );
      void current.finished.then((result) => {
        if (!mounted) return;
        context.log('MeasureSession.finished 已解析', '成功', result === undefined ? 'undefined' : serializeResult(result));
        refresh();
      });
    };

    const start = (): void => {
      closeActive();
      const selectedType = type.value as MeasureType;
      const selectedUnit = unit.value as MeasureResult['unit'];
      const current = earth.measure.start({
        type: selectedType,
        ...(includeLayer.checked ? { layerId } : {}),
        ...(includeUnit.checked ? { unit: selectedUnit } : {}),
        precision: Math.max(0, Math.trunc(precision.valueAsNumber || 0)),
        ...(customFormatter.checked
          ? {
              formatter: (value, resultUnit) => `自定义 ${value.toFixed(Math.max(0, Math.trunc(precision.valueAsNumber || 0)))} ${resultUnit}`
            }
          : {}),
        line: {
          color: lineColor.value,
          width: 4,
          lineDash: [12, 7],
          lineDashOffset: 2,
          lineCap: 'round',
          lineJoin: 'miter',
          miterLimit: 8,
          fitPatternOnce: false
        },
        point: showPoint.checked
          ? {
              type: 'circle',
              radius: 6,
              fill: { type: 'solid', color: pointColor.value },
              stroke: { color: '#ffffff', width: 2, lineCap: 'round', lineJoin: 'round' }
            }
          : false,
        text: {
          font: '600 13px sans-serif',
          fontFamily: 'sans-serif',
          fontSize: 13,
          fontWeight: 600,
          fontStyle: 'normal',
          fill: { type: 'solid', color: textColor.value },
          stroke: { color: '#0f172a', width: 2 },
          backgroundFill: { type: 'solid', color: 'rgba(15, 23, 42, 0.82)' },
          backgroundStroke: { color: '#38bdf8', width: 1 },
          padding: [5, 7, 5, 7],
          offsetX: 3,
          offsetY: 14,
          scale: 1,
          textAlign: 'center',
          textBaseline: 'middle',
          rotation: 0,
          justify: 'center'
        },
        showTotal: showTotal.checked,
        policy: policy.value as InteractionPolicy
      });
      session = current;
      context.track(() => {
        if (current.status === 'active') current.cancel();
      });
      subscribe(current);
      context.check('MeasureSession 已进入 active', current.status === 'active', current.status);
      refresh();
    };

    context.button(sessionActions, '启动 Measure', start, '主要');
    context.button(sessionActions, '完成测量 finish()', () => {
      session?.finish();
      refresh();
    });
    context.button(
      sessionActions,
      '取消测量 cancel()',
      () => {
        session?.cancel();
        refresh();
      },
      '危险'
    );

    context.button(
      probeActions,
      '清理测量结果 clear()',
      () => {
        earth.measure.clear();
        lastResult = undefined;
        context.check('clear() 执行后普通矢量图层仍存在', earth.layers.get(layerId) !== undefined);
        refresh();
      },
      '危险'
    );
    context.button(probeActions, '验证 policy=replace', () => {
      closeActive();
      const first = earth.measure.start({ type: 'distance-total', policy: 'replace' });
      const second = earth.measure.start({ type: 'distance-segments', policy: 'replace' });
      context.check('新测量替换旧测量', first.status === 'cancelled' && second.status === 'active', { first: first.status, second: second.status });
      second.cancel();
      refresh();
    });
    context.button(probeActions, '验证 policy=reject', () => {
      closeActive();
      const blocker = earth.measure.start({ type: 'distance-total', policy: 'replace' });
      let rejected = false;
      try {
        const unexpected = earth.measure.start({ type: 'area', policy: 'reject' });
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

    context.setCode(`
import { useEarth, type MeasureSession } from '@vrsim/earth-engine-ol';

const earth = useEarth();
earth.layers.add({ kind: 'vector', id: 'acceptance-measure' });
const session: MeasureSession = earth.measure.start({
  type: 'distance-total',
  layerId: 'acceptance-measure',
  unit: 'km',
  precision: 2,
  formatter: (value, unit) => \`自定义 \${value.toFixed(2)} \${unit}\`,
  showTotal: true,
  policy: 'replace'
});
session.on('change', ({ result }) => console.log(result));
session.on('complete', ({ result }) => console.log(result.geographicCoordinates));
`);

    context.track(closeActive);
    context.track(() => {
      mounted = false;
    });
    refresh();
  }
};

function serializeResult(result: MeasureResult): unknown {
  return {
    type: result.type,
    value: result.value,
    unit: result.unit,
    formatted: result.formatted,
    geometry: result.geometry,
    coordinates: result.coordinates,
    geographicCoordinates: result.geographicCoordinates,
    segments: result.segments
  };
}
