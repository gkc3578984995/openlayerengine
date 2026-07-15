import { describe, expect, it } from 'vitest';
import { renderExtent } from '../src/adapters/openlayers/transform/PreviewTransform.js';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('Transform 几何变换', () => {
  it('按图形定义变换点与圆，并保持各自的几何语义', () => {
    const pointHarness = createTransformHarness();
    addElement(pointHarness, 'point-a', 'point', [[1, 2]]);
    const pointSession = pointHarness.service.select('point-a');
    translate(pointHarness, 2, -1);
    pointSession.finish();

    const circleHarness = createTransformHarness();
    addElement(circleHarness, 'circle-a', 'circle', [
      [3, 4],
      [8, 4]
    ]);
    const circleSession = circleHarness.service.select('circle-a');
    translate(circleHarness, 2, -1);
    circleSession.finish();

    expect(pointHarness.store.get('point-a')?.geometry).toEqual({ type: 'point', controlPoints: [[3, 1]] });
    expect(circleHarness.store.get('circle-a')?.geometry).toEqual({ type: 'circle', center: [5, 3], radius: 5 });
  });

  it('以单次线性扫描计算超大几何范围，不使用展开参数', () => {
    const coordinates = Array.from({ length: 200_000 }, (_, index) => [index, 1 - index] as const);

    expect(renderExtent({ type: 'polyline', coordinates })).toEqual([0, -199_998, 199_999, 1]);
  });
});

function translate(harness: ReturnType<typeof createTransformHarness>, x: number, y: number): void {
  harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
  harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: { type: 'translate', x, y } });
}
