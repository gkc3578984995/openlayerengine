import {
  useEarth,
  type AnimationHandle,
  type Coordinate,
  type DrawSession,
  type Earth,
  type EditSession,
  type Element,
  type MeasureResult,
  type MeasureSession,
  type MeasureType,
  type ShapeState,
  type ShapeType,
  type TransformEventMap,
  type TransformSession
} from '../../src/index.ts';
import '../../src/assets/style/public.scss';

type MapName = 'a' | 'b';
type ProbeTarget = MapName | 'outside' | 'old-a';

interface ListenerRecord {
  readonly listener: EventListenerOrEventListenerObject;
  readonly capture: boolean;
}

interface SerializableMeasureResult {
  readonly type: MeasureType;
  readonly value: number;
  readonly unit: MeasureResult['unit'];
  readonly formatted: string;
  readonly coordinateCount: number;
  readonly segmentCount: number;
}

interface Runtime {
  readonly earth: Earth;
  readonly target: HTMLElement;
  readonly animationHandles: Set<AnimationHandle>;
  draw?: DrawSession;
  edit?: EditSession;
  measure?: MeasureSession;
  transform?: TransformSession;
  drawEvents: unknown[];
  editEvents: unknown[];
  measureEvents: unknown[];
  transformEvents: unknown[];
  editOriginal?: ShapeState;
}

interface NativeFeatureProbe {
  get(key: string): unknown;
}

interface NativeSourceProbe {
  getFeatures(): readonly NativeFeatureProbe[];
}

interface BrowserFixture {
  readonly ready: boolean;
  snapshot(name: MapName): unknown;
  globalSnapshot(): unknown;
  registryKeys(): readonly string[];
  sameEarth(name: MapName): boolean;
  armContextMenuProbe(target: ProbeTarget): void;
  readContextMenuProbe(target: ProbeTarget): Readonly<{ received: boolean; defaultPrevented: boolean }> | undefined;
  startDraw(type: ShapeType): unknown;
  drawSummary(): unknown;
  startEdit(elementId: string): unknown;
  editSummary(): unknown;
  startMeasure(type: MeasureType): unknown;
  cancelMeasure(): void;
  clearMeasurements(): void;
  measureSummary(): unknown;
  ensureTransformElement(): string;
  ensureTransformStaleTarget(): string;
  startTransformByClick(): unknown;
  startTransformDirect(toolbar?: boolean): unknown;
  armTransformOnNextMapClick(): void;
  deferredSingleClickCount(): number;
  transformSummary(): unknown;
  transformPixels(): unknown;
  hideTransformToolbar(): void;
  finishTransform(): void;
  cancelTransform(): void;
  registerMenus(elementId?: string): void;
  closeMenu(): void;
  elementPixel(elementId: string, controlPointIndex?: number): readonly [number, number];
  elementState(elementId: string): unknown;
  destroyA(preserveViewport?: boolean): Promise<void>;
  recreateDefaultA(): unknown;
  createCycleEarth(): unknown;
  prepareCycleResources(): unknown;
  cycleSummary(): unknown;
}

declare global {
  interface Window {
    __OL_ENGINE_TEST__: BrowserFixture;
    __OL_ENGINE_TEST_REGISTRY_KEYS__?: () => readonly string[];
  }
}

const listeners = new WeakMap<EventTarget, Map<string, ListenerRecord[]>>();
const nativeAddEventListener = EventTarget.prototype.addEventListener;
const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;

Object.defineProperties(EventTarget.prototype, {
  addEventListener: {
    configurable: true,
    writable: true,
    value(this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
      if (listener !== null) trackListener(this, type, listener, captureOf(options));
      nativeAddEventListener.call(this, type, listener, options);
    }
  },
  removeEventListener: {
    configurable: true,
    writable: true,
    value(this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
      if (listener !== null) untrackListener(this, type, listener, captureOf(options));
      nativeRemoveEventListener.call(this, type, listener, options);
    }
  }
});

const outside = requireElement('outside');
const mapATarget = requireElement('map-a');
const mapBTarget = requireElement('map-b');
const contextMenuProbes = new Map<ProbeTarget, Readonly<{ received: boolean; defaultPrevented: boolean }>>();
let oldAViewport: HTMLElement | undefined;
let deferredSingleClickCount = 0;
let a = createRuntime(
  useEarth({
    target: mapATarget,
    view: { center: [0, 0], zoom: 3 },
    controls: { zoom: false, rotate: false, attribution: false }
  })
);
const b = createRuntime(
  useEarth({
    id: 'map-b',
    target: mapBTarget,
    view: { center: [0, 0], zoom: 3 },
    controls: { zoom: false, rotate: false, attribution: false }
  })
);

