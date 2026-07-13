<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import { getPolygonLayerInterfaceRows, getPolygonLayerMethodRows } from '../docs/polygonLayerApi';
import PolygonLayerBasicDemo from '../examples/PolygonLayerBasicDemo.vue';
import polygonBasicSource from '../examples/PolygonLayerBasicDemo.vue?raw';
import PolygonLayerStyleDemo from '../examples/PolygonLayerStyleDemo.vue';
import polygonStyleSource from '../examples/PolygonLayerStyleDemo.vue?raw';
import PolygonLayerUpdateDemo from '../examples/PolygonLayerUpdateDemo.vue';
import polygonUpdateSource from '../examples/PolygonLayerUpdateDemo.vue?raw';

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
  { id: 'usage', label: '何时使用' },
  {
    id: 'examples',
    label: '代码演示',
    children: [
      { id: 'example-basic', label: '基础用法' },
      { id: 'example-style', label: '双层描边' },
      { id: 'example-update', label: '更新位置' }
    ]
  },
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-constructor', label: '构造参数' },
      {
        id: 'api-types',
        label: '类型定义',
        children: [
          { id: 'api-polygonparam', label: 'IPolygonParam' },
          { id: 'api-setpolygonparam', label: 'ISetPolygonParam' }
        ]
      },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];

const attrCols: ApiColumn[] = [
  { prop: 'name', label: '属性名', width: 150, presentation: 'property' },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'type', label: '类型', width: 200, monospace: true },
  { prop: 'options', label: '可选值', width: 180 },
  { prop: 'default', label: '默认值', width: 110 }
];

const methodCols: ApiColumn[] = [
  { prop: 'name', label: '方法名', width: 160, presentation: 'method' },
  { prop: 'desc', label: '说明', width: 280 },
  { prop: 'params', label: '参数', width: 280, monospace: true },
  { prop: 'returns', label: '返回值', width: 180, monospace: true }
];

const constructorRows = [
  {
    name: 'earth',
    desc: '地图实例；不传时回退到 <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth</a></code> 默认实例',
    type: 'Earth',
    options: '—',
    default: '—'
  },
  { name: 'options.wrapX', desc: '是否允许要素在 180° 经线换行显示', type: 'boolean', options: 'true / false', default: 'true' },
  { name: 'options.register', desc: '是否注册到全局图层管理', type: 'boolean', options: 'true / false', default: 'true' }
];

const methodRows = getPolygonLayerMethodRows([
  { name: 'add(param)', desc: '新增多边形要素', params: '', returns: '' },
  { name: 'set(param)', desc: '按 id 更新顶点、主描边、背景描边、填充或标签', params: '', returns: '' },
  { name: 'setPosition(id, position)', desc: '按 id 单独更新多边形坐标环', params: '', returns: '' }
]);

const polygonParamRows = getPolygonLayerInterfaceRows('IPolygonParam', [
  { name: 'id', desc: '多边形唯一标识；省略时自动生成', type: '', options: '—', default: '自动生成' },
  { name: 'positions', desc: '多边形坐标环；首尾坐标应闭合', type: '', options: '—', default: '—' },
  { name: 'stroke', desc: '主描边样式，详见 <a href="/components/point-layer#api-type-istroke">IStroke</a>', type: '', options: '—', default: '—' },
  {
    name: 'backgroundStroke',
    desc: '绘制在主描边之前的背景描边，详见 <a href="/components/point-layer#api-type-istroke">IStroke</a>',
    type: '',
    options: '—',
    default: '—'
  },
  {
    name: 'fill',
    desc: '纯色或纹理填充，详见 <a href="/components/circle-layer#api-type-igeometryfill">IGeometryFill</a>',
    type: '',
    options: '—',
    default: '—'
  },
  { name: 'label', desc: '标签样式，详见 <a href="/components/point-layer#api-type-ilabel">ILabel</a>', type: '', options: '—', default: '—' },
  { name: 'module', desc: '业务模块名称', type: '', options: '—', default: '—' },
  { name: 'data', desc: '附加业务数据', type: '', options: '—', default: '—' }
]);

