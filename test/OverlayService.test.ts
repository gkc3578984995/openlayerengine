import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import type { AnimationSpec, AnimationStatus } from '../src/core/animation/types.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementSelector } from '../src/core/element/types.js';
import { InvalidArgumentError, InvalidSelectorError, ObjectDisposedError } from '../src/core/errors.js';
import { createNativeRef } from '../src/core/native/types.js';
import type { AnimationControlHandle, AnimationControlPort } from '../src/core/ports/AnimationControlPort.js';
import type {
  CorePanIntoViewSpec,
  DescriptorPortAction,
  OverlayDragEvent,
  OverlayPort,
  OverlayRenderState,
  PixelBounds
} from '../src/core/ports/OverlayPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { OverlayService } from '../src/services/overlay/OverlayService.js';
import type { InternalOverlaySpec } from '../src/services/overlay/types.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { OverlayFacade } from '../src/facade/OverlayFacade.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

class FakeAnimationPort implements AnimationControlPort {
  readonly plays: Array<{ readonly selector: ElementSelector; readonly animation: AnimationSpec; readonly handle: FakeAnimationHandle }> = [];

  play(selector: ElementSelector, animation: AnimationSpec): AnimationControlHandle {
    const handle = new FakeAnimationHandle();
    this.plays.push({ selector, animation, handle });
    return handle;
  }

  pause(): number {
    return 0;
  }

  resume(): number {
    return 0;
  }

  stop(): number {
    return 0;
  }
}

class FakeAnimationHandle implements AnimationControlHandle {
  status: AnimationStatus = 'running';

  stop(): void {
    if (this.status === 'stopped') return;
    this.status = 'stopped';
  }
}

class FakeOverlayPort implements OverlayPort {
  readonly states = new Map<string, Readonly<OverlayRenderState>>();
  readonly updates: Array<readonly [Readonly<OverlayRenderState>, Readonly<OverlayRenderState>]> = [];
  readonly detached: string[] = [];
  readonly released: Array<readonly [OverlayRenderState['elementRef'], OverlayRenderState['ownership']]> = [];
  readonly pans: Array<readonly [string, CorePanIntoViewSpec | undefined]> = [];
  readonly actions = new Map<string, (action: DescriptorPortAction) => void>();
  readonly drags = new Map<string, (event: OverlayDragEvent) => void>();
  bounds: PixelBounds | undefined = { left: 20, top: 20, right: 80, bottom: 60 };
  layoutListener: (() => void) | undefined;
  layoutSubscriptions = 0;
  layoutDisposals = 0;
  failAttach = false;
  failUpdate = false;
  failRelease = false;

  attach(state: Readonly<OverlayRenderState>): void {
    if (this.failAttach) throw new Error('attach failed');
    this.states.set(state.id, state);
  }

  update(before: Readonly<OverlayRenderState>, after: Readonly<OverlayRenderState>): void {
    if (this.failUpdate) throw new Error('update failed');
    this.updates.push([before, after]);
    this.states.set(after.id, after);
  }

  detach(id: string): void {
    this.detached.push(id);
    this.states.delete(id);
  }

  panIntoView(id: string, options?: CorePanIntoViewSpec): void {
    this.pans.push([id, options]);
  }

  releaseElement(ref: OverlayRenderState['elementRef'], ownership: OverlayRenderState['ownership']): void {
    if (this.failRelease) throw new Error('release failed');
    this.released.push([ref, ownership]);
  }

  coordinateToPixel(coordinate: readonly number[]): readonly [number, number] {
    return [coordinate[0] * 10, coordinate[1] * 10];
  }

  pixelToCoordinate(pixel: readonly number[]): readonly [number, number] {
    return [pixel[0] / 10, pixel[1] / 10];
  }

  getBounds(): PixelBounds | undefined {
    return this.bounds;
  }

