import { describe, expect, it, vi } from 'vitest';
import { INTERNAL_MEASURE_MODULE } from '../src/services/measure/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createMeasureLifecycleHarness } from './helpers/drawMeasureLifecycleHarness.js';

describe('v2 测量监听生命周期', () => {
  it('替换测量会话只释放自身端口、预览、tooltip 与输入订阅', async () => {
    coversCapabilities('measure-dynamic-tooltip', 'measure-clear-reuse');
    const harness = createMeasureLifecycleHarness();
    const externalKeydown = vi.fn();
    const disposeExternal = harness.input.on('keydown', externalKeydown);
    const first = harness.measure.start({ type: 'distance-total', unit: 'm' });
    const cancelled = vi.fn();
    first.on('cancel', cancelled);
    harness.drawPort.emit({ type: 'click', coordinate: [0, 0] });
    harness.drawPort.emit({ type: 'click', coordinate: [3, 4] });
    const firstRecord = harness.drawPort.records[0];

    expect(harness.store.query({ module: INTERNAL_MEASURE_MODULE }).length).toBeGreaterThan(0);
    expect(harness.tooltips.activeCount).toBeGreaterThan(0);
    expect(harness.overlays.activeCount).toBeGreaterThan(0);
    expect(harness.input.activeCount).toBe(2);

    const second = harness.measure.start({ type: 'distance-segments', unit: 'm' });

    await expect(first.finished).resolves.toBeUndefined();
    expect(first.status).toBe('cancelled');
    expect(cancelled).toHaveBeenCalledWith(expect.objectContaining({ reason: 'replaced' }));
    expect(firstRecord.destroyCalls).toBe(1);
    expect(harness.store.query({ module: INTERNAL_MEASURE_MODULE })).toHaveLength(0);
    expect(harness.tooltips.activeCount).toBe(0);
    expect(harness.overlays.activeCount).toBe(0);
    expect(harness.input.activeCount).toBe(2);
    expect(harness.input.disposals).toBe(1);
    harness.input.emit('x');
    expect(externalKeydown).toHaveBeenCalledOnce();

    second.cancel();
    await expect(second.finished).resolves.toBeUndefined();
    expect(harness.input.activeCount).toBe(1);
    expect(harness.input.disposals).toBe(2);
    disposeExternal();
    expect(harness.input.activeCount).toBe(0);
    harness.destroy();
  });
});
