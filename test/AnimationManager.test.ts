import { describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError, UnsupportedOperationError } from '../src/core/errors.js';
import { createNativeStyleRef } from '../src/core/style/types.js';
import type { AnimationManager } from '../src/services/animation/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createAnimationHarness, pointElement, polylineElement } from './helpers/animationHarness.js';

describe('AnimationManager', () => {
  it('通过统一句柄控制播放、暂停、恢复和停止，并完成 finished', async () => {
    coversCapabilities('animation-point-pulse', 'animation-point-pulse-control');
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const publicManager: AnimationManager = manager;

    const handle = publicManager.play({ id: 'point' }, { type: 'pulse', periodMs: 800 });

    expect(handle.id).toMatch(/^animation-/);
    expect(handle.status).toBe('running');
    expect(manager.activeCount).toBe(1);
    expect(manager.activeLayerCount).toBe(1);
    expect(render.frame('default', 100).contributions).toHaveLength(1);

    handle.pause();
    expect(handle.status).toBe('paused');
    expect(manager.activeLayerCount).toBe(1);
    expect(render.activeLoopCount).toBe(1);
    expect(render.frame('default', 5_000)).toEqual(
      expect.objectContaining({ requestNextFrame: false, contributions: [expect.objectContaining({ targetId: 'point' })] })
    );

    handle.resume();
    expect(handle.status).toBe('running');
    expect(render.frame('default', 6_000).contributions).toHaveLength(1);

    handle.stop();
    handle.stop();
    expect(handle.status).toBe('stopped');
    expect(manager.activeCount).toBe(0);
    expect(render.activeLoopCount).toBe(0);
    await expect(handle.finished).resolves.toBeUndefined();
  });

  it('空选择器结果立即完成且不安装图层渲染循环', async () => {
    const { manager, render } = createAnimationHarness();

    const handle = manager.play({ id: 'missing' }, { type: 'pulse' });

    expect(handle.status).toBe('finished');
    expect(manager.activeCount).toBe(0);
    expect(render.openCalls.size).toBe(0);
    await expect(handle.finished).resolves.toBeUndefined();
  });

  it('同目标同 channel 替换旧动画，不同 channel 在同一帧组合', async () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const replaced = manager.play({ id: 'point' }, { type: 'pulse', channel: 'highlight', color: '#ff0000' });
    const current = manager.play({ id: 'point' }, { type: 'pulse', channel: 'highlight', color: '#00ff00' });
    const composed = manager.play({ id: 'point' }, { type: 'pulse', channel: 'selection', color: '#0000ff' });

    expect(replaced.status).toBe('stopped');
    await expect(replaced.finished).resolves.toBeUndefined();
    expect(current.status).toBe('running');
    expect(composed.status).toBe('running');
    expect(manager.activeCount).toBe(2);
    expect(render.openCalls.get('default')).toBe(1);

    const batch = render.frame('default', 0);
    expect(batch.contributions.map(({ channel }) => channel).sort()).toEqual(['highlight', 'selection']);
    expect(batch.contributions.every(({ targetId }) => targetId === 'point')).toBe(true);
  });

  it('支持按 id、module、layerId、type 和 channel 组合控制并保留嵌套暂停深度', () => {
    coversCapabilities('animation-polyline-dash-flow');
    const { manager } = createAnimationHarness([
      pointElement('point-a', { module: 'markers', layerId: 'layer-a' }),
      pointElement('point-b', { module: 'markers', layerId: 'layer-b' }),
      polylineElement('line-a', { module: 'routes', layerId: 'layer-a' })
    ]);
    const points = manager.play({ type: 'point' }, { type: 'pulse', channel: 'pulse' });
    const line = manager.play({ id: 'line-a' }, { type: 'dash-flow', channel: 'dash' });

    expect(manager.pause({ id: 'point-a' })).toBe(1);
    expect(manager.pause({ module: 'markers' }, ['pulse'])).toBe(2);
    expect(points.status).toBe('paused');
    expect(line.status).toBe('running');

    expect(manager.resume({ module: 'markers' }, ['pulse'])).toBe(2);
    expect(points.status).toBe('running');
    expect(manager.resume({ id: 'point-a' })).toBe(1);
    expect(manager.pause({ layerId: 'layer-a', type: 'point' })).toBe(1);

    expect(manager.stop({ layerId: 'layer-a' })).toBe(2);
    expect(line.status).toBe('stopped');
    expect(points.status).toBe('running');
    expect(manager.stop({ type: 'point' }, ['pulse'])).toBe(1);
    expect(points.status).toBe('stopped');
    expect(manager.activeCount).toBe(0);
  });

  it('stopAll 终止所有 channel 并幂等释放每个图层循环', () => {
    const { manager, render } = createAnimationHarness([pointElement('first', { layerId: 'layer-a' }), pointElement('second', { layerId: 'layer-b' })]);
    const first = manager.play({ id: 'first' }, { type: 'pulse', channel: 'first' });
    const second = manager.play({ id: 'second' }, { type: 'pulse', channel: 'second' });

    manager.stopAll();
    manager.stopAll();

    expect(first.status).toBe('stopped');
    expect(second.status).toBe('stopped');
    expect(manager.activeCount).toBe(0);
    expect(manager.activeLayerCount).toBe(0);
    expect(render.destroyCalls).toEqual(
      new Map([
        ['layer-a', 1],
        ['layer-b', 1]
      ])
    );
  });

  it('拒绝为 NativeStyleRef 创建结构化样式动画', () => {
    const { manager } = createAnimationHarness([pointElement('native', { style: createNativeStyleRef() })]);

    expect(() => manager.play({ id: 'native' }, { type: 'pulse' })).toThrowError(UnsupportedOperationError);
    expect(manager.activeCount).toBe(0);
  });

  it('严格拒绝 selector 访问器、未知字段和非普通对象且不执行 getter', () => {
    const { manager } = createAnimationHarness([pointElement('point')]);
    const getter = vi.fn(() => 'point');
    const selector = {};
    Object.defineProperty(selector, 'id', { enumerable: true, get: getter });

    expect(() => manager.play(selector as never, { type: 'pulse' })).toThrowError(InvalidArgumentError);
    expect(getter).not.toHaveBeenCalled();
    expect(() => manager.play(new (class {})() as never, { type: 'pulse' })).toThrowError(InvalidArgumentError);
    expect(() => manager.play({ id: 'point', typo: true } as never, { type: 'pulse' })).toThrowError(InvalidArgumentError);
  });

  it('严格拒绝 channels 数组访问器且不执行 getter', () => {
    const { manager } = createAnimationHarness([pointElement('point')]);
    const getter = vi.fn(() => 'pulse');
    const channels: string[] = [];
    Object.defineProperty(channels, 0, { enumerable: true, get: getter });
    Object.defineProperty(channels, 'length', { value: 1 });

    expect(() => manager.pause({ id: 'point' }, channels)).toThrowError(InvalidArgumentError);
    expect(getter).not.toHaveBeenCalled();
  });
});
