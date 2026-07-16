import type Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import type Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import Interaction from 'ol/interaction/Interaction.js';
import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import type { EventsKey } from 'ol/events.js';
import { unByKey } from 'ol/Observable.js';
import { getUserProjection } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import type { Coordinate } from '../../../core/common/types.js';
import { horizontalWorldFromExtent, horizontalWorldIndex, type HorizontalWorld } from '../../../core/common/worldWrap.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import type {
  DrawInteractionEvent,
  DrawInteractionHandle,
  DrawInteractionPort,
  DrawInteractionRenderState,
  DrawInteractionSpec
} from '../../../core/ports/DrawInteractionPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../../core/ports/ErrorReporter.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';
import type { LayerAdapter } from '../LayerAdapter.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';

type PreviewFeature = Feature<Geometry>;
type PreviewSource = VectorSource<PreviewFeature>;
type PreviewLayer = VectorLayer<PreviewSource>;
type CompiledPreviewStyle = ReturnType<StyleCompiler['compile']>;

/** 写入 OpenLayers 前已经完成校验、复制和样式编译的预览快照。 */
interface PreparedPreview {
  readonly geometry: RenderGeometryState;
  readonly styleIdentity: object;
  readonly compiledStyle: CompiledPreviewStyle;
}

/** 单个预览 Feature 的分步清理进度。 */
interface FeatureCleanupProgress {
  readonly feature: PreviewFeature;
  sourceDetached: boolean;
  geometryCleared: boolean;
  styleCleared: boolean;
  disposed: boolean;
}

/** 可取消的浏览器动画帧；保留调度时的取消函数，确保测试和销毁使用同一引用。 */
interface AnimationFrameRegistration {
  id: number | undefined;
  readonly cancel: (id: number) => void;
}

/**
 * OpenLayers 绘制交互适配器的可选配置。
 *
 * @internal
 */
export interface DrawInteractionAdapterOptions {
  /**
   * 接收监听器异常和原生资源清理异常的报告器；未提供时使用库内默认报告器。
   */
  readonly errorReporter?: ErrorReporter;
}

/**
 * 将语义绘制端口映射为一个 OpenLayers `Interaction` 和一个临时预览 `Feature`。
 *
 * @remarks
 * 每次渲染均发布完整的 Feature 快照，避免同步 OpenLayers 监听器观察到几何与样式不一致的中间态。
 *
 * @internal
 */
export class DrawInteractionAdapter implements DrawInteractionPort {
  readonly #map: OlMap;
  readonly #layers: LayerAdapter;
  readonly #styles: StyleCompiler;
  readonly #errorReporter: ErrorReporter;

  /**
   * 创建绘制交互适配器。
   *
   * @param map 承载交互和预览图层的 OpenLayers 地图。
   * @param layers 解析目标图层及其矢量 Source 的适配器。
   * @param styles 用于把语义样式编译为 OpenLayers 样式的编译器。
   * @param options 错误报告等可选配置。
   */
  constructor(map: OlMap, layers: LayerAdapter, styles: StyleCompiler, options: DrawInteractionAdapterOptions = {}) {
    this.#map = map;
    this.#layers = layers;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
  }

