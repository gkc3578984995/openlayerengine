import { describe, expect, it, vi } from 'vitest';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('Transform 多 Earth 隔离', () => {
  coversCapabilities('transform-multi-earth-isolation');

  it('相同 Element ID 的选择与变换只修改当前上下文', () => {
    const first = createTransformHarness();
    const second = createTransformHarness();
    addElement(first, 'shared', 'point', [[1, 2]]);
    addElement(second, 'shared', 'point', [[10, 20]]);
    const firstSession = first.service.select('shared');
    const secondSession = second.service.select('shared');
    const secondTranslate = vi.fn();
    secondSession.on('translating', secondTranslate);

    first.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    first.interaction.emit({ type: 'operation-change', operation: 'translate', delta: { type: 'translate', x: 5, y: -1 } });
    first.interaction.emit({ type: 'operation-end', operation: 'translate', delta: { type: 'translate', x: 5, y: -1 } });
    firstSession.finish();

    expect(first.store.get('shared')?.geometry).toEqual({ type: 'point', controlPoints: [[6, 1]] });
    expect(second.store.get('shared')?.geometry).toEqual({ type: 'point', controlPoints: [[10, 20]] });
    expect(secondSession.status).toBe('active');
    expect(second.interaction.handle?.target?.geometry).toEqual({ type: 'point', coordinates: [10, 20] });
    expect(secondTranslate).not.toHaveBeenCalled();
    secondSession.cancel();
  });

  it('当前上下文的右键提交不会结束另一上下文的会话', () => {
    const first = createTransformHarness();
    const second = createTransformHarness();
    addElement(first, 'first', 'point', [[0, 0]]);
    addElement(second, 'second', 'point', [[2, 2]]);
    const firstSession = first.service.select('first');
    const secondSession = second.service.select('second');

    const decision = first.coordinator.handleContextMenu({
      type: 'rightclick',
      coordinate: [0, 0],
      pixel: [0, 0],
      nativeEventRef: {} as never
    });

    expect(decision).toBe('consume');
    expect(firstSession.status).toBe('finished');
    expect(secondSession.status).toBe('active');
    secondSession.cancel();
  });

  it('工具栏命令只作用于所属 Transform 会话', () => {
    const first = createTransformHarness({});
    const second = createTransformHarness({});
    addElement(first, 'first', 'point', [[0, 0]]);
    addElement(second, 'second', 'point', [[2, 2]]);
    const firstSession = first.service.select('first', { toolbar: {} });
    const secondSession = second.service.select('second', { toolbar: {} });

    first.toolbarPort.command?.('exit');

    expect(firstSession.status).toBe('finished');
    expect(first.toolbarPort.views[0]?.destroy).toHaveBeenCalledOnce();
    expect(secondSession.status).toBe('active');
    expect(second.toolbarPort.views[0]?.destroy).not.toHaveBeenCalled();
    secondSession.cancel();
  });

  it('销毁一个 TransformService 不会清理另一上下文的资源', () => {
    const first = createTransformHarness();
    const second = createTransformHarness();
    addElement(first, 'first', 'point', [[0, 0]]);
    addElement(second, 'second', 'point', [[2, 2]]);
    const firstSession = first.service.select('first');
    const secondSession = second.service.select('second');

    first.service.destroy();

    expect(firstSession.status).toBe('cancelled');
    expect(first.interaction.handle?.destroyed).toBe(true);
    expect(secondSession.status).toBe('active');
    expect(second.interaction.handle?.destroyed).toBe(false);
    expect(second.store.get('second')).toBeDefined();
    secondSession.cancel();
  });
});
