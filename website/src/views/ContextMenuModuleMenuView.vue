<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import ContextMenuModuleMenuDemo from '../examples/ContextMenuModuleMenuDemo.vue';
import moduleSource from '../examples/ContextMenuModuleMenuDemo.vue?raw';
import ContextMenuModuleMenuGuardDemo from '../examples/ContextMenuModuleMenuGuardDemo.vue';
import guardSource from '../examples/ContextMenuModuleMenuGuardDemo.vue?raw';
import ContextMenuModuleMenuCallbackDemo from '../examples/ContextMenuModuleMenuCallbackDemo.vue';
import callbackSource from '../examples/ContextMenuModuleMenuCallbackDemo.vue?raw';
const anchors = [
  { id: 'overview', label: '概览' },
  {
    id: 'examples',
    label: '代码演示',
    children: [
      { id: 'example-add-module-menu', label: '添加模块菜单' },
      { id: 'example-module-menu-guard', label: '模块菜单守卫' },
      { id: 'example-module-menu-callback', label: '模块菜单点击回调' }
    ]
  },
  { id: 'api', label: 'API', children: [{ id: 'api-methods', label: '模块菜单注册' }] },
  { id: 'tips', label: '注意事项' }
];
const columns = [
  { prop: 'name', label: '方法名', width: 240, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 280 },
  { prop: 'params', label: '参数', width: 340, monospace: true },
  { prop: 'returns', label: '返回值', width: 120, monospace: true }
];
const rows = [
  {
    name: 'addModuleMenu',
    desc: '注册或替换指定模块菜单。',
    params: 'module: string, items: IContextMenuItem[], callback?: ContextMenuCallback, before?: ContextMenuBefore',
    returns: 'boolean'
  }
];
</script>
<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">ContextMenu 右键菜单</span>
        <h1>模块菜单</h1>
        <p>仅在命中相同 module 的要素时显示的上下文菜单。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概览</h2>
        <p>模块回调提供 <code>featureId</code>、要素参数和图层；它们可用于按对象执行操作。</p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-add-module-menu">
          <ExampleBlock title="添加模块菜单" :description="'右键蓝色要素以命中模块菜单。'" :source="moduleSource"
            ><template #preview><ContextMenuModuleMenuDemo /></template
          ></ExampleBlock>
        </div>
        <div id="example-module-menu-guard">
          <ExampleBlock title="模块菜单守卫" :description="'before 返回 false 或抛出异常时，对应叶子菜单项禁用。'" :source="guardSource"
            ><template #preview><ContextMenuModuleMenuGuardDemo /></template
          ></ExampleBlock>
        </div>
        <div id="example-module-menu-callback">
          <ExampleBlock title="模块菜单点击回调" :description="'点击回调读取命中要素的 featureId。'" :source="callbackSource"
            ><template #preview><ContextMenuModuleMenuCallbackDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-methods" class="doc-h3">模块菜单注册</h3>
        <ApiTable :columns="columns" :rows="rows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <p>守卫只适用于模块菜单的叶子项。</p>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="模块菜单" :items="anchors" /></aside>
  </div>
</template>
