import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrintDialogAdapter } from '../src/adapters/dom/PrintDialogAdapter.js';
import { PrintError } from '../src/core/errors.js';
import type { PrintLegendResult, PrintSpec, PrintValidationReport } from '../src/core/print/types.js';

class FakeClassList {
  readonly #owner: FakeElement;

  constructor(owner: FakeElement) {
    this.#owner = owner;
  }

  add(...tokens: string[]): void {
    this.#write(new Set([...this.#read(), ...tokens]));
  }

  remove(...tokens: string[]): void {
    const values = this.#read();
    for (const token of tokens) values.delete(token);
    this.#write(values);
  }

  toggle(token: string, force?: boolean): boolean {
    const values = this.#read();
    const enabled = force ?? !values.has(token);
    if (enabled) values.add(token);
    else values.delete(token);
    this.#write(values);
    return enabled;
  }

  contains(token: string): boolean {
    return this.#read().has(token);
  }

  #read(): Set<string> {
    return new Set(this.#owner.className.split(/\s+/).filter(Boolean));
  }

  #write(values: Set<string>): void {
    this.#owner.className = [...values].join(' ');
  }
}

class FakeText {
  parentElement: FakeElement | null = null;
  constructor(readonly data: string) {}
}

type FakeNode = FakeElement | FakeText;

class FakeElement {
  readonly tagName: string;
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly classList = new FakeClassList(this);
  parentElement: FakeElement | null = null;
  id = '';
  className = '';
  textContent: string | null = null;
  type = '';
  value = '';
  checked = false;
  disabled = false;
  selected = false;
  tabIndex = -1;
  min = '';
  max = '';
  step = '';
  placeholder = '';
  src = '';
  alt = '';
  href = '';
  download = '';
  clickCalls = 0;
  isConnected = true;
  clientWidth = 1200;
  clientHeight = 800;
  scrollTop = 0;
  scrollLeft = 0;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get valueAsNumber(): number {
    return this.value.trim().length === 0 ? Number.NaN : Number(this.value);
  }

  append(...nodes: FakeNode[]): void {
    for (const node of nodes) {
      node.parentElement?.removeChild(node);
      node.parentElement = this;
      this.children.push(node);
      if (this.tagName === 'SELECT' && node instanceof FakeElement && node.selected) this.value = node.value;
    }
  }

  prepend(...nodes: FakeNode[]): void {
    for (const node of [...nodes].reverse()) {
      node.parentElement?.removeChild(node);
      node.parentElement = this;
      this.children.unshift(node);
    }
  }

  replaceChildren(...nodes: FakeNode[]): void {
    for (const child of [...this.children]) this.removeChild(child);
    this.textContent = null;
    this.append(...nodes);
  }

  removeChild(node: FakeNode): FakeNode {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentElement = null;
    return node;
  }

  remove(): void {
    this.parentElement?.removeChild(this);
    this.isConnected = false;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener as unknown as (event: FakeEvent) => void);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, init: Partial<Pick<FakeEvent, 'key' | 'shiftKey' | 'clientX' | 'pointerId'>> = {}): FakeEvent {
    const event: FakeEvent = {
      key: init.key ?? '',
      shiftKey: init.shiftKey ?? false,
      clientX: init.clientX ?? 0,
      pointerId: init.pointerId ?? 1,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    return event;
  }

  getBoundingClientRect(): { left: number; width: number } {
    return { left: 0, width: this.clientWidth };
  }

  click(): void {
    this.clickCalls += 1;
    if (!this.disabled) this.dispatch('click');
  }

  focus(): void {
    fakeDocument.activeElement = this;
  }

  querySelector<T = FakeElement>(selector: string): T | null {
    if (selector.includes(',')) {
      return (
        (descendants(this).find((element) => ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(element.tagName) && !element.disabled) as T | undefined) ?? null
      );
    }
    if (selector.startsWith('.')) return (descendants(this).find((element) => element.classList.contains(selector.slice(1))) as T | undefined) ?? null;
    return null;
  }

  querySelectorAll<T = FakeElement>(selector: string): T[] {
    if (selector.startsWith('.')) return descendants(this).filter((element) => element.classList.contains(selector.slice(1))) as T[];
    if (selector.includes('button') || selector.includes('input') || selector.includes('select') || selector.includes('textarea')) {
      return descendants(this).filter((element) => ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) && !element.disabled) as T[];
    }
    return [];
  }
}

interface FakeEvent {
  key: string;
  shiftKey: boolean;
  clientX: number;
  pointerId: number;
  defaultPrevented: boolean;
  preventDefault(): void;
}

const fakeDocument = {
  activeElement: null as FakeElement | null,
  createElement: (tagName: string) => new FakeElement(tagName),
  createTextNode: (text: string) => new FakeText(text)
};

class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = [];
  readonly #callback: ResizeObserverCallback;
  observed: FakeElement | undefined;
  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed = target as unknown as FakeElement;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  trigger(): void {
    this.#callback([], this as unknown as ResizeObserver);
  }
}

class FakeImage {
  static readonly instances: FakeImage[] = [];
  crossOrigin: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = '';
  readonly requestedSources: string[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }

  get src(): string {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
    if (value.length > 0) this.requestedSources.push(value);
    queueMicrotask(() => {
      if (value.includes('fail')) this.onerror?.();
      else this.onload?.();
    });
  }
}

class FakeSession {
  status: 'ready' | 'selecting' | 'cancelled' | 'destroyed' = 'ready';
  spec: Readonly<PrintSpec> | undefined = initialSpec();
  plan: ReturnType<typeof planFixture> | undefined = planFixture();
  legendResult: Readonly<PrintLegendResult> | undefined = legendFixture();
  previewResult = undefined;
  previewQuality: 'draft' | 'final' | undefined;
  validation: Readonly<PrintValidationReport> = validationFixture(1);
  readonly update = vi.fn((spec: PrintSpec) => {
    if (spec.layout.title.trim().length === 0) throw new Error('主标题不能为空');
    if (spec.range.source.mode === 'extent' && spec.range.source.extent.some((value) => !Number.isFinite(value))) throw new Error('范围坐标无效');
    this.spec = spec;
  });
  readonly selectArea = vi.fn(async () => planFixture().range);
  readonly generateLegend = vi.fn(async () => {
    const legend = this.spec?.legend;
    if (legend?.mode === 'manual') {
      this.legendResult = { groups: legend.groups, items: legend.items, sourceRevision: this.validation.revision, warnings: [] };
    }
    if (this.legendResult === undefined) throw new Error('No legend');
    return this.legendResult;
  });
  readonly preview = vi.fn(async () => ({
    blob: new Blob(['preview'], { type: 'image/png' }),
    widthPx: this.plan?.outputSizePx[0] ?? 0,
    heightPx: this.plan?.outputSizePx[1] ?? 0,
    revision: this.validation.revision,
    plan: this.plan!,
    validation: this.validation
  }));
  readonly export = vi.fn(async () => ({
    format: 'png' as const,
    blob: new Blob(['png'], { type: 'image/png' }),
    widthPx: this.plan?.outputSizePx[0] ?? 0,
    heightPx: this.plan?.outputSizePx[1] ?? 0,
    plan: this.plan!,
    snapshotRevision: this.validation.revision,
    warnings: this.validation.warnings
  }));
  readonly cancel = vi.fn();
  readonly destroy = vi.fn();
  readonly #listeners = new Map<string, Set<(event: unknown) => void>>();

  on(type: string, listener: (event: unknown) => void): () => void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

class FailingSubscribeSession extends FakeSession {
  activeSubscriptions = 0;
  subscriptionCalls = 0;

  override on(type: string, listener: (event: unknown) => void): () => void {
    this.subscriptionCalls += 1;
    if (this.subscriptionCalls === 4) throw new Error('subscription failed');
    const release = super.on(type, listener);
    this.activeSubscriptions += 1;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.activeSubscriptions -= 1;
      release();
    };
  }
}

const originalDocument = globalThis.document;
const originalImage = globalThis.Image;
const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers();
  FakeImage.instances.length = 0;
  FakeResizeObserver.instances.length = 0;
  fakeDocument.activeElement = null;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage });
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: FakeResizeObserver });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: originalImage });
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: originalResizeObserver });
});

