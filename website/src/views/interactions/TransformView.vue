<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../../components/docs/ApiReference.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import TransformSessionDemo from '../../examples/interactions/TransformSessionDemo.vue';
import transformSessionSource from '../../examples/interactions/TransformSessionDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const anchors = [
  { id: 'overview', label: '选择与模式' },
  { id: 'transform-options-lab', label: 'TransformOptions 实验配置' },
  { id: 'method-examples', label: 'API 与示例' },
  { id: 'example-transform-session', label: '多类型目标的选择、替换、变换与 Toolbar 管理' },
  { id: 'pc-shortcuts', label: 'PC 快捷键' },
  { id: 'events', label: '事件族' },
  { id: 'working-state', label: '工作态与事务' },
  { id: 'visual-animation', label: '视觉和动画边界' },
  { id: 'lifecycle', label: '终态与清理' },
  { id: 'api', label: '完整 API' }
];

const transformSessionSnippet = [
  extractExampleSnippet(transformSessionSource, 'transform-options-lab'),
  extractExampleSnippet(transformSessionSource, 'transform-start-select-replace')
].join('\n\n');
const transformSessionDemoRef = ref<InstanceType<typeof TransformSessionDemo> | null>(null);
const resetTransformSessionDemo = () => transformSessionDemoRef.value?.reset();
const focusTransformSessionDemo = () => transformSessionDemoRef.value?.focus();

const methodExampleRows = [
  { owner: 'TransformService', members: 'start() / select()', focus: '地图查询选择与直接选择' },
  { owner: 'TransformSession', members: 'selected / status / mode / toolbar', focus: '当前会话属性' },
  { owner: 'TransformSession', members: 'select() / replaceSelected()', focus: '会话内选择与目标替换' },
  { owner: 'TransformSession', members: 'setMode() / undo() / redo()', focus: '模式和历史控制' },
  { owner: 'TransformSession', members: 'copy() / remove()', focus: '复制与删除当前目标' },
  { owner: 'TransformSession', members: 'finish() / cancel() / on()', focus: '事务终态和事件' },
  { owner: 'TransformToolbarHandle', members: 'setActive() / updateItem()', focus: '激活项与项目状态' },
  { owner: 'TransformToolbarHandle', members: 'updateOptions() / show() / hide() / destroy()', focus: '位置、显隐与释放' }
];

const eventRows = [
  { family: '选择', events: 'select / selectEnd', meaning: '目标进入或离开当前 Session' },
  { family: '手柄', events: 'enterHandle / leaveHandle', meaning: '携带 key 和建议 cursor' },
  { family: '平移', events: 'translateStart / translating / translateEnd', meaning: '一次完整平移操作' },
  { family: '旋转', events: 'rotateStart / rotating / rotateEnd', meaning: '一次完整旋转操作' },
  { family: '缩放', events: 'scaleStart / scaling / scaleEnd', meaning: '缩放或单轴拉伸过程' },
  { family: '编辑', events: 'edit', meaning: 'Transform Edit 顶点工作态变化' },
  { family: '资源', events: 'copyPreviewConfirm / copyPreviewCancel / remove / error', meaning: '复制预览、删除与错误结果' }
];

const cursorRows = [
  { operation: '平移 / 顶点编辑', hover: 'move', active: 'grabbing' },
  { operation: '旋转', hover: 'grab', active: 'grabbing' },
  { operation: '水平 / 垂直拉伸', hover: 'ew-resize / ns-resize', active: '保持对应 resize' },
  { operation: '对角缩放', hover: 'nesw-resize / nwse-resize', active: '保持对应 resize' }
];

