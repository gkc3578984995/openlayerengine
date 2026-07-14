import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import Interaction from 'ol/interaction/Interaction.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { getUserProjection } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import type { Coordinate } from '../../../core/common/types.js';
import { horizontalWorldFromExtent, prepareWorldEdit, type PreparedWorldEdit } from '../../../core/common/worldWrap.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import type {
  EditControlAnchor,
  EditInsertionAnchor,
  EditInteractionAnchor,
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState,
  EditInteractionSpec
} from '../../../core/ports/EditInteractionPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../../core/ports/ErrorReporter.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';
import type { FeatureBinding, ProjectionSuppressionLease } from '../FeatureBinding.js';
import type { LayerAdapter } from '../LayerAdapter.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';

type EditFeature = Feature<Geometry>;
type EditSource = VectorSource<EditFeature>;
type EditLayer = VectorLayer<EditSource>;

interface RenderBundle {
  readonly source: EditSource;
  readonly features: readonly EditFeature[];
  readonly anchors: readonly (readonly [EditFeature, EditInteractionAnchor])[];
  readonly underlay: EditFeature | undefined;
}

interface FeatureCleanupProgress {
  readonly feature: EditFeature;
  geometryCleared: boolean;
  styleCleared: boolean;
  disposed: boolean;
}

interface BundleCleanupProgress {
  source: EditSource | undefined;
  sourceCleared: boolean;
  readonly features: Set<FeatureCleanupProgress>;
}

/**
 * OpenLayers 编辑交互适配器的可选配置。
 *
 * @internal
 */
export interface EditInteractionAdapterOptions {
  /** 接收语义监听器异常和原生资源清理异常的报告器。 */
  readonly errorReporter?: ErrorReporter;
  /**
   * 控制点与插入点的像素命中容差，必须为非负有限数。
   *
   * @defaultValue `8`
   */
  readonly hitTolerance?: number;
}

const controlAnchorStyle = new Style({
  image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#3388ff', width: 2 }) })
});
const insertionAnchorStyle = new Style({
  image: new CircleStyle({
    radius: 4,
    fill: new Fill({ color: 'rgba(255,255,255,0.75)' }),
    stroke: new Stroke({ color: '#3388ff', width: 1.5, lineDash: [3, 2] })
  })
});

/**
 * 将语义编辑端口映射为独立的 OpenLayers 临时图层、交互、锚点命中测试和投影抑制租约。
 *
 * @internal
 */
export class EditInteractionAdapter implements EditInteractionPort {
  readonly #map: OlMap;
  readonly #layers: LayerAdapter;
  readonly #binding: FeatureBinding;
  readonly #styles: StyleCompiler;
  readonly #errorReporter: ErrorReporter;
  readonly #hitTolerance: number;

  /**
   * 创建编辑交互适配器。
   *
   * @param map 承载临时编辑图层和交互的 OpenLayers 地图。
   * @param layers 解析目标元素持久图层及矢量数据源的适配器。
   * @param binding 管理持久 Feature 身份和投影抑制租约的绑定器。
   * @param styles 将语义样式编译为 OpenLayers 样式的编译器。
   * @param options 错误报告器和命中容差配置。
   * @throws `InvalidArgumentError` 命中容差不是非负有限数时抛出。
   */
  constructor(map: OlMap, layers: LayerAdapter, binding: FeatureBinding, styles: StyleCompiler, options: EditInteractionAdapterOptions = {}) {
    this.#map = map;
    this.#layers = layers;
    this.#binding = binding;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    const hitTolerance = options.hitTolerance ?? 8;
    if (!Number.isFinite(hitTolerance) || hitTolerance < 0) throw new InvalidArgumentError('Edit hitTolerance must be a non-negative finite number');
    this.#hitTolerance = hitTolerance;
  }

