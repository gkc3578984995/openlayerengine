import Feature from 'ol/Feature.js';
import type OlMap from 'ol/Map.js';
import VectorLayer from 'ol/layer/Vector.js';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenuViewAdapter } from '../src/adapters/dom/ContextMenuViewAdapter.js';
import type { ContextMenuViewEvent, ContextMenuViewModel, ContextMenuViewPort } from '../src/core/ports/ContextMenuViewPort.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import { createTransientNativeRef } from '../src/core/native/types.js';
import type { InputEventMap, InputPort, InputType } from '../src/core/ports/InputPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { constructElementHandle, type Element } from '../src/facade/Element.js';
import {
  ContextMenuFacade,
  type ContextMenuItemContext,
  type ContextMenuItemSpec,
  type ContextMenuService as PublicContextMenuService
} from '../src/facade/ContextMenuFacade.js';
import { constructLayerHandle, type Layer } from '../src/facade/Layer.js';
import type { ElementService, LayerService, LayerState } from '../src/facade/types.js';
import { ContextMenuService } from '../src/services/context-menu/ContextMenuService.js';
import type { InternalContextMenuItemContext } from '../src/services/context-menu/types.js';
import { EventService } from '../src/services/events/EventService.js';
import { InputRouter } from '../src/services/events/InputRouter.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

type InputListener = (event: InputEventMap[InputType]) => void;

class FakeInputPort implements InputPort {
  readonly listeners = new Map<InputType, InputListener>();

  listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
    this.listeners.set(type, listener as InputListener);
    return () => this.listeners.delete(type);
  }

  emit<T extends InputType>(type: T, event: InputEventMap[T]): void {
    this.listeners.get(type)?.(event);
  }
}

class FakeContextMenuView implements ContextMenuViewPort {
  model: ContextMenuViewModel | undefined;
  theme: 'light' | 'dark' = 'light';
  readonly calls: string[] = [];
  #listener: ((event: ContextMenuViewEvent) => void) | undefined;

