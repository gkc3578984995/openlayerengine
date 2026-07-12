<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import MeasureDemo from '../examples/MeasureDemo.vue';
import measureSource from '../examples/MeasureDemo.vue?raw';

interface ApiColumn {
  prop: string;
  label: string;
  width?: number;
  monospace?: boolean;
  presentation?: 'property' | 'method';
}

const anchors = [
  { id: 'overview', label: 'Overview' },
  { id: 'examples', label: 'Examples', children: [{ id: 'example-line-and-area', label: 'Line and area' }] },
  {
    id: 'api',
    label: 'API',
    children: [
      {
        id: 'api-types',
        label: 'Types',
        children: [
          { id: 'api-type-imeasure', label: 'IMeasure' },
          { id: 'api-type-imeasuredata', label: 'IMeasureData' },
          { id: 'api-type-imeasureevent', label: 'IMeasureEvent' }
        ]
      },
      { id: 'api-methods', label: 'Methods' }
    ]
  },
  { id: 'tips', label: 'Tips' }
];
const propertyCols: ApiColumn[] = [
  { prop: 'name', label: 'Property', width: 190, presentation: 'property' },
  { prop: 'desc', label: 'Description', width: 310 },
  { prop: 'type', label: 'Type', width: 300, monospace: true }
];
const methodCols: ApiColumn[] = [
  { prop: 'name', label: 'Method', width: 250, presentation: 'method' },
  { prop: 'desc', label: 'Description', width: 320 },
  { prop: 'params', label: 'Parameters', width: 300, monospace: true },
  { prop: 'returns', label: 'Returns', width: 150, monospace: true }
];
const measureRows = [
  { name: 'lineColor', desc: 'Measurement line colour.', type: 'string?' },
  { name: 'lineWidth', desc: 'Measurement line width.', type: 'number?' },
  { name: 'pointShow', desc: 'Show vertices for completed measurements.', type: 'boolean?' },
  { name: 'pointColor', desc: 'Vertex colour.', type: 'string?' },
  { name: 'pointSzie', desc: 'Vertex size. The spelling follows the public API.', type: 'number?' },
  { name: 'textColor', desc: 'Label text colour.', type: 'string?' },
  { name: 'textSize', desc: 'Label text size.', type: 'number?' },
  { name: 'textBackgroundColor', desc: 'Label background colour.', type: 'string?' },
  { name: 'isShowTotalDistance', desc: 'Show total distance label.', type: 'boolean?' },
  { name: 'callback', desc: 'Receives measurement data.', type: '(event: <a href="#api-type-imeasureevent">IMeasureEvent</a>) =&gt; void' }
];
const measureDataRows = [
  { name: 'startP', desc: 'Segment start coordinate.', type: 'Coordinate' },
  { name: 'endP', desc: 'Segment end coordinate.', type: 'Coordinate' },
  { name: 'distance', desc: 'Segment distance in kilometres.', type: 'number' }
];
const measureEventRows = [
  { name: 'data', desc: 'Segment data or polygon coordinates.', type: '<a href="#api-type-imeasuredata">IMeasureData</a>[] | any' },
  { name: 'totalDistance', desc: 'Line measurement total in kilometres.', type: 'number?' },
  { name: 'area', desc: 'Polygon area in square kilometres.', type: 'number?' }
];
const methods = [
  ['lineSegmentation', 'Measure a line and display segment distances.', 'param: <a href="#api-type-imeasure">IMeasure</a>', 'void'],
  ['lineFirst', 'Measure a line and show its first-point total.', 'param: <a href="#api-type-imeasure">IMeasure</a>', 'void'],
  ['lineCenter', 'Measure a line from its centre.', 'param: <a href="#api-type-imeasure">IMeasure</a>', 'void'],
  ['polygonMeasure', 'Measure a polygon area.', 'param: <a href="#api-type-imeasure">IMeasure</a>', 'void'],
  ['clear', 'Remove active measurement interactions and graphics.', '—', 'void']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">Map interactions</span>
        <h1>Measure</h1>
        <p>Measure line distance and polygon area directly on the map, with callbacks that expose the completed data.</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">Overview</h2>
        <p>
          <code>Earth.useMeasure()</code> provides line and area workflows. Configure each session with
          <code><a href="#api-type-imeasure">IMeasure</a></code> and consume results through <code><a href="#api-type-imeasureevent">IMeasureEvent</a></code
          >.
        </p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">Examples</h2>
        <div id="example-line-and-area">
          <ExampleBlock
            title="Line and area measurement"
            :description="`Start <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>lineSegmentation</a></code> or <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>polygonMeasure</a></code> and inspect callback values. Use <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>clear</a></code> to release the current measurement.`"
            :source="measureSource"
            ><template #preview><MeasureDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-types" class="doc-h3">Types</h3>
        <h4 id="api-type-imeasure" class="doc-h4">IMeasure</h4>
        <ApiTable :columns="propertyCols" :rows="measureRows" />
        <h4 id="api-type-imeasuredata" class="doc-h4">IMeasureData</h4>
        <ApiTable :columns="propertyCols" :rows="measureDataRows" />
        <h4 id="api-type-imeasureevent" class="doc-h4">IMeasureEvent</h4>
        <ApiTable :columns="propertyCols" :rows="measureEventRows" />
        <h3 id="api-methods" class="doc-h3">Methods</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">Tips</h2>
        <ul class="doc-list">
          <li>Right-click exits the active measurement session; the callback then receives completed data.</li>
          <li>
            Call <code class="code-fn"><a href="#api-methods">clear</a></code> before destroying its <code>Earth</code> instance.
          </li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="Measure" :items="anchors" /></aside>
  </div>
</template>
