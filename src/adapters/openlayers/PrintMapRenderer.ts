import Feature, { type FeatureLike } from 'ol/Feature.js';
import ImageState from 'ol/ImageState.js';
import TileState from 'ol/TileState.js';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import type { EventsKey } from 'ol/events.js';
import Geometry from 'ol/geom/Geometry.js';
import BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import ImageLayer from 'ol/layer/Image.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import { unByKey } from 'ol/Observable.js';
import { fromUserExtent, getUserProjection, toUserCoordinate, toUserExtent } from 'ol/proj.js';
import type Projection from 'ol/proj/Projection.js';
import ImageSource, { type ImageSourceEvent } from 'ol/source/Image.js';
import VectorSource from 'ol/source/Vector.js';
import TileSource, { type TileSourceEvent } from 'ol/source/Tile.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Icon from 'ol/style/Icon.js';
import RegularShape from 'ol/style/RegularShape.js';
import Style, { type StyleFunction } from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import type { CoreLayerState } from '../../core/layer/types.js';
import type { Coordinate } from '../../core/common/types.js';
import { CapabilityError, PrintError } from '../../core/errors.js';
import type { LayerRenderDynamicStyle, LayerRenderPrimitive } from '../../core/ports/LayerRenderPort.js';
import type { PrintExtent, PrintFontSample, PrintFootprint, PrintPlan, PrintValidationIssue } from '../../core/print/types.js';
import type { PrintMapSnapshotCaptureOptions, PrintMapSnapshotHandle } from '../../core/ports/PrintMapSnapshotPort.js';
import type { LayerManager } from '../../core/layer/LayerManager.js';
import type { AnimationManagerImpl } from '../../services/animation/AnimationManager.js';
import type { AnimationPresentationSnapshot } from '../../services/animation/AnimationPresentationSnapshot.js';
import type { FeatureBinding } from './FeatureBinding.js';
import { projectRenderGeometry } from './GeometryCodec.js';
import { isInternalTransientLayer } from './internalLayerRole.js';
import type { LayerAdapter } from './LayerAdapter.js';
import { geometryIntersectsWrappedPrintConstraints } from './PrintGeometryHitAdapter.js';
import { createCorsTaintedCanvasError, sanitizePrintSourceId, type PrintResourceDescriptor } from '../../core/print/PrintResourceSource.js';
import type { StyleCompiler } from './style/StyleCompiler.js';
import { compiledStylesVisualFootprintPx } from './style/visualFootprint.js';
import { cloneStructuredPatternFill } from './style/pattern.js';

export interface PrintMapRenderOptions {
  readonly quality: 'draft' | 'final';
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}

export type PrintMapCaptureOptions = PrintMapSnapshotCaptureOptions;

export interface PrintLayerFactoryContext {
  readonly sourceLayer: BaseLayer;
  readonly subject: string;
  readonly layerId?: string;
  readonly plan: Readonly<PrintPlan>;
}

export type PrintLayerFactoryOutput =
  { readonly layer: BaseLayer; readonly ownership: 'external' } | { readonly layer: BaseLayer; readonly ownership: 'session'; destroy(): void };

export type PrintLayerFactory = (context: Readonly<PrintLayerFactoryContext>) => Readonly<PrintLayerFactoryOutput> | undefined;

export interface PrintMapBitmap {
  readonly canvas: HTMLCanvasElement;
  readonly widthPx: number;
  readonly heightPx: number;
  destroy(): void;
}

export interface PrintMapRenderSize {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly pixelRatio: number;
}

export interface PrintMapSnapshot extends PrintMapSnapshotHandle {
  readonly revision: number;
  readonly animationRevision?: number;
  readonly capturedAt?: number;
  readonly expectedRenderableLeafCount: number;
  readonly fontSamples: readonly Readonly<PrintFontSample>[];
  readonly layers: readonly BaseLayer[];
  readonly projection: Projection;
  readonly destroyed: boolean;
  destroy(): void;
}

export interface PrintMapRendererDependencies {
  readonly layers?: LayerManager;
  readonly layerAdapter?: LayerAdapter;
  readonly binding?: FeatureBinding;
  readonly animations?: AnimationManagerImpl;
  readonly styles?: StyleCompiler;
}

interface BusinessLayerEntry {
  readonly state?: Readonly<CoreLayerState>;
  readonly layer: BaseLayer;
  readonly subject: string;
}

interface CloneContext {
  readonly center: Coordinate;
  readonly resolution: number;
  readonly zoom: number | undefined;
  readonly rotation: number;
  readonly projection: Projection;
  readonly actualExtent: PrintExtent;
  readonly footprint: PrintFootprint;
  readonly animation?: Readonly<AnimationPresentationSnapshot>;
  readonly layerAdapter?: LayerAdapter;
  readonly binding?: FeatureBinding;
  readonly styles?: StyleCompiler;
  readonly worldWidth?: number;
}

/** 使用 Session 所有的图层副本和隐藏 Map 渲染，不修改活动 Map、View、Layer 或 Source。 */
export class PrintMapRenderer {
  readonly #sourceMap: OlMap;
  readonly #dependencies: PrintMapRendererDependencies;
  readonly #listeners = new Set<() => void>();
  readonly #eventKeys: EventsKey[] = [];
  readonly #unsubscribeLayers: (() => void) | undefined;
  #disposed = false;
  #rebindQueued = false;

  constructor(sourceMap: OlMap, dependencies: PrintMapRendererDependencies = {}) {
    this.#sourceMap = sourceMap;
    this.#dependencies = dependencies;
    this.#unsubscribeLayers = dependencies.layers?.subscribe(() => this.#invalidate(true));
    this.#bindLayerEvents();
  }

  subscribe(listener: () => void): () => void {
    if (this.#disposed) throw new CapabilityError('Print map renderer has been destroyed');
    this.#listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(listener);
    };
  }

