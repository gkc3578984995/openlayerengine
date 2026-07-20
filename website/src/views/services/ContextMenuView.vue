<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import ContextMenuDemo from '../../examples/services/ContextMenuDemo.vue';
import contextMenuSource from '../../examples/services/ContextMenuDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const contextMenuSnippet = extractExampleSnippet(contextMenuSource, 'context-menu-register');
const contextMenuDemoRef = ref<InstanceType<typeof ContextMenuDemo> | null>(null);
const resetContextMenuDemo = () => contextMenuDemoRef.value?.reset();
const focusContextMenuDemo = () => contextMenuDemoRef.value?.focusSelected();

const anchors = [
  { id: 'overview', label: '目标与菜单树' },
  { id: 'example-context-menu-lifecycle', label: '三层优先级、状态与清理' },
  { id: 'lifecycle', label: '三种生命周期动作' },
  { id: 'method-reference', label: '服务方法' },
  { id: 'api', label: '完整 API' }
];

const targetRows = [
  { target: "'map'", scope: 'map', state: '支持', desc: '兜底级：地图空白或没有更具体注册时命中' },
  { target: '{ module: string }', scope: 'module', state: '按 Element 保存', desc: '中间级：命中同名 module 且没有精确 Element 注册时命中' },
  { target: 'Element', scope: 'element', state: '支持', desc: '最高级：精确命中当前 Earth 中仍有效的 Element 句柄' }
];

const targetColumns = [
  { prop: 'target', label: '注册目标', width: 220, linkTypes: true },
  { prop: 'scope', label: '回调 scope', width: 120 },
  { prop: 'state', label: '项目状态', width: 160 },
  { prop: 'desc', label: '行为', width: 360 }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 210, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 360, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 220, linkTypes: true },
  { prop: 'desc', label: '说明', width: 380 }
];

const methodRows = [
  {
    anchor: 'api-method-register',
    href: '/api/types#api-type-context-menu-service-method-register',
    name: 'register',
    params: 'target: ContextMenuTarget, spec: ContextMenuSpec',
    returns: 'ContextMenuHandle',
    desc: '注册地图、module 或 Element 菜单；返回本次注册的独立句柄'
  },
  {
    anchor: 'api-method-get-item-state',
    href: '/api/types#api-type-context-menu-service-method-get-item-state',
    name: 'getItemState',
    params: 'target: ContextMenuStateTarget, key: string',
    returns: 'ContextMenuItemState | undefined',
    desc: '读取 map 或 Element 保存的可见、禁用状态快照'
  },
  {
    anchor: 'api-method-set-item-state',
    href: '/api/types#api-type-context-menu-service-method-set-item-state',
    name: 'setItemState',
    params: 'target: ContextMenuStateTarget, key: string, patch: Partial<ContextMenuItemState>',
    returns: 'void',
    desc: '部分更新项目的 visible 与 disabled'
  },
  {
    anchor: 'api-method-toggle-item',
    href: '/api/types#api-type-context-menu-service-method-toggle-item',
    name: 'toggleItem',
    params: 'target: ContextMenuStateTarget, key: string',
    returns: 'ContextMenuItemState',
    desc: '切换项目显隐，并按 mutexKey 更新互斥项目'
  },
  {
    anchor: 'api-method-set-theme',
    href: '/api/types#api-type-context-menu-service-method-set-theme',
    name: 'setTheme',
    params: "theme: 'light' | 'dark'",
    returns: 'void',
    desc: '显式设置当前 Earth 的菜单主题'
  },
  {
    anchor: 'api-method-toggle-theme',
    href: '/api/types#api-type-context-menu-service-method-toggle-theme',
    name: 'toggleTheme',
    params: '—',
    returns: "'light' | 'dark'",
    desc: '在明暗菜单主题间切换并返回新主题'
  },
  {
    anchor: 'api-method-clear-element-state',
    href: '/api/types#api-type-context-menu-service-method-clear-element-state',
    name: 'clearElementState',
    params: 'elementId: string',
    returns: 'void',
    desc: '清除指定 Element 保存的项目状态；不注销菜单'
  },
  {
    anchor: 'api-method-close',
    href: '/api/types#api-type-context-menu-service-method-close',
    name: 'close',
    params: '—',
    returns: 'void',
    desc: '只关闭当前可见菜单；注册、主题和项目状态均保留'
  },
  {
    anchor: 'api-method-handle-destroy',
    href: '/api/types#api-type-context-menu-handle-method-destroy',
    name: 'ContextMenuHandle.destroy',
    params: '—',
    returns: 'void',
    desc: '幂等注销一次 register()；不影响其他注册'
  }
];

