import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identityShapeProjection } from './helpers/shapeProjection.js';
import type OlMap from 'ol/Map.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import type { AnimationSpec, AnimationStatus } from '../src/core/animation/types.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementSelector } from '../src/core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import { createNativeRef } from '../src/core/native/types.js';
import type { AnimationControlHandle, AnimationControlPort } from '../src/core/ports/AnimationControlPort.js';
import type { DescriptorPortAction, OverlayDragEvent, OverlayPort, OverlayRenderState, PixelBounds } from '../src/core/ports/OverlayPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { OverlayAdapter } from '../src/adapters/openlayers/OverlayAdapter.js';
import { OverlayFacade } from '../src/facade/OverlayFacade.js';
import { OverlayService } from '../src/services/overlay/OverlayService.js';
import { AnimationManagerImpl } from '../src/services/animation/AnimationManager.js';
import type { InternalDescriptorEvent, InternalDescriptorSpec } from '../src/services/overlay/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { FakeLayerRenderPort } from './helpers/animationHarness.js';

const overlayHarness = vi.hoisted(() => ({ instances: [] as unknown[], failNext: undefined as string | undefined }));

vi.mock('ol/Overlay.js', () => {
  class FakeOverlay {
    readonly id: string | number | undefined;
    element: HTMLElement | undefined;
    offset: number[];
    position: number[] | undefined;
    positioning: string;
    readonly panIntoView = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.id = options.id as string | number | undefined;
      this.element = options.element as HTMLElement | undefined;
      this.offset = [...((options.offset as number[] | undefined) ?? [0, 0])];
      this.position = options.position as number[] | undefined;
      this.positioning = (options.positioning as string | undefined) ?? 'top-left';
      overlayHarness.instances.push(this);
    }

    getElement() {
      return this.element;
    }

    getOffset() {
      return this.offset;
    }

    getPosition() {
      return this.position;
    }

    getPositioning() {
      return this.positioning;
    }

    setElement(value: HTMLElement | undefined) {
      this.fail('setElement');
      this.element = value;
    }

    setOffset(value: number[]) {
      this.fail('setOffset');
      this.offset = [...value];
    }

    setPosition(value: number[] | undefined) {
      this.fail('setPosition');
      this.position = value === undefined ? undefined : [...value];
    }

    setPositioning(value: string) {
      this.fail('setPositioning');
      this.positioning = value;
    }

    private fail(method: string) {
      if (overlayHarness.failNext !== method) return;
      overlayHarness.failNext = undefined;
      throw new Error(`${method} failed`);
    }
  }
  return { default: FakeOverlay };
});

class FakeAnimationHandle implements AnimationControlHandle {
  status: AnimationStatus = 'running';
  readonly stop: ReturnType<typeof vi.fn>;

  constructor(onStop: () => void = () => undefined) {
    this.stop = vi.fn(() => {
      onStop();
      this.status = 'stopped';
    });
  }
}

class FakeAnimationPort implements AnimationControlPort {
  readonly plays: Array<{ readonly selector: ElementSelector; readonly animation: AnimationSpec; readonly handle: FakeAnimationHandle }> = [];
  failPlay = false;
  failStop = false;
  readonly #lifecycle: string[];

  constructor(lifecycle: string[] = []) {
    this.#lifecycle = lifecycle;
  }

  play(selector: ElementSelector, animation: AnimationSpec): AnimationControlHandle {
    if (this.failPlay) throw new Error('animation failed');
    const handle = new FakeAnimationHandle(() => {
      this.#lifecycle.push('stop-animation');
      if (this.failStop) throw new Error('stop animation failed');
    });
    this.plays.push({ selector, animation, handle });
    return handle;
  }

  pause(): number {
    return 0;
  }

  resume(): number {
    return 0;
  }

  stop(): number {
    return 0;
  }
}

class FakeOverlayPort implements OverlayPort {
  readonly states = new Map<string, Readonly<OverlayRenderState>>();
  readonly detached: string[] = [];
  readonly released: Array<readonly [OverlayRenderState['elementRef'], OverlayRenderState['ownership']]> = [];
  readonly actions = new Map<string, (action: DescriptorPortAction) => void>();
  readonly drags = new Map<string, (event: OverlayDragEvent) => void>();
  readonly lifecycle: string[] = [];
  bounds: PixelBounds | undefined = { left: 140, top: 80, right: 180, bottom: 140 };
  layoutListener: (() => void) | undefined;
  layoutSubscriptions = 0;
  layoutDisposals = 0;
  viewScale = 10;
  viewOffset: readonly [number, number] = [0, 0];
  failAttach = false;
  failAction = false;
  failDrag = false;
  failLayout = false;
  failUpdate = false;
  failDetach = false;
  failRelease = false;

  attach(state: Readonly<OverlayRenderState>): void {
    if (this.failAttach) throw new Error('attach failed');
    this.states.set(state.id, state);
    this.lifecycle.push('attach-overlay');
  }

  update(_before: Readonly<OverlayRenderState>, after: Readonly<OverlayRenderState>): void {
    if (this.failUpdate) throw new Error('update failed');
    this.states.set(after.id, after);
    this.lifecycle.push('update-overlay');
  }

  detach(id: string): void {
    this.detached.push(id);
    this.states.delete(id);
    this.lifecycle.push('detach-overlay');
    if (this.failDetach) throw new Error('detach failed');
  }

  panIntoView(): void {}

  releaseElement(ref: OverlayRenderState['elementRef'], ownership: OverlayRenderState['ownership']): void {
    this.released.push([ref, ownership]);
    this.lifecycle.push('release-dom');
    if (this.failRelease) throw new Error('release failed');
  }

  coordinateToPixel(coordinate: readonly number[]): readonly [number, number] {
    return [coordinate[0] * this.viewScale + this.viewOffset[0], coordinate[1] * this.viewScale + this.viewOffset[1]];
  }

  pixelToCoordinate(pixel: readonly number[]): readonly [number, number] {
    return [(pixel[0] - this.viewOffset[0]) / this.viewScale, (pixel[1] - this.viewOffset[1]) / this.viewScale];
  }

  getBounds(): PixelBounds | undefined {
    return this.bounds;
  }

  subscribeLayout(listener: () => void): () => void {
    if (this.failLayout) throw new Error('layout failed');
    this.layoutSubscriptions += 1;
    this.layoutListener = listener;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.layoutDisposals += 1;
      if (this.layoutListener === listener) this.layoutListener = undefined;
    };
  }

  subscribeDescriptorActions(id: string, listener: (action: DescriptorPortAction) => void): () => void {
    if (this.failAction) throw new Error('action failed');
    this.actions.set(id, listener);
    return () => this.actions.delete(id);
  }

  bindDrag(id: string, listener: (event: OverlayDragEvent) => void): () => void {
    if (this.failDrag) throw new Error('drag failed');
    this.drags.set(id, listener);
    return () => this.drags.delete(id);
  }
}

function descriptorSpec<T>(id: string, overrides: Partial<InternalDescriptorSpec<T>> = {}): InternalDescriptorSpec<T> {
  return {
    id,
    elementRef: createNativeRef('element'),
    type: 'list',
    items: [{ label: 'Speed', value: 120 }],
    position: [10, 10],
    offset: [0, 0],
    close: true,
    closeAction: 'hide',
    draggable: true,
    fixedLine: true,
    fixedLineColor: '#aef',
    fixedMode: 'position',
    ...overrides
  };
}