describe('PrintDialogAdapter', () => {
  it('rolls back the root and partial subscriptions when construction fails', () => {
    const session = new FailingSubscribeSession();
    const target = new FakeElement('div');
    const onDestroy = vi.fn();

    expect(
      () =>
        new PrintDialogAdapter({
          session: session as never,
          target: target as unknown as HTMLElement,
          capabilities: { pdf: true, browserPrint: true, limits: { minDpi: 72, maxDpi: 600 } },
          onDestroy
        })
    ).toThrow('subscription failed');

    expect(session.activeSubscriptions).toBe(0);
    expect(descendants(target).some((element) => element.classList.contains('ol-print-dialog'))).toBe(false);
    expect(onDestroy).toHaveBeenCalledOnce();
  });

  it('edits group/item hierarchy, ordering and every manual layout field without losing the manual base', async () => {
    const session = new FakeSession();
    const initial = manualSpec(session);
    session.spec = {
      ...session.spec!,
      legend: {
        ...initial,
        items: [
          ...initial.items,
          {
            id: 'dormant',
            groupId: 'g1',
            label: '暂时消失来源',
            order: 2,
            sourceKey: 'source:dormant',
            symbol: { kind: 'line', stroke: { color: '#999999', widthMm: 0.3 } }
          }
        ]
      }
    };
    const { adapter, target } = setup(session);
    clickText(target, '4 手动图例');

    const groupTitle = byAria(target, '分组标题 第一组');
    groupTitle.value = '重命名分组';
    groupTitle.dispatch('change');
    await flush();
    expect(manualSpec(session).groups.find((group) => group.id === 'g1')?.title).toBe('重命名分组');

    byAria(target, '显示图例分组 重命名分组').checked = false;
    byAria(target, '显示图例分组 重命名分组').dispatch('change');
    await flush();
    clickAria(target, '下移分组 重命名分组');
    await flush();
    expect(manualSpec(session).groups.find((group) => group.id === 'g1')).toMatchObject({ visible: false, order: 1 });

    const itemLabel = allByAria(target, '图例名称').find((element) => element.value === '目标点');
    if (itemLabel === undefined) throw new Error('Expected target item label');
    itemLabel.value = '重点目标';
    itemLabel.dispatch('change');
    await flush();
    const groupSelect = byAria(target, '设置 重点目标 的所属分组');
    groupSelect.value = 'g2';
    groupSelect.dispatch('change');
    await flush();
    const itemVisible = byAria(target, '显示图例项 重点目标');
    itemVisible.checked = false;
    itemVisible.dispatch('change');
    await flush();
    clickAria(target, '上移 重点目标');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')).toMatchObject({ label: '重点目标', groupId: 'g2', visible: false, order: 0 });
    expect(manualSpec(session).items.find((item) => item.id === 'area')?.order).toBe(1);

    const updates: Array<readonly [string, string]> = [
      ['列数', '2'],
      ['排列方向', 'row'],
      ['图例位置', 'top-right'],
      ['最大宽度（mm）', '96'],
      ['内边距（mm）', '4'],
      ['背景', '#abcdef'],
      ['组间距（mm）', '6'],
      ['条目间距（mm）', '3']
    ];
    for (const [label, value] of updates) {
      const control = fieldControl(target, label);
      control.value = value;
      control.dispatch('change');
      await flush();
    }
    expect(manualSpec(session).layout).toEqual({
      columns: 2,
      direction: 'row',
      position: 'top-right',
      maxWidthMm: 96,
      paddingMm: 4,
      background: '#abcdef',
      groupGapMm: 6,
      itemGapMm: 3
    });
    expect(manualSpec(session).items.find((item) => item.id === 'point')).toMatchObject({ label: '重点目标', groupId: 'g2', visible: false, order: 0 });
    expect(manualSpec(session).items.find((item) => item.id === 'dormant')).toMatchObject({ sourceKey: 'source:dormant', label: '暂时消失来源' });
    adapter.destroy();
  });

  it('switches all four legend positions and reflects the selected anchor in the live paper', async () => {
    const { adapter, session, target } = setup();
    clickText(target, '4 手动图例');
    const position = fieldControl(target, '图例位置');
    expect(position.value).toBe('bottom-left');
    expect(byClass(target, 'ol-print-paper__legend').classList.contains('ol-print-paper__legend--bottom-left')).toBe(true);

    for (const value of ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const) {
      const control = fieldControl(target, '图例位置');
      control.value = value;
      control.dispatch('change');
      await flush();
      expect((manualSpec(session).layout as { readonly position?: string } | undefined)?.position).toBe(value);
      expect(byClass(target, 'ol-print-paper__legend').classList.contains(`ol-print-paper__legend--${value}`)).toBe(true);
    }
    adapter.destroy();
  });

  it('collapses legend entries by group without changing their output configuration', async () => {
    const { adapter, session, target } = setup();
    clickText(target, '4 手动图例');
    const before = manualSpec(session).items;
    const collapse = byAria(target, '折叠图例分组 第一组');
    collapse.focus();
    collapse.click();
    expect(byAria(target, '展开图例分组 第一组').getAttribute('aria-expanded')).toBe('false');
    expect(fakeDocument.activeElement).toBe(byAria(target, '展开图例分组 第一组'));
    expect(allByAria(target, '图例名称').map((input) => input.value)).toEqual(['区域']);
    expect(manualSpec(session).items).toEqual(before);
    clickAria(target, '展开图例分组 第一组');
    expect(allByAria(target, '图例名称').map((input) => input.value)).toEqual(['目标点', '道路', '区域']);
    adapter.destroy();
  });

  it('preserves the manual legend scroll position across value updates and same-step rerenders', async () => {
    const { adapter, target } = setup();
    clickText(target, '4 手动图例');

    let scroll = byClass(target, 'ol-print-dialog__scroll');
    scroll.scrollTop = 420;
    scroll.scrollLeft = 11;
    const position = fieldControl(target, '图例位置');
    position.value = 'top-right';
    position.dispatch('change');

    scroll = byClass(target, 'ol-print-dialog__scroll');
    expect(scroll.scrollTop).toBe(420);
    expect(scroll.scrollLeft).toBe(11);
    await flush();
    scroll = byClass(target, 'ol-print-dialog__scroll');
    expect(scroll.scrollTop).toBe(420);
    expect(scroll.scrollLeft).toBe(11);

    scroll.scrollTop = 275;
    clickAria(target, '折叠图例分组 第一组');
    expect(byClass(target, 'ol-print-dialog__scroll').scrollTop).toBe(275);

    clickText(target, '5 预览导出');
    expect(byClass(target, 'ol-print-dialog__scroll').scrollTop).toBe(0);
    adapter.destroy();
  });

  it('pairs every editable legend color with a picker while preserving text and alpha input', async () => {
    const session = new FakeSession();
    const legend = session.spec?.legend;
    if (legend?.mode !== 'manual') throw new Error('Expected manual legend');
    session.spec = { ...session.spec!, legend: { ...legend, layout: { background: 'rgba(34, 68, 102, 0.5)' } } };
    const { adapter, target } = setup(session);
    clickText(target, '4 手动图例');
    for (const label of ['背景', '点填充颜色', '点描边颜色', '线颜色', '面填充颜色', '轮廓颜色']) {
      expect(byAria(target, `选择${label}`).type).toBe('color');
    }
    expect(byAria(target, '选择背景').value).toBe('#224466');
    let background = fieldControl(target, '背景');
    background.value = 'red';
    background.dispatch('change');
    await flush();
    expect(byAria(target, '选择背景').value).toBe('#ff0000');
    background = fieldControl(target, '背景');
    background.value = 'transparent';
    background.dispatch('change');
    await flush();
    expect(byAria(target, '选择背景').value).toBe('#000000');
    background = fieldControl(target, '背景');
    background.value = 'red; background:black';
    background.dispatch('change');
    expect(background.getAttribute('aria-invalid')).toBe('true');
    clickAria(target, '折叠图例分组 第一组');
    const persistedBackground = fieldControl(target, '背景');
    expect(persistedBackground.value).toBe('red; background:black');
    expect(persistedBackground.getAttribute('aria-invalid')).toBe('true');
    persistedBackground.value = '#ffffff80';
    persistedBackground.dispatch('change');
    await flush();
    expect(manualSpec(session).layout?.background).toBe('#ffffff80');
    clickAria(target, '展开图例分组 第一组');
    const picker = byAria(target, '选择点填充颜色');
    picker.value = '#224466';
    picker.dispatch('change');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toMatchObject({ fill: { color: '#224466' } });

    const text = symbolFieldControl(target, '目标点', '点填充颜色');
    text.value = '#22446680';
    text.dispatch('change');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toMatchObject({ fill: { color: '#22446680' } });
    adapter.destroy();
  });

  it('edits point/line/polygon symbols and only commits icon fields after Image validation succeeds', async () => {
    const { adapter, session, target } = setup();
    clickText(target, '4 手动图例');

    let kind = byAria(target, '设置 目标点 的符号类型');
    kind.value = 'line';
    kind.dispatch('change');
    await flush();
    const width = fieldControl(target, '线宽（mm）');
    width.value = '1.25';
    width.dispatch('change');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toMatchObject({ kind: 'line', stroke: { widthMm: 1.25 } });
    const lineColor = fieldControl(target, '线颜色');
    lineColor.value = '#123456';
    lineColor.dispatch('change');
    await flush();
    const lineDash = fieldControl(target, '线虚线（mm）');
    lineDash.value = '2, -1';
    lineDash.dispatch('change');
    expect(lineDash.getAttribute('aria-invalid')).toBe('true');
    expect(allText(target)).toContain('必须是非负有限数值序列');
    expect(
      (manualSpec(session).items.find((item) => item.id === 'point')?.symbol as { stroke?: { dashMm?: readonly number[] } }).stroke?.dashMm
    ).toBeUndefined();
    lineDash.value = '2, 1';
    lineDash.dispatch('change');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toMatchObject({
      kind: 'line',
      stroke: { color: '#123456', widthMm: 1.25, dashMm: [2, 1] }
    });

    kind = byAria(target, '设置 目标点 的符号类型');
    kind.value = 'polygon';
    kind.dispatch('change');
    await flush();
    const polygonColor = symbolFieldControl(target, '目标点', '面填充颜色');
    polygonColor.value = 'rgba(0, 255, 0, 0.5)';
    polygonColor.dispatch('change');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toMatchObject({ kind: 'polygon', fill: { color: 'rgba(0, 255, 0, 0.5)' } });
    const outline = symbolFieldControl(target, '目标点', '轮廓颜色');
    outline.value = 'red; background: black';
    outline.dispatch('change');
    expect(outline.getAttribute('aria-invalid')).toBe('true');
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).not.toMatchObject({ stroke: { color: 'red; background: black' } });
    outline.value = 'transparent';
    outline.dispatch('change');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toMatchObject({ kind: 'polygon', stroke: { color: 'transparent' } });
    const polygonDash = symbolFieldControl(target, '目标点', '轮廓虚线（mm）');
    polygonDash.value = '3 2';
    polygonDash.dispatch('change');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toMatchObject({
      kind: 'polygon',
      stroke: { color: 'transparent', dashMm: [3, 2] }
    });

    kind = byAria(target, '设置 目标点 的符号类型');
    kind.value = 'point';
    kind.dispatch('change');
    await flush();
    const radius = fieldControl(target, '点半径（mm）');
    radius.value = '1.7';
    radius.dispatch('change');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toMatchObject({ kind: 'point', radiusMm: 1.7 });
    const pointFill = fieldControl(target, '点填充颜色');
    pointFill.value = '#01020380';
    pointFill.dispatch('change');
    await flush();
    const pointStroke = fieldControl(target, '点描边颜色');
    pointStroke.value = '#abcdef';
    pointStroke.dispatch('change');
    await flush();
    const pointStrokeWidth = fieldControl(target, '点描边宽度（mm）');
    pointStrokeWidth.value = '0.6';
    pointStrokeWidth.dispatch('change');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toMatchObject({
      kind: 'point',
      fill: { color: '#01020380' },
      stroke: { color: '#abcdef', widthMm: 0.6 }
    });

    kind = byAria(target, '设置 目标点 的符号类型');
    kind.value = 'icon';
    kind.dispatch('change');
    const crossOrigin = fieldControl(target, '跨域模式');
    crossOrigin.value = 'anonymous';
    crossOrigin.dispatch('change');
    const url = fieldControl(target, '图标地址');
    url.value = 'https://example.test/icon.png';
    url.dispatch('change');
    await flush(4);
    expect(FakeImage.instances.at(-1)).toMatchObject({ crossOrigin: 'anonymous', src: '', requestedSources: ['https://example.test/icon.png'] });
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toEqual({
      kind: 'icon',
      src: 'https://example.test/icon.png',
      size: [24, 24],
      anchor: [0.5, 0.5],
      crossOrigin: 'anonymous'
    });

    for (const [label, value] of [
      ['图标宽度', '32'],
      ['图标高度', '16'],
      ['锚点 X', '0.25'],
      ['锚点 Y', '0.75']
    ] as const) {
      const control = fieldControl(target, label);
      control.value = value;
      control.dispatch('change');
      await flush(4);
    }
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toEqual({
      kind: 'icon',
      src: 'https://example.test/icon.png',
      size: [32, 16],
      anchor: [0.25, 0.75],
      crossOrigin: 'anonymous'
    });

    const updateCount = session.update.mock.calls.length;
    const failedUrl = fieldControl(target, '图标地址');
    failedUrl.value = 'https://example.test/fail.png';
    failedUrl.dispatch('change');
    await flush(3);
    expect(session.update).toHaveBeenCalledTimes(updateCount);
    expect(manualSpec(session).items.find((item) => item.id === 'point')?.symbol).toMatchObject({ src: 'https://example.test/icon.png' });
    expect(allText(target)).toContain('图标加载失败');
    adapter.destroy();
  });

  it('times out pending icon validation and aborts every superseded or destroyed Image', async () => {
    class PendingImage {
      static readonly instances: PendingImage[] = [];
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      #src = '';
      readonly requestedSources: string[] = [];

      constructor() {
        PendingImage.instances.push(this);
      }

      get src(): string {
        return this.#src;
      }

      set src(value: string) {
        this.#src = value;
        if (value.length > 0) this.requestedSources.push(value);
      }
    }
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: PendingImage });
    const session = new FakeSession();
    session.spec = { ...session.spec!, resources: { timeoutMs: 25 } };
    const { adapter, target } = setup(session);
    await vi.advanceTimersByTimeAsync(160);
    clickText(target, '4 手动图例');
    const kind = byAria(target, '设置 目标点 的符号类型');
    kind.value = 'icon';
    kind.dispatch('change');
    const url = symbolFieldControl(target, '目标点', '图标地址');

    for (let index = 0; index < 50; index += 1) {
      url.value = `https://example.test/pending-${index}.png`;
      url.dispatch('change');
    }
    await flush(3);
    expect(PendingImage.instances).toHaveLength(50);
    for (const image of PendingImage.instances.slice(0, -1)) {
      expect(image).toMatchObject({ src: '', onload: null, onerror: null });
    }
    const pending = PendingImage.instances.at(-1)!;
    expect(pending.src).toContain('pending-49.png');
    expect(pending.onload).toBeTypeOf('function');

    await vi.advanceTimersByTimeAsync(25);
    await flush(3);
    expect(pending).toMatchObject({ src: '', onload: null, onerror: null });
    expect(allText(target)).toContain('图标验证超时');

    url.value = 'https://example.test/destroyed.png';
    url.dispatch('change');
    const destroyed = PendingImage.instances.at(-1)!;
    adapter.destroy();
    await flush(3);
    expect(destroyed).toMatchObject({ src: '', onload: null, onerror: null });
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage });
  });

  it('binds warning acknowledgement to validation revision and exposes fit/100% preview modes', async () => {
    const session = new FakeSession();
    session.validation = validationFixture(7, {
      warnings: [
        {
          code: 'scale-valid-at-center',
          message: 'The fixed scale is locally valid at the print center because projection scale varies by position',
          requiresAcknowledgement: true
        }
      ],
      canExport: false
    });
    const { adapter, target } = setup(session, true);
    clickText(target, '5 预览导出');
    expect(buttonText(target, '导出 PNG').disabled).toBe(true);
    expect(allText(target)).toContain('比例尺适用范围提示：受投影影响，固定比例尺仅在打印中心准确。');
    expect(allText(target)).not.toContain('scale-valid-at-center');
    expect(allText(target)).not.toContain('Physical output scale');

    const acknowledgement = byAria(target, '确认当前版本的打印警告');
    acknowledgement.checked = true;
    acknowledgement.dispatch('change');
    expect(buttonText(target, '导出 PNG').disabled).toBe(false);
    clickText(target, '100%');
    expect(byClass(target, 'ol-print-dialog__preview').classList.contains('ol-print-dialog__preview--actual')).toBe(true);
    expect(buttonText(target, '100%').getAttribute('aria-pressed')).toBe('true');
    expect(byClass(target, 'ol-print-paper').style.width).toBe(`${session.plan?.outputSizePx[0]}px`);

    session.validation = validationFixture(8, {
      warnings: [{ code: 'scale-valid-at-center', message: '比例尺仅在中心准确', requiresAcknowledgement: true }],
      canExport: false
    });
    session.emit('validationchange');
    expect(byAria(target, '确认当前版本的打印警告').checked).toBe(false);
    expect(buttonText(target, '导出 PNG').disabled).toBe(true);

    session.validation = validationFixture(9, {
      warnings: [{ code: 'animations-excluded', message: '动画已排除', requiresAcknowledgement: false }],
      canExport: false
    });
    session.emit('validationchange');
    expect(buttonText(target, '导出 PNG').disabled).toBe(false);
    session.validation = validationFixture(10, { issues: [{ code: 'legend-overflow', message: '图例溢出' }], canPreview: false, canExport: true });
    session.emit('validationchange');
    expect(buttonText(target, '导出 PNG').disabled).toBe(true);
    expect(buttonText(target, '刷新最终预览').disabled).toBe(true);
    adapter.destroy();
  });

  it('presents warning and error messages in Chinese while retaining machine codes only as data', () => {
    const session = new FakeSession();
    session.validation = validationFixture(4, {
      issues: [{ code: 'resource-timeout', message: 'Timed out while loading map tiles' }],
      warnings: [{ code: 'unknown-dynamic-style', message: 'Dynamic style target could not be parsed', requiresAcknowledgement: false }],
      canPreview: false,
      canExport: false
    });
    const { adapter, target } = setup(session);
    const text = allText(target);
    expect(text).toContain('资源加载超时：打印所需资源加载超时，请检查网络后重试。');
    expect(text).toContain('动态样式需确认：图层存在无法自动解析的动态样式，请在手动图例中确认。');
    expect(text).not.toContain('resource-timeout');
    expect(text).not.toContain('Timed out');
    expect(text).not.toContain('unknown-dynamic-style');
    expect(descendants(target).some((element) => element.dataset.printValidationCode === 'resource-timeout')).toBe(true);
    adapter.destroy();
  });

  it('preserves an external final preview over queued and in-flight draft work', async () => {
    const { adapter, session, target } = setup();
    session.preview.mockClear();
    session.previewQuality = 'final';
    session.emit('previewchange', {
      type: 'previewchange',
      result: {
        blob: new Blob(['external-final'], { type: 'image/png' }),
        widthPx: session.plan!.outputSizePx[0],
        heightPx: session.plan!.outputSizePx[1],
        revision: session.validation.revision,
        plan: session.plan!,
        validation: session.validation
      },
      revision: session.validation.revision
    });

    expect(allText(target)).toContain('最终预览');
    expect(allText(target)).not.toContain('草稿预览');
    await vi.advanceTimersByTimeAsync(160);
    expect(session.preview).not.toHaveBeenCalled();

    let resolveDraft: ((value: Awaited<ReturnType<FakeSession['preview']>>) => void) | undefined;
    session.preview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDraft = resolve;
        })
    );
    session.validation = validationFixture(2);
    session.emit('validationchange', { type: 'validationchange', validation: session.validation, revision: 2 });
    session.previewQuality = undefined;
    await vi.advanceTimersByTimeAsync(160);
    expect(session.preview).toHaveBeenCalledWith({ quality: 'draft' });

    session.previewQuality = 'final';
    session.emit('previewchange', {
      type: 'previewchange',
      result: {
        blob: new Blob(['external-final-2'], { type: 'image/png' }),
        widthPx: session.plan!.outputSizePx[0],
        heightPx: session.plan!.outputSizePx[1],
        revision: 2,
        plan: { ...session.plan!, revision: 2 },
        validation: session.validation
      },
      revision: 2
    });
    resolveDraft?.({
      blob: new Blob(['late-draft'], { type: 'image/png' }),
      widthPx: 800,
      heightPx: 566,
      revision: 2,
      plan: { ...session.plan!, revision: 2 },
      validation: session.validation
    });
    await flush();
    expect(allText(target)).toContain('当前显示 r2 最终预览');
    expect(allText(target)).not.toContain('当前显示 r2 草稿预览');
    adapter.destroy();
  });

  it('replaces an external final preview with a newer frame from the same revision', () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:final-1').mockReturnValueOnce('blob:final-2');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let adapter: PrintDialogAdapter | undefined;
    try {
      const result = setup();
      adapter = result.adapter;
      result.session.previewQuality = 'final';
      for (const frame of ['first', 'second']) {
        result.session.emit('previewchange', {
          type: 'previewchange',
          result: {
            blob: new Blob([frame], { type: 'image/png' }),
            widthPx: result.session.plan!.outputSizePx[0],
            heightPx: result.session.plan!.outputSizePx[1],
            revision: result.session.validation.revision,
            plan: result.session.plan!,
            validation: result.session.validation
          },
          revision: result.session.validation.revision
        });
      }

      expect(createObjectUrl).toHaveBeenCalledTimes(2);
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:final-1');
      expect(allText(result.target)).toContain('当前显示 r1 最终预览');
    } finally {
      adapter?.destroy();
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
    }
  });

  it('revokes a download URL immediately when the anchor cannot be created', async () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:preview').mockReturnValue('blob:download');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const createElement = fakeDocument.createElement;
    fakeDocument.createElement = (tagName: string) => {
      if (tagName === 'a') throw new Error('anchor unavailable');
      return createElement(tagName);
    };
    let adapter: PrintDialogAdapter | undefined;
    try {
      const setupResult = setup();
      adapter = setupResult.adapter;
      clickText(setupResult.target, '5 预览导出');

      clickText(setupResult.target, '导出 PNG');
      await flush();

      expect(setupResult.session.export).toHaveBeenCalledWith({ format: 'png' });
      expect(createObjectUrl).toHaveBeenCalledTimes(2);
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:download');
      expect(allText(setupResult.target)).toContain('操作未完成，请检查当前配置后重试。');
      expect(allText(setupResult.target)).not.toContain('anchor unavailable');
    } finally {
      adapter?.destroy();
      fakeDocument.createElement = createElement;
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
    }
  });

  it('keeps continuous title typing focused and persists invalid draft errors instead of exporting the old spec', async () => {
    const { adapter, session, target } = setup();
    const title = fieldControl(target, '主标题');
    title.focus();
    title.value = '';
    for (const character of '连续输入标题') {
      title.value += character;
      title.dispatch('input');
      expect(fakeDocument.activeElement).toBe(title);
      expect(descendants(target)).toContain(title);
    }
    expect(session.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120);
    expect(session.spec?.layout.title).toBe('连续输入标题');
    expect(fakeDocument.activeElement).toBe(title);
    expect(descendants(target)).toContain(title);
    title.dispatch('change');
    expect(session.spec?.layout.title).toBe('连续输入标题');

    const currentTitle = fieldControl(target, '主标题');
    currentTitle.value = '';
    currentTitle.dispatch('change');
    expect(session.spec?.layout.title).toBe('连续输入标题');
    expect(allText(target)).toContain('当前表单尚未提交：主标题不能为空');
    expect(buttonText(target, '下一步：选择范围').disabled).toBe(true);
    session.preview.mockClear();
    await vi.advanceTimersByTimeAsync(200);
    expect(session.preview).not.toHaveBeenCalled();
    expect(buttonText(target, '5 预览导出').disabled).toBe(true);
    buttonText(target, '5 预览导出').click();
    expect(session.export).not.toHaveBeenCalled();

    clickText(target, '1 版式设置');
    const repaired = fieldControl(target, '主标题');
    repaired.value = '修正后的标题';
    repaired.dispatch('change');
    expect(allText(target)).not.toContain('当前表单尚未提交');
    expect(buttonText(target, '下一步：选择范围').disabled).toBe(false);
    adapter.destroy();
  });

  it('keeps empty, non-finite and out-of-range numeric drafts invalid until a valid flush', async () => {
    const { adapter, session, target } = setup();
    expect(allText(target)).toContain('277 × 145 mm');
    expect(allText(target)).toContain('1200 × 848 px');
    expect(allText(target)).toContain('RGBA 内存');
    session.preview.mockClear();

    for (const invalidValue of ['', 'not-a-number', '601']) {
      const dpi = fieldControl(target, 'DPI');
      dpi.value = invalidValue;
      dpi.dispatch('input');
      expect(dpi.getAttribute('aria-invalid')).toBe('true');
      expect(allText(target)).toContain('DPI必须是 72 至 600 之间的有限数值');
      expect(buttonText(target, '下一步：选择范围').disabled).toBe(true);
      session.emit('validationchange');
      const persisted = fieldControl(target, 'DPI');
      expect(persisted.value).toBe(invalidValue);
      expect(persisted.getAttribute('aria-invalid')).toBe('true');
    }
    await vi.advanceTimersByTimeAsync(500);
    expect(session.preview).not.toHaveBeenCalled();

    const repaired = fieldControl(target, 'DPI');
    repaired.focus();
    repaired.value = '300';
    repaired.dispatch('input');
    await vi.advanceTimersByTimeAsync(120);
    expect(session.spec?.paper.dpi).toBe(300);
    expect(fakeDocument.activeElement).toBe(repaired);
    expect(descendants(target)).toContain(repaired);
    expect(allText(target)).not.toContain('当前表单尚未提交');
    expect(buttonText(target, '下一步：选择范围').disabled).toBe(false);
    repaired.dispatch('blur');
    adapter.destroy();
  });

  it('shows concise source/actual ranges, legend basis and the complete export checklist', () => {
    const { adapter, target } = setup();
    clickText(target, '2 范围选择');
    expect(allText(target)).toContain('来源范围0, 0, 100, 100');
    expect(allText(target)).toContain('实际范围0, 0, 100, 100');
    expect(allText(target)).not.toContain('最终足迹');
    expect(allText(target)).not.toContain('窄屏预览');
    clickText(target, '3 自动图例');
    expect(allText(target)).toContain('合并条目3 项');
    expect(allText(target)).toContain('最终比例尺1∶10,000');
    expect(allText(target)).toContain('最终打印足迹、最终比例尺');
    clickText(target, '5 预览导出');
    for (const label of ['范围', '比例尺', '页面与图例溢出', '来源警告', '资源与 CORS', '像素预算', '动画快照', '浏览器打印限制']) {
      expect(allText(target)).toContain(label);
    }
    expect(allText(target)).not.toContain('PDF');
    expect(descendants(target).some((element) => element.tagName === 'BUTTON' && allText(element) === '导出 PDF')).toBe(false);
    adapter.destroy();
  });

  it('blocks pixel-budget issues on screen 1 while allowing range-unresolved to proceed to selection', () => {
    const session = new FakeSession();
    session.spec = { ...session.spec!, paper: { size: 'A3', orientation: 'landscape', marginMm: 10, dpi: 600 } };
    session.plan = { ...planFixture(), pageSizeMm: [420, 297], outputSizePx: [7016, 4961], dpi: 600 };
    session.validation = validationFixture(2, {
      issues: [{ code: 'pixel-budget-exceeded', message: 'A3 600 DPI 超出像素预算' }],
      canPreview: false,
      canExport: false
    });
    const { adapter, target } = setup(session);
    expect(allText(target)).toContain('输出像素超限：A3 600 DPI 超出像素预算');
    expect(allText(target)).not.toContain('pixel-budget-exceeded');
    expect(allText(target)).toContain('MiB（高）');
    expect(buttonText(target, '下一步：选择范围').disabled).toBe(true);
    adapter.destroy();

    const unresolved = new FakeSession();
    unresolved.plan = undefined;
    unresolved.validation = validationFixture(3, { issues: [{ code: 'range-unresolved', message: '请先框选范围' }], canPreview: false, canExport: false });
    unresolved.spec = { ...unresolved.spec!, range: { source: { mode: 'box' }, scale: { mode: 'fit' } } };
    const second = setup(unresolved);
    expect(buttonText(second.target, '下一步：选择范围').disabled).toBe(false);
    clickText(second.target, '下一步：选择范围');
    expect(allText(second.target)).toContain('2. 范围选择');
    expect(buttonText(second.target, '下一步：自动图例').disabled).toBe(true);
    second.adapter.destroy();
  });

  it('preserves asymmetric initial margins through unrelated edits and exposes all four sides', () => {
    const session = new FakeSession();
    session.spec = { ...session.spec!, paper: { ...session.spec!.paper, marginMm: { top: 11, right: 12, bottom: 13, left: 14 } } };
    const { adapter, target } = setup(session);
    expect(fieldControl(target, '边距模式').value).toBe('sides');
    expect(fieldControl(target, '上边距（mm）').value).toBe('11');
    expect(fieldControl(target, '右边距（mm）').value).toBe('12');
    expect(fieldControl(target, '下边距（mm）').value).toBe('13');
    expect(fieldControl(target, '左边距（mm）').value).toBe('14');
    const title = fieldControl(target, '主标题');
    title.value = '仅修改标题';
    title.dispatch('change');
    expect(session.spec?.paper.marginMm).toEqual({ top: 11, right: 12, bottom: 13, left: 14 });
    const left = fieldControl(target, '左边距（mm）');
    left.value = '18';
    left.dispatch('change');
    expect(session.spec?.paper.marginMm).toEqual({ top: 11, right: 12, bottom: 13, left: 18 });
    adapter.destroy();
  });

  it('round-trips non-editable content and resource policies when only the title changes', () => {
    const session = new FakeSession();
    session.spec = {
      ...session.spec!,
      content: { animations: 'base' },
      resources: { timeoutMs: 12_345 }
    };
    const { adapter, target } = setup(session);
    const title = fieldControl(target, '主标题');
    title.value = '保留资源策略';
    title.dispatch('change');

    expect(session.spec?.layout.title).toBe('保留资源策略');
    expect(session.spec?.content).toEqual({ animations: 'base' });
    expect(session.spec?.resources).toEqual({ timeoutMs: 12_345 });
    adapter.destroy();
  });

  it('adopts an external session spec before committing an unrelated field', () => {
    const session = new FakeSession();
    const { adapter, target } = setup(session);
    const external = {
      ...session.spec!,
      layout: { ...session.spec!.layout, title: '外部更新后的标题', subtitle: '外部副标题' }
    };
    session.spec = external;
    session.validation = validationFixture(2);
    session.emit('specchange', { type: 'specchange', spec: external, revision: 2 });

    expect(fieldControl(target, '主标题').value).toBe('外部更新后的标题');
    expect(fieldControl(target, '副标题').value).toBe('外部副标题');
    const dpi = fieldControl(target, 'DPI');
    dpi.value = '180';
    dpi.dispatch('change');

    expect(session.spec?.paper.dpi).toBe(180);
    expect(session.spec?.layout.title).toBe('外部更新后的标题');
    expect(session.spec?.layout.subtitle).toBe('外部副标题');
    adapter.destroy();
  });

  it('normalizes an external extent update back to the view source without a UI and session mismatch', () => {
    const session = new FakeSession();
    const { adapter, target } = setup(session);
    const external = {
      ...session.spec!,
      range: { source: { mode: 'extent' as const, extent: [10, 20, 30, 40] as const }, scale: { mode: 'fit' as const } }
    };
    session.spec = external;
    session.validation = validationFixture(2);
    session.emit('specchange', { type: 'specchange', spec: external, revision: 2 });

    expect(fieldControl(target, '范围来源').value).toBe('view');
    expect(session.spec?.range.source.mode).toBe('view');
    expect(allText(target)).toContain('内置界面不编辑外部坐标范围，已切换为当前视图。');
    const title = fieldControl(target, '主标题');
    title.value = '范围真源一致';
    title.dispatch('change');
    expect(session.spec?.range.source.mode).toBe('view');
    adapter.destroy();
  });

  it('keeps the next editor focused when a previous live field settles on blur', async () => {
    const { adapter, session, target } = setup();
    const classification = fieldControl(target, '密级');
    const title = fieldControl(target, '主标题');
    classification.focus();
    classification.value = '机密★30年';
    classification.dispatch('input');
    title.focus();
    classification.dispatch('blur');
    await flush();

    expect(fieldControl(target, '主标题')).toBe(title);
    expect(fakeDocument.activeElement).toBe(title);
    title.value = '焦点连续编辑标题';
    title.dispatch('input');
    await vi.advanceTimersByTimeAsync(120);
    expect(session.spec?.layout).toMatchObject({ classification: '机密★30年', title: '焦点连续编辑标题' });
    adapter.destroy();
  });

  it('offers common classification suggestions while preserving free-form entry and unique lists per dialog', () => {
    const first = setup();
    const second = setup();
    const firstInput = fieldControl(first.target, '密级');
    const secondInput = fieldControl(second.target, '密级');
    const firstListId = firstInput.getAttribute('list');
    const secondListId = secondInput.getAttribute('list');
    const firstList = descendants(first.target).find((element) => element.tagName === 'DATALIST');

    expect(firstListId).toMatch(/^ol-print-classification-/u);
    expect(secondListId).not.toBe(firstListId);
    expect(firstList?.id).toBe(firstListId);
    expect(firstList?.children.map((child) => (child instanceof FakeElement ? child.value : ''))).toContain('机密★30年');

    firstInput.value = '业务自定义密级★15年';
    firstInput.dispatch('change');
    expect(first.session.spec?.layout.classification).toBe('业务自定义密级★15年');
    first.adapter.destroy();
    second.adapter.destroy();
  });

  it('restores focus after a structural select rebuilds conditional fields', () => {
    const { adapter, target } = setup();
    const root = byClass(target, 'ol-print-dialog');
    const paper = fieldControl(target, '纸张');
    paper.focus();
    paper.value = 'custom';
    paper.dispatch('change');

    const replacement = fieldControl(target, '纸张');
    expect(replacement).not.toBe(paper);
    expect(fakeDocument.activeElement).toBe(replacement);
    expect(root.dispatch('keydown', { key: 'Tab' }).defaultPrevented).toBe(true);
    expect(descendants(root)).toContain(fakeDocument.activeElement);
    expect(fieldControl(target, '纸宽（mm）')).toBeDefined();
    adapter.destroy();
  });

  it('omits the specified-extent source and coordinate editor from the built-in UI', () => {
    const session = new FakeSession();
    session.spec = { ...session.spec!, range: { source: { mode: 'extent', extent: [10, 20, 30, 40] }, scale: { mode: 'fit' } } };
    const { adapter, target } = setup(session);
    const source = fieldControl(target, '范围来源');
    expect(source.value).toBe('view');
    expect(session.spec?.range.source.mode).toBe('view');
    expect(allText(target)).toContain('内置界面不编辑外部坐标范围，已切换为当前视图。');
    const values = descendants(source)
      .filter((element) => element.tagName === 'OPTION')
      .map((option) => option.value);
    expect(values).toEqual(['view', 'box']);
    expect(allText(target)).not.toContain('指定范围');
    expect(allText(target)).not.toContain('范围坐标');
    adapter.destroy();
  });

  it('uses custom paper dimensions for the live shell aspect ratio before a plan exists', () => {
    const session = new FakeSession();
    session.plan = undefined;
    session.spec = {
      ...session.spec!,
      paper: { ...session.spec!.paper, size: { widthMm: 400, heightMm: 200 }, orientation: 'landscape' }
    };
    const { adapter, target } = setup(session);
    expect(byClass(target, 'ol-print-paper').style.aspectRatio).toBe('400 / 200');
    adapter.destroy();
  });

  it('creates and deletes pure manual groups/items atomically from an empty automatic legend', async () => {
    const session = new FakeSession();
    session.spec = { ...session.spec!, legend: { mode: 'auto', showCounts: true } };
    session.legendResult = emptyLegendFixture();
    const { adapter, target } = setup(session);
    clickText(target, '4 手动图例');
    clickText(target, '新增条目');
    await flush();
    const manual = manualSpec(session);
    expect(manual.groups).toHaveLength(1);
    expect(manual.items).toHaveLength(1);
    expect(manual.groups[0]?.id).toMatch(/^manual-group-/);
    expect(manual.items[0]).toMatchObject({ groupId: manual.groups[0]?.id, symbol: { kind: 'point', radiusMm: 1.5 } });

    clickAria(target, `删除分组 ${manual.groups[0]?.title} 及其条目`);
    await flush();
    expect(manualSpec(session).groups).toHaveLength(0);
    expect(manualSpec(session).items).toHaveLength(0);
    clickText(target, '新增分组');
    await flush();
    clickText(target, '新增条目');
    await flush();
    const item = manualSpec(session).items[0];
    if (item === undefined) throw new Error('Expected manual item');
    clickAria(target, `删除图例项 ${item.label}`);
    await flush();
    expect(manualSpec(session).items).toHaveLength(0);
    expect(manualSpec(session).groups).toHaveLength(1);
    adapter.destroy();
  });

  it('hides automatic groups/items without deleting their source overrides across regeneration', async () => {
    const { adapter, session, target } = setup();
    clickText(target, '4 手动图例');
    clickAria(target, '从输出隐藏图例项 目标点');
    await flush();
    expect(manualSpec(session).items.find((item) => item.id === 'point')).toMatchObject({ sourceKey: 'source:point', visible: false });
    expect(manualSpec(session).items).toHaveLength(3);

    clickAria(target, '从输出隐藏分组 第一组');
    await flush();
    expect(manualSpec(session).groups.find((group) => group.id === 'g1')).toMatchObject({ visible: false });
    expect(manualSpec(session).items.filter((item) => item.groupId === 'g1')).toHaveLength(2);
    clickText(target, '3 自动图例');
    clickText(target, '重新扫描');
    await flush();
    expect(manualSpec(session).groups.find((group) => group.id === 'g1')).toMatchObject({ visible: false });
    expect(manualSpec(session).items.find((item) => item.id === 'point')).toMatchObject({ visible: false, sourceKey: 'source:point' });
    adapter.destroy();
  });

  it('merges an automatic source by semantic identity when its style fingerprint changes', async () => {
    const session = new FakeSession();
    const current = manualSpec(session);
    session.spec = {
      ...session.spec!,
      legend: {
        ...current,
        items: current.items.map((item) => (item.id === 'point' ? { ...item, label: '已编辑目标', sourceKey: 'source:point|style:old' } : item))
      }
    };
    session.legendResult = {
      ...legendFixture(),
      items: legendFixture().items.map((item) =>
        item.id === 'point'
          ? {
              ...item,
              id: 'point-new-style',
              sourceKey: 'source:point|style:new',
              symbol: { kind: 'point', radiusMm: 2, fill: { color: '#22c55e' } }
            }
          : item
      )
    };
    const { adapter, target } = setup(session);
    clickText(target, '4 手动图例');

    expect(allByAria(target, '图例名称').filter((field) => field.value === '已编辑目标')).toHaveLength(1);
    const label = allByAria(target, '图例名称').find((field) => field.value === '已编辑目标')!;
    label.value = '样式变化后的目标';
    label.dispatch('change');
    await flush();

    const matches = manualSpec(session).items.filter((item) => item.sourceKey?.startsWith('source:point') === true);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ label: '样式变化后的目标', sourceKey: 'source:point|style:new' });
    expect(matches[0]?.symbol).toMatchObject({ kind: 'point', fill: { color: '#22c55e' } });
    adapter.destroy();
  });

  it('renders semantic point/line/polygon/icon swatches and lists every paper legend item', () => {
    const session = new FakeSession();
    const symbols = [
      { kind: 'point' as const, radiusMm: 1, fill: { color: '#f00' } },
      { kind: 'line' as const, stroke: { color: '#0f0', widthMm: 0.4, dashMm: [1, 1] } },
      { kind: 'polygon' as const, fill: { color: 'rgba(0,0,255,.4)' }, stroke: { color: '#00f', widthMm: 0.2 } },
      { kind: 'icon' as const, src: 'https://example.test/icon.png', size: [10, 10] as const, anchor: [0.5, 0.5] as const }
    ];
    session.legendResult = {
      groups: [{ id: 'all', title: '全部符号' }],
      items: Array.from({ length: 8 }, (_, index) => ({
        id: `item-${index}`,
        groupId: 'all',
        label: `条目 ${index + 1}`,
        symbol: symbols[index % symbols.length]!
      })),
      sourceRevision: 1,
      warnings: []
    };
    const { adapter, target } = setup(session);
    clickText(target, '3 自动图例');
    for (const kind of ['point', 'line', 'polygon', 'icon']) expect(byClass(target, `ol-print-symbol-swatch--${kind}`)).toBeDefined();
    expect(allText(target)).toContain('条目 8');
    expect(allText(target)).toContain('共 8 项');
    expect(allText(byClass(target, 'ol-print-paper__header-date'))).toBe('日期：2026-07-23');
    expect(allText(byClass(target, 'ol-print-paper__header-issuer'))).toBe('');
    const css = readFileSync('src/assets/style/print.scss', 'utf8');
    expect(css).toMatch(/\.ol-print-paper__legend\s*\{[^}]*max-height:[^;]+;[^}]*overflow:\s*auto;/s);
    expect(css).toMatch(/\.ol-print-paper__header-metadata\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end;[^}]*white-space:\s*nowrap;/s);
    expect(css).toMatch(/\.ol-print-paper__titles\s*\{[^}]*margin-bottom:\s*var\(--ol-print-paper-title-gap\)/s);
    expect(css).toMatch(/\.ol-print-paper__map\s*\{[^}]*margin-bottom:\s*var\(--ol-print-paper-footer-gap\)/s);
    adapter.destroy();
  });

  it('omits singleton counts only from the paper preview legend', () => {
    const session = new FakeSession();
    session.legendResult = {
      groups: [{ id: 'targets', title: '目标' }],
      items: [
        { id: 'single', groupId: 'targets', label: '医院', count: 1, symbol: { kind: 'point' } },
        { id: 'merged', groupId: 'targets', label: '学校', count: 2, symbol: { kind: 'point' } }
      ],
      sourceRevision: 1,
      warnings: []
    };
    const { adapter, target } = setup(session);

    const paperLegend = byClass(target, 'ol-print-paper__legend');
    expect(allText(paperLegend)).toContain('医院');
    expect(allText(paperLegend)).not.toContain('医院 (1)');
    expect(allText(paperLegend)).toContain('学校 (2)');
    clickText(target, '3 自动图例');
    expect(allText(target)).toContain('医院 · 1');

    adapter.destroy();
  });

  it('marks caller targets as embedded and ships relative sizing plus explicit preview-mode CSS', () => {
    const { adapter, session, target } = setup(undefined, true);
    const dialog = byClass(target, 'ol-print-dialog');
    expect(dialog.classList.contains('ol-print-dialog--embedded')).toBe(true);
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(byClass(target, 'ol-print-dialog__preview-stage')).toBeDefined();
    const css = readFileSync('src/assets/style/print.scss', 'utf8');
    expect(css).toMatch(/\.ol-print-dialog--embedded\s*\{[^}]*position:\s*relative;[^}]*height:[^;]+;[^}]*min-height:/s);
    expect(css).toMatch(/\.ol-print-dialog__preview--actual/);
    expect(css).toMatch(/\.ol-print-paper--actual/);
    expect(css).toMatch(/\.dark \.ol-print-dialog/);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(css).toMatch(/\.ol-print-paper\s*\{[^}]*color:\s*#111;[^}]*background:\s*#fff;/s);

    let stage = byClass(target, 'ol-print-dialog__preview-stage');
    stage.clientWidth = 600;
    stage.clientHeight = 200;
    FakeResizeObserver.instances.at(-1)?.trigger();
    let paper = byClass(target, 'ol-print-paper--fit');
    expect(Number.parseFloat(paper.style.width) / Number.parseFloat(paper.style.height)).toBeCloseTo(297 / 210, 6);
    expect(Number.parseFloat(paper.style.height)).toBeLessThanOrEqual(200);

    session.plan = undefined;
    const direction = fieldControl(target, '方向');
    direction.value = 'portrait';
    direction.dispatch('change');
    stage = byClass(target, 'ol-print-dialog__preview-stage');
    stage.clientWidth = 200;
    stage.clientHeight = 600;
    FakeResizeObserver.instances.at(-1)?.trigger();
    paper = byClass(target, 'ol-print-paper--fit');
    expect(Number.parseFloat(paper.style.width) / Number.parseFloat(paper.style.height)).toBeCloseTo(210 / 297, 6);
    expect(Number.parseFloat(paper.style.width)).toBeLessThanOrEqual(200);
    adapter.destroy();
  });

  it('starts at a 40/60 split and resizes the two panes with pointer or keyboard within minimum widths', () => {
    const { adapter, target } = setup();
    const dialog = byClass(target, 'ol-print-dialog');
    const splitter = byClass(target, 'ol-print-dialog__splitter');
    expect(splitter.getAttribute('role')).toBe('separator');
    expect(splitter.getAttribute('aria-valuenow')).toBe('40');
    expect(splitter.getAttribute('aria-valuemin')).toBe('35');
    expect(splitter.getAttribute('aria-valuemax')).toBe('69.2');
    expect(splitter.dispatch('pointerdown', { clientX: 720, pointerId: 7 }).defaultPrevented).toBe(true);
    splitter.dispatch('pointerup', { clientX: 720, pointerId: 7 });
    expect(dialog.style['--ol-print-input-ratio']).toBe('60%');
    expect(splitter.getAttribute('aria-valuenow')).toBe('60');
    expect(splitter.dispatch('keydown', { key: 'ArrowLeft' }).defaultPrevented).toBe(true);
    expect(dialog.style['--ol-print-input-ratio']).toBe('58%');
    splitter.dispatch('keydown', { key: 'Home' });
    expect(Number(splitter.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(35);

    splitter.dispatch('keydown', { key: 'End' });
    const workspace = byClass(target, 'ol-print-dialog__workspace');
    workspace.clientWidth = 820;
    FakeResizeObserver.instances.at(-1)?.trigger();
    splitter.dispatch('keydown', { key: 'Home' });
    expect(dialog.style['--ol-print-input-ratio']).toBe('51.2%');
    expect(splitter.getAttribute('aria-valuemin')).toBe('51.2');
    expect(splitter.getAttribute('aria-valuenow')).toBe('51.2');

    workspace.clientWidth = 700;
    FakeResizeObserver.instances.at(-1)?.trigger();
    expect(Number(splitter.getAttribute('aria-valuenow'))).toBe(50);
    expect(Number(splitter.getAttribute('aria-valuemax'))).toBe(50);
    expect(dialog.style['--ol-print-input-ratio']).toBe('51.2%');

    workspace.clientWidth = 1200;
    FakeResizeObserver.instances.at(-1)?.trigger();
    expect(dialog.style['--ol-print-input-ratio']).toBe('51.2%');
    expect(splitter.getAttribute('aria-valuenow')).toBe('51.2');

    const css = readFileSync('src/assets/style/print.scss', 'utf8');
    expect(css).toMatch(/--ol-print-input-ratio:\s*40%/);
    expect(css).toMatch(/grid-template-columns:\s*minmax\(420px, var\(--ol-print-input-ratio\)\) 10px minmax\(360px, 1fr\)/);
    expect(css).toMatch(/@container ol-print-dialog \(max-width: 800px\)[\s\S]*\.ol-print-dialog__splitter\s*\{[^}]*display:\s*none;/s);
    expect(css).toMatch(/\.ol-print-dialog__preview-stage\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s);
    expect(css).toMatch(/\.ol-print-paper--fit\s*\{[^}]*flex:\s*0 0 auto;[^}]*max-height:\s*100%;/s);
    const observer = FakeResizeObserver.instances.at(-1);
    adapter.destroy();
    expect(observer?.disconnected).toBe(true);
  });

  it('keeps the primary action area outside the independently scrolling body on all five screens', () => {
    const { adapter, target } = setup();
    for (const [step, expectedAction] of [
      ['1 版式设置', '下一步：选择范围'],
      ['2 范围选择', '下一步：自动图例'],
      ['3 自动图例', '下一步：手动图例'],
      ['4 手动图例', '下一步：预览导出'],
      ['5 预览导出', '浏览器打印']
    ] as const) {
      clickText(target, step);
      const content = byClass(target, 'ol-print-dialog__content');
      const directElements = content.children.filter((child): child is FakeElement => child instanceof FakeElement);
      expect(directElements).toHaveLength(2);
      expect(directElements[0]?.classList.contains('ol-print-dialog__scroll')).toBe(true);
      expect(directElements[1]?.classList.contains('ol-print-actions--footer')).toBe(true);
      expect(allText(directElements[1]!)).toContain(expectedAction);
    }
    const css = readFileSync('src/assets/style/print.scss', 'utf8');
    expect(css).toMatch(/\.ol-print-dialog__content\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.ol-print-dialog__scroll\s*\{[^}]*gap:\s*18px;[^}]*padding:\s*22px;[^}]*overflow:\s*auto;/s);
    expect(css).toMatch(/\.ol-print-actions--footer\s*\{[^}]*flex:\s*0 0 auto;/s);
    adapter.destroy();
  });

  it('keeps the desktop box-selection preview and exposes the map without narrow-preview controls', async () => {
    const { adapter, target } = setup();
    const range = fieldControl(target, '范围来源');
    range.value = 'box';
    range.dispatch('change');
    clickText(target, '2 范围选择');
    const dialog = byClass(target, 'ol-print-dialog');
    expect(dialog.classList.contains('is-selecting')).toBe(true);
    expect(allText(target)).not.toContain('窄屏预览');
    expect(allText(target)).not.toContain('展开成品预览');
    expect(allText(target)).not.toContain('收起成品预览');
    clickText(target, '开始框选');
    expect(byClass(target, 'ol-print-dialog__workspace')).toBeDefined();
    expect(byClass(target, 'ol-print-dialog__content')).toBeDefined();
    expect(byClass(target, 'ol-print-dialog__preview')).toBeDefined();

    const css = readFileSync('src/assets/style/print.scss', 'utf8');
    expect(css).toMatch(/\.ol-print-dialog\.is-selecting \.ol-print-dialog__workspace\s*\{[^}]*background:\s*transparent;/s);
    expect(css).toMatch(/\.ol-print-dialog\.is-selecting \.ol-print-dialog__preview\s*\{[^}]*background:\s*var\(--ol-print-bg\);/s);
    expect(css).toMatch(
      /@container ol-print-dialog \(max-width: 800px\)[\s\S]*\.ol-print-dialog\.is-selecting \.ol-print-dialog__content\s*\{[^}]*position:\s*absolute;/s
    );
    expect(css).toMatch(
      /@container ol-print-dialog \(max-width: 800px\)[\s\S]*\.ol-print-dialog\.is-selecting \.ol-print-dialog__preview\s*\{[^}]*display:\s*none;/s
    );
    expect(css).toMatch(
      /\.ol-print-dialog\.is-selecting \.ol-print-dialog__content\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*pointer-events:\s*none;/s
    );
    expect(css).toMatch(/\.ol-print-dialog\.is-selecting \.ol-print-dialog__scroll\s*\{[^}]*max-height:\s*min\(360px, 45%\);[^}]*pointer-events:\s*auto;/s);
    expect(css).toMatch(/\.ol-print-dialog\.is-selecting \.ol-print-actions--footer\s*\{[^}]*margin-top:\s*auto;[^}]*pointer-events:\s*auto;/s);
    expect(css).toMatch(/\.ol-print-dialog\.is-selecting \.ol-print-actions--footer\s*\{[^}]*box-shadow:\s*none;/s);
    expect(css).toMatch(/\.ol-print-dialog__content\s*\{[^}]*container:\s*ol-print-input \/ inline-size;/s);
    expect(css).toMatch(/@container ol-print-input \(max-width: 560px\)[\s\S]*\.ol-print-legend-editor__group-row,[\s\S]*flex-wrap:\s*wrap;/s);
    expect(css).not.toContain('is-selection-preview-expanded');
    expect(css).toMatch(/min-height:\s*520px;[\s\S]*min-width:\s*300px;/);
    expect(css).toMatch(/\.ol-print-paper--fit\s*\{[^}]*max-width:\s*100%;[^}]*max-height:/s);
    const selectionBoxRule = [...css.matchAll(/\.ol-print-selection-box\s*\{([^}]*)\}/g)].at(-1)?.[1] ?? '';
    expect(selectionBoxRule).toMatch(/border:\s*2px solid #1677ff/);
    expect(selectionBoxRule).not.toMatch(/background|box-shadow/);
    expect(css).toMatch(/\.ol-print-selection-output\s*\{[^}]*border:\s*2px dashed[^}]*pointer-events:\s*none;/s);
    await flush();
    adapter.destroy();
  });

  it('traps modal focus, closes with Escape outside selection and restores the prior focus', () => {
    const outside = new FakeElement('button');
    outside.focus();
    const modal = setup();
    const root = byClass(modal.target, 'ol-print-dialog');
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-modal')).toBe('true');
    const focusable = descendants(root).filter((element) => ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) && !element.disabled);
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    first.focus();
    expect(root.dispatch('keydown', { key: 'Tab', shiftKey: true }).defaultPrevented).toBe(true);
    expect(fakeDocument.activeElement).toBe(last);
    expect(root.dispatch('keydown', { key: 'Tab' }).defaultPrevented).toBe(true);
    expect(fakeDocument.activeElement).toBe(first);

    modal.session.status = 'selecting';
    expect(root.dispatch('keydown', { key: 'Escape' }).defaultPrevented).toBe(false);
    expect(modal.adapter.status).toBe('open');
    modal.session.status = 'ready';
    expect(root.dispatch('keydown', { key: 'Escape' }).defaultPrevented).toBe(true);
    expect(modal.adapter.status).toBe('closed');
    expect(fakeDocument.activeElement).toBe(outside);
    expect(modal.session.cancel).toHaveBeenCalledTimes(1);

    outside.focus();
    const embedded = setup(undefined, true);
    const embeddedRoot = byClass(embedded.target, 'ol-print-dialog');
    expect(embeddedRoot.dispatch('keydown', { key: 'Tab' }).defaultPrevented).toBe(false);
    expect(fakeDocument.activeElement).toBe(outside);
    embedded.adapter.destroy();
  });

  it('removes the UI when the session is cancelled or destroyed programmatically', async () => {
    const cancelledDestroy = vi.fn();
    const cancelled = setup(new FakeSession(), false, cancelledDestroy);
    cancelled.session.preview.mockClear();
    cancelled.session.status = 'cancelled';
    cancelled.session.emit('cancel', { type: 'cancel', revision: 2 });
    await vi.advanceTimersByTimeAsync(500);
    expect(cancelled.adapter.status).toBe('closed');
    expect(descendants(cancelled.target).some((element) => element.classList.contains('ol-print-dialog'))).toBe(false);
    expect(cancelled.session.cancel).not.toHaveBeenCalled();
    expect(cancelled.session.preview).not.toHaveBeenCalled();
    expect(cancelledDestroy).toHaveBeenCalledTimes(1);
    cancelled.adapter.close();
    expect(cancelledDestroy).toHaveBeenCalledTimes(1);

    const destroyedDestroy = vi.fn();
    const destroyed = setup(new FakeSession(), false, destroyedDestroy);
    destroyed.session.preview.mockClear();
    destroyed.session.status = 'destroyed';
    destroyed.session.emit('statuschange', { type: 'statuschange', status: 'destroyed', revision: 3 });
    await vi.advanceTimersByTimeAsync(500);
    expect(destroyed.adapter.status).toBe('destroyed');
    expect(descendants(destroyed.target).some((element) => element.classList.contains('ol-print-dialog'))).toBe(false);
    expect(destroyed.session.destroy).not.toHaveBeenCalled();
    expect(destroyed.session.preview).not.toHaveBeenCalled();
    expect(destroyedDestroy).toHaveBeenCalledTimes(1);
    destroyed.adapter.destroy();
    expect(destroyedDestroy).toHaveBeenCalledTimes(1);
  });

  it('debounces a new preview for validation revision changes and ignores cancelled operation errors', async () => {
    const { adapter, session, target } = setup();
    session.preview.mockClear();
    session.validation = validationFixture(2);
    session.emit('validationchange', { type: 'validationchange', validation: session.validation, revision: 2 });
    session.emit('validationchange', { type: 'validationchange', validation: session.validation, revision: 2 });
    await vi.advanceTimersByTimeAsync(159);
    expect(session.preview).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(session.preview).toHaveBeenCalledTimes(1);

    session.emit('error', { type: 'error', error: new PrintError('cancelled', '迟到任务已取消'), revision: 2 });
    expect(allText(target)).not.toContain('迟到任务已取消');
    adapter.destroy();
  });

  it('labels stale revisions, keeps resource retry enabled and never relabels an old draft as final after failure', async () => {
    const { adapter, session, target } = setup();
    await vi.advanceTimersByTimeAsync(160);
    await flush();
    expect(allText(target)).toContain('当前显示 r1 草稿预览');

    session.preview.mockRejectedValueOnce(new PrintError('resource-load-failed', '字体尚未就绪'));
    session.validation = validationFixture(2, {
      issues: [{ code: 'resource-not-ready', message: '字体尚未就绪' }],
      canPreview: false,
      canExport: false
    });
    session.emit('validationchange');
    expect(allText(target)).toContain('正在更新至 r2');
    expect(allText(target)).toContain('旧版本');
    clickText(target, '5 预览导出');
    await flush();
    expect(allText(target)).toContain('更新失败：资源加载失败：字体尚未就绪');
    expect(allText(target)).toContain('当前显示 r1 草稿预览（继续显示旧版本）');
    expect(buttonText(target, '重试资源并刷新').disabled).toBe(false);
    expect(buttonText(target, '导出 PNG').disabled).toBe(true);

    session.preview.mockResolvedValueOnce({
      blob: new Blob(['final'], { type: 'image/png' }),
      widthPx: 1200,
      heightPx: 848,
      revision: 2,
      plan: session.plan!,
      validation: session.validation
    });
    clickText(target, '重试资源并刷新');
    await flush();
    expect(allText(target)).toContain('当前显示 r2 最终预览');
    adapter.destroy();
  });

  it('promotes final preview over pending or late draft work and schedules final on screen-5 revisions', async () => {
    const { adapter, session, target } = setup();
    await vi.advanceTimersByTimeAsync(160);
    await flush();
    session.preview.mockClear();

    const title = fieldControl(target, '主标题');
    title.value = '触发新版本';
    title.dispatch('input');
    await vi.advanceTimersByTimeAsync(120);
    clickText(target, '5 预览导出');
    await flush();
    await vi.advanceTimersByTimeAsync(200);
    expect(session.preview.mock.calls.map(([options]) => options?.quality)).toEqual(['final']);

    session.preview.mockClear();
    session.validation = validationFixture(3);
    session.emit('validationchange');
    await vi.advanceTimersByTimeAsync(160);
    await flush();
    expect(session.preview.mock.calls.map(([options]) => options?.quality)).toEqual(['final']);

    let resolveDraft: ((value: Awaited<ReturnType<FakeSession['preview']>>) => void) | undefined;
    session.preview.mockImplementation(({ quality } = {}) => {
      if (quality === 'draft') return new Promise((resolve) => (resolveDraft = resolve));
      return Promise.resolve({
        blob: new Blob(['final'], { type: 'image/png' }),
        widthPx: 1200,
        heightPx: 848,
        revision: 3,
        plan: session.plan!,
        validation: validationFixture(4)
      });
    });
    clickText(target, '1 版式设置');
    const subtitle = fieldControl(target, '副标题');
    subtitle.value = '迟到草稿';
    subtitle.dispatch('input');
    await vi.advanceTimersByTimeAsync(280);
    expect(resolveDraft).toBeDefined();
    clickText(target, '5 预览导出');
    await flush();
    resolveDraft?.({
      blob: new Blob(['late-draft'], { type: 'image/png' }),
      widthPx: 1200,
      heightPx: 848,
      revision: 3,
      plan: session.plan!,
      validation: validationFixture(4)
    });
    await flush();
    expect(allText(target)).toContain('当前显示 r3 最终预览');
    adapter.destroy();
  });
});

