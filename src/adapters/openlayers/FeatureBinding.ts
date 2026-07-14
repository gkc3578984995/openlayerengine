import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import type VectorSource from 'ol/source/Vector.js';
import type { StyleFunction } from 'ol/style/Style.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import { ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ElementChange, ElementChangeSet } from '../../core/transaction/types.js';
import type { ShapeState } from '../../core/shape/types.js';
import type { RenderGeometryKind } from './GeometryCodec.js';
import type { GeometryCodec } from './GeometryCodec.js';
import type { LayerAdapter } from './LayerAdapter.js';
import type { StyleCompiler } from './style/StyleCompiler.js';

type BoundSource = VectorSource<Feature<Geometry>>;

interface BindingRecord {
  readonly feature: Feature<Geometry>;
  layerId: string;
  visible: boolean;
}

export interface FeatureBindingOptions {
  readonly errorReporter?: ErrorReporter;
}

export interface BoundFeatureIdentity {
  readonly elementId: string;
  readonly layerId: string;
  readonly visible: boolean;
}

const hiddenStyle: StyleFunction = () => [];

export class FeatureBinding {
  readonly #store: ElementStore;
  readonly #layers: LayerAdapter;
  readonly #geometry: GeometryCodec;
  readonly #styles: StyleCompiler;
  readonly #errorReporter: ErrorReporter;
  readonly #bindings = new Map<string, BindingRecord>();
  readonly #featureIds = new WeakMap<Feature<Geometry>, string>();
  readonly #dirty = new Set<string>();
  readonly #unsubscribe: () => void;
  #disposed = false;
  #reconciling = false;

  constructor(store: ElementStore, layers: LayerAdapter, geometry: GeometryCodec, styles: StyleCompiler, options: FeatureBindingOptions = {}) {
    this.#store = store;
    this.#layers = layers;
    this.#geometry = geometry;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    this.#unsubscribe = store.subscribe((changes) => this.#onChanges(changes));
    this.reconcile();
  }

  preflight(state: Readonly<ElementState>): void {
    this.#assertActive();
    void this.#layers.requireVectorSource(state.layerId);
    const feature = new Feature<Geometry>();
    try {
      this.#geometry.project(feature, state.geometry);
      void this.#styles.compile(state.style);
    } finally {
      feature.setGeometry(undefined);
      feature.setStyle(undefined);
      feature.dispose();
    }
  }

  renderKind(state: ShapeState): RenderGeometryKind {
    this.#assertActive();
    return this.#geometry.renderKind(state);
  }

  requireFeature(id: string): Feature<Geometry> {
    this.#assertActive();
    this.#reconcileDirty();
    const feature = this.#bindings.get(id)?.feature;
    if (feature === undefined) throw new ObjectDisposedError(`Element Feature is not bound: ${id}`);
    return feature;
  }

  isCurrentFeature(id: string, feature: Feature<Geometry>): boolean {
    this.#assertActive();
    return this.#bindings.get(id)?.feature === feature;
  }

