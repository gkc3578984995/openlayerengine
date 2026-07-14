import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import type { ElementPatch, ElementState } from '../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';

interface ElementHandleState<T> {
  readonly id: string;
  readonly feature: Feature<Geometry>;
  readonly isCurrent: () => boolean;
  readonly getState: () => Readonly<ElementState<T>>;
  readonly update: (patch: ElementPatch<T>) => void;
  readonly remove: () => void;
  removedByHandle: boolean;
}

const elementToken = Symbol('ol-engine.facade.Element.internal');
const elementStates = new WeakMap<Element, ElementHandleState<unknown>>();

export class Element<T = unknown> {
  constructor();
  constructor(...args: unknown[]) {
    if (args[0] !== elementToken || !isElementHandleState(args[1])) throw new InvalidArgumentError('Element handles are created by ElementService');
    elementStates.set(this, args[1]);
  }

  get id(): string {
    return stateOf(this).id;
  }

  get state(): Readonly<ElementState<T>> {
    return currentStateOf(this).getState() as Readonly<ElementState<T>>;
  }

  get olFeature(): Feature<Geometry> {
    return currentStateOf(this).feature;
  }

  update(patch: ElementPatch<T>): void {
    (currentStateOf(this) as ElementHandleState<T>).update(patch);
  }

  remove(): void {
    const state = stateOf(this);
    if (state.removedByHandle) return;
    if (!state.isCurrent()) throw new ObjectDisposedError(`Element handle is stale: ${state.id}`);
    state.remove();
    state.removedByHandle = true;
  }
}

export function constructElementHandle<T>(internal: unknown): Element<T> {
  const Constructor = Element as unknown as new (token: symbol, state: unknown) => Element<T>;
  return new Constructor(elementToken, internal);
}

export function ownsElementHandle(handle: Element, feature: Feature<Geometry>): boolean {
  return elementStates.get(handle)?.feature === feature;
}

export function elementHandleFeature(handle: Element): Feature<Geometry> | undefined {
  return elementStates.get(handle)?.feature;
}

function stateOf(handle: Element): ElementHandleState<unknown> {
  const state = elementStates.get(handle);
  if (state === undefined) throw new InvalidArgumentError('Invalid Element handle');
  return state;
}

function currentStateOf(handle: Element): ElementHandleState<unknown> {
  const state = stateOf(handle);
  if (!state.isCurrent()) throw new ObjectDisposedError(`Element handle is stale: ${state.id}`);
  return state;
}

function isElementHandleState(value: unknown): value is ElementHandleState<unknown> {
  if (value === null || typeof value !== 'object') return false;
  const state = value as Partial<ElementHandleState<unknown>>;
  return (
    typeof state.id === 'string' &&
    state.feature instanceof Feature &&
    typeof state.isCurrent === 'function' &&
    typeof state.getState === 'function' &&
    typeof state.update === 'function' &&
    typeof state.remove === 'function'
  );
}
