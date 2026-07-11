import { useEarth } from '../src/useEarth';
import { testBillboardLayer } from './base/BillboardLayer';
import { testCircleLayer } from './base/CircleLayer';
import { testOverlayLayer } from './base/OverlayLayer';
import { testPointLayer } from './base/PointLayer';
import { testPolygonLayer } from './base/PolygonLayer';
import { testPolylineLayer } from './base/PolylineLayer';
import { testWindLayer } from './base/WindLayer';
import { testDescriptor } from './components/Descriptor';
import { testDynamicDraw } from './components/DynamicDraw';
import { testGlobalEvent } from './components/GlobalEvent';
import { testMeasure } from './components/Measure';
import { testContextMenu } from './components/ContextMenu';
import '../src/assets/style/index.scss';
import { testTransform } from './components/Transform';

window.onload = () => {
  const earth = useEarth({maxZoom: 18},{});
  // earth.addLayer(earth.createXyzLayer('http://192.168.50.200:8080/_alllayers'));
  earth.addLayer(earth.createOsmLayer());
  testBillboardLayer();

  testCircleLayer()
  testPointLayer()
  testPolygonLayer();
  testPolylineLayer();
  testTransform();
  // testOverlayLayer();
  // testGlobalEvent();
  // testDynamicDraw();
  // testMeasure();
  // testWindLayer();
  // testDescriptor();
  // testContextMenu();
};
