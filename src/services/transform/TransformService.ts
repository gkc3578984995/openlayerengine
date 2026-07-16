import type { ElementStore } from '../../core/element/ElementStore.js';
import { compileSelector } from '../../core/element/selector.js';
import type { ElementSelector } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { TransformAnimationPort } from '../../core/ports/AnimationControlPort.js';
import type { CursorPort } from '../../core/ports/CursorPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ShapeProjectionPort } from '../../core/ports/ShapeProjectionPort.js';
import type { TransformInteractionPort } from '../../core/ports/TransformInteractionPort.js';
import type { TransformToolbarPort } from '../../core/ports/TransformToolbarPort.js';
import type { TransformTooltipPort } from '../../core/ports/TransformTooltipPort.js';
import type { TransientAnimationPort } from '../../core/ports/TransientAnimationPort.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import type { StyleSpec } from '../../core/style/types.js';
import type { InteractionCoordinator } from '../events/InteractionCoordinator.js';
import type { StyleService } from '../style/StyleService.js';
import { TransformSession } from './TransformSession.js';
import type {
  InternalTransformOptions,
  InternalTransformService,
  InternalTransformSession,
  InternalTransformToolbarItemSpec,
  InternalTransformToolbarOptions,
  NormalizedTransformOptions
} from './types.js';

/** Transform 会话使用的键盘输入子集。 */
export interface TransformKeyboardInput {
  /** 将键盘焦点交给当前地图。 */
  focus?(): void;
  /** 订阅键盘按下事件。 */
  on(
    type: 'keydown',
    listener: (event: Readonly<{ key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault(): void }>) => void
  ): () => void;
}

/** 构造 Transform 服务所需的依赖。 */
export interface TransformServiceDependencies {
  /** 元素状态仓库。 */
  readonly store: ElementStore;
  /** 图形定义注册表。 */
  readonly shapes: ShapeRegistry;
  /** 内部样式服务。 */
  readonly styles: StyleService;
  /** 互斥交互协调器。 */
  readonly coordinator: InteractionCoordinator;
  /** 底层变换交互端口。 */
  readonly interaction: TransformInteractionPort;
  /** 在元素规范状态和 View 工作状态之间转换图形。 */
  readonly shapeProjection: ShapeProjectionPort;
  /** 元素动画控制端口。 */
  readonly animations: TransformAnimationPort;
  /** 临时动画端口。 */
  readonly transients: TransientAnimationPort;
  /** 可选的工具栏端口。 */
  readonly toolbar?: TransformToolbarPort;
  /** 可选的鼠标提示端口。 */
  readonly tooltip?: TransformTooltipPort;
  /** 可选的地图交互光标端口。 */
  readonly cursor?: CursorPort;
  /** 可选的键盘输入。 */
  readonly input?: TransformKeyboardInput;
  /** 可选的复制元素 ID 生成器。 */
  readonly createId?: () => string;
  /** 可选的错误报告器。 */
  readonly errorReporter?: ErrorReporter;
}

/** 创建并管理 Transform 会话及共享剪贴板。 */
export class TransformService implements InternalTransformService {
  /** 元素状态仓库。 */
  readonly #store: ElementStore;
  /** 图形定义注册表。 */
  readonly #shapes: ShapeRegistry;
  /** 内部样式服务。 */
  readonly #styles: StyleService;
  /** 互斥交互协调器。 */
  readonly #coordinator: InteractionCoordinator;
  /** 底层变换交互端口。 */
  readonly #interaction: TransformInteractionPort;
  /** 在元素规范状态和 View 工作状态之间转换图形。 */
  readonly #shapeProjection: ShapeProjectionPort;
  /** 元素动画控制端口。 */
  readonly #animations: TransformAnimationPort;
  /** 临时动画端口。 */
  readonly #transients: TransientAnimationPort;
  /** 可选的工具栏端口。 */
  readonly #toolbar: TransformToolbarPort | undefined;
  /** 可选的鼠标提示端口。 */
  readonly #tooltip: TransformTooltipPort | undefined;
  /** 可选的地图交互光标端口。 */
  readonly #cursor: CursorPort | undefined;
  /** 可选的键盘输入。 */
  readonly #input: TransformKeyboardInput | undefined;
  /** 可选的复制元素 ID 生成器。 */
  readonly #providedCreateId: (() => string) | undefined;
  /** Transform 错误报告器。 */
  readonly #errorReporter: ErrorReporter;
  /** 当前活动的 Transform 会话。 */
  readonly #sessions = new Set<TransformSession>();
  /** 最近复制的元素快照。 */
  #clipboard: ReturnType<ElementStore['get']>;
  /** 下一个自动生成的复制元素 ID。 */
  #nextId = 0;
  /** 下一个 Transform 会话 ID。 */
  #nextSessionId = 0;
  /** 服务是否已销毁。 */
  #disposed = false;

