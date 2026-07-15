import { cloneCoreState } from '../../core/common/clone.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import { compileSelector } from '../../core/element/selector.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { DrawInteractionPort } from '../../core/ports/DrawInteractionPort.js';
import type { EditInteractionPort } from '../../core/ports/EditInteractionPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import type { ShapeState, ShapeType } from '../../core/shape/types.js';
import type { ElementStyleState } from '../../core/style/types.js';
import type { ElementChangeSet } from '../../core/transaction/types.js';
import type { InteractionCoordinator } from '../events/InteractionCoordinator.js';
import type { InteractionPolicy } from '../events/types.js';
import type { StyleService } from '../style/StyleService.js';
import { DrawSession } from './DrawSession.js';
import { EditSession } from './EditSession.js';
import type { InternalDrawOptions, InternalDrawService, InternalEditOptions, InternalEditSession, SessionKeyboardInput } from './types.js';

/**
 * 内部绘制服务的装配依赖。
 *
 * @internal
 */
export interface DrawServiceDependencies {
  /** 元素状态仓库。 */
  readonly store: ElementStore;
  /** 图形定义注册表。 */
  readonly shapes: ShapeRegistry;
  /** 内部样式服务。 */
  readonly styles: StyleService;
  /** 互斥交互协调器。 */
  readonly coordinator: InteractionCoordinator;
  /** 底层绘制交互端口。 */
  readonly drawPort: DrawInteractionPort;
  /** 底层编辑交互端口。 */
  readonly editPort: EditInteractionPort;
  /** 可选的键盘输入。 */
  readonly input?: SessionKeyboardInput;
  /** 按图形状态解析默认样式的函数。 */
  readonly defaultStyle: (state: ShapeState) => ElementStyleState;
  /** 可选的元素 ID 生成器。 */
  readonly createId?: () => string;
  /** 可选的错误报告器。 */
  readonly errorReporter?: ErrorReporter;
}

/**
 * 统一管理语义绘制、动态编辑、元素所有权范围和互斥交互的内部服务。
 *
 * @internal
 */
export class DrawService implements InternalDrawService {
  /** 元素状态仓库。 */
  readonly #store: ElementStore;
  /** 图形定义注册表。 */
  readonly #shapes: ShapeRegistry;
  /** 内部样式服务。 */
  readonly #styles: StyleService;
  /** 互斥交互协调器。 */
  readonly #coordinator: InteractionCoordinator;
  /** 底层绘制交互端口。 */
  readonly #drawPort: DrawInteractionPort;
  /** 底层编辑交互端口。 */
  readonly #editPort: EditInteractionPort;
  /** 可选的键盘输入。 */
  readonly #input: SessionKeyboardInput | undefined;
  /** 默认样式解析函数。 */
  readonly #defaultStyle: DrawServiceDependencies['defaultStyle'];
  /** 可选的元素 ID 生成器。 */
  readonly #providedCreateId: (() => string) | undefined;
  /** 会话错误报告器。 */
  readonly #errorReporter: ErrorReporter;
  /** 由绘制服务创建且仍存在的元素 ID。 */
  readonly #ownedIds = new Set<string>();
  /** 当前活动的绘制与编辑会话。 */
  readonly #sessions = new Set<DrawSession | EditSession>();
  /** 元素仓库订阅释放函数。 */
  #unsubscribe: (() => void) | undefined;
  /** 下一个自动生成的元素 ID。 */
  #nextId = 0;
  /** 是否已经请求销毁。 */
  #destroyRequested = false;
  /** 服务是否已完全销毁。 */
  #disposed = false;

  /**
   * 创建绘制服务并订阅元素仓库变化。
   *
   * @param dependencies 元素存储、图形注册表、样式服务、交互端口和生命周期回调。
   * @throws `InvalidArgumentError` 必需回调或可选回调的类型无效时抛出。
   */
  constructor(dependencies: DrawServiceDependencies) {
    if (typeof dependencies.defaultStyle !== 'function') throw new InvalidArgumentError('Draw defaultStyle must be a function');
    if (dependencies.createId !== undefined && typeof dependencies.createId !== 'function') {
      throw new InvalidArgumentError('Draw createId must be a function');
    }
    if (dependencies.errorReporter !== undefined && typeof dependencies.errorReporter !== 'function') {
      throw new InvalidArgumentError('Draw errorReporter must be a function');
    }
    this.#store = dependencies.store;
    this.#shapes = dependencies.shapes;
    this.#styles = dependencies.styles;
    this.#coordinator = dependencies.coordinator;
    this.#drawPort = dependencies.drawPort;
    this.#editPort = dependencies.editPort;
    this.#input = dependencies.input;
    this.#defaultStyle = dependencies.defaultStyle;
    this.#providedCreateId = dependencies.createId;
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
    this.#unsubscribe = this.#store.subscribe((changes) => this.#handleStoreChanges(changes));
  }

