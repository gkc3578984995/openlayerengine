import type OlMap from 'ol/Map.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransformToolbarAdapter } from '../src/adapters/dom/TransformToolbarAdapter.js';
import { transformToolbarIcons } from '../src/adapters/dom/transformToolbarIcons.js';
import { TransformTooltipAdapter } from '../src/adapters/dom/TransformTooltipAdapter.js';
import type { TransformToolbarViewEvent, TransformToolbarViewSpec } from '../src/core/ports/TransformToolbarPort.js';

interface OverlayRecord {
  element: HTMLElement | undefined;
  offset: number[];
  position: number[] | undefined;
  readonly positioning: string | undefined;
  readonly stopEvent: boolean | undefined;
  readonly insertFirst: boolean | undefined;
  readonly className: string | undefined;
  disposed: boolean;
  setElement(value: HTMLElement | undefined): void;
  setOffset(value: number[]): void;
  setPosition(value: number[] | undefined): void;
  dispose(): void;
}

const overlayHarness = vi.hoisted(() => ({ instances: [] as OverlayRecord[] }));
const unByKey = vi.hoisted(() => vi.fn());

vi.mock('ol/Overlay.js', () => {
  class FakeOverlay implements OverlayRecord {
    element: HTMLElement | undefined;
    offset: number[];
    position: number[] | undefined;
    readonly positioning: string | undefined;
    readonly stopEvent: boolean | undefined;
    readonly insertFirst: boolean | undefined;
    readonly className: string | undefined;
    disposed = false;

    constructor(options: Record<string, unknown>) {
      this.element = options.element as HTMLElement | undefined;
      this.offset = [...((options.offset as number[] | undefined) ?? [0, 0])];
      this.positioning = options.positioning as string | undefined;
      this.stopEvent = options.stopEvent as boolean | undefined;
      this.insertFirst = options.insertFirst as boolean | undefined;
      this.className = options.className as string | undefined;
      overlayHarness.instances.push(this);
    }

    setElement(value: HTMLElement | undefined): void {
      this.element = value;
    }

    setOffset(value: number[]): void {
      this.offset = [...value];
    }

    setPosition(value: number[] | undefined): void {
      this.position = value === undefined ? undefined : [...value];
    }

    dispose(): void {
      this.disposed = true;
    }
  }

  return { default: FakeOverlay };
});

vi.mock('ol/Observable.js', () => ({ unByKey }));

describe('TransformToolbarAdapter', () => {
  it('使用旧版 SVG 与类名渲染，并维护 disabled 和 active 状态', () => {
    const documentTarget = new FakeDocument();
    installDomGlobals(documentTarget);
    const map = new FakeMap();
    const events: TransformToolbarViewEvent[] = [];
    const view = new TransformToolbarAdapter(map as unknown as OlMap).open(toolbarSpec(), (event) => events.push(event));
    const overlay = requireOverlay(0);
    const root = requireRoot(overlay);
    const edit = findCommand(root, 'edit');
    const remove = findCommand(root, 'remove');

    expect(root.className).toBe('ol-toolbar legacy-transform-toolbar');
    expect(root.dataset.ownerId).toBe('transform-owner');
    expect(edit.className.split(' ')).toEqual(expect.arrayContaining(['ol-toolbar-item', 'toolbar-edit', 'is-active']));
    expect(edit.innerHTML).toBe(transformToolbarIcons.edit);
    expect(edit.innerHTML).toContain('viewBox="0 0 1024 1024"');
    expect(remove.className.split(' ')).toEqual(expect.arrayContaining(['ol-toolbar-item', 'toolbar-remove', 'is-disabled']));
    expect(remove.disabled).toBe(true);
    expect(overlay).toMatchObject({ positioning: 'bottom-left', stopEvent: true, insertFirst: false, position: [120, 30], offset: [15, 0] });

    remove.dispatch('click');
    expect(events).toEqual([]);

    view.setActive('remove');
    expect(findCommand(root, 'edit').className).not.toContain('is-active');
    expect(findCommand(root, 'remove').className).toContain('is-active');
    view.updateItem('remove', { disabled: false });
    const enabledRemove = findCommand(root, 'remove');
    expect(enabledRemove.disabled).toBe(false);
    expect(enabledRemove.className).not.toContain('is-disabled');
    enabledRemove.dispatch('click');
    expect(events).toEqual([{ type: 'command', key: 'remove' }]);

    view.destroy();
  });

  it('派发 click、enter、leave 事件，并在销毁时解除监听和移除 DOM/Overlay', () => {
    const documentTarget = new FakeDocument();
    installDomGlobals(documentTarget);
    const map = new FakeMap();
    const listener = vi.fn<(event: TransformToolbarViewEvent) => void>();
    const view = new TransformToolbarAdapter(map as unknown as OlMap).open(toolbarSpec(), listener);
    const overlay = requireOverlay(0);
    const root = requireRoot(overlay);
    const edit = findCommand(root, 'edit');

    edit.dispatch('mouseover');
    edit.dispatch('mouseout');
    edit.dispatch('click');
    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      { type: 'enter', key: 'edit' },
      { type: 'leave', key: 'edit' },
      { type: 'command', key: 'edit' }
    ]);

    view.hide();
    expect(root.hidden).toBe(true);
    view.show();
    expect(root.hidden).toBe(false);
    view.updateOptions({ position: [80, 45], offset: [8, 4], className: 'updated-toolbar' });
    expect(overlay.position).toEqual([80, 45]);
    expect(overlay.offset).toEqual([8, 4]);
    expect(root.className).toBe('ol-toolbar updated-toolbar');

    view.destroy();
    expect(unByKey).toHaveBeenCalledOnce();
    expect(map.removedOverlays).toEqual([overlay]);
    expect(overlay.element).toBeUndefined();
    expect(overlay.disposed).toBe(true);
    expect(root.removeCalls).toBe(1);
    expect(root.listenerCount('click')).toBe(0);
    expect(root.listenerCount('mouseover')).toBe(0);
    expect(root.listenerCount('mouseout')).toBe(0);

    edit.dispatch('click');
    view.destroy();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(map.removedOverlays).toHaveLength(1);
  });
});

