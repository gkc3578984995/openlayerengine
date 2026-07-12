<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import GlobalEventKeyboardDemo from '../examples/GlobalEventKeyboardDemo.vue';
import globalEventKeyboardSource from '../examples/GlobalEventKeyboardDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-keyboard-lifecycle', label: '键盘事件生命周期' }] },
  {
    id: 'api',
    label: 'API',
    children: [
      {
        id: 'api-methods',
        label: '方法',
        children: [
          { id: 'api-daily-methods', label: '日常注册与状态' },
          { id: 'api-listener-control', label: '高级：底层监听控制' }
        ]
      }
    ]
  },
  { id: 'tips', label: '注意事项' }
];
const methodCols = [
  { prop: 'name', label: '方法名', width: 300, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'params', label: '参数', width: 250, monospace: true },
  { prop: 'returns', label: '返回值', width: 140, monospace: true }
];
const callback = '<a href="/components/global-event#api-type-globalkeydowneventcallback">GlobalKeyDownEventCallback</a>';
const methods = [
  ['addKeyDownEventByGlobal', '注册全局键盘按下回调', 'callback: ' + callback, '() =&gt; void'],
  ['hasGlobalKeyDownEvent', '检查是否存在全局键盘回调', '—', 'boolean']
] as const;
const listenerMethods = [
  ['enableGlobalKeyDownEvent', '启用全局键盘底层监听', '—', 'void'],
  ['disableGlobalKeyDownEvent', '停用全局键盘监听并清空回调', '—', 'void']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
const listenerMethodRows = listenerMethods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">GlobalEvent 地图事件</span>
        <h1>全局键盘事件</h1>
        <p>管理 document 范围的键盘按下监听。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>注册方法接收标准 <code>KeyboardEvent</code> 回调并返回注销函数。</p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-keyboard-lifecycle">
          <ExampleBlock
            title="键盘事件生命周期"
            :description="'通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addKeyDownEventByGlobal</a></code> 注册 document 键盘回调，用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>hasGlobalKeyDownEvent</a></code> 展示状态，并执行返回的注销函数取消注册。'"
            :source="globalEventKeyboardSource"
            ><template #preview><GlobalEventKeyboardDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-methods" class="doc-h3">方法</h3>
        <h4 id="api-daily-methods" class="doc-h4">日常注册与状态</h4>
        <ApiTable :columns="methodCols" :rows="methodRows" />
        <h4 id="api-listener-control" class="doc-h4">高级：底层监听控制</h4>
        <p>日常注册会自动启用键盘监听。直接调用 <code>disableGlobalKeyDownEvent</code> 会停止底层监听并清空全部已注册的键盘回调。</p>
        <pre><code>events.enableGlobalKeyDownEvent();
// 这会移除全部已注册的键盘回调。
events.disableGlobalKeyDownEvent();</code></pre>
        <ApiTable :columns="methodCols" :rows="listenerMethodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>组件卸载时执行注册方法返回的注销函数。</li>
          <li>需要整体停止并重置键盘监听时，才使用高级控制方法。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="全局键盘事件" :items="anchors" /></aside>
  </div>
</template>