const transformOptionRows = [
  {
    option: 'hitTolerance',
    href: '/api/types#api-type-transform-options-property-hit-tolerance',
    full: '8（可调 0–32）',
    rectangle: '12（可调 0–32）',
    translateOnly: '6（可调 0–32）',
    meaning: '手柄和 Element 命中的额外容差，单位为 CSS px'
  },
  {
    option: 'translate',
    href: '/api/types#api-type-transform-options-property-translate',
    full: 'feature',
    rectangle: 'center',
    translateOnly: 'feature',
    meaning: 'none 禁用平移；center 使用中心手柄；feature 可直接拖动目标'
  },
  {
    option: 'scale',
    href: '/api/types#api-type-transform-options-property-scale',
    full: 'true',
    rectangle: 'true',
    translateOnly: 'false',
    meaning: '控制对角等比或双轴缩放手柄'
  },
  {
    option: 'stretch',
    href: '/api/types#api-type-transform-options-property-stretch',
    full: 'true',
    rectangle: 'false',
    translateOnly: 'false',
    meaning: '控制水平、垂直单轴拉伸手柄'
  },
  {
    option: 'rotate',
    href: '/api/types#api-type-transform-options-property-rotate',
    full: 'true',
    rectangle: 'true',
    translateOnly: 'false',
    meaning: '显示旋转手柄；目标 Shape 仍须声明 rotate 能力'
  },
  {
    option: 'translateBBox',
    href: '/api/types#api-type-transform-options-property-translate-b-box',
    full: 'true',
    rectangle: 'true',
    translateOnly: 'true',
    meaning: '允许直接拖动控制区域平移目标'
  },
  {
    option: 'noFlip',
    href: '/api/types#api-type-transform-options-property-no-flip',
    full: 'false',
    rectangle: 'true',
    translateOnly: 'false',
    meaning: '阻止缩放或拉伸穿过零点后翻转'
  },
  {
    option: 'keepRectangle',
    href: '/api/types#api-type-transform-options-property-keep-rectangle',
    full: 'false',
    rectangle: 'true',
    translateOnly: 'false',
    meaning: 'Rectangle 四角缩放时锁定宽高比；其他目标不受影响'
  },
  {
    option: 'buffer',
    href: '/api/types#api-type-transform-options-property-buffer',
    full: '16 px',
    rectangle: '24 px',
    translateOnly: '8 px',
    meaning: '几何外包框周围的控制区域缓冲'
  },
  {
    option: 'pointRadius',
    href: '/api/types#api-type-transform-options-property-point-radius',
    full: '10 px',
    rectangle: '12 px',
    translateOnly: '16 px',
    meaning: 'Point Element 的控制区域半径'
  }
];

const pcShortcutRows = [
  { shortcut: 'Ctrl + Z', mode: 'Transform / Edit', result: '撤销最近一条完整 Session 历史命令', boundary: '不直接写 Store' },
  { shortcut: 'Ctrl + Y / Ctrl + Shift + Z', mode: 'Transform / Edit', result: '重做下一条 Session 历史命令', boundary: '仅在存在 redo 历史时生效' },
  { shortcut: 'Ctrl + C', mode: 'Transform', result: '把当前工作快照写入 TransformService 剪贴板', boundary: '尚不创建副本，可供后续 Session 使用' },
  { shortcut: 'Ctrl + V', mode: 'Transform', result: '进入复制预览；单击地图确认副本位置', boundary: '右键或 Esc 取消预览' },
  { shortcut: 'Ctrl + X', mode: 'Transform', result: '复制当前工作快照后移除选中 Element', boundary: '移除立即写入 Store' },
  { shortcut: 'Delete', mode: 'Transform', result: '移除当前选中 Element', boundary: '移除立即写入 Store' },
  { shortcut: 'Esc', mode: 'Transform / Edit', result: '优先取消复制预览，否则取消并回滚 Session', boundary: '恢复 Tooltip、光标和临时资源' },
  { shortcut: 'Shift + 拖拽对角手柄', mode: 'Transform', result: '临时保持比例缩放', boundary: '松开 Shift 后恢复当前配置' },
  { shortcut: 'Alt + 单击锚点', mode: 'Edit', result: '在中点插入，或删除 removable 控制点', boundary: '是否可用由 ShapeDefinition 决定' }
];

