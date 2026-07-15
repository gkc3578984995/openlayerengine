import { describe, expect, it } from 'vitest';
import { shapeTypes } from '../src/core/shape/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { addElement, createTransformHarness, representativePoints } from './helpers/transformHarness.js';

describe('Transform shape capabilities', () => {
  coversCapabilities('transform-vertex-edit-delegation', 'transform-plot-control-point-sync');

  it('translates every registered basic and plot shape through its semantic state', () => {
    for (const type of shapeTypes) {
      const harness = createTransformHarness();
      addElement(harness, type, type, representativePoints[type]);
      const before = harness.store.get(type);
      const session = harness.service.select(type);
      harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
      harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: { type: 'translate', x: 3, y: -2 } });
      session.finish();
      const after = harness.store.get(type);
      expect(after?.geometry).not.toEqual(before?.geometry);
      if (after?.geometry.type === 'circle') expect(after.geometry.center).toEqual([3, -2]);
      else expect(after?.geometry.controlPoints[0]).toEqual([representativePoints[type][0][0] + 3, representativePoints[type][0][1] - 2]);
    }
  });

  it('delegates complex-shape vertex movement to ShapeDefinition edit topology', () => {
    const harness = createTransformHarness();
    addElement(harness, 'arrow', 'attack-arrow', representativePoints['attack-arrow']);
    const session = harness.service.select('arrow');
    const edits: unknown[] = [];
    session.on('edit', (event) => edits.push(event));
    session.setMode('edit');

    harness.interaction.emit({ type: 'operation-start', operation: 'vertex', delta: { type: 'vertex', index: 2, coordinate: [3, 3] } });
    harness.interaction.emit({ type: 'operation-end', operation: 'vertex', delta: { type: 'vertex', index: 2, coordinate: [6, 7] } });

    expect(harness.interaction.handle?.target?.controlPoints[2]).toEqual([6, 7]);
    expect(edits).toHaveLength(1);
    session.finish();
    expect((harness.store.get('arrow')?.geometry as { controlPoints: readonly unknown[] }).controlPoints[2]).toEqual([6, 7]);
  });

  it('exposes only the capabilities declared by each ShapeDefinition', () => {
    const harness = createTransformHarness();
    addElement(harness, 'circle', 'circle', representativePoints.circle);
    const session = harness.service.select('circle');

    expect(harness.interaction.handle?.target).toMatchObject({
      mode: 'transform',
      canTranslate: true,
      canScale: true,
      canRotate: false,
      canEditVertices: false
    });

    session.setMode('edit');
    expect(harness.interaction.handle?.target).toMatchObject({
      mode: 'edit',
      canTranslate: false,
      canScale: false,
      canRotate: false,
      canEditVertices: true
    });
  });
});
