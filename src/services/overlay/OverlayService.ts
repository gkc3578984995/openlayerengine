import { cloneCoreState } from '../../core/common/clone.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate, Pixel } from '../../core/common/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import type { ElementChangeSet } from '../../core/transaction/types.js';
import { InvalidArgumentError, InvalidSelectorError, ObjectDisposedError } from '../../core/errors.js';
import { isNativeRef, type NativeRef } from '../../core/native/types.js';
import { isNativeStyleRef } from '../../core/style/types.js';
import type { AnimationControlHandle, AnimationControlPort } from '../../core/ports/AnimationControlPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type {
  CoreOverlayOwnership,
  CoreOverlayPositioning,
  CorePanIntoViewSpec,
  DescriptorPortAction,
  OverlayDragEvent,
  OverlayPort,
  OverlayRenderState,
  PixelBounds
} from '../../core/ports/OverlayPort.js';
import { DescriptorHandle } from './DescriptorHandle.js';
import { OverlayHandle } from './OverlayHandle.js';
import type {
  InternalDescriptorEvent,
  InternalDescriptorItem,
  InternalDescriptorPatch,
  InternalDescriptorSpec,
  InternalDescriptorState,
  InternalOverlayPatch,
  InternalOverlaySelector,
  InternalOverlaySpec,
  InternalOverlayState
} from './types.js';

/** 构造 Overlay 服务时使用的可选配置。 */
export interface OverlayServiceOptions {
  /** 可选的 Overlay ID 生成器。 */
  readonly createId?: () => string;
  /** 可选的错误报告器。 */
  readonly errorReporter?: ErrorReporter;
  /** Descriptor 固定线所属图层。 */
  readonly descriptorLayerId?: string;
}

/** 规范化后的 Descriptor 状态与回调。 */
interface NormalizedDescriptor<T> {
  /** 冻结后的 Descriptor 状态。 */
  readonly state: Readonly<InternalDescriptorState<T>>;
  /** 冻结后的 Descriptor 回调。 */
  readonly callbacks: DescriptorCallbacks<T>;
}

/** 校验并规范化 Descriptor 创建配置。 */
function normalizeDescriptorSpec<T>(input: InternalDescriptorSpec<T>, createId: () => string): NormalizedDescriptor<T> {
  const spec = inspectRecord(input, 'Descriptor spec');
  assertFields(
    spec,
    new Set([
      'id',
      'elementRef',
      'type',
      'items',
      'position',
      'offset',
      'close',
      'closeAction',
      'onClose',
      'onItemClick',
      'draggable',
      'fixedLine',
      'fixedLineColor',
      'fixedMode',
      'data'
    ]),
    'Descriptor spec'
  );
  const elementRef = requiredFor(spec, 'elementRef', 'Descriptor spec');
  if (!isNativeRef(elementRef)) throw new InvalidArgumentError('Descriptor elementRef must be an issued native reference');
  const type = descriptorType(requiredFor(spec, 'type', 'Descriptor spec'));
  const positionValue = coordinate(requiredFor(spec, 'position', 'Descriptor spec'), 'Descriptor position');
  if (positionValue === undefined) throw new InvalidArgumentError('Descriptor position is required');
  const items = normalizeDescriptorItems(hasOwn(spec, 'items') ? spec.items : undefined, type);
  const onClose = optionalCallback<T>(hasOwn(spec, 'onClose') ? spec.onClose : undefined, 'Descriptor onClose');
  const onItemClick = optionalCallback<T>(hasOwn(spec, 'onItemClick') ? spec.onItemClick : undefined, 'Descriptor onItemClick');
  return {
    state: freeze({
      id: hasOwn(spec, 'id') ? assertId(spec.id, 'Descriptor id') : createId(),
      elementRef: elementRef as NativeRef<'element'>,
      type,
      items,
      position: positionValue,
      offset: hasOwn(spec, 'offset') ? pixel(spec.offset, 'Descriptor offset') : ([0, 0] as const),
      close: hasOwn(spec, 'close') ? booleanValue(spec.close, 'Descriptor close') : true,
      closeAction: hasOwn(spec, 'closeAction') ? descriptorCloseAction(spec.closeAction) : 'hide',
      draggable: hasOwn(spec, 'draggable') ? booleanValue(spec.draggable, 'Descriptor draggable') : true,
      fixedLine: hasOwn(spec, 'fixedLine') ? booleanValue(spec.fixedLine, 'Descriptor fixedLine') : true,
      fixedLineColor: hasOwn(spec, 'fixedLineColor') ? stringValue(spec.fixedLineColor, 'Descriptor fixedLineColor') : '#4f9eff',
      fixedMode: hasOwn(spec, 'fixedMode') ? descriptorFixedMode(spec.fixedMode) : 'position',
      data: hasOwn(spec, 'data') ? snapshotData(spec.data as T) : undefined,
      visible: true
    }),
    callbacks: Object.freeze({ onClose, onItemClick })
  };
}

/** 校验 Descriptor 更新并计算下一状态。 */
function applyDescriptorPatch<T>(
  before: Readonly<InternalDescriptorState<T>>,
  beforeCallbacks: DescriptorCallbacks<T>,
  input: InternalDescriptorPatch<T>
): NormalizedDescriptor<T> {
  const patch = inspectRecord(input, 'Descriptor patch');
  assertFields(
    patch,
    new Set([
      'elementRef',
      'type',
      'items',
      'position',
      'offset',
      'visible',
      'close',
      'closeAction',
      'onClose',
      'onItemClick',
      'draggable',
      'fixedLine',
      'fixedLineColor',
      'fixedMode',
      'data'
    ]),
    'Descriptor patch'
  );
  const elementRef = hasOwn(patch, 'elementRef') ? patch.elementRef : before.elementRef;
  if (!isNativeRef(elementRef)) throw new InvalidArgumentError('Descriptor elementRef must be an issued native reference');
  const type = hasOwn(patch, 'type') ? descriptorType(patch.type) : before.type;
  const items =
    hasOwn(patch, 'items') || type !== before.type ? normalizeDescriptorItems(hasOwn(patch, 'items') ? patch.items : undefined, type) : before.items;
  const nextPosition = hasOwn(patch, 'position') ? coordinate(patch.position, 'Descriptor position') : before.position;
  if (nextPosition === undefined) throw new InvalidArgumentError('Descriptor position is required');
  const state = freeze({
    ...before,
    elementRef: elementRef as NativeRef<'element'>,
    type,
    items,
    position: nextPosition,
    offset: hasOwn(patch, 'offset') ? pixel(patch.offset, 'Descriptor offset') : before.offset,
    visible: hasOwn(patch, 'visible') ? booleanValue(patch.visible, 'Descriptor visible') : before.visible,
    close: hasOwn(patch, 'close') ? booleanValue(patch.close, 'Descriptor close') : before.close,
    closeAction: hasOwn(patch, 'closeAction') ? descriptorCloseAction(patch.closeAction) : before.closeAction,
    draggable: hasOwn(patch, 'draggable') ? booleanValue(patch.draggable, 'Descriptor draggable') : before.draggable,
    fixedLine: hasOwn(patch, 'fixedLine') ? booleanValue(patch.fixedLine, 'Descriptor fixedLine') : before.fixedLine,
    fixedLineColor: hasOwn(patch, 'fixedLineColor') ? stringValue(patch.fixedLineColor, 'Descriptor fixedLineColor') : before.fixedLineColor,
    fixedMode: hasOwn(patch, 'fixedMode') ? descriptorFixedMode(patch.fixedMode) : before.fixedMode,
    data: hasOwn(patch, 'data') ? snapshotData(patch.data as T) : before.data
  });
  return {
    state,
    callbacks: Object.freeze({
      onClose: hasOwn(patch, 'onClose') ? optionalCallback<T>(patch.onClose, 'Descriptor onClose') : beforeCallbacks.onClose,
      onItemClick: hasOwn(patch, 'onItemClick') ? optionalCallback<T>(patch.onItemClick, 'Descriptor onItemClick') : beforeCallbacks.onItemClick
    })
  };
}

/** 将 Descriptor 状态转换为内部 Overlay 状态。 */
function descriptorOverlayState<T>(state: Readonly<InternalDescriptorState<T>>): Readonly<InternalOverlayState<T>> {
  return freeze({
    id: state.id,
    elementRef: state.elementRef,
    position: state.position,
    offset: state.offset,
    positioning: 'top-left' as const,
    stopEvent: true,
    insertFirst: true,
    autoPan: false as const,
    className: 'ol-engine-descriptor',
    module: undefined,
    data: state.data,
    ownership: 'earth' as const,
    visible: state.visible,
    kind: 'descriptor' as const
  });
}

/** 生成 Descriptor 当前使用的渲染状态。 */
function descriptorRenderState<T>(record: DescriptorRecord<T>): Readonly<OverlayRenderState> {
  return renderStateAt(record.overlay.state, record.renderPosition);
}

