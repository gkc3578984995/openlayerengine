import { PolygonLayer, PolylineLayer, useEarth } from '../../src';
import { fromLonLat } from 'ol/proj';

export const testLayeredOutline = () => {
  const earth = useEarth();
  const polygonLayer = new PolygonLayer(earth);
  const polylineLayer = new PolylineLayer(earth);

  polygonLayer.add({
    id: 'layered-outline-polygon',
    positions: [[fromLonLat([100, 35]), fromLonLat([100, 42]), fromLonLat([112, 42]), fromLonLat([112, 35]), fromLonLat([100, 35])]],
    fill: { color: 'rgba(14, 165, 233, 0.18)' },
    outerStroke: { color: '#0f172a', width: 10 },
    innerStroke: { color: '#38bdf8', width: 10 },
    label: { text: 'Layered polygon outline' }
  });

  polylineLayer.add({
    id: 'layered-outline-polyline',
    positions: [fromLonLat([96, 28]), fromLonLat([105, 31]), fromLonLat([116, 27])],
    outerStroke: { color: '#312e81', width: 12 },
    innerStroke: { color: '#facc15', width: 5 },
    label: { text: 'Layered polyline outline', offsetY: 12 }
  });

  return () => {
    polygonLayer.remove();
    polygonLayer.destroy();
    polylineLayer.remove();
    polylineLayer.destroy();
  };
};
