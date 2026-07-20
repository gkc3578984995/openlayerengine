<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../components/docs/ApiReference.vue';
import ApiTable from '../components/docs/ApiTable.vue';
import CodeBlock from '../components/docs/CodeBlock.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import PublicApiSection from '../components/docs/PublicApiSection.vue';
import LayerKindsDemo from '../examples/LayerKindsDemo.vue';
import layerKindsSource from '../examples/LayerKindsDemo.vue?raw';
import LayerServiceDemo from '../examples/LayerServiceDemo.vue';
import layerServiceSource from '../examples/LayerServiceDemo.vue?raw';
import { extractExampleSnippet } from '../utils/exampleSource';

const layerServiceSnippet = extractExampleSnippet(layerServiceSource, 'layer-lifecycle');
const layerKindsSnippet = extractExampleSnippet(layerKindsSource, 'layer-kinds');
const layerServiceDemoRef = ref<InstanceType<typeof LayerServiceDemo> | null>(null);
const layerKindsDemoRef = ref<InstanceType<typeof LayerKindsDemo> | null>(null);
const resetLayerServiceDemo = () => layerServiceDemoRef.value?.reset();
const focusLayerServiceDemo = () => layerServiceDemoRef.value?.focus();
const resetLayerKindsDemo = () => layerKindsDemoRef.value?.reset();
const focusLayerKindsDemo = () => layerKindsDemoRef.value?.focus();

const activeSpec = ref('vector');

const anchors = [
  { id: 'overview', label: '图层模型' },
  { id: 'layer-specs', label: '创建配置' },
  { id: 'example-layer-management', label: '图层管理' },
  { id: 'example-layer-kinds', label: '三类图层与所有权' },
  {
    id: 'api',
    label: 'Layers API',
    children: [
      { id: 'api-layer-service', label: 'LayerService' },
      { id: 'api-layer-properties', label: 'Layer 属性' },
      { id: 'api-layer-methods', label: 'Layer 方法' }
    ]
  },
  { id: 'api-complete', label: '完整公开 API' },
  { id: 'ownership', label: '所有权与状态真源' },
  { id: 'related-types', label: '相关导出类型' }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 180, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 280, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 230, linkTypes: true },
  { prop: 'desc', label: '说明', width: 360 }
];

const serviceRows = [
  {
    anchor: 'api-method-add',
    href: '/api/types#api-type-layer-service-method-add',
    name: 'add',
    params: 'spec: PublicLayerSpec',
    returns: 'Layer',
    desc: '创建矢量、瓦片或原生图层，ID 不可重复'
  },
  {
    anchor: 'api-method-get',
    href: '/api/types#api-type-layer-service-method-get',
    name: 'get',
    params: 'id: string',
    returns: 'Layer | undefined',
    desc: '按 ID 获取活动图层句柄'
  },
  {
    anchor: 'api-method-query',
    href: '/api/types#api-type-layer-service-method-query',
    name: 'query',
    params: 'kind?: LayerKind',
    returns: 'readonly Layer[]',
    desc: '按注册顺序查询；省略 kind 时返回全部图层'
  },
  {
    anchor: 'api-method-remove',
    href: '/api/types#api-type-layer-service-method-remove',
    name: 'remove',
    params: 'id: string',
    returns: 'boolean',
    desc: '按 ID 移除；不存在时返回 false'
  },
  {
    anchor: 'api-method-clear',
    href: '/api/types#api-type-layer-service-method-clear',
    name: 'clear',
    params: '—',
    returns: 'void',
    desc: '清空可移除图层；仍承载 Element 的图层会拒绝移除'
  }
];

const propertyColumns = [
  { prop: 'name', label: '属性', width: 170, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 240, linkTypes: true },
  { prop: 'desc', label: '说明', width: 370 }
];

const layerProperties = [
  { anchor: 'api-property-id', href: '/api/types#api-type-layer-property-id', name: 'id', type: 'string', desc: '图层唯一 ID' },
  {
    anchor: 'api-property-state',
    href: '/api/types#api-type-layer-property-state',
    name: 'state',
    type: 'Readonly<LayerState>',
    desc: '不可变状态快照'
  },
  {
    anchor: 'api-property-kind',
    href: '/api/types#api-type-layer-property-kind',
    name: 'kind',
    type: 'LayerKind',
    desc: 'vector、tile 或 native'
  },
  {
    anchor: 'api-property-visible',
    href: '/api/types#api-type-layer-property-visible',
    name: 'visible',
    type: 'boolean',
    desc: '当前显隐状态'
  },
  {
    anchor: 'api-property-opacity',
    href: '/api/types#api-type-layer-property-opacity',
    name: 'opacity',
    type: 'number',
    desc: '当前透明度，范围 0–1'
  },
  {
    anchor: 'api-property-z-index',
    href: '/api/types#api-type-layer-property-z-index',
    name: 'zIndex',
    type: 'number | undefined',
    desc: '当前层级'
  },
  {
    anchor: 'api-property-ol-layer',
    href: '/api/types#api-type-layer-property-ol-layer',
    name: 'olLayer',
    type: 'BaseLayer',
    desc: 'OpenLayers 外部对象；面向高级集成'
  }
];

