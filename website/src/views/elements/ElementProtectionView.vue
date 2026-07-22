<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import ElementProtectionDemo from '../../examples/elements/ElementProtectionDemo.vue';
import elementProtectionSource from '../../examples/elements/ElementProtectionDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const elementProtectionSnippet = [
  extractExampleSnippet(elementProtectionSource, 'element-protection'),
  extractExampleSnippet(elementProtectionSource, 'element-protection-interactions')
].join('\n\n');
const elementProtectionDemoRef = ref<InstanceType<typeof ElementProtectionDemo> | null>(null);
const resetElementProtectionDemo = () => elementProtectionDemoRef.value?.reset();
const focusElementProtectionDemo = () => elementProtectionDemoRef.value?.focusSelected();

const anchors = [
  { id: 'overview', label: '保护模式解决什么问题' },
  { id: 'runtime-model', label: '运行时状态模型' },
  { id: 'example-element-protection', label: '点、图片点、线与面保护' },
  { id: 'interaction-boundary', label: '交互与写入边界' },
  { id: 'collaboration-ordering', label: '协同版本与到期' },
  {
    id: 'api-types',
    label: '保护类型',
    children: [
      { id: 'api-type-element-protection-update', label: 'ElementProtectionUpdate' },
      { id: 'api-type-element-protection-state', label: 'ElementProtectionState' }
    ]
  },
  { id: 'api-methods', label: '保护方法' },
  { id: 'api', label: '完整 API' }
];

const typeColumns = [
  { prop: 'name', label: '类型', width: 250, presentation: 'type' as const },
  { prop: 'fields', label: '主要字段', width: 390, monospace: true },
  { prop: 'desc', label: '说明', width: 430 }
];

const typeRows = [
  {
    anchor: 'api-type-element-protection-update',
    href: '/api/types#api-type-element-protection-update',
    name: 'ElementProtectionUpdate',
    fields: 'protected · operatorId? · operatorName? · revision? · expiresAt?',
    desc: '按 protected 判别的更新联合；解锁分支只接收 protected: false 与可选 revision'
  },
  {
    anchor: 'api-type-element-protection-state',
    href: '/api/types#api-type-element-protection-state',
    name: 'ElementProtectionState',
    fields: 'elementId · protected: true · operatorId? · operatorName? · revision? · expiresAt?',
    desc: '当前生效的只读运行时快照；未保护时 getProtection 返回 undefined'
  }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 210, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 390, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 190, linkTypes: true },
  { prop: 'desc', label: '说明', width: 430 }
];

const methodRows = [
  {
    anchor: 'api-method-set-protection',
    href: '/api/types#api-type-element-service-method-set-protection',
    name: 'setProtection',
    params: 'id: string, update: ElementProtectionUpdate',
    returns: 'boolean',
    desc: '应用保护、解锁或租约更新；只有当前保护状态实际改变时返回 true'
  },
  {
    anchor: 'api-method-get-protection',
    href: '/api/types#api-type-element-service-method-get-protection',
    name: 'getProtection',
    params: 'id: string',
    returns: 'ElementProtectionState | undefined',
    desc: '读取当前代次的保护快照；目标不存在、未保护或已到期时返回 undefined'
  }
];