  /**
   * 安装一个绘制交互，并返回其完整生命周期句柄。
   *
   * 在方法成功返回前不会向 `listener` 发布输入事件；安装失败时会回滚已创建的原生资源。
   *
   * @param spec 目标图层、输入模式和自由绘制能力配置。
   * @param listener 接收冻结后的语义绘制事件的监听器。
   * @returns 拥有交互、预览和清理职责的绘制句柄。
   * @throws {@link InvalidArgumentError} 当配置、监听器或目标图层不符合契约时抛出。
   * @throws {@link AggregateError} 当安装失败且原生资源回滚不完整时抛出。
   */
  open(spec: Readonly<DrawInteractionSpec>, listener: (event: DrawInteractionEvent) => void): DrawInteractionHandle {
    const safeSpec = validateSpec(spec);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Draw interaction listener must be a function');
    const layer = this.#layers.requireLayer(safeSpec.layerId);
    const source = this.#layers.requireVectorSource(safeSpec.layerId);
    if (!(layer instanceof VectorLayer) || !(source instanceof VectorSource) || layer.getSource() !== source) {
      throw new InvalidArgumentError(`Draw target must be a registered vector layer: ${safeSpec.layerId}`);
    }
    const layerCollection = findLayerCollection(this.#map.getLayers(), layer);
    if (layerCollection === undefined) throw new InvalidArgumentError(`Draw target layer is not attached to the map: ${safeSpec.layerId}`);

    let previewSource: PreviewSource | undefined;
    let previewLayer: PreviewLayer | undefined;
    let handle: OpenLayersDrawInteractionHandle | undefined;
    try {
      previewSource = new VectorSource<PreviewFeature>({ wrapX: source.getWrapX() });
      previewLayer = new VectorLayer<PreviewSource>({
        source: previewSource,
        style: null
      });
      const routing: { handle?: OpenLayersDrawInteractionHandle } = {};
      const interaction = new Interaction({ handleEvent: (event) => routing.handle?.handleEvent(event) ?? true });
      handle = new OpenLayersDrawInteractionHandle(
        this.#map,
        layerCollection,
        layer,
        previewLayer,
        previewSource,
        this.#styles,
        interaction,
        safeSpec,
        listener,
        worldFor(this.#map, source),
        this.#errorReporter
      );
      routing.handle = handle;

      insertLayerAfter(layerCollection, layer, previewLayer);
      const attachedTargetIndex = layerCollection.getArray().indexOf(layer);
      if (attachedTargetIndex < 0 || layerCollection.getArray()[attachedTargetIndex + 1] !== previewLayer) {
        throw new InvalidArgumentError('OpenLayers did not attach the draw preview layer immediately after its target layer');
      }
      this.#map.addInteraction(interaction);
      if (!containsInteraction(this.#map, interaction)) throw new InvalidArgumentError('OpenLayers did not attach the draw interaction');
      handle.publish();
      return handle;
    } catch (error) {
      if (handle !== undefined) {
        try {
          handle.rollbackOpen();
        } catch (rollbackError) {
          report(this.#errorReporter, rollbackError, 'open-rollback');
          throw new AggregateError([error, rollbackError], 'Draw interaction open failed and rollback was incomplete');
        }
      } else {
        const rollbackFailures: unknown[] = [];
        if (previewLayer !== undefined) {
          capture(rollbackFailures, () => previewLayer?.setSource(null));
          capture(rollbackFailures, () => previewLayer?.dispose());
        }
        if (previewSource !== undefined) capture(rollbackFailures, () => previewSource?.dispose());
        for (const rollbackFailure of rollbackFailures) report(this.#errorReporter, rollbackFailure, 'open-rollback');
        if (rollbackFailures.length > 0) {
          throw new AggregateError([error, ...rollbackFailures], 'Draw interaction open failed and rollback was incomplete');
        }
      }
      throw error;
    }
  }
}

/**
 * 持有一次 OpenLayers 绘制交互的所有原生资源及重试进度。
 *
 * @internal
 */
class OpenLayersDrawInteractionHandle implements DrawInteractionHandle {
  readonly #map: OlMap;
  /** 目标业务图层直属的图层集合；临时预览必须在该集合中与目标层保持相邻。 */
  readonly #layerCollection: Collection<BaseLayer>;
  /** 提供临时层展示属性的业务目标图层。 */
  readonly #targetLayer: VectorLayer;
  /** 隔离绘制预览、避免使业务图层逐帧失效的临时图层。 */
  readonly #layer: PreviewLayer;
  /** 存放唯一绘制预览的临时 Source。 */
  readonly #source: PreviewSource;
  readonly #styles: StyleCompiler;
  readonly #interaction: Interaction;
  readonly #spec: Readonly<DrawInteractionSpec>;
  readonly #listener: (event: DrawInteractionEvent) => void;
  readonly #errorReporter: ErrorReporter;
  /**
   * 当前交互使用的水平世界范围快照；目标投影不支持水平环绕时为 `undefined`。
   */
  readonly world: HorizontalWorld | undefined;
  #preview: PreviewFeature | undefined;
  /** 当前 Feature 对应的完整语义快照，用于同类型原位更新和异常回滚。 */
  #previewState: PreparedPreview | undefined;
  /** 按稳定语义 style 身份缓存编译结果。 */
  readonly #compiledStyles = new WeakMap<object, CompiledPreviewStyle>();
  #published = false;
  #closing = false;
  #deactivated = false;
  #interactionRemoved = false;
  #layerRemoved = false;
  #layerSourceCleared = false;
  #sourceDisposed = false;
  #layerDisposed = false;
  /** 目标图层展示属性监听键；销毁后清空。 */
  #targetPresentationKey: EventsKey | undefined;
  #destroyRunning = false;
  #freehandActive = false;
  /** 当前动画帧内尚未按顺序发布的自由绘制采样。 */
  readonly #pendingFreehandSamples: Coordinate[] = [];
  /** 当前自由绘制批次对应的浏览器动画帧。 */
  #freehandFrame: AnimationFrameRegistration | undefined;
  /** 自由绘制结束会产生浏览器 click；该标志避免把它重复计为输入点。 */
  #suppressNextClick = false;
  #rendering = false;
  /** 等待按顺序提交的预览快照。 */
  readonly #renderQueue: Array<PreparedPreview | undefined> = [];
  /** 下一个待处理队列索引，避免 Array.shift 的线性搬移。 */
  #renderQueueHead = 0;
  /** 等待继续清理的旧预览 Feature。 */
  readonly #retired = new Map<PreviewFeature, FeatureCleanupProgress>();
  readonly #released = new WeakSet<PreviewFeature>();

  /** 建立尚未发布的资源句柄；调用 `publish()` 前不会向 Core 派发输入。 */
  constructor(
    map: OlMap,
    layerCollection: Collection<BaseLayer>,
    targetLayer: VectorLayer,
    layer: PreviewLayer,
    source: PreviewSource,
    styles: StyleCompiler,
    interaction: Interaction,
    spec: Readonly<DrawInteractionSpec>,
    listener: (event: DrawInteractionEvent) => void,
    world: HorizontalWorld | undefined,
    errorReporter: ErrorReporter
  ) {
    this.#map = map;
    this.#layerCollection = layerCollection;
    this.#targetLayer = targetLayer;
    this.#layer = layer;
    this.#source = source;
    this.#styles = styles;
    this.#interaction = interaction;
    this.#spec = spec;
    this.#listener = listener;
    this.world = world;
    this.#errorReporter = errorReporter;
    syncPreviewLayerPresentation(this.#targetLayer, this.#layer);
    this.#targetPresentationKey = this.#targetLayer.on('propertychange', () => {
      try {
        syncPreviewLayerPresentation(this.#targetLayer, this.#layer);
      } catch (error) {
        report(this.#errorReporter, error, 'target-layer-presentation');
      }
    });
  }

  /** 完成安装交接，允许后续原生输入向 Core 发布。 */
  publish(): void {
    this.#published = true;
  }

  /** 把地图浏览器事件转换成绘制语义；返回 `false` 表示本交互已消费事件。 */
  handleEvent(event: MapBrowserEvent): boolean {
    if (!this.#published || this.#closing) return true;
    const type = event.type;
    const coordinate = safeCoordinate(event.coordinate);

    if (type === 'dblclick') return false;

    if (type === 'pointerdown') {
      this.#suppressNextClick = false;
      if (this.#spec.freehand && isShift(event) && isPrimary(event, true) && coordinate !== undefined) {
        this.#discardPendingFreehandSamples();
        this.#freehandActive = true;
        this.#emit({ type: 'freehand-start', coordinate });
        return false;
      }
      return true;
    }

    if (this.#freehandActive) {
      if (type === 'pointerdrag' && isPrimary(event, false) && coordinate !== undefined) {
        this.#queueFreehandSample(coordinate);
        return false;
      }
      if (type === 'pointerup' && isPrimary(event, false)) {
        if (isPointerCancel(event) || coordinate === undefined) {
          this.#freehandActive = false;
          this.#discardPendingFreehandSamples();
          this.#suppressNextClick = true;
          this.#emit({ type: 'freehand-cancel' });
        } else {
          this.#flushPendingFreehandSamples();
          if (this.#closing) return false;
          this.#freehandActive = false;
          this.#suppressNextClick = true;
          this.#emit({ type: 'freehand-complete', coordinate });
        }
        return false;
      }
      if (type === 'pointercancel') {
        this.#freehandActive = false;
        this.#discardPendingFreehandSamples();
        this.#suppressNextClick = true;
        this.#emit({ type: 'freehand-cancel' });
        return false;
      }
      if (type === 'pointermove') return true;
    }

    if (type === 'pointermove' && isPrimary(event, false) && coordinate !== undefined) {
      this.#emit({ type: 'move', coordinate });
    } else if (type === 'click') {
      if (this.#suppressNextClick) this.#suppressNextClick = false;
      else if (isPrimary(event, true) && coordinate !== undefined) this.#emit({ type: 'click', coordinate });
    }
    return true;
  }

  /** 保留同一帧内全部 pointerdrag 采样，并在 rAF 不可用时退化为同步单点批次。 */
  #queueFreehandSample(coordinate: Coordinate): void {
    this.#pendingFreehandSamples.push(coordinate);
    if (this.#freehandFrame !== undefined) return;
    const schedule = globalThis.requestAnimationFrame;
    const cancel = globalThis.cancelAnimationFrame;
    if (typeof schedule !== 'function' || typeof cancel !== 'function') {
      this.#flushPendingFreehandSamples();
      return;
    }
    const registration: AnimationFrameRegistration = {
      id: undefined,
      cancel: cancel.bind(globalThis)
    };
    this.#freehandFrame = registration;
    registration.id = schedule(() => {
      if (this.#freehandFrame !== registration) return;
      this.#freehandFrame = undefined;
      this.#flushPendingFreehandSamples();
    });
  }

  /** 取消待执行帧并按采样顺序一次发布给 Core。 */
  #flushPendingFreehandSamples(): void {
    const frame = this.#freehandFrame;
    this.#freehandFrame = undefined;
    if (frame?.id !== undefined) frame.cancel(frame.id);
    if (this.#pendingFreehandSamples.length === 0) return;
    const coordinates = this.#pendingFreehandSamples.splice(0);
    if (this.#closing || !this.#published || !this.#freehandActive) return;
    this.#emit({ type: 'freehand-samples', coordinates });
  }

  /** 取消待执行帧并丢弃尚未发布的采样。 */
  #discardPendingFreehandSamples(): void {
    const frame = this.#freehandFrame;
    this.#freehandFrame = undefined;
    if (frame?.id !== undefined) frame.cancel(frame.id);
    this.#pendingFreehandSamples.length = 0;
  }

  /**
   * 原子替换完整预览；同步监听器引发的重入请求排队处理，`undefined` 表示清空。
   * 替换和回滚均失败时抛出 `AggregateError`，避免暴露归属不明的 Feature。
   */
  render(state: Readonly<DrawInteractionRenderState> | undefined): void {
    if (this.#closing) throw new ObjectDisposedError('Draw interaction has been destroyed');
    this.#renderQueue.push(state === undefined ? undefined : this.#preparePreview(state));
    if (this.#rendering) return;

    this.#rendering = true;
    let failed = false;
    let firstFailure: unknown;
    try {
      while (this.#renderQueueHead < this.#renderQueue.length) {
        const prepared = this.#renderQueue[this.#renderQueueHead++];
        if (this.#closing) continue;
        try {
          this.#renderPrepared(prepared);
          if (this.#closing) throw new ObjectDisposedError('Draw interaction was destroyed during render');
        } catch (error) {
          if (!failed) {
            failed = true;
            firstFailure = error;
          }
        }
      }
    } finally {
      this.#rendering = false;
      this.#renderQueue.length = 0;
      this.#renderQueueHead = 0;
    }
    if (failed) throw firstFailure;
  }

  /** 复制 Geometry，并按稳定的 StyleSpec 身份复用编译结果。 */
  #preparePreview(state: Readonly<DrawInteractionRenderState>): PreparedPreview {
    const styleIdentity = state.style as object;
    let compiledStyle = this.#compiledStyles.get(styleIdentity);
    if (compiledStyle === undefined) {
      compiledStyle = this.#styles.compile(state.style);
      this.#compiledStyles.set(styleIdentity, compiledStyle);
    }
    return Object.freeze({ geometry: copyRenderGeometryState(state.geometry, this.world), styleIdentity, compiledStyle });
  }

  /** 应用已准备的快照；优先复用同类型、同样式的现有 Feature。 */
  #renderPrepared(prepared: PreparedPreview | undefined): void {
    if (prepared === undefined) {
      this.#clearPreviewAtomically();
      return;
    }
    const current = this.#preview;
    if (current === undefined) {
      this.#addInitialPreview(createPreviewFeature(prepared), prepared);
      return;
    }
    const previous = this.#previewState;
    if (previous !== undefined && previous.styleIdentity === prepared.styleIdentity && previous.geometry.type === prepared.geometry.type) {
      this.#updatePreviewGeometryAtomically(current, previous, prepared);
      return;
    }
    this.#replacePreviewAtomically(current, createPreviewFeature(prepared), prepared);
  }

  /**
   * 停止输入并分步释放全部原生资源。单次失败不会阻断其余步骤，后续调用只重试未完成部分。
   */
  destroy(): void {
    if (this.#destroyComplete() || this.#destroyRunning) return;
    this.#closing = true;
    this.#published = false;
    this.#freehandActive = false;
    this.#discardPendingFreehandSamples();
    this.#suppressNextClick = false;
    const failures: unknown[] = [];
    this.#destroyRunning = true;
    try {
      const targetPresentationKey = this.#targetPresentationKey;
      if (targetPresentationKey !== undefined) {
        const failureCount = failures.length;
        capture(failures, () => unByKey(targetPresentationKey));
        if (failures.length === failureCount && this.#targetPresentationKey === targetPresentationKey) this.#targetPresentationKey = undefined;
      }
      if (!this.#deactivated) {
        const failureCount = failures.length;
        capture(failures, () => this.#interaction.setActive(false));
        inspect(
          failures,
          () => this.#interaction.getActive(),
          (active) => {
            if (!active) this.#deactivated = true;
          }
        );
        if (!this.#deactivated && failures.length === failureCount) {
          failures.push(new CapabilityError('OpenLayers did not deactivate the draw interaction'));
        }
      }

      const preview = this.#preview;
      if (preview !== undefined) {
        this.#preview = undefined;
        this.#previewState = undefined;
        this.#enqueueRetirement(preview, false);
      }
      this.#renderQueue.length = 0;
      this.#renderQueueHead = 0;
      this.#cleanupRetired(failures);

      if (!this.#layerRemoved) {
        const failureCount = failures.length;
        capture(failures, () => this.#layerCollection.remove(this.#layer));
        inspect(
          failures,
          () => containsLayer(this.#layerCollection, this.#layer),
          (attached) => {
            if (!attached) this.#layerRemoved = true;
          }
        );
        if (!this.#layerRemoved && failures.length === failureCount) {
          failures.push(new CapabilityError('OpenLayers did not remove the draw preview layer'));
        }
      }

      if (!this.#interactionRemoved) {
        const failureCount = failures.length;
        capture(failures, () => this.#map.removeInteraction(this.#interaction));
        inspect(
          failures,
          () => containsInteraction(this.#map, this.#interaction),
          (attached) => {
            if (!attached) this.#interactionRemoved = true;
          }
        );
        if (!this.#interactionRemoved && failures.length === failureCount) {
          failures.push(new CapabilityError('OpenLayers did not remove the draw interaction'));
        }
      }

      if (!this.#layerSourceCleared) {
        const failureCount = failures.length;
        capture(failures, () => this.#layer.setSource(null));
        inspect(
          failures,
          () => this.#layer.getSource(),
          (current) => {
            if (current === null) this.#layerSourceCleared = true;
          }
        );
        if (!this.#layerSourceCleared && failures.length === failureCount) {
          failures.push(new CapabilityError('OpenLayers did not clear the draw preview layer source'));
        }
      }

      if (this.#retired.size === 0 && this.#layerSourceCleared && !this.#sourceDisposed) {
        const failureCount = failures.length;
        capture(failures, () => this.#source.dispose());
        if (failures.length === failureCount) this.#sourceDisposed = true;
      }
      if (this.#layerRemoved && this.#layerSourceCleared && !this.#layerDisposed) {
        const failureCount = failures.length;
        capture(failures, () => this.#layer.dispose());
        if (failures.length === failureCount) this.#layerDisposed = true;
      }
    } finally {
      this.#destroyRunning = false;
    }

    for (const failure of failures) report(this.#errorReporter, failure, 'destroy');
    if (failures.length > 0) throw failures[0];
  }

  /** 回滚失败的安装；有限次重试后仍有资源残留则抛出 `CapabilityError`。 */
  rollbackOpen(): void {
    this.#closing = true;
    this.#published = false;
    let firstFailure: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        this.destroy();
        if (this.#destroyComplete()) return;
        firstFailure ??= new CapabilityError('Draw interaction open rollback did not complete');
      } catch (error) {
        firstFailure ??= error;
        report(this.#errorReporter, error, 'open-rollback-retry');
      }
    }

    for (let attempt = 0; attempt < 2 && containsInteraction(this.#map, this.#interaction); attempt += 1) {
      try {
        this.#map.getInteractions().remove(this.#interaction);
      } catch (error) {
        firstFailure ??= error;
        report(this.#errorReporter, error, 'open-rollback-collection-remove');
      }
    }
    for (let attempt = 0; attempt < 2 && containsLayer(this.#layerCollection, this.#layer); attempt += 1) {
      try {
        this.#layerCollection.remove(this.#layer);
      } catch (error) {
        firstFailure ??= error;
        report(this.#errorReporter, error, 'open-rollback-layer-collection-remove');
      }
    }
    if (!containsInteraction(this.#map, this.#interaction)) this.#interactionRemoved = true;
    if (!containsLayer(this.#layerCollection, this.#layer)) this.#layerRemoved = true;
    if (this.#interactionRemoved && this.#layerRemoved) {
      try {
        this.destroy();
      } catch (error) {
        firstFailure ??= error;
      }
      if (this.#destroyComplete()) return;
    }
    throw firstFailure ?? new CapabilityError('Draw interaction open rollback did not complete');
  }

  /** 冻结语义事件；监听器异常只进入错误通道。 */
  #emit(event: DrawInteractionEvent): void {
    try {
      this.#listener(freezeEvent(event));
    } catch (error) {
      report(this.#errorReporter, error, `listener:${event.type}`);
    }
  }

  /** 安装首个预览；同步监听器抛错时仍要收敛 Feature 所有权。 */
  #addInitialPreview(feature: PreviewFeature, state: PreparedPreview): void {
    try {
      this.#source.addFeature(feature);
      if (!this.#source.hasFeature(feature)) throw new InvalidArgumentError('OpenLayers did not attach the draw preview');
      if (this.#closing) throw new ObjectDisposedError('Draw interaction was destroyed during render');
      this.#preview = feature;
      this.#previewState = state;
    } catch (error) {
      if (this.#source.hasFeature(feature)) {
        try {
          this.#source.removeFeature(feature);
        } catch (rollbackError) {
          if (this.#source.hasFeature(feature) && !this.#closing) this.#preview = feature;
          report(this.#errorReporter, rollbackError, 'render-add-rollback');
        }
      }
      const attached = this.#source.hasFeature(feature);
      if (!attached || this.#closing) {
        this.#preview = undefined;
        this.#previewState = undefined;
        this.#retire(feature, !attached, 'render-add-cleanup');
      }
      throw error;
    }
  }

  /** 同类型、同样式时原位更新坐标；setter 或同步监听器抛错则恢复上一完整快照。 */
  #updatePreviewGeometryAtomically(current: PreviewFeature, previous: PreparedPreview, next: PreparedPreview): void {
    const geometry = current.getGeometry();
    if (geometry === undefined || !geometrySupportsState(geometry, next.geometry)) {
      this.#replacePreviewAtomically(current, createPreviewFeature(next), next);
      return;
    }
    try {
      applyGeometryState(geometry, next.geometry);
      if (!this.#source.hasFeature(current)) throw new InvalidArgumentError('OpenLayers detached the draw preview during geometry update');
      if (this.#closing) throw new ObjectDisposedError('Draw interaction was destroyed during render');
      this.#previewState = next;
    } catch (error) {
      if (this.#closing) {
        this.#previewState = undefined;
        throw error;
      }
      const rollbackFailures: unknown[] = [];
      capture(rollbackFailures, () => applyGeometryState(geometry, previous.geometry));
      if (!this.#source.hasFeature(current)) {
        capture(rollbackFailures, () => this.#source.addFeature(current));
      }
      if (rollbackFailures.length === 0 && this.#source.hasFeature(current)) {
        this.#preview = current;
        this.#previewState = previous;
        throw error;
      }
      for (const rollbackError of rollbackFailures) report(this.#errorReporter, rollbackError, 'render-update-rollback');
      this.#closing = true;
      this.#published = false;
      if (this.#source.hasFeature(current)) {
        this.#preview = current;
        this.#previewState = previous;
      } else {
        this.#preview = undefined;
        this.#previewState = undefined;
        this.#retire(current, true, 'render-update-abandoned');
      }
      throw new AggregateError([error, ...rollbackFailures], 'Draw preview geometry update failed and rollback was incomplete');
    }
  }

  /** 以完整 Feature 替换当前预览；替换失败时优先恢复旧快照。 */
  #replacePreviewAtomically(current: PreviewFeature, prepared: PreviewFeature, state: PreparedPreview): void {
    try {
      this.#source.removeFeature(current);
      if (this.#source.hasFeature(current)) throw new InvalidArgumentError('OpenLayers did not detach the preceding draw preview');
      if (this.#closing) throw new ObjectDisposedError('Draw interaction was destroyed during render');
      this.#source.addFeature(prepared);
      if (!this.#source.hasFeature(prepared)) throw new InvalidArgumentError('OpenLayers did not attach the replacement draw preview');
      if (this.#closing) throw new ObjectDisposedError('Draw interaction was destroyed during render');
      this.#preview = prepared;
      this.#previewState = state;
      this.#retire(current, true, 'render-retire');
    } catch (error) {
      if (this.#closing) {
        this.#preview = undefined;
        this.#previewState = undefined;
        this.#retire(current, !this.#source.hasFeature(current), 'render-closing-current-cleanup');
        this.#retire(prepared, !this.#source.hasFeature(prepared), 'render-closing-prepared-cleanup');
        throw error;
      }
      const rollbackFailures: unknown[] = [];
      if (this.#source.hasFeature(prepared)) {
        try {
          this.#source.removeFeature(prepared);
        } catch (rollbackError) {
          rollbackFailures.push(rollbackError);
          report(this.#errorReporter, rollbackError, 'render-replace-remove-rollback');
        }
      }
      if (!this.#source.hasFeature(prepared) && !this.#source.hasFeature(current)) {
        try {
          this.#source.addFeature(current);
        } catch (rollbackError) {
          rollbackFailures.push(rollbackError);
          report(this.#errorReporter, rollbackError, 'render-replace-add-rollback');
        }
      }
      if (this.#source.hasFeature(current) && !this.#source.hasFeature(prepared)) {
        this.#preview = current;
        this.#retire(prepared, true, 'render-replacement-cleanup');
        throw error;
      }
      this.#closing = true;
      this.#published = false;
      if (this.#source.hasFeature(prepared)) {
        this.#preview = prepared;
        this.#previewState = state;
        this.#retire(current, true, 'render-replacement-abandoned-current');
      } else {
        this.#preview = undefined;
        this.#previewState = undefined;
        this.#retire(current, true, 'render-replacement-abandoned-current');
        this.#retire(prepared, true, 'render-replacement-abandoned-prepared');
      }
      throw new AggregateError([error, ...rollbackFailures], 'Draw preview replacement failed and rollback was incomplete');
    }
  }

  /** 清空当前预览；同步监听器抛错时尝试恢复旧快照。 */
  #clearPreviewAtomically(): void {
    const current = this.#preview;
    if (current === undefined) return;
    try {
      this.#source.removeFeature(current);
      if (this.#source.hasFeature(current)) throw new InvalidArgumentError('OpenLayers did not remove the draw preview');
      if (this.#closing) throw new ObjectDisposedError('Draw interaction was destroyed during render');
      this.#preview = undefined;
      this.#previewState = undefined;
      this.#retire(current, true, 'render-clear-retire');
    } catch (error) {
      if (this.#closing) {
        this.#preview = undefined;
        this.#previewState = undefined;
        this.#retire(current, !this.#source.hasFeature(current), 'render-clear-closing-cleanup');
        throw error;
      }
      const rollbackFailures: unknown[] = [];
      if (!this.#source.hasFeature(current)) {
        try {
          this.#source.addFeature(current);
          if (!this.#source.hasFeature(current)) throw new CapabilityError('OpenLayers did not restore the preceding draw preview');
        } catch (rollbackError) {
          rollbackFailures.push(rollbackError);
          report(this.#errorReporter, rollbackError, 'render-clear-rollback');
        }
      }
      if (!this.#source.hasFeature(current)) {
        this.#preview = undefined;
        this.#previewState = undefined;
        this.#closing = true;
        this.#published = false;
        this.#retire(current, true, 'render-clear-abandoned');
        throw new AggregateError([error, ...rollbackFailures], 'Draw preview clear failed and rollback was incomplete');
      }
      throw error;
    }
  }

  /** 登记不再使用的 Feature，立即推进清理并报告非致命失败。 */
  #retire(feature: PreviewFeature, sourceDetached: boolean, operation: string): void {
    this.#enqueueRetirement(feature, sourceDetached);
    const failures: unknown[] = [];
    this.#cleanupRetired(failures);
    for (const failure of failures) report(this.#errorReporter, failure, operation);
  }

  /** 为待清理 Feature 建立或合并幂等进度。 */
  #enqueueRetirement(feature: PreviewFeature, sourceDetached: boolean): void {
    if (this.#released.has(feature)) return;
    const existing = this.#retired.get(feature);
    if (existing !== undefined) {
      if (sourceDetached) existing.sourceDetached = true;
      return;
    }
    this.#retired.set(feature, {
      feature,
      sourceDetached,
      geometryCleared: false,
      styleCleared: false,
      disposed: false
    });
  }

  /** 推进全部待清理 Feature，并移除已完成记录。 */
  #cleanupRetired(failures: unknown[]): void {
    for (const progress of [...this.#retired.values()]) {
      this.#cleanupRetiredFeature(progress, failures);
      if (progress.sourceDetached && progress.geometryCleared && progress.styleCleared && progress.disposed) {
        this.#retired.delete(progress.feature);
        this.#released.add(progress.feature);
      }
    }
  }

  /** 分别推进 Source 脱离、Geometry 清空、样式清空和 Feature 释放。 */
  #cleanupRetiredFeature(progress: FeatureCleanupProgress, failures: unknown[]): void {
    const feature = progress.feature;
    if (!progress.sourceDetached) {
      const failureCount = failures.length;
      capture(failures, () => this.#source.removeFeature(feature));
      inspect(
        failures,
        () => this.#source.hasFeature(feature),
        (attached) => {
          progress.sourceDetached = !attached;
        }
      );
      if (!progress.sourceDetached && failures.length === failureCount) {
        failures.push(new CapabilityError('OpenLayers did not remove a retired draw preview'));
      }
    }
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
        failures.push(new CapabilityError('OpenLayers did not clear a retired draw preview geometry'));
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
        failures.push(new CapabilityError('OpenLayers did not clear a retired draw preview style'));
      }
    }
    if (!progress.disposed) {
      const failureCount = failures.length;
      capture(failures, () => feature.dispose());
      progress.disposed = failures.length === failureCount;
    }
  }

  /** 所有清理后置条件均满足时才视为销毁完成。 */
  #destroyComplete(): boolean {
    return (
      this.#deactivated &&
      this.#interactionRemoved &&
      this.#layerRemoved &&
      this.#layerSourceCleared &&
      this.#sourceDisposed &&
      this.#layerDisposed &&
      this.#targetPresentationKey === undefined &&
      this.#preview === undefined &&
      this.#previewState === undefined &&
      this.#renderQueue.length === 0 &&
      this.#retired.size === 0 &&
      this.#freehandFrame === undefined &&
      this.#pendingFreehandSamples.length === 0
    );
  }
}

/** 校验并冻结绘制交互配置。 */
function validateSpec(spec: Readonly<DrawInteractionSpec>): Readonly<DrawInteractionSpec> {
  if (spec === null || typeof spec !== 'object') throw new InvalidArgumentError('Draw interaction spec must be an object');
  if (typeof spec.layerId !== 'string' || spec.layerId.trim().length === 0) {
    throw new InvalidArgumentError('Draw interaction layerId must be a non-empty string');
  }
  if (spec.mode !== 'point' && spec.mode !== 'vertices') throw new InvalidArgumentError('Unknown draw interaction mode');
  if (typeof spec.freehand !== 'boolean') throw new InvalidArgumentError('Draw interaction freehand must be boolean');
  return Object.freeze({ layerId: spec.layerId, mode: spec.mode, freehand: spec.freehand });
}

/** 从目标投影获取水平循环世界范围。 */
function worldFor(map: OlMap, source: VectorSource): HorizontalWorld | undefined {
  const projection = getUserProjection() ?? source.getProjection() ?? map.getView().getProjection();
  return horizontalWorldFromExtent(projection.getExtent(), source.getWrapX() === true && projection.canWrapX());
}

function containsInteraction(map: OlMap, interaction: Interaction): boolean {
  return map.getInteractions().getArray().includes(interaction);
}

/** 递归定位目标图层直属的集合，使嵌套 LayerGroup 中的预览仍保持正确顺序和父级约束。 */
function findLayerCollection(collection: Collection<BaseLayer>, target: BaseLayer): Collection<BaseLayer> | undefined {
  if (collection.getArray().includes(target)) return collection;
  for (const layer of collection.getArray()) {
    if (!(layer instanceof LayerGroup)) continue;
    const nested = findLayerCollection(layer.getLayers(), target);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** 将预览插入目标之后；真实 OpenLayers Collection 使用公开 API，并兼容仓库已有的最小 Map 测试替身。 */
function insertLayerAfter(collection: Collection<BaseLayer>, target: BaseLayer, preview: PreviewLayer): void {
  const targetIndex = collection.getArray().indexOf(target);
  if (targetIndex < 0) throw new InvalidArgumentError('OpenLayers detached the draw target layer during installation');
  const insertAt = Reflect.get(collection, 'insertAt');
  if (typeof insertAt === 'function') {
    Reflect.apply(insertAt, collection, [targetIndex + 1, preview]);
    return;
  }
  collection.getArray().splice(targetIndex + 1, 0, preview);
}

function containsLayer(collection: Collection<BaseLayer>, layer: PreviewLayer): boolean {
  return collection.getArray().includes(layer);
}

/** 使隔离预览层实时保持目标业务层的展示约束，同时沿用后插顺序置于同层级之上。 */
function syncPreviewLayerPresentation(target: VectorLayer, preview: PreviewLayer): void {
  const visible = target.getVisible();
  if (preview.getVisible() !== visible) preview.setVisible(visible);
  const opacity = target.getOpacity();
  if (preview.getOpacity() !== opacity) preview.setOpacity(opacity);
  const extent = target.getExtent();
  if (preview.getExtent() !== extent) preview.setExtent(extent);
  const minResolution = target.getMinResolution();
  if (preview.getMinResolution() !== minResolution) preview.setMinResolution(minResolution);
  const maxResolution = target.getMaxResolution();
  if (preview.getMaxResolution() !== maxResolution) preview.setMaxResolution(maxResolution);
  const minZoom = target.getMinZoom();
  if (preview.getMinZoom() !== minZoom) preview.setMinZoom(minZoom);
  const maxZoom = target.getMaxZoom();
  if (preview.getMaxZoom() !== maxZoom) preview.setMaxZoom(maxZoom);
  const zIndex = target.getZIndex();
  if (preview.getZIndex() !== zIndex) {
    if (zIndex === undefined) preview.unset('zIndex');
    else preview.setZIndex(zIndex);
  }
}

function createPreviewFeature(state: PreparedPreview): PreviewFeature {
  const geometry = createGeometry(state.geometry);
  const feature = new Feature<Geometry>(geometry);
  feature.setStyle(state.compiledStyle);
  return feature;
}

/** 校验、复制并把可环绕预览整体移回规范世界，保证远世界副本也能进入 OpenLayers 的渲染查询。 */
function copyRenderGeometryState(state: RenderGeometryState, world?: HorizontalWorld): RenderGeometryState {
  const worldOffset = previewWorldOffset(state, world);
  if (state.type === 'point') return Object.freeze({ type: state.type, coordinates: copyFrozenCoordinate(state.coordinates, worldOffset) });
  if (state.type === 'polyline') {
    return Object.freeze({
      type: state.type,
      coordinates: Object.freeze(state.coordinates.map((coordinate) => copyFrozenCoordinate(coordinate, worldOffset)))
    });
  }
  if (state.type === 'polygon') {
    return Object.freeze({
      type: state.type,
      coordinates: Object.freeze(state.coordinates.map((ring) => Object.freeze(ring.map((coordinate) => copyFrozenCoordinate(coordinate, worldOffset)))))
    });
  }
  if (state.type !== 'circle' || !Number.isFinite(state.radius) || state.radius < 0) {
    throw new InvalidArgumentError('Draw preview circle radius must be a finite non-negative number');
  }
  return Object.freeze({ type: state.type, center: copyFrozenCoordinate(state.center, worldOffset), radius: state.radius });
}

/** 使用首个坐标计算整幅草稿回到规范世界所需的统一水平偏移，避免破坏跨越日期变更线的连续几何。 */
function previewWorldOffset(state: RenderGeometryState, world: HorizontalWorld | undefined): number {
  if (world === undefined) return 0;
  const anchor = previewAnchor(state);
  if (anchor === undefined) return 0;
  const safeAnchor = copyFrozenCoordinate(anchor);
  const offset = -horizontalWorldIndex(safeAnchor[0], world) * world.width;
  if (!Number.isFinite(offset)) throw new InvalidArgumentError('Draw preview world offset exceeds the finite numeric range');
  return offset;
}

/** 读取草稿的稳定水平锚点；空折线或空多边形无需世界转换。 */
function previewAnchor(state: RenderGeometryState): Coordinate | undefined {
  if (state.type === 'point') return state.coordinates;
  if (state.type === 'circle') return state.center;
  if (state.type === 'polyline') return state.coordinates[0];
  for (const ring of state.coordinates) {
    if (ring[0] !== undefined) return ring[0];
  }
  return undefined;
}

function geometrySupportsState(geometry: Geometry, state: RenderGeometryState): boolean {
  if (state.type === 'point') return geometry instanceof Point;
  if (state.type === 'polyline') return geometry instanceof LineString;
  if (state.type === 'polygon') return geometry instanceof Polygon;
  return geometry instanceof Circle;
}

/** 只通过 OpenLayers 公共 setter 原子发布一种完整 Geometry 状态。 */
function applyGeometryState(geometry: Geometry, state: RenderGeometryState): void {
  if (state.type === 'point' && geometry instanceof Point) {
    geometry.setCoordinates(copyCoordinate(state.coordinates));
    return;
  }
  if (state.type === 'polyline' && geometry instanceof LineString) {
    geometry.setCoordinates(state.coordinates.map(copyCoordinate));
    return;
  }
  if (state.type === 'polygon' && geometry instanceof Polygon) {
    geometry.setCoordinates(state.coordinates.map((ring) => ring.map(copyCoordinate)));
    return;
  }
  if (state.type === 'circle' && geometry instanceof Circle) {
    geometry.setCenterAndRadius(copyCoordinate(state.center), state.radius);
    return;
  }
  throw new InvalidArgumentError('Draw preview geometry type changed during in-place update');
}

function createGeometry(state: RenderGeometryState): Geometry {
  if (state.type === 'point') return new Point(copyCoordinate(state.coordinates));
  if (state.type === 'polyline') return new LineString(state.coordinates.map(copyCoordinate));
  if (state.type === 'polygon') return new Polygon(state.coordinates.map((ring) => ring.map(copyCoordinate)));
  if (!Number.isFinite(state.radius) || state.radius < 0) throw new InvalidArgumentError('Draw preview circle radius must be a finite non-negative number');
  return new Circle(copyCoordinate(state.center), state.radius);
}

function copyCoordinate(value: Coordinate): number[] {
  const coordinate = safeCoordinate(value);
  if (coordinate === undefined) throw new InvalidArgumentError('Draw preview coordinate must contain two or three finite numbers');
  return [...coordinate];
}

function safeCoordinate(value: unknown): Coordinate | undefined {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3) || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    return undefined;
  }
  return Object.freeze([...value]) as Coordinate;
}

function isShift(event: MapBrowserEvent): boolean {
  return field(event.originalEvent, 'shiftKey') === true;
}

function isPointerCancel(event: MapBrowserEvent): boolean {
  return event.type === 'pointercancel' || field(event.originalEvent, 'type') === 'pointercancel';
}

function isPrimary(event: MapBrowserEvent, requireLeftButton: boolean): boolean {
  if (field(event.originalEvent, 'isPrimary') === false) return false;
  const button = field(event.originalEvent, 'button');
  return !requireLeftButton || typeof button !== 'number' || button === 0;
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

/** 冻结事件快照，避免监听器修改 Session 即将消费的数据。 */
function freezeEvent(event: DrawInteractionEvent): DrawInteractionEvent {
  if (event.type === 'freehand-cancel') return Object.freeze({ type: event.type });
  if (event.type === 'freehand-samples') {
    return Object.freeze({
      type: event.type,
      coordinates: Object.freeze(event.coordinates.map((coordinate) => safeCoordinate(coordinate) as Coordinate))
    });
  }
  return Object.freeze({ type: event.type, coordinate: safeCoordinate(event.coordinate) as Coordinate });
}

/** 复制、平移并冻结语义坐标元组。 */
function copyFrozenCoordinate(value: Coordinate, xOffset = 0): Coordinate {
  const coordinate = safeCoordinate(value);
  if (coordinate === undefined) throw new InvalidArgumentError('Draw preview coordinate must contain two or three finite numbers');
  if (xOffset === 0) return coordinate;
  const x = coordinate[0] + xOffset;
  if (!Number.isFinite(x)) throw new InvalidArgumentError('Draw preview coordinate exceeds the finite numeric range after world normalization');
  return Object.freeze(coordinate.length === 3 ? [x, coordinate[1], coordinate[2]] : [x, coordinate[1]]);
}

/** 错误报告器失败时保持原生资源状态不受影响。 */
function report(errorReporter: ErrorReporter, error: unknown, operation: string): void {
  try {
    const result = (errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
      source: 'DrawInteractionAdapter',
      operation
    });
    void Promise.resolve(result).catch(() => undefined);
  } catch {
    // 错误报告器自身的异常不能破坏原生资源所有权。
  }
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