describe('TransformTooltipAdapter', () => {
  it('渲染中文多行提示，并随状态更新位置、偏移和可见性', () => {
    const documentTarget = new FakeDocument();
    installDomGlobals(documentTarget);
    const map = new FakeMap();
    const view = new TransformTooltipAdapter(map as unknown as OlMap).open({
      ownerId: 'transform-owner',
      position: [10, 20],
      lines: ['拖动控制点进行缩放', '按住 Shift 保持比例'],
      offset: [12, 6],
      visible: true
    });
    const overlay = requireOverlay(0);
    const root = requireRoot(overlay);

    expect(root.className).toBe('ol-tooltip ol-transform-tooltip');
    expect(root.dataset.ownerId).toBe('transform-owner');
    expect(root.children.map((child) => ({ className: child.className, text: child.textContent }))).toEqual([
      { className: 'ol-transform-tooltip-line', text: '拖动控制点进行缩放' },
      { className: 'ol-transform-tooltip-line', text: '按住 Shift 保持比例' }
    ]);
    expect(overlay).toMatchObject({
      className: 'ol-overlay-container ol-transform-tooltip-overlay',
      positioning: 'bottom-left',
      stopEvent: false,
      insertFirst: false,
      position: [10, 20],
      offset: [12, 6]
    });
    expect(root.style.pointerEvents).toBe('none');
    expect(root.hidden).toBe(false);

    view.update({ position: [31, 42], lines: ['旋转 45°'], offset: [18, 9] });
    expect(overlay.position).toEqual([31, 42]);
    expect(overlay.offset).toEqual([18, 9]);
    expect(root.children.map((child) => child.textContent)).toEqual(['旋转 45°']);
    view.hide();
    expect(root.hidden).toBe(true);
    view.show();
    expect(root.hidden).toBe(false);

    view.destroy();
  });

  it('销毁时移除 Overlay 和 DOM，且后续更新不再生效', () => {
    const documentTarget = new FakeDocument();
    installDomGlobals(documentTarget);
    const map = new FakeMap();
    const view = new TransformTooltipAdapter(map as unknown as OlMap).open({
      ownerId: 'transform-owner',
      position: [10, 20],
      lines: ['移动中'],
      offset: [15, 0],
      visible: true
    });
    const overlay = requireOverlay(0);
    const root = requireRoot(overlay);

    view.destroy();
    expect(map.removedOverlays).toEqual([overlay]);
    expect(overlay.element).toBeUndefined();
    expect(overlay.disposed).toBe(true);
    expect(root.removeCalls).toBe(1);

    view.update({ position: [99, 99], lines: ['不应渲染'] });
    view.show();
    view.destroy();
    expect(overlay.position).toEqual([10, 20]);
    expect(root.children.map((child) => child.textContent)).toEqual(['移动中']);
    expect(map.removedOverlays).toHaveLength(1);
  });
});

