import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import type { CoreLayerSpec, CoreLayerState, LayerPresentation } from '../src/core/layer/types.js';
import type { LayerPort } from '../src/core/ports/LayerPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { ShapeDefinition, ShapeState } from '../src/core/shape/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

class FakeLayerPort implements LayerPort {
  readonly attached = new Map<string, Readonly<CoreLayerSpec>>();
  readonly updates: Array<readonly [Readonly<CoreLayerState>, Readonly<CoreLayerState>]> = [];
  readonly detached: string[] = [];
  onAttach?: () => void;
  onUpdate?: () => void;
  onDetach?: () => void;
  attachPresentation?: LayerPresentation;

  attach(spec: Readonly<CoreLayerSpec>): LayerPresentation {
    this.onAttach?.();
    this.attached.set(spec.id, spec);
    return (
      this.attachPresentation ??
      (spec.kind === 'native'
        ? { visible: true, opacity: 1 }
        : { visible: spec.visible, opacity: spec.opacity, ...(spec.zIndex === undefined ? {} : { zIndex: spec.zIndex }) })
    );
  }

  update(before: Readonly<CoreLayerState>, after: Readonly<CoreLayerState>): void {
    this.onUpdate?.();
    this.updates.push([before, after]);
  }

  detach(id: string): void {
    this.onDetach?.();
    this.detached.push(id);
    this.attached.delete(id);
  }
}

function point(id: string, layerId: string, visible = true): ElementState {
  return {
    id,
    type: 'point',
    geometry: { type: 'point', controlPoints: [[1, 2]] },
    style: { symbol: { type: 'circle', radius: 4 } },
    layerId,
    visible
  };
}

function setup() {
  const port = new FakeLayerPort();
  const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions), { validateElement: (state) => void manager.requireVector(state.layerId) });
  const manager = new LayerManager(store, port);
  return { manager, port, store };
}

