import { describe, expect, it } from 'vitest';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('Transform 右键菜单协调', () => {
  it('活动变换优先消费右键并结束选择，随后将右键交还菜单服务', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[1, 2]]);
    const session = harness.service.select('point-a');
    const event = { type: 'rightclick', coordinate: [1, 2], pixel: [10, 20], nativeEventRef: {} as never } as const;

    expect(harness.coordinator.handleContextMenu(event)).toBe('consume');
    expect(session.status).toBe('finished');
    expect(harness.store.get('point-a')?.geometry).toEqual({ type: 'point', controlPoints: [[1, 2]] });
    expect(harness.coordinator.handleContextMenu(event)).toBe('pass');
  });
});
