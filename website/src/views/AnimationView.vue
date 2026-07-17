<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import AnimationEffectsDemo from '../examples/AnimationEffectsDemo.vue';
import animationEffectsSource from '../examples/AnimationEffectsDemo.vue?raw';
import type { AnimationType } from '@vrsim/earth-engine-ol';

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

interface SpecDocument {
  readonly id: string;
  readonly type: AnimationType;
  readonly name: string;
  readonly summary: string;
  readonly capability: string;
  readonly completion: string;
  readonly minimal: string;
  readonly rows: Array<Record<string, string>>;
}

const propertyColumns = [
  { prop: 'name', label: '属性名', width: 180, presentation: 'property' as const },
  { prop: 'desc', label: '说明与约束', width: 430 },
  { prop: 'type', label: '类型', width: 260, monospace: true },
  { prop: 'default', label: '默认值', width: 190, monospace: true }
];

const methodColumns = [
  { prop: 'name', label: '方法名', width: 170, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 410 },
  { prop: 'params', label: '参数', width: 390, monospace: true },
  { prop: 'returns', label: '返回值', width: 180, monospace: true }
];

const managerMethodRows = [
  {
    name: '<span id="api-method-play" class="code-fn"><a href="#api-method-play">play</a></span>',
    desc: '对 Selector 的全部匹配目标原子校验并播放；任一目标不兼容、配置非法或写入域冲突时，整个调用失败且不替换旧记录',
    params: 'selector: ElementSelector, spec: <a href="#api-type-animationspec">AnimationSpec</a>',
    returns: '<a href="#api-type-animationhandle">AnimationHandle</a>'
  },
  {
    name: '<span id="api-method-pause" class="code-fn"><a href="#api-method-pause">pause</a></span>',
    desc: '增加匹配记录的暂停层级；省略 channels 时作用于匹配 Element 的全部 channel',
    params: 'selector: ElementSelector, channels?: readonly <a href="#api-type-animationchannel">AnimationChannel</a>[]',
    returns: 'number'
  },
  {
    name: '<span id="api-method-resume" class="code-fn"><a href="#api-method-resume">resume</a></span>',
    desc: '减少匹配记录的暂停层级，并在完全恢复后从冻结 elapsed 继续',
    params: 'selector: ElementSelector, channels?: readonly <a href="#api-type-animationchannel">AnimationChannel</a>[]',
    returns: 'number'
  },
  {
    name: '<span id="api-method-stop" class="code-fn"><a href="#api-method-stop">stop</a></span>',
    desc: '幂等停止匹配记录，并释放 Runtime、retained 帧、presentation lease 与稳定 slot',
    params: 'selector: ElementSelector, channels?: readonly <a href="#api-type-animationchannel">AnimationChannel</a>[]',
    returns: 'number'
  },
  {
    name: '<span id="api-method-stop-all" class="code-fn"><a href="#api-method-stop-all">stopAll</a></span>',
    desc: '停止当前 Earth 的全部动画；不会修改 Element 的业务可见状态',
    params: '—',
    returns: 'void'
  }
];

const handlePropertyRows = [
  { name: '<a id="api-property-handle-id" href="#api-property-handle-id">id</a>', desc: '本次 play 请求的唯一 ID', type: 'string', default: '—' },
  {
    name: '<a id="api-property-handle-status" href="#api-property-handle-status">status</a>',
    desc: '整组目标的当前生命周期状态',
    type: '<a href="#api-type-animationstatus">AnimationStatus</a>',
    default: "'running'"
  },
  {
    name: '<a id="api-property-handle-finished" href="#api-property-handle-finished">finished</a>',
    desc: '组内记录全部自然完成或被停止后兑现；fade-out retain 兑现后仍需 stop 清理最终帧',
    type: 'Promise&lt;void&gt;',
    default: '—'
  }
];

const handleMethodRows = [
  {
    name: '<span id="api-handle-method-pause" class="code-fn"><a href="#api-handle-method-pause">pause</a></span>',
    desc: '暂停这个 Handle 启动的全部仍存活记录；elapsed 冻结',
    params: '—',
    returns: 'void'
  },
  {
    name: '<span id="api-handle-method-resume" class="code-fn"><a href="#api-handle-method-resume">resume</a></span>',
    desc: '继续这个 Handle 中已暂停的记录；不累计暂停时间',
    params: '—',
    returns: 'void'
  },
  {
    name: '<span id="api-handle-method-stop" class="code-fn"><a href="#api-handle-method-stop">stop</a></span>',
    desc: '幂等停止并清理这个 Handle 的记录，包括已 finished 的 retained 最终帧',
    params: '—',
    returns: 'void'
  }
];

const channelType = '<a href="#api-type-animationchannel">AnimationChannel</a>?';
const easingType = '<a href="#api-type-animationeasing">AnimationEasing</a>?';

const commonSpecRows = (type: AnimationType): Array<Record<string, string>> => [
  { name: 'type', desc: '判别字段', type: `<code>'${type}'</code>`, default: `<code>'${type}'</code>` },
  { name: 'channel', desc: '同一目标上的控制与替换分组；相同 channel 的后一次播放原子替换前一次', type: channelType, default: `<code>'${type}'</code>` }
];

