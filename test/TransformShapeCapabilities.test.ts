import { describe, expect, it, vi } from 'vitest';
import { shapeTypes } from '../src/core/shape/types.js';
import { CapabilityError, InvalidArgumentError } from '../src/core/errors.js';
import { tooltipLineText } from '../src/services/events/TooltipFormatting.js';
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
      else if (after?.geometry.type === 'callout') {
        expect(after.geometry.anchor).toEqual([representativePoints.callout[0][0] + 3, representativePoints.callout[0][1] - 2]);
        expect(after.geometry.center).toEqual([representativePoints.callout[1][0] + 3, representativePoints.callout[1][1] - 2]);
      } else expect(after?.geometry.controlPoints[0]).toEqual([representativePoints[type][0][0] + 3, representativePoints[type][0][1] - 2]);
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

  it.each([
    ['polyline', 'line', 1],
    ['polygon', 'area', 1],
    ['attack-arrow', 'arrow-structure', 2]
  ] as const)(
    'delegates %s insertion and removal to ShapeDefinition topology with preview-only history before one finish commit',
    (type, id, insertionIndex) => {
      const harness = createTransformHarness();
      const original = addElement(harness, id, type, representativePoints[type]);
      if (original.geometry.type === 'circle') throw new Error(`${type} unexpectedly normalized to a circle`);
      const originalControlPoints = original.geometry.controlPoints;
      const commits = vi.fn();
      const unsubscribe = harness.store.subscribe(commits);
      const session = harness.service.select(id);
      const operations: string[] = [];
      session.on('edit', ({ operation }) => operations.push(operation));
      session.setMode('edit');

      const initialTarget = harness.interaction.handle?.target;
      const insertion = initialTarget?.editAnchors.find((anchor) => anchor.kind === 'insertion' && anchor.index === insertionIndex);
      if (insertion?.kind !== 'insertion') throw new Error(`Missing ${type} insertion anchor at index ${insertionIndex}`);

      harness.interaction.emit({ type: 'edit-insert', anchor: insertion });

      const insertedTarget = harness.interaction.handle?.target;
      const insertedControlPoints = insertedTarget?.controlPoints;
      expect(insertedControlPoints).toHaveLength(originalControlPoints.length + 1);
      expect(insertedControlPoints?.[insertionIndex]).toEqual(insertion.coordinate);
      expect(operations.at(-1)).toBe('insert');
      expect(harness.store.get(id)?.geometry).toEqual(original.geometry);
      expect(commits).not.toHaveBeenCalled();
      expect(harness.tooltipPort.views[0]?.state.lines.map(tooltipLineText)).toContain('Ctrl+Z 撤销 (1)');

      expect(session.undo()).toBe(true);
      expect(harness.interaction.handle?.target?.controlPoints).toEqual(originalControlPoints);
      expect(harness.tooltipPort.views[0]?.state.lines.map(tooltipLineText)).toContain('Ctrl+Y 重做 (1)');
      expect(session.redo()).toBe(true);
      expect(harness.interaction.handle?.target?.controlPoints).toEqual(insertedControlPoints);

      const insertedControl = harness.interaction.handle?.target?.editAnchors.find(
        (anchor) => anchor.kind === 'control' && anchor.index === insertionIndex && anchor.removable
      );
      if (insertedControl?.kind !== 'control') throw new Error(`Missing removable ${type} control anchor at index ${insertionIndex}`);

      harness.interaction.emit({ type: 'edit-remove', anchor: insertedControl });

      expect(harness.interaction.handle?.target?.controlPoints).toEqual(originalControlPoints);
      expect(operations.at(-1)).toBe('remove');
      expect(harness.store.get(id)?.geometry).toEqual(original.geometry);
      expect(commits).not.toHaveBeenCalled();
      expect(harness.tooltipPort.views[0]?.state.lines.map(tooltipLineText)).toContain('Ctrl+Z 撤销 (2)');

      expect(session.undo()).toBe(true);
      expect(harness.interaction.handle?.target?.controlPoints).toEqual(insertedControlPoints);
      expect(session.redo()).toBe(true);
      expect(harness.interaction.handle?.target?.controlPoints).toEqual(originalControlPoints);
      expect(session.undo()).toBe(true);
      expect(harness.interaction.handle?.target?.controlPoints).toEqual(insertedControlPoints);
      expect(harness.store.get(id)?.geometry).toEqual(original.geometry);

      session.finish();

      expect(session.status).toBe('finished');
      expect(harness.store.get(id)?.geometry).toMatchObject({ controlPoints: insertedControlPoints });
      expect(commits).toHaveBeenCalledOnce();
      expect(commits.mock.calls[0]?.[0].changes).toEqual([expect.objectContaining({ id, kind: 'update' })]);
      unsubscribe();
    }
  );

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

  it('exposes Callout as translate-only and rejects Transform edit mode', () => {
    const harness = createTransformHarness();
    addElement(harness, 'callout', 'callout', representativePoints.callout);
    const session = harness.service.select('callout');

    expect(harness.interaction.handle?.target).toMatchObject({
      mode: 'transform',
      canTranslate: true,
      canRotate: false,
      canScale: false,
      canStretch: false,
      canEditVertices: false
    });
    expect(() => session.setMode('edit')).toThrow(CapabilityError);
    expect(session.mode).toBe('transform');
    session.cancel();
  });

  it('keeps a distant Callout tail out of the Transform selection geometry and toolbar fallback', () => {
    const harness = createTransformHarness({});
    const element = addElement(
      harness,
      'callout-selection',
      'callout',
      [
        [-10_000, -10_000],
        [0, 0]
      ],
      {
        strokes: [{ color: '#36f', width: 3 }],
        text: {
          text: '一段会在文本框中自动换行的很长文本 Callout selection geometry',
          maxWidth: 220,
          padding: [12, 16, 12, 16],
          fontSize: 16
        }
      }
    );
    const session = harness.service.select(element.id, { toolbar: {} });
    const target = harness.interaction.handle?.target;
    if (target?.geometry.type !== 'polygon' || target.selectionGeometry?.type !== 'polygon' || element.geometry.type !== 'callout') {
      throw new Error('Callout Transform presentation must expose full and selection Polygon geometries');
    }

    expect(target.geometry.coordinates[0]).toContainEqual([-10_000, -10_000]);
    expect(target.geometry.label?.text).toContain('\n');
    expect(target.selectionGeometry.label).toBeUndefined();
    expect(target.selectionGeometry.coordinates[0]).not.toContainEqual([-10_000, -10_000]);
    expect(target.selectionGeometry.coordinates[0]).toEqual([
      [-element.geometry.size[0] / 2, -element.geometry.size[1] / 2],
      [element.geometry.size[0] / 2, -element.geometry.size[1] / 2],
      [element.geometry.size[0] / 2, element.geometry.size[1] / 2],
      [-element.geometry.size[0] / 2, element.geometry.size[1] / 2],
      [-element.geometry.size[0] / 2, -element.geometry.size[1] / 2]
    ]);
    expect(harness.toolbarPort.views[0]?.spec.options.position).toEqual([element.geometry.size[0] / 2, element.geometry.size[1] / 2]);
    session.cancel();
  });

  it('keeps the final Callout polygon and label in clipboard preview', () => {
    const harness = createTransformHarness();
    addElement(harness, 'callout-copy', 'callout', representativePoints.callout);
    const session = harness.service.select('callout-copy');

    session.copy();
    harness.input.key('v', { ctrlKey: true });

    expect(harness.interaction.handle?.copyPreview?.geometry).toMatchObject({
      type: 'polygon',
      label: { text: 'Callout' }
    });
    expect(() =>
      session.copy({
        geometry: { type: 'callout', anchor: [0, 0], center: [4, 2], size: [0, 0] }
      })
    ).toThrow(InvalidArgumentError);
    session.cancel();
  });

  it('keeps arrow tails non-removable and omits insertion anchors for fixed edit topology', () => {
    const arrowHarness = createTransformHarness();
    addElement(arrowHarness, 'arrow-boundary', 'attack-arrow', representativePoints['attack-arrow']);
    const arrowSession = arrowHarness.service.select('arrow-boundary');
    arrowSession.setMode('edit');
    const arrowAnchors = arrowHarness.interaction.handle?.target?.editAnchors ?? [];

    expect(arrowAnchors.filter((anchor) => anchor.kind === 'control' && (anchor.index === 0 || anchor.index === 1))).toEqual([
      expect.objectContaining({ kind: 'control', index: 0, removable: false }),
      expect.objectContaining({ kind: 'control', index: 1, removable: false })
    ]);
    expect(arrowAnchors.some((anchor) => anchor.kind === 'insertion')).toBe(true);
    arrowSession.cancel();

    const fixedHarness = createTransformHarness();
    addElement(fixedHarness, 'fixed-arrow', 'fine-arrow', representativePoints['fine-arrow']);
    const fixedSession = fixedHarness.service.select('fixed-arrow');
    fixedSession.setMode('edit');

    expect(fixedHarness.interaction.handle?.target?.editAnchors.some((anchor) => anchor.kind === 'insertion')).toBe(false);
    fixedSession.cancel();
  });
});