  validationIssues(plan?: Readonly<PrintPlan>, factory?: PrintLayerFactory): readonly Readonly<PrintValidationIssue>[] {
    if (this.#disposed) throw new CapabilityError('Print map renderer has been destroyed');
    const sourceView = this.#sourceMap.getView();
    const resolution = plan?.range.resolution ?? sourceView.getResolution() ?? 1;
    const activeCenter = sourceView.getCenter();
    const visibility: PrintLayerVisibility = {
      center: plan?.range.center ?? (activeCenter === undefined ? [0, 0] : [activeCenter[0], activeCenter[1]]),
      resolution,
      zoom: sourceView.getZoomForResolution(resolution),
      rotation: plan?.range.rotation ?? sourceView.getRotation(),
      projection: sourceView.getProjection(),
      ...(plan === undefined ? {} : { actualExtent: plan.range.actualExtent, footprint: plan.range.footprint })
    };
    const issues: PrintValidationIssue[] = [];
    const businessLayers = this.#businessLayers();
    const isManagedVector = (layer: BaseLayer): boolean =>
      layer instanceof VectorLayer && this.#dependencies.binding !== undefined && this.#dependencies.layerAdapter?.vectorLayerIdFor(layer) !== undefined;
    for (const entry of businessLayers) {
      const entryIssues: PrintValidationIssue[] = [];
      validateLayerTree(entry.layer, entry.subject, true, visibility, entryIssues, isManagedVector);
      validateManagedVectorStyles(entry, visibility, this.#dependencies, entryIssues);
      if (!canRouteNativeLayer(entry, factory, entryIssues)) issues.push(...entryIssues);
    }
    if (this.#dependencies.layers !== undefined && this.#dependencies.layerAdapter !== undefined) {
      const registered = new Set(businessLayers.map(({ layer }) => layer));
      for (const [index, layer] of this.#sourceMap.getLayers().getArray().entries()) {
        if (registered.has(layer) || isInternalTransientLayer(layer) || !layerContributes(layer, true, visibility)) continue;
        issues.push(
          layerNotPrintable(
            layerSubject(layer, `map:${index}`),
            'Raw Map Layer is outside the Engine Layer registry; register it as a native Layer before printing'
          )
        );
      }
    }
    return Object.freeze(issues.map((issue) => Object.freeze(issue)));
  }

  capture(plan: Readonly<PrintPlan>, options: Readonly<PrintMapCaptureOptions>, factory?: PrintLayerFactory): Readonly<PrintMapSnapshot> {
    if (this.#disposed) throw new CapabilityError('Print map renderer has been destroyed');
    const issues = this.validationIssues(plan, factory);
    if (issues.length > 0) throw new CapabilityError(`Print snapshot contains non-printable Layer: ${issues.map(({ subject }) => subject).join(', ')}`);

    const animation =
      options.animations === 'current-frame'
        ? this.#dependencies.animations?.capturePresentationSnapshot({
            center: plan.range.center,
            resolution: plan.range.resolution,
            rotation: plan.range.rotation,
            pixelRatio: plan.dpi / 96,
            extent: plan.range.actualExtent
          })
        : undefined;
    if (options.animations === 'current-frame' && this.#dependencies.animations === undefined && this.#dependencies.binding !== undefined) {
      throw new CapabilityError('Current-frame printing requires an AnimationManager snapshot provider');
    }

    const context: CloneContext = {
      center: plan.range.center,
      resolution: plan.range.resolution,
      zoom: this.#sourceMap.getView().getZoomForResolution(plan.range.resolution),
      rotation: plan.range.rotation,
      projection: this.#sourceMap.getView().getProjection(),
      actualExtent: plan.range.actualExtent,
      footprint: plan.range.footprint,
      ...printWorldWidth(this.#sourceMap.getView().getProjection()),
      ...(animation === undefined ? {} : { animation }),
      ...(this.#dependencies.layerAdapter === undefined ? {} : { layerAdapter: this.#dependencies.layerAdapter }),
      ...(this.#dependencies.binding === undefined ? {} : { binding: this.#dependencies.binding }),
      ...(this.#dependencies.styles === undefined ? {} : { styles: this.#dependencies.styles })
    };
    const resources: CapturedLayerResource[] = [];
    const businessLayers = this.#businessLayers();
    const activeLayers = collectLayerTree(this.#sourceMap.getLayers().getArray());
    const claimedFactoryLayers = new Set<BaseLayer>();
    let fontSamples: readonly Readonly<PrintFontSample>[] = Object.freeze([]);
    try {
      for (const entry of businessLayers) {
        const entryIssues = validationIssuesForEntry(entry, context, this.#dependencies);
        if (factory !== undefined && canRouteNativeLayer(entry, factory, entryIssues)) {
          resources.push(captureFactoryLayer(entry, plan, context, factory, activeLayers, claimedFactoryLayers));
        } else {
          const layer = cloneLayerTree(entry.layer, context, true);
          resources.push(capturedClone(layer));
        }
      }
      fontSamples = collectMapFontSamples(
        resources.map(({ layer }) => layer),
        context
      );
    } catch (error) {
      releaseCapturedLayers(resources);
      throw error;
    }

    const layers = resources.map(({ layer }) => layer);
    const resourceDescriptors = collectPrintResourceDescriptors(layers, businessLayers, context);
    let destroyed = false;
    const snapshot: Readonly<PrintMapSnapshot> = Object.freeze({
      revision: plan.revision,
      ...(animation === undefined ? {} : { animationRevision: animation.revision, capturedAt: animation.capturedAt }),
      expectedRenderableLeafCount: layers.reduce((count, layer) => count + countRenderableLeaves(layer), 0),
      fontSamples,
      layers: Object.freeze(layers),
      projection: context.projection,
      get destroyed() {
        return destroyed;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        releaseCapturedLayers(resources);
      }
    });
    snapshotResourceDescriptors.set(snapshot, resourceDescriptors);
    return snapshot;
  }

  async render(plan: Readonly<PrintPlan>, options: PrintMapRenderOptions, factory?: PrintLayerFactory): Promise<PrintMapBitmap> {
    const snapshot = this.capture(plan, { animations: this.#dependencies.animations === undefined ? 'base' : 'current-frame' }, factory);
    try {
      return await this.renderSnapshot(snapshot, plan, options);
    } finally {
      snapshot.destroy();
    }
  }

  async renderSnapshot(snapshot: Readonly<PrintMapSnapshot>, plan: Readonly<PrintPlan>, options: PrintMapRenderOptions): Promise<PrintMapBitmap> {
    if (this.#disposed) throw new CapabilityError('Print map renderer has been destroyed');
    if (snapshot.destroyed) throw new CapabilityError('Print map snapshot has been destroyed');
    if (snapshot.revision !== plan.revision) throw new CapabilityError('Print map snapshot revision does not match PrintPlan');
    if (typeof document === 'undefined') throw new CapabilityError('Map printing requires a browser document');
    if (options.signal.aborted) throw cancelledError();

    const renderSize = resolvePrintMapRenderSize(plan.mapFrameMm, plan.dpi, options.quality);
    const target = document.createElement('div');
    target.className = 'ol-print-render-target';
    target.style.width = `${renderSize.cssWidth}px`;
    target.style.height = `${renderSize.cssHeight}px`;
    target.style.position = 'fixed';
    target.style.left = '-100000px';
    target.style.top = '0';
    target.style.pointerEvents = 'none';
    target.style.visibility = 'hidden';
    let hiddenMap: OlMap | undefined;
    try {
      document.body.append(target);
      prepareSnapshotForCurrentUserProjection(snapshot.layers, snapshot.projection);
      hiddenMap = new OlMap({
        target,
        controls: [],
        interactions: [],
        pixelRatio: renderSize.pixelRatio,
        layers: [...snapshot.layers],
        view: new View({
          projection: snapshot.projection,
          center: toUserCoordinate([...plan.range.center], snapshot.projection),
          resolution: plan.range.resolution,
          rotation: plan.range.rotation
        })
      });
      hiddenMap.setSize([renderSize.cssWidth, renderSize.cssHeight]);
      await waitForRender(hiddenMap, options.timeoutMs, options.signal, snapshot.layers, plan.range.resolution, plan.range.actualExtent, plan.range.footprint);
      const canvas = composeMapCanvases(
        target,
        renderSize.widthPx,
        renderSize.heightPx,
        renderSize.cssWidth,
        renderSize.cssHeight,
        snapshot.expectedRenderableLeafCount === 0
      );
      assertCanvasReadable(canvas, snapshotResourceDescriptors.get(snapshot) ?? []);
      let destroyed = false;
      return Object.freeze({
        canvas,
        widthPx: canvas.width,
        heightPx: canvas.height,
        destroy() {
          if (destroyed) return;
          destroyed = true;
          canvas.width = 1;
          canvas.height = 1;
        }
      });
    } finally {
      if (hiddenMap !== undefined) {
        hiddenMap.setTarget(undefined);
        hiddenMap.getLayers().clear();
        hiddenMap.dispose();
      }
      target.remove();
    }
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribeLayers?.();
    releaseKeys(this.#eventKeys);
    this.#listeners.clear();
  }

  #businessLayers(): readonly BusinessLayerEntry[] {
    const manager = this.#dependencies.layers;
    const adapter = this.#dependencies.layerAdapter;
    if (manager !== undefined && adapter !== undefined) {
      return manager.query().map((state) => Object.freeze({ state, layer: adapter.requireLayer(state.id), subject: state.id }));
    }
    return this.#sourceMap
      .getLayers()
      .getArray()
      .map((layer, index) => Object.freeze({ layer, subject: layerSubject(layer, `map:${index}`) }));
  }

  #invalidate(rebind: boolean): void {
    if (this.#disposed) return;
    if (rebind && !this.#rebindQueued) {
      this.#rebindQueued = true;
      queueMicrotask(() => {
        this.#rebindQueued = false;
        if (!this.#disposed) this.#bindLayerEvents();
      });
    }
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch {
        // 内容 revision 订阅失败不能改变活动 Map。
      }
    }
  }

  #bindLayerEvents(): void {
    releaseKeys(this.#eventKeys);
    if (this.#disposed) return;
    const rootLayers = this.#sourceMap.getLayers();
    if (typeof rootLayers.on === 'function') {
      this.#eventKeys.push(
        rootLayers.on('add', (event) => {
          if (!isInternalTransientLayer(event.element)) this.#invalidate(true);
        })
      );
      this.#eventKeys.push(
        rootLayers.on('remove', (event) => {
          if (!isInternalTransientLayer(event.element)) this.#invalidate(true);
        })
      );
    }
    const businessLayers = this.#businessLayers();
    for (const { layer, state } of businessLayers) {
      bindLayerTree(layer, this.#eventKeys, () => this.#invalidate(true), state === undefined || state.kind === 'native');
    }
    if (this.#dependencies.layers !== undefined && this.#dependencies.layerAdapter !== undefined) {
      const registered = new Set(businessLayers.map(({ layer }) => layer));
      for (const layer of this.#sourceMap.getLayers().getArray()) {
        if (registered.has(layer) || isInternalTransientLayer(layer)) continue;
        bindLayerTree(layer, this.#eventKeys, () => this.#invalidate(true), true);
      }
    }
  }
}

export function resolvePrintMapRenderSize(
  mapFrameMm: Readonly<PrintPlan['mapFrameMm']>,
  dpi: number,
  quality: PrintMapRenderOptions['quality']
): Readonly<PrintMapRenderSize> {
  const effectiveDpi = quality === 'final' ? dpi : Math.min(dpi, 96);
  return Object.freeze({
    cssWidth: (mapFrameMm.width / 25.4) * 96,
    cssHeight: (mapFrameMm.height / 25.4) * 96,
    widthPx: Math.max(1, Math.round((mapFrameMm.width / 25.4) * effectiveDpi)),
    heightPx: Math.max(1, Math.round((mapFrameMm.height / 25.4) * effectiveDpi)),
    pixelRatio: effectiveDpi / 96
  });
}

interface CapturedLayerResource {
  readonly layer: BaseLayer;
  release(): void;
}

function validationIssuesForEntry(
  entry: Readonly<BusinessLayerEntry>,
  visibility: Readonly<PrintLayerVisibility>,
  dependencies: Readonly<PrintMapRendererDependencies>
): readonly PrintValidationIssue[] {
  const issues: PrintValidationIssue[] = [];
  const isManagedVector = (layer: BaseLayer): boolean =>
    layer instanceof VectorLayer && dependencies.binding !== undefined && dependencies.layerAdapter?.vectorLayerIdFor(layer) !== undefined;
  validateLayerTree(entry.layer, entry.subject, true, visibility, issues, isManagedVector);
  validateManagedVectorStyles(entry, visibility, dependencies, issues);
  return issues;
}

function canRouteNativeLayer(
  entry: Readonly<BusinessLayerEntry>,
  factory: PrintLayerFactory | undefined,
  issues: readonly Readonly<PrintValidationIssue>[]
): boolean {
  return factory !== undefined && entry.state?.kind === 'native' && issues.some(({ code }) => code === 'layer-not-printable');
}

function captureFactoryLayer(
  entry: Readonly<BusinessLayerEntry>,
  plan: Readonly<PrintPlan>,
  context: Readonly<CloneContext>,
  factory: PrintLayerFactory,
  activeLayers: ReadonlySet<BaseLayer>,
  claimedLayers: Set<BaseLayer>
): CapturedLayerResource {
  let output: Readonly<PrintLayerFactoryOutput> | undefined;
  try {
    output = factory(
      Object.freeze({
        sourceLayer: entry.layer,
        subject: entry.subject,
        ...(entry.state === undefined ? {} : { layerId: entry.state.id }),
        plan
      })
    );
  } catch (cause) {
    throw printableLayerError(entry.subject, `printableLayerFactory threw: ${errorMessage(cause)}`);
  }
  if (output === undefined) throw printableLayerError(entry.subject, 'printableLayerFactory returned undefined');
  if (output === null || typeof output !== 'object' || isPromiseLike(output)) {
    throw printableLayerError(entry.subject, 'printableLayerFactory must synchronously return an ownership handle');
  }

  const ownership = output.ownership;
  const outputLayer = output.layer;
  const sessionDestroy = ownership === 'session' && typeof output.destroy === 'function' ? output.destroy.bind(output) : undefined;
  let handleReleased = false;
  const releaseHandle = (): void => {
    if (handleReleased) return;
    handleReleased = true;
    if (sessionDestroy === undefined) return;
    try {
      sessionDestroy();
    } catch {
      // 非法 factory 输出的回滚仍要继续释放其他已捕获资源。
    }
  };
  let snapshotLayer: BaseLayer | undefined;
  try {
    if (ownership !== 'external' && ownership !== 'session') throw printableLayerError(entry.subject, 'printableLayerFactory returned an unknown ownership');
    if (!(outputLayer instanceof BaseLayer)) throw printableLayerError(entry.subject, 'printableLayerFactory did not return an OpenLayers BaseLayer');
    if (ownership === 'session' && sessionDestroy === undefined) {
      throw printableLayerError(entry.subject, 'A session-owned printable Layer requires destroy()');
    }
    validateFactoryLayerTree(outputLayer, entry.subject, activeLayers, claimedLayers);
    try {
      snapshotLayer = cloneLayerTree(outputLayer, context, true);
      collectMapFontSamples([snapshotLayer], context);
    } catch (cause) {
      throw printableLayerError(entry.subject, errorMessage(cause));
    }
  } catch (error) {
    if (snapshotLayer !== undefined) {
      try {
        disposeClone(snapshotLayer);
      } catch {
        // 内部克隆清理失败不能跳过 factory ownership handle。
      }
    }
    releaseHandle();
    throw error;
  }

  if (snapshotLayer === undefined) {
    releaseHandle();
    throw printableLayerError(entry.subject, 'printableLayerFactory output could not be frozen');
  }
  for (const candidate of collectLayerTree([outputLayer])) claimedLayers.add(candidate);
  const frozenLayer = snapshotLayer;
  let released = false;
  return {
    layer: frozenLayer,
    release() {
      if (released) return;
      released = true;
      try {
        disposeClone(frozenLayer);
      } finally {
        releaseHandle();
      }
    }
  };
}

function validateFactoryLayerTree(root: BaseLayer, subject: string, activeLayers: ReadonlySet<BaseLayer>, claimedLayers: ReadonlySet<BaseLayer>): void {
  const visiting = new Set<BaseLayer>();
  const visited = new Set<BaseLayer>();
  const visit = (layer: BaseLayer): void => {
    if (activeLayers.has(layer)) throw printableLayerError(subject, 'printableLayerFactory returned an active Map Layer or child Layer');
    if (claimedLayers.has(layer)) throw printableLayerError(subject, 'printableLayerFactory reused a Layer already claimed by this snapshot');
    if (visiting.has(layer)) throw printableLayerError(subject, 'printableLayerFactory returned a cyclic Layer tree');
    if (visited.has(layer)) throw printableLayerError(subject, 'printableLayerFactory reused the same Layer in multiple branches');
    visiting.add(layer);
    if (!hasStandardPrintableLayerConstructor(layer)) {
      const message =
        layer instanceof LayerGroup || layer instanceof VectorLayer || layer instanceof TileLayer || layer instanceof ImageLayer
          ? `Custom printable Layer subclass is unsupported: ${layer.constructor.name}`
          : `Unsupported printable Layer type: ${layer.constructor.name}`;
      throw printableLayerError(subject, message);
    }
    if (layer instanceof LayerGroup) {
      for (const child of layer.getLayers().getArray()) visit(child);
    } else if (layer instanceof VectorLayer) {
      if (!(layer.getSource() instanceof VectorSource)) throw printableLayerError(subject, 'Printable VectorLayer does not expose a VectorSource');
    } else if (layer instanceof TileLayer) {
      if (!(layer.getSource() instanceof TileSource)) throw printableLayerError(subject, 'Printable TileLayer does not expose a TileSource');
    } else if (layer instanceof ImageLayer) {
      if (!(layer.getSource() instanceof ImageSource)) throw printableLayerError(subject, 'Printable ImageLayer does not expose an ImageSource');
    } else {
      throw printableLayerError(subject, `Unsupported printable Layer type: ${layer.constructor.name}`);
    }
    visiting.delete(layer);
    visited.add(layer);
  };
  visit(root);
}

function collectLayerTree(roots: readonly BaseLayer[]): ReadonlySet<BaseLayer> {
  const layers = new Set<BaseLayer>();
  const visit = (layer: BaseLayer): void => {
    if (layers.has(layer)) return;
    layers.add(layer);
    if (layer instanceof LayerGroup) for (const child of layer.getLayers().getArray()) visit(child);
  };
  for (const root of roots) visit(root);
  return layers;
}

function collectPrintResourceDescriptors(
  layers: readonly BaseLayer[],
  entries: readonly Readonly<BusinessLayerEntry>[],
  context: Readonly<CloneContext>
): readonly Readonly<PrintResourceDescriptor>[] {
  const descriptors = new Map<string, Readonly<PrintResourceDescriptor>>();
  const add = (layerId: string, resourceType: PrintResourceDescriptor['resourceType'], sourceId: string): void => {
    const descriptor = Object.freeze({ layerId, resourceType, sourceId: sanitizePrintSourceId(sourceId) });
    descriptors.set(`${descriptor.layerId}\u0000${descriptor.resourceType}\u0000${descriptor.sourceId}`, descriptor);
  };
  const visit = (layer: BaseLayer, layerId: string, ancestorClip: PrintExtent | null | undefined): void => {
    if (!layer.getVisible() || layer.getOpacity() <= 0) return;
    const clip = intersectLayerClip(ancestorClip, layerExtentInProjection(layer, context.projection));
    if (clip === null) return;
    if (layer instanceof LayerGroup) {
      for (const child of layer.getLayers().getArray()) visit(child, layerId, clip);
      return;
    }
    if (layer instanceof TileLayer) {
      const source = layer.getSource();
      if (source instanceof TileSource) for (const sourceId of printSourceIdentifiers(source)) add(layerId, 'tile', sourceId);
      return;
    }
    if (layer instanceof ImageLayer) {
      const source = layer.getSource();
      if (source instanceof ImageSource) for (const sourceId of printSourceIdentifiers(source)) add(layerId, 'image', sourceId);
      return;
    }
    if (!(layer instanceof VectorLayer)) return;
    const source = layer.getSource();
    if (!(source instanceof VectorSource)) return;
    const layerStyle = layer.getStyleFunction();
    const renderBuffer = layer.getRenderBuffer() ?? 100;
    const queryFootprint = expandPrintFootprint(context.footprint, renderBuffer * context.resolution);
    const worldWidth = source.getWrapX() ? context.worldWidth : undefined;
    for (const feature of source.getFeatures()) {
      const resolved = (feature.getStyleFunction() ?? layerStyle)?.(feature, context.resolution);
      const styles = resolved === undefined ? [] : Array.isArray(resolved) ? resolved : [resolved];
      for (const style of styles) {
        const image = style.getImage();
        if (!(image instanceof Icon)) continue;
        const geometry = style.getGeometryFunction()(feature);
        const visualClip = expandLayerClipForStyle(clip, style, context.resolution, context.rotation, renderBuffer);
        if (!(geometry instanceof Geometry) || !geometryIntersectsWrappedPrintConstraints(geometry, queryFootprint, worldWidth, visualClip)) continue;
        add(layerId, 'icon', image.getSrc() || 'Icon');
      }
    }
  };
  for (const [index, layer] of layers.entries()) visit(layer, entries[index]?.subject ?? `layer:${index}`, undefined);
  return Object.freeze([...descriptors.values()]);
}

function printSourceIdentifiers(source: TileSource | ImageSource): readonly string[] {
  const candidate = source as unknown as {
    getUrls?: () => readonly string[] | null;
    getUrl?: () => string | undefined;
  };
  try {
    const urls = candidate.getUrls?.();
    if (urls !== null && urls !== undefined && urls.length > 0) return urls.filter((url): url is string => typeof url === 'string' && url.length > 0);
    const url = candidate.getUrl?.();
    if (typeof url === 'string' && url.length > 0) return [url];
  } catch {
    // 来源标识只辅助定位 CORS 配置，读取失败不应阻断快照捕获。
  }
  return [source.constructor.name || 'unknown'];
}

function capturedClone(layer: BaseLayer): CapturedLayerResource {
  let released = false;
  return {
    layer,
    release() {
      if (released) return;
      released = true;
      disposeClone(layer);
    }
  };
}

function releaseCapturedLayers(resources: CapturedLayerResource[]): void {
  for (const resource of resources.splice(0).reverse()) {
    try {
      resource.release();
    } catch {
      // 一个资源清理失败不能阻断其他 factory handle 或克隆 Layer 的释放。
    }
  }
}

function printableLayerError(subject: string, message: string): CapabilityError {
  return new CapabilityError(`layer-not-printable:${encodeURIComponent(subject)}:${message}`);
}

function isPromiseLike(value: object): boolean {
  return typeof (value as { then?: unknown }).then === 'function';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface PrintLayerVisibility {
  readonly center: Coordinate;
  readonly resolution: number;
  readonly zoom: number | undefined;
  readonly rotation: number;
  readonly projection: Projection;
  readonly actualExtent?: PrintExtent;
  readonly footprint?: PrintFootprint;
}

function validateLayerTree(
  layer: BaseLayer,
  subject: string,
  ancestorVisible: boolean,
  visibility: Readonly<PrintLayerVisibility>,
  issues: PrintValidationIssue[],
  isManagedVector: (layer: BaseLayer) => boolean
): void {
  const contributes = layerContributes(layer, ancestorVisible, visibility);
  if (!contributes) return;
  if (!hasStandardPrintableLayerConstructor(layer)) {
    const message =
      layer instanceof LayerGroup || layer instanceof VectorLayer || layer instanceof TileLayer || layer instanceof ImageLayer
        ? `Custom Layer subclass requires printableLayerFactory: ${layer.constructor.name}`
        : `Unsupported Layer type: ${layer.constructor.name}`;
    issues.push(layerNotPrintable(subject, message));
    return;
  }
  if (layer instanceof LayerGroup) {
    for (const [index, child] of layer.getLayers().getArray().entries()) {
      validateLayerTree(child, layerSubject(child, `${subject}/${index}`), contributes, visibility, issues, isManagedVector);
    }
    return;
  }
  if (layer instanceof VectorLayer) {
    const source = layer.getSource();
    if (!(source instanceof VectorSource)) issues.push(layerNotPrintable(subject, 'Vector Layer does not expose a printable VectorSource'));
    else if (!isManagedVector(layer)) {
      issues.push(
        layerNotPrintable(
          subject,
          'External VectorSource cannot prove through public OpenLayers APIs that the requested print extent is fully loaded; use an Engine-managed Vector Layer'
        )
      );
    }
    return;
  }
  if (layer instanceof TileLayer) {
    if (layer.getSource() === null) issues.push(layerNotPrintable(subject, 'Tile Layer does not expose a printable Source'));
    return;
  }
  if (layer instanceof ImageLayer) {
    if (!(layer.getSource() instanceof ImageSource)) issues.push(layerNotPrintable(subject, 'Image Layer does not expose a printable ImageSource'));
    return;
  }
  issues.push(layerNotPrintable(subject, `Unsupported Layer type: ${layer.constructor.name}`));
}

function layerNotPrintable(subject: string, message: string): PrintValidationIssue {
  return { code: 'layer-not-printable', message, subject };
}

function validateManagedVectorStyles(
  entry: Readonly<BusinessLayerEntry>,
  visibility: Readonly<PrintLayerVisibility>,
  dependencies: Readonly<PrintMapRendererDependencies>,
  issues: PrintValidationIssue[]
): void {
  const layer = entry.layer;
  if (!(layer instanceof VectorLayer) || !layerContributes(layer, true, visibility)) return;
  const layerId = dependencies.layerAdapter?.vectorLayerIdFor(layer);
  if (layerId === undefined || dependencies.binding === undefined) return;
  let canonical: ReturnType<FeatureBinding['captureCanonicalLayerFeatures']> = [];
  try {
    canonical = dependencies.binding.captureCanonicalLayerFeatures(layerId, {
      center: visibility.center,
      resolution: visibility.resolution,
      rotation: visibility.rotation
    });
    for (const { feature, structuredStyle } of canonical)
      freezeFeatureStyles(feature, feature.getStyleFunction(), visibility.resolution, feature, structuredStyle, visibility.projection, false);
  } catch (error) {
    issues.push(layerNotPrintable(entry.subject, error instanceof Error ? error.message : 'Vector Style cannot be frozen for printing'));
  } finally {
    for (const { feature } of canonical) disposeFeature(feature);
  }
}

function layerContributes(layer: BaseLayer, ancestorVisible: boolean, visibility: Readonly<PrintLayerVisibility>): boolean {
  const zoom = visibility.zoom;
  return (
    ancestorVisible &&
    layer.getVisible() &&
    layer.getOpacity() > 0 &&
    visibility.resolution >= layer.getMinResolution() &&
    visibility.resolution < layer.getMaxResolution() &&
    (zoom === undefined || (zoom > layer.getMinZoom() && zoom <= layer.getMaxZoom())) &&
    layerExtentIntersectsPrint(layerExtentInProjection(layer, visibility.projection), visibility.actualExtent, visibility.footprint)
  );
}

function layerExtentIntersectsPrint(
  layerExtent: readonly number[] | undefined,
  actualExtent: PrintExtent | undefined,
  footprint: PrintFootprint | undefined
): boolean {
  if (layerExtent === undefined || actualExtent === undefined || footprint === undefined) return true;
  if (layerExtent.length < 4 || layerExtent.some((value) => !Number.isFinite(value))) return true;
  if (layerExtent[2]! < actualExtent[0] || layerExtent[0]! > actualExtent[2] || layerExtent[3]! < actualExtent[1] || layerExtent[1]! > actualExtent[3]) {
    return false;
  }
  if (footprint.some((coordinate) => pointInExtent(coordinate, layerExtent))) return true;
  const corners = [
    [layerExtent[0]!, layerExtent[1]!],
    [layerExtent[2]!, layerExtent[1]!],
    [layerExtent[2]!, layerExtent[3]!],
    [layerExtent[0]!, layerExtent[3]!]
  ] as const;
  if (corners.some((corner) => pointInConvexFootprint(corner, footprint))) return true;
  for (let first = 0; first < footprint.length; first += 1) {
    const footprintStart = footprint[first]!;
    const footprintEnd = footprint[(first + 1) % footprint.length]!;
    for (let second = 0; second < corners.length; second += 1) {
      if (lineSegmentsIntersect(footprintStart, footprintEnd, corners[second]!, corners[(second + 1) % corners.length]!)) return true;
    }
  }
  return false;
}

function pointInExtent(point: readonly number[], extent: readonly number[]): boolean {
  return point[0]! >= extent[0]! && point[0]! <= extent[2]! && point[1]! >= extent[1]! && point[1]! <= extent[3]!;
}

function pointInConvexFootprint(point: readonly number[], footprint: PrintFootprint): boolean {
  let positive = false;
  let negative = false;
  for (let index = 0; index < footprint.length; index += 1) {
    const cross = segmentCross(footprint[index]!, footprint[(index + 1) % footprint.length]!, point);
    positive ||= cross > 1e-9;
    negative ||= cross < -1e-9;
    if (positive && negative) return false;
  }
  return true;
}

function lineSegmentsIntersect(first: readonly number[], second: readonly number[], third: readonly number[], fourth: readonly number[]): boolean {
  const firstSide = segmentCross(first, second, third);
  const secondSide = segmentCross(first, second, fourth);
  const thirdSide = segmentCross(third, fourth, first);
  const fourthSide = segmentCross(third, fourth, second);
  return (
    ((firstSide > 1e-9 && secondSide < -1e-9) || (firstSide < -1e-9 && secondSide > 1e-9)) &&
    ((thirdSide > 1e-9 && fourthSide < -1e-9) || (thirdSide < -1e-9 && fourthSide > 1e-9))
  );
}

function segmentCross(first: readonly number[], second: readonly number[], point: readonly number[]): number {
  return (second[0]! - first[0]!) * (point[1]! - first[1]!) - (second[1]! - first[1]!) * (point[0]! - first[0]!);
}

const frozenLayerExtents = new WeakMap<BaseLayer, Readonly<{ extent: PrintExtent; projection: Projection }>>();
const frozenFeatureGeometries = new WeakMap<Feature<Geometry>, Geometry>();
const frozenStyleGeometries = new WeakMap<Style, Geometry>();
const frozenFeatureStyles = new WeakMap<Feature<Geometry>, readonly Style[]>();
const snapshotResourceDescriptors = new WeakMap<object, readonly Readonly<PrintResourceDescriptor>[]>();

function layerExtentInProjection(layer: BaseLayer, projection: Projection): PrintExtent | undefined {
  const frozen = frozenLayerExtents.get(layer);
  if (frozen !== undefined && frozen.projection === projection) return frozen.extent;
  const extent = layer.getExtent();
  if (extent === undefined || extent.length < 4 || extent.slice(0, 4).some((value) => !Number.isFinite(value))) return undefined;
  const projected = fromUserExtent([extent[0]!, extent[1]!, extent[2]!, extent[3]!], projection);
  return [projected[0], projected[1], projected[2], projected[3]];
}

function freezeLayerClone<T extends BaseLayer>(clone: T, source: BaseLayer, projection: Projection): T {
  const extent = layerExtentInProjection(source, projection);
  if (extent !== undefined) frozenLayerExtents.set(clone, Object.freeze({ extent: Object.freeze([...extent]) as PrintExtent, projection }));
  return clone;
}

function prepareSnapshotForCurrentUserProjection(layers: readonly BaseLayer[], projection: Projection): void {
  const visit = (layer: BaseLayer): void => {
    const frozenExtent = frozenLayerExtents.get(layer);
    if (frozenExtent !== undefined) layer.setExtent(toUserExtent([...frozenExtent.extent], projection));
    if (layer instanceof LayerGroup) {
      for (const child of layer.getLayers().getArray()) visit(child);
      return;
    }
    if (!(layer instanceof VectorLayer)) return;
    const source = layer.getSource();
    if (!(source instanceof VectorSource)) return;
    for (const feature of source.getFeatures()) {
      const geometry = frozenFeatureGeometries.get(feature);
      if (geometry !== undefined) replaceFeatureGeometry(feature, toCurrentUserGeometry(geometry, projection));
      const styles = frozenFeatureStyles.get(feature) ?? [];
      for (const style of styles) {
        const styleGeometry = frozenStyleGeometries.get(style);
        if (styleGeometry !== undefined) replaceStyleGeometry(style, toCurrentUserGeometry(styleGeometry, projection));
      }
    }
  };
  for (const layer of layers) visit(layer);
}

function toCurrentUserGeometry(geometry: Geometry, projection: Projection): Geometry {
  const clone = geometry.clone();
  const userProjection = getUserProjection();
  if (userProjection !== null) clone.transform(projection, userProjection);
  return clone;
}

function replaceFeatureGeometry(feature: Feature<Geometry>, geometry: Geometry): void {
  const previous = feature.getGeometry();
  feature.setGeometry(geometry);
  if (previous !== undefined && previous !== geometry) previous.dispose();
}

function replaceStyleGeometry(style: Style, geometry: Geometry): void {
  const previous = style.getGeometry();
  style.setGeometry(geometry);
  if (previous instanceof Geometry && previous !== geometry) previous.dispose();
}

function cloneLayerTree(layer: BaseLayer, context: CloneContext, ancestorVisible: boolean): BaseLayer {
  const contributes = layerContributes(layer, ancestorVisible, context);
  if (!contributes) return freezeLayerClone(new LayerGroup({ layers: [], ...commonLayerOptions(layer, context.resolution, false) }), layer, context.projection);
  if (!hasStandardPrintableLayerConstructor(layer)) {
    throw new CapabilityError(`Layer requires printableLayerFactory because its render semantics cannot be projected safely: ${layer.constructor.name}`);
  }
  if (layer instanceof LayerGroup) {
    const children: BaseLayer[] = [];
    try {
      if (contributes) for (const child of layer.getLayers().getArray()) children.push(cloneLayerTree(child, context, true));
      return freezeLayerClone(new LayerGroup({ layers: children, ...commonLayerOptions(layer, context.resolution) }), layer, context.projection);
    } catch (error) {
      for (const child of children.splice(0)) disposeClone(child);
      throw error;
    }
  }
  if (layer instanceof VectorLayer) return cloneVectorLayer(layer, context);
  if (layer instanceof TileLayer) {
    const source = layer.getSource();
    if (source === null) throw new CapabilityError('Tile Layer does not expose a printable Source');
    return freezeLayerClone(
      new TileLayer({
        source,
        preload: layer.getPreload(),
        useInterimTilesOnError: layer.getUseInterimTilesOnError(),
        ...commonLayerOptions(layer, context.resolution)
      }),
      layer,
      context.projection
    );
  }
  if (layer instanceof ImageLayer) {
    const source = layer.getSource();
    if (!(source instanceof ImageSource)) throw new CapabilityError('Image Layer does not expose a printable ImageSource');
    return freezeLayerClone(new ImageLayer({ source, ...commonLayerOptions(layer, context.resolution) }), layer, context.projection);
  }
  throw new CapabilityError(`Layer is not printable through public OpenLayers APIs: ${layer.constructor.name}`);
}

function hasStandardPrintableLayerConstructor(layer: BaseLayer): boolean {
  return layer.constructor === LayerGroup || layer.constructor === VectorLayer || layer.constructor === TileLayer || layer.constructor === ImageLayer;
}

function countRenderableLeaves(layer: BaseLayer): number {
  if (layer instanceof LayerGroup) {
    return layer
      .getLayers()
      .getArray()
      .reduce((count, child) => count + countRenderableLeaves(child), 0);
  }
  return layer instanceof VectorLayer || layer instanceof TileLayer || layer instanceof ImageLayer ? 1 : 0;
}

function collectMapFontSamples(layers: readonly BaseLayer[], context: Readonly<CloneContext>): readonly Readonly<PrintFontSample>[] {
  const samples = new Map<string, string[]>();
  const visit = (layer: BaseLayer, ancestorClip: PrintExtent | null | undefined): void => {
    const clip = intersectLayerClip(ancestorClip, layerExtentInProjection(layer, context.projection));
    if (clip === null) return;
    if (layer instanceof LayerGroup) {
      for (const child of layer.getLayers().getArray()) visit(child, clip);
      return;
    }
    if (!(layer instanceof VectorLayer)) return;
    const source = layer.getSource();
    if (!(source instanceof VectorSource)) return;
    const layerStyle = layer.getStyleFunction();
    const worldWidth = source.getWrapX() ? context.worldWidth : undefined;
    const renderBuffer = layer.getRenderBuffer() ?? 100;
    const queryFootprint = expandPrintFootprint(context.footprint, renderBuffer * context.resolution);
    for (const feature of source.getFeatures()) {
      const resolved = (feature.getStyleFunction() ?? layerStyle)?.(feature, context.resolution);
      const styles = resolved === undefined ? [] : Array.isArray(resolved) ? resolved : [resolved];
      for (const style of styles) {
        if (style.getRenderer() !== null) {
          throw new CapabilityError('Map text fonts cannot be audited for a custom Vector Style renderer');
        }
        const text = style.getText();
        if (text === null || !hasRenderableText(text.getText())) continue;
        const geometry = style.getGeometryFunction()(feature);
        if (!(geometry instanceof Geometry)) {
          throw new CapabilityError('Map text fonts cannot be audited for a non-Geometry Vector Style target');
        }
        const visualClip = expandLayerClipForStyle(clip, style, context.resolution, context.rotation, renderBuffer);
        if (!geometryIntersectsWrappedPrintConstraints(geometry, queryFootprint, worldWidth, visualClip)) continue;
        addTextFontSamples(samples, text.getText(), text.getFont() ?? '10px sans-serif');
      }
    }
  };
  for (const layer of layers) visit(layer, undefined);
  return Object.freeze([...samples].map(([font, texts]) => Object.freeze({ font, text: texts.join('') })));
}

function hasRenderableText(text: string | readonly string[] | undefined): boolean {
  if (typeof text === 'string') return text.length > 0;
  if (!Array.isArray(text)) return false;
  for (let index = 0; index < text.length; index += 2) {
    if (text[index] !== undefined && text[index] !== '' && text[index] !== '\n') return true;
  }
  return false;
}

function addTextFontSamples(samples: Map<string, string[]>, text: string | readonly string[] | undefined, baseFont: string): void {
  if (typeof text === 'string') {
    if (text.length > 0) appendFontText(samples, baseFont, text);
    return;
  }
  if (!Array.isArray(text)) return;
  for (let index = 0; index < text.length; index += 2) {
    const segment = text[index];
    if (segment === undefined || segment === '' || segment === '\n') continue;
    appendFontText(samples, text[index + 1] || baseFont, segment);
  }
}

function appendFontText(samples: Map<string, string[]>, font: string, text: string): void {
  const texts = samples.get(font);
  if (texts === undefined) samples.set(font, [text]);
  else texts.push(text);
}

function intersectLayerClip(ancestor: PrintExtent | null | undefined, current: readonly number[] | undefined): PrintExtent | null | undefined {
  if (ancestor === null) return null;
  if (current === undefined) return ancestor;
  const normalized: PrintExtent = [current[0]!, current[1]!, current[2]!, current[3]!];
  if (ancestor === undefined) return normalized;
  const intersection: PrintExtent = [
    Math.max(ancestor[0], normalized[0]),
    Math.max(ancestor[1], normalized[1]),
    Math.min(ancestor[2], normalized[2]),
    Math.min(ancestor[3], normalized[3])
  ];
  return intersection[0] <= intersection[2] && intersection[1] <= intersection[3] ? intersection : null;
}

function expandPrintFootprint(footprint: PrintFootprint, distance: number): PrintFootprint {
  if (!Number.isFinite(distance) || distance <= 0) return footprint;
  const [topLeft, topRight, bottomRight, bottomLeft] = footprint;
  const horizontalLength = Math.hypot(topRight[0] - topLeft[0], topRight[1] - topLeft[1]);
  const verticalLength = Math.hypot(bottomRight[0] - topRight[0], bottomRight[1] - topRight[1]);
  if (horizontalLength <= 0 || verticalLength <= 0) return footprint;
  const right: Coordinate = [(topRight[0] - topLeft[0]) / horizontalLength, (topRight[1] - topLeft[1]) / horizontalLength];
  const down: Coordinate = [(bottomRight[0] - topRight[0]) / verticalLength, (bottomRight[1] - topRight[1]) / verticalLength];
  const corner = (point: Coordinate, horizontal: number, vertical: number): Coordinate => [
    point[0] + right[0] * horizontal + down[0] * vertical,
    point[1] + right[1] * horizontal + down[1] * vertical
  ];
  return [
    corner(topLeft, -distance, -distance),
    corner(topRight, distance, -distance),
    corner(bottomRight, distance, distance),
    corner(bottomLeft, -distance, distance)
  ];
}

function expandLayerClipForStyle(
  clip: PrintExtent | null | undefined,
  style: Style,
  resolution: number,
  viewRotation: number,
  unknownVisualFallbackPx = 0
): PrintExtent | null | undefined {
  if (clip === null || clip === undefined) return clip;
  let visual: readonly [number, number];
  let unknownImage = false;
  try {
    const image = style.getImage();
    unknownImage = image !== null && (image.getSize() === null || image.getAnchor() === null);
    visual = compiledStylesVisualFootprintPx([style], viewRotation, 'view');
  } catch {
    visual = [0, 0];
    unknownImage = style.getImage() !== null;
  }
  const fallback = unknownImage && Number.isFinite(unknownVisualFallbackPx) ? Math.max(0, unknownVisualFallbackPx) : 0;
  const x = Math.max(fallback, Number.isFinite(visual[0]) ? Math.max(0, visual[0]) : 0) * resolution;
  const y = Math.max(fallback, Number.isFinite(visual[1]) ? Math.max(0, visual[1]) : 0) * resolution;
  return [clip[0] - x, clip[1] - y, clip[2] + x, clip[3] + y];
}

function printWorldWidth(projection: ReturnType<View['getProjection']>): Readonly<{ worldWidth?: number }> {
  const extent = projection.getExtent();
  if (!projection.canWrapX() || extent === null) return {};
  const width = extent[2] - extent[0];
  return Number.isFinite(width) && width > 0 ? { worldWidth: width } : {};
}

function cloneVectorLayer(layer: VectorLayer<VectorSource<Feature<Geometry>>>, context: CloneContext): BaseLayer {
  const source = layer.getSource();
  if (!(source instanceof VectorSource)) throw new CapabilityError('Vector Layer does not expose a printable VectorSource');
  const layerId = context.layerAdapter?.vectorLayerIdFor(layer);
  if (layerId === undefined || context.binding === undefined) {
    const layerStyle = layer.getStyleFunction();
    const sourceFeatures = source.getFeatures();
    const renderOrder = layer.getRenderOrder();
    if (typeof renderOrder === 'function') {
      try {
        sourceFeatures.sort(renderOrder);
      } catch (cause) {
        throw new PrintError('render-failed', 'Print snapshot could not freeze the native VectorLayer render order', { cause });
      }
    }
    const features: Feature<Geometry>[] = [];
    let clonedSource: VectorSource<Feature<Geometry>> | undefined;
    let clone: VectorLayer<VectorSource<Feature<Geometry>>> | undefined;
    try {
      for (const feature of sourceFeatures) features.push(freezeExternalFeatureStyle(feature, layerStyle, context));
      clonedSource = new VectorSource({ features, wrapX: source.getWrapX() });
      clone = new VectorLayer({
        source: clonedSource,
        style: null,
        declutter: layer.getDeclutter(),
        renderBuffer: layer.getRenderBuffer(),
        updateWhileAnimating: layer.getUpdateWhileAnimating(),
        updateWhileInteracting: layer.getUpdateWhileInteracting(),
        ...commonLayerOptions(layer, context.resolution)
      });
      freezeLayerClone(clone, layer, context.projection);
      freezeVectorRenderOrder(clone, features);
      return clone;
    } catch (error) {
      if (clone !== undefined) disposeClone(clone);
      else {
        clonedSource?.clear(true);
        clonedSource?.dispose();
        for (const feature of features) disposeFeature(feature);
      }
      throw error;
    }
  }

  const canonical = context.binding.captureCanonicalLayerFeatures(layerId, {
    center: context.center,
    resolution: context.resolution,
    rotation: context.rotation
  });
  try {
    for (const { feature, structuredStyle } of canonical)
      freezeFeatureStyles(feature, feature.getStyleFunction(), context.resolution, feature, structuredStyle, context.projection, false);
  } catch (error) {
    for (const { feature } of canonical) disposeFeature(feature);
    throw error;
  }
  const animationElements = context.animation?.elements.filter(({ layerId: candidate }) => candidate === layerId) ?? [];
  if (animationElements.length === 0) {
    const clone = new VectorLayer({
      source: new VectorSource({ features: canonical.map(({ feature }) => feature), wrapX: source.getWrapX() }),
      style: null,
      declutter: layer.getDeclutter(),
      renderBuffer: layer.getRenderBuffer(),
      updateWhileAnimating: layer.getUpdateWhileAnimating(),
      updateWhileInteracting: layer.getUpdateWhileInteracting(),
      ...commonLayerOptions(layer, context.resolution)
    });
    freezeLayerClone(clone, layer, context.projection);
    freezeVectorRenderOrder(
      clone,
      canonical.map(({ feature }) => feature)
    );
    return clone;
  }
  if (context.styles === undefined) {
    for (const { feature } of canonical) disposeFeature(feature);
    throw new CapabilityError('Current-frame printing requires a structured StyleCompiler');
  }

  const canonicalById = new Map(canonical.map((item) => [item.elementId, item]));
  const animationByElement = new Map(animationElements.map((element) => [element.elementId, element]));
  const childLayers: BaseLayer[] = [];
  const releasedFeatures = new Set<Feature<Geometry>>();
  try {
    for (const element of animationElements) {
      if (!canonicalById.has(element.elementId)) {
        throw new CapabilityError(`Animation print target does not have a canonical Feature: ${element.elementId}`);
      }
    }
    const sorted = canonical
      .map((item) => {
        const animation = animationByElement.get(item.elementId);
        return Object.freeze({
          item,
          animation,
          targetZIndex: animation?.targetZIndex ?? canonicalFeatureZIndex(item.feature, context.resolution)
        });
      })
      .sort((left, right) => left.targetZIndex - right.targetZIndex || left.item.renderOrder - right.item.renderOrder);
    let pendingZIndex: number | undefined;
    let pendingFeatures: Feature<Geometry>[] = [];
    const flushCanonical = (): void => {
      if (pendingFeatures.length === 0 || pendingZIndex === undefined) return;
      const features = pendingFeatures;
      pendingFeatures = [];
      childLayers.push(createCanonicalFeaturesLayer(features, layer, source.getWrapX() === true));
      for (const feature of features) releasedFeatures.add(feature);
      pendingZIndex = undefined;
    };
    for (const { item, animation, targetZIndex } of sorted) {
      if (animation === undefined) {
        if (pendingZIndex !== undefined && pendingZIndex !== targetZIndex) flushCanonical();
        pendingZIndex = targetZIndex;
        pendingFeatures.push(item.feature);
        continue;
      }
      flushCanonical();
      if (!animation.replacesBase) {
        childLayers.push(createCanonicalFeaturesLayer([item.feature], layer, source.getWrapX() === true));
        releasedFeatures.add(item.feature);
      }
      if (animation?.presentation !== undefined && (animation.presentation.opacity ?? 1) > 0) {
        childLayers.push(
          createAnimationLayer(item.feature, animation.presentation, context.resolution, context.styles, source.getWrapX() === true, context.projection)
        );
      }
      const orderedPrimitives = [...(animation?.primitives ?? [])]
        .map((primitive, sequence) => ({ primitive, sequence }))
        .sort((left, right) => (left.primitive.style.zIndex ?? 0) - (right.primitive.style.zIndex ?? 0) || left.sequence - right.sequence);
      for (const { primitive } of orderedPrimitives) {
        if ((primitive.opacity ?? 1) > 0) {
          childLayers.push(createAnimationLayer(item.feature, primitive, context.resolution, context.styles, source.getWrapX() === true, context.projection));
        }
      }
      if (animation.replacesBase) {
        disposeFeature(item.feature);
        releasedFeatures.add(item.feature);
      }
    }
    flushCanonical();
    const groupOptions = commonLayerOptions(layer, context.resolution);
    const background = groupOptions.background;
    if (typeof background === 'string') {
      delete groupOptions.background;
      childLayers.unshift(new VectorLayer({ source: new VectorSource(), background, visible: true, opacity: 1 }));
    }
    return freezeLayerClone(new LayerGroup({ layers: childLayers, ...groupOptions }), layer, context.projection);
  } catch (error) {
    for (const childLayer of childLayers.splice(0)) disposeClone(childLayer);
    for (const { feature } of canonical) if (!releasedFeatures.has(feature)) disposeFeature(feature);
    throw error;
  }
}

function createCanonicalFeaturesLayer(
  features: readonly Feature<Geometry>[],
  template: VectorLayer<VectorSource<Feature<Geometry>>>,
  wrapX: boolean
): BaseLayer {
  const source = new VectorSource({ features: [...features], wrapX });
  try {
    const clone = new VectorLayer({
      source,
      style: null,
      declutter: template.getDeclutter(),
      renderBuffer: template.getRenderBuffer(),
      updateWhileAnimating: template.getUpdateWhileAnimating(),
      updateWhileInteracting: template.getUpdateWhileInteracting(),
      visible: true,
      opacity: 1
    });
    freezeVectorRenderOrder(clone, features);
    return clone;
  } catch (error) {
    source.clear(true);
    source.dispose();
    throw error;
  }
}

function freezeVectorRenderOrder(layer: VectorLayer<VectorSource<Feature<Geometry>>>, features: readonly Feature<Geometry>[]): void {
  const ranks = new WeakMap<FeatureLike, number>();
  for (const [rank, feature] of features.entries()) ranks.set(feature, rank);
  layer.setRenderOrder((left, right) => (ranks.get(left) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(right) ?? Number.MAX_SAFE_INTEGER));
}

function canonicalFeatureZIndex(feature: Feature<Geometry>, resolution: number): number {
  const resolved = feature.getStyleFunction()?.(feature, resolution);
  if (resolved === undefined) return 0;
  const styles = Array.isArray(resolved) ? resolved : [resolved];
  return styles.find(({ getZIndex }) => getZIndex() !== undefined)?.getZIndex() ?? 0;
}

function createAnimationLayer(
  maximumFeature: Feature<Geometry>,
  primitive: Readonly<LayerRenderPrimitive>,
  resolution: number,
  styles: StyleCompiler,
  wrapX: boolean,
  projection: Projection
): BaseLayer {
  const feature = new Feature<Geometry>();
  let compiled: ReturnType<StyleCompiler['compilePresentation']> | undefined;
  try {
    projectRenderGeometry(feature, primitive.geometry);
    compiled = styles.compilePresentation(primitive.style, maximumFeature);
    const resolved = compiled.resolve(feature, resolution, primitive.pathReveal);
    applyDynamicStyle(resolved, primitive.dynamicStyle, primitive.style);
    freezeFeatureStyles(feature, () => [...resolved], resolution, feature, true, projection, false);
    const source = new VectorSource<Feature<Geometry>>({ features: [feature], wrapX });
    return new VectorLayer({ source, style: null, visible: true, opacity: primitive.opacity ?? 1 });
  } catch (error) {
    disposeFeature(feature);
    throw error;
  } finally {
    compiled?.destroy();
  }
}

function commonLayerOptions(layer: BaseLayer, resolution: number, includeBackground = true): Record<string, unknown> {
  const extent = layer.getExtent();
  const background = includeBackground ? freezeLayerBackground(layer, resolution) : undefined;
  return {
    className: layer.getClassName(),
    visible: layer.getVisible(),
    opacity: layer.getOpacity(),
    zIndex: layer.getZIndex(),
    // Capture 已按活动 View 的公开 zoom/resolution 映射过滤；隐藏 View 中解除约束，避免自定义 resolutions 被第二次以另一套 zoom 映射过滤。
    minResolution: 0,
    maxResolution: Infinity,
    minZoom: -Infinity,
    maxZoom: Infinity,
    ...(extent === undefined ? {} : { extent: [...extent] }),
    ...(background === undefined ? {} : { background })
  };
}

function freezeLayerBackground(layer: BaseLayer, resolution: number): string | undefined {
  const background = layer.getBackground();
  if (background === undefined) return undefined;
  if (typeof background === 'string') return background;
  if (typeof background !== 'function') throw new CapabilityError('Layer background is not a printable color');
  let frozen: unknown;
  try {
    frozen = background(resolution);
  } catch (cause) {
    throw new CapabilityError(`Layer background function failed during print capture: ${errorMessage(cause)}`);
  }
  if (typeof frozen !== 'string') throw new CapabilityError('Layer background function must return a printable color string');
  return frozen;
}

function freezeExternalFeatureStyle(feature: Feature<Geometry>, layerStyle: StyleFunction | undefined, context: Readonly<CloneContext>): Feature<Geometry> {
  const clone = feature.clone();
  const id = feature.getId();
  if (id !== undefined) clone.setId(id);
  const styleFunction = feature.getStyleFunction() ?? layerStyle;
  try {
    freezeFeatureStyles(clone, styleFunction, context.resolution, feature, false, context.projection, true);
    return clone;
  } catch (cause) {
    disposeFeature(clone);
    if (cause instanceof CapabilityError) throw cause;
    throw new PrintError('render-failed', '打印快照无法解析图层样式。', { cause });
  }
}

function freezeFeatureStyles(
  feature: Feature<Geometry>,
  styleFunction: StyleFunction | undefined,
  resolution: number,
  styleTarget = feature,
  trustedStructuredStyle = false,
  projection?: Projection,
  sourceCoordinatesAreUser = false
): void {
  const featureGeometry = feature.getGeometry();
  if (featureGeometry !== undefined && projection !== undefined) {
    const frozenGeometry = cloneGeometryForSnapshot(featureGeometry, projection, sourceCoordinatesAreUser);
    frozenFeatureGeometries.set(feature, frozenGeometry);
    replaceFeatureGeometry(feature, frozenGeometry.clone());
  }
  if (styleFunction === undefined) {
    feature.setStyle(undefined);
    frozenFeatureStyles.set(feature, Object.freeze([]));
    return;
  }
  const resolved = styleFunction(styleTarget, resolution);
  const styles = resolved === undefined ? [] : Array.isArray(resolved) ? resolved : [resolved];
  const frozen: Style[] = [];
  try {
    for (const style of styles) {
      if (style.getRenderer() !== null) throw new CapabilityError('Vector Style custom renderer cannot be frozen for printing');
      const geometry = style.getGeometryFunction()(styleTarget);
      if (geometry === undefined) continue;
      if (!(geometry instanceof Geometry)) throw new CapabilityError('Vector Style target is not a printable Geometry');
      assertStyleResourcesFreezable(style, trustedStructuredStyle);
      const clone = style.clone();
      freezeStyleResources(style, clone);
      const frozenGeometry = projection === undefined ? geometry.clone() : cloneGeometryForSnapshot(geometry, projection, sourceCoordinatesAreUser);
      frozenStyleGeometries.set(clone, frozenGeometry);
      replaceStyleGeometry(clone, frozenGeometry.clone());
      frozen.push(clone);
    }
  } catch (error) {
    for (const style of frozen) disposeFrozenStyle(style);
    throw error;
  }
  feature.setStyle(frozen);
  frozenFeatureStyles.set(feature, Object.freeze(frozen));
}

function cloneGeometryForSnapshot(geometry: Geometry, projection: Projection, sourceCoordinatesAreUser: boolean): Geometry {
  const clone = geometry.clone();
  const userProjection = sourceCoordinatesAreUser ? getUserProjection() : null;
  if (userProjection !== null) clone.transform(userProjection, projection);
  return clone;
}

function freezeStyleResources(source: Style, target: Style): void {
  freezeFillColor(source.getFill(), target.getFill());
  freezeStrokeColor(source.getStroke(), target.getStroke());

  const sourceImage = source.getImage();
  const targetImage = target.getImage();
  if (sourceImage instanceof Icon) {
    if (!(targetImage instanceof Icon)) throw new CapabilityError('Vector Icon could not be cloned for printing');
  } else if (sourceImage instanceof RegularShape && targetImage instanceof RegularShape) {
    freezeFillColor(sourceImage.getFill(), targetImage.getFill());
    freezeStrokeColor(sourceImage.getStroke(), targetImage.getStroke());
  }

  const sourceText = source.getText();
  const targetText = target.getText();
  if (sourceText === null || targetText === null) return;
  const text = sourceText.getText();
  targetText.setText(Array.isArray(text) ? [...text] : text);
  const padding = sourceText.getPadding();
  targetText.setPadding(padding === null ? null : [...padding]);
  freezeFillColor(sourceText.getFill() instanceof Fill ? sourceText.getFill() : null, targetText.getFill() instanceof Fill ? targetText.getFill() : null);
  freezeStrokeColor(sourceText.getStroke(), targetText.getStroke());
  freezeFillColor(sourceText.getBackgroundFill(), targetText.getBackgroundFill());
  freezeStrokeColor(sourceText.getBackgroundStroke(), targetText.getBackgroundStroke());
}

function assertStyleResourcesFreezable(style: Style, trustedStructuredStyle: boolean): void {
  const image = style.getImage();
  if (image === null) return;
  if (!hasStandardImageStyleConstructor(image)) {
    throw new CapabilityError(`Custom Vector ImageStyle cannot be frozen for printing: ${image.constructor.name}`);
  }
  if (!(image instanceof Icon) || trustedStructuredStyle) return;
  throw new CapabilityError('External Icon image resources cannot be frozen without sharing mutable OpenLayers image cache state');
}

function hasStandardImageStyleConstructor(image: NonNullable<ReturnType<Style['getImage']>>): boolean {
  return image.constructor === Icon || image.constructor === RegularShape || image.constructor === CircleStyle;
}

function freezeFillColor(source: Fill | null, target: Fill | null): void {
  if (source === null) return;
  if (target === null) throw new CapabilityError('Vector Fill could not be cloned for printing');
  target.setColor(freezeFillColorValue(source.getColor()));
}

function freezeStrokeColor(source: Stroke | null, target: Stroke | null): void {
  if (source === null) return;
  if (target === null) throw new CapabilityError('Vector Stroke could not be cloned for printing');
  target.setColor(freezeStrokeColorValue(source.getColor()));
}

function freezeFillColorValue(color: ReturnType<Fill['getColor']>): ReturnType<Fill['getColor']> {
  if (color === null || typeof color === 'string') return color;
  if (Array.isArray(color)) return [...color];
  const pattern = cloneStructuredPatternFill(color);
  if (pattern !== undefined) return pattern;
  throw new CapabilityError('CanvasGradient, CanvasPattern, and object-backed Fill colors cannot be frozen for printing');
}

function freezeStrokeColorValue(color: ReturnType<Stroke['getColor']>): ReturnType<Stroke['getColor']> {
  if (color === undefined || typeof color === 'string') return color;
  if (Array.isArray(color)) return [...color];
  const pattern = cloneStructuredPatternFill(color);
  if (pattern !== undefined) return pattern;
  throw new CapabilityError('CanvasGradient and CanvasPattern Stroke colors cannot be frozen for printing');
}

function applyDynamicStyle(styles: readonly Style[], dynamic: LayerRenderDynamicStyle | undefined, styleInput: LayerRenderPrimitive['style']): void {
  const lineworkBasePhase = styleInput.linework?.tracks.length === 1 ? (styleInput.linework.tracks[0]?.stroke.lineDashOffset ?? 0) : undefined;
  let strokeIndex = 0;
  for (const style of styles) {
    const stroke = style.getStroke();
    const image = style.getImage();
    const imageStroke = image instanceof RegularShape ? image.getStroke() : undefined;
    if (stroke !== null) {
      if (dynamic?.lineDashOffset !== undefined && (dynamic.lineDashOffsetStrokeIndex === undefined || dynamic.lineDashOffsetStrokeIndex === strokeIndex)) {
        stroke.setLineDashOffset(
          lineworkBasePhase === undefined ? dynamic.lineDashOffset : (stroke.getLineDashOffset() ?? 0) + dynamic.lineDashOffset - lineworkBasePhase
        );
      }
      if (dynamic?.strokeWidth !== undefined) stroke.setWidth(dynamic.strokeWidth);
      strokeIndex += 1;
    }
    if (imageStroke !== null && imageStroke !== undefined && dynamic?.strokeWidth !== undefined) imageStroke.setWidth(dynamic.strokeWidth);
    if (image instanceof CircleStyle && dynamic?.symbolRadius !== undefined) image.setRadius(dynamic.symbolRadius);
    if (image !== null && dynamic?.rotation !== undefined) image.setRotation(dynamic.rotation);
  }
  if (dynamic?.lineDashOffsetStrokeIndex !== undefined && dynamic.lineDashOffsetStrokeIndex >= strokeIndex) {
    throw new CapabilityError('Animation lineDashOffset stroke index is outside the compiled print style');
  }
}

async function waitForRender(
  map: OlMap,
  timeoutMs: number,
  signal: AbortSignal,
  layers: readonly BaseLayer[],
  resolution: number,
  extent: PrintExtent,
  footprint: PrintFootprint
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let releaseResources = (): void => undefined;
    let hasResourceError = (): boolean => false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      unByKey(key);
      releaseResources();
      callback();
    };
    const onResourceError = (subject: string): void =>
      finish(() => reject(new PrintError('resource-load-failed', `Printable map resource failed to load: ${subject}`, { details: { subject } })));
    const projection = map.getView().getProjection();
    const resources = bindResourceErrors(layers, resolution, onResourceError, {
      extent,
      footprint,
      projection,
      rotation: map.getView().getRotation(),
      pixelRatio: map.getPixelRatio(),
      ...printWorldWidth(projection)
    });
    releaseResources = resources.release;
    hasResourceError = resources.hasError;
    const key = map.once('rendercomplete', () => {
      if (hasResourceError()) onResourceError('style-image');
      else finish(resolve);
    });
    const timeout = globalThis.setTimeout(
      () => finish(() => reject(new PrintError('resource-timeout', '等待打印地图资源就绪超时。', { details: { timeoutMs } }))),
      timeoutMs
    );
    const onAbort = (): void => finish(() => reject(cancelledError()));
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      map.renderSync();
    } catch (cause) {
      finish(() => reject(new PrintError('render-failed', '打印地图渲染失败。', { cause })));
    }
  });
}

interface PrintResourceInspection {
  readonly extent: PrintExtent;
  readonly footprint?: PrintFootprint;
  readonly projection: ReturnType<View['getProjection']>;
  readonly rotation?: number;
  readonly pixelRatio: number;
  readonly worldWidth?: number;
}

interface TileResourceBinding {
  readonly source: TileSource;
  readonly inspection: Readonly<PrintResourceInspection> | undefined;
}

interface ImageResourceBinding {
  readonly source: ImageSource;
  readonly inspection: Readonly<PrintResourceInspection> | undefined;
  readonly tracked: Set<ImageSourceEvent['image']>;
  readonly failed: Set<ImageSourceEvent['image']>;
}

export function bindResourceErrors(
  layers: readonly BaseLayer[],
  resolution: number,
  report: (subject: string) => void,
  inspection?: Readonly<PrintResourceInspection>
): Readonly<{ release(): void; hasError(): boolean }> {
  const keys: EventsKey[] = [];
  const images = new Set<NonNullable<ReturnType<Style['getImage']>>>();
  const tileBindings: TileResourceBinding[] = [];
  const imageBindings: ImageResourceBinding[] = [];
  const imageListeners = new Map<NonNullable<ReturnType<Style['getImage']>>, () => void>();
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    releaseKeys(keys);
    for (const [image, listener] of imageListeners) {
      try {
        image.unlistenImageChange(listener);
      } catch {
        // 一个 ImageStyle 的清理失败不能阻断其余已注册资源监听器的回滚。
      }
    }
    imageListeners.clear();
    images.clear();
    for (const binding of imageBindings) {
      binding.tracked.clear();
      binding.failed.clear();
    }
    tileBindings.splice(0);
    imageBindings.splice(0);
  };
  const visit = (layer: BaseLayer, ancestorVisible: boolean, path: string, ancestorClip: PrintExtent | null | undefined): void => {
    if (!ancestorVisible || !layer.getVisible() || layer.getOpacity() <= 0) return;
    const clip = intersectLayerClip(ancestorClip, inspection === undefined ? layer.getExtent() : layerExtentInProjection(layer, inspection.projection));
    if (clip === null) return;
    if (layer instanceof LayerGroup) {
      for (const [index, child] of layer.getLayers().getArray().entries()) visit(child, true, `${path}/${index}`, clip);
      return;
    }
    if (layer instanceof TileLayer) {
      const source = layer.getSource();
      if (source instanceof TileSource) {
        const effectiveInspection = intersectResourceInspection(inspection, clip);
        if (effectiveInspection === null) return;
        tileBindings.push({ source, inspection: effectiveInspection });
        keys.push(
          source.on('tileloaderror', (event) => {
            if (tileEventMatchesInspection(source, event, resolution, effectiveInspection)) report(path);
          })
        );
      }
      return;
    }
    if (layer instanceof ImageLayer) {
      const source = layer.getSource();
      if (source instanceof ImageSource) {
        const effectiveInspection = intersectResourceInspection(inspection, clip);
        if (effectiveInspection === null) return;
        const tracked = new Set<ImageSourceEvent['image']>();
        const failed = new Set<ImageSourceEvent['image']>();
        let imageResolution = resolution;
        if (effectiveInspection !== undefined) {
          const printImage = source.getImage([...effectiveInspection.extent], resolution, effectiveInspection.pixelRatio, effectiveInspection.projection);
          tracked.add(printImage);
          imageResolution = scalarImageResolution(printImage.getResolution());
        }
        imageBindings.push({ source, inspection: effectiveInspection, tracked, failed });
        keys.push(
          source.on('imageloadstart', (event) => {
            if (sourceImageMatchesInspection(event.image, imageResolution, effectiveInspection)) tracked.add(event.image);
          })
        );
        keys.push(
          source.on('imageloaderror', (event) => {
            if (!tracked.has(event.image)) return;
            failed.add(event.image);
            report(path);
          })
        );
      }
      return;
    }
    if (!(layer instanceof VectorLayer)) return;
    const source = layer.getSource();
    if (!(source instanceof VectorSource)) return;
    const layerStyle = layer.getStyleFunction();
    const worldWidth = source.getWrapX() ? inspection?.worldWidth : undefined;
    const renderBuffer = layer.getRenderBuffer() ?? 100;
    const queryFootprint = inspection?.footprint === undefined ? undefined : expandPrintFootprint(inspection.footprint, renderBuffer * resolution);
    for (const feature of source.getFeatures()) {
      const resolved = (feature.getStyleFunction() ?? layerStyle)?.(feature, resolution);
      const styles = resolved === undefined ? [] : Array.isArray(resolved) ? resolved : [resolved];
      for (const style of styles) {
        const image = style.getImage();
        if (image === null) continue;
        if (queryFootprint !== undefined) {
          const sourceGeometry = style.getGeometryFunction()(feature);
          const geometry = sourceGeometry instanceof Geometry ? geometryInViewProjection(sourceGeometry, inspection?.projection) : sourceGeometry;
          const visualClip = expandLayerClipForStyle(clip, style, resolution, inspection?.rotation ?? 0, renderBuffer);
          const matches = geometry instanceof Geometry && geometryIntersectsWrappedPrintConstraints(geometry, queryFootprint, worldWidth, visualClip);
          if (geometry instanceof Geometry && geometry !== sourceGeometry) geometry.dispose();
          if (!matches) continue;
        }
        images.add(image);
      }
    }
  };
  try {
    for (const [index, layer] of layers.entries()) visit(layer, true, `layer:${index}`, undefined);
    for (const image of images) {
      const listener = (): void => {
        if (image.getImageState() === ImageState.ERROR) report('style-image');
      };
      imageListeners.set(image, listener);
      image.listenImageChange(listener);
    }
  } catch (error) {
    release();
    throw error;
  }
  return Object.freeze({
    release,
    hasError() {
      return (
        [...images].some((image) => image.getImageState() === ImageState.ERROR) ||
        tileBindings.some(({ source, inspection: effectiveInspection }) => sourceHasCachedTileError(source, resolution, effectiveInspection)) ||
        imageBindings.some(
          ({ source, inspection: effectiveInspection, tracked, failed }) =>
            failed.size > 0 ||
            [...tracked].some((image) => image.getState() === ImageState.ERROR) ||
            sourceHasCachedImageError(source, resolution, effectiveInspection)
        )
      );
    }
  });
}

function geometryInViewProjection(geometry: Geometry, projection: Projection | undefined): Geometry {
  const userProjection = getUserProjection();
  if (projection === undefined || userProjection === null) return geometry;
  return geometry.clone().transform(userProjection, projection);
}

function intersectResourceInspection(
  inspection: Readonly<PrintResourceInspection> | undefined,
  clip: PrintExtent | undefined
): Readonly<PrintResourceInspection> | null | undefined {
  if (inspection === undefined || clip === undefined) return inspection;
  const extent = intersectLayerClip(inspection.extent, clip);
  if (extent === null || extent === undefined) return null;
  return Object.freeze({ ...inspection, extent });
}

function sourceHasCachedTileError(source: TileSource, resolution: number, inspection: Readonly<PrintResourceInspection> | undefined): boolean {
  if (source.getState() === 'error') return true;
  if (inspection === undefined) return false;
  const grid = source.getTileGridForProjection(inspection.projection);
  const zoom = grid.getZForResolution(resolution, source.zDirection);
  const tileRange = grid.getTileRangeForExtentAndZ([...inspection.extent], zoom);
  for (let x = tileRange.minX; x <= tileRange.maxX; x += 1) {
    for (let y = tileRange.minY; y <= tileRange.maxY; y += 1) {
      if (source.getTile(zoom, x, y, inspection.pixelRatio, inspection.projection)?.getState() === TileState.ERROR) return true;
    }
  }
  return false;
}

function sourceHasCachedImageError(source: ImageSource, resolution: number, inspection: Readonly<PrintResourceInspection> | undefined): boolean {
  if (source.getState() === 'error') return true;
  if (inspection === undefined) return false;
  return source.getImage([...inspection.extent], resolution, inspection.pixelRatio, inspection.projection)?.getState() === ImageState.ERROR;
}

function tileEventMatchesInspection(
  source: TileSource,
  event: TileSourceEvent,
  resolution: number,
  inspection: Readonly<PrintResourceInspection> | undefined
): boolean {
  if (inspection === undefined) return false;
  try {
    const grid = source.getTileGridForProjection(inspection.projection);
    const zoom = grid.getZForResolution(resolution, source.zDirection);
    const [eventZoom, x, y] = event.tile.getTileCoord();
    if (eventZoom !== zoom) return false;
    const range = grid.getTileRangeForExtentAndZ([...inspection.extent], zoom);
    return x >= range.minX && x <= range.maxX && y >= range.minY && y <= range.maxY;
  } catch {
    return false;
  }
}

function sourceImageMatchesInspection(
  image: ImageSourceEvent['image'],
  resolution: number,
  inspection: Readonly<PrintResourceInspection> | undefined
): boolean {
  if (inspection === undefined) return false;
  try {
    const extent = image.getExtent();
    const target = inspection.extent;
    const actualResolution = scalarImageResolution(image.getResolution());
    const resolutionTolerance = Math.max(1, Math.abs(resolution)) * 1e-9;
    if (!Number.isFinite(actualResolution) || Math.abs(actualResolution - resolution) > resolutionTolerance) return false;
    const tolerance = Math.abs(resolution) * 2 + Math.max(1, ...target.map(Math.abs)) * Number.EPSILON * 64;
    return extent[0] <= target[0] + tolerance && extent[1] <= target[1] + tolerance && extent[2] >= target[2] - tolerance && extent[3] >= target[3] - tolerance;
  } catch {
    return false;
  }
}

function scalarImageResolution(resolution: number | readonly number[]): number {
  return typeof resolution === 'number' ? resolution : Math.min(...resolution);
}

export function composeMapCanvases(
  target: HTMLElement,
  width: number,
  height: number,
  cssWidth = readCssPixels(target.style.width, width),
  cssHeight = readCssPixels(target.style.height, height),
  allowEmpty = false
): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  if (context === null) throw new CapabilityError('Canvas 2D is unavailable');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  const canvases = [...target.querySelectorAll<HTMLCanvasElement>('canvas')];
  if (canvases.length === 0) {
    if (allowEmpty) return output;
    throw new PrintError('render-failed', 'OpenLayers 未生成可打印的地图画布。');
  }
  const outputScaleX = width / cssWidth;
  const outputScaleY = height / cssHeight;
  for (const canvas of canvases) {
    if (canvas.width === 0 || canvas.height === 0) continue;
    assertSupportedLayerCompositing(canvas);
    context.save();
    let layerSurface: HTMLCanvasElement | undefined;
    try {
      applyLayerElementClip(context, canvas, outputScaleX, outputScaleY, cssWidth, cssHeight);
      context.globalAlpha = canvasOpacity(canvas);
      const transform = parseTransform(canvas.style.transform);
      if (transform === undefined) {
        context.setTransform(width / canvas.width, 0, 0, height / canvas.height, 0, 0);
      } else {
        context.setTransform(
          transform[0] * outputScaleX,
          transform[1] * outputScaleY,
          transform[2] * outputScaleX,
          transform[3] * outputScaleY,
          transform[4] * outputScaleX,
          transform[5] * outputScaleY
        );
      }
      const background = canvasLayerBackground(canvas);
      if (background !== undefined) {
        layerSurface = composeLayerSurface(canvas, background);
      }
      context.drawImage(layerSurface ?? canvas, 0, 0);
    } finally {
      context.restore();
      if (layerSurface !== undefined) {
        layerSurface.width = 1;
        layerSurface.height = 1;
      }
    }
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  return output;
}

function composeLayerSurface(canvas: HTMLCanvasElement, background: string): HTMLCanvasElement {
  const surface = document.createElement('canvas');
  surface.width = canvas.width;
  surface.height = canvas.height;
  const context = surface.getContext('2d');
  if (context === null) {
    surface.width = 1;
    surface.height = 1;
    throw new CapabilityError('Canvas 2D is unavailable for Layer background composition');
  }
  context.globalAlpha = 1;
  context.fillStyle = background;
  context.fillRect(0, 0, surface.width, surface.height);
  context.drawImage(canvas, 0, 0);
  return surface;
}

function assertSupportedLayerCompositing(canvas: HTMLCanvasElement): void {
  const layerElement = canvas.closest<HTMLElement>('.ol-layer') ?? canvas.parentElement;
  const computed = layerElement !== null && typeof globalThis.getComputedStyle === 'function' ? globalThis.getComputedStyle(layerElement) : undefined;
  const filter = layerElement?.style.filter || canvas.style.filter || computed?.filter;
  const blendMode = layerElement?.style.mixBlendMode || canvas.style.mixBlendMode || computed?.mixBlendMode;
  if ((filter !== undefined && filter !== '' && filter !== 'none') || (blendMode !== undefined && blendMode !== '' && blendMode !== 'normal')) {
    throw new PrintError('render-failed', 'Layer CSS filter or blend mode cannot be reproduced by the printable Canvas compositor');
  }
}

function canvasLayerBackground(canvas: HTMLCanvasElement): string | undefined {
  const layerElement = canvas.closest<HTMLElement>('.ol-layer') ?? canvas.parentElement;
  if (layerElement === null) return undefined;
  let background = layerElement.style.backgroundColor;
  if ((background === '' || background === 'transparent') && typeof globalThis.getComputedStyle === 'function') {
    background = globalThis.getComputedStyle(layerElement).backgroundColor;
  }
  return background === '' || background === 'transparent' || background === 'rgba(0, 0, 0, 0)' ? undefined : background;
}

function applyLayerElementClip(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  outputScaleX: number,
  outputScaleY: number,
  cssWidth: number,
  cssHeight: number
): void {
  const layerElement = canvas.closest<HTMLElement>('.ol-layer') ?? canvas.parentElement;
  if (layerElement === null) return;
  const clip = parseCssClipRect(layerElement.style.clip, cssWidth, cssHeight) ?? parseCssInset(layerElement.style.clipPath, cssWidth, cssHeight);
  if (clip === undefined) return;
  context.beginPath();
  context.rect(clip.left * outputScaleX, clip.top * outputScaleY, (clip.right - clip.left) * outputScaleX, (clip.bottom - clip.top) * outputScaleY);
  context.clip();
}

function parseCssClipRect(value: string, width: number, height: number): Readonly<{ top: number; right: number; bottom: number; left: number }> | undefined {
  const match = /^rect\(([^)]+)\)$/u.exec(value.trim());
  if (match === null) return undefined;
  const values = match[1]!.split(/[ ,]+/u).filter(Boolean).map(cssClipLength);
  if (values.length !== 4 || values.some((candidate) => candidate === undefined)) return undefined;
  const [top, right, bottom, left] = values as number[];
  return { top: Math.max(0, top), right: Math.min(width, right), bottom: Math.min(height, bottom), left: Math.max(0, left) };
}

function parseCssInset(value: string, width: number, height: number): Readonly<{ top: number; right: number; bottom: number; left: number }> | undefined {
  const match = /^inset\(([^)]+)\)$/u.exec(value.trim());
  if (match === null) return undefined;
  const parsed = match[1]!.split(/\s+/u).filter(Boolean).map(cssClipLength);
  if (parsed.length < 1 || parsed.length > 4 || parsed.some((candidate) => candidate === undefined)) return undefined;
  const values = parsed as number[];
  const [top, right, bottom, left] =
    values.length === 1
      ? [values[0]!, values[0]!, values[0]!, values[0]!]
      : values.length === 2
        ? [values[0]!, values[1]!, values[0]!, values[1]!]
        : values.length === 3
          ? [values[0]!, values[1]!, values[2]!, values[1]!]
          : [values[0]!, values[1]!, values[2]!, values[3]!];
  return { top, right: width - right, bottom: height - bottom, left };
}

function cssClipLength(value: string): number | undefined {
  if (value === 'auto') return undefined;
  const match = /^(-?\d+(?:\.\d+)?)px$/u.exec(value);
  if (match === null) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function canvasOpacity(canvas: HTMLCanvasElement): number {
  const raw = canvas.parentElement?.style.opacity || canvas.style.opacity;
  if (raw === undefined || raw === '') return 1;
  const opacity = Number(raw);
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
}

function readCssPixels(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseTransform(value: string): readonly [number, number, number, number, number, number] | undefined {
  const match = /^matrix\(([^)]+)\)$/.exec(value.trim());
  if (match === null) return undefined;
  const values = match[1].split(',').map(Number);
  return values.length === 6 && values.every(Number.isFinite) ? (values as [number, number, number, number, number, number]) : undefined;
}

function assertCanvasReadable(canvas: HTMLCanvasElement, descriptors: readonly Readonly<PrintResourceDescriptor>[]): void {
  try {
    canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
  } catch (cause) {
    throw createCorsTaintedCanvasError(cause, descriptors);
  }
}

function bindLayerTree(layer: BaseLayer, keys: EventsKey[], changed: () => void, includeGenericChange: boolean): void {
  keys.push(layer.on('propertychange', changed));
  if (includeGenericChange) keys.push(layer.on('change', changed));
  if (layer instanceof LayerGroup) {
    keys.push(layer.getLayers().on('add', changed));
    keys.push(layer.getLayers().on('remove', changed));
    for (const child of layer.getLayers().getArray()) bindLayerTree(child, keys, changed, includeGenericChange);
    return;
  }
  if (layer instanceof VectorLayer) {
    const source = layer.getSource();
    if (source instanceof VectorSource) {
      keys.push(source.on('addfeature', changed));
      keys.push(source.on('removefeature', changed));
      keys.push(source.on('changefeature', changed));
      keys.push(source.on('clear', changed));
      keys.push(source.on('propertychange', changed));
      if (includeGenericChange) keys.push(source.on('change', changed));
    }
    return;
  }
  if (layer instanceof TileLayer) {
    const source = layer.getSource();
    if (source !== null) {
      keys.push(source.on('propertychange', changed));
      // TileSource 的 change 表示 URL、参数、key 或 refresh 等内容 revision；tileload* 进度使用独立事件，不应让会话在自身加载期间失效。
      keys.push(source.on('change', changed));
    }
    return;
  }
  if (layer instanceof ImageLayer) {
    const source = layer.getSource();
    if (source instanceof ImageSource) {
      keys.push(source.on('propertychange', changed));
      // Image load progress/error uses imageload*；change 只表达 URL、参数或 refresh 等内容变化。
      keys.push(source.on('change', changed));
    }
  }
}

function releaseKeys(keys: EventsKey[]): void {
  for (const key of keys.splice(0)) {
    try {
      unByKey(key);
    } catch {
      // 已释放的 Observable 不阻断其余打印资源清理。
    }
  }
}

function layerSubject(layer: BaseLayer, fallback: string): string {
  const id = layer.get('id');
  return typeof id === 'string' && id.length > 0 ? id : fallback;
}

function disposeFeature(feature: Feature<Geometry>): void {
  const geometry = feature.getGeometry();
  feature.setGeometry(undefined);
  geometry?.dispose();
  const frozenGeometry = frozenFeatureGeometries.get(feature);
  frozenFeatureGeometries.delete(feature);
  frozenGeometry?.dispose();
  for (const style of frozenFeatureStyles.get(feature) ?? []) disposeFrozenStyle(style);
  frozenFeatureStyles.delete(feature);
  feature.setStyle(undefined);
  feature.dispose();
}

function disposeFrozenStyle(style: Style): void {
  const geometry = style.getGeometry();
  style.setGeometry(null);
  if (geometry instanceof Geometry) geometry.dispose();
  const frozenGeometry = frozenStyleGeometries.get(style);
  frozenStyleGeometries.delete(style);
  frozenGeometry?.dispose();
}

function disposeClone(layer: BaseLayer): void {
  frozenLayerExtents.delete(layer);
  if (layer instanceof LayerGroup) {
    const children = [...layer.getLayers().getArray()];
    layer.getLayers().clear();
    for (const child of children) disposeClone(child);
  } else if (layer instanceof VectorLayer) {
    const source = layer.getSource();
    if (source instanceof VectorSource) {
      const features = source.getFeatures();
      source.clear(true);
      for (const feature of features) disposeFeature(feature);
      source.dispose();
    }
  }
  layer.dispose();
}

function cancelledError(): PrintError {
  return new PrintError('cancelled', '打印地图渲染已取消。');
}