  /** 创建 Transform 服务。 */
  constructor(dependencies: TransformServiceDependencies) {
    if (dependencies.createId !== undefined && typeof dependencies.createId !== 'function')
      throw new InvalidArgumentError('Transform createId must be a function');
    if (dependencies.errorReporter !== undefined && typeof dependencies.errorReporter !== 'function') {
      throw new InvalidArgumentError('Transform errorReporter must be a function');
    }
    this.#store = dependencies.store;
    this.#shapes = dependencies.shapes;
    this.#styles = dependencies.styles;
    this.#coordinator = dependencies.coordinator;
    this.#interaction = dependencies.interaction;
    this.#shapeProjection = dependencies.shapeProjection;
    this.#animations = dependencies.animations;
    this.#transients = dependencies.transients;
    this.#toolbar = dependencies.toolbar;
    this.#tooltip = dependencies.tooltip;
    this.#cursor = dependencies.cursor;
    this.#input = dependencies.input;
    this.#providedCreateId = dependencies.createId;
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
  }

  /** 启动一个尚未选择元素的 Transform 会话。 */
  start(options?: InternalTransformOptions): InternalTransformSession {
    return this.#start(options);
  }

  /** 启动会话并选择指定元素。 */
  select<T>(elementId: string, options?: InternalTransformOptions): InternalTransformSession<T> {
    return this.#start<T>(options, nonEmptyString(elementId, 'Transform element id'));
  }