  listen(listener: (event: ContextMenuViewEvent) => void): () => void {
    this.#listener = listener;
    return () => {
      if (this.#listener === listener) this.#listener = undefined;
    };
  }

  show(model: ContextMenuViewModel): void {
    this.model = model;
    this.calls.push('show');
  }

  close(): void {
    this.model = undefined;
    this.calls.push('close');
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    this.calls.push(`theme:${theme}`);
  }

  destroy(): void {
    this.model = undefined;
    this.#listener = undefined;
    this.calls.push('destroy');
  }

  emit(event: ContextMenuViewEvent): void {
    this.#listener?.(event);
  }
}

const nativeEventRef = createTransientNativeRef('input-event');

function element(overrides: Partial<ElementState> = {}): ElementState {
  return {
    id: 'a',
    type: 'point',
    geometry: { type: 'point', controlPoints: [[1, 2]] },
    style: { symbol: { type: 'circle', radius: 5, fill: { type: 'solid', color: '#f00' } } },
    data: { owner: 'first' },
    module: 'vehicle',
    layerId: 'layer-a',
    visible: true,
    ...overrides
  };
}

function setup() {
  const port = new FakeInputPort();
  const router = new InputRouter(port);
  const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
  store.add(element());
  store.add(element({ id: 'b', data: { owner: 'second' }, layerId: 'layer-b' }));
  const events = new EventService(router, store, vi.fn());
  const view = new FakeContextMenuView();
  const reports = vi.fn();
  const menus = new ContextMenuService(events, store, view, reports);
  const rightclick = (elementId?: string): void =>
    port.emit('rightclick', {
      type: 'rightclick',
      coordinate: Object.freeze([10, 20]),
      pixel: Object.freeze([30, 40]),
      ...(elementId === undefined ? {} : { elementId }),
      nativeEventRef
    });
  return { events, menus, port, reports, rightclick, router, store, view };
}

const nestedItems = [
  { key: 'open', label: 'Open', mutexKey: 'close' },
  { key: 'close', label: 'Close', visible: false, mutexKey: 'open' },
  { key: 'tools', label: 'Tools', children: [{ key: 'inspect', label: 'Inspect' }] }
] as const;

describe('ContextMenuService', () => {
  coversCapabilities(
    'contextmenu-default-menu',
    'contextmenu-module-menu',
    'contextmenu-nested-items',
    'contextmenu-disabled-items',
    'contextmenu-before-guard',
    'contextmenu-default-item-state',
    'contextmenu-feature-item-state',
    'contextmenu-mutex-state',
    'contextmenu-theme',
    'contextmenu-map-anchored-position',
    'contextmenu-callback-payload',
    'contextmenu-close-triggers',
    'contextmenu-event-isolation',
    'contextmenu-registration-cleanup',
    'contextmenu-transform-arbitration'
  );

  it('resolves Element, module, and map registrations in priority order and preserves nested items', () => {
    const { menus, rightclick, view } = setup();
    const map = menus.register({ kind: 'map' }, { items: [{ key: 'map', label: 'Map' }] });
    const module = menus.register({ kind: 'module', module: 'vehicle' }, { items: [{ key: 'module', label: 'Module' }] });
    const exact = menus.register({ kind: 'element', elementId: 'a' }, { items: nestedItems });

    rightclick('a');
    expect(view.model).toMatchObject({ coordinate: [10, 20], items: [{ key: 'open' }, { key: 'tools', children: [{ key: 'inspect' }] }] });

    exact.destroy();
    rightclick('a');
    expect(view.model?.items.map(({ key }) => key)).toEqual(['module']);

    module.destroy();
    rightclick('a');
    expect(view.model?.items.map(({ key }) => key)).toEqual(['map']);

    map.destroy();
    rightclick();
    expect(view.model).toBeUndefined();
  });

  it('applies visible, disabled, before, per-Element, default, and mutex state without cross-Element leakage', () => {
    const { menus, reports, rightclick, store, view } = setup();
    const before = vi.fn((context: InternalContextMenuItemContext) => {
      if (context.item.key === 'inspect') throw new Error('permission failed');
      return context.item.key !== 'blocked';
    });
    menus.register(
      { kind: 'module', module: 'vehicle' },
      { items: [...nestedItems, { key: 'blocked', label: 'Blocked' }, { key: 'disabled', label: 'Disabled', disabled: true }], before }
    );
    menus.register({ kind: 'map' }, { items: [{ key: 'measure', label: 'Measure' }] });

    expect(menus.getItemState({ kind: 'element', elementId: 'a' }, 'open')).toEqual({ visible: true, disabled: false });
    menus.setItemState({ kind: 'element', elementId: 'a' }, 'open', { visible: false });
    expect(menus.getItemState({ kind: 'element', elementId: 'a' }, 'open')).toEqual({ visible: false, disabled: false });
    expect(menus.getItemState({ kind: 'element', elementId: 'a' }, 'close')?.visible).toBe(true);
    expect(menus.getItemState({ kind: 'element', elementId: 'b' }, 'open')?.visible).toBe(true);
    expect(menus.toggleItem({ kind: 'element', elementId: 'a' }, 'open').visible).toBe(true);
    expect(menus.getItemState({ kind: 'element', elementId: 'a' }, 'close')?.visible).toBe(false);

    menus.setItemState({ kind: 'map' }, 'measure', { disabled: true });
    expect(menus.getItemState({ kind: 'map' }, 'measure')).toEqual({ visible: true, disabled: true });
    store.add(element({ id: 'map', module: 'other', layerId: 'layer-map' }));
    menus.setItemState({ kind: 'map' }, 'measure', { visible: false });
    store.remove({ id: 'map' });
    expect(menus.getItemState({ kind: 'map' }, 'measure')).toEqual({ visible: false, disabled: true });

    rightclick('a');
    const flat = flatten(view.model?.items ?? []);
    expect(flat.find(({ key }) => key === 'blocked')?.disabled).toBe(true);
    expect(flat.find(({ key }) => key === 'disabled')?.disabled).toBe(true);
    expect(flat.find(({ key }) => key === 'inspect')?.disabled).toBe(true);
    expect(before).toHaveBeenCalled();
    expect(reports).toHaveBeenCalledWith(expect.objectContaining({ message: 'permission failed' }), expect.objectContaining({ operation: 'before' }));
  });

  it('updates mutex state before callback, reports callback failures, and always closes', () => {
    const { menus, reports, rightclick, view } = setup();
    const observed: boolean[] = [];
    menus.register(
      { kind: 'module', module: 'vehicle' },
      {
        items: nestedItems,
        onSelect(context) {
          observed.push(menus.getItemState({ kind: 'element', elementId: context.element?.id ?? '' }, 'open')?.visible ?? true);
          throw new Error('selection failed');
        }
      }
    );

    rightclick('a');
    view.emit({ type: 'select', key: 'open' });

    expect(observed).toEqual([false]);
    expect(menus.getItemState({ kind: 'element', elementId: 'a' }, 'close')?.visible).toBe(true);
    expect(reports).toHaveBeenCalledWith(expect.objectContaining({ message: 'selection failed' }), expect.objectContaining({ operation: 'select' }));
    expect(view.model).toBeUndefined();
  });

  it('replaces registrations safely, clears removed Element state, and disposes every owned subscription', () => {
    const { events, menus, port, rightclick, store, view } = setup();
    const old = menus.register({ kind: 'module', module: 'vehicle' }, { items: [{ key: 'old', label: 'Old' }] });
    menus.setItemState({ kind: 'element', elementId: 'a' }, 'old', { visible: false });
    const current = menus.register({ kind: 'module', module: 'vehicle' }, { items: [{ key: 'new', label: 'New' }] });
    old.destroy();
    rightclick('a');
    expect(view.model?.items.map(({ key }) => key)).toEqual(['new']);

    menus.setItemState({ kind: 'element', elementId: 'a' }, 'new', { visible: false });
    store.remove({ id: 'a' });
    expect(view.model).toBeUndefined();
    expect(() => menus.getItemState({ kind: 'element', elementId: 'a' }, 'new')).toThrow(InvalidArgumentError);

    current.destroy();
    menus.destroy();
    menus.destroy();
    expect(events.has('rightclick')).toBe(false);
    expect(port.listeners.has('rightclick')).toBe(true);
    expect(view.calls.at(-1)).toBe('destroy');
    expect(() => menus.register({ kind: 'map' }, { items: [{ key: 'x', label: 'X' }] })).toThrow(ObjectDisposedError);
  });

  it('supports explicit/view close triggers and light/dark theme changes', () => {
    const { menus, rightclick, view } = setup();
    menus.register({ kind: 'map' }, { items: [{ key: 'map', label: 'Map' }] });
    expect(view.theme).toBe('light');
    menus.setTheme('dark');
    expect(view.theme).toBe('dark');
    expect(menus.toggleTheme()).toBe('light');

    rightclick();
    view.emit({ type: 'close' });
    expect(view.model).toBeUndefined();
    rightclick();
    menus.close();
    expect(view.model).toBeUndefined();
  });

  it('lets InteractionCoordinator consume rightclick before the menu service receives it', () => {
    const { menus, port, rightclick, router, view } = setup();
    menus.register({ kind: 'map' }, { items: [{ key: 'map', label: 'Map' }] });
    const coordinator = new InteractionCoordinator();
    const session = { cancel: vi.fn(), handleContextMenu: vi.fn(() => 'consume' as const) };
    coordinator.activate(session);
    router.setContextMenuArbiter((event) => coordinator.handleContextMenu({ ...event }));

    rightclick();
    expect(session.handleContextMenu).toHaveBeenCalledOnce();
    expect(view.model).toBeUndefined();
    coordinator.release(session);
    port.emit('rightclick', {
      type: 'rightclick',
      coordinate: [5, 6],
      pixel: [7, 8],
      nativeEventRef
    });
    expect(view.model?.items.map(({ key }) => key)).toEqual(['map']);
  });

  it('wraps internal payloads and targets as public Element and Layer handles', () => {
    const { menus: internal, rightclick, view } = setup();
    const elementState = element();
    const feature = new Feature();
    const elementHandle = constructElementHandle({
      id: 'a',
      feature,
      isCurrent: () => true,
      getState: () => elementState,
      update: vi.fn(),
      remove: vi.fn(),
      removedByHandle: false
    });
    const layerState: LayerState = { kind: 'vector', id: 'layer-a', visible: true, opacity: 1, wrapX: true, declutter: false };
    const layerHandle = constructLayerHandle({
      id: 'layer-a',
      nativeLayer: new VectorLayer(),
      isCurrent: () => true,
      getState: () => layerState,
      update: vi.fn(),
      remove: vi.fn(),
      removedByHandle: false
    });
    const elements = { get: (id: string) => (id === 'a' ? elementHandle : undefined) } as unknown as ElementService;
    const layers = { get: (id: string) => (id === 'layer-a' ? layerHandle : undefined) } as unknown as LayerService;
    const facade: PublicContextMenuService = new ContextMenuFacade(internal, elements, layers);
    const contexts: ContextMenuItemContext[] = [];
    const before = vi.fn((context: ContextMenuItemContext) => context.element === elementHandle);
    facade.register(elementHandle, { items: [{ key: 'open', label: 'Open' }], before, onSelect: (context) => contexts.push(context) });

    rightclick('a');
    expect(before).toHaveBeenCalledWith(expect.objectContaining({ element: elementHandle, layer: layerHandle, module: 'vehicle' }));
    view.emit({ type: 'select', key: 'open' });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      item: { key: 'open', label: 'Open' },
      scope: 'element',
      coordinate: [10, 20],
      pixel: [30, 40],
      element: elementHandle,
      module: 'vehicle',
      layer: layerHandle
    });

    const foreign = constructElementHandle({
      id: 'a',
      feature: new Feature(),
      isCurrent: () => true,
      getState: () => elementState,
      update: vi.fn(),
      remove: vi.fn(),
      removedByHandle: false
    });
    expect(() => facade.register(foreign, { items: [{ key: 'foreign', label: 'Foreign' }] })).toThrow(InvalidArgumentError);
    expect(() => facade.getItemState(foreign, 'open')).toThrow(InvalidArgumentError);
  });