render(a);
render(b);

window.__OL_ENGINE_TEST__ = Object.freeze<BrowserFixture>({
  ready: true,
  snapshot(name) {
    return runtimeSnapshot(runtime(name));
  },
  globalSnapshot,
  registryKeys,
  sameEarth(name) {
    const current = runtime(name).earth;
    return name === 'a' ? useEarth() === current : useEarth('map-b') === current;
  },
  armContextMenuProbe(target) {
    const element = probeElement(target);
    contextMenuProbes.delete(target);
    const listener = (event: Event): void => {
      element.removeEventListener('contextmenu', listener);
      contextMenuProbes.set(target, Object.freeze({ received: true, defaultPrevented: event.defaultPrevented }));
    };
    element.addEventListener('contextmenu', listener);
  },
  readContextMenuProbe(target) {
    return contextMenuProbes.get(target);
  },
  startDraw(type) {
    endExclusiveSessions(a);
    a.drawEvents = [];
    const session = a.earth.draw.start({ type, layerId: 'default' });
    a.draw = session;
    session.on('start', (event) => a.drawEvents.push({ type: event.type, coordinate: [...event.coordinate] }));
    session.on('click', (event) => a.drawEvents.push({ type: event.type, controlPointCount: event.controlPointCount }));
    session.on('change', (event) => a.drawEvents.push({ type: event.type, geometry: cloneGeometry(event.geometry) }));
    session.on('complete', (event) =>
      a.drawEvents.push({ type: event.type, elementId: event.element.id, geometry: cloneGeometry(event.element.state.geometry) })
    );
    session.on('cancel', (event) => a.drawEvents.push({ type: event.type, reason: event.reason }));
    return drawSummary(a);
  },
  drawSummary() {
    return drawSummary(a);
  },
  startEdit(elementId) {
    endExclusiveSessions(a);
    const element = requireOwnedElement(a, elementId);
    a.editEvents = [];
    a.editOriginal = cloneGeometry(element.state.geometry);
    const session = a.earth.draw.edit(element);
    a.edit = session;
    session.on('modifying', (event) =>
      a.editEvents.push({ type: event.type, operation: event.operation, geometry: cloneGeometry(event.geometry), coordinate: event.coordinate })
    );
    session.on('complete', (event) =>
      a.editEvents.push({ type: event.type, elementId: event.element.id, geometry: cloneGeometry(event.element.state.geometry) })
    );
    session.on('cancel', (event) => a.editEvents.push({ type: event.type, reason: event.reason }));
    return editSummary(a);
  },
  editSummary() {
    return editSummary(a);
  },
  startMeasure(type) {
    endExclusiveSessions(a);
    a.measureEvents = [];
    const session = a.earth.measure.start({ type, precision: 2, showTotal: true });
    a.measure = session;
    session.on('change', (event) => a.measureEvents.push({ type: event.type, result: serializeMeasureResult(event.result) }));
    session.on('complete', (event) => a.measureEvents.push({ type: event.type, result: serializeMeasureResult(event.result) }));
    session.on('cancel', (event) => a.measureEvents.push({ type: event.type, reason: event.reason }));
    return measureSummary(a);
  },
  cancelMeasure() {
    a.measure?.cancel();
  },
  clearMeasurements() {
    a.earth.measure.clear();
  },
  measureSummary() {
    return measureSummary(a);
  },
  ensureTransformElement() {
    const existing = a.earth.elements.get('transform-rectangle');
    if (existing !== undefined) return existing.id;
    const first = coordinateAtPixel(a, [180, 350]);
    const second = coordinateAtPixel(a, [360, 350]);
    const third = coordinateAtPixel(a, [270, 190]);
    return a.earth.elements.add({
      id: 'transform-rectangle',
      module: 'browser-transform',
      geometry: { type: 'polygon', controlPoints: [first, second, third] },
      style: {
        strokes: [{ color: '#2563eb', width: 3 }],
        fill: { type: 'solid', color: 'rgba(37, 99, 235, 0.22)' }
      }
    }).id;
  },
  ensureTransformStaleTarget() {
    const existing = a.earth.elements.get('transform-stale-target');
    if (existing !== undefined) return existing.id;
    return a.earth.elements.add({
      id: 'transform-stale-target',
      module: 'browser-transform-stale',
      geometry: { type: 'point', controlPoints: [coordinateAtPixel(a, [450, 300])] },
      style: { symbol: { type: 'circle', radius: 9, fill: { type: 'solid', color: '#dc2626' } } }
    }).id;
  },
  startTransformByClick() {
    endExclusiveSessions(a);
    a.transformEvents = [];
    a.transform = a.earth.transform.start(transformOptions(false));
    subscribeTransform(a, a.transform);
    return transformSummary(a);
  },
  startTransformDirect(toolbar = true) {
    endExclusiveSessions(a);
    const element = requireOwnedElement(a, 'transform-rectangle');
    a.transformEvents = [];
    a.transform = a.earth.transform.select(element, transformOptions(toolbar));
    subscribeTransform(a, a.transform);
    return transformSummary(a);
  },
  armTransformOnNextMapClick() {
    endExclusiveSessions(a);
    deferredSingleClickCount = 0;
    a.earth.map.once('singleclick', () => {
      deferredSingleClickCount += 1;
    });
    a.earth.map.once('click', () => {
      const element = requireOwnedElement(a, 'transform-rectangle');
      a.transformEvents = [];
      a.transform = a.earth.transform.select(element, transformOptions(false));
      subscribeTransform(a, a.transform);
    });
  },
  deferredSingleClickCount() {
    return deferredSingleClickCount;
  },
  transformSummary() {
    return transformSummary(a);
  },
  transformPixels() {
    return transformPixels(a);
  },
  hideTransformToolbar() {
    a.transform?.toolbar?.hide();
  },
  finishTransform() {
    a.transform?.finish();
  },
  cancelTransform() {
    a.transform?.cancel();
  },
  registerMenus(elementId) {
    a.earth.contextMenu.register('map', { items: [{ key: 'map-action', label: '地图菜单操作' }] });
    if (elementId !== undefined) {
      const element = requireOwnedElement(a, elementId);
      a.earth.contextMenu.register(element, { items: [{ key: 'element-action', label: '元素菜单操作' }] });
    }
  },
  closeMenu() {
    a.earth.contextMenu.close();
  },
  elementPixel(elementId, controlPointIndex = 0) {
    const state = requireOwnedElement(a, elementId).state.geometry;
    const coordinate = state.type === 'circle' ? state.center : state.controlPoints[controlPointIndex];
    if (coordinate === undefined) throw new Error(`Element control point does not exist: ${elementId}/${controlPointIndex}`);
    return pixelOf(a, coordinate);
  },
  elementState(elementId) {
    return cloneGeometry(requireOwnedElement(a, elementId).state.geometry);
  },
  async destroyA(preserveViewport = false) {
    const viewport = a.earth.map.getViewport();
    a.earth.destroy();
    await settleAnimationHandles(a);
    if (preserveViewport) {
      oldAViewport?.remove();
      oldAViewport = viewport;
      oldAViewport.dataset.testid = 'old-map-a-viewport';
      mapATarget.append(oldAViewport);
    }
  },
  recreateDefaultA() {
    oldAViewport?.remove();
    oldAViewport = undefined;
    a = createRuntime(
      useEarth({
        target: mapATarget,
        view: { center: [0, 0], zoom: 3 },
        controls: { zoom: false, rotate: false, attribution: false }
      })
    );
    render(a);
    return runtimeSnapshot(a);
  },
  createCycleEarth() {
    oldAViewport?.remove();
    oldAViewport = undefined;
    if (!a.earth.isDestroyed) a.earth.destroy();
    a = createRuntime(
      useEarth({
        id: 'cycle-earth',
        target: mapATarget,
        view: { center: [0, 0], zoom: 3 },
        controls: { zoom: false, rotate: false, attribution: false }
      })
    );
    render(a);
    return runtimeSnapshot(a);
  },
  prepareCycleResources() {
    const point = a.earth.elements.add({
      id: 'cycle-point',
      geometry: { type: 'point', controlPoints: [coordinateAtPixel(a, [100, 100])] },
      style: { symbol: { type: 'circle', radius: 7, fill: { type: 'solid', color: '#ef4444' } } }
    });
    const animation = a.earth.animations.play({ id: point.id }, { type: 'pulse', periodMs: 240, repeat: true });
    trackAnimation(a, animation);
    const first = coordinateAtPixel(a, [180, 350]);
    const second = coordinateAtPixel(a, [360, 350]);
    const third = coordinateAtPixel(a, [270, 190]);
    const rectangle = a.earth.elements.add({
      id: 'transform-rectangle',
      geometry: { type: 'polygon', controlPoints: [first, second, third] },
      style: {
        strokes: [{ color: '#2563eb', width: 3 }],
        fill: { type: 'solid', color: 'rgba(37, 99, 235, 0.22)' }
      }
    });
    a.earth.contextMenu.register('map', { items: [{ key: 'cycle-map-action', label: '循环地图菜单' }] });
    return Object.freeze({ pointId: point.id, rectangleId: rectangle.id, snapshot: runtimeSnapshot(a) });
  },
  cycleSummary() {
    return Object.freeze({ snapshot: runtimeSnapshot(a), transform: transformSummary(a), measure: measureSummary(a) });
  }
});

