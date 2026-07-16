import type OlMap from 'ol/Map.js';
import Overlay from 'ol/Overlay.js';
import { runFinalizers } from '../../core/common/dispose.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type {
  TransformToolbarItemState,
  TransformToolbarPort,
  TransformToolbarViewEvent,
  TransformToolbarViewHandle,
  TransformToolbarViewOptions,
  TransformToolbarViewSpec
} from '../../core/ports/TransformToolbarPort.js';
import { transformToolbarIcons } from './transformToolbarIcons.js';

/** Transform 工具栏 DOM 适配器的可选配置。 */
export interface TransformToolbarAdapterOptions {
  /** 创建工具栏根节点的自定义工厂。 */
  readonly createElement?: () => HTMLDivElement;
}

/** 借助 DOM 和 OpenLayers Overlay 展示 Transform 工具栏。 */
export class TransformToolbarAdapter implements TransformToolbarPort {
  readonly #map: OlMap;
  readonly #createElement: (() => HTMLDivElement) | undefined;

  constructor(map: OlMap, options: TransformToolbarAdapterOptions = {}) {
    this.#map = map;
    this.#createElement = options.createElement ?? defaultElementFactory();
  }

  /** 为一组工具栏状态创建视图，并把命令及悬停事件交给 `listener`。 */
  open(spec: TransformToolbarViewSpec, listener: (event: TransformToolbarViewEvent) => void): TransformToolbarViewHandle {
    if (typeof listener !== 'function') throw new InvalidArgumentError('Transform toolbar listener must be a function');
    return new ToolbarView(this.#map, this.#createElement, spec, listener);
  }
}

/** 持有单个 Transform 工具栏的 DOM、Overlay 和事件资源。 */
class ToolbarView implements TransformToolbarViewHandle {
  readonly #map: OlMap;
  readonly #listener: (event: TransformToolbarViewEvent) => void;
  readonly #items = new Map<string, TransformToolbarItemState>();
  readonly #root: HTMLDivElement | undefined;
  readonly #overlay: Overlay | undefined;
  #options: TransformToolbarViewOptions;
  #destroyed = false;
  #destroying = false;