const layerMethods = [
  {
    anchor: 'api-method-layer-update',
    href: '/api/types#api-type-layer-method-update',
    name: 'update',
    params: 'patch: LayerPatch',
    returns: 'void',
    desc: '原子更新显隐、透明度或层级'
  },
  {
    anchor: 'api-method-layer-show',
    href: '/api/types#api-type-layer-method-show',
    name: 'show',
    params: '—',
    returns: 'void',
    desc: '把 visible 更新为 true'
  },
  {
    anchor: 'api-method-layer-hide',
    href: '/api/types#api-type-layer-method-hide',
    name: 'hide',
    params: '—',
    returns: 'void',
    desc: '把 visible 更新为 false'
  },
  {
    anchor: 'api-method-layer-remove',
    href: '/api/types#api-type-layer-method-remove',
    name: 'remove',
    params: '—',
    returns: 'void',
    desc: '移除当前图层；句柄上的重复调用幂等'
  }
];

const vectorCode = `const business = earth.layers.add({
  kind: 'vector',
  id: 'business',
  visible: true,
  opacity: 1,
  zIndex: 10,
  wrapX: true,
  declutter: false
});`;

const tileCode = `const base = earth.layers.add({
  kind: 'tile',
  preset: 'osm'
});

const xyz = earth.layers.add({
  kind: 'tile',
  preset: 'xyz',
  url: 'https://example.com/{z}/{x}/{y}.png',
  attributions: '© 数据提供方'
});`;