function setup(
  session = new FakeSession(),
  embedded = false,
  onDestroy?: () => void
): { adapter: PrintDialogAdapter; session: FakeSession; target: FakeElement } {
  const target = new FakeElement('div');
  const adapter = new PrintDialogAdapter({
    session: session as never,
    target: target as unknown as HTMLElement,
    capabilities: { pdf: true, browserPrint: true, limits: { minDpi: 72, maxDpi: 600 } },
    embedded,
    ...(onDestroy === undefined ? {} : { onDestroy })
  });
  return { adapter, session, target };
}

function initialSpec(): PrintSpec {
  const legend = legendFixture();
  return {
    range: { source: { mode: 'view' }, scale: { mode: 'fit' } },
    paper: { size: 'A4', orientation: 'landscape', marginMm: 10, dpi: 150 },
    layout: { classification: '内部', title: '初始标题', subtitle: '专题地图', date: '2026-07-23', issuer: '' },
    legend: { mode: 'manual', groups: legend.groups, items: legend.items },
    content: { animations: 'current-frame', domOverlays: 'exclude', controls: 'exclude' }
  };
}

function legendFixture(): PrintLegendResult {
  return {
    groups: [
      { id: 'g1', title: '第一组', order: 0 },
      { id: 'g2', title: '第二组', order: 1 }
    ],
    items: [
      {
        id: 'point',
        groupId: 'g1',
        label: '目标点',
        order: 0,
        sourceKey: 'source:point',
        symbol: { kind: 'point', radiusMm: 1.5, fill: { color: '#ff0000' }, stroke: { color: '#111111', widthMm: 0.25 } }
      },
      { id: 'line', groupId: 'g1', label: '道路', order: 1, symbol: { kind: 'line', stroke: { color: '#0000ff', widthMm: 0.5 } } },
      { id: 'area', groupId: 'g2', label: '区域', order: 0, symbol: { kind: 'polygon', fill: { color: '#00ff00' } } }
    ],
    sourceRevision: 1,
    warnings: []
  };
}

