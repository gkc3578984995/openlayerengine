<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import DynamicDrawAdvancedGeometryDemo from '../examples/DynamicDrawAdvancedGeometryDemo.vue';
import advancedSource from '../examples/DynamicDrawAdvancedGeometryDemo.vue?raw';
import { advancedDynamicDrawGeometries } from '../config/dynamicDrawGeometries';

const anchors = [{ id: 'overview', label: '概述' }, { id: 'examples', label: '代码演示', children: [{ id: 'example-advanced-geometry-selector', label: '选择高级图形绘制' }] }, { id: 'api', label: 'API', children: [{ id: 'api-methods', label: '方法' }] }, { id: 'tips', label: '注意事项' }];
const methodCols = [{ prop: 'name', label: '方法名', width: 260, presentation: 'method' as const }, { prop: 'desc', label: '说明', width: 310 }, { prop: 'params', label: '参数', width: 300, monospace: true }, { prop: 'returns', label: '返回值', width: 120, monospace: true }];
const polygonParam = 'param?: <a href="/components/dynamic-draw/basic-geometry#api-type-idrawpolygon">IDrawPolygon</a>';
const methods = advancedDynamicDrawGeometries.map(({ drawMethod: name, label }) => ({ name, desc: `绘制${label}。`, params: polygonParam, returns: 'void' }));
</script>

<template>
  <div class="doc-page-layout"><article class="doc-page"><header class="doc-hero"><span class="doc-hero__eyebrow">地图交互</span><h1>高级几何绘制</h1><p>用高级几何表达范围、方向、曲线和战术标绘。</p></header><section id="overview" class="doc-prose"><h2 class="doc-h2">概述</h2><p>全部高级绘制方法使用 <code><a href="/components/dynamic-draw/basic-geometry#api-type-idrawpolygon">IDrawPolygon</a></code> 配置，完成事件使用基础绘制页的 <code><a href="/components/dynamic-draw/basic-geometry#api-type-idrawevent">IDrawEvent</a></code>。</p></section><section id="examples" class="doc-prose"><h2 class="doc-h2">代码演示</h2><div id="example-advanced-geometry-selector"><ExampleBlock title="选择高级图形绘制" :description="'从选择器选择高级图形，再调用本页方法表中的 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>draw*</a></code> 方法开始绘制。'" :source="advancedSource"><template #preview><DynamicDrawAdvancedGeometryDemo /></template></ExampleBlock></div></section><section id="api" class="doc-prose"><h2 class="doc-h2">API</h2><h3 id="api-methods" class="doc-h3">方法</h3><ApiTable :columns="methodCols" :rows="methods" /></section><section id="tips" class="doc-prose"><h2 class="doc-h2">注意事项</h2><p>高级图形的控制点数量和右键结束规则因图形种类而异，请以地图提示为准。</p></section></article><aside class="doc-page-layout__aside"><PageAnchor title="高级几何绘制" :items="anchors" /></aside></div>
</template>
