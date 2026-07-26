import type { ElementStore } from '../../core/element/ElementStore.js';
import { CapabilityError, ObjectDisposedError } from '../../core/errors.js';
import type { PrintMapSnapshotHandle, PrintMapSnapshotPort } from '../../core/ports/PrintMapSnapshotPort.js';
import type { NormalizedPrintSpec, PrintLegendResult, PrintPlan, PrintValidationIssue } from '../../core/print/types.js';
import type { AnimationManagerImpl } from '../animation/AnimationManager.js';
import type { PrintLegendBuilder } from './PrintLegendBuilder.js';

export interface PrintFrozenSnapshot<TMapSnapshot extends PrintMapSnapshotHandle = PrintMapSnapshotHandle> {
  readonly revision: number;
  readonly map: Readonly<TMapSnapshot>;
  readonly legend: Readonly<PrintLegendResult>;
  readonly destroyed: boolean;
  destroy(): void;
}

export interface PrintSnapshotServiceDependencies<TMapSnapshot extends PrintMapSnapshotHandle, TFactory> {
  readonly store: ElementStore;
  readonly mapRenderer: PrintMapSnapshotPort<TMapSnapshot, TFactory>;
  readonly legendBuilder: PrintLegendBuilder;
  readonly animations: AnimationManagerImpl;
}

/** 把业务状态、动画展示、地图图层和图例冻结在同一次同步 capture 边界内。 */
export class PrintSnapshotService<TMapSnapshot extends PrintMapSnapshotHandle = PrintMapSnapshotHandle, TFactory = unknown> {
  readonly #mapRenderer: PrintMapSnapshotPort<TMapSnapshot, TFactory>;
  readonly #legendBuilder: PrintLegendBuilder;
  readonly #animations: AnimationManagerImpl;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribers: Array<() => void>;
  #disposed = false;

  constructor(dependencies: PrintSnapshotServiceDependencies<TMapSnapshot, TFactory>) {
    this.#mapRenderer = dependencies.mapRenderer;
    this.#legendBuilder = dependencies.legendBuilder;
    this.#animations = dependencies.animations;
    this.#unsubscribers = [
      dependencies.store.subscribe(() => this.#notify()),
      dependencies.mapRenderer.subscribe(() => this.#notify()),
      dependencies.animations.subscribePresentationChanges(() => this.#notify())
    ];
  }

  subscribe(listener: () => void): () => void {
    this.#assertActive();
    this.#listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(listener);
    };
  }

  validationIssues(plan?: Readonly<PrintPlan>, factory?: TFactory): readonly Readonly<PrintValidationIssue>[] {
    this.#assertActive();
    return this.#mapRenderer.validationIssues(plan, factory);
  }

  /** 供 Session 最终输出缓存校验 current-frame 快照是否仍属于同一展示 revision。 */
  get presentationRevision(): number {
    this.#assertActive();
    return this.#animations.presentationRevision;
  }

  capture(plan: Readonly<PrintPlan>, spec: Readonly<NormalizedPrintSpec>, factory?: TFactory): Readonly<PrintFrozenSnapshot<TMapSnapshot>> {
    this.#assertActive();
    const map = this.#mapRenderer.capture(plan, { animations: spec.content?.animations ?? 'current-frame' }, factory);
    let legend: Readonly<PrintLegendResult>;
    try {
      legend = this.#legendBuilder.generate(plan, spec.legend);
    } catch (error) {
      map.destroy();
      throw error;
    }
    let destroyed = false;
    return Object.freeze({
      revision: plan.revision,
      map,
      legend,
      get destroyed() {
        return destroyed;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        map.destroy();
      }
    });
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const unsubscribe of this.#unsubscribers.splice(0)) unsubscribe();
    this.#listeners.clear();
  }

  #notify(): void {
    if (this.#disposed) return;
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch {
        // 内容监听者失败不能回滚已经提交的 Element、Layer 或动画状态。
      }
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('Print snapshot service has been destroyed');
    if (this.#mapRenderer === undefined) throw new CapabilityError('Print snapshot renderer is unavailable');
  }
}
