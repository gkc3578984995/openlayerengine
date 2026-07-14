import { describe, expect, it } from 'vitest';
import type { StyleSpec } from '../src/index.js';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('Transform 样式快照', () => {
  it('深拷贝分层样式并在几何历史切换时保持样式值不变', () => {
    const harness = createTransformHarness();
    const style: StyleSpec = {
      strokes: [
        { color: '#f00', width: 8 },
        { color: '#000', width: 3 }
      ]
    };
    const state = addElement(
      harness,
      'line-a',
      'polyline',
      [
        [0, 0],
        [1, 1]
      ],
      style
    );

    expect(state.style).toEqual(style);
    expect(state.style).not.toBe(style);
    expect((state.style as StyleSpec).strokes?.[0]).not.toBe(style.strokes?.[0]);

    const session = harness.service.select('line-a');
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: { type: 'translate', x: 3, y: 4 } });
    expect(session.undo()).toBe(true);
    expect(harness.interaction.handle?.target?.style).toEqual(style);
    expect(session.redo()).toBe(true);
    expect(harness.interaction.handle?.target?.style).toEqual(style);
  });
});