/** 在指定坐标生成 Overlay 渲染状态。 */
function renderStateAt(state: Readonly<InternalOverlayState>, position: Coordinate): Readonly<OverlayRenderState> {
  return freeze({
    id: state.id,
    elementRef: state.elementRef,
    position,
    offset: state.offset,
    positioning: state.positioning,
    stopEvent: state.stopEvent,
    insertFirst: state.insertFirst,
    autoPan: state.autoPan,
    className: state.className,
    visible: state.visible,
    ownership: state.ownership
  });
}

/** 生成 Descriptor 固定线元素 ID。 */
function descriptorLineId(id: string): string {
  return `descriptor:${id}:fixed-line`;
}

/** 创建 Descriptor 固定线元素状态。 */
function createDescriptorLine<T>(record: DescriptorRecord<T>, layerId: string): ElementState<{ readonly descriptorId: string }> {
  return createDescriptorLineState(record.lineId, record.state, layerId);
}

/** 根据 Descriptor 状态创建固定线元素。 */
function createDescriptorLineState(lineId: string, state: Readonly<InternalDescriptorState>, layerId: string): ElementState<{ readonly descriptorId: string }> {
  return {
    id: lineId,
    type: 'polyline',
    geometry: { type: 'polyline', controlPoints: [state.position, state.position] },
    style: descriptorLineStyle(state.fixedLineColor),
    data: { descriptorId: state.id },
    module: '__ol-engine:descriptor-line',
    layerId,
    visible: state.visible
  };
}

/** 创建 Descriptor 固定线样式。 */
function descriptorLineStyle(color: string): ElementState['style'] {
  return { strokes: [{ color, width: 2, lineDash: [6, 4] }] };
}

/** 判断 Descriptor 是否需要布局监听。 */
function needsLayout(state: Readonly<InternalDescriptorState>): boolean {
  return state.visible && (state.fixedLine || state.fixedMode === 'pixel');
}

/** 计算像素到元素边界最近的连接点。 */
function nearestBoundsPoint(pixelValue: Pixel, bounds: PixelBounds): Pixel {
  const x = Math.min(bounds.right, Math.max(bounds.left, pixelValue[0]));
  const y = Math.min(bounds.bottom, Math.max(bounds.top, pixelValue[1]));
  if (x !== pixelValue[0] || y !== pixelValue[1]) return freeze([x, y]);
  const candidates = [
    { distance: pixelValue[0] - bounds.left, point: [bounds.left, pixelValue[1]] as Pixel },
    { distance: bounds.right - pixelValue[0], point: [bounds.right, pixelValue[1]] as Pixel },
    { distance: pixelValue[1] - bounds.top, point: [pixelValue[0], bounds.top] as Pixel },
    { distance: bounds.bottom - pixelValue[1], point: [pixelValue[0], bounds.bottom] as Pixel }
  ];
  candidates.sort((left, right) => left.distance - right.distance);
  return freeze([...candidates[0].point]) as Pixel;
}

/** 创建冻结的 Descriptor 事件。 */
function descriptorEvent<T>(record: DescriptorRecord<T>, type: 'click' | 'close', index?: number): InternalDescriptorEvent<T> {
  return freeze({
    type,
    descriptor: record.handle,
    data: record.state.data,
    ...(index === undefined ? {} : { item: record.state.items[index], index })
  });
}

/** 校验 Descriptor 内容类型。 */
function descriptorType(value: unknown): InternalDescriptorState['type'] {
  if (value !== 'list' && value !== 'custom') throw new InvalidArgumentError('Descriptor type must be list or custom');
  return value;
}

/** 校验 Descriptor 关闭行为。 */
function descriptorCloseAction(value: unknown): InternalDescriptorState['closeAction'] {
  if (value !== 'hide' && value !== 'destroy') throw new InvalidArgumentError('Descriptor closeAction must be hide or destroy');
  return value;
}

/** 校验 Descriptor 固定方式。 */
function descriptorFixedMode(value: unknown): InternalDescriptorState['fixedMode'] {
  if (value !== 'position' && value !== 'pixel') throw new InvalidArgumentError('Descriptor fixedMode must be position or pixel');
  return value;
}

/** 校验并冻结 Descriptor 内容项目。 */
function normalizeDescriptorItems(value: unknown, type: InternalDescriptorState['type']): readonly Readonly<InternalDescriptorItem>[] {
  if (type === 'custom') {
    if (value !== undefined && (!Array.isArray(value) || value.length > 0)) throw new InvalidArgumentError('Custom descriptors cannot contain list items');
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) throw new InvalidArgumentError('List descriptors require items');
  return Object.freeze(
    value.map((item, index) => {
      const record = inspectRecord(item, `Descriptor item ${index}`);
      assertFields(record, new Set(['label', 'value', 'color', 'className']), `Descriptor item ${index}`);
      const label = stringValue(requiredFor(record, 'label', `Descriptor item ${index}`), `Descriptor item ${index} label`);
      const itemValue = requiredFor(record, 'value', `Descriptor item ${index}`);
      if (typeof itemValue !== 'string' && typeof itemValue !== 'number') {
        throw new InvalidArgumentError(`Descriptor item ${index} value must be a string or number`);
      }
      return freeze({
        label,
        value: itemValue,
        ...(hasOwn(record, 'color') ? { color: stringValue(record.color, `Descriptor item ${index} color`) } : {}),
        ...(hasOwn(record, 'className') ? { className: stringValue(record.className, `Descriptor item ${index} className`) } : {})
      });
    })
  );
}

/** 读取可选的 Descriptor 回调。 */
function optionalCallback<T>(value: unknown, label: string): ((event: InternalDescriptorEvent<T>) => void) | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'function') throw new InvalidArgumentError(`${label} must be a function`);
  return value as (event: InternalDescriptorEvent<T>) => void;
}

/** 读取字符串值。 */
function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new InvalidArgumentError(`${label} must be a string`);
  return value;
}

/** 读取记录中的必填字段。 */
function requiredFor(value: Record<PropertyKey, unknown>, key: string, label: string): unknown {
  if (!hasOwn(value, key)) throw new InvalidArgumentError(`${label} requires ${key}`);
  return value[key];
}

/** 校验并包装只能成功释放一次的函数。 */
function requireDisposer(value: unknown, label: string): () => void {
  if (typeof value !== 'function') throw new InvalidArgumentError(`${label} must return a disposer`);
  let state: 'active' | 'disposing' | 'disposed' = 'active';
  return () => {
    if (state !== 'active') return;
    state = 'disposing';
    try {
      value();
      state = 'disposed';
    } catch (error) {
      state = 'active';
      throw error;
    }
  };
}

/** 比较两个 Descriptor 状态是否一致。 */
function sameDescriptorState(left: Readonly<InternalDescriptorState>, right: Readonly<InternalDescriptorState>): boolean {
  return (
    left.id === right.id &&
    left.elementRef === right.elementRef &&
    left.type === right.type &&
    left.items === right.items &&
    tupleEqual(left.position, right.position) &&
    tupleEqual(left.offset, right.offset) &&
    left.close === right.close &&
    left.closeAction === right.closeAction &&
    left.draggable === right.draggable &&
    left.fixedLine === right.fixedLine &&
    left.fixedLineColor === right.fixedLineColor &&
    left.fixedMode === right.fixedMode &&
    left.data === right.data &&
    left.visible === right.visible
  );
}

/** 比较两组 Descriptor 回调是否一致。 */
function sameDescriptorCallbacks<T>(left: DescriptorCallbacks<T>, right: DescriptorCallbacks<T>): boolean {
  return left.onClose === right.onClose && left.onItemClick === right.onItemClick;
}

/** 比较固定线几何是否一致。 */
function samePolyline(left: ElementState['geometry'], right: { readonly type: 'polyline'; readonly controlPoints: readonly Coordinate[] }): boolean {
  if (!('controlPoints' in left) || left.type !== 'polyline') return false;
  return left.controlPoints.length === right.controlPoints.length && left.controlPoints.every((point, index) => tupleEqual(point, right.controlPoints[index]));
}

/** 比较固定线样式是否一致。 */
function sameLineStyle(left: ElementState['style'], right: ElementState['style']): boolean {
  if (isNativeStyleRef(left) || isNativeStyleRef(right)) return left === right;
  const leftStroke = left.strokes?.[0];
  const rightStroke = right.strokes?.[0];
  return (
    left.strokes?.length === right.strokes?.length &&
    leftStroke?.color === rightStroke?.color &&
    leftStroke?.width === rightStroke?.width &&
    tupleEqual(leftStroke?.lineDash, rightStroke?.lineDash)
  );
}

/** OverlayService 保存的普通 Overlay 记录。 */
interface OverlayRecord<T = unknown> {
  /** 当前 Overlay 状态。 */
  state: Readonly<InternalOverlayState<T>>;
  /** 用于识别过期句柄的代次标记。 */
  readonly generation: object;
  /** 对外返回的 Overlay 句柄。 */
  readonly handle: OverlayHandle<T>;
  /** 当前销毁阶段。 */
  phase: 'active' | 'destroying' | 'destroyed';
  /** 当前待提交更新的互斥标记。 */
  pendingMutation: object | undefined;
  /** 关联的 Descriptor 记录。 */
  descriptor: DescriptorRecord<T> | undefined;
}

