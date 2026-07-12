<script setup lang="ts">
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import MeasureRemoveDemo from '../examples/MeasureRemoveDemo.vue';
import measureRemoveSource from '../examples/MeasureRemoveDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-remove-measurement', label: '移除测量' }] },
  { id: 'tips', label: '注意事项' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">Measure 测量工具</span>
        <h1>移除测量</h1>
        <p>清空当前测量会话及其已显示的距离、面积和顶点标记。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          调用 <a href="/components/measure#api-methods"><code class="code-fn">clear</code></a> 会取消当前交互、移除测量图形与顶点标记，并重置缓存的测量数据。
        </p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-remove-measurement">
          <ExampleBlock
            title="移除测量"
            :description="'先开始一段距离测量，再调用 <code class=&quot;code-fn&quot;><a href=&quot;/components/measure#api-methods&quot;>clear</a></code> 移除当前交互和所有测量结果。'"
            :source="measureRemoveSource"
            ><template #preview><MeasureRemoveDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <p>
          <code class="code-fn"><a href="/components/measure#api-methods">clear</a></code> 不会销毁 Earth；销毁 Earth 时会自动执行测量清理。
        </p>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="移除测量" :items="anchors" /></aside>
  </div>
</template>
