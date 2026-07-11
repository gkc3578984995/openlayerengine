import { describe, expect, test, vi } from 'vitest';
import { DemoRegistry } from '../.test/harness/demoRegistry';

describe('DemoRegistry', () => {
  test('mounts a demo once and runs its cleanup when disabled', () => {
    const cleanup = vi.fn();
    const mount = vi.fn(() => cleanup);
    const registry = new DemoRegistry([{ id: 'demo', group: 'Base', label: 'Demo', mount }]);

    registry.enable('demo');
    registry.enable('demo');

    expect(mount).toHaveBeenCalledTimes(1);
    expect(registry.isEnabled('demo')).toBe(true);

    registry.disable('demo');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(registry.isEnabled('demo')).toBe(false);
  });
});
