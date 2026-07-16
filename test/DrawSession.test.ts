import { describe, expect, it, vi } from 'vitest';
import { identityShapeProjection } from './helpers/shapeProjection.js';
import type {
  DrawInteractionEvent,
  DrawInteractionHandle,
  DrawInteractionPort,
  DrawInteractionRenderState,
  DrawInteractionSpec
} from '../src/core/ports/DrawInteractionPort.js';
import type { EditInteractionPort } from '../src/core/ports/EditInteractionPort.js';
import type { HorizontalWorld } from '../src/core/common/worldWrap.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { InteractionConflictError, InvalidArgumentError } from '../src/core/errors.js';
import type { InputEventMap } from '../src/core/ports/InputPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { ShapeDefinition } from '../src/core/shape/types.js';
import type { ElementStyleState } from '../src/core/style/types.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import { StyleService } from '../src/services/style/StyleService.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import { DrawService } from '../src/services/draw/DrawService.js';
import type { RoutedPointerEvent } from '../src/services/events/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { FakeCursorPort } from './helpers/cursorHarness.js';
import { FakeTooltipPort } from './helpers/transformHarness.js';

const style: ElementStyleState = { strokes: [{ color: '#ff3300', width: 2 }] };

class FakeDrawPort implements DrawInteractionPort {
  readonly previews: Array<Readonly<DrawInteractionRenderState> | undefined> = [];
  readonly render = vi.fn((preview: Readonly<DrawInteractionRenderState> | undefined) => this.previews.push(preview));
  readonly destroy = vi.fn();
  listener: ((event: Readonly<DrawInteractionEvent>) => void) | undefined;
  spec: Readonly<DrawInteractionSpec> | undefined;
  world: HorizontalWorld | undefined;

  open(spec: Readonly<DrawInteractionSpec>, listener: (event: Readonly<DrawInteractionEvent>) => void): DrawInteractionHandle {
    this.spec = spec;
    this.listener = listener;
    return {
      ...(this.world === undefined ? {} : { world: this.world }),
      render: this.render,
      destroy: this.destroy
    };
  }

