<script setup lang="ts">
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import ContextMenuNestedMenuDemo from '../examples/ContextMenuNestedMenuDemo.vue';
import nestedSource from '../examples/ContextMenuNestedMenuDemo.vue?raw';
import ContextMenuMutexMenuDemo from '../examples/ContextMenuMutexMenuDemo.vue';
import mutexSource from '../examples/ContextMenuMutexMenuDemo.vue?raw';
const anchors = [
  { id: 'overview', label: '概览' },
  { id: 'configuration', label: '菜单层级与互斥规则' },
  {
    id: 'examples',
    label: '代码演示',
    children: [
      { id: 'example-nested-menu', label: '多级子菜单' },
      { id: 'example-mutex-menu', label: '互斥菜单项' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];
</script>
<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">ContextMenu 右键菜单</span>
        <h1>级联菜单</h1>
        <p>使用嵌套菜单组织操作，并以互斥项表达同一状态的相反动作。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概览</h2>
        <p>
          菜单结构由 <code><a href="/components/context-menu#api-type-icontextmenuitem">IContextMenuItem</a></code> 定义；只有叶子项可被点击。
        </p>
      </section>
      <section id="configuration" class="doc-prose">
        <h2 class="doc-h2">菜单层级与互斥规则</h2>
        <p>
          <code><a href="/components/context-menu#api-type-icontextmenuitem">child</a></code> 创建多级子菜单。叶子项可用
          <code><a href="/components/context-menu#api-type-icontextmenuitem">mutexKey</a></code> 指向同一菜单树中存在的 key；点击后当前项隐藏，互斥项显示。含
          child 的父项不能配置 disabled 或 mutexKey。
        </p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-nested-menu">
          <ExampleBlock title="多级子菜单" :description="'右键菜单中的工具项包含两个可执行子菜单。'" :source="nestedSource"
            ><template #preview><ContextMenuNestedMenuDemo /></template
          ></ExampleBlock>
        </div>
        <div id="example-mutex-menu">
          <ExampleBlock title="互斥菜单项" :description="'点击显示或隐藏后，互斥菜单项会交替出现。'" :source="mutexSource"
            ><template #preview><ContextMenuMutexMenuDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <p>互斥 key 必须真实存在且菜单树内所有 key 必须唯一。</p>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="级联菜单" :items="anchors" /></aside>
  </div>
</template>