  /** 启动一个语义绘制会话。 */
  start<T>(input: InternalDrawOptions<T>): DrawSession<T> {
    this.#assertActive();
    const options = this.#normalizeDrawOptions(input);
    const definition = this.#shapes.get(options.type);
    if (!definition.capabilities.has('draw')) throw new CapabilityError(`Shape does not support drawing: ${options.type}`);

    const session = new DrawSession<T>({
      store: this.#store,
      definition,
      styles: this.#styles,
      coordinator: this.#coordinator,
      port: this.#drawPort,
      options,
      ...(this.#input === undefined ? {} : { input: this.#input }),
      defaultStyle: this.#defaultStyle,
      createId: () => this.#createId(),
      errorReporter: this.#errorReporter,
      onCommitted: (state) => this.#ownedIds.add(state.id),
      onTerminal: () => this.#sessions.delete(session as DrawSession)
    });
    this.#sessions.add(session as DrawSession);
    try {
      this.#coordinator.activate(session, options.policy);
      session.open();
      return session;
    } catch (error) {
      session.abortOpen();
      throw error;
    }
  }

  /** 启动指定元素的动态编辑会话。 */
  edit<T>(elementIdInput: string, input?: InternalEditOptions): InternalEditSession<T> {
    this.#assertActive();
    const elementId = nonEmptyString(elementIdInput, 'Edit element id');
    const options = this.#normalizeEditOptions(input);
    const state = this.#store.get<T>(elementId);
    if (state === undefined) throw new InvalidArgumentError(`Element does not exist: ${elementId}`);
    const expectedGeneration = this.#store.generationOf(elementId);
    if (expectedGeneration === undefined) throw new InvalidArgumentError(`Element does not exist: ${elementId}`);
    const definition = this.#shapes.get(state.type);
    if (!definition.capabilities.has('edit') || definition.editTopology === undefined) {
      throw new CapabilityError(`Shape does not support editing: ${state.type}`);
    }

    const session = new EditSession<T>({
      store: this.#store,
      definition,
      coordinator: this.#coordinator,
      port: this.#editPort,
      elementId,
      expectedGeneration,
      options,
      ...(this.#input === undefined ? {} : { input: this.#input }),
      errorReporter: this.#errorReporter,
      onTerminal: () => this.#sessions.delete(session as EditSession)
    });
    this.#sessions.add(session as EditSession);
    try {
      this.#coordinator.activate(session, options.policy);
      session.open();
      return session;
    } catch (error) {
      session.abortOpen();
      throw error;
    }
  }

  /** 查询由绘制服务创建的元素。 */
  query<T>(selector?: ElementSelector<T>): readonly Readonly<ElementState<T>>[] {
    this.#assertActive();
    const ownedIds = [...this.#ownedIds];
    if (selector === undefined) return this.#store.query<T>({ ids: ownedIds });
    const matches = compileSelector(selector);
    return this.#store.query<T>({
      ids: ownedIds,
      predicate: matches
    });
  }

  /** 清除匹配且由绘制服务创建的元素。 */
  clear(selector?: ElementSelector): number {
    this.#assertActive();
    const ids = this.query(selector).map(({ id }) => id);
    if (ids.length === 0) return 0;
    return this.#store.remove({ ids }).changes.length;
  }

  /** 销毁全部会话并释放仓库订阅。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#destroyRequested = true;
    for (const session of [...this.#sessions]) session.destroy();
    const unsubscribe = this.#unsubscribe;
    if (unsubscribe !== undefined) {
      try {
        unsubscribe();
        if (this.#unsubscribe === unsubscribe) this.#unsubscribe = undefined;
      } catch (error) {
        this.#report(error, 'unsubscribe');
      }
    }
    this.#ownedIds.clear();
    if (this.#sessions.size === 0 && this.#unsubscribe === undefined) this.#disposed = true;
  }

  /** 校验并规范化绘制配置。 */
  #normalizeDrawOptions<T>(input: InternalDrawOptions<T>): DrawSessionDependenciesResult<T> {
    const record = inspectRecord(input, 'Draw options');
    assertFields(record, new Set(['type', 'layerId', 'module', 'style', 'data', 'limit', 'keepGraphics', 'policy']), 'Draw options');
    const type = shapeType(required(record, 'type', 'Draw options'));
    const layerId = nonEmptyString(required(record, 'layerId', 'Draw options'), 'Draw layerId');
    const module = hasOwn(record, 'module') && record.module !== undefined ? nonEmptyString(record.module, 'Draw module') : undefined;
    const limit = hasOwn(record, 'limit') && record.limit !== undefined ? nonNegativeInteger(record.limit, 'Draw limit') : 0;
    const keepGraphics = hasOwn(record, 'keepGraphics') && record.keepGraphics !== undefined ? booleanValue(record.keepGraphics, 'Draw keepGraphics') : true;
    const policy = hasOwn(record, 'policy') && record.policy !== undefined ? interactionPolicy(record.policy) : 'replace';
    const style = hasOwn(record, 'style') && record.style !== undefined ? this.#styles.clone(record.style as ElementStyleState) : undefined;
    const data = hasOwn(record, 'data') && record.data !== undefined ? (cloneCoreState(record.data) as T) : undefined;
    return Object.freeze({
      type,
      layerId,
      limit,
      keepGraphics,
      policy,
      ...(module === undefined ? {} : { module }),
      ...(style === undefined ? {} : { style }),
      ...(data === undefined ? {} : { data })
    });
  }