/** Descriptor 注册的业务回调。 */
interface DescriptorCallbacks<T> {
  /** 关闭回调。 */
  readonly onClose: ((event: InternalDescriptorEvent<T>) => void) | undefined;
  /** 内容项目点击回调。 */
  readonly onItemClick: ((event: InternalDescriptorEvent<T>) => void) | undefined;
}

/** Descriptor 拖动开始时保存的指针状态。 */
interface DescriptorDragState {
  /** 当前指针 ID。 */
  readonly pointerId: number;
  /** 拖动起始像素。 */
  readonly startPixel: Pixel;
  /** 拖动起始偏移。 */
  readonly startOffset: Pixel;
}

/** OverlayService 保存的 Descriptor 运行记录。 */
interface DescriptorRecord<T = unknown> {
  /** 当前 Descriptor 状态。 */
  state: Readonly<InternalDescriptorState<T>>;
  /** 当前业务回调。 */
  callbacks: DescriptorCallbacks<T>;
  /** 用于识别过期句柄的代次标记。 */
  readonly generation: object;
  /** 对外返回的 Descriptor 句柄。 */
  readonly handle: DescriptorHandle<T>;
  /** Descriptor 使用的底层 Overlay 记录。 */
  readonly overlay: OverlayRecord<T>;
  /** 固定线元素 ID。 */
  readonly lineId: string;
  /** 固定线是否已经写入元素仓库。 */
  lineAttached: boolean;
  /** 当前固定线动画句柄。 */
  animation: AnimationControlHandle | undefined;
  /** Descriptor 动作订阅释放函数。 */
  actionDisposer: (() => void) | undefined;
  /** Descriptor 拖动订阅释放函数。 */
  dragDisposer: (() => void) | undefined;
  /** 当前实际渲染坐标。 */
  renderPosition: Coordinate;
  /** 固定像素模式下保存的像素位置。 */
  fixedPixel: Pixel | undefined;
  /** 当前拖动状态。 */
  dragState: DescriptorDragState | undefined;
  /** 当前销毁阶段。 */
  phase: 'active' | 'destroying' | 'destroyed';
  /** 当前待提交更新的互斥标记。 */
  pendingMutation: object | undefined;
  /** 关闭动作是否已进入处理流程。 */
  closeArmed: boolean;
  /** 是否正在关闭 Descriptor。 */
  closing: boolean;
  /** Descriptor 事件监听器。 */
  readonly listeners: { readonly click: Set<(event: InternalDescriptorEvent<T>) => void>; readonly close: Set<(event: InternalDescriptorEvent<T>) => void> };
}

/** Overlay 支持的定位方式。 */
const positioningValues: ReadonlySet<string> = new Set([
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'center-left',
  'center-center',
  'center-right',
  'top-left',
  'top-center',
  'top-right'
]);

/** 统一管理普通 Overlay 与 Descriptor 的生命周期和渲染同步。 */
export class OverlayService {
  /** 底层 Overlay 端口。 */
  readonly #port: OverlayPort;
  /** 元素状态仓库。 */
  readonly #store: ElementStore;
  /** 固定线动画控制端口。 */
  readonly #animations: AnimationControlPort;
  /** 可选的 ID 生成器。 */
  readonly #createId: (() => string) | undefined;
  /** Overlay 错误报告器。 */
  readonly #errorReporter: ErrorReporter;
  /** Descriptor 固定线所属图层。 */
  readonly #descriptorLayerId: string;
  /** 按 ID 保存的全部 Overlay 记录。 */
  readonly #records = new Map<string, OverlayRecord>();
  /** 按 ID 保存的 Descriptor 记录。 */
  readonly #descriptors = new Map<string, DescriptorRecord>();
  /** 固定线 ID 到 Descriptor 的索引。 */
  readonly #descriptorByLine = new Map<string, DescriptorRecord>();
  /** 需要布局同步的 Descriptor ID。 */
  readonly #layoutIds = new Set<string>();
  /** 元素仓库订阅释放函数。 */
  readonly #storeDisposer: () => void;
  /** Overlay 布局订阅释放函数。 */
  #layoutDisposer: (() => void) | undefined;
  /** 下一个自动生成的 ID。 */
  #nextId = 0;
  /** 服务是否已销毁。 */
  #disposed = false;
  /** 是否正在执行不可重入的变更。 */
  #mutating = false;
  /** 自定义选择器断言的调用深度。 */
  #selectorDepth = 0;