  it('rejects invalid trees, targets, state patches, and stale item access', () => {
    const { menus } = setup();
    expect(() =>
      menus.register(
        { kind: 'map' },
        {
          items: [
            { key: 'duplicate', label: 'A' },
            { key: 'duplicate', label: 'B' }
          ]
        }
      )
    ).toThrow(InvalidArgumentError);
    expect(() => menus.register({ kind: 'map' }, { items: [{ key: 'duplicate', label: 'Parent', children: [{ key: 'duplicate', label: 'Child' }] }] })).toThrow(
      InvalidArgumentError
    );
    expect(() => menus.register({ kind: 'map' }, { items: [{ key: 'a', label: 'A', mutexKey: 'missing' }] })).toThrow(InvalidArgumentError);
    expect(() => menus.register({ kind: 'module', module: '' }, { items: [{ key: 'a', label: 'A' }] })).toThrow(InvalidArgumentError);
    menus.register({ kind: 'map' }, { items: [{ key: 'a', label: 'A' }] });
    expect(() => menus.setItemState({ kind: 'map' }, 'missing', { visible: false })).toThrow(InvalidArgumentError);
    expect(() => menus.setItemState({ kind: 'map' }, 'a', {})).toThrow(InvalidArgumentError);
    menus.register({ kind: 'map' }, { items: [{ key: 'parent', label: 'Parent', children: [{ key: 'child', label: 'Child' }] }] });
    expect(() => menus.setItemState({ kind: 'map' }, 'parent', { disabled: true })).toThrow(InvalidArgumentError);
  });

