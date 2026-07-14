import { describe, expect, it } from 'vitest';
import { ObjectDisposedError } from '../src/core/errors.js';
import { addElement, createTransformHarness } from './helpers/transformHarness.js';

describe('Transform 生命周期', () => {
  it('销毁服务时仅释放自身会话注册的交互与键盘监听', () => {
    const harness = createTransformHarness();
    addElement(harness, 'point-a', 'point', [[1, 2]]);
    const session = harness.service.select('point-a');
    const interaction = harness.interaction.handle;

    expect(harness.input.listener).toBeDefined();
    expect(harness.coordinator.active).toBeDefined();

    harness.service.destroy();

    expect(session.status).toBe('cancelled');
    expect(interaction?.destroyed).toBe(true);
    expect(harness.input.listener).toBeUndefined();
    expect(harness.coordinator.active).toBeUndefined();
    expect(() => harness.service.start()).toThrow(ObjectDisposedError);
  });
});
