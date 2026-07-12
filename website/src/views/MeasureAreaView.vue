<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import MeasureAreaDemo from '../examples/MeasureAreaDemo.vue';
import measureAreaSource from '../examples/MeasureAreaDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-polygon-area', label: '绘制区域并查看面积' }] },
  { id: 'api', label: 'API', children: [{ id: 'api-methods', label: '方法' }] },
  { id: 'tips', label: '注意事项' }
];
const methodCols = [
  { prop: 'name', label: '方法名', width: 230, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 390 },
  { prop: 'params', label: '参数', width: 270, monospace: true },
  { prop: 'returns', label: '返回值', width: 120, monospace: true }
];
const methods = [
  ['polygonMeasure', '绘制一个区域并计算面积；右键结束当前区域。', 'param: <a href="/components/measure#api-type-imeasure">IMeasure</a>', 'void']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">Measure 测量工具</span>
        <h1>量面积</h1>
        <p>在地图上圈定区域，查看面积并在回调中取得边界坐标。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          <code class="code-fn"><a href="#api-methods">polygonMeasure</a></code> 接受
          <code><a href="/components/measure#api-type-imeasure">IMeasure</a></code> 配置；回调的
          <code><a href="/components/measure#api-type-imeasureevent">IMeasureEvent</a></code> 包含面积与边界坐标。
        </p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-polygon-area">
          <ExampleBlock
            title="绘制区域并查看面积"
            :description="'调用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>polygonMeasure</a></code> 后依次单击区域顶点，右键结束并查看面积回调。'"
            :source="measureAreaSource"
            ><template #preview><MeasureAreaDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <p>
          顶点标记由 <code><a href="/components/measure#api-type-imeasure">pointShow</a></code> 控制；需要清空区域和顶点时，请前往
          <a href="/components/measure/remove#example-remove-measurement"><code class="code-fn">移除测量</code></a
          >。
        </p>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="量面积" :items="anchors" /></aside>
  </div>
</template>