  /** 创建 Overlay 服务并订阅元素变化。 */
  constructor(port: OverlayPort, store: ElementStore, animations: AnimationControlPort, options: OverlayServiceOptions = {}) {
    this.#port = port;
    this.#store = store;
    this.#animations = animations;
    this.#createId = options.createId;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    this.#descriptorLayerId = options.descriptorLayerId ?? 'default';
    if (typeof this.#errorReporter !== 'function') throw new InvalidArgumentError('Error reporter must be a function');
    assertId(this.#descriptorLayerId, 'Descriptor layer id');
    this.#storeDisposer = this.#store.subscribe((changes) => this.#onElementChanges(changes));
  }

  /** 创建并挂载普通 Overlay。 */
  add<T>(spec: InternalOverlaySpec<T>): OverlayHandle<T> {
    return this.#mutation(() => {
      const state = normalizeSpec(spec, this.#generateId.bind(this));
      if (this.#records.has(state.id)) throw new InvalidArgumentError(`Overlay id already exists: ${state.id}`);
      this.#port.attach(toRenderState(state));
      const record = this.#createOverlayRecord(state);
      this.#records.set(state.id, record as OverlayRecord);
      return record.handle;
    });
  }

  /** 创建并挂载 Descriptor。 */
  createDescriptor<T>(spec: InternalDescriptorSpec<T>): DescriptorHandle<T> {
    return this.#mutation(() => {
      const normalized = normalizeDescriptorSpec(spec, this.#generateId.bind(this));
      if (this.#records.has(normalized.state.id)) throw new InvalidArgumentError(`Overlay id already exists: ${normalized.state.id}`);
      const lineId = descriptorLineId(normalized.state.id);
      if (this.#store.get(lineId) !== undefined) throw new InvalidArgumentError(`Descriptor line id already exists: ${lineId}`);

      const generation = Object.freeze({});
      const overlayState = descriptorOverlayState(normalized.state);
      const overlay = this.#createOverlayRecord<T>(overlayState, generation);
      const handle = new DescriptorHandle<T>({
        id: normalized.state.id,
        isCurrent: () => this.#isDescriptorCurrent(normalized.state.id, generation),
        state: () => this.#requireDescriptor<T>(normalized.state.id, generation).state,
        prepareUpdate: (patch) => this.#prepareDescriptorUpdate(normalized.state.id, generation, patch),
        setPosition: (position) => this.#setDescriptorPosition(normalized.state.id, generation, position),
        show: () => this.#setDescriptorVisible(normalized.state.id, generation, true),
        hide: () => this.#setDescriptorVisible(normalized.state.id, generation, false),
        close: () => this.#closeDescriptor(normalized.state.id, generation),
        on: (type, listener) => this.#subscribeDescriptor(normalized.state.id, generation, type, listener),
        destroy: () => this.#destroyDescriptorByGeneration(normalized.state.id, generation)
      });
      const record: DescriptorRecord<T> = {
        state: normalized.state,
        callbacks: normalized.callbacks,
        generation,
        handle,
        overlay,
        lineId,
        lineAttached: false,
        animation: undefined,
        actionDisposer: undefined,
        dragDisposer: undefined,
        renderPosition: normalized.state.position,
        fixedPixel: normalized.state.fixedMode === 'pixel' ? this.#port.coordinateToPixel(normalized.state.position) : undefined,
        dragState: undefined,
        phase: 'active',
        pendingMutation: undefined,
        closeArmed: true,
        closing: false,
        listeners: { click: new Set(), close: new Set() }
      };
      overlay.descriptor = record;

      let attachAttempted = false;
      let attached = false;
      let lineAdded = false;
      let registered = false;
      try {
        attachAttempted = true;
        this.#port.attach(descriptorRenderState(record));
        attached = true;
        this.#records.set(normalized.state.id, overlay as OverlayRecord);
        this.#descriptors.set(normalized.state.id, record as DescriptorRecord);
        registered = true;
        if (normalized.state.fixedLine) {
          record.lineAttached = true;
          this.#descriptorByLine.set(lineId, record as DescriptorRecord);
          this.#store.add(createDescriptorLine(record, this.#descriptorLayerId));
          lineAdded = true;
          if (record.phase !== 'active') throw new ObjectDisposedError(`Descriptor line was removed during creation: ${normalized.state.id}`);
        }
        record.actionDisposer = requireDisposer(
          this.#port.subscribeDescriptorActions(normalized.state.id, (action) => this.#onDescriptorAction(normalized.state.id, generation, action)),
          'Descriptor action subscription'
        );
        if (normalized.state.draggable) {
          record.dragDisposer = requireDisposer(
            this.#port.bindDrag(normalized.state.id, (event) => this.#onDescriptorDrag(normalized.state.id, generation, event)),
            'Descriptor drag binding'
          );
        }
        if (needsLayout(normalized.state)) this.#acquireLayout(normalized.state.id);
        if (normalized.state.fixedLine) {
          this.#syncDescriptor(record);
          record.animation = this.#animations.play({ id: lineId }, { type: 'dash-flow', channel: 'descriptor-fixed-line' });
        } else {
          this.#syncDescriptor(record);
        }
        return handle;
      } catch (error) {
        if (record.phase !== 'active') throw error;
        record.phase = 'destroying';
        overlay.phase = 'destroying';
        this.#descriptorByLine.delete(lineId);
        if (registered) {
          this.#descriptors.delete(normalized.state.id);
          this.#records.delete(normalized.state.id);
        }
        const finalizers: Array<() => void> = [];
        if (record.animation !== undefined) finalizers.push(() => record.animation?.stop());
        if (lineAdded) finalizers.push(() => void this.#store.remove({ id: lineId }));
        if (this.#layoutIds.has(normalized.state.id)) finalizers.push(() => this.#leaveLayout(normalized.state.id));
        if (record.dragDisposer !== undefined) finalizers.push(record.dragDisposer);
        if (record.actionDisposer !== undefined) finalizers.push(record.actionDisposer);
        if (attached || attachAttempted) finalizers.push(() => this.#port.detach(normalized.state.id));
        finalizers.push(() => this.#port.releaseElement(normalized.state.elementRef, 'earth'));
        try {
          runFinalizers(finalizers);
        } catch {
          // 尝试全部回滚后仍保留创建阶段的原始异常。
        }
        record.phase = 'destroyed';
        record.lineAttached = false;
        overlay.phase = 'destroyed';
        throw error;
      }
    });
  }

  /** 获取指定 ID 的普通 Overlay 句柄。 */
  get<T>(id: string): OverlayHandle<T> | undefined {
    this.#assertActive();
    assertId(id, 'Overlay id');
    return this.#records.get(id)?.handle as OverlayHandle<T> | undefined;
  }

  /** 查询匹配的普通 Overlay 句柄。 */
  query<T>(selector?: InternalOverlaySelector<T>): readonly OverlayHandle<T>[] {
    this.#assertActive();
    const normalized = normalizeSelector(selector);
    const candidates = ([...this.#records.values()].filter((record) => record.phase === 'active') as OverlayRecord<T>[]).map((record) => ({
      record,
      state: record.state
    }));
    const ids = normalized.ids === undefined ? undefined : new Set(normalized.ids);
    const matches: OverlayHandle<T>[] = [];
    this.#selectorDepth += 1;
    try {
      for (const { record, state } of candidates) {
        if (normalized.id !== undefined && normalized.id !== state.id) continue;
        if (ids !== undefined && !ids.has(state.id)) continue;
        if (normalized.module !== undefined && normalized.module !== state.module) continue;
        if (normalized.visible !== undefined && normalized.visible !== state.visible) continue;
        if (normalized.predicate !== undefined && !normalized.predicate(state.data, record.handle)) continue;
        matches.push(record.handle);
      }
    } finally {
      this.#selectorDepth -= 1;
    }
    return Object.freeze(matches);
  }

  /** 移除匹配的普通 Overlay。 */
  remove(selector: InternalOverlaySelector): number {
    assertDestructiveSelector(selector);
    const selected = [...this.query(selector)];
    let firstError: unknown;
    let failed = false;
    for (const handle of selected) {
      try {
        handle.destroy();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    if (failed) throw firstError;
    return selected.length;
  }

  /** 清除服务管理的全部 Overlay 和 Descriptor。 */
  clear(): void {
    this.#assertActive();
    const handles = [...this.#records.values()].map(({ handle }) => handle);
    runFinalizers(handles.map((handle) => () => handle.destroy()));
  }

  /** 销毁服务并释放全部底层资源。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#assertCanMutate();
    let error: unknown;
    try {
      runFinalizers([
        () => this.clear(),
        () => {
          if (this.#layoutDisposer === undefined) return;
          const dispose = this.#layoutDisposer;
          dispose();
          this.#layoutDisposer = undefined;
          this.#layoutIds.clear();
        },
        this.#storeDisposer
      ]);
    } catch (caught) {
      error = caught;
    }
    this.#disposed = true;
    if (error !== undefined) throw error;
  }

  /** 立即提交普通 Overlay 更新。 */
  #update<T>(id: string, generation: object, patch: InternalOverlayPatch<T>): void {
    this.#prepareUpdate(id, generation, patch).commit();
  }

  /** 准备普通 Overlay 的可提交更新。 */
  #prepareUpdate<T>(id: string, generation: object, patch: InternalOverlayPatch<T>): import('./OverlayHandle.js').OverlayUpdateReceipt {
    return this.#mutation(() => {
      const record = this.#requireRecord<T>(id, generation);
      if (record.descriptor !== undefined) {
        const inspected = inspectRecord(patch, 'Overlay patch');
        assertFields(inspected, new Set(['elementRef', 'position', 'offset', 'positioning', 'visible', 'data', 'ownership']), 'Overlay patch');
        const descriptorOverlayPatch = inspected as unknown as InternalOverlayPatch<T>;
        if (hasOwn(descriptorOverlayPatch, 'elementRef') || hasOwn(descriptorOverlayPatch, 'ownership')) {
          throw new InvalidArgumentError('Descriptor-owned overlays cannot replace their element or ownership');
        }
        if (hasOwn(descriptorOverlayPatch, 'positioning')) {
          throw new InvalidArgumentError('Descriptor-owned overlays cannot change positioning');
        }
        const descriptorPatch: InternalDescriptorPatch<T> = {
          ...(hasOwn(descriptorOverlayPatch, 'position') && descriptorOverlayPatch.position !== undefined ? { position: descriptorOverlayPatch.position } : {}),
          ...(hasOwn(descriptorOverlayPatch, 'offset') ? { offset: descriptorOverlayPatch.offset } : {}),
          ...(hasOwn(descriptorOverlayPatch, 'data') ? { data: descriptorOverlayPatch.data } : {}),
          ...(hasOwn(descriptorOverlayPatch, 'position') && descriptorOverlayPatch.position === undefined
            ? { visible: false }
            : hasOwn(descriptorOverlayPatch, 'visible')
              ? { visible: descriptorOverlayPatch.visible }
              : {})
        };
        return this.#prepareDescriptorUpdateCore(record.descriptor as DescriptorRecord<T>, descriptorPatch);
      }
      const after = applyPatch(record.state, patch);
      if (sameState(record.state, after)) return noOpReceipt();
      const before = record.state;
      const beforeRender = toRenderState(before);
      const afterRender = toRenderState(after);
      if (!sameRenderState(beforeRender, afterRender)) this.#port.update(beforeRender, afterRender);
      record.state = after;
      const token = Object.freeze({});
      record.pendingMutation = token;
      let settled = false;
      return {
        commit: () => {
          if (settled) return;
          this.#assertPending(record, token);
          settled = true;
          record.pendingMutation = undefined;
          if (before.elementRef !== after.elementRef) this.#port.releaseElement(before.elementRef, before.ownership);
        },
        rollback: () => {
          if (settled) return;
          this.#assertPending(record, token);
          if (!sameRenderState(afterRender, beforeRender)) this.#port.update(afterRender, beforeRender);
          record.state = before;
          record.pendingMutation = undefined;
          settled = true;
        }
      };
    });
  }

  /** 更新普通 Overlay 的地图坐标。 */
  #setPosition(id: string, generation: object, position: Coordinate | undefined): void {
    const descriptor = this.#records.get(id)?.descriptor;
    if (descriptor !== undefined && descriptor.generation === generation && descriptor.phase === 'active') {
      if (position === undefined) this.#setDescriptorVisible(id, generation, false);
      else this.#prepareDescriptorUpdate(id, generation, { position, visible: true }).commit();
      return;
    }
    this.#update(id, generation, { position, visible: position !== undefined });
  }

  /** 更新普通 Overlay 的可见状态。 */
  #setVisible(id: string, generation: object, visible: boolean): void {
    const record = this.#requireRecord(id, generation);
    if (record.descriptor !== undefined) {
      this.#setDescriptorVisible(id, generation, visible);
      return;
    }
    if (visible && record.state.position === undefined) return;
    this.#update(id, generation, { visible });
  }

  /** 请求将普通 Overlay 平移到视野内。 */
  #panIntoView(id: string, generation: object, options?: CorePanIntoViewSpec): void {
    this.#assertCanMutate();
    const record = this.#requireRecord(id, generation);
    if (!record.state.visible || record.state.position === undefined) return;
    this.#port.panIntoView(id, normalizePan(options, 'Pan options'));
  }

  /** 销毁指定代次的普通 Overlay。 */
  #destroyByGeneration(id: string, generation: object): void {
    this.#assertCanMutate();
    const record = this.#records.get(id);
    if (record === undefined || record.generation !== generation || record.phase !== 'active') return;
    if (record.descriptor !== undefined) {
      this.#destroyDescriptor(record.descriptor);
      return;
    }
    record.phase = 'destroying';
    let firstError: unknown;
    let failed = false;
    for (const finalize of [() => this.#port.detach(id), () => this.#port.releaseElement(record.state.elementRef, record.state.ownership)]) {
      try {
        finalize();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    record.phase = 'destroyed';
    if (this.#records.get(id) === record) this.#records.delete(id);
    if (failed) throw firstError;
  }

  /** 判断普通 Overlay 句柄是否仍指向当前记录。 */
  #isCurrent(id: string, generation: object): boolean {
    const record = this.#records.get(id);
    return !this.#disposed && record?.generation === generation && record.phase === 'active';
  }

  /** 创建普通 Overlay 记录及其句柄控制器。 */
  #createOverlayRecord<T>(state: Readonly<InternalOverlayState<T>>, generation: object = Object.freeze({})): OverlayRecord<T> {
    const handle = new OverlayHandle<T>({
      id: state.id,
      isCurrent: () => this.#isCurrent(state.id, generation),
      state: () => this.#requireRecord<T>(state.id, generation).state,
      prepareUpdate: (patch) => this.#prepareUpdate(state.id, generation, patch),
      setPosition: (position) => this.#setPosition(state.id, generation, position),
      show: () => this.#setVisible(state.id, generation, true),
      hide: () => this.#setVisible(state.id, generation, false),
      panIntoView: (options) => this.#panIntoView(state.id, generation, options),
      destroy: () => this.#destroyByGeneration(state.id, generation)
    });
    return { state, generation, handle, phase: 'active', pendingMutation: undefined, descriptor: undefined };
  }

  /** 读取并校验当前普通 Overlay 记录。 */
  #requireRecord<T>(id: string, generation: object): OverlayRecord<T> {
    this.#assertActive();
    const record = this.#records.get(id);
    if (record === undefined || record.generation !== generation || record.phase !== 'active') {
      throw new ObjectDisposedError(`Overlay handle is stale: ${id}`);
    }
    if (record.pendingMutation !== undefined) throw new InvalidArgumentError(`Overlay mutation is pending handoff: ${id}`);
    return record as OverlayRecord<T>;
  }

  /** 校验普通 Overlay 更新仍处于待提交状态。 */
  #assertPending<T>(record: OverlayRecord<T>, token: object): void {
    this.#assertActive();
    if (record.phase !== 'active' || this.#records.get(record.state.id) !== record || record.pendingMutation !== token) {
      throw new ObjectDisposedError(`Overlay mutation receipt is stale: ${record.state.id}`);
    }
  }

  /** 准备指定 Descriptor 的可提交更新。 */
  #prepareDescriptorUpdate<T>(id: string, generation: object, patch: InternalDescriptorPatch<T>): import('./DescriptorHandle.js').DescriptorUpdateReceipt {
    return this.#mutation(() => this.#prepareDescriptorUpdateCore(this.#requireDescriptor<T>(id, generation), patch));
  }

