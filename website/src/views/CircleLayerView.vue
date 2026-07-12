<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import { getCircleLayerInterfaceRows, getCircleLayerMethodRows } from '../docs/circleLayerApi';
import CircleLayerBasicDemo from '../examples/CircleLayerBasicDemo.vue';
import circleBasicSource from '../examples/CircleLayerBasicDemo.vue?raw';
import CircleLayerPatternDemo from '../examples/CircleLayerPatternDemo.vue';
import circlePatternSource from '../examples/CircleLayerPatternDemo.vue?raw';
import CircleLayerUpdateDemo from '../examples/CircleLayerUpdateDemo.vue';
import circleUpdateSource from '../examples/CircleLayerUpdateDemo.vue?raw';

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
      { id: 'example-pattern', label: '纹理填充' },
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
          { id: 'api-circleparam', label: 'ICircleParam' },
          { id: 'api-setcircleparam', label: 'ISetCircleParam' },
          { id: 'api-type-igeometryfill', label: 'IGeometryFill' }
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
  { prop: 'params', label: '参数', width: 260, monospace: true },
  { prop: 'returns', label: '返回值', width: 180, monospace: true }
];

const typeCols: ApiColumn[] = [
  { prop: 'name', label: '属性', width: 150, presentation: 'property' },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'type', label: '类型', width: 220, monospace: true },
  { prop: 'default', label: '默认值', width: 130 }
];

const constructorRows = [
  { name: 'earth', desc: '地图实例；不传时回退到 <code>useEarth()</code> 全局单例', type: 'Earth', options: '—', default: '—' },
  { name: 'options.wrapX', desc: '是否允许要素在 180° 经线换行显示', type: 'boolean', options: 'true / false', default: 'true' }
];

const methodRows = getCircleLayerMethodRows([
  { name: 'add(param)', desc: '新增圆要素', params: '', returns: '' },
  { name: 'set(param)', desc: '按 id 更新圆心、半径、描边、填充或标签', params: '', returns: '' },
  { name: 'setPosition(id, position)', desc: '按 id 单独更新圆心坐标', params: '', returns: '' }
]);

const circleParamRows = getCircleLayerInterfaceRows('ICircleParam', [
  { name: 'id', desc: '圆唯一标识；省略时自动生成', type: '', options: '—', default: '自动生成' },
  { name: 'center', desc: '圆心坐标（地图投影坐标系）', type: '', options: '—', default: '—' },
  { name: 'radius', desc: '圆半径（地图投影单位）', type: '', options: '—', default: '—' },
  { name: 'stroke', desc: '描边样式，详见 <a href="/components/point-layer#api-type-istroke">IStroke</a>', type: '', options: '—', default: '—' },
  { name: 'fill', desc: '纯色或纹理填充，详见 <a href="#api-type-igeometryfill">IGeometryFill</a>', type: '', options: '—', default: '—' },
  { name: 'label', desc: '标签样式，详见 <a href="/components/point-layer#api-type-ilabel">ILabel</a>', type: '', options: '—', default: '—' },
  { name: 'module', desc: '业务模块名称', type: '', options: '—', default: '—' },
  { name: 'data', desc: '附加业务数据', type: '', options: '—', default: '—' }
]);

const setCircleParamRows = getCircleLayerInterfaceRows('ISetCircleParam', [
  { name: 'id', desc: '需要更新的圆唯一标识（必填）', type: '', options: '—', default: '—' },
  { name: 'center', desc: '更新圆心坐标', type: '', options: '—', default: '—' },
  { name: 'radius', desc: '更新圆半径', type: '', options: '—', default: '—' },
  { name: 'stroke', desc: '更新描边样式，详见 <a href="/components/point-layer#api-type-istroke">IStroke</a>', type: '', options: '—', default: '—' },
  { name: 'fill', desc: '更新纯色或纹理填充，详见 <a href="#api-type-igeometryfill">IGeometryFill</a>', type: '', options: '—', default: '—' },
  { name: 'label', desc: '更新标签样式，详见 <a href="/components/point-layer#api-type-ilabel">ILabel</a>', type: '', options: '—', default: '—' }
]);

