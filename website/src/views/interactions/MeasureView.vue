<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import MeasureSessionDemo from '../../examples/interactions/MeasureSessionDemo.vue';
import measureSessionSource from '../../examples/interactions/MeasureSessionDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const anchors = [
  { id: 'overview', label: '测量会话' },
  { id: 'method-examples', label: 'API 与示例' },
  { id: 'example-measure-session', label: '距离与面积' },
  { id: 'measure-types', label: '四种测量类型' },
  { id: 'events-results', label: '事件与结果' },
  { id: 'lifecycle', label: '完成、取消与清理' },
  { id: 'api', label: '完整 API' }
];

const measureSessionSnippet = extractExampleSnippet(measureSessionSource, 'measure-options-and-results');

const methodExampleRows = [
  { owner: 'MeasureService', members: 'start()', focus: '类型、单位、formatter 与三类视觉样式' },
  { owner: 'MeasureService', members: 'clear()', focus: '移除全部测量图形与 Overlay' },
  { owner: 'MeasureSession', members: 'status / finished', focus: '会话状态与最终 MeasureResult' },
  { owner: 'MeasureSession', members: 'finish() / cancel()', focus: '确认结果或丢弃草图' },
  { owner: 'MeasureSession', members: 'on()', focus: 'change / complete / cancel 事件' }
];

const typeRows = [
  { type: 'distance-segments', geometry: 'Polyline', meaning: '逐段距离，可选累计结果', units: 'm | km' },
  { type: 'distance-total', geometry: 'Polyline', meaning: '整条路径的总距离', units: 'm | km' },
  { type: 'distance-radial', geometry: 'Polyline', meaning: '以起点为中心的径向距离', units: 'm | km' },
  { type: 'area', geometry: 'Polygon', meaning: '闭合区域面积', units: 'm² | km²' }
];

const eventRows = [
  { name: 'change', payload: 'result: MeasureResult', meaning: '预览变化；结果是只读快照' },
  { name: 'complete', payload: 'result: MeasureResult', meaning: '用户确认后的最终结果' },
  { name: 'cancel', payload: 'reason', meaning: '会话未产生最终结果而结束' }
];

const resultRows = [
  { field: 'value / unit / formatted', meaning: '数值、单位和可直接展示的格式化文本' },
  { field: 'geometry', meaning: '当前测量图形的 ShapeState 快照' },
  { field: 'coordinates', meaning: '当前 Earth 的 View 投影坐标' },
  { field: 'geographicCoordinates', meaning: '转换后的 EPSG:4326 经纬度坐标' },
  { field: 'segments', meaning: '距离测量逐段明细；面积测量为空数组' }
];

