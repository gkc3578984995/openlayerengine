import { Collection, Feature } from 'ol';
import { LineString, Polygon } from 'ol/geom';
import { Modify, Select, Translate } from 'ol/interaction';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { PatternFillType, PointLayer, PolygonLayer, useEarth } from '../../src';
import { Coordinate } from 'ol/coordinate';
export const testPolygonLayer = () => {
  const layer = new PolygonLayer(useEarth());
  const polygon = <Feature<Polygon>>layer.add({
    id: 'polygon_1',
    positions: [[fromLonLat([110, 30]), fromLonLat([110, 50]), fromLonLat([120, 40]), fromLonLat([110, 30])]],
    label: {
      text: '带标签多边形'
    },
    module: 'polygon'
  });
  layer.add({
    id: 'polygon_2',
    positions: [[fromLonLat([110, 10]), fromLonLat([110, 20]), fromLonLat([120, 30]), fromLonLat([110, 10])]],
    fill: {
      color: '#fffff3'
    }
  });
  const patternExamples: Array<{ id: string; type: PatternFillType; positions: Coordinate[][]; color?: string; backgroundColor?: string }> = [
    {
      id: 'polygon_pattern_diagonal',
      type: 'diagonal',
      color: '#d4380d',
      positions: [[fromLonLat([125, 40]), fromLonLat([125, 45]), fromLonLat([130, 45]), fromLonLat([130, 40]), fromLonLat([125, 40])]]
    },
    {
      id: 'polygon_pattern_cross',
      type: 'cross',
      color: '#722ed1',
      positions: [[fromLonLat([132, 40]), fromLonLat([132, 45]), fromLonLat([137, 45]), fromLonLat([137, 40]), fromLonLat([132, 40])]]
    },
    {
      id: 'polygon_pattern_dot',
      type: 'dot',
      color: '#08979c',
      backgroundColor: 'rgba(8,151,156,0.12)',
      positions: [[fromLonLat([139, 40]), fromLonLat([139, 45]), fromLonLat([144, 45]), fromLonLat([144, 40]), fromLonLat([139, 40])]]
    },
    {
      id: 'polygon_pattern_horizontal',
      type: 'horizontal',
      color: '#d46b08',
      positions: [[fromLonLat([125, 32]), fromLonLat([125, 37]), fromLonLat([130, 37]), fromLonLat([130, 32]), fromLonLat([125, 32])]]
    },
    {
      id: 'polygon_pattern_vertical',
      type: 'vertical',
      color: '#1d39c4',
      positions: [[fromLonLat([132, 32]), fromLonLat([132, 37]), fromLonLat([137, 37]), fromLonLat([137, 32]), fromLonLat([132, 32])]]
    }
  ];
  patternExamples.forEach((example) => {
    layer.add({
      id: example.id,
      positions: example.positions,
      stroke: { color: example.color, width: 2 },
      fill: {
        type: example.type,
        color: example.color,
        size: 16,
        lineWidth: 1,
        dotRadius: 1.5,
        backgroundColor: example.backgroundColor
      }
    });
  });
  // useEarth().useDrawTool().editPolygon({
  //   feature: polygon,
  //   isShowUnderlay: true,
  //   callback: (e) => {
  //     console.log(e)
  //   }
  // });
};
