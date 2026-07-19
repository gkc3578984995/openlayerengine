<script setup lang="ts">
import { computed, ref } from 'vue';
import ApiReference from '../components/docs/ApiReference.vue';
import CodeBlock from '../components/docs/CodeBlock.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import ElementCoordinateStorageDemo from '../examples/ElementCoordinateStorageDemo.vue';
import elementCoordinateStorageSource from '../examples/ElementCoordinateStorageDemo.vue?raw';

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

type ApiReferenceKind = 'method' | 'property' | 'type';

interface MigrationReference {
  label: string;
  kind: ApiReferenceKind;
  to: string;
}

interface MigrationRow {
  id: string;
  legacy: string;
  current: readonly MigrationReference[];
  description: string;
  status: 'mapped' | 'removed';
}

const anchors: AnchorItem[] = [
  { id: 'checklist', label: '迁移检查清单' },
  { id: 'environment', label: '环境与安装' },
  { id: 'exports', label: '导出、ESM 与样式' },
  { id: 'capability-map', label: '能力映射' },
  {
    id: 'core-examples',
    label: '核心迁移示例',
    children: [
      { id: 'example-use-earth', label: '创建 Earth' },
      { id: 'example-layer-element', label: '图层与 Element' },
      { id: 'example-service-lifecycle', label: '服务与清理' }
    ]
  },
  {
    id: 'coordinate-semantics',
    label: '坐标与几何语义',
    children: [
      { id: 'coordinate-projection', label: '坐标投影' },
      { id: 'example-flat-coordinate-storage', label: '经纬度坐标读写' },
      { id: 'circle-radius', label: '圆半径' },
      { id: 'api-to-flat-coordinates', label: 'toFlatCoordinates' },
      { id: 'polygon-limit', label: 'Polygon 限制' }
    ]
  },
  { id: 'advanced-compatibility', label: '高级兼容注意' },
  { id: 'offline-install', label: '离线依赖闭包' }
];

const checklistItems = [
  { id: 'runtime', label: '将构建环境统一到 Node >=24.18.0 <25、npm >=11 <12。' },
  { id: 'dependencies', label: '显式安装 ol@10.9.0，并为离线环境准备它的完整依赖闭包。' },
  { id: 'exports', label: '改用 ESM、包根导出和 /style.css，删除 require、dist/* 与旧功能子路径。' },
  { id: 'earth', label: '将 useEarth 的两个参数合并为单个配置对象，并用 earth.destroy() 清理实例。' },
  { id: 'model', label: '将专用 Layer 类迁到 earth.layers，将业务图形迁到 earth.elements。' },
  { id: 'services', label: '将 Draw、Edit、Transform、Measure、事件、菜单、Overlay 与动画迁到 Earth 服务。' },
  { id: 'geometry', label: '核对投影坐标、米制圆半径，以及仍不支持的 Polygon 多环和洞。' },
  { id: 'removed', label: '删除 Wind 相关调用，并确认业务不再依赖 1.x 的隐式传递依赖。' }
] as const;

const checkedItems = ref<string[]>([]);
const checklistProgress = computed(() => Math.round((checkedItems.value.length / checklistItems.length) * 100));
const openCompatibilitySections = ref<string[]>(['animation']);

const installCode = `npm install @vrsim/earth-engine-ol@2.0.0 ol@10.9.0`;

const exportsCode = `import {
  Earth,
  lineStyles,
  useEarth,
  type ShapeType,
  type UseEarthOptions
} from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

// 不再使用 require()、dist/* 或 /core、/layers 等功能子路径。`;

const legacyUseEarthCode = `// 1.x：View 与 Earth 配置分成两个参数
const earth = useEarth(
  { center: [0, 0], zoom: 4 },
  { target: 'map', zoom: true }
);`;

const currentUseEarthCode = `import { useEarth, type UseEarthOptions } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

const options: UseEarthOptions = {
  id: 'main',
  target: 'map',
  view: { center: [0, 0], zoom: 4 },
  controls: { zoom: true }
};

const earth = useEarth(options);`;