  it('normalizes hostile proxies and cyclic trees to InvalidArgumentError without invoking accessors', () => {
    const { menus } = setup();
    const target = new Proxy(Object.create(null) as object, {
      getPrototypeOf: () => null,
      ownKeys: () => {
        throw new Error('target ownKeys trap');
      }
    });
    expect(() => menus.register(target as never, { items: [{ key: 'a', label: 'A' }] })).toThrow(InvalidArgumentError);

    const cyclic: { key: string; label: string; children?: unknown[] } = { key: 'cycle', label: 'Cycle' };
    cyclic.children = [cyclic];
    expect(() => menus.register({ kind: 'map' }, { items: [cyclic] as never })).toThrow(InvalidArgumentError);

    const descriptorTrap = new Proxy(
      { items: [{ key: 'a', label: 'A' }] },
      {
        getOwnPropertyDescriptor: () => {
          throw new Error('spec descriptor trap');
        }
      }
    );
    const facade = new ContextMenuFacade(menus, {} as ElementService, {} as LayerService);
    expect(() => facade.register('map', descriptorTrap)).toThrow(InvalidArgumentError);

    const itemArray = new Proxy([{ key: 'a', label: 'A' }], {
      get: () => {
        throw new Error('items getter trap');
      }
    });
    expect(() => menus.register({ kind: 'map' }, { items: itemArray })).not.toThrow();

    const publicTarget = new Proxy(Object.create(null) as object, {
      getPrototypeOf: () => {
        throw new Error('public target prototype trap');
      }
    });
    expect(() => facade.register(publicTarget as never, { items: [{ key: 'a', label: 'A' }] })).toThrow(InvalidArgumentError);

    const stale = constructElementHandle({
      id: 'a',
      feature: new Feature(),
      isCurrent: () => false,
      getState: () => element(),
      update: vi.fn(),
      remove: vi.fn(),
      removedByHandle: false
    });
    expect(() => facade.register(stale, { items: [{ key: 'a', label: 'A' }] })).toThrow(ObjectDisposedError);
  });

