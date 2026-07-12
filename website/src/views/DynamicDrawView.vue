<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import DynamicDrawDemo from '../examples/DynamicDrawDemo.vue';
import dynamicDrawSource from '../examples/DynamicDrawDemo.vue?raw';

interface ApiColumn {
  prop: string;
  label: string;
  width?: number;
  monospace?: boolean;
  presentation?: 'property' | 'method';
}

const anchors = [
  { id: 'overview', label: 'Overview' },
  { id: 'examples', label: 'Examples', children: [{ id: 'example-drawing-and-plot', label: 'Drawing and plot' }] },
  {
    id: 'api',
    label: 'API',
    children: [
      {
        id: 'api-types',
        label: 'Types',
        children: [
          { id: 'api-type-drawtype', label: 'DrawType' },
          { id: 'api-type-modifytype', label: 'ModifyType' },
          { id: 'api-type-idrawbase', label: 'IDrawBase' },
          { id: 'api-type-idrawevent', label: 'IDrawEvent' },
          { id: 'api-type-imodifyevent', label: 'IModifyEvent' },
          { id: 'api-type-idrawpoint', label: 'IDrawPoint' },
          { id: 'api-type-idrawline', label: 'IDrawLine' },
          { id: 'api-type-idrawpolygon', label: 'IDrawPolygon' },
          { id: 'api-type-ieditparam', label: 'IEditParam' }
        ]
      },
      { id: 'api-methods', label: 'Methods' }
    ]
  },
  { id: 'tips', label: 'Tips' }
];

