import BaseLayer from 'ol/layer/Base.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';
import type { LayerKind, LayerPatch } from '../core/layer/types.js';
import type { LayerState } from './types.js';

interface LayerHandleState {
  readonly id: string;
  readonly nativeLayer: BaseLayer;
  readonly isCurrent: () => boolean;
  readonly getState: () => Readonly<LayerState>;
  readonly update: (patch: LayerPatch) => void;
  readonly remove: () => void;
  removedByHandle: boolean;
}

const layerToken = Symbol('ol-engine.facade.Layer.internal');
const layerStates = new WeakMap<Layer, LayerHandleState>();

export class Layer {
  constructor();
  constructor(...args: unknown[]) {
    if (args[0] !== layerToken || !isLayerHandleState(args[1])) throw new InvalidArgumentError('Layer handles are created by LayerService');
    layerStates.set(this, args[1]);
  }

  get id(): string {
    return stateOf(this).id;
  }

  get state(): Readonly<LayerState> {
    const state = currentStateOf(this);
    return state.getState();
  }

  get kind(): LayerKind {
    return this.state.kind;
  }

  get visible(): boolean {
    return this.state.visible;
  }

  get opacity(): number {
    return this.state.opacity;
  }

  get zIndex(): number | undefined {
    return this.state.zIndex;
  }

  get olLayer(): BaseLayer {
    return currentStateOf(this).nativeLayer;
  }

  update(patch: LayerPatch): void {
    currentStateOf(this).update(patch);
  }

  show(): void {
    this.update({ visible: true });
  }

  hide(): void {
    this.update({ visible: false });
  }

  remove(): void {
    const state = stateOf(this);
    if (state.removedByHandle) return;
    if (!state.isCurrent()) throw new ObjectDisposedError(`Layer handle is stale: ${state.id}`);
    state.remove();
    state.removedByHandle = true;
  }
}

export function constructLayerHandle(internal: unknown): Layer {
  const Constructor = Layer as unknown as new (token: symbol, state: unknown) => Layer;
  return new Constructor(layerToken, internal);
}

function stateOf(handle: Layer): LayerHandleState {
  const state = layerStates.get(handle);
  if (state === undefined) throw new InvalidArgumentError('Invalid Layer handle');
  return state;
}

function currentStateOf(handle: Layer): LayerHandleState {
  const state = stateOf(handle);
  if (!state.isCurrent()) throw new ObjectDisposedError(`Layer handle is stale: ${state.id}`);
  return state;
}

function isLayerHandleState(value: unknown): value is LayerHandleState {
  if (value === null || typeof value !== 'object') return false;
  const state = value as Partial<LayerHandleState>;
  return (
    typeof state.id === 'string' &&
    state.nativeLayer instanceof BaseLayer &&
    typeof state.isCurrent === 'function' &&
    typeof state.getState === 'function' &&
    typeof state.update === 'function' &&
    typeof state.remove === 'function'
  );
}