function emptyLegendFixture(): PrintLegendResult {
  return { groups: [], items: [], sourceRevision: 1, warnings: [] };
}

function planFixture() {
  return {
    revision: 1,
    pageSizeMm: [297, 210] as const,
    mapFrameMm: { x: 10, y: 35, width: 277, height: 145 },
    outputSizePx: [1200, 848] as const,
    dpi: 150,
    range: {
      sourceMode: 'view' as const,
      sourceExtent: [0, 0, 100, 100] as const,
      actualExtent: [0, 0, 100, 100] as const,
      footprint: [
        [0, 100],
        [100, 100],
        [100, 0],
        [0, 0]
      ] as const,
      center: [50, 50] as const,
      rotation: 0,
      denominator: 10000,
      resolution: 1
    }
  };
}

function validationFixture(
  revision: number,
  patch: Partial<Pick<PrintValidationReport, 'issues' | 'warnings' | 'canPreview' | 'canExport'>> = {}
): PrintValidationReport {
  return {
    revision,
    issues: patch.issues ?? [],
    warnings: patch.warnings ?? [],
    canPreview: patch.canPreview ?? true,
    canExport: patch.canExport ?? true
  };
}

function manualSpec(session: FakeSession): Extract<NonNullable<PrintSpec['legend']>, { mode: 'manual' }> {
  const legend = session.spec?.legend;
  if (legend?.mode !== 'manual') throw new Error('Expected manual legend');
  return legend;
}