const apiTypes = ['ElementProtectionUpdate', 'ElementProtectionState', 'ElementService'] as const;
const apiMembers = { ElementService: ['setProtection', 'getProtection'] } as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图元素</span>
        <h1>协同保护模式</h1>
        <p>把远端“谁正在编辑”同步为 Element 的运行时保护状态，用统一遮罩和操作人标签提示本地用户，并阻止内置编辑交互接管同一目标。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">保护模式解决什么问题</h2>
        <p>
          协同服务收到加锁、续租或解锁消息后，调用
          <ApiReference kind="method" to="#api-method-set-protection">earth.elements.setProtection</ApiReference>
          更新指定 ID。本地地图会按 Point、图片 Point、Polyline、Polygon 或 Circle 的几何形态显示保护视觉，并用操作人名称说明占用来源。
        </p>
        <el-alert type="warning" :closable="false" show-icon title="保护提示不等于服务端并发锁">
          客户端保护模式改善可见性并约束本库内置交互；最终写入仍应由协同服务使用原子锁、租约或版本条件校验，不能只信任前端状态。
        </el-alert>
      </section>

      <section id="runtime-model" class="doc-prose">
        <h2 class="doc-h2">运行时状态模型</h2>
        <p>
          保护状态按 Element ID 与当前代次保存，不写入
          <ApiReference kind="property" to="/components/elements/overview#api-property-state">Element.state</ApiReference>，也不会进入
          snapshot、copy、历史记录或业务 VectorSource。 删除 Element、用同一 ID 创建新代次或销毁 Earth 时，旧保护与视觉资源都会清理。
        </p>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="protected">true 表示进入保护；false 表示解除保护。</el-descriptions-item>
          <el-descriptions-item label="operatorId / operatorName">稳定用户 ID 便于业务识别；可选名称只用于安全文本展示。</el-descriptions-item>
          <el-descriptions-item label="revision">协同消息的单调版本；忽略迟到、重复或更旧的更新。</el-descriptions-item>
          <el-descriptions-item label="expiresAt">可选的毫秒时间戳；到期后自动解除，适合与服务端租约配合。</el-descriptions-item>
        </el-descriptions>
      </section>

      <section id="example-element-protection" class="doc-prose">
        <ExampleBlock
          title="点、图片点、线与面保护"
          :source="elementProtectionSource"
          :snippet="elementProtectionSnippet"
          source-lang="vue"
          snippet-lang="typescript"
          show-reset
          show-focus
          @reset="resetElementProtectionDemo"
          @focus="focusElementProtectionDemo"
        >
          <template #description>
            <p>
              示例为普通点、SVG 图片点、路线和作业区分别设置保护。选择目标后可调用
              <ApiReference kind="method" to="#api-method-set-protection">setProtection</ApiReference>
              加锁、解锁或设置 10 秒到期时间，并用
              <ApiReference kind="method" to="#api-method-get-protection">getProtection</ApiReference>
              刷新表格。点击“尝试启动 Edit”或“尝试启动 Transform”可直接验证受保护目标会抛出
              <ApiReference kind="type" to="/components/reference/errors#api-error-element-protected">ElementProtectedError</ApiReference>。
            </p>
          </template>
          <template #preview><ElementProtectionDemo ref="elementProtectionDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="interaction-boundary" class="doc-prose">
        <h2 class="doc-h2">交互与写入边界</h2>
        <ul>
          <li>受保护目标仍能被事件、atPixel 和业务查询命中，因此本地用户仍可查看属性、定位目标或打开只读信息。</li>
          <li>draw.edit 与 transform.select 会在启动前拒绝受保护目标；活动 Edit / Transform 期间收到保护消息时，会取消工作态并回滚未提交修改。</li>
          <li>Transform 从点击位置按视觉顺序检查候选；最上层候选受保护时会直接拒绝本次选择，不会穿透并选中下层 Element。</li>
          <li>解除保护不会自动重启先前会话，用户需要重新发起编辑，避免远端状态变化触发意外操作。</li>
          <li>
            element.update、elements.update/remove、样式 API 与原生 OpenLayers Interaction 不会被保护状态全局拦截，以便协同客户端仍能应用服务端确认的远端更新。
          </li>
        </ul>
      </section>

      <section id="collaboration-ordering" class="doc-prose">
        <h2 class="doc-h2">协同版本与到期</h2>
        <p>
          同一个 Element 建议始终传递服务端生成的单调 revision。较旧或相同 revision、幂等命令、未知 ID 以及已经到期且没有形成状态的更新都会返回 false；带
          revision 的到期输入仍会推进内部乱序水位，防止更旧的加锁消息随后重新生效。未使用版本时，则按当前客户端的到达顺序处理。
        </p>
        <el-alert type="info" :closable="false" show-icon title="租约到期只是前端兜底">
          expiresAt 应来自服务端时钟语义，并在续租成功后发送更高 revision。网络断开时前端可以自动撤去过期视觉，但提交仍须重新经过服务端权限与版本检查。
        </el-alert>
      </section>

      <section id="api-types" class="doc-prose">
        <h2 class="doc-h2">保护类型</h2>
        <ApiTable :columns="typeColumns" :rows="typeRows" />
      </section>

      <section id="api-methods" class="doc-prose">
        <h2 class="doc-h2">保护方法</h2>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :member-names="apiMembers"
        description="完整列出保护更新、当前状态以及 ElementService 上的设置与查询方法；错误类型统一归属“错误类型”页面。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="协同保护模式" :items="anchors" /></aside>
  </div>
</template>
