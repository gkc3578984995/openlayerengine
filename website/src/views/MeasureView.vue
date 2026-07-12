<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'lifecycle', label: '会话与清理' },
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-constructor', label: '构造器' },
      {
        id: 'api-types',
        label: '类型定义',
        children: [
          { id: 'api-type-imeasure', label: 'IMeasure' },
          { id: 'api-type-imeasuredata', label: 'IMeasureData' },
          { id: 'api-type-imeasureevent', label: 'IMeasureEvent' }
        ]
      },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];

const propertyCols = [
  { prop: 'name', label: '属性名', width: 190, presentation: 'property' as const },
  { prop: 'desc', label: '说明', width: 330 },
  { prop: 'type', label: '类型', width: 290, monospace: true }
];
const methodCols = [
  { prop: 'name', label: '方法名', width: 230, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 390 },
  { prop: 'params', label: '参数', width: 250, monospace: true },
  { prop: 'returns', label: '返回值', width: 120, monospace: true }
];
const measureRows = [
  { name: 'lineColor', desc: '测量线颜色。', type: 'string?' },
  { name: 'lineWidth', desc: '测量线宽度（像素）。', type: 'number?' },
  { name: 'pointShow', desc: '是否显示完成测量的顶点标记。', type: 'boolean?' },
  { name: 'pointColor', desc: '顶点标记颜色。', type: 'string?' },
  { name: 'pointSzie', desc: '顶点标记大小（像素）；拼写与现有公开 API 保持一致。', type: 'number?' },
  { name: 'textColor', desc: '距离和面积标签文字颜色。', type: 'string?' },
  { name: 'textSize', desc: '当前版本尚未用于标签渲染。', type: 'number?' },
  { name: 'textBackgroundColor', desc: '距离和面积标签背景色。', type: 'string?' },
  { name: 'isShowTotalDistance', desc: '当前版本尚未参与标签显示。', type: 'boolean?' },
  { name: 'callback', desc: '接收本次测量会话的数据。', type: '(event: <a href="#api-type-imeasureevent">IMeasureEvent</a>) =&gt; void' }
];
const measureDataRows = [
  { name: 'startP', desc: '分段起点经纬度坐标。', type: 'Coordinate' },
  { name: 'endP', desc: '分段终点经纬度坐标。', type: 'Coordinate' },
  { name: 'distance', desc: '分段距离（km）。', type: 'number' }
];
const measureEventRows = [
  { name: 'data', desc: '线测量为分段数据；面积测量为顶点经纬度坐标。', type: '<a href="#api-type-imeasuredata">IMeasureData</a>[] | Coordinate[]' },
  { name: 'totalDistance', desc: '线测量总距离（km）。', type: 'number?' },
  { name: 'area', desc: '面积测量结果（km²）。', type: 'number?' }
];
const methods = [['clear', '取消当前测量会话，并移除测量图形、顶点标记和缓存数据。', '—', 'void']] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">Measure 测量工具</span>
        <h1>概览</h1>
        <p>在地图上量距离和面积，并通过回调获取完成的测量数据。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          推荐通过 <a href="/guide/global-methods#api-methods"><code class="code-fn">earth.useMeasure()</code></a> 获取由 Earth 缓存的实例。距离测量请进入
          <a href="/components/measure/distance#api-methods"><code class="code-fn">量距离</code></a
          >，面积测量请进入 <a href="/components/measure/area#api-methods"><code class="code-fn">量面积</code></a
          >。
        </p>
      </section>
      <section id="lifecycle" class="doc-prose">
        <h2 class="doc-h2">会话与清理</h2>
        <p>
          右键会结束当前测量会话。调用 <code class="code-fn"><a href="#api-methods">clear</a></code> 可中途取消并清空已有结果；销毁 Earth
          时会自动执行同样的清理。
        </p>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <div id="api-constructor" class="api-constructor">
          <span class="api-constructor__label">构造器</span>
          <code class="api-constructor__signature">new Measure(earth)</code>
          <p><code>earth: Earth</code> — 地图实例。通常优先使用 <code>earth.useMeasure()</code>。</p>
        </div>
        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-type-imeasure" class="doc-h4">IMeasure</h4>
        <ApiTable :columns="propertyCols" :rows="measureRows" />
        <h4 id="api-type-imeasuredata" class="doc-h4">IMeasureData</h4>
        <ApiTable :columns="propertyCols" :rows="measureDataRows" />
        <h4 id="api-type-imeasureevent" class="doc-h4">IMeasureEvent</h4>
        <ApiTable :columns="propertyCols" :rows="measureEventRows" />
        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>绘制输入使用地图投影坐标；回调中的坐标为经纬度坐标。</li>
          <li>
            组件卸载时可直接销毁 Earth；若实例需要继续复用，请先调用 <code class="code-fn"><a href="#api-methods">clear</a></code
            >。
          </li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="概览" :items="anchors" /></aside>
  </div>
</template>
