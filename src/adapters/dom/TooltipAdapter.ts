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

/** Tooltip DOM 类名支持的语义色调。 */
const tooltipSegmentTones = new Set<TooltipSegmentTone>(['shortcut', 'undo', 'redo', 'danger', 'exit', 'muted']);

/** 交互提示框 DOM 适配器的可选配置。 */
export interface TooltipAdapterOptions {
  /** 创建 Tooltip 根节点的自定义工厂。 */
  readonly createElement?: () => HTMLDivElement;
}

/** 借助 DOM 和 OpenLayers Overlay 展示跟随指针的 Tooltip。 */
export class TooltipAdapter implements TooltipPort {
  readonly #map: OlMap;
  readonly #createElement: (() => HTMLDivElement) | undefined;

  constructor(map: OlMap, options: TooltipAdapterOptions = {}) {
    this.#map = map;
    this.#createElement = options.createElement ?? defaultElementFactory();
  }

  /** 为一次交互创建独立的 Tooltip 视图。 */
  open(spec: TooltipViewSpec): TooltipViewHandle {
    return new TooltipView(this.#map, this.#createElement, spec);
  }
}

/** 持有单个 Tooltip 的 DOM 和 Overlay 资源。 */
class TooltipView implements TooltipViewHandle {
  readonly #map: OlMap;
  readonly #root: HTMLDivElement | undefined;
  readonly #overlay: Overlay | undefined;
  readonly #variant: TooltipVariant;
  #state: TooltipViewState;
  #destroyed = false;
  #destroying = false;

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

  show(): void {
    this.update({ visible: true });
  }

  hide(): void {
    this.update({ visible: false });
  }

  /** 幂等释放 Tooltip 的 DOM 和 Overlay。 */
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

  /** 只重绘内容发生变化的行，保留其余 DOM 节点。 */
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

  #applyVisibility(): void {
    if (this.#root !== undefined) this.#root.hidden = !this.#state.visible;
  }
}

/** 校验 Tooltip 状态并返回不可变副本。 */
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

/** 未指定视觉变体时沿用 Transform 的兼容默认值。 */
function tooltipVariant(value: TooltipVariant | undefined): TooltipVariant {
  if (value === undefined) return 'transform';
  if (value !== 'draw' && value !== 'edit' && value !== 'transform') throw new InvalidArgumentError('Tooltip variant must be draw, edit, or transform');
  return value;
}

function numbersEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** 始终通过 `textContent` 渲染纯文本或 Session 标注的语义片段。 */
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

/** 校验单行 Tooltip 内容并冻结语义片段。 */
function copyTooltipLine(line: TooltipLine): TooltipLine {
  if (typeof line === 'string') {
    if (line.length === 0) throw new InvalidArgumentError('Tooltip lines must contain non-empty text');
    return line;
  }
  if (!Array.isArray(line) || line.length === 0) throw new InvalidArgumentError('Tooltip segmented lines must contain at least one segment');
  return Object.freeze(line.map(copyTooltipSegment));
}

/** 校验 Tooltip 文本片段并返回不可变副本。 */
function copyTooltipSegment(segment: TooltipSegment): TooltipSegment {
  if (typeof segment !== 'object' || segment === null || typeof segment.text !== 'string' || segment.text.length === 0) {
    throw new InvalidArgumentError('Tooltip segments must contain non-empty text');
  }
  if (segment.tone !== undefined && !tooltipSegmentTones.has(segment.tone)) throw new InvalidArgumentError('Tooltip segment tone is invalid');
  return Object.freeze({ text: segment.text, ...(segment.tone === undefined ? {} : { tone: segment.tone }) });
}

function tooltipLinesEqual(left: readonly TooltipLine[], right: readonly TooltipLine[]): boolean {
  return left.length === right.length && left.every((line, index) => tooltipLineEqual(line, right[index]));
}

function tooltipLineEqual(left: TooltipLine, right: TooltipLine | undefined): boolean {
  if (right === undefined || typeof left !== typeof right) return false;
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  return left.length === right.length && left.every((segment, index) => segment.text === right[index]?.text && segment.tone === right[index]?.tone);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

/** 仅在浏览器环境中提供默认 DOM 工厂。 */
function defaultElementFactory(): (() => HTMLDivElement) | undefined {
  const document = globalThis.document;
  return document === undefined ? undefined : () => document.createElement('div');
}
