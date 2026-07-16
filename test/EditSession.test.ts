import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { createControlPointDefinition } from '../src/builtins/shapes/definition.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import type { PreparedWorldEdit } from '../src/core/common/worldWrap.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { ObjectDisposedError } from '../src/core/errors.js';
import type { InputEventMap } from '../src/core/ports/InputPort.js';
import type { TooltipLine } from '../src/core/ports/TooltipPort.js';
import type { ShapeProjectionPort } from '../src/core/ports/ShapeProjectionPort.js';
import type {
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState,
  EditInteractionSpec
} from '../src/core/ports/EditInteractionPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { ShapeDefinition, ShapeType } from '../src/core/shape/types.js';
import type { ElementStyleState } from '../src/core/style/types.js';
import { EditSession } from '../src/services/draw/EditSession.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import { tooltipLineText } from '../src/services/events/TooltipFormatting.js';
import type { RoutedPointerEvent } from '../src/services/events/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { FakeCursorPort } from './helpers/cursorHarness.js';
import { identityShapeProjection } from './helpers/shapeProjection.js';
import { FakeTooltipPort } from './helpers/transformHarness.js';

const style: ElementStyleState = { strokes: [{ color: '#ff3300', width: 2 }] };

function visibleTooltipLines(lines: readonly TooltipLine[] | undefined): readonly string[] {
  return lines?.map(tooltipLineText) ?? [];
}

function tooltipTones(line: TooltipLine | undefined, text: string): readonly (string | undefined)[] {
  return typeof line === 'string' || line === undefined ? [] : line.filter((segment) => segment.text.trim() === text).map(({ tone }) => tone);
}

class FakeEditPort implements EditInteractionPort {
  readonly renders: Readonly<EditInteractionRenderState>[] = [];
  readonly render = vi.fn((state: Readonly<EditInteractionRenderState>) => this.renders.push(state));
  readonly destroy = vi.fn();
  listener: ((event: EditInteractionEvent) => void) | undefined;
  spec: Readonly<EditInteractionSpec> | undefined;
  placement: PreparedWorldEdit | undefined;

  open(spec: Readonly<EditInteractionSpec>, listener: (event: EditInteractionEvent) => void): EditInteractionHandle {
    this.spec = spec;
    this.listener = listener;
    const placement =
      this.placement ??
      Object.freeze({
        controlPoints: spec.controlPoints.map((coordinate) => [...coordinate]),
        handoff: Object.freeze({ kind: 'identity' as const })
      });
    return {
      placement,
      render: this.render,
      destroy: this.destroy
    };
  }

  emit(event: EditInteractionEvent): void {
    if (this.listener === undefined) throw new Error('Edit port is not open');
    this.listener(event);
  }
}

class FakeKeyboardInput {
  readonly dispose = vi.fn();
  listener: ((event: InputEventMap['keydown']) => void) | undefined;

  on(type: 'keydown', listener: (event: InputEventMap['keydown']) => void): () => void {
    if (type !== 'keydown') throw new Error('Unexpected input type');
    this.listener = listener;
    return () => {
      this.listener = undefined;
      this.dispose();
    };
  }

  emit(key: string, options: Partial<Pick<InputEventMap['keydown'], 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {}): void {
    this.listener?.({
      type: 'keydown',
      key,
      code: `Key${key.toUpperCase()}`,
      altKey: false,
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
      shiftKey: options.shiftKey ?? false,
      nativeEventRef: {} as InputEventMap['keydown']['nativeEventRef']
    });
  }
}

function element(type: ShapeType, controlPoints: readonly (readonly [number, number])[]): ElementState {
  return {
    id: `edit-${type}`,
    type,
    geometry: { type, controlPoints } as ElementState['geometry'],
    style,
    layerId: 'edit-layer',
    visible: true
  };
}

