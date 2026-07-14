import { afterEach, describe, expect, it, vi } from 'vitest';
import Earth, { setEarthContextFactoryForTests, type EarthOptions } from '../src/facade/Earth.js';
import { lookupRegisteredEarth, resetEarthRegistryForTests } from '../src/facade/earthRegistry.js';
import { useEarth } from '../src/facade/useEarth.js';
import type { EngineContext } from '../src/internal/EngineContext.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

let restoreFactory: (() => void) | undefined;

afterEach(() => {
  resetEarthRegistryForTests();
  restoreFactory?.();
  restoreFactory = undefined;
});

describe('Earth v2 生命周期', () => {
  coversCapabilities(
    'earth-explicit-unregistered-instance',
    'earth-instance-destroy-recreate',
    'earth-named-instance-get-or-create',
    'earth-destroy-lifecycle'
  );

  it('按 ready、destroying、destroyed 同步迁移且重复销毁为 no-op', () => {
    const owner: { earth?: Earth } = {};
    const observed: string[] = [];
    const destroy = vi.fn(() => observed.push(owner.earth?.lifecycle ?? 'missing'));
    restoreFactory = setEarthContextFactoryForTests((options) => fakeContext(options, destroy));
    const earth = new Earth({ target: 'standalone' });
    owner.earth = earth;

    expect(earth.lifecycle).toBe('ready');
    earth.destroy();
    earth.destroy();

    expect(observed).toEqual(['destroying']);
    expect(destroy).toHaveBeenCalledOnce();
    expect(earth.lifecycle).toBe('destroyed');
    expect(earth.isDestroyed).toBe(true);
  });

  it('底层清理失败时仍终结生命周期并注销注册引用', () => {
    let creation = 0;
    restoreFactory = setEarthContextFactoryForTests((options) => {
      creation += 1;
      return fakeContext(options, () => {
        if (creation === 1) throw new Error('cleanup failed');
      });
    });
    const first = useEarth('planning');

    expect(() => first.destroy()).toThrow('cleanup failed');
    expect(first.lifecycle).toBe('destroyed');
    expect(lookupRegisteredEarth('planning')).toBeUndefined();

    const replacement = useEarth('planning');
    expect(replacement).not.toBe(first);
    expect(replacement.lifecycle).toBe('ready');
  });

  it('销毁命名实例不会注销其他 key 或未注册构造实例', () => {
    restoreFactory = setEarthContextFactoryForTests((options) => fakeContext(options, vi.fn()));
    const first = useEarth('first');
    const second = useEarth('second');
    const standalone = new Earth({ target: 'standalone' });

    first.destroy();

    expect(lookupRegisteredEarth('first')).toBeUndefined();
    expect(lookupRegisteredEarth('second')?.earth).toBe(second);
    expect(standalone.lifecycle).toBe('ready');
    second.destroy();
    standalone.destroy();
  });
});

function fakeContext(options: EarthOptions, destroy: () => void): EngineContext {
  const service = (): object => Object.freeze({});
  return {
    map: service() as EngineContext['map'],
    olView: service() as EngineContext['olView'],
    viewport: service() as EngineContext['viewport'],
    target: options.target ?? 'olContainer',
    elements: service() as EngineContext['elements'],
    layers: service() as EngineContext['layers'],
    styles: service() as EngineContext['styles'],
    animations: service() as EngineContext['animations'],
    draw: service() as EngineContext['draw'],
    transform: service() as EngineContext['transform'],
    measure: service() as EngineContext['measure'],
    events: service() as EngineContext['events'],
    contextMenu: service() as EngineContext['contextMenu'],
    overlays: service() as EngineContext['overlays'],
    view: service() as EngineContext['view'],
    controls: service() as EngineContext['controls'],
    destroy
  };
}