const nativeCode = `import TileLayer from 'ol/layer/Tile.js';

const native = earth.layers.add({
  kind: 'native',
  layer: new TileLayer(),
  ownership: 'external'
});`;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">核心</span>
        <h1>图层（Layers）</h1>
        <p>earth.layers 接受判别式配置创建图层，并返回只读状态驱动的 Layer 句柄；业务状态通过句柄更新，不依赖 OpenLayers 对象反向同步。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">图层模型</h2>
        <el-row :gutter="16" class="core-stat-grid">
          <el-col :xs="24" :sm="8"
            ><el-statistic title="公开图层类型" :value="3"><template #suffix>种</template></el-statistic></el-col
          >
          <el-col :xs="24" :sm="8"
            ><el-statistic title="初始默认图层" :value="1"><template #suffix>个</template></el-statistic></el-col
          >
          <el-col :xs="24" :sm="8"
            ><el-statistic title="状态真源" :value="1"><template #suffix>份 LayerState</template></el-statistic></el-col
          >
        </el-row>
        <el-alert type="info" :closable="false" show-icon title="每个 Earth 初始包含 default 矢量图层">
          <code>earth.layers.query()</code> 会包含它；Element 未指定 layerId 时使用该图层。default 被移除后，后续创建默认归属的 Element 会按需重建它。
        </el-alert>
      </section>

      <section id="layer-specs" class="doc-prose">
        <h2 class="doc-h2">创建配置</h2>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-public-layer-spec">PublicLayerSpec</ApiReference>
          是三个分支的联合类型。先用 <code>kind</code> 区分图层，再填写对应数据源字段。
        </p>
        <el-tabs v-model="activeSpec" class="core-spec-tabs">
          <el-tab-pane label="Vector" name="vector">
            <p>
              <ApiReference kind="type" to="/api/types#api-type-vector-layer-spec">VectorLayerSpec</ApiReference> 由引擎创建 VectorSource，适合承载 Element。
            </p>
            <CodeBlock :code="vectorCode" lang="ts" />
          </el-tab-pane>
          <el-tab-pane label="Tile" name="tile">
            <p>
              <ApiReference kind="type" to="/api/types#api-type-tile-layer-spec">TileLayerSpec</ApiReference> 支持 OSM、XYZ、compact-xyz 与原生 TileSource
              分支。
            </p>
            <CodeBlock :code="tileCode" lang="ts" />
          </el-tab-pane>
          <el-tab-pane label="Native" name="native">
            <p><ApiReference kind="type" to="/api/types#api-type-native-layer-spec">NativeLayerSpec</ApiReference> 接入调用方已有的 OpenLayers 图层。</p>
            <CodeBlock :code="nativeCode" lang="ts" />
          </el-tab-pane>
        </el-tabs>
      </section>

      <section id="example-layer-management" class="doc-prose">
        <ExampleBlock
          title="创建、查询与更新图层"
          :source="layerServiceSource"
          :snippet="layerServiceSnippet"
          show-reset
          show-focus
          @reset="resetLayerServiceDemo"
          @focus="focusLayerServiceDemo"
        >
          <template #description>
            <p>
              示例通过 <ApiReference kind="method" to="#api-method-add">add</ApiReference> 创建业务图层，用
              <ApiReference kind="method" to="#api-method-query">query</ApiReference> 展示实时列表，并调用 Layer 的
              <ApiReference kind="method" to="#api-method-layer-update">update</ApiReference>、
              <ApiReference kind="method" to="#api-method-layer-show">show</ApiReference>、
              <ApiReference kind="method" to="#api-method-layer-hide">hide</ApiReference> 与
              <ApiReference kind="method" to="#api-method-layer-remove">remove</ApiReference>。
            </p>
          </template>
          <template #preview><LayerServiceDemo ref="layerServiceDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="example-layer-kinds" class="doc-prose">
        <ExampleBlock
          title="Vector、Tile、Native 与所有权"
          :source="layerKindsSource"
          :snippet="layerKindsSnippet"
          show-reset
          show-focus
          @reset="resetLayerKindsDemo"
          @focus="focusLayerKindsDemo"
        >
          <template #description>
            <p>
              示例并列创建三种 <ApiReference kind="type" to="/api/types#api-type-public-layer-spec">PublicLayerSpec</ApiReference>：蓝色纹理圆来自 Earth
              vector，橙色点来自 external native，底图来自部署期配置。使用
              <ApiReference kind="method" to="#api-method-layer-remove">Layer.remove</ApiReference> 移除句柄，并通过
              <ApiReference kind="method" to="#api-method-clear">LayerService.clear</ApiReference> 显式清空全部图层。
            </p>
          </template>
          <template #preview><LayerKindsDemo ref="layerKindsDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">Layers API</h2>
        <h3 id="api-layer-service" class="doc-h3">LayerService</h3>
        <ApiTable :columns="methodColumns" :rows="serviceRows" />

        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="Layer 是服务返回的句柄">
          虽然 Layer 是包根导出的类，但不能由用户直接构造；请始终从 earth.layers.add()、get() 或 query() 获得实例。
        </el-alert>

        <h3 id="api-layer-properties" class="doc-h3">Layer 属性</h3>
        <ApiTable :columns="propertyColumns" :rows="layerProperties" />

        <h3 id="api-layer-methods" class="doc-h3">Layer 方法</h3>
        <ApiTable :columns="methodColumns" :rows="layerMethods" />
      </section>

      <PublicApiSection
        section-id="api-complete"
        title="完整公开 API"
        description="完整展示 LayerService、Layer 句柄，以及 vector、tile、native 的全部判别分支、状态、Patch、所有权和瓦片地址函数。"
        :type-names="[
          'LayerService',
          'Layer',
          'LayerState',
          'LayerPatch',
          'LayerKind',
          'LayerOwnership',
          'PublicLayerSpec',
          'VectorLayerSpec',
          'TileLayerCommonSpec',
          'TileLayerSpec',
          'NativeLayerSpec',
          'TileUrlFunction'
        ]"
      />

      <section id="ownership" class="doc-prose">
        <h2 class="doc-h2">所有权与状态真源</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="external">默认值。Earth 移除或销毁时只解绑原生图层/数据源，不 dispose 调用方资源。</el-descriptions-item>
          <el-descriptions-item label="earth">资源成功交接后由 Earth 持有，在移除或销毁时负责 dispose。</el-descriptions-item>
          <el-descriptions-item label="preset">OSM、XYZ、compact-xyz 与引擎创建的 VectorSource 固定由 Earth 管理。</el-descriptions-item>
        </el-descriptions>
        <p>
          Native 图层初次挂载时会捕获展示状态；之后直接修改 <code>olLayer</code> 不会反向写入
          <ApiReference kind="property" to="#api-property-state">Layer.state</ApiReference>。需要持久变更时调用
          <ApiReference kind="method" to="#api-method-layer-update">Layer.update</ApiReference>。
        </p>
      </section>

      <section id="related-types" class="doc-prose">
        <h2 class="doc-h2">相关导出类型</h2>
        <div class="core-type-links">
          <ApiReference kind="type" to="/api/types#api-type-layer-service">LayerService</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-layer">Layer</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-layer-state">LayerState</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-layer-patch">LayerPatch</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-public-layer-spec">PublicLayerSpec</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-layer-ownership">LayerOwnership</ApiReference>
        </div>
      </section>
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="图层（Layers）" :items="anchors" /></aside>
  </div>
</template>
