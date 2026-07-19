<script setup lang="ts">
import ApiReference from '../components/docs/ApiReference.vue';
import ApiTable from '../components/docs/ApiTable.vue';
import CodeBlock from '../components/docs/CodeBlock.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import PublicApiSection from '../components/docs/PublicApiSection.vue';
import EarthCreateDemo from '../examples/EarthCreateDemo.vue';
import earthCreateSource from '../examples/EarthCreateDemo.vue?raw';
import { extractExampleSnippet } from '../utils/exampleSource';

const earthCreateSnippet = extractExampleSnippet(earthCreateSource, 'first-map');

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

interface ApiColumn {
  prop: string;
  label: string;
  width?: string | number;
  monospace?: boolean;
  linkTypes?: boolean;
  presentation?: 'property' | 'method' | 'type';
}

const anchors: AnchorItem[] = [
  { id: 'overview', label: '创建流程' },
  { id: 'container', label: '准备地图容器' },
  { id: 'example-first-map', label: '创建、定位与销毁' },
  { id: 'map-source', label: '配置底图' },
  {
    id: 'api',
    label: '本页 API',
    children: [
      {
        id: 'api-types',
        label: '类型',
        children: [
          { id: 'api-type-earth', label: 'Earth' },
          { id: 'api-type-use-earth-options', label: 'UseEarthOptions' },
          { id: 'api-type-layer', label: 'Layer' }
        ]
      },
      {
        id: 'api-properties',
        label: '属性',
        children: [
          { id: 'api-property-id', label: 'id' },
          { id: 'api-property-target', label: 'target' },
          { id: 'api-property-view', label: 'view' },
          { id: 'api-property-controls', label: 'controls' },
          { id: 'api-property-layers', label: 'earth.layers' },
          { id: 'api-property-earth-view', label: 'earth.view' },
          { id: 'api-property-lifecycle', label: 'earth.lifecycle' }
        ]
      },
      {
        id: 'api-methods',
        label: '方法',
        children: [
          { id: 'api-method-use-earth', label: 'useEarth' },
          { id: 'api-method-layers-add', label: 'earth.layers.add' },
          { id: 'api-method-to-projected-coordinates', label: 'toProjectedCoordinates' },
          { id: 'api-method-fly-to', label: 'earth.view.flyTo' },
          { id: 'api-method-destroy', label: 'earth.destroy' }
        ]
      }
    ]
  },
  { id: 'api-complete', label: '完整公开 API' },
  { id: 'cleanup', label: '销毁与重建' },
  { id: 'next-step', label: '下一步' }
];

const containerCode = `<template>
  <div ref="mapTarget" class="map-container"></div>
</template>

<style scoped>
.map-container {
  width: 100%;
  height: 420px;
}
</style>`;

const publicBaseLayerCode = `const baseLayer = earth.layers.add({
  kind: 'tile',
  preset: 'osm'
});`;

const deploymentSourceCode = `{
  "vector": {
    "urlTemplate": "https://example.com/tiles/{z}/{x}/{y}.png",
    "opacity": 1,
    "attributions": "© 矢量地图数据提供方"
  },
  "satellite": {
    "urlTemplate": "https://example.com/imagery/{z}/{y}/{x}.jpg",
    "opacity": 0.65,
    "attributions": "© 影像数据提供方"
  }
}`;

const typeColumns: ApiColumn[] = [
  { prop: 'name', label: '类型', width: 190, presentation: 'type' },
  { prop: 'desc', label: '说明', width: 320 },
  { prop: 'source', label: '来源', width: 180, monospace: true }
];

const propertyColumns: ApiColumn[] = [
  { prop: 'name', label: '属性', width: 190, presentation: 'property' },
  { prop: 'desc', label: '说明', width: 320 },
  { prop: 'type', label: '类型', width: 250, linkTypes: true },
  { prop: 'default', label: '默认值', width: 150 }
];

const methodColumns: ApiColumn[] = [
  { prop: 'name', label: '方法', width: 260, presentation: 'method' },
  { prop: 'desc', label: '说明', width: 320 },
  { prop: 'params', label: '参数', width: 280, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 170, linkTypes: true }
];

const typeRows = [
  {
    anchor: 'api-type-earth',
    href: '/api/types#api-type-earth',
    name: 'Earth',
    desc: '地图实例，也是全部地图服务和资源的生命周期根节点',
    source: '包根导出'
  },
  {
    href: '/api/types#api-type-use-earth-options',
    name: 'UseEarthOptions',
    desc: '创建或选择默认、命名 Earth 实例时使用的配置对象',
    source: '包根类型导出'
  },
  {
    anchor: 'api-type-layer',
    href: '/api/types#api-type-layer',
    name: 'Layer',
    desc: '由 earth.layers 返回的实时图层句柄',
    source: '包根导出'
  }
];

