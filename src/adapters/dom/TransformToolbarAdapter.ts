import type OlMap from 'ol/Map.js';
import Overlay from 'ol/Overlay.js';
import { unByKey } from 'ol/Observable.js';
import type { EventsKey } from 'ol/events.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type {
  TransformToolbarItemState,
  TransformToolbarPort,
  TransformToolbarViewHandle,
  TransformToolbarViewOptions,
  TransformToolbarViewSpec
} from '../../core/ports/TransformToolbarPort.js';
import { transformToolbarIcons } from './transformToolbarIcons.js';

export interface TransformToolbarAdapterOptions {
  readonly createElement?: () => HTMLDivElement;
}

export class TransformToolbarAdapter implements TransformToolbarPort {
  readonly #map: OlMap;
  readonly #createElement: (() => HTMLDivElement) | undefined;

  constructor(map: OlMap, options: TransformToolbarAdapterOptions = {}) {
    this.#map = map;
    this.#createElement = options.createElement ?? defaultElementFactory();
  }

  open(spec: TransformToolbarViewSpec, command: (key: string) => void): TransformToolbarViewHandle {
    if (typeof command !== 'function') throw new InvalidArgumentError('Transform toolbar command listener must be a function');
    return new ToolbarView(this.#map, this.#createElement, spec, command);
  }
}

class ToolbarView implements TransformToolbarViewHandle {
  readonly #map: OlMap;
  readonly #command: (key: string) => void;
  readonly #items = new Map<string, TransformToolbarItemState>();
  readonly #root: HTMLDivElement | undefined;
  readonly #overlay: Overlay | undefined;
  readonly #keys: EventsKey[] = [];
  #options: TransformToolbarViewOptions;
  #destroyed = false;

  constructor(map: OlMap, createElement: (() => HTMLDivElement) | undefined, spec: TransformToolbarViewSpec, command: (key: string) => void) {
    this.#map = map;
    this.#command = command;
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
    this.#root = root;
    this.#render();
    const overlay = new Overlay({ element: root, positioning: 'bottom-left', stopEvent: true, insertFirst: false, offset: [...this.#options.offset] });
    overlay.setPosition([...this.#options.position]);
    this.#overlay = overlay;
    map.addOverlay(overlay);
    const view = map.getView();
    this.#keys.push(map.on('moveend', this.#sync), view.on('change:resolution', this.#sync), view.on('change:rotation', this.#sync));
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
    this.#options = copyOptions({ ...this.#options, ...patch });
    this.#overlay?.setPosition([...this.#options.position]);
    this.#overlay?.setOffset([...this.#options.offset]);
    if (this.#root !== undefined) this.#root.className = this.#className();
    this.#applyVisibility();
  }

  show(): void {
    this.updateOptions({ visible: true });
  }

  hide(): void {
    this.updateOptions({ visible: false });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#keys.length > 0) unByKey(this.#keys.splice(0));
    this.#root?.removeEventListener('click', this.#onClick);
    if (this.#overlay !== undefined) {
      this.#map.removeOverlay(this.#overlay);
      this.#overlay.setElement(undefined);
      this.#overlay.dispose();
    }
    this.#root?.remove();
    this.#items.clear();
  }

  readonly #onClick = (event: MouseEvent): void => {
    if (this.#destroyed || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('[data-transform-command]');
    const key = target?.dataset.transformCommand;
    const item = key === undefined ? undefined : this.#items.get(key);
    if (key === undefined || item === undefined || item.disabled || !item.visible) return;
    this.#command(key);
  };

  readonly #sync = (): void => {
    if (!this.#destroyed) this.#overlay?.setPosition([...this.#options.position]);
  };

  #render(): void {
    const root = this.#root;
    if (root === undefined) return;
    root.replaceChildren();
    for (const item of this.#items.values()) {
      if (!item.visible) continue;
      const button = root.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = ['ol-toolbar-item', item.iconClass, item.active ? 'is-active' : ''].filter(Boolean).join(' ');
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
}

function copyItem(item: TransformToolbarItemState): TransformToolbarItemState {
  if (typeof item.key !== 'string' || item.key.trim().length === 0) throw new InvalidArgumentError('Transform toolbar item key must be a non-empty string');
  if (typeof item.title !== 'string') throw new InvalidArgumentError('Transform toolbar item title must be a string');
  return Object.freeze({ ...item });
}

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

function defaultElementFactory(): (() => HTMLDivElement) | undefined {
  const document = globalThis.document;
  return document === undefined ? undefined : () => document.createElement('div');
}
