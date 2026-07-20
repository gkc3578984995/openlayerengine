<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../../components/docs/ApiReference.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import EditSessionDemo from '../../examples/interactions/EditSessionDemo.vue';
import editSessionSource from '../../examples/interactions/EditSessionDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const anchors = [
  { id: 'overview', label: '编辑工作态' },
  { id: 'method-examples', label: 'API 与示例' },
  { id: 'example-edit-session', label: '多类型目标的控制点编辑、历史与提交回滚' },
  { id: 'operations', label: '控制点与快捷操作' },
  { id: 'events', label: '事件和生命周期' },
  { id: 'transaction-boundary', label: '事务与互斥边界' },
  { id: 'api', label: '完整 API' }
];

const editSessionSnippet = extractExampleSnippet(editSessionSource, 'edit-session-control-points');
const editSessionDemoRef = ref<InstanceType<typeof EditSessionDemo> | null>(null);
const resetEditSessionDemo = () => editSessionDemoRef.value?.reset();
const focusEditSessionDemo = () => editSessionDemoRef.value?.focus();

const methodExampleRows = [
  { owner: 'DrawService', members: 'edit()', focus: '传入实时 Element 和 EditOptions' },
  { owner: 'EditSession', members: 'element / status / finished', focus: '目标句柄、同步状态和异步终态' },
  { owner: 'EditSession', members: 'undo() / redo()', focus: '移动、插入与删除的会话历史' },
  { owner: 'EditSession', members: 'finish() / cancel() / destroy()', focus: '提交、回滚与释放临时视觉' },
  { owner: 'EditSession', members: 'on()', focus: 'modifying / complete / cancel 事件' }
];

const operationRows = [
  { input: '拖拽控制点', result: '移动已有拓扑点', cursor: 'move → grabbing', topology: 'ShapeDefinition.editTopology.move' },
  { input: 'Alt + 单击插入点', result: '在合法候选位置插入点', cursor: 'move', topology: 'editTopology.insert（可选）' },
  { input: 'Alt + 单击控制点', result: '仅删除 removable 控制点', cursor: 'move', topology: 'editTopology.remove（可选）' },
  { input: '右击 / finish()', result: '提交当前工作几何', cursor: '恢复外部光标', topology: '一次 Store 事务' },
  { input: 'Esc / cancel()', result: '丢弃工作几何', cursor: '恢复外部光标', topology: '不写 Store' }
];

const eventRows = [
  { name: 'modifying', payload: 'element、geometry、operation、coordinate?', meaning: '工作几何变化；geometry 尚未提交' },
  { name: 'complete', payload: 'element', meaning: '最终几何成功提交，句柄仍指向同一 Element' },
  { name: 'cancel', payload: 'reason', meaning: '取消、替换、销毁或外部状态冲突，没有提交' }
];

