import { describe, expect, it, vi } from 'vitest';
import { ObjectDisposedError } from '../src/core/errors.js';
import type { LayerRenderValue } from '../src/core/ports/LayerRenderPort.js';
import { AnimationManagerImpl } from '../src/services/animation/AnimationManager.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createAnimationHarness, FakeLayerRenderPort, pointElement, polylineElement } from './helpers/animationHarness.js';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('动画生命周期', () => {
  it('hide 暂停且 show 恢复，不把隐藏期间计入动画时间', () => {
    coversCapabilities('layer-feature-hide-show');
    const { manager, render, store } = createAnimationHarness([polylineElement('line')]);
    const handle = manager.play({ id: 'line' }, { type: 'dash-flow', speed: 24 });
    render.frame('default', 0);

    store.hide({ id: 'line' });
    expect(handle.status).toBe('paused');
    expect(render.activeLoopCount).toBe(0);

    store.show({ id: 'line' });
    expect(handle.status).toBe('running');
    const resumed = render.frame('default', 10_000);
    expect(resumed.contributions[0]?.value.primitives?.[0]?.style.strokes?.[0]?.lineDashOffset).toBeCloseTo(0);
    const progressed = render.frame('default', 10_500);
    expect(progressed.contributions[0]?.value.primitives?.[0]?.style.strokes?.[0]?.lineDashOffset).toBe(-12);
  });

  it('元素迁移图层时把动画原子迁移到新的单一 RenderPass', () => {
    const { manager, render, store } = createAnimationHarness([pointElement('point', { layerId: 'layer-a' })]);
    const handle = manager.play({ id: 'point' }, { type: 'pulse' });

    expect(render.activeLayerIds).toEqual(['layer-a']);
    store.update({ id: 'point' }, { layerId: 'layer-b' });

    expect(handle.status).toBe('running');
    expect(render.activeLayerIds).toEqual(['layer-b']);
    expect(render.destroyCalls.get('layer-a')).toBe(1);
    expect(render.openCalls.get('layer-b')).toBe(1);
    expect(render.frame('layer-b', 100).contributions[0]).toEqual(expect.objectContaining({ targetId: 'point', channel: 'pulse' }));
  });

  it('图层索引在旧记录迁入时保持创建顺序并准确维护帧推进计数', () => {
    const { manager, render, store } = createAnimationHarness([pointElement('first', { layerId: 'layer-a' }), pointElement('second', { layerId: 'layer-b' })]);
    const first = manager.play({ id: 'first' }, { type: 'pulse', channel: 'first' });
    const second = manager.play({ id: 'second' }, { type: 'pulse', channel: 'second' });

    store.update({ id: 'first' }, { layerId: 'layer-b' });
    expect(render.frame('layer-b', 0).contributions.map(({ targetId }) => targetId)).toEqual(['first', 'second']);

    first.pause();
    second.pause();
    expect(render.frame('layer-b', 100).requestNextFrame).toBe(false);

    second.resume();
    expect(render.frame('layer-b', 200).requestNextFrame).toBe(true);

    second.stop();
    expect(render.frame('layer-b', 300)).toEqual(
      expect.objectContaining({ requestNextFrame: false, contributions: [expect.objectContaining({ targetId: 'first' })] })
    );

    store.hide({ id: 'first' });
    expect(render.activeLoopCount).toBe(0);
  });

  it('运行中的 path-travel 在下一帧读取事务更新后的 geometry', () => {
    const { manager, render, store } = createAnimationHarness([polylineElement('flight')]);
    manager.play({ id: 'flight' }, { type: 'path-travel', durationMs: 1_000, repeat: false, trailLength: 0.5, showStart: false, showEnd: false, arrow: false });
    render.frame('default', 0);
    render.frame('default', 500);

    store.update(
      { id: 'flight' },
      {
        geometry: {
          type: 'polyline',
          controlPoints: [
            [0, 0],
            [200, 0]
          ]
        }
      }
    );
    const updated = render.frame('default', 750);
    const coordinates = updated.contributions[0]?.value.primitives?.flatMap(({ geometry }) => (geometry.type === 'polyline' ? geometry.coordinates : [])) ?? [];

    expect(Math.max(...coordinates.map(([x]) => x))).toBe(150);
    expect(store.get('flight')?.geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [200, 0]
      ]
    });
  });

  it('五万点 path-travel 每个 geometry revision 只准备一次且帧循环不再读取 Store 或转换几何', () => {
    const { manager, render, shapes, store } = createAnimationHarness([
      polylineElement('large-flight', { geometry: { type: 'polyline', controlPoints: largePath(0) } })
    ]);
    manager.play(
      { id: 'large-flight' },
      {
        type: 'path-travel',
        durationMs: 1_000_000,
        curvature: 0,
        smoothness: 2,
        trailLength: 0.001,
        arrow: false,
        showStart: false,
        showEnd: false
      }
    );
    const get = vi.spyOn(store, 'get');
    const getShape = vi.spyOn(shapes, 'get');
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      render.frame('default', 0);
      expect(hypot).toHaveBeenCalledTimes(49_999);
      render.frame('default', 16);
      expect(hypot).toHaveBeenCalledTimes(49_999);
      expect(get).not.toHaveBeenCalled();
      expect(getShape).not.toHaveBeenCalled();

      store.update({ id: 'large-flight' }, { geometry: { type: 'polyline', controlPoints: largePath(1) } });
      get.mockClear();
      getShape.mockClear();
      hypot.mockClear();

      render.frame('default', 32);
      expect(hypot).toHaveBeenCalledTimes(49_999);
      render.frame('default', 48);
      expect(hypot).toHaveBeenCalledTimes(49_999);
      expect(get).not.toHaveBeenCalled();
      expect(getShape).not.toHaveBeenCalled();
    } finally {
      hypot.mockRestore();
    }
  });

  it('retain 动画完成后保留贡献但不再请求后续帧', () => {
    const { manager, render } = createAnimationHarness([polylineElement('retained-flight')]);
    const handle = manager.play(
      { id: 'retained-flight' },
      {
        type: 'path-travel',
        durationMs: 100,
        repeat: false,
        finishBehavior: 'retain',
        showStart: false,
        showEnd: false,
        arrow: false
      }
    );

    expect(render.frame('default', 0).requestNextFrame).toBe(true);
    const completed = render.frame('default', 100);
    expect(completed.requestNextFrame).toBe(false);
    expect(completed.contributions).toEqual([expect.objectContaining({ targetId: 'retained-flight' })]);
    expect(handle.status).toBe('finished');
    expect(manager.activeCount).toBe(1);
    expect(render.activeLoopCount).toBe(1);

    const retained = render.frame('default', 200);
    expect(retained.requestNextFrame).toBe(false);
    expect(retained.contributions).toEqual([expect.objectContaining({ targetId: 'retained-flight' })]);
  });

  it('Transform preview 只覆盖动画帧输入，清理后恢复 Store geometry 且时间连续', () => {
    const { manager, render, store } = createAnimationHarness([polylineElement('flight')]);
    manager.play({ id: 'flight' }, { type: 'path-travel', durationMs: 1_000, repeat: false, trailLength: 0.5, showStart: false, showEnd: false, arrow: false });
    render.frame('default', 0);
    const state = store.get('flight');
    if (state === undefined) throw new Error('测试元素不存在');

    manager.setPreview({
      ...state,
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [200, 0]
        ]
      }
    });
    const preview = render.frame('default', 500);
    const previewCoordinates =
      preview.contributions[0]?.value.primitives?.flatMap(({ geometry }) => (geometry.type === 'polyline' ? geometry.coordinates : [])) ?? [];
    expect(Math.max(...previewCoordinates.map(([x]) => x))).toBe(100);
    expect(store.get('flight')?.geometry).toEqual(polylineElement('flight').geometry);

    manager.clearPreview('flight');
    const restored = render.frame('default', 750);
    const restoredCoordinates =
      restored.contributions[0]?.value.primitives?.flatMap(({ geometry }) => (geometry.type === 'polyline' ? geometry.coordinates : [])) ?? [];
    expect(Math.max(...restoredCoordinates.map(([x]) => x))).toBe(75);
  });

  it('copy 和快照只复制元素状态，不复制动画运行状态', () => {
    const { manager, render, store } = createAnimationHarness([pointElement('source')]);
    const handle = manager.play({ id: 'source' }, { type: 'pulse', channel: 'source-pulse' });

    const copy = store.copy('source', { module: 'copy' });

    expect(copy.id).not.toBe('source');
    expect(Object.hasOwn(copy, 'animation')).toBe(false);
    expect(manager.activeCount).toBe(1);
    expect(render.frame('default', 0).contributions).toEqual([expect.objectContaining({ targetId: 'source', channel: 'source-pulse' })]);
    expect(handle.status).toBe('running');
  });

  it('单元素 stop/remove 同步移除 dash-flow 和 path-travel 临时贡献，并在最后一项后释放图层循环', () => {
    const { manager, render, store } = createAnimationHarness([polylineElement('dash'), polylineElement('flight')]);
    const dash = manager.play({ id: 'dash' }, { type: 'dash-flow' });
    const flight = manager.play({ id: 'flight' }, { type: 'path-travel' });
    expect(render.openCalls.get('default')).toBe(1);
    expect(
      render
        .frame('default', 0)
        .contributions.map(({ targetId }) => targetId)
        .sort()
    ).toEqual(['dash', 'flight']);

    expect(manager.stop({ id: 'dash' })).toBe(1);
    expect(dash.status).toBe('stopped');
    expect(render.frame('default', 100).contributions.map(({ targetId }) => targetId)).toEqual(['flight']);

    store.remove({ id: 'flight' });
    expect(flight.status).toBe('stopped');
    expect(manager.activeCount).toBe(0);
    expect(render.activeLoopCount).toBe(0);
    expect(render.destroyCalls.get('default')).toBe(1);
    expect(render.requestRenderCalls.get('default')).toBeGreaterThanOrEqual(2);
  });

  it('临时目标不进入 ElementStore，与普通动画共用 RenderPass，注销或按 owner 停止后不泄漏', () => {
    coversCapabilities('transform-bbox-active-blink');
    const { manager, render, store } = createAnimationHarness([pointElement('point')]);
    const applied: LayerRenderValue[] = [];
    const clear = vi.fn();
    const target = render.registerTarget({
      layerId: 'default',
      targetId: 'bbox',
      apply: (value) => applied.push(value),
      clear
    });
    const point = manager.play({ id: 'point' }, { type: 'pulse' });
    const first = manager.playTransient({
      ownerId: 'session-a',
      renderLayerId: 'default',
      renderTargetId: 'bbox',
      channel: 'transform-bbox',
      animation: { type: 'blink', periodMs: 420 }
    });

    expect(store.query().map(({ id }) => id)).toEqual(['point']);
    expect(render.openCalls.get('default')).toBe(1);
    expect(
      render
        .frame('default', 0)
        .contributions.map(({ targetId }) => targetId)
        .sort()
    ).toEqual(['bbox', 'point']);
    expect(applied).toEqual([{ visible: true }]);

    target.destroy();
    expect(clear).toHaveBeenCalledWith('transform-bbox');
    render.frame('default', 420);
    expect(first.status).toBe('stopped');
    expect(manager.activeCount).toBe(1);

    const secondTarget = render.registerTarget({ layerId: 'default', targetId: 'bbox', apply: vi.fn(), clear: vi.fn() });
    const second = manager.playTransient({
      ownerId: 'session-b',
      renderLayerId: 'default',
      renderTargetId: 'bbox',
      channel: 'transform-bbox',
      animation: { type: 'blink', periodMs: 420 }
    });
    expect(manager.stopTransient('session-b')).toBe(1);
    expect(manager.stopTransient('session-b')).toBe(0);
    expect(second.status).toBe('stopped');
    expect(point.status).toBe('running');

    secondTarget.destroy();
    manager.destroy();
    manager.destroy();
    expect(point.status).toBe('stopped');
    expect(render.activeLoopCount).toBe(0);
  });

  it('严格拒绝 transient 嵌套访问器且不执行 getter', () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    render.registerTarget({ layerId: 'default', targetId: 'bbox', apply: vi.fn(), clear: vi.fn() });
    const getter = vi.fn(() => 420);
    const animation = { type: 'blink' };
    Object.defineProperty(animation, 'periodMs', { enumerable: true, get: getter });

    expect(() =>
      manager.playTransient({
        ownerId: 'session',
        renderLayerId: 'default',
        renderTargetId: 'bbox',
        channel: 'transform-bbox',
        animation: animation as never
      })
    ).toThrowError();
    expect(getter).not.toHaveBeenCalled();
  });

  it('Transform 使用真实 AnimationManager 共享 RenderPass 并让折线动画跟随事务 preview', () => {
    let manager!: AnimationManagerImpl;
    let render!: FakeLayerRenderPort;
    const harness = createTransformHarness(false, ({ store, shapes }) => {
      render = new FakeLayerRenderPort();
      manager = new AnimationManagerImpl({ store, shapes, render });
      return { animations: manager, transients: manager };
    });
    addElement(harness, 'line', 'polyline', [
      [0, 0],
      [4, 0]
    ]);
    render.addElementTarget('vector', 'line');
    const bbox = render.registerTarget({ layerId: 'vector', targetId: 'target:transform-1', apply: vi.fn(), clear: vi.fn() });
    const dash = manager.play({ id: 'line' }, { type: 'dash-flow' });
    const session = harness.service.select('line');

    expect(render.openCalls.get('vector')).toBe(1);
    expect(render.frame('vector', 0).contributions.map(({ targetId }) => targetId)).toEqual(['line']);

    harness.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    expect(
      render
        .frame('vector', 0)
        .contributions.map(({ targetId }) => targetId)
        .sort()
    ).toEqual(['line', 'target:transform-1']);
    harness.interaction.emit({ type: 'operation-change', operation: 'translate', delta: { type: 'translate', x: 10, y: 3 } });
    const preview = render.frame('vector', 100).contributions.find(({ targetId }) => targetId === 'line');
    expect(preview?.value.primitives?.[0]?.geometry).toMatchObject({
      type: 'polyline',
      coordinates: [
        [10, 3],
        [14, 3]
      ]
    });

    session.cancel();
    expect(dash.status).toBe('running');
    expect(manager.activeCount).toBe(1);
    expect(render.frame('vector', 200).contributions).toEqual([expect.objectContaining({ targetId: 'line' })]);
    bbox.destroy();
    dash.stop();
    harness.service.destroy();
    manager.destroy();
  });

  it('destroy 先停止全部动画并退订 Store，之后的元素变化不会重新安装循环', () => {
    const { manager, render, store } = createAnimationHarness([pointElement('point')]);
    const handle = manager.play({ id: 'point' }, { type: 'pulse' });

    manager.destroy();
    manager.destroy();
    store.hide({ id: 'point' });
    store.show({ id: 'point' });

    expect(handle.status).toBe('stopped');
    expect(render.activeLoopCount).toBe(0);
    expect(render.openCalls.get('default')).toBe(1);
    expect(() => manager.play({ id: 'point' }, { type: 'pulse' })).toThrowError(ObjectDisposedError);
  });

  it('destroy 在 RenderPass 清理失败后保持引用并允许重复调用完成释放', () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const handle = manager.play({ id: 'point' }, { type: 'pulse' });
    render.failNextDestroy('default');

    expect(() => manager.destroy()).toThrow('Animation render pass cleanup failed');
    expect(handle.status).toBe('stopped');
    expect(render.activeLoopCount).toBe(1);
    expect(() => manager.play({ id: 'point' }, { type: 'pulse' })).toThrowError(ObjectDisposedError);

    manager.destroy();
    expect(render.activeLoopCount).toBe(0);
  });
});

function largePath(offset: number): Array<[number, number]> {
  return Array.from({ length: 50_000 }, (_, index) => [index, (index + offset) % 17]);
}