const specDocuments: readonly SpecDocument[] = [
  {
    id: 'api-type-pulseanimationspec',
    type: 'pulse',
    name: 'PulseAnimationSpec',
    summary: '在 Point 上绘制向外扩散的脉冲环。',
    capability: '仅支持使用 StyleSpec 的 Point。',
    completion: 'repeat 为 false 时一个周期后移除；默认持续运行。',
    minimal: "earth.animations.play({ id: 'point-1' }, { type: 'pulse' });",
    rows: [
      ...commonSpecRows('pulse'),
      { name: 'periodMs', desc: '单次脉冲周期，有限正数，单位毫秒', type: 'number?', default: '1000' },
      { name: 'color', desc: '脉冲环颜色', type: 'Color?', default: "'#ff0000'" },
      { name: 'repeat', desc: '完成后是否从头开始', type: 'boolean?', default: 'true' },
      { name: 'radius', desc: '基础像素半径，有限正数；脉冲在此基础上向外扩散', type: 'number?', default: '6' }
    ]
  },
  {
    id: 'api-type-dashflowanimationspec',
    type: 'dash-flow',
    name: 'DashFlowAnimationSpec',
    summary: '在有效路径几何上绘制持续移动的虚线。',
    capability: '支持最终 RenderGeometry 为 Polyline 的路径，包括 Polyline、LunePolyline 与 CurvePolyline。',
    completion: '不会自然完成，由 stop、replace、remove 或 destroy 结束。',
    minimal: "earth.animations.play({ id: 'route-1' }, { type: 'dash-flow' });",
    rows: [
      ...commonSpecRows('dash-flow'),
      { name: 'speed', desc: '虚线每秒移动的像素距离；有限数，符号决定方向', type: 'number?', default: '24' },
      { name: 'lineDash', desc: '非空、非负且不能全为 0 的实线/空白像素序列', type: 'readonly number[]?', default: '源描边或 [10, 10]' },
      { name: 'color', desc: '虚线颜色；省略时继承目标末层描边颜色', type: 'Color?', default: '继承源样式' }
    ]
  },
  {
    id: 'api-type-pathtravelanimationspec',
    type: 'path-travel',
    name: 'PathTravelAnimationSpec',
    summary: '沿路径绘制带尾迹和可选起终点标记的迁移动画。',
    capability: '支持最终 RenderGeometry 至少包含两个坐标的 Polyline 路径。',
    completion: 'repeat 为 false 时按 finishBehavior 移除或保留最后一帧；默认持续运行。',
    minimal: "earth.animations.play({ id: 'route-1' }, { type: 'path-travel' });",
    rows: [
      ...commonSpecRows('path-travel'),
      { name: 'speed', desc: '每秒移动的地图距离，有限正数；与 durationMs 互斥', type: 'number?', default: '—' },
      { name: 'durationMs', desc: '完整移动一次的时长，有限正数，单位毫秒；与 speed 互斥', type: 'number?', default: '2000（未传 speed）' },
      { name: 'repeat', desc: '到达终点后是否重新开始', type: 'boolean?', default: 'true' },
      { name: 'trailLength', desc: '尾迹占整条路径的比例，范围 (0, 1]', type: 'number?', default: '0.25' },
      { name: 'color', desc: '尾迹基础颜色；省略时继承末层描边，仍无颜色时使用内置青色', type: 'Color?', default: '继承或 #00d8ff' },
      { name: 'gradient', desc: '至少两个、offset 在 [0, 1] 内严格递增的 [offset, Color] 色标', type: 'readonly [number, Color][]?', default: '—' },
      { name: 'width', desc: '尾迹像素宽度，有限正数', type: 'number?', default: '2' },
      { name: 'curvature', desc: '两点路径的曲率；0 使用原路径，必须是有限数', type: 'number?', default: '0' },
      { name: 'smoothness', desc: '曲线路径采样段数，1..2048 的安全整数', type: 'number?', default: '180' },
      { name: 'showStart', desc: '是否绘制路径起点标记', type: 'boolean?', default: 'true' },
      { name: 'showEnd', desc: '是否绘制路径终点标记', type: 'boolean?', default: 'true' },
      { name: 'endLineColor', desc: '设置后把 retain 最终路径改为该纯色', type: 'Color?', default: '渐变保留原渐变，否则使用尾迹基础颜色' },
      { name: 'finishBehavior', desc: '非 repeat 完成后移除效果或保留最终路径', type: "'remove' | 'retain'?", default: "'remove'" }
    ]
  },
  {
    id: 'api-type-blinkanimationspec',
    type: 'blink',
    name: 'BlinkAnimationSpec',
    summary: '按占空比在高、低整体 opacity 之间阶跃切换。',
    capability: '支持所有使用 StyleSpec 的结构化 Shape。',
    completion: 'repeat 为 false 时一个周期后移除；调度器只在切换边界唤醒。',
    minimal: "earth.animations.play({ id: 'area-1' }, { type: 'blink' });",
    rows: [
      ...commonSpecRows('blink'),
      { name: 'periodMs', desc: '单次闪烁周期，有限正数，单位毫秒', type: 'number?', default: '800' },
      { name: 'dutyCycle', desc: '每周期保持最大 opacity 的比例，范围 (0, 1)', type: 'number?', default: '0.5' },
      { name: 'minOpacity', desc: '低位整体透明度乘数，范围 [0, 1] 且小于 maxOpacity', type: 'number?', default: '0' },
      { name: 'maxOpacity', desc: '高位整体透明度乘数，范围 [0, 1] 且大于 minOpacity', type: 'number?', default: '1' },
      { name: 'repeat', desc: '完成一个周期后是否重新开始', type: 'boolean?', default: 'true' }
    ]
  },
  {
    id: 'api-type-highlightanimationspec',
    type: 'highlight',
    name: 'HighlightAnimationSpec',
    summary: '在闭合面上追加稳定或平滑呼吸的填充与描边高亮。',
    capability: '支持非退化 Polygon 与半径大于 0 的 Circle；要求 StyleSpec。',
    completion: '不会自然完成；steady 不持续请求地图帧。',
    minimal: "earth.animations.play({ id: 'area-1' }, { type: 'highlight' });",
    rows: [
      ...commonSpecRows('highlight'),
      { name: 'mode', desc: '稳定高亮或余弦呼吸高亮', type: "'steady' | 'breathe'?", default: "'steady'" },
      { name: 'color', desc: '高亮填充和描边颜色；颜色自身 alpha 会参与相乘', type: 'Color?', default: "'#ffc107'" },
      { name: 'fillOpacity', desc: '填充相对颜色 alpha 的乘数，范围 [0, 1]', type: 'number?', default: '0.18' },
      { name: 'strokeWidth', desc: '高亮描边像素宽度，有限非负数', type: 'number?', default: '3' },
      { name: 'periodMs', desc: '仅 breathe 可传的呼吸周期，有限正数；steady 显式传入会报错', type: 'number?', default: '1200（breathe）' }
    ]
  },
  {
    id: 'api-type-alertanimationspec',
    type: 'alert',
    name: 'AlertAnimationSpec',
    summary: '在闭合面上追加固定双峰节奏的填充、描边和外扩光晕。',
    capability: '支持非退化 Polygon 与半径大于 0 的 Circle；要求 StyleSpec。',
    completion: 'repeat 为 false 时一个告警周期后移除 overlay。',
    minimal: "earth.animations.play({ id: 'area-1' }, { type: 'alert' });",
    rows: [
      ...commonSpecRows('alert'),
      { name: 'periodMs', desc: '单次双峰告警周期，有限正数，单位毫秒', type: 'number?', default: '1200' },
      { name: 'color', desc: '填充、描边和光晕颜色；颜色自身 alpha 会参与相乘', type: 'Color?', default: "'#ff3b30'" },
      { name: 'fillOpacity', desc: '填充相对颜色 alpha 的乘数，范围 [0, 1]', type: 'number?', default: '0.22' },
      { name: 'strokeWidth', desc: '告警描边像素宽度，有限非负数', type: 'number?', default: '3' },
      { name: 'repeat', desc: '完成一个双峰周期后是否重新开始', type: 'boolean?', default: 'true' }
    ]
  },
  {
    id: 'api-type-growanimationspec',
    type: 'grow',
    name: 'GrowAnimationSpec',
    summary: '从起点或终点按累计长度逐步揭示路径或 Shape provider 提供的箭头。',
    capability: '支持 Polyline、LunePolyline、CurvePolyline，以及全部内置面箭头 reveal provider。',
    completion: 'repeat 为 false 时完整几何无缝接替临时几何并移除效果。',
    minimal: "earth.animations.play({ id: 'route-1' }, { type: 'grow' });",
    rows: [
      ...commonSpecRows('grow'),
      { name: 'durationMs', desc: '从空展示到完整图形的时长，有限正数，单位毫秒', type: 'number?', default: '1200' },
      { name: 'direction', desc: '揭示顺序；reverse 仍从空展示开始，不表示收缩', type: "'forward' | 'reverse'?", default: "'forward'" },
      { name: 'easing', desc: '揭示进度缓动曲线', type: easingType, default: "'linear'" },
      { name: 'repeat', desc: '完整揭示后是否从空展示重新开始', type: 'boolean?', default: 'false' }
    ]
  },
  {
    id: 'api-type-radarscananimationspec',
    type: 'radar-scan',
    name: 'RadarScanAnimationSpec',
    summary: '在圆形或扇面径向范围内绘制固定 slot 的旋转尾迹，可选择纯色或沿尾迹方向变化的渐变。',
    capability: '仅支持 Circle 与 Sector radial provider；要求 StyleSpec。',
    completion: 'repeat 为 false 时完成一轮扫描后移除。',
    minimal: "earth.animations.play({ id: 'sector-1' }, { type: 'radar-scan' });",
    rows: [
      ...commonSpecRows('radar-scan'),
      { name: 'periodMs', desc: '完整扫描一轮的时长，有限正数，单位毫秒', type: 'number?', default: '2000' },
      { name: 'direction', desc: '最终屏幕上的旋转方向，不随 View rotation 改变含义', type: "'clockwise' | 'counterclockwise'?", default: "'clockwise'" },
      { name: 'color', desc: '纯色尾迹快捷配置；颜色自身 alpha 会参与相乘，不能与 gradient 同时设置', type: 'Color?', default: "'#00e676'" },
      {
        name: 'gradient',
        desc: '渐变尾迹色标；至少两个、offset 在 [0, 1] 内严格递增，0 表示最旧尾端、1 表示扫描前沿；不能与 color 同时设置',
        type: 'readonly [number, Color][]?',
        default: '—'
      },
      { name: 'opacity', desc: '尾迹相对颜色 alpha 的乘数，范围 [0, 1]', type: 'number?', default: '0.35' },
      { name: 'beamWidthDeg', desc: '尾迹角宽，范围 (0, 360] 度；Sector 还会裁剪到自身 sweep', type: 'number?', default: '45' },
      { name: 'repeat', desc: '完成一轮扫描后是否重新开始', type: 'boolean?', default: 'true' }
    ]
  },
  {
    id: 'api-type-centerspreadanimationspec',
    type: 'center-spread',
    name: 'CenterSpreadAnimationSpec',
    summary: '从圆形或扇面中心错峰发射固定数量的扩散环或扩散弧。',
    capability: '仅支持 Circle 与 Sector radial provider；要求 StyleSpec。',
    completion: 'repeat 为 false 时等待最后一个环完成后移除全部 slot。',
    minimal: "earth.animations.play({ id: 'circle-1' }, { type: 'center-spread' });",
    rows: [
      ...commonSpecRows('center-spread'),
      { name: 'periodMs', desc: '单个环从中心传播到外半径的寿命，有限正数，单位毫秒', type: 'number?', default: '1600' },
      { name: 'color', desc: '扩散环颜色；颜色自身 alpha 会参与相乘', type: 'Color?', default: "'#00e5ff'" },
      { name: 'strokeWidth', desc: '扩散环像素宽度，有限非负数', type: 'number?', default: '2' },
      { name: 'ringCount', desc: '错峰传播的稳定环数量，1..5 的安全整数', type: 'number?', default: '3' },
      { name: 'repeat', desc: '全部环完成一轮传播后是否重新开始', type: 'boolean?', default: 'true' }
    ]
  },
  {
    id: 'api-type-fadeanimationspec',
    type: 'fade',
    name: 'FadeAnimationSpec',
    summary: '对结构化目标及其全部 overlay 应用整体渐显或渐隐 opacity。',
    capability: '支持所有使用 StyleSpec 的结构化 Shape。',
    completion: 'fade-in 固定 remove；fade-out 固定 retain，finished 后 stop 才释放最终帧。',
    minimal: "earth.animations.play({ id: 'element-1' }, { type: 'fade', direction: 'out' });",
    rows: [
      ...commonSpecRows('fade'),
      { name: 'direction', desc: '必须明确选择渐显或渐隐；不会根据可见状态或 channel 推断', type: "'in' | 'out'", default: '必填' },
      { name: 'durationMs', desc: '完整渐变时长，有限正数，单位毫秒', type: 'number?', default: '500' },
      { name: 'easing', desc: '整体 opacity 的缓动曲线', type: easingType, default: "'ease-in-out'" }
    ]
  }
];

