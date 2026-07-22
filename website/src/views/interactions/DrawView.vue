<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../../components/docs/ApiReference.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import DrawSessionDemo from '../../examples/interactions/DrawSessionDemo.vue';
import drawSessionSource from '../../examples/interactions/DrawSessionDemo.vue?raw';
import InteractionPolicyDemo from '../../examples/interactions/InteractionPolicyDemo.vue';
import interactionPolicySource from '../../examples/interactions/InteractionPolicyDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const anchors = [
  { id: 'overview', label: '会话模型' },
  { id: 'result-options', label: 'limit 与 keepGraphics' },
  { id: 'method-examples', label: 'API 与示例' },
  { id: 'example-draw-session', label: '20 种 Shape 的启动、历史、结果查询与释放' },
  { id: 'pc-shortcuts', label: 'PC 键鼠快捷键' },
  { id: 'events', label: '事件与提交边界' },
  { id: 'lifecycle', label: '完成、取消与销毁' },
  { id: 'example-interaction-policy', label: 'replace / reject 交互仲裁与资源恢复' },
  { id: 'interaction-visuals', label: '预览与互斥' },
  { id: 'api', label: '完整 API' }
];

const drawSessionSnippet = extractExampleSnippet(drawSessionSource, 'draw-session-lifecycle');
const interactionPolicySnippet = extractExampleSnippet(interactionPolicySource, 'interaction-policy-replace-reject');
const drawSessionDemoRef = ref<InstanceType<typeof DrawSessionDemo> | null>(null);
const interactionPolicyDemoRef = ref<InstanceType<typeof InteractionPolicyDemo> | null>(null);
const resetDrawSessionDemo = () => drawSessionDemoRef.value?.reset();
const focusDrawSessionDemo = () => drawSessionDemoRef.value?.focus();
const resetInteractionPolicyDemo = () => interactionPolicyDemoRef.value?.reset();
const focusInteractionPolicyDemo = () => interactionPolicyDemoRef.value?.focus();

const methodExampleRows = [
  { owner: 'DrawService', members: 'start()', focus: '启动 Session、配置 Shape 与监听事件' },
  { owner: 'DrawService', members: 'query() / clear()', focus: '查询与移除服务拥有的绘制成果' },
  { owner: 'DrawSession', members: 'status / results / finished', focus: '同步状态、会话结果与异步终态' },
  { owner: 'DrawSession', members: 'undo() / redo()', focus: '草图控制点历史' },
  { owner: 'DrawSession', members: 'finish() / cancel() / destroy()', focus: '提交、回滚与完整释放' },
  { owner: 'DrawSession', members: 'on()', focus: 'start / change / click / complete / cancel' }
];

const eventRows = [
  { name: 'start', timing: '首个控制点或自由绘制手势开始', payload: 'coordinate', store: '不写入' },
  { name: 'change', timing: '草图预览几何变化', payload: 'geometry、coordinate?', store: '不写入' },
  { name: 'click', timing: '控制点被草图接受', payload: 'coordinate、controlPointCount', store: '不写入' },
  { name: 'complete', timing: 'Element 成功提交', payload: 'element', store: '同步回调内可读；是否保留由 keepGraphics 决定' },
  { name: 'cancel', timing: '主动取消、替换、销毁或异常终止', payload: 'reason', store: '不提交草图' }
];

const resultOptionRows = [
  { option: 'limit: 0', behavior: '持续接受新的完成结果，直到显式 finish()、右击、cancel()、destroy() 或被其他交互替换。' },
  { option: 'limit: 1 / 3', behavior: '每次 complete 都计数；达到上限后 Session 自动进入 finished。显式 finish() 或右击仍会立即结束当前 Session。' },
  { option: 'keepGraphics: true', behavior: '完成的 Element 保留在 Store，并进入 Session.results、finished 与 draw.query()。' },
  { option: 'keepGraphics: false', behavior: 'Element 仅在全部同步 complete 监听器执行期间有效；随后自动移除，也不会进入 results。该次完成仍计入 limit。' }
];

const pcShortcutRows = [
  { input: '左键单击', action: '添加控制点；固定点数 Shape 达到完成条件后自动触发 complete。' },
  { input: '右键单击', action: '按 finish() 语义完成合法草图并结束 Session；草图不完整时结束但不产生结果。' },
  { input: 'Shift + 左键拖动', action: '当前 Shape 支持自由绘制时，连续采集轨迹并在松开后完成。' },
  { input: 'Ctrl/Cmd + Z', action: '撤销当前未完成草图的最近一个控制点。' },
  { input: 'Ctrl/Cmd + Y 或 Ctrl/Cmd + Shift + Z', action: '重做当前草图中最近撤销的控制点。' }
];