  constructor(
    map: OlMap,
    createElement: (() => HTMLDivElement) | undefined,
    spec: TransformToolbarViewSpec,
    listener: (event: TransformToolbarViewEvent) => void
  ) {
    this.#map = map;
    this.#listener = listener;
    this.#options = copyOptions(spec.options);
    for (const item of spec.items) {
      if (this.#items.has(item.key)) throw new InvalidArgumentError(`Duplicate Transform toolbar key: ${item.key}`);
      this.#items.set(item.key, copyItem(item));
    }
    if (createElement === undefined) return;
    const root = createElement();
    root.className = this.#className();
    root.dataset.ownerId = spec.ownerId;
    root.addEventListener('click', this.#onClick);
    root.addEventListener('mouseover', this.#onMouseOver);
    root.addEventListener('mouseout', this.#onMouseOut);
    this.#root = root;
    this.#render();
    const overlay = new Overlay({ element: root, positioning: 'top-left', stopEvent: true, insertFirst: false, offset: [...this.#options.offset] });
    overlay.setPosition([...this.#options.position]);
    this.#overlay = overlay;
    map.addOverlay(overlay);
    this.#applyVisibility();
  }

  setActive(key: string): void {
    if (this.#destroyed) return;
    for (const [itemKey, item] of this.#items) this.#items.set(itemKey, Object.freeze({ ...item, active: itemKey === key }));
    this.#render();
  }

  updateItem(key: string, patch: Partial<Omit<TransformToolbarItemState, 'key'>>): void {
    if (this.#destroyed) return;
    const item = this.#items.get(key);
    if (item === undefined) return;
    this.#items.set(key, copyItem({ ...item, ...patch, key }));
    this.#render();
  }

  updateOptions(patch: Partial<TransformToolbarViewOptions>): void {
    if (this.#destroyed) return;
    const previous = this.#options;
    const next = copyOptions({ ...previous, ...patch });
    this.#options = next;
    if (!numbersEqual(previous.position, next.position)) this.#overlay?.setPosition([...next.position]);
    if (!numbersEqual(previous.offset, next.offset)) this.#overlay?.setOffset([...next.offset]);
    if (previous.className !== next.className && this.#root !== undefined) this.#root.className = this.#className();
    if (previous.visible !== next.visible) this.#applyVisibility();
  }

  show(): void {
    this.updateOptions({ visible: true });
  }

  hide(): void {
    this.updateOptions({ visible: false });
  }

  /** 释放 DOM、Overlay 和事件监听；失败时保留进度，允许再次调用。 */
  destroy(): void {
    if (this.#destroyed || this.#destroying) return;
    this.#destroying = true;
    try {
      runFinalizers([
        () => this.#root?.removeEventListener('click', this.#onClick),
        () => this.#root?.removeEventListener('mouseover', this.#onMouseOver),
        () => this.#root?.removeEventListener('mouseout', this.#onMouseOut),
        () => {
          if (this.#overlay !== undefined) this.#map.removeOverlay(this.#overlay);
        },
        () => this.#overlay?.setElement(undefined),
        () => this.#overlay?.dispose(),
        () => this.#root?.remove(),
        () => this.#items.clear()
      ]);
      this.#destroyed = true;
    } finally {
      this.#destroying = false;
    }
  }

  readonly #onClick = (event: MouseEvent): void => {
    if (this.#destroyed || this.#destroying || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('[data-transform-command]');
    const key = target?.dataset.transformCommand;
    const item = key === undefined ? undefined : this.#items.get(key);
    if (key === undefined || item === undefined || item.disabled || !item.visible) return;
    this.#listener(Object.freeze({ type: 'command', key }));
  };

  readonly #onMouseOver = (event: MouseEvent): void => {
    const target = this.#itemFromEvent(event);
    if (target === undefined) return;
    const related = event.relatedTarget;
    if (related instanceof Node && target.element.contains(related)) return;
    this.#listener(Object.freeze({ type: 'enter', key: target.key }));
  };

  readonly #onMouseOut = (event: MouseEvent): void => {
    const target = this.#itemFromEvent(event);
    if (target === undefined) return;
    const related = event.relatedTarget;
    if (related instanceof Node && target.element.contains(related)) return;
    this.#listener(Object.freeze({ type: 'leave', key: target.key }));
  };

  #render(): void {
    const root = this.#root;
    if (root === undefined) return;
    root.replaceChildren();
    for (const item of this.#items.values()) {
      if (!item.visible) continue;
      const button = root.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = ['ol-toolbar-item', item.iconClass, item.active ? 'is-active' : '', item.disabled ? 'is-disabled' : ''].filter(Boolean).join(' ');
      button.dataset.transformCommand = item.key;
      button.title = item.title;
      button.disabled = item.disabled;
      button.setAttribute('aria-label', item.title);
      button.innerHTML = item.icon ?? transformToolbarIcons[item.key] ?? '';
      root.append(button);
    }
  }

  #className(): string {
    return ['ol-toolbar', this.#options.className].filter(Boolean).join(' ');
  }

  #applyVisibility(): void {
    if (this.#root !== undefined) this.#root.hidden = !this.#options.visible;
  }

  #itemFromEvent(event: MouseEvent): { readonly key: string; readonly element: HTMLElement } | undefined {
    if (this.#destroyed || this.#destroying || !(event.target instanceof Element)) return undefined;
    const element = event.target.closest<HTMLElement>('[data-transform-command]');
    const key = element?.dataset.transformCommand;
    return element === null || element === undefined || key === undefined || !this.#items.has(key) ? undefined : { key, element };
  }
}

/** 校验工具栏项目并返回不可变副本。 */
function copyItem(item: TransformToolbarItemState): TransformToolbarItemState {
  if (typeof item.key !== 'string' || item.key.trim().length === 0) throw new InvalidArgumentError('Transform toolbar item key must be a non-empty string');
  if (typeof item.title !== 'string') throw new InvalidArgumentError('Transform toolbar item title must be a string');
  return Object.freeze({ ...item });
}

/** 校验工具栏视图配置并冻结其中的数组。 */
function copyOptions(options: TransformToolbarViewOptions): TransformToolbarViewOptions {
  if (
    !Array.isArray(options.position) ||
    (options.position.length !== 2 && options.position.length !== 3) ||
    options.position.some((value) => !Number.isFinite(value))
  ) {
    throw new InvalidArgumentError('Transform toolbar position must contain two or three finite numbers');
  }
  if (!Array.isArray(options.offset) || options.offset.length !== 2 || options.offset.some((value) => !Number.isFinite(value))) {
    throw new InvalidArgumentError('Transform toolbar offset must contain two finite numbers');
  }
  return Object.freeze({
    ...options,
    position: Object.freeze([...options.position]) as TransformToolbarViewOptions['position'],
    offset: Object.freeze([...options.offset]) as readonly [number, number]
  });
}

function numbersEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** 仅在浏览器环境中提供默认 DOM 工厂。 */
function defaultElementFactory(): (() => HTMLDivElement) | undefined {
  const document = globalThis.document;
  return document === undefined ? undefined : () => document.createElement('div');
}