  /** 计算 Descriptor 更新涉及的底层资源变更。 */
  #prepareDescriptorUpdateCore<T>(record: DescriptorRecord<T>, patch: InternalDescriptorPatch<T>): import('./DescriptorHandle.js').DescriptorUpdateReceipt {
    const normalized = applyDescriptorPatch(record.state, record.callbacks, patch);
    const beforeState = record.state;
    const beforeCallbacks = record.callbacks;
    const afterState = normalized.state;
    const afterCallbacks = normalized.callbacks;
    if (sameDescriptorState(beforeState, afterState) && sameDescriptorCallbacks(beforeCallbacks, afterCallbacks)) return noOpReceipt();

    const beforeOverlay = record.overlay.state;
    const afterOverlay = descriptorOverlayState(afterState);
    const beforeRenderPosition = record.renderPosition;
    const beforeFixedPixel = record.fixedPixel;
    const positionChanged = !tupleEqual(beforeState.position, afterState.position);
    const afterFixedPixel =
      afterState.fixedMode === 'pixel'
        ? beforeState.fixedMode !== 'pixel' || positionChanged
          ? this.#port.coordinateToPixel(afterState.position)
          : beforeFixedPixel
        : undefined;
    const afterRenderPosition = afterFixedPixel === undefined ? afterState.position : (this.#port.pixelToCoordinate(afterFixedPixel) ?? afterState.position);
    const beforeRender = descriptorRenderState(record);
    const afterRender = renderStateAt(afterOverlay, afterRenderPosition);
    const addsLine = !beforeState.fixedLine && afterState.fixedLine;
    const removesLine = beforeState.fixedLine && !afterState.fixedLine;
    const addsDrag = !beforeState.draggable && afterState.draggable;
    const removesDrag = beforeState.draggable && !afterState.draggable;
    const addsLayout = !needsLayout(beforeState) && needsLayout(afterState);
    const removesLayout = needsLayout(beforeState) && !needsLayout(afterState);
    const changesLineColor = beforeState.fixedLine && afterState.fixedLine && beforeState.fixedLineColor !== afterState.fixedLineColor;
    let newDragDisposer: (() => void) | undefined;
    let newAnimation: AnimationControlHandle | undefined;
    let lineAdded = false;
    let layoutAdded = false;
    let portUpdated = false;
    let colorUpdated = false;

    try {
      if (addsLine) {
        record.lineAttached = true;
        this.#descriptorByLine.set(record.lineId, record as DescriptorRecord);
        this.#store.add(createDescriptorLineState(record.lineId, afterState, this.#descriptorLayerId));
        lineAdded = true;
        if (record.phase !== 'active') throw new ObjectDisposedError(`Descriptor line was removed while enabling fixedLine: ${record.state.id}`);
        newAnimation = this.#animations.play({ id: record.lineId }, { type: 'dash-flow', channel: 'descriptor-fixed-line' });
      } else if (changesLineColor) {
        this.#store.update({ id: record.lineId }, { style: descriptorLineStyle(afterState.fixedLineColor) });
        colorUpdated = true;
      }
      if (addsDrag) {
        newDragDisposer = requireDisposer(
          this.#port.bindDrag(record.state.id, (event) => this.#onDescriptorDrag(record.state.id, record.generation, event)),
          'Descriptor drag binding'
        );
      }
      if (addsLayout) {
        this.#acquireLayout(record.state.id);
        layoutAdded = true;
      }
      if (!sameRenderState(beforeRender, afterRender)) {
        this.#port.update(beforeRender, afterRender);
        portUpdated = true;
      }

      record.state = afterState;
      record.callbacks = afterCallbacks;
      record.overlay.state = afterOverlay;
      record.renderPosition = afterRenderPosition;
      record.fixedPixel = afterFixedPixel;
      if (newDragDisposer !== undefined) record.dragDisposer = newDragDisposer;
      if (newAnimation !== undefined) record.animation = newAnimation;
      this.#syncDescriptor(record);
    } catch (error) {
      if (record.phase !== 'active') throw error;
      record.state = beforeState;
      record.callbacks = beforeCallbacks;
      record.overlay.state = beforeOverlay;
      record.renderPosition = beforeRenderPosition;
      record.fixedPixel = beforeFixedPixel;
      if (newDragDisposer !== undefined) record.dragDisposer = undefined;
      if (newAnimation !== undefined) record.animation = undefined;
      if (addsLine) {
        record.lineAttached = false;
        this.#descriptorByLine.delete(record.lineId);
      }
      const rollback: Array<() => void> = [];
      if (portUpdated) rollback.push(() => this.#port.update(afterRender, beforeRender));
      if (newAnimation !== undefined) rollback.push(() => newAnimation?.stop());
      if (lineAdded) rollback.push(() => void this.#store.remove({ id: record.lineId }));
      if (colorUpdated) rollback.push(() => void this.#store.update({ id: record.lineId }, { style: descriptorLineStyle(beforeState.fixedLineColor) }));
      if (layoutAdded) rollback.push(() => this.#leaveLayout(record.state.id));
      if (newDragDisposer !== undefined) rollback.push(newDragDisposer);
      try {
        runFinalizers(rollback);
      } catch {
        // 保留适配器或元素仓库触发的原始异常。
      }
      throw error;
    }

    const token = Object.freeze({});
    record.pendingMutation = token;
    record.overlay.pendingMutation = token;
    let settled = false;
    return {
      commit: () => {
        if (settled) return;
        this.#assertDescriptorPending(record, token);
        settled = true;
        record.pendingMutation = undefined;
        record.overlay.pendingMutation = undefined;
        const finalizers: Array<() => void> = [];
        if (removesLine) {
          const animation = record.animation;
          record.animation = undefined;
          record.lineAttached = false;
          this.#descriptorByLine.delete(record.lineId);
          if (animation !== undefined) finalizers.push(() => animation.stop());
          finalizers.push(() => void this.#store.remove({ id: record.lineId }));
        }
        if (removesLayout) finalizers.push(() => this.#leaveLayout(record.state.id));
        if (removesDrag) {
          const dispose = record.dragDisposer;
          record.dragDisposer = undefined;
          record.dragState = undefined;
          if (dispose !== undefined) finalizers.push(dispose);
        }
        if (beforeState.elementRef !== afterState.elementRef) {
          finalizers.push(() => this.#port.releaseElement(beforeState.elementRef, 'earth'));
        }
        runFinalizers(finalizers);
      },
      rollback: () => {
        if (settled) return;
        this.#assertDescriptorPending(record, token);
        if (portUpdated) this.#port.update(afterRender, beforeRender);
        settled = true;
        record.pendingMutation = undefined;
        record.overlay.pendingMutation = undefined;
        record.state = beforeState;
        record.callbacks = beforeCallbacks;
        record.overlay.state = beforeOverlay;
        record.renderPosition = beforeRenderPosition;
        record.fixedPixel = beforeFixedPixel;
        if (addsLine) {
          record.lineAttached = false;
          this.#descriptorByLine.delete(record.lineId);
        }
        const rollback: Array<() => void> = [];
        if (newAnimation !== undefined) {
          record.animation = undefined;
          rollback.push(() => newAnimation?.stop());
        }
        if (lineAdded) rollback.push(() => void this.#store.remove({ id: record.lineId }));
        if (colorUpdated) rollback.push(() => void this.#store.update({ id: record.lineId }, { style: descriptorLineStyle(beforeState.fixedLineColor) }));
        if (layoutAdded) rollback.push(() => this.#leaveLayout(record.state.id));
        if (newDragDisposer !== undefined) {
          record.dragDisposer = undefined;
          rollback.push(newDragDisposer);
        }
        rollback.push(() => this.#syncDescriptor(record));
        try {
          runFinalizers(rollback);
        } catch (error) {
          this.#report(error, 'descriptor-update-rollback');
        }
      }
    };
  }

  /** 更新 Descriptor 的地图坐标。 */
  #setDescriptorPosition(id: string, generation: object, position: Coordinate): void {
    this.#prepareDescriptorUpdate(id, generation, { position }).commit();
  }

  /** 更新指定 Descriptor 的可见状态。 */
  #setDescriptorVisible(id: string, generation: object, visible: boolean): void {
    this.#mutation(() => this.#setDescriptorVisibleCore(this.#requireDescriptor(id, generation), visible));
  }

  /** 更新 Descriptor 记录及关联 Overlay 的可见状态。 */
  #setDescriptorVisibleCore<T>(record: DescriptorRecord<T>, visible: boolean): void {
    if (record.state.visible === visible) {
      if (needsLayout(record.state)) this.#acquireLayout(record.state.id);
      else if (this.#layoutIds.has(record.state.id)) this.#leaveLayout(record.state.id);
      if (visible) record.closeArmed = true;
      return;
    }
    const beforeState = record.state;
    const afterState = freeze({ ...beforeState, visible });
    const afterOverlay = descriptorOverlayState(afterState);
    const beforeRender = descriptorRenderState(record);
    let afterFixedPixel = record.fixedPixel;
    let afterRenderPosition = record.renderPosition;
    if (visible && afterState.fixedMode === 'pixel') {
      if (afterFixedPixel === undefined) afterFixedPixel = this.#port.coordinateToPixel(afterState.position);
      const currentPosition = afterFixedPixel === undefined ? undefined : this.#port.pixelToCoordinate(afterFixedPixel);
      if (currentPosition !== undefined) afterRenderPosition = freeze([...currentPosition]) as Coordinate;
    }
    const afterRender = renderStateAt(afterOverlay, afterRenderPosition);
    const addsLayout = !needsLayout(beforeState) && needsLayout(afterState);
    const removesLayout = needsLayout(beforeState) && !needsLayout(afterState);
    let layoutAdded = false;
    let portUpdated = false;
    try {
      if (addsLayout) {
        this.#acquireLayout(record.state.id);
        layoutAdded = true;
      }
      this.#port.update(beforeRender, afterRender);
      portUpdated = true;
      if (afterState.fixedLine) {
        if (visible) this.#syncDescriptorLine(record, afterState);
        else this.#store.update({ id: record.lineId }, { visible: false });
      }
    } catch (error) {
      const rollback: Array<() => void> = [];
      if (portUpdated) rollback.push(() => this.#port.update(afterRender, beforeRender));
      if (layoutAdded) rollback.push(() => this.#leaveLayout(record.state.id));
      try {
        runFinalizers(rollback);
      } catch {
        // 保留布局订阅、适配器或元素仓库触发的原始异常。
      }
      throw error;
    }
    record.state = afterState;
    record.overlay.state = afterOverlay;
    record.renderPosition = afterRenderPosition;
    record.fixedPixel = afterFixedPixel;
    if (visible) record.closeArmed = true;
    else record.dragState = undefined;
    if (removesLayout) this.#leaveLayout(record.state.id);
  }

  /** 执行指定 Descriptor 的关闭行为。 */
  #closeDescriptor(id: string, generation: object): void {
    this.#mutation(() => this.#closeDescriptorCore(id, generation));
  }

  /** 在变更作用域内执行 Descriptor 关闭。 */
  #closeDescriptorCore(id: string, generation: object): void {
    const record = this.#requireDescriptor(id, generation);
    if (!record.state.visible || !record.closeArmed || record.closing) return;
    record.closeArmed = false;
    record.closing = true;
    const event = descriptorEvent(record, 'close');
    try {
      for (const listener of [...record.listeners.close]) {
        this.#invokeDescriptorCallback(listener, event, 'descriptor-close-listener');
      }
      if (record.callbacks.onClose !== undefined) this.#invokeDescriptorCallback(record.callbacks.onClose, event, 'descriptor-close-callback');
      if (record.phase !== 'active') return;
      if (record.state.closeAction === 'destroy') this.#destroyDescriptor(record);
      else this.#setDescriptorVisibleCore(record, false);
    } catch (error) {
      if (record.phase === 'active' && record.state.visible) record.closeArmed = true;
      throw error;
    } finally {
      record.closing = false;
    }
  }

  /** 订阅指定 Descriptor 的内部事件。 */
  #subscribeDescriptor<T>(id: string, generation: object, type: 'click' | 'close', listener: (event: InternalDescriptorEvent<T>) => void): () => void {
    const record = this.#requireDescriptor<T>(id, generation);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Descriptor listener must be a function');
    const listeners = record.listeners[type] as Set<(event: InternalDescriptorEvent<T>) => void>;
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
    };
  }

  /** 处理底层 Descriptor 点击或关闭动作。 */
  #onDescriptorAction(id: string, generation: object, action: DescriptorPortAction): void {
    const record = this.#descriptors.get(id);
    if (record === undefined || record.generation !== generation || record.phase !== 'active') return;
    try {
      if (action.type === 'close') {
        if (!record.state.close || !record.state.visible) return;
        this.#closeDescriptor(id, generation);
        return;
      }
      if (
        !record.state.visible ||
        !Number.isInteger(action.index) ||
        action.index < 0 ||
        action.index >= record.state.items.length ||
        record.state.type !== 'list'
      )
        return;
      const event = descriptorEvent(record, 'click', action.index);
      for (const listener of [...record.listeners.click]) {
        this.#invokeDescriptorCallback(listener, event, 'descriptor-click-listener');
      }
      if (record.callbacks.onItemClick !== undefined) this.#invokeDescriptorCallback(record.callbacks.onItemClick, event, 'descriptor-click-callback');
    } catch (error) {
      this.#report(error, 'descriptor-action');
    }
  }

  /** 处理底层 Descriptor 拖动事件。 */
  #onDescriptorDrag(id: string, generation: object, event: OverlayDragEvent): void {
    const record = this.#descriptors.get(id);
    if (record === undefined || record.generation !== generation || record.phase !== 'active' || !record.state.draggable || !record.state.visible) return;
    try {
      if (event.type === 'start') {
        record.dragState = { pointerId: event.pointerId, startPixel: freeze([...event.pixel]) as Pixel, startOffset: record.state.offset };
        return;
      }
      const drag = record.dragState;
      if (drag === undefined || drag.pointerId !== event.pointerId) return;
      if (event.type === 'move') {
        const offset: Pixel = freeze([drag.startOffset[0] + event.pixel[0] - drag.startPixel[0], drag.startOffset[1] + event.pixel[1] - drag.startPixel[1]]);
        this.#prepareDescriptorUpdate(id, generation, { offset }).commit();
        return;
      }
      record.dragState = undefined;
    } catch (error) {
      this.#report(error, 'descriptor-drag');
    }
  }

  /** 销毁指定代次的 Descriptor。 */
  #destroyDescriptorByGeneration(id: string, generation: object): void {
    this.#assertCanMutate();
    const record = this.#descriptors.get(id);
    if (record === undefined || record.generation !== generation || record.phase !== 'active') return;
    this.#destroyDescriptor(record);
  }

  /** 销毁 Descriptor 记录及关联资源。 */
  #destroyDescriptor<T>(record: DescriptorRecord<T>): void {
    if (record.phase !== 'active') return;
    record.phase = 'destroying';
    record.overlay.phase = 'destroying';
    record.closeArmed = false;
    this.#descriptorByLine.delete(record.lineId);
    const animation = record.animation;
    const lineAttached = record.lineAttached;
    const dragDisposer = record.dragDisposer;
    const actionDisposer = record.actionDisposer;
    record.animation = undefined;
    record.lineAttached = false;
    record.dragDisposer = undefined;
    record.actionDisposer = undefined;
    let failure: unknown;
    try {
      runFinalizers([
        ...(animation === undefined ? [] : [() => animation.stop()]),
        ...(lineAttached ? [() => void this.#store.remove({ id: record.lineId })] : []),
        ...(this.#layoutIds.has(record.state.id) ? [() => this.#leaveLayout(record.state.id)] : []),
        ...(dragDisposer === undefined ? [] : [dragDisposer]),
        ...(actionDisposer === undefined ? [] : [actionDisposer]),
        () => this.#port.detach(record.state.id),
        () => this.#port.releaseElement(record.state.elementRef, 'earth')
      ]);
    } catch (error) {
      failure = error;
    }
    record.listeners.click.clear();
    record.listeners.close.clear();
    record.dragState = undefined;
    record.pendingMutation = undefined;
    record.overlay.pendingMutation = undefined;
    record.phase = 'destroyed';
    record.overlay.phase = 'destroyed';
    if (this.#descriptors.get(record.state.id) === record) this.#descriptors.delete(record.state.id);
    if (this.#records.get(record.state.id) === record.overlay) this.#records.delete(record.state.id);
    if (failure !== undefined) throw failure;
  }

  /** 判断 Descriptor 句柄是否仍指向当前记录。 */
  #isDescriptorCurrent(id: string, generation: object): boolean {
    const record = this.#descriptors.get(id);
    return !this.#disposed && record?.generation === generation && record.phase === 'active';
  }

  /** 读取并校验当前 Descriptor 记录。 */
  #requireDescriptor<T>(id: string, generation: object): DescriptorRecord<T> {
    this.#assertActive();
    const record = this.#descriptors.get(id);
    if (record === undefined || record.generation !== generation || record.phase !== 'active') {
      throw new ObjectDisposedError(`Descriptor handle is stale: ${id}`);
    }
    if (record.pendingMutation !== undefined) throw new InvalidArgumentError(`Descriptor mutation is pending handoff: ${id}`);
    return record as DescriptorRecord<T>;
  }

  /** 校验 Descriptor 更新仍处于待提交状态。 */
  #assertDescriptorPending<T>(record: DescriptorRecord<T>, token: object): void {
    this.#assertActive();
    if (record.phase !== 'active' || this.#descriptors.get(record.state.id) !== record || record.pendingMutation !== token) {
      throw new ObjectDisposedError(`Descriptor mutation receipt is stale: ${record.state.id}`);
    }
  }

  /** 将 Descriptor 加入布局同步集合。 */
  #acquireLayout(id: string): void {
    if (this.#layoutIds.has(id)) return;
    if (this.#layoutDisposer === undefined) {
      const dispose = requireDisposer(
        this.#port.subscribeLayout(() => this.#onLayout()),
        'Descriptor layout subscription'
      );
      this.#layoutDisposer = dispose;
    }
    this.#layoutIds.add(id);
  }

  /** 将 Descriptor 移出布局同步集合。 */
  #leaveLayout(id: string): void {
    if (!this.#layoutIds.delete(id) || this.#layoutIds.size > 0) return;
    const dispose = this.#layoutDisposer;
    dispose?.();
    this.#layoutDisposer = undefined;
  }

  /** 响应底层布局变化并同步相关 Descriptor。 */
  #onLayout(): void {
    for (const id of [...this.#layoutIds]) {
      const record = this.#descriptors.get(id);
      if (record === undefined || record.phase !== 'active' || record.pendingMutation !== undefined) continue;
      try {
        this.#syncDescriptor(record);
      } catch (error) {
        this.#report(error, 'descriptor-layout');
      }
    }
  }

  /** 同步 Descriptor 渲染坐标和固定线。 */
  #syncDescriptor<T>(record: DescriptorRecord<T>): void {
    if (record.phase !== 'active') return;
    if (record.state.fixedMode === 'pixel') {
      if (record.fixedPixel === undefined) record.fixedPixel = this.#port.coordinateToPixel(record.state.position);
      const position = record.fixedPixel === undefined ? undefined : this.#port.pixelToCoordinate(record.fixedPixel);
      if (position !== undefined && !tupleEqual(position, record.renderPosition)) {
        const before = descriptorRenderState(record);
        const after = renderStateAt(record.overlay.state, position);
        this.#port.update(before, after);
        record.renderPosition = freeze([...position]) as Coordinate;
      }
    }
    this.#syncDescriptorLine(record, record.state);
  }

  /** 按目标 Descriptor 状态同步固定线，供布局帧与显示交接共享。 */
  #syncDescriptorLine<T>(record: DescriptorRecord<T>, state: Readonly<InternalDescriptorState<T>>): void {
    if (!state.fixedLine) return;
    const anchorPixel = this.#port.coordinateToPixel(state.position);
    const bounds = this.#port.getBounds(state.id);
    let endpoint = state.position;
    if (anchorPixel !== undefined && bounds !== undefined) {
      const edgePixel = nearestBoundsPoint(anchorPixel, bounds);
      endpoint = this.#port.pixelToCoordinate(edgePixel) ?? endpoint;
    }
    const current = this.#store.get(record.lineId);
    if (current === undefined) return;
    const geometry = { type: 'polyline' as const, controlPoints: [state.position, endpoint] };
    const style = descriptorLineStyle(state.fixedLineColor);
    const geometryChanged = !samePolyline(current.geometry, geometry);
    const styleChanged = !sameLineStyle(current.style, style);
    if (geometryChanged || styleChanged || current.visible !== state.visible) {
      this.#store.update(
        { id: record.lineId },
        {
          ...(geometryChanged ? { geometry } : {}),
          ...(styleChanged ? { style } : {}),
          ...(current.visible !== state.visible ? { visible: state.visible } : {})
        }
      );
    }
  }

  /** 根据元素仓库变化维护 Descriptor 固定线。 */
  #onElementChanges(changes: ElementChangeSet): void {
    for (const change of changes.changes) {
      if (change.kind !== 'remove') continue;
      const record = this.#descriptorByLine.get(change.id);
      if (record === undefined || record.phase !== 'active') continue;
      try {
        this.#destroyDescriptor(record);
      } catch (error) {
        this.#report(error, 'descriptor-line-cascade');
      }
    }
  }

  /** 安全调用 Descriptor 业务回调。 */
  #invokeDescriptorCallback<T>(callback: (event: InternalDescriptorEvent<T>) => void, event: InternalDescriptorEvent<T>, operation: string): void {
    try {
      const result = (callback as (value: InternalDescriptorEvent<T>) => unknown)(event);
      void Promise.resolve(result).catch((error: unknown) => this.#report(error, operation));
    } catch (error) {
      this.#report(error, operation);
    }
  }

  /** 生成未被占用的 Overlay ID。 */
  #generateId(): string {
    const provided = this.#createId?.();
    if (provided !== undefined) return assertId(provided, 'Generated overlay id');
    let candidate: string;
    do candidate = `overlay-${++this.#nextId}`;
    while (this.#records.has(candidate));
    return candidate;
  }

  /** 在不可重入作用域内执行服务变更。 */
  #mutation<T>(work: () => T): T {
    this.#assertCanMutate();
    this.#mutating = true;
    try {
      return work();
    } finally {
      this.#mutating = false;
    }
  }

