<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import { getOverlayLayerInterfaceRows, getOverlayLayerMethodRows } from '../docs/overlayLayerApi';
import OverlayLayerBasicDemo from '../examples/OverlayLayerBasicDemo.vue';
import overlayBasicSource from '../examples/OverlayLayerBasicDemo.vue?raw';
import OverlayLayerUpdateDemo from '../examples/OverlayLayerUpdateDemo.vue';
import overlayUpdateSource from '../examples/OverlayLayerUpdateDemo.vue?raw';

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
      { id: 'example-update', label: '更新内容与位置' }
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
          { id: 'api-overlayparam', label: 'IOverlayParam' },
          { id: 'api-setoverlayparam', label: 'ISetOverlayParam' }
        ]
      },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];

const attrCols: ApiColumn[] = [
  { prop: 'name', label: '属性名', width: 150, presentation: 'property' },
  { prop: 'desc', label: '说明', width: 330 },
  { prop: 'type', label: '类型', width: 230, monospace: true },
  { prop: 'options', label: '可选值', width: 160 },
  { prop: 'default', label: '默认值', width: 120 }
];

const methodCols: ApiColumn[] = [
  { prop: 'name', label: '方法名', width: 160, presentation: 'method' },
  { prop: 'desc', label: '说明', width: 330 },
  { prop: 'params', label: '参数', width: 280, monospace: true },
  { prop: 'returns', label: '返回值', width: 210, monospace: true }
];

const constructorRows = [{ name: 'earth', desc: '地图实例；不传时回退到 <code>useEarth()</code> 全局单例', type: 'Earth', options: '—', default: '—' }];

const methodRows = getOverlayLayerMethodRows([
  { name: 'add(param)', desc: '创建 DOM 覆盖物并加入地图', params: '', returns: '' },
  { name: 'set(param)', desc: '按 id 更新元素、位置、偏移量或定位方式；未找到时返回 null', params: '', returns: '' },
  { name: 'setPosition(id, position)', desc: '按 id 更新位置；传入 undefined 可取消定位', params: '', returns: '' },
  { name: 'get(id?)', desc: '传 id 获取单个覆盖物；省略 id 获取地图中的全部覆盖物', params: '', returns: '' },
  { name: 'remove(id?)', desc: '传 id 移除单个覆盖物；省略 id 移除地图中的全部覆盖物', params: '', returns: '' }
]);

const overlayParamRows = getOverlayLayerInterfaceRows('IOverlayParam', [
  { name: 'id', desc: '覆盖物唯一标识；省略时自动生成', type: '', options: '—', default: '自动生成' },
  { name: 'element', desc: '作为覆盖物内容的 DOM 元素', type: '', options: '—', default: '—' },
  { name: 'position', desc: '覆盖物位置（地图投影坐标系）', type: '', options: '—', default: '—' },
  { name: 'offset', desc: '相对定位点的像素偏移 [x, y]', type: '', options: '—', default: '[0, 0]' },
  { name: 'positioning', desc: '元素相对坐标的定位方式（OpenLayers 外部类型）', type: '', options: 'Positioning', default: 'top-left' },
  { name: 'stopEvent', desc: '是否阻止覆盖物上的事件传播到地图', type: '', options: 'true / false', default: 'true' },
  { name: 'insertFirst', desc: '是否将覆盖物优先插入对应容器', type: '', options: 'true / false', default: 'true' },
  { name: 'autoPan', desc: '覆盖物超出视口时是否自动平移地图，或指定平移配置', type: '', options: 'true / false / PanIntoViewOptions', default: 'false' },
  { name: 'className', desc: 'OpenLayers 覆盖物容器的类名', type: '', options: '—', default: 'ol-overlay-container ol-selectable' },
  { name: 'module', desc: '业务模块名称', type: '', options: '—', default: '—' },
  { name: 'data', desc: '附加业务数据', type: '', options: '—', default: '—' }
]);

