import CircleLayer from '../../src/base/CircleLayer';
import { PatternFillType, useEarth } from '../../src';
import { fromLonLat } from 'ol/proj';
export const testCircleLayer = () => {
  const layer = new CircleLayer();
  layer.add({
    id: 'circle_1',
    center: fromLonLat([155, 35]),
    radius: 700000,
    stroke: {
      color: '#ee4',
      width: 5
    },
    fill: {
      color: '#fff'
    },
    module: 'circle'
  });
  const patternTypes: PatternFillType[] = ['diagonal', 'cross', 'dot', 'horizontal', 'vertical'];
  const patternColors = ['#d4380d', '#722ed1', '#08979c', '#d46b08', '#1d39c4'];
  patternTypes.forEach((type, index) => {
    layer.add({
      id: `circle_pattern_${type}`,
      center: fromLonLat([120 + (index % 3) * 10, 20 + Math.floor(index / 3) * 10]),
      radius: 350000,
      stroke: { color: patternColors[index], width: 2 },
      fill: {
        type,
        color: patternColors[index],
        size: 16,
        lineWidth: 1,
        dotRadius: 1.5,
        backgroundColor: type === 'dot' ? 'rgba(8,151,156,0.12)' : undefined
      },
      module: 'circle-pattern'
    });
  });
  layer.add({
    id: 'circle_2',
    center: fromLonLat([155, 45]),
    radius: 700000,
    label: {
      text: '带标签圆',
      scale: 1
    },
    module: 'circle'
  });
  /**
   * 修改圆位置
   */
  // layer.setPosition("circle_2", fromLonLat([120, 45]))
  /**
   * 属性修改
   */
  // layer.set({
  //   id: "circle_3",
  //   center: fromLonLat([155, 55]),
  //   radius: 1800000,
  //   stroke: {
  //     width: 10,
  //     color: "red"
  //   },
  //   fill: {
  //     color: "blue"
  //   },
  //   label: {
  //     text: "123"
  //   }
  // })
};
