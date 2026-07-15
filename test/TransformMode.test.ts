import { describe, expect, it, vi } from 'vitest';
import type { TransformDelta, TransformInteractionTarget } from '../src/core/ports/TransformInteractionPort.js';
import type { Element } from '../src/facade/Element.js';
import { TransformSessionFacade } from '../src/facade/TransformSessionFacade.js';
import type { ElementService } from '../src/facade/types.js';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('Transform 编辑模式', () => {
  it('选择后默认处于 transform 模式，工具栏 edit 命令才进入互斥的顶点编辑模式', () => {
    const harness = createTransformHarness({});
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);

    const session = harness.service.select('line-a', { toolbar: {} });

    expect(session.mode).toBe('transform');
    expectTransformMode(harness.interaction.handle?.target);

    harness.toolbarPort.command?.('edit');

    expect(session.mode).toBe('edit');
    expectEditMode(harness.interaction.handle?.target);
    expect(harness.toolbarPort.views[0]?.setActive).toHaveBeenCalledWith('edit');

    session.setMode('transform');
    expect(session.mode).toBe('transform');
    expectTransformMode(harness.interaction.handle?.target);

    session.setMode('edit');
    expect(session.mode).toBe('edit');
    expectEditMode(harness.interaction.handle?.target);
  });

  it('transform 模式拒绝 vertex 操作且不会改变预览或持久化几何', () => {
    const harness = createTransformHarness();
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);
    const session = harness.service.select('line-a');
    const errors = vi.fn();
    session.on('error', errors);
    const beforeStore = harness.store.get('line-a')?.geometry;
    const beforeTarget = harness.interaction.handle?.target?.geometry;
    const start: TransformDelta = { type: 'vertex', index: 0, coordinate: [0, 0] };
    const moved: TransformDelta = { type: 'vertex', index: 0, coordinate: [9, 7] };

    harness.interaction.emit({ type: 'operation-start', operation: 'vertex', delta: start });
    harness.interaction.emit({ type: 'operation-end', operation: 'vertex', delta: moved });

    expect(harness.store.get('line-a')?.geometry).toEqual(beforeStore);
    if (session.status === 'active') {
      expect(harness.interaction.handle?.target?.geometry).toEqual(beforeTarget);
      expect(session.mode).toBe('transform');
    } else {
      expect(session.status).toBe('cancelled');
      expect(errors).toHaveBeenCalled();
    }
  });

  it('公共 TransformSession 将 mode 和 setMode 路由到内部会话', () => {
    const harness = createTransformHarness();
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);
    const element = { id: 'line-a' } as Element;
    const elements = {
      get: <T>(id: string) => (id === element.id ? (element as Element<T>) : undefined)
    } as ElementService;
    const internal = harness.service.select('line-a');
    const session = new TransformSessionFacade(internal, elements);

    expect(session.mode).toBe('transform');
    session.setMode('edit');
    expect(session.mode).toBe('edit');
    expect(internal.mode).toBe('edit');
    expectEditMode(harness.interaction.handle?.target);
  });

  it('只在操作期间运行 bbox transient，并在 operation-end 后立即停止', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[1, 2]]);
    const session = harness.service.select('point-a');

    expect(transientPlays(harness.log)).toHaveLength(0);
    expect(transientStops(harness.log)).toHaveLength(0);

    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    expect(transientPlays(harness.log)).toHaveLength(1);
    expect(transientStops(harness.log)).toHaveLength(0);
    expect(harness.interaction.handle?.operationActive).toBe(true);

    harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: { type: 'translate', x: 3, y: -1 } });
    expect(transientPlays(harness.log)).toHaveLength(1);
    expect(transientStops(harness.log)).toHaveLength(1);
    expect(harness.interaction.handle?.operationActive).toBe(false);

    session.finish();
    expect(transientStops(harness.log)).toHaveLength(1);
  });

  it('操作进行中拒绝切换模式，并在操作结束后保持会话可继续使用', () => {
    const harness = createTransformHarness();
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);
    const session = harness.service.select('line-a');
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });

    expect(() => session.setMode('edit')).toThrow('Transform mode cannot change while an operation is active');
    expect(session.status).toBe('active');
    expect(session.mode).toBe('transform');
    expect(harness.interaction.handle?.operationActive).toBe(true);

    harness.interaction.emit({ type: 'operation-end', operation: 'translate', delta: { type: 'translate', x: 2, y: 1 } });
    expect(session.status).toBe('active');
    expect(harness.interaction.handle?.operationActive).toBe(false);
    expect(() => session.setMode('edit')).not.toThrow();
    expect(session.mode).toBe('edit');
  });

  it('操作结束后恢复当前手柄提示，直到指针离开手柄', () => {
    const harness = createTransformHarness();
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);
    harness.service.select('line-a');
    const tooltip = harness.tooltipPort.views[0];
    if (tooltip === undefined) throw new Error('Transform tooltip was not created.');
    const startDelta: TransformDelta = { type: 'scale', scaleX: 1, scaleY: 1, center: [2, 1] };
    const endDelta: TransformDelta = { type: 'scale', scaleX: 1.5, scaleY: 1.5, center: [2, 1] };

    harness.interaction.emit({
      type: 'enter-handle',
      key: 'scale-ne',
      operation: 'scale',
      axis: 'xy',
      cursor: 'nwse-resize',
      coordinate: [4, 2],
      pixel: [20, 10]
    });
    const handleLines = tooltip.state.lines;
    expect(handleLines.join('')).toContain('Shift');

    harness.interaction.emit({ type: 'operation-start', operation: 'scale', delta: startDelta });
    expect(tooltip.state.lines).toEqual(['缩放中…']);
    harness.interaction.emit({ type: 'operation-end', operation: 'scale', delta: endDelta });
    expect(tooltip.state.lines).toEqual(handleLines);

    harness.interaction.emit({
      type: 'leave-handle',
      key: 'scale-ne',
      operation: 'scale',
      axis: 'xy',
      cursor: 'nwse-resize',
      coordinate: [5, 3],
      pixel: [30, 20]
    });
    expect(tooltip.state.lines.join('')).not.toContain('Shift');
  });

  it('选中框范围变化后把工具栏锚定到右上角', () => {
    const harness = createTransformHarness({});
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);
    harness.service.select('line-a', { toolbar: {} });
    const toolbar = harness.toolbarPort.views[0];
    if (toolbar === undefined) throw new Error('Transform toolbar was not created.');

    harness.interaction.emit({ type: 'bounds-change', topRight: [6, 5] });

    expect(toolbar.updateOptions).toHaveBeenCalledWith({ position: [6, 5] });
  });

  it.each(['cancel', 'finish', 'destroy'] as const)('%s 会停止尚未结束的 transient，重复清理不会泄漏或重复停止', (terminal) => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[1, 2]]);
    const session = harness.service.select('point-a');
    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });

    expect(transientPlays(harness.log)).toHaveLength(1);
    expect(transientStops(harness.log)).toHaveLength(0);

    session[terminal]();

    expect(transientStops(harness.log)).toHaveLength(1);
    expect(harness.interaction.handle?.operationActive).toBe(false);
    session.destroy();
    expect(transientStops(harness.log)).toHaveLength(1);
  });

  it('重新选择元素会重置为 transform 模式', () => {
    const harness = createTransformHarness({});
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);
    addElement(harness, 'line-b', 'polyline', [
      [10, 10],
      [14, 12]
    ]);
    const session = harness.service.select('line-a', { toolbar: {} });
    session.setMode('edit');
    expectEditMode(harness.interaction.handle?.target);

    session.select('line-b');

    expect(session.mode).toBe('transform');
    expect(harness.interaction.handle?.target?.elementId).toBe('line-b');
    expectTransformMode(harness.interaction.handle?.target);
  });

  it('undo 和 redo 在编辑期间保持 edit 模式及其互斥能力', () => {
    const harness = createTransformHarness();
    addElement(harness, 'line-a', 'polyline', [
      [0, 0],
      [4, 2]
    ]);
    const session = harness.service.select('line-a');
    session.setMode('edit');
    harness.interaction.emit({ type: 'operation-start', operation: 'vertex', delta: { type: 'vertex', index: 0, coordinate: [0, 0] } });
    harness.interaction.emit({ type: 'operation-end', operation: 'vertex', delta: { type: 'vertex', index: 0, coordinate: [3, 5] } });

    expect(session.undo()).toBe(true);
    expect(session.mode).toBe('edit');
    expectEditMode(harness.interaction.handle?.target);

    expect(session.redo()).toBe(true);
    expect(session.mode).toBe('edit');
    expectEditMode(harness.interaction.handle?.target);
  });
});

function expectTransformMode(target: TransformInteractionTarget | undefined): void {
  expect(target).toMatchObject({
    mode: 'transform',
    canTranslate: true,
    canRotate: true,
    canScale: true,
    canStretch: true,
    canEditVertices: false
  });
}

function expectEditMode(target: TransformInteractionTarget | undefined): void {
  expect(target).toMatchObject({
    mode: 'edit',
    canTranslate: false,
    canRotate: false,
    canScale: false,
    canStretch: false,
    canEditVertices: true
  });
}

function transientPlays(log: readonly string[]): readonly string[] {
  return log.filter((entry) => entry.startsWith('transient:play:'));
}

function transientStops(log: readonly string[]): readonly string[] {
  return log.filter((entry) => entry === 'transient:handle-stop');
}
