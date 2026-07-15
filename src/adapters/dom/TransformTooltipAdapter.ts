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

/** Transform 提示框 DOM 适配器的可选配置。 */
export interface TransformTooltipAdapterOptions {
  /** 自定义提示框根元素的创建方式。 */
  readonly createElement?: () => HTMLDivElement;
}

/** 使用 DOM 和 Overlay 展示 Transform 提示框。 */
export class TransformTooltipAdapter implements TransformTooltipPort {
  /** 提示框所属的 OpenLayers 地图。 */
  readonly #map: OlMap;
  /** 提示框根元素的创建函数。 */
  readonly #createElement: (() => HTMLDivElement) | undefined;

  /** 保存地图和元素创建配置。 */
  constructor(map: OlMap, options: TransformTooltipAdapterOptions = {}) {
    this.#map = map;
    this.#createElement = options.createElement ?? defaultElementFactory();
  }

  /** 打开一个新的提示框视图。 */
  open(spec: TransformTooltipViewSpec): TransformTooltipViewHandle {
    return new TooltipView(this.#map, this.#createElement, spec);
  }
}

/** 管理单个 Transform 提示框的 DOM 和 Overlay。 */
class TooltipView implements TransformTooltipViewHandle {
  /** 提示框所属的地图。 */
  readonly #map: OlMap;
  /** 提示框根元素。 */
  readonly #root: HTMLDivElement | undefined;
  /** 用于地图定位的 OpenLayers Overlay。 */
  readonly #overlay: Overlay | undefined;
  /** 当前提示框视图状态。 */
  #state: TransformTooltipViewState;
  /** 提示框是否已经销毁。 */
  #destroyed = false;
  /** 提示框是否正在销毁。 */
  #destroying = false;

  /** 校验初始状态并创建提示框 DOM 和 Overlay。 */
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

  /** 更新提示框内容、位置和可见性。 */
  update(patch: Partial<TransformTooltipViewState>): void {
    if (this.#destroyed) return;
    this.#state = copyState({ ...this.#state, ...patch });
    this.#overlay?.setPosition([...this.#state.position]);
    this.#overlay?.setOffset([...this.#state.offset]);
    this.#render();
    this.#applyVisibility();
  }

  /** 显示提示框。 */
  show(): void {
    this.update({ visible: true });
  }

  /** 隐藏提示框。 */
  hide(): void {
    this.update({ visible: false });
  }

  /** 销毁提示框 DOM 和 Overlay。 */
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

  /** 按当前状态渲染每一行提示文字。 */
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

  /** 应用提示框可见状态。 */
  #applyVisibility(): void {
    if (this.#root !== undefined) this.#root.hidden = !this.#state.visible;
  }
}

/** 校验并复制提示框视图状态。 */
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

/** 读取不能为空的字符串。 */
function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

/** 在浏览器环境中提供默认元素创建函数。 */
function defaultElementFactory(): (() => HTMLDivElement) | undefined {
  const document = globalThis.document;
  return document === undefined ? undefined : () => document.createElement('div');
}