const propertyRows = [
  {
    anchor: 'api-property-id',
    href: '/api/types#api-type-use-earth-options-property-id',
    name: 'id',
    desc: '命名实例注册键；快速上手的单地图可以省略',
    type: 'string',
    default: '默认实例'
  },
  {
    anchor: 'api-property-target',
    href: '/api/types#api-type-use-earth-options-property-target',
    name: 'target',
    desc: '地图挂载容器，可传 DOM id 或 HTMLElement',
    type: 'string | HTMLElement',
    default: '命名实例：id；默认实例：olContainer'
  },
  {
    anchor: 'api-property-view',
    href: '/api/types#api-type-earth-options-property-view',
    name: 'view',
    desc: 'OpenLayers View 初始配置',
    type: 'ViewOptions',
    default: 'center：经纬度 [119, 39] 的默认投影坐标；zoom：4'
  },
  {
    anchor: 'api-property-controls',
    href: '/api/types#api-type-earth-options-property-controls',
    name: 'controls',
    desc: 'OpenLayers 默认控件配置',
    type: 'DefaultsOptions',
    default: 'zoom / rotate / attribution：false'
  },
  {
    anchor: 'api-property-layers',
    href: '/api/types#api-type-earth-property-layers',
    name: 'earth.layers',
    desc: '当前地图的图层创建、查询和管理服务',
    type: 'LayerService',
    default: '只读服务'
  },
  {
    anchor: 'api-property-earth-view',
    href: '/api/types#api-type-earth-property-view',
    name: 'earth.view',
    desc: '当前地图的定位、缩放和坐标转换服务',
    type: 'ViewService',
    default: '只读服务'
  },
  {
    anchor: 'api-property-lifecycle',
    href: '/api/types#api-type-earth-property-lifecycle',
    name: 'earth.lifecycle',
    desc: '当前生命周期阶段',
    type: "'ready' | 'destroying' | 'destroyed'",
    default: 'ready'
  }
];

const methodRows = [
  {
    anchor: 'api-method-layers-add',
    href: '/api/types#api-type-layer-service-method-add',
    name: 'earth.layers.add',
    desc: '向当前 Earth 添加矢量、瓦片或原生图层',
    params: 'spec: PublicLayerSpec',
    returns: 'Layer'
  },
  {
    anchor: 'api-method-to-projected-coordinates',
    href: '/api/types#api-type-view-service-method-to-projected-coordinates',
    name: 'earth.view.toProjectedCoordinates',
    desc: '把 EPSG:4326 经纬度转换为当前 View 投影坐标',
    params: 'coordinates',
    returns: '同结构投影坐标'
  },
  {
    anchor: 'api-method-fly-to',
    href: '/api/types#api-type-view-service-method-fly-to',
    name: 'earth.view.flyTo',
    desc: '立即定位到指定投影坐标和可选缩放级别',
    params: 'center: Coordinate, zoom?: number',
    returns: 'void'
  },
  {
    anchor: 'api-method-destroy',
    href: '/api/types#api-type-earth-method-destroy',
    name: 'earth.destroy',
    desc: '幂等销毁地图、服务和注册关系',
    params: '—',
    returns: 'void'
  }
];

