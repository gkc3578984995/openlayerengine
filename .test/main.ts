import { useEarth } from '../src/useEarth';
import { testBillboardLayer } from './base/BillboardLayer';
import { testCircleLayer } from './base/CircleLayer';
import { testOverlayLayer } from './base/OverlayLayer';
import { testPointLayer } from './base/PointLayer';
import { testPolygonLayer } from './base/PolygonLayer';
import { testPolylineLayer } from './base/PolylineLayer';
import { testWindLayer } from './base/WindLayer';
import { testContextMenu } from './components/ContextMenu';
import { testDescriptor } from './components/Descriptor';
import { testDynamicDraw } from './components/DynamicDraw';
import { testGlobalEvent } from './components/GlobalEvent';
import { testMeasure } from './components/Measure';
import { testTransform } from './components/Transform';
import { testLayeredOutline } from './features/LayeredOutline';
import { DemoDefinition, DemoRegistry } from './harness/demoRegistry';
import { DemoPanel } from './harness/demoPanel';
import '../src/assets/style/index.scss';
import './harness/demoPanel.scss';

window.onload = () => {
  const earth = useEarth({ maxZoom: 18 }, {});
  earth.addLayer(earth.createOsmLayer());

  const demos: DemoDefinition[] = [
    { id: 'billboard-layer', group: 'Base layers', label: 'Billboard layer', mount: testBillboardLayer },
    { id: 'circle-layer', group: 'Base layers', label: 'Circle layer', mount: testCircleLayer },
    { id: 'overlay-layer', group: 'Base layers', label: 'Overlay layer', mount: testOverlayLayer },
    { id: 'point-layer', group: 'Base layers', label: 'Point layer', mount: testPointLayer },
    { id: 'polygon-layer', group: 'Base layers', label: 'Polygon layer', mount: testPolygonLayer },
    { id: 'polyline-layer', group: 'Base layers', label: 'Polyline layer', mount: testPolylineLayer },
    { id: 'wind-layer', group: 'Base layers', label: 'Wind layer', mount: testWindLayer },
    { id: 'layered-outline', group: 'Features', label: 'Layered outline', mount: testLayeredOutline },
    { id: 'context-menu', group: 'Components', label: 'Context menu', mount: testContextMenu },
    { id: 'descriptor', group: 'Components', label: 'Descriptor', mount: testDescriptor },
    { id: 'dynamic-draw', group: 'Components', label: 'Dynamic draw', mount: testDynamicDraw },
    { id: 'global-event', group: 'Components', label: 'Global event', mount: testGlobalEvent },
    { id: 'measure', group: 'Components', label: 'Measure', mount: testMeasure },
    { id: 'transform', group: 'Components', label: 'Transform', mount: testTransform }
  ];

  const registry = new DemoRegistry(demos);
  new DemoPanel(registry, demos).mount();
};
