<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../components/docs/ApiReference.vue';
import ApiTable from '../components/docs/ApiTable.vue';
import CodeBlock from '../components/docs/CodeBlock.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import PublicApiSection from '../components/docs/PublicApiSection.vue';
import EarthConstructorDemo from '../examples/EarthConstructorDemo.vue';
import earthConstructorSource from '../examples/EarthConstructorDemo.vue?raw';
import EarthInstanceDemo from '../examples/EarthInstanceDemo.vue';
import earthInstanceSource from '../examples/EarthInstanceDemo.vue?raw';
import MultiEarthDemo from '../examples/MultiEarthDemo.vue';
import multiEarthSource from '../examples/MultiEarthDemo.vue?raw';
import { extractExampleSnippet } from '../utils/exampleSource';

const earthInstanceSnippet = extractExampleSnippet(earthInstanceSource, 'earth-registry-lifecycle');
const earthConstructorSnippet = extractExampleSnippet(earthConstructorSource, 'earth-constructor');
const multiEarthSnippet = [
  extractExampleSnippet(multiEarthSource, 'multi-earth-create'),
  extractExampleSnippet(multiEarthSource, 'multi-earth-isolation')
].join('\n\n');
const multiEarthDemoRef = ref<InstanceType<typeof MultiEarthDemo> | null>(null);
const resetMultiEarthDemo = () => multiEarthDemoRef.value?.reset();
const focusMultiEarthDemo = () => multiEarthDemoRef.value?.focus();

const anchors = [
  { id: 'overview', label: '选择创建入口' },
  { id: 'example-earth-lifecycle', label: '实例复用与生命周期' },
  { id: 'example-multi-earth', label: '多地图实例与隔离' },
  { id: 'example-earth-constructor', label: '公共构造器与自管实例' },
  {
    id: 'api',
    label: 'Earth API',
    children: [
      { id: 'api-constructor', label: '构造函数' },
      { id: 'api-type-earth-options', label: 'EarthOptions' },
      { id: 'api-type-earth-lifecycle-state', label: 'EarthLifecycleState' },
      { id: 'api-properties', label: '公开属性' },
      { id: 'api-methods', label: '公开方法' }
    ]
  },
  { id: 'api-complete', label: '完整公开 API' },
  { id: 'registry-rules', label: '注册与销毁规则' },
  { id: 'related-types', label: '相关导出类型' }
];

const propertyColumns = [
  { prop: 'name', label: '属性', width: 180, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 230, linkTypes: true },
  { prop: 'desc', label: '说明', width: 340 }
];

const propertyRows = [
  {
    anchor: 'api-property-map',
    href: '/api/types#api-type-earth-property-map',
    name: 'map',
    type: 'Map',
    desc: '当前 OpenLayers Map；面向高级集成的外部对象'
  },
  {
    anchor: 'api-property-target',
    href: '/api/types#api-type-earth-property-target',
    name: 'target',
    type: 'string | HTMLElement',
    desc: '地图挂载容器'
  },
  {
    anchor: 'api-property-elements',
    href: '/api/types#api-type-earth-property-elements',
    name: 'elements',
    type: 'ElementService',
    desc: 'Element 的创建、查询和批量管理入口'
  },
  {
    anchor: 'api-property-layers',
    href: '/api/types#api-type-earth-property-layers',
    name: 'layers',
    type: 'LayerService',
    desc: '图层的创建、查询和生命周期入口'
  },
  {
    anchor: 'api-property-styles',
    href: '/api/types#api-type-earth-property-styles',
    name: 'styles',
    type: 'StyleService',
    desc: '结构化样式的注册与管理入口'
  },
  {
    anchor: 'api-property-animations',
    href: '/api/types#api-type-earth-property-animations',
    name: 'animations',
    type: 'AnimationManager',
    desc: 'Element 动画入口'
  },
  { anchor: 'api-property-draw', href: '/api/types#api-type-earth-property-draw', name: 'draw', type: 'DrawService', desc: '绘制会话入口' },
  {
    anchor: 'api-property-transform',
    href: '/api/types#api-type-earth-property-transform',
    name: 'transform',
    type: 'TransformService',
    desc: '变换会话入口'
  },
  {
    anchor: 'api-property-measure',
    href: '/api/types#api-type-earth-property-measure',
    name: 'measure',
    type: 'MeasureService',
    desc: '距离与面积测量入口'
  },
  {
    anchor: 'api-property-events',
    href: '/api/types#api-type-earth-property-events',
    name: 'events',
    type: 'EventService',
    desc: '地图与 Element 事件入口'
  },
  {
    anchor: 'api-property-context-menu',
    href: '/api/types#api-type-earth-property-context-menu',
    name: 'contextMenu',
    type: 'ContextMenuService',
    desc: '右键菜单入口'
  },
  {
    anchor: 'api-property-overlays',
    href: '/api/types#api-type-earth-property-overlays',
    name: 'overlays',
    type: 'OverlayService',
    desc: '覆盖物入口'
  },
  {
    anchor: 'api-property-view',
    href: '/api/types#api-type-earth-property-view',
    name: 'view',
    type: 'ViewService',
    desc: '视图、投影、像素与世界副本操作入口'
  },
  {
    anchor: 'api-property-controls',
    href: '/api/types#api-type-earth-property-controls',
    name: 'controls',
    type: 'ControlService',
    desc: '经纬网与比例尺运行期控制入口'
  },
  {
    anchor: 'api-property-lifecycle',
    href: '/api/types#api-type-earth-property-lifecycle',
    name: 'lifecycle',
    type: 'EarthLifecycleState',
    desc: '当前生命周期状态，只读'
  },
  {
    anchor: 'api-property-is-destroyed',
    href: '/api/types#api-type-earth-property-is-destroyed',
    name: 'isDestroyed',
    type: 'boolean',
    desc: '实例是否已经销毁，只读'
  }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 190, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 300, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 160, linkTypes: true },
  { prop: 'desc', label: '说明', width: 320 }
];

