<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import MeasureDistanceDemo from '../examples/MeasureDistanceDemo.vue';
import measureDistanceSource from '../examples/MeasureDistanceDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'modes', label: '三种量法' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-distance-modes', label: '切换距离测量方式' }] },
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
  ['lineSegmentation', '逐段显示距离；右键结束当前线。', 'param: <a href="/components/measure#api-type-imeasure">IMeasure</a>', 'void'],
  ['lineFirst', '显示从起点到当前终点的累计距离；右键结束当前线。', 'param: <a href="/components/measure#api-type-imeasure">IMeasure</a>', 'void'],
  [
    'lineCenter',
    '先确定中心点，后续左键松开会生成中心到目标点的距离；右键结束会话并回调汇总数据。',
    'param: <a href="/components/measure#api-type-imeasure">IMeasure</a>',
    'void'
  ]
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">Measure 测量工具</span>
        <h1>量距离</h1>
        <p>根据现场任务选择逐段、起点累计或中心辐射式的距离测量方式。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          三个方法都接受 <code><a href="/components/measure#api-type-imeasure">IMeasure</a></code> 配置；完成后通过
          <code><a href="/components/measure#api-type-imeasureevent">IMeasureEvent</a></code> 获取结果。
        </p>
      </section>
      <section id="modes" class="doc-prose">
        <h2 class="doc-h2">三种量法</h2>
        <ul class="doc-list">
          <li>逐段距离：适合查看折线路径中每一段的长度。</li>
          <li>起点累计：适合查看整条路径从起点到终点的总长度。</li>
          <li>中心距离：适合以固定中心点连续查看多个目标点的距离。</li>
        </ul>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-distance-modes">
          <ExampleBlock
            title="切换距离测量方式"
            :description="'分别启动 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>lineSegmentation</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>lineFirst</a></code> 或 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>lineCenter</a></code>，按页面提示完成绘制。'"
            :source="measureDistanceSource"
            ><template #preview><MeasureDistanceDemo /></template
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
          启动另一种量法会结束此前正在进行的测量会话。需要删除所有已完成结果时，请前往
          <a href="/components/measure/remove#example-remove-measurement"><code class="code-fn">移除测量</code></a
          >。
        </p>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="量距离" :items="anchors" /></aside>
  </div>
</template>
