import Earth from './Earth';
import type { UseEarthOptions } from './interface';
import { getRegisteredEarth, registerEarth, unregisterEarth } from './earthContext';

const DEFAULT_TARGET = 'olContainer';

function validateId(id?: string): string | undefined {
  if (id !== undefined && id.trim().length === 0) {
    throw new TypeError('Earth instance ID must not be empty.');
  }
  return id;
}

function getCreationOptions(input?: string | UseEarthOptions): {
  id?: string;
  view?: UseEarthOptions['view'];
  target: string | HTMLElement;
  controls?: UseEarthOptions['controls'];
} {
  if (typeof input === 'string') {
    const id = validateId(input);
    return { id, target: input };
  }

  const id = validateId(input?.id);
  return {
    id,
    view: input?.view,
    target: input?.target ?? id ?? DEFAULT_TARGET,
    controls: input?.controls
  };
}

/**
 * Returns an existing Earth instance for a key, or creates and registers it.
 */
function useEarth(): Earth;
function useEarth(id: string): Earth;
function useEarth(options: UseEarthOptions): Earth;
function useEarth(input?: string | UseEarthOptions): Earth {
  const { id, view, target, controls } = getCreationOptions(input);
  const registeredEarth = getRegisteredEarth(id);
  if (registeredEarth && !registeredEarth.isDestroyed) {
    return registeredEarth;
  }
  if (registeredEarth) {
    unregisterEarth(registeredEarth, id);
  }

  const earth = new Earth(view, { ...controls, target });
  registerEarth(earth, id);
  return earth;
}

/**
 * Destroys and unregisters the Earth instance for a key when it exists.
 */
function destroyEarth(id?: string): void {
  const normalizedId = validateId(id);
  const earth = getRegisteredEarth(normalizedId);
  if (!earth) return;

  if (earth.isDestroyed) {
    unregisterEarth(earth, normalizedId);
    return;
  }
  earth.destroy();
}

export { useEarth, destroyEarth };
export type { UseEarthOptions } from './interface';
