import Feature from 'ol/Feature.js';
import CircleGeometry from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import { unByKey } from 'ol/Observable.js';
import { getWidth } from 'ol/extent.js';
import type { EventsKey } from 'ol/events.js';
import type RenderEvent from 'ol/render/Event.js';
import { getVectorContext } from 'ol/render.js';
import type { StyleLike } from 'ol/style/Style.js';
import Style from 'ol/style/Style.js';
import { runFinalizers } from '../../../core/common/dispose.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../../core/ports/ErrorReporter.js';
import type {
  LayerRenderBatch,
  LayerRenderFrame,
  LayerRenderLoopHandle,
  LayerRenderPort,
  LayerRenderPrimitive,
  LayerRenderTargetHandle,
  LayerRenderTargetSpec
} from '../../../core/ports/LayerRenderPort.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';
import type { FeatureBinding } from '../FeatureBinding.js';
import type { LayerAdapter } from '../LayerAdapter.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';

export interface LayerRenderPassOptions {
  readonly errorReporter?: ErrorReporter;
}

interface AppliedTarget {
  readonly spec: LayerRenderTargetSpec;
  readonly channel: string;
}

interface LoopRecord {
  readonly layerId: string;
  readonly layer: VectorLayer;
  readonly render: (frame: LayerRenderFrame) => LayerRenderBatch;
  key: EventsKey | undefined;
  readonly applied: Map<string, AppliedTarget>;
  destroyed: boolean;
  destroying: boolean;
  subscribed: boolean;
}

export class LayerRenderPass implements LayerRenderPort {
  readonly #layers: LayerAdapter;
  readonly #binding: FeatureBinding;
  readonly #styles: StyleCompiler;
  readonly #errorReporter: ErrorReporter;
  readonly #loops = new Map<string, LoopRecord>();
  readonly #targets = new Map<string, LayerRenderTargetSpec>();
  #disposed = false;
  #destroying = false;

  constructor(layers: LayerAdapter, binding: FeatureBinding, styles: StyleCompiler, options: LayerRenderPassOptions = {}) {
    if (options.errorReporter !== undefined && typeof options.errorReporter !== 'function') {
      throw new InvalidArgumentError('LayerRenderPass errorReporter must be a function');
    }
    this.#layers = layers;
    this.#binding = binding;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
  }

  get activeLoopCount(): number {
    return this.#loops.size;
  }

  get registeredTargetCount(): number {
    return this.#targets.size;
  }

