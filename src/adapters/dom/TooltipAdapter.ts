import type OlMap from 'ol/Map.js';
import Overlay from 'ol/Overlay.js';
import { runFinalizers } from '../../core/common/dispose.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type {
  TooltipLine,
  TooltipPort,
  TooltipSegment,
  TooltipSegmentTone,
  TooltipVariant,
  TooltipViewHandle,
  TooltipViewSpec,
  TooltipViewState
} from '../../core/ports/TooltipPort.js';

/** DOM 类名允许使用的 Tooltip 语义色调。 */
const tooltipSegmentTones = new Set<TooltipSegmentTone>(['shortcut', 'undo', 'redo', 'danger', 'exit', 'muted']);

/** 交互提示框 DOM 适配器的可选配置。 */
export interface TooltipAdapterOptions {
  /** 自定义提示框根元素的创建方式。 */
  readonly createElement?: () => HTMLDivElement;
}

/** 使用 DOM 和 OpenLayers Overlay 展示跟随鼠标的交互提示框。 */
export class TooltipAdapter implements TooltipPort {
  /** 提示框所属的 OpenLayers 地图。 */
  readonly #map: OlMap;
  /** 提示框根元素的创建函数。 */
  readonly #createElement: (() => HTMLDivElement) | undefined;

  /** 保存地图和元素创建配置。 */
  constructor(map: OlMap, options: TooltipAdapterOptions = {}) {
    this.#map = map;
    this.#createElement = options.createElement ?? defaultElementFactory();
  }

  /** 打开一个新的提示框视图。 */
  open(spec: TooltipViewSpec): TooltipViewHandle {
    return new TooltipView(this.#map, this.#createElement, spec);
  }
}

/** 管理单个交互提示框的 DOM 和 Overlay。 */
class TooltipView implements TooltipViewHandle {
  /** 提示框所属的地图。 */
  readonly #map: OlMap;
  /** 提示框根元素。 */
  readonly #root: HTMLDivElement | undefined;
  /** 用于地图定位的 OpenLayers Overlay。 */
  readonly #overlay: Overlay | undefined;
  /** 当前提示框使用的视觉变体。 */
  readonly #variant: TooltipVariant;
  /** 当前提示框视图状态。 */
  #state: TooltipViewState;
  /** 提示框是否已经销毁。 */
  #destroyed = false;
  /** 提示框是否正在销毁。 */
  #destroying = false;

