import { cloneCoreState } from '../common/clone.js';
import { InvalidArgumentError } from '../errors.js';
import type { ShapeRegistry } from '../shape/ShapeRegistry.js';
import type { ShapeState } from '../shape/types.js';
import type { ElementState } from './types.js';

export type ElementSnapshot<T = unknown> = Readonly<ElementState<T>>;

export function createElementSnapshot<T>(shapeRegistry: ShapeRegistry, state: ElementState<T>): ElementSnapshot<T> {
  const cloned = cloneCoreState(state);
  assertCanonicalFields(cloned);
  assertNonEmptyString(cloned.id, 'Element id');
  assertNonEmptyString(cloned.layerId, 'Element layerId');
  if (typeof cloned.visible !== 'boolean') throw new InvalidArgumentError('Element visible must be a boolean');
  if (cloned.style === null || typeof cloned.style !== 'object') throw new InvalidArgumentError('Element style must be an object or native style reference');
  if (cloned.module !== undefined) assertNonEmptyString(cloned.module, 'Element module');
  if (cloned.geometry === null || typeof cloned.geometry !== 'object' || cloned.geometry.type !== cloned.type) {
    throw new InvalidArgumentError('Element type must match geometry type');
  }

  const definition = shapeRegistry.get(cloned.type);
  const normalized = definition.normalize(cloned.geometry);
  if (!definition.isComplete(normalized)) throw new InvalidArgumentError(`Element geometry is incomplete: ${cloned.type}`);
  const finalized = definition.finalize?.(normalized) ?? normalized;
  const geometry = definition.clone(finalized) as ShapeState;
  if (geometry.type !== cloned.type) throw new InvalidArgumentError('Shape definition returned a mismatched geometry type');

  const projected: ElementState<T> = {
    id: cloned.id,
    type: cloned.type,
    geometry,
    style: cloned.style,
    ...(Object.prototype.hasOwnProperty.call(cloned, 'data') ? { data: cloned.data } : {}),
    ...(Object.prototype.hasOwnProperty.call(cloned, 'module') ? { module: cloned.module } : {}),
    layerId: cloned.layerId,
    visible: cloned.visible
  };
  return deepFreeze(cloneCoreState(projected));
}

const canonicalElementFields: ReadonlySet<string> = new Set(['id', 'type', 'geometry', 'style', 'data', 'module', 'layerId', 'visible']);

function assertCanonicalFields(state: ElementState): void {
  if (state === null || typeof state !== 'object') throw new InvalidArgumentError('Element state must be a plain object');
  for (const key of Reflect.ownKeys(state)) {
    if (typeof key !== 'string' || !canonicalElementFields.has(key)) throw new InvalidArgumentError(`Unknown element field: ${String(key)}`);
  }
  for (const required of ['id', 'type', 'geometry', 'style', 'layerId', 'visible']) {
    if (!Object.prototype.hasOwnProperty.call(state, required)) throw new InvalidArgumentError(`Element state requires ${required}`);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
}

function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value) || visited.has(value)) return value;
  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, visited);
  }
  return Object.freeze(value);
}