  /** 校验并规范化编辑配置。 */
  #normalizeEditOptions(input: InternalEditOptions | undefined): NormalizedEditOptions {
    const record = inspectRecord(input ?? {}, 'Edit options');
    assertFields(record, new Set(['underlay', 'policy']), 'Edit options');
    const underlay = hasOwn(record, 'underlay') && record.underlay !== undefined ? booleanValue(record.underlay, 'Edit underlay') : false;
    const policy = hasOwn(record, 'policy') && record.policy !== undefined ? interactionPolicy(record.policy) : 'replace';
    return Object.freeze({ underlay, policy });
  }

  /** 生成未被占用的绘制元素 ID。 */
  #createId(): string {
    if (this.#providedCreateId !== undefined) return nonEmptyString(this.#providedCreateId(), 'Generated draw element id');
    let id: string;
    do id = `draw-${++this.#nextId}`;
    while (this.#store.get(id) !== undefined);
    return id;
  }

  /** 根据仓库删除事件维护元素所有权。 */
  #handleStoreChanges(changes: ElementChangeSet): void {
    if (this.#disposed || this.#destroyRequested) return;
    for (const change of changes.changes) if (change.kind === 'remove') this.#ownedIds.delete(change.id);
  }

  /** 确保绘制服务仍可使用。 */
  #assertActive(): void {
    if (this.#disposed || this.#destroyRequested) throw new ObjectDisposedError('DrawService has been destroyed');
  }

  /** 隔离并上报会话清理错误。 */
  #report(error: unknown, operation: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'DrawService',
        operation
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // 错误报告器自身失败时不能破坏销毁重试。
    }
  }
}

/** 规范化后的绘制会话配置。 */
type DrawSessionDependenciesResult<T> = Readonly<
  Required<Pick<InternalDrawOptions<T>, 'type' | 'layerId' | 'limit' | 'keepGraphics' | 'policy'>> & InternalDrawOptions<T>
>;

/** 补齐默认值后的编辑配置。 */
type NormalizedEditOptions = Readonly<Required<Pick<InternalEditOptions, 'underlay' | 'policy'>>>;

/** 安全读取普通配置对象的数据属性。 */
function inspectRecord(input: unknown, label: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError(`${label} must be a plain object`);
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const record = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') throw new InvalidArgumentError(`${label} cannot contain symbol properties`);
      const descriptor = descriptors[key];
      if (!('value' in descriptor)) throw new InvalidArgumentError(`${label} cannot contain accessor properties`);
      record[key] = descriptor.value;
    }
    return record;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

/** 断言配置只包含允许字段。 */
function assertFields(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label.toLowerCase()} field: ${key}`);
}

/** 读取配置中的必填字段。 */
function required(record: Record<string, unknown>, key: string, label: string): unknown {
  if (!hasOwn(record, key)) throw new InvalidArgumentError(`${label} requires ${key}`);
  return record[key];
}

/** 判断对象是否拥有指定自有属性。 */
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** 将字符串输入收窄为图形类型。 */
function shapeType(value: unknown): ShapeType {
  if (typeof value !== 'string') throw new InvalidArgumentError('Draw type must be a registered ShapeType');
  return value as ShapeType;
}

/** 校验非空字符串。 */
function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

/** 校验非负安全整数。 */
function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new InvalidArgumentError(`${label} must be a non-negative safe integer`);
  return value as number;
}

/** 读取布尔值。 */
function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}

/** 校验交互冲突策略。 */
function interactionPolicy(value: unknown): InteractionPolicy {
  if (value !== 'replace' && value !== 'reject') throw new InvalidArgumentError('Draw policy must be replace or reject');
  return value;
}
