import { basicShapeDefinitions } from '../../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../../src/builtins/shapes/plot/index.js';
import { createBuiltinAnimationRegistry } from '../../src/builtins/animations/index.js';
import { ElementStore } from '../../src/core/element/ElementStore.js';
import type { ElementState } from '../../src/core/element/types.js';
import type { AnimationClockPort } from '../../src/core/ports/AnimationClockPort.js';
import type { AnimationWakeHandle, AnimationWakePort } from '../../src/core/ports/AnimationWakePort.js';
import type {
  LayerRenderBatch,
  LayerRenderFrame,
  LayerRenderLoopHandle,
  LayerPresentationLease,
  LayerRenderPort,
  LayerRenderTargetHandle,
  LayerRenderTargetSpec
} from '../../src/core/ports/LayerRenderPort.js';
import { ShapeRegistry } from '../../src/core/shape/ShapeRegistry.js';
import { AnimationManagerImpl } from '../../src/services/animation/AnimationManager.js';
import { identityShapeProjection } from './shapeProjection.js';

interface FakeLoop {
  readonly layerId: string;
  readonly render: (frame: LayerRenderFrame) => LayerRenderBatch;
  readonly appliedTargets: Map<string, LayerRenderTargetSpec>;
  destroyed: boolean;
}

export class FakeLayerRenderPort implements LayerRenderPort, AnimationClockPort, AnimationWakePort {
  readonly openCalls = new Map<string, number>();
  readonly destroyCalls = new Map<string, number>();
  readonly requestRenderCalls = new Map<string, number>();
  readonly nextFrameRequests = new Map<string, number>();
  readonly batches = new Map<string, LayerRenderBatch[]>();
  readonly #loops = new Map<string, FakeLoop>();
  readonly #targets = new Map<string, LayerRenderTargetSpec>();
  readonly #elementTargets = new Set<string>();
  readonly #destroyFailures = new Map<string, number>();
  readonly #wakes = new Map<number, { readonly timestamp: number; readonly callback: () => void }>();
  #nextWakeId = 0;
  #time = 0;
  #maxActiveLoopCount = 0;

  now(): number {
    return this.#time;
  }

  scheduleAt(timestamp: number, callback: () => void): AnimationWakeHandle {
    const id = ++this.#nextWakeId;
    this.#wakes.set(id, { timestamp, callback });
    return {
      cancel: () => {
        this.#wakes.delete(id);
      }
    };
  }