const setOverlayParamRows = getOverlayLayerInterfaceRows('ISetOverlayParam', [
  { name: 'id', desc: '需要更新的覆盖物唯一标识（必填）', type: '', options: '—', default: '—' },
  { name: 'element', desc: '替换覆盖物 DOM 元素', type: '', options: '—', default: '保留原值' },
  { name: 'position', desc: '更新覆盖物位置', type: '', options: '—', default: '保留原值' },
  { name: 'offset', desc: '更新像素偏移 [x, y]', type: '', options: '—', default: '保留原值' },
  { name: 'positioning', desc: '更新元素相对坐标的定位方式', type: '', options: 'Positioning', default: '保留原值' }
]);
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">基础图层</span>
        <h1>OverlayLayer 覆盖物图层</h1>
        <p>把自定义 DOM 内容定位到地图坐标，用于信息卡片、提示气泡和轻量交互面板。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          OverlayLayer 封装 OpenLayers Overlay 的创建、查询、更新和移除。它直接管理地图覆盖物，不继承 Base，因此没有图层显隐、透明度、层级或 destroy 等 Base
          API。
        </p>
      </section>

      <section id="usage" class="doc-prose">
        <h2 class="doc-h2">何时使用</h2>
        <ul class="doc-list">
          <li>在地图坐标处展示由 HTML 构成的信息卡片、气泡或操作面板。</li>
          <li>需要在业务状态变化时替换 DOM 内容、调整偏移或移动覆盖物。</li>
          <li>需要按 id 查询、移除单个覆盖物，或一次清空当前地图的全部覆盖物。</li>
        </ul>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-basic">
          <ExampleBlock
            title="基础用法"
            :description="`创建 DOM 后用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>add</a></code> 添加覆盖物，以 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>get</a></code> 查询，并用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>remove</a></code> 清理。`"
            :source="overlayBasicSource"
          >
            <template #preview><OverlayLayerBasicDemo /></template>
          </ExampleBlock>
        </div>
        <div id="example-update">
          <ExampleBlock
            title="更新内容与位置"
            :description="`使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>set</a></code> 更新 DOM 与偏移，再用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>setPosition</a></code> 移动覆盖物。`"
            :source="overlayUpdateSource"
          >
            <template #preview><OverlayLayerUpdateDemo /></template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <div class="api-constructor">
          <h3 id="api-constructor" class="doc-h3">构造参数</h3>
          <p class="api-constructor__signature"><code>new OverlayLayer(earth?)</code></p>
        </div>
        <ApiTable :columns="attrCols" :rows="constructorRows" />

        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-overlayparam" class="doc-h4">IOverlayParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">add</a></code> 的参数类型。
        </p>
        <ApiTable :columns="attrCols" :rows="overlayParamRows" />

        <h4 id="api-setoverlayparam" class="doc-h4">ISetOverlayParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">set</a></code> 的参数类型。除 <code>id</code> 外字段均可选。
        </p>
        <ApiTable :columns="attrCols" :rows="setOverlayParamRows" />

        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
        <p class="doc-prose__hint">OverlayLayer 不继承 Base；上表即其全部公共方法，不适用“图层通用操作”中的 Base API。</p>
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>
            <code>HTMLElement</code>、<code>Coordinate</code>、<code>Positioning</code> 和 <code>PanIntoViewOptions</code> 是 DOM 或 OpenLayers 外部类型。
          </li>
          <li>用户提供的文本应通过 <code>textContent</code> 写入元素，不要直接拼接到 <code>innerHTML</code>。</li>
          <li>
            组件卸载时先调用 <code class="code-fn"><a href="#api-methods">remove</a></code
            >，再移除自建 DOM 并销毁 Earth，避免残留覆盖物和地图资源。
          </li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="OverlayLayer 覆盖物图层" :items="anchors" />
    </aside>
  </div>
</template>