const apiTypes = [
  'TransformService',
  'TransformOptions',
  'TransformSession',
  'TransformEventMap',
  'TransformMode',
  'TransformTranslateMode',
  'TransformReplaceOptions',
  'TransformToolbarHandle',
  'TransformToolbarOptions',
  'TransformToolbarOptionsPatch',
  'TransformToolbarItemSpec',
  'TransformToolbarItemPatch'
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图交互</span>
        <h1>变换（Transform）</h1>
        <p>在同一个 Session 中选择 Element，完成平移、缩放、拉伸、旋转、顶点编辑、复制与撤销重做。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">先启动等待选择，或直接选择目标</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-card shadow="never">
              <strong>earth.transform.start(options)</strong>
              <p>创建等待用户在地图中选择 Element 的 Session；selector、predicate 和 layerIds 可以约束候选范围。</p>
            </el-card>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-card shadow="never">
              <strong>earth.transform.select(element, options)</strong>
              <p>校验 Element 归属后立即选中目标，适合列表、搜索结果或业务按钮驱动的操作。</p>
            </el-card>
          </el-col>
        </el-row>
        <p>
          <ApiReference kind="method" to="/api/types#api-type-transform-session-method-set-mode">setMode</ApiReference>
          在 <code>transform</code> 外包框模式与 <code>edit</code> 顶点编辑模式之间切换；两种模式共享 Session 历史和最终事务。
        </p>
      </section>

      <section id="transform-options-lab" class="doc-prose">
        <h2 class="doc-h2">用三档配置观察命中、手柄和约束</h2>
        <p>
          下表是可运行示例提供的三组
          <ApiReference kind="type" to="/api/types#api-type-transform-options">TransformOptions</ApiReference>
          实验值，并非库默认值。<code>full</code> 开放全部外框操作，<code>rectangle</code> 强调中心平移、防翻转和 Rectangle 比例约束，<code
            >translate-only</code
          >
          只保留平移；示例还允许在启动 Session 前单独调整 <code>hitTolerance</code>。
        </p>
        <el-table :data="transformOptionRows" border stripe>
          <el-table-column label="选项" min-width="160">
            <template #default="scope">
              <ApiReference kind="property" :to="scope.row.href">{{ scope.row.option }}</ApiReference>
            </template>
          </el-table-column>
          <el-table-column prop="full" label="full" min-width="145" />
          <el-table-column prop="rectangle" label="rectangle" min-width="155" />
          <el-table-column prop="translateOnly" label="translate-only" min-width="165" />
          <el-table-column prop="meaning" label="行为" min-width="350" />
        </el-table>
        <el-alert type="info" :closable="false" show-icon title="配置在 Session 创建时冻结">
          先完成或取消当前 Session，再切换预设或命中容差；随后用 start() 或 select() 创建的新 Session 才会采用新配置。
        </el-alert>
      </section>

      <section id="method-examples" class="doc-prose">
        <h2 class="doc-h2">公开成员如何对应到示例</h2>
        <p>同一张地图同时放置 A、B 两个 Element，可观察 start 查询选择、直接 select、replaceSelected、历史以及 Toolbar 控制的视觉差异。</p>
        <el-table :data="methodExampleRows" border stripe>
          <el-table-column prop="owner" label="归属" min-width="190" />
          <el-table-column prop="members" label="属性 / 方法" min-width="310" />
          <el-table-column prop="focus" label="示例重点" min-width="280" />
          <el-table-column label="示例" width="120">
            <template #default><el-link type="primary" href="#example-transform-session">查看示例</el-link></template>
          </el-table-column>
        </el-table>
      </section>

      <section id="example-transform-session" class="doc-prose">
        <ExampleBlock
          title="多类型目标的选择、替换、变换与 Toolbar 管理"
          :source="transformSessionSource"
          :snippet="transformSessionSnippet"
          show-reset
          show-focus
          @reset="resetTransformSessionDemo"
          @focus="focusTransformSessionDemo"
        >
          <template #description>
            <p>
              示例通过 <ApiReference kind="method" to="/api/types#api-type-transform-service-method-select">transform.select</ApiReference>
              启动已选中会话，展示模式切换、
              <ApiReference kind="method" to="/api/types#api-type-transform-session-method-undo">undo</ApiReference>、
              <ApiReference kind="method" to="/api/types#api-type-transform-session-method-redo">redo</ApiReference>、
              <ApiReference kind="method" to="/api/types#api-type-transform-session-method-copy">copy</ApiReference>、 <code>replaceSelected</code> 与 Toolbar
              的显隐、更新和销毁。启动前可以在 full、rectangle、translate-only 之间切换，并独立调整 <code>hitTolerance</code>；状态区会列出本次 Session
              的全部实验选项，不输出事件日志。
            </p>
          </template>
          <template #preview><TransformSessionDemo ref="transformSessionDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="pc-shortcuts" class="doc-prose">
        <h2 class="doc-h2">PC 快捷键与提交边界</h2>
        <p>以下操作只在活动 Transform Session 中生效。Tooltip 会按当前模式和历史状态显示可用项；表格补全复制预览、立即删除和回滚边界。</p>
        <el-table :data="pcShortcutRows" border stripe>
          <el-table-column prop="shortcut" label="快捷键" min-width="220" />
          <el-table-column prop="mode" label="模式" min-width="150" />
          <el-table-column prop="result" label="结果" min-width="330" />
          <el-table-column prop="boundary" label="状态 / 提交边界" min-width="300" />
        </el-table>
      </section>

      <section id="events" class="doc-prose">
        <h2 class="doc-h2">事件按操作族组织</h2>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-transform-event-map">TransformEventMap</ApiReference>
          把开始、过程和结束分开；用
          <ApiReference kind="method" to="/api/types#api-type-transform-session-method-on">on</ApiReference>
          订阅后保存返回的注销函数，页面离开时主动调用。
        </p>
        <el-table :data="eventRows" border>
          <el-table-column prop="family" label="事件族" width="110" />
          <el-table-column prop="events" label="事件" min-width="330" />
          <el-table-column prop="meaning" label="语义" min-width="310" />
        </el-table>
      </section>

      <section id="working-state" class="doc-prose">
        <h2 class="doc-h2">工作态、历史与 Store 提交</h2>
        <ul>
          <li>拖拽帧只更新临时目标；一次完整操作结束后形成一条 Session 历史命令。</li>
          <li>
            <ApiReference kind="method" to="/api/types#api-type-transform-session-method-finish">finish</ApiReference> 在整个 Session 结束时一次提交最终事务。
          </li>
          <li>
            <ApiReference kind="method" to="/api/types#api-type-transform-session-method-cancel">cancel</ApiReference>
            丢弃尚未提交的预览和历史工作态。
          </li>
          <li>跨世界副本只改变展示坐标；业务状态、事务和历史始终保存规范世界坐标。</li>
          <li>Circle 的历史半径保持米制；平移和旋转不改变业务半径，缩放按既定规则更新。</li>
        </ul>
        <el-alert type="info" :closable="false" show-icon title="复制不是动画快照">
          copy() 复制规范 ElementState，可覆盖 module、layerId、style 等字段；交互预览、动画 elapsed、Handle 和临时样式都不会进入副本。
        </el-alert>
      </section>

      <section id="visual-animation" class="doc-prose">
        <h2 class="doc-h2">手柄视觉与动画协作</h2>
        <el-table :data="cursorRows" border>
          <el-table-column prop="operation" label="操作" min-width="180" />
          <el-table-column prop="hover" label="悬停" min-width="210" />
          <el-table-column prop="active" label="按下 / 操作中" min-width="210" />
        </el-table>
        <p>选框、手柄、复制预览和 Tooltip 都属于 Session 临时资源；Edit 模式使用与独立 Edit 相同的蓝色锚点语义，不显示 Transform 选框。</p>
        <el-alert type="warning" :closable="false" show-icon title="不同动画具有不同 Transform 策略">
          dash-flow 与 path-travel 使用 follow-preview，时间继续推进并跟随 Transform 工作几何；pulse 及
          blink、highlight、alert、grow、radar-scan、center-spread、fade 使用 pause-and-suppress。两种策略都不会把动画帧写入交互工作态或 Store。
        </el-alert>
      </section>

      <section id="lifecycle" class="doc-prose">
        <h2 class="doc-h2">终态与清理</h2>
        <p>
          TransformSession 暴露 <ApiReference kind="method" to="/api/types#api-type-transform-session-method-finish">finish</ApiReference> 和
          <ApiReference kind="method" to="/api/types#api-type-transform-session-method-cancel">cancel</ApiReference>，但没有公开
          <code>destroy()</code>。组件卸载时若 Session 仍为 active，先调用 cancel()；随后执行全部事件注销函数，最后 earth.destroy() 会释放工具栏、光标、Tooltip
          和内部协调资源。
        </p>
        <p>
          <ApiReference kind="property" to="/api/types#api-type-transform-session-property-toolbar">toolbar</ApiReference>
          是可选句柄；若调用方主动取得并单独管理它，可用其 destroy() 幂等释放工具栏视图，但这不等于结束 Transform Session。
        </p>
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        title="Transform 完整 API"
        description="完整展示 Transform 的 Service、Session、Options、EventMap、选择替换选项，以及 Toolbar 的配置、项目和控制句柄。"
      />
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="变换（Transform）" :items="anchors" /></aside>
  </div>
</template>
