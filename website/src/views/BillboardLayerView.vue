<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import { getBillboardLayerInterfaceRows, getBillboardLayerMethodRows } from '../docs/billboardLayerApi';
import BillboardLayerBasicDemo from '../examples/BillboardLayerBasicDemo.vue';
import billboardBasicSource from '../examples/BillboardLayerBasicDemo.vue?raw';
import BillboardLayerStyleDemo from '../examples/BillboardLayerStyleDemo.vue';
import billboardStyleSource from '../examples/BillboardLayerStyleDemo.vue?raw';
import BillboardLayerUpdateDemo from '../examples/BillboardLayerUpdateDemo.vue';
import billboardUpdateSource from '../examples/BillboardLayerUpdateDemo.vue?raw';

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
      { id: 'example-style', label: '自定义样式' },
      { id: 'example-update', label: '位置与范围' }
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
          { id: 'api-billboardparam', label: 'IBillboardParam' },
          { id: 'api-setbillboardparam', label: 'ISetBillboardParam' }
        ]
      },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];

const attrCols: ApiColumn[] = [
  { prop: 'name', label: '属性名', width: 150, presentation: 'property' },
  { prop: 'desc', label: '说明', width: 310 },
  { prop: 'type', label: '类型', width: 210, monospace: true },
  { prop: 'options', label: '可选值', width: 180 },
  { prop: 'default', label: '默认值', width: 120 }
];

const methodCols: ApiColumn[] = [
  { prop: 'name', label: '方法名', width: 170, presentation: 'method' },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'params', label: '参数', width: 280, monospace: true },
  { prop: 'returns', label: '返回值', width: 250, monospace: true }
];

const constructorRows = [
  {
    name: 'earth',
    desc: '地图实例；不传时回退到 <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth</a></code> 默认实例',
    type: 'Earth',
    options: '—',
    default: '—'
  },
  { name: 'options.wrapX', desc: '是否允许要素在 180° 经线换行显示', type: 'boolean', options: 'true / false', default: 'true' }
];

const methodRows = getBillboardLayerMethodRows([
  { name: 'add(param)', desc: '新增广告牌要素', params: '', returns: '' },
  { name: 'set(param)', desc: '按 id 更新坐标、图标、变换或标签', params: '', returns: '' },
  { name: 'setPosition(id, position)', desc: '按 id 单独更新广告牌坐标', params: '', returns: '' },
  { name: 'getIconExtent(feature)', desc: '计算图标当前屏幕尺寸覆盖的地图坐标范围', params: '', returns: '' }
]);

const billboardParamRows = getBillboardLayerInterfaceRows('IBillboardParam', [
  { name: 'id', desc: '广告牌唯一标识；省略时自动生成', type: '', options: '—', default: '自动生成' },
  { name: 'center', desc: '广告牌坐标（地图投影坐标系）', type: '', options: '—', default: '—' },
  { name: 'src', desc: '图标图片地址；可使用本地资源或 data URL', type: '', options: '—', default: '—' },
  { name: 'size', desc: '图标原始尺寸 [width, height]', type: '', options: 'OpenLayers Size', default: '图片尺寸' },
  { name: 'color', desc: '图标叠加颜色；省略时保持原图颜色', type: '', options: '—', default: '原图颜色' },
  { name: 'displacement', desc: '屏幕像素位移 [x, y]；正值向右、向上', type: '', options: '—', default: '[0, 0]' },
  { name: 'scale', desc: '图标缩放比例或 x/y 缩放数组', type: '', options: '—', default: '1' },
  { name: 'rotation', desc: '顺时针旋转角度（度）', type: '', options: '0-360', default: '0' },
  { name: 'anchor', desc: '图标锚点 [x, y]', type: '', options: '—', default: '[0.5, 0.5]' },
  { name: 'anchorOrigin', desc: '锚点坐标原点（OpenLayers 外部类型）', type: '', options: 'IconOrigin', default: 'top-left' },
  { name: 'anchorXUnits', desc: '锚点 x 值单位（OpenLayers 外部类型）', type: '', options: 'fraction / pixels', default: 'fraction' },
  { name: 'anchorYUnits', desc: '锚点 y 值单位（OpenLayers 外部类型）', type: '', options: 'fraction / pixels', default: 'fraction' },
  { name: 'label', desc: '标签样式，详见 <a href="/components/point-layer#api-type-ilabel">ILabel</a>', type: '', options: '—', default: '—' },
  { name: 'module', desc: '业务模块名称', type: '', options: '—', default: '—' },
  { name: 'data', desc: '附加业务数据', type: '', options: '—', default: '—' }
]);

