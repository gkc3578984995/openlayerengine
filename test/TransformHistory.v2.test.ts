import { describe, expect, it } from 'vitest';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('TransformHistory v2', () => {
  coversCapabilities(
    'transform-history-selection-scope',
    'transform-style-snapshot',
    'transform-undo-redo',
    'transform-copy-preview',
    'transform-copy-cut-paste-remove',
    'transform-replace-editing-feature'
  );

  it('stores immutable Element snapshots and bounds undo/redo to the configured limit', () => {
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
    session.finish();
    expect(harness.store.get('point-a')?.geometry).toEqual({ type: 'point', controlPoints: [[3, 0]] });
  });

  it('supports direct copy, clipboard preview confirmation, cut, and remove transactions', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[2, 3]], { symbol: { type: 'circle', radius: 4 } }, { label: 'source' });
    const session = harness.service.select<{ label: string }>('point-a');

    const direct = session.copy({ data: { label: 'direct' } });
    expect(direct.id).toBe('copy-1');
    expect(direct.data).toEqual({ label: 'direct' });

    harness.input.key('c', { ctrlKey: true });
    harness.input.key('v', { ctrlKey: true });
    expect(harness.interaction.handle?.copyPreview).toBeDefined();
    harness.interaction.emit({ type: 'copy-preview-confirm', delta: { x: 5, y: -1 } });
    expect(harness.store.get('copy-2')?.geometry).toEqual({ type: 'point', controlPoints: [[7, 2]] });
    expect(session.selectedId).toBe('copy-2');

    harness.input.key('x', { ctrlKey: true });
    expect(harness.store.get('copy-2')).toBeUndefined();
    expect(session.selectedId).toBeUndefined();
  });

  it('replaces selection and optionally retains cross-selection history', () => {
    const harness = createTransformHarness();
    addElement(harness, 'first', 'point', [[0, 0]]);
    addElement(harness, 'second', 'point', [[10, 10]]);
    const session = harness.service.select('first');
    translate(harness, 1, 0);

    session.replaceSelected('second', { retainHistory: true });
    expect(session.selectedId).toBe('second');
    expect(session.undo()).toBe(true);
    expect(session.selectedId).toBe('first');
    expect(harness.interaction.handle?.target?.geometry).toEqual({ type: 'point', coordinates: [1, 0] });
  });
});

function translate(harness: ReturnType<typeof createTransformHarness>, x: number, y: number): void {
  harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
  harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: { type: 'translate', x, y } });
}