  advanceTime(time: number): void {
    this.#time = time;
    while (true) {
      const due = [...this.#wakes].filter(([, wake]) => wake.timestamp <= time).sort((left, right) => left[1].timestamp - right[1].timestamp)[0];
      if (due === undefined) return;
      this.#wakes.delete(due[0]);
      due[1].callback();
    }
  }

  get activeLoopCount(): number {
    return this.#loops.size;
  }

  get maxActiveLoopCount(): number {
    return this.#maxActiveLoopCount;
  }

  get activeWakeCount(): number {
    return this.#wakes.size;
  }

  get nextWakeTimestamp(): number | undefined {
    return [...this.#wakes.values()].reduce<number | undefined>(
      (earliest, wake) => (earliest === undefined ? wake.timestamp : Math.min(earliest, wake.timestamp)),
      undefined
    );
  }

  get activeLayerIds(): readonly string[] {
    return [...this.#loops.keys()];
  }

  addElementTarget(layerId: string, targetId: string): void {
    this.#elementTargets.add(targetKey(layerId, targetId));
  }

  removeElementTarget(layerId: string, targetId: string): void {
    this.#elementTargets.delete(targetKey(layerId, targetId));
  }

  failNextDestroy(layerId: string): void {
    this.#destroyFailures.set(layerId, (this.#destroyFailures.get(layerId) ?? 0) + 1);
  }

  open(layerId: string, render: (frame: LayerRenderFrame) => LayerRenderBatch): LayerRenderLoopHandle {
    if (this.#loops.has(layerId)) throw new Error(`图层 ${layerId} 已存在渲染循环`);
    const loop: FakeLoop = { layerId, render, appliedTargets: new Map(), destroyed: false };
    this.#loops.set(layerId, loop);
    this.openCalls.set(layerId, (this.openCalls.get(layerId) ?? 0) + 1);
    this.#maxActiveLoopCount = Math.max(this.#maxActiveLoopCount, this.#loops.size);
    return {
      requestRender: () => {
        if (!loop.destroyed && this.#loops.get(layerId) === loop) {
          this.requestRenderCalls.set(layerId, (this.requestRenderCalls.get(layerId) ?? 0) + 1);
        }
      },
      destroy: () => this.#destroyLoop(loop)
    };
  }

  registerTarget(spec: LayerRenderTargetSpec): LayerRenderTargetHandle {
    const key = targetKey(spec.layerId, spec.targetId);
    if (this.#targets.has(key)) throw new Error(`目标 ${spec.targetId} 已注册`);
    this.#targets.set(key, spec);
    let destroyed = false;
    return {
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        if (this.#targets.get(key) !== spec) return;
        this.#targets.delete(key);
        for (const loop of this.#loops.values()) {
          for (const [appliedKey, applied] of [...loop.appliedTargets]) {
            if (applied !== spec) continue;
            loop.appliedTargets.delete(appliedKey);
            applied.clear(channelFromAppliedKey(appliedKey));
          }
        }
      }
    };
  }

  hasTarget(layerId: string, targetId: string): boolean {
    const key = targetKey(layerId, targetId);
    return this.#targets.has(key) || this.#elementTargets.has(key);
  }

  acquirePresentation(layerId: string, targetId: string): LayerPresentationLease {
    if (!this.#elementTargets.has(targetKey(layerId, targetId))) throw new Error(`目标 ${targetId} 不存在`);
    let active = true;
    return Object.freeze({
      layerId,
      targetId,
      get active() {
        return active;
      },
      release: () => {
        active = false;
      }
    });
  }

  frame(
    layerId: string,
    time: number,
    resolution = 1,
    extent: readonly [number, number, number, number] = [-1_000, -1_000, 1_000, 1_000],
    worldWidth?: number
  ): LayerRenderBatch {
    this.#time = time;
    const loop = this.#loops.get(layerId);
    if (loop === undefined || loop.destroyed) throw new Error(`图层 ${layerId} 没有活动渲染循环`);
    const frame = Object.freeze({ layerId, time, resolution, extent, pixelRatio: 1, rotation: 0, ...(worldWidth === undefined ? {} : { worldWidth }) });
    const batch = loop.render(frame);
    const batches = this.batches.get(layerId) ?? [];
    batches.push(batch);
    this.batches.set(layerId, batches);
    const seen = new Set<string>();
    for (const contribution of batch.contributions) {
      const target = this.#targets.get(targetKey(layerId, contribution.targetId));
      if (target === undefined) continue;
      const key = appliedKey(contribution.targetId, contribution.channel);
      target.apply(contribution.value, frame);
      loop.appliedTargets.set(key, target);
      seen.add(key);
    }
    for (const [key, target] of [...loop.appliedTargets]) {
      if (seen.has(key)) continue;
      loop.appliedTargets.delete(key);
      target.clear(channelFromAppliedKey(key));
    }
    if (batch.requestNextFrame) this.nextFrameRequests.set(layerId, (this.nextFrameRequests.get(layerId) ?? 0) + 1);
    return batch;
  }

  #destroyLoop(loop: FakeLoop): void {
    if (loop.destroyed) return;
    const remainingFailures = this.#destroyFailures.get(loop.layerId) ?? 0;
    if (remainingFailures > 0) {
      this.#destroyFailures.set(loop.layerId, remainingFailures - 1);
      throw new Error(`图层 ${loop.layerId} 渲染循环销毁失败`);
    }
    loop.destroyed = true;
    if (this.#loops.get(loop.layerId) === loop) this.#loops.delete(loop.layerId);
    for (const [key, target] of loop.appliedTargets) target.clear(channelFromAppliedKey(key));
    loop.appliedTargets.clear();
    this.destroyCalls.set(loop.layerId, (this.destroyCalls.get(loop.layerId) ?? 0) + 1);
  }
}

export interface AnimationHarness {
  readonly shapes: ShapeRegistry;
  readonly store: ElementStore;
  readonly render: FakeLayerRenderPort;
  readonly manager: AnimationManagerImpl;
}

export function createAnimationHarness(seed: readonly ElementState[] = []): AnimationHarness {
  const shapes = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
  const store = new ElementStore(shapes);
  for (const state of seed) store.add(state);
  const render = new FakeLayerRenderPort();
  for (const state of seed) render.addElementTarget(state.layerId, state.id);
  const manager = new AnimationManagerImpl({
    store,
    shapes,
    render,
    shapeProjection: identityShapeProjection,
    registry: createBuiltinAnimationRegistry(),
    clock: render,
    wake: render
  });
  return { shapes, store, render, manager };
}

export function pointElement(id: string, overrides: Partial<ElementState> = {}): ElementState {
  return {
    id,
    type: 'point',
    geometry: { type: 'point', controlPoints: [[10, 20]] },
    style: { symbol: { type: 'circle', radius: 5, fill: { type: 'solid', color: '#ff0000' } } },
    module: 'markers',
    layerId: 'default',
    visible: true,
    ...overrides
  };
}

export function polylineElement(id: string, overrides: Partial<ElementState> = {}): ElementState {
  return {
    id,
    type: 'polyline',
    geometry: {
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [100, 0]
      ]
    },
    style: { strokes: [{ color: '#00d8ff', width: 3, lineDash: [8, 4] }] },
    module: 'routes',
    layerId: 'default',
    visible: true,
    ...overrides
  };
}

function targetKey(layerId: string, targetId: string): string {
  return JSON.stringify([layerId, targetId]);
}

function appliedKey(targetId: string, channel: string): string {
  return JSON.stringify([targetId, channel]);
}

function channelFromAppliedKey(key: string): string {
  const parsed = JSON.parse(key) as [string, string];
  return parsed[1];
}
