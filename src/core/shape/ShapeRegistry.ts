import { CapabilityError, InvalidArgumentError } from '../errors.js';
import { snapshotImmutableSet } from './immutableSet.js';
import {
  shapeTypes,
  type ControlPointPolicy,
  type ShapeCapability,
  type ShapeDefinition,
  type ShapeEditTopology,
  type ShapeFreehandPolicy,
  type ShapeState,
  type ShapeType
} from './types.js';

const canonicalShapeTypes: ReadonlySet<string> = new Set(shapeTypes);
const canonicalCapabilities: ReadonlySet<string> = new Set<ShapeCapability>([
  'draw',
  'edit',
  'translate',
  'rotate',
  'scale',
  'vertexEdit',
  'controlPointInsert',
  'controlPointRemove',
  'freehand',
  'anchor',
  'path'
]);

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

function requiredFunction(record: Record<string, unknown>, key: string, label = 'Shape definition'): (...args: never[]) => unknown {
  const value = requiredValue(record, key, label);
  if (typeof value !== 'function') throw new InvalidArgumentError(`${label} ${key} must be a function`);
  return value as (...args: never[]) => unknown;
}

function optionalFunction(record: Record<string, unknown>, key: string, label = 'Shape definition'): ((...args: never[]) => unknown) | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) return undefined;
  if (typeof record[key] !== 'function') throw new InvalidArgumentError(`${label} ${key} must be a function`);
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

function parseEditTopology<S extends ShapeState>(input: unknown): ShapeEditTopology<S> {
  const record = ownDataSnapshot(input, 'Shape edit topology');
  const insert = optionalFunction(record, 'insert', 'Shape edit topology');
  const remove = optionalFunction(record, 'remove', 'Shape edit topology');
  return Object.freeze({
    describe: requiredFunction(record, 'describe', 'Shape edit topology'),
    move: requiredFunction(record, 'move', 'Shape edit topology'),
    ...(insert === undefined ? {} : { insert }),
    ...(remove === undefined ? {} : { remove })
  }) as unknown as ShapeEditTopology<S>;
}

function parseFreehandPolicy<S extends ShapeState>(input: unknown): ShapeFreehandPolicy<S> {
  const record = ownDataSnapshot(input, 'Shape freehand policy');
  return Object.freeze({
    appendSample: requiredFunction(record, 'appendSample', 'Shape freehand policy'),
    normalizeSamples: requiredFunction(record, 'normalizeSamples', 'Shape freehand policy')
  }) as unknown as ShapeFreehandPolicy<S>;
}

function assertCapabilityContracts<S extends ShapeState>(
  capabilities: ReadonlySet<ShapeCapability>,
  editTopology?: ShapeEditTopology<S>,
  freehand?: ShapeFreehandPolicy<S>
): void {
  const requireExact = (capability: ShapeCapability, implemented: boolean): void => {
    if (capabilities.has(capability) !== implemented) {
      throw new InvalidArgumentError(`Shape capability ${capability} must match its semantic operation`);
    }
  };

  requireExact('vertexEdit', editTopology !== undefined);
  requireExact('controlPointInsert', editTopology?.insert !== undefined);
  requireExact('controlPointRemove', editTopology?.remove !== undefined);
  requireExact('freehand', freehand !== undefined);
  if (capabilities.has('vertexEdit') && !capabilities.has('edit')) {
    throw new InvalidArgumentError('Vertex-edit capability requires edit capability');
  }
  if ((capabilities.has('controlPointInsert') || capabilities.has('controlPointRemove')) && !capabilities.has('edit')) {
    throw new InvalidArgumentError('Structural control-point capabilities require edit capability');
  }
  if (capabilities.has('freehand') && !capabilities.has('draw')) {
    throw new InvalidArgumentError('Freehand capability requires draw capability');
  }
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
  const editTopology =
    Object.prototype.hasOwnProperty.call(record, 'editTopology') && record.editTopology !== undefined ? parseEditTopology<S>(record.editTopology) : undefined;
  const freehand =
    Object.prototype.hasOwnProperty.call(record, 'freehand') && record.freehand !== undefined ? parseFreehandPolicy<S>(record.freehand) : undefined;
  assertCapabilityContracts(capabilities, editTopology, freehand);
  const snapshot = {
    type,
    capabilities,
    ...(policy === undefined ? {} : { controlPointPolicy: policy }),
    ...(editTopology === undefined ? {} : { editTopology }),
    ...(freehand === undefined ? {} : { freehand }),
    createDraft: requiredFunction(record, 'createDraft'),
    normalize: requiredFunction(record, 'normalize'),
    clone: requiredFunction(record, 'clone'),
    isComplete: requiredFunction(record, 'isComplete'),
    tryComplete: requiredFunction(record, 'tryComplete'),
    toRenderGeometry: requiredFunction(record, 'toRenderGeometry')
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