const apiTypes = ['DrawService', 'EditOptions', 'EditSession', 'EditSessionEventMap'];
const apiMembers = { DrawService: ['edit'] } as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图交互</span>
        <h1>编辑（Edit）</h1>
        <p>在隔离的工作态中移动、插入或删除 Shape 控制点，完成时一次提交，取消时完整回滚。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">编辑的是 Session 工作态，不是 Store</h2>
        <p>
          通过 <ApiReference kind="method" to="/api/types#api-type-draw-service-method-edit">earth.draw.edit</ApiReference> 传入当前 Earth 的实时
          <ApiReference kind="type" to="/api/types#api-type-element">Element</ApiReference>。
          <ApiReference kind="type" to="/api/types#api-type-edit-session">EditSession</ApiReference>
          会隔离持久 Feature，工作图形保留真实业务样式并叠加蓝色编辑强调层。
        </p>
        <el-alert type="info" :closable="false" show-icon title="underlay 只是一份可选参照">
          <ApiReference kind="property" to="/api/types#api-type-edit-options-property-underlay">EditOptions.underlay</ApiReference>
          为 true 时保留低对比度原始轮廓；它不复制业务填充、图标或文字，也不会成为第二份业务对象。
        </el-alert>
      </section>

      <section id="method-examples" class="doc-prose">
        <h2 class="doc-h2">公开成员如何对应到示例</h2>
        <p>示例把控制点、插入候选、历史和提交状态同时放在地图与结果区中，便于逐个核对 Edit 的公开成员。</p>
        <el-table :data="methodExampleRows" border stripe>
          <el-table-column prop="owner" label="归属" min-width="150" />
          <el-table-column prop="members" label="属性 / 方法" min-width="270" />
          <el-table-column prop="focus" label="示例重点" min-width="320" />
          <el-table-column label="示例" width="120">
            <template #default><el-link type="primary" href="#example-edit-session">查看示例</el-link></template>
          </el-table-column>
        </el-table>
      </section>

      <section id="example-edit-session" class="doc-prose">
        <ExampleBlock
          title="多类型目标的控制点编辑、历史与提交回滚"
          :source="editSessionSource"
          :snippet="editSessionSnippet"
          show-reset
          show-focus
          @reset="resetEditSessionDemo"
          @focus="focusEditSessionDemo"
        >
          <template #description>
            <p>
              拖拽时监听 <ApiReference kind="method" to="/api/types#api-type-edit-session-method-on">on</ApiReference> 的 <code>modifying</code> 事件；通过
              <ApiReference kind="method" to="/api/types#api-type-edit-session-method-finish">finish</ApiReference>、
              <ApiReference kind="method" to="/api/types#api-type-edit-session-method-cancel">cancel</ApiReference> 或
              <ApiReference kind="method" to="/api/types#api-type-edit-session-method-destroy">destroy</ApiReference>
              进入确定的终态。地图上用不同强度的蓝色锚点区分已有控制点和可插入位置，结果区只展示当前状态，不输出日志。
            </p>
          </template>
          <template #preview><EditSessionDemo ref="editSessionDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="operations" class="doc-prose">
        <h2 class="doc-h2">控制点、插入点与快捷操作</h2>
        <el-table :data="operationRows" border>
          <el-table-column prop="input" label="输入" min-width="180" />
          <el-table-column prop="result" label="结果" min-width="220" />
          <el-table-column prop="cursor" label="光标" min-width="170" />
          <el-table-column prop="topology" label="规则来源" min-width="260" />
        </el-table>
        <p>普通单击插入点不会改变拓扑；是否允许插入、删除以及最小点数都由 ShapeDefinition 决定，调用方无需按 ShapeType 自行分支。</p>
      </section>

      <section id="events" class="doc-prose">
        <h2 class="doc-h2">事件和生命周期</h2>
        <el-table :data="eventRows" border>
          <el-table-column prop="name" label="事件" width="130" />
          <el-table-column prop="payload" label="主要载荷" min-width="280" />
          <el-table-column prop="meaning" label="语义" min-width="320" />
        </el-table>
        <ul>
          <li><ApiReference kind="method" to="/api/types#api-type-edit-session-method-finish">finish</ApiReference> 原子提交当前工作几何并解析 finished。</li>
          <li>
            <ApiReference kind="method" to="/api/types#api-type-edit-session-method-cancel">cancel</ApiReference>
            丢弃工作态，不影响进入编辑前的 ElementState。
          </li>
          <li>
            <ApiReference kind="method" to="/api/types#api-type-edit-session-method-destroy">destroy</ApiReference>
            幂等释放预览、锚点、Tooltip、光标及监听。
          </li>
          <li>
            <ApiReference kind="method" to="/api/types#api-type-edit-session-method-undo">undo</ApiReference> 与 redo 只操作 Session
            历史；拖拽中的每一帧不是独立历史命令。
          </li>
        </ul>
      </section>

      <section id="transaction-boundary" class="doc-prose">
        <h2 class="doc-h2">事务、外部变化与互斥边界</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-card shadow="never"
              ><strong>外部状态冲突</strong>
              <p>目标被外部更新或移除时，Session 以 external-change / external-remove 取消，旧工作态不会覆盖新业务状态。</p></el-card
            >
          </el-col>
          <el-col :xs="24" :md="12">
            <el-card shadow="never"
              ><strong>独占视觉所有权</strong>
              <p>Edit 与 Draw、Measure、Transform 互斥；新 Session 使用 replace 时先完成旧会话的回滚与资源清理。</p></el-card
            >
          </el-col>
        </el-row>
        <el-alert type="warning" :closable="false" show-icon title="动画不会进入编辑工作态">
          Edit 期间所有动画采用 pause-and-suppress：冻结 elapsed 并让出临时视觉；完成、取消或打开失败后基于最新 ElementState 恢复。动画帧不会写入 Store、copy 或
          snapshot。
        </el-alert>
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :member-names="apiMembers"
        title="Edit 完整 API"
        description="完整展示 DrawService、EditOptions、EditSession 与 EditSessionEventMap 的公开属性、方法、参数和事件载荷。"
      />
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="编辑（Edit）" :items="anchors" /></aside>
  </div>
</template>
