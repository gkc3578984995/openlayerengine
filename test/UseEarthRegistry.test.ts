import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Earth, { setEarthContextFactoryForTests, type EarthOptions } from '../src/facade/Earth.js';
import { lookupRegisteredEarth, resetEarthRegistryForTests } from '../src/facade/earthRegistry.js';
import { useEarth } from '../src/facade/useEarth.js';
import type { EngineContext } from '../src/internal/EngineContext.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

interface ContextRecord {
  readonly options: EarthOptions;
  readonly destroy: ReturnType<typeof vi.fn>;
}

const records: ContextRecord[] = [];
let restoreFactory: (() => void) | undefined;

beforeEach(() => {
  records.length = 0;
  restoreFactory = setEarthContextFactoryForTests((options) => createContext(options));
});

afterEach(() => {
  resetEarthRegistryForTests();
  restoreFactory?.();
  restoreFactory = undefined;
});

describe('useEarth v2 实例注册表', () => {
  coversCapabilities(
    'earth-default-instance-get-or-create',
    'earth-named-instance-get-or-create',
    'earth-instance-options-routing',
    'earth-instance-destroy-recreate',
    'earth-explicit-unregistered-instance'
  );

  it('创建并复用默认实例', () => {
    const first = useEarth();

    expect(useEarth()).toBe(first);
    expect(records).toHaveLength(1);
    expect(records[0]?.options).toEqual({ target: 'olContainer' });
  });

  it('按名称创建、隔离并复用实例，名称同时作为默认 target', () => {
    const first = useEarth('first');
    const second = useEarth('second');

    expect(useEarth('first')).toBe(first);
    expect(useEarth('second')).toBe(second);
    expect(first).not.toBe(second);
    expect(records.map(({ options }) => options.target)).toEqual(['first', 'second']);
  });

  it('把 target、view 与 controls 路由到命名实例的首次创建', () => {
    const view = { center: [1, 2], zoom: 8 };
    const controls = { zoom: true };
    const earth = useEarth({ id: 'compare', target: 'compare-target', view, controls });

    expect(useEarth('compare')).toBe(earth);
    expect(records[0]?.options).toEqual({ target: 'compare-target', view, controls });
  });

  it('省略 target 时使用命名 ID，省略 ID 时配置默认实例', () => {
    const named = useEarth({ id: 'compare' });
    const configuredDefault = useEarth({ target: 'custom-default', view: { zoom: 6 } });

    expect(named.target).toBe('compare');
    expect(useEarth('compare')).toBe(named);
    expect(configuredDefault.target).toBe('custom-default');
    expect(useEarth()).toBe(configuredDefault);
  });

  it('销毁后立即按相同 key 创建新实例', () => {
    const first = useEarth('compare');
    first.destroy();
    const replacement = useEarth('compare');

    expect(first.lifecycle).toBe('destroyed');
    expect(records[0]?.destroy).toHaveBeenCalledOnce();
    expect(replacement).not.toBe(first);
    expect(lookupRegisteredEarth('compare')?.earth).toBe(replacement);
  });

  it('重复销毁旧实例不会注销已经注册的替代实例', () => {
    const first = useEarth('compare');
    first.destroy();
    const replacement = useEarth('compare');

    first.destroy();

    expect(records[0]?.destroy).toHaveBeenCalledOnce();
    expect(useEarth('compare')).toBe(replacement);
  });

  it('销毁一个命名实例不会影响其他名称', () => {
    const first = useEarth('first');
    const second = useEarth('second');

    first.destroy();

    expect(useEarth('first')).not.toBe(first);
    expect(useEarth('second')).toBe(second);
  });

  it('直接构造的 Earth 不进入注册表', () => {
    const standalone = new Earth({ target: 'standalone' });

    expect(lookupRegisteredEarth()).toBeUndefined();
    expect(lookupRegisteredEarth('standalone')).toBeUndefined();
    expect(useEarth()).not.toBe(standalone);
    standalone.destroy();
  });

  it('拒绝空白名称', () => {
    expect(() => useEarth('  ')).toThrow(TypeError);
    expect(() => useEarth({ id: '' })).toThrow(TypeError);
  });
});

function createContext(options: EarthOptions): EngineContext {
  const service = (): object => Object.freeze({});
  const destroy = vi.fn();
  records.push({ options, destroy });
  return {
    map: service(),
    olView: service(),
    viewport: service(),
    target: options.target ?? 'olContainer',
    elements: service(),
    layers: service(),
    styles: service(),
    animations: service(),
    draw: service(),
    transform: service(),
    measure: service(),
    events: service(),
    contextMenu: service(),
    overlays: service(),
    view: service(),
    controls: service(),
    destroy
  } as EngineContext;
}
