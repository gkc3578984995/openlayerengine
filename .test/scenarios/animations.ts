import {
  Earth,
  animationTypes,
  type AnimationEasing,
  type AnimationHandle,
  type AnimationSpec,
  type AnimationType,
  type ElementCreateInput,
  type ElementSelector
} from '@vrsim/earth-engine-ol';
import { animationEffectManifest } from '../animationEffectManifest.js';
import type { ScenarioDefinition, SelectOption } from '../harness/types.js';

const layerId = 'acceptance-animations';
const moduleId = 'animation-demo';

export const animationDemoElementsByType = {
  pulse: {
    id: 'animation-demo-pulse',
    layerId,
    module: moduleId,
    geometry: { type: 'point', controlPoints: [[-6_300_000, 3_000_000]] },
    style: {
      symbol: { type: 'circle', radius: 9, fill: { type: 'solid', color: '#ef4444' }, stroke: { color: '#ffffff', width: 2 } },
      text: { text: 'pulse', fontSize: 13, fill: { type: 'solid', color: '#7f1d1d' }, offsetY: -22 }
    }
  },
  blink: {
    id: 'animation-demo-blink',
    layerId,
    module: moduleId,
    geometry: {
      type: 'polygon',
      controlPoints: [
        [-4_400_000, 2_200_000],
        [-2_800_000, 2_200_000],
        [-2_800_000, 3_800_000],
        [-4_400_000, 3_800_000]
      ]
    },
    style: {
      strokes: [{ color: '#7c3aed', width: 3 }],
      fill: { type: 'solid', color: 'rgba(124,58,237,0.3)' },
      text: { text: 'blink', fontSize: 13, fill: { type: 'solid', color: '#4c1d95' } }
    }
  },
  highlight: {
    id: 'animation-demo-highlight',
    layerId,
    module: moduleId,
    geometry: {
      type: 'polygon',
      controlPoints: [
        [-1_700_000, 2_200_000],
        [-100_000, 2_200_000],
        [-100_000, 3_800_000],
        [-1_700_000, 3_800_000]
      ]
    },
    style: {
      strokes: [{ color: '#ca8a04', width: 3 }],
      fill: { type: 'solid', color: 'rgba(234,179,8,0.24)' },
      text: { text: 'highlight', fontSize: 13, fill: { type: 'solid', color: '#713f12' } }
    }
  },
  alert: {
    id: 'animation-demo-alert',
    layerId,
    module: moduleId,
    geometry: {
      type: 'polygon',
      controlPoints: [
        [1_000_000, 2_200_000],
        [2_600_000, 2_200_000],
        [2_600_000, 3_800_000],
        [1_000_000, 3_800_000]
      ]
    },
    style: {
      strokes: [{ color: '#dc2626', width: 3 }],
      fill: { type: 'solid', color: 'rgba(239,68,68,0.24)' },
      text: { text: 'alert', fontSize: 13, fill: { type: 'solid', color: '#7f1d1d' } }
    }
  },
  fade: {
    id: 'animation-demo-fade',
    layerId,
    module: moduleId,
    geometry: {
      type: 'polygon',
      controlPoints: [
        [4_200_000, 2_200_000],
        [5_800_000, 2_200_000],
        [5_800_000, 3_800_000],
        [4_200_000, 3_800_000]
      ]
    },
    style: {
      strokes: [{ color: '#475569', width: 3 }],
      fill: { type: 'solid', color: 'rgba(100,116,139,0.3)' },
      text: { text: 'fade', fontSize: 13, fill: { type: 'solid', color: '#1e293b' } }
    }
  },
  'dash-flow': {
    id: 'animation-demo-dash-flow',
    layerId,
    module: moduleId,
    geometry: {
      type: 'polyline',
      controlPoints: [
        [-7_100_000, -2_800_000],
        [-6_100_000, -1_600_000],
        [-5_100_000, -2_500_000]
      ]
    },
    style: {
      strokes: [
        { color: '#ffffff', width: 7 },
        { color: '#2563eb', width: 4, lineDash: [12, 8] }
      ],
      text: { text: 'dash-flow', fontSize: 13, fill: { type: 'solid', color: '#1e3a8a' }, placement: 'line' }
    }
  },
  'path-travel': {
    id: 'animation-demo-path-travel',
    layerId,
    module: moduleId,
    geometry: {
      type: 'polyline',
      controlPoints: [
        [-4_800_000, -3_100_000],
        [-3_600_000, -1_500_000],
        [-2_300_000, -2_900_000]
      ]
    },
    style: {
      strokes: [{ color: '#64748b', width: 3 }],
      text: { text: 'path-travel', fontSize: 13, fill: { type: 'solid', color: '#334155' }, placement: 'line' }
    }
  },
  grow: {
    id: 'animation-demo-grow',
    layerId,
    module: moduleId,
    geometry: {
      type: 'fine-arrow',
      controlPoints: [
        [-1_500_000, -3_100_000],
        [600_000, -1_500_000]
      ]
    },
    style: {
      strokes: [{ color: '#ea580c', width: 2 }],
      fill: { type: 'solid', color: 'rgba(249,115,22,0.46)' },
      text: { text: 'grow', fontSize: 13, fill: { type: 'solid', color: '#9a3412' } }
    }
  },
  'radar-scan': {
    id: 'animation-demo-radar-scan',
    layerId,
    module: moduleId,
    geometry: { type: 'circle', center: [2_600_000, -2_400_000], radius: 950_000 },
    style: {
      strokes: [{ color: '#0891b2', width: 3 }],
      fill: { type: 'solid', color: 'rgba(6,182,212,0.18)' },
      text: { text: 'radar-scan', fontSize: 13, fill: { type: 'solid', color: '#155e75' } }
    }
  },
  'center-spread': {
    id: 'animation-demo-center-spread',
    layerId,
    module: moduleId,
    geometry: {
      type: 'sector',
      controlPoints: [
        [5_100_000, -3_000_000],
        [6_300_000, -3_000_000],
        [5_100_000, -1_800_000]
      ]
    },
    style: {
      strokes: [{ color: '#059669', width: 3 }],
      fill: { type: 'solid', color: 'rgba(16,185,129,0.2)' },
      text: { text: 'center-spread', fontSize: 13, fill: { type: 'solid', color: '#065f46' } }
    }
  }
} as const satisfies Readonly<Record<AnimationType, ElementCreateInput>>;