function descendants(root: FakeElement): FakeElement[] {
  const result: FakeElement[] = [];
  for (const child of root.children) {
    if (!(child instanceof FakeElement)) continue;
    result.push(child, ...descendants(child));
  }
  return result;
}

function allText(root: FakeElement | FakeText): string {
  if (root instanceof FakeText) return root.data;
  return `${root.textContent ?? ''}${root.children.map(allText).join('')}`;
}

function byAria(root: FakeElement, label: string): FakeElement {
  const result = descendants(root).find((element) => element.getAttribute('aria-label') === label);
  if (result === undefined) throw new Error(`Missing aria-label: ${label}`);
  return result;
}

function allByAria(root: FakeElement, label: string): FakeElement[] {
  return descendants(root).filter((element) => element.getAttribute('aria-label') === label);
}

function byClass(root: FakeElement, className: string): FakeElement {
  const result = descendants(root).find((element) => element.classList.contains(className));
  if (result === undefined) throw new Error(`Missing class: ${className}`);
  return result;
}

function buttonText(root: FakeElement, text: string): FakeElement {
  const result = descendants(root).find((element) => element.tagName === 'BUTTON' && allText(element) === text);
  if (result === undefined) throw new Error(`Missing button: ${text}`);
  return result;
}

function clickText(root: FakeElement, text: string): void {
  buttonText(root, text).click();
}

function clickAria(root: FakeElement, label: string): void {
  byAria(root, label).click();
}

function fieldControl(root: FakeElement, label: string): FakeElement {
  const field = descendants(root).find((element) => element.classList.contains('ol-print-field') && allText(element).startsWith(label));
  const control = field?.children.find((child): child is FakeElement => child instanceof FakeElement && ['INPUT', 'SELECT'].includes(child.tagName));
  if (control === undefined) throw new Error(`Missing field: ${label}`);
  return control;
}

function symbolFieldControl(root: FakeElement, itemLabel: string, label: string): FakeElement {
  const editor = descendants(root).find(
    (element) =>
      element.tagName === 'FIELDSET' &&
      element.children.some((child) => child instanceof FakeElement && child.tagName === 'LEGEND' && allText(child) === `${itemLabel} 的符号`)
  );
  if (editor === undefined) throw new Error(`Missing symbol editor: ${itemLabel}`);
  return fieldControl(editor, label);
}

async function flush(turns = 2): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}