  it('rolls back every installed constructor subscription while preserving the setup failure', () => {
    const eventDispose = vi.fn(() => {
      throw new Error('event cleanup failed');
    });
    const storeDispose = vi.fn();
    const viewDispose = vi.fn(() => {
      throw new Error('view cleanup failed');
    });
    const events = { on: vi.fn(() => eventDispose) } as unknown as EventService;
    const store = { subscribe: vi.fn(() => storeDispose) } as unknown as ElementStore;
    const setupFailure = new Error('theme setup failed');
    const view = {
      listen: vi.fn(() => viewDispose),
      setTheme: vi.fn(() => {
        throw setupFailure;
      })
    } as unknown as ContextMenuViewPort;

    expect(() => new ContextMenuService(events, store, view)).toThrow(setupFailure);
    expect(viewDispose).toHaveBeenCalledOnce();
    expect(eventDispose).toHaveBeenCalledOnce();
    expect(storeDispose).toHaveBeenCalledOnce();

    const earlyEventDispose = vi.fn(() => {
      throw new Error('early event cleanup failed');
    });
    const earlyFailure = new Error('store setup failed');
    const earlyEvents = { on: vi.fn(() => earlyEventDispose) } as unknown as EventService;
    const earlyStore = {
      subscribe: vi.fn(() => {
        throw earlyFailure;
      })
    } as unknown as ElementStore;
    expect(() => new ContextMenuService(earlyEvents, earlyStore, view)).toThrow(earlyFailure);
    expect(earlyEventDispose).toHaveBeenCalledOnce();
  });

  it('aborts an in-flight before render when the registration replaces itself', () => {
    const { menus, rightclick, view } = setup();
    menus.register(
      { kind: 'map' },
      {
        items: [{ key: 'old', label: 'Old' }],
        before: () => {
          menus.register({ kind: 'map' }, { items: [{ key: 'new', label: 'New' }] });
          return true;
        }
      }
    );

    rightclick();
    expect(view.model).toBeUndefined();
    rightclick();
    expect(view.model?.items.map(({ key }) => key)).toEqual(['new']);
  });

  it.each([
    {
      change: (store: ElementStore): void => {
        store.update({ id: 'b' }, { module: 'other' });
      },
      description: 'another Element changes module'
    },
    {
      change: (store: ElementStore): void => {
        store.update(
          { id: 'a' },
          {
            data: { owner: 'updated' },
            geometry: { type: 'point', controlPoints: [[9, 10]] }
          }
        );
      },
      description: 'the target changes ordinary data and geometry'
    }
  ])('keeps the target menu routable when $description during before', ({ change }) => {
    const { menus, rightclick, store, view } = setup();
    menus.register(
      { kind: 'module', module: 'vehicle' },
      {
        items: [{ key: 'inspect', label: 'Inspect' }],
        before: () => {
          change(store);
          return true;
        }
      }
    );

    rightclick('a');
    expect(view.model?.items.map(({ key }) => key)).toEqual(['inspect']);
  });

  it('does not show a stale Element menu when before changes its module scope', () => {
    const { menus, rightclick, store, view } = setup();
    menus.register(
      { kind: 'module', module: 'vehicle' },
      {
        items: [{ key: 'move', label: 'Move' }],
        before: () => {
          store.update({ id: 'a' }, { module: 'other' });
          return true;
        }
      }
    );

    rightclick('a');
    expect(view.model).toBeUndefined();
  });

  it('does not show a stale Element menu when before removes its target', () => {
    const { menus, rightclick, store, view } = setup();
    menus.register(
      { kind: 'module', module: 'vehicle' },
      {
        items: [{ key: 'remove', label: 'Remove' }],
        before: () => {
          store.remove({ id: 'a' });
          return true;
        }
      }
    );

    rightclick('a');
    expect(view.model).toBeUndefined();
  });