const setPolygonParamRows = getPolygonLayerInterfaceRows('ISetPolygonParam', [
  { name: 'id', desc: '需要更新的多边形唯一标识（必填）', type: '', options: '—', default: '—' },
  { name: 'positions', desc: '更新多边形坐标环', type: '', options: '—', default: '—' },
  { name: 'stroke', desc: '更新主描边，详见 <a href="/components/point-layer#api-type-istroke">IStroke</a>', type: '', options: '—', default: '—' },
  { name: 'backgroundStroke', desc: '更新背景描边，详见 <a href="/components/point-layer#api-type-istroke">IStroke</a>', type: '', options: '—', default: '—' },
  { name: 'fill', desc: '更新填充，详见 <a href="/components/circle-layer#api-type-igeometryfill">IGeometryFill</a>', type: '', options: '—', default: '—' },
  { name: 'label', desc: '更新标签，详见 <a href="/components/point-layer#api-type-ilabel">ILabel</a>', type: '', options: '—', default: '—' }
]);
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">基础图层</span>
        <h1>PolygonLayer 面图层</h1>
        <p>用于创建和更新任意多边形区域，并组合填充、主描边、背景描边与标签表达区域状态。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>PolygonLayer 封装 OpenLayers 多边形几何的创建与声明式更新，支持普通填充、纹理填充和双层描边。</p>
      </section>

      <section id="usage" class="doc-prose">
        <h2 class="doc-h2">何时使用</h2>
        <ul class="doc-list">
          <li>展示行政边界、规划范围、地块或风险区域。</li>
          <li>需要用背景描边增强边界层次，或动态切换区域状态样式。</li>
          <li>需要保留样式，只替换多边形坐标环的场景。</li>
        </ul>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-basic">
          <ExampleBlock
            title="基础用法"
            :description="`使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>add</a></code> 创建带填充、描边和标签的多边形。`"
            :source="polygonBasicSource"
          >
            <template #preview><PolygonLayerBasicDemo /></template>
          </ExampleBlock>
        </div>
        <div id="example-style">
          <ExampleBlock
            title="双层描边"
            :description="`组合 <code><a href=&quot;#api-polygonparam&quot;>backgroundStroke</a></code> 与 <code><a href=&quot;#api-polygonparam&quot;>stroke</a></code>，再通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>set</a></code> 切换区域状态。`"
            :source="polygonStyleSource"
          >
            <template #preview><PolygonLayerStyleDemo /></template>
          </ExampleBlock>
        </div>
        <div id="example-update">
          <ExampleBlock
            title="更新位置"
            :description="`使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>setPosition</a></code> 替换坐标环，同时保留原有区域样式。`"
            :source="polygonUpdateSource"
          >
            <template #preview><PolygonLayerUpdateDemo /></template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <div class="api-constructor">
          <h3 id="api-constructor" class="doc-h3">构造参数</h3>
          <p class="api-constructor__signature"><code>new PolygonLayer(earth?, options?)</code></p>
        </div>
        <ApiTable :columns="attrCols" :rows="constructorRows" />

        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-polygonparam" class="doc-h4">IPolygonParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">add</a></code> 的参数类型。
        </p>
        <ApiTable :columns="attrCols" :rows="polygonParamRows" />

        <h4 id="api-setpolygonparam" class="doc-h4">ISetPolygonParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">set</a></code> 的参数类型。除 <code>id</code> 外字段均可选。
        </p>
        <ApiTable :columns="attrCols" :rows="setPolygonParamRows" />

        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
        <p class="doc-prose__hint">获取、显隐、移除、图层层级和销毁等继承方法统一见<a href="/components/layer-common#api-methods">图层通用操作</a>。</p>
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li><code>positions</code> 是二维坐标环数组；每个环的首尾坐标应相同，内环可用于表达镂空区域。</li>
          <li><code>backgroundStroke</code> 先于 <code>stroke</code> 绘制，通常应设置更大的宽度以形成外轮廓。</li>
          <li>组件卸载时应同时销毁 PolygonLayer 与 Earth，避免残留图层、地图和监听资源。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="PolygonLayer 面图层" :items="anchors" />
    </aside>
  </div>
</template>
