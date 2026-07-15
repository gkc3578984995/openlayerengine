import type { ElementStore } from '../../core/element/ElementStore.js';
import { compileSelector } from '../../core/element/selector.js';
import type { ElementSelector } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { TransformAnimationPort } from '../../core/ports/AnimationControlPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
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

export interface TransformKeyboardInput {
  on(
    type: 'keydown',
    listener: (event: Readonly<{ key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault(): void }>) => void
  ): () => void;
}

export interface TransformServiceDependencies {
  readonly store: ElementStore;
  readonly shapes: ShapeRegistry;
  readonly styles: StyleService;
  readonly coordinator: InteractionCoordinator;
  readonly interaction: TransformInteractionPort;
  readonly animations: TransformAnimationPort;
  readonly transients: TransientAnimationPort;
  readonly toolbar?: TransformToolbarPort;
  readonly tooltip?: TransformTooltipPort;
  readonly input?: TransformKeyboardInput;
  readonly createId?: () => string;
  readonly errorReporter?: ErrorReporter;
}

export class TransformService implements InternalTransformService {
  readonly #store: ElementStore;
  readonly #shapes: ShapeRegistry;
  readonly #styles: StyleService;
  readonly #coordinator: InteractionCoordinator;
  readonly #interaction: TransformInteractionPort;
  readonly #animations: TransformAnimationPort;
  readonly #transients: TransientAnimationPort;
  readonly #toolbar: TransformToolbarPort | undefined;
  readonly #tooltip: TransformTooltipPort | undefined;
  readonly #input: TransformKeyboardInput | undefined;
  readonly #providedCreateId: (() => string) | undefined;
  readonly #errorReporter: ErrorReporter;
  readonly #sessions = new Set<TransformSession>();
  #clipboard: ReturnType<ElementStore['get']>;
  #nextId = 0;
  #nextSessionId = 0;
  #disposed = false;

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
    this.#animations = dependencies.animations;
    this.#transients = dependencies.transients;
    this.#toolbar = dependencies.toolbar;
    this.#tooltip = dependencies.tooltip;
    this.#input = dependencies.input;
    this.#providedCreateId = dependencies.createId;
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
  }

  start(options?: InternalTransformOptions): InternalTransformSession {
    return this.#start(options);
  }

  select<T>(elementId: string, options?: InternalTransformOptions): InternalTransformSession<T> {
    return this.#start<T>(options, nonEmptyString(elementId, 'Transform element id'));
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const session of [...this.#sessions]) session.destroy();
    this.#sessions.clear();
    this.#clipboard = undefined;
  }

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
      animations: this.#animations,
      transients: this.#transients,
      ...(this.#toolbar === undefined ? {} : { toolbarPort: this.#toolbar }),
      ...(this.#tooltip === undefined ? {} : { tooltipPort: this.#tooltip }),
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
    const hitTolerance = optionalNonNegative(record, 'hitTolerance', 2, 'Transform hitTolerance');
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

  #createId(): string {
    if (this.#providedCreateId !== undefined) return nonEmptyString(this.#providedCreateId(), 'Generated Transform element id');
    let id: string;
    do id = `transform-copy-${++this.#nextId}`;
    while (this.#store.get(id) !== undefined);
    return id;
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('TransformService has been destroyed');
  }
}

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

function assertFields(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label.toLowerCase()} field: ${key}`);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string, fallback: boolean, label: string): boolean {
  if (!hasOwn(record, key) || record[key] === undefined) return fallback;
  const value = record[key];
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}

function optionalNonNegative(record: Record<string, unknown>, key: string, fallback: number, label: string): number {
  if (!hasOwn(record, key) || record[key] === undefined) return fallback;
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new InvalidArgumentError(`${label} must be a finite non-negative number`);
  return value;
}

function optionalPositive(record: Record<string, unknown>, key: string, fallback: number, label: string): number {
  const value = optionalNonNegative(record, key, fallback, label);
  if (value <= 0) throw new InvalidArgumentError(`${label} must be greater than zero`);
  return value;
}

function optionalPositiveInteger(record: Record<string, unknown>, key: string, fallback: number, label: string): number {
  if (!hasOwn(record, key) || record[key] === undefined) return fallback;
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new InvalidArgumentError(`${label} must be a positive safe integer`);
  return value as number;
}

function translateMode(value: unknown): NormalizedTransformOptions['translate'] {
  if (value !== 'none' && value !== 'center' && value !== 'feature') throw new InvalidArgumentError('Transform translate must be none, center, or feature');
  return value;
}

function interactionPolicy(value: unknown): NormalizedTransformOptions['policy'] {
  if (value !== 'replace' && value !== 'reject') throw new InvalidArgumentError('Transform policy must be replace or reject');
  return value;
}

function coordinate(value: unknown, label: string): readonly [number, number] | readonly [number, number, number] {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3) || value.some((part) => typeof part !== 'number' || !Number.isFinite(part))) {
    throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  }
  return Object.freeze([...value]) as readonly [number, number] | readonly [number, number, number];
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be an array`);
  return Object.freeze([...new Set(value.map((item) => nonEmptyString(item, `${label} item`)))]);
}

function cloneSelector(value: unknown): ElementSelector {
  const record = inspectRecord(value, 'Transform selector');
  assertFields(record, new Set(['id', 'ids', 'module', 'layerId', 'type', 'visible', 'predicate']), 'Transform selector');
  return Object.freeze({
    ...record,
    ...(Array.isArray(record.ids) ? { ids: Object.freeze([...record.ids]) } : {})
  }) as ElementSelector;
}

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

function pair(value: unknown, label: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || value.some((part) => typeof part !== 'number' || !Number.isFinite(part))) {
    throw new InvalidArgumentError(`${label} must contain two finite numbers`);
  }
  return Object.freeze([value[0], value[1]]);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}
