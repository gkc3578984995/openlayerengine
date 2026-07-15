import type { Earth } from '@vrsim/earth-engine-ol';
import { DisposeBag, type Cleanup } from './DisposeBag.js';
import type { LogLevel, SelectOption } from './types.js';

interface ContextRoots {
  readonly map: HTMLElement;
  readonly controls: HTMLElement;
  readonly log: HTMLElement;
  readonly checks: HTMLElement;
  readonly code: HTMLElement;
  readonly status: HTMLElement;
}

export class ScenarioContext {
  readonly dispose = new DisposeBag();
  readonly #roots: ContextRoots;
  readonly #statuses = new Map<string, HTMLElement>();
  #mapSequence = 0;

  constructor(roots: ContextRoots) {
    this.#roots = roots;
  }

  get isDisposed(): boolean {
    return this.dispose.isDisposed;
  }

  createMapTarget(label = '地图', className = ''): HTMLElement {
    const frame = document.createElement('section');
    frame.className = `acceptance-map-frame ${className}`.trim();
    const heading = document.createElement('h3');
    heading.textContent = label;
    const target = document.createElement('div');
    target.id = `acceptance-map-${++this.#mapSequence}`;
    target.className = 'acceptance-map-target';
    frame.append(heading, target);
    this.#roots.map.append(frame);
    return target;
  }

  section(title: string, description?: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'acceptance-control-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading);
    if (description !== undefined) {
      const paragraph = document.createElement('p');
      paragraph.textContent = description;
      section.append(paragraph);
    }
    this.#roots.controls.append(section);
    return section;
  }

  button(parent: HTMLElement, label: string, action: () => void | Promise<void>, kind: '普通' | '主要' | '危险' = '普通'): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = `acceptance-button acceptance-button--${kind}`;
    button.addEventListener('click', () => void this.run(label, action));
    parent.append(button);
    return button;
  }

  checkbox(parent: HTMLElement, label: string, initial: boolean, onChange?: (value: boolean) => void): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = initial;
    input.addEventListener('change', () => onChange?.(input.checked));
    this.#field(parent, label, input);
    return input;
  }

  number(parent: HTMLElement, label: string, initial: number, options: { min?: number; max?: number; step?: number } = {}): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(initial);
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    if (options.step !== undefined) input.step = String(options.step);
    this.#field(parent, label, input);
    return input;
  }

  text(parent: HTMLElement, label: string, initial = '', placeholder?: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = initial;
    if (placeholder !== undefined) input.placeholder = placeholder;
    this.#field(parent, label, input);
    return input;
  }

  color(parent: HTMLElement, label: string, initial: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = initial;
    this.#field(parent, label, input);
    return input;
  }

  select<T extends string>(parent: HTMLElement, label: string, options: readonly SelectOption<T>[], initial: T): HTMLSelectElement {
    const select = document.createElement('select');
    for (const option of options) {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      element.selected = option.value === initial;
      select.append(element);
    }
    this.#field(parent, label, select);
    return select;
  }

  textarea(parent: HTMLElement, label: string, initial: string, rows = 5): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    textarea.value = initial;
    textarea.rows = rows;
    this.#field(parent, label, textarea);
    return textarea;
  }

  note(parent: HTMLElement, content: string, tone: '普通' | '提示' | '警告' = '普通'): HTMLElement {
    const note = document.createElement('p');
    note.className = `acceptance-note acceptance-note--${tone}`;
    note.textContent = content;
    parent.append(note);
    return note;
  }

  actions(parent: HTMLElement): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'acceptance-actions';
    parent.append(actions);
    return actions;
  }

  setCode(code: string): void {
    if (this.isDisposed) return;
    this.#roots.code.textContent = code.trim();
  }

  status(label: string, value: unknown): void {
    if (this.isDisposed) return;
    let output = this.#statuses.get(label);
    if (output === undefined) {
      const row = document.createElement('div');
      row.className = 'acceptance-status-row';
      const key = document.createElement('span');
      key.textContent = label;
      output = document.createElement('code');
      row.append(key, output);
      this.#roots.status.append(row);
      this.#statuses.set(label, output);
    }
    output.textContent = formatValue(value);
  }

  log(message: string, level: LogLevel = '信息', data?: unknown): void {
    if (this.isDisposed) return;
    const row = document.createElement('div');
    row.className = `acceptance-log acceptance-log--${level}`;
    const time = document.createElement('time');
    time.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const text = document.createElement('span');
    text.textContent = data === undefined ? message : `${message}：${formatValue(data)}`;
    row.append(time, text);
    this.#roots.log.prepend(row);
  }

  check(label: string, passed: boolean, details?: unknown): void {
    if (this.isDisposed) return;
    const row = document.createElement('div');
    row.className = `acceptance-check acceptance-check--${passed ? '通过' : '失败'}`;
    const icon = document.createElement('span');
    icon.textContent = passed ? '✓' : '×';
    const text = document.createElement('span');
    text.textContent = details === undefined ? label : `${label}（${formatValue(details)}）`;
    row.append(icon, text);
    this.#roots.checks.prepend(row);
  }

  track<T extends Cleanup>(cleanup: T): T {
    return this.dispose.add(cleanup);
  }

  trackEarth<T extends Earth>(earth: T): T {
    return this.dispose.trackEarth(earth);
  }

  render(earth: Earth): void {
    if (this.isDisposed) return;
    earth.map.updateSize();
    earth.map.renderSync();
    this.status('Earth 生命周期', earth.lifecycle);
    this.status('元素数量', earth.elements.query().length);
    this.status('图层数量', earth.layers.query().length);
  }

  async run(label: string, action: () => void | Promise<void>): Promise<void> {
    if (this.isDisposed) return;
    try {
      await action();
      this.log(`${label}执行完成`, '成功');
    } catch (error) {
      this.log(`${label}执行失败`, '错误', error instanceof Error ? error.message : error);
    }
  }

  #field(parent: HTMLElement, label: string, control: HTMLElement): void {
    const wrapper = document.createElement('label');
    wrapper.className = 'acceptance-field';
    const title = document.createElement('span');
    title.textContent = label;
    wrapper.append(title, control);
    parent.append(wrapper);
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
