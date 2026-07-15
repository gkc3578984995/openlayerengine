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

/** 绘制预览使用的 OpenLayers 要素。 */
type PreviewFeature = Feature<Geometry>;
/** 存放绘制预览要素的矢量数据源。 */
type PreviewSource = VectorSource<PreviewFeature>;
/** 承载唯一绘制预览的数据源隔离图层。 */
type PreviewLayer = VectorLayer<PreviewSource>;
/** StyleCompiler 编译后的 OpenLayers 样式。 */
type CompiledPreviewStyle = ReturnType<StyleCompiler['compile']>;

/** 已校验并脱离调用方所有权、但尚未写入 OpenLayers 对象的预览快照。 */
interface PreparedPreview {
  readonly geometry: RenderGeometryState;
  readonly styleIdentity: object;
  readonly compiledStyle: CompiledPreviewStyle;
}

/** 单个预览要素分步清理的进度。 */
interface FeatureCleanupProgress {
  /** 待清理的预览要素。 */
  readonly feature: PreviewFeature;
  /** 是否已经从数据源移除。 */
  sourceDetached: boolean;
  /** 是否已经清除几何。 */
  geometryCleared: boolean;
  /** 是否已经清除样式。 */
  styleCleared: boolean;
  /** 是否已经销毁要素。 */
  disposed: boolean;
}

