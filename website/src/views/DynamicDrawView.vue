<script setup lang="ts">
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import DynamicDrawLifecycleDemo from '../examples/DynamicDrawLifecycleDemo.vue';
import lifecycleSource from '../examples/DynamicDrawLifecycleDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-lifecycle', label: '最小接入与清理' }] },
  { id: 'api', label: 'API', children: [{ id: 'api-constructor', label: '构造器' }] },
  { id: 'tips', label: '注意事项' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero"><span class="doc-hero__eyebrow">地图交互</span><h1>概览与接入</h1><p>在地图上采集基础几何和高级几何，并在需要时编辑、查询或清理绘制成果。</p></header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>推荐通过 <a href="/guide/global-methods#api-methods"><code class="code-fn">earth.useDrawTool()</code></a> 获取由 Earth 缓存的工具实例。公开构造器适合需要明确绑定指定 Earth 实例的场景。</p>
      </section>
      <section id="examples" class="doc-prose"><h2 class="doc-h2">代码演示</h2><div id="example-lifecycle"><ExampleBlock title="最小接入与清理" :description="'通过 <code class=&quot;code-fn&quot;><a href=&quot;/guide/global-methods#api-methods&quot;>earth.useDrawTool</a></code> 启动绘制；组件卸载时调用 <code class=&quot;code-fn&quot;><a href=&quot;/components/dynamic-draw/management#api-methods&quot;>destroy</a></code> 清理。'" :source="lifecycleSource"><template #preview><DynamicDrawLifecycleDemo /></template></ExampleBlock></div></section>
      <section id="api" class="doc-prose"><h2 class="doc-h2">API</h2><div id="api-constructor" class="api-constructor"><span class="api-constructor__label">构造器</span><code class="api-constructor__signature">new DynamicDraw(earth)</code><p><code>earth: Earth</code> — 绑定的地图实例。</p></div></section>
      <section id="tips" class="doc-prose"><h2 class="doc-h2">注意事项</h2><ul class="doc-list"><li>一个实例同一时间只应运行一个绘制或编辑会话。</li><li>按场景进入基础绘制、高级绘制、几何编辑或图形管理页面查看规范 API。</li></ul></section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="概览与接入" :items="anchors" /></aside>
  </div>
</template>