function setup() {
  const port = new FakeOverlayPort();
  const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
  const animations = new FakeAnimationPort(port.lifecycle);
  const errors: unknown[] = [];
  const service = new OverlayService(port, store, animations, {
    createId: () => 'generated-descriptor',
    descriptorLayerId: 'default',
    errorReporter: (error) => errors.push(error)
  });
  return { animations, errors, port, service, store };
}

describe('Descriptor lifecycle', () => {
  coversCapabilities(
    'descriptor-list-content',
    'descriptor-set-update',
    'descriptor-drag',
    'descriptor-fixed-line',
    'descriptor-position-fixed-mode',
    'descriptor-pixel-fixed-mode',
    'descriptor-close-control',
    'descriptor-show-hide',
    'descriptor-destroy-lifecycle',
    'descriptor-element-target'
  );

  it('creates one Overlay, one line Element, one animation, and one shared layout subscription', () => {
    const { animations, port, service, store } = setup();
    const descriptor = service.createDescriptor(descriptorSpec('descriptor-1', { data: { label: 'station' } }));
    const line = store.query({ module: '__ol-engine:descriptor-line' });

    expect(descriptor.id).toBe('descriptor-1');
    expect(descriptor.visible).toBe(true);
    expect(service.get('descriptor-1')).toBeDefined();
    expect(port.states.get('descriptor-1')).toMatchObject({ ownership: 'earth', visible: true, position: [10, 10] });
    expect(line).toHaveLength(1);
    expect(line[0]).toMatchObject({
      id: 'descriptor:descriptor-1:fixed-line',
      type: 'polyline',
      layerId: 'default',
      visible: true,
      data: { descriptorId: 'descriptor-1' }
    });
    expect(animations.plays).toHaveLength(1);
    expect(animations.plays[0]).toMatchObject({
      selector: { id: 'descriptor:descriptor-1:fixed-line' },
      animation: { type: 'dash-flow', channel: 'descriptor-fixed-line' }
    });
    expect(port.layoutSubscriptions).toBe(1);
    expect(port.actions.has('descriptor-1')).toBe(true);
    expect(port.drags.has('descriptor-1')).toBe(true);
  });

  it('使用真实 AnimationManager 管理 fixed-line 并在 Descriptor 销毁时释放 RenderPass', () => {
    const port = new FakeOverlayPort();
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    const render = new FakeLayerRenderPort();
    const manager = new AnimationManagerImpl({ store, shapes, render, shapeProjection: identityShapeProjection });
    const service = new OverlayService(port, store, manager, { descriptorLayerId: 'default' });

    const descriptor = service.createDescriptor(descriptorSpec('real-animation'));
    expect(manager.activeCount).toBe(1);
    expect(render.openCalls.get('default')).toBe(1);
    expect(render.frame('default', 0).contributions).toEqual([
      expect.objectContaining({ targetId: 'descriptor:real-animation:fixed-line', channel: 'descriptor-fixed-line' })
    ]);

    descriptor.destroy();
    expect(manager.activeCount).toBe(0);
    expect(render.activeLoopCount).toBe(0);
    service.destroy();
    manager.destroy();
  });

  it('rolls back all earlier resources when action, drag, layout, or animation creation fails', () => {
    for (const phase of ['action', 'drag', 'layout', 'animation'] as const) {
      const context = setup();
      if (phase === 'action') context.port.failAction = true;
      if (phase === 'drag') context.port.failDrag = true;
      if (phase === 'layout') context.port.failLayout = true;
      if (phase === 'animation') context.animations.failPlay = true;

      expect(() => context.service.createDescriptor(descriptorSpec(`failed-${phase}`))).toThrow(`${phase} failed`);
      expect(context.service.get(`failed-${phase}`)).toBeUndefined();
      expect(context.store.query()).toEqual([]);
      expect(context.port.states.size).toBe(0);
      expect(context.port.actions.size).toBe(0);
      expect(context.port.drags.size).toBe(0);
      expect(context.port.layoutListener).toBeUndefined();
      expect(context.port.released).toHaveLength(1);
      expect(context.animations.plays.every(({ handle }) => handle.status === 'stopped')).toBe(true);
    }
  });

  it('rolls back attach attempts and line-store creation failures without publishing a handle', () => {
    const attachFailure = setup();
    attachFailure.port.failAttach = true;
    expect(() => attachFailure.service.createDescriptor(descriptorSpec('attach-failure'))).toThrow('attach failed');
    expect(attachFailure.service.get('attach-failure')).toBeUndefined();
    expect(attachFailure.port.detached).toEqual(['attach-failure']);
    expect(attachFailure.port.released).toHaveLength(1);

    const port = new FakeOverlayPort();
    const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions), {
      validateElement: (state) => {
        if (state.module === '__ol-engine:descriptor-line') throw new Error('line failed');
      }
    });
    const animations = new FakeAnimationPort(port.lifecycle);
    const service = new OverlayService(port, store, animations);
    expect(() => service.createDescriptor(descriptorSpec('line-failure'))).toThrow('line failed');
    expect(service.get('line-failure')).toBeUndefined();
    expect(store.query()).toEqual([]);
    expect(port.states.size).toBe(0);
    expect(port.detached).toEqual(['line-failure']);
    expect(port.released).toHaveLength(1);
  });

  it('cascades when a synchronous Store subscriber removes a newly added descriptor line', () => {
    const removeLineOnAdd = (context: ReturnType<typeof setup>, descriptorId: string) =>
      context.store.subscribe((changes) => {
        const lineId = `descriptor:${descriptorId}:fixed-line`;
        if (changes.changes.some((change) => change.kind === 'add' && change.id === lineId)) context.store.remove({ id: lineId });
      });

    const duringCreate = setup();
    removeLineOnAdd(duringCreate, 'removed-during-create');
    expect(() => duringCreate.service.createDescriptor(descriptorSpec('removed-during-create'))).toThrow(ObjectDisposedError);
    expect(duringCreate.service.get('removed-during-create')).toBeUndefined();
    expect(duringCreate.port.states.has('removed-during-create')).toBe(false);

    const duringUpdate = setup();
    const descriptor = duringUpdate.service.createDescriptor(descriptorSpec('removed-during-update', { fixedLine: false }));
    removeLineOnAdd(duringUpdate, 'removed-during-update');
    expect(() => descriptor.update({ fixedLine: true })).toThrow(ObjectDisposedError);
    expect(duringUpdate.service.get('removed-during-update')).toBeUndefined();
    expect(duringUpdate.port.states.has('removed-during-update')).toBe(false);
  });

  it('uses one shared layout callback for every dependent descriptor and removes it after the last one', () => {
    const { port, service } = setup();
    const first = service.createDescriptor(descriptorSpec('first'));
    const second = service.createDescriptor(descriptorSpec('second', { fixedMode: 'pixel', fixedLine: false }));
    const independent = service.createDescriptor(descriptorSpec('independent', { fixedLine: false, fixedMode: 'position' }));

    expect(port.layoutSubscriptions).toBe(1);
    independent.destroy();
    expect(port.layoutDisposals).toBe(0);
    first.destroy();
    expect(port.layoutDisposals).toBe(0);
    second.destroy();
    expect(port.layoutDisposals).toBe(1);
  });

  it('subscribes to layout only while a dependent descriptor is visible', () => {
    const { port, service } = setup();
    const descriptor = service.createDescriptor(descriptorSpec('visibility-layout', { fixedMode: 'pixel', fixedLine: false }));

    expect(port.layoutSubscriptions).toBe(1);
    descriptor.hide();
    expect(port.layoutDisposals).toBe(1);
    expect(port.layoutListener).toBeUndefined();

    descriptor.show();
    expect(port.layoutSubscriptions).toBe(2);
    expect(port.layoutListener).toBeDefined();

    descriptor.hide();
    expect(port.layoutDisposals).toBe(2);
    expect(port.layoutListener).toBeUndefined();

    descriptor.show();
    expect(port.layoutSubscriptions).toBe(3);
    descriptor.destroy();
    expect(port.layoutDisposals).toBe(3);
  });

  it('rolls back a layout subscription when showing a hidden descriptor fails', () => {
    const { port, service } = setup();
    const descriptor = service.createDescriptor(descriptorSpec('visibility-layout-rollback', { fixedMode: 'pixel', fixedLine: false }));
    descriptor.hide();
    port.failUpdate = true;

    expect(() => descriptor.show()).toThrow('update failed');
    expect(descriptor.visible).toBe(false);
    expect(port.layoutSubscriptions).toBe(2);
    expect(port.layoutDisposals).toBe(2);
    expect(port.layoutListener).toBeUndefined();

    port.failUpdate = false;
    descriptor.show();
    expect(descriptor.visible).toBe(true);
    expect(port.layoutListener).toBeDefined();
  });

  it('主动重算隐藏期间平移缩放后的像素固定位置与固定线再显示', () => {
    const { port, service, store } = setup();
    const descriptor = service.createDescriptor(descriptorSpec('visibility-layout-refresh', { fixedMode: 'pixel' }));
    const lineId = 'descriptor:visibility-layout-refresh:fixed-line';

    descriptor.hide();
    port.viewScale = 20;
    port.viewOffset = [40, -20];
    descriptor.show();

    expect(port.states.get('visibility-layout-refresh')).toMatchObject({ visible: true, position: [3, 6] });
    expect(store.get(lineId)).toMatchObject({
      visible: true,
      geometry: {
        type: 'polyline',
        controlPoints: [
          [10, 10],
          [7, 8]
        ]
      }
    });
    expect(port.layoutSubscriptions).toBe(2);
  });

  it('主动重算失败时回滚 Overlay、固定线和临时布局订阅', () => {
    const { port, service, store } = setup();
    const descriptor = service.createDescriptor(descriptorSpec('visibility-layout-refresh-rollback', { fixedMode: 'pixel' }));
    const lineId = 'descriptor:visibility-layout-refresh-rollback:fixed-line';
    descriptor.hide();
    port.viewScale = 20;
    port.viewOffset = [40, -20];
    vi.spyOn(port, 'getBounds').mockImplementationOnce(() => {
      throw new Error('bounds failed');
    });

    expect(() => descriptor.show()).toThrow('bounds failed');
    expect(descriptor.visible).toBe(false);
    expect(port.states.get('visibility-layout-refresh-rollback')).toMatchObject({ visible: false, position: [10, 10] });
    expect(store.get(lineId)?.visible).toBe(false);
    expect(port.layoutListener).toBeUndefined();
    expect(port.layoutDisposals).toBe(2);

    descriptor.show();
    expect(port.states.get('visibility-layout-refresh-rollback')).toMatchObject({ visible: true, position: [3, 6] });
    expect(store.get(lineId)).toMatchObject({
      visible: true,
      geometry: {
        type: 'polyline',
        controlPoints: [
          [10, 10],
          [7, 8]
        ]
      }
    });
  });

  it('keeps pixel-fixed overlays at one viewport pixel and updates a nearest-edge fixed line without render loops', () => {
    const { port, service, store } = setup();
    const descriptor = service.createDescriptor(descriptorSpec('pixel', { fixedMode: 'pixel' }));
    const lineId = 'descriptor:pixel:fixed-line';
    const changes = vi.fn();
    store.subscribe(changes);
    changes.mockClear();

    port.viewOffset = [20, -10];
    port.layoutListener?.();

    expect(descriptor.visible).toBe(true);
    expect(port.states.get('pixel')?.position).toEqual([8, 11]);
    expect(store.get(lineId)?.geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [10, 10],
        [12, 10]
      ]
    });
    const notificationCount = changes.mock.calls.length;
    port.layoutListener?.();
    expect(changes).toHaveBeenCalledTimes(notificationCount);
  });

  it('drags with map-relative pointer pixels while keeping the geographic anchor unchanged', () => {
    const { port, service, store } = setup();
    const descriptor = service.createDescriptor(descriptorSpec('drag'));
    const listener = port.drags.get('drag');
    if (listener === undefined) throw new Error('Expected drag binding');

    listener({ type: 'start', pointerId: 4, pixel: [100, 100] });
    listener({ type: 'move', pointerId: 4, pixel: [125, 135] });
    listener({ type: 'end', pointerId: 4, pixel: [125, 135] });

    expect(port.states.get('drag')).toMatchObject({ position: [10, 10], offset: [25, 35] });
    expect(store.get('descriptor:drag:fixed-line')?.geometry).toMatchObject({ controlPoints: [[10, 10], expect.any(Array)] });
    expect(descriptor.visible).toBe(true);
  });

  it('emits close listeners and the current callback once before hiding, isolates errors, and rearms after show', () => {
    const { errors, port, service } = setup();
    const order: string[] = [];
    const onClose = vi.fn(() => {
      order.push('callback');
      throw new Error('callback failed');
    });
    const descriptor = service.createDescriptor(descriptorSpec('close', { data: { label: 'station' }, onClose }));
    descriptor.on('close', () => {
      order.push('listener');
      throw new Error('listener failed');
    });

    port.actions.get('close')?.({ type: 'close' });
    port.actions.get('close')?.({ type: 'close' });
    descriptor.close();

    expect(order).toEqual(['listener', 'callback']);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(descriptor.visible).toBe(false);
    expect(errors.map((error) => (error as Error).message)).toEqual(['listener failed', 'callback failed']);

    descriptor.show();
    descriptor.close();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('applies destroy close policy only after the close event observes the live descriptor', () => {
    const { port, service, store } = setup();
    const observations: boolean[] = [];
    const descriptor = service.createDescriptor(
      descriptorSpec('destroy-close', {
        closeAction: 'destroy',
        onClose: (event) => observations.push(event.descriptor.visible)
      })
    );

    port.actions.get('destroy-close')?.({ type: 'close' });
    expect(observations).toEqual([true]);
    expect(service.get('destroy-close')).toBeUndefined();
    expect(store.query()).toEqual([]);
    expect(() => descriptor.visible).toThrow(ObjectDisposedError);
  });

  it('isolates destroy failures from port actions while explicit close still reports them synchronously', () => {
    const fromPort = setup();
    fromPort.service.createDescriptor(descriptorSpec('port-close-failure', { closeAction: 'destroy' }));
    fromPort.port.failDetach = true;

    expect(() => fromPort.port.actions.get('port-close-failure')?.({ type: 'close' })).not.toThrow();
    expect(fromPort.errors.map((error) => (error as Error).message)).toEqual(['detach failed']);
    expect(fromPort.service.get('port-close-failure')).toBeUndefined();

    const explicit = setup();
    const descriptor = explicit.service.createDescriptor(descriptorSpec('explicit-close-failure', { closeAction: 'destroy' }));
    explicit.port.failDetach = true;
    expect(() => descriptor.close()).toThrow('detach failed');
  });

  it('rearms a visible hide-policy descriptor when closing fails in the port or Store', () => {
    for (const failure of ['port', 'store'] as const) {
      const context = setup();
      const onClose = vi.fn();
      const descriptor = context.service.createDescriptor(descriptorSpec(`retry-close-${failure}`, { onClose }));
      if (failure === 'port') context.port.failUpdate = true;
      else {
        vi.spyOn(context.store, 'update').mockImplementationOnce(() => {
          throw new Error('store update failed');
        });
      }

      expect(() => descriptor.close()).toThrow(failure === 'port' ? 'update failed' : 'store update failed');
      expect(descriptor.visible).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);

      context.port.failUpdate = false;
      descriptor.close();
      expect(descriptor.visible).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(2);
    }
  });

  it('selects against one state snapshot when an isolated port action changes a later candidate', () => {
    const { port, service } = setup();
    service.createDescriptor(descriptorSpec('snapshot-first', { fixedLine: false }));
    service.createDescriptor(descriptorSpec('snapshot-second', { fixedLine: false }));

    const selected = service.query({
      visible: true,
      predicate: (_data, handle) => {
        if (handle.id === 'snapshot-first') port.actions.get('snapshot-second')?.({ type: 'close' });
        return true;
      }
    });

    expect(selected.map(({ id }) => id)).toEqual(['snapshot-first', 'snapshot-second']);
  });

  it('rejects a captured Descriptor.close call from a selector predicate without changing descriptor state', () => {
    const { service } = setup();
    service.createDescriptor(descriptorSpec('close-guard-first', { fixedLine: false }));
    const second = service.createDescriptor(descriptorSpec('close-guard-second', { fixedLine: false }));

    expect(() =>
      service.query({
        predicate: (_data, handle) => {
          if (handle.id === 'close-guard-first') second.close();
          return true;
        }
      })
    ).toThrow(InvalidArgumentError);

    expect(second.visible).toBe(true);
    expect(service.query().map(({ id }) => id)).toEqual(['close-guard-first', 'close-guard-second']);
  });

  it('updates content semantics, callbacks, resources, data, anchor, offset, fixed mode, and visibility guards', () => {
    const { animations, errors, port, service, store } = setup();
    const firstClick = vi.fn();
    const secondClick = vi.fn();
    const close = vi.fn();
    const descriptor = service.createDescriptor(descriptorSpec('update-all', { onItemClick: firstClick }));
    const oldAnimation = animations.plays[0].handle;
    const replacementRef = createNativeRef('element');

    descriptor.update({
      elementRef: replacementRef,
      type: 'custom',
      items: [],
      position: [20, 30],
      offset: [5, 6],
      close: false,
      closeAction: 'destroy',
      onClose: close,
      onItemClick: secondClick,
      draggable: false,
      fixedLine: false,
      fixedLineColor: '#123456',
      fixedMode: 'pixel',
      data: { version: 2 }
    });

    expect(port.states.get('update-all')).toMatchObject({ elementRef: replacementRef, position: [20, 30], offset: [5, 6] });
    expect(store.get('descriptor:update-all:fixed-line')).toBeUndefined();
    expect(oldAnimation.stop).toHaveBeenCalledTimes(1);
    expect(port.drags.has('update-all')).toBe(false);
    expect(port.layoutListener).toBeDefined();
    port.actions.get('update-all')?.({ type: 'item', index: 0 });
    port.actions.get('update-all')?.({ type: 'close' });
    expect(firstClick).not.toHaveBeenCalled();
    expect(secondClick).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();

    descriptor.update({
      type: 'list',
      items: [{ label: 'Updated', value: 2 }],
      close: true,
      closeAction: 'hide',
      draggable: true,
      fixedLine: true,
      fixedLineColor: '#abcdef',
      fixedMode: 'position'
    });
    expect(store.get('descriptor:update-all:fixed-line')?.style).toMatchObject({ strokes: [{ color: '#abcdef' }] });
    expect(port.drags.has('update-all')).toBe(true);
    expect(animations.plays).toHaveLength(2);
    port.actions.get('update-all')?.({ type: 'item', index: 0 });
    expect(secondClick).toHaveBeenCalledWith(expect.objectContaining({ data: { version: 2 }, item: { label: 'Updated', value: 2 } }));

    descriptor.hide();
    const drag = port.drags.get('update-all');
    drag?.({ type: 'start', pointerId: 1, pixel: [0, 0] });
    drag?.({ type: 'move', pointerId: 1, pixel: [100, 100] });
    port.actions.get('update-all')?.({ type: 'item', index: 0 });
    expect(secondClick).toHaveBeenCalledTimes(1);
    expect(port.states.get('update-all')?.offset).toEqual([5, 6]);
    expect(errors).toEqual([]);
  });

  it('keeps fixed-line color in Element style as the single source instead of duplicating it in animation state', () => {
    const context = setup();
    const descriptor = context.service.createDescriptor(descriptorSpec('color-source', { fixedLineColor: '#111111' }));
    const animation = context.animations.plays[0].handle;
    expect(context.animations.plays[0].animation).not.toHaveProperty('color');

    descriptor.update({ fixedLineColor: '#222222' });
    expect(context.store.get('descriptor:color-source:fixed-line')?.style).toMatchObject({ strokes: [{ color: '#222222' }] });
    expect(context.animations.plays).toHaveLength(1);
    expect(animation.stop).not.toHaveBeenCalled();
  });

  it('does not remove an unrelated Element that later reuses a disabled descriptor line id', () => {
    const { service, store } = setup();
    const descriptor = service.createDescriptor(descriptorSpec('released-line'));
    descriptor.update({ fixedLine: false, fixedMode: 'position' });
    store.add({
      id: 'descriptor:released-line:fixed-line',
      type: 'point',
      geometry: { type: 'point', controlPoints: [[1, 2]] },
      style: {},
      module: 'user-owned',
      layerId: 'default',
      visible: true
    });

    descriptor.destroy();
    expect(store.get('descriptor:released-line:fixed-line')).toMatchObject({ module: 'user-owned', type: 'point' });
  });

  it('captures a pixel-fixed anchor when conversion becomes available and reports async callback rejections', async () => {
    const { errors, port, service } = setup();
    const originalCoordinateToPixel = port.coordinateToPixel.bind(port);
    let conversionAvailable = false;
    vi.spyOn(port, 'coordinateToPixel').mockImplementation((coordinate) =>
      conversionAvailable ? originalCoordinateToPixel(coordinate) : (undefined as never)
    );
    const descriptor = service.createDescriptor(
      descriptorSpec('late-pixel', {
        fixedLine: false,
        fixedMode: 'pixel',
        onItemClick: (() => Promise.reject(new Error('async callback failed'))) as never
      })
    );
    descriptor.on('click', (() => Promise.reject(new Error('async listener failed'))) as never);
    conversionAvailable = true;
    port.layoutListener?.();
    port.viewOffset = [20, -10];
    port.layoutListener?.();
    expect(port.states.get('late-pixel')?.position).toEqual([8, 11]);

    port.actions.get('late-pixel')?.({ type: 'item', index: 0 });
    await Promise.resolve();
    await Promise.resolve();
    expect(errors.map((error) => (error as Error).message)).toEqual(['async listener failed', 'async callback failed']);
  });

  it('emits the current list item and index and ignores invalid delegated indexes', () => {
    const { port, service } = setup();
    const clicked: InternalDescriptorEvent[] = [];
    const descriptor = service.createDescriptor(
      descriptorSpec('click', {
        items: [
          { label: 'First', value: 1 },
          { label: 'Second', value: 2 }
        ],
        onItemClick: (event) => clicked.push(event)
      })
    );
    const events: InternalDescriptorEvent[] = [];
    descriptor.on('click', (event) => events.push(event));

    port.actions.get('click')?.({ type: 'item', index: 1 });
    port.actions.get('click')?.({ type: 'item', index: 99 });

    expect(clicked).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(clicked[0]).toMatchObject({ type: 'click', item: { label: 'Second', value: 2 }, index: 1 });
  });

  it('cascades line or Overlay removal, stops animation first, and makes repeated destroy idempotent', () => {
    const lineRemoval = setup();
    const byLine = lineRemoval.service.createDescriptor(descriptorSpec('by-line'));
    const lineAnimation = lineRemoval.animations.plays[0].handle;
    lineRemoval.store.remove({ id: 'descriptor:by-line:fixed-line' });

    expect(lineAnimation.stop).toHaveBeenCalledTimes(1);
    expect(lineRemoval.service.get('by-line')).toBeUndefined();
    expect(lineRemoval.port.detached).toEqual(['by-line']);
    expect(() => byLine.visible).toThrow(ObjectDisposedError);

    const overlayRemoval = setup();
    const byOverlay = overlayRemoval.service.createDescriptor(descriptorSpec('by-overlay'));
    expect(overlayRemoval.service.remove({ id: 'by-overlay' })).toBe(1);
    byOverlay.destroy();
    expect(overlayRemoval.store.query()).toEqual([]);
    expect(overlayRemoval.port.detached).toEqual(['by-overlay']);
    expect(overlayRemoval.animations.plays[0].handle.stop).toHaveBeenCalledTimes(1);
  });

  it('attempts every destroy finalizer in animation-line-overlay-DOM order and surfaces the first error', () => {
    const { animations, port, service, store } = setup();
    const descriptor = service.createDescriptor(descriptorSpec('failing-destroy'));
    const remove = store.remove.bind(store);
    vi.spyOn(store, 'remove').mockImplementation((selector) => {
      port.lifecycle.push('remove-line');
      return remove(selector);
    });
    animations.failStop = true;
    port.failDetach = true;
    port.failRelease = true;

    expect(() => descriptor.destroy()).toThrow('stop animation failed');
    expect(port.lifecycle.filter((step) => ['stop-animation', 'remove-line', 'detach-overlay', 'release-dom'].includes(step))).toEqual([
      'stop-animation',
      'remove-line',
      'detach-overlay',
      'release-dom'
    ]);
    expect(service.get('failing-destroy')).toBeUndefined();
    expect(store.query()).toEqual([]);
    expect(port.released).toHaveLength(1);
    descriptor.destroy();
  });

  it('still detaches Overlay and DOM and invalidates handles when ElementStore was already destroyed', () => {
    const { port, service, store } = setup();
    const descriptor = service.createDescriptor(descriptorSpec('destroyed-store'));
    store.destroy();

    expect(() => descriptor.destroy()).toThrow(ObjectDisposedError);
    expect(port.detached).toEqual(['destroyed-store']);
    expect(port.released).toHaveLength(1);
    expect(service.get('destroyed-store')).toBeUndefined();
    descriptor.destroy();
  });

  it('prevents the descriptor-owned OverlayHandle from replacing its wrapper or ownership', () => {
    const { port, service } = setup();
    service.createDescriptor(descriptorSpec('owned'));
    const overlay = service.get('owned');
    if (overlay === undefined) throw new Error('Expected descriptor overlay');

    expect(() => overlay.update({ elementRef: createNativeRef('element') })).toThrow(InvalidArgumentError);
    expect(() => overlay.update({ ownership: 'external' })).toThrow(InvalidArgumentError);
    expect(() => overlay.update({ positioning: 'bottom-right' })).toThrow(InvalidArgumentError);
    overlay.hide();
    expect(service.get('owned')?.visible).toBe(false);
    overlay.setPosition([30, 40]);
    expect(service.get('owned')?.position).toEqual([30, 40]);
    expect(service.get('owned')?.visible).toBe(true);
    expect(port.states.get('owned')).toMatchObject({ position: [30, 40], visible: true });
  });
});

