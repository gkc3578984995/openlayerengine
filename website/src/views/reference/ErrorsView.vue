<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import ErrorsDemo from '../../examples/reference/ErrorsDemo.vue';
import errorsSource from '../../examples/reference/ErrorsDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '稳定错误族' },
  { id: 'error-catalog', label: '8 种错误类型' },
  { id: 'example-error-recognition', label: '真实 API 失败、识别与恢复' },
  { id: 'recognition', label: '识别与恢复策略' },
  { id: 'api', label: '完整 API' }
];

const errorColumns = [
  { prop: 'name', label: '错误类型', width: 250, presentation: 'type' as const },
  { prop: 'when', label: '何时出现', width: 430 },
  { prop: 'response', label: '建议处理', width: 360 }
];

const errorRows = [
  {
    anchor: 'api-error-invalid-argument',
    href: '/api/types#api-type-invalid-argument-error',
    name: 'InvalidArgumentError',
    when: 'useEarth ID、LayerSpec、StyleSpec、ShapeState、菜单、Overlay 等参数不符合契约',
    response: '修正输入或在应用表单边界提示；不要重试相同参数'
  },
  {
    anchor: 'api-error-duplicate-element-id',
    href: '/api/types#api-type-duplicate-element-id-error',
    name: 'DuplicateElementIdError',
    when: '当前 Earth 中已经存在相同 Element ID，再次 add',
    response: '选择业务唯一 ID、先查询，或显式移除旧 Element'
  },
  {
    anchor: 'api-error-invalid-selector',
    href: '/api/types#api-type-invalid-selector-error',
    name: 'InvalidSelectorError',
    when: 'remove、hide、show 等破坏性或批量操作收到空选择器',
    response: '补充 id、module、layerId 等明确条件；清空全部使用 clear'
  },
  {
    anchor: 'api-error-object-disposed',
    href: '/api/types#api-type-object-disposed-error',
    name: 'ObjectDisposedError',
    when: '对已销毁 Earth、Element、Session 或 Handle 执行非清理操作',
    response: '停止复用旧句柄；清理函数保持可幂等调用'
  },
  {
    anchor: 'api-error-capability',
    href: '/api/types#api-type-capability-error',
    name: 'CapabilityError',
    when: '目标图形没有声明请求的 draw、edit、transform、animation 等能力',
    response: '检查目标 Shape 能力，选择兼容目标或功能'
  },
  {
    anchor: 'api-error-interaction-conflict',
    href: '/api/types#api-type-interaction-conflict-error',
    name: 'InteractionConflictError',
    when: '活动互斥交互存在时，以 reject 策略启动新会话',
    response: '等待或取消当前会话，或按业务选择 replace 策略'
  },
  {
    anchor: 'api-error-element-protected',
    href: '/api/types#api-type-element-protected-error',
    name: 'ElementProtectedError',
    when: '尝试为处于协同保护模式的 Element 启动内置 Edit 或 Transform',
    response: '保留只读命中，提示当前操作人；等待更高 revision 的解锁消息后重新发起交互'
  },
  {
    anchor: 'api-error-unsupported-operation',
    href: '/api/types#api-type-unsupported-operation-error',
    name: 'UnsupportedOperationError',
    when: 'API 已定义，但当前状态或表示方式无法执行，例如 nativeStyle 的结构化操作',
    response: '改用受支持表示方式；不要把失败当作静默 no-op'
  }
];

const relatedTypes = [
  'InvalidArgumentError',
  'DuplicateElementIdError',
  'InvalidSelectorError',
  'ObjectDisposedError',
  'CapabilityError',
  'InteractionConflictError',
  'ElementProtectedError',
  'UnsupportedOperationError'
] as const;

const errorsDemoRef = ref<InstanceType<typeof ErrorsDemo> | null>(null);
const resetErrorsDemo = () => errorsDemoRef.value?.reset();
const focusErrorsDemo = () => errorsDemoRef.value?.focus();
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">工具与参考</span>
        <h1>错误类型</h1>
        <p>2.0 从包根导出 8 个稳定错误类，用类型区分参数、身份、选择器、生命周期、能力、交互冲突、协同保护与不支持操作，而不是以 false 或模糊消息静默失败。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">稳定错误族</h2>
        <el-alert type="info" :closable="false" show-icon title="查询缺失不是异常">
          get() 找不到对象时返回 undefined，query() 没有结果时返回空集合。错误类用于契约或状态确实不成立的场景；不要用 try/catch 代替正常的缺失判断。
        </el-alert>
        <p>
          所有类型都继承原生 <code>Error</code>，保留 <code>message</code>、<code>stack</code>，并把 <code>name</code> 设置为具体类名。业务分支优先使用
          <code>instanceof</code>；日志可以同时记录 name 与 message。
        </p>
      </section>

      <section id="error-catalog" class="doc-prose">
        <h2 class="doc-h2">8 种错误类型</h2>
        <ApiTable :columns="errorColumns" :rows="errorRows" />
      </section>

      <section id="example-error-recognition" class="doc-prose">
        <ExampleBlock title="真实 API 失败、识别与恢复" :source="errorsSource" show-reset show-focus @reset="resetErrorsDemo" @focus="focusErrorsDemo">
          <template #description>
            <p>
              示例分别通过无效 Shape 输入、重复 ID、空破坏性选择器、失效句柄、不兼容动画、reject 交互冲突、受保护目标 Edit 和 nativeStyle
              结构化更新触发八类真实错误；捕获后用
              <code>instanceof</code> 识别并立即执行可运行的恢复动作，不手工构造或抛出错误实例。
            </p>
          </template>
          <template #preview><ErrorsDemo ref="errorsDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="recognition" class="doc-prose">
        <h2 class="doc-h2">识别与恢复策略</h2>
        <el-steps direction="vertical" :active="4" finish-status="success">
          <el-step title="先处理具体类型" description="用 instanceof DuplicateElementIdError 等分支选择可恢复动作。" />
          <el-step title="再处理 Error" description="未知 Error 进入统一错误通道，同时保留 name、message、stack 与业务上下文。" />
          <el-step title="跨边界只做诊断" description="错误经 JSON、Worker 或服务端传输后原型通常丢失；name 可辅助诊断，但不能恢复原始实例。" />
          <el-step title="不要解析 message" description="message 面向具体说明，可能随校验细节变化；控制流应依赖类型。" />
        </el-steps>
        <p>
          对
          <ApiReference kind="type" to="/api/types#api-type-object-disposed-error">ObjectDisposedError</ApiReference>，恢复方式通常是丢弃旧句柄并重新获取；对
          <ApiReference kind="type" to="/api/types#api-type-invalid-argument-error">InvalidArgumentError</ApiReference
          >，应回到输入边界修正参数，而不是自动重复调用。
        </p>
      </section>

      <PublicApiSection
        :type-names="relatedTypes"
        description="这里直接列出全部 8 个稳定错误类的构造函数、参数和继承信息；类型名称还可以继续进入顶部 API 查询。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="错误类型" :items="anchors" /></aside>
  </div>
</template>
