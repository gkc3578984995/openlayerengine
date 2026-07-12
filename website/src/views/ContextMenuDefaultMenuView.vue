<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import ContextMenuDefaultMenuDemo from '../examples/ContextMenuDefaultMenuDemo.vue';
import defaultSource from '../examples/ContextMenuDefaultMenuDemo.vue?raw';
import ContextMenuDefaultMenuCallbackDemo from '../examples/ContextMenuDefaultMenuCallbackDemo.vue';
import callbackSource from '../examples/ContextMenuDefaultMenuCallbackDemo.vue?raw';
const anchors = [
  { id: 'overview', label: '概览' },
  {
    id: 'examples',
    label: '代码演示',
    children: [
      { id: 'example-add-default-menu', label: '添加全局菜单' },
      { id: 'example-default-menu-callback', label: '全局菜单点击回调' }
    ]
  },
  { id: 'api', label: 'API', children: [{ id: 'api-methods', label: '菜单注册' }] },
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
    name: 'addDefaultMenu',
    desc: '注册或替换全局菜单。',
    params:
      'items: <a href="/components/context-menu#api-type-icontextmenuitem">IContextMenuItem</a>[], callback?: <a href="/components/context-menu#api-type-contextmenucallback">ContextMenuCallback</a>',
    returns: 'boolean'
  }
];
</script>
<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">ContextMenu 右键菜单</span>
        <h1>全局菜单</h1>
        <p>在未命中模块菜单时显示的地图默认右键菜单。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概览</h2>
        <p>
          重复调用 <code class="code-fn"><a href="#api-methods">addDefaultMenu</a></code> 会替换已有全局菜单并重置其运行时状态。
        </p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-add-default-menu">
          <ExampleBlock title="添加全局菜单" :description="'在地图空白区域右键，可添加任务点、警戒点或清空已有标记。'" :source="defaultSource"
            ><template #preview><ContextMenuDefaultMenuDemo /></template
          ></ExampleBlock>
        </div>
        <div id="example-default-menu-callback">
          <ExampleBlock title="全局菜单点击回调" :description="'选择菜单项后，可保存右键位置、移动观察中心或在该处生成坐标标牌。'" :source="callbackSource"
            ><template #preview><ContextMenuDefaultMenuCallbackDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-methods" class="doc-h3">菜单注册</h3>
        <ApiTable :columns="columns" :rows="rows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <p>模块菜单命中时优先于全局菜单。</p>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="全局菜单" :items="anchors" /></aside>
  </div>
</template>