const specAnchorByType = Object.fromEntries(specDocuments.map((document) => [document.type, document.id])) as Record<AnimationType, string>;
const matrixTypes = specDocuments.map(({ type }) => type);

const matrixRows: ReadonlyArray<{ readonly target: string; readonly values: Record<AnimationType, string> }> = [
  {
    target: 'Point + StyleSpec',
    values: {
      pulse: '✓',
      'dash-flow': '—',
      'path-travel': '—',
      blink: '✓',
      highlight: '—',
      alert: '—',
      grow: '—',
      'radar-scan': '—',
      'center-spread': '—',
      fade: '✓'
    }
  },
  {
    target: 'Polyline / 曲线路径 + StyleSpec',
    values: {
      pulse: '—',
      'dash-flow': '✓',
      'path-travel': '✓',
      blink: '✓',
      highlight: '—',
      alert: '—',
      grow: '✓',
      'radar-scan': '—',
      'center-spread': '—',
      fade: '✓'
    }
  },
  {
    target: '普通闭合 Polygon / Plot + StyleSpec',
    values: {
      pulse: '—',
      'dash-flow': '—',
      'path-travel': '—',
      blink: '✓',
      highlight: '✓',
      alert: '✓',
      grow: '—',
      'radar-scan': '—',
      'center-spread': '—',
      fade: '✓'
    }
  },
  {
    target: '内置面箭头 + StyleSpec',
    values: {
      pulse: '—',
      'dash-flow': '—',
      'path-travel': '—',
      blink: '✓',
      highlight: '✓',
      alert: '✓',
      grow: 'provider',
      'radar-scan': '—',
      'center-spread': '—',
      fade: '✓'
    }
  },
  {
    target: 'Circle + StyleSpec',
    values: {
      pulse: '—',
      'dash-flow': '—',
      'path-travel': '—',
      blink: '✓',
      highlight: '✓',
      alert: '✓',
      grow: '—',
      'radar-scan': '✓',
      'center-spread': '✓',
      fade: '✓'
    }
  },
  {
    target: 'Sector + StyleSpec',
    values: {
      pulse: '—',
      'dash-flow': '—',
      'path-travel': '—',
      blink: '✓',
      highlight: '✓',
      alert: '✓',
      grow: '—',
      'radar-scan': '✓',
      'center-spread': '✓',
      fade: '✓'
    }
  },
  {
    target: 'NativeStyleRef',
    values: {
      pulse: '—',
      'dash-flow': '—',
      'path-travel': '—',
      blink: '—',
      highlight: '—',
      alert: '—',
      grow: '—',
      'radar-scan': '—',
      'center-spread': '—',
      fade: '—'
    }
  }
];

