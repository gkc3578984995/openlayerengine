import { describe, expect, it, vi } from 'vitest';
import { InteractionConflictError, InvalidArgumentError } from '../src/core/errors.js';
import type { TransformDelta } from '../src/core/ports/TransformInteractionPort.js';
import type { Element } from '../src/facade/Element.js';
import { TransformFacade } from '../src/facade/TransformFacade.js';
import type { ElementService } from '../src/facade/types.js';
import type { TransformOptions } from '../src/facade/transformTypes.js';
import { TransformSessionFacade } from '../src/facade/TransformSessionFacade.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('TransformSession v2', () => {
  coversCapabilities(
    'public-low-level-transform-interaction',
    'transform-target-filter',
    'transform-translate-modes',
    'transform-scale-stretch-rotate',
    'transform-select-lifecycle',
    'transform-handle-cursor-events',
    'transform-operation-events',
    'transform-toolbar-actions',
    'transform-toolbar-view-sync',
    'transform-rightclick-priority',
    'transform-multi-earth-isolation',
    'transform-lifecycle-cleanup',
    'transform-event-subscription',
    'transform-low-level-advanced-options',
    'contextmenu-transform-arbitration',
    'transform-animation-point-pause-resume',
    'transform-animation-polyline-sync',
    'transform-bbox-active-blink'
  );

  it('selects from map hits, previews translation, and commits exactly once on finish', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[1, 2]]);
    const changes = vi.fn();
    harness.store.subscribe(changes);
    const session = harness.service.start({ translate: 'feature' });
    const select = vi.fn();
    const selectEnd = vi.fn();
    const start = vi.fn();
    const progress = vi.fn();
    const end = vi.fn();
    session.on('select', select);
    session.on('selectEnd', selectEnd);
    session.on('translateStart', start);
    session.on('translating', progress);
    session.on('translateEnd', end);

    harness.interaction.emit({ type: 'select-request', pixel: [3, 4], candidateIds: ['point-a'] });
    expect(session.selectedId).toBe('point-a');
    expect(select).toHaveBeenCalledOnce();
    expect(harness.interaction.handle?.target).toMatchObject({ elementId: 'point-a', canTranslate: true });

    const initial: TransformDelta = { type: 'translate', x: 0, y: 0 };
    const moved: TransformDelta = { type: 'translate', x: 5, y: -1 };
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: initial });
    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: moved });
    expect(harness.store.get('point-a')?.geometry).toEqual({ type: 'point', controlPoints: [[1, 2]] });
    harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: moved });
    expect(start).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();

    session.finish();

    expect(session.status).toBe('finished');
    expect(harness.store.get('point-a')?.geometry).toEqual({ type: 'point', controlPoints: [[6, 1]] });
    expect(changes.mock.calls.filter(([changeSet]) => changeSet.changes.some((change: { id: string }) => change.id === 'point-a'))).toHaveLength(1);
    expect(selectEnd).toHaveBeenCalledOnce();
    expect(harness.log.indexOf('transient:handle-stop')).toBeLessThan(harness.log.indexOf('interaction:destroy'));
  });

  it('rolls back preview state on cancel and consumes the active right click', () => {
    const harness = createTransformHarness();
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);
    const session = harness.service.select('line-a');
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: { type: 'translate', x: 9, y: 4 } });

    const decision = harness.coordinator.handleContextMenu({ type: 'rightclick', coordinate: [0, 0], pixel: [0, 0], nativeEventRef: {} as never });

    expect(decision).toBe('consume');
    expect(session.status).toBe('finished');
    expect(harness.store.get('line-a')?.geometry).toMatchObject({
      controlPoints: [
        [9, 4],
        [13, 6]
      ]
    });

    const second = harness.service.select('line-a');
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: { type: 'translate', x: 10, y: 10 } });
    second.cancel();
    expect(harness.store.get('line-a')?.geometry).toMatchObject({
      controlPoints: [
        [9, 4],
        [13, 6]
      ]
    });
  });

  it('honors selector, layer and conflict policies without changing the active session', () => {
    const harness = createTransformHarness();
    addElement(harness, 'allowed', 'point', [[0, 0]], undefined, { editable: true });
    addElement(harness, 'blocked', 'point', [[1, 1]], undefined, { editable: false });
    const session = harness.service.start({ selector: { predicate: (state) => (state.data as { editable?: boolean } | undefined)?.editable === true } });

    harness.interaction.emit({ type: 'select-request', pixel: [0, 0], candidateIds: ['blocked', 'allowed'] });
    expect(session.selectedId).toBe('allowed');
    expect(() => harness.service.start({ policy: 'reject' })).toThrow(InteractionConflictError);
    expect(session.status).toBe('active');
  });

  it('routes toolbar commands without giving the toolbar ownership of the session', () => {
    const harness = createTransformHarness({});
    addElement(harness, 'point-a', 'point', [[0, 0]]);
    const session = harness.service.select('point-a', { toolbar: {} });
    const toolbar = harness.toolbarPort.views[0];

    expect(session.toolbar).toBe(toolbar);
    toolbar.hide();
    expect(session.status).toBe('active');
    harness.toolbarPort.command?.('exit');
    expect(session.status).toBe('finished');
    expect(toolbar.destroy).toHaveBeenCalledOnce();
  });

  it('keeps the public Element and toolbar handles synchronized through selection and removal', () => {
    const harness = createTransformHarness({});
    addElement(harness, 'point-a', 'point', [[0, 0]]);
    const element = { id: 'point-a' } as Element;
    const elements = {
      get: <T>(id: string) => (id === element.id && harness.store.get(id) !== undefined ? (element as Element<T>) : undefined)
    } as ElementService;
    const internal = harness.service.start({ toolbar: {} });
    const session = new TransformSessionFacade(internal, elements);
    const removed = vi.fn();
    const selectEnd = vi.fn();
    session.on('remove', removed);
    session.on('selectEnd', selectEnd);

    expect(session.toolbar).toBeUndefined();
    session.select(element);
    expect(session.selected).toBe(element);
    expect(session.toolbar).toBeDefined();

    session.remove();

    expect(session.selected).toBeUndefined();
    expect(selectEnd).toHaveBeenCalledWith({ type: 'selectEnd', element });
    expect(removed).toHaveBeenCalledWith({ type: 'remove', element });
  });

  it('forwards advanced interaction options and updates the toolbar anchor with previews', () => {
    const harness = createTransformHarness({});
    addElement(harness, 'point-a', 'point', [[1, 2]]);
    const session = harness.service.select('point-a', {
      hitTolerance: 7,
      translate: 'center',
      scale: false,
      stretch: false,
      rotate: false,
      translateBBox: true,
      noFlip: false,
      keepRectangle: false,
      buffer: 24,
      pointRadius: 11,
      handleCenter: [8, 9],
      handleStyle: { strokes: [{ color: '#f00', width: 3 }] },
      toolbar: {}
    });

    expect(harness.interaction.options).toMatchObject({
      hitTolerance: 7,
      translate: 'center',
      scale: false,
      stretch: false,
      rotate: false,
      translateBBox: true,
      noFlip: false,
      keepRectangle: false,
      buffer: 24,
      pointRadius: 11,
      handleCenter: [8, 9]
    });
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: { type: 'translate', x: 2, y: 3 } });
    expect(harness.toolbarPort.views[0]?.updateOptions).toHaveBeenCalledWith({ position: [8, 9] });
    session.cancel();
  });

  it('keeps scale and stretch controls independently configurable', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[1, 2]]);

    const session = harness.service.select('point-a', { translate: 'none', rotate: false, scale: false, stretch: true });

    expect(harness.interaction.handle?.target).toMatchObject({ canScale: false, canStretch: true });
    session.cancel();
  });

  it('rejects non-plain or accessor-backed public options without evaluating getters', () => {
    const harness = createTransformHarness();
    const elements = { get: () => undefined } as ElementService;
    const facade = new TransformFacade(harness.service, elements);
    const getter = vi.fn(() => 4);
    const accessorOptions = {};
    Object.defineProperty(accessorOptions, 'hitTolerance', { enumerable: true, get: getter });

    expect(() => facade.start(accessorOptions as TransformOptions)).toThrow(InvalidArgumentError);
    expect(getter).not.toHaveBeenCalled();
    expect(() => facade.start(new (class {})() as TransformOptions)).toThrow(InvalidArgumentError);
  });

  it('does not record no-op pointer operations in history', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[1, 2]]);
    const session = harness.service.select('point-a');

    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });

    expect(session.undo()).toBe(false);
    session.cancel();
  });

  it('rejects session mutations re-entered from the finish transaction notification', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[0, 0]]);
    addElement(harness, 'point-b', 'point', [[9, 9]]);
    const session = harness.service.select('point-a');
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: { type: 'translate', x: 2, y: 3 } });
    let reentrantError: unknown;
    harness.store.subscribe((changes) => {
      if (!changes.changes.some((change) => change.id === 'point-a')) return;
      try {
        session.select('point-b');
      } catch (error) {
        reentrantError = error;
      }
    });

    session.finish();

    expect(reentrantError).toBeInstanceOf(InvalidArgumentError);
    expect(session.status).toBe('finished');
    expect(harness.store.get('point-a')?.geometry).toMatchObject({ controlPoints: [[2, 3]] });
    expect(harness.store.get('point-b')?.geometry).toMatchObject({ controlPoints: [[9, 9]] });
  });

  it('isolates selections, previews, toolbars, and cleanup between Earth-scoped services', () => {
    const first = createTransformHarness({});
    const second = createTransformHarness({});
    addElement(first, 'shared-id', 'point', [[0, 0]]);
    addElement(second, 'shared-id', 'point', [[10, 10]]);
    const firstSession = first.service.select('shared-id', { toolbar: {} });
    const secondSession = second.service.select('shared-id', { toolbar: {} });

    first.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    first.interaction.emit({ type: 'operation-change', operation: 'translate', delta: { type: 'translate', x: 4, y: 5 } });
    firstSession.finish();

    expect(first.store.get('shared-id')?.geometry).toMatchObject({ controlPoints: [[4, 5]] });
    expect(second.store.get('shared-id')?.geometry).toMatchObject({ controlPoints: [[10, 10]] });
    expect(secondSession.status).toBe('active');
    expect(second.interaction.handle?.destroyed).toBe(false);
    expect(second.toolbarPort.views[0]?.destroy).not.toHaveBeenCalled();
    secondSession.cancel();
  });
});