describe('LayerManager', () => {
  coversCapabilities('earth-layer-wrapper-registry', 'earth-default-layer-bundle');

  it('creates the exact default vector layer once and rejects a non-vector default', () => {
    const { manager, port } = setup();

    const first = manager.ensureDefaultVector();
    const second = manager.ensureDefaultVector();

    expect(first).toEqual({ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false });
    expect(second).toEqual(first);
    expect(port.attached.size).toBe(1);

    manager.remove('default');
    manager.add({ kind: 'tile', id: 'default', source: { preset: 'osm' }, sourceOwnership: 'earth', visible: true, opacity: 1 });
    expect(() => manager.ensureDefaultVector()).toThrow(InvalidArgumentError);
  });

  it('validates records and duplicates before calling the port', () => {
    const { manager, port } = setup();
    manager.add({ kind: 'vector', id: 'business', visible: true, opacity: 0, zIndex: 0, wrapX: false, declutter: true });

    expect(() => manager.add({ kind: 'vector', id: 'business', visible: true, opacity: 1, wrapX: true, declutter: false })).toThrow(InvalidArgumentError);
    for (const spec of [
      { kind: 'vector', id: '', visible: true, opacity: 1, wrapX: true, declutter: false },
      { kind: 'vector', id: 'bad-opacity', visible: true, opacity: 2, wrapX: true, declutter: false },
      { kind: 'vector', id: 'bad-z', visible: true, opacity: 1, zIndex: Infinity, wrapX: true, declutter: false },
      { kind: 'vector', id: 'extra', visible: true, opacity: 1, wrapX: true, declutter: false, extra: true }
    ]) {
      expect(() => manager.add(spec as never)).toThrow(InvalidArgumentError);
    }
    expect(port.attached.size).toBe(1);
  });

  it('enforces vector targets inside add, multi-update, and copy atomically', () => {
    const { manager, store } = setup();
    manager.add({ kind: 'vector', id: 'vectors', visible: true, opacity: 1, wrapX: true, declutter: false });
    manager.add({ kind: 'tile', id: 'tiles', source: { preset: 'osm' }, sourceOwnership: 'earth', visible: true, opacity: 1 });
    store.add(point('first', 'vectors'));
    store.add(point('second', 'vectors'));

    expect(() => store.add(point('missing', 'absent'))).toThrow(InvalidArgumentError);
    expect(() => store.update({ ids: ['first', 'second'] }, { layerId: 'tiles' })).toThrow(InvalidArgumentError);
    expect(() => store.copy('first', { layerId: 'missing' })).toThrow(InvalidArgumentError);
    expect(store.query().map(({ layerId }) => layerId)).toEqual(['vectors', 'vectors']);
  });

  it('revalidates after fallible snapshot cloning closes the removed-layer window', () => {
    let armed = false;
    const basePoint = basicShapeDefinitions.find(({ type }) => type === 'point') as ShapeDefinition<ShapeState<'point'>>;
    const hostile: ShapeDefinition<ShapeState<'point'>> = {
      ...basePoint,
      clone(state) {
        if (armed) {
          armed = false;
          manager.remove('business');
        }
        return basePoint.clone(state);
      }
    };
    const port = new FakeLayerPort();
    const store = new ElementStore(new ShapeRegistry([hostile]), {
      validateElement(state) {
        manager.requireVector(state.layerId);
        armed = true;
      }
    });
    const manager = new LayerManager(store, port);
    manager.add({ kind: 'vector', id: 'business', visible: true, opacity: 1, wrapX: true, declutter: false });

    expect(() => store.add(point('hostile', 'business'))).toThrow(InvalidArgumentError);
    expect(store.query()).toEqual([]);
    expect(manager.get('business')).toBeUndefined();
  });

  it('uses Store occupancy including hidden elements and makes clear all-or-nothing', () => {
    const { manager, port, store } = setup();
    manager.add({ kind: 'vector', id: 'occupied', visible: true, opacity: 1, wrapX: true, declutter: false });
    manager.add({ kind: 'vector', id: 'free', visible: true, opacity: 1, wrapX: true, declutter: false });
    store.add(point('hidden', 'occupied', false));

    expect(() => manager.remove('occupied')).toThrow(InvalidArgumentError);
    expect(() => manager.clear()).toThrow(InvalidArgumentError);
    expect(manager.query().map(({ id }) => id)).toEqual(['occupied', 'free']);
    expect(port.detached).toEqual([]);

    store.clear();
    manager.clear();
    expect(manager.query()).toEqual([]);
    expect(port.detached).toEqual(['occupied', 'free']);
  });

  it('returns isolated frozen snapshots and uses an own undefined zIndex as deletion', () => {
    const { manager, port } = setup();
    manager.add({ kind: 'vector', id: 'vectors', visible: true, opacity: 1, zIndex: 8, wrapX: true, declutter: false });
    const first = manager.get('vectors');
    const second = manager.get('vectors');

    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    manager.update('vectors', { zIndex: undefined });
    expect(manager.get('vectors')).not.toHaveProperty('zIndex');
    expect(port.updates.at(-1)?.[1]).not.toHaveProperty('zIndex');
  });

  it('calls attach/update/detach before committing Core state and never calls the port for invalid updates', () => {
    const { manager, port } = setup();
    port.onAttach = () => expect(manager.get('ordered')).toBeUndefined();
    manager.add({ kind: 'vector', id: 'ordered', visible: true, opacity: 1, wrapX: true, declutter: false });
    port.onAttach = undefined;
    port.onUpdate = () => expect(manager.get('ordered')?.opacity).toBe(1);
    manager.update('ordered', { opacity: 0.5 });
    port.onUpdate = undefined;
    port.onDetach = () => expect(manager.get('ordered')).toBeDefined();
    manager.remove('ordered');
    expect(port.updates).toHaveLength(1);
    expect(port.detached).toEqual(['ordered']);

    const update = vi.spyOn(port, 'update');
    expect(() => manager.update('missing', { opacity: 2 })).toThrow(InvalidArgumentError);
    expect(update).not.toHaveBeenCalled();
  });

  it('rolls back an attached port record when its presentation is invalid', () => {
    const { manager, port } = setup();
    port.attachPresentation = { visible: true, opacity: 2 };

    expect(() => manager.add({ kind: 'vector', id: 'invalid-port', visible: true, opacity: 1, wrapX: true, declutter: false })).toThrow(InvalidArgumentError);
    expect(manager.get('invalid-port')).toBeUndefined();
    expect(port.attached.has('invalid-port')).toBe(false);
    expect(port.detached).toEqual(['invalid-port']);
  });

  it('keeps add/update/copy unchanged and silent when the final validator rejects', () => {
    let armed = false;
    let validations = 0;
    const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions), {
      createId: () => 'copy',
      validateElement() {
        if (armed && ++validations === 2) throw new InvalidArgumentError('final validation failed');
      }
    });
    store.add(point('seed', 'vectors'));
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.query();
    const failFinal = (work: () => unknown) => {
      armed = true;
      validations = 0;
      expect(work).toThrow(InvalidArgumentError);
      armed = false;
      expect(store.query()).toEqual(before);
      expect(listener).not.toHaveBeenCalled();
    };

    failFinal(() => store.add(point('added', 'vectors')));
    failFinal(() => store.update({ id: 'seed' }, { visible: false }));
    failFinal(() => store.copy('seed'));
  });

  it('rejects reentrant mutation and becomes idempotently disposed', () => {
    const { manager, port } = setup();
    port.onAttach = () => manager.add({ kind: 'vector', id: 'nested', visible: true, opacity: 1, wrapX: true, declutter: false });

    expect(() => manager.add({ kind: 'vector', id: 'outer', visible: true, opacity: 1, wrapX: true, declutter: false })).toThrow(InvalidArgumentError);
    expect(manager.query()).toEqual([]);
    port.onAttach = undefined;
    manager.ensureDefaultVector();
    const detach = vi.spyOn(port, 'detach');
    manager.destroy();
    manager.destroy();

    expect(detach).toHaveBeenCalledTimes(1);
    expect(() => manager.query()).toThrow(ObjectDisposedError);
    expect(() => manager.ensureDefaultVector()).toThrow(ObjectDisposedError);
  });
});