const geometryFillRows = [
  { name: 'type', desc: '内置纹理类型；省略时使用纯色填充', type: "'diagonal' | 'cross' | 'dot' | 'horizontal' | 'vertical'", default: '—' },
  { name: 'color', desc: '纯色填充颜色或纹理前景色；纹理未传时继承显式描边颜色', type: 'string', default: '—' },
  { name: 'size', desc: '纹理图块尺寸，仅支持 2 的幂', type: 'number', default: '—' },
  { name: 'lineWidth', desc: '纹理线条宽度', type: 'number', default: '—' },
  { name: 'dotRadius', desc: '点阵圆点半径，仅对 <code>dot</code> 生效', type: 'number', default: '—' },
  { name: 'backgroundColor', desc: '纹理底色；省略时透明', type: 'string', default: 'transparent' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">基础图层</span>
        <h1>CircleLayer 圆图层</h1>
        <p>用于按圆心和半径创建范围要素，并动态更新位置、尺寸、描边、标签及纯色或纹理填充。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>CircleLayer 封装 OpenLayers 圆几何的创建与声明式更新，适合以地图投影距离表达覆盖范围、缓冲区和影响区域。</p>
      </section>

      <section id="usage" class="doc-prose">
        <h2 class="doc-h2">何时使用</h2>
        <ul class="doc-list">
          <li>展示设备覆盖范围、服务半径或风险影响区。</li>
          <li>需要在纯色与内置纹理之间切换，以区分范围状态。</li>
          <li>需要保留半径和样式，仅动态移动圆心的场景。</li>
        </ul>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-basic">
          <ExampleBlock
            title="基础用法"
            :description="`使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>add</a></code> 创建带描边、填充和标签的范围圆。`"
            :source="circleBasicSource"
          >
            <template #preview><CircleLayerBasicDemo /></template>
          </ExampleBlock>
        </div>
        <div id="example-pattern">
          <ExampleBlock
            title="纹理填充"
            :description="`为 <code><a href=&quot;#api-type-igeometryfill&quot;>IGeometryFill</a></code> 配置内置纹理，再通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>set</a></code> 切换点阵与斜线。`"
            :source="circlePatternSource"
          >
            <template #preview><CircleLayerPatternDemo /></template>
          </ExampleBlock>
        </div>
        <div id="example-update">
          <ExampleBlock
            title="更新位置"
            :description="`使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>setPosition</a></code> 更新圆心，同时保留原有半径和样式。`"
            :source="circleUpdateSource"
          >
            <template #preview><CircleLayerUpdateDemo /></template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <div class="api-constructor">
          <h3 id="api-constructor" class="doc-h3">构造参数</h3>
          <p class="api-constructor__signature"><code>new CircleLayer(earth?, options?)</code></p>
        </div>
        <ApiTable :columns="attrCols" :rows="constructorRows" />

        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-circleparam" class="doc-h4">ICircleParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">add</a></code> 的参数类型。
        </p>
        <ApiTable :columns="attrCols" :rows="circleParamRows" />

        <h4 id="api-setcircleparam" class="doc-h4">ISetCircleParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">set</a></code> 的参数类型。除 <code>id</code> 外字段均可选。
        </p>
        <ApiTable :columns="attrCols" :rows="setCircleParamRows" />

        <h4 id="api-type-igeometryfill" class="doc-h4">IGeometryFill</h4>
        <p class="doc-prose__hint">纯色填充或内置纹理填充配置；纹理参数均为可选配置，只有 <code>type</code> 用于启用纹理。</p>
        <ApiTable :columns="typeCols" :rows="geometryFillRows" />

        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
        <p class="doc-prose__hint">获取、显隐、移除、图层层级和销毁等继承方法统一见<a href="/components/layer-common#api-methods">图层通用操作</a>。</p>
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li><code>center</code> 与 <code>radius</code> 使用地图投影单位；示例底图采用 Web Mercator，因此半径可按米理解。</li>
          <li>纹理图块的 <code>size</code> 仅支持 2 的幂；<code>dotRadius</code> 只对点阵纹理生效。</li>
          <li>组件卸载时应同时销毁 CircleLayer 与 Earth，避免残留图层、地图和监听资源。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="CircleLayer 圆图层" :items="anchors" />
    </aside>
  </div>
</template>