function transformOptions(toolbar: boolean) {
  return Object.freeze({
    translate: 'feature' as const,
    scale: true,
    stretch: false,
    rotate: true,
    buffer: 16,
    pointRadius: 8,
    toolbar
  });
}

function createRuntime(earth: Earth): Runtime {
  return {
    earth,
    target: earth.map.getTargetElement(),
    animationHandles: new Set(),
    drawEvents: [],
    editEvents: [],
    measureEvents: [],
    transformEvents: []
  };
}

function runtime(name: MapName): Runtime {
  return name === 'a' ? a : b;
}

function render(current: Runtime): void {
  current.earth.map.updateSize();
  current.earth.map.renderSync();
}

function runtimeSnapshot(current: Runtime): unknown {
  const { earth, target } = current;
  const viewport = earth.map.getViewport();
  return Object.freeze({
    lifecycle: earth.lifecycle,
    isDestroyed: earth.isDestroyed,
    registryKeys: registryKeys(),
    map: Object.freeze({
      targetAttached: earth.map.getTargetElement() === target,
      size: earth.map.getSize() === undefined ? undefined : [...(earth.map.getSize() as [number, number])],
      layers: earth.map.getLayers().getLength(),
      interactions: earth.map.getInteractions().getLength(),
      overlays: earth.map.getOverlays().getLength(),
      controls: earth.map.getControls().getLength(),
      renderPasses: activeRenderPassCount(earth)
    }),
    listeners: Object.freeze({
      viewport: listenerCount(viewport),
      contextmenu: listenerCount(viewport, 'contextmenu'),
      target: listenerCount(target)
    }),
    dom: Object.freeze({
      viewport: target.querySelectorAll('.ol-viewport').length,
      canvas: target.querySelectorAll('canvas').length,
      contextMenus: target.querySelectorAll('.ol-context-menu').length,
      toolbars: target.querySelectorAll('.ol-toolbar').length,
      measureTooltips: target.querySelectorAll('.ol-engine-measure-tooltip').length
    }),
    animationHandles: [...current.animationHandles].filter((handle) => handle.status === 'running' || handle.status === 'paused').length,
    elementCount: earth.isDestroyed ? 0 : earth.elements.query().length
  });
}