const relatedTypes = [
  'ContextMenuService',
  'ContextMenuHandle',
  'ContextMenuTarget',
  'ContextMenuStateTarget',
  'ContextMenuSpec',
  'ContextMenuItemSpec',
  'ContextMenuItemContext',
  'ContextMenuItemState'
] as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图服务</span>
        <h1>右键菜单（ContextMenu）</h1>
        <p>通过 earth.contextMenu 为地图、业务模块或 Element 注册菜单树，并用独立句柄、项目状态和菜单视图三套 API 管理各自生命周期。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">目标与菜单树</h2>
        <p>
          <ApiReference kind="method" to="#api-method-register">register</ApiReference> 接受
          <ApiReference kind="type" to="/api/types#api-type-context-menu-target">ContextMenuTarget</ApiReference>。右键命中 Element
          时只选择一项注册，固定优先级为 <strong>Element → module → map</strong>，不会把三套项目合并；同一注册内的 <code>children</code> 构成级联菜单。
        </p>
        <ApiTable :columns="targetColumns" :rows="targetRows" />
        <el-alert class="doc-prose__alert" type="info" :closable="false" show-icon title="before 是显示前守卫">
          <code>before(context)</code> 只有严格返回 <code>true</code> 时项目才可用；其他返回值或异常会保留项目但将其禁用。<code>onSelect</code>
          只会收到可用项目，载荷包含坐标、像素以及可选的 Element、module 和 Layer。
        </el-alert>
      </section>

      <section id="example-context-menu-lifecycle" class="doc-prose">
        <ExampleBlock
          title="三层优先级、状态与清理"
          :source="contextMenuSource"
          :snippet="contextMenuSnippet"
          source-lang="vue"
          snippet-lang="typescript"
          show-reset
          show-focus
          @reset="resetContextMenuDemo"
          @focus="focusContextMenuDemo"
        >
          <template #description>
            <p>
              示例在三个可区分位置注册 map、module 和 Element 菜单，菜单动作会直接放置或改变地图标记；同时运行
              <ApiReference kind="method" to="#api-method-get-item-state">getItemState</ApiReference>、
              <ApiReference kind="method" to="#api-method-set-item-state">setItemState</ApiReference>、主题与互斥操作，并明确区分
              <ApiReference kind="method" to="#api-method-handle-destroy">handle.destroy</ApiReference> 和
              <ApiReference kind="method" to="#api-method-close">service.close</ApiReference>。
            </p>
          </template>
          <template #preview><ContextMenuDemo ref="contextMenuDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="lifecycle" class="doc-prose">
        <h2 class="doc-h2">三种生命周期动作不要混用</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><strong>handle.destroy()</strong>
              <p>注销一次 register() 返回的注册。其他目标与其他 handle 保持不变。</p></el-card
            >
          </el-col>
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><strong>service.close()</strong>
              <p>只关闭屏幕上正在显示的菜单，不删除注册，也不重置状态。</p></el-card
            >
          </el-col>
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><strong>项目 state</strong>
              <p>visible、disabled 与 mutexKey 是展示状态；Element 删除时其保存状态会同步清理。</p></el-card
            >
          </el-col>
        </el-row>
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="浏览器原生菜单由当前 Earth 的 viewport 管理">
          引擎只在对应地图视口内阻止浏览器原生 contextmenu，不在 document 级屏蔽。earth.destroy() 会移除监听并清理全部注册。
        </el-alert>
      </section>

      <section id="method-reference" class="doc-prose">
        <h2 class="doc-h2">服务方法</h2>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        :type-names="relatedTypes"
        title="ContextMenu 完整 API"
        description="这里直接列出 ContextMenu 的全部根导出类型、配置字段、回调载荷、句柄和服务方法。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="右键菜单（ContextMenu）" :items="anchors" /></aside>
  </div>
</template>
