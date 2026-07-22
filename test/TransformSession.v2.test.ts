import { describe, expect, it, vi } from 'vitest';
import { isElementSnapshot } from '../src/core/element/snapshot.js';
import type { ElementState } from '../src/core/element/types.js';
import { InteractionConflictError, InvalidArgumentError } from '../src/core/errors.js';
import type { TooltipLine } from '../src/core/ports/TooltipPort.js';
import type { TransformDelta } from '../src/core/ports/TransformInteractionPort.js';
import type { TransformToolbarViewHandle } from '../src/core/ports/TransformToolbarPort.js';
import type { Element } from '../src/facade/Element.js';
import { TransformFacade } from '../src/facade/TransformFacade.js';
import type { ElementService } from '../src/facade/types.js';
import type { TransformOptions } from '../src/facade/transformTypes.js';
import { TransformSessionFacade } from '../src/facade/TransformSessionFacade.js';
import { tooltipLineText } from '../src/services/events/TooltipFormatting.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

function visibleTooltipLines(lines: readonly TooltipLine[] | undefined): readonly string[] {
  return lines?.map(tooltipLineText) ?? [];
}

function tooltipTones(line: TooltipLine | undefined, text: string): readonly (string | undefined)[] {
  return typeof line === 'string' || line === undefined ? [] : line.filter((segment) => segment.text.trim() === text).map(({ tone }) => tone);
}

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
    expect(harness.log).toContain('animation:preview:set:point-a');
    expect(harness.log).not.toContain('animation:pause:point-a');

    const initial: TransformDelta = { type: 'translate', x: 0, y: 0 };
    const moved: TransformDelta = { type: 'translate', x: 5, y: -1 };
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: initial });
    expect(harness.log).toContain('animation:pause:point-a');
    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: moved });
    expect(harness.store.get('point-a')?.geometry).toEqual({ type: 'point', controlPoints: [[1, 2]] });
    harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: moved });
    expect(harness.log).toContain('animation:resume:point-a');
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

  it('rolls back a cancelled translate without history or Store changes and restores animation feedback', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-cancel', 'point', [[1, 2]]);
    const session = harness.service.select('point-cancel');
    const translateEnd = vi.fn();
    session.on('translateEnd', translateEnd);
    const initial = { type: 'translate' as const, x: 0, y: 0 };
    const moved = { type: 'translate' as const, x: 5, y: -1 };

    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: initial, cursor: 'move' });
    expect(harness.interaction.handle?.operationActive).toBe(true);
    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: moved, cursor: 'move' });
    expect(harness.interaction.handle?.target?.geometry).toEqual({ type: 'point', coordinates: [6, 1] });

    harness.interaction.emit({ type: 'operation-cancel', operation: 'translate', delta: moved, cursor: 'move' });

    expect(harness.interaction.handle?.operationActive).toBe(false);
    expect(harness.interaction.handle?.target?.geometry).toEqual({ type: 'point', coordinates: [1, 2] });
    expect(harness.store.get('point-cancel')?.geometry).toEqual({ type: 'point', controlPoints: [[1, 2]] });
    expect(session.undo()).toBe(false);
    expect(translateEnd).not.toHaveBeenCalled();
    expect(harness.log).toContain('animation:pause:point-cancel');
    expect(harness.log).toContain('animation:resume:point-cancel');
    expect(harness.cursorPort.views[0]?.cursor).toBeUndefined();
    expect(visibleTooltipLines(harness.tooltipPort.views[0]?.state.lines)[0]).toBe('选择控制点进行变换操作');

    session.finish();
    expect(harness.store.get('point-cancel')?.geometry).toEqual({ type: 'point', controlPoints: [[1, 2]] });
  });

  it('rolls back a cancelled vertex drag and restores the complete edit anchor set', () => {
    const harness = createTransformHarness();
    const original = addElement(harness, 'polygon-cancel', 'polygon', [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4]
    ]);
    const session = harness.service.select('polygon-cancel');
    session.setMode('edit');
    const initialTarget = harness.interaction.handle?.target;
    const anchor = initialTarget?.editAnchors.find((candidate) => candidate.kind === 'control' && candidate.removable);
    if (anchor?.kind !== 'control' || initialTarget === undefined) throw new Error('Transform edit control anchor is missing');
    const delta = { type: 'vertex' as const, index: anchor.index, coordinate: [anchor.coordinate[0] + 2, anchor.coordinate[1] + 1] };

    harness.interaction.emit({ type: 'operation-start', operation: 'vertex', delta, cursor: 'move', anchor });
    expect(harness.interaction.handle?.operationActive).toBe(true);
    harness.interaction.emit({ type: 'operation-change', operation: 'vertex', delta, cursor: 'move', anchor });
    expect(harness.interaction.handle?.target?.editAnchors).toHaveLength(1);

    harness.interaction.emit({ type: 'operation-cancel', operation: 'vertex', delta, cursor: 'move', anchor });

    expect(harness.interaction.handle?.operationActive).toBe(false);
    expect(harness.interaction.handle?.target?.geometry).toEqual(initialTarget.geometry);
    expect(harness.interaction.handle?.target?.editAnchors).toEqual(initialTarget.editAnchors);
    expect(harness.store.get('polygon-cancel')?.geometry).toEqual(original.geometry);
    expect(session.undo()).toBe(false);
    expect(harness.cursorPort.views[0]?.cursor).toBeUndefined();
    expect(visibleTooltipLines(harness.tooltipPort.views[0]?.state.lines)[0]).toBe('拖拽控制点编辑图形');

    session.finish();
    expect(harness.store.get('polygon-cancel')?.geometry).toEqual(original.geometry);
  });

  it.each(['api', 'keyboard'] as const)('refreshes the disabled Ctrl+V tone immediately after %s copy', (trigger) => {
    const harness = createTransformHarness();
    addElement(harness, 'copy-source', 'polygon', [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4]
    ]);
    const session = harness.service.select('copy-source');
    const shortcutLine = () => harness.tooltipPort.views[0]?.state.lines.find((line) => tooltipLineText(line).includes('Ctrl+V'));

    expect(tooltipTones(shortcutLine(), 'Ctrl+V')).toEqual(['muted']);
    if (trigger === 'api') session.copy();
    else harness.input.key('c', { ctrlKey: true });
    expect(tooltipTones(shortcutLine(), 'Ctrl+V')).toEqual(['shortcut']);

    session.cancel();
  });

  it('retains a Tooltip handle whose first destroy fails and retries it during later cleanup', () => {
    const harness = createTransformHarness();
    addElement(harness, 'tooltip-retry', 'point', [[1, 2]]);
    const session = harness.service.select('tooltip-retry');
    const tooltip = harness.tooltipPort.views[0];
    if (tooltip === undefined) throw new Error('Transform tooltip was not created');
    const nativeDestroy = tooltip.destroy.bind(tooltip);
    const destroy = vi
      .spyOn(tooltip, 'destroy')
      .mockImplementationOnce(() => {
        throw new Error('tooltip cleanup failed');
      })
      .mockImplementation(() => nativeDestroy());

    session.cancel();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(tooltip.destroyed).toBe(false);

    harness.service.destroy();
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(tooltip.destroyed).toBe(true);
  });

  it('统一管理 Transform 与 Edit 手柄的悬停、按下和退出光标', () => {
    const harness = createTransformHarness();
    addElement(harness, 'polygon-a', 'polygon', [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4]
    ]);
    const session = harness.service.select('polygon-a');
    const cursor = harness.cursorPort.views[0];
    if (cursor === undefined) throw new Error('Transform cursor was not opened');
    const baseShortcutLine = harness.tooltipPort.views[0]?.state.lines.find((line) => tooltipLineText(line).includes('Ctrl+V'));
    expect(tooltipTones(baseShortcutLine, 'Ctrl+V')).toEqual(['muted']);

    harness.interaction.emit({ type: 'enter-handle', key: 'scale-ne', operation: 'scale', cursor: 'nwse-resize' });
    expect(cursor.cursor).toBe('nwse-resize');
    harness.interaction.emit({ type: 'leave-handle', key: 'scale-ne', operation: 'scale', cursor: 'nwse-resize' });
    expect(cursor.cursor).toBeUndefined();

    const scale = { type: 'scale' as const, scaleX: 1, scaleY: 1, center: [2, 2] as const };
    harness.interaction.emit({ type: 'operation-start', operation: 'scale', delta: scale, axis: 'xy', cursor: 'nwse-resize' });
    expect(cursor.cursor).toBe('nwse-resize');
    expect(harness.interaction.handle?.operationActive).toBe(true);
    harness.interaction.emit({ type: 'operation-end', operation: 'scale', delta: scale, axis: 'xy', cursor: 'nwse-resize' });
    expect(cursor.cursor).toBe('nwse-resize');
    expect(harness.interaction.handle?.operationActive).toBe(false);
    harness.interaction.emit({ type: 'leave-handle', key: 'scale-ne', operation: 'scale', axis: 'xy', cursor: 'nwse-resize' });
    expect(cursor.cursor).toBeUndefined();

    session.setMode('edit');
    const anchor = harness.interaction.handle?.target?.editAnchors.find((candidate) => candidate.kind === 'control' && candidate.removable);
    if (anchor?.kind !== 'control') throw new Error('Transform edit control anchor is missing');
    const delta = { type: 'vertex' as const, index: anchor.index, coordinate: [anchor.coordinate[0] + 1, anchor.coordinate[1] + 1] };
    harness.interaction.emit({ type: 'enter-handle', key: `vertex-${anchor.index}`, operation: 'vertex', cursor: 'move', anchor });
    expect(cursor.cursor).toBe('move');
    harness.interaction.emit({ type: 'operation-start', operation: 'vertex', delta, cursor: 'move', axis: 'xy', anchor });
    expect(cursor.cursor).toBe('grabbing');
    expect(harness.interaction.handle?.operationActive).toBe(true);
    harness.interaction.emit({ type: 'operation-change', operation: 'vertex', delta, cursor: 'move', axis: 'xy', anchor });
    expect(harness.interaction.handle?.operationActive).toBe(true);
    expect(harness.interaction.handle?.target?.editAnchors).toHaveLength(1);
    expect(harness.interaction.handle?.target?.controlPoints).toHaveLength(1);
    harness.interaction.emit({ type: 'operation-end', operation: 'vertex', delta, cursor: 'move', axis: 'xy', anchor });
    expect(cursor.cursor).toBe('move');
    expect(harness.interaction.handle?.operationActive).toBe(false);
    expect(harness.interaction.handle?.target?.editAnchors.length).toBeGreaterThan(1);
    expect(visibleTooltipLines(harness.tooltipPort.views[0]?.state.lines)).toEqual(['拖拽控制点编辑图形', '按住 Alt 单击删除点']);
    expect(tooltipTones(harness.tooltipPort.views[0]?.state.lines[1], 'Alt')).toEqual(['shortcut']);
    harness.interaction.emit({ type: 'leave-handle', key: `vertex-${anchor.index}`, operation: 'vertex', cursor: 'move', anchor });
    expect(cursor.cursor).toBeUndefined();
    expect(visibleTooltipLines(harness.tooltipPort.views[0]?.state.lines)).toContain('Ctrl+Z 撤销 (1)');
    const undoLine = harness.tooltipPort.views[0]?.state.lines.find((line) => tooltipLineText(line).startsWith('Ctrl+Z'));
    expect(tooltipTones(undoLine, 'Ctrl+Z 撤销 (1)')).toEqual(['undo']);

    session.finish();
    expect(cursor.destroyed).toBe(true);
  });

  it('uses the unified 8 CSS px hitTolerance by default', () => {
    const harness = createTransformHarness();
    const session = harness.service.start();

    expect(harness.interaction.options?.hitTolerance).toBe(8);
    session.cancel();
  });

  it('reuses the trusted immutable working snapshot and isolates the operation delta', () => {
    const harness = createTransformHarness();
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);
    const session = harness.service.select('line-a');
    const progress = vi.fn();
    session.on('translating', progress);
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    const delta = { type: 'translate' as const, x: 5, y: -1 };

    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta });

    const event = progress.mock.calls[0]?.[0] as Readonly<{ state: Readonly<ElementState>; delta: TransformDelta }>;
    expect(isElementSnapshot(event.state)).toBe(true);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.state)).toBe(true);
    expect(Object.isFrozen(event.state.geometry)).toBe(true);
    const controlPoints = (event.state.geometry as { controlPoints: readonly unknown[] }).controlPoints;
    expect(Object.isFrozen(controlPoints)).toBe(true);
    expect((harness.interaction.handle?.target?.geometry as { coordinates?: readonly unknown[] }).coordinates).toBe(controlPoints);
    expect(event.delta).not.toBe(delta);
    expect(Object.isFrozen(event.delta)).toBe(true);

    delta.x = 50;
    delta.y = 60;
    expect(event.delta).toEqual({ type: 'translate', x: 5, y: -1 });
    expect(event.state.geometry).toMatchObject({
      controlPoints: [
        [5, -1],
        [9, 1]
      ]
    });
    session.cancel();
  });

  it('reuses the same prepared render geometry for handles and animation preview in each transform frame', () => {
    const harness = createTransformHarness();
    addElement(harness, 'curve-a', 'curve-polyline', [
      [0, 0],
      [2, 2],
      [4, 0]
    ]);
    const setPreview = vi.spyOn(harness.animations, 'setPreview');
    const session = harness.service.select('curve-a');
    setPreview.mockClear();
    const initial = { type: 'translate' as const, x: 0, y: 0 };
    const moved = { type: 'translate' as const, x: 3, y: -2 };

    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: initial });
    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: moved });

    const targetGeometry = harness.interaction.handle?.target?.geometry;
    expect(targetGeometry).toBeDefined();
    expect(setPreview).toHaveBeenCalledOnce();
    expect(setPreview.mock.calls[0]?.[1]).toBe(targetGeometry);

    harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: moved });
    session.cancel();
  });

  it('rejects non-finite deltas before publishing an invalid preview snapshot', () => {
    const harness = createTransformHarness();
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);
    const session = harness.service.select('line-a');
    const progress = vi.fn();
    const error = vi.fn();
    session.on('translating', progress);
    session.on('error', error);
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });

    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: { type: 'translate', x: Number.POSITIVE_INFINITY, y: 0 } });

    expect(progress).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(session.status).toBe('cancelled');
    expect(harness.store.get('line-a')?.geometry).toMatchObject({
      controlPoints: [
        [0, 0],
        [4, 2]
      ]
    });
  });

  it('keeps definition validation for topology-sensitive transformed shapes', () => {
    const harness = createTransformHarness();
    addElement(harness, 'polygon-a', 'polygon', [
      [0, 0],
      [4, 0],
      [2, 3]
    ]);
    const session = harness.service.select('polygon-a');
    const scaling = vi.fn();
    const error = vi.fn();
    session.on('scaling', scaling);
    session.on('error', error);
    harness.interaction.emit({ type: 'operation-start', operation: 'scale', delta: { type: 'scale', scaleX: 1, scaleY: 1, center: [0, 0] } });

    harness.interaction.emit({ type: 'operation-change', operation: 'scale', delta: { type: 'scale', scaleX: 0, scaleY: 1, center: [0, 0] } });

    expect(scaling).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(session.status).toBe('cancelled');
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
    expect(harness.log).not.toContain('animation:pause:line-a');
    expect(harness.log.filter((entry) => entry === 'animation:preview:set:line-a').length).toBeGreaterThan(1);

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

  it('passes the toolbar click coordinate to the copy preview without retaining the toolbar event array', () => {
    const harness = createTransformHarness({});
    addElement(harness, 'copy-source', 'polygon', [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4]
    ]);
    const session = harness.service.select('copy-source', { toolbar: {} });
    const triggerCoordinate: [number, number] = [30, 40];

    harness.toolbarPort.command?.('copy', triggerCoordinate);
    triggerCoordinate[0] = 99;

    expect(harness.interaction.handle?.copyPreview).toBeDefined();
    expect(harness.interaction.handle?.copyPreviewPosition).toEqual([30, 40]);
    expect(harness.tooltipPort.views[0]?.state.position).toEqual([30, 40]);
    session.cancel();
  });

  it('rolls back an opened toolbar when selection fails during toolbar state synchronization', () => {
    const harness = createTransformHarness({});
    addElement(harness, 'point-a', 'point', [[0, 0]]);
    const synchronizationFailure = new Error('toolbar synchronization failed');
    const toolbar: TransformToolbarViewHandle = {
      setActive: vi.fn(),
      updateItem: vi.fn(() => {
        throw synchronizationFailure;
      }),
      updateOptions: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn()
    };
    vi.spyOn(harness.toolbarPort, 'open').mockReturnValue(toolbar);

    expect(() => harness.service.select('point-a', { toolbar: {} })).toThrow(synchronizationFailure);
    expect(toolbar.destroy).toHaveBeenCalledOnce();
    expect(harness.interaction.handle?.target).toBeUndefined();
  });

  it('retains a failed toolbar cleanup for a later destroy retry without repeating completed cleanup', () => {
    const harness = createTransformHarness({});
    addElement(harness, 'point-a', 'point', [[0, 0]]);
    const session = harness.service.select('point-a', { toolbar: {} });
    const toolbar = harness.toolbarPort.views[0];
    toolbar.destroy.mockImplementationOnce(() => {
      throw new Error('toolbar destroy failed');
    });

    session.cancel();
    expect(session.toolbar).toBeUndefined();
    expect(toolbar.destroy).toHaveBeenCalledOnce();
    expect(harness.interaction.handle?.destroyed).toBe(true);

    session.destroy();
    session.destroy();
    expect(toolbar.destroy).toHaveBeenCalledTimes(2);
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
    harness.interaction.emit({ type: 'bounds-change', topRight: [25, 26] });
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: { type: 'translate', x: 2, y: 3 } });
    expect(harness.toolbarPort.views[0]?.updateOptions).toHaveBeenCalledWith({ position: [25, 26] });
    expect(harness.toolbarPort.views[0]?.updateOptions).toHaveBeenCalledTimes(1);
    session.cancel();
  });

  it('defaults rectangle corner scaling to independent axes', () => {
    const harness = createTransformHarness();
    addElement(harness, 'rectangle-a', 'rectangle', [
      [0, 0],
      [4, 2]
    ]);

    const session = harness.service.select('rectangle-a');

    expect(harness.interaction.options?.keepRectangle).toBe(false);
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

  it('does not overwrite a selection created re-entrantly from selectEnd', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[0, 0]]);
    addElement(harness, 'point-b', 'point', [[4, 4]]);
    addElement(harness, 'point-c', 'point', [[8, 8]]);
    const session = harness.service.select('point-a');
    session.on('selectEnd', () => session.select('point-c'));

    expect(() => session.replaceSelected('point-b')).toThrow(InvalidArgumentError);
    expect(session.status).toBe('active');
    expect(session.selectedId).toBe('point-c');
    expect(harness.interaction.handle?.target?.elementId).toBe('point-c');
    expect(harness.log).toContain('animation:preview:set:point-c');
    expect(harness.log).not.toContain('animation:preview:set:point-b');
    session.cancel();
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
