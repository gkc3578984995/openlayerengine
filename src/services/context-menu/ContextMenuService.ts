import { cloneCoreState } from '../../core/common/clone.js';
import type { Coordinate, Pixel } from '../../core/common/types.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ContextMenuViewEvent, ContextMenuViewItem, ContextMenuViewPort } from '../../core/ports/ContextMenuViewPort.js';
import type { EventService } from '../events/EventService.js';
import type { RoutedEventMap } from '../events/types.js';
import type {
  ContextMenuRegistrationHandle,
  InternalContextMenuItemContext,
  InternalContextMenuItemSpec,
  InternalContextMenuItemState,
  InternalContextMenuSpec,
  InternalContextMenuStateTarget,
  InternalContextMenuTarget
} from './types.js';

interface RegistrationRecord {
  readonly key: string;
  readonly generation: number;
  readonly target: InternalContextMenuTarget;
  readonly items: readonly InternalContextMenuItemSpec[];
  readonly itemByKey: ReadonlyMap<string, InternalContextMenuItemSpec>;
  readonly before?: (context: InternalContextMenuItemContext) => boolean;
  readonly onSelect?: (context: InternalContextMenuItemContext) => void;
}

interface CurrentMenu {
  readonly registration: RegistrationRecord;
  readonly context: Omit<InternalContextMenuItemContext, 'item'>;
  readonly selectable: ReadonlyMap<string, { readonly item: InternalContextMenuItemSpec; readonly disabled: boolean }>;
}

interface RouteTargetGuard {
  readonly elementId: string;
  invalidated: boolean;
}

type ItemStatePatch = Partial<InternalContextMenuItemState>;

export class ContextMenuService {
  readonly #events: EventService;
  readonly #store: ElementStore;
  readonly #view: ContextMenuViewPort;
  readonly #errorReporter: ErrorReporter;
  readonly #registrations = new Map<string, RegistrationRecord>();
  readonly #states = new Map<string, Map<string, Map<string, InternalContextMenuItemState>>>();
  readonly #routeTargetGuards: RouteTargetGuard[] = [];
  readonly #eventDispose: () => void;
  readonly #storeDispose: () => void;
  readonly #viewDispose: () => void;
  #nextGeneration = 0;
  #current: CurrentMenu | undefined;
  #theme: 'light' | 'dark' = 'light';
  #disposed = false;