class FakeDomElement {
  readonly tagName: string;
  readonly children: FakeDomElement[] = [];
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  className = '';
  textContent: string | null = null;
  type = '';
  parentElement: FakeDomElement | null = null;
  removeCalls = 0;
  readonly listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();
  readonly captured: number[] = [];
  readonly releasedCaptures: number[] = [];
  rect = { left: 10, top: 20, right: 110, bottom: 80, width: 100, height: 60, x: 10, y: 20, toJSON() {} };

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  append(...nodes: FakeDomElement[]): void {
    for (const node of nodes) {
      node.parentElement?.removeChild(node);
      node.parentElement = this;
      this.children.push(node);
    }
  }

  appendChild(node: FakeDomElement): FakeDomElement {
    this.append(node);
    return node;
  }

  removeChild(node: FakeDomElement): FakeDomElement {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentElement = null;
    return node;
  }

  replaceChildren(...nodes: FakeDomElement[]): void {
    for (const child of [...this.children]) this.removeChild(child);
    this.append(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  remove(): void {
    this.removeCalls += 1;
    this.parentElement?.removeChild(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener as unknown as (event: Record<string, unknown>) => void);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener as unknown as (event: Record<string, unknown>) => void);
  }

  dispatch(type: string, event: Record<string, unknown> = {}): void {
    const payload = { target: this, ...event };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(payload);
  }

  setPointerCapture(pointerId: number): void {
    this.captured.push(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.releasedCaptures.push(pointerId);
  }

  getBoundingClientRect(): DOMRect {
    return this.rect as DOMRect;
  }
}

const originalDocument = globalThis.document;
const documentAddEventListener = vi.fn();
const documentRemoveEventListener = vi.fn();

beforeEach(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tagName: string) => new FakeDomElement(tagName),
      addEventListener: documentAddEventListener,
      removeEventListener: documentRemoveEventListener
    }
  });
  documentAddEventListener.mockClear();
  documentRemoveEventListener.mockClear();
  overlayHarness.instances.length = 0;
  overlayHarness.failNext = undefined;
});