const setBillboardParamRows = getBillboardLayerInterfaceRows('ISetBillboardParam', [
  { name: 'id', desc: '需要更新的广告牌唯一标识（必填）', type: '', options: '—', default: '—' },
  { name: 'center', desc: '更新广告牌坐标', type: '', options: '—', default: '—' },
  { name: 'src', desc: '替换图标图片', type: '', options: '—', default: '保留原值' },
  { name: 'size', desc: '更新图标原始尺寸', type: '', options: 'OpenLayers Size', default: '保留原值' },
  { name: 'color', desc: '更新图标叠加颜色', type: '', options: '—', default: '保留原值' },
  { name: 'displacement', desc: '更新屏幕像素位移', type: '', options: '—', default: '保留原值' },
  { name: 'scale', desc: '更新图标缩放比例', type: '', options: '—', default: '保留原值' },
  { name: 'rotation', desc: '更新顺时针旋转角度（度）', type: '', options: '0-360', default: '保留原值' },
  { name: 'anchor', desc: '更新图标锚点', type: '', options: '—', default: '[0.5, 0.5]' },
  { name: 'label', desc: '更新标签，详见 <a href="/components/point-layer#api-type-ilabel">ILabel</a>', type: '', options: '—', default: '保留原值' }
]);
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">基础图层</span>
        <h1>BillboardLayer 广告牌图层</h1>
        <p>用图片图标标记地图位置，并通过锚点、缩放、旋转、位移和标签表达不同业务状态。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>BillboardLayer 将图片图标封装为 OpenLayers 点要素，支持声明式创建和更新，并能读取图标在当前视图中的地图坐标范围。</p>
      </section>

      <section id="usage" class="doc-prose">
        <h2 class="doc-h2">何时使用</h2>
        <ul class="doc-list">
          <li>使用品牌图标、设备图标或状态图标标记地图位置。</li>
          <li>需要精确控制图片锚点、缩放、旋转或屏幕像素位移。</li>
          <li>需要根据图标显示范围执行视图适配或空间判断。</li>
        </ul>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-basic">
          <ExampleBlock
            title="基础用法"
            :description="`使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>add</a></code> 创建一个采用 data URL 图片和像素锚点的广告牌。`"
            :source="billboardBasicSource"
          >
            <template #preview><BillboardLayerBasicDemo /></template>
          </ExampleBlock>
        </div>
        <div id="example-style">
          <ExampleBlock
            title="自定义样式"
            :description="`通过 <code><a href=&quot;#api-billboardparam&quot;>scale</a></code>、<code><a href=&quot;#api-billboardparam&quot;>rotation</a></code> 和 <code><a href=&quot;#api-billboardparam&quot;>displacement</a></code> 配置外观，再用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>set</a></code> 动态更新。`"
            :source="billboardStyleSource"
          >
            <template #preview><BillboardLayerStyleDemo /></template>
          </ExampleBlock>
        </div>
        <div id="example-update">
          <ExampleBlock
            title="位置与范围"
            :description="`使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>setPosition</a></code> 移动广告牌，并通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>getIconExtent</a></code> 读取图标覆盖范围。`"
            :source="billboardUpdateSource"
          >
            <template #preview><BillboardLayerUpdateDemo /></template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <div class="api-constructor">
          <h3 id="api-constructor" class="doc-h3">构造参数</h3>
          <p class="api-constructor__signature"><code>new BillboardLayer(earth?, options?)</code></p>
        </div>
        <ApiTable :columns="attrCols" :rows="constructorRows" />

        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-billboardparam" class="doc-h4">IBillboardParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">add</a></code> 的参数类型。
        </p>
        <ApiTable :columns="attrCols" :rows="billboardParamRows" />

        <h4 id="api-setbillboardparam" class="doc-h4">ISetBillboardParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">set</a></code> 的参数类型。除 <code>id</code> 外字段均可选。
        </p>
        <ApiTable :columns="attrCols" :rows="setBillboardParamRows" />

        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
        <p class="doc-prose__hint">获取、显隐、移除、图层层级和销毁等继承方法统一见<a href="/components/layer-common#api-methods">图层通用操作</a>。</p>
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li><code>src</code> 应使用可公开访问的资源、本地构建资源或 data URL；不要把私有服务地址和 token 写入代码。</li>
          <li><code>anchorOrigin</code>、<code>anchorXUnits</code>、<code>anchorYUnits</code> 与 <code>Size</code> 是 OpenLayers 外部类型。</li>
          <li><code>getIconExtent</code> 依赖图标尺寸和当前地图视图，调用前应确保图标已经加载并配置可确定的 <code>size</code>。</li>
          <li>组件卸载时应同时销毁 BillboardLayer 与 Earth，避免残留图层、地图和监听资源。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="BillboardLayer 广告牌图层" :items="anchors" />
    </aside>
  </div>
</template>