  constructor(events: EventService, store: ElementStore, view: ContextMenuViewPort, errorReporter: ErrorReporter = defaultErrorReporter) {
    if (typeof errorReporter !== 'function') throw new InvalidArgumentError('Error reporter must be a function');
    this.#events = events;
    this.#store = store;
    this.#view = view;
    this.#errorReporter = errorReporter;
    this.#eventDispose = events.on('rightclick', (event) => this.#route(event));
    try {
      this.#storeDispose = store.subscribe((changes) => this.#handleElementChanges(changes.changes));
    } catch (error) {
      try {
        this.#eventDispose();
      } catch {
        // Preserve the subscription failure after attempting rollback.
      }
      throw error;
    }
    let viewDispose: (() => void) | undefined;
    try {
      viewDispose = view.listen((event) => this.#handleViewEvent(event));
      if (typeof viewDispose !== 'function') throw new InvalidArgumentError('Context-menu view must return a disposer');
      this.#viewDispose = viewDispose;
      view.setTheme(this.#theme);
    } catch (error) {
      try {
        runFinalizers([...(viewDispose === undefined ? [] : [viewDispose]), this.#eventDispose, this.#storeDispose]);
      } catch {
        // Preserve the constructor failure after attempting every rollback.
      }
      throw error;
    }
  }

  register(target: InternalContextMenuTarget, spec: InternalContextMenuSpec): ContextMenuRegistrationHandle {
    this.#assertActive();
    const safeTarget = normalizeTarget(target);
    if (safeTarget.kind === 'element' && this.#store.get(safeTarget.elementId) === undefined) {
      throw new InvalidArgumentError(`Element does not exist: ${safeTarget.elementId}`);
    }
    const safeSpec = normalizeSpec(spec);
    const key = targetKey(safeTarget);
    const record: RegistrationRecord = {
      key,
      generation: ++this.#nextGeneration,
      target: safeTarget,
      items: safeSpec.items,
      itemByKey: safeSpec.itemByKey,
      ...(safeSpec.before === undefined ? {} : { before: safeSpec.before }),
      ...(safeSpec.onSelect === undefined ? {} : { onSelect: safeSpec.onSelect })
    };
    this.#registrations.set(key, record);
    this.#states.delete(key);
    if (this.#current?.registration.key === key) {
      try {
        this.close();
      } catch (error) {
        this.#report(error, 'close');
      }
    }
    let active = true;
    return Object.freeze({
      destroy: () => {
        if (!active) return;
        active = false;
        if (this.#registrations.get(key) !== record) return;
        this.#registrations.delete(key);
        this.#states.delete(key);
        if (this.#current?.registration === record) this.close();
      }
    });
  }

  getItemState(target: InternalContextMenuStateTarget, key: string): InternalContextMenuItemState | undefined {
    this.#assertActive();
    const resolved = this.#resolveStateTarget(target);
    const item = resolved.registration.itemByKey.get(requireNonEmptyString(key, 'Context-menu item key'));
    if (item === undefined) return undefined;
    return Object.freeze({ ...this.#stateFor(resolved.registration, resolved.stateKey, item) });
  }

  setItemState(target: InternalContextMenuStateTarget, key: string, patch: ItemStatePatch): void {
    this.#assertActive();
    const resolved = this.#resolveStateTarget(target);
    const itemKey = requireNonEmptyString(key, 'Context-menu item key');
    const item = resolved.registration.itemByKey.get(itemKey);
    if (item === undefined) throw new InvalidArgumentError(`Context-menu item does not exist: ${itemKey}`);
    const safePatch = normalizeStatePatch(patch);
    if (item.children !== undefined && safePatch.disabled !== undefined) {
      throw new InvalidArgumentError('Context-menu parent items cannot be disabled');
    }
    const current = this.#stateFor(resolved.registration, resolved.stateKey, item);
    this.#setState(resolved.registration, resolved.stateKey, itemKey, {
      visible: safePatch.visible ?? current.visible,
      disabled: safePatch.disabled ?? current.disabled
    });
    if (safePatch.visible !== undefined && item.mutexKey !== undefined) {
      const mutex = resolved.registration.itemByKey.get(item.mutexKey);
      if (mutex !== undefined) {
        const mutexState = this.#stateFor(resolved.registration, resolved.stateKey, mutex);
        this.#setState(resolved.registration, resolved.stateKey, mutex.key, { visible: !safePatch.visible, disabled: mutexState.disabled });
      }
    }
  }

  toggleItem(target: InternalContextMenuStateTarget, key: string): InternalContextMenuItemState {
    const current = this.getItemState(target, key);
    if (current === undefined) throw new InvalidArgumentError(`Context-menu item does not exist: ${key}`);
    this.setItemState(target, key, { visible: !current.visible });
    const next = this.getItemState(target, key);
    if (next === undefined) throw new InvalidArgumentError(`Context-menu item does not exist: ${key}`);
    return next;
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.#assertActive();
    if (theme !== 'light' && theme !== 'dark') throw new InvalidArgumentError('Context-menu theme must be light or dark');
    this.#view.setTheme(theme);
    this.#theme = theme;
  }

  toggleTheme(): 'light' | 'dark' {
    const next = this.#theme === 'light' ? 'dark' : 'light';
    this.setTheme(next);
    return next;
  }

  clearElementState(elementId: string): void {
    this.#assertActive();
    const id = requireNonEmptyString(elementId, 'Element id');
    const stateKey = elementStateKey(id);
    for (const registrations of this.#states.values()) registrations.delete(stateKey);
    if (this.#current?.context.element?.id === id) this.close();
  }

  close(): void {
    this.#assertActive();
    this.#current = undefined;
    this.#view.close();
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#current = undefined;
    this.#registrations.clear();
    this.#states.clear();
    this.#routeTargetGuards.length = 0;
    runFinalizers([this.#eventDispose, this.#storeDispose, this.#viewDispose, () => this.#view.close(), () => this.#view.destroy()]);
  }

  #route(event: RoutedEventMap['rightclick']): void {
    if (this.#disposed) return;
    const registration = this.#resolveRegistration(event.element);
    if (registration === undefined) {
      this.#current = undefined;
      this.#view.close();
      return;
    }
    const targetGuard: RouteTargetGuard | undefined = event.element === undefined ? undefined : { elementId: event.element.id, invalidated: false };
    if (targetGuard !== undefined) this.#routeTargetGuards.push(targetGuard);
    try {
      const context = contextFor(registration, event);
      const selectable = new Map<string, { readonly item: InternalContextMenuItemSpec; readonly disabled: boolean }>();
      const items = this.#renderItems(registration, context, registration.items, selectable);
      if (this.#registrations.get(registration.key) !== registration || targetGuard?.invalidated === true || items === undefined || items.length === 0) {
        this.#current = undefined;
        this.#view.close();
        return;
      }
      this.#current = { registration, context, selectable };
      try {
        this.#view.show(
          Object.freeze({
            coordinate: freezeCoordinate(event.coordinate),
            pixel: freezePixel(event.pixel),
            items: Object.freeze(items)
          })
        );
      } catch (error) {
        this.#current = undefined;
        this.#report(error, 'show');
        try {
          this.#view.close();
        } catch (closeError) {
          this.#report(closeError, 'close');
        }
      }
    } finally {
      if (targetGuard !== undefined) {
        const index = this.#routeTargetGuards.indexOf(targetGuard);
        if (index >= 0) this.#routeTargetGuards.splice(index, 1);
      }
    }
  }

  #renderItems(
    registration: RegistrationRecord,
    context: Omit<InternalContextMenuItemContext, 'item'>,
    items: readonly InternalContextMenuItemSpec[],
    selectable: Map<string, { readonly item: InternalContextMenuItemSpec; readonly disabled: boolean }>
  ): ContextMenuViewItem[] | undefined {
    const result: ContextMenuViewItem[] = [];
    const stateKey = stateKeyFor(registration, context.element?.id);
    for (const item of items) {
      const state = this.#stateFor(registration, stateKey, item);
      if (!state.visible) continue;
      if (item.children !== undefined) {
        const children = this.#renderItems(registration, context, item.children, selectable);
        if (children === undefined) return undefined;
        if (children.length > 0) result.push(Object.freeze({ key: item.key, label: item.label, disabled: false, children: Object.freeze(children) }));
        continue;
      }
      let disabled = state.disabled;
      if (!disabled && registration.before !== undefined) {
        try {
          disabled = registration.before(Object.freeze({ ...context, item })) !== true;
        } catch (error) {
          disabled = true;
          this.#report(error, 'before');
        }
        if (this.#registrations.get(registration.key) !== registration) return undefined;
      }
      selectable.set(item.key, { item, disabled });
      result.push(Object.freeze({ key: item.key, label: item.label, disabled }));
    }
    return result;
  }

  #handleViewEvent(event: ContextMenuViewEvent): void {
    if (this.#disposed) return;
    if (event.type === 'close') {
      this.close();
      return;
    }
    const current = this.#current;
    if (current === undefined || this.#registrations.get(current.registration.key) !== current.registration) {
      this.close();
      return;
    }
    const selected = current.selectable.get(event.key);
    if (selected === undefined || selected.disabled) return;
    const stateTarget: InternalContextMenuStateTarget =
      current.registration.target.kind === 'map' || current.context.element === undefined
        ? { kind: 'map' }
        : { kind: 'element', elementId: current.context.element.id };
    if (selected.item.mutexKey !== undefined) this.setItemState(stateTarget, selected.item.key, { visible: false });
    const callbackContext = Object.freeze({ ...current.context, item: selected.item });
    try {
      const result = current.registration.onSelect?.(callbackContext);
      void Promise.resolve(result).catch((error: unknown) => this.#report(error, 'select'));
    } catch (error) {
      this.#report(error, 'select');
    } finally {
      if (!this.#disposed) this.close();
    }
  }

  #resolveRegistration(elementState?: Readonly<ElementState>): RegistrationRecord | undefined {
    if (elementState !== undefined) {
      const exact = this.#registrations.get(targetKey({ kind: 'element', elementId: elementState.id }));
      if (exact !== undefined) return exact;
      if (elementState.module !== undefined) {
        const module = this.#registrations.get(targetKey({ kind: 'module', module: elementState.module }));
        if (module !== undefined) return module;
      }
    }
    return this.#registrations.get(targetKey({ kind: 'map' }));
  }

  #resolveStateTarget(target: InternalContextMenuStateTarget): { readonly registration: RegistrationRecord; readonly stateKey: string } {
    const safeTarget = normalizeStateTarget(target);
    if (safeTarget.kind === 'map') {
      const registration = this.#registrations.get(targetKey({ kind: 'map' }));
      if (registration === undefined) throw new InvalidArgumentError('Map context menu is not registered');
      return { registration, stateKey: 'map' };
    }
    const elementState = this.#store.get(safeTarget.elementId);
    if (elementState === undefined) throw new InvalidArgumentError(`Element does not exist: ${safeTarget.elementId}`);
    const registration = this.#resolveRegistration(elementState);
    if (registration === undefined) throw new InvalidArgumentError(`No context menu resolves for Element: ${safeTarget.elementId}`);
    return { registration, stateKey: stateKeyFor(registration, safeTarget.elementId) };
  }

  #stateFor(registration: RegistrationRecord, stateKey: string, item: InternalContextMenuItemSpec): InternalContextMenuItemState {
    return (
      this.#states.get(registration.key)?.get(stateKey)?.get(item.key) ?? {
        visible: item.visible ?? true,
        disabled: item.disabled ?? false
      }
    );
  }

  #setState(registration: RegistrationRecord, stateKey: string, itemKey: string, state: InternalContextMenuItemState): void {
    let registrationStates = this.#states.get(registration.key);
    if (registrationStates === undefined) {
      registrationStates = new Map();
      this.#states.set(registration.key, registrationStates);
    }
    let targetStates = registrationStates.get(stateKey);
    if (targetStates === undefined) {
      targetStates = new Map();
      registrationStates.set(stateKey, targetStates);
    }
    targetStates.set(itemKey, Object.freeze({ ...state }));
  }

  #handleElementChanges(
    changes: readonly { readonly kind: string; readonly id: string; readonly before?: ElementState; readonly after?: ElementState }[]
  ): void {
    for (const change of changes) {
      const invalidatesTarget = change.kind === 'remove' || (change.kind === 'update' && change.before?.module !== change.after?.module);
      if (!invalidatesTarget) continue;
      for (const targetGuard of this.#routeTargetGuards) {
        if (targetGuard.elementId === change.id) targetGuard.invalidated = true;
      }
      this.clearElementState(change.id);
    }
  }

  #report(error: unknown, operation: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'ContextMenuService',
        operation
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // Reporting failures never interrupt menu routing or cleanup.
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('ContextMenuService has been destroyed');
  }
}

function normalizeTarget(target: InternalContextMenuTarget): InternalContextMenuTarget {
  const record = inspectRecord(target, 'Context-menu target');
  const kind = ownValue(record, 'kind');
  if (kind === 'map') {
    assertKeys(record, new Set(['kind']), 'map context-menu target');
    return Object.freeze({ kind });
  }
  if (kind === 'module') {
    assertKeys(record, new Set(['kind', 'module']), 'module context-menu target');
    return Object.freeze({ kind, module: requireNonEmptyString(ownValue(record, 'module'), 'Context-menu module') });
  }
  if (kind === 'element') {
    assertKeys(record, new Set(['kind', 'elementId']), 'Element context-menu target');
    return Object.freeze({ kind, elementId: requireNonEmptyString(ownValue(record, 'elementId'), 'Element id') });
  }
  throw new InvalidArgumentError('Unknown context-menu target');
}

function normalizeStateTarget(target: InternalContextMenuStateTarget): InternalContextMenuStateTarget {
  const normalized = normalizeTarget(target as InternalContextMenuTarget);
  if (normalized.kind === 'module') throw new InvalidArgumentError('Context-menu item state requires map or Element target');
  return normalized;
}

function normalizeSpec(spec: InternalContextMenuSpec): {
  readonly items: readonly InternalContextMenuItemSpec[];
  readonly itemByKey: ReadonlyMap<string, InternalContextMenuItemSpec>;
  readonly before?: (context: InternalContextMenuItemContext) => boolean;
  readonly onSelect?: (context: InternalContextMenuItemContext) => void;
} {
  const record = inspectRecord(spec, 'Context-menu spec');
  assertKeys(record, new Set(['items', 'before', 'onSelect']), 'context-menu spec');
  const sourceItems = inspectArray(ownValue(record, 'items'), 'Context-menu items');
  if (sourceItems.length === 0) throw new InvalidArgumentError('Context-menu items must be a non-empty array');
  const itemByKey = new Map<string, InternalContextMenuItemSpec>();
  const mutexKeys: string[] = [];
  const items = normalizeItems(sourceItems, itemByKey, mutexKeys, new Set(), new Set());
  for (const mutexKey of mutexKeys) {
    const target = itemByKey.get(mutexKey);
    if (target === undefined || target.children !== undefined) throw new InvalidArgumentError(`Context-menu mutex target must be a leaf item: ${mutexKey}`);
  }
  const before = optionalFunction(record, 'before');
  const onSelect = optionalFunction(record, 'onSelect');
  return Object.freeze({
    items: Object.freeze(items),
    itemByKey,
    ...(before === undefined ? {} : { before: before as (context: InternalContextMenuItemContext) => boolean }),
    ...(onSelect === undefined ? {} : { onSelect: onSelect as (context: InternalContextMenuItemContext) => void })
  });
}

function normalizeItems(
  source: readonly unknown[],
  itemByKey: Map<string, InternalContextMenuItemSpec>,
  mutexKeys: string[],
  itemKeys: Set<string>,
  ancestors: Set<object>
): InternalContextMenuItemSpec[] {
  const result: InternalContextMenuItemSpec[] = [];
  for (const input of source) {
    if (input === null || typeof input !== 'object') throw new InvalidArgumentError('Context-menu item must be a plain object');
    if (ancestors.has(input)) throw new InvalidArgumentError('Context-menu item tree cannot contain cycles');
    ancestors.add(input);
    try {
      const record = inspectRecord(input, 'Context-menu item');
      assertKeys(record, new Set(['key', 'label', 'visible', 'disabled', 'mutexKey', 'children']), 'context-menu item');
      const key = requireNonEmptyString(ownValue(record, 'key'), 'Context-menu item key');
      if (itemKeys.has(key)) throw new InvalidArgumentError(`Duplicate context-menu item key: ${key}`);
      itemKeys.add(key);
      const label = requireNonEmptyString(ownValue(record, 'label'), 'Context-menu item label');
      const visible = optionalBoolean(record, 'visible');
      const disabled = optionalBoolean(record, 'disabled');
      const mutexKey = optionalString(record, 'mutexKey');
      let children: readonly InternalContextMenuItemSpec[] | undefined;
      if (hasOwn(record, 'children')) {
        const value = inspectArray(record.children, 'Context-menu children');
        if (value.length === 0) throw new InvalidArgumentError('Context-menu children must be a non-empty array');
        if (disabled !== undefined || mutexKey !== undefined) throw new InvalidArgumentError('Context-menu parent items cannot be disabled or mutex actions');
        children = Object.freeze(normalizeItems(value, itemByKey, mutexKeys, itemKeys, ancestors));
      }
      const item = Object.freeze({
        key,
        label,
        ...(visible === undefined ? {} : { visible }),
        ...(disabled === undefined ? {} : { disabled }),
        ...(mutexKey === undefined ? {} : { mutexKey }),
        ...(children === undefined ? {} : { children })
      });
      itemByKey.set(key, item);
      if (mutexKey !== undefined) mutexKeys.push(mutexKey);
      result.push(item);
    } finally {
      ancestors.delete(input);
    }
  }
  return result;
}

function normalizeStatePatch(patch: ItemStatePatch): ItemStatePatch {
  const record = inspectRecord(patch, 'Context-menu item state patch');
  assertKeys(record, new Set(['visible', 'disabled']), 'context-menu item state patch');
  if (!hasOwn(record, 'visible') && !hasOwn(record, 'disabled')) throw new InvalidArgumentError('Context-menu item state patch cannot be empty');
  const visible = optionalBoolean(record, 'visible');
  const disabled = optionalBoolean(record, 'disabled');
  return Object.freeze({ ...(visible === undefined ? {} : { visible }), ...(disabled === undefined ? {} : { disabled }) });
}

function contextFor(registration: RegistrationRecord, event: RoutedEventMap['rightclick']): Omit<InternalContextMenuItemContext, 'item'> {
  return Object.freeze({
    scope: registration.target.kind,
    coordinate: freezeCoordinate(event.coordinate),
    pixel: freezePixel(event.pixel),
    ...(event.element === undefined ? {} : { element: cloneCoreState(event.element) }),
    ...(event.element?.module === undefined ? {} : { module: event.element.module }),
    ...(event.element === undefined ? {} : { layerId: event.element.layerId })
  });
}

function targetKey(target: InternalContextMenuTarget): string {
  if (target.kind === 'map') return 'map';
  return `${target.kind}:${target.kind === 'module' ? target.module : target.elementId}`;
}

function stateKeyFor(registration: RegistrationRecord, elementId?: string): string {
  return registration.target.kind === 'map' ? 'map' : elementStateKey(requireNonEmptyString(elementId, 'Element id'));
}

function elementStateKey(elementId: string): string {
  return `element:${elementId}`;
}

function inspectRecord(value: unknown, label: string): Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
    const result = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new InvalidArgumentError(`${label} cannot contain symbol fields`);
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

function inspectArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be an array`);
  try {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      lengthDescriptor === undefined ||
      !('value' in lengthDescriptor) ||
      typeof lengthDescriptor.value !== 'number' ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      throw new InvalidArgumentError(`${label} must have a valid length`);
    }
    const result: unknown[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined) {
        result.push(undefined);
        continue;
      }
      if (!('value' in descriptor)) throw new InvalidArgumentError(`${label} entries must be data properties`);
      result.push(descriptor.value);
    }
    return result;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

function assertKeys(record: Record<PropertyKey, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

function ownValue(record: Record<PropertyKey, unknown>, key: string): unknown {
  if (!hasOwn(record, key)) throw new InvalidArgumentError(`Context-menu record requires ${key}`);
  return record[key];
}

function optionalFunction(record: Record<PropertyKey, unknown>, key: string): Function | undefined {
  if (!hasOwn(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== 'function') throw new InvalidArgumentError(`Context-menu ${key} must be a function`);
  return value;
}

function optionalBoolean(record: Record<PropertyKey, unknown>, key: string): boolean | undefined {
  if (!hasOwn(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`Context-menu ${key} must be a boolean`);
  return value;
}

function optionalString(record: Record<PropertyKey, unknown>, key: string): string | undefined {
  if (!hasOwn(record, key)) return undefined;
  return requireNonEmptyString(record[key], `Context-menu ${key}`);
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function freezeCoordinate(value: Coordinate): Coordinate {
  return Object.freeze([...value]) as Coordinate;
}

function freezePixel(value: Pixel): Pixel {
  return Object.freeze([...value]) as Pixel;
}
