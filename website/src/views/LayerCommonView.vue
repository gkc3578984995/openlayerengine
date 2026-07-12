<script setup lang="ts">
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import LayerCommonDemo from '../examples/LayerCommonDemo.vue';
import layerCommonSource from '../examples/LayerCommonDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'example-common', label: '代码演示' },
  { id: 'coverage', label: '方法覆盖' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">基础图层</span>
        <h1>图层通用操作</h1>
        <p>集中演示所有基础图层均可使用的查询、显示控制、层级调整与生命周期方法。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>这些方法由 <code>Base</code> 提供，PointLayer、线图层和面图层均可复用。示例使用 PointLayer 作为运行载体，调用方式对其他基础图层一致。</p>
      </section>

      <section id="example-common" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <ExampleBlock
          title="查询、显示控制与生命周期"
          :description="`使用 <code>get</code>、<code>getUpdatedParam</code>、<code>getLayer</code> 读取状态；通过 <code>hide</code>、<code>show</code>、<code>setLayerOpacity</code>、<code>setLayerIndex</code> 控制显示；最后使用 <code>destroy</code> 销毁并重新创建图层。`"
          :source="layerCommonSource"
        >
          <template #preview>
            <LayerCommonDemo />
          </template>
        </ExampleBlock>
      </section>

      <section id="coverage" class="doc-prose">
        <h2 class="doc-h2">方法覆盖</h2>
        <ul class="doc-list">
          <li>查询：<code>get</code>、<code>getUpdatedParam</code>、<code>getLayer</code></li>
          <li>显示与层级：<code>hide</code>、<code>show</code>、<code>setLayerOpacity</code>、<code>setLayerIndex</code></li>
          <li>生命周期：<code>destroy</code>。销毁后不能恢复原图层，应创建新的图层实例。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="图层通用操作" :items="anchors" />
    </aside>
  </div>
</template>