function toolbarSpec(): TransformToolbarViewSpec {
  return {
    ownerId: 'transform-owner',
    items: [
      { key: 'edit', title: '编辑', iconClass: 'toolbar-edit', visible: true, disabled: false, active: true },
      { key: 'remove', title: '删除', iconClass: 'toolbar-remove', visible: true, disabled: true, active: false }
    ],
    options: { position: [120, 30], offset: [15, 0], className: 'legacy-transform-toolbar', visible: true }
  };
}

function installDomGlobals(documentTarget: FakeDocument): void {
  vi.stubGlobal('document', documentTarget);
  vi.stubGlobal('Element', FakeDomElement);
  vi.stubGlobal('Node', FakeDomElement);
}

function requireOverlay(index: number): OverlayRecord {
  const overlay = overlayHarness.instances[index];
  if (overlay === undefined) throw new Error(`缺少第 ${index + 1} 个 Overlay`);
  return overlay;
}

function requireRoot(overlay: OverlayRecord): FakeDomElement {
  if (!(overlay.element instanceof FakeDomElement)) throw new Error('Overlay 缺少根元素');
  return overlay.element;
}

function findCommand(root: FakeDomElement, key: string): FakeDomElement {
  const command = root.children.find((child) => child.dataset.transformCommand === key);
  if (command === undefined) throw new Error(`缺少工具栏命令：${key}`);
  return command;
}

interface FakeDomEvent {
  readonly type: string;
  readonly target: FakeDomElement;
  readonly relatedTarget: FakeDomElement | null;
  cancelBubble: boolean;
  stopPropagation(): void;
}

type FakeDomListener = (event: FakeDomEvent) => void;

class FakeDomElement {
  readonly children: FakeDomElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, FakeDomListener[]>();
  parent: FakeDomElement | undefined;
  className = '';
  textContent = '';
  innerHTML = '';
  title = '';
  type = '';
  disabled = false;
  hidden = false;
  removeCalls = 0;

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument
  ) {}

  append(...children: FakeDomElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children: FakeDomElement[]): void {
    for (const child of this.children) child.parent = undefined;
    this.children.length = 0;
    this.append(...children);
  }

  addEventListener(type: string, listener: FakeDomListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: FakeDomListener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((current) => current !== listener)
    );
  }

  dispatch(type: string, init: Partial<Pick<FakeDomEvent, 'target' | 'relatedTarget'>> = {}): void {
    const event: FakeDomEvent = {
      type,
      target: init.target ?? this,
      relatedTarget: init.relatedTarget ?? null,
      cancelBubble: false,
      stopPropagation() {
        this.cancelBubble = true;
      }
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    if (!event.cancelBubble) this.parent?.dispatchExisting(event);
  }

  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }

  closest(selector: string): FakeDomElement | null {
    if (selector === '[data-transform-command]' && this.dataset.transformCommand !== undefined) return this;
    return this.parent?.closest(selector) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  remove(): void {
    this.removeCalls += 1;
    if (this.parent === undefined) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = undefined;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  private dispatchExisting(event: FakeDomEvent): void {
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
    if (!event.cancelBubble) this.parent?.dispatchExisting(event);
  }
}

class FakeDocument {
  createElement(tagName: string): FakeDomElement {
    return new FakeDomElement(tagName, this);
  }
}

class FakeMap {
  readonly addedOverlays: OverlayRecord[] = [];
  readonly removedOverlays: OverlayRecord[] = [];
  readonly view = { on: vi.fn(() => ({ target: 'view' })) };
  readonly on = vi.fn(() => ({ target: 'map' }));

  addOverlay(overlay: OverlayRecord): void {
    this.addedOverlays.push(overlay);
  }

  removeOverlay(overlay: OverlayRecord): void {
    this.removedOverlays.push(overlay);
  }

  getView(): FakeMap['view'] {
    return this.view;
  }
}

beforeEach(() => {
  overlayHarness.instances.length = 0;
  unByKey.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});
