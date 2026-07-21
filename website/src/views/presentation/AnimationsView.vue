<script setup lang="ts">
import { ref } from 'vue';
import { animationTypes, type AnimationSpec, type AnimationType } from '@vrsim/earth-engine-ol';
import { animationEffectManifestByType } from '../../../../.test/animationEffectManifest';
import ApiReference from '../../components/docs/ApiReference.vue';
import CodeBlock from '../../components/docs/CodeBlock.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import AnimationManagerDemo from '../../examples/presentation/AnimationManagerDemo.vue';
import animationManagerSource from '../../examples/presentation/AnimationManagerDemo.vue?raw';

interface EffectField {
  name: string;
  href: string;
  defaultValue: string;
  constraint: string;
}

interface EffectDetail {
  type: string;
  label: string;
  spec: string;
  specHref: string;
  fields: EffectField[];
}

interface AnimationManagerDemoExposed {
  reset(): void;
  focusSelected(): void;
}

const slug = (value: string) => value.replace(/([a-z\d])([A-Z])/gu, '$1-$2').toLowerCase();
const typeHref = (type: string) => `/api/types#api-type-${slug(type)}`;
const field = (spec: string, name: string, defaultValue: string, constraint: string): EffectField => ({
  name,
  href: `${typeHref(spec)}-property-${slug(name)}`,
  defaultValue,
  constraint
});

const anchors = [
  { id: 'overview', label: '唯一播放入口' },
  { id: 'effect-catalog', label: '十种效果目录' },
  { id: 'example-animation-manager', label: '十种效果演示' },
  { id: 'variant-lab', label: '重点变体实验' },
  { id: 'compatibility', label: '兼容矩阵' },
  { id: 'effect-specs', label: '配置、默认值与范围' },
  { id: 'composition', label: 'channel 与写入域' },
  { id: 'handle-lifecycle', label: 'Handle、retain 与清理' },
  { id: 'interaction-policy', label: 'Edit / Transform' },
  { id: 'rendering-boundary', label: '渲染与命中边界' },
  { id: 'performance', label: '性能与资源预算' },
  { id: 'api', label: '完整 API' }
];

