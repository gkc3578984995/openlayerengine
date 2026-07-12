<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import ContextMenuLifecycleDemo from '../examples/ContextMenuLifecycleDemo.vue';
import contextMenuLifecycleSource from '../examples/ContextMenuLifecycleDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概览' },
  { id: 'lifecycle', label: '生命周期与作用域' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-minimal-lifecycle', label: '最小完整生命周期' }] },
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-constructor', label: '构造器' },
      { id: 'api-types', label: '类型定义' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];
const columns = [
  { prop: 'name', label: '属性名', width: 210, presentation: 'property' as const },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'type', label: '类型', width: 260, monospace: true }
];
const optionRows = [{ name: 'isDarkTheme', desc: '初始化时是否使用深色主题。', type: 'boolean?' }];
const itemRows = [
  { name: 'key', desc: '同一菜单树内唯一的菜单项标识。', type: 'string' },
  { name: 'label', desc: '菜单项显示文本。', type: 'string' },
  { name: 'visible', desc: '初始可见状态。', type: 'boolean?' },
  { name: 'disabled', desc: '叶子菜单项是否禁用。', type: 'boolean?' },
  { name: 'mutexKey', desc: '与当前叶子项互斥的菜单项 key。', type: 'string?' },
  { name: 'child', desc: '级联子菜单。', type: '<a href="#api-type-icontextmenuitem">IContextMenuItem</a>[]?' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">ContextMenu 右键菜单</span>
        <h1>概览与初始化</h1>
        <p>为地图空白区域和模块要素提供右键菜单，并集中管理菜单状态和生命周期。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概览</h2>
        <p>
          推荐通过 <a href="/guide/global-methods#api-methods"><code class="code-fn">earth.useContextMenu()</code></a> 获取由 Earth
          缓存和销毁的实例；模块菜单命中时优先于全局菜单。
        </p>
      </section>
      <section id="lifecycle" class="doc-prose">
        <h2 class="doc-h2">生命周期与作用域</h2>
        <p>
          默认菜单状态按 <code>menuKey</code> 保存；模块菜单状态按 <code>module → featureId → menuKey</code> 隔离。组件卸载时先调用
          <a href="/components/context-menu/cleanup#api-lifecycle"><code class="code-fn">destroy</code></a
          >，再销毁 Earth。
        </p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-minimal-lifecycle">
          <ExampleBlock
            title="最小完整生命周期"
            :description="'初始化地图后取得 <code class=&quot;code-fn&quot;><a href=&quot;/guide/global-methods#api-methods&quot;>earth.useContextMenu</a></code>；页面卸载时销毁菜单。'"
            :source="contextMenuLifecycleSource"
            ><template #preview><ContextMenuLifecycleDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <div id="api-constructor" class="api-constructor">
          <span class="api-constructor__label">构造器</span><code class="api-constructor__signature">new ContextMenu(earth, option?)</code>
          <p>
            <code>earth: Earth</code>；<code>option?: <a href="#api-type-icontextmenuoption">IContextMenuOption</a></code>
          </p>
        </div>
        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-type-icontextmenuoption" class="doc-h4">IContextMenuOption</h4>
        <ApiTable :columns="columns" :rows="optionRows" />
        <h4 id="api-type-icontextmenuitem" class="doc-h4">IContextMenuItem</h4>
        <ApiTable :columns="columns" :rows="itemRows" />
        <h4 id="api-type-icontextmenucallbackparam" class="doc-h4">IContextMenuCallbackParam</h4>
        <p>
          <code
            >{ menu: <a href="#api-type-icontextmenuitem">IContextMenuItem</a>; scope: 'default' | 'module'; position: Coordinate; pixel: number[]; module?:
            string; featureId?: string; param?: unknown; feature?: Feature&lt;Geometry&gt;; layer?: Layer }</code
          >
        </p>
        <h4 id="api-type-contextmenucallback" class="doc-h4">ContextMenuCallback</h4>
        <p>
          <code>(param: <a href="#api-type-icontextmenucallbackparam">IContextMenuCallbackParam</a>) =&gt; void</code>
        </p>
        <h4 id="api-type-contextmenubefore" class="doc-h4">ContextMenuBefore</h4>
        <p>
          <code>(param: <a href="#api-type-icontextmenucallbackparam">IContextMenuCallbackParam</a>) =&gt; boolean</code>
        </p>
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>公共类型仅在本页定义；其他页面只链接到此处。</li>
          <li>同一菜单树的 <code>key</code> 必须唯一。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="概览与初始化" :items="anchors" /></aside>
  </div>
</template>
