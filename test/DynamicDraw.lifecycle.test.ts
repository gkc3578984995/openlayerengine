import { describe, expect, it, vi } from 'vitest';
import type { StyleSpec } from '../src/core/style/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createDrawLifecycleHarness, finishActiveSession } from './helpers/drawMeasureLifecycleHarness.js';

const lineStyle: StyleSpec = {
  strokes: [
    { color: '#00ff36', width: 8, lineDash: [10, 6] },
    { color: '#ffcc33', width: 2 }
  ]
};

describe('v2 动态绘制监听与资源生命周期', () => {
  it('会话替换只销毁旧会话拥有的端口和输入监听', async () => {
    coversCapabilities('draw-session-events', 'draw-session-destroy');
    const harness = createDrawLifecycleHarness();
    const first = harness.draw.start({ type: 'polyline', layerId: 'draw-layer', style: lineStyle });
    const cancelled = vi.fn();
    first.on('cancel', cancelled);
    harness.drawPort.emit({ type: 'click', coordinate: [0, 0] });
    const firstRecord = harness.drawPort.records[0];

    const second = harness.draw.start({ type: 'point', layerId: 'draw-layer', limit: 1 });

    await expect(first.finished).resolves.toEqual([]);
    expect(first.status).toBe('cancelled');
    expect(cancelled).toHaveBeenCalledWith(expect.objectContaining({ reason: 'replaced' }));
    expect(firstRecord.destroyCalls).toBe(1);
    expect(firstRecord.active).toBe(false);
    expect(harness.drawPort.records[1].active).toBe(true);
    expect(harness.input.disposals).toBe(1);
    expect(harness.input.activeCount).toBe(1);

    second.cancel();
    expect(harness.drawPort.records[1].destroyCalls).toBe(1);
    expect(harness.input.activeCount).toBe(0);
    harness.destroy();
  });

  it('自由绘制通过语义端口提交坐标并在达到 limit 后释放全部监听', async () => {
    coversCapabilities('draw-keep-graphics', 'draw-point-limit');
    const harness = createDrawLifecycleHarness();
    const session = harness.draw.start({ type: 'polyline', layerId: 'draw-layer', style: lineStyle, limit: 1 });
    const completed = vi.fn();
    session.on('complete', completed);

    harness.drawPort.emit({ type: 'freehand-start', coordinate: [120, 30] });
    harness.drawPort.emit({ type: 'freehand-sample', coordinate: [130, 40] });
    harness.drawPort.emit({ type: 'freehand-complete', coordinate: [140, 50] });

    const results = await session.finished;
    expect(session.status).toBe('finished');
    expect(results).toHaveLength(1);
    expect(results[0].geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [120, 30],
        [130, 40],
        [140, 50]
      ]
    });
    expect(completed).toHaveBeenCalledOnce();
    expect(harness.drawPort.records[0].destroyCalls).toBe(1);
    expect(harness.input.activeCount).toBe(0);
    harness.destroy();
  });

  it('右键完成在端口清理前提交结果且不保留临时预览', async () => {
    coversCapabilities('draw-session-rightclick-exit', 'draw-result-query');
    const harness = createDrawLifecycleHarness();
    const session = harness.draw.start({ type: 'polyline', layerId: 'draw-layer', style: lineStyle });
    harness.drawPort.emit({ type: 'click', coordinate: [0, 0] });
    harness.drawPort.emit({ type: 'click', coordinate: [10, 5] });
    const record = harness.drawPort.records[0];
    expect(record.renders.some((preview) => preview !== undefined)).toBe(true);

    expect(finishActiveSession(harness.coordinator, [10, 5])).toBe('consume');

    const [result] = await session.finished;
    expect(result.geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [10, 5]
      ]
    });
    expect(harness.draw.query({ id: result.id })).toEqual([result]);
    expect(record.destroyCalls).toBe(1);
    expect(record.active).toBe(false);
    harness.destroy();
  });
});
