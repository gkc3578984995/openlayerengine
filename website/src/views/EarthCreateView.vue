<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import EarthCreateDemo from '../examples/EarthCreateDemo.vue';
import BaseLayerHandleDemo from '../examples/BaseLayerHandleDemo.vue';
import MultiEarthDemo from '../examples/MultiEarthDemo.vue';
import earthCreateSource from '../examples/EarthCreateDemo.vue?raw';
import baseLayerHandleSource from '../examples/BaseLayerHandleDemo.vue?raw';
import multiEarthSource from '../examples/MultiEarthDemo.vue?raw';

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
  presentation?: 'property' | 'method';
}

const anchors: AnchorItem[] = [
  { id: 'overview', label: '概述' },
  {
    id: 'examples',
    label: '代码演示',
    children: [
      { id: 'example-default-earth', label: '默认实例：获取或创建' },
      { id: 'example-named-earth', label: '命名实例：多地图' },
      { id: 'example-base-layers', label: '管理多个底图' }
    ]
  },
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-use-earth', label: 'useEarth' },
      { id: 'api-destroy-earth', label: 'destroyEarth' },
      { id: 'api-constructor', label: 'Earth 构造函数' },
      { id: 'api-type-use-earth-options', label: 'UseEarthOptions' },
      { id: 'api-methods', label: 'Earth 实例方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];

const attrCols: ApiColumn[] = [
  { prop: 'name', label: '属性名', width: 160, presentation: 'property' },
  { prop: 'desc', label: '说明', width: 320 },
  { prop: 'type', label: '类型', width: 220, monospace: true },
  { prop: 'options', label: '可选值', width: 130 },
  { prop: 'default', label: '默认值', width: 130 }
];

const methodCols: ApiColumn[] = [
  { prop: 'name', label: '方法名', width: 260, presentation: 'method' },
  { prop: 'desc', label: '说明', width: 320 },
  { prop: 'params', label: '参数', width: 200, monospace: true },
  { prop: 'returns', label: '返回值', width: 160, monospace: true }
];

const viewOptionsRows = [
  { name: 'center', desc: '地图初始中心点，使用投影坐标（如 <code>fromLonLat([116, 39])</code>）', type: 'Coordinate', options: '—', default: '—' },
  { name: 'zoom', desc: '地图初始缩放级别', type: 'number', options: '—', default: '—' },
  { name: 'minZoom', desc: '最小可缩放级别', type: 'number', options: '—', default: '—' },
  { name: 'maxZoom', desc: '最大可缩放级别', type: 'number', options: '—', default: '—' }
];

const earthOptionsRows = [
  { name: 'target', desc: '地图挂载的 DOM 容器 id 或元素', type: 'string | HTMLElement', options: '—', default: 'olContainer' },
  { name: 'zoom', desc: '是否启用缩放控件，默认关闭', type: 'boolean', options: 'true / false', default: 'false' },
  { name: 'rotate', desc: '是否启用旋转控件，默认关闭', type: 'boolean', options: 'true / false', default: 'false' },
  { name: 'attribution', desc: '是否启用归属控件，默认关闭', type: 'boolean', options: 'true / false', default: 'false' }
];

const useEarthOptionsRows = [
  { name: 'id', desc: '实例注册键；省略时获取或创建默认实例', type: 'string', options: '非空字符串', default: '默认实例' },
  { name: 'target', desc: '地图挂载的 DOM 容器 id 或元素；命名实例省略时使用 id', type: 'string | HTMLElement', options: '—', default: 'id 或 olContainer' },
  { name: 'view', desc: 'OpenLayers 视图配置', type: 'ViewOptions', options: '—', default: '—' },
  {
    name: 'controls',
    desc: '缩放、旋转和归属控件配置',
    type: "Omit&lt;IEarthConstructorOptions, 'target'&gt;",
    options: '—',
    default: '—'
  }
];

const methodRows = [
  {
    name: 'addLayer',
    desc: '添加图层并返回唯一 UUID 句柄；多个由 <code class="code-fn"><a href="#api-methods">createOsmLayer</a></code> 或 <code class="code-fn"><a href="#api-methods">createXyzLayer</a></code> 创建的底图可同时存在',
    params: 'BaseLayer',
    returns: 'string'
  },
  {
    name: 'removeLayer',
    desc: '传入图层对象或 <code class="code-fn"><a href="#api-methods">addLayer</a></code> 返回的 UUID 句柄精确移除；不传参数时移除所有由底图工厂创建的底图',
    params: 'BaseLayer | string | —',
    returns: 'BaseLayer | undefined'
  },
  { name: 'createOsmLayer', desc: '创建 OSM 底图图层', params: '—', returns: 'TileLayer&lt;OSM&gt;' },
  {
    name: 'createXyzLayer',
    desc: '创建自定义 XYZ 瓦片图层',
    params: 'string | TileCoord =&gt; string',
    returns: 'TileLayer&lt;XYZ&gt;'
  },
  { name: 'flyTo', desc: '无动画移动到指定位置', params: 'Coordinate, number?', returns: 'void' },
  {
    name: 'animateFlyTo',
    desc: '带动画移动到指定位置',
    params: 'Coordinate, number?, number?',
    returns: 'void'
  },
  { name: 'destroy', desc: '销毁地图并注销实例，随后可用相同注册键重新创建', params: '—', returns: 'void' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">快速上手</span>
        <h1>地图创建与销毁</h1>
        <p>以 useEarth 作为常规入口创建默认或命名地图，并在不再使用时正确销毁实例。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          <code><a href="#api-constructor">Earth</a></code> 是所有图层能力的入口。常规单地图使用
          <code class="code-fn"><a href="#api-use-earth">useEarth</a></code> 获取或创建默认实例；需要多个地图时，为
          <code><a href="#api-type-use-earth-options">UseEarthOptions</a></code> 提供不同的 <code><a href="#api-type-use-earth-options">id</a></code
          >。 <code><a href="#api-constructor">Earth</a></code> 仍保留公共构造函数，作为需要完全自行管理实例时的完整 API 入口。 注册实例既可调用实例的
          <code class="code-fn"><a href="#api-methods">destroy</a></code
          >，也可按注册键调用 <code class="code-fn"><a href="#api-destroy-earth">destroyEarth</a></code
          >。
        </p>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>

        <div id="example-default-earth">
          <ExampleBlock
            title="默认实例：获取或创建"
            :description="`传入 <code><a href=&quot;#api-type-use-earth-options&quot;>UseEarthOptions</a></code> 初始化 <code><a href=&quot;#api-constructor&quot;>Earth</a></code> 默认实例，再调用 <code class=&quot;code-fn&quot;><a href=&quot;#api-use-earth&quot;>useEarth</a></code> 无参形式取得同一实例。按钮和组件卸载都会对该实例调用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>destroy</a></code>。`"
            :source="earthCreateSource"
          >
            <template #preview>
              <EarthCreateDemo />
            </template>
          </ExampleBlock>
        </div>

        <div id="example-named-earth">
          <ExampleBlock
            title="命名实例：多地图"
            :description="`使用两个不同的 <code><a href=&quot;#api-type-use-earth-options&quot;>id</a></code> 创建独立地图；之后通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-use-earth&quot;>useEarth</a></code> 的 id 形式取回对应实例，并在清理阶段分别调用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>destroy</a></code>。`"
            :source="multiEarthSource"
          >
            <template #preview>
              <MultiEarthDemo />
            </template>
          </ExampleBlock>
        </div>

        <div id="example-base-layers">
          <ExampleBlock
            title="管理多个底图"
            :description="`<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addLayer</a></code> 为每个已添加底图返回 UUID 句柄。示例通过运行时配置分别添加矢量与卫星底图，再使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>removeLayer</a></code> 和对应句柄独立移除。`"
            :source="baseLayerHandleSource"
          >
            <template #preview>
              <BaseLayerHandleDemo />
            </template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>

        <h3 id="api-use-earth" class="doc-h3">useEarth</h3>
        <p class="api-constructor__signature"><code>useEarth(): Earth</code></p>
        <p class="api-constructor__signature"><code>useEarth(id: string): Earth</code></p>
        <p class="api-constructor__signature"><code>useEarth(options: UseEarthOptions): Earth</code></p>
        <ul class="doc-list">
          <li>无参调用获取或创建默认实例；重复调用返回仍处于活动状态的同一实例。</li>
          <li>传入非空 id 获取或创建对应命名实例；首次创建时 id 同时作为默认挂载目标。</li>
          <li>传入配置时，id 决定注册键；省略 id 表示默认实例，target、view 和 controls 仅在创建时生效。</li>
        </ul>
        <p class="doc-prose__hint">useEarth(options) 的 target、view 和 controls 仅在首次创建时生效；需要应用新配置时，请先销毁同一注册键的活动实例。</p>

        <h3 id="api-destroy-earth" class="doc-h3">destroyEarth</h3>
        <p class="api-constructor__signature"><code>destroyEarth(): void</code></p>
        <p class="api-constructor__signature"><code>destroyEarth(id: string): void</code></p>
        <ul class="doc-list">
          <li>
            <code class="code-fn"><a href="#api-destroy-earth">destroyEarth()</a></code> 销毁并注销默认实例。
          </li>
          <li>
            <code class="code-fn"><a href="#api-destroy-earth">destroyEarth(id)</a></code> 销毁并注销对应命名实例。
          </li>
          <li>
            不存在对应实例时不会抛错；销毁后以相同 key 调用 <code class="code-fn"><a href="#api-use-earth">useEarth</a></code> 会创建新实例。
          </li>
        </ul>

        <div class="api-constructor">
          <h3 id="api-constructor" class="doc-h3">Earth 构造函数</h3>
          <p class="api-constructor__signature"><code>new Earth(viewOptions?, options?)</code></p>
        </div>

        <h4 class="doc-h4">viewOptions</h4>
        <p class="doc-prose__hint">视图参数，透传自 OpenLayers <code>ViewOptions</code>。常用字段如下：</p>
        <ApiTable :columns="attrCols" :rows="viewOptionsRows" />

        <h4 class="doc-h4">options</h4>
        <p class="doc-prose__hint">引擎构造配置。</p>
        <ApiTable :columns="attrCols" :rows="earthOptionsRows" />

        <h3 id="api-type-use-earth-options" class="doc-h3">UseEarthOptions</h3>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-use-earth">useEarth</a></code> 配置形式的参数类型。
        </p>
        <ApiTable :columns="attrCols" :rows="useEarthOptionsRows" />

        <h3 id="api-methods" class="doc-h3">Earth 实例方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>
            站点构建后可编辑根目录的 <code>/map-sources.json</code>，为所有示例统一替换矢量与卫星 XYZ 服务；地址模板必须包含 <code>{z}</code>、<code>{x}</code>
            与 <code>{y}</code>。
          </li>
          <li>
            保存 <code class="code-fn"><a href="#api-methods">addLayer</a></code> 返回的 UUID，便于调用
            <code class="code-fn"><a href="#api-methods">removeLayer</a></code> 精确移除多个底图中的一个。
          </li>
          <li>
            组件卸载时务必调用 <code class="code-fn"><a href="#api-methods">destroy</a></code
            >，或使用 <code class="code-fn"><a href="#api-destroy-earth">destroyEarth</a></code
            >；销毁会注销注册键，使默认实例或同名实例可以重新创建。
          </li>
          <li>
            每个 <code><a href="#api-constructor">Earth</a></code> 实例必须使用不同的 <code><a href="#api-type-use-earth-options">id</a></code
            >，并绑定不同的 DOM 容器。
          </li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="地图创建与销毁" :items="anchors" />
    </aside>
  </div>
</template>
