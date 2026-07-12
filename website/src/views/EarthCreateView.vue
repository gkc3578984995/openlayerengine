<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import EarthCreateDemo from '../examples/EarthCreateDemo.vue';
import MultiEarthDemo from '../examples/MultiEarthDemo.vue';
import earthCreateSource from '../examples/EarthCreateDemo.vue?raw';
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
}

const anchors: AnchorItem[] = [
  { id: 'overview', label: '概述' },
  {
    id: 'demo',
    label: '代码演示',
    children: [
      { id: 'demo-single', label: '单例模式' },
      { id: 'demo-multi', label: '多例模式' }
    ]
  },
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-constructor', label: '构造参数' },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];

const attrCols: ApiColumn[] = [
  { prop: 'name', label: '属性名', width: 160 },
  { prop: 'desc', label: '说明', width: 320 },
  { prop: 'type', label: '类型', width: 160, monospace: true },
  { prop: 'options', label: '可选值', width: 130 },
  { prop: 'default', label: '默认值', width: 110 }
];

const methodCols: ApiColumn[] = [
  { prop: 'name', label: '方法名', width: 260 },
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

const targetOptionsRows = [
  { name: 'target', desc: '地图挂载的 DOM 容器 id', type: 'string', options: '—', default: '—' },
  { name: 'zoom', desc: '是否启用缩放控件，默认关闭', type: 'boolean', options: 'true / false', default: 'false' },
  { name: 'rotate', desc: '是否启用旋转控件，默认关闭', type: 'boolean', options: 'true / false', default: 'false' },
  { name: 'attribution', desc: '是否启用归属控件，默认关闭', type: 'boolean', options: 'true / false', default: 'false' }
];

const methodRows = [
  { name: 'addLayer(layer)', desc: '添加图层（底图或覆盖层）', params: 'BaseLayer', returns: 'void' },
  { name: 'removeLayer(layer?)', desc: '移除指定图层；不传则移除所有底图标识图层', params: 'BaseLayer?', returns: 'BaseLayer | undefined' },
  { name: 'createOsmLayer()', desc: '创建 OSM 底图图层', params: '—', returns: 'TileLayer&lt;OSM&gt;' },
  { name: 'createXyzLayer(urlOrTileFn)', desc: '创建自定义瓦片图层', params: 'string | TileCoord => string', returns: 'TileLayer&lt;XYZ&gt;' },
  { name: 'flyTo(position, zoom?)', desc: '无动画移动到指定位置', params: 'Coordinate, number?', returns: 'void' },
  { name: 'animateFlyTo(position, zoom?, duration?)', desc: '带动画移动到指定位置', params: 'Coordinate, number?, number?', returns: 'void' },
  { name: 'destroy()', desc: '销毁地图：移除所有图层、交互、监听，释放 DOM 引用', params: '—', returns: 'void' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">快速上手</span>
        <h1>地图创建与销毁</h1>
        <p>学习如何创建 Earth 实例、添加底图，以及在组件卸载时正确销毁地图。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          <code>Earth</code> 是所有图层能力的入口。它封装了 OpenLayers 的 Map 和 View，
          提供了底图创建、图层管理、相机控制、右键菜单、测量绘制等一站式能力。
        </p>
      </section>

      <section id="demo" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>

        <div id="demo-single">
          <ExampleBlock
            title="单例模式"
            :description="`创建 <code class=&quot;code-fn-inline&quot;>Earth</code> 实例并添加高德瓦片底图。点击「销毁地图」调用 <code class=&quot;code-fn-inline&quot;>destroy()</code> 释放所有资源。`"
            :source="earthCreateSource"
          >
            <template #preview>
              <EarthCreateDemo />
            </template>
          </ExampleBlock>
        </div>

        <div id="demo-multi">
          <ExampleBlock
            title="多例模式"
            :description="`同一页面创建两个独立的 <code class=&quot;code-fn-inline&quot;>Earth</code> 实例，绑定不同 DOM 容器，各自拥有独立的视图和图层。`"
            :source="multiEarthSource"
          >
            <template #preview>
              <MultiEarthDemo />
            </template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>

        <h3 id="api-constructor" class="doc-h3">构造参数</h3>
        <p class="doc-prose__hint"><code>new Earth(viewOptions?, options?)</code></p>

        <h4 class="doc-h4">viewOptions</h4>
        <p class="doc-prose__hint">视图参数，透传自 OpenLayers <code>ViewOptions</code>。常用字段如下：</p>
        <ApiTable :columns="attrCols" :rows="viewOptionsRows" />

        <h4 class="doc-h4">options</h4>
        <p class="doc-prose__hint">引擎自定义参数。</p>
        <ApiTable :columns="attrCols" :rows="targetOptionsRows" />

        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>默认 OSM 瓦片源（<code>tile.openstreetmap.org</code>）在国内可能无法访问，建议使用国内瓦片服务或自建瓦片源。</li>
          <li>组件卸载时务必调用 <code>earth.destroy()</code>，否则残留的地图 DOM 和事件监听可能导致内存泄漏。</li>
          <li>多地图场景下，每个 <code>Earth</code> 实例需绑定不同的 DOM 容器 id。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="地图创建与销毁" :items="anchors" />
    </aside>
  </div>
</template>