const legacyElementCode = `// 1.x：图层类型与图形类型绑定
const layer = new PointLayer(earth, { wrapX: false });
const feature = layer.add({
  id: 'vehicle-1',
  module: 'vehicles',
  center: [0, 0],
  size: 10,
  fill: { color: '#409eff' }
});

layer.set({ id: 'vehicle-1', center: [100, 100] });`;

const currentElementCode = `// 2.0：Layer 管渲染容器，Element 管业务图形
const layer = earth.layers.add({
  kind: 'vector',
  id: 'business',
  wrapX: false
});

const element = earth.elements.add({
  id: 'vehicle-1',
  module: 'vehicles',
  layerId: layer.id,
  geometry: { type: 'point', controlPoints: [[0, 0]] },
  style: {
    symbol: {
      type: 'circle',
      radius: 10,
      fill: { type: 'solid', color: '#409eff' }
    }
  }
});

element.update({ geometry: { type: 'point', controlPoints: [[100, 100]] } });`;

const legacyLifecycleCode = `// 1.x：各组件分别获取和清理
const events = earth.useGlobalEvent();
const dispose = events.addMouseClickEventByGlobal(onClick);

const draw = earth.useDrawTool();
draw.drawPoint({ callback: onComplete });

dispose();
draw.destroy();
destroyEarth();`;

const currentLifecycleCode = `// 2.0：能力从 Earth 服务启动，并由 Earth 统一兜底清理
const offClick = earth.events.on('click', event => {
  console.log(event.coordinate, event.element);
});

const drawSession = earth.draw.start({
  type: 'point',
  layerId: 'business',
  policy: 'replace'
});

// 组件卸载时
offClick();
drawSession.cancel();
earth.destroy();`;

const coordinateCode = `const lonLat = [116.391, 39.907] as const;
const projected = earth.view.toProjectedCoordinates(lonLat);

const element = earth.elements.add({
  geometry: { type: 'point', controlPoints: [projected] }
});

// Element.state 保存当前 View 投影坐标；持久化前再转回经纬度。
const savedLonLat = earth.view.toGeographicCoordinates(projected);`;

const circleCode = `const center = earth.view.toProjectedCoordinates([116.391, 39.907]);

earth.elements.add({
  geometry: {
    type: 'circle',
    center,
    radius: 1_000 // 几何半径：米
  }
});

earth.elements.add({
  geometry: { type: 'point', controlPoints: [center] },
  style: {
    symbol: {
      type: 'circle',
      radius: 8, // 点符号半径：CSS 像素
      fill: { type: 'solid', color: '#409eff' }
    }
  }
});`;

const toFlatCoordinatesCode = `import { toFlatCoordinates } from '@vrsim/earth-engine-ol';

const geometry = element.state.geometry;
if (geometry.type === 'circle') {
  throw new Error('圆使用 center 与 radius，不包含 controlPoints');
}

const geographic = earth.view.toGeographicCoordinates(geometry.controlPoints);
const saved = toFlatCoordinates(geographic);
// [116.391, 39.907, ...]`;

const animationCode = `import { type AnimationSpec, type AnimationType } from '@vrsim/earth-engine-ol';

const pulse: AnimationSpec = { type: 'pulse', periodMs: 900 };
const handle = earth.animations.play(
  { module: 'warning' },
  pulse
);

// AnimationType 允许后续版本在末尾追加成员，业务分支必须保留兜底。
function describeAnimation(type: AnimationType | (string & {})): string {
  switch (type) {
    case 'pulse': return '脉冲';
    case 'dash-flow': return '虚线流动';
    case 'path-travel': return '沿路径运动';
    case 'blink': return '闪烁';
    case 'highlight': return '高亮';
    case 'alert': return '告警';
    case 'grow': return '几何揭示';
    case 'radar-scan': return '雷达扫描';
    case 'center-spread': return '中心扩散';
    case 'fade': return '渐显渐隐';
    default: return \`未知动画：\${type}\`;
  }
}`;