const animationOptions = animationEffectManifest.map(({ animationType, label }) => ({
  label,
  value: animationType
})) satisfies readonly SelectOption<AnimationType>[];
const timingOptions = [
  { label: 'durationMs（固定时长）', value: 'duration' },
  { label: 'speed（按路径速度）', value: 'speed' }
] as const;
const finishOptions = [
  { label: 'remove（结束后移除渲染结果）', value: 'remove' },
  { label: 'retain（结束后保留最终结果）', value: 'retain' }
] as const;
const highlightModeOptions = [
  { label: 'breathe（呼吸高亮）', value: 'breathe' },
  { label: 'steady（稳定高亮）', value: 'steady' }
] as const;
const growDirectionOptions = [
  { label: 'forward（从起点揭示）', value: 'forward' },
  { label: 'reverse（从终点揭示）', value: 'reverse' }
] as const;
const radarDirectionOptions = [
  { label: 'clockwise（顺时针）', value: 'clockwise' },
  { label: 'counterclockwise（逆时针）', value: 'counterclockwise' }
] as const;
const radarTrailStyleOptions = [
  { label: 'gradient（绿色渐变尾迹）', value: 'gradient' },
  { label: 'solid（纯色尾迹）', value: 'solid' }
] as const;
const fadeDirectionOptions = [
  { label: 'out（渐隐并保留终态）', value: 'out' },
  { label: 'in（渐显后移除效果）', value: 'in' }
] as const;
const easingOptions = [
  { label: 'ease-in-out（平滑缓入缓出）', value: 'ease-in-out' },
  { label: 'linear（线性）', value: 'linear' },
  { label: 'ease-in（缓入）', value: 'ease-in' },
  { label: 'ease-out（缓出）', value: 'ease-out' }
] as const;