afterEach(() => {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

describe('Descriptor facade rendering', () => {
  it('renders list text without innerHTML and forwards stable item indexes', () => {
    const { port, service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const clicked = vi.fn();
    const descriptor = facade.createDescriptor({
      id: 'public-list',
      type: 'list',
      content: [{ label: '<Speed>', value: '<120>', className: 'warn', color: '#f00' }],
      position: [1, 2],
      header: '<Header>',
      footer: '<Footer>',
      onItemClick: clicked
    });
    const state = port.states.get('public-list');
    if (state === undefined) throw new Error('Expected public descriptor state');
    const wrapper = refs.require<FakeDomElement>('element', state.elementRef);

    expect(wrapper.className.split(/\s+/)).toEqual(expect.arrayContaining(['earth-engine-component-descriptor', 'descriptor-list', 'ol-engine-descriptor']));
    expect(allText(wrapper)).toContain('<Header>');
    expect(allText(wrapper)).toContain('<Speed>');
    expect(allText(wrapper)).toContain('<120>');
    expect(findClass(wrapper, 'item')?.dataset.descriptorIndex).toBe('0');
    port.actions.get('public-list')?.({ type: 'item', index: 0 });
    expect(clicked).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'click', descriptor, index: 0, item: { label: '<Speed>', value: '<120>', className: 'warn', color: '#f00' } })
    );
  });

  it('actually attaches custom strings and HTMLElements and replaces wrappers through provisional handoff', () => {
    const { port, service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const custom = new FakeDomElement('section');
    custom.textContent = 'custom element';
    const descriptor = facade.createDescriptor({ id: 'custom', type: 'custom', content: '<b>plain text</b>', position: [1, 2] });
    const firstRef = port.states.get('custom')?.elementRef;
    if (firstRef === undefined) throw new Error('Expected first wrapper');
    const firstWrapper = refs.require<FakeDomElement>('element', firstRef);
    expect(firstWrapper.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['earth-engine-component-descriptor', 'descriptor-custom', 'ol-engine-descriptor'])
    );
    expect(allText(firstWrapper)).toContain('<b>plain text</b>');

    descriptor.update({ content: custom as unknown as HTMLElement });
    const secondRef = port.states.get('custom')?.elementRef;
    if (secondRef === undefined) throw new Error('Expected second wrapper');
    expect(secondRef).not.toBe(firstRef);
    expect(custom.parentElement).toBe(refs.require<FakeDomElement>('element', secondRef));
  });

  it('implements explicit close on the public handle and invokes the public callback before hide', () => {
    const { service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const callback = vi.fn((event) => expect(event.descriptor.visible).toBe(true));
    const descriptor = facade.createDescriptor({
      id: 'public-close',
      type: 'list',
      content: [],
      position: [1, 2],
      onClose: callback
    });

    expect(Reflect.ownKeys(descriptor).sort()).toEqual(['close', 'destroy', 'hide', 'id', 'on', 'setPosition', 'show', 'update', 'visible'].sort());

    descriptor.close();
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ type: 'close', descriptor }));
    expect(descriptor.visible).toBe(false);
  });

  it('switches list/custom semantics with wrapper handoff and rolls Facade view state back on registry failure', () => {
    const { port, service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const click = vi.fn();
    const descriptor = facade.createDescriptor({
      id: 'switch-content',
      type: 'list',
      content: [{ label: 'Old', value: 1 }],
      position: [1, 2],
      header: 'old header',
      onItemClick: click
    });

    descriptor.update({ content: 'custom text' });
    port.actions.get('switch-content')?.({ type: 'item', index: 0 });
    expect(click).not.toHaveBeenCalled();
    let currentRef = port.states.get('switch-content')?.elementRef;
    if (currentRef === undefined) throw new Error('Expected current descriptor wrapper');
    expect(allText(refs.require<FakeDomElement>('element', currentRef))).toContain('custom text');

    const originalCommit = refs.commitProvisional.bind(refs);
    vi.spyOn(refs, 'commitProvisional').mockImplementationOnce(() => {
      throw new Error('registry failed');
    });
    expect(() => descriptor.update({ header: 'rolled back header' })).toThrow('registry failed');
    descriptor.update({ footer: 'committed footer' });
    currentRef = port.states.get('switch-content')?.elementRef;
    if (currentRef === undefined) throw new Error('Expected replacement descriptor wrapper');
    const text = allText(refs.require<FakeDomElement>('element', currentRef));
    expect(text).toContain('old header');
    expect(text).not.toContain('rolled back header');
    expect(text).toContain('committed footer');
    expect(originalCommit).toBeTypeOf('function');

    descriptor.update({ content: [{ label: 'New', value: 2 }] });
    port.actions.get('switch-content')?.({ type: 'item', index: 0 });
    expect(click).toHaveBeenCalledWith(expect.objectContaining({ item: { label: 'New', value: 2 }, index: 0 }));
  });

  it('discards a staged wrapper after canonical rollback even when a later rollback finalizer fails', () => {
    const { animations, errors, port, service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const descriptor = facade.createDescriptor({
      id: 'rollback-finalizer-failure',
      type: 'list',
      content: [],
      position: [1, 2],
      fixedLine: false
    });
    const oldRef = port.states.get('rollback-finalizer-failure')?.elementRef;
    if (oldRef === undefined) throw new Error('Expected original descriptor wrapper');
    const register = vi.spyOn(refs, 'registerProvisional');
    const discard = vi.spyOn(refs, 'discardProvisional');
    vi.spyOn(refs, 'commitProvisional').mockImplementationOnce(() => {
      throw new Error('registry failed');
    });
    animations.failStop = true;

    expect(() => descriptor.update({ header: 'staged', fixedLine: true })).toThrow('registry failed');
    const stagedRef = register.mock.results[0]?.value as OverlayRenderState['elementRef'] | undefined;
    const stagedWrapper = register.mock.calls[0]?.[1] as FakeDomElement | undefined;
    if (stagedRef === undefined || stagedWrapper === undefined) throw new Error('Expected staged descriptor wrapper');
    expect(discard).toHaveBeenCalledWith('element', stagedRef);
    expect(() => refs.require('element', stagedRef)).toThrow(ObjectDisposedError);
    expect(stagedWrapper.removeCalls).toBe(1);
    expect(port.states.get('rollback-finalizer-failure')?.elementRef).toBe(oldRef);
    expect(service.get('rollback-finalizer-failure')).toBeDefined();
    expect(errors.map((error) => (error as Error).message)).toContain('stop animation failed');
  });

  it('keeps a reused custom HTMLElement in the old live wrapper when handoff fails', () => {
    const { port, service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const custom = new FakeDomElement('section');
    custom.textContent = 'persistent custom content';
    const descriptor = facade.createDescriptor({
      id: 'custom-rollback',
      type: 'custom',
      content: custom as unknown as HTMLElement,
      position: [1, 2]
    });
    const oldRef = port.states.get('custom-rollback')?.elementRef;
    if (oldRef === undefined) throw new Error('Expected original wrapper');
    const oldWrapper = refs.require<FakeDomElement>('element', oldRef);
    expect(custom.parentElement).toBe(oldWrapper);
    vi.spyOn(refs, 'commitProvisional').mockImplementationOnce(() => {
      throw new Error('registry failed');
    });

    expect(() => descriptor.update({ header: 'must roll back' })).toThrow('registry failed');
    expect(port.states.get('custom-rollback')?.elementRef).toBe(oldRef);
    expect(custom.parentElement).toBe(oldWrapper);
    expect(allText(oldWrapper)).toContain('persistent custom content');
  });

  it('keeps a custom HTMLElement at its original parent and position when creation handoff fails', () => {
    const { service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const parent = new FakeDomElement('div');
    const before = new FakeDomElement('span');
    const custom = new FakeDomElement('section');
    const after = new FakeDomElement('span');
    parent.append(before, custom, after);
    vi.spyOn(refs, 'commitProvisional').mockImplementationOnce(() => {
      throw new Error('registry failed');
    });

    expect(() =>
      facade.createDescriptor({
        id: 'custom-create-rollback',
        type: 'custom',
        content: custom as unknown as HTMLElement,
        position: [1, 2]
      })
    ).toThrow('registry failed');
    expect(custom.parentElement).toBe(parent);
    expect(parent.children).toEqual([before, custom, after]);
  });
});

class FakeOverlayMap {
  readonly viewport = new FakeDomElement('div');
  readonly overlays: unknown[] = [];
  readonly listeners = new Map<string, Set<() => void>>();
  failUnOnce = false;

  constructor() {
    this.viewport.rect = { left: 5, top: 10, right: 405, bottom: 310, width: 400, height: 300, x: 5, y: 10, toJSON() {} };
  }

  addOverlay(overlay: unknown): void {
    this.overlays.push(overlay);
  }

  removeOverlay(overlay: unknown): void {
    const index = this.overlays.indexOf(overlay);
    if (index >= 0) this.overlays.splice(index, 1);
  }

  getOverlays(): Readonly<{ getArray(): unknown[] }> {
    return { getArray: () => this.overlays };
  }

  getViewport(): HTMLElement {
    return this.viewport as unknown as HTMLElement;
  }

  getPixelFromCoordinate(coordinate: readonly number[]): [number, number] {
    return [coordinate[0] * 10, coordinate[1] * 10];
  }

  getCoordinateFromPixel(pixel: readonly number[]): [number, number] {
    return [pixel[0] / 10, pixel[1] / 10];
  }

  on(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  un(type: string, listener: () => void): void {
    if (this.failUnOnce) {
      this.failUnOnce = false;
      throw new Error('map un failed');
    }
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

function adapterState(id: string, elementRef: OverlayRenderState['elementRef'], overrides: Partial<OverlayRenderState> = {}): Readonly<OverlayRenderState> {
  return {
    id,
    elementRef,
    position: [1, 2],
    offset: [0, 0],
    positioning: 'top-left',
    stopEvent: true,
    insertFirst: true,
    autoPan: false,
    className: undefined,
    visible: true,
    ownership: 'external',
    ...overrides
  };
}

describe('OverlayAdapter lifecycle', () => {
  it('keeps hidden overlays out of the map render loop and mounts them only while visible', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const elementRef = refs.register('element', new FakeDomElement('div'));
    const hidden = adapterState('visibility', elementRef, { visible: false });
    const visible = adapterState('visibility', elementRef, { visible: true });

    adapter.attach(hidden);
    expect(map.overlays).toHaveLength(0);
    adapter.update(hidden, visible);
    expect(map.overlays).toHaveLength(1);
    adapter.update(visible, hidden);
    expect(map.overlays).toHaveLength(0);
    adapter.detach('visibility');
    adapter.releaseElement(elementRef, 'external');
    adapter.destroy();
  });

  it('owns layout subscriptions and removes them during adapter destroy', () => {
    const map = new FakeOverlayMap();
    const adapter = new OverlayAdapter(map as unknown as OlMap, new NativeRefRegistry());
    adapter.subscribeLayout(vi.fn());

    expect(map.listeners.get('postrender')?.size).toBe(1);
    adapter.destroy();
    expect(map.listeners.get('postrender')?.size).toBe(0);
  });

  it('keeps a failed layout unsubscription retryable', () => {
    const map = new FakeOverlayMap();
    const adapter = new OverlayAdapter(map as unknown as OlMap, new NativeRefRegistry());
    const dispose = adapter.subscribeLayout(vi.fn());
    map.failUnOnce = true;

    expect(() => dispose()).toThrow('map un failed');
    expect(map.listeners.get('postrender')?.size).toBe(1);
    dispose();
    expect(map.listeners.get('postrender')?.size).toBe(0);

    const retryMap = new FakeOverlayMap();
    const retryAdapter = new OverlayAdapter(retryMap as unknown as OlMap, new NativeRefRegistry());
    retryAdapter.subscribeLayout(vi.fn());
    retryMap.failUnOnce = true;
    expect(() => retryAdapter.destroy()).toThrow('map un failed');
    expect(retryMap.listeners.get('postrender')?.size).toBe(1);
    retryAdapter.destroy();
    expect(retryMap.listeners.get('postrender')?.size).toBe(0);
  });

  it('reuses a failed shared layout disposer without growing native listeners', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
    const service = new OverlayService(adapter, store, new FakeAnimationPort());
    const firstRef = refs.register('element', new FakeDomElement('div'));
    const first = service.createDescriptor(descriptorSpec('layout-retry-first', { elementRef: firstRef }));
    map.failUnOnce = true;

    expect(() => first.destroy()).toThrow('map un failed');
    expect(map.listeners.get('postrender')?.size).toBe(1);

    const secondRef = refs.register('element', new FakeDomElement('div'));
    const second = service.createDescriptor(descriptorSpec('layout-retry-second', { elementRef: secondRef }));
    expect(map.listeners.get('postrender')?.size).toBe(1);
    second.destroy();
    expect(map.listeners.get('postrender')?.size).toBe(0);
    service.destroy();
    adapter.destroy();
  });

  it('revokes every detached exclusive ref but removes only committed earth-owned elements', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const external = new FakeDomElement('div');
    const externalRef = refs.register('element', external);
    adapter.attach(adapterState('external', externalRef));
    adapter.detach('external');
    adapter.releaseElement(externalRef, 'external');
    expect(external.removeCalls).toBe(0);
    expect(() => refs.require('element', externalRef)).toThrow(ObjectDisposedError);

    const owned = new FakeDomElement('div');
    const ownedRef = refs.register('element', owned);
    adapter.attach(adapterState('owned', ownedRef, { ownership: 'earth' }));
    adapter.detach('owned');
    adapter.releaseElement(ownedRef, 'earth');
    expect(owned.removeCalls).toBe(1);
    expect(() => refs.require('element', ownedRef)).toThrow(ObjectDisposedError);
  });

  it('does not remove a DOM element while another active Overlay ref still points to it', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const shared = new FakeDomElement('div');
    const firstRef = refs.register('element', shared);
    const secondRef = refs.register('element', shared);
    adapter.attach(adapterState('shared-first', firstRef, { ownership: 'earth' }));
    adapter.attach(adapterState('shared-second', secondRef, { ownership: 'earth' }));

    adapter.detach('shared-first');
    adapter.releaseElement(firstRef, 'earth');
    expect(shared.removeCalls).toBe(0);
    expect(refs.require('element', secondRef)).toBe(shared);
    adapter.detach('shared-second');
    adapter.releaseElement(secondRef, 'earth');
    expect(shared.removeCalls).toBe(1);
  });

  it('does not let an uncommitted provisional ref block removal of the sole committed earth-owned element', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const element = new FakeDomElement('div');
    const committedRef = refs.register('element', element);
    const abandonedProvisionalRef = refs.registerProvisional('element', element);
    adapter.attach(adapterState('sole-committed', committedRef, { ownership: 'earth' }));

    adapter.detach('sole-committed');
    adapter.releaseElement(committedRef, 'earth');

    expect(element.removeCalls).toBe(1);
    expect(refs.require('element', abandonedProvisionalRef)).toBe(element);
    refs.discardProvisional('element', abandonedProvisionalRef);
  });

  it('hands the same HTMLElement from earth ownership to a new earth or default-external ref without removing it', () => {
    const createFacade = () => {
      const map = new FakeOverlayMap();
      const refs = new NativeRefRegistry();
      const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
      const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
      const service = new OverlayService(adapter, store, new FakeAnimationPort());
      return new OverlayFacade(service, refs);
    };

    const earthFacade = createFacade();
    const earthElement = new FakeDomElement('div');
    const earth = earthFacade.add({
      id: 'same-earth',
      element: earthElement as unknown as HTMLElement,
      position: [1, 2],
      ownership: 'earth'
    });
    earth.update({ element: earthElement as unknown as HTMLElement, ownership: 'earth' });
    expect(earthElement.removeCalls).toBe(0);
    earth.destroy();
    expect(earthElement.removeCalls).toBe(1);

    const externalFacade = createFacade();
    const externalElement = new FakeDomElement('div');
    const external = externalFacade.add({
      id: 'same-external',
      element: externalElement as unknown as HTMLElement,
      position: [1, 2],
      ownership: 'earth'
    });
    external.update({ element: externalElement as unknown as HTMLElement });
    expect(externalElement.removeCalls).toBe(0);
    external.destroy();
    expect(externalElement.removeCalls).toBe(0);
  });

  it('uses element-local pointer capture and migrates action/drag bindings to a replacement wrapper', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const first = new FakeDomElement('div');
    const firstRef = refs.register('element', first);
    const before = adapterState('drag', firstRef);
    adapter.attach(before);
    const actions = vi.fn();
    const drags = vi.fn();
    adapter.subscribeDescriptorActions('drag', actions);
    adapter.bindDrag('drag', drags);

    const firstItem = new FakeDomElement('button');
    firstItem.dataset.descriptorIndex = '0';
    first.appendChild(firstItem);
    first.dispatch('click', { target: firstItem });
    first.dispatch('pointerdown', { pointerId: 7, button: 0, clientX: 55, clientY: 70 });
    first.dispatch('pointermove', { pointerId: 7, clientX: 75, clientY: 90 });
    first.dispatch('pointerup', { pointerId: 7, clientX: 75, clientY: 90 });
    expect(actions).toHaveBeenCalledWith({ type: 'item', index: 0 });
    expect(drags.mock.calls.map(([event]) => event.type)).toEqual(['start', 'move', 'end']);
    expect(drags.mock.calls[0][0].pixel).toEqual([50, 60]);
    expect(first.captured).toEqual([7]);
    expect(first.releasedCaptures).toEqual([7]);

    first.dispatch('pointerdown', { pointerId: 8, button: 0, clientX: 20, clientY: 20 });

    const second = new FakeDomElement('div');
    const secondRef = refs.register('element', second);
    const after = adapterState('drag', secondRef, { offset: [4, 5] });
    adapter.update(before, after);
    expect(first.releasedCaptures).toEqual([7, 8]);
    expect(drags).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'cancel', pointerId: 8 }));
    actions.mockClear();
    drags.mockClear();
    first.dispatch('click', { target: firstItem });
    first.dispatch('pointerdown', { pointerId: 8, button: 0, clientX: 20, clientY: 20 });
    const secondItem = new FakeDomElement('button');
    secondItem.dataset.descriptorIndex = '1';
    second.appendChild(secondItem);
    second.dispatch('click', { target: secondItem });
    second.dispatch('pointerdown', { pointerId: 9, button: 0, clientX: 25, clientY: 30 });
    expect(actions).toHaveBeenCalledTimes(1);
    expect(actions).toHaveBeenCalledWith({ type: 'item', index: 1 });
    expect(drags).toHaveBeenCalledTimes(1);
    expect(drags).toHaveBeenCalledWith(expect.objectContaining({ type: 'start', pointerId: 9, pixel: [20, 20] }));
    expect(documentAddEventListener).not.toHaveBeenCalled();
    expect(documentRemoveEventListener).not.toHaveBeenCalled();
  });

  it('compensates every OL setter and preserves old DOM bindings when update fails', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const first = new FakeDomElement('div');
    const firstRef = refs.register('element', first);
    const before = adapterState('recover', firstRef);
    adapter.attach(before);
    const action = vi.fn();
    adapter.subscribeDescriptorActions('recover', action);
    const second = new FakeDomElement('div');
    const secondRef = refs.register('element', second);
    const after = adapterState('recover', secondRef, { position: [8, 9], offset: [3, 4], positioning: 'bottom-right' });

    overlayHarness.failNext = 'setOffset';
    expect(() => adapter.update(before, after)).toThrow('setOffset failed');
    const overlay = overlayHarness.instances[0] as {
      getElement(): HTMLElement | undefined;
      getOffset(): number[];
      getPosition(): number[] | undefined;
      getPositioning(): string;
    };
    expect(overlay.getElement()).toBe(first);
    expect(overlay.getOffset()).toEqual([0, 0]);
    expect(overlay.getPosition()).toEqual([1, 2]);
    expect(overlay.getPositioning()).toBe('top-left');
    const oldItem = new FakeDomElement('button');
    oldItem.dataset.descriptorIndex = '0';
    first.appendChild(oldItem);
    const newItem = new FakeDomElement('button');
    newItem.dataset.descriptorIndex = '1';
    second.appendChild(newItem);
    first.dispatch('click', { target: oldItem });
    second.dispatch('click', { target: newItem });
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith({ type: 'item', index: 0 });
  });

  it('does not duplicate a mounted Overlay when a setter fails before the visibility transition', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const ref = refs.register('element', new FakeDomElement('div'));
    const before = adapterState('visibility-setter-failure', ref);
    const after = adapterState('visibility-setter-failure', ref, { visible: false, offset: [3, 4] });
    adapter.attach(before);
    const addOverlay = vi.spyOn(map, 'addOverlay');

    overlayHarness.failNext = 'setOffset';
    expect(() => adapter.update(before, after)).toThrow('setOffset failed');

    expect(addOverlay).not.toHaveBeenCalled();
    expect(map.overlays).toHaveLength(1);
    expect(new Set(map.overlays).size).toBe(1);
    adapter.destroy();
  });

  it('does not scan the complete native overlay collection on ordinary updates', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const ref = refs.register('element', new FakeDomElement('div'));
    let before = adapterState('collection-scan', ref);
    adapter.attach(before);
    const getOverlays = vi.spyOn(map, 'getOverlays');

    for (let index = 0; index < 100; index += 1) {
      const after = adapterState('collection-scan', ref, { position: [index + 2, index + 3] });
      adapter.update(before, after);
      before = after;
    }

    expect(getOverlays).not.toHaveBeenCalled();
    adapter.destroy();
  });

  it('restores native Overlay setters even when collection compensation also fails', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const ref = refs.register('element', new FakeDomElement('div'));
    const before = adapterState('visibility-rollback-failure', ref);
    const after = adapterState('visibility-rollback-failure', ref, { visible: false });
    adapter.attach(before);
    const nativeRemove = map.removeOverlay.bind(map);
    vi.spyOn(map, 'removeOverlay').mockImplementationOnce((overlay) => {
      nativeRemove(overlay);
      throw new Error('remove failed');
    });
    vi.spyOn(map, 'addOverlay').mockImplementationOnce(() => {
      throw new Error('rollback add failed');
    });

    expect(() => adapter.update(before, after)).toThrow('remove failed');

    const overlay = overlayHarness.instances[0] as { getPosition(): number[] | undefined };
    expect(overlay.getPosition()).toEqual([1, 2]);
    expect(map.overlays).toHaveLength(0);

    adapter.update(before, before);
    expect(map.overlays).toHaveLength(1);
    expect(new Set(map.overlays).size).toBe(1);
    adapter.destroy();
  });

  it('destroys adapter-owned bindings, overlays, DOM ownership, and refs idempotently', () => {
    const map = new FakeOverlayMap();
    const refs = new NativeRefRegistry();
    const adapter = new OverlayAdapter(map as unknown as OlMap, refs);
    const element = new FakeDomElement('div');
    const ref = refs.register('element', element);
    adapter.attach(adapterState('adapter-destroy', ref, { ownership: 'earth' }));
    adapter.subscribeDescriptorActions('adapter-destroy', vi.fn());
    adapter.bindDrag('adapter-destroy', vi.fn());
    element.dispatch('pointerdown', { pointerId: 42, button: 0, clientX: 20, clientY: 20 });

    adapter.destroy();
    adapter.destroy();
    expect(map.overlays).toEqual([]);
    expect(element.removeCalls).toBe(1);
    expect(element.releasedCaptures).toEqual([42]);
    expect([...element.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect(() => refs.require('element', ref)).toThrow(ObjectDisposedError);
  });
});

function allText(element: FakeDomElement): string[] {
  return [element.textContent ?? '', ...element.children.flatMap(allText)].filter((value) => value.length > 0);
}

function findClass(element: FakeDomElement, className: string): FakeDomElement | undefined {
  if (element.className.split(/\s+/).includes(className)) return element;
  for (const child of element.children) {
    const match = findClass(child, className);
    if (match !== undefined) return match;
  }
  return undefined;
}