function globalSnapshot(): unknown {
  return Object.freeze({
    registryKeys: registryKeys(),
    documentListeners: listenerCount(document),
    windowListeners: listenerCount(window),
    mapAChildren: mapATarget.childElementCount,
    mapBChildren: mapBTarget.childElementCount,
    mapAContextMenus: mapATarget.querySelectorAll('.ol-context-menu').length,
    mapAToolbars: mapATarget.querySelectorAll('.ol-toolbar').length,
    mapAMeasureTooltips: mapATarget.querySelectorAll('.ol-engine-measure-tooltip').length
  });
}

function registryKeys(): readonly string[] {
  const read = window.__OL_ENGINE_TEST_REGISTRY_KEYS__;
  if (typeof read !== 'function') throw new Error('Earth registry probe is unavailable.');
  return Object.freeze([...read()]);
}

function drawSummary(current: Runtime): unknown {
  const session = current.draw;
  return Object.freeze({
    status: session?.status,
    resultIds: session?.results.map((element) => element.id) ?? [],
    results: session?.results.map((element) => cloneGeometry(element.state.geometry)) ?? [],
    events: structuredClone(current.drawEvents),
    resources: runtimeSnapshot(current)
  });
}

function editSummary(current: Runtime): unknown {
  const session = current.edit;
  const complete = [...current.editEvents].reverse().find((event) => isRecord(event) && event.type === 'complete');
  const elementId = isRecord(complete) && typeof complete.elementId === 'string' ? complete.elementId : current.draw?.results.at(-1)?.id;
  return Object.freeze({
    status: session?.status,
    original: current.editOriginal === undefined ? undefined : cloneGeometry(current.editOriginal),
    stored: elementId === undefined ? undefined : cloneGeometry(requireOwnedElement(current, elementId).state.geometry),
    events: structuredClone(current.editEvents),
    resources: runtimeSnapshot(current)
  });
}