const writeDomainRows = [
  {
    domain: 'target-opacity',
    effects: '<a href="#api-type-blinkanimationspec">blink</a>、<a href="#api-type-fadeanimationspec">fade</a>',
    rule: '乘法合成，并限制到 [0, 1]'
  },
  { domain: 'target-geometry', effects: '<a href="#api-type-growanimationspec">grow</a>', rule: '同一目标独占；不同 channel 的两个 writer 原子报错' },
  {
    domain: 'overlay',
    effects:
      '<a href="#api-type-pulseanimationspec">pulse</a>、<a href="#api-type-dashflowanimationspec">dash-flow</a>、<a href="#api-type-pathtravelanimationspec">path-travel</a>、<a href="#api-type-highlightanimationspec">highlight</a>、<a href="#api-type-alertanimationspec">alert</a>、<a href="#api-type-radarscananimationspec">radar-scan</a>、<a href="#api-type-centerspreadanimationspec">center-spread</a>',
    rule: '按记录创建序与稳定 slotKey 追加'
  }
];

const writeDomainColumns = [
  { prop: 'domain', label: '写入域', width: 180, monospace: true },
  { prop: 'effects', label: '效果', width: 520 },
  { prop: 'rule', label: '组合规则', width: 300 }
];

const interactionRows = [
  { effects: '<a href="#api-type-pulseanimationspec">pulse</a>', edit: 'pause-and-suppress', transform: 'pause-and-suppress' },
  {
    effects: '<a href="#api-type-dashflowanimationspec">dash-flow</a>、<a href="#api-type-pathtravelanimationspec">path-travel</a>',
    edit: 'pause-and-suppress',
    transform: 'follow-preview'
  },
  {
    effects: 'blink、highlight、alert、grow、radar-scan、center-spread、fade',
    edit: 'pause-and-suppress',
    transform: 'pause-and-suppress'
  }
];