/** 可取消的浏览器动画帧；保存调度时的 cancel 引用以便测试和销毁可靠取消。 */
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
  /** 交互所属的地图。 */
  readonly #map: OlMap;
  /** 提供目标矢量图层和数据源。 */
  readonly #layers: LayerAdapter;
  /** 编译绘制预览样式。 */
  readonly #styles: StyleCompiler;
  /** 接收监听器和清理过程中的错误。 */
  readonly #errorReporter: ErrorReporter;

  /**
   * 创建绘制交互适配器。
   *
   * @param map 承载交互和预览图层的 OpenLayers 地图。
   * @param layers 用于解析目标图层及其矢量数据源的适配器。
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
  /** 交互所属的地图。 */
  readonly #map: OlMap;
  /** 目标业务图层直属的图层集合；临时预览必须在该集合中与目标层保持相邻。 */
  readonly #layerCollection: Collection<BaseLayer>;
  /** 提供临时层展示属性的业务目标图层。 */
  readonly #targetLayer: VectorLayer;
  /** 隔离绘制预览、避免使业务图层逐帧失效的临时图层。 */
  readonly #layer: PreviewLayer;
  /** 存放唯一绘制预览的临时数据源。 */
  readonly #source: PreviewSource;
  /** 编译绘制预览样式。 */
  readonly #styles: StyleCompiler;
  /** 接收地图浏览器事件的 OpenLayers 交互。 */
  readonly #interaction: Interaction;
  /** 已校验的绘制交互配置。 */
  readonly #spec: Readonly<DrawInteractionSpec>;
  /** 接收语义绘制事件。 */
  readonly #listener: (event: DrawInteractionEvent) => void;
  /** 接收监听器和清理错误。 */
  readonly #errorReporter: ErrorReporter;
  /**
   * 当前交互使用的水平世界范围快照；目标投影不支持水平环绕时为 `undefined`。
   */
  readonly world: HorizontalWorld | undefined;
  /** 当前显示的预览要素。 */
  #preview: PreviewFeature | undefined;
  /** 当前 Feature 对应的完整语义快照，用于同类型原位更新和异常回滚。 */
  #previewState: PreparedPreview | undefined;
  /** 按稳定语义 style 身份缓存编译结果。 */
  readonly #compiledStyles = new WeakMap<object, CompiledPreviewStyle>();
  /** 句柄是否已经允许派发事件。 */
  #published = false;
  /** 句柄是否正在关闭。 */
  #closing = false;
  /** 原生交互是否已经停用。 */
  #deactivated = false;
  /** 原生交互是否已经从地图移除。 */
  #interactionRemoved = false;
  /** 临时预览图层是否已经从地图移除。 */
  #layerRemoved = false;
  /** 临时图层是否已经解除数据源引用。 */
  #layerSourceCleared = false;
  /** 临时数据源是否已经销毁。 */
  #sourceDisposed = false;
  /** 临时图层是否已经销毁。 */
  #layerDisposed = false;
  /** 目标图层展示属性监听键；销毁后清空。 */
  #targetPresentationKey: EventsKey | undefined;
  /** 是否正在执行销毁。 */
  #destroyRunning = false;
  /** 是否正在自由绘制。 */
  #freehandActive = false;
  /** 当前动画帧内尚未按顺序发布的自由绘制采样。 */
  readonly #pendingFreehandSamples: Coordinate[] = [];
  /** 当前自由绘制批次对应的浏览器动画帧。 */
  #freehandFrame: AnimationFrameRegistration | undefined;
  /** 是否需要忽略自由绘制后的下一次点击。 */
  #suppressNextClick = false;
  /** 是否正在处理预览渲染队列。 */
  #rendering = false;
  /** 等待按顺序提交的预览快照。 */
  readonly #renderQueue: Array<PreparedPreview | undefined> = [];
  /** 下一个待处理队列索引，避免 Array.shift 的线性搬移。 */
  #renderQueueHead = 0;
  /** 等待继续清理的旧预览要素。 */
  readonly #retired = new Map<PreviewFeature, FeatureCleanupProgress>();
  /** 已经完成清理的预览要素。 */
  readonly #released = new WeakSet<PreviewFeature>();

  /**
   * 创建尚未对外发布的原生交互句柄。
   *
   * @param map 承载原生交互的地图。
   * @param layerCollection 目标业务图层直属的图层集合。
   * @param targetLayer 提供可见性、透明度、范围和层级等展示属性的业务图层。
   * @param layer 承载唯一临时预览 Feature 的隔离图层。
   * @param source 存放唯一临时预览 Feature 的隔离数据源。
   * @param styles 编译预览样式的编译器。
   * @param interaction 转发浏览器地图事件的 OpenLayers 交互。
   * @param spec 已校验并冻结的交互配置。
   * @param listener 接收语义输入事件的监听器。
   * @param world 水平环绕世界范围的稳定快照。
   * @param errorReporter 接收监听器及清理异常的报告器。
   * @internal
   */
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

  /**
   * 标记安装已完成，允许后续原生输入向语义监听器发布。
   *
   * @returns 无返回值。
   * @internal
   */
  publish(): void {
    this.#published = true;
  }

  /**
   * 将 OpenLayers 地图浏览器事件转换为语义绘制事件。
   *
   * @param event OpenLayers 分发的地图浏览器事件。
   * @returns `false` 表示事件已由绘制交互消费，`true` 表示允许后续交互继续处理。
   * @internal
   */
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

  /** 取消待执行帧并按采样顺序一次发布给语义核心。 */
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
   * 原子替换当前预览快照；传入 `undefined` 时清空预览。
   *
   * 同步数据源监听器触发的重入渲染会进入队列，并在当前快照事务完成后按顺序执行。
   *
   * @param state 完整的预览几何与样式；`undefined` 表示清空。
   * @returns 无返回值。
   * @throws {@link ObjectDisposedError} 当句柄已进入销毁流程时抛出。
   * @throws {@link InvalidArgumentError} 当几何数据无效或 OpenLayers 未满足预览后置条件时抛出。
   * @throws {@link AggregateError} 当替换失败且无法恢复先前快照时抛出。
   * @internal
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

  /** 校验、复制 geometry 并按 style 身份复用编译结果。 */
  #preparePreview(state: Readonly<DrawInteractionRenderState>): PreparedPreview {
    const styleIdentity = state.style as object;
    let compiledStyle = this.#compiledStyles.get(styleIdentity);
    if (compiledStyle === undefined) {
      compiledStyle = this.#styles.compile(state.style);
      this.#compiledStyles.set(styleIdentity, compiledStyle);
    }
    return Object.freeze({ geometry: copyRenderGeometryState(state.geometry, this.world), styleIdentity, compiledStyle });
  }

  /**
   * 应用一个已经完成几何和样式编译的预览快照。
   *
   * @param prepared 待安装的完整 Feature；`undefined` 表示清空当前预览。
   * @returns 无返回值。
   * @internal
   */
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
   * 停止事件并释放交互、队列和全部预览 Feature。
   *
   * 各清理步骤独立执行；若本次存在失败，会在尝试其余步骤后抛出首个异常，后续调用只重试尚未满足后置条件的步骤。
   *
   * @returns 无返回值。
   * @throws 清理原生资源时遇到的首个异常。
   * @internal
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

  /**
   * 回滚尚未发布或发布过程中失败的安装。
   *
   * @returns 无返回值。
   * @throws {@link CapabilityError} 当有限次回滚后仍有原生资源未释放时抛出。
   * @internal
   */
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

  /**
   * 安全调用语义监听器，并把监听器异常交给错误报告器。
   *
   * @param event 待冻结并发布的绘制事件。
   * @returns 无返回值。
   * @internal
   */
  #emit(event: DrawInteractionEvent): void {
    try {
      this.#listener(freezeEvent(event));
    } catch (error) {
      report(this.#errorReporter, error, `listener:${event.type}`);
    }
  }

  /**
   * 安装首次预览，并在同步监听器抛错时恢复明确的所有权状态。
   *
   * @param feature 已准备完成的首次预览 Feature。
   * @returns 无返回值。
   * @throws 安装预览或验证安装后置条件时产生的异常。
   * @internal
   */
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

  /**
   * 同类型同 style 快路：保持 Feature、Geometry 和 source membership，仅原位替换坐标。
   * setter 或同步 changefeature 监听器抛错时恢复上一完整快照。
   */
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

  /**
   * 用完整 Feature 快照替换现有预览；失败时优先恢复原快照。
   *
   * @param current 当前由句柄拥有的预览 Feature。
   * @param prepared 待发布的完整替换 Feature。
   * @returns 无返回值。
   * @throws {@link AggregateError} 当替换和恢复均未得到原快照时抛出。
   * @internal
   */
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

  /**
   * 从数据源清空当前预览；同步监听器抛错时尝试恢复原快照。
   *
   * @returns 无返回值。
   * @throws {@link AggregateError} 当清空失败且无法恢复原快照时抛出。
   * @throws 清空失败但原快照已经恢复时产生的原始异常。
   * @internal
   */
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

  /**
   * 登记退休 Feature、立即尝试清理，并报告本次清理异常。
   *
   * @param feature 不再作为当前预览使用的 Feature。
   * @param sourceDetached 调用前该 Feature 是否已脱离目标数据源。
   * @param operation 错误报告中使用的操作名称。
   * @returns 无返回值。
   * @internal
   */
  #retire(feature: PreviewFeature, sourceDetached: boolean, operation: string): void {
    this.#enqueueRetirement(feature, sourceDetached);
    const failures: unknown[] = [];
    this.#cleanupRetired(failures);
    for (const failure of failures) report(this.#errorReporter, failure, operation);
  }

  /**
   * 为退休 Feature 建立或合并幂等清理进度。
   *
   * @param feature 需要释放的 Feature。
   * @param sourceDetached 已知的数据源脱离状态。
   * @returns 无返回值。
   * @internal
   */
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

  /**
   * 尝试推进全部退休 Feature，并移除已经完全清理的记录。
   *
   * @param failures 收集本轮所有互不阻断的清理异常。
   * @returns 无返回值。
   * @internal
   */
  #cleanupRetired(failures: unknown[]): void {
    for (const progress of [...this.#retired.values()]) {
      this.#cleanupRetiredFeature(progress, failures);
      if (progress.sourceDetached && progress.geometryCleared && progress.styleCleared && progress.disposed) {
        this.#retired.delete(progress.feature);
        this.#released.add(progress.feature);
      }
    }
  }

  /**
   * 独立推进单个 Feature 的数据源脱离、几何清空、样式清空和释放步骤。
   *
   * @param progress 当前 Feature 的持久清理进度。
   * @param failures 收集本轮清理异常。
   * @returns 无返回值。
   * @internal
   */
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

  /**
   * 判断句柄拥有的所有原生资源是否均已完成清理。
   *
   * @returns 全部清理完成时返回 `true`。
   * @internal
   */
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