const propertyCols: ApiColumn[] = [
  { prop: 'name', label: 'Property', width: 180, presentation: 'property' },
  { prop: 'desc', label: 'Description', width: 310 },
  { prop: 'type', label: 'Type', width: 300, monospace: true }
];
const methodCols: ApiColumn[] = [
  { prop: 'name', label: 'Method', width: 270, presentation: 'method' },
  { prop: 'desc', label: 'Description', width: 280 },
  { prop: 'params', label: 'Parameters', width: 320, monospace: true },
  { prop: 'returns', label: 'Returns', width: 150, monospace: true }
];
const drawBaseRows = [
  { name: 'keepGraphics', desc: 'Keep completed graphics.', type: 'boolean?' },
  { name: 'callback', desc: 'Receives drawing lifecycle events.', type: '(event: <a href="#api-type-idrawevent">IDrawEvent</a>) =&gt; void' }
];
const drawEventRows = [
  { name: 'type', desc: 'Drawing lifecycle kind.', type: '<a href="#api-type-drawtype">DrawType</a>' },
  { name: 'eventPosition', desc: 'Coordinate at which the event occurred.', type: 'Coordinate | Coordinate[]' },
  { name: 'featurePosition', desc: 'Coordinates of the completed feature.', type: 'Coordinate | Coordinate[]?' },
  { name: 'feature', desc: 'Completed feature when available.', type: 'Feature&lt;Geometry&gt;?' },
  { name: 'ctlPoints', desc: 'Control points for a completed plot.', type: 'Coordinate[]?' },
  { name: 'center', desc: 'Circle centre when the drawn geometry is a circle.', type: 'Coordinate?' },
  { name: 'radius', desc: 'Circle radius when the drawn geometry is a circle.', type: 'number?' }
];
const modifyEventRows = [
  { name: 'type', desc: 'Editing lifecycle kind.', type: '<a href="#api-type-modifytype">ModifyType</a>' },
  { name: 'position', desc: 'Edited feature coordinate.', type: 'Coordinate | Coordinate[]?' },
  { name: 'plotParam', desc: 'Plot editing payload.', type: 'IPlotEditEventPayload?' }
];
const pointRows = [
  ...drawBaseRows,
  { name: 'limit', desc: 'Maximum point count; zero repeats.', type: 'number?' },
  { name: 'size', desc: 'Point size.', type: 'number?' },
  { name: 'fillColor', desc: 'Point fill colour.', type: 'string?' }
];
const lineRows = [
  ...drawBaseRows,
  { name: 'backgroundStroke', desc: 'Stroke rendered below the main stroke.', type: 'IStroke?' },
  { name: 'strokeColor', desc: 'Stroke colour.', type: 'string?' },
  { name: 'strokeWidth', desc: 'Stroke width.', type: 'number?' }
];
const polygonRows = [
  ...lineRows,
  { name: 'fillColor', desc: 'Polygon fill colour.', type: 'string?' },
  { name: 'fill', desc: 'Polygon fill style.', type: 'IGeometryFill?' }
];
const editRows = [
  { name: 'feature', desc: 'Feature to edit.', type: 'Feature&lt;Geometry&gt;' },
  { name: 'isShowUnderlay', desc: 'Show the reference map beneath plot editing.', type: 'boolean?' },
  { name: 'callback', desc: 'Receives editing events.', type: '(event: <a href="#api-type-imodifyevent">IModifyEvent</a>) =&gt; void' }
];
const methods = [
  ['drawLine', 'Start a line drawing session.', 'param?: <a href="#api-type-idrawline">IDrawLine</a>', 'void'],
  ['drawPoint', 'Start a point drawing session.', 'param?: <a href="#api-type-idrawpoint">IDrawPoint</a>', 'void'],
  ['drawPolygon', 'Start a polygon drawing session.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawCircle', 'Draw a circle plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawEllipse', 'Draw an ellipse plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawAttackArrow', 'Draw an attack arrow plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawTailedAttackArrow', 'Draw a tailed attack arrow plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawFineArrow', 'Draw a fine arrow plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawTailedSquadCombatArrow', 'Draw a tailed squad combat arrow.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawAssaultDirectionArrow', 'Draw an assault direction arrow.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawDoubleArrow', 'Draw a double arrow plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawRectAnglePolygon', 'Draw a rectangle plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawTrianglePolygon', 'Draw a triangle plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawEquilateralTrianglePolygon', 'Draw an equilateral triangle plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawAssemblePolygon', 'Draw an assemble polygon plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawClosedCurvePolygon', 'Draw a closed curve plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawSectorPolygon', 'Draw a sector plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawLunePolygon', 'Draw a lune polygon plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawLunePolyline', 'Draw a lune polyline plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['drawCurvePolyline', 'Draw a curve polyline plot.', 'param?: <a href="#api-type-idrawpolygon">IDrawPolygon</a>', 'void'],
  ['editAttackArrow', 'Edit an attack arrow.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editTailedAttackArrow', 'Edit a tailed attack arrow.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editFineArrow', 'Edit a fine arrow.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editTailedSquadCombatArrow', 'Edit a tailed squad combat arrow.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editAssaultDirectionArrow', 'Edit an assault direction arrow.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editDoubleArrow', 'Edit a double arrow.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editRectAnglePolygon', 'Edit a rectangle plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editTrianglePolygon', 'Edit a triangle plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editEquilateralTrianglePolygon', 'Edit an equilateral triangle plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editAssemblePolygon', 'Edit an assemble polygon plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editClosedCurvePolygon', 'Edit a closed curve plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editSectorPolygon', 'Edit a sector plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editCircle', 'Edit a circle plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editEllipse', 'Edit an ellipse plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editLunePolygon', 'Edit a lune polygon plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editLunePolyline', 'Edit a lune polyline plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editCurvePolyline', 'Edit a curve polyline plot.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editPolygon', 'Edit a polygon.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editPolyline', 'Edit a polyline.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['editPoint', 'Edit a point.', 'param: <a href="#api-type-ieditparam">IEditParam</a>', 'void'],
  ['get', 'Get saved drawing features.', "type?: 'Point' | 'LineString' | 'Polygon'", 'Feature&lt;Geometry&gt;[]?'],
  ['remove', 'Remove a saved feature or current temporary drawing.', 'feature?: Feature&lt;Geometry&gt;', 'void'],
  ['destroy', 'Dispose interactions, overlays, and optional graphics.', 'options?: { removeGraphics?: boolean; removeLayers?: boolean }', 'void']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">Map interactions</span>
        <h1>DynamicDraw</h1>
        <p>Draw standard map geometries and tactical plots, then retrieve, edit, remove, or dispose the resulting features.</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">Overview</h2>
        <p>
          <code>Earth.useDrawTool()</code> returns the drawing service. Drawing callbacks use <code><a href="#api-type-idrawevent">IDrawEvent</a></code
          >; plot and geometry editing use <code><a href="#api-type-imodifyevent">IModifyEvent</a></code
          >.
        </p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">Examples</h2>
        <div id="example-drawing-and-plot">
          <ExampleBlock
            title="Standard drawing and a plot"
            :description="`Use <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>drawPoint</a></code> for an ordinary geometry and <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>drawAttackArrow</a></code> for a plot. The demo also calls <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>get</a></code> and <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>remove</a></code>.`"
            :source="dynamicDrawSource"
            ><template #preview><DynamicDrawDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-types" class="doc-h3">Types</h3>
        <h4 id="api-type-drawtype" class="doc-h4">DrawType</h4>
        <p><code>Drawstart | Drawing | Drawend | DrawingClick | Drawexit</code></p>
        <h4 id="api-type-modifytype" class="doc-h4">ModifyType</h4>
        <p><code>Modifying | Modifyexit</code></p>
        <h4 id="api-type-idrawbase" class="doc-h4">IDrawBase</h4>
        <ApiTable :columns="propertyCols" :rows="drawBaseRows" />
        <h4 id="api-type-idrawevent" class="doc-h4">IDrawEvent</h4>
        <ApiTable :columns="propertyCols" :rows="drawEventRows" />
        <h4 id="api-type-imodifyevent" class="doc-h4">IModifyEvent</h4>
        <ApiTable :columns="propertyCols" :rows="modifyEventRows" />
        <h4 id="api-type-idrawpoint" class="doc-h4">IDrawPoint</h4>
        <ApiTable :columns="propertyCols" :rows="pointRows" />
        <h4 id="api-type-idrawline" class="doc-h4">IDrawLine</h4>
        <ApiTable :columns="propertyCols" :rows="lineRows" />
        <h4 id="api-type-idrawpolygon" class="doc-h4">IDrawPolygon</h4>
        <ApiTable :columns="propertyCols" :rows="polygonRows" />
        <h4 id="api-type-ieditparam" class="doc-h4">IEditParam</h4>
        <ApiTable :columns="propertyCols" :rows="editRows" />
        <h3 id="api-methods" class="doc-h3">Methods</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">Tips</h2>
        <ul class="doc-list">
          <li>Start one drawing session at a time; right-click exits the active drawing or editing interaction.</li>
          <li>
            Call <code class="code-fn"><a href="#api-methods">destroy</a></code> before destroying its <code>Earth</code> instance.
          </li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="DynamicDraw" :items="anchors" /></aside>
  </div>
</template>
