import type Earth from './Earth';

let defaultEarthProvider: (() => Earth) | undefined;

export function setDefaultEarthProvider(provider: () => Earth): void {
  defaultEarthProvider = provider;
}

export function getDefaultEarth(): Earth {
  if (!defaultEarthProvider) {
    throw new Error('Default Earth provider is not registered. Pass an Earth instance explicitly or import useEarth first.');
  }
  return defaultEarthProvider();
}
