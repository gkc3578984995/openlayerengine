<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import GlobalEventListenerControlDemo from '../examples/GlobalEventListenerControlDemo.vue';
import listenerControlSource from '../examples/GlobalEventListenerControlDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-listener-control', label: '监听启停与重新注册' }] },
  { id: 'api-methods', label: '方法' },
  { id: 'tips', label: '注意事项' }
];
const methodCols = [
  { prop: 'name', label: '方法名', width: 310, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 420 },
  { prop: 'params', label: '参数', width: 100, monospace: true },
  { prop: 'returns', label: '返回值', width: 110, monospace: true }
];
const methods = [
  ['enableModuleMouseMoveEvent', '启用模块鼠标移动监听', '—', 'void'],
  ['enableModuleMouseClickEvent', '启用模块点击监听', '—', 'void'],
  ['enableModuleMouseLeftDownEvent', '启用模块左键按下监听', '—', 'void'],
  ['enableModuleMouseLeftUpEvent', '启用模块左键抬起监听', '—', 'void'],
  ['enableModuleMouseDblClickEvent', '启用模块双击监听', '—', 'void'],
  ['enableModuleMouseRightClickEvent', '启用模块右键监听', '—', 'void'],
  ['enableGlobalMouseMoveEvent', '启用全局鼠标移动监听', '—', 'void'],
  ['enableGlobalMouseClickEvent', '启用全局点击监听', '—', 'void'],
  ['enableGlobalMouseLeftDownEvent', '启用全局左键按下监听', '—', 'void'],
  ['enableGlobalMouseLeftUpEvent', '启用全局左键抬起监听', '—', 'void'],
  ['enableGlobalMouseDblClickEvent', '启用全局双击监听', '—', 'void'],
  ['enableGlobalMouseRightClickEvent', '启用全局右键监听', '—', 'void'],
  ['disableModuleMouseMoveEvent', '停用模块鼠标移动监听并清空回调', '—', 'void'],
  ['disableModuleMouseClickEvent', '停用模块点击监听并清空回调', '—', 'void'],
  ['disableModuleMouseLeftDownEvent', '停用模块左键按下监听并清空回调', '—', 'void'],
  ['disableModuleMouseLeftUpEvent', '停用模块左键抬起监听并清空回调', '—', 'void'],
  ['disableModuleMouseDblClickEvent', '停用模块双击监听并清空回调', '—', 'void'],
  ['disableModuleMouseRightClickEvent', '停用模块右键监听并清空回调', '—', 'void'],
  ['disableGlobalMouseMoveEvent', '停用全局鼠标移动监听并清空回调', '—', 'void'],
  ['disableGlobalMouseClickEvent', '停用全局点击监听并清空回调', '—', 'void'],
  ['disableGlobalMouseLeftDownEvent', '停用全局左键按下监听并清空回调', '—', 'void'],
  ['disableGlobalMouseLeftUpEvent', '停用全局左键抬起监听并清空回调', '—', 'void'],
  ['disableGlobalMouseDblClickEvent', '停用全局双击监听并清空回调', '—', 'void'],
  ['disableGlobalMouseRightClickEvent', '停用全局右键监听并清空回调', '—', 'void']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">GlobalEvent</span>
        <h1>监听控制</h1>
        <p>显式启用或停用模块与全局鼠标底层监听。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>注册回调的方法会按需启用监听；这些方法适合需要显式控制底层监听生命周期的场景。</p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-listener-control">
          <ExampleBlock
            title="监听启停与重新注册"
            :description="`对比 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>enableGlobalMouseClickEvent</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>disableGlobalMouseClickEvent</a></code> 与 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addMouseClickEventByGlobal</a></code>，并用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>hasGlobalMouseClickEvent</a></code> 展示状态。`"
            :source="listenerControlSource"
            ><template #preview><GlobalEventListenerControlDemo /></template
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
          <li>停用监听会清空对应事件类别已登记的回调。</li>
          <li>常规使用优先依赖注册方法的自动启用和注销函数。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="监听控制" :items="anchors" /></aside>
  </div>
</template>