const methodRows = [
  {
    anchor: 'api-method-destroy',
    href: '/api/types#api-type-earth-method-destroy',
    name: 'destroy',
    params: '—',
    returns: 'void',
    desc: '幂等释放地图、服务、交互、资源和注册关系'
  }
];

const optionColumns = [
  { prop: 'name', label: '属性', width: 180, presentation: 'property' as const },
  { prop: 'required', label: '必填', width: 90 },
  { prop: 'type', label: '类型', width: 260, linkTypes: true },
  { prop: 'default', label: '默认值', width: 230 },
  { prop: 'desc', label: '说明', width: 350 }
];

const earthOptionRows = [
  {
    anchor: 'api-summary-earth-option-target',
    href: '/api/types#api-type-earth-options-property-target',
    name: 'target',
    required: '否',
    type: 'string | HTMLElement',
    default: "'olContainer'",
    desc: '地图容器 ID 或容器元素；构造时复制并固定'
  },
  {
    anchor: 'api-summary-earth-option-view',
    href: '/api/types#api-type-earth-options-property-view',
    name: 'view',
    required: '否',
    type: 'ViewOptions',
    default: 'center：默认 home；zoom：4',
    desc: 'OpenLayers View 初始选项；调用方对象不会被持有'
  },
  {
    anchor: 'api-summary-earth-option-controls',
    href: '/api/types#api-type-earth-options-property-controls',
    name: 'controls',
    required: '否',
    type: 'DefaultsOptions',
    default: 'zoom / rotate / attribution：false',
    desc: 'OpenLayers 默认控件配置；运行期经纬网与比例尺由 earth.controls 管理'
  }
];

const lifecycleRows = [
  { name: 'ready', desc: '实例可用；服务、地图与资源均处于活动状态' },
  { name: 'destroying', desc: 'destroy() 正在同步释放服务和资源，不应再发起业务操作' },
  { name: 'destroyed', desc: '释放完成；isDestroyed 为 true，注册实例已从 useEarth 注册表移除' }
];

