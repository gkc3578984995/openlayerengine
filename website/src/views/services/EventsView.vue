<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import EventsDemo from '../../examples/services/EventsDemo.vue';
import eventsSource from '../../examples/services/EventsDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const eventsSnippet = extractExampleSnippet(eventsSource, 'event-subscriptions');
const eventsDemoRef = ref<InstanceType<typeof EventsDemo> | null>(null);
const resetEventsDemo = () => eventsDemoRef.value?.reset();
const focusEventsDemo = () => eventsDemoRef.value?.focusSelected();

const anchors = [
  { id: 'overview', label: '重要提示' },
  { id: 'event-types', label: '事件与载荷' },
  { id: 'example-event-lifecycle', label: '七类事件、三种路由与 signal' },
  { id: 'filters-and-lifecycle', label: '过滤与生命周期' },
  { id: 'method-reference', label: '服务方法' },
  { id: 'api', label: '完整 API' }
];

const eventColumns = [
  { prop: 'name', label: '事件', width: 150 },
  { prop: 'payload', label: '载荷', width: 260, linkTypes: true },
  { prop: 'desc', label: '触发语义', width: 420 }
];

const eventRows = [
  { name: 'pointermove', payload: "EarthPointerEvent<'pointermove'>", desc: '指针移动；命中 Element 时额外给出 enter、move、leave 阶段' },
  { name: 'click', payload: "EarthPointerEvent<'click'>", desc: '地图单击' },
  { name: 'leftdown', payload: "EarthPointerEvent<'leftdown'>", desc: '主按钮按下' },
  { name: 'leftup', payload: "EarthPointerEvent<'leftup'>", desc: '主按钮抬起' },
  { name: 'doubleclick', payload: "EarthPointerEvent<'doubleclick'>", desc: '地图双击' },
  { name: 'rightclick', payload: "EarthPointerEvent<'rightclick'>", desc: '地图右键；与 ContextMenu 共享 InputRouter 仲裁' },
  { name: 'keydown', payload: 'EarthKeyboardEvent', desc: '键盘按下；不接受 selector 或 module 过滤' }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 160, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 440, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 190, linkTypes: true },
  { prop: 'desc', label: '说明', width: 380 }
];

const methodRows = [
  {
    anchor: 'api-method-on',
    href: '/api/types#api-type-event-service-method-on',
    name: 'on',
    params: 'type: T, listener: (event: EarthEventMap[T]) => void, options?: EventSubscriptionOptions',
    returns: '() => void',
    desc: '持续订阅；返回的幂等函数只注销本次订阅'
  },
  {
    anchor: 'api-method-once',
    href: '/api/types#api-type-event-service-method-once',
    name: 'once',
    params: 'type: T, listener: (event: EarthEventMap[T]) => void, options?: EventSubscriptionOptions',
    returns: '() => void',
    desc: '首次触发后自动注销；返回函数可在触发前提前取消'
  },
  {
    anchor: 'api-method-has',
    href: '/api/types#api-type-event-service-method-has',
    name: 'has',
    params: 'type: EarthEventType, module?: string',
    returns: 'boolean',
    desc: '传 module 时检查该模块；省略时只检查全局订阅，不包含 selector 或 module 订阅'
  },
  {
    anchor: 'api-method-clear-module',
    href: '/api/types#api-type-event-service-method-clear-module',
    name: 'clearModule',
    params: 'module: string, type?: EarthEventType',
    returns: 'void',
    desc: '批量注销一个 module 的指定事件或全部事件，不影响全局与 selector 订阅'
  }
];

const relatedTypes = ['EventService', 'EarthEventType', 'EarthEventMap', 'EarthPointerEvent', 'EarthKeyboardEvent', 'EventSubscriptionOptions'] as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图服务</span>
        <h1>事件（Events）</h1>
        <p>earth.events 统一订阅地图指针与键盘事件，按全局、ElementSelector 或 module 路由载荷，并用返回的注销函数管理每次订阅。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">重要提示</h2>
        <el-alert type="success" :closable="false" show-icon title="on() 与 once() 自动管理底层监听">
          不需要、也不存在手工 enable/disable 前置步骤。保存
          <ApiReference kind="method" to="#api-method-on">on</ApiReference> 或
          <ApiReference kind="method" to="#api-method-once">once</ApiReference> 的返回函数，并在组件卸载时调用；最后一个订阅移除后，引擎会解除对应底层监听。
        </el-alert>
        <p>
          用户回调异常会被隔离，不会阻断其他监听。指针载荷优先返回公共 <code>Element</code>、module 和 Layer；<code>olFeature</code> 与
          <code>originalEvent</code> 是高级逃生信息，其中原始浏览器事件只应在当前同步回调内读取。
        </p>
      </section>

      <section id="event-types" class="doc-prose">
        <h2 class="doc-h2">事件与载荷</h2>
        <ApiTable :columns="eventColumns" :rows="eventRows" />
      </section>

      <section id="example-event-lifecycle" class="doc-prose">
        <ExampleBlock
          title="七类事件、三种路由与 AbortSignal 生命周期"
          :source="eventsSource"
          :snippet="eventsSnippet"
          source-lang="vue"
          snippet-lang="typescript"
          show-reset
          show-focus
          @reset="resetEventsDemo"
          @focus="focusEventsDemo"
        >
          <template #description>
            <p>
              示例为全部七类事件显示独立计数与当前载荷卡片，并同时覆盖 global、module、selector 三种路由，以及 AbortSignal 订阅生命周期。它运行
              <ApiReference kind="method" to="#api-method-has">has</ApiReference> 展示订阅状态，并对 module 订阅调用
              <ApiReference kind="method" to="#api-method-clear-module">clearModule</ApiReference>；批量清理不会影响其他两种路由，也不会替代 signal 或单次
              disposer。
            </p>
          </template>
          <template #preview><EventsDemo ref="eventsDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="filters-and-lifecycle" class="doc-prose">
        <h2 class="doc-h2">过滤与生命周期</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="全局订阅">省略 options，接收对应类型的全部地图事件；has(type) 只检查这一类。</el-descriptions-item>
          <el-descriptions-item label="selector 订阅">只接收命中 ElementSelector 的指针事件；不能与 module 同时设置。</el-descriptions-item>
          <el-descriptions-item label="module 订阅">只接收命中指定业务模块 Element 的指针事件；可由 clearModule 批量清理。</el-descriptions-item>
          <el-descriptions-item label="AbortSignal">signal 中止后自动注销本次 on/once，返回的 disposer 仍可安全重复调用。</el-descriptions-item>
          <el-descriptions-item label="Earth 销毁">earth.destroy() 会注销全部订阅并解除底层视口、键盘监听。</el-descriptions-item>
        </el-descriptions>
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="clearModule 不是单次 disposer 的替代品">
          disposer 精确取消一次注册；clearModule 是业务模块卸载时的批量兜底。selector 订阅没有 module 身份，不会被 clearModule 匹配。
        </el-alert>
      </section>

      <section id="method-reference" class="doc-prose">
        <h2 class="doc-h2">服务方法</h2>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        :type-names="relatedTypes"
        title="Events 完整 API"
        description="这里直接列出事件名称、载荷映射、订阅选项和 EventService 的全部属性、方法、参数与返回类型。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="事件（Events）" :items="anchors" /></aside>
  </div>
</template>