  elementIdFor(feature: Feature<Geometry>): string | undefined {
    if (this.#disposed) return undefined;
    const id = this.#featureIds.get(feature);
    return id !== undefined && this.#bindings.get(id)?.feature === feature ? id : undefined;
  }

  resolveFeature(feature: Feature<Geometry>): BoundFeatureIdentity | undefined {
    if (this.#disposed) return undefined;
    const elementId = this.elementIdFor(feature);
    if (elementId === undefined) return undefined;
    const binding = this.#bindings.get(elementId);
    const state = this.#store.get(elementId);
    if (binding === undefined || state === undefined) return undefined;
    return { elementId, layerId: state.layerId, visible: state.visible };
  }

  reconcile(): void {
    this.#assertActive();
    if (this.#reconciling) return;
    this.#reconciling = true;
    try {
      const states = this.#store.query();
      const currentIds = new Set(states.map(({ id }) => id));
      const changes: ElementChange[] = states.map((after) => ({ kind: this.#bindings.has(after.id) ? 'update' : 'add', id: after.id, after }));
      for (const id of this.#bindings.keys()) {
        if (!currentIds.has(id)) changes.push({ kind: 'remove', id });
      }
      this.#applyChanges(Object.freeze({ changes: Object.freeze(changes) }));
    } finally {
      this.#reconciling = false;
    }
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#unsubscribe();
    const records = [...this.#bindings.values()];
    const bySource = new Map<BoundSource, Feature<Geometry>[]>();
    for (const record of records) {
      for (const source of this.#layers.vectorSources()) {
        if (source.hasFeature(record.feature)) append(bySource, source, record.feature);
      }
    }
    this.#removeBatches(bySource, false);
    for (const [id, record] of this.#bindings) this.#disposeBinding(id, record);
    this.#bindings.clear();
    this.#dirty.clear();
    this.#disposed = true;
  }

  #onChanges(changes: ElementChangeSet): void {
    if (this.#disposed) return;
    this.#reconcileDirty();
    this.#applyChanges(changes);
  }

  #reconcileDirty(): void {
    if (this.#dirty.size === 0 || this.#reconciling) return;
    const ids = [...this.#dirty];
    this.#dirty.clear();
    const changes: ElementChange[] = [];
    for (const id of ids) {
      const state = this.#store.get(id);
      changes.push(state === undefined ? { kind: 'remove', id } : { kind: this.#bindings.has(id) ? 'update' : 'add', id, after: state });
    }
    this.#applyChanges({ changes });
  }

  #applyChanges(changes: ElementChangeSet): void {
    const sources = this.#layers.vectorSources();
    const targetSources = new Map<string, BoundSource>();
    for (const change of changes.changes) {
      if (change.after !== undefined && !targetSources.has(change.after.layerId)) {
        try {
          targetSources.set(change.after.layerId, this.#layers.requireVectorSource(change.after.layerId));
        } catch (error) {
          this.#markFailed(change.id, error, 'prepare-source');
        }
      }
    }

    const removals = new Map<BoundSource, Feature<Geometry>[]>();
    const additions = new Map<BoundSource, Feature<Geometry>[]>();
    const removed: Array<readonly [string, BindingRecord]> = [];

    for (const change of changes.changes) {
      if (change.kind === 'remove' || change.after === undefined) {
        const binding = this.#bindings.get(change.id);
        if (binding === undefined) continue;
        for (const source of sources) if (source.hasFeature(binding.feature)) append(removals, source, binding.feature);
        removed.push([change.id, binding]);
        continue;
      }

      const target = targetSources.get(change.after.layerId);
      if (target === undefined) continue;
      const existing = this.#bindings.get(change.id);
      const binding = existing ?? this.#createBinding(change.id, change.after.layerId);
      try {
        binding.feature.setId(change.after.id);
        this.#geometry.project(binding.feature, change.after.geometry);
        binding.feature.setStyle(change.after.visible ? this.#styles.compile(change.after.style) : hiddenStyle);
        binding.layerId = change.after.layerId;
        binding.visible = change.after.visible;
        for (const source of sources) {
          const shouldContain = change.after.visible && source === target;
          const contains = source.hasFeature(binding.feature);
          if (contains && !shouldContain) append(removals, source, binding.feature);
          else if (!contains && shouldContain) append(additions, source, binding.feature);
        }
        this.#dirty.delete(change.id);
      } catch (error) {
        if (existing === undefined) this.#disposeBinding(change.id, binding);
        this.#markFailed(change.id, error, 'project');
      }
    }

    this.#removeBatches(removals, true);
    this.#addBatches(additions);
    for (const [id, binding] of removed) this.#disposeBinding(id, binding);
  }

  #createBinding(id: string, layerId: string): BindingRecord {
    const feature = new Feature<Geometry>();
    const record = { feature, layerId, visible: false };
    this.#bindings.set(id, record);
    this.#featureIds.set(feature, id);
    return record;
  }

  #removeBatches(batches: Map<BoundSource, Feature<Geometry>[]>, markDirty: boolean): void {
    for (const [source, features] of batches) {
      const unique = [...new Set(features)];
      try {
        source.removeFeatures(unique);
      } catch (error) {
        this.#report(error, 'remove-features');
        for (const feature of unique) {
          if (markDirty) {
            const id = this.#featureIds.get(feature);
            if (id !== undefined) this.#dirty.add(id);
          }
          if (!source.hasFeature(feature)) continue;
          try {
            source.removeFeature(feature);
          } catch (retryError) {
            this.#report(retryError, 'remove-feature-retry');
          }
        }
      }
    }
  }

  #addBatches(batches: Map<BoundSource, Feature<Geometry>[]>): void {
    for (const [source, features] of batches) {
      const unique = [...new Set(features)].filter((feature) => !source.hasFeature(feature));
      if (unique.length === 0) continue;
      try {
        source.addFeatures(unique);
      } catch (error) {
        this.#report(error, 'add-features');
        for (const feature of unique) {
          const id = this.#featureIds.get(feature);
          if (id !== undefined) this.#dirty.add(id);
          if (source.hasFeature(feature)) continue;
          try {
            source.addFeature(feature);
          } catch (retryError) {
            this.#report(retryError, 'add-feature-retry');
          }
        }
      }
    }
  }

  #disposeBinding(id: string, binding: BindingRecord): void {
    this.#bindings.delete(id);
    this.#featureIds.delete(binding.feature);
    this.#dirty.delete(id);
    this.#attempt(() => binding.feature.setGeometry(undefined), id, 'clear-geometry');
    this.#attempt(() => binding.feature.setStyle(undefined), id, 'clear-style');
    this.#attempt(() => binding.feature.dispose(), id, 'dispose-feature');
  }

  #markFailed(id: string, error: unknown, operation: string): void {
    this.#dirty.add(id);
    this.#report(error, operation, id);
  }

  #attempt(work: () => void, id: string, operation: string): void {
    try {
      work();
    } catch (error) {
      this.#report(error, operation, id);
    }
  }

  #report(error: unknown, operation: string, ownerId?: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'FeatureBinding',
        operation,
        ...(ownerId === undefined ? {} : { ownerId })
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // Projection reporting must not roll back committed Core state.
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('FeatureBinding has been destroyed');
  }
}

function append(map: Map<BoundSource, Feature<Geometry>[]>, source: BoundSource, feature: Feature<Geometry>): void {
  const values = map.get(source);
  if (values === undefined) map.set(source, [feature]);
  else values.push(feature);
}
