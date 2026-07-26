import { describe, expect, it, vi } from 'vitest';
import type { PulseAnimationSpec } from '../src/core/animation/types.js';
import { cloneElementSnapshot } from '../src/core/element/snapshot.js';
import type { ElementState } from '../src/core/element/types.js';
import { CapabilityError, InvalidArgumentError, UnsupportedOperationError } from '../src/core/errors.js';
import type { ShapePresentationPort } from '../src/core/ports/ShapePresentationPort.js';
import { createNativeStyleRef } from '../src/core/style/types.js';
import { AnimationRegistry } from '../src/services/animation/AnimationRegistry.js';
import type { AnimationDefinition, AnimationManager } from '../src/services/animation/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createAnimationHarness, pointElement, polylineElement } from './helpers/animationHarness.js';
import { createTestShapePresentation } from './helpers/shapePresentation.js';

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
    expect(batch.contributions).toHaveLength(1);
    expect(batch.contributions[0]).toEqual(expect.objectContaining({ targetId: 'point', channel: '$animation' }));
    expect(batch.contributions[0]?.value.primitives?.map(({ slotKey }) => slotKey).sort()).toEqual(['highlight/pulse-ring', 'selection/pulse-ring']);
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

  it('五万点元素没有动画记录时 setPreview 不读取仓库也不复制或转换几何', () => {
    const preview = polylineElement('large-preview', {
      geometry: {
        type: 'polyline',
        controlPoints: Array.from({ length: 50_000 }, (_, index) => [index, index % 17])
      }
    });
    const { manager, shapes, store } = createAnimationHarness([preview]);
    const get = vi.spyOn(store, 'get');
    const resolve = vi.spyOn(store, 'resolve');
    const getShape = vi.spyOn(shapes, 'get');

    manager.setPreview(preview, {
      type: 'polyline',
      coordinates: (preview.geometry as { readonly controlPoints: readonly (readonly number[])[] }).controlPoints
    });

    expect(manager.activeCount).toBe(0);
    expect(get).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(getShape).not.toHaveBeenCalled();
  });

  it('Transform 已持有 preview 时新建 pause-and-suppress 动画保持冻结，清理 preview 后才开始渲染', () => {
    const { manager, render, shapes, store } = createAnimationHarness([pointElement('selected-point')]);
    const preview = store.get('selected-point');
    if (preview === undefined) throw new Error('测试元素不存在');

    manager.setPreview(preview, shapes.get(preview.type).toRenderGeometry(preview.geometry as never));
    const handle = manager.play({ id: 'selected-point' }, { type: 'blink' });

    expect(handle.status).toBe('paused');
    expect(manager.activeCount).toBe(1);
    expect(manager.activeLayerCount).toBe(0);
    expect(render.openCalls.get('default')).toBeUndefined();
    expect(render.activeWakeCount).toBe(0);

    render.advanceTime(10_000);
    manager.clearPreview('selected-point');

    expect(handle.status).toBe('running');
    expect(manager.activeLayerCount).toBe(1);
    expect(render.nextWakeTimestamp).toBe(10_400);
    expect(render.frame('default', 10_000).contributions).toEqual([
      expect.objectContaining({ targetId: 'selected-point', value: expect.objectContaining({ presentation: expect.objectContaining({ opacity: 1 }) }) })
    ]);
  });

  it('无动画记录时建立的 Transform preview 会在后续 follow-preview 动画启动时延迟绑定', () => {
    const { manager, render, shapes, store } = createAnimationHarness([polylineElement('selected-line')]);
    const committed = store.get('selected-line');
    if (committed === undefined) throw new Error('测试元素不存在');
    const preview = cloneElementSnapshot(shapes, {
      ...committed,
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [240, 0]
        ]
      }
    });
    const previewGeometry = shapes.get(preview.type).toRenderGeometry(preview.geometry as never);

    manager.setPreview(preview, previewGeometry);
    const handle = manager.play({ id: 'selected-line' }, { type: 'dash-flow' });

    expect(handle.status).toBe('running');
    expect(render.frame('default', 0).contributions[0]?.value.primitives?.[0]?.geometry).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [240, 0]
      ]
    });
  });

  it('已有 follow-preview 动画时新建 pause-and-suppress 动画仍把视觉所有权留给 Transform', () => {
    const { manager, render, shapes, store } = createAnimationHarness([polylineElement('mixed-preview')]);
    const follow = manager.play({ id: 'mixed-preview' }, { type: 'dash-flow' });
    const committed = store.get('mixed-preview');
    if (committed === undefined) throw new Error('测试元素不存在');
    const preview = cloneElementSnapshot(shapes, {
      ...committed,
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [200, 0]
        ]
      }
    });
    manager.setPreview(preview, shapes.get(preview.type).toRenderGeometry(preview.geometry as never));

    const suppressed = manager.play({ id: 'mixed-preview' }, { type: 'blink' });
    const duringPreview = render.frame('default', 0);

    expect(follow.status).toBe('running');
    expect(suppressed.status).toBe('paused');
    expect(duringPreview.contributions[0]?.value.presentation).toBeUndefined();
    expect(duringPreview.contributions[0]?.value.primitives?.map(({ slotKey }) => slotKey)).toEqual(['dash-flow/dash-flow']);

    manager.clearPreview('mixed-preview');
    const restored = render.frame('default', 1);

    expect(suppressed.status).toBe('running');
    expect(restored.contributions[0]?.value.presentation).toBeDefined();
    expect(restored.contributions[0]?.value.primitives?.map(({ slotKey }) => slotKey)).toEqual(['dash-flow/dash-flow']);
  });

  it('动画预览仅按引擎快照 identity 复用，并在 Store revision 变化后安全失效', () => {
    const { manager, render, shapes, store } = createAnimationHarness([polylineElement('preview-cache')]);
    manager.play({ id: 'preview-cache' }, { type: 'dash-flow' });
    const committed = store.get('preview-cache');
    if (committed === undefined) throw new Error('测试元素不存在');
    const preview = cloneElementSnapshot(shapes, {
      ...committed,
      geometry: {
        type: 'polyline' as const,
        controlPoints: [
          [0, 0],
          [200, 0]
        ]
      }
    });
    const previewGeometry = shapes.get(preview.type).toRenderGeometry(preview.geometry as never);
    const get = vi.spyOn(store, 'get');
    const getShape = vi.spyOn(shapes, 'get');

    manager.setPreview(preview, previewGeometry);
    expect(getShape).not.toHaveBeenCalled();

    manager.play({ id: 'preview-cache' }, { type: 'dash-flow' });
    expect(render.frame('default', 0).contributions[0]?.value.primitives?.[0]?.geometry).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [200, 0]
      ]
    });

    get.mockClear();
    getShape.mockClear();
    manager.setPreview(preview, previewGeometry);
    expect(get).not.toHaveBeenCalled();
    expect(getShape).not.toHaveBeenCalled();

    store.update({ id: 'preview-cache' }, { data: { revision: 2 } });
    get.mockClear();
    getShape.mockClear();
    const revisedGeometry = {
      type: 'polyline' as const,
      coordinates: [
        [0, 0],
        [300, 0]
      ]
    };
    manager.setPreview(preview, revisedGeometry);
    expect(get).not.toHaveBeenCalled();
    expect(getShape).not.toHaveBeenCalled();
    expect(render.frame('default', 1).contributions[0]?.value.primitives?.[0]?.geometry).toEqual(revisedGeometry);
  });

  it('拒绝把具有可变内部槽或函数的冻结预览当作可信 identity', () => {
    class MutableBox {
      #value = 0;

      increment(): void {
        this.#value += 1;
      }
    }

    const { manager, shapes, store } = createAnimationHarness([polylineElement('unsafe-preview')]);
    manager.play({ id: 'unsafe-preview' }, { type: 'dash-flow' });
    const committed = store.get('unsafe-preview');
    if (committed === undefined) throw new Error('测试元素不存在');
    const mutableBox = Object.freeze(new MutableBox());
    mutableBox.increment();
    const invalidData = [Object.freeze(new Map([['value', 1]])), Object.freeze(new Date(0)), mutableBox, Object.freeze({ callback: () => undefined })];
    const geometry = shapes.get(committed.type).toRenderGeometry(committed.geometry as never);

    for (const data of invalidData) {
      const preview = Object.freeze({ ...committed, data });
      expect(() => manager.setPreview(preview as never, geometry)).toThrowError(InvalidArgumentError);
    }
  });

  it('在单一 Clock 时刻冻结 current-frame，恢复活动 Runtime，并只为显式展示操作推进 revision', () => {
    const { manager, render } = createAnimationHarness([pointElement('print-point')]);
    const revisions: number[] = [];
    manager.subscribePresentationChanges(() => revisions.push(manager.presentationRevision));
    const handle = manager.play({ id: 'print-point' }, { type: 'pulse', periodMs: 1000 });
    render.advanceTime(250);
    const before = render.frame('default', 250);

    const snapshot = manager.capturePresentationSnapshot({
      center: [0, 0],
      resolution: 1,
      rotation: 0,
      pixelRatio: 1,
      extent: [-100, -100, 100, 100]
    });
    const after = render.frame('default', 250);

    expect(snapshot.capturedAt).toBe(250);
    expect(snapshot.revision).toBe(manager.presentationRevision);
    expect(snapshot.elements).toEqual([expect.objectContaining({ elementId: 'print-point' })]);
    expect(after).toEqual(before);
    expect(revisions).toHaveLength(1);
    handle.pause();
    expect(revisions).toHaveLength(2);
    manager.destroy();
  });

  it('按打印 View 重新派生 Callout presentation，并恢复活动 View 的 Runtime', () => {
    const basePresentation = createTestShapePresentation();
    const slots = Object.freeze([
      Object.freeze({ slotKey: 'callout-probe', style: Object.freeze({ fill: Object.freeze({ type: 'solid' as const, color: '#ffffff' }) }) })
    ]);
    const definition = {
      type: 'pulse',
      writeDomains: new Set(['overlay'] as const),
      requirements: new Set(['structured-presentation'] as const),
      interactionPolicy: Object.freeze({ edit: 'pause-and-suppress' as const, transform: 'pause-and-suppress' as const }),
      normalize: () => Object.freeze({ type: 'pulse' as const, channel: 'callout-probe', repeat: true }),
      assertCompatible: () => undefined,
      create(initialTarget) {
        let target = initialTarget;
        return {
          slots,
          rebind(next) {
            target = next;
          },
          sample(_context, output) {
            output.reset();
            const slot = output.overlay('callout-probe');
            slot.active = true;
            slot.geometryKind = 'snapshot';
            slot.geometry = target.geometry;
            slot.opacity = 1;
            return { finished: false, schedule: { kind: 'stable' as const } };
          },
          destroy() {
            return;
          }
        };
      }
    } satisfies AnimationDefinition<PulseAnimationSpec>;
    const registry = new AnimationRegistry([definition]);
    let activeGeometry: unknown;
    let printGeometry: unknown;
    const shapePresentation: ShapePresentationPort = {
      ...basePresentation,
      present(definition, state, style) {
        const result = basePresentation.present(definition, state, style);
        activeGeometry = result.geometry;
        return result;
      },
      presentAt(definition, state, style, frame) {
        const result = basePresentation.presentAt(definition, state, style, frame);
        printGeometry = result.geometry;
        return result;
      }
    };
    const { manager, render } = createAnimationHarness([calloutElement('print-callout')], registry, shapePresentation);
    manager.play({ id: 'print-callout' }, { type: 'pulse' });
    const before = render.frame('default', 0);

    const snapshot = manager.capturePresentationSnapshot({
      center: [25, -10],
      resolution: 2,
      rotation: Math.PI / 3,
      pixelRatio: 2,
      extent: [-100, -100, 300, 200]
    });
    const after = render.frame('default', 0);
    const geometry = snapshot.elements[0]?.primitives[0]?.geometry;
    if (geometry?.type !== 'polygon' || geometry.label === undefined) throw new Error('测试快照缺少 Callout presentation label');

    expect(geometry).toEqual(printGeometry);
    expect(geometry).not.toBe(printGeometry);
    expect(geometry).not.toEqual(activeGeometry);
    expect(geometry.label).toEqual({ coordinate: [100, 50], text: '第一行\n第二行', visualScale: 0.5 });
    expect(Object.isFrozen(geometry.label)).toBe(true);
    expect(Object.isFrozen(geometry.label.coordinate)).toBe(true);
    expect(after).toEqual(before);
    manager.destroy();
  });

  it('每次 view-dependent presentation 帧只推进一次展示 revision', () => {
    const basePresentation = createTestShapePresentation();
    let publishPresentationFrame: (() => void) | undefined;
    const shapePresentation: ShapePresentationPort = {
      ...basePresentation,
      subscribe(listener) {
        publishPresentationFrame = listener;
        return () => {
          if (publishPresentationFrame === listener) publishPresentationFrame = undefined;
        };
      }
    };
    const { manager } = createAnimationHarness([calloutElement('callout-a'), calloutElement('callout-b')], undefined, shapePresentation);
    manager.play({ type: 'callout' }, { type: 'blink' });
    const revisions: number[] = [];
    manager.subscribePresentationChanges(() => revisions.push(manager.presentationRevision));
    const initialRevision = manager.presentationRevision;

    publishPresentationFrame?.();

    expect(manager.presentationRevision).toBe(initialRevision + 1);
    expect(revisions).toEqual([initialRevision + 1]);

    publishPresentationFrame?.();
    expect(manager.presentationRevision).toBe(initialRevision + 2);
    expect(revisions).toEqual([initialRevision + 1, initialRevision + 2]);

    manager.stopAll();
    const stoppedRevision = manager.presentationRevision;
    const notificationCount = revisions.length;
    publishPresentationFrame?.();
    expect(manager.presentationRevision).toBe(stoppedRevision);
    expect(revisions).toHaveLength(notificationCount);
    manager.destroy();
  });

  it('reports current-frame snapshot capability as unavailable during an active interaction preview', () => {
    const { manager, shapes, store } = createAnimationHarness([polylineElement('previewed')]);
    manager.play({ id: 'previewed' }, { type: 'dash-flow' });
    const element = store.get('previewed');
    if (element === undefined) throw new Error('测试元素不存在');
    manager.setPreview(element, shapes.get(element.type).toRenderGeometry(element.geometry as never));

    expect(() =>
      manager.capturePresentationSnapshot({ center: [0, 0], resolution: 1, rotation: 0, pixelRatio: 1, extent: [-100, -100, 100, 100] })
    ).toThrowError(CapabilityError);
    manager.destroy();
  });
});

function calloutElement(id: string): ElementState {
  return {
    id,
    type: 'callout',
    geometry: { type: 'callout', anchor: [0, 120], center: [100, 50], size: [160, 60], referenceResolution: 1 },
    style: {
      fill: { type: 'solid', color: '#ffffff' },
      strokes: [{ color: '#222222', width: 2 }],
      text: { text: '第一行\n第二行', padding: [8, 12, 8, 12] }
    },
    module: 'labels',
    layerId: 'default',
    visible: true
  };
}