function setup(
  state: ElementState,
  underlay = false,
  placement?: PreparedWorldEdit,
  beforeSession?: (store: ElementStore) => void,
  configure?: (context: Readonly<{ keyboard: FakeKeyboardInput; port: FakeEditPort; store: ElementStore }>) => void,
  sessionDefinition?: ShapeDefinition,
  shapeProjection: ShapeProjectionPort = identityShapeProjection
) {
  const shapes = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
  const store = new ElementStore(shapes);
  store.add(state);
  const definition = sessionDefinition ?? shapes.get(state.type);
  if (definition === undefined) throw new Error(`Missing definition: ${state.type}`);
  const coordinator = new InteractionCoordinator();
  const port = new FakeEditPort();
  const keyboard = new FakeKeyboardInput();
  const cursor = new FakeCursorPort();
  const tooltip = new FakeTooltipPort();
  port.placement = placement;
  const reports: unknown[] = [];
  const onTerminal = vi.fn();
  beforeSession?.(store);
  configure?.({ keyboard, port, store });
  const session = new EditSession({
    store,
    definition,
    coordinator,
    port,
    shapeProjection,
    elementId: state.id,
    options: { underlay },
    input: keyboard,
    cursorPort: cursor,
    tooltipPort: tooltip,
    errorReporter: (error) => reports.push(error),
    onTerminal
  });
  coordinator.activate(session);
  session.open();
  return { coordinator, cursor, keyboard, onTerminal, port, reports, session, store, tooltip };
}

function controlCoordinates(port: FakeEditPort): readonly (readonly number[])[] {
  return (port.renders.at(-1)?.anchors ?? [])
    .filter((anchor) => anchor.kind === 'control')
    .sort((left, right) => left.index - right.index)
    .map(({ coordinate }) => coordinate);
}

function rightClick(): RoutedPointerEvent<'rightclick'> {
  return {
    type: 'rightclick',
    coordinate: [0, 0],
    pixel: [0, 0],
    nativeEventRef: {} as RoutedPointerEvent<'rightclick'>['nativeEventRef']
  };
}

