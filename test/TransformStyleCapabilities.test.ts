import { describe, expect, it, vi } from 'vitest';
import { createNativeStyleRef } from '../src/core/style/types.js';
import { UnsupportedOperationError } from '../src/core/errors.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('Transform style capabilities', () => {
  coversCapabilities('transform-style-snapshot');

  it('transforms structured visual metrics while preserving patterns, layered strokes, and icon anchors', () => {
    const harness = createTransformHarness();
    addElement(harness, 'styled', 'point', [[1, 1]], {
      symbol: {
        type: 'icon',
        src: '/marker.png',
        scale: [2, 1],
        rotation: 0.25,
        displacement: [3, 4],
        anchor: [0.25, 0.75],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction'
      },
      strokes: [
        { color: '#f00', width: 8 },
        { color: '#000', width: 3, lineDash: [2, 4] }
      ],
      fill: { type: 'pattern', pattern: 'cross', color: '#0f0', size: 6, lineWidth: 2 },
      text: {
        text: 'label',
        fontSize: '12px',
        scale: 1,
        rotation: 0.1,
        offsetX: 5,
        offsetY: 6,
        fill: { type: 'solid', color: '#fff' },
        backgroundFill: { type: 'solid', color: '#111' }
      }
    });
    const session = harness.service.select('styled');

    harness.interaction.emit({
      type: 'operation-start',
      operation: 'scale',
      delta: { type: 'scale', scaleX: 1, scaleY: 1, center: [0, 0] }
    });
    harness.interaction.emit({
      type: 'operation-end',
      operation: 'scale',
      delta: { type: 'scale', scaleX: 2, scaleY: 3, center: [0, 0] }
    });
    harness.interaction.emit({ type: 'operation-start', operation: 'rotate', delta: { type: 'rotate', angle: 0, center: [0, 0] } });
    harness.interaction.emit({ type: 'operation-end', operation: 'rotate', delta: { type: 'rotate', angle: 0.5, center: [0, 0] } });

    const style = harness.interaction.handle?.target?.style;
    expect(style).toMatchObject({
      symbol: {
        type: 'icon',
        scale: [4, 3],
        rotation: 0.75,
        anchor: [0.25, 0.75],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction'
      },
      strokes: [{ width: 20 }, { width: 7.5, lineDash: [5, 10] }],
      fill: { type: 'pattern', pattern: 'cross', size: 15, lineWidth: 5 },
      text: { fontSize: '30px', scale: [2, 3], rotation: 0.6 }
    });
    expect((style as { symbol: { displacement: [number, number] } }).symbol.displacement).not.toEqual([3, 4]);
    expect((style as { text: { offsetX: number; offsetY: number } }).text).not.toMatchObject({ offsetX: 5, offsetY: 6 });
    session.finish();
    expect(harness.store.get('styled')?.style).toEqual(style);
  });

  it('rejects structural scale or rotation for native styles and emits an isolated error', () => {
    const harness = createTransformHarness();
    addElement(harness, 'native', 'point', [[0, 0]], createNativeStyleRef());
    const session = harness.service.select('native');
    const errors = vi.fn();
    session.on('error', errors);

    harness.interaction.emit({ type: 'operation-start', operation: 'rotate', delta: { type: 'rotate', angle: 0, center: [0, 0] } });
    harness.interaction.emit({ type: 'operation-end', operation: 'rotate', delta: { type: 'rotate', angle: 1, center: [0, 0] } });

    expect(session.status).toBe('cancelled');
    expect(errors).toHaveBeenCalledOnce();
    expect(errors.mock.calls[0][0].error).toBeInstanceOf(UnsupportedOperationError);
    expect(harness.store.get('native')?.geometry).toEqual({ type: 'point', controlPoints: [[0, 0]] });
  });
});
