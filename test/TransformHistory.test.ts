import { describe, expect, it } from 'vitest';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('Transform 历史记录', () => {
  it('在历史上限内移动撤销与重做游标', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[0, 0]]);
    const session = harness.service.select('point-a', { historyLimit: 2 });

    translate(harness, 1, 0);
    translate(harness, 2, 0);

    expect(session.undo()).toBe(true);
    expect(harness.interaction.handle?.target?.geometry).toEqual({ type: 'point', coordinates: [1, 0] });
    expect(session.undo()).toBe(false);
    expect(session.redo()).toBe(true);
    expect(harness.interaction.handle?.target?.geometry).toEqual({ type: 'point', coordinates: [3, 0] });
  });
});

function translate(harness: ReturnType<typeof createTransformHarness>, x: number, y: number): void {
  harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
  harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: { type: 'translate', x, y } });
}