export const animationsScenario: ScenarioDefinition = {
  id: 'animations',
  group: '表现能力',
  title: '统一 AnimationManager',
  summary: '在十个隔离目标上逐项演示全部内置效果，并继续验收 Manager 与 Handle 两层暂停、恢复、停止和完成状态。',
  steps: [
    '在独立演示卡中逐项播放 manifest 的 10 种内核默认效果；每种效果使用独立目标，可分别暂停、继续和停止。',
    '使用“播放全部独立演示”同时观察 Point、Polyline、Polygon、FineArrow、Circle 与 Sector 上的默认效果。',
    '调节 AnimationSpec 字段，重点验证 path-travel 的 speed/durationMs 互斥、grow 方向、radar 的纯色/渐变尾迹和 fade retain 行为。',
    '使用 AnimationHandle.pause()/resume()/stop()，核对 id、status 和 finished Promise。',
    '使用 AnimationManager.pause()/resume()/stop()，分别传入和省略 channels，核对受影响数量。',
    '按 manifest 同时启动全部效果后执行 stopAll()，确认所有活动渲染通道都停止且业务元素仍存在。'
  ],
  mount(context) {
    const target = context.createMapTarget('十种动画独立地图');
    const earth = context.trackEarth(
      new Earth({
        target,
        view: { center: [-400_000, 0], zoom: 2.8 },
        controls: { zoom: true, rotate: false, attribution: false }
      })
    );
    earth.layers.add({ kind: 'vector', id: layerId, zIndex: 25, wrapX: true, declutter: false });

    for (const animationType of animationTypes) earth.elements.add(animationDemoElementsByType[animationType]);
    const targetIdForType = (animationType: AnimationType): string => {
      const id = animationDemoElementsByType[animationType].id;
      if (id === undefined) throw new Error(`动画 ${animationType} 缺少独立演示目标`);
      return id;
    };

    let mounted = true;
    let handle: AnimationHandle | undefined;
    const handles = new Set<AnimationHandle>();
    const demoHandles = new Map<AnimationType, AnimationHandle>();
    const demoCards = new Map<AnimationType, { readonly card: HTMLElement; readonly status: HTMLOutputElement }>();

    const gallerySection = context.section(
      '十种动画默认效果',
      '每个 AnimationType 使用独立 Element 和默认 channel；除 fade-out 补充必填方向外，其余演示只传 type。'
    );
    const warning = context.note(gallerySection, '闪烁、呼吸和告警效果可能诱发光敏不适；页面不会自动播放，请按需启动并可随时停止。', '警告');
    warning.dataset.animationPhotosensitivityWarning = '';
    const galleryActions = context.actions(gallerySection);
    const gallery = document.createElement('div');
    gallery.className = 'acceptance-animation-gallery';
    gallery.dataset.animationGallery = '';
    gallerySection.append(gallery);

    const optionsSection = context.section('动画参数（AnimationSpec）', '选择动画类型后，下方全部字段会组成对应公开联合类型。');
    const type = context.select(optionsSection, '动画类型（type）', animationOptions, 'pulse');
    const channel = context.text(optionsSection, '动画通道（channel）', 'acceptance-animation');
    const color = context.color(optionsSection, '动画颜色（color）', '#ef4444');
    const repeat = context.checkbox(optionsSection, '循环播放（repeat）', true);
    const periodMs = context.number(optionsSection, '周期（periodMs）', 1_200, { min: 1, step: 100 });
    const radius = context.number(optionsSection, '脉冲半径（pulse.radius）', 10, { min: 1, step: 1 });
    const dutyCycle = context.number(optionsSection, '高位占空比（blink.dutyCycle）', 0.55, { min: 0.01, max: 0.99, step: 0.05 });
    const minOpacity = context.number(optionsSection, '低位透明度（blink.minOpacity）', 0.12, { min: 0, max: 1, step: 0.05 });
    const maxOpacity = context.number(optionsSection, '高位透明度（blink.maxOpacity）', 1, { min: 0, max: 1, step: 0.05 });
    const highlightMode = context.select(optionsSection, '高亮模式（highlight.mode）', highlightModeOptions, 'breathe');
    const fillOpacity = context.number(optionsSection, '填充透明度（fillOpacity）', 0.22, { min: 0, max: 1, step: 0.05 });
    const strokeWidth = context.number(optionsSection, '描边宽度（strokeWidth）', 3, { min: 0, step: 0.5 });
    const dashSpeed = context.number(optionsSection, '虚线速度（dash-flow.speed）', 32, { step: 1 });
    const lineDash = context.text(optionsSection, '虚线序列（dash-flow.lineDash）', '14,8,3,8');
    const timing = context.select(optionsSection, '路径计时方式（speed/durationMs）', timingOptions, 'duration');
    const travelSpeed = context.number(optionsSection, '路径速度（path-travel.speed）', 1_500_000, { min: 1, step: 100_000 });
    const durationMs = context.number(optionsSection, '持续时长（durationMs）', 2_500, { min: 1, step: 100 });
    const trailLength = context.number(optionsSection, '尾迹长度（trailLength）', 0.35, { min: 0.01, max: 1, step: 0.05 });
    const width = context.number(optionsSection, '路径宽度（width）', 5, { min: 0.1, step: 0.5 });
    const curvature = context.number(optionsSection, '路径曲率（curvature）', 0.45, { min: -2, max: 2, step: 0.05 });
    const smoothness = context.number(optionsSection, '路径平滑度（smoothness）', 180, { min: 1, max: 2048, step: 1 });
    const showStart = context.checkbox(optionsSection, '显示起点（showStart）', true);
    const showEnd = context.checkbox(optionsSection, '显示终点（showEnd）', true);
    const endLineColor = context.color(optionsSection, '结束线颜色（endLineColor）', '#22c55e');
    const gradientStart = context.color(optionsSection, '渐变起色（gradient[0]）', '#38bdf8');
    const gradientMiddle = context.color(optionsSection, '渐变中色（gradient[1]）', '#a855f7');
    const gradientEnd = context.color(optionsSection, '渐变终色（gradient[2]）', '#f97316');
    const finishBehavior = context.select(optionsSection, '结束行为（finishBehavior）', finishOptions, 'retain');
    const growDirection = context.select(optionsSection, '生长方向（grow.direction）', growDirectionOptions, 'forward');
    const radarDirection = context.select(optionsSection, '扫描方向（radar-scan.direction）', radarDirectionOptions, 'clockwise');
    const radarTrailStyle = context.select(optionsSection, '雷达尾迹样式（color/gradient）', radarTrailStyleOptions, 'gradient');
    const radarColor = context.color(optionsSection, '雷达纯色尾迹（radar-scan.color）', '#00e676');
    const radarGradientTail = context.text(optionsSection, '雷达渐变尾端（gradient[0]）', 'rgba(0, 230, 118, 0.05)');
    const radarGradientMiddle = context.text(optionsSection, '雷达渐变中段（gradient[1]）', 'rgba(0, 230, 118, 0.45)');
    const radarGradientFront = context.text(optionsSection, '雷达渐变前沿（gradient[2]）', 'rgba(0, 230, 118, 1)');
    const fadeDirection = context.select(optionsSection, '渐变方向（fade.direction）', fadeDirectionOptions, 'out');
    const easing = context.select(optionsSection, '缓动曲线（easing）', easingOptions, 'ease-in-out');
    const radarOpacity = context.number(optionsSection, '雷达透明度（radar-scan.opacity）', 0.42, { min: 0, max: 1, step: 0.05 });
    const beamWidthDeg = context.number(optionsSection, '雷达尾迹角宽（beamWidthDeg）', 52, { min: 1, max: 360, step: 1 });
    const ringCount = context.number(optionsSection, '扩散环数量（ringCount）', 3, { min: 1, max: 5, step: 1 });
    const playActions = context.actions(optionsSection);

    const handleSection = context.section('动画句柄（AnimationHandle）', '这些按钮只操作最近一次 play() 返回的句柄。');
    const handleActions = context.actions(handleSection);

    const managerSection = context.section('动画管理器（AnimationManager）', 'Manager 按 ElementSelector 批量操作；勾选 channels 时只影响当前 channel。');
    const filterChannel = context.checkbox(managerSection, '按通道过滤（channels）', true);
    const managerActions = context.actions(managerSection);

    const selectorForType = (selected: AnimationType): ElementSelector => ({ id: targetIdForType(selected) });

    const buildSpec = (): AnimationSpec => {
      const selected = type.value as AnimationType;
      switch (selected) {
        case 'pulse':
          return {
            type: 'pulse',
            channel: channel.value,
            periodMs: Math.max(1, periodMs.valueAsNumber || 1),
            color: color.value,
            repeat: repeat.checked,
            radius: Math.max(1, radius.valueAsNumber || 1)
          };
        case 'dash-flow':
          return {
            type: 'dash-flow',
            channel: channel.value,
            speed: Number.isFinite(dashSpeed.valueAsNumber) ? dashSpeed.valueAsNumber : 0,
            lineDash: parseLineDash(lineDash.value),
            color: color.value
          };
        case 'path-travel':
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
            showStart: showStart.checked,
            showEnd: showEnd.checked,
            endLineColor: endLineColor.value,
            finishBehavior: finishBehavior.value as 'remove' | 'retain'
          };
        case 'blink':
          return {
            type: 'blink',
            channel: channel.value,
            periodMs: Math.max(1, periodMs.valueAsNumber || 1),
            dutyCycle: dutyCycle.valueAsNumber,
            minOpacity: minOpacity.valueAsNumber,
            maxOpacity: maxOpacity.valueAsNumber,
            repeat: repeat.checked
          };
        case 'highlight':
          return {
            type: 'highlight',
            channel: channel.value,
            mode: highlightMode.value as 'steady' | 'breathe',
            color: color.value,
            fillOpacity: fillOpacity.valueAsNumber,
            strokeWidth: strokeWidth.valueAsNumber,
            ...(highlightMode.value === 'breathe' ? { periodMs: Math.max(1, periodMs.valueAsNumber || 1) } : {})
          };
        case 'alert':
          return {
            type: 'alert',
            channel: channel.value,
            periodMs: Math.max(1, periodMs.valueAsNumber || 1),
            color: color.value,
            fillOpacity: fillOpacity.valueAsNumber,
            strokeWidth: strokeWidth.valueAsNumber,
            repeat: repeat.checked
          };
        case 'grow':
          return {
            type: 'grow',
            channel: channel.value,
            durationMs: Math.max(1, durationMs.valueAsNumber || 1),
            direction: growDirection.value as 'forward' | 'reverse',
            easing: easing.value as AnimationEasing,
            repeat: repeat.checked
          };
        case 'radar-scan':
          return {
            type: 'radar-scan',
            channel: channel.value,
            periodMs: Math.max(1, periodMs.valueAsNumber || 1),
            direction: radarDirection.value as 'clockwise' | 'counterclockwise',
            ...(radarTrailStyle.value === 'gradient'
              ? {
                  gradient: [[0, radarGradientTail.value] as const, [0.6, radarGradientMiddle.value] as const, [1, radarGradientFront.value] as const]
                }
              : { color: radarColor.value }),
            opacity: radarOpacity.valueAsNumber,
            beamWidthDeg: beamWidthDeg.valueAsNumber,
            repeat: repeat.checked
          };
        case 'center-spread':
          return {
            type: 'center-spread',
            channel: channel.value,
            periodMs: Math.max(1, periodMs.valueAsNumber || 1),
            color: color.value,
            strokeWidth: strokeWidth.valueAsNumber,
            ringCount: Math.trunc(ringCount.valueAsNumber),
            repeat: repeat.checked
          };
        case 'fade':
          return {
            type: 'fade',
            channel: channel.value,
            direction: fadeDirection.value as 'in' | 'out',
            durationMs: Math.max(1, durationMs.valueAsNumber || 1),
            easing: easing.value as AnimationEasing
          };
      }
    };

    const updateDemoStatus = (animationType: AnimationType): void => {
      const binding = demoCards.get(animationType);
      if (binding === undefined) return;
      const current = demoHandles.get(animationType);
      const status = current?.status ?? 'stopped';
      binding.card.dataset.animationStatus = status;
      binding.status.value = status;
      binding.status.textContent = status;
    };

    const refresh = (): void => {
      if (!mounted) return;
      for (const animationType of animationTypes) updateDemoStatus(animationType);
      context.status('animationTypes', animationTypes);
      context.status('AnimationHandle.id', handle?.id ?? '未创建');
      context.status('AnimationHandle.status', handle?.status ?? '未创建');
      context.status(
        '全部句柄状态',
        [...handles].map((item) => ({ id: item.id, status: item.status }))
      );
      context.status(
        '业务元素仍存在',
        animationTypes.map(targetIdForType).filter((id) => earth.elements.get(id) !== undefined)
      );
      context.render(earth);
    };
    context.check(
      '动画类型选项完整覆盖 animationTypes',
      animationOptions.length === animationTypes.length && animationTypes.every((value) => animationOptions.some((option) => option.value === value))
    );

    const trackHandle = (current: AnimationHandle, demoType?: AnimationType): void => {
      handles.add(current);
      handle = current;
      if (demoType !== undefined) demoHandles.set(demoType, current);
      void current.finished.then(() => {
        handles.delete(current);
        if (!mounted || context.isDisposed) return;
        if (demoType !== undefined && demoHandles.get(demoType) !== current) return;
        context.log(`AnimationHandle.finished 已解析：${current.id}`, '成功', current.status);
        refresh();
      });
    };

    const playDemo = (entry: (typeof animationEffectManifest)[number]): AnimationHandle => {
      const animationType = entry.animationType;
      const targetId = targetIdForType(animationType);
      earth.animations.stop({ id: targetId });
      const current = earth.animations.play({ id: targetId }, entry.createDefaultSpec());
      trackHandle(current, animationType);
      refresh();
      return current;
    };

    const playAllDemos = (): readonly AnimationHandle[] => {
      earth.animations.stopAll();
      demoHandles.clear();
      const batchHandles = animationEffectManifest.map(playDemo);
      context.check('十种独立动画句柄均为 running', batchHandles.length === animationTypes.length && batchHandles.every((item) => item.status === 'running'));
      refresh();
      return batchHandles;
    };

    const playAllButton = context.button(
      galleryActions,
      '播放全部独立演示',
      () => {
        playAllDemos();
      },
      '主要'
    );
    playAllButton.dataset.animationBatchAction = 'play';
    const stopAllButton = context.button(
      galleryActions,
      '停止全部独立演示',
      () => {
        earth.animations.stopAll();
        demoHandles.clear();
        refresh();
      },
      '危险'
    );
    stopAllButton.dataset.animationBatchAction = 'stop';

    for (const entry of animationEffectManifest) {
      const card = document.createElement('article');
      card.className = 'acceptance-animation-demo';
      card.dataset.animationDemo = entry.animationType;
      card.dataset.animationTarget = targetIdForType(entry.animationType);
      card.dataset.animationStatus = 'stopped';
      const heading = document.createElement('h4');
      heading.textContent = entry.label;
      const details = document.createElement('p');
      details.textContent = `${animationDemoElementsByType[entry.animationType].geometry.type} · ${entry.writeDomains.join(' + ')} · 内核默认参数`;
      const status = document.createElement('output');
      status.dataset.animationRole = 'status';
      status.setAttribute('aria-live', 'polite');
      status.value = 'stopped';
      status.textContent = 'stopped';
      const actions = document.createElement('div');
      actions.className = 'acceptance-actions';
      const playButton = context.button(
        actions,
        '播放此动画',
        () => {
          playDemo(entry);
        },
        '主要'
      );
      playButton.dataset.animationAction = 'play';
      const pauseButton = context.button(actions, '暂停此动画', () => {
        demoHandles.get(entry.animationType)?.pause();
        refresh();
      });
      pauseButton.dataset.animationAction = 'pause';
      const resumeButton = context.button(actions, '继续此动画', () => {
        demoHandles.get(entry.animationType)?.resume();
        refresh();
      });
      resumeButton.dataset.animationAction = 'resume';
      const stopButton = context.button(
        actions,
        '停止此动画',
        () => {
          demoHandles.get(entry.animationType)?.stop();
          demoHandles.delete(entry.animationType);
          refresh();
        },
        '危险'
      );
      stopButton.dataset.animationAction = 'stop';
      card.append(heading, details, status, actions);
      gallery.append(card);
      demoCards.set(entry.animationType, { card, status });
    }
    context.check('独立动画演示完整覆盖 animationTypes', demoCards.size === animationTypes.length);

    context.button(
      playActions,
      '播放动画 play(selector, spec)',
      () => {
        const selected = type.value as AnimationType;
        earth.animations.stop(selectorForType(selected));
        demoHandles.delete(selected);
        const current = earth.animations.play(selectorForType(selected), buildSpec());
        trackHandle(current);
        context.check('play() 返回 running 句柄', current.status === 'running', { id: current.id, status: current.status });
        refresh();
      },
      '主要'
    );
    context.button(playActions, '按 manifest 同时启动全部效果', () => {
      playAllDemos();
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

    const managerSelector: ElementSelector = { module: moduleId };
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
        if (!filterChannel.checked) demoHandles.clear();
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
        demoHandles.clear();
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