/** 判断地图是否仍包含指定交互。 */
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

/** 将预览插入目标之后；真实 OL Collection 使用公开 API，并兼容仓库既有的最小 Map 测试替身。 */
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

/** 判断目标直属集合是否仍包含指定临时预览图层。 */
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

/** 根据渲染状态创建完整的预览要素快照。 */
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

/** 使用首个坐标计算整幅草稿回到规范世界所需的统一水平偏移，避免破坏跨日期变更线的连续几何。 */
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

/** 判断现有 OpenLayers Geometry 是否能安全走原位更新快路。 */
function geometrySupportsState(geometry: Geometry, state: RenderGeometryState): boolean {
  if (state.type === 'point') return geometry instanceof Point;
  if (state.type === 'polyline') return geometry instanceof LineString;
  if (state.type === 'polygon') return geometry instanceof Polygon;
  return geometry instanceof Circle;
}

/** 只通过 OpenLayers 公共 setter 原子发布一种完整 geometry 状态。 */
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

/** 将渲染几何状态转换为 OpenLayers Geometry。 */
function createGeometry(state: RenderGeometryState): Geometry {
  if (state.type === 'point') return new Point(copyCoordinate(state.coordinates));
  if (state.type === 'polyline') return new LineString(state.coordinates.map(copyCoordinate));
  if (state.type === 'polygon') return new Polygon(state.coordinates.map((ring) => ring.map(copyCoordinate)));
  if (!Number.isFinite(state.radius) || state.radius < 0) throw new InvalidArgumentError('Draw preview circle radius must be a finite non-negative number');
  return new Circle(copyCoordinate(state.center), state.radius);
}

