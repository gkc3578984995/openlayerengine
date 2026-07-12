<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import LayerCommonDemo from '../examples/LayerCommonDemo.vue';
import layerCommonSource from '../examples/LayerCommonDemo.vue?raw';
import { getBaseMethodRows } from '../docs/pointLayerApi';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'example-common', label: '代码演示', children: [{ id: 'example-common-operations', label: '查询、显示控制与生命周期' }] },
  { id: 'api', label: 'API', children: [{ id: 'api-methods', label: '方法' }] },
  { id: 'tips', label: '注意事项' }
];

const methodCols = [
  { prop: 'name', label: '方法名', width: 220, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 320 },
  { prop: 'params', label: '参数', width: 220, monospace: true },
  { prop: 'returns', label: '返回值', width: 180, monospace: true }
];

const baseMethodRows = getBaseMethodRows([
  { name: 'getUpdatedParam(feature)', desc: '读取要素的最新参数快照', params: '', returns: '' },
  { name: 'get(id?)', desc: '获取全部要素，或按 id 获取指定要素', params: '', returns: '' },
  { name: 'hide(id?)', desc: '隐藏整个图层，或隐藏指定要素', params: '', returns: '' },
  { name: 'show(id?)', desc: '显示整个图层，或恢复指定要素', params: '', returns: '' },
  { name: 'setLayerOpacity(opacity)', desc: '设置图层透明度', params: '', returns: '' },
  { name: 'setLayerIndex(index)', desc: '设置图层层级', params: '', returns: '' },
  { name: 'getLayer()', desc: '获取底层 OpenLayers VectorLayer', params: '', returns: '' },
  { name: 'destroy()', desc: '销毁图层并释放资源', params: '', returns: '' }
]);
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
        <div id="example-common-operations">
          <ExampleBlock
            title="查询、显示控制与生命周期"
            :description="`使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>get</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>getUpdatedParam</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>getLayer</a></code> 读取状态；通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>hide</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>show</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>setLayerOpacity</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>setLayerIndex</a></code> 控制显示；最后使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>destroy</a></code> 销毁并重新创建图层。`"
            :source="layerCommonSource"
          >
            <template #preview>
              <LayerCommonDemo />
            </template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="baseMethodRows" />
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li><code>hide</code> 与 <code>show</code> 不传 id 时作用于整个图层；传入 id 时只影响对应要素。</li>
          <li><code>setLayerOpacity</code> 的范围为 0 到 100；<code>setLayerIndex</code> 会影响图层叠放顺序。</li>
          <li><code>destroy</code> 销毁后不可恢复，后续需要使用时应重新创建图层实例。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="图层通用操作" :items="anchors" />
    </aside>
  </div>
</template>
