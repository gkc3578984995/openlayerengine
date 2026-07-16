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

/** Descriptor 当前的渲染状态。 */
interface DescriptorViewState {
  /** Descriptor 内容类型。 */
  readonly type: 'list' | 'custom';
  /** 校验后的列表或自定义内容。 */
  readonly content: DescriptorContent;
  /** 可选的头部文字。 */
  readonly header: string | undefined;
  /** 可选的底部文字。 */
  readonly footer: string | undefined;
  /** 是否显示关闭按钮。 */
  readonly close: boolean;
}

/** 连接公共 Overlay API、内部服务与 DOM 引用。 */
export class OverlayFacade implements OverlayService {
  /** 执行实际 Overlay 操作的内部服务。 */
  readonly #service: InternalOverlayService;
  /** 管理 Overlay 使用的 DOM 元素引用。 */
  readonly #refs: NativeRefRegistry;
  /** 缓存普通 Overlay 的公共句柄。 */
  readonly #handles = new WeakMap<InternalOverlayHandle, OverlayHandle>();
  /** 缓存 Descriptor 的公共句柄。 */
  readonly #descriptorHandles = new WeakMap<object, unknown>();
  /** 保存 Descriptor 的渲染状态。 */
  readonly #descriptorViews = new WeakMap<object, DescriptorViewState>();

  /** 绑定内部 Overlay 服务和当前 Earth 的 DOM 引用注册表。 */
  constructor(service: InternalOverlayService, refs: NativeRefRegistry) {
    this.#service = service;
    this.#refs = refs;
  }

  /** 校验配置、登记 DOM 元素并创建 Overlay。 */
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
          // 清理失败不应掩盖最先发生的资源交接错误。
        }
      }
      discard(this.#refs, reference);
      throw error;
    }
  }

  /** 按 ID 获取普通 Overlay 句柄。 */
  get<T>(id: string): OverlayHandle<T> | undefined {
    const handle = this.#service.get<T>(id);
    return handle === undefined ? undefined : this.#wrap(handle);
  }

  /** 按条件查询普通 Overlay 句柄。 */
  query<T>(selector?: OverlaySelector<T>): readonly OverlayHandle<T>[] {
    const internalSelector = selector === undefined ? undefined : this.#selector(selector);
    return Object.freeze(this.#service.query<T>(internalSelector).map((handle) => this.#wrap(handle)));
  }

  /** 删除匹配的普通 Overlay。 */
  remove(selector: OverlaySelector): number {
    return this.#service.remove(this.#selector(selector));
  }

  /** 清空所有普通 Overlay 和 Descriptor。 */
  clear(): void {
    this.#service.clear();
  }

  /** 创建带内置结构和交互的 Descriptor。 */
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
          // 清理失败不应掩盖最先发生的创建或资源交接错误。
        }
      }
      discard(this.#refs, reference);
      wrapper.remove();
      throw error;
    }
  }

  /** 将公共查询条件转换为内部选择器。 */
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

  /** 获取普通 Overlay 对应的稳定公共句柄。 */
  #wrap<T>(internal: InternalOverlayHandle<T>): OverlayHandle<T> {
    const cached = this.#handles.get(internal);
    if (cached !== undefined) return cached as OverlayHandle<T>;
    const handle: OverlayHandle<T> = Object.freeze({
      /** 当前内部 Overlay ID。 */
      get id() {
        return internal.id;
      },
      /** 当前内部 Overlay 位置。 */
      get position() {
        return internal.position;
      },
      /** 当前内部 Overlay 可见状态。 */
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

  /** 获取 Descriptor 对应的稳定公共句柄。 */
  #wrapDescriptor<T>(internal: InternalDescriptorHandle<T>): DescriptorHandle<T> {
    const cached = this.#descriptorHandles.get(internal) as DescriptorHandle<T> | undefined;
    if (cached !== undefined) return cached as DescriptorHandle<T>;
    const handle: DescriptorHandle<T> = Object.freeze({
      /** 当前内部 Descriptor ID。 */
      get id() {
        return internal.id;
      },
      /** 当前内部 Descriptor 可见状态。 */
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

  /** 校验并更新 Descriptor，DOM 变化时安全交接元素引用。 */
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
          // 原生回滚失败后新引用仍可能在用，保留它以免形成悬空资源。
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
          // 原生回滚不完整时，已提交的引用仍归当前 Overlay 所有。
        }
        if (rolledBack) {
          try {
            this.#refs.revoke('element', reference);
          } catch {
            // 回滚失败不应掩盖最先发生的 DOM 挂载错误。
          }
          wrapper.remove();
        }
        throw error;
      }
    }
    this.#descriptorViews.set(internal, afterView);
    receipt.commit();
  }

  /** 将内部 Descriptor 事件转换为公共事件。 */
  #toDescriptorEvent<T>(event: InternalDescriptorEvent<T>): DescriptorEvent<T> {
    return Object.freeze({
      type: event.type,
      descriptor: this.#wrapDescriptor(event.descriptor),
      data: event.data,
      ...(event.item === undefined ? {} : { item: event.item, index: event.index })
    });
  }

  /** 校验并更新普通 Overlay，必要时交接 DOM 元素引用。 */
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
          // 原生回滚失败后新引用仍可能在用，继续保持临时引用有效。
        }
        if (rolledBack) discard(this.#refs, reference);
      } else {
        discard(this.#refs, reference);
      }
      throw error;
    }
    // 新引用一旦提交便成为当前元素；旧元素清理失败不再回退这次交接。
    receipt.commit();
  }
}