  /** 销毁全部会话并清空剪贴板。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const session of [...this.#sessions]) session.destroy();
    this.#sessions.clear();
    this.#clipboard = undefined;
  }

  /** 创建、激活并打开 Transform 会话。 */
  #start<T>(input?: InternalTransformOptions, elementId?: string): TransformSession<T> {
    this.#assertActive();
    const options = this.#normalizeOptions(input);
    const session: TransformSession<T> = new TransformSession<T>({
      id: `transform-${++this.#nextSessionId}`,
      store: this.#store,
      shapes: this.#shapes,
      styles: this.#styles,
      coordinator: this.#coordinator,
      interaction: this.#interaction,
      shapeProjection: this.#shapeProjection,
      animations: this.#animations,
      transients: this.#transients,
      ...(this.#toolbar === undefined ? {} : { toolbarPort: this.#toolbar }),
      ...(this.#tooltip === undefined ? {} : { tooltipPort: this.#tooltip }),
      ...(this.#cursor === undefined ? {} : { cursorPort: this.#cursor }),
      ...(this.#input === undefined ? {} : { input: this.#input }),
      options,
      createId: () => this.#createId(),
      readClipboard: () => this.#clipboard,
      writeClipboard: (snapshot) => {
        this.#clipboard = snapshot;
      },
      errorReporter: this.#errorReporter,
      onTerminal: () => this.#sessions.delete(session as TransformSession)
    });
    this.#sessions.add(session as TransformSession);
    try {
      this.#coordinator.activate(session, options.policy);
      session.open();
      if (elementId !== undefined) session.select(elementId);
      return session;
    } catch (error) {
      session.abortOpen();
      throw error;
    }
  }

  /** 校验并补齐 Transform 配置默认值。 */
  #normalizeOptions(input: InternalTransformOptions | undefined): NormalizedTransformOptions {
    const record = inspectRecord(input ?? {}, 'Transform options');
    const allowed = new Set([
      'selector',
      'layerIds',
      'hitTolerance',
      'translate',
      'scale',
      'stretch',
      'rotate',
      'translateBBox',
      'noFlip',
      'keepRectangle',
      'buffer',
      'pointRadius',
      'handleStyle',
      'handleCenter',
      'historyLimit',
      'toolbar',
      'policy'
    ]);
    assertFields(record, allowed, 'Transform options');
    const selector = hasOwn(record, 'selector') && record.selector !== undefined ? cloneSelector(record.selector) : undefined;
    if (selector !== undefined) void compileSelector(selector);
    const layerIds = hasOwn(record, 'layerIds') && record.layerIds !== undefined ? stringArray(record.layerIds, 'Transform layerIds') : undefined;
    const hitTolerance = optionalNonNegative(record, 'hitTolerance', 8, 'Transform hitTolerance');
    const translate = hasOwn(record, 'translate') && record.translate !== undefined ? translateMode(record.translate) : 'feature';
    const scale = optionalBoolean(record, 'scale', true, 'Transform scale');
    const stretch = optionalBoolean(record, 'stretch', true, 'Transform stretch');
    const rotate = optionalBoolean(record, 'rotate', true, 'Transform rotate');
    const translateBBox = optionalBoolean(record, 'translateBBox', false, 'Transform translateBBox');
    const noFlip = optionalBoolean(record, 'noFlip', true, 'Transform noFlip');
    const keepRectangle = optionalBoolean(record, 'keepRectangle', true, 'Transform keepRectangle');
    const buffer = optionalNonNegative(record, 'buffer', 16, 'Transform buffer');
    const pointRadius = optionalPositive(record, 'pointRadius', 8, 'Transform pointRadius');
    const historyLimit = optionalPositiveInteger(record, 'historyLimit', 10, 'Transform historyLimit');
    const policy = hasOwn(record, 'policy') && record.policy !== undefined ? interactionPolicy(record.policy) : 'replace';
    const handleCenter =
      hasOwn(record, 'handleCenter') && record.handleCenter !== undefined ? coordinate(record.handleCenter, 'Transform handleCenter') : undefined;
    let handleStyle: StyleSpec | undefined;
    if (hasOwn(record, 'handleStyle') && record.handleStyle !== undefined) {
      const cloned = this.#styles.clone(record.handleStyle as StyleSpec);
      this.#styles.assertStructured(cloned);
      handleStyle = cloned;
    }
    let toolbar: false | InternalTransformToolbarOptions = false;
    if (hasOwn(record, 'toolbar') && record.toolbar !== undefined && record.toolbar !== false) toolbar = normalizeToolbar(record.toolbar);
    else if (record.toolbar === undefined) toolbar = false;
    else if (record.toolbar !== false) throw new InvalidArgumentError('Transform toolbar must be false or an options object');
    return Object.freeze({
      hitTolerance,
      translate,
      scale,
      stretch,
      rotate,
      translateBBox,
      noFlip,
      keepRectangle,
      buffer,
      pointRadius,
      historyLimit,
      toolbar,
      policy,
      ...(selector === undefined ? {} : { selector }),
      ...(layerIds === undefined ? {} : { layerIds }),
      ...(handleStyle === undefined ? {} : { handleStyle }),
      ...(handleCenter === undefined ? {} : { handleCenter })
    });
  }

  /** 生成未被占用的复制元素 ID。 */
  #createId(): string {
    if (this.#providedCreateId !== undefined) return nonEmptyString(this.#providedCreateId(), 'Generated Transform element id');
    let id: string;
    do id = `transform-copy-${++this.#nextId}`;
    while (this.#store.get(id) !== undefined);
    return id;
  }

  /** 确保 Transform 服务仍可使用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('TransformService has been destroyed');
  }
}

/** 安全读取普通配置对象的数据属性。 */
function inspectRecord(input: unknown, label: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') throw new InvalidArgumentError(`${label} cannot contain symbol properties`);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} cannot contain accessor properties`);
    record[key] = descriptor.value;
  }
  return record;
}

/** 断言配置只包含允许字段。 */
function assertFields(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label.toLowerCase()} field: ${key}`);
}

/** 判断对象是否拥有指定自有属性。 */
function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** 校验非空字符串。 */
function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

/** 读取带默认值的可选布尔字段。 */
function optionalBoolean(record: Record<string, unknown>, key: string, fallback: boolean, label: string): boolean {
  if (!hasOwn(record, key) || record[key] === undefined) return fallback;
  const value = record[key];
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}

/** 读取带默认值的非负数字字段。 */
function optionalNonNegative(record: Record<string, unknown>, key: string, fallback: number, label: string): number {
  if (!hasOwn(record, key) || record[key] === undefined) return fallback;
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new InvalidArgumentError(`${label} must be a finite non-negative number`);
  return value;
}

/** 读取带默认值的正数字段。 */
function optionalPositive(record: Record<string, unknown>, key: string, fallback: number, label: string): number {
  const value = optionalNonNegative(record, key, fallback, label);
  if (value <= 0) throw new InvalidArgumentError(`${label} must be greater than zero`);
  return value;
}

/** 读取带默认值的正整数字段。 */
function optionalPositiveInteger(record: Record<string, unknown>, key: string, fallback: number, label: string): number {
  if (!hasOwn(record, key) || record[key] === undefined) return fallback;
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new InvalidArgumentError(`${label} must be a positive safe integer`);
  return value as number;
}

/** 校验 Transform 平移模式。 */
function translateMode(value: unknown): NormalizedTransformOptions['translate'] {
  if (value !== 'none' && value !== 'center' && value !== 'feature') throw new InvalidArgumentError('Transform translate must be none, center, or feature');
  return value;
}

/** 校验交互冲突策略。 */
function interactionPolicy(value: unknown): NormalizedTransformOptions['policy'] {
  if (value !== 'replace' && value !== 'reject') throw new InvalidArgumentError('Transform policy must be replace or reject');
  return value;
}

/** 校验二维或三维地图坐标。 */
function coordinate(value: unknown, label: string): readonly [number, number] | readonly [number, number, number] {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3) || value.some((part) => typeof part !== 'number' || !Number.isFinite(part))) {
    throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  }
  return Object.freeze([...value]) as readonly [number, number] | readonly [number, number, number];
}

/** 校验、去重并冻结字符串数组。 */
function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be an array`);
  return Object.freeze([...new Set(value.map((item) => nonEmptyString(item, `${label} item`)))]);
}

/** 克隆并冻结元素选择器。 */
function cloneSelector(value: unknown): ElementSelector {
  const record = inspectRecord(value, 'Transform selector');
  assertFields(record, new Set(['id', 'ids', 'module', 'layerId', 'type', 'visible', 'predicate']), 'Transform selector');
  return Object.freeze({
    ...record,
    ...(Array.isArray(record.ids) ? { ids: Object.freeze([...record.ids]) } : {})
  }) as ElementSelector;
}

/** 校验并规范化工具栏配置。 */
function normalizeToolbar(value: unknown): InternalTransformToolbarOptions {
  const record = inspectRecord(value, 'Transform toolbar');
  assertFields(record, new Set(['items', 'offset', 'className', 'visible']), 'Transform toolbar');
  const items = hasOwn(record, 'items') && record.items !== undefined ? toolbarItems(record.items) : undefined;
  const offset = hasOwn(record, 'offset') && record.offset !== undefined ? pair(record.offset, 'Transform toolbar offset') : undefined;
  const className = hasOwn(record, 'className') && record.className !== undefined ? nonEmptyString(record.className, 'Transform toolbar className') : undefined;
  const visible = hasOwn(record, 'visible') && record.visible !== undefined ? boolean(record.visible, 'Transform toolbar visible') : undefined;
  return Object.freeze({
    ...(items === undefined ? {} : { items }),
    ...(offset === undefined ? {} : { offset }),
    ...(className === undefined ? {} : { className }),
    ...(visible === undefined ? {} : { visible })
  });
}

/** 校验并冻结工具栏项目。 */
function toolbarItems(value: unknown): readonly InternalTransformToolbarItemSpec[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError('Transform toolbar items must be an array');
  const keys = new Set<string>();
  return Object.freeze(
    value.map((candidate) => {
      const record = inspectRecord(candidate, 'Transform toolbar item');
      assertFields(record, new Set(['key', 'title', 'icon', 'iconClass', 'visible', 'disabled', 'active']), 'Transform toolbar item');
      const key = nonEmptyString(record.key, 'Transform toolbar item key');
      if (keys.has(key)) throw new InvalidArgumentError(`Duplicate Transform toolbar item key: ${key}`);
      keys.add(key);
      return Object.freeze({
        key,
        title: nonEmptyString(record.title, 'Transform toolbar item title'),
        ...(record.icon === undefined ? {} : { icon: nonEmptyString(record.icon, 'Transform toolbar item icon') }),
        ...(record.iconClass === undefined ? {} : { iconClass: nonEmptyString(record.iconClass, 'Transform toolbar item iconClass') }),
        ...(record.visible === undefined ? {} : { visible: boolean(record.visible, 'Transform toolbar item visible') }),
        ...(record.disabled === undefined ? {} : { disabled: boolean(record.disabled, 'Transform toolbar item disabled') }),
        ...(record.active === undefined ? {} : { active: boolean(record.active, 'Transform toolbar item active') })
      });
    })
  );
}

/** 校验二维数字元组。 */
function pair(value: unknown, label: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || value.some((part) => typeof part !== 'number' || !Number.isFinite(part))) {
    throw new InvalidArgumentError(`${label} must contain two finite numbers`);
  }
  return Object.freeze([value[0], value[1]]);
}

/** 读取布尔值。 */
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}