  /** 确保当前允许执行变更操作。 */
  #assertCanMutate(): void {
    this.#assertActive();
    if (this.#selectorDepth > 0) throw new InvalidArgumentError('Overlay selector predicates are read-only');
    if (this.#mutating) throw new InvalidArgumentError('Reentrant overlay mutations are not supported');
  }

  /** 确保 Overlay 服务仍可使用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('OverlayService has been destroyed');
  }

  /** 隔离并上报 Overlay 回调错误。 */
  #report(error: unknown, operation: string): void {
    try {
      const result = this.#errorReporter(error, { source: 'OverlayService', operation });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // 错误报告器与服务状态相互隔离。
    }
  }
}

/** 校验并规范化普通 Overlay 创建配置。 */
function normalizeSpec<T>(input: InternalOverlaySpec<T>, createId: () => string): Readonly<InternalOverlayState<T>> {
  const spec = inspectRecord(input, 'Overlay spec');
  assertFields(
    spec,
    new Set(['id', 'elementRef', 'position', 'offset', 'positioning', 'stopEvent', 'insertFirst', 'autoPan', 'className', 'module', 'data', 'ownership']),
    'Overlay spec'
  );
  const elementRef = required(spec, 'elementRef');
  if (!isNativeRef(elementRef)) throw new InvalidArgumentError('Overlay elementRef must be an issued native reference');
  const position = hasOwn(spec, 'position') ? coordinate(spec.position, 'Overlay position') : undefined;
  const result: InternalOverlayState<T> = {
    id: hasOwn(spec, 'id') ? assertId(spec.id, 'Overlay id') : createId(),
    elementRef: elementRef as NativeRef<'element'>,
    position,
    offset: hasOwn(spec, 'offset') ? pixel(spec.offset, 'Overlay offset') : [0, 0],
    positioning: hasOwn(spec, 'positioning') ? positioning(spec.positioning) : 'top-left',
    stopEvent: hasOwn(spec, 'stopEvent') ? booleanValue(spec.stopEvent, 'Overlay stopEvent') : true,
    insertFirst: hasOwn(spec, 'insertFirst') ? booleanValue(spec.insertFirst, 'Overlay insertFirst') : true,
    autoPan: hasOwn(spec, 'autoPan') ? normalizeAutoPan(spec.autoPan) : false,
    className: hasOwn(spec, 'className') ? optionalString(spec.className, 'Overlay className') : undefined,
    module: hasOwn(spec, 'module') ? assertId(spec.module, 'Overlay module') : undefined,
    data: hasOwn(spec, 'data') ? snapshotData(spec.data as T) : undefined,
    ownership: hasOwn(spec, 'ownership') ? ownership(spec.ownership) : 'external',
    visible: position !== undefined,
    kind: 'overlay'
  };
  return freeze(result);
}

