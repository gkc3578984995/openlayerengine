import Earth, { normalizeEarthOptions, type EarthOptions } from './Earth.js';
import { conflictingEarthOptions, lookupRegisteredEarth, registerEarth, reportEarthWarning, unregisterEarth } from './earthRegistry.js';

const DEFAULT_TARGET = 'olContainer';

type ConfigurableEarthOption = 'target' | 'view' | 'controls';

export interface UseEarthOptions extends EarthOptions {
  readonly id?: string;
}

interface EarthRequest {
  readonly id?: string;
  readonly options: EarthOptions;
  readonly explicitOptions: ReadonlySet<ConfigurableEarthOption>;
}

export function useEarth(): Earth;
export function useEarth(id: string): Earth;
export function useEarth(options: UseEarthOptions): Earth;
export function useEarth(input?: string | UseEarthOptions): Earth {
  const request = inspectRequest(input);
  const registered = lookupRegisteredEarth(request.id);
  if (registered?.earth.lifecycle === 'ready') {
    const conflicts = conflictingEarthOptions(registered, request.options, request.explicitOptions);
    if (conflicts.length > 0) {
      reportEarthWarning(
        `useEarth(${request.id === undefined ? 'default' : JSON.stringify(request.id)}) ignored conflicting options for the existing Earth: ${conflicts.join(', ')}.`
      );
    }
    return registered.earth;
  }
  if (registered !== undefined) unregisterEarth(registered.earth);

  const earth = new Earth(request.options);
  try {
    registerEarth(earth, request.id, request.options);
  } catch (error) {
    earth.destroy();
    throw error;
  }
  return earth;
}

function inspectRequest(input?: string | UseEarthOptions): EarthRequest {
  if (typeof input === 'string') {
    const id = validId(input);
    return { id, options: Object.freeze({ target: id }), explicitOptions: new Set() };
  }
  if (input === undefined) return { options: Object.freeze({ target: DEFAULT_TARGET }), explicitOptions: new Set() };

  const record = inspectOptionsRecord(input);
  const id = record.id === undefined ? undefined : validId(record.id);
  const explicitOptions = new Set<ConfigurableEarthOption>();
  if (record.target !== undefined) explicitOptions.add('target');
  if (record.view !== undefined) explicitOptions.add('view');
  if (record.controls !== undefined) explicitOptions.add('controls');
  return {
    ...(id === undefined ? {} : { id }),
    options: normalizeEarthOptions({
      target: record.target === undefined ? (id ?? DEFAULT_TARGET) : (record.target as EarthOptions['target']),
      ...(record.view === undefined ? {} : { view: record.view as EarthOptions['view'] }),
      ...(record.controls === undefined ? {} : { controls: record.controls as EarthOptions['controls'] })
    }),
    explicitOptions
  };
}

function validId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError('Earth instance ID must be a non-empty string.');
  return value;
}

function inspectOptionsRecord(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('useEarth options must be a plain object.');
  let prototype: object | null;
  let keys: PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(input);
    keys = Reflect.ownKeys(input);
  } catch {
    throw new TypeError('useEarth options must be inspectable.');
  }
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('useEarth options must be a plain object.');
  const allowed = new Set(['id', 'target', 'view', 'controls']);
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new TypeError(`Unknown useEarth options field: ${String(key)}.`);
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(input, key);
    } catch {
      throw new TypeError('useEarth options must be inspectable.');
    }
    if (descriptor === undefined || !('value' in descriptor)) throw new TypeError('useEarth options cannot contain accessor properties.');
    record[key] = descriptor.value;
  }
  return record;
}