  it('returns a destroyable replacement handle when closing the old open menu fails', () => {
    const { menus, reports, rightclick, view } = setup();
    const old = menus.register({ kind: 'module', module: 'vehicle' }, { items: [{ key: 'old', label: 'Old' }] });
    rightclick('a');
    const closeFailure = new Error('replacement close failed');
    vi.spyOn(view, 'close').mockImplementationOnce(() => {
      throw closeFailure;
    });

    const replacement = menus.register({ kind: 'module', module: 'vehicle' }, { items: [{ key: 'new', label: 'New' }] });

    expect(reports).toHaveBeenCalledWith(closeFailure, expect.objectContaining({ source: 'ContextMenuService', operation: 'close' }));
    old.destroy();
    replacement.destroy();
    replacement.destroy();
    rightclick('a');
    expect(view.model).toBeUndefined();
  });

  it('anchors the DOM view on postrender, isolates menu events, and removes open-only close listeners', () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const originalElement = Object.getOwnPropertyDescriptor(globalThis, 'Element');
    const originalNode = Object.getOwnPropertyDescriptor(globalThis, 'Node');
    const documentTarget = new FakeDocument();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentTarget });
    Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeDomElement });
    Object.defineProperty(globalThis, 'Node', { configurable: true, value: FakeDomElement });
    try {
      const map = new MenuMapHarness();
      const adapter = new ContextMenuViewAdapter(map as unknown as OlMap);
      const actions: ContextMenuViewEvent[] = [];
      adapter.listen((event) => {
        actions.push(event);
        if (event.type === 'close' || event.type === 'select') adapter.close();
      });
      adapter.setTheme('dark');
      adapter.show({
        coordinate: [10, 20],
        pixel: [30, 40],
        items: [{ key: 'tools', label: 'Tools', disabled: false, children: [{ key: 'inspect', label: 'Inspect', disabled: false }] }]
      });
      const root = map.viewport.children[0];
      const inspect = findByMenuKey(root, 'inspect');
      expect(root.style).toMatchObject({ display: 'block', left: '20px', top: '60px' });
      expect(root.classList.values.has('ol-context-menu--dark')).toBe(true);
      expect(map.listenerCount('postrender')).toBe(1);
      expect(documentTarget.listenerCount('pointerdown')).toBe(1);
      expect(documentTarget.listenerCount('keydown')).toBe(1);

      map.scale = 4;
      map.emit('postrender');
      expect(root.style).toMatchObject({ left: '40px', top: '100px' });

      const viewportPointer = vi.fn();
      map.viewport.addEventListener('pointerdown', viewportPointer);
      const isolated = fakeEvent('pointerdown', inspect);
      inspect.dispatchEvent(isolated);
      expect(isolated.preventDefault).toHaveBeenCalledOnce();
      expect(viewportPointer).not.toHaveBeenCalled();

      for (const type of ['pointermove', 'mousemove', 'dblclick', 'wheel'] as const) {
        const viewportEvent = vi.fn();
        map.viewport.addEventListener(type, viewportEvent);
        const event = fakeEvent(type, inspect);
        inspect.dispatchEvent(event);
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(viewportEvent).not.toHaveBeenCalled();
      }

      const selected = fakeEvent('click', inspect);
      inspect.dispatchEvent(selected);
      expect(actions).toEqual([{ type: 'select', key: 'inspect' }]);
      expect(root.style.display).toBe('none');
      expect(map.listenerCount('postrender')).toBe(0);
      expect(documentTarget.listenerCount('pointerdown')).toBe(0);

      adapter.show({ coordinate: [1, 2], pixel: [3, 4], items: [{ key: 'map', label: 'Map', disabled: false }] });
      documentTarget.dispatchEvent(fakeEvent('keydown', documentTarget, { key: 'Escape' }));
      expect(actions.at(-1)).toEqual({ type: 'close' });
      adapter.show({ coordinate: [1, 2], pixel: [3, 4], items: [{ key: 'map', label: 'Map', disabled: false }] });
      documentTarget.dispatchEvent(fakeEvent('pointerdown', new FakeDomElement('outside')));
      expect(actions.at(-1)).toEqual({ type: 'close' });

      adapter.show({ coordinate: [1, 2], pixel: [3, 4], items: [{ key: 'map', label: 'Map', disabled: false }] });
      map.failUnCount = 1;
      expect(() => adapter.destroy()).toThrow('postrender cleanup failed');
      expect(documentTarget.listenerCount('pointerdown')).toBe(0);
      expect(documentTarget.listenerCount('keydown')).toBe(0);
      expect(map.listenerCount('postrender')).toBe(1);
      adapter.destroy();
      adapter.destroy();
      expect(map.listenerCount('postrender')).toBe(0);
      expect(map.viewport.children).toHaveLength(0);
      expect(() => adapter.show({ coordinate: [0, 0], pixel: [0, 0], items: [] })).toThrow(ObjectDisposedError);
    } finally {
      restoreDescriptor('document', originalDocument);
      restoreDescriptor('Element', originalElement);
      restoreDescriptor('Node', originalNode);
    }
  });
});