const apiTypes = ['MeasureService', 'MeasureOptions', 'MeasureSession', 'MeasureSessionEventMap', 'MeasureResult', 'MeasureType'];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图交互</span>
        <h1>测量（Measure）</h1>
        <p>复用 Draw 交互采集控制点，以只读 MeasureResult 同时返回业务单位、投影坐标和经纬度坐标。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">Measure 复用同一套交互内核</h2>
        <p>
          从 <ApiReference kind="property" to="/api/types#api-type-earth-property-measure">earth.measure</ApiReference> 调用
          <ApiReference kind="method" to="/api/types#api-type-measure-service-method-start">start</ApiReference>，传入
          <ApiReference kind="type" to="/api/types#api-type-measure-options">MeasureOptions</ApiReference>。 Measure
          不维护第二套绘制逻辑，因此与 Draw、Edit 和 Transform 共享相同的冲突策略、预览清理和光标恢复边界。
        </p>
        <el-alert type="info" :closable="false" show-icon title="单位由测量类型约束">
          距离只接受 m / km，面积只接受 m² / km²；precision 默认为 2，formatter 可统一替换展示文本，但不会改变 result.value。
        </el-alert>
      </section>

      <section id="method-examples" class="doc-prose">
        <h2 class="doc-h2">公开成员如何对应到示例</h2>
        <p>示例把 MeasureOptions 的 formatter、line、point、text、precision 和 showTotal 全部做成可调整控件，并直接展示结构化结果。</p>
        <el-table :data="methodExampleRows" border stripe>
          <el-table-column prop="owner" label="归属" min-width="160" />
          <el-table-column prop="members" label="属性 / 方法" min-width="240" />
          <el-table-column prop="focus" label="示例重点" min-width="330" />
          <el-table-column label="示例" width="120">
            <template #default><el-link type="primary" href="#example-measure-session">查看示例</el-link></template>
          </el-table-column>
        </el-table>
      </section>

      <section id="example-measure-session" class="doc-prose">
        <ExampleBlock title="自定义 formatter、样式并读取测量结果" :source="measureSessionSource" :snippet="measureSessionSnippet">
          <template #description>
            <p>
              示例使用根导出的 <code>measureTypes</code> 构建选择器，监听
              <ApiReference kind="method" to="/api/types#api-type-measure-session-method-on">MeasureSession.on</ApiReference>，并通过
              <ApiReference kind="method" to="/api/types#api-type-measure-session-method-finish">finish</ApiReference>、
              <ApiReference kind="method" to="/api/types#api-type-measure-session-method-cancel">cancel</ApiReference> 与
              <ApiReference kind="method" to="/api/types#api-type-measure-service-method-clear">measure.clear</ApiReference>
              管理完整生命周期。分段结果使用 Element Plus 表格展示，不输出事件日志或原始 JSON。
            </p>
          </template>
          <template #preview><MeasureSessionDemo /></template>
        </ExampleBlock>
      </section>

      <section id="measure-types" class="doc-prose">
        <h2 class="doc-h2">四种测量类型</h2>
        <el-table :data="typeRows" border>
          <el-table-column prop="type" label="MeasureType" min-width="190" />
          <el-table-column prop="geometry" label="采集几何" min-width="130" />
          <el-table-column prop="meaning" label="语义" min-width="260" />
          <el-table-column prop="units" label="合法单位" min-width="130" />
        </el-table>
        <p>所有坐标仍以当前 View 投影作为 Element 和交互输入；需要持久化经纬度时直接读取结果中的 geographicCoordinates。</p>
      </section>

      <section id="events-results" class="doc-prose">
        <h2 class="doc-h2">事件与 MeasureResult</h2>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-measure-session-event-map">MeasureSessionEventMap</ApiReference>
          的 change 与 complete 都携带完整
          <ApiReference kind="type" to="/api/types#api-type-measure-result">MeasureResult</ApiReference>。
        </p>
        <el-table :data="eventRows" border>
          <el-table-column prop="name" label="事件" width="120" />
          <el-table-column prop="payload" label="载荷" min-width="230" />
          <el-table-column prop="meaning" label="语义" min-width="310" />
        </el-table>
        <el-table :data="resultRows" border>
          <el-table-column prop="field" label="结果字段" min-width="240" />
          <el-table-column prop="meaning" label="说明" min-width="430" />
        </el-table>
      </section>

      <section id="lifecycle" class="doc-prose">
        <h2 class="doc-h2">完成、取消与清理</h2>
        <ul>
          <li>
            <ApiReference kind="method" to="/api/types#api-type-measure-session-method-finish">finish</ApiReference>
            尝试确认当前合法结果；输入不足时按 incomplete 取消。
          </li>
          <li>
            <ApiReference kind="method" to="/api/types#api-type-measure-session-method-cancel">cancel</ApiReference>
            丢弃未完成结果并释放当前交互。
          </li>
          <li>
            <ApiReference kind="property" to="/api/types#api-type-measure-session-property-finished">finished</ApiReference> 完成时返回
            MeasureResult，取消时返回 undefined。
          </li>
          <li>
            <ApiReference kind="method" to="/api/types#api-type-measure-service-method-clear">clear</ApiReference> 会取消活动 Session，并移除
            MeasureService 拥有的测量图形与 Overlay。
          </li>
        </ul>
        <el-alert type="warning" :closable="false" show-icon title="MeasureSession 没有公开 destroy()">
          单次会话使用 finish() 或 cancel() 进入终态；页面卸载时先调用 cancel()（若仍 active），再调用 measure.clear()，最后 earth.destroy()
          会统一释放服务内部资源。
        </el-alert>
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :runtime-names="['measureTypes']"
        title="Measure 完整 API"
        description="完整展示 measureTypes、MeasureService、MeasureOptions、MeasureSession、MeasureSessionEventMap、MeasureResult 与 MeasureType。"
      />
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="测量（Measure）" :items="anchors" /></aside>
  </div>
</template>
