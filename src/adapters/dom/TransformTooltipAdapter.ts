import type OlMap from 'ol/Map.js';
import Overlay from 'ol/Overlay.js';
import { runFinalizers } from '../../core/common/dispose.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type {
  TransformTooltipPort,
  TransformTooltipViewHandle,
  TransformTooltipViewSpec,
  TransformTooltipViewState
} from '../../core/ports/TransformTooltipPort.js';

export interface TransformTooltipAdapterOptions {
  readonly createElement?: () => HTMLDivElement;
}

export class TransformTooltipAdapter implements TransformTooltipPort {
  readonly #map: OlMap;
  readonly #createElement: (() => HTMLDivElement) | undefined;

  constructor(map: OlMap, options: TransformTooltipAdapterOptions = {}) {
    this.#map = map;
    this.#createElement = options.createElement ?? defaultElementFactory();
  }

  open(spec: TransformTooltipViewSpec): TransformTooltipViewHandle {
    return new TooltipView(this.#map, this.#createElement, spec);
  }
}

class TooltipView implements TransformTooltipViewHandle {
  readonly #map: OlMap;
  readonly #root: HTMLDivElement | undefined;
  readonly #overlay: Overlay | undefined;
  #state: TransformTooltipViewState;
  #destroyed = false;
  #destroying = false;

  constructor(map: OlMap, createElement: (() => HTMLDivElement) | undefined, spec: TransformTooltipViewSpec) {
    this.#map = map;
    this.#state = copyState(spec);
    if (createElement === undefined) return;
    const root = createElement();
    root.className = 'ol-tooltip ol-transform-tooltip';
    root.style.pointerEvents = 'none';
    root.dataset.ownerId = nonEmptyString(spec.ownerId, 'Transform tooltip ownerId');
    this.#root = root;
    this.#render();
    const overlay = new Overlay({
      element: root,
      className: 'ol-overlay-container ol-transform-tooltip-overlay',
      positioning: 'bottom-left',
      stopEvent: false,
      insertFirst: false,
      offset: [...this.#state.offset]
    });
    overlay.setPosition([...this.#state.position]);
    this.#overlay = overlay;
    map.addOverlay(overlay);
    this.#applyVisibility();
  }

  update(patch: Partial<TransformTooltipViewState>): void {
    if (this.#destroyed) return;
    this.#state = copyState({ ...this.#state, ...patch });
    this.#overlay?.setPosition([...this.#state.position]);
    this.#overlay?.setOffset([...this.#state.offset]);
    this.#render();
    this.#applyVisibility();
  }

  show(): void {
    this.update({ visible: true });
  }

  hide(): void {
    this.update({ visible: false });
  }

  destroy(): void {
    if (this.#destroyed || this.#destroying) return;
    this.#destroying = true;
    try {
      runFinalizers([
        () => {
          if (this.#overlay !== undefined) this.#map.removeOverlay(this.#overlay);
        },
        () => this.#overlay?.setElement(undefined),
        () => this.#overlay?.dispose(),
        () => this.#root?.remove()
      ]);
      this.#destroyed = true;
    } finally {
      this.#destroying = false;
    }
  }

  #render(): void {
    const root = this.#root;
    if (root === undefined) return;
    root.replaceChildren();
    for (const line of this.#state.lines) {
      const row = root.ownerDocument.createElement('div');
      row.className = 'ol-transform-tooltip-line';
      row.textContent = line;
      root.append(row);
    }
  }

  #applyVisibility(): void {
    if (this.#root !== undefined) this.#root.hidden = !this.#state.visible;
  }
}

function copyState(state: TransformTooltipViewState): TransformTooltipViewState {
  if (
    !Array.isArray(state.position) ||
    (state.position.length !== 2 && state.position.length !== 3) ||
    state.position.some((value) => !Number.isFinite(value))
  ) {
    throw new InvalidArgumentError('Transform tooltip position must contain two or three finite numbers');
  }
  if (!Array.isArray(state.lines) || state.lines.length === 0 || state.lines.some((line) => typeof line !== 'string' || line.length === 0)) {
    throw new InvalidArgumentError('Transform tooltip lines must contain non-empty strings');
  }
  if (!Array.isArray(state.offset) || state.offset.length !== 2 || state.offset.some((value) => !Number.isFinite(value))) {
    throw new InvalidArgumentError('Transform tooltip offset must contain two finite numbers');
  }
  if (typeof state.visible !== 'boolean') throw new InvalidArgumentError('Transform tooltip visible must be a boolean');
  return Object.freeze({
    position: Object.freeze([...state.position]) as TransformTooltipViewState['position'],
    lines: Object.freeze([...state.lines]),
    offset: Object.freeze([state.offset[0], state.offset[1]]) as readonly [number, number],
    visible: state.visible
  });
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

function defaultElementFactory(): (() => HTMLDivElement) | undefined {
  const document = globalThis.document;
  return document === undefined ? undefined : () => document.createElement('div');
}