  /** 校验初始状态并创建提示框 DOM 和 Overlay。 */
  constructor(map: OlMap, createElement: (() => HTMLDivElement) | undefined, spec: TooltipViewSpec) {
    this.#map = map;
    this.#variant = tooltipVariant(spec.variant);
    this.#state = copyState(spec);
    if (createElement === undefined) return;
    const root = createElement();
    root.className = `ol-tooltip ol-${this.#variant}-tooltip`;
    root.style.pointerEvents = 'none';
    root.dataset.ownerId = nonEmptyString(spec.ownerId, 'Tooltip ownerId');
    this.#root = root;
    this.#render();
    const overlay = new Overlay({
      element: root,
      className: `ol-overlay-container ol-${this.#variant}-tooltip-overlay`,
      positioning: 'bottom-left',
      stopEvent: false,
      insertFirst: false,
      offset: [...this.#state.offset]
    });
    overlay.setPosition([...this.#state.position]);
    this.#overlay = overlay;
    try {
      map.addOverlay(overlay);
      this.#applyVisibility();
    } catch (error) {
      try {
        runFinalizers([() => map.removeOverlay(overlay), () => overlay.setElement(undefined), () => overlay.dispose(), () => root.remove()]);
      } catch {
        // 回滚失败不能覆盖最初的挂载错误；构造失败后不向调用方暴露半成品句柄。
      }
      throw error;
    }
  }

  /** 更新提示框内容、位置和可见性。 */
  update(patch: Partial<TooltipViewState>): void {
    if (this.#destroyed) return;
    const previous = this.#state;
    const next = copyState({ ...previous, ...patch });
    this.#state = next;
    if (!numbersEqual(previous.position, next.position)) this.#overlay?.setPosition([...next.position]);
    if (!numbersEqual(previous.offset, next.offset)) this.#overlay?.setOffset([...next.offset]);
    if (!tooltipLinesEqual(previous.lines, next.lines)) this.#render(previous.lines);
    if (previous.visible !== next.visible) this.#applyVisibility();
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
  #render(previousLines?: readonly TooltipLine[]): void {
    const root = this.#root;
    if (root === undefined) return;
    const rows = Array.from(root.children) as HTMLElement[];
    for (let index = 0; index < this.#state.lines.length; index += 1) {
      const line = this.#state.lines[index];
      let row = rows[index];
      let created = false;
      if (row === undefined) {
        row = root.ownerDocument.createElement('div');
        row.className = `ol-${this.#variant}-tooltip-line`;
        root.append(row);
        created = true;
      }
      const previousLine = previousLines?.[index];
      if (created || previousLine === undefined || !tooltipLineEqual(previousLine, line)) renderTooltipLine(row, line);
    }
    for (let index = this.#state.lines.length; index < rows.length; index += 1) rows[index]?.remove();
  }

  /** 应用提示框可见状态。 */
  #applyVisibility(): void {
    if (this.#root !== undefined) this.#root.hidden = !this.#state.visible;
  }
}

/** 校验并复制提示框视图状态。 */
function copyState(state: TooltipViewState): TooltipViewState {
  if (
    !Array.isArray(state.position) ||
    (state.position.length !== 2 && state.position.length !== 3) ||
    state.position.some((value) => !Number.isFinite(value))
  ) {
    throw new InvalidArgumentError('Tooltip position must contain two or three finite numbers');
  }
  if (!Array.isArray(state.lines) || state.lines.length === 0) throw new InvalidArgumentError('Tooltip lines must contain non-empty text');
  const lines = state.lines.map(copyTooltipLine);
  if (!Array.isArray(state.offset) || state.offset.length !== 2 || state.offset.some((value) => !Number.isFinite(value))) {
    throw new InvalidArgumentError('Tooltip offset must contain two finite numbers');
  }
  if (typeof state.visible !== 'boolean') throw new InvalidArgumentError('Tooltip visible must be a boolean');
  return Object.freeze({
    position: Object.freeze([...state.position]) as TooltipViewState['position'],
    lines: Object.freeze(lines),
    offset: Object.freeze([state.offset[0], state.offset[1]]) as readonly [number, number],
    visible: state.visible
  });
}

/** 解析视觉变体，并为既有 Transform 调用保留默认值。 */
function tooltipVariant(value: TooltipVariant | undefined): TooltipVariant {
  if (value === undefined) return 'transform';
  if (value !== 'draw' && value !== 'edit' && value !== 'transform') throw new InvalidArgumentError('Tooltip variant must be draw, edit, or transform');
  return value;
}

/** 判断两个数字数组是否逐项相同。 */
function numbersEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** 安全渲染一行纯文本或由 Session 标注语义的文本片段。 */
function renderTooltipLine(row: HTMLElement, line: TooltipLine): void {
  if (typeof line === 'string') {
    row.replaceChildren();
    row.textContent = line;
    return;
  }
  const spans = line.map((segment) => {
    const span = row.ownerDocument.createElement('span');
    span.className = segment.tone === undefined ? 'ol-tooltip-segment' : `ol-tooltip-segment ol-tooltip-segment--${segment.tone}`;
    span.textContent = segment.text;
    return span;
  });
  row.replaceChildren(...spans);
}

/** 校验并深复制单行 Tooltip 内容。 */
function copyTooltipLine(line: TooltipLine): TooltipLine {
  if (typeof line === 'string') {
    if (line.length === 0) throw new InvalidArgumentError('Tooltip lines must contain non-empty text');
    return line;
  }
  if (!Array.isArray(line) || line.length === 0) throw new InvalidArgumentError('Tooltip segmented lines must contain at least one segment');
  return Object.freeze(line.map(copyTooltipSegment));
}

/** 校验并复制单个 Tooltip 文本片段。 */
function copyTooltipSegment(segment: TooltipSegment): TooltipSegment {
  if (typeof segment !== 'object' || segment === null || typeof segment.text !== 'string' || segment.text.length === 0) {
    throw new InvalidArgumentError('Tooltip segments must contain non-empty text');
  }
  if (segment.tone !== undefined && !tooltipSegmentTones.has(segment.tone)) throw new InvalidArgumentError('Tooltip segment tone is invalid');
  return Object.freeze({ text: segment.text, ...(segment.tone === undefined ? {} : { tone: segment.tone }) });
}

/** 判断两组 Tooltip 行是否逐项、逐片段相同。 */
function tooltipLinesEqual(left: readonly TooltipLine[], right: readonly TooltipLine[]): boolean {
  return left.length === right.length && left.every((line, index) => tooltipLineEqual(line, right[index]));
}

/** 判断两行纯文本或语义片段是否相同。 */
function tooltipLineEqual(left: TooltipLine, right: TooltipLine | undefined): boolean {
  if (right === undefined || typeof left !== typeof right) return false;
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  return left.length === right.length && left.every((segment, index) => segment.text === right[index]?.text && segment.tone === right[index]?.tone);
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