  /**
   * 原子安装一次编辑交互，并在成功后返回全部原生资源的所有权句柄。
   *
   * 返回句柄前不会向 `listener` 发布事件；打开失败时先释放投影抑制租约、临时图层和交互，再重新抛出错误。
   *
   * @param spec 目标元素、进入编辑时的控制点和临时底图配置。
   * @param listener 接收冻结后的语义编辑事件快照。
   * @returns 管理预览、命中锚点、投影交接和销毁重试的编辑句柄。
   * @throws `InvalidArgumentError` 配置、监听器或目标图层不符合契约时抛出。
   * @throws `ObjectDisposedError` 目标元素不再具有有效的持久 Feature 绑定时抛出。
   * @throws `AggregateError` 打开失败且原生资源回滚不完整时抛出。
   */
  open(spec: Readonly<EditInteractionSpec>, listener: (event: EditInteractionEvent) => void): EditInteractionHandle {
    const safeSpec = validateSpec(spec);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Edit interaction listener must be a function');

    const persistentFeature = this.#binding.requireFeature(safeSpec.elementId);
    const identity = this.#binding.resolveFeature(persistentFeature);
    if (identity === undefined || identity.elementId !== safeSpec.elementId) {
      throw new ObjectDisposedError(`Element Feature is not bound: ${safeSpec.elementId}`);
    }
    const targetLayer = this.#layers.requireLayer(identity.layerId);
    const persistentSource = this.#layers.requireVectorSource(identity.layerId);
    if (!(targetLayer instanceof VectorLayer) || !(persistentSource instanceof VectorSource) || targetLayer.getSource() !== persistentSource) {
      throw new InvalidArgumentError(`Edit target must be a registered vector layer: ${identity.layerId}`);
    }

    const placement = placementFor(this.#map, persistentSource, safeSpec.controlPoints);
    const suppression = this.#binding.suppressProjection(safeSpec.elementId);
    let transientSource: EditSource | undefined;
    let transientLayer: EditLayer | undefined;
    let handle: OpenLayersEditInteractionHandle | undefined;
    try {
      transientSource = new VectorSource<EditFeature>({ wrapX: persistentSource.getWrapX() });
      const targetZIndex = targetLayer.getZIndex();
      transientLayer = new VectorLayer<EditSource>({
        source: transientSource,
        style: null,
        ...(targetZIndex === undefined ? {} : { zIndex: targetZIndex + 1 })
      });
      const interactionOwner: { handle?: OpenLayersEditInteractionHandle } = {};
      const interaction = new Interaction({ handleEvent: (event) => interactionOwner.handle?.handleEvent(event) ?? true });
      const ownedHandle = new OpenLayersEditInteractionHandle(
        this.#map,
        transientLayer,
        transientSource,
        interaction,
        this.#styles,
        safeSpec,
        placement,
        suppression,
        listener,
        this.#hitTolerance,
        this.#errorReporter
      );
      interactionOwner.handle = ownedHandle;
      handle = ownedHandle;

      this.#map.addLayer(transientLayer);
      if (!containsLayer(this.#map, transientLayer)) throw new InvalidArgumentError('OpenLayers did not attach the edit preview layer');
      this.#map.addInteraction(interaction);
      if (!containsInteraction(this.#map, interaction)) throw new InvalidArgumentError('OpenLayers did not attach the edit interaction');
      handle.handoffSuppression();
      handle.publish();
      return handle;
    } catch (error) {
      if (handle !== undefined) {
        try {
          handle.rollbackOpen();
        } catch (rollbackError) {
          report(this.#errorReporter, rollbackError, 'open-rollback');
          throw new AggregateError([error, rollbackError], 'Edit interaction open failed and rollback was incomplete');
        }
      } else {
        const rollbackFailures: unknown[] = [];
        capture(rollbackFailures, () => suppression.release());
        if (transientLayer !== undefined) capture(rollbackFailures, () => transientLayer?.dispose());
        if (transientSource !== undefined) capture(rollbackFailures, () => transientSource?.dispose());
        for (const rollbackFailure of rollbackFailures) report(this.#errorReporter, rollbackFailure, 'open-rollback');
        if (rollbackFailures.length > 0) {
          throw new AggregateError([error, ...rollbackFailures], 'Edit interaction open failed and rollback was incomplete');
        }
      }
      throw error;
    }
  }
}

class OpenLayersEditInteractionHandle implements EditInteractionHandle {
  readonly #map: OlMap;
  readonly #layer: EditLayer;
  readonly #interaction: Interaction;
  readonly #styles: StyleCompiler;
  readonly #spec: Readonly<EditInteractionSpec>;
  readonly #listener: (event: EditInteractionEvent) => void;
  readonly #hitTolerance: number;
  readonly #errorReporter: ErrorReporter;
  readonly #anchorByFeature = new WeakMap<EditFeature, EditInteractionAnchor>();
  readonly #retired = new Set<BundleCleanupProgress>();
  readonly placement: PreparedWorldEdit;
  #suppression: ProjectionSuppressionLease;
  #bundle: RenderBundle | undefined;
  #dragAnchor: EditControlAnchor | undefined;
  #published = false;
  #rendering = false;
  #closing = false;
  #destroyRunning = false;
  #deactivated = false;
  #layerRemoved = false;
  #interactionRemoved = false;
  #layerSourceCleared = false;
  #layerDisposed = false;
  #suppressionReleased = false;

  constructor(
    map: OlMap,
    layer: EditLayer,
    source: EditSource,
    interaction: Interaction,
    styles: StyleCompiler,
    spec: Readonly<EditInteractionSpec>,
    placement: PreparedWorldEdit,
    suppression: ProjectionSuppressionLease,
    listener: (event: EditInteractionEvent) => void,
    hitTolerance: number,
    errorReporter: ErrorReporter
  ) {
    this.#map = map;
    this.#layer = layer;
    this.#interaction = interaction;
    this.#styles = styles;
    this.#spec = spec;
    this.placement = placement;
    this.#suppression = suppression;
    this.#listener = listener;
    this.#hitTolerance = hitTolerance;
    this.#errorReporter = errorReporter;
    this.#bundle = { source, features: [], anchors: [], underlay: undefined };
  }

  handoffSuppression(): void {
    this.#suppression = this.#suppression.handoff();
  }

  publish(): void {
    this.#published = true;
  }

  handleEvent(event: MapBrowserEvent): boolean {
    if (!this.#published || this.#closing || this.#rendering) return true;
    try {
      const type = event.type;
      if (isPointerCancel(event)) {
        const anchor = this.#dragAnchor;
        if (anchor === undefined) return true;
        this.#dragAnchor = undefined;
        this.#emit({ type: 'move-cancel', anchor });
        return false;
      }

      if (type === 'pointerdown') {
        if (!isPrimary(event, true)) return true;
        const anchor = this.#anchorAt(event);
        if (anchor?.kind === 'control' && !isAlt(event)) {
          const coordinate = safeCoordinate(event.coordinate);
          if (coordinate === undefined) return true;
          this.#dragAnchor = anchor;
          this.#emit({ type: 'move-start', anchor, coordinate });
        }
        return anchor === undefined;
      }

      const dragAnchor = this.#dragAnchor;
      if (dragAnchor !== undefined && type === 'pointerdrag') {
        const coordinate = safeCoordinate(event.coordinate);
        if (!isPrimary(event, false) || coordinate === undefined) return false;
        this.#emit({ type: 'move', anchor: dragAnchor, coordinate });
        return false;
      }
      if (dragAnchor !== undefined && type === 'pointerup') {
        this.#dragAnchor = undefined;
        const coordinate = safeCoordinate(event.coordinate);
        if (!isPrimary(event, false) || coordinate === undefined) this.#emit({ type: 'move-cancel', anchor: dragAnchor });
        else this.#emit({ type: 'move-end', anchor: dragAnchor, coordinate });
        return false;
      }

      if (type !== 'click' || !isPrimary(event, true)) return true;
      const anchor = this.#anchorAt(event);
      if (anchor?.kind === 'insertion' && !isAlt(event)) {
        this.#emit({ type: 'insert', anchor });
        return false;
      }
      if (anchor?.kind === 'control' && anchor.removable && isAlt(event)) {
        this.#emit({ type: 'remove', anchor });
        return false;
      }
      return anchor === undefined;
    } catch (error) {
      report(this.#errorReporter, error, 'input');
      return true;
    }
  }

  render(state: Readonly<EditInteractionRenderState>): void {
    if (this.#closing) throw new ObjectDisposedError('Edit interaction has been destroyed');
    if (this.#rendering) throw new InvalidArgumentError('Edit interaction render is already in progress');
    this.#rendering = true;
    let prepared: RenderBundle | undefined;
    try {
      const current = this.#requireBundle();
      prepared = prepareRenderBundle(
        state,
        this.#styles,
        this.#spec.underlay ? current.underlay : undefined,
        this.#spec.underlay,
        current.source.getWrapX() === true
      );
      if (this.#closing) throw new ObjectDisposedError('Edit interaction was destroyed during render');
      const previousSource = this.#layer.getSource();
      try {
        this.#layer.setSource(prepared.source);
        if (this.#layer.getSource() !== prepared.source) throw new CapabilityError('OpenLayers did not install the edit render snapshot');
        if (this.#closing) throw new ObjectDisposedError('Edit interaction was destroyed during render');
      } catch (error) {
        if (!this.#closing) {
          try {
            this.#restoreSource(previousSource);
          } catch (rollbackError) {
            report(this.#errorReporter, rollbackError, 'render-source-rollback-failed');
          }
        }
        if (this.#closing) {
          this.#retireAfterClosing(prepared, 'render-closing-cleanup');
          prepared = undefined;
          throw error;
        }
        if (this.#layer.getSource() === previousSource) {
          this.#retire(prepared, 'render-rollback-cleanup');
          prepared = undefined;
        } else {
          this.#adopt(prepared);
          prepared = undefined;
          this.#closing = true;
          this.#published = false;
        }
        throw error;
      }
      this.#adopt(prepared);
      prepared = undefined;
      if (this.#closing) throw new ObjectDisposedError('Edit interaction was destroyed during render');
    } finally {
      if (prepared !== undefined && (this.#closing || this.#layer.getSource() !== prepared.source)) {
        if (this.#closing) this.#retireAfterClosing(prepared, 'render-closing-cleanup');
        else this.#retire(prepared, 'render-prepared-cleanup');
      }
      this.#rendering = false;
    }
  }

  destroy(): void {
    if (this.#destroyComplete() || this.#destroyRunning) return;
    this.#closing = true;
    this.#published = false;
    this.#dragAnchor = undefined;
    const failures: unknown[] = [];
    this.#destroyRunning = true;
    try {
      if (!this.#deactivated) {
        capture(failures, () => this.#interaction.setActive(false));
        inspect(
          failures,
          () => this.#interaction.getActive(),
          (active) => {
            if (!active) this.#deactivated = true;
          }
        );
      }
      if (!this.#layerRemoved) {
        capture(failures, () => this.#map.removeLayer(this.#layer));
        inspect(
          failures,
          () => containsLayer(this.#map, this.#layer),
          (attached) => {
            if (!attached) this.#layerRemoved = true;
          }
        );
      }
      if (!this.#interactionRemoved) {
        capture(failures, () => this.#map.removeInteraction(this.#interaction));
        inspect(
          failures,
          () => containsInteraction(this.#map, this.#interaction),
          (attached) => {
            if (!attached) {
              this.#interactionRemoved = true;
              this.#deactivated = true;
            }
          }
        );
      }
      const current = this.#bundle;
      if (current !== undefined) {
        this.#bundle = undefined;
        this.#enqueueRetirement(current);
      }
      this.#cleanupRetired(failures);
      if (!this.#layerSourceCleared) {
        capture(failures, () => this.#layer.setSource(null));
        inspect(
          failures,
          () => this.#layer.getSource(),
          (source) => {
            if (source === null) this.#layerSourceCleared = true;
          }
        );
      }
      if (!this.#layerDisposed) {
        const failureCount = failures.length;
        capture(failures, () => this.#layer.dispose());
        if (failures.length === failureCount) this.#layerDisposed = true;
      }
      if (!this.#suppressionReleased) {
        capture(failures, () => this.#suppression.release());
        inspect(
          failures,
          () => this.#suppression.active,
          (active) => {
            if (!active) this.#suppressionReleased = true;
          }
        );
      }
    } finally {
      this.#destroyRunning = false;
    }

    for (const failure of failures) report(this.#errorReporter, failure, 'destroy');
    if (failures.length > 0) throw failures[0];
  }

  rollbackOpen(): void {
    this.#closing = true;
    this.#published = false;
    let firstFailure: unknown;
    for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
      try {
        this.destroy();
        if (this.#destroyComplete()) return;
      } catch (error) {
        firstFailure ??= error;
        report(this.#errorReporter, error, 'open-rollback-retry');
      }
    }

    if (containsInteraction(this.#map, this.#interaction)) {
      attempt(
        this.#errorReporter,
        () => {
          this.#map.getInteractions().remove(this.#interaction);
          this.#interaction.setMap(null);
        },
        'open-rollback-interaction-collection'
      );
      if (!containsInteraction(this.#map, this.#interaction)) {
        this.#interactionRemoved = true;
        this.#deactivated = true;
      }
    }
    if (containsLayer(this.#map, this.#layer)) {
      attempt(this.#errorReporter, () => this.#map.getLayers().remove(this.#layer), 'open-rollback-layer-collection');
      if (!containsLayer(this.#map, this.#layer)) this.#layerRemoved = true;
    }
    try {
      this.destroy();
    } catch (error) {
      firstFailure ??= error;
    }
    if (!this.#destroyComplete()) throw firstFailure ?? new CapabilityError('Edit interaction open rollback did not complete');
  }

  #restoreSource(previousSource: EditSource | null): void {
    if (this.#closing || this.#layer.getSource() === previousSource) return;
    let firstFailure: unknown;
    for (let attemptIndex = 0; attemptIndex < 2 && !this.#closing && this.#layer.getSource() !== previousSource; attemptIndex += 1) {
      try {
        this.#layer.setSource(previousSource);
      } catch (error) {
        firstFailure ??= error;
        report(this.#errorReporter, error, 'render-source-rollback');
      }
    }
    if (this.#closing) return;
    if (this.#layer.getSource() !== previousSource) {
      throw firstFailure ?? new CapabilityError('Edit render source rollback did not restore the previous snapshot');
    }
  }

  #adopt(bundle: RenderBundle): void {
    if (this.#closing) throw new ObjectDisposedError('Edit interaction was destroyed during render');
    const previous = this.#bundle;
    this.#bundle = bundle;
    for (const [feature, anchor] of bundle.anchors) this.#anchorByFeature.set(feature, anchor);
    if (previous !== undefined) this.#retire(previous, 'render-retire');
  }

  #requireBundle(): RenderBundle {
    const bundle = this.#bundle;
    if (bundle === undefined) throw new ObjectDisposedError('Edit interaction has been destroyed');
    return bundle;
  }

  #anchorAt(event: MapBrowserEvent): EditInteractionAnchor | undefined {
    const pixel = safePixel(event.pixel);
    if (pixel === undefined) return undefined;
    return this.#map.forEachFeatureAtPixel(
      [...pixel],
      (feature) => (feature instanceof Feature ? this.#anchorByFeature.get(feature as EditFeature) : undefined),
      {
        layerFilter: (layer) => layer === this.#layer,
        hitTolerance: this.#hitTolerance,
        checkWrapped: true
      }
    );
  }

  #emit(event: EditInteractionEvent): void {
    try {
      this.#listener(freezeEvent(event));
    } catch (error) {
      report(this.#errorReporter, error, `listener:${event.type}`);
    }
  }

  #retire(bundle: RenderBundle, operation: string): void {
    this.#enqueueRetirement(bundle);
    const failures: unknown[] = [];
    this.#cleanupRetired(failures);
    for (const failure of failures) report(this.#errorReporter, failure, operation);
  }

  #retireAfterClosing(bundle: RenderBundle, operation: string): void {
    if (this.#layer.getSource() !== null) this.#layerSourceCleared = false;
    this.#retire(bundle, operation);
  }

  #enqueueRetirement(bundle: RenderBundle): void {
    this.#retired.add({
      source: bundle.source,
      sourceCleared: false,
      features: new Set(
        bundle.features.map((feature) => ({
          feature,
          geometryCleared: false,
          styleCleared: false,
          disposed: false
        }))
      )
    });
  }

  #cleanupRetired(failures: unknown[]): void {
    for (const progress of [...this.#retired]) {
      this.#cleanupRetirement(progress, failures);
      if (progress.source === undefined && progress.features.size === 0) this.#retired.delete(progress);
    }
  }

  #cleanupRetirement(progress: BundleCleanupProgress, failures: unknown[]): void {
    const source = progress.source;
    if (source !== undefined && !progress.sourceCleared) {
      const failureCount = failures.length;
      capture(failures, () => source.clear(true));
      inspect(
        failures,
        () => source.getFeatures().length === 0,
        (cleared) => {
          progress.sourceCleared = cleared;
        }
      );
      if (!progress.sourceCleared && failures.length === failureCount) {
        failures.push(new CapabilityError('OpenLayers did not clear an edit preview source'));
      }
    }

    if (!progress.sourceCleared) return;
    for (const featureProgress of [...progress.features]) {
      this.#cleanupRetiredFeature(featureProgress, failures);
      if (featureProgress.geometryCleared && featureProgress.styleCleared && featureProgress.disposed) progress.features.delete(featureProgress);
    }

    if (source !== undefined) {
      const failureCount = failures.length;
      capture(failures, () => source.dispose());
      if (failures.length === failureCount) progress.source = undefined;
    }
  }

  #cleanupRetiredFeature(progress: FeatureCleanupProgress, failures: unknown[]): void {
    const feature = progress.feature;
    if (!progress.geometryCleared) {
      const failureCount = failures.length;
      capture(failures, () => feature.setGeometry(undefined));
      inspect(
        failures,
        () => feature.getGeometry() === undefined,
        (cleared) => {
          progress.geometryCleared = cleared;
        }
      );
      if (!progress.geometryCleared && failures.length === failureCount) {
        failures.push(new CapabilityError('OpenLayers did not clear an edit preview geometry'));
      }
    }
    if (!progress.styleCleared) {
      const failureCount = failures.length;
      capture(failures, () => feature.setStyle(undefined));
      inspect(
        failures,
        () => feature.getStyle() === undefined,
        (cleared) => {
          progress.styleCleared = cleared;
        }
      );
      if (!progress.styleCleared && failures.length === failureCount) {
        failures.push(new CapabilityError('OpenLayers did not clear an edit preview style'));
      }
    }
    if (!progress.disposed) {
      const failureCount = failures.length;
      capture(failures, () => feature.dispose());
      progress.disposed = failures.length === failureCount;
    }
  }

  #destroyComplete(): boolean {
    return (
      this.#deactivated &&
      this.#layerRemoved &&
      this.#interactionRemoved &&
      this.#layerSourceCleared &&
      this.#bundle === undefined &&
      this.#retired.size === 0 &&
      this.#layerDisposed &&
      this.#suppressionReleased
    );
  }
}

function validateSpec(spec: Readonly<EditInteractionSpec>): Readonly<EditInteractionSpec> {
  if (spec === null || typeof spec !== 'object') throw new InvalidArgumentError('Edit interaction spec must be an object');
  if (typeof spec.elementId !== 'string' || spec.elementId.trim().length === 0) {
    throw new InvalidArgumentError('Edit interaction elementId must be a non-empty string');
  }
  if (!Array.isArray(spec.controlPoints)) throw new InvalidArgumentError('Edit interaction controlPoints must be an array');
  if (typeof spec.underlay !== 'boolean') throw new InvalidArgumentError('Edit interaction underlay must be boolean');
  return Object.freeze({
    elementId: spec.elementId,
    controlPoints: Object.freeze(spec.controlPoints.map((coordinate) => Object.freeze(copyCoordinate(coordinate)))),
    underlay: spec.underlay
  });
}

function placementFor(map: OlMap, source: EditSource, controlPoints: readonly Coordinate[]): PreparedWorldEdit {
  const projection = getUserProjection() ?? source.getProjection() ?? map.getView().getProjection();
  const world = horizontalWorldFromExtent(projection.getExtent(), source.getWrapX() === true && projection.canWrapX());
  const center = map.getView().getCenter();
  const referenceX = center !== undefined && Number.isFinite(center[0]) ? center[0] : controlPoints[0]?.[0];
  return prepareWorldEdit(controlPoints, { ...(world === undefined ? {} : { world }), ...(referenceX === undefined ? {} : { referenceX }) });
}

function prepareRenderBundle(
  state: Readonly<EditInteractionRenderState>,
  styles: StyleCompiler,
  existingUnderlay: EditFeature | undefined,
  includeUnderlay: boolean,
  wrapX: boolean
): RenderBundle {
  if (state === null || typeof state !== 'object') throw new InvalidArgumentError('Edit render state must be an object');
  if (!Array.isArray(state.anchors)) throw new InvalidArgumentError('Edit render anchors must be an array');
  const compiled = styles.compile(state.style);
  const preview = new Feature<Geometry>(createGeometry(state.geometry));
  preview.setStyle(compiled);
  const underlay = includeUnderlay
    ? existingUnderlay === undefined
      ? createStyledFeature(state.geometry, compiled)
      : cloneStyledFeature(existingUnderlay)
    : undefined;
  const anchors: Array<readonly [EditFeature, EditInteractionAnchor]> = [];
  for (const input of state.anchors) {
    const anchor = snapshotAnchor(input);
    const feature = new Feature<Geometry>(new Point([...anchor.coordinate]));
    feature.setStyle(anchor.kind === 'control' ? controlAnchorStyle : insertionAnchorStyle);
    anchors.push([feature, anchor]);
  }
  const features = Object.freeze([...(underlay === undefined ? [] : [underlay]), preview, ...anchors.map(([feature]) => feature)]);
  const source = new VectorSource<EditFeature>({ features: [...features], wrapX });
  return { source, features, anchors: Object.freeze(anchors), underlay };
}

function createStyledFeature(geometry: RenderGeometryState, style: ReturnType<StyleCompiler['compile']>): EditFeature {
  const feature = new Feature<Geometry>(createGeometry(geometry));
  feature.setStyle(style);
  return feature;
}

function cloneStyledFeature(source: EditFeature): EditFeature {
  const geometry = source.getGeometry();
  if (geometry === undefined) throw new ObjectDisposedError('Edit underlay geometry is unavailable');
  const feature = new Feature<Geometry>(geometry.clone());
  feature.setStyle(source.getStyle());
  return feature;
}

function createGeometry(state: RenderGeometryState): Geometry {
  if (state.type === 'point') return new Point(copyOlCoordinate(state.coordinates));
  if (state.type === 'polyline') return new LineString(state.coordinates.map(copyOlCoordinate));
  if (state.type === 'polygon') return new Polygon(state.coordinates.map((ring) => ring.map(copyOlCoordinate)));
  if (!Number.isFinite(state.radius) || state.radius < 0) throw new InvalidArgumentError('Edit preview circle radius must be a finite non-negative number');
  return new Circle(copyOlCoordinate(state.center), state.radius);
}

function snapshotAnchor(anchor: EditInteractionAnchor): EditInteractionAnchor {
  if (anchor === null || typeof anchor !== 'object') throw new InvalidArgumentError('Edit anchor must be an object');
  if (!Number.isSafeInteger(anchor.index) || anchor.index < 0) throw new InvalidArgumentError('Edit anchor index must be a non-negative safe integer');
  const coordinate = Object.freeze(copyCoordinate(anchor.coordinate));
  if (anchor.kind === 'insertion') return Object.freeze({ kind: 'insertion', index: anchor.index, coordinate });
  if (anchor.kind !== 'control' || typeof anchor.removable !== 'boolean') throw new InvalidArgumentError('Unknown edit anchor kind');
  if (anchor.role !== undefined && typeof anchor.role !== 'string') throw new InvalidArgumentError('Edit control anchor role must be a string');
  return Object.freeze({
    kind: 'control',
    index: anchor.index,
    coordinate,
    ...(anchor.role === undefined ? {} : { role: anchor.role }),
    removable: anchor.removable
  });
}

function freezeEvent(event: EditInteractionEvent): EditInteractionEvent {
  const anchor = snapshotAnchor(event.anchor);
  if (event.type === 'insert') return Object.freeze({ type: event.type, anchor: anchor as EditInsertionAnchor });
  if (event.type === 'remove' || event.type === 'move-cancel') {
    return Object.freeze({ type: event.type, anchor: anchor as EditControlAnchor });
  }
  const coordinate = Object.freeze(copyCoordinate(event.coordinate));
  if (event.type === 'move-start') return Object.freeze({ type: event.type, anchor: anchor as EditControlAnchor, coordinate });
  if (event.type === 'move') return Object.freeze({ type: event.type, anchor: anchor as EditControlAnchor, coordinate });
  return Object.freeze({ type: event.type, anchor: anchor as EditControlAnchor, coordinate });
}

function copyCoordinate(value: Coordinate): Coordinate {
  const coordinate = safeCoordinate(value);
  if (coordinate === undefined) throw new InvalidArgumentError('Edit coordinate must contain two or three finite numbers');
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

function copyOlCoordinate(value: Coordinate): number[] {
  return [...copyCoordinate(value)];
}

function safeCoordinate(value: unknown): Coordinate | undefined {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3) || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    return undefined;
  }
  return Object.freeze([...value]) as Coordinate;
}

function safePixel(value: unknown): readonly [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) return undefined;
  return Object.freeze([value[0], value[1]]) as readonly [number, number];
}

function containsLayer(map: OlMap, layer: EditLayer): boolean {
  return map.getLayers().getArray().includes(layer);
}

function containsInteraction(map: OlMap, interaction: Interaction): boolean {
  return map.getInteractions().getArray().includes(interaction);
}

function isPrimary(event: MapBrowserEvent, requireLeftButton: boolean): boolean {
  if (field(event.originalEvent, 'isPrimary') === false) return false;
  const button = field(event.originalEvent, 'button');
  return !requireLeftButton || typeof button !== 'number' || button === 0;
}

function isAlt(event: MapBrowserEvent): boolean {
  return field(event.originalEvent, 'altKey') === true;
}

function isPointerCancel(event: MapBrowserEvent): boolean {
  return event.type === 'pointercancel' || field(event.originalEvent, 'type') === 'pointercancel';
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

function capture(failures: unknown[], work: () => void): void {
  try {
    work();
  } catch (error) {
    failures.push(error);
  }
}

function inspect<T>(failures: unknown[], read: () => T, accept: (value: T) => void): void {
  try {
    accept(read());
  } catch (error) {
    failures.push(error);
  }
}

function attempt(errorReporter: ErrorReporter, work: () => void, operation: string): void {
  try {
    work();
  } catch (error) {
    report(errorReporter, error, operation);
  }
}

function report(errorReporter: ErrorReporter, error: unknown, operation: string): void {
  try {
    const result = (errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
      source: 'EditInteractionAdapter',
      operation
    });
    void Promise.resolve(result).catch(() => undefined);
  } catch {
    // 错误报告器自身失败时不能破坏原生编辑资源的所有权。
  }
}