/** 校验普通 Overlay 补丁并计算下一状态。 */
function applyPatch<T>(before: Readonly<InternalOverlayState<T>>, input: InternalOverlayPatch<T>): Readonly<InternalOverlayState<T>> {
  const patch = inspectRecord(input, 'Overlay patch');
  assertFields(patch, new Set(['elementRef', 'position', 'offset', 'positioning', 'visible', 'data', 'ownership']), 'Overlay patch');
  const hasPosition = hasOwn(patch, 'position');
  const nextPosition = hasPosition ? coordinate(patch.position, 'Overlay position') : before.position;
  const requestedVisible = hasOwn(patch, 'visible') ? booleanValue(patch.visible, 'Overlay visible') : before.visible;
  const elementRef = hasOwn(patch, 'elementRef') ? patch.elementRef : before.elementRef;
  if (!isNativeRef(elementRef)) throw new InvalidArgumentError('Overlay elementRef must be an issued native reference');
  const result: InternalOverlayState<T> = {
    ...before,
    elementRef: elementRef as NativeRef<'element'>,
    position: nextPosition,
    offset: hasOwn(patch, 'offset') ? pixel(patch.offset, 'Overlay offset') : before.offset,
    positioning: hasOwn(patch, 'positioning') ? positioning(patch.positioning) : before.positioning,
    visible: nextPosition === undefined ? false : requestedVisible,
    data: hasOwn(patch, 'data') ? snapshotData(patch.data as T) : before.data,
    ownership: hasOwn(patch, 'ownership') ? ownership(patch.ownership) : before.ownership
  };
  return freeze(result);
}