  subscribeLayout(listener: () => void): () => void {
    this.layoutSubscriptions += 1;
    this.layoutListener = listener;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.layoutDisposals += 1;
      if (this.layoutListener === listener) this.layoutListener = undefined;
    };
  }

  subscribeDescriptorActions(id: string, listener: (action: DescriptorPortAction) => void): () => void {
    this.actions.set(id, listener);
    return () => this.actions.delete(id);
  }

  bindDrag(id: string, listener: (event: OverlayDragEvent) => void): () => void {
    this.drags.set(id, listener);
    return () => this.drags.delete(id);
  }
}

function overlaySpec<T>(id: string, data?: T): InternalOverlaySpec<T> {
  return {
    id,
    elementRef: createNativeRef('element'),
    position: [10, 20],
    offset: [2, 3],
    positioning: 'bottom-center',
    stopEvent: false,
    insertFirst: false,
    autoPan: { margin: 12, duration: 250 },
    className: 'business-overlay',
    module: 'business',
    data,
    ownership: 'external'
  };
}

function setup() {
  const port = new FakeOverlayPort();
  const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
  const animations = new FakeAnimationPort();
  const errors: unknown[] = [];
  const service = new OverlayService(port, store, animations, {
    createId: () => 'generated-overlay',
    errorReporter: (error) => errors.push(error)
  });
  return { animations, errors, port, service, store };
}

