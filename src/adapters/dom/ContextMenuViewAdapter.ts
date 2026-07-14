import type OLMap from 'ol/Map.js';
import { runFinalizers } from '../../core/common/dispose.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { ContextMenuViewEvent, ContextMenuViewItem, ContextMenuViewModel, ContextMenuViewPort } from '../../core/ports/ContextMenuViewPort.js';

interface EventedMap {
  on(type: 'postrender', listener: () => void): unknown;
  un(type: 'postrender', listener: () => void): void;
}

const isolatedMenuEventTypes = [
  'auxclick',
  'dblclick',
  'contextmenu',
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'pointerover',
  'pointerout',
  'pointerenter',
  'pointerleave',
  'mousedown',
  'mousemove',
  'mouseup',
  'mouseover',
  'mouseout',
  'mouseenter',
  'mouseleave',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
  'wheel'
] as const;

export class ContextMenuViewAdapter implements ContextMenuViewPort {
  readonly #map: OLMap;
  #listener: ((event: ContextMenuViewEvent) => void) | undefined;
  #root: HTMLDivElement | undefined;
  #coordinate: readonly number[] | undefined;
  #theme: 'light' | 'dark' = 'light';
  #tracking = false;
  #disposed = false;

  constructor(map: OLMap) {
    this.#map = map;
  }

  listen(listener: (event: ContextMenuViewEvent) => void): () => void {
    this.#assertActive();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Context-menu view listener must be a function');
    if (this.#listener !== undefined) throw new InvalidArgumentError('Context-menu view listener is already installed');
    this.#listener = listener;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.#listener === listener) this.#listener = undefined;
    };
  }

  show(model: ContextMenuViewModel): void {
    this.#assertActive();
    const root = this.#ensureRoot();
    root.replaceChildren(this.#renderItems(model.items));
    this.#coordinate = Object.freeze([...model.coordinate]);
    root.style.display = 'block';
    this.#startTracking();
    this.#syncPosition();
  }

  close(): void {
    if (this.#disposed) return;
    if (this.#root !== undefined) this.#root.style.display = 'none';
    this.#coordinate = undefined;
    this.#stopTracking();
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.#assertActive();
    if (theme !== 'light' && theme !== 'dark') throw new InvalidArgumentError('Context-menu theme must be light or dark');
    this.#theme = theme;
    this.#applyTheme();
  }

  destroy(): void {
    if (this.#disposed && !this.#tracking && this.#root === undefined) return;
    this.#disposed = true;
    this.#coordinate = undefined;
    this.#listener = undefined;
    const root = this.#root;
    if (root !== undefined) root.style.display = 'none';
    let complete = false;
    try {
      runFinalizers([
        () => this.#stopTracking(),
        ...(root === undefined
          ? []
          : [
              () => root.removeEventListener('click', this.#handleClick),
              ...isolatedMenuEventTypes.map((type) => () => root.removeEventListener(type, this.#stopMenuEvent)),
              () => root.remove()
            ])
      ]);
      complete = true;
    } finally {
      if (complete && this.#root === root) this.#root = undefined;
    }
  }

  #ensureRoot(): HTMLDivElement {
    if (this.#root !== undefined) return this.#root;
    if (typeof document === 'undefined') throw new ObjectDisposedError('Context-menu DOM is unavailable');
    const root = document.createElement('div');
    root.className = 'ol-context-menu';
    root.setAttribute('role', 'menu');
    root.style.display = 'none';
    root.addEventListener('click', this.#handleClick);
    for (const type of isolatedMenuEventTypes) root.addEventListener(type, this.#stopMenuEvent);
    this.#map.getViewport().appendChild(root);
    this.#root = root;
    this.#applyTheme();
    return root;
  }

  #renderItems(items: readonly ContextMenuViewItem[]): HTMLUListElement {
    const list = document.createElement('ul');
    list.className = 'ol-context-menu__list';
    for (const item of items) {
      const listItem = document.createElement('li');
      listItem.className = 'ol-context-menu__item';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.disabled = item.disabled;
      if (item.children === undefined) button.dataset.menuKey = item.key;
      else {
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        listItem.classList.add('ol-context-menu__item--has-child');
      }
      listItem.appendChild(button);
      if (item.children !== undefined) {
        const child = this.#renderItems(item.children);
        child.classList.add('ol-context-menu__child');
        listItem.appendChild(child);
      }
      list.appendChild(listItem);
    }
    return list;
  }

  #handleClick = (event: MouseEvent): void => {
    this.#stopMenuEvent(event);
    const target = event.target;
    const button = target instanceof Element ? target.closest<HTMLButtonElement>('button[data-menu-key]') : undefined;
    const key = button?.dataset.menuKey;
    if (button === undefined || button === null || button.disabled || key === undefined) return;
    this.#listener?.(Object.freeze({ type: 'select', key }));
  };

  #stopMenuEvent = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  #handleOutsidePointerDown = (event: Event): void => {
    const target = event.target;
    if (this.#root !== undefined && target instanceof Node && !this.#root.contains(target)) this.#listener?.(Object.freeze({ type: 'close' }));
  };

  #handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.#listener?.(Object.freeze({ type: 'close' }));
  };

  #startTracking(): void {
    if (this.#tracking) return;
    this.#tracking = true;
    (this.#map as unknown as EventedMap).on('postrender', this.#syncPosition);
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', this.#handleOutsidePointerDown, true);
      document.addEventListener('keydown', this.#handleKeyDown);
    }
  }

  #stopTracking(): void {
    if (!this.#tracking) return;
    runFinalizers([
      () => (this.#map as unknown as EventedMap).un('postrender', this.#syncPosition),
      () => {
        if (typeof document !== 'undefined') document.removeEventListener('pointerdown', this.#handleOutsidePointerDown, true);
      },
      () => {
        if (typeof document !== 'undefined') document.removeEventListener('keydown', this.#handleKeyDown);
      }
    ]);
    this.#tracking = false;
  }

  #syncPosition = (): void => {
    if (this.#root === undefined || this.#coordinate === undefined) return;
    let pixel: unknown;
    try {
      pixel = this.#map.getPixelFromCoordinate([...this.#coordinate]);
    } catch {
      return;
    }
    if (!Array.isArray(pixel) || pixel.length !== 2 || pixel.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return;
    this.#root.style.left = `${pixel[0]}px`;
    this.#root.style.top = `${pixel[1]}px`;
  };

  #applyTheme(): void {
    this.#root?.classList.toggle('ol-context-menu--dark', this.#theme === 'dark');
    this.#root?.classList.toggle('ol-context-menu--light', this.#theme === 'light');
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('ContextMenuViewAdapter has been destroyed');
  }
}
