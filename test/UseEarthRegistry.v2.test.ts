import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Earth, { setEarthContextFactoryForTests, type EarthOptions } from '../src/facade/Earth.js';
import { lookupRegisteredEarth, resetEarthRegistryForTests, setEarthWarningReporterForTests } from '../src/facade/earthRegistry.js';
import { useEarth, type UseEarthOptions } from '../src/facade/useEarth.js';

interface FakeContextRecord {
  readonly options: EarthOptions;
  destroyCount: number;
  onDestroy?: () => void;
  destroyError?: unknown;
}

const contexts: FakeContextRecord[] = [];
let restoreFactory: (() => void) | undefined;
let restoreReporter: (() => void) | undefined;

beforeEach(() => {
  contexts.length = 0;
  restoreFactory = setEarthContextFactoryForTests((options) => createFakeContext(options) as never);
});

afterEach(() => {
  resetEarthRegistryForTests();
  restoreReporter?.();
  restoreReporter = undefined;
  restoreFactory?.();
  restoreFactory = undefined;
});

describe('useEarth v2 registry', () => {
  it('提供三个固定重载', () => {
    const overloads: {
      (): Earth;
      (id: string): Earth;
      (options: UseEarthOptions): Earth;
    } = useEarth;

    expect(overloads).toBe(useEarth);
  });

  it('创建并复用默认实例', () => {
    const first = useEarth();

    expect(useEarth()).toBe(first);
    expect(first.target).toBe('olContainer');
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.options.target).toBe('olContainer');
  });

  it('按名称隔离并复用实例，名称同时作为默认 target', () => {
    const planning = useEarth('planning');
    const analytics = useEarth('analytics');

    expect(useEarth('planning')).toBe(planning);
    expect(planning).not.toBe(analytics);
    expect(planning.target).toBe('planning');
    expect(analytics.target).toBe('analytics');
    expect(contexts.map(({ options }) => options.target)).toEqual(['planning', 'analytics']);
  });

  it('首次创建时路由 target、view 和 controls', () => {
    const view = { zoom: 8 };
    const controls = { zoom: true };
    const earth = useEarth({ id: 'planning', target: 'planning-map', view, controls });

    expect(useEarth('planning')).toBe(earth);
    expect(contexts[0]?.options).toEqual({ target: 'planning-map', view, controls });
  });

  it('销毁后立即按同一 key 创建新实例', () => {
    const first = useEarth('planning');

    first.destroy();
    const replacement = useEarth('planning');

    expect(first.lifecycle).toBe('destroyed');
    expect(first.isDestroyed).toBe(true);
    expect(replacement).not.toBe(first);
    expect(contexts[0]?.destroyCount).toBe(1);
    expect(contexts).toHaveLength(2);
  });

  it('旧实例的重复销毁不会注销替代实例', () => {
    const first = useEarth('planning');
    first.destroy();
    const replacement = useEarth('planning');

    first.destroy();

    expect(useEarth('planning')).toBe(replacement);
  });

  it('销毁期间创建的替代实例不会被旧实例的 finally 注销', () => {
    const first = useEarth('planning');
    let replacement: Earth | undefined;
    const firstContext = contexts[0];
    if (firstContext === undefined) throw new Error('缺少测试上下文');
    firstContext.onDestroy = () => {
      replacement = useEarth('planning');
    };

    first.destroy();

    expect(replacement).toBeInstanceOf(Earth);
    expect(replacement).not.toBe(first);
    expect(useEarth('planning')).toBe(replacement);
  });

  it('new Earth 创建自管实例且不会进入注册表', () => {
    const explicit = new Earth({ target: 'explicit' });

    expect(lookupRegisteredEarth()).toBeUndefined();
    expect(lookupRegisteredEarth('explicit')).toBeUndefined();
    expect(useEarth()).not.toBe(explicit);
    explicit.destroy();
  });

  it('已有实例收到冲突 options 时保持引用并在非生产环境报告一次 warning', () => {
    const warning = vi.fn();
    restoreReporter = setEarthWarningReporterForTests(warning);
    const first = useEarth({ id: 'planning', target: 'first', view: { zoom: 4 }, controls: { zoom: false } });

    const existing = useEarth({ id: 'planning', target: 'second', view: { zoom: 7 }, controls: { zoom: true } });

    expect(existing).toBe(first);
    expect(contexts).toHaveLength(1);
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0]?.[0]).toContain('target, view, controls');
  });

  it('重复传入等价 options 或仅用 id 获取时不报告 warning', () => {
    const warning = vi.fn();
    restoreReporter = setEarthWarningReporterForTests(warning);
    const first = useEarth({ id: 'planning', target: 'map', view: { center: [1, 2], zoom: 4 }, controls: { zoom: false } });

    expect(useEarth({ id: 'planning', target: 'map', view: { center: [1, 2], zoom: 4 }, controls: { zoom: false } })).toBe(first);
    expect(useEarth('planning')).toBe(first);
    expect(warning).not.toHaveBeenCalled();
  });

  it('生产环境忽略冲突但不报告 warning', () => {
    const previous = process.env.NODE_ENV;
    const warning = vi.fn();
    restoreReporter = setEarthWarningReporterForTests(warning);
    process.env.NODE_ENV = 'production';
    try {
      const first = useEarth({ id: 'planning', target: 'first' });
      expect(useEarth({ id: 'planning', target: 'second' })).toBe(first);
      expect(warning).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('拒绝空 id、未知字段和 accessor，且不执行 getter', () => {
    const getter = vi.fn(() => 'planning');
    const accessor = Object.defineProperty({}, 'id', { enumerable: true, get: getter });

    expect(() => useEarth('   ')).toThrow(TypeError);
    expect(() => useEarth({ id: '' })).toThrow(TypeError);
    expect(() => useEarth({ id: 'planning', unknown: true } as never)).toThrow(TypeError);
    expect(() => useEarth(accessor as UseEarthOptions)).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('拒绝嵌套 view 和 controls accessor，且不执行 getter', () => {
    const viewGetter = vi.fn(() => 8);
    const controlsGetter = vi.fn(() => true);
    const view = Object.defineProperty({}, 'zoom', { enumerable: true, get: viewGetter });
    const controls = Object.defineProperty({}, 'zoom', { enumerable: true, get: controlsGetter });

    expect(() => useEarth({ id: 'view-accessor', view })).toThrow(TypeError);
    expect(() => useEarth({ id: 'controls-accessor', controls })).toThrow(TypeError);
    expect(viewGetter).not.toHaveBeenCalled();
    expect(controlsGetter).not.toHaveBeenCalled();
  });

  it('已有实例时仍完整校验 target、view 和嵌套配置', () => {
    const first = useEarth({ id: 'planning', target: 'map' });
    const getter = vi.fn(() => 8);
    const view = Object.defineProperty({}, 'zoom', { enumerable: true, get: getter });

    expect(() => useEarth({ id: 'planning', target: 123 } as never)).toThrow(TypeError);
    expect(() => useEarth({ id: 'planning', target: null } as never)).toThrow(TypeError);
    expect(() => useEarth({ id: 'planning', view: null } as never)).toThrow(TypeError);
    expect(() => useEarth({ id: 'planning', view })).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
    expect(useEarth('planning')).toBe(first);
    expect(contexts).toHaveLength(1);
  });

  it('Earth 递归复制并冻结普通配置，同时拒绝嵌套 accessor', () => {
    const center = [1, 2];
    const options = { center, zoom: 4 };
    const earth = new Earth({ target: 'map', view: options });
    const received = contexts[0]?.options.view as { readonly center: readonly number[]; readonly zoom: number };

    center[0] = 99;
    options.zoom = 8;
    expect(received).toEqual({ center: [1, 2], zoom: 4 });
    expect(Object.isFrozen(received)).toBe(true);
    expect(Object.isFrozen(received.center)).toBe(true);

    const getter = vi.fn(() => 'EPSG:3857');
    const projection = Object.defineProperty({}, 'code', { enumerable: true, get: getter });
    expect(() => new Earth({ view: { projection } as never })).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
    earth.destroy();
  });

  it('公开 useEarth 模块不提供 createEarth、getEarth 或 destroyEarth', async () => {
    const publicModule = await import('../src/facade/useEarth.js');

    expect(publicModule).not.toHaveProperty('createEarth');
    expect(publicModule).not.toHaveProperty('getEarth');
    expect(publicModule).not.toHaveProperty('destroyEarth');
  });
});

function createFakeContext(options: EarthOptions): object {
  const record: FakeContextRecord = { options, destroyCount: 0 };
  contexts.push(record);
  const service = (): object => Object.freeze({});
  return {
    map: service(),
    target: options.target,
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
    destroy: () => {
      record.destroyCount += 1;
      record.onDestroy?.();
      if (record.destroyError !== undefined) throw record.destroyError;
    }
  };
}
