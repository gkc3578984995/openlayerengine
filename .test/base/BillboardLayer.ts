import { fromLonLat } from 'ol/proj';
import { BillboardLayer, useEarth } from '../../src';

export const testBillboardLayer = () => {
  const layer = new BillboardLayer();
  layer.add({
    id: 'billboard_1',
    center: fromLonLat([65, 20]),
    src: '../../src/assets/image/fly.svg',
    color: 'red',
    scale: 1,
    anchor: [0.5, 0.5],
    // 旋转 90°（顺时针）。补偿后 displacement 仍应向右；不补偿则会向下。
    rotation: 90,
    displacement: [0, 0],
    label: {
      text: 'billboard',
      font: 'bold 24px serif',
      stroke: {
        color: 'red',
        width: 2
      },
      fill: {
        color: '#fff'
      },

      textAlign: 'center',
      rotation: 0,
      offsetX: 100,
      offsetY: 100
    }
  });
  /**
   * 修改位置
   */
  // layer.set({ id: 'billboard_1', center: fromLonLat([160, 60]) });
  /**
   * 修改信息
   */
  // layer.set({
  //   id: "billboard_x",
  //   label: {
  //     text: "a",
  //   }
  // })
  return () => {
    layer.remove();
    layer.destroy();
  };
};
