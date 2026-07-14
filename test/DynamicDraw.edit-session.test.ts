import { describe, expect, it, vi } from 'vitest';
import type { ElementState } from '../src/core/element/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createDrawLifecycleHarness } from './helpers/drawMeasureLifecycleHarness.js';

function editablePolyline(id: string, offset: number): ElementState {
  return {
    id,
    type: 'polyline',
    geometry: {
      type: 'polyline',
      controlPoints: [
        [offset, 0],
        [offset + 4, 0],
        [offset + 8, 0]
      ]
    },
    style: { strokes: [{ color: '#ff3300', width: 2 }] },
    layerId: 'draw-layer',
    visible: true
  };
}

describe('v2 动态编辑会话生命周期', () => {
  it('启动新编辑会话会替换旧会话并完整释放旧端口与键盘监听', async () => {
    coversCapabilities('edit-session-events');
    const harness = createDrawLifecycleHarness();
    harness.store.add(editablePolyline('first', 0));
    harness.store.add(editablePolyline('second', 20));

    const first = harness.draw.edit('first', { underlay: true });
    const cancelled = vi.fn();
    first.on('cancel', cancelled);
    const firstRecord = harness.editPort.records[0];
    expect(firstRecord.spec).toMatchObject({ elementId: 'first', underlay: true });
    expect(harness.input.activeCount).toBe(1);

    const second = harness.draw.edit('second');

    await expect(first.finished).resolves.toBeUndefined();
    expect(first.status).toBe('cancelled');
    expect(cancelled).toHaveBeenCalledOnce();
    expect(cancelled).toHaveBeenCalledWith(expect.objectContaining({ type: 'cancel', reason: 'replaced' }));
    expect(firstRecord.destroyCalls).toBe(1);
    expect(firstRecord.active).toBe(false);
    expect(() => firstRecord.emit({ type: 'move-cancel', anchor: firstRecord.renders[0].anchors[0] as never })).toThrow('已经释放');
    expect(harness.editPort.active?.spec.elementId).toBe('second');
    expect(harness.input.disposals).toBe(1);
    expect(harness.input.activeCount).toBe(1);

    second.cancel();
    await expect(second.finished).resolves.toBeUndefined();
    expect(harness.editPort.records[1].destroyCalls).toBe(1);
    expect(harness.input.disposals).toBe(2);
    expect(harness.input.activeCount).toBe(0);
    harness.destroy();
  });

  it('监听 disposer 只移除对应回调且不会中断真实编辑端口', () => {
    coversCapabilities('edit-session-control-points');
    const harness = createDrawLifecycleHarness();
    harness.store.add(editablePolyline('editable', 0));
    const session = harness.draw.edit('editable');
    const removed = vi.fn();
    const retained = vi.fn();
    const dispose = session.on('modifying', removed);
    session.on('modifying', retained);
    dispose();
    dispose();

    const render = harness.editPort.active?.renders.at(-1);
    const anchor = render?.anchors.find((candidate) => candidate.kind === 'control' && candidate.index === 1);
    if (anchor?.kind !== 'control') throw new Error('缺少可移动控制点');
    harness.editPort.emit({ type: 'move-start', anchor, coordinate: anchor.coordinate });
    harness.editPort.emit({ type: 'move', anchor, coordinate: [4, 2] });
    harness.editPort.emit({ type: 'move-end', anchor, coordinate: [4, 2] });

    expect(removed).not.toHaveBeenCalled();
    expect(retained).toHaveBeenCalled();
    expect(harness.editPort.active?.renders.at(-1)?.geometry).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [4, 2],
        [8, 0]
      ]
    });
    session.cancel();
    harness.destroy();
  });
});