  open(layerId: string, render: (frame: LayerRenderFrame) => LayerRenderBatch): LayerRenderLoopHandle {
    this.#assertActive();
    const safeLayerId = nonEmptyString(layerId, 'Render layer id');
    if (typeof render !== 'function') throw new InvalidArgumentError('Layer render callback must be a function');
    if (this.#loops.has(safeLayerId)) throw new InvalidArgumentError(`Layer render loop is already open: ${safeLayerId}`);
    const layer = this.#layers.requireLayer(safeLayerId);
    if (!(layer instanceof VectorLayer)) throw new InvalidArgumentError(`Layer render loop requires a vector layer: ${safeLayerId}`);
    const record: LoopRecord = {
      layerId: safeLayerId,
      layer,
      render,
      key: undefined,
      applied: new Map(),
      destroyed: false,
      destroying: false,
      subscribed: true
    };
    record.key = layer.on('postrender', (event) => this.#renderFrame(record, event));
    this.#loops.set(safeLayerId, record);
    let destroyed = false;
    return {
      requestRender: () => {
        if (!destroyed && !record.destroyed && this.#loops.get(safeLayerId) === record) layer.changed();
      },
      destroy: () => {
        if (destroyed) return;
        this.#destroyLoop(record);
        destroyed = true;
      }
    };
  }

  registerTarget(spec: LayerRenderTargetSpec): LayerRenderTargetHandle {
    this.#assertActive();
    const safe = normalizeTarget(spec);
    const key = targetKey(safe.layerId, safe.targetId);
    if (this.#targets.has(key)) throw new InvalidArgumentError(`Layer render target is already registered: ${safe.targetId}`);
    this.#targets.set(key, safe);
    let destroyed = false;
    let destroying = false;
    return {
      destroy: () => {
        if (destroyed || destroying) return;
        destroying = true;
        try {
          let failed = false;
          let firstError: unknown;
          for (const loop of this.#loops.values()) {
            for (const [appliedKey, applied] of [...loop.applied]) {
              if (applied.spec !== safe) continue;
              try {
                safe.clear(applied.channel);
                loop.applied.delete(appliedKey);
              } catch (error) {
                if (!failed) {
                  failed = true;
                  firstError = error;
                }
              }
            }
          }
          if (failed) throw firstError;
          if (this.#targets.get(key) === safe) this.#targets.delete(key);
          destroyed = true;
        } finally {
          destroying = false;
        }
      }
    };
  }

  hasTarget(layerId: string, targetId: string): boolean {
    if (this.#disposed) return false;
    const safeLayerId = nonEmptyString(layerId, 'Render layer id');
    const safeTargetId = nonEmptyString(targetId, 'Render target id');
    if (this.#targets.has(targetKey(safeLayerId, safeTargetId))) return true;
    try {
      const feature = this.#binding.requireFeature(safeTargetId);
      return this.#binding.resolveFeature(feature)?.layerId === safeLayerId;
    } catch {
      return false;
    }
  }

  destroy(): void {
    if (this.#disposed || this.#destroying) return;
    this.#destroying = true;
    try {
      runFinalizers([...this.#loops.values()].map((loop) => () => this.#destroyLoop(loop)));
      this.#loops.clear();
      this.#targets.clear();
      this.#disposed = true;
    } finally {
      this.#destroying = false;
    }
  }

  #renderFrame(record: LoopRecord, event: RenderEvent): void {
    if (this.#disposed || this.#destroying || record.destroyed || this.#loops.get(record.layerId) !== record) return;
    const frameState = event.frameState;
    if (frameState === undefined || frameState === null || !Number.isFinite(frameState.time) || !Number.isFinite(frameState.viewState.resolution)) return;
    const frame: LayerRenderFrame = Object.freeze({ layerId: record.layerId, time: frameState.time, resolution: frameState.viewState.resolution });
    let batch: LayerRenderBatch;
    try {
      batch = normalizeBatch(record.render(frame));
    } catch (error) {
      this.#report(error, 'render-batch', record.layerId);
      return;
    }
    const seen = new Set<string>();
    let drawing: Readonly<{ context: ReturnType<typeof getVectorContext>; offsets: readonly number[] }> | undefined;
    for (const contribution of batch.contributions) {
      try {
        const target = this.#targets.get(targetKey(record.layerId, contribution.targetId));
        if (target !== undefined) {
          const key = appliedKey(contribution.targetId, contribution.channel);
          target.apply(contribution.value, frame);
          seen.add(key);
          record.applied.set(key, { spec: target, channel: contribution.channel });
          continue;
        }
        if (!this.hasTarget(record.layerId, contribution.targetId)) continue;
        for (const primitive of contribution.value.primitives ?? []) {
          this.#attempt(
            () => {
              drawing ??= Object.freeze({ context: getVectorContext(event), offsets: worldOffsets(event, record.layer) });
              this.#drawPrimitive(drawing.context, drawing.offsets, primitive, frame.resolution);
            },
            'draw-primitive',
            contribution.targetId
          );
        }
      } catch (error) {
        this.#report(error, 'apply-contribution', contribution.targetId);
      }
    }
    for (const [key, applied] of [...record.applied]) {
      if (seen.has(key)) continue;
      try {
        applied.spec.clear(applied.channel);
        record.applied.delete(key);
      } catch (error) {
        this.#report(error, 'clear-target-channel', applied.spec.targetId);
      }
    }
    if (batch.requestNextFrame && !record.destroyed && this.#loops.get(record.layerId) === record) record.layer.changed();
  }

  #drawPrimitive(vectorContext: ReturnType<typeof getVectorContext>, offsets: readonly number[], primitive: LayerRenderPrimitive, resolution: number): void {
    for (const offset of offsets) {
      const geometry = createGeometry(primitive.geometry);
      if (offset !== 0) geometry.translate(offset, 0);
      const feature = new Feature<Geometry>(geometry);
      try {
        const styles = resolveStyles(this.#styles.compile(primitive.style), feature, resolution);
        for (const style of styles) vectorContext.drawFeature(feature, style);
      } finally {
        feature.setGeometry(undefined);
        feature.dispose();
      }
    }
  }

  #destroyLoop(record: LoopRecord): void {
    if (record.destroyed || record.destroying) return;
    record.destroying = true;
    try {
      let failed = false;
      let firstError: unknown;
      for (const [key, applied] of [...record.applied]) {
        try {
          applied.spec.clear(applied.channel);
          record.applied.delete(key);
        } catch (error) {
          if (!failed) {
            failed = true;
            firstError = error;
          }
        }
      }
      if (failed) throw firstError;
      if (record.subscribed) {
        if (record.key !== undefined) unByKey(record.key);
        record.key = undefined;
        record.subscribed = false;
      }
      record.destroyed = true;
      this.#loops.delete(record.layerId);
    } finally {
      record.destroying = false;
    }
  }

  #attempt(work: () => void, operation: string, ownerId?: string): void {
    try {
      work();
    } catch (error) {
      this.#report(error, operation, ownerId);
    }
  }

  #report(error: unknown, operation: string, ownerId?: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'LayerRenderPass',
        operation,
        ...(ownerId === undefined ? {} : { ownerId })
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      return;
    }
  }

  #assertActive(): void {
    if (this.#disposed || this.#destroying) throw new ObjectDisposedError('LayerRenderPass has been destroyed');
  }
}

function normalizeTarget(spec: LayerRenderTargetSpec): LayerRenderTargetSpec {
  if (spec === null || typeof spec !== 'object') throw new InvalidArgumentError('Layer render target must be an object');
  const prototype = Object.getPrototypeOf(spec);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Layer render target must be a plain object');
  const allowed = new Set(['layerId', 'targetId', 'apply', 'clear']);
  const values = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(spec)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown layer render target field: ${String(key)}`);
    const descriptor = Object.getOwnPropertyDescriptor(spec, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Layer render target cannot contain accessor properties');
    values[key] = descriptor.value;
  }
  if (typeof values.apply !== 'function' || typeof values.clear !== 'function')
    throw new InvalidArgumentError('Layer render target callbacks must be functions');
  return Object.freeze({
    layerId: nonEmptyString(values.layerId, 'Render target layerId'),
    targetId: nonEmptyString(values.targetId, 'Render target id'),
    apply: values.apply as LayerRenderTargetSpec['apply'],
    clear: values.clear as LayerRenderTargetSpec['clear']
  });
}

function normalizeBatch(batch: LayerRenderBatch): LayerRenderBatch {
  if (batch === null || typeof batch !== 'object' || !Array.isArray(batch.contributions) || typeof batch.requestNextFrame !== 'boolean') {
    throw new InvalidArgumentError('Layer render callback returned an invalid batch');
  }
  return batch;
}

function createGeometry(state: RenderGeometryState): Geometry {
  if (state.type === 'point') return new Point([...state.coordinates]);
  if (state.type === 'polyline') return new LineString(state.coordinates.map((coordinate) => [...coordinate]));
  if (state.type === 'polygon') return new Polygon(state.coordinates.map((ring) => ring.map((coordinate) => [...coordinate])));
  return new CircleGeometry([...state.center], state.radius);
}

function resolveStyles(style: StyleLike, feature: Feature<Geometry>, resolution: number): readonly Style[] {
  const resolved = typeof style === 'function' ? style(feature, resolution) : style;
  if (resolved === undefined) return [];
  return Array.isArray(resolved) ? resolved : [resolved];
}

function worldOffsets(event: RenderEvent, layer: VectorLayer): readonly number[] {
  const frameState = event.frameState;
  if (frameState === undefined || frameState === null) return [0];
  if (layer.getSource()?.getWrapX() !== true) return [0];
  const projection = frameState.viewState.projection;
  if (!projection.canWrapX()) return [0];
  const width = getWidth(projection.getExtent());
  if (!Number.isFinite(width) || width <= 0) return [0];
  const world = Math.round(frameState.viewState.center[0] / width);
  return Object.freeze([(world - 1) * width, world * width, (world + 1) * width]);
}

function targetKey(layerId: string, targetId: string): string {
  return JSON.stringify([layerId, targetId]);
}

function appliedKey(targetId: string, channel: string): string {
  return JSON.stringify([targetId, channel]);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}