/** 复制坐标供 OpenLayers 使用。 */
function copyCoordinate(value: Coordinate): number[] {
  const coordinate = safeCoordinate(value);
  if (coordinate === undefined) throw new InvalidArgumentError('Draw preview coordinate must contain two or three finite numbers');
  return [...coordinate];
}

/** 安全读取二维或三维地图坐标。 */
function safeCoordinate(value: unknown): Coordinate | undefined {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3) || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    return undefined;
  }
  return Object.freeze([...value]) as Coordinate;
}

/** 判断原始事件是否按下 Shift。 */
function isShift(event: MapBrowserEvent): boolean {
  return field(event.originalEvent, 'shiftKey') === true;
}

/** 判断事件是否是指针取消。 */
function isPointerCancel(event: MapBrowserEvent): boolean {
  return event.type === 'pointercancel' || field(event.originalEvent, 'type') === 'pointercancel';
}

/** 判断事件是否来自主指针和允许的鼠标按键。 */
function isPrimary(event: MapBrowserEvent, requireLeftButton: boolean): boolean {
  if (field(event.originalEvent, 'isPrimary') === false) return false;
  const button = field(event.originalEvent, 'button');
  return !requireLeftButton || typeof button !== 'number' || button === 0;
}

/** 安全读取未知对象的字段。 */
function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

/** 复制并冻结语义绘制事件。 */
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

/** 安全上报绘制交互内部错误。 */
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

/** 执行清理步骤并收集失败。 */
function capture(failures: unknown[], work: () => void): void {
  try {
    work();
  } catch (error) {
    failures.push(error);
  }
}

/** 安全读取状态，并把成功结果交给回调。 */
function inspect<T>(failures: unknown[], read: () => T, accept: (value: T) => void): void {
  try {
    accept(read());
  } catch (error) {
    failures.push(error);
  }
}