const animationDemoRef = ref<AnimationManagerDemoExposed | null>(null);
const resetAnimationDemo = () => animationDemoRef.value?.reset();
const focusAnimationDemo = () => animationDemoRef.value?.focusSelected();
const formatMinimalSpec = (spec: AnimationSpec) =>
  JSON.stringify(spec)
    .replace(/"([\w-]+)":/gu, '$1: ')
    .replace(/"/gu, "'");
const summarizeTargets = (types: readonly string[]) => (types.length <= 5 ? types.join('、') : `${types.slice(0, 4).join('、')} 等 ${types.length} 种 Shape`);
const effectCards = animationTypes.map((animationType) => {
  const entry = animationEffectManifestByType[animationType];
  return {
    animationType,
    label: entry.label,
    capabilities: entry.targetCapability,
    targetSummary: summarizeTargets(entry.supportedShapeTypes),
    targetTitle: entry.supportedShapeTypes.join('、'),
    writeDomains: entry.writeDomains,
    minimalCall: `earth.animations.play({ id: '${entry.acceptanceTarget}-1' }, ${formatMinimalSpec(entry.createDefaultSpec())});`
  };
}) satisfies readonly {
  animationType: AnimationType;
  label: string;
  capabilities: readonly string[];
  targetSummary: string;
  targetTitle: string;
  writeDomains: readonly string[];
  minimalCall: string;
}[];

const variantRows = [
  {
    family: '路径与箭头',
    variants: 'grow 的 FineArrow；forward / reverse；path-travel gradient',
    result: '箭头按 Shape provider 路径完整揭示，路径尾迹显示渐变方向'
  },
  {
    family: '径向效果',
    variants: 'Sector radar-scan；one-way / round-trip；首程 clockwise / counterclockwise；纯色 / gradient',
    result: '纯色尾迹保持均匀透明度；gradient 保留渐隐，往复扫描始终裁剪在 Sector sweep 内'
  },
  { family: '三种 gradient', variants: 'path-travel、radar-scan、center-spread', result: '路径尾迹、扫描尾迹和径向波纹分别展示渐变色标方向' },
  { family: '透明度与终态', variants: 'fade in / out；out retain；blink + fade', result: 'in 完成后 remove；out 保留最后一帧并由 stop 清理' },
  { family: '高亮', variants: 'highlight steady / breathe', result: 'steady 不持续请求帧；breathe 显示光敏提示且只能手动启动' },
  { family: '组合与冲突', variants: '跨 channel 合成、同 channel replace、双 grow 冲突', result: '显式组合才叠加；replace 原子提交；geometry 冲突保留旧记录' }
];

const compatibilityRows = [
  { type: 'pulse', capability: 'structured-presentation', targets: 'Point', domain: 'overlay', completion: 'repeat: false 时一周期后移除' },
  {
    type: 'dash-flow',
    capability: 'structured-presentation',
    targets: 'Polyline；含虚线 track 的开放或闭合 Linework',
    domain: 'overlay',
    completion: '持续运行，直到 stop / replace / remove / destroy'
  },
  {
    type: 'path-travel',
    capability: 'structured-presentation',
    targets: '至少两个点的 Polyline',
    domain: 'overlay',
    completion: '按 repeat 与 finishBehavior remove / retain'
  },
  {
    type: 'blink',
    capability: 'structured-presentation',
    targets: 'Point / Polyline / Polygon / Circle 等结构化样式目标',
    domain: 'target-opacity',
    completion: 'repeat: false 时一周期后移除'
  },
  {
    type: 'highlight',
    capability: 'closed-surface + structured',
    targets: 'Polygon、Circle；包括最终渲染为 Polygon 的闭合 Shape',
    domain: 'overlay',
    completion: '不自然完成'
  },
  {
    type: 'alert',
    capability: 'closed-surface + structured',
    targets: 'Polygon、Circle；包括最终渲染为 Polygon 的闭合 Shape',
    domain: 'overlay',
    completion: 'repeat: false 时一周期后移除'
  },
  {
    type: 'grow',
    capability: 'reveal-geometry + structured',
    targets:
      'Polyline / LunePolyline / CurvePolyline；FineArrow / TailedSquadCombatArrow / AssaultDirectionArrow / AttackArrow / TailedAttackArrow / DoubleArrow',
    domain: 'target-geometry',
    completion: 'repeat: false 时完整图形无缝接替'
  },
  {
    type: 'radar-scan',
    capability: 'radial-frame + structured',
    targets: 'Circle / Sector',
    domain: 'overlay',
    completion: 'repeat: false 时在一个完整 period 后移除；round-trip 会先去后回'
  },
  { type: 'center-spread', capability: 'radial-frame + structured', targets: 'Circle / Sector', domain: 'overlay', completion: '最后一个环完成后移除' },
  {
    type: 'fade',
    capability: 'structured-presentation',
    targets: 'Point / Polyline / Polygon / Circle 等结构化样式目标',
    domain: 'target-opacity',
    completion: 'fade-in remove；fade-out retain'
  }
];

const effectDetails: EffectDetail[] = [
  {
    type: 'pulse',
    label: '点脉冲',
    spec: 'PulseAnimationSpec',
    specHref: typeHref('PulseAnimationSpec'),
    fields: [
      field('PulseAnimationSpec', 'type', "'pulse'", '固定判别字段'),
      field('PulseAnimationSpec', 'channel', "'pulse'", '非空字符串；同目标同 channel 原子替换'),
      field('PulseAnimationSpec', 'periodMs', '1000', '有限正数，单位 ms'),
      field('PulseAnimationSpec', 'color', "'#ff0000'", 'Color'),
      field('PulseAnimationSpec', 'repeat', 'true', 'false 时一个周期后自然完成'),
      field('PulseAnimationSpec', 'radius', '6', '有限正数，单位 CSS px')
    ]
  },
  {
    type: 'dash-flow',
    label: '虚线流动',
    spec: 'DashFlowAnimationSpec',
    specHref: typeHref('DashFlowAnimationSpec'),
    fields: [
      field('DashFlowAnimationSpec', 'type', "'dash-flow'", '固定判别字段'),
      field('DashFlowAnimationSpec', 'channel', "'dash-flow'", '非空字符串'),
      field('DashFlowAnimationSpec', 'speed', '24', '有限数，单位 CSS px/s；符号决定流动方向'),
      field('DashFlowAnimationSpec', 'lineDash', '继承有效虚线，普通折线回退 [10, 10]', '非空、有限、非负且不能全为 0，单位 CSS px'),
      field('DashFlowAnimationSpec', 'color', '继承目标描边', '可选 Color')
    ]
  },
  {
    type: 'path-travel',
    label: '路径尾迹',
    spec: 'PathTravelAnimationSpec',
    specHref: typeHref('PathTravelAnimationSpec'),
    fields: [
      field('PathTravelAnimationSpec', 'type', "'path-travel'", '固定判别字段'),
      field('PathTravelAnimationSpec', 'channel', "'path-travel'", '非空字符串'),
      field('PathTravelAnimationSpec', 'speed', '未设置', '有限正数，地图距离/s；与 durationMs 互斥'),
      field('PathTravelAnimationSpec', 'durationMs', '2000（未设置 speed 时）', '有限正数，单位 ms；与 speed 互斥'),
      field('PathTravelAnimationSpec', 'repeat', 'true', '是否循环'),
      field('PathTravelAnimationSpec', 'trailLength', '0.25', '(0, 1]，占完整路径比例'),
      field('PathTravelAnimationSpec', 'color', '继承目标描边', '可选 Color；gradient 存在时由渐变绘制尾迹'),
      field('PathTravelAnimationSpec', 'gradient', '未设置', '至少两个 offset 严格递增的 [offset, Color] 色标'),
      field('PathTravelAnimationSpec', 'width', '2', '有限正数，单位 CSS px'),
      field('PathTravelAnimationSpec', 'curvature', '0', '有限数；0 严格保留原折线'),
      field('PathTravelAnimationSpec', 'smoothness', '180', '正安全整数，最大 2048；多点路径每段至少两个采样段'),
      field('PathTravelAnimationSpec', 'showStart', 'true', '显示起点标记'),
      field('PathTravelAnimationSpec', 'showEnd', 'true', '显示终点标记'),
      field('PathTravelAnimationSpec', 'endLineColor', '未设置', '可选终态辅助线 Color'),
      field('PathTravelAnimationSpec', 'finishBehavior', "'remove'", "'remove' | 'retain'；retain 后仍需 stop 清理")
    ]
  },
  {
    type: 'blink',
    label: '阶跃闪烁',
    spec: 'BlinkAnimationSpec',
    specHref: typeHref('BlinkAnimationSpec'),
    fields: [
      field('BlinkAnimationSpec', 'type', "'blink'", '固定判别字段'),
      field('BlinkAnimationSpec', 'channel', "'blink'", '非空字符串'),
      field('BlinkAnimationSpec', 'periodMs', '800', '有限正数，单位 ms'),
      field('BlinkAnimationSpec', 'dutyCycle', '0.5', '0 < value < 1'),
      field('BlinkAnimationSpec', 'minOpacity', '0', '[0, 1]，且小于 maxOpacity'),
      field('BlinkAnimationSpec', 'maxOpacity', '1', '[0, 1]，且大于 minOpacity'),
      field('BlinkAnimationSpec', 'repeat', 'true', 'false 时一个周期后自然完成')
    ]
  },
  {
    type: 'highlight',
    label: '稳定或呼吸高亮',
    spec: 'HighlightAnimationSpec',
    specHref: typeHref('HighlightAnimationSpec'),
    fields: [
      field('HighlightAnimationSpec', 'type', "'highlight'", '固定判别字段'),
      field('HighlightAnimationSpec', 'channel', "'highlight'", '非空字符串'),
      field('HighlightAnimationSpec', 'mode', "'steady'", "'steady' | 'breathe'"),
      field('HighlightAnimationSpec', 'color', "'#ffc107'", 'Color'),
      field('HighlightAnimationSpec', 'fillOpacity', '0.18', '[0, 1]'),
      field('HighlightAnimationSpec', 'strokeWidth', '3', '有限非负数，单位 CSS px'),
      field('HighlightAnimationSpec', 'periodMs', '1200（breathe）', '有限正数；steady 显式传入会报 InvalidArgumentError')
    ]
  },
  {
    type: 'alert',
    label: '双峰告警',
    spec: 'AlertAnimationSpec',
    specHref: typeHref('AlertAnimationSpec'),
    fields: [
      field('AlertAnimationSpec', 'type', "'alert'", '固定判别字段'),
      field('AlertAnimationSpec', 'channel', "'alert'", '非空字符串'),
      field('AlertAnimationSpec', 'periodMs', '1200', '有限正数，单位 ms'),
      field('AlertAnimationSpec', 'color', "'#ff3b30'", 'Color'),
      field('AlertAnimationSpec', 'fillOpacity', '0.22', '[0, 1]'),
      field('AlertAnimationSpec', 'strokeWidth', '3', '有限非负数，单位 CSS px'),
      field('AlertAnimationSpec', 'repeat', 'true', 'false 时一个双峰周期后自然完成')
    ]
  },
  {
    type: 'grow',
    label: '路径与箭头生长',
    spec: 'GrowAnimationSpec',
    specHref: typeHref('GrowAnimationSpec'),
    fields: [
      field('GrowAnimationSpec', 'type', "'grow'", '固定判别字段'),
      field('GrowAnimationSpec', 'channel', "'grow'", '非空字符串'),
      field('GrowAnimationSpec', 'durationMs', '1200', '有限正数，单位 ms'),
      field('GrowAnimationSpec', 'direction', "'forward'", "'forward' | 'reverse'；两者都从空逐步揭示到完整"),
      field('GrowAnimationSpec', 'easing', "'linear'", "'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'"),
      field('GrowAnimationSpec', 'repeat', 'false', 'false 时完整规范图形无缝接替')
    ]
  },
  {
    type: 'radar-scan',
    label: '雷达扫描',
    spec: 'RadarScanAnimationSpec',
    specHref: typeHref('RadarScanAnimationSpec'),
    fields: [
      field('RadarScanAnimationSpec', 'type', "'radar-scan'", '固定判别字段'),
      field('RadarScanAnimationSpec', 'channel', "'radar-scan'", '非空字符串'),
      field('RadarScanAnimationSpec', 'periodMs', '2000', '有限正数，单位 ms；表示所选 scanMode 的完整周期'),
      field('RadarScanAnimationSpec', 'direction', "'clockwise'", "'clockwise' | 'counterclockwise'，表示最终屏幕上的首程方向"),
      field(
        'RadarScanAnimationSpec',
        'scanMode',
        "'one-way'",
        "'one-way' | 'round-trip'；往复模式在 periodMs / 2 到达对侧边界并折返，在 periodMs 回到起扫边界"
      ),
      field('RadarScanAnimationSpec', 'color', "'#00e676'", '与 gradient 互斥；全部可见尾迹槽保持同一透明度'),
      field('RadarScanAnimationSpec', 'gradient', '未设置', '至少两个严格递增色标；offset 0 为旧尾端，1 为扫描前沿，并保留年龄渐隐'),
      field('RadarScanAnimationSpec', 'opacity', '0.35', '[0, 1]；纯色模式对全部可见槽恒定应用'),
      field('RadarScanAnimationSpec', 'beamWidthDeg', '45', '0 < value ≤ 360；Sector 不超过自身 sweep'),
      field('RadarScanAnimationSpec', 'repeat', 'true', 'false 时完成一个完整 period；round-trip 会完成去程和回程')
    ]
  },
  {
    type: 'center-spread',
    label: '中心扩散',
    spec: 'CenterSpreadAnimationSpec',
    specHref: typeHref('CenterSpreadAnimationSpec'),
    fields: [
      field('CenterSpreadAnimationSpec', 'type', "'center-spread'", '固定判别字段'),
      field('CenterSpreadAnimationSpec', 'channel', "'center-spread'", '非空字符串'),
      field('CenterSpreadAnimationSpec', 'periodMs', '1600', '单环从中心到外半径的有限正时长，单位 ms'),
      field('CenterSpreadAnimationSpec', 'color', "'#00e676'", '与 gradient 互斥；全部可见波纹带保持同一透明度'),
      field('CenterSpreadAnimationSpec', 'gradient', '未设置', 'offset 0 为内侧旧尾迹，1 为外侧前沿，并保留尾迹与传播渐隐'),
      field('CenterSpreadAnimationSpec', 'opacity', '0.7', '[0, 1]；纯色模式在整个传播生命周期内恒定应用'),
      field('CenterSpreadAnimationSpec', 'trailLength', '0.18', '[0, 1]；0 只保留前沿线环或裁剪弧'),
      field('CenterSpreadAnimationSpec', 'strokeWidth', '2', '有限非负数，单位 CSS px'),
      field('CenterSpreadAnimationSpec', 'ringCount', '3', '1..5 的安全整数'),
      field('CenterSpreadAnimationSpec', 'repeat', 'true', 'false 时最后一个错峰环完成后自然结束')
    ]
  },
  {
    type: 'fade',
    label: '渐显与渐隐',
    spec: 'FadeAnimationSpec',
    specHref: typeHref('FadeAnimationSpec'),
    fields: [
      field('FadeAnimationSpec', 'type', "'fade'", '固定判别字段'),
      field('FadeAnimationSpec', 'channel', "'fade'", '非空字符串'),
      field('FadeAnimationSpec', 'direction', '必填', "'in' | 'out'；不会根据当前 visible 推断"),
      field('FadeAnimationSpec', 'durationMs', '500', '有限正数，单位 ms'),
      field('FadeAnimationSpec', 'easing', "'ease-in-out'", "'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'")
    ]
  }
];

const compositionRows = [
  { domain: 'target-opacity', effects: 'blink、fade', rule: '乘法合成并限制到 [0, 1]；fade + blink 与顺序无关' },
  { domain: 'target-geometry', effects: 'grow', rule: '同目标独占；不同 channel 的两个 grow 也同步抛 CapabilityError' },
  { domain: 'overlay', effects: 'pulse、dash-flow、path-travel、highlight、alert、radar-scan、center-spread', rule: '按记录创建顺序与稳定 slotKey 追加' }
];

const interactionRows = [
  { definitions: 'pulse', edit: 'pause-and-suppress', transform: 'pause-and-suppress' },
  { definitions: 'dash-flow', edit: 'pause-and-suppress', transform: 'follow-preview' },
  { definitions: 'path-travel', edit: 'pause-and-suppress', transform: 'follow-preview' },
  { definitions: 'blink / highlight / alert / grow / radar-scan / center-spread / fade', edit: 'pause-and-suppress', transform: 'pause-and-suppress' }
];

const fadeRetainCode = `const handle = earth.animations.play(
  { id: 'area-1' },
  { type: 'fade', direction: 'out' }
);

await handle.finished;
earth.elements.hide({ id: 'area-1' });
handle.stop(); // 清除 retained 最后一帧，不会闪回`;

const apiTypes = [
  'AnimationManager',
  'AnimationHandle',
  'AnimationType',
  'AnimationSpec',
  'AnimationChannel',
  'AnimationStatus',
  'AnimationEasing',
  'PulseAnimationSpec',
  'DashFlowAnimationSpec',
  'PathTravelAnimationSpec',
  'BlinkAnimationSpec',
  'HighlightAnimationSpec',
  'AlertAnimationSpec',
  'GrowAnimationSpec',
  'RadarScanAnimationSpec',
  'CenterSpreadAnimationSpec',
  'FadeAnimationSpec'
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图表现</span>
        <h1>动画（Animations）</h1>
        <p>AnimationManager 是全部 Element 动画的唯一公共入口：同一套 Selector、channel、Handle 与资源清理规则覆盖十种内置效果。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">唯一入口：earth.animations.play()</h2>
        <p>
          从 <ApiReference kind="property" to="/api/types#api-type-earth-property-animations">earth.animations</ApiReference> 调用
          <ApiReference kind="method" to="/api/types#api-type-animation-manager-method-play">play</ApiReference>；不要为 blink、grow 或 radar 建立独立 Manager。
          Selector 支持 id、ids、module、layerId、type、visible 和 predicate，返回
          <ApiReference kind="type" to="/api/types#api-type-animation-handle">AnimationHandle</ApiReference>。
        </p>
        <el-alert type="warning" :closable="false" show-icon title="光敏性风险">
          阶跃 blink、highlight 的 breathe 模式和 alert 可能触发光敏反应。下面的演示不会自动播放，并始终提供启动、暂停、恢复和停止控件。
        </el-alert>
        <el-alert type="info" :closable="false" show-icon title="批量播放是原子的">
          Selector 命中的任一目标不兼容、Spec 非法或写入域冲突时，整个 play() 同步失败；不会跳过目标、部分播放，也不会提前替换已有 channel。
        </el-alert>
      </section>

      <section id="effect-catalog" class="doc-prose">
        <h2 class="doc-h2">十种内置效果一览</h2>
        <p>
          目录严格按根导出的 <ApiReference kind="property" to="/api/types#api-value-animation-types">animationTypes</ApiReference>
          顺序生成，并与动画 acceptance manifest 共用兼容能力、写入域和最小 Spec；新增内置效果时不会依赖手写下拉分支。
        </p>
        <div class="animation-doc__catalog">
          <el-card
            v-for="effect in effectCards"
            :id="`effect-${effect.animationType}`"
            :key="effect.animationType"
            class="animation-doc__effect-card"
            shadow="never"
          >
            <template #header>
              <div class="animation-doc__card-title">
                <strong>{{ effect.label }}</strong>
                <code>{{ effect.animationType }}</code>
              </div>
            </template>
            <dl class="animation-doc__card-meta">
              <div>
                <dt>兼容目标</dt>
                <dd :title="effect.targetTitle">{{ effect.targetSummary }}</dd>
              </div>
              <div>
                <dt>目标能力</dt>
                <dd>
                  <el-tag v-for="capability in effect.capabilities" :key="capability" size="small">{{ capability }}</el-tag>
                </dd>
              </div>
              <div>
                <dt>写入域</dt>
                <dd>
                  <el-tag v-for="domain in effect.writeDomains" :key="domain" size="small" type="warning">{{ domain }}</el-tag>
                </dd>
              </div>
            </dl>
            <CodeBlock class="animation-doc__minimal-call" :code="effect.minimalCall" lang="ts" />
          </el-card>
        </div>
      </section>

      <section id="example-animation-manager" class="doc-prose">
        <ExampleBlock
          title="十种独立目标、参数实验室与 Handle 控制"
          :source="animationManagerSource"
          show-reset
          show-focus
          @reset="resetAnimationDemo"
          @focus="focusAnimationDemo"
        >
          <template #description>
            <p>
              地图以 5 × 2 分布十个互不重叠的目标：每种效果都有自己的兼容
              Shape，点击目录按钮可选中并聚焦。普通模式切换效果会自动停止旧句柄；只有显式开启组合模式，才会把 blink、highlight、alert、fade 放到共享 Polygon
              上验证跨 channel 合成。径向效果运行中修改扫描方式、方向、颜色或波纹参数时，示例会用最新 Spec 重新启动当前效果。启动后使用
              <ApiReference kind="method" to="/api/types#api-type-animation-handle-method-pause">pause</ApiReference>、
              <ApiReference kind="method" to="/api/types#api-type-animation-handle-method-resume">resume</ApiReference> 与
              <ApiReference kind="method" to="/api/types#api-type-animation-handle-method-stop">stop</ApiReference> 控制本次播放。
            </p>
          </template>
          <template #preview><AnimationManagerDemo ref="animationDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="variant-lab" class="doc-prose">
        <h2 class="doc-h2">重点变体实验清单</h2>
        <p>上方参数实验室把容易遗漏的公开变体集中在一张地图中；闪烁、呼吸和告警不会随页面加载自动播放。</p>
        <el-table :data="variantRows" border>
          <el-table-column prop="family" label="行为族" min-width="150" />
          <el-table-column prop="variants" label="可运行变体" min-width="360" />
          <el-table-column prop="result" label="应观察到的结果" min-width="360" />
        </el-table>
        <el-alert type="info" :closable="false" show-icon title="gradient 色标方向与互斥规则">
          path-travel 的 offset 0 → 1 沿尾迹前进；radar-scan 的 0 表示最旧尾端、1 表示扫描前沿；center-spread 的 0 表示内侧最旧尾迹、1
          表示外侧波纹前沿。radar-scan 与 center-spread 的 gradient 不能与 color 同时设置，实验室通过“渐变 /
          纯色”切换保证二选一；纯色模式对全部可见尾迹槽恒定应用 opacity，只有 gradient 模式保留尾迹与传播进度渐隐。
        </el-alert>
        <el-alert type="info" :closable="false" show-icon title="radar-scan 往复周期">
          scanMode 为 one-way 时，一个 periodMs 从起扫边界到达对侧边界；round-trip 时，direction 只表示首程方向，扫描前沿在 periodMs / 2 到达对侧并立即折返，在
          periodMs 回到起扫边界。repeat: false 会在这个完整周期后自然完成，repeat: true 则继续下一周期。
        </el-alert>
      </section>

      <section id="compatibility" class="doc-prose">
        <h2 class="doc-h2">兼容矩阵与自然完成</h2>
        <el-table :data="compatibilityRows" border>
          <el-table-column prop="type" label="AnimationType" min-width="150" fixed />
          <el-table-column prop="capability" label="要求能力" min-width="230" />
          <el-table-column prop="targets" label="兼容目标" min-width="360" />
          <el-table-column prop="domain" label="写入域" min-width="150" />
          <el-table-column prop="completion" label="自然完成" min-width="290" />
        </el-table>
        <el-alert type="error" :closable="false" show-icon title="NativeStyleRef 不支持首版动画效果">
          十种效果都依赖结构化 StyleSpec。NativeStyleRef 目标会在建立记录前同步抛 UnsupportedOperationError；引擎不会降级、跳过目标或只播放批次中的兼容部分。
        </el-alert>
      </section>

      <section id="effect-specs" class="doc-prose">
        <h2 class="doc-h2">配置、默认值、范围与单位</h2>
        <p>每个属性名称都可点击到“所有导出类型”中的精确成员；所有 Spec 使用严格普通对象校验，未知字段、accessor、symbol 字段和非法原型都会被拒绝。</p>
        <el-collapse>
          <el-collapse-item v-for="effect in effectDetails" :key="effect.type" :name="effect.type">
            <template #title>
              <span class="animation-doc__effect-title"
                ><code>{{ effect.type }}</code
                ><span>{{ effect.label }}</span></span
              >
            </template>
            <p>
              <ApiReference kind="type" :to="effect.specHref">{{ effect.spec }}</ApiReference>
            </p>
            <el-table :data="effect.fields" border size="small">
              <el-table-column label="属性" min-width="190">
                <template #default="scope">
                  <ApiReference kind="property" :to="scope.row.href">{{ scope.row.name }}</ApiReference>
                </template>
              </el-table-column>
              <el-table-column prop="defaultValue" label="默认值" min-width="220" />
              <el-table-column prop="constraint" label="范围、单位与行为" min-width="440" />
            </el-table>
          </el-collapse-item>
        </el-collapse>
      </section>

      <section id="composition" class="doc-prose">
        <h2 class="doc-h2">channel 管控制，写入域管组合</h2>
        <p>默认 channel 等于 spec.type。同一目标、同一 channel 的新记录在完整校验后原子 replace；不同 channel 并不意味着无条件可组合，还必须满足写入域规则。</p>
        <el-table :data="compositionRows" border>
          <el-table-column prop="domain" label="写入域" min-width="180" />
          <el-table-column prop="effects" label="效果" min-width="330" />
          <el-table-column prop="rule" label="合成规则" min-width="410" />
        </el-table>
        <ul>
          <li>fade + alert：fade 同时降低规范目标替身与告警 overlay 的整体透明度。</li>
          <li>grow + dash-flow：dash-flow 跟随 grow 的有效展示几何。</li>
          <li>grow + highlight / alert：overlay 绑定到 grow 的当前有效几何。</li>
          <li>两个不同 channel 的 grow：同步抛 CapabilityError，旧记录与视觉保持不变。</li>
        </ul>
      </section>

      <section id="handle-lifecycle" class="doc-prose">
        <h2 class="doc-h2">Handle、Element 变化与 retain</h2>
        <ul>
          <li>
            <ApiReference kind="property" to="/api/types#api-type-animation-handle-property-status">status</ApiReference> 为 running / paused / stopped /
            finished；pause 冻结 elapsed，resume 从原位置继续。
          </li>
          <li>
            <ApiReference kind="property" to="/api/types#api-type-animation-handle-property-finished">finished</ApiReference>
            在自然完成或停止后兑现；fade-out retain 兑现后仍保留稳定最后一帧。
          </li>
          <li>Element hide 会暂停并撤下展示资源，show 以最新 View 状态继续；remove 与 earth.destroy() 会停止记录并释放全部资源。</li>
          <li>
            layerId、geometry 或 style 变化会重绑定最新状态，但不会重置动画 elapsed；radar-scan 往复模式会在新 radial frame
            上保持同一去程或回程进度。copy、snapshot 和事务历史不复制动画。
          </li>
          <li>
            <ApiReference kind="method" to="/api/types#api-type-animation-manager-method-stop-all">stopAll</ApiReference> 只影响当前 Earth，不跨实例清理。
          </li>
        </ul>
        <p>
          Manager 级
          <ApiReference kind="method" to="/api/types#api-type-animation-manager-method-pause">pause</ApiReference>、
          <ApiReference kind="method" to="/api/types#api-type-animation-manager-method-resume">resume</ApiReference> 与
          <ApiReference kind="method" to="/api/types#api-type-animation-manager-method-stop">stop</ApiReference>
          接收 Selector 和可选 channel 列表，并返回实际影响的记录数。pause 使用可叠加层级；每次 resume 只减少一级，不能把其他调用方持有的暂停层级一并清除。
        </p>
        <h3 class="doc-h3">fade-out 永久隐藏的无闪回顺序</h3>
        <CodeBlock :code="fadeRetainCode" lang="ts" />
        <p>
          先等待 finished，再用业务 API 设置 visible: false，最后
          <ApiReference kind="method" to="/api/types#api-type-animation-handle-method-stop">handle.stop</ApiReference>
          清理 retained 帧。fade-in 则应先 show，再 play；动画本身不会修改 ElementState.visible。
        </p>
      </section>

      <section id="interaction-policy" class="doc-prose">
        <h2 class="doc-h2">Edit 与 Transform 的视觉所有权</h2>
        <el-table :data="interactionRows" border>
          <el-table-column prop="definitions" label="Definition" min-width="380" />
          <el-table-column prop="edit" label="Edit" min-width="220" />
          <el-table-column prop="transform" label="Transform" min-width="220" />
        </el-table>
        <p>
          pause-and-suppress 冻结 elapsed 并暂时隐藏动画，把视觉所有权交给交互预览；follow-preview 继续推进时间并使用 Transform 的 View
          工作几何。会话完成、取消、替换或打开失败后都会恢复到最新 ElementState。
        </p>
        <el-alert type="info" :closable="false" show-icon title="动画和交互都不越过状态边界">
          动画帧不会写 Store、copy、snapshot 或交互工作态；交互也不会把动画中间几何提交为业务状态。
        </el-alert>
      </section>

      <section id="rendering-boundary" class="doc-prose">
        <h2 class="doc-h2">渲染顺序、declutter 与命中边界</h2>
        <ul>
          <li>opacity / geometry replacement 目标在同一业务层的普通 Feature 之后绘制；不同 replacement 目标仍按 zIndex、原渲染顺序和 generation 稳定排序。</li>
          <li>
            postrender 替身不参与 OpenLayers 原生 declutter；规范透明代理保留原 Icon、Text 或 Symbol 的占位。严格交错顺序或 declutter
            很重要时，把高频动画目标放入独立业务图层。
          </li>
          <li>world wrap 展示副本由 Adapter 生成，不进入 Store。</li>
          <li>
            命中、Selector、query、ContextMenu 与 getScreenExtent() 始终读取规范 Element 几何；fade 到 0、blink 低位或尚未 grow 到的区域仍按规范几何命中。
          </li>
          <li>overlay 不扩展业务命中范围，也不会生成独立 Element 事件目标；动画展示几何不会改变业务范围查询。</li>
        </ul>
      </section>

      <section id="performance" class="doc-prose">
        <h2 class="doc-h2">性能与资源预算</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><strong>统一调度</strong>
              <p>每个 Earth 一个时钟和 deadline scheduler；每个活动 VectorLayer 一个共享 RenderPass，不为每个 Element 建 RAF、timer 或 listener。</p></el-card
            >
          </el-col>
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><strong>稳定对象</strong>
              <p>固定拓扑预热后复用 Feature、Geometry、Style 和 slot；radar 尾迹最多 16 slot，center-spread 最多 25 slot。</p></el-card
            >
          </el-col>
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><strong>保守裁剪</strong>
              <p>离屏目标跳过采样和绘制；Text、未知 Icon 尺寸或无法可靠估算的视觉会禁用裁剪，避免漏画。</p></el-card
            >
          </el-col>
        </el-row>
        <ul>
          <li>paused、hidden、steady highlight、retained fade 和全部离屏时不持续请求地图帧。</li>
          <li>stop、replace、remove、hide/show、交互取得视觉所有权和 Earth.destroy 都会释放或失效对应缓存。</li>
          <li>不要脱离硬件、浏览器、目标数量、平均顶点数、覆盖面积、DPR 和效果配置承诺帧率；结构预算不是任意规模下的 60 FPS 保证。</li>
        </ul>
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :runtime-names="['animationTypes']"
        title="Animations 完整 API"
        description="这里直接列出 AnimationManager、AnimationHandle、全部十种效果配置，以及 animationTypes 常量的属性、方法、参数、默认值和返回类型。"
      />
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="动画（Animations）" :items="anchors" /></aside>
  </div>
</template>

<style scoped>
.animation-doc__catalog {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.animation-doc__effect-card {
  min-width: 0;
  scroll-margin-top: 88px;
}

.animation-doc__card-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.animation-doc__card-title code {
  color: var(--doc-primary-deep);
}

.animation-doc__card-meta {
  display: grid;
  gap: 9px;
  margin: 0 0 12px;
}

.animation-doc__card-meta > div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
}

.animation-doc__card-meta dt {
  color: var(--doc-muted);
  font-size: 12px;
}

.animation-doc__card-meta dd {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  color: var(--doc-text);
  font-size: 12px;
  line-height: 1.6;
}

.animation-doc__minimal-call {
  margin: 0;
  font-size: 12px;
}

.animation-doc__effect-title {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.animation-doc__effect-title code {
  color: var(--doc-primary-deep);
}

@media (max-width: 780px) {
  .animation-doc__catalog {
    grid-template-columns: 1fr;
  }
}
</style>
