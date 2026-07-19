<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import DescriptorDemo from '../../examples/services/DescriptorDemo.vue';
import descriptorSource from '../../examples/services/DescriptorDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const descriptorSnippet = extractExampleSnippet(descriptorSource, 'descriptor-create');

const anchors = [
  { id: 'overview', label: '复合对象与内容' },
  { id: 'example-descriptor-lifecycle', label: '列表、Patch、事件与关闭策略' },
  { id: 'patch-and-events', label: 'Patch 与事件' },
  { id: 'close-policy', label: '关闭策略' },
  { id: 'method-reference', label: '创建与句柄方法' },
  { id: 'api', label: '完整 API' }
];

const contentColumns = [
  { prop: 'name', label: 'type', width: 130 },
  { prop: 'content', label: 'content', width: 300, linkTypes: true },
  { prop: 'events', label: '交互', width: 300 },
  { prop: 'desc', label: '适用场景', width: 300 }
];

const contentRows = [
  { name: 'list', content: 'readonly DescriptorListItem[]', events: '点击项目产生 click 事件，包含 item 与 index', desc: '结构化键值、状态清单' },
  { name: 'custom', content: 'string | HTMLElement', events: '不产生列表项目语义', desc: '简单文本或调用方自管 DOM 内容' }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 210, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 390, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 220, linkTypes: true },
  { prop: 'desc', label: '说明', width: 410 }
];

const methodRows = [
  {
    anchor: 'api-service-create-descriptor',
    href: '/api/types#api-type-overlay-service-method-create-descriptor',
    name: 'OverlayService.createDescriptor',
    params: 'spec: DescriptorSpec<T>',
    returns: 'DescriptorHandle<T>',
    desc: '原子创建 Descriptor DOM、可选连接线与交互绑定'
  },
  {
    anchor: 'api-handle-update',
    href: '/api/types#api-type-descriptor-handle-method-update',
    name: 'update',
    params: 'patch: DescriptorPatch<T>',
    returns: 'void',
    desc: '原子更新内容、位置、标题、关闭回调、拖动、固定线和 data'
  },
  {
    anchor: 'api-handle-set-position',
    href: '/api/types#api-type-descriptor-handle-method-set-position',
    name: 'setPosition',
    params: 'position: Coordinate',
    returns: 'void',
    desc: '移动 Descriptor；固定连接线同步更新'
  },
  {
    anchor: 'api-handle-show',
    href: '/api/types#api-type-descriptor-handle-method-show',
    name: 'show',
    params: '—',
    returns: 'void',
    desc: '显示 Descriptor 与关联视觉资源'
  },
  {
    anchor: 'api-handle-hide',
    href: '/api/types#api-type-descriptor-handle-method-hide',
    name: 'hide',
    params: '—',
    returns: 'void',
    desc: '隐藏但保留句柄、内容、订阅和位置'
  },
  {
    anchor: 'api-handle-close',
    href: '/api/types#api-type-descriptor-handle-method-close',
    name: 'close',
    params: '—',
    returns: 'void',
    desc: '触发 close 事件，并按 closeAction 执行 hide 或 destroy'
  },
  {
    anchor: 'api-handle-on',
    href: '/api/types#api-type-descriptor-handle-method-on',
    name: 'on',
    params: "type: 'click' | 'close', listener: (event: DescriptorEvent<T>) => void",
    returns: '() => void',
    desc: '订阅句柄事件；返回幂等注销函数'
  },
  {
    anchor: 'api-handle-destroy',
    href: '/api/types#api-type-descriptor-handle-method-destroy',
    name: 'destroy',
    params: '—',
    returns: 'void',
    desc: '幂等销毁 DOM、连接线、拖动与事件资源'
  }
];