describe('OverlayService', () => {
  coversCapabilities('overlay-add-config', 'overlay-update', 'overlay-position-hide', 'overlay-query-remove', 'overlay-default-earth-resolution');

  it('normalizes the full add contract and returns one handle for the current generation', () => {
    const { port, service } = setup();
    const input = { label: 'origin' };
    const created = service.add(overlaySpec('overlay-1', input));

    expect(service.get('overlay-1')).toBe(created);
    expect(service.query()).toEqual([created]);
    expect(Object.isFrozen(service.query())).toBe(true);
    expect(created.id).toBe('overlay-1');
    expect(created.position).toEqual([10, 20]);
    expect(created.visible).toBe(true);
    expect(created.data).toEqual(input);
    expect(created.data).not.toBe(input);
    expect(created.module).toBe('business');
    expect(port.states.get('overlay-1')).toMatchObject({
      offset: [2, 3],
      positioning: 'bottom-center',
      stopEvent: false,
      insertFirst: false,
      autoPan: { margin: 12, duration: 250 },
      className: 'business-overlay',
      ownership: 'external',
      visible: true
    });
  });

  it('treats an explicitly undefined autoPan like omission while rejecting other invalid values', () => {
    const { port, service } = setup();
    service.add({ id: 'auto-pan-omitted', elementRef: createNativeRef('element') });
    service.add({ id: 'auto-pan-undefined', elementRef: createNativeRef('element'), autoPan: undefined });

    expect(port.states.get('auto-pan-omitted')?.autoPan).toBe(false);
    expect(port.states.get('auto-pan-undefined')?.autoPan).toBe(false);
    expect(() => service.add({ id: 'auto-pan-invalid', elementRef: createNativeRef('element'), autoPan: null } as never)).toThrow(InvalidArgumentError);
  });

  it('updates the port before state, preserves a hidden position, and unsets an undefined position', () => {
    const { port, service } = setup();
    const handle = service.add(overlaySpec('overlay-1'));
    port.failUpdate = true;

    expect(() => handle.update({ offset: [9, 8] })).toThrow('update failed');
    expect(port.states.get('overlay-1')?.offset).toEqual([2, 3]);
    expect(handle.position).toEqual([10, 20]);

    port.failUpdate = false;
    handle.hide();
    expect(handle.visible).toBe(false);
    expect(handle.position).toEqual([10, 20]);
    expect(port.states.get('overlay-1')).toMatchObject({ visible: false, position: [10, 20] });
    handle.show();
    expect(handle.visible).toBe(true);

    handle.setPosition(undefined);
    expect(handle.visible).toBe(false);
    expect(handle.position).toBeUndefined();
    handle.show();
    expect(handle.visible).toBe(false);
  });

  it('queries a stable snapshot, rejects ambiguous or empty destructive selectors, and blocks predicate mutation', () => {
    const { service } = setup();
    service.add(overlaySpec('first', { selected: true }));
    service.add({ ...overlaySpec('second', { selected: false }), module: 'other' });

    expect(service.query({ module: 'business', visible: true }).map(({ id }) => id)).toEqual(['first']);
    expect(service.query({ predicate: (data) => data?.selected === true }).map(({ id }) => id)).toEqual(['first']);
    expect(() => service.query({ id: 'first', ids: ['second'] })).toThrow(InvalidArgumentError);
    expect(service.query({ ids: [] })).toEqual([]);
    expect(() => service.remove({})).toThrow(InvalidSelectorError);
    expect(() => service.remove({ ids: [] })).toThrow(InvalidSelectorError);
    expect(() =>
      service.remove({
        predicate: (_data, handle) => {
          expect(() => handle.destroy()).toThrow(InvalidArgumentError);
          return true;
        }
      })
    ).not.toThrow();
    expect(service.query()).toEqual([]);
  });

  it('preflights destroy before any side effect when called indirectly from a selector predicate', () => {
    const { service } = setup();
    const handle = service.add(overlaySpec('survives-destroy-preflight'));

    expect(() =>
      service.query({
        predicate: () => {
          service.destroy();
          return true;
        }
      })
    ).toThrow(InvalidArgumentError);

    expect(service.get('survives-destroy-preflight')).toBe(handle);
    handle.hide();
    expect(handle.visible).toBe(false);
  });

  it('destroys idempotently, releases ownership, and invalidates a stale generation', () => {
    const { port, service } = setup();
    const external = service.add(overlaySpec('same'));
    external.destroy();
    external.destroy();
    const current = service.add({ ...overlaySpec('same'), ownership: 'earth' });

    expect(port.detached).toEqual(['same']);
    expect(port.released).toHaveLength(1);
    expect(port.released[0][1]).toBe('external');
    expect(current).not.toBe(external);
    expect(() => external.position).toThrow(ObjectDisposedError);
    expect(() => external.update({ visible: false })).toThrow(ObjectDisposedError);

    service.clear();
    expect(port.released.at(-1)?.[1]).toBe('earth');
  });

  it('rolls back attach failures, forwards pan options, and isolates Earth-local instances', () => {
    const first = setup();
    const second = setup();
    first.port.failAttach = true;

    expect(() => first.service.add(overlaySpec('failed'))).toThrow('attach failed');
    expect(first.service.get('failed')).toBeUndefined();
    first.port.failAttach = false;
    const firstHandle = first.service.add(overlaySpec('shared'));
    const secondHandle = second.service.add(overlaySpec('shared'));
    firstHandle.panIntoView({ margin: 4, duration: 100 });

    expect(first.port.pans).toEqual([['shared', { margin: 4, duration: 100 }]]);
    expect(second.port.pans).toEqual([]);
    expect(firstHandle).not.toBe(secondHandle);
  });

  it('keeps the existing shared release contract and explicitly revokes an exclusive element ref', async () => {
    const registry = new NativeRefRegistry();
    const element = { remove: vi.fn() };
    const elementRef = registry.register('element', element);
    const layerRef = registry.register('layer', {});

    registry.release('layer', layerRef);
    expect(registry.require('layer', layerRef)).toBeDefined();
    registry.revoke('element', elementRef);
    expect(() => registry.require('element', elementRef)).toThrow(ObjectDisposedError);
    expect(() => registry.revoke('element', elementRef)).not.toThrow();
  });

  it('provisionally hands public elements to the service and discards or rolls back every failed handoff', () => {
    const { port, service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const first = { remove: vi.fn() } as unknown as HTMLElement;
    const second = { remove: vi.fn() } as unknown as HTMLElement;
    const register = vi.spyOn(refs, 'registerProvisional');
    const commit = vi.spyOn(refs, 'commitProvisional');
    const discard = vi.spyOn(refs, 'discardProvisional');

    const handle = facade.add({ id: 'public', element: first, position: [1, 2], data: { label: 'public' } });
    expect(register).toHaveBeenCalledWith('element', first);
    expect(commit).toHaveBeenCalledWith('element', expect.anything());
    expect(handle.position).toEqual([1, 2]);
    expect(Reflect.ownKeys(handle).sort()).toEqual(['destroy', 'hide', 'id', 'panIntoView', 'position', 'setPosition', 'show', 'update', 'visible'].sort());

    port.failUpdate = true;
    expect(() => handle.update({ element: second })).toThrow('update failed');
    expect(discard).toHaveBeenCalledWith('element', expect.anything());
    expect(handle.position).toEqual([1, 2]);

    port.failUpdate = false;
    port.failAttach = true;
    expect(() => facade.add({ id: 'failed-public', element: second, position: [3, 4] })).toThrow('attach failed');
    expect(facade.get('failed-public')).toBeUndefined();
  });

  it('rejects unknown Facade fields and validates selector predicates before delegation', () => {
    const { service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const element = { remove: vi.fn() } as unknown as HTMLElement;

    expect(() => facade.add({ element, position: [1, 2], unexpected: true } as never)).toThrow(InvalidArgumentError);
    expect(() => facade.add({ element, position: [1, 2], [Symbol('unexpected')]: true } as never)).toThrow(InvalidArgumentError);
    facade.add({ id: 'strict-public', element, position: [1, 2] });

    expect(() => facade.query({ moduel: 'business' } as never)).toThrow(InvalidArgumentError);
    expect(() => facade.query({ predicate: 1 } as never)).toThrow(InvalidArgumentError);
    expect(facade.query({ predicate: undefined })).toHaveLength(1);

    const accessorSelector = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessorSelector, 'module', { enumerable: true, get: () => 'business' });
    expect(() => facade.query(accessorSelector as never)).toThrow(InvalidArgumentError);
  });

  it('rolls an element update back when registry commit fails without discarding the live old ref', () => {
    const { port, service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const first = { remove: vi.fn() } as unknown as HTMLElement;
    const second = { remove: vi.fn() } as unknown as HTMLElement;
    const handle = facade.add({ id: 'rollback', element: first, position: [1, 2] });
    const oldRef = port.states.get('rollback')?.elementRef;
    if (oldRef === undefined) throw new Error('Expected old ref');
    const nativeCommit = refs.commitProvisional.bind(refs);
    vi.spyOn(refs, 'commitProvisional').mockImplementation((kind, ref) => {
      if (refs.require(kind, ref) === second) throw new Error('commit failed');
      nativeCommit(kind, ref);
    });

    expect(() => handle.update({ element: second })).toThrow('commit failed');
    expect(port.states.get('rollback')?.elementRef).toBe(oldRef);
    expect(refs.require('element', oldRef)).toBe(first);
    expect(handle.position).toEqual([1, 2]);
  });

  it('keeps the committed new element canonical when old-ref cleanup fails', () => {
    const { port, service } = setup();
    const refs = new NativeRefRegistry();
    const facade = new OverlayFacade(service, refs);
    const first = { remove: vi.fn() } as unknown as HTMLElement;
    const second = { remove: vi.fn() } as unknown as HTMLElement;
    const handle = facade.add({ id: 'cleanup', element: first, position: [1, 2] });
    const discard = vi.spyOn(refs, 'discardProvisional');
    port.failRelease = true;

    expect(() => handle.update({ element: second })).toThrow('release failed');
    const currentRef = port.states.get('cleanup')?.elementRef;
    if (currentRef === undefined) throw new Error('Expected current ref');
    expect(refs.require('element', currentRef)).toBe(second);
    expect(discard).not.toHaveBeenCalled();
    expect(handle.position).toEqual([1, 2]);
  });
});