function flatten(items: readonly { readonly key: string; readonly disabled: boolean; readonly children?: readonly unknown[] }[]): Array<{
  readonly key: string;
  readonly disabled: boolean;
}> {
  const result: Array<{ readonly key: string; readonly disabled: boolean }> = [];
  const visit = (current: readonly { readonly key: string; readonly disabled: boolean; readonly children?: readonly unknown[] }[]): void => {
    for (const item of current) {
      result.push(item);
      if (item.children !== undefined) visit(item.children as typeof current);
    }
  };
  visit(items);
  return result;
}

void (0 as unknown as ContextMenuItemSpec | Element | Layer);

type FakeListener = (event: ReturnType<typeof fakeEvent>) => void;

class FakeClassList {
  readonly values = new Set<string>();

  add(...names: string[]): void {
    names.forEach((name) => this.values.add(name));
  }

  toggle(name: string, force?: boolean): void {
    if (force ?? !this.values.has(name)) this.values.add(name);
    else this.values.delete(name);
  }
}

class FakeDomElement {
  readonly children: FakeDomElement[] = [];
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, FakeListener[]>();
  parent: FakeDomElement | undefined;
  className = '';
  textContent = '';
  disabled = false;
  type = '';

  constructor(readonly tagName: string) {}

  setAttribute(): void {}

  appendChild(child: FakeDomElement): FakeDomElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeDomElement[]): void {
    this.children.splice(0).forEach((child) => (child.parent = undefined));
    children.forEach((child) => this.appendChild(child));
  }

  addEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((current) => current !== listener)
    );
  }

  dispatchEvent(event: ReturnType<typeof fakeEvent>): boolean {
    if (event.target === undefined) event.target = this;
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
    if (!event.cancelBubble) this.parent?.dispatchEvent(event);
    return true;
  }

  contains(target: unknown): boolean {
    if (target === this) return true;
    return this.children.some((child) => child.contains(target));
  }

  closest(selector: string): FakeDomElement | null {
    if (selector === 'button[data-menu-key]' && this.dataset.menuKey !== undefined) return this;
    return this.parent?.closest(selector) ?? null;
  }

  remove(): void {
    if (this.parent === undefined) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = undefined;
  }
}

class FakeDocument extends FakeDomElement {
  constructor() {
    super('document');
  }

  createElement(tagName: string): FakeDomElement {
    return new FakeDomElement(tagName);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }
}

class MenuMapHarness {
  readonly viewport = new FakeDomElement('viewport');
  readonly listeners = new Map<string, Set<() => void>>();
  scale = 2;
  failUnCount = 0;

  getViewport(): HTMLElement {
    return this.viewport as unknown as HTMLElement;
  }

  getPixelFromCoordinate(coordinate: number[]): [number, number] {
    return [coordinate[0] * this.scale, coordinate[1] * (this.scale + 1)];
  }

  on(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  un(type: string, listener: () => void): void {
    if (this.failUnCount > 0) {
      this.failUnCount -= 1;
      throw new Error('postrender cleanup failed');
    }
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function findByMenuKey(root: FakeDomElement, key: string): FakeDomElement {
  if (root.dataset.menuKey === key) return root;
  for (const child of root.children) {
    try {
      return findByMenuKey(child, key);
    } catch {
      // Continue with later branches.
    }
  }
  throw new Error(`Menu key not found: ${key}`);
}

function fakeEvent(type: string, target?: unknown, fields: Readonly<Record<string, unknown>> = {}) {
  return {
    type,
    target,
    cancelBubble: false,
    preventDefault: vi.fn(),
    stopPropagation() {
      this.cancelBubble = true;
    },
    ...fields
  };
}

function restoreDescriptor(key: 'document' | 'Element' | 'Node', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) Reflect.deleteProperty(globalThis, key);
  else Object.defineProperty(globalThis, key, descriptor);
}