const relatedTypes = [
  'DescriptorHandle',
  'DescriptorSpec',
  'DescriptorPatch',
  'DescriptorContent',
  'DescriptorListItem',
  'DescriptorEvent',
  'OverlayService'
] as const;
const apiMembers = { OverlayService: ['createDescriptor'] } as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图服务</span>
        <h1>Descriptor</h1>
        <p>Descriptor 是内置结构的 Overlay 复合对象：它统一管理内容 DOM、标题与底部、拖动、关闭、点击事件，以及可选的定位点连接线 Element。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">复合对象与内容</h2>
        <p>
          通过 <ApiReference kind="method" to="#api-service-create-descriptor">earth.overlays.createDescriptor</ApiReference> 创建。创建、更新和销毁会把
          Overlay、连接线与交互绑定作为一个整体处理；不要另行操作内部 Overlay 或连接线。
        </p>
        <ApiTable :columns="contentColumns" :rows="contentRows" />
        <el-alert class="doc-prose__alert" type="info" :closable="false" show-icon title="HTMLElement 仍属于调用方业务内容">
          自定义 HTMLElement 会被挂入 Descriptor 的 Earth-owned 包装节点；销毁时从地图解绑，但引擎不会清空调用方节点内容或替你移除业务监听。
        </el-alert>
      </section>

      <section id="example-descriptor-lifecycle" class="doc-prose">
        <ExampleBlock title="列表、Patch、事件与关闭策略" :source="descriptorSource" :snippet="descriptorSnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              示例切换列表、文本和 HTMLElement 内容，实际运行 createDescriptor、update、setPosition、show、hide、close、on 与 destroy。列表点击和关闭同时展示
              spec 回调与
              <ApiReference kind="method" to="#api-handle-on">handle.on</ApiReference> 订阅路径。
            </p>
          </template>
          <template #preview><DescriptorDemo /></template>
        </ExampleBlock>
      </section>

      <section id="patch-and-events" class="doc-prose">
        <h2 class="doc-h2">Patch 与事件</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="内容与文案">content、header、footer 可以更新；header/footer 显式传 undefined 表示清除。</el-descriptions-item>
          <el-descriptions-item label="交互"
            >draggable 控制拖动；fixedLine 与 fixedLineColor 控制连接线；fixedMode 决定拖动后保持地图坐标还是屏幕像素。</el-descriptions-item
          >
          <el-descriptions-item label="回调替换">onClose、onItemClick 可由 patch 替换，显式 undefined 表示清除 spec 回调。</el-descriptions-item>
          <el-descriptions-item label="句柄订阅">on('click' | 'close') 返回独立 disposer；更新 spec 回调不会注销 handle.on 订阅。</el-descriptions-item>
          <el-descriptions-item label="数据">data 在 DescriptorEvent 中以只读值提供；显式 undefined 可清除。</el-descriptions-item>
        </el-descriptions>
      </section>

      <section id="close-policy" class="doc-prose">
        <h2 class="doc-h2">关闭策略</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-card shadow="never"
              ><template #header><strong>closeAction: 'hide'</strong></template>
              <p>close() 触发关闭事件后隐藏；句柄仍有效，可再次 show()，订阅也继续保留。</p></el-card
            >
          </el-col>
          <el-col :xs="24" :md="12">
            <el-card shadow="never"
              ><template #header><strong>closeAction: 'destroy'</strong></template>
              <p>close() 触发关闭事件后销毁整个复合对象；旧句柄除幂等清理外进入失效状态。</p></el-card
            >
          </el-col>
        </el-row>
        <p>
          <ApiReference kind="method" to="#api-handle-hide">hide</ApiReference> 永远只隐藏，
          <ApiReference kind="method" to="#api-handle-destroy">destroy</ApiReference> 永远销毁；只有
          <ApiReference kind="method" to="#api-handle-close">close</ApiReference> 读取 closeAction。earth.overlays.clear() 与 earth.destroy() 不受 closeAction
          影响，都会销毁资源。
        </p>
      </section>

      <section id="method-reference" class="doc-prose">
        <h2 class="doc-h2">创建与句柄方法</h2>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        :type-names="relatedTypes"
        :member-names="apiMembers"
        title="Descriptor 完整 API"
        description="这里直接列出 Descriptor 内容、创建配置、Patch、事件、句柄，以及 OverlayService.createDescriptor 的全部参数和返回类型。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="Descriptor" :items="anchors" /></aside>
  </div>
</template>