  emit(event: DrawInteractionEvent): void {
    if (this.listener === undefined) throw new Error('Draw port is not open');
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

function setup(input?: FakeKeyboardInput, definitions: readonly ShapeDefinition[] = [...basicShapeDefinitions, ...plotShapeDefinitions]) {
  const shapes = new ShapeRegistry(definitions);
  const store = new ElementStore(shapes);
  const port = new FakeDrawPort();
  const coordinator = new InteractionCoordinator();
  const cursor = new FakeCursorPort();
  const tooltip = new FakeTooltipPort();
  const reports: unknown[] = [];
  let id = 0;
  const service = new DrawService({
    store,
    shapes,
    shapeProjection: identityShapeProjection,
    styles: new StyleService(store),
    coordinator,
    drawPort: port,
    editPort: {} as EditInteractionPort,
    cursorPort: cursor,
    tooltipPort: tooltip,
    ...(input === undefined ? {} : { input }),
    defaultStyle: () => style,
    createId: () => `draw-${++id}`,
    errorReporter: (error) => reports.push(error)
  });
  return { coordinator, cursor, port, reports, service, store, tooltip };
}

function rightClick(coordinate: readonly [number, number] = [0, 0]): RoutedPointerEvent<'rightclick'> {
  return {
    type: 'rightclick',
    coordinate,
    pixel: [0, 0],
    nativeEventRef: {} as RoutedPointerEvent<'rightclick'>['nativeEventRef']
  };
}

describe('DrawSession', () => {
  coversCapabilities(
    'draw-session-events',
    'draw-session-rightclick-exit',
    'draw-keep-graphics',
    'draw-point-limit',
    'draw-style-preview-result-parity',
    'draw-result-query',
    'draw-result-remove',
    'draw-session-destroy'
  );

  it('validates selectors before querying an empty owned set', () => {
    const { service } = setup();
    const invalid = { id: 'draw-1', ids: ['draw-1'] } as never;

    expect(() => service.query(invalid)).toThrow(InvalidArgumentError);
    expect(() => service.clear(invalid)).toThrow(InvalidArgumentError);
  });

  it('shows the legacy Draw guidance at the pointer, updates history hints, and releases the tooltip with the session', () => {
    const { cursor, port, service, tooltip } = setup();
    const session = service.start({ type: 'polyline', layerId: 'draw-layer', style });

    const cursorView = cursor.views[0];
    expect(cursor.open).toHaveBeenCalledOnce();
    expect(cursorView?.cursor).toBe('pointer');
    expect(cursorView?.set).toHaveBeenCalledWith('pointer');

    expect(tooltip.views).toHaveLength(0);
    port.emit({ type: 'move', coordinate: [2, 3] });

    const view = tooltip.views[0];
    expect(view?.spec).toMatchObject({ ownerId: 'draw:draw-layer', variant: 'draw', offset: [15, -11] });
    expect(view?.state).toMatchObject({ position: [2, 3], lines: ['左击开始绘制，右击退出绘制', '按住 Shift 拖动可自由绘制'] });

    port.emit({ type: 'move', coordinate: [4, 5] });
    port.emit({ type: 'click', coordinate: [4, 5] });
    expect(tooltip.views).toHaveLength(1);
    expect(view?.state).toMatchObject({
      position: [4, 5],
      lines: ['左击开始绘制，右击退出绘制', '按住 Shift 拖动可自由绘制', 'Ctrl+Z 撤销 (1)']
    });

    session.cancel();
    expect(view?.destroyed).toBe(true);
    expect(cursorView?.destroyed).toBe(true);
    expect(cursorView?.cursor).toBeUndefined();
  });

  it('keeps preview state out of Store and commits a variable shape once on right-click', async () => {
    const { coordinator, port, service, store } = setup();
    const session = service.start({ type: 'polyline', layerId: 'draw-layer', style });
    const events: string[] = [];
    session.on('start', () => events.push('start'));
    session.on('click', () => events.push('click'));
    session.on('change', () => events.push('change'));
    session.on('complete', () => events.push('complete'));

    port.emit({ type: 'click', coordinate: [0, 0] });
    expect(events).toEqual(['start', 'click']);
    expect(store.query()).toEqual([]);

    port.emit({ type: 'move', coordinate: [3, 2] });
    expect(port.previews.at(-1)?.geometry).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [3, 2]
      ]
    });
    const previewStyle = port.previews.at(-1)?.style;
    expect(previewStyle).toEqual(style);
    expect(store.query()).toEqual([]);

    port.emit({ type: 'click', coordinate: [3, 2] });
    expect(coordinator.handleContextMenu(rightClick([4, 3]))).toBe('consume');

    expect(session.status).toBe('finished');
    expect(session.results).toHaveLength(1);
    expect(store.query()).toHaveLength(1);
    expect(store.query()[0].geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [3, 2]
      ]
    });
    expect(store.query()[0].style).toEqual(previewStyle);
    expect(events).toEqual(['start', 'click', 'change', 'click', 'change', 'complete']);
    expect(port.destroy).toHaveBeenCalledOnce();
    expect(await session.finished).toEqual(session.results);
  });

  it('keeps fixed shapes continuous until a positive result limit is reached', async () => {
    const { port, service } = setup();
    const session = service.start({ type: 'point', layerId: 'draw-layer', style, limit: 2 });

    port.emit({ type: 'click', coordinate: [1, 2] });
    expect(session.status).toBe('active');
    expect(session.results).toHaveLength(1);

    port.emit({ type: 'click', coordinate: [3, 4] });
    expect(session.status).toBe('finished');
    expect(session.results.map(({ geometry }) => geometry)).toEqual([
      { type: 'point', controlPoints: [[1, 2]] },
      { type: 'point', controlPoints: [[3, 4]] }
    ]);
    expect(await session.finished).toHaveLength(2);
  });

  it('keeps a non-retained Element alive through every complete listener and counts it toward limit', async () => {
    const { port, service, store } = setup();
    const session = service.start({ type: 'point', layerId: 'draw-layer', style, keepGraphics: false, limit: 1 });
    const observations: boolean[] = [];
    session.on('complete', ({ state }) => observations.push(store.get(state.id) !== undefined));
    session.on('complete', ({ state }) => observations.push(store.get(state.id) !== undefined));

    port.emit({ type: 'click', coordinate: [1, 2] });

    expect(observations).toEqual([true, true]);
    expect(store.query()).toEqual([]);
    expect(session.results).toEqual([]);
    expect(session.status).toBe('finished');
    expect(await session.finished).toEqual([]);
  });

  it('undoes and redoes only committed points in the current sketch', () => {
    const { port, service, store } = setup();
    const session = service.start({ type: 'polyline', layerId: 'draw-layer', style });
    port.emit({ type: 'click', coordinate: [0, 0] });
    port.emit({ type: 'click', coordinate: [2, 0] });
    port.emit({ type: 'click', coordinate: [4, 0] });

    expect(session.undo()).toBe(true);
    session.finish();
    expect(store.query()[0].geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [2, 0]
      ]
    });
    expect(session.undo()).toBe(false);
    expect(session.redo()).toBe(false);
  });

  it('routes Ctrl/Cmd+Z and Ctrl/Cmd+Y to only the current sketch and releases the shortcut', () => {
    const keyboard = new FakeKeyboardInput();
    const { port, service, store } = setup(keyboard);
    const session = service.start({ type: 'polyline', layerId: 'draw-layer', style });
    port.emit({ type: 'click', coordinate: [0, 0] });
    port.emit({ type: 'click', coordinate: [2, 0] });
    port.emit({ type: 'click', coordinate: [4, 0] });

    keyboard.emit('z', { ctrlKey: true });
    keyboard.emit('y', { metaKey: true });
    keyboard.emit('z', { ctrlKey: true });
    session.finish();

    expect(store.query()[0].geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [2, 0]
      ]
    });
    expect(keyboard.dispose).toHaveBeenCalledOnce();
    expect(keyboard.listener).toBeUndefined();
  });

  it('preserves earlier fixed-shape results when cancelling an incomplete next sketch', async () => {
    const { port, service, store } = setup();
    const session = service.start({ type: 'circle', layerId: 'draw-layer', style });
    port.emit({ type: 'click', coordinate: [0, 0] });
    port.emit({ type: 'click', coordinate: [2, 0] });
    expect(session.results).toHaveLength(1);

    port.emit({ type: 'click', coordinate: [10, 10] });
    session.cancel();

    expect(session.status).toBe('cancelled');
    expect(store.query()).toHaveLength(1);
    expect(await session.finished).toHaveLength(1);
  });

  it('isolates listener failures and scopes query/clear to draw-owned ids', async () => {
    const { port, reports, service, store } = setup();
    store.add({
      id: 'unrelated',
      type: 'point',
      geometry: { type: 'point', controlPoints: [[9, 9]] },
      style,
      module: 'same-module',
      layerId: 'draw-layer',
      visible: true
    });
    const session = service.start({ type: 'point', layerId: 'draw-layer', style, module: 'same-module', limit: 1 });
    const second = vi.fn();
    session.on('complete', () => {
      throw new Error('listener failed');
    });
    session.on('complete', second);

    port.emit({ type: 'click', coordinate: [1, 1] });

    expect(second).toHaveBeenCalledOnce();
    expect(reports).toHaveLength(1);
    expect(service.query({ module: 'same-module' })).toHaveLength(1);
    expect(service.clear({ module: 'same-module' })).toBe(1);
    expect(store.get('unrelated')).toBeDefined();
    await expect(session.finished).resolves.toHaveLength(1);
  });

  it('commits exactly once when a complete listener requests finish reentrantly', async () => {
    const { port, service, store } = setup();
    const session = service.start({ type: 'point', layerId: 'draw-layer', style });
    const complete = vi.fn(() => session.finish());
    session.on('complete', complete);

    port.emit({ type: 'click', coordinate: [1, 2] });

    expect(complete).toHaveBeenCalledOnce();
    expect(store.query()).toHaveLength(1);
    expect(session.status).toBe('finished');
    await expect(session.finished).resolves.toHaveLength(1);
  });

  it('emits one incomplete cancellation when its listener calls finish reentrantly', async () => {
    const { port, service } = setup();
    const session = service.start({ type: 'double-arrow', layerId: 'draw-layer', style });
    // incomplete 事件同步重入 finish 时只能复用外层终止流程，不能递归再次派发事件。
    const cancel = vi.fn(() => session.finish());
    session.on('cancel', cancel);
    port.emit({ type: 'click', coordinate: [0, 0] });

    session.finish();

    expect(cancel).toHaveBeenCalledOnce();
    expect(session.status).toBe('finished');
    await expect(session.finished).resolves.toEqual([]);
  });

  it('does not adopt a same-id replacement as a retained draw result', async () => {
    const { port, service, store } = setup();
    const session = service.start({ type: 'point', layerId: 'draw-layer', style });
    port.emit({ type: 'click', coordinate: [1, 2] });
    // 相同 ID 被移除后重新添加已经是新 generation，不能成为原会话的结果。
    store.remove({ id: 'draw-1' });
    store.add({
      id: 'draw-1',
      type: 'point',
      geometry: { type: 'point', controlPoints: [[9, 9]] },
      style,
      layerId: 'draw-layer',
      visible: true
    });

    expect(session.results).toEqual([]);
    session.finish();
    await expect(session.finished).resolves.toEqual([]);
    expect(store.get('draw-1')?.geometry).toEqual({ type: 'point', controlPoints: [[9, 9]] });
  });

  it('does not remove a same-id replacement created by a transient complete listener', () => {
    const { port, service, store } = setup();
    const session = service.start({ type: 'point', layerId: 'draw-layer', style, keepGraphics: false, limit: 1 });
    session.on('complete', ({ state }) => {
      // complete 监听器可同步替换同 ID 元素；会话清理只能条件删除刚提交的 generation。
      store.remove({ id: state.id });
      store.add({
        id: state.id,
        type: 'point',
        geometry: { type: 'point', controlPoints: [[7, 8]] },
        style,
        layerId: 'draw-layer',
        visible: true
      });
    });

    port.emit({ type: 'click', coordinate: [1, 2] });

    expect(store.get('draw-1')?.geometry).toEqual({ type: 'point', controlPoints: [[7, 8]] });
    expect(session.results).toEqual([]);
  });

  it('delivers a live transient result to listeners snapshotted before a reentrant cancellation', async () => {
    const { port, service, store } = setup();
    const session = service.start({ type: 'point', layerId: 'draw-layer', style, keepGraphics: false });
    const observations: string[] = [];
    session.on('complete', ({ state }) => {
      observations.push(`first:${store.get(state.id)?.id}`);
      session.cancel();
    });
    session.on('complete', ({ state }) => observations.push(`second:${store.get(state.id)?.id}`));

    port.emit({ type: 'click', coordinate: [1, 2] });

    expect(observations).toEqual(['first:draw-1', 'second:draw-1']);
    expect(store.query()).toEqual([]);
    await expect(session.finished).resolves.toEqual([]);
  });

  it('rolls back draw history when an undo preview replacement fails', () => {
    const { port, service, store } = setup();
    const session = service.start({ type: 'polyline', layerId: 'draw-layer', style });
    port.emit({ type: 'click', coordinate: [0, 0] });
    port.emit({ type: 'click', coordinate: [2, 0] });
    port.emit({ type: 'click', coordinate: [4, 0] });
    const failure = new Error('preview replacement failed');
    port.render.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => session.undo()).toThrow(failure);
    expect(session.status).toBe('active');
    session.finish();

    expect(store.query()[0]?.geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [2, 0],
        [4, 0]
      ]
    });
  });

  it('rolls back draw history when a redo preview replacement fails', () => {
    const { port, service, store } = setup();
    const session = service.start({ type: 'polyline', layerId: 'draw-layer', style });
    port.emit({ type: 'click', coordinate: [0, 0] });
    port.emit({ type: 'click', coordinate: [2, 0] });
    port.emit({ type: 'click', coordinate: [4, 0] });
    expect(session.undo()).toBe(true);
    const failure = new Error('preview replacement failed');
    port.render.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => session.redo()).toThrow(failure);
    expect(session.status).toBe('active');
    session.finish();

    expect(store.query()[0]?.geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [2, 0]
      ]
    });
  });

  it('retries unfinished native cleanup when destroy is called again', () => {
    const { port, reports, service } = setup();
    const session = service.start({ type: 'polyline', layerId: 'draw-layer', style });
    port.destroy.mockImplementationOnce(() => {
      throw new Error('native cleanup failed');
    });

    session.destroy();
    expect(session.status).toBe('cancelled');
    expect(port.destroy).toHaveBeenCalledTimes(1);
    expect(reports).toHaveLength(1);

    session.destroy();
    expect(port.destroy).toHaveBeenCalledTimes(2);
  });

  it('normalizes freehand samples across wrapped worlds before committing', () => {
    const { port, service, store } = setup();
    port.world = { minX: -180, width: 360 };
    const session = service.start({ type: 'polyline', layerId: 'draw-layer', style, limit: 1 });

    port.emit({ type: 'freehand-start', coordinate: [170, 1] });
    port.emit({ type: 'freehand-sample', coordinate: [-170, 2] });
    port.emit({ type: 'freehand-complete', coordinate: [-160, 3] });

    expect(store.query()[0].geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [170, 1],
        [190, 2],
        [200, 3]
      ]
    });
    expect(session.status).toBe('finished');
  });

  it('preserves custom freehand append semantics for every coordinate in a batched frame', () => {
    const builtin = basicShapeDefinitions.find((definition) => definition.type === 'polyline');
    if (builtin === undefined || builtin.freehand === undefined) throw new Error('Missing built-in polyline freehand policy');
    const appendSample = vi.fn((samples: readonly (readonly [number, number])[], coordinate: readonly [number, number]) =>
      coordinate[0] === 2 ? samples : [...samples, coordinate]
    );
    const custom = {
      ...builtin,
      freehand: {
        appendSample,
        normalizeSamples: builtin.freehand.normalizeSamples
      }
    } as ShapeDefinition;
    const definitions = basicShapeDefinitions.map((definition) => (definition.type === 'polyline' ? custom : definition));
    const { port, service, store } = setup(undefined, [...definitions, ...plotShapeDefinitions]);
    service.start({ type: 'polyline', layerId: 'draw-layer', style, limit: 1 });

    port.emit({ type: 'freehand-start', coordinate: [0, 0] });
    port.emit({
      type: 'freehand-samples',
      coordinates: [
        [1, 1],
        [2, 2],
        [3, 3]
      ]
    });
    port.emit({ type: 'freehand-complete', coordinate: [4, 4] });

    expect(appendSample.mock.calls.map(([samples]) => samples.length)).toEqual([0, 1, 2, 2, 3]);
    expect(appendSample.mock.calls.map(([, coordinate]) => coordinate)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4]
    ]);
    expect(store.query()[0].geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [1, 1],
        [3, 3],
        [4, 4]
      ]
    });
  });

  it('keeps built-in 1k/5k freehand batches near-linear, renders once per batch, and retains every sample', () => {
    const run = (sampleCount: number) => {
      const { port, service } = setup();
      const session = service.start({ type: 'polyline', layerId: 'draw-layer', style });
      port.emit({ type: 'freehand-start', coordinate: [0, 0] });
      const samples = Array.from({ length: sampleCount }, (_, index) => [index + 1, (index + 1) % 19] as const);
      const renderCount = port.render.mock.calls.length;
      const started = performance.now();
      port.emit({ type: 'freehand-samples', coordinates: samples });
      const elapsedMs = performance.now() - started;
      const geometry = port.previews.at(-1)?.geometry;
      if (geometry?.type !== 'polyline') throw new Error('Missing freehand preview');
      expect(port.render.mock.calls.length - renderCount).toBe(1);
      expect(geometry.coordinates).toHaveLength(sampleCount + 1);
      expect(geometry.coordinates[1]).toEqual([1, 1]);
      expect(geometry.coordinates[Math.floor(sampleCount / 2)]).toEqual([Math.floor(sampleCount / 2), Math.floor(sampleCount / 2) % 19]);
      expect(geometry.coordinates[sampleCount]).toEqual([sampleCount, sampleCount % 19]);
      session.cancel();
      return elapsedMs;
    };

    const oneThousandMs = run(1_000);
    const fiveThousandMs = run(5_000);
    expect(fiveThousandMs).toBeLessThan(1_500);
    expect(fiveThousandMs).toBeLessThan(oneThousandMs * 10 + 250);
  });

  it('keeps 1k/5k ordinary vertex history incremental through click, undo, and redo', () => {
    const builtin = basicShapeDefinitions.find((definition) => definition.type === 'polyline');
    if (builtin === undefined) throw new Error('Missing built-in polyline definition');
    const constantDraftDefinition = {
      ...builtin,
      createDraft: (points: readonly (readonly [number, number])[]) => {
        const coordinate = points.at(-1);
        return coordinate === undefined ? undefined : { type: 'polyline' as const, controlPoints: [coordinate, coordinate] };
      }
    } as ShapeDefinition;
    const run = (pointCount: number) => {
      const { port, service } = setup(undefined, [constantDraftDefinition]);
      const session = service.start({ type: 'polyline', layerId: 'draw-layer', style });
      const started = performance.now();
      for (let index = 0; index < pointCount; index += 1) port.emit({ type: 'click', coordinate: [index, index % 23] });
      for (let index = 0; index < pointCount; index += 1) expect(session.undo()).toBe(true);
      expect(session.undo()).toBe(false);
      for (let index = 0; index < pointCount; index += 1) expect(session.redo()).toBe(true);
      expect(session.redo()).toBe(false);
      const elapsedMs = performance.now() - started;
      session.cancel();
      return elapsedMs;
    };

    const oneThousandMs = run(1_000);
    const fiveThousandMs = run(5_000);
    expect(fiveThousandMs).toBeLessThan(1_500);
    expect(fiveThousandMs).toBeLessThan(oneThousandMs * 10 + 250);
  });

  it('continues and completes or cancels after a programmatic view jump of plus or minus 50 worlds', () => {
    const completed = setup();
    completed.port.world = { minX: -180, width: 360 };
    const completedSession = completed.service.start({ type: 'polyline', layerId: 'draw-layer', style, limit: 1 });
    completed.port.emit({ type: 'freehand-start', coordinate: [170, 1] });
    completed.port.emit({ type: 'freehand-samples', coordinates: [[-170 + 50 * 360, 2]] });
    completed.port.emit({ type: 'freehand-complete', coordinate: [-160 + 50 * 360, 3] });

    expect(completedSession.status).toBe('finished');
    expect(completed.store.query()[0].geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [170, 1],
        [190, 2],
        [200, 3]
      ]
    });

    const cancelled = setup();
    cancelled.port.world = { minX: -180, width: 360 };
    const cancelledSession = cancelled.service.start({ type: 'polyline', layerId: 'draw-layer', style });
    cancelled.port.emit({ type: 'click', coordinate: [170, 1] });
    cancelled.port.emit({ type: 'click', coordinate: [-170 - 50 * 360, 2] });
    cancelledSession.cancel();

    expect(cancelledSession.status).toBe('cancelled');
    expect(cancelled.store.query()).toEqual([]);
    expect(cancelled.port.previews.at(-1)?.geometry).toEqual({
      type: 'polyline',
      coordinates: [
        [170, 1],
        [190, 2]
      ]
    });
  });

  it('moves an ordinary sketch as one group back into the canonical world', () => {
    const { port, service, store } = setup();
    port.world = { minX: -180, width: 360 };
    const session = service.start({ type: 'polyline', layerId: 'draw-layer', style });

    port.emit({ type: 'click', coordinate: [530, 1] });
    port.emit({ type: 'click', coordinate: [-170, 2] });
    session.finish();

    expect(store.query()[0].geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [170, 1],
        [190, 2]
      ]
    });
  });

  it('uses double-arrow completion semantics for right-click with three control points', () => {
    const { coordinator, port, service, store } = setup();
    const session = service.start({ type: 'double-arrow', layerId: 'draw-layer', style });
    port.emit({ type: 'click', coordinate: [0, 0] });
    port.emit({ type: 'click', coordinate: [4, 0] });
    port.emit({ type: 'click', coordinate: [1, 3] });

    expect(coordinator.handleContextMenu(rightClick())).toBe('consume');

    expect(session.status).toBe('finished');
    expect(store.query()[0].geometry.type).toBe('double-arrow');
    expect('controlPoints' in store.query()[0].geometry && store.query()[0].geometry.controlPoints).toHaveLength(5);
  });

  it('consumes right-click and finishes without a result when the sketch is incomplete', async () => {
    const { coordinator, port, service, store } = setup();
    const session = service.start({ type: 'double-arrow', layerId: 'draw-layer', style });
    const cancel = vi.fn();
    session.on('cancel', cancel);
    port.emit({ type: 'click', coordinate: [0, 0] });
    port.emit({ type: 'click', coordinate: [4, 0] });

    expect(coordinator.handleContextMenu(rightClick())).toBe('consume');

    expect(cancel).toHaveBeenCalledWith({ type: 'cancel', reason: 'incomplete' });
    expect(session.status).toBe('finished');
    expect(store.query()).toEqual([]);
    await expect(session.finished).resolves.toEqual([]);
  });

  it('replaces the active interaction by default and rejects explicitly without leaking a session', () => {
    const { coordinator, port, service } = setup();
    const first = service.start({ type: 'polyline', layerId: 'draw-layer', style });

    const second = service.start({ type: 'polyline', layerId: 'draw-layer', style });
    expect(first.status).toBe('cancelled');
    expect(second.status).toBe('active');
    expect(coordinator.active).toBe(second);

    expect(() => service.start({ type: 'point', layerId: 'draw-layer', style, policy: 'reject' })).toThrow(InteractionConflictError);
    expect(coordinator.active).toBe(second);
    expect(port.destroy).toHaveBeenCalledTimes(1);
  });

  it('lets service destruction retry a session whose native cleanup did not finish', () => {
    const { port, service } = setup();
    service.start({ type: 'polyline', layerId: 'draw-layer', style });
    port.destroy.mockImplementationOnce(() => {
      throw new Error('native cleanup failed');
    });

    service.destroy();
    expect(port.destroy).toHaveBeenCalledTimes(1);

    service.destroy();
    expect(port.destroy).toHaveBeenCalledTimes(2);
    expect(() => service.query()).toThrow();
  });

  it('rejects uninspectable and accessor options without executing user code', () => {
    const { port, service } = setup();
    let getterCalls = 0;
    const accessor = { layerId: 'draw-layer' } as Record<string, unknown>;
    Object.defineProperty(accessor, 'type', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'point';
      }
    });
    const uninspectable = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('proxy trap');
        }
      }
    );

    expect(() => service.start(accessor as never)).toThrow(InvalidArgumentError);
    expect(() => service.start(uninspectable as never)).toThrow(InvalidArgumentError);
    expect(getterCalls).toBe(0);
    expect(port.listener).toBeUndefined();
  });
});