const useEarthOverloadRows = [
  {
    anchor: 'api-method-use-earth',
    name: 'useEarth',
    desc: '选择默认注册键；实例不存在或已经销毁时创建，活动时返回同一引用',
    params: '—',
    returns: 'Earth'
  },
  {
    anchor: 'api-method-use-earth-id-overload',
    name: 'useEarth',
    desc: '选择命名注册键；首次创建且未另传 target 时，使用 id 作为挂载目标',
    params: 'id: string',
    returns: 'Earth'
  },
  {
    anchor: 'api-method-use-earth-options-overload',
    name: 'useEarth',
    desc: '使用配置选择并首次创建默认或命名实例；已有活动实例不会被后续配置重建',
    params: 'options: UseEarthOptions',
    returns: 'Earth'
  }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">快速上手</span>
        <h1>创建第一张地图</h1>
        <p>从一个 DOM 容器开始，创建 2.0 Earth、添加底图，并在组件卸载时完整释放资源。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">创建流程</h2>
        <p>
          常规单地图从 <ApiReference kind="method" to="#api-method-use-earth">useEarth()</ApiReference> 开始。传入
          <ApiReference kind="type" to="#api-type-use-earth-options">UseEarthOptions</ApiReference> 后即可取得
          <ApiReference kind="type" to="#api-type-earth">Earth</ApiReference>，再通过实例上的服务添加图层、定位视图和管理资源。
        </p>
        <el-steps :active="3" finish-status="success" simple class="quick-steps">
          <el-step title="准备容器" />
          <el-step title="创建 Earth" />
          <el-step title="添加底图" />
        </el-steps>
      </section>

      <section id="container" class="doc-prose">
        <h2 class="doc-h2">准备地图容器</h2>
        <p>
          地图容器必须已经进入 DOM，并拥有明确高度。Vue 中推荐把模板引用直接传给
          <ApiReference kind="property" to="#api-property-target">target</ApiReference>，避免多个组件复用同一个字符串 id。
        </p>
        <CodeBlock :code="containerCode" lang="vue" />
      </section>

      <section id="example-first-map" class="doc-prose">
        <h2 class="doc-h2">运行第一张地图</h2>
        <ExampleBlock title="创建、定位与销毁" :source="earthCreateSource" :snippet="earthCreateSnippet">
          <template #description>
            <span>
              示例通过 <ApiReference kind="method" to="#api-method-use-earth">useEarth()</ApiReference> 创建默认实例，使用
              <ApiReference kind="method" to="#api-method-layers-add">earth.layers.add()</ApiReference> 背后的部署期底图配置，再调用
              <ApiReference kind="method" to="#api-method-to-projected-coordinates">earth.view.toProjectedCoordinates()</ApiReference> 和
              <ApiReference kind="method" to="#api-method-fly-to">earth.view.flyTo()</ApiReference> 定位北京。按钮与组件卸载都会执行
              <ApiReference kind="method" to="#api-method-destroy">earth.destroy()</ApiReference>，状态标签读取
              <ApiReference kind="property" to="#api-property-lifecycle">earth.lifecycle</ApiReference>。
            </span>
          </template>
          <template #preview>
            <EarthCreateDemo />
          </template>
        </ExampleBlock>
      </section>

      <section id="map-source" class="doc-prose">
        <h2 class="doc-h2">配置底图</h2>
        <p>
          业务项目可以直接调用 <ApiReference kind="method" to="#api-method-layers-add">earth.layers.add()</ApiReference> 创建 OSM、XYZ、紧凑 XYZ 或原生
          OpenLayers 图层，并取得 <ApiReference kind="type" to="#api-type-layer">Layer</ApiReference> 句柄。最短的公共 API 写法如下：
        </p>
        <CodeBlock :code="publicBaseLayerCode" lang="typescript" />
        <el-alert class="doc-prose__alert" type="info" :closable="false" show-icon title="文档站的地图源可在部署时替换">
          <p>
            上方运行示例通过站点内部的 <code>createConfiguredLayer()</code> 读取构建产物根目录的
            <code>/map-sources.json</code>，因此示例源码不写死瓦片服务地址。替换服务时必须同步填写对应的 <code>attributions</code> 版权信息。
            这是文档站部署约定，不是引擎的公共 API。
          </p>
        </el-alert>
        <CodeBlock :code="deploymentSourceCode" lang="json" />
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">本页 API</h2>
        <div class="api-reference-legend" aria-label="API 引用图例">
          <ApiReference kind="method" to="#api-method-use-earth">方法</ApiReference>
          <ApiReference kind="property" to="#api-property-target">属性</ApiReference>
          <ApiReference kind="type" to="#api-type-earth">类型</ApiReference>
        </div>

        <h3 id="api-types" class="doc-h3">类型</h3>
        <ApiTable :columns="typeColumns" :rows="typeRows" />

        <h3 id="api-properties" class="doc-h3">属性</h3>
        <ApiTable :columns="propertyColumns" :rows="propertyRows" />

        <h3 id="api-methods" class="doc-h3">方法</h3>
        <h4 class="doc-h4">useEarth 的全部重载</h4>
        <ApiTable :columns="methodColumns" :rows="useEarthOverloadRows" />
        <h4 class="doc-h4">本示例调用的关联方法</h4>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        section-id="api-complete"
        title="完整公开 API"
        description="useEarth 的三个重载以及 UseEarthOptions 的全部公开字段由包根声明生成；上方表格只保留第一张地图会用到的任务速查。"
        :runtime-names="['useEarth']"
        :type-names="['UseEarthOptions']"
      />

      <section id="cleanup" class="doc-prose">
        <h2 class="doc-h2">销毁与重建</h2>
        <p>
          <ApiReference kind="method" to="#api-method-destroy">earth.destroy()</ApiReference> 会释放地图、图层、交互、Overlay 和监听器，并注销
          <ApiReference kind="method" to="#api-method-use-earth">useEarth()</ApiReference> 的活动实例。方法是幂等的；销毁后可用相同注册键重新创建。
        </p>
        <el-alert type="warning" :closable="false" show-icon title="始终在框架卸载钩子中清理">
          <p>Vue 使用 <code>onBeforeUnmount</code>，React 使用 effect cleanup；不要只依赖页面关闭时的浏览器回收。</p>
        </el-alert>
      </section>

      <section id="next-step" class="doc-prose">
        <h2 class="doc-h2">下一步</h2>
        <p>
          如果项目正在从 1.x 升级，请继续查看
          <RouterLink class="doc-link" to="/guide/migration-v2">1.x → 2.0 迁移</RouterLink>。Earth、View、Layer 与 Controls 的完整参考将在“核心”章节集中维护。
        </p>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="创建第一张地图" :items="anchors" />
    </aside>
  </div>
</template>
