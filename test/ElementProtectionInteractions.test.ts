import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { ElementProtectedError } from '../src/core/errors.js';
import type { DrawInteractionPort } from '../src/core/ports/DrawInteractionPort.js';
import type { EditInteractionPort } from '../src/core/ports/EditInteractionPort.js';
import type { ElementProtectionChange, ElementProtectionGuard } from '../src/core/ports/ElementProtectionPort.js';
import type { ElementProtectionState } from '../src/core/protection/types.js';
import type { ElementGeneration } from '../src/core/transaction/types.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { DrawService } from '../src/services/draw/DrawService.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import { StyleService } from '../src/services/style/StyleService.js';
import { addElement, createTransformHarness, representativePoints } from './helpers/transformHarness.js';
import { identityShapeProjection } from './helpers/shapeProjection.js';

class MutableProtectionGuard implements ElementProtectionGuard {
  readonly #states = new Map<string, ElementProtectionState>();
  readonly #listeners = new Set<(change: ElementProtectionChange) => void>();

  get(elementId: string): ElementProtectionState | undefined {
    return this.#states.get(elementId);
  }

  assertEditable(elementId: string): void {
    const state = this.get(elementId);
    if (state !== undefined) throw new ElementProtectedError(elementId, state.operatorName, state.operatorId);
  }

  subscribe(listener: (change: ElementProtectionChange) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  protect(elementId: string, generation: ElementGeneration, operatorName = '张三'): void {
    const previous = this.#states.get(elementId);
    const current = Object.freeze({ elementId, protected: true as const, operatorName });
    this.#states.set(elementId, current);
    const change = Object.freeze({ elementId, generation, ...(previous === undefined ? {} : { previous }), current });
    for (const listener of [...this.#listeners]) listener(change);
  }
}

describe('Element protection interaction guards', () => {
  it('DrawService 在协调器接管前拒绝受保护的 Edit 目标', () => {
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add({
      id: 'locked-line',
      type: 'polyline',
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [4, 2]
        ]
      },
      style: { strokes: [{ color: '#36f', width: 2 }] },
      layerId: 'vector',
      visible: true
    });
    const generation = store.generationOf('locked-line');
    if (generation === undefined) throw new Error('Missing locked generation');
    const protection = new MutableProtectionGuard();
    protection.protect('locked-line', generation, '李四');
    const coordinator = new InteractionCoordinator();
    const active = {
      cancel: vi.fn(),
      handleContextMenu: () => 'pass' as const
    };
    coordinator.activate(active);
    const service = new DrawService({
      store,
      shapes,
      styles: new StyleService(store),
      coordinator,
      drawPort: {} as DrawInteractionPort,
      editPort: {} as EditInteractionPort,
      shapeProjection: identityShapeProjection,
      protection,
      defaultStyle: () => ({ strokes: [{ color: '#36f', width: 2 }] })
    });

    expect(() => service.edit('locked-line')).toThrow(ElementProtectedError);
    expect(active.cancel).not.toHaveBeenCalled();
    expect(coordinator.active).toBe(active);
    service.destroy();
  });

  it('Transform 拒绝保护目标且不替换现有会话、不穿透到下层候选，并在目标后来受保护时取消', () => {
    const protection = new MutableProtectionGuard();
    const harness = createTransformHarness(false, undefined, identityShapeProjection, protection);
    addElement(harness, 'selected', 'polyline', representativePoints.polyline);
    addElement(harness, 'locked', 'polygon', representativePoints.polygon);
    addElement(harness, 'underlying', 'point', representativePoints.point);

    const session = harness.service.select('selected');
    const lockedGeneration = harness.store.generationOf('locked');
    if (lockedGeneration === undefined) throw new Error('Missing locked generation');
    protection.protect('locked', lockedGeneration, '李四');

    expect(() => harness.service.select('locked')).toThrow(ElementProtectedError);
    expect(session.status).toBe('active');
    expect(session.selectedId).toBe('selected');

    harness.interaction.emit({ type: 'select-request', candidateIds: ['locked', 'underlying'], coordinate: [2, 2] });
    expect(session.status).toBe('active');
    expect(session.selectedId).toBe('selected');

    const selectedGeneration = harness.store.generationOf('selected');
    if (selectedGeneration === undefined) throw new Error('Missing selected generation');
    protection.protect('selected', selectedGeneration);
    expect(session.status).toBe('cancelled');
    expect(harness.interaction.handle?.destroyed).toBe(true);
    expect(harness.store.get('selected')?.geometry).toEqual({ type: 'polyline', controlPoints: representativePoints.polyline });
  });

  it('replaceSelected 在 selectEnd 监听器重入后重新校验目标保护状态', () => {
    const protection = new MutableProtectionGuard();
    const harness = createTransformHarness(false, undefined, identityShapeProjection, protection);
    addElement(harness, 'first', 'point', [[0, 0]]);
    addElement(harness, 'next', 'point', [[4, 4]]);
    const nextGeneration = harness.store.generationOf('next');
    if (nextGeneration === undefined) throw new Error('Missing next generation');
    const session = harness.service.select('first');
    session.on('selectEnd', () => protection.protect('next', nextGeneration, '王五'));

    expect(() => session.replaceSelected('next')).toThrow(ElementProtectedError);
    expect(session.status).toBe('active');
    expect(session.selectedId).toBeUndefined();
    expect(harness.interaction.handle?.target).toBeUndefined();
  });

  it('保护错误监听器同步调用 finish 时仍先取消并回滚工作态', () => {
    const protection = new MutableProtectionGuard();
    const harness = createTransformHarness(false, undefined, identityShapeProjection, protection);
    addElement(harness, 'moving', 'point', [[1, 2]]);
    const generation = harness.store.generationOf('moving');
    if (generation === undefined) throw new Error('Missing moving generation');
    const session = harness.service.select('moving');
    session.on('error', () => session.finish());
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: { type: 'translate', x: 8, y: -3 } });

    protection.protect('moving', generation, '赵六');

    expect(session.status).toBe('cancelled');
    expect(harness.store.get('moving')?.geometry).toEqual({ type: 'point', controlPoints: [[1, 2]] });
    expect(harness.interaction.handle?.destroyed).toBe(true);
  });
});
