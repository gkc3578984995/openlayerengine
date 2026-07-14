import type { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { NativeRef } from '../core/native/types.js';
import type { DescriptorHandle as InternalDescriptorHandle } from '../services/overlay/DescriptorHandle.js';
import type { OverlayHandle as InternalOverlayHandle } from '../services/overlay/OverlayHandle.js';
import type { OverlayService as InternalOverlayService } from '../services/overlay/OverlayService.js';
import type { InternalDescriptorEvent, InternalDescriptorPatch, InternalOverlayPatch, InternalOverlaySelector } from '../services/overlay/types.js';
import type {
  DescriptorContent,
  DescriptorEvent,
  DescriptorHandle,
  DescriptorListItem,
  DescriptorPatch,
  DescriptorSpec,
  OverlayHandle,
  OverlayPatch,
  OverlaySelector,
  OverlayService,
  OverlaySpec,
  PanIntoViewSpec
} from './overlayTypes.js';

interface DescriptorViewState {
  readonly type: 'list' | 'custom';
  readonly content: DescriptorContent;
  readonly header: string | undefined;
  readonly footer: string | undefined;
  readonly close: boolean;
}

export class OverlayFacade implements OverlayService {
  readonly #service: InternalOverlayService;
  readonly #refs: NativeRefRegistry;
  readonly #handles = new WeakMap<InternalOverlayHandle, OverlayHandle>();
  readonly #descriptorHandles = new WeakMap<object, unknown>();
  readonly #descriptorViews = new WeakMap<object, DescriptorViewState>();

  constructor(service: InternalOverlayService, refs: NativeRefRegistry) {
    this.#service = service;
    this.#refs = refs;
  }

  add<T>(spec: OverlaySpec<T>): OverlayHandle<T> {
    const record = inspectRecord(spec, 'Overlay spec');
    assertFields(
      record,
      new Set(['id', 'element', 'position', 'offset', 'positioning', 'stopEvent', 'insertFirst', 'autoPan', 'className', 'module', 'data', 'ownership']),
      'Overlay spec'
    );
    const element = requireElement(record.element, 'Overlay element');
    const reference = this.#refs.registerProvisional('element', element);
    let internal: InternalOverlayHandle<T> | undefined;
    try {
      internal = this.#service.add<T>({
        ...(hasOwn(record, 'id') ? { id: record.id as string } : {}),
        elementRef: reference,
        ...(hasOwn(record, 'position') ? { position: record.position as OverlaySpec['position'] } : {}),
        ...(hasOwn(record, 'offset') ? { offset: record.offset as OverlaySpec['offset'] } : {}),
        ...(hasOwn(record, 'positioning') ? { positioning: record.positioning as OverlaySpec['positioning'] } : {}),
        ...(hasOwn(record, 'stopEvent') ? { stopEvent: record.stopEvent as boolean } : {}),
        ...(hasOwn(record, 'insertFirst') ? { insertFirst: record.insertFirst as boolean } : {}),
        ...(hasOwn(record, 'autoPan') ? { autoPan: record.autoPan as OverlaySpec['autoPan'] } : {}),
        ...(hasOwn(record, 'className') ? { className: record.className as string } : {}),
        ...(hasOwn(record, 'module') ? { module: record.module as string } : {}),
        ...(hasOwn(record, 'data') ? { data: record.data as T } : {}),
        ownership: hasOwn(record, 'ownership') ? (record.ownership as OverlaySpec['ownership']) : 'external'
      });
      this.#refs.commitProvisional('element', reference);
      return this.#wrap(internal);
    } catch (error) {
      if (internal !== undefined) {
        try {
          internal.destroy();
        } catch {
          // Preserve the handoff failure.
        }
      }
      discard(this.#refs, reference);
      throw error;
    }
  }

  get<T>(id: string): OverlayHandle<T> | undefined {
    const handle = this.#service.get<T>(id);
    return handle === undefined ? undefined : this.#wrap(handle);
  }

  query<T>(selector?: OverlaySelector<T>): readonly OverlayHandle<T>[] {
    const internalSelector = selector === undefined ? undefined : this.#selector(selector);
    return Object.freeze(this.#service.query<T>(internalSelector).map((handle) => this.#wrap(handle)));
  }

  remove(selector: OverlaySelector): number {
    return this.#service.remove(this.#selector(selector));
  }

  clear(): void {
    this.#service.clear();
  }

  createDescriptor<T>(spec: DescriptorSpec<T>): DescriptorHandle<T> {
    const record = inspectRecord(spec, 'Descriptor spec');
    assertFields(
      record,
      new Set([
        'id',
        'type',
        'content',
        'position',
        'offset',
        'header',
        'footer',
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
    const type = descriptorType(record.type);
    const content = descriptorContent(type, record.content, 'Descriptor content');
    const view: DescriptorViewState = Object.freeze({
      type,
      content,
      header: hasOwn(record, 'header') ? optionalString(record.header, 'Descriptor header') : undefined,
      footer: hasOwn(record, 'footer') ? optionalString(record.footer, 'Descriptor footer') : undefined,
      close: hasOwn(record, 'close') ? booleanValue(record.close, 'Descriptor close') : true
    });
    const deferredCustomElement = view.type === 'custom' && typeof view.content !== 'string' ? (view.content as HTMLElement) : undefined;
    const wrapper = renderDescriptor(view, deferredCustomElement === undefined);
    const reference = this.#refs.registerProvisional('element', wrapper);
    let internal: InternalDescriptorHandle<T> | undefined;
    try {
      const onClose = hasOwn(record, 'onClose') ? optionalFunction<T>(record.onClose, 'Descriptor onClose') : undefined;
      const onItemClick = hasOwn(record, 'onItemClick') ? optionalFunction<T>(record.onItemClick, 'Descriptor onItemClick') : undefined;
      internal = this.#service.createDescriptor<T>({
        ...(hasOwn(record, 'id') ? { id: record.id as string } : {}),
        elementRef: reference,
        type,
        items: type === 'list' ? (content as readonly DescriptorListItem[]) : [],
        position: record.position as DescriptorSpec['position'],
        ...(hasOwn(record, 'offset') ? { offset: record.offset as DescriptorSpec['offset'] } : {}),
        close: view.close,
        ...(hasOwn(record, 'closeAction') ? { closeAction: record.closeAction as DescriptorSpec['closeAction'] } : {}),
        ...(onClose === undefined ? {} : { onClose: (event) => onClose(this.#toDescriptorEvent(event)) }),
        ...(onItemClick === undefined ? {} : { onItemClick: (event) => onItemClick(this.#toDescriptorEvent(event)) }),
        ...(hasOwn(record, 'draggable') ? { draggable: record.draggable as boolean } : {}),
        ...(hasOwn(record, 'fixedLine') ? { fixedLine: record.fixedLine as boolean } : {}),
        ...(hasOwn(record, 'fixedLineColor') ? { fixedLineColor: record.fixedLineColor as string } : {}),
        ...(hasOwn(record, 'fixedMode') ? { fixedMode: record.fixedMode as DescriptorSpec['fixedMode'] } : {}),
        ...(hasOwn(record, 'data') ? { data: record.data as T } : {})
      });
      this.#refs.commitProvisional('element', reference);
      if (deferredCustomElement !== undefined) wrapper.appendChild(deferredCustomElement);
      this.#descriptorViews.set(internal, view);
      return this.#wrapDescriptor(internal);
    } catch (error) {
      if (internal !== undefined) {
        try {
          internal.destroy();
        } catch {
          // Preserve the creation/handoff failure.
        }
      }
      discard(this.#refs, reference);
      wrapper.remove();
      throw error;
    }
  }

  #selector<T>(selector: OverlaySelector<T>): InternalOverlaySelector<T> {
    const record = inspectRecord(selector, 'Overlay selector');
    assertFields(record, new Set(['id', 'ids', 'module', 'visible', 'predicate']), 'Overlay selector');
    const predicate = hasOwn(record, 'predicate') ? record.predicate : undefined;
    if (predicate !== undefined && typeof predicate !== 'function') throw new InvalidArgumentError('Overlay selector predicate must be a function');
    return {
      ...(hasOwn(record, 'id') ? { id: record.id as string } : {}),
      ...(hasOwn(record, 'ids') ? { ids: record.ids as readonly string[] } : {}),
      ...(hasOwn(record, 'module') ? { module: record.module as string } : {}),
      ...(hasOwn(record, 'visible') ? { visible: record.visible as boolean } : {}),
      ...(predicate !== undefined
        ? {
            predicate: (data: Readonly<T> | undefined, handle: InternalOverlayHandle<T>) =>
              (predicate as NonNullable<OverlaySelector<T>['predicate']>)(data, this.#wrap(handle))
          }
        : {})
    };
  }

  #wrap<T>(internal: InternalOverlayHandle<T>): OverlayHandle<T> {
    const cached = this.#handles.get(internal);
    if (cached !== undefined) return cached as OverlayHandle<T>;
    const handle: OverlayHandle<T> = Object.freeze({
      get id() {
        return internal.id;
      },
      get position() {
        return internal.position;
      },
      get visible() {
        return internal.visible;
      },
      update: (patch: OverlayPatch<T>) => this.#update(internal, patch),
      setPosition: (position: OverlayHandle<T>['position']) => internal.setPosition(position),
      show: () => internal.show(),
      hide: () => internal.hide(),
      panIntoView: (options?: PanIntoViewSpec) => internal.panIntoView(options),
      destroy: () => internal.destroy()
    });
    this.#handles.set(internal, handle);
    return handle;
  }

  #wrapDescriptor<T>(internal: InternalDescriptorHandle<T>): DescriptorHandle<T> {
    const cached = this.#descriptorHandles.get(internal) as DescriptorHandle<T> | undefined;
    if (cached !== undefined) return cached as DescriptorHandle<T>;
    const handle: DescriptorHandle<T> = Object.freeze({
      get id() {
        return internal.id;
      },
      get visible() {
        return internal.visible;
      },
      update: (patch: DescriptorPatch<T>) => this.#updateDescriptor(internal, patch),
      setPosition: (position: Parameters<DescriptorHandle<T>['setPosition']>[0]) => internal.setPosition(position),
      show: () => internal.show(),
      hide: () => internal.hide(),
      close: () => internal.close(),
      on: (type: 'click' | 'close', listener: (event: DescriptorEvent<T>) => void) => internal.on(type, (event) => listener(this.#toDescriptorEvent(event))),
      destroy: () => internal.destroy()
    });
    this.#descriptorHandles.set(internal, handle);
    return handle;
  }

  #updateDescriptor<T>(internal: InternalDescriptorHandle<T>, patch: DescriptorPatch<T>): void {
    const record = inspectRecord(patch, 'Descriptor patch');
    assertFields(
      record,
      new Set([
        'content',
        'position',
        'offset',
        'header',
        'footer',
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
    const beforeView = this.#descriptorViews.get(internal);
    if (beforeView === undefined) throw new InvalidArgumentError('Descriptor view state is unavailable');
    const nextType = hasOwn(record, 'content') ? inferDescriptorType(record.content) : beforeView.type;
    const nextContent = hasOwn(record, 'content') ? descriptorContent(nextType, record.content, 'Descriptor content') : beforeView.content;
    const afterView: DescriptorViewState = Object.freeze({
      type: nextType,
      content: nextContent,
      header: hasOwn(record, 'header') ? optionalString(record.header, 'Descriptor header') : beforeView.header,
      footer: hasOwn(record, 'footer') ? optionalString(record.footer, 'Descriptor footer') : beforeView.footer,
      close: hasOwn(record, 'close') ? booleanValue(record.close, 'Descriptor close') : beforeView.close
    });
    const domChanged = hasOwn(record, 'content') || hasOwn(record, 'header') || hasOwn(record, 'footer') || hasOwn(record, 'close');
    const mapped: InternalDescriptorPatch<T> = {
      ...(hasOwn(record, 'content')
        ? { type: afterView.type, items: afterView.type === 'list' ? (afterView.content as readonly DescriptorListItem[]) : [] }
        : {}),
      ...(hasOwn(record, 'position') ? { position: record.position as DescriptorPatch['position'] } : {}),
      ...(hasOwn(record, 'offset') ? { offset: record.offset as DescriptorPatch['offset'] } : {}),
      ...(hasOwn(record, 'close') ? { close: afterView.close } : {}),
      ...(hasOwn(record, 'closeAction') ? { closeAction: record.closeAction as DescriptorPatch['closeAction'] } : {}),
      ...(hasOwn(record, 'onClose')
        ? {
            onClose:
              optionalFunction<T>(record.onClose, 'Descriptor onClose') === undefined
                ? undefined
                : (event: InternalDescriptorEvent<T>) => (record.onClose as (publicEvent: DescriptorEvent<T>) => void)(this.#toDescriptorEvent(event))
          }
        : {}),
      ...(hasOwn(record, 'onItemClick')
        ? {
            onItemClick:
              optionalFunction<T>(record.onItemClick, 'Descriptor onItemClick') === undefined
                ? undefined
                : (event: InternalDescriptorEvent<T>) => (record.onItemClick as (publicEvent: DescriptorEvent<T>) => void)(this.#toDescriptorEvent(event))
          }
        : {}),
      ...(hasOwn(record, 'draggable') ? { draggable: record.draggable as boolean } : {}),
      ...(hasOwn(record, 'fixedLine') ? { fixedLine: record.fixedLine as boolean } : {}),
      ...(hasOwn(record, 'fixedLineColor') ? { fixedLineColor: record.fixedLineColor as string } : {}),
      ...(hasOwn(record, 'fixedMode') ? { fixedMode: record.fixedMode as DescriptorPatch['fixedMode'] } : {}),
      ...(hasOwn(record, 'data') ? { data: record.data as T } : {})
    };
    if (!domChanged) {
      internal.update(mapped);
      return;
    }

    const deferredCustomElement = afterView.type === 'custom' && typeof afterView.content !== 'string' ? (afterView.content as HTMLElement) : undefined;
    const wrapper = renderDescriptor(afterView, deferredCustomElement === undefined);
    const reference = this.#refs.registerProvisional('element', wrapper);
    let receipt: ReturnType<InternalDescriptorHandle<T>['stageUpdate']> | undefined;
    try {
      receipt = internal.stageUpdate({ ...mapped, elementRef: reference });
      this.#refs.commitProvisional('element', reference);
    } catch (error) {
      if (receipt !== undefined) {
        let rolledBack = false;
        try {
          receipt.rollback();
          rolledBack = true;
        } catch {
          // Keep the new reference alive if native rollback failed.
        }
        if (rolledBack) {
          discard(this.#refs, reference);
          wrapper.remove();
        }
      } else {
        discard(this.#refs, reference);
        wrapper.remove();
      }
      throw error;
    }
    if (deferredCustomElement !== undefined) {
      try {
        wrapper.appendChild(deferredCustomElement);
      } catch (error) {
        let rolledBack = false;
        try {
          receipt.rollback();
          rolledBack = true;
        } catch {
          // Keep the committed reference when native rollback is incomplete.
        }
        if (rolledBack) {
          try {
            this.#refs.revoke('element', reference);
          } catch {
            // Preserve the DOM attachment failure.
          }
          wrapper.remove();
        }
        throw error;
      }
    }
    this.#descriptorViews.set(internal, afterView);
    receipt.commit();
  }

  #toDescriptorEvent<T>(event: InternalDescriptorEvent<T>): DescriptorEvent<T> {
    return Object.freeze({
      type: event.type,
      descriptor: this.#wrapDescriptor(event.descriptor),
      data: event.data,
      ...(event.item === undefined ? {} : { item: event.item, index: event.index })
    });
  }

  #update<T>(internal: InternalOverlayHandle<T>, patch: OverlayPatch<T>): void {
    const record = inspectRecord(patch, 'Overlay patch');
    const publicFields = new Set(['element', 'position', 'offset', 'positioning', 'visible', 'data', 'ownership']);
    for (const key of Reflect.ownKeys(record)) {
      if (typeof key !== 'string' || !publicFields.has(key)) throw new InvalidArgumentError(`Unknown Overlay patch field: ${String(key)}`);
    }
    const mapped: InternalOverlayPatch<T> = {
      ...(hasOwn(record, 'position') ? { position: record.position as OverlayPatch['position'] } : {}),
      ...(hasOwn(record, 'offset') ? { offset: record.offset as OverlayPatch['offset'] } : {}),
      ...(hasOwn(record, 'positioning') ? { positioning: record.positioning as OverlayPatch['positioning'] } : {}),
      ...(hasOwn(record, 'visible') ? { visible: record.visible as boolean } : {}),
      ...(hasOwn(record, 'data') ? { data: record.data as T } : {}),
      ...(hasOwn(record, 'ownership') ? { ownership: record.ownership as OverlayPatch['ownership'] } : {})
    };
    if (!hasOwn(record, 'element')) {
      internal.update(mapped);
      return;
    }

    const element = requireElement(record.element, 'Overlay element');
    const reference = this.#refs.registerProvisional('element', element);
    let receipt: ReturnType<InternalOverlayHandle<T>['stageUpdate']> | undefined;
    try {
      receipt = internal.stageUpdate({ ...mapped, elementRef: reference, ...(!hasOwn(record, 'ownership') ? { ownership: 'external' as const } : {}) });
      this.#refs.commitProvisional('element', reference);
    } catch (error) {
      if (receipt !== undefined) {
        let rolledBack = false;
        try {
          receipt.rollback();
          rolledBack = true;
        } catch {
          // The new reference remains valid and provisional if native rollback failed.
        }
        if (rolledBack) discard(this.#refs, reference);
      } else {
        discard(this.#refs, reference);
      }
      throw error;
    }
    // Registry commit already succeeded. The new element is canonical even
    // when cleanup of the detached old element reports an error.
    receipt.commit();
  }
}

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

function requireElement(value: unknown, label: string): HTMLElement {
  if (value === null || typeof value !== 'object' || typeof (value as { remove?: unknown }).remove !== 'function') {
    throw new InvalidArgumentError(`${label} must be an HTMLElement`);
  }
  return value as HTMLElement;
}

function renderDescriptor(view: DescriptorViewState, attachCustomElement = true): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = `earth-engine-component-descriptor ol-engine-descriptor descriptor ${view.type === 'list' ? 'descriptor-list' : 'descriptor-custom'}`;
  if (view.type === 'list') {
    const list = document.createElement('ul');
    list.className = 'descriptor-list';
    if (view.header !== undefined || view.close) {
      const header = document.createElement('li');
      header.className = 'header';
      if (view.header !== undefined) {
        const text = document.createElement('span');
        text.textContent = view.header;
        header.appendChild(text);
      }
      if (view.close) header.appendChild(createCloseButton());
      list.appendChild(header);
    }
    for (const [index, item] of (view.content as readonly DescriptorListItem[]).entries()) {
      const row = document.createElement('li');
      row.className = item.className === undefined ? 'item' : `item ${item.className}`;
      row.dataset.descriptorIndex = String(index);
      const label = document.createElement('label');
      label.textContent = item.label;
      const value = document.createElement('span');
      value.textContent = String(item.value);
      if (item.color !== undefined) value.style.color = item.color;
      row.append(label, value);
      list.appendChild(row);
    }
    if (view.footer !== undefined) {
      const footer = document.createElement('li');
      footer.className = 'footer';
      footer.textContent = view.footer;
      list.appendChild(footer);
    }
    wrapper.appendChild(list);
    return wrapper;
  }

  if (view.header !== undefined) {
    const header = document.createElement('div');
    header.className = 'header';
    header.textContent = view.header;
    wrapper.appendChild(header);
  }
  if (view.close) wrapper.appendChild(createCloseButton());
  if (typeof view.content === 'string') {
    const content = document.createElement('div');
    content.className = 'content';
    content.textContent = view.content;
    wrapper.appendChild(content);
  } else if (attachCustomElement) {
    wrapper.appendChild(view.content as HTMLElement);
  }
  if (view.footer !== undefined) {
    const footer = document.createElement('div');
    footer.className = 'footer';
    footer.textContent = view.footer;
    wrapper.appendChild(footer);
  }
  return wrapper;
}

function createCloseButton(): HTMLButtonElement {
  const close = document.createElement('button');
  close.className = 'close';
  close.type = 'button';
  close.dataset.descriptorAction = 'close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '\u00d7';
  return close;
}

function descriptorType(value: unknown): 'list' | 'custom' {
  if (value !== 'list' && value !== 'custom') throw new InvalidArgumentError('Descriptor type must be list or custom');
  return value;
}

function inferDescriptorType(value: unknown): 'list' | 'custom' {
  return Array.isArray(value) ? 'list' : 'custom';
}

function descriptorContent(type: 'list' | 'custom', value: unknown, label: string): DescriptorContent {
  if (type === 'list') {
    if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a list for a list descriptor`);
    return Object.freeze(value.map((item, index) => descriptorItem(item, index)));
  }
  if (typeof value === 'string') return value;
  return requireElement(value, label);
}

function descriptorItem(value: unknown, index: number): Readonly<DescriptorListItem> {
  const record = inspectRecord(value, `Descriptor item ${index}`);
  assertFields(record, new Set(['label', 'value', 'color', 'className']), `Descriptor item ${index}`);
  if (typeof record.label !== 'string') throw new InvalidArgumentError(`Descriptor item ${index} label must be a string`);
  if (typeof record.value !== 'string' && typeof record.value !== 'number') {
    throw new InvalidArgumentError(`Descriptor item ${index} value must be a string or number`);
  }
  return Object.freeze({
    label: record.label,
    value: record.value,
    ...(hasOwn(record, 'color') ? { color: requiredString(record.color, `Descriptor item ${index} color`) } : {}),
    ...(hasOwn(record, 'className') ? { className: requiredString(record.className, `Descriptor item ${index} className`) } : {})
  });
}

function assertFields(value: Record<PropertyKey, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, label);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new InvalidArgumentError(`${label} must be a string`);
  return value;
}

function optionalFunction<T>(value: unknown, label: string): ((event: DescriptorEvent<T>) => void) | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'function') throw new InvalidArgumentError(`${label} must be a function`);
  return value as (event: DescriptorEvent<T>) => void;
}

function discard(refs: NativeRefRegistry, reference: NativeRef<'element'>): void {
  try {
    refs.discardProvisional('element', reference);
  } catch {
    // A committed or destroyed reference has already left provisional scope.
  }
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
