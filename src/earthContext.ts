import type Earth from './Earth';

const defaultEarthKey = Symbol('defaultEarth');
const earthRegistry = new Map<string | symbol, Earth>();
const wrappedEarths = new WeakSet<Earth>();

function getRegistryKey(id?: string): string | symbol {
  return id ?? defaultEarthKey;
}

function wrapDestroy(earth: Earth): void {
  if (wrappedEarths.has(earth)) return;

  const rawDestroy = earth.destroy.bind(earth);
  earth.destroy = () => {
    try {
      rawDestroy();
    } finally {
      earthRegistry.forEach((registeredEarth, key) => {
        if (registeredEarth === earth) {
          earthRegistry.delete(key);
        }
      });
    }
  };
  wrappedEarths.add(earth);
}

export function getRegisteredEarth(id?: string): Earth | undefined {
  return earthRegistry.get(getRegistryKey(id));
}

export function registerEarth(earth: Earth, id?: string): void {
  earthRegistry.set(getRegistryKey(id), earth);
  wrapDestroy(earth);
}

export function unregisterEarth(earth: Earth, id?: string): void {
  const key = getRegistryKey(id);
  if (earthRegistry.get(key) === earth) {
    earthRegistry.delete(key);
  }
}

export function getDefaultEarth(): Earth {
  const earth = earthRegistry.get(defaultEarthKey);
  if (!earth || earth.isDestroyed) {
    if (earth) earthRegistry.delete(defaultEarthKey);
    throw new Error('Default Earth is not registered. Call useEarth() before constructing a feature without an explicit Earth instance.');
  }
  return earth;
}