describe('EditSession', () => {
  coversCapabilities(
    'edit-session-rightclick-commit',
    'edit-session-underlay',
    'edit-session-history',
    'edit-session-control-points',
    'edit-session-world-wrap',
    'edit-session-events'
  );

  it('shows base, midpoint, control-point, and drag guidance while keeping history and cleanup in sync', () => {
    const { port, session, tooltip } = setup(
      element('polyline', [
        [0, 0],
        [4, 0],
        [8, 0]
      ])
    );
    const anchors = port.renders[0]?.anchors ?? [];
    const insertion = anchors.find((anchor) => anchor.kind === 'insertion');
    const control = anchors.find((anchor) => anchor.kind === 'control' && anchor.removable);
    if (insertion?.kind !== 'insertion' || control?.kind !== 'control') throw new Error('Missing editable anchors');

    port.emit({ type: 'pointer-move', coordinate: [10, 10] });
    const view = tooltip.views[0];
    expect(view?.spec).toMatchObject({ ownerId: 'edit:edit-polyline', variant: 'edit', offset: [15, -11] });
    expect(visibleTooltipLines(view?.state.lines)).toEqual(['拖拽控制点进行编辑', '按住 Alt 单击中点添加点 | 按住 Alt 单击可删除控制点', '右击退出编辑']);
    expect(tooltipTones(view?.state.lines[1], 'Alt')).toEqual(['shortcut', 'shortcut']);
    expect(tooltipTones(view?.state.lines[1], '|')).toEqual(['muted']);

    port.emit({ type: 'pointer-move', coordinate: insertion.coordinate, anchor: insertion });
    expect(view?.state.position).toEqual(insertion.coordinate);
    expect(visibleTooltipLines(view?.state.lines)).toEqual(['按住 Alt 单击添加点']);

    port.emit({ type: 'pointer-move', coordinate: control.coordinate, anchor: control });
    expect(visibleTooltipLines(view?.state.lines)).toEqual(['拖拽控制点编辑图形', '按住 Alt 单击删除点']);
    port.emit({ type: 'move-start', anchor: control, coordinate: control.coordinate });
    expect(visibleTooltipLines(view?.state.lines)).toEqual(['拖拽中…']);
    port.emit({ type: 'move-cancel', anchor: control });
    expect(visibleTooltipLines(view?.state.lines)).toEqual(['拖拽控制点进行编辑', '按住 Alt 单击中点添加点 | 按住 Alt 单击可删除控制点', '右击退出编辑']);

    port.emit({ type: 'insert', anchor: insertion });
    expect(visibleTooltipLines(view?.state.lines)).toContain('Ctrl+Z 撤销 (1)');
    expect(
      tooltipTones(
        view?.state.lines.find((line) => tooltipLineText(line).startsWith('Ctrl+Z')),
        'Ctrl+Z 撤销 (1)'
      )
    ).toEqual(['undo']);
    expect(session.undo()).toBe(true);
    expect(visibleTooltipLines(view?.state.lines)).toContain('Ctrl+Y 重做 (1)');
    expect(
      tooltipTones(
        view?.state.lines.find((line) => tooltipLineText(line).startsWith('Ctrl+Y')),
        'Ctrl+Y 重做 (1)'
      )
    ).toEqual(['redo']);

    session.cancel();
    expect(view?.destroyed).toBe(true);
  });

  it('uses move and grabbing cursors for edit anchors and restores the cursor on cancel and finish', () => {
    const { cursor, port, session } = setup(
      element('polyline', [
        [0, 0],
        [4, 0],
        [8, 0]
      ])
    );
    const cursorView = cursor.views[0];
    const control = port.renders[0]?.anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (cursorView === undefined || control?.kind !== 'control') throw new Error('Missing edit cursor or control anchor');

    expect(cursor.open).toHaveBeenCalledOnce();
    expect(cursorView.cursor).toBeUndefined();

    port.emit({ type: 'pointer-move', coordinate: control.coordinate, anchor: control });
    expect(cursorView.cursor).toBe('move');

    port.emit({ type: 'move-start', anchor: control, coordinate: control.coordinate });
    expect(cursorView.cursor).toBe('grabbing');

    port.emit({ type: 'move-cancel', anchor: control });
    expect(cursorView.cursor).toBeUndefined();

    port.emit({ type: 'pointer-move', coordinate: [20, 20] });
    expect(cursorView.cursor).toBeUndefined();

    port.emit({ type: 'pointer-move', coordinate: control.coordinate, anchor: control });
    expect(cursorView.cursor).toBe('move');

    session.finish();
    expect(cursorView.destroyed).toBe(true);
    expect(cursorView.cursor).toBeUndefined();
    expect(cursorView.log).toEqual(['set:move', 'set:grabbing', 'reset', 'reset', 'set:move', 'destroy']);
  });

  it('does not subscribe keyboard input after the initial render synchronously cancels the session', () => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    let keyboardOn: ReturnType<typeof vi.spyOn> | undefined;

    expect(() =>
      setup(entry, false, undefined, undefined, ({ keyboard, port, store }) => {
        keyboardOn = vi.spyOn(keyboard, 'on');
        port.render.mockImplementationOnce((state) => {
          port.renders.push(state);
          store.update({ id: entry.id }, { visible: false });
        });
      })
    ).toThrow(ObjectDisposedError);
    expect(keyboardOn).not.toHaveBeenCalled();
  });

  it('renders and edits ordinary topology through the port without writing preview state to Store', () => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0],
      [8, 0]
    ]);
    const { port, session, store } = setup(entry, true);
    const operations: string[] = [];
    session.on('modifying', ({ operation }) => operations.push(operation));

    expect(port.spec).toEqual({ elementId: entry.id, controlPoints: entry.geometry.controlPoints, underlay: true });
    expect(port.renders[0].anchors.filter(({ kind }) => kind === 'control')).toHaveLength(3);
    expect(port.renders[0].anchors.filter(({ kind }) => kind === 'insertion')).toHaveLength(2);

    const moved = port.renders.at(-1)?.anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing movable anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move', anchor: moved, coordinate: [4, 2] });
    expect(port.renders.at(-1)?.anchors).toEqual([{ ...moved, coordinate: [4, 2] }]);
    port.emit({ type: 'move-end', anchor: moved, coordinate: [4, 2] });
    expect(port.renders.at(-1)?.anchors.filter(({ kind }) => kind === 'control')).toHaveLength(3);
    expect(port.renders.at(-1)?.anchors.filter(({ kind }) => kind === 'insertion')).toHaveLength(2);

    const insertion = port.renders.at(-1)?.anchors.find((anchor) => anchor.kind === 'insertion');
    if (insertion?.kind !== 'insertion') throw new Error('Missing insertion anchor');
    port.emit({ type: 'insert', anchor: insertion });
    const inserted = port.renders.at(-1)?.anchors.find((anchor) => anchor.kind === 'control' && anchor.index === insertion.index);
    if (inserted?.kind !== 'control') throw new Error('Missing inserted anchor');
    port.emit({ type: 'remove', anchor: inserted });

    expect(port.renders.at(-1)?.geometry).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [4, 2],
        [8, 0]
      ]
    });
    expect(operations).toContain('move');
    expect(operations.slice(-2)).toEqual(['insert', 'remove']);
    expect(store.get(entry.id)?.geometry).toEqual(entry.geometry);
    expect(session.status).toBe('active');
  });

  it('starts a ten-thousand-vertex polyline without quadratic topology expansion', () => {
    const controlPoints = Array.from({ length: 10_000 }, (_value, index) => [index, Math.sin(index)] as [number, number]);
    const { port, session } = setup(element('polyline', controlPoints));

    expect(port.renders).toHaveLength(1);
    expect(port.renders[0].anchors.filter(({ kind }) => kind === 'control')).toHaveLength(10_000);
    expect(port.renders[0].anchors.filter(({ kind }) => kind === 'insertion')).toHaveLength(9_999);

    session.cancel();
    expect(port.destroy).toHaveBeenCalledOnce();
  });

  it('reuses the most recently rendered topology when placing a moved control point', () => {
    const baseDefinition = basicShapeDefinitions.find(({ type }) => type === 'polyline');
    if (baseDefinition?.editTopology === undefined) throw new Error('Missing polyline edit topology');
    const describe = vi.fn(baseDefinition.editTopology.describe);
    const observedDefinition: ShapeDefinition = {
      ...baseDefinition,
      editTopology: { ...baseDefinition.editTopology, describe }
    };
    const entry = element('polyline', [
      [0, 0],
      [4, 0],
      [8, 0]
    ]);
    const { port, session } = setup(entry, false, undefined, undefined, undefined, observedDefinition);
    expect(describe).toHaveBeenCalledTimes(2);

    const moved = port.renders[0].anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing movable anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move', anchor: moved, coordinate: [4, 2] });

    expect(describe).toHaveBeenCalledTimes(2);
    expect(port.renders.at(-1)?.anchors).toEqual([{ ...moved, coordinate: [4, 2] }]);
    port.emit({ type: 'move-cancel', anchor: moved });
    expect(describe).toHaveBeenCalledTimes(3);
    expect(port.renders.at(-1)?.anchors.filter(({ kind }) => kind === 'control')).toHaveLength(3);
    expect(port.renders.at(-1)?.anchors.filter(({ kind }) => kind === 'insertion')).toHaveLength(2);
    session.cancel();
  });

  it('uses the trusted mover and renderer once per built-in drag preview while preserving the resulting geometry', () => {
    const validate = vi.fn();
    const render = vi.fn((points: readonly (readonly [number, number])[]) => ({ type: 'polyline' as const, coordinates: points }));
    const trustedDefinition = createControlPointDefinition({
      type: 'polyline',
      previewMin: 2,
      completeMin: 2,
      validate,
      render
    });
    const entry = element('polyline', [
      [0, 0],
      [4, 0],
      [8, 0]
    ]);
    const { port, session } = setup(entry, false, undefined, undefined, undefined, trustedDefinition);
    validate.mockClear();
    render.mockClear();

    const moved = port.renders[0].anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing trusted movable anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move', anchor: moved, coordinate: [5, 2] });

    expect(validate).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
    expect(port.renders.at(-1)?.geometry).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [5, 2],
        [8, 0]
      ]
    });

    session.cancel();
  });

  it('uses Plot topology and keeps undo/redo history inside only the current edit', () => {
    const entry = element('attack-arrow', [
      [0, 0],
      [2, 0],
      [4, 3],
      [6, 5]
    ]);
    const { port, session, store } = setup(entry);
    const operations: string[] = [];
    session.on('modifying', ({ operation, state }) => {
      expect(state.type).toBe('attack-arrow');
      operations.push(operation);
    });

    const moved = port.renders.at(-1)?.anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 2);
    if (moved?.kind !== 'control') throw new Error('Missing Plot move anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move-end', anchor: moved, coordinate: [5, 4] });

    const insertion = port.renders.at(-1)?.anchors.find((anchor) => anchor.kind === 'insertion');
    if (insertion?.kind !== 'insertion') throw new Error('Missing Plot insertion anchor');
    port.emit({ type: 'insert', anchor: insertion });
    const afterInsert = controlCoordinates(port);
    const inserted = port.renders.at(-1)?.anchors.find((anchor) => anchor.kind === 'control' && anchor.index === insertion.index);
    if (inserted?.kind !== 'control') throw new Error('Missing inserted Plot anchor');
    port.emit({ type: 'remove', anchor: inserted });

    expect(session.undo()).toBe(true);
    expect(controlCoordinates(port)).toEqual(afterInsert);
    expect(session.undo()).toBe(true);
    expect(controlCoordinates(port)).toEqual([
      [0, 0],
      [2, 0],
      [5, 4],
      [6, 5]
    ]);
    expect(session.undo()).toBe(true);
    expect(controlCoordinates(port)).toEqual(entry.geometry.controlPoints);
    expect(session.undo()).toBe(false);

    expect(session.redo()).toBe(true);
    expect(controlCoordinates(port)[2]).toEqual([5, 4]);
    const branchInsertion = port.renders.at(-1)?.anchors.find((anchor) => anchor.kind === 'insertion');
    if (branchInsertion?.kind !== 'insertion') throw new Error('Missing branched Plot insertion anchor');
    port.emit({ type: 'insert', anchor: branchInsertion });
    expect(session.redo()).toBe(false);

    expect(operations).toContain('undo');
    expect(operations).toContain('redo');
    expect(store.get(entry.id)?.geometry).toEqual(entry.geometry);
  });

  it('routes Ctrl/Cmd+Z and Ctrl/Cmd+Y to current edit history and releases the shortcut', () => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    const { keyboard, port, session } = setup(entry);
    const moved = port.renders[0].anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing movable anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move-end', anchor: moved, coordinate: [8, 2] });

    keyboard.emit('z', { ctrlKey: true });
    expect(controlCoordinates(port)).toEqual(entry.geometry.controlPoints);
    keyboard.emit('y', { metaKey: true });
    expect(controlCoordinates(port)[1]).toEqual([8, 2]);
    keyboard.emit('z', { ctrlKey: true, shiftKey: true });
    expect(controlCoordinates(port)[1]).toEqual([8, 2]);

    session.cancel();
    expect(keyboard.dispose).toHaveBeenCalledOnce();
    keyboard.emit('z', { ctrlKey: true });
    expect(keyboard.listener).toBeUndefined();
  });

  it.each([
    ['update', 'external-change'],
    ['remove', 'external-remove']
  ] as const)('cancels without a stale commit when Store receives an external %s', async (operation, expectedReason) => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    const { onTerminal, port, session, store } = setup(entry);
    const reasons: string[] = [];
    session.on('cancel', ({ reason }) => reasons.push(reason));

    if (operation === 'update') store.update({ id: entry.id }, { visible: false });
    else store.remove({ id: entry.id });

    expect(session.status).toBe('cancelled');
    expect(reasons).toEqual([expectedReason]);
    expect(port.destroy).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledOnce();
    expect(await session.finished).toBeUndefined();

    session.finish();
    expect(session.status).toBe('cancelled');
  });

  it('cancels a reentrant finish when an earlier Store subscriber observes an external update', async () => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    const sessionRef: { current?: EditSession } = {};
    const { port, session, store } = setup(entry, false, undefined, (targetStore) => {
      // 外部更新已经提交 revision 后才同步通知监听器；较早监听器中的 finish 必须识别为陈旧编辑。
      targetStore.subscribe(({ changes }) => {
        if (changes.some(({ id, kind }) => id === entry.id && kind === 'update')) sessionRef.current?.finish();
      });
    });
    sessionRef.current = session;
    const completed: Readonly<ElementState>[] = [];
    const cancelled: string[] = [];
    session.on('complete', ({ state }) => completed.push(state));
    session.on('cancel', ({ reason }) => cancelled.push(reason));

    const moved = port.renders[0].anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing movable anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move-end', anchor: moved, coordinate: [8, 2] });

    const externalGeometry = {
      type: 'polyline' as const,
      controlPoints: [
        [0, 0],
        [6, 6]
      ]
    };
    store.update({ id: entry.id }, { geometry: externalGeometry, visible: false });

    expect(session.status).toBe('cancelled');
    expect(cancelled).toEqual(['external-change']);
    expect(completed).toEqual([]);
    expect(await session.finished).toBeUndefined();
    expect(store.get(entry.id)).toMatchObject({ geometry: externalGeometry, visible: false });
  });

  it('folds a reentrant finish from its own Store update into one successful commit', async () => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    const { port, session, store } = setup(entry);
    const moved = port.renders[0].anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing movable anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move-end', anchor: moved, coordinate: [8, 2] });

    const transaction = vi.spyOn(store, 'transaction');
    const completed: Readonly<ElementState>[] = [];
    const cancelled: string[] = [];
    let reentrantFinishes = 0;
    session.on('complete', ({ state }) => completed.push(state));
    session.on('cancel', ({ reason }) => cancelled.push(reason));
    // 自身提交会同步触发 Store 通知，重入 finish 必须折叠到正在进行的同一次提交。
    store.subscribe(({ changes }) => {
      if (!changes.some(({ id, kind }) => id === entry.id && kind === 'update')) return;
      reentrantFinishes += 1;
      session.finish();
    });

    session.finish();
    const committed = store.get(entry.id);

    expect(reentrantFinishes).toBe(1);
    expect(transaction).toHaveBeenCalledOnce();
    expect(session.status).toBe('finished');
    expect(cancelled).toEqual([]);
    expect(completed).toEqual([committed]);
    expect(await session.finished).toEqual(committed);
    expect(committed?.geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [8, 2]
      ]
    });
  });

  it.each(['cancel', 'destroy'] as const)('keeps its own committed update atomic when a Store subscriber calls %s', async (operation) => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    const { onTerminal, port, session, store } = setup(entry);
    const moved = port.renders[0].anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing movable anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move-end', anchor: moved, coordinate: [8, 2] });

    const transaction = vi.spyOn(store, 'transaction');
    const completed: Readonly<ElementState>[] = [];
    const cancelled: string[] = [];
    session.on('complete', ({ state }) => completed.push(state));
    session.on('cancel', ({ reason }) => cancelled.push(reason));
    // 自身事务已经落库后，同步回调中的终端操作不能把成功提交改写为 cancelled。
    store.subscribe(({ changes }) => {
      if (!changes.some(({ id, kind }) => id === entry.id && kind === 'update')) return;
      if (operation === 'cancel') session.cancel();
      else session.destroy();
    });

    session.finish();
    const committed = store.get(entry.id);

    expect(transaction).toHaveBeenCalledOnce();
    expect(session.status).toBe('finished');
    expect(cancelled).toEqual([]);
    expect(completed).toEqual([committed]);
    expect(await session.finished).toEqual(committed);
    expect(port.destroy).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledOnce();
  });

  it('edits in the prepared world and right-click commits one canonical Store transaction exactly once', async () => {
    const entry = element('polyline', [
      [170, 0],
      [190, 0]
    ]);
    const placement: PreparedWorldEdit = {
      controlPoints: [
        [530, 0],
        [550, 0]
      ],
      handoff: { kind: 'wrapped', world: { minX: -180, width: 360 } }
    };
    const { coordinator, onTerminal, port, session, store } = setup(entry, false, placement);
    const transaction = vi.spyOn(store, 'transaction');
    const complete: Readonly<ElementState>[] = [];
    const cancel: string[] = [];
    const storeChanges: string[] = [];
    session.on('complete', ({ state }) => complete.push(state));
    session.on('cancel', ({ reason }) => cancel.push(reason));
    store.subscribe(({ changes }) => storeChanges.push(...changes.map(({ kind }) => kind)));

    expect(controlCoordinates(port)).toEqual(placement.controlPoints);
    const moved = port.renders.at(-1)?.anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing wrapped move anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move-end', anchor: moved, coordinate: [-160, 1] });
    expect(controlCoordinates(port)[1]).toEqual([560, 1]);

    expect(coordinator.handleContextMenu(rightClick())).toBe('consume');
    expect(session.status).toBe('finished');
    expect(transaction).toHaveBeenCalledOnce();
    expect(storeChanges).toEqual(['update']);
    expect(cancel).toEqual([]);
    expect(complete).toHaveLength(1);
    expect(store.get(entry.id)?.geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [170, 0],
        [200, 1]
      ]
    });
    expect(await session.finished).toEqual(store.get(entry.id));

    session.finish();
    session.destroy();
    expect(session.handleContextMenu(rightClick())).toBe('consume');
    expect(transaction).toHaveBeenCalledOnce();
    expect(port.destroy).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledOnce();
  });

  it('cancels without Store writes and makes every later terminal call a no-op', async () => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    const { onTerminal, port, session, store } = setup(entry);
    const transaction = vi.spyOn(store, 'transaction');
    const reasons: string[] = [];
    session.on('cancel', ({ reason }) => reasons.push(reason));

    const moved = port.renders.at(-1)?.anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing cancellation move anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move-end', anchor: moved, coordinate: [8, 2] });
    expect(store.get(entry.id)?.geometry).toEqual(entry.geometry);

    session.cancel();
    session.cancel();
    session.destroy();
    session.finish();

    expect(transaction).not.toHaveBeenCalled();
    expect(store.get(entry.id)?.geometry).toEqual(entry.geometry);
    expect(reasons).toEqual(['cancelled']);
    expect(port.destroy).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledOnce();
    expect(session.undo()).toBe(false);
    expect(session.redo()).toBe(false);
    expect(() => session.on('cancel', () => undefined)).toThrow(ObjectDisposedError);
    expect(await session.finished).toBeUndefined();
  });

  it('isolates throwing and rejecting listeners from later listeners and finished', async () => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    const { reports, session, store } = setup(entry);
    const observations: string[] = [];
    session.on('complete', () => {
      throw new Error('synchronous listener failure');
    });
    session.on('complete', async () => {
      throw new Error('asynchronous listener failure');
    });
    session.on('complete', ({ state }) => observations.push(state.id));

    session.finish();
    const result = await session.finished;
    await Promise.resolve();

    expect(result).toEqual(store.get(entry.id));
    expect(observations).toEqual([entry.id]);
    expect(reports).toHaveLength(2);
    expect(session.status).toBe('finished');
  });

  it('attempts independent cleanup and retries the unfinished native finalizer', async () => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    const { coordinator, onTerminal, port, reports, session } = setup(entry);
    const release = vi.spyOn(coordinator, 'release');
    const destroyFailure = new Error('native destroy failed');
    port.destroy.mockImplementationOnce(() => {
      throw destroyFailure;
    });

    session.destroy();

    expect(session.status).toBe('cancelled');
    expect(port.destroy).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(onTerminal).not.toHaveBeenCalled();
    expect(reports).toEqual([destroyFailure]);
    expect(await session.finished).toBeUndefined();

    session.destroy();
    expect(port.destroy).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledOnce();
  });

  it('rolls back edit history when an undo preview replacement fails', () => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    const { port, session, store } = setup(entry);
    const moved = port.renders[0].anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing movable anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move-end', anchor: moved, coordinate: [8, 2] });
    const failure = new Error('edit preview replacement failed');
    port.render.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => session.undo()).toThrow(failure);
    expect(session.status).toBe('active');
    session.finish();

    expect(store.get(entry.id)?.geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [8, 2]
      ]
    });
  });

  it('rolls back edit history when a redo preview replacement fails', () => {
    const entry = element('polyline', [
      [0, 0],
      [4, 0]
    ]);
    const { port, session, store } = setup(entry);
    const moved = port.renders[0].anchors.find((anchor) => anchor.kind === 'control' && anchor.index === 1);
    if (moved?.kind !== 'control') throw new Error('Missing movable anchor');
    port.emit({ type: 'move-start', anchor: moved, coordinate: moved.coordinate });
    port.emit({ type: 'move-end', anchor: moved, coordinate: [8, 2] });
    expect(session.undo()).toBe(true);
    const failure = new Error('edit preview replacement failed');
    port.render.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => session.redo()).toThrow(failure);
    expect(session.status).toBe('active');
    session.finish();

    expect(store.get(entry.id)?.geometry).toEqual(entry.geometry);
  });
});