const lifecycleRows = [
  { action: 'finish()', effect: '尝试完成当前合法草图并结束 Session', result: "status → 'finished'，finished 返回保留结果" },
  { action: 'cancel()', effect: '丢弃未完成草图并结束 Session', result: "status → 'cancelled'，finished 返回已完成结果" },
  { action: 'destroy()', effect: '释放交互、预览、Tooltip、光标和监听资源', result: '幂等；活动 Session 按销毁原因取消' },
  { action: "policy: 'replace'", effect: '新独占交互启动前清理旧 Session', result: "旧 Session 收到 cancel('replaced')" }
];

const apiTypes = ['DrawService', 'DrawOptions', 'DrawSession', 'DrawSessionEventMap', 'InteractionPolicy', 'InteractionStatus'];
const apiMembers = { DrawService: ['start', 'query', 'clear'] } as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图交互</span>
        <h1>绘制（Draw）</h1>
        <p>通过 Draw Session 接收输入、渲染真实 Shape 预览，并只在完成边界把结果提交为 Element。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">一个启动调用对应一个 Session</h2>
        <p>
          从 <ApiReference kind="property" to="/api/types#api-type-earth-property-draw">earth.draw</ApiReference> 调用
          <ApiReference kind="method" to="/api/types#api-type-draw-service-method-start">start</ApiReference>，传入
          <ApiReference kind="type" to="/api/types#api-type-draw-options">DrawOptions</ApiReference>。返回的
          <ApiReference kind="type" to="/api/types#api-type-draw-session">DrawSession</ApiReference>
          同时承担事件订阅、撤销重做和终态清理。
        </p>
        <el-steps :active="2" finish-status="success" align-center>
          <el-step title="start" description="校验 Shape、图层与冲突策略" />
          <el-step title="工作态" description="输入、预览、历史均留在 Session" />
          <el-step title="complete" description="一次事务生成 Element" />
        </el-steps>
        <el-alert type="info" :closable="false" show-icon title="Circle 的业务半径始终使用米">
          指针预览使用当前 View 投影半径，完成时转换为米；Element.state.geometry.radius、复制和历史中的值均保持米制。
        </el-alert>
      </section>

      <section id="result-options" class="doc-prose">
        <h2 class="doc-h2">结果数量与保留策略</h2>
        <p>
          <ApiReference kind="property" to="/api/types#api-type-draw-options-property-limit">limit</ApiReference>
          控制自动结束前允许完成的数量，<ApiReference kind="property" to="/api/types#api-type-draw-options-property-keep-graphics">keepGraphics</ApiReference>
          控制完成 Element 是否留在 Store。两者相互独立：临时结果虽然不保留，仍会触发 <code>complete</code> 并计入 <code>limit</code>。
        </p>
        <el-table :data="resultOptionRows" border>
          <el-table-column prop="option" label="配置" min-width="190" />
          <el-table-column prop="behavior" label="可观察行为" min-width="520" />
        </el-table>
        <el-alert type="warning" :closable="false" show-icon title="keepGraphics: false 的 Element 不能异步持有">
          <code>complete</code> 是同步派发；监听器可以在回调内读取 <code>event.element</code>。回调返回后该临时 Element 会失效，不要把句柄交给
          Promise、定时器或后续 UI 状态。
        </el-alert>
      </section>

      <section id="method-examples" class="doc-prose">
        <h2 class="doc-h2">公开成员如何对应到示例</h2>
        <p>表中列出了 Draw 页归属的全部服务和 Session 成员。点击“查看示例”会聚焦到同一个可运行场景，再按按钮验证对应行为。</p>
        <el-table :data="methodExampleRows" border stripe>
          <el-table-column prop="owner" label="归属" min-width="150" />
          <el-table-column prop="members" label="属性 / 方法" min-width="260" />
          <el-table-column prop="focus" label="示例重点" min-width="300" />
          <el-table-column label="示例" width="120">
            <template #default><el-link type="primary" href="#example-draw-session">查看示例</el-link></template>
          </el-table-column>
        </el-table>
      </section>

      <section id="example-draw-session" class="doc-prose">
        <ExampleBlock
          title="20 种 Shape 的启动、历史、结果查询与释放"
          :source="drawSessionSource"
          :snippet="drawSessionSnippet"
          show-reset
          show-focus
          @reset="resetDrawSessionDemo"
          @focus="focusDrawSessionDemo"
        >
          <template #description>
            <p>
              示例展示 <ApiReference kind="method" to="/api/types#api-type-draw-service-method-start">start</ApiReference>、
              <ApiReference kind="method" to="/api/types#api-type-draw-session-method-on">on</ApiReference>、
              <ApiReference kind="method" to="/api/types#api-type-draw-session-method-finish">finish</ApiReference>、
              <ApiReference kind="method" to="/api/types#api-type-draw-session-method-cancel">cancel</ApiReference> 与
              <ApiReference kind="method" to="/api/types#api-type-draw-session-method-destroy">destroy</ApiReference>
              的完整流程。启动前可切换 <code>limit</code> 的 0 / 1 / 3 三档和 <code>keepGraphics</code>，状态区会并列显示同步
              <code>complete</code> 次数、句柄观测、<code>results</code> 与 <code>query()</code>；展开的代码与正在运行的组件来自同一文件。
            </p>
          </template>
          <template #preview><DrawSessionDemo ref="drawSessionDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="pc-shortcuts" class="doc-prose">
        <h2 class="doc-h2">PC 键鼠快捷键</h2>
        <p>快捷键只作用于当前 active Draw Session；页面按钮调用相同的 Session 方法，可用于对照键鼠行为。</p>
        <el-table :data="pcShortcutRows" border>
          <el-table-column prop="input" label="输入" min-width="250" />
          <el-table-column prop="action" label="行为" min-width="480" />
        </el-table>
      </section>

      <section id="events" class="doc-prose">
        <h2 class="doc-h2">事件与提交边界</h2>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-draw-session-event-map">DrawSessionEventMap</ApiReference>
          的过程事件都是只读快照。尤其是 <code>change.geometry</code>：它表示当前工作几何，不能当作已经持久化的
          <ApiReference kind="property" to="/api/types#api-type-element-property-state">Element.state</ApiReference>。
        </p>
        <el-table :data="eventRows" border>
          <el-table-column prop="name" label="事件" width="120" />
          <el-table-column prop="timing" label="触发时机" min-width="230" />
          <el-table-column prop="payload" label="主要载荷" min-width="210" />
          <el-table-column prop="store" label="Store" min-width="140" />
        </el-table>
        <p>
          <ApiReference kind="method" to="/api/types#api-type-draw-session-method-on">on</ApiReference>
          返回幂等注销函数；页面不再需要监听时应立即调用，不必等到 Earth 销毁。
        </p>
      </section>

      <section id="lifecycle" class="doc-prose">
        <h2 class="doc-h2">完成、取消与销毁</h2>
        <el-table :data="lifecycleRows" border>
          <el-table-column prop="action" label="入口" min-width="150" />
          <el-table-column prop="effect" label="作用" min-width="280" />
          <el-table-column prop="result" label="结果" min-width="260" />
        </el-table>
        <p>
          <ApiReference kind="property" to="/api/types#api-type-draw-session-property-finished">finished</ApiReference>
          适合串联后续流程，但组件卸载仍应主动调用
          <ApiReference kind="method" to="/api/types#api-type-draw-session-method-destroy">destroy</ApiReference>，最后再销毁 Earth。
        </p>
      </section>

      <section id="example-interaction-policy" class="doc-prose">
        <ExampleBlock
          title="replace / reject 交互仲裁与资源恢复"
          :source="interactionPolicySource"
          :snippet="interactionPolicySnippet"
          show-reset
          show-focus
          @reset="resetInteractionPolicyDemo"
          @focus="focusInteractionPolicyDemo"
        >
          <template #description>
            <p>
              先启动 Draw、Measure、Edit 或 Transform，再直接启动另一种交互。<code>replace</code> 会先让旧 Session 收到
              <code>replaced</code> 并释放临时资源；<code>reject</code> 会抛出
              <ApiReference kind="type" to="/api/types#api-type-interaction-conflict-error">InteractionConflictError</ApiReference>
              且不改变旧会话。结果区同时核对 OpenLayers Interaction 数量是否回到预期基线。
            </p>
          </template>
          <template #preview><InteractionPolicyDemo ref="interactionPolicyDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="interaction-visuals" class="doc-prose">
        <h2 class="doc-h2">预览、光标与交互互斥</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><strong>真实预览</strong>
              <p>临时层使用目标 ShapeDefinition 和解析后的真实样式，不把草图 Feature 插入业务 Source。</p></el-card
            >
          </el-col>
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><strong>统一反馈</strong>
              <p>活动 Draw 使用 pointer 光标和跟随 Tooltip；完成、取消、替换或失败后恢复外部光标。</p></el-card
            >
          </el-col>
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><strong>互斥会话</strong>
              <p>Draw、Edit、Measure 与 Transform 共用协调器；replace 先清理旧会话，reject 则同步拒绝冲突。</p></el-card
            >
          </el-col>
        </el-row>
        <el-alert type="warning" :closable="false" show-icon title="高频预览不等于高频事务">
          自由绘制和指针移动按浏览器帧合并；每帧只更新临时工作快照，完成前不会产生 Store 事务或独立历史命令。
        </el-alert>
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :member-names="apiMembers"
        title="Draw 完整 API"
        description="完整展示 DrawService、DrawOptions、DrawSession 与 DrawSessionEventMap 的全部公开属性、方法、参数和事件载荷。"
      />
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="绘制（Draw）" :items="anchors" /></aside>
  </div>
</template>