function measureSummary(current: Runtime): unknown {
  return Object.freeze({
    status: current.measure?.status,
    events: structuredClone(current.measureEvents),
    resources: runtimeSnapshot(current)
  });
}

function transformSummary(current: Runtime): unknown {
  return Object.freeze({
    status: current.transform?.status,
    selectedId: current.transform?.selected?.id,
    toolbar: current.transform?.toolbar !== undefined,
    events: structuredClone(current.transformEvents),
    geometry:
      current.earth.isDestroyed || current.earth.elements.get('transform-rectangle') === undefined
        ? undefined
        : cloneGeometry(requireOwnedElement(current, 'transform-rectangle').state.geometry),
    resources: runtimeSnapshot(current)
  });
}

function subscribeTransform(current: Runtime, session: TransformSession): void {
  const eventTypes: readonly (keyof TransformEventMap)[] = [
    'select',
    'selectEnd',
    'enterHandle',
    'leaveHandle',
    'translateStart',
    'translating',
    'translateEnd',
    'rotateStart',
    'rotating',
    'rotateEnd',
    'scaleStart',
    'scaling',
    'scaleEnd',
    'edit',
    'copyPreviewConfirm',
    'copyPreviewCancel',
    'remove',
    'error'
  ];
  for (const type of eventTypes) {
    session.on(type, (event) => {
      if ('element' in event) {
        current.transformEvents.push({
          type,
          elementId: event.element.id,
          geometry: cloneGeometry(event.element.state.geometry),
          ...('key' in event ? { key: event.key } : {})
        });
      } else if (type === 'error') {
        current.transformEvents.push({ type });
      } else {
        current.transformEvents.push({ type });
      }
    });
  }
}

function transformPixels(current: Runtime): unknown {
  current.earth.map.renderSync();
  const coordinates = new Map<string, Coordinate>();
  for (const layer of current.earth.map.getLayers().getArray()) {
    const source = (layer as unknown as { getSource?: () => unknown }).getSource?.();
    if (!isNativeSourceProbe(source)) continue;
    for (const feature of source.getFeatures()) {
      const metadata = feature.get('ol-engine-transform-handle');
      if (!isTransformHandleMetadata(metadata)) continue;
      coordinates.set(metadata.key, metadata.coordinate);
    }
  }
  const translate = coordinates.get('feature');
  const scale = coordinates.get('scale-ne');
  const rotate = coordinates.get('rotate');
  if (translate === undefined || scale === undefined || rotate === undefined) return fallbackTransformPixels(current, [...coordinates.keys()]);
  return Object.freeze({
    probe: 'native',
    keys: Object.freeze([...coordinates.keys()]),
    translate: pixelOf(current, translate),
    scale: pixelOf(current, scale),
    rotate: pixelOf(current, rotate)
  });
}

