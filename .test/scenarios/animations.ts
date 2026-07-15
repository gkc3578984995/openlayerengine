import { Earth, animationTypes, type AnimationHandle, type AnimationSpec, type AnimationType, type ElementSelector } from '@vrsim/earth-engine-ol';
import type { ScenarioDefinition, SelectOption } from '../harness/types.js';

const layerId = 'acceptance-animations';
const animationOptions = [
  { label: '脉冲（pulse）', value: 'pulse' },
  { label: '虚线流动（dash-flow）', value: 'dash-flow' },
  { label: '路径运动（path-travel）', value: 'path-travel' }
] as const satisfies readonly SelectOption<AnimationType>[];
const timingOptions = [
  { label: 'durationMs（固定时长）', value: 'duration' },
  { label: 'speed（按路径速度）', value: 'speed' }
] as const;
const finishOptions = [
  { label: 'remove（结束后移除渲染结果）', value: 'remove' },
  { label: 'retain（结束后保留最终结果）', value: 'retain' }
] as const;

export const animationsScenario: ScenarioDefinition = {
  id: 'animations',
  group: '表现能力',
  title: '统一 AnimationManager',
  summary: '在一个 Earth 中验收 pulse、dash-flow、path-travel 全部参数，以及 Manager 与 Handle 两层暂停、恢复、停止和完成状态。',
  steps: [
    '依次选择 pulse、dash-flow、path-travel 并点击 play()；三类动画会自动匹配地图上的点、虚线和路径元素。',
    '调节每种 AnimationSpec 的全部字段，尤其验证 path-travel 的 speed/durationMs 互斥以及 remove/retain 结束行为。',
    '使用 AnimationHandle.pause()/resume()/stop()，核对 id、status 和 finished Promise。',
    '使用 AnimationManager.pause()/resume()/stop()，分别传入和省略 channels，核对受影响数量。',
    '启动多个动画后执行 stopAll()，确认所有活动渲染通道都停止且业务元素仍存在。'
  ],
  mount(context) {
    const target = context.createMapTarget('统一动画地图');
    const earth = context.trackEarth(
      new Earth({
        target,
        view: { center: [0, 0], zoom: 3 },
        controls: { zoom: true, rotate: false, attribution: false }
      })
    );
    earth.layers.add({ kind: 'vector', id: layerId, zIndex: 25, wrapX: true, declutter: false });

    const point = earth.elements.add({
      id: 'animation-pulse-point',
      layerId,
      module: 'animation-demo',
      geometry: { type: 'point', controlPoints: [[-2_600_000, 600_000]] },
      style: {
        symbol: { type: 'circle', radius: 8, fill: { type: 'solid', color: '#ef4444' }, stroke: { color: '#ffffff', width: 2 } },
        text: { text: 'pulse', fontSize: 13, fill: { type: 'solid', color: '#7f1d1d' }, offsetY: -20 }
      }
    });
    const dashLine = earth.elements.add({
      id: 'animation-dash-line',
      layerId,
      module: 'animation-demo',
      geometry: {
        type: 'polyline',
        controlPoints: [
          [-3_600_000, -1_400_000],
          [-1_600_000, -500_000],
          [300_000, -1_400_000]
        ]
      },
      style: {
        strokes: [
          { color: '#ffffff', width: 7 },
          { color: '#2563eb', width: 4, lineDash: [12, 8] }
        ],
        text: { text: 'dash-flow', fontSize: 13, fill: { type: 'solid', color: '#1e3a8a' }, placement: 'line' }
      }
    });
    const travelLine = earth.elements.add({
      id: 'animation-travel-line',
      layerId,
      module: 'animation-demo',
      geometry: {
        type: 'polyline',
        controlPoints: [
          [600_000, 1_300_000],
          [3_700_000, -800_000]
        ]
      },
      style: {
        strokes: [{ color: 'rgba(14, 116, 144, 0.35)', width: 2 }],
        text: { text: 'path-travel', fontSize: 13, fill: { type: 'solid', color: '#164e63' }, placement: 'line' }
      }
    });

    let mounted = true;
    let handle: AnimationHandle | undefined;
    const handles = new Set<AnimationHandle>();

    const optionsSection = context.section('动画参数（AnimationSpec）', '选择动画类型后，下方全部字段会组成对应公开联合类型。');
    const type = context.select(optionsSection, '动画类型（type）', animationOptions, 'pulse');
    const channel = context.text(optionsSection, '动画通道（channel）', 'acceptance-animation');
    const color = context.color(optionsSection, '动画颜色（color）', '#ef4444');
    const repeat = context.checkbox(optionsSection, '循环播放（repeat）', true);
    const periodMs = context.number(optionsSection, '脉冲周期（pulse.periodMs）', 1_200, { min: 1, step: 100 });
    const radius = context.number(optionsSection, '脉冲半径（pulse.radius）', 10, { min: 1, step: 1 });
    const dashSpeed = context.number(optionsSection, '虚线速度（dash-flow.speed）', 32, { step: 1 });
    const lineDash = context.text(optionsSection, '虚线序列（dash-flow.lineDash）', '14,8,3,8');
    const timing = context.select(optionsSection, '路径计时方式（speed/durationMs）', timingOptions, 'duration');
    const travelSpeed = context.number(optionsSection, '路径速度（path-travel.speed）', 1_500_000, { min: 1, step: 100_000 });
    const durationMs = context.number(optionsSection, '路径时长（path-travel.durationMs）', 2_500, { min: 1, step: 100 });
    const trailLength = context.number(optionsSection, '尾迹长度（trailLength）', 0.35, { min: 0.01, max: 1, step: 0.05 });
    const width = context.number(optionsSection, '路径宽度（width）', 5, { min: 0.1, step: 0.5 });
    const curvature = context.number(optionsSection, '路径曲率（curvature）', 0.45, { min: -2, max: 2, step: 0.05 });
    const smoothness = context.number(optionsSection, '路径平滑度（smoothness）', 180, { min: 1, max: 2048, step: 1 });
    const arrow = context.checkbox(optionsSection, '显示箭头（arrow）', true);
    const arrowColor = context.color(optionsSection, '箭头颜色（arrowColor）', '#ffffff');
    const showStart = context.checkbox(optionsSection, '显示起点（showStart）', true);
    const showEnd = context.checkbox(optionsSection, '显示终点（showEnd）', true);
    const endLineColor = context.color(optionsSection, '结束线颜色（endLineColor）', '#22c55e');
    const gradientStart = context.color(optionsSection, '渐变起色（gradient[0]）', '#38bdf8');
    const gradientMiddle = context.color(optionsSection, '渐变中色（gradient[1]）', '#a855f7');
    const gradientEnd = context.color(optionsSection, '渐变终色（gradient[2]）', '#f97316');
    const finishBehavior = context.select(optionsSection, '结束行为（finishBehavior）', finishOptions, 'retain');
    const playActions = context.actions(optionsSection);

    const handleSection = context.section('动画句柄（AnimationHandle）', '这些按钮只操作最近一次 play() 返回的句柄。');
    const handleActions = context.actions(handleSection);

    const managerSection = context.section('动画管理器（AnimationManager）', 'Manager 按 ElementSelector 批量操作；勾选 channels 时只影响当前 channel。');
    const filterChannel = context.checkbox(managerSection, '按通道过滤（channels）', true);
    const managerActions = context.actions(managerSection);

    const selectorForType = (selected: AnimationType): ElementSelector => ({
      id: selected === 'pulse' ? point.id : selected === 'dash-flow' ? dashLine.id : travelLine.id
    });

    const buildSpec = (): AnimationSpec => {
      const selected = type.value as AnimationType;
      if (selected === 'pulse') {
        return {
          type: 'pulse',
          channel: channel.value,
          periodMs: Math.max(1, periodMs.valueAsNumber || 1),
          color: color.value,
          repeat: repeat.checked,
          radius: Math.max(1, radius.valueAsNumber || 1)
        };
      }
      if (selected === 'dash-flow') {
        return {
          type: 'dash-flow',
          channel: channel.value,
          speed: Number.isFinite(dashSpeed.valueAsNumber) ? dashSpeed.valueAsNumber : 0,
          lineDash: parseLineDash(lineDash.value),
          color: color.value
        };
      }
      return {
        type: 'path-travel',
        channel: channel.value,
        ...(timing.value === 'speed' ? { speed: Math.max(1, travelSpeed.valueAsNumber || 1) } : { durationMs: Math.max(1, durationMs.valueAsNumber || 1) }),
        repeat: repeat.checked,
        trailLength: Math.min(1, Math.max(0.01, trailLength.valueAsNumber || 0.01)),
        color: color.value,
        gradient: [[0, gradientStart.value] as const, [0.5, gradientMiddle.value] as const, [1, gradientEnd.value] as const],
        width: Math.max(0.1, width.valueAsNumber || 0.1),
        curvature: Number.isFinite(curvature.valueAsNumber) ? curvature.valueAsNumber : 0,
        smoothness: Math.max(1, Math.trunc(smoothness.valueAsNumber || 1)),
        arrow: arrow.checked,
        arrowColor: arrowColor.value,
        showStart: showStart.checked,
        showEnd: showEnd.checked,
        endLineColor: endLineColor.value,
        finishBehavior: finishBehavior.value as 'remove' | 'retain'
      };
    };

    const refresh = (): void => {
      if (!mounted) return;
      context.status('animationTypes', animationTypes);
      context.status('AnimationHandle.id', handle?.id ?? '未创建');
      context.status('AnimationHandle.status', handle?.status ?? '未创建');
      context.status(
        '全部句柄状态',
        [...handles].map((item) => ({ id: item.id, status: item.status }))
      );
      context.status(
        '业务元素仍存在',
        [point.id, dashLine.id, travelLine.id].filter((id) => earth.elements.get(id) !== undefined)
      );
      context.render(earth);
    };
    context.check(
      '动画类型选项完整覆盖 animationTypes',
      animationOptions.length === animationTypes.length && animationTypes.every((value) => animationOptions.some((option) => option.value === value))
    );

    const trackHandle = (current: AnimationHandle): void => {
      handles.add(current);
      handle = current;
      context.track(() => {
        if (current.status === 'running' || current.status === 'paused') current.stop();
      });
      void current.finished.then(() => {
        if (!mounted) return;
        context.log(`AnimationHandle.finished 已解析：${current.id}`, '成功', current.status);
        refresh();
      });
    };

    context.button(
      playActions,
      '播放动画 play(selector, spec)',
      () => {
        const selected = type.value as AnimationType;
        const current = earth.animations.play(selectorForType(selected), buildSpec());
        trackHandle(current);
        context.check('play() 返回 running 句柄', current.status === 'running', { id: current.id, status: current.status });
        refresh();
      },
      '主要'
    );
    context.button(playActions, '同时启动三类动画', () => {
      const pulse = earth.animations.play(
        { id: point.id },
        { type: 'pulse', channel: 'pulse-batch', periodMs: 900, color: '#ef4444', repeat: true, radius: 9 }
      );
      const dash = earth.animations.play({ id: dashLine.id }, { type: 'dash-flow', channel: 'dash-batch', speed: 28, lineDash: [12, 7], color: '#2563eb' });
      const travel = earth.animations.play(
        { id: travelLine.id },
        {
          type: 'path-travel',
          channel: 'travel-batch',
          durationMs: 2_000,
          repeat: true,
          trailLength: 0.3,
          color: '#38bdf8',
          gradient: [
            [0, '#38bdf8'],
            [1, '#f97316']
          ],
          width: 4,
          curvature: 0.35,
          smoothness: 160,
          arrow: true,
          arrowColor: '#ffffff',
          showStart: true,
          showEnd: true,
          endLineColor: '#22c55e',
          finishBehavior: 'retain'
        }
      );
      [pulse, dash, travel].forEach(trackHandle);
      context.check(
        '三类动画句柄均为 running',
        [pulse, dash, travel].every((item) => item.status === 'running')
      );
      refresh();
    });

    context.button(handleActions, '暂停当前动画 handle.pause()', () => {
      handle?.pause();
      refresh();
    });
    context.button(handleActions, '继续当前动画 handle.resume()', () => {
      handle?.resume();
      refresh();
    });
    context.button(
      handleActions,
      '停止当前动画 handle.stop()',
      () => {
        handle?.stop();
        refresh();
      },
      '危险'
    );

    const managerSelector: ElementSelector = { module: 'animation-demo' };
    const channels = (): readonly string[] | undefined => (filterChannel.checked ? [channel.value] : undefined);
    context.button(managerActions, '批量暂停 manager.pause()', () => {
      const affected = earth.animations.pause(managerSelector, channels());
      context.status('pause() 受影响数量', affected);
      refresh();
    });
    context.button(managerActions, '批量继续 manager.resume()', () => {
      const affected = earth.animations.resume(managerSelector, channels());
      context.status('resume() 受影响数量', affected);
      refresh();
    });
    context.button(
      managerActions,
      '批量停止 manager.stop()',
      () => {
        const affected = earth.animations.stop(managerSelector, channels());
        context.status('stop() 受影响数量', affected);
        refresh();
      },
      '危险'
    );
    context.button(
      managerActions,
      '停止全部动画 manager.stopAll()',
      () => {
        earth.animations.stopAll();
        context.check(
          'stopAll() 后没有 running/paused 句柄',
          [...handles].every((item) => item.status !== 'running' && item.status !== 'paused')
        );
        refresh();
      },
      '危险'
    );

    context.setCode(`
import { useEarth, type AnimationHandle } from '@vrsim/earth-engine-ol';

const earth = useEarth();
const handle: AnimationHandle = earth.animations.play(
  { id: 'route-line' },
  {
    type: 'path-travel',
    channel: 'route',
    durationMs: 2500,
    repeat: false,
    trailLength: 0.35,
    gradient: [[0, '#38bdf8'], [1, '#f97316']],
    width: 5,
    curvature: 0.45,
    smoothness: 180,
    arrow: true,
    showStart: true,
    showEnd: true,
    finishBehavior: 'retain'
  }
);
handle.finished.then(() => console.log(handle.status));
`);

    context.track(() => earth.animations.stopAll());
    context.track(() => {
      mounted = false;
    });
    refresh();
  }
};

function parseLineDash(value: string): readonly number[] {
  const parsed = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part >= 0);
  return parsed.length > 0 && parsed.some((part) => part > 0) ? parsed : [10, 10];
}