/** 校验并复制普通 Overlay 选择器。 */
function normalizeSelector<T>(selector?: InternalOverlaySelector<T>): InternalOverlaySelector<T> {
  if (selector === undefined) return {};
  const record = inspectRecord(selector, 'Overlay selector');
  assertFields(record, new Set(['id', 'ids', 'module', 'visible', 'predicate']), 'Overlay selector');
  if (hasOwn(record, 'id') && hasOwn(record, 'ids')) throw new InvalidArgumentError('Overlay selector cannot contain both id and ids');
  const predicate = record.predicate;
  if (predicate !== undefined && typeof predicate !== 'function') throw new InvalidArgumentError('Overlay predicate must be a function');
  return {
    ...(hasOwn(record, 'id') ? { id: assertId(record.id, 'Overlay selector id') } : {}),
    ...(hasOwn(record, 'ids') ? { ids: idArray(record.ids, 'Overlay selector ids') } : {}),
    ...(hasOwn(record, 'module') ? { module: assertId(record.module, 'Overlay selector module') } : {}),
    ...(hasOwn(record, 'visible') ? { visible: booleanValue(record.visible, 'Overlay selector visible') } : {}),
    ...(predicate === undefined ? {} : { predicate: predicate as InternalOverlaySelector<T>['predicate'] })
  };
}

/** 断言移除操作使用了明确的选择条件。 */
function assertDestructiveSelector(selector: InternalOverlaySelector): void {
  if (selector === null || typeof selector !== 'object' || Array.isArray(selector)) throw new InvalidSelectorError();
  const normalized = normalizeSelector(selector);
  if (
    normalized.id === undefined &&
    (normalized.ids === undefined || normalized.ids.length === 0) &&
    normalized.module === undefined &&
    normalized.visible === undefined &&
    normalized.predicate === undefined
  ) {
    throw new InvalidSelectorError();
  }
}

/** 将内部 Overlay 状态转换为底层渲染状态。 */
function toRenderState(state: Readonly<InternalOverlayState>): Readonly<OverlayRenderState> {
  return state;
}

/** 比较两个内部 Overlay 状态是否一致。 */
function sameState(left: Readonly<InternalOverlayState>, right: Readonly<InternalOverlayState>): boolean {
  return sameRenderState(left, right) && left.module === right.module && left.data === right.data && left.kind === right.kind;
}

/** 比较两个底层 Overlay 渲染状态是否一致。 */
function sameRenderState(left: Readonly<OverlayRenderState>, right: Readonly<OverlayRenderState>): boolean {
  return (
    left.id === right.id &&
    left.elementRef === right.elementRef &&
    tupleEqual(left.position, right.position) &&
    tupleEqual(left.offset, right.offset) &&
    left.positioning === right.positioning &&
    left.stopEvent === right.stopEvent &&
    left.insertFirst === right.insertFirst &&
    left.autoPan === right.autoPan &&
    left.className === right.className &&
    left.visible === right.visible &&
    left.ownership === right.ownership
  );
}

/** 规范化自动平移配置。 */
function normalizeAutoPan(value: unknown): false | CorePanIntoViewSpec {
  if (value === undefined || value === false) return false;
  if (value === true) return freeze({});
  return normalizePan(value, 'Overlay autoPan') ?? freeze({});
}

/** 校验并规范化平移到视野内的配置。 */
function normalizePan(value: unknown, label: string): CorePanIntoViewSpec | undefined {
  if (value === undefined) return undefined;
  const record = inspectRecord(value, label);
  assertFields(record, new Set(['margin', 'duration', 'easing']), label);
  const easing = record.easing;
  if (easing !== undefined && typeof easing !== 'function') throw new InvalidArgumentError(`${label} easing must be a function`);
  return freeze({
    ...(hasOwn(record, 'margin') ? { margin: nonNegative(record.margin, `${label} margin`) } : {}),
    ...(hasOwn(record, 'duration') ? { duration: nonNegative(record.duration, `${label} duration`) } : {}),
    ...(easing === undefined ? {} : { easing: easing as (progress: number) => number })
  });
}

/** 克隆并冻结 Overlay 业务数据。 */
function snapshotData<T>(value: T): Readonly<T> | undefined {
  if (value === undefined) return undefined;
  return freeze(cloneCoreState(value));
}

/** 校验可选的二维或三维地图坐标。 */
function coordinate(value: unknown, label: string): Coordinate | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3) || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  }
  return Object.freeze([...value]) as Coordinate;
}

/** 校验二维像素坐标。 */
function pixel(value: unknown, label: string): Pixel {
  const result = coordinate(value, label);
  if (result === undefined || result.length !== 2) throw new InvalidArgumentError(`${label} must contain two finite numbers`);
  return result;
}

/** 校验 Overlay 定位方式。 */
function positioning(value: unknown): CoreOverlayPositioning {
  if (typeof value !== 'string' || !positioningValues.has(value)) throw new InvalidArgumentError('Overlay positioning is invalid');
  return value as CoreOverlayPositioning;
}

/** 校验原生元素引用所有权。 */
function ownership(value: unknown): CoreOverlayOwnership {
  if (value !== 'external' && value !== 'earth') throw new InvalidArgumentError('Overlay ownership must be external or earth');
  return value;
}

/** 读取布尔值。 */
function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}

/** 读取非负有限数字。 */
function nonNegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new InvalidArgumentError(`${label} must be a non-negative finite number`);
  return value;
}

/** 读取可选字符串。 */
function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new InvalidArgumentError(`${label} must be a string`);
  return value;
}

/** 校验非空 ID。 */
function assertId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

/** 校验并冻结 ID 数组。 */
function idArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be an array`);
  return Object.freeze(value.map((id) => assertId(id, label)));
}

/** 安全读取普通对象的数据属性。 */
function inspectRecord(value: unknown, label: string): Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
    const result = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} fields must be data properties`);
      result[key] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

/** 断言记录只包含允许字段。 */
function assertFields(value: Record<PropertyKey, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

/** 读取普通 Overlay 创建配置的必填字段。 */
function required(value: Record<PropertyKey, unknown>, key: string): unknown {
  if (!hasOwn(value, key)) throw new InvalidArgumentError(`Overlay spec requires ${key}`);
  return value[key];
}

/** 判断对象是否拥有指定自有属性。 */
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** 比较两个数字元组是否一致。 */
function tupleEqual(left: readonly number[] | undefined, right: readonly number[] | undefined): boolean {
  if (left === right) return true;
  return left !== undefined && right !== undefined && left.length === right.length && left.every((value, index) => value === right[index]);
}

/** 递归冻结可冻结的数据对象。 */
function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value) || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) freeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

/** 创建无需执行工作的 Overlay 更新回执。 */
function noOpReceipt(): import('./OverlayHandle.js').OverlayUpdateReceipt {
  return Object.freeze({ commit() {}, rollback() {} });
}
