import { describe, expect, it } from 'vitest';
import type { ElementState } from '../src/core/element/types.js';
import { INTERNAL_MEASURE_MODULE } from '../src/services/measure/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createMeasureLifecycleHarness, finishActiveSession } from './helpers/drawMeasureLifecycleHarness.js';

const userElement: ElementState = {
  id: 'user-element',
  type: 'point',
  geometry: { type: 'point', controlPoints: [[99, 99]] },
  style: { symbol: { type: 'circle', radius: 3 } },
  module: 'user',
  layerId: 'measure-layer',
  visible: true
};

describe('v2 测量 clear 与服务复用', () => {
  it('clear 只删除测量所有权资源并可继续完成面积测量', async () => {
    coversCapabilities('measure-distance-total', 'measure-area', 'measure-result-payload', 'measure-rightclick-finish', 'measure-clear-reuse');
    const harness = createMeasureLifecycleHarness();
    harness.store.add(userElement);
    harness.overlays.addExternal();
    const first = harness.measure.start({ type: 'distance-total', unit: 'm', precision: 2 });
    harness.drawPort.emit({ type: 'click', coordinate: [0, 0] });
    harness.drawPort.emit({ type: 'click', coordinate: [3, 4] });
    expect(finishActiveSession(harness.coordinator, [3, 4])).toBe('consume');
    await expect(first.finished).resolves.toMatchObject({ type: 'distance-total', value: 5, unit: 'm' });
    expect(harness.store.query({ module: INTERNAL_MEASURE_MODULE }).length).toBeGreaterThan(0);

    harness.measure.clear();

    expect(harness.store.query({ module: INTERNAL_MEASURE_MODULE })).toHaveLength(0);
    expect(harness.store.get('user-element')).toBeDefined();
    expect([...harness.overlays.records.values()].map(({ module }) => module)).toEqual(['external']);

    const second = harness.measure.start({ type: 'area', unit: 'm²' });
    harness.drawPort.emit({ type: 'click', coordinate: [0, 0] });
    harness.drawPort.emit({ type: 'click', coordinate: [4, 0] });
    harness.drawPort.emit({ type: 'click', coordinate: [4, 3] });
    expect(finishActiveSession(harness.coordinator, [4, 3])).toBe('consume');
    await expect(second.finished).resolves.toMatchObject({ type: 'area', value: 6, unit: 'm²' });
    expect(harness.drawPort.records).toHaveLength(2);
    expect(harness.drawPort.records.every(({ destroyCalls }) => destroyCalls === 1)).toBe(true);
    harness.measure.clear();
    harness.destroy();
  });

  it('clear 可取消进行中的预览且不会销毁 MeasureService', async () => {
    const harness = createMeasureLifecycleHarness();
    const active = harness.measure.start({ type: 'distance-segments', unit: 'm' });
    harness.drawPort.emit({ type: 'click', coordinate: [0, 0] });
    harness.drawPort.emit({ type: 'click', coordinate: [6, 8] });
    expect(harness.store.query({ module: INTERNAL_MEASURE_MODULE }).length).toBeGreaterThan(0);

    harness.measure.clear();

    await expect(active.finished).resolves.toBeUndefined();
    expect(active.status).toBe('cancelled');
    expect(harness.store.query({ module: INTERNAL_MEASURE_MODULE })).toHaveLength(0);
    expect(harness.overlays.activeCount).toBe(0);
    const next = harness.measure.start({ type: 'distance-total', unit: 'm' });
    expect(next.status).toBe('active');
    next.cancel();
    harness.destroy();
  });
});