function fallbackTransformPixels(current: Runtime, keys: readonly string[] = []): unknown {
  const geometry = requireOwnedElement(current, 'transform-rectangle').state.geometry;
  if (geometry.type === 'circle' || geometry.controlPoints.length < 2) throw new Error('Transform fixture requires a two-point shape.');
  const xs = geometry.controlPoints.map((coordinate) => coordinate[0]);
  const ys = geometry.controlPoints.map((coordinate) => coordinate[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const resolution = current.earth.map.getView().getResolution();
  if (resolution === undefined) throw new Error('Map resolution is unavailable.');
  const buffer = 16 * resolution;
  const center: readonly [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
  return Object.freeze({
    probe: 'fallback',
    keys: Object.freeze([...keys]),
    translate: pixelOf(current, center),
    scale: pixelOf(current, [maxX + buffer, maxY + buffer]),
    rotate: pixelOf(current, [center[0], maxY + buffer * 2])
  });
}

function isNativeSourceProbe(value: unknown): value is NativeSourceProbe {
  return value !== null && typeof value === 'object' && typeof (value as Partial<NativeSourceProbe>).getFeatures === 'function';
}

function isTransformHandleMetadata(value: unknown): value is { readonly key: string; readonly coordinate: Coordinate } {
  if (value === null || typeof value !== 'object') return false;
  const metadata = value as { readonly key?: unknown; readonly coordinate?: unknown };
  return typeof metadata.key === 'string' && isCoordinate(metadata.coordinate);
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 3) &&
    value.every((component) => typeof component === 'number' && Number.isFinite(component))
  );
}

function serializeMeasureResult(result: MeasureResult): SerializableMeasureResult {
  return Object.freeze({
    type: result.type,
    value: result.value,
    unit: result.unit,
    formatted: result.formatted,
    coordinateCount: result.coordinates.length,
    segmentCount: result.segments.length
  });
}

function cloneGeometry(geometry: ShapeState): ShapeState {
  if (geometry.type === 'circle') {
    return Object.freeze({ type: geometry.type, center: cloneCoordinate(geometry.center), radius: geometry.radius });
  }
  return Object.freeze({
    type: geometry.type,
    controlPoints: Object.freeze(geometry.controlPoints.map(cloneCoordinate))
  }) as ShapeState;
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return Object.freeze([...coordinate]) as Coordinate;
}

function endExclusiveSessions(current: Runtime): void {
  if (current.draw?.status === 'active') current.draw.cancel();
  if (current.edit?.status === 'active') current.edit.cancel();
  if (current.measure?.status === 'active') current.measure.cancel();
  if (current.transform?.status === 'active') current.transform.cancel();
}

function requireOwnedElement(current: Runtime, id: string): Element {
  const element = current.earth.elements.get(id);
  if (element === undefined) throw new Error(`Element does not exist: ${id}`);
  return element;
}

function coordinateAtPixel(current: Runtime, pixel: readonly [number, number]): readonly [number, number] {
  const coordinate = current.earth.map.getCoordinateFromPixel([...pixel]);
  if (coordinate === null || coordinate === undefined || coordinate.length < 2) throw new Error('Map coordinate is unavailable.');
  return Object.freeze([coordinate[0], coordinate[1]]);
}

function pixelOf(current: Runtime, coordinate: readonly number[]): readonly [number, number] {
  const pixel = current.earth.map.getPixelFromCoordinate([...coordinate]);
  if (pixel === null || pixel === undefined || pixel.length < 2) throw new Error('Map pixel is unavailable.');
  return Object.freeze([pixel[0], pixel[1]]);
}

function trackAnimation(current: Runtime, handle: AnimationHandle): void {
  current.animationHandles.add(handle);
  void handle.finished.finally(() => current.animationHandles.delete(handle));
}

async function settleAnimationHandles(current: Runtime): Promise<void> {
  await Promise.allSettled([...current.animationHandles].map((handle) => handle.finished));
}

function activeRenderPassCount(earth: Earth): number {
  return earth.map
    .getLayers()
    .getArray()
    .reduce((total, layer) => total + (layer.getListeners('postrender')?.length ?? 0), 0);
}

function probeElement(target: ProbeTarget): HTMLElement {
  if (target === 'outside') return outside;
  if (target === 'old-a') {
    if (oldAViewport === undefined) throw new Error('Destroyed A viewport is unavailable.');
    return oldAViewport;
  }
  return runtime(target).earth.map.getViewport();
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`Fixture element does not exist: ${id}`);
  return element;
}

function captureOf(options: boolean | AddEventListenerOptions | EventListenerOptions | undefined): boolean {
  return typeof options === 'boolean' ? options : options?.capture === true;
}

function trackListener(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, capture: boolean): void {
  let byType = listeners.get(target);
  if (byType === undefined) {
    byType = new Map();
    listeners.set(target, byType);
  }
  let records = byType.get(type);
  if (records === undefined) {
    records = [];
    byType.set(type, records);
  }
  if (!records.some((record) => record.listener === listener && record.capture === capture)) records.push({ listener, capture });
}

function untrackListener(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, capture: boolean): void {
  const byType = listeners.get(target);
  const records = byType?.get(type);
  if (records === undefined) return;
  const index = records.findIndex((record) => record.listener === listener && record.capture === capture);
  if (index >= 0) records.splice(index, 1);
  if (records.length === 0) byType?.delete(type);
}

function listenerCount(target: EventTarget, type?: string): number {
  const byType = listeners.get(target);
  if (byType === undefined) return 0;
  if (type !== undefined) return byType.get(type)?.length ?? 0;
  return [...byType.values()].reduce((total, records) => total + records.length, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
