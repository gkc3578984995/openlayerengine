<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import GlobalEventKeyboardDemo from '../examples/GlobalEventKeyboardDemo.vue';
import keyboardEventSource from '../examples/GlobalEventKeyboardDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-keyboard-events', label: '键盘注册与取消' }] },
  { id: 'api-methods', label: '方法' },
  { id: 'tips', label: '注意事项' }
];
const methodCols = [
  { prop: 'name', label: '方法名', width: 300, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'params', label: '参数', width: 250, monospace: true },
  { prop: 'returns', label: '返回值', width: 140, monospace: true }
];
const methods = [
  ['addKeyDownEventByGlobal', '注册全局键盘按下回调', 'callback: (event: KeyboardEvent) =&gt; void', '() =&gt; void'],
  ['enableGlobalKeyDownEvent', '启用全局键盘监听', '—', 'void'],
  ['disableGlobalKeyDownEvent', '停用全局键盘监听并清空回调', '—', 'void'],
  ['hasGlobalKeyDownEvent', '检查是否存在全局键盘回调', '—', 'boolean']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">GlobalEvent 全局事件</span>
        <h1>键盘事件</h1>
        <p>管理 document 范围的键盘按下监听。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>注册方法接收标准 <code>KeyboardEvent</code> 回调并返回注销函数。</p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-keyboard-events">
          <ExampleBlock
            title="键盘注册与取消"
            :description="`通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addKeyDownEventByGlobal</a></code> 注册和取消 document 键盘回调，并用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>hasGlobalKeyDownEvent</a></code> 展示当前状态。`"
            :source="keyboardEventSource"
            ><template #preview><GlobalEventKeyboardDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section class="doc-prose">
        <h2 id="api-methods" class="doc-h2">方法</h2>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>组件卸载时执行注册方法返回的注销函数。</li>
          <li>显式停用会同时清空已登记的键盘回调。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="键盘事件" :items="anchors" /></aside>
  </div>
</template>