/** 从普通对象中安全读取数据属性。 */
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

/** 确认输入是当前运行环境可用的 DOM 元素。 */
function requireElement(value: unknown, label: string): HTMLElement {
  if (value === null || typeof value !== 'object' || typeof (value as { remove?: unknown }).remove !== 'function') {
    throw new InvalidArgumentError(`${label} must be an HTMLElement`);
  }
  return value as HTMLElement;
}

/** 根据渲染状态创建 Descriptor DOM。 */
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

/** 创建 Descriptor 的内置关闭按钮。 */
function createCloseButton(): HTMLButtonElement {
  const close = document.createElement('button');
  close.className = 'close';
  close.type = 'button';
  close.dataset.descriptorAction = 'close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '\u00d7';
  return close;
}

/** 读取并校验 Descriptor 内容类型。 */
function descriptorType(value: unknown): 'list' | 'custom' {
  if (value !== 'list' && value !== 'custom') throw new InvalidArgumentError('Descriptor type must be list or custom');
  return value;
}

/** 根据内容形状推断 Descriptor 类型。 */
function inferDescriptorType(value: unknown): 'list' | 'custom' {
  return Array.isArray(value) ? 'list' : 'custom';
}

/** 校验并整理 Descriptor 内容。 */
function descriptorContent(type: 'list' | 'custom', value: unknown, label: string): DescriptorContent {
  if (type === 'list') {
    if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a list for a list descriptor`);
    return Object.freeze(value.map((item, index) => descriptorItem(item, index)));
  }
  if (typeof value === 'string') return value;
  return requireElement(value, label);
}

/** 校验并冻结一条 Descriptor 列表项。 */
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

/** 确认对象只包含允许的字段。 */
function assertFields(value: Record<PropertyKey, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

/** 读取布尔值。 */
function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}

/** 读取可省略的字符串。 */
function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, label);
}

/** 读取必需的字符串。 */
function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new InvalidArgumentError(`${label} must be a string`);
  return value;
}

/** 读取可省略的事件回调。 */
function optionalFunction<T>(value: unknown, label: string): ((event: DescriptorEvent<T>) => void) | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'function') throw new InvalidArgumentError(`${label} must be a function`);
  return value as (event: DescriptorEvent<T>) => void;
}

/** 尽力释放尚未提交、且不再归任何 Overlay 所有的 DOM 引用。 */
function discard(refs: NativeRefRegistry, reference: NativeRef<'element'>): void {
  try {
    refs.discardProvisional('element', reference);
  } catch {
    // 引用已经提交，或注册表销毁时已统一终结，无需再次处理。
  }
}

/** 判断对象是否直接拥有指定字段。 */
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