const animationTypeNames = ['pulse', 'dash-flow', 'path-travel', 'blink', 'highlight', 'alert', 'grow', 'radar-scan', 'center-spread', 'fade'] as const;

const offlineCode = `# 联网环境：在真实业务项目或其 package 文件完整副本中执行
npm_config_cache=./offline-cache npm install --package-lock-only --save-exact ol@10.9.0 ./vrsim-earth-engine-ol-2.0.0.tgz
npm_config_cache=./offline-cache npm ci --ignore-scripts

# 保持相对路径，将 package.json、package-lock.json、offline-cache 与 engine tgz 一起带入离线环境
npm_config_cache=./offline-cache npm ci --offline --ignore-scripts`;

const migrationRows: MigrationRow[] = [
  {
    id: 'migration-map-earth',
    legacy: 'Earth / createEarth / getEarth / destroyEarth',
    current: [
      { label: 'Earth', kind: 'type', to: '/guide/earth-create#api-type-earth' },
      { label: 'useEarth()', kind: 'method', to: '/guide/earth-create#api-method-use-earth' },
      { label: 'earth.destroy()', kind: 'method', to: '/guide/earth-create#api-method-destroy' }
    ],
    description: '注册实例由 useEarth 获取；构造器实例由调用方持有；两者都通过实例销毁。',
    status: 'mapped'
  },
  {
    id: 'migration-map-layers',
    legacy: 'Base / PointLayer / BillboardLayer / PolylineLayer / PolygonLayer / CircleLayer',
    current: [
      { label: 'earth.layers', kind: 'property', to: '/guide/earth-create#api-property-layers' },
      { label: 'earth.layers.add()', kind: 'method', to: '/guide/earth-create#api-method-layers-add' },
      { label: 'earth.elements', kind: 'property', to: '#migration-map-elements' }
    ],
    description: '一个 vector Layer 可承载多种 Shape；业务图形不再按几何类型拆 Layer 类。',
    status: 'mapped'
  },
  {
    id: 'migration-map-elements',
    legacy: 'Feature 参数、feature.get("param")、图层 add/set/remove',
    current: [
      { label: 'Element', kind: 'type', to: '#migration-map-elements' },
      { label: 'Element.state', kind: 'property', to: '#migration-map-elements' },
      { label: 'earth.elements.add()/query()/update()/remove()', kind: 'method', to: '#example-layer-element' }
    ],
    description: 'Element.state 是业务状态真源；olFeature 仅用于必要的 OpenLayers 互操作。',
    status: 'mapped'
  },
  {
    id: 'migration-map-draw-edit',
    legacy: 'DynamicDraw / PlotDraw / PlotEdit',
    current: [
      { label: 'earth.draw', kind: 'property', to: '#migration-map-draw-edit' },
      { label: 'earth.draw.start()', kind: 'method', to: '#example-service-lifecycle' },
      { label: 'earth.draw.edit()', kind: 'method', to: '#migration-map-draw-edit' }
    ],
    description: '普通图形与 Plot 共用 Draw Session；编辑返回独立 Edit Session。',
    status: 'mapped'
  },
  {
    id: 'migration-map-transform',
    legacy: 'Transform / TransformInteraction',
    current: [
      { label: 'earth.transform', kind: 'property', to: '#migration-map-transform' },
      { label: 'earth.transform.start()/select()', kind: 'method', to: '#migration-map-transform' }
    ],
    description: '使用 Session 管理选择、平移、旋转、缩放、编辑、撤销与重做。',
    status: 'mapped'
  },
  {
    id: 'migration-map-measure',
    legacy: 'earth.useMeasure() / line* / polygonMeasure',
    current: [
      { label: 'earth.measure', kind: 'property', to: '#migration-map-measure' },
      { label: 'earth.measure.start()', kind: 'method', to: '#migration-map-measure' },
      { label: 'earth.measure.clear()', kind: 'method', to: '#migration-map-measure' }
    ],
    description: '距离与面积统一为 Measure Session，历史图形由 earth.measure.clear() 清理。',
    status: 'mapped'
  },
  {
    id: 'migration-map-events',
    legacy: 'GlobalEvent / addMouse* / enable / disable',
    current: [
      { label: 'earth.events', kind: 'property', to: '#migration-map-events' },
      { label: 'earth.events.on()/once()', kind: 'method', to: '#example-service-lifecycle' }
    ],
    description: '订阅即启用，返回幂等注销函数；事件坐标使用当前 View 投影。',
    status: 'mapped'
  },
  {
    id: 'migration-map-context-menu',
    legacy: 'earth.useContextMenu() / addDefaultMenu / addModuleMenu',
    current: [
      { label: 'earth.contextMenu', kind: 'property', to: '#migration-map-context-menu' },
      { label: 'earth.contextMenu.register()', kind: 'method', to: '#migration-map-context-menu' }
    ],
    description: '地图、module 与 Element 菜单统一注册，每次注册返回独立控制句柄。',
    status: 'mapped'
  },
  {
    id: 'migration-map-overlays',
    legacy: 'OverlayLayer / Descriptor',
    current: [
      { label: 'earth.overlays', kind: 'property', to: '#migration-map-overlays' },
      { label: 'earth.overlays.add()/createDescriptor()', kind: 'method', to: '#migration-map-overlays' },
      { label: 'OverlayHandle', kind: 'type', to: '#migration-map-overlays' }
    ],
    description: 'Overlay 与 Descriptor 由同一服务管理，返回公开 Handle，不再返回原生 OL Overlay。',
    status: 'mapped'
  },
  {
    id: 'migration-map-animations',
    legacy: '点闪烁 / 流水线 / 飞行线与分散的动画管理器',
    current: [
      { label: 'earth.animations', kind: 'property', to: '#migration-map-animations' },
      { label: 'earth.animations.play()', kind: 'method', to: '#migration-map-animations' },
      { label: 'AnimationSpec', kind: 'type', to: '#animation-compatibility' }
    ],
    description: '动画以 Element Selector + AnimationSpec 统一播放、暂停、恢复和停止。',
    status: 'mapped'
  },
  {
    id: 'migration-map-utils',
    legacy: 'Utils.*',
    current: [
      { label: 'createId()/lerp2()/add2()/throttle()', kind: 'method', to: '#migration-map-utils' },
      { label: 'earth.view.toProjectedCoordinates()', kind: 'method', to: '/guide/earth-create#api-method-to-projected-coordinates' }
    ],
    description: '纯函数从包根导出；依赖当前地图投影或视口的能力迁到 earth.view。',
    status: 'mapped'
  },
  {
    id: 'migration-map-line-styles',
    legacy: '旧线样式 helper 与枚举',
    current: [
      { label: 'lineStyles', kind: 'property', to: '#migration-map-line-styles' },
      { label: 'StyleSpec', kind: 'type', to: '#migration-map-line-styles' }
    ],
    description: '内置线型从包根导入；旧枚举改为字符串联合和结构化 StyleSpec。',
    status: 'mapped'
  },
  {
    id: 'migration-map-wind',
    legacy: 'WindLayer / WindLayerInstance / ol-wind / wind-core',
    current: [],
    description: '2.0 已删除且没有替代 API；需要在业务层自行接入风场实现。',
    status: 'removed'
  }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">快速上手</span>
        <h1>1.x → 2.0 迁移</h1>
        <p>2.0 以 Earth 服务、Element 状态和 Session 生命周期替代 1.x 的分散组件。先完成环境与入口迁移，再逐项替换业务能力。</p>
      </header>

      <el-alert
        class="migration-hero-alert"
        title="2.0 不提供 1.x API 兼容层"
        type="warning"
        description="建议按模块迁移并完成真实运行验证；不要通过 dist 深路径继续调用旧实现。"
        show-icon
        :closable="false"
      />

      <section id="checklist" class="doc-prose">
        <h2 class="doc-h2">迁移检查清单</h2>
        <p>勾选状态仅保留在当前页面，用来快速核对本次迁移范围。</p>
        <el-card class="migration-checklist" shadow="never">
          <div class="migration-checklist__header">
            <span>已完成 {{ checkedItems.length }} / {{ checklistItems.length }}</span>
            <el-button size="small" :disabled="checkedItems.length === 0" @click="checkedItems = []">重置检查</el-button>
          </div>
          <el-progress :percentage="checklistProgress" :stroke-width="8" :show-text="false" />
          <el-checkbox-group v-model="checkedItems" class="migration-checklist__items">
            <el-checkbox v-for="item in checklistItems" :key="item.id" :value="item.id">
              {{ item.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-card>
      </section>

      <section id="environment" class="doc-prose">
        <h2 class="doc-h2">环境与安装</h2>
        <el-descriptions class="migration-environment" :column="1" border>
          <el-descriptions-item label="Node.js"><el-tag type="primary">&gt;=24.18.0 &lt;25</el-tag></el-descriptions-item>
          <el-descriptions-item label="npm"><el-tag type="success">&gt;=11 &lt;12</el-tag></el-descriptions-item>
          <el-descriptions-item label="OpenLayers"><el-tag type="info">ol 10.9.0</el-tag></el-descriptions-item>
          <el-descriptions-item label="模块格式"><el-tag>ESM / ES2022</el-tag></el-descriptions-item>
        </el-descriptions>
        <p>
          OpenLayers 是运行时需要、由业务项目安装的 optional peer dependency。即使包管理器不提示缺失，也应显式安装并锁定
          <code>ol@10.9.0</code>。
        </p>
        <CodeBlock :code="installCode" lang="bash" />
      </section>

      <section id="exports" class="doc-prose">
        <h2 class="doc-h2">导出、ESM 与样式</h2>
        <p>
          JavaScript、函数和值类型全部从包根导入；样式只从 <code>@vrsim/earth-engine-ol/style.css</code> 导入。2.0 不提供 CommonJS <code>require()</code> 入口。
        </p>
        <CodeBlock :code="exportsCode" lang="typescript" />
        <el-alert
          class="migration-section-alert"
          type="info"
          title="删除深路径导入"
          description="/core、/layers、/draw、/measure、/transform、/plot 和 dist/* 都不是 2.0 公共入口。"
          show-icon
          :closable="false"
        />
      </section>

      <section id="capability-map" class="doc-prose">
        <h2 class="doc-h2">V1 → V2 能力映射</h2>
        <p>这是迁移入口索引，不代表旧参数可以原样传入。方法、属性与类型使用不同标识，并可直接点击定位。</p>
        <el-table class="migration-map" :data="migrationRows" row-key="id" border>
          <el-table-column label="1.x" min-width="220">
            <template #default="{ row }">
              <span :id="row.id" class="migration-map__anchor"></span>
              <code>{{ row.legacy }}</code>
            </template>
          </el-table-column>
          <el-table-column label="2.0" min-width="260">
            <template #default="{ row }">
              <el-space v-if="row.current.length" wrap>
                <ApiReference v-for="reference in row.current" :key="reference.label" :kind="reference.kind" :to="reference.to">
                  {{ reference.label }}
                </ApiReference>
              </el-space>
              <el-tag v-else type="danger" effect="light">已删除</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="迁移说明" min-width="280" prop="description" />
          <el-table-column label="状态" width="92" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'removed' ? 'danger' : 'success'" effect="plain">
                {{ row.status === 'removed' ? '无替代' : '可迁移' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section id="core-examples" class="doc-prose">
        <h2 class="doc-h2">三个核心迁移示例</h2>
        <p>先替换入口和生命周期，再迁移数据模型与交互服务。左右代码表达同一业务意图。</p>

        <h3 id="example-use-earth" class="doc-h3">1. 创建 Earth：两个参数改为单配置</h3>
        <p class="migration-related-api">
          相关 API：
          <ApiReference kind="method" to="/guide/earth-create#api-method-use-earth">useEarth()</ApiReference>
          <ApiReference kind="type" to="/guide/earth-create#api-type-use-earth-options">UseEarthOptions</ApiReference>
          <ApiReference kind="property" to="/guide/earth-create#api-property-id">id</ApiReference>
          <ApiReference kind="property" to="/guide/earth-create#api-property-target">target</ApiReference>
          <ApiReference kind="property" to="/guide/earth-create#api-property-view">view</ApiReference>
          <ApiReference kind="property" to="/guide/earth-create#api-property-controls">controls</ApiReference>
        </p>
        <el-row :gutter="16" class="migration-code-grid">
          <el-col :xs="24" :lg="12">
            <el-card class="migration-code-card" shadow="never">
              <template #header><el-tag type="info" effect="plain">1.x</el-tag></template>
              <CodeBlock :code="legacyUseEarthCode" lang="typescript" />
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-card class="migration-code-card migration-code-card--current" shadow="never">
              <template #header><el-tag type="primary">2.0</el-tag></template>
              <CodeBlock :code="currentUseEarthCode" lang="typescript" />
            </el-card>
          </el-col>
        </el-row>
        <p>
          2.0 仍保留 <ApiReference kind="method" to="/guide/earth-create#api-method-use-earth">useEarth()</ApiReference> 和
          <ApiReference kind="method" to="/guide/earth-create#api-method-use-earth">useEarth(id)</ApiReference> 两个快捷形式；需要配置时只能传一个
          <ApiReference kind="type" to="/guide/earth-create#api-type-use-earth-options">UseEarthOptions</ApiReference> 对象。同一 id 复用仍处于 ready
          状态的实例，后续传入的 target、view 和 controls 不会覆盖首次配置。
        </p>

        <h3 id="example-layer-element" class="doc-h3">2. 专用图层类改为 Layer + Element</h3>
        <p class="migration-related-api">
          相关 API：
          <ApiReference kind="property" to="/guide/earth-create#api-property-layers">earth.layers</ApiReference>
          <ApiReference kind="method" to="/guide/earth-create#api-method-layers-add">earth.layers.add()</ApiReference>
          <ApiReference kind="property" to="#migration-map-elements">earth.elements</ApiReference>
          <ApiReference kind="type" to="#migration-map-elements">Element</ApiReference>
        </p>
        <el-row :gutter="16" class="migration-code-grid">
          <el-col :xs="24" :lg="12">
            <el-card class="migration-code-card" shadow="never">
              <template #header><el-tag type="info" effect="plain">1.x</el-tag></template>
              <CodeBlock :code="legacyElementCode" lang="typescript" />
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-card class="migration-code-card migration-code-card--current" shadow="never">
              <template #header><el-tag type="primary">2.0</el-tag></template>
              <CodeBlock :code="currentElementCode" lang="typescript" />
            </el-card>
          </el-col>
        </el-row>

        <h3 id="example-service-lifecycle" class="doc-h3">3. 分散组件改为服务与 Session</h3>
        <p class="migration-related-api">
          相关 API：
          <ApiReference kind="method" to="#migration-map-events">earth.events.on()</ApiReference>
          <ApiReference kind="method" to="#migration-map-draw-edit">earth.draw.start()</ApiReference>
          <ApiReference kind="property" to="/guide/earth-create#api-property-lifecycle">earth.lifecycle</ApiReference>
          <ApiReference kind="method" to="/guide/earth-create#api-method-destroy">earth.destroy()</ApiReference>
        </p>
        <el-row :gutter="16" class="migration-code-grid">
          <el-col :xs="24" :lg="12">
            <el-card class="migration-code-card" shadow="never">
              <template #header><el-tag type="info" effect="plain">1.x</el-tag></template>
              <CodeBlock :code="legacyLifecycleCode" lang="typescript" />
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-card class="migration-code-card migration-code-card--current" shadow="never">
              <template #header><el-tag type="primary">2.0</el-tag></template>
              <CodeBlock :code="currentLifecycleCode" lang="typescript" />
            </el-card>
          </el-col>
        </el-row>
      </section>

      <section id="coordinate-semantics" class="doc-prose">
        <h2 class="doc-h2">坐标与几何语义</h2>

        <h3 id="coordinate-projection" class="doc-h3">坐标按当前 View 投影读写</h3>
        <p>
          2.0 的 Element、Draw、Edit、Transform、事件和右键菜单坐标都使用当前 View 投影。业务系统保存经纬度时，应在边界处显式双向转换。
          <ApiReference kind="method" to="/guide/earth-create#api-method-to-projected-coordinates">toProjectedCoordinates()</ApiReference>
          把经纬度转为 View 坐标；<ApiReference kind="method" to="#coordinate-projection">toGeographicCoordinates()</ApiReference>
          转回 EPSG:4326。
        </p>
        <CodeBlock :code="coordinateCode" lang="typescript" />

        <div id="example-flat-coordinate-storage">
          <ExampleBlock title="经纬度坐标读写" :source="elementCoordinateStorageSource">
            <template #description>
              用
              <ApiReference kind="method" to="/guide/earth-create#api-method-to-projected-coordinates">toProjectedCoordinates()</ApiReference>
              写入经纬度，读取 <ApiReference kind="property" to="#migration-map-elements">Element.state</ApiReference> 后转回经纬度，再通过
              <ApiReference kind="method" to="#api-to-flat-coordinates">toFlatCoordinates()</ApiReference> 展平保存。示例中的全部控件均使用 Element Plus。
            </template>
            <template #preview>
              <ElementCoordinateStorageDemo />
            </template>
          </ExampleBlock>
        </div>

        <h3 id="circle-radius" class="doc-h3">几何圆半径固定使用米</h3>
        <p>
          <ApiReference kind="property" to="#circle-radius">geometry.radius</ApiReference> 在创建、更新、复制、Draw、Edit 和 Transform 中都表示米；<ApiReference
            kind="property"
            to="#circle-radius"
            >style.symbol.radius</ApiReference
          >
          表示 CSS 像素，两者不能混用。
        </p>
        <CodeBlock :code="circleCode" lang="typescript" />

        <h3 id="api-to-flat-coordinates" class="doc-h3">展平坐标后再持久化</h3>
        <p>
          <ApiReference kind="method" to="#api-to-flat-coordinates">toFlatCoordinates()</ApiReference>
          把一层嵌套坐标展开成新的扁平数组，不修改输入，也不转换投影。外部系统保存经纬度时，应先调用
          <ApiReference kind="method" to="#coordinate-projection">toGeographicCoordinates()</ApiReference>。
        </p>
        <CodeBlock :code="toFlatCoordinatesCode" lang="typescript" />

        <h3 id="polygon-limit" class="doc-h3">Polygon 多环与洞仍未支持</h3>
        <el-alert
          type="warning"
          title="不要把外环和内环直接拆成多个单环 Element"
          description="2.0 内置 polygon 当前只接受一组 controlPoints 并生成单环；拆分会填满原来的洞。需要保留洞时，请使用原生 OpenLayers 图层，或暂缓迁移该部分业务。"
          show-icon
          :closable="false"
        />
      </section>

      <section id="advanced-compatibility" class="doc-prose">
        <h2 class="doc-h2">高级兼容注意</h2>
        <p>下面内容主要影响动画封装、原生样式和对联合类型做穷尽判断的业务。常规迁移可以先完成上面的主线。</p>
        <el-collapse v-model="openCompatibilitySections">
          <el-collapse-item name="animation" title="动画类型、样式兼容与写入域">
            <div id="animation-compatibility" class="migration-compatibility">
              <p>
                2.0 的十种内置动画都通过
                <ApiReference kind="method" to="#migration-map-animations">earth.animations.play()</ApiReference>
                启动：
              </p>
              <el-space wrap class="migration-animation-types">
                <el-tag v-for="type in animationTypeNames" :key="type" effect="plain">{{ type }}</el-tag>
              </el-space>
              <ul class="doc-list">
                <li>
                  全部十种动画都不支持
                  <ApiReference kind="type" to="#animation-compatibility">NativeStyleRef</ApiReference>。批量目标中只要有一个使用原生样式，整次
                  <ApiReference kind="method" to="#migration-map-animations">play()</ApiReference> 会在创建记录前抛出
                  <ApiReference kind="type" to="#animation-compatibility">UnsupportedOperationError</ApiReference>。
                </li>
                <li>
                  <code>blink</code> 与 <code>fade</code> 写入 <code>target-opacity</code>，overlay 效果可以稳定追加；<code>grow</code> 独占
                  <ApiReference kind="property" to="#animation-compatibility">target-geometry</ApiReference>。同一目标不能在不同 channel 同时运行两个
                  <code>grow</code>。
                </li>
                <li>
                  <code>PathTravelAnimationSpec</code> 不再接受 <code>arrow</code> 和 <code>arrowColor</code>。静态方向箭头迁到结构化
                  Decoration，需要沿路径揭示箭头时改用 <code>grow</code>。
                </li>
                <li>
                  <ApiReference kind="type" to="#animation-compatibility">AnimationType</ApiReference>、
                  <ApiReference kind="type" to="#animation-compatibility">AnimationSpec</ApiReference> 和
                  <ApiReference kind="property" to="#animation-compatibility">animationTypes</ApiReference>
                  允许后续版本在末尾追加内置成员。<code>switch</code>、<code>assertNever</code> 或
                  <code>Record&lt;AnimationType, ...&gt;</code> 必须保留未知成员兜底。
                </li>
              </ul>
              <CodeBlock :code="animationCode" lang="typescript" />
            </div>
          </el-collapse-item>
        </el-collapse>
      </section>

      <section id="offline-install" class="doc-prose">
        <h2 class="doc-h2">离线依赖闭包</h2>
        <p>
          engine tgz 只包含自身发布文件，不会打包或自动安装 <code>ol</code>。完整离线交付必须同时准备 <code>ol@10.9.0</code>
          及其全部传递依赖；仅复制两个 tgz 不能保证全新空缓存可安装。
        </p>
        <CodeBlock :code="offlineCode" lang="bash" />
        <el-alert
          class="migration-section-alert"
          type="success"
          title="验收建议"
          description="在与生产一致的 Node/npm 版本中清空 node_modules 或使用隔离临时项目，仅指向已预热的 offline-cache，以 --offline --ignore-scripts 完成安装，再执行业务构建与运行测试。"
          show-icon
          :closable="false"
        />
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="1.x → 2.0 迁移" :items="anchors" />
    </aside>
  </div>
</template>

<style scoped>
.migration-hero-alert {
  margin: 24px 0 36px;
}

.migration-section-alert {
  margin-top: 18px;
}

.migration-checklist {
  margin-top: 18px;
}

.migration-checklist__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.migration-checklist__items {
  display: grid;
  gap: 12px;
  margin-top: 20px;
}

.migration-checklist__items :deep(.el-checkbox) {
  height: auto;
  margin-right: 0;
  white-space: normal;
}

.migration-checklist__items :deep(.el-checkbox__label) {
  line-height: 1.65;
}

.migration-environment {
  margin: 18px 0;
}

.migration-map {
  margin-top: 18px;
}

.migration-map__anchor {
  display: block;
  position: relative;
  top: -96px;
  visibility: hidden;
}

.migration-related-api {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.migration-code-grid {
  row-gap: 16px;
  margin-bottom: 34px;
}

.migration-code-card {
  height: 100%;
}

.migration-code-card--current {
  border-color: var(--el-color-primary-light-5);
}

.migration-code-card :deep(.el-card__header) {
  padding: 12px 16px;
}

.migration-code-card :deep(.el-card__body) {
  padding: 0;
}

.migration-code-card :deep(.code-block-highlight) {
  margin: 0;
  border: 0;
  border-radius: 0 0 var(--el-border-radius-base) var(--el-border-radius-base);
}

.migration-compatibility {
  padding: 4px 2px 12px;
}

.migration-animation-types {
  margin: 8px 0 14px;
}

@media (max-width: 767px) {
  .migration-checklist__header {
    align-items: flex-start;
  }

  .migration-related-api {
    align-items: flex-start;
  }
}
</style>
