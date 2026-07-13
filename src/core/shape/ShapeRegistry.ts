import { CapabilityError, InvalidArgumentError } from '../errors.js';
import { snapshotImmutableSet } from './immutableSet.js';
import { shapeTypes, type ControlPointPolicy, type ShapeCapability, type ShapeDefinition, type ShapeState, type ShapeType } from './types.js';

const canonicalShapeTypes: ReadonlySet<string> = new Set(shapeTypes);
const canonicalCapabilities: ReadonlySet<string> = new Set<ShapeCapability>(['draw', 'edit', 'translate', 'rotate', 'scale', 'vertexEdit', 'anchor', 'path']);

function ownDataSnapshot(input: unknown, label: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object') throw new InvalidArgumentError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const values = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === 'symbol') throw new InvalidArgumentError(`${label} cannot contain symbol properties`);
    const descriptor = descriptors[key];
    if (!('value' in descriptor)) throw new InvalidArgumentError(`${label} cannot contain accessor properties`);
    values[key] = descriptor.value;
  }
  return values;
}

function requiredValue(record: Record<string, unknown>, key: string, label: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key)) throw new InvalidArgumentError(`${label} requires ${key}`);
  return record[key];
}

function requiredFunction(record: Record<string, unknown>, key: string): (...args: never[]) => unknown {
  const value = requiredValue(record, key, 'Shape definition');
  if (typeof value !== 'function') throw new InvalidArgumentError(`Shape definition ${key} must be a function`);
  return value as (...args: never[]) => unknown;
}

function optionalFunction(record: Record<string, unknown>, key: string): ((...args: never[]) => unknown) | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) return undefined;
  if (typeof record[key] !== 'function') throw new InvalidArgumentError(`Shape definition ${key} must be a function`);
  return record[key] as (...args: never[]) => unknown;
}

function parsePolicy(input: unknown): ControlPointPolicy {
  const record = ownDataSnapshot(input, 'Control-point policy');
  const integer = (key: string, optional = false): number | undefined => {
    if (optional && !Object.prototype.hasOwnProperty.call(record, key)) return undefined;
    const value = requiredValue(record, key, 'Control-point policy');
    if (!Number.isInteger(value) || (value as number) < 0) throw new InvalidArgumentError(`Control-point policy ${key} must be a non-negative integer`);
    return value as number;
  };
  const previewMin = integer('previewMin') as number;
  const completeMin = integer('completeMin') as number;
  const completeMax = integer('completeMax', true);
  const autoFinish = integer('autoFinish', true);
  if (completeMax !== undefined && completeMax < completeMin)
    throw new InvalidArgumentError('Control-point policy completeMax must not be less than completeMin');
  return Object.freeze({
    previewMin,
    completeMin,
    ...(completeMax === undefined ? {} : { completeMax }),
    ...(autoFinish === undefined ? {} : { autoFinish })
  });
}

function parseCapability(value: unknown): ShapeCapability {
  if (typeof value !== 'string' || !canonicalCapabilities.has(value)) throw new InvalidArgumentError(`Unknown shape capability: ${String(value)}`);
  return value as ShapeCapability;
}

function snapshotDefinition<S extends ShapeState>(definition: ShapeDefinition<S>): ShapeDefinition<S> {
  const record = ownDataSnapshot(definition, 'Shape definition');
  const rawType = requiredValue(record, 'type', 'Shape definition');
  if (typeof rawType !== 'string' || !canonicalShapeTypes.has(rawType)) throw new InvalidArgumentError(`Unknown shape type: ${String(rawType)}`);
  const type = rawType as S['type'];
  const capabilities = snapshotImmutableSet(requiredValue(record, 'capabilities', 'Shape definition'), parseCapability, 'Shape definition capabilities');
  const policy =
    Object.prototype.hasOwnProperty.call(record, 'controlPointPolicy') && record.controlPointPolicy !== undefined
      ? parsePolicy(record.controlPointPolicy)
      : undefined;
  const finalize = optionalFunction(record, 'finalize');
  const getControlPoints = optionalFunction(record, 'getControlPoints');
  const updateControlPoint = optionalFunction(record, 'updateControlPoint');
  const snapshot = {
    type,
    capabilities,
    ...(policy === undefined ? {} : { controlPointPolicy: policy }),
    normalize: requiredFunction(record, 'normalize'),
    clone: requiredFunction(record, 'clone'),
    isComplete: requiredFunction(record, 'isComplete'),
    ...(finalize === undefined ? {} : { finalize }),
    toRenderGeometry: requiredFunction(record, 'toRenderGeometry'),
    ...(getControlPoints === undefined ? {} : { getControlPoints }),
    ...(updateControlPoint === undefined ? {} : { updateControlPoint })
  } as unknown as ShapeDefinition<S>;
  return Object.freeze(snapshot);
}

export class ShapeRegistry {
  readonly #definitions = new Map<ShapeType, ShapeDefinition>();

  constructor(definitions: readonly ShapeDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register<S extends ShapeState>(definition: ShapeDefinition<S>): void {
    const snapshot = snapshotDefinition(definition);
    const type = snapshot.type as ShapeType;
    if (this.#definitions.has(type)) throw new InvalidArgumentError(`Shape type is already registered: ${type}`);
    this.#definitions.set(type, snapshot as ShapeDefinition);
  }

  get<T extends ShapeType>(type: T): ShapeDefinition<ShapeState<T>> {
    const definition = this.#definitions.get(type);
    if (definition === undefined) throw new CapabilityError(`Shape definition is unavailable: ${String(type)}`);
    return definition as ShapeDefinition<ShapeState<T>>;
  }

  supports(type: ShapeType, capability: ShapeCapability): boolean {
    return this.get(type).capabilities.has(capability);
  }

  types(): readonly ShapeType[] {
    return Object.freeze([...this.#definitions.keys()]);
  }
}