const interactionColumns = [
  { prop: 'effects', label: 'Definition', width: 430 },
  { prop: 'edit', label: 'Edit', width: 210, monospace: true },
  { prop: 'transform', label: 'Transform', width: 210, monospace: true }
];

const fadeRetainSource = `const handle = earth.animations.play(
  { id: 'target' },
  { type: 'fade', direction: 'out' }
);

await handle.finished;
earth.elements.hide({ id: 'target' });
handle.stop(); // 清除 opacity = 0 的 retained 最终帧，不会闪回`;

const anchors: AnchorItem[] = [
  { id: 'overview', label: '概述' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-animation-effects', label: '十种效果与完整控制' }] },
  { id: 'compatibility', label: '兼容矩阵' },
  { id: 'composition', label: 'channel 与组合' },
  { id: 'lifecycle', label: 'Handle 与生命周期' },
  { id: 'interactions', label: 'Edit / Transform' },
  { id: 'rendering', label: '渲染与命中限制' },
  { id: 'performance', label: '性能与清理' },
  {
    id: 'api',
    label: 'API',
    children: [
      {
        id: 'api-core-types',
        label: '管理器与公共类型',
        children: [
          { id: 'api-type-animationmanager', label: 'AnimationManager' },
          { id: 'api-type-animationhandle', label: 'AnimationHandle' },
          { id: 'api-type-animationspec', label: 'AnimationSpec' },
          { id: 'api-type-animationtype', label: 'AnimationType' },
          { id: 'api-type-animationchannel', label: 'AnimationChannel' },
          { id: 'api-type-animationstatus', label: 'AnimationStatus' },
          { id: 'api-type-animationeasing', label: 'AnimationEasing' }
        ]
      },
      {
        id: 'api-specs',
        label: '效果 Spec',
        children: specDocuments.map(({ id, name }) => ({ id, label: name }))
      }
    ]
  }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">动画与效果</span>
        <h1>Animation 动画效果</h1>
        <p>通过一个 AnimationManager 为结构化 Element 组合透明度、临时几何和 overlay 效果，同时保持业务状态、命中与资源生命周期清晰。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          所有动画都从 <code>earth.animations</code> 获取 <code><a href="#api-type-animationmanager">AnimationManager</a></code
          >，并调用 <code class="code-fn"><a href="#api-method-play">play</a></code
          >。区域、路径、箭头和径向效果不创建各自的 Manager；兼容性由目标的结构化样式、最终几何和 Shape provider 决定。
        </p>
        <p>
          <code class="code-fn"><a href="#api-method-play">play</a></code> 接受完整 ElementSelector，可按
          <code>id</code>、<code>ids</code>、<code>module</code>、<code>layerId</code>、<code>type</code>、<code>visible</code> 或
          <code>predicate</code> 批量选择。批量播放保持原子性：一个目标失败，整次调用都不会建立记录或提前 replace。
        </p>
        <el-alert class="doc-prose__alert" type="warning" show-icon :closable="false">
          <template #title>光敏性提示</template>
          <p>blink、呼吸 highlight 和 alert 可能引发不适。产品应默认不自动播放，提供显式暂停/停止入口，并尊重用户的减少动态效果偏好。</p>
        </el-alert>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-animation-effects">
          <ExampleBlock
            title="十种效果与完整控制"
            :description="`效果列表由公开 <code><a href=&quot;#api-type-animationtype&quot;>animationTypes</a></code> 与同源清单生成，默认选中 radar-scan，可在启动前切换绿色渐变或纯色尾迹。点击启动后，可通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-handle-method-pause&quot;>pause</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-handle-method-resume&quot;>resume</a></code> 和 <code class=&quot;code-fn&quot;><a href=&quot;#api-handle-method-stop&quot;>stop</a></code> 控制最近的 <code><a href=&quot;#api-type-animationhandle&quot;>AnimationHandle</a></code>；组件卸载时停止全部句柄并销毁 Earth。`"
            :source="animationEffectsSource"
          >
            <template #preview>
              <AnimationEffectsDemo />
            </template>
          </ExampleBlock>
        </div>
      </section>

      <section id="compatibility" class="doc-prose">
        <h2 class="doc-h2">十种效果兼容矩阵</h2>
        <p>
          “provider”表示 ShapeDefinition 提供专用揭示语义；不是按最终 Polygon 外环裁剪。新增效果遇到 NativeStyleRef 会在
          <code class="code-fn"><a href="#api-method-play">play</a></code> 建立记录前原子抛出 <code>UnsupportedOperationError</code>。
        </p>
        <div class="animation-table-scroll" tabindex="0">
          <table class="animation-matrix">
            <thead>
              <tr>
                <th scope="col">目标能力</th>
                <th v-for="type in matrixTypes" :key="type" scope="col">
                  <a :href="`#${specAnchorByType[type]}`">{{ type }}</a>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in matrixRows" :key="row.target">
                <th scope="row">{{ row.target }}</th>
                <td v-for="type in matrixTypes" :key="type">{{ row.values[type] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="doc-prose__hint">
          所有最终渲染为 Polygon 的 Rectangle、Ellipse、Triangle、EquilateralTriangle、AssemblePolygon、ClosedCurvePolygon、LunePolygon、Sector
          和内置面箭头都自然具有 closed-surface 能力；只有内置面箭头额外具有 reveal provider，只有 Circle 与 Sector 具有 radial provider。
        </p>
        <p class="doc-prose__hint">
          非法字段或范围抛出 <code>InvalidArgumentError</code>，目标能力或写入域不兼容抛出 <code>CapabilityError</code>，NativeStyleRef 抛出
          <code>UnsupportedOperationError</code>，已销毁对象的非幂等操作抛出 <code>ObjectDisposedError</code>；这些错误不会触发部分播放。
        </p>
      </section>

      <section id="composition" class="doc-prose">
        <h2 class="doc-h2">channel 与组合</h2>
        <p>
          <code><a href="#api-type-animationchannel">channel</a></code> 是用户可见的控制和替换分组，默认等于 <code>spec.type</code>。同一目标、同一 channel
          的后一次 <code class="code-fn"><a href="#api-method-play">play</a></code> 会在完整校验成功后原子替换旧 Runtime；若校验失败，旧动画继续运行。
        </p>
        <ApiTable :columns="writeDomainColumns" :rows="writeDomainRows" />
        <ul class="doc-list animation-spaced-list">
          <li><code>fade + blink</code>：两个 opacity 乘法合成。</li>
          <li><code>fade + alert</code>：fade 同时作用于原目标和告警 overlay。</li>
          <li><code>grow + dash-flow</code>：流动虚线跟随 grow 的有效展示几何。</li>
          <li><code>grow + highlight/alert</code>：闭合面 overlay 跟随 grow 的有效展示几何。</li>
          <li>两个不同 channel 的 grow 同时写 target-geometry，原子抛出 <code>CapabilityError</code>，不会静默覆盖。</li>
        </ul>
        <p class="doc-prose__hint">
          overlay 的最终 opacity 还会乘以目标的合成 opacity；目标完全透明时，其连续 overlay 不再请求无效地图帧，但 elapsed 仍按统一时钟推进。
        </p>
      </section>

      <section id="lifecycle" class="doc-prose">
        <h2 class="doc-h2">Handle、retain 与生命周期</h2>
        <p>
          每次 <code class="code-fn"><a href="#api-method-play">play</a></code> 返回一个 <code><a href="#api-type-animationhandle">AnimationHandle</a></code
          >。句柄的 <code><a href="#api-property-handle-status">status</a></code> 反映整组记录状态，<code
            ><a href="#api-property-handle-finished">finished</a></code
          >
          在全部记录自然完成或被停止后兑现。
        </p>
        <ul class="doc-list animation-spaced-list">
          <li>
            <code class="code-fn"><a href="#api-handle-method-pause">pause</a></code> 冻结 elapsed；<code class="code-fn"
              ><a href="#api-handle-method-resume">resume</a></code
            >
            从原位置继续，不累计暂停时间。
          </li>
          <li>hide 暂停目标并撤下替身与 overlay；show 重新绑定最新 geometry/style 后继续。fade-in 不会自动显示业务上隐藏的 Element，应先 show。</li>
          <li>
            <code class="code-fn"><a href="#api-handle-method-stop">stop</a></code> 幂等清除 Runtime、retained 帧、lease 和 slot。remove 与 Earth.destroy
            也会停止并清理相关记录。
          </li>
          <li>copy、snapshot 与事务历史不复制动画；layerId 或 geometry/style revision 变化只重绑最新状态，不重启动时间线。</li>
        </ul>
        <h3 class="doc-h3">fade-out retain 与永久隐藏</h3>
        <p>
          <code><a href="#api-type-fadeanimationspec">FadeAnimationSpec</a></code> 的 fade-out 在 opacity 0 完成并 retain；Promise
          已兑现，但最终展示资源仍存在。要永久隐藏且不闪回，必须先写入业务可见状态，再停止 retained 效果：
        </p>
        <pre class="animation-code"><code>{{ fadeRetainSource }}</code></pre>
        <p class="doc-prose__hint">如果只需要一次视觉渐隐并恢复原目标，等待 finished 后直接调用 Handle.stop；不要让动画替代 Element.visible 业务状态。</p>
      </section>

      <section id="interactions" class="doc-prose">
        <h2 class="doc-h2">Edit / Transform 策略</h2>
        <ApiTable :columns="interactionColumns" :rows="interactionRows" />
        <p>
          <code>pause-and-suppress</code> 会冻结 elapsed 并把临时视觉所有权交给交互预览；完成、取消或打开失败后，以最新 ElementState 恢复。
          <code>follow-preview</code> 则继续推进 elapsed，并跟随 Transform 发布的 View 工作几何。Edit 首版不发布逐帧预览，因此所有 Definition 在 Edit
          中都暂停并抑制。
        </p>
        <p class="doc-prose__hint">
          动画不会提交中间 geometry，交互也不会把动画帧写回 Store。动画中的 grow、fade、radar 等不会改变 Undo/Redo、copy 或 snapshot 结果。
        </p>
      </section>

      <section id="rendering" class="doc-prose">
        <h2 class="doc-h2">渲染、命中与布局限制</h2>
        <ul class="doc-list animation-spaced-list">
          <li>
            highlight、alert、radar、center-spread 等 overlay 由业务层共享的 postrender RenderPass 绘制；fade、blink、grow 在动画期间使用 presentation
            replacement。
          </li>
          <li>replacement 目标在同一业务层的普通 Feature 之后绘制；replacement 之间按原 zIndex、渲染顺序和 Element generation 稳定排序，图层间顺序不变。</li>
          <li>postrender 替身不参与 OpenLayers 原生 declutter；透明规范代理可能继续占用原 Icon、Text 或 Symbol 的避让空间。</li>
          <li>world wrap 副本由 Adapter 根据当前视图生成，只参与展示，不进入 Store、Selector、copy 或 snapshot。</li>
          <li>fade 到 0、blink 低位或 grow 尚未揭示的规范部分仍可命中；overlay 不扩大业务命中范围，也不会产生独立 Element 事件目标。</li>
          <li><code>getScreenExtent()</code>、Selector、query、ContextMenu 和业务范围查询继续读取规范 ElementState，不随动画展示几何变化。</li>
          <li>如果同层交错顺序或 declutter 是硬要求，应把高频动画目标放在独立业务图层，并通过图层 zIndex 明确排序。</li>
        </ul>
      </section>

      <section id="performance" class="doc-prose">
        <h2 class="doc-h2">性能与资源清理</h2>
        <p>
          动画会增加逐帧几何更新和 Canvas 绘制成本，但内核用 Earth 级统一时钟、每个活动 VectorLayer 一个 RenderPass、稳定 slot 与视口裁剪控制增长，不会为每个
          Element 创建 RAF、timer 或 render listener。
        </p>
        <ul class="doc-list animation-spaced-list">
          <li>暂停、隐藏、steady highlight、fade-out retained 和全部离屏目标不会持续请求无效地图帧；blink 只在阶跃边界唤醒。</li>
          <li>radar 尾迹默认 10 个稳定 slot、硬上限 16；center-spread 默认 3 个、硬上限 5。slot 数不会随播放时长增长。</li>
          <li>大量高覆盖面积的呼吸、告警和径向效果仍会增加 fill rate；按模块批量 pause/stop，降低同时可见目标数，并优先放入独立动画图层。</li>
          <li>
            组件卸载时保存并停止所有 <code><a href="#api-type-animationhandle">AnimationHandle</a></code
            >，再调用 <code class="code-fn"><a href="#api-method-stop-all">stopAll</a></code> 或销毁 Earth；remove、replace 和 destroy 都应恢复资源计数基线。
          </li>
          <li>性能门槛是回归检测，不是任意规模 60 FPS 承诺。容量评估需同时记录硬件、浏览器、目标数、平均顶点数、屏幕覆盖面积、DPR 与效果配置。</li>
        </ul>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>

        <h3 id="api-core-types" class="doc-h3">管理器与公共类型</h3>

        <h4 id="api-type-animationmanager" class="doc-h4">AnimationManager</h4>
        <p class="doc-prose__hint">不可直接构造；通过当前 Earth 的只读 <code>animations</code> 属性取得。</p>
        <ApiTable :columns="methodColumns" :rows="managerMethodRows" />

        <h4 id="api-type-animationhandle" class="doc-h4">AnimationHandle</h4>
        <p class="doc-prose__hint">控制同一次 play 启动的一个或多个目标记录。</p>
        <ApiTable :columns="propertyColumns" :rows="handlePropertyRows" />
        <ApiTable :columns="methodColumns" :rows="handleMethodRows" />

        <h4 id="api-type-animationspec" class="doc-h4">AnimationSpec</h4>
        <p>
          <code
            ><a href="#api-type-pulseanimationspec">PulseAnimationSpec</a> | <a href="#api-type-dashflowanimationspec">DashFlowAnimationSpec</a> |
            <a href="#api-type-pathtravelanimationspec">PathTravelAnimationSpec</a> | <a href="#api-type-blinkanimationspec">BlinkAnimationSpec</a> |
            <a href="#api-type-highlightanimationspec">HighlightAnimationSpec</a> | <a href="#api-type-alertanimationspec">AlertAnimationSpec</a> |
            <a href="#api-type-growanimationspec">GrowAnimationSpec</a> | <a href="#api-type-radarscananimationspec">RadarScanAnimationSpec</a> |
            <a href="#api-type-centerspreadanimationspec">CenterSpreadAnimationSpec</a> | <a href="#api-type-fadeanimationspec">FadeAnimationSpec</a></code
          >
        </p>
        <p class="doc-prose__hint">
          所有 Spec 都必须是严格普通对象：未知字段、accessor、symbol 字段、非法原型或非法数值会在 play 建立记录前同步拒绝；调用方对象不会被修改。
        </p>

        <h4 id="api-type-animationtype" class="doc-h4">AnimationType 与 animationTypes</h4>
        <p><code>'pulse' | 'dash-flow' | 'path-travel' | 'blink' | 'highlight' | 'alert' | 'grow' | 'radar-scan' | 'center-spread' | 'fade'</code></p>
        <p class="doc-prose__hint">
          公开常量 animationTypes 按上述顺序保存。功能版本可以在末尾追加内置类型；消费方的 exhaustive switch、assertNever 和 Record 应保留未知成员兜底。
        </p>

        <h4 id="api-type-animationchannel" class="doc-h4">AnimationChannel</h4>
        <p><code>string</code>。默认等于动画 type；负责控制与 replace，不替代写入域冲突检查。</p>

        <h4 id="api-type-animationstatus" class="doc-h4">AnimationStatus</h4>
        <p><code>'running' | 'paused' | 'stopped' | 'finished'</code></p>

        <h4 id="api-type-animationeasing" class="doc-h4">AnimationEasing</h4>
        <p><code>'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'</code></p>
        <p class="doc-prose__hint">由内核使用固定三次函数采样，不交给 CSS、Web Animations 或 Adapter 自行解释。</p>

        <h3 id="api-specs" class="doc-h3">效果 Spec</h3>
        <section v-for="document in specDocuments" :key="document.id" class="animation-spec-doc">
          <h4 :id="document.id" class="doc-h4">{{ document.name }}</h4>
          <p>{{ document.summary }} {{ document.capability }} {{ document.completion }}</p>
          <p class="animation-minimal-call">
            <span>最小调用</span><code>{{ document.minimal }}</code>
          </p>
          <ApiTable :columns="propertyColumns" :rows="document.rows" />
        </section>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="Animation 动画效果" :items="anchors" />
    </aside>
  </div>
</template>

<style scoped>
.animation-table-scroll {
  max-width: 100%;
  margin: 18px 0;
  overflow-x: auto;
  border: 1px solid var(--doc-border);
  border-radius: 10px;
  background: var(--doc-surface);
}

.animation-matrix {
  width: 100%;
  min-width: 1180px;
  border-collapse: collapse;
  font-size: 13px;
  text-align: center;
}

.animation-matrix th,
.animation-matrix td {
  padding: 11px 10px;
  border-right: 1px solid var(--doc-border);
  border-bottom: 1px solid var(--doc-border);
}

.animation-matrix th:first-child {
  min-width: 230px;
  text-align: left;
}

.animation-matrix tr:last-child > * {
  border-bottom: 0;
}

.animation-matrix tr > *:last-child {
  border-right: 0;
}

.animation-matrix thead th {
  background: var(--doc-surface-soft);
  color: var(--doc-text);
  font-weight: 700;
}

.animation-matrix a {
  color: var(--doc-primary-deep);
  text-decoration: none;
}

.animation-matrix a:hover {
  text-decoration: underline;
}

.animation-spaced-list {
  margin-top: 16px;
}

.animation-code {
  overflow-x: auto;
  margin: 16px 0;
  padding: 18px 20px;
  border: 1px solid var(--doc-border);
  border-radius: 10px;
  background: var(--doc-code-background);
  color: var(--doc-text);
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.7;
}

.animation-spec-doc {
  scroll-margin-top: 80px;
}

.animation-minimal-call {
  display: grid;
  gap: 8px;
  margin: 14px 0;
}

.animation-minimal-call span {
  color: var(--doc-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.animation-minimal-call code {
  display: block;
  overflow-x: auto;
  padding: 11px 13px;
  border: 1px solid var(--doc-border);
  border-radius: 8px;
  background: var(--doc-code-background);
  color: var(--doc-text);
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
}
</style>
