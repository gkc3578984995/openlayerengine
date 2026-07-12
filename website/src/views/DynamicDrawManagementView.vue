<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import DynamicDrawManagementDemo from '../examples/DynamicDrawManagementDemo.vue';
import managementSource from '../examples/DynamicDrawManagementDemo.vue?raw';

const anchors = [{ id: 'overview', label: '概述' }, { id: 'examples', label: '代码演示', children: [{ id: 'example-query-remove-cleanup', label: '查询、删除与清理' }] }, { id: 'api', label: 'API', children: [{ id: 'api-methods', label: '方法' }] }, { id: 'tips', label: '注意事项' }];
const methodCols = [{ prop: 'name', label: '方法名', width: 230, presentation: 'method' as const }, { prop: 'desc', label: '说明', width: 340 }, { prop: 'params', label: '参数', width: 300, monospace: true }, { prop: 'returns', label: '返回值', width: 180, monospace: true }];
const methods = [{ name: 'get', desc: '获取全部绘制成果，或按基础几何类型筛选', params: "type?: 'Point' | 'LineString' | 'Polygon'", returns: 'Feature&lt;Geometry&gt;[]?' }, { name: 'remove', desc: '删除指定成果；无参数时清理当前临时绘制', params: 'feature?: Feature&lt;Geometry&gt;', returns: 'void' }, { name: 'destroy', desc: '清理交互、覆盖物、临时图层和内部监听，可选清理成果或图层', params: 'options?: { removeGraphics?: boolean; removeLayers?: boolean }', returns: 'void' }];
</script>

<template>
  <div class="doc-page-layout"><article class="doc-page"><header class="doc-hero"><span class="doc-hero__eyebrow">地图交互</span><h1>图形管理</h1><p>读取、删除绘制成果，并在页面离开时释放绘制工具资源。</p></header><section id="overview" class="doc-prose"><h2 class="doc-h2">概述</h2><p>使用 <code class="code-fn"><a href="#api-methods">get</a></code> 读取成果，使用 <code class="code-fn"><a href="#api-methods">remove</a></code> 定向删除。组件卸载时应调用 <code class="code-fn"><a href="#api-methods">destroy</a></code>，再销毁 Earth。</p></section><section id="examples" class="doc-prose"><h2 class="doc-h2">代码演示</h2><div id="example-query-remove-cleanup"><ExampleBlock title="查询、删除与清理" :description="'绘制点后调用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>get</a></code> 查询数量、调用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>remove</a></code> 删除当前成果；卸载时执行 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>destroy</a></code>。'" :source="managementSource"><template #preview><DynamicDrawManagementDemo /></template></ExampleBlock></div></section><section id="api" class="doc-prose"><h2 class="doc-h2">API</h2><h3 id="api-methods" class="doc-h3">方法</h3><ApiTable :columns="methodCols" :rows="methods" /></section><section id="tips" class="doc-prose"><h2 class="doc-h2">注意事项</h2><p>无参数的 <code class="code-fn"><a href="#api-methods">remove</a></code> 不会删除已保存成果；如需删除成果请传入目标要素，或在销毁时使用 <code>removeGraphics</code>。</p></section></article><aside class="doc-page-layout__aside"><PageAnchor title="图形管理" :items="anchors" /></aside></div>
</template>
