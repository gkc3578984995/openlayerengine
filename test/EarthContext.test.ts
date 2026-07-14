import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Earth, { setEarthContextFactoryForTests, type EarthOptions } from '../src/facade/Earth.js';
import { resetEarthRegistryForTests } from '../src/facade/earthRegistry.js';
import { useEarth } from '../src/facade/useEarth.js';
import type { EngineContext } from '../src/internal/EngineContext.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

interface ContextRecord {
  readonly context: EngineContext;
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

describe('Earth 显式上下文', () => {
  coversCapabilities('earth-default-instance-get-or-create', 'earth-owned-service-reuse', 'earth-default-context-resolution');

  it('默认注册表复用同一 Earth，并由该实例显式持有完整服务树', () => {
    const earth = useEarth();
    const record = records[0];
    if (record === undefined) throw new Error('缺少 EngineContext 测试记录');

    expect(useEarth()).toBe(earth);
    expect(records).toHaveLength(1);
    expect(record.options.target).toBe('olContainer');
    expect(earth.map).toBe(record.context.map);
    expect(earth.elements).toBe(record.context.elements);
    expect(earth.layers).toBe(record.context.layers);
    expect(earth.transform).toBe(record.context.transform);
    expect(earth.overlays).toBe(record.context.overlays);
  });

  it('直接构造的 Earth 使用独立上下文且不会替换默认注册实例', () => {
    const registered = useEarth();
    const standalone = new Earth({ target: 'standalone' });

    expect(useEarth()).toBe(registered);
    expect(standalone).not.toBe(registered);
    expect(standalone.layers).toBe(records[1]?.context.layers);
    expect(standalone.layers).not.toBe(registered.layers);

    standalone.destroy();
    expect(records[1]?.destroy).toHaveBeenCalledOnce();
  });
});

function createContext(options: EarthOptions): EngineContext {
  const service = (): object => Object.freeze({});
  const destroy = vi.fn();
  const context = {
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
  records.push({ context, options, destroy });
  return context;
}