const signatures = `useEarth(): Earth;
useEarth(id: string): Earth;
useEarth(options: UseEarthOptions): Earth;

new Earth(options?: EarthOptions): Earth;`;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">核心</span>
        <h1>Earth 与生命周期</h1>
        <p>Earth 是地图、服务和资源的生命周期根。业务代码优先使用 useEarth；需要完全自管且不进入注册表时再直接构造 Earth。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">选择创建入口</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-card class="core-choice-card" shadow="never">
              <template #header><strong>useEarth（推荐）</strong></template>
              <p>适合应用页面和组件。默认实例或同名实例会复用，销毁后相同注册键可重新创建。</p>
              <el-tag type="success" effect="plain">注册式生命周期</el-tag>
            </el-card>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-card class="core-choice-card" shadow="never">
              <template #header><strong>new Earth</strong></template>
              <p>适合基础设施封装。实例完全由调用方持有，不与 useEarth 的默认或命名实例合并。</p>
              <el-tag effect="plain">自管生命周期</el-tag>
            </el-card>
          </el-col>
        </el-row>
        <CodeBlock :code="signatures" lang="ts" />
        <el-alert class="doc-prose__alert" type="info" :closable="false" show-icon>
          <template #title>配置对象只影响首次创建</template>
          对同一注册键再次调用 <code>useEarth(options)</code> 不会重建实例，也不会覆盖已有 target、view 或 controls。
        </el-alert>
      </section>

      <section id="example-earth-lifecycle" class="doc-prose">
        <ExampleBlock title="实例复用与生命周期" :source="earthInstanceSource" :snippet="earthInstanceSnippet">
          <template #description>
            <p>
              示例用同一 ID 验证 <ApiReference kind="method" to="/guide/earth-create#api-method-use-earth">useEarth</ApiReference> 的复用语义，并展示
              <ApiReference kind="property" to="#api-property-lifecycle">lifecycle</ApiReference> 与
              <ApiReference kind="method" to="#api-method-destroy">destroy</ApiReference>。销毁后再次创建会得到新的 Earth。
            </p>
          </template>
          <template #preview><EarthInstanceDemo /></template>
        </ExampleBlock>
      </section>

      <section id="example-multi-earth" class="doc-prose">
        <ExampleBlock
          title="多地图实例与隔离"
          :source="multiEarthSource"
          :snippet="multiEarthSnippet"
          show-reset
          show-focus
          @reset="resetMultiEarthDemo"
          @focus="focusMultiEarthDemo"
        >
          <template #description>
            <p>
              两个命名 <ApiReference kind="type" to="/api/types#api-type-earth">Earth</ApiReference> 实例拥有独立的容器、视图、图层、Element
              与服务。示例可分别销毁并重建任意一张地图，用于验证
              <ApiReference kind="method" to="/guide/earth-create#api-method-use-earth">useEarth</ApiReference>
              注册隔离和完整生命周期清理。
            </p>
          </template>
          <template #preview><MultiEarthDemo ref="multiEarthDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="example-earth-constructor" class="doc-prose">
        <ExampleBlock title="公共构造器与自管实例" :source="earthConstructorSource" :snippet="earthConstructorSnippet">
          <template #description>
            <p>
              <ApiReference kind="constructor" to="#api-constructor">new Earth(options)</ApiReference>
              创建不进入 useEarth 注册表的实例。示例显式创建图层和 Element，并在业务结束时调用
              <ApiReference kind="method" to="#api-method-destroy">destroy</ApiReference>。
            </p>
          </template>
          <template #preview><EarthConstructorDemo /></template>
        </ExampleBlock>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">Earth API</h2>
        <p>
          表格中的本包导出类型可直接点击，进入“所有导出类型”中的精确定义。OpenLayers 的 <code>Map</code>、<code>HTMLElement</code>
          等外部类型保持为普通文本。
        </p>

        <div id="api-constructor" class="api-constructor">
          <h3 class="doc-h3">构造函数</h3>
          <p class="api-constructor__signature"><code>new Earth(options?: EarthOptions): Earth</code></p>
          <p>
            高级自管入口，不进入 useEarth 注册表。参数类型见
            <ApiReference kind="type" to="/api/types#api-type-earth-options">EarthOptions</ApiReference>。
          </p>
        </div>

        <h3 id="api-earth-options-summary" class="doc-h3">EarthOptions 速查</h3>
        <p>构造器只接受以下三个公开字段；未知字段、访问器属性或非法 target 会在创建地图前同步拒绝。</p>
        <ApiTable :columns="optionColumns" :rows="earthOptionRows" />

        <h3 id="api-earth-lifecycle-summary" class="doc-h3">EarthLifecycleState 速查</h3>
        <p><code>'ready' | 'destroying' | 'destroyed'</code></p>
        <el-descriptions :column="1" border>
          <el-descriptions-item v-for="item in lifecycleRows" :key="item.name" :label="item.name">{{ item.desc }}</el-descriptions-item>
        </el-descriptions>

        <h3 id="api-properties" class="doc-h3">公开属性</h3>
        <ApiTable :columns="propertyColumns" :rows="propertyRows" />

        <h3 id="api-methods" class="doc-h3">公开方法</h3>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        section-id="api-complete"
        title="完整公开 API"
        description="完整展示 Earth 的公共构造器、全部只读服务属性、生命周期访问器、destroy()，以及 EarthOptions 和 EarthLifecycleState。"
        :type-names="['Earth', 'EarthOptions', 'EarthLifecycleState']"
      />

      <section id="registry-rules" class="doc-prose">
        <h2 class="doc-h2">注册与销毁规则</h2>
        <el-timeline>
          <el-timeline-item timestamp="首次调用" type="primary">创建实例；命名实例省略 target 时，默认挂载到与 id 同名的 DOM 容器。</el-timeline-item>
          <el-timeline-item timestamp="活动期间" type="success">相同注册键始终返回同一实例；默认注册键与命名注册键互不影响。</el-timeline-item>
          <el-timeline-item timestamp="destroy()" type="warning">状态按 ready → destroying → destroyed 推进，并清理注册关系。</el-timeline-item>
          <el-timeline-item timestamp="再次调用" type="primary">同一注册键创建全新实例，可使用新的首次创建配置。</el-timeline-item>
        </el-timeline>
        <el-alert type="warning" :closable="false" show-icon title="不要把 useEarth 的 id 当作 Earth 属性">
          <ApiReference kind="property" to="/api/types#api-type-use-earth-options-property-id">UseEarthOptions.id</ApiReference>
          是注册键配置；Earth 实例本身没有公开的 earth.id。
        </el-alert>
        <p>
          <ApiReference kind="method" to="/guide/earth-create#api-method-use-earth">useEarth 的三个重载</ApiReference>
          在“创建第一张地图”页面完整定义；本页只定义 Earth 构造器、属性和实例方法，避免维护两份签名。
        </p>
      </section>

      <section id="related-types" class="doc-prose">
        <h2 class="doc-h2">相关导出类型</h2>
        <div class="core-type-links">
          <ApiReference kind="type" to="/api/types#api-type-earth">Earth</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-earth-options">EarthOptions</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-use-earth-options">UseEarthOptions</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-earth-lifecycle-state">EarthLifecycleState</ApiReference>
        </div>
      </section>
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="Earth 与生命周期" :items="anchors" /></aside>
  </div>
</template>
