import { describe, expect, it } from 'vitest';
import { CursorAdapter } from '../src/adapters/dom/CursorAdapter.js';

/** 构造满足 CursorAdapter 最小样式契约的测试视口。 */
function viewport(cursor: string): HTMLElement {
  return { style: { cursor } } as HTMLElement;
}

describe('CursorAdapter', () => {
  it('restores the cursor captured before the interaction across reset and destroy', () => {
    const element = viewport('crosshair');
    const handle = new CursorAdapter(element).open();

    handle.set('pointer');
    expect(element.style.cursor).toBe('pointer');

    handle.reset();
    expect(element.style.cursor).toBe('crosshair');

    handle.set('move');
    expect(element.style.cursor).toBe('move');

    handle.destroy();
    expect(element.style.cursor).toBe('crosshair');

    handle.destroy();
    handle.set('grabbing');
    expect(element.style.cursor).toBe('crosshair');
  });

  it('preserves an external cursor update made while an interaction override is active', () => {
    const element = viewport('auto');
    const handle = new CursorAdapter(element).open();

    handle.set('pointer');
    element.style.cursor = 'wait';
    handle.destroy();

    expect(element.style.cursor).toBe('wait');
  });

  it('uses the latest external cursor as the base for later overrides and reset', () => {
    const element = viewport('auto');
    const handle = new CursorAdapter(element).open();

    handle.set('pointer');
    element.style.cursor = 'help';
    handle.set('move');
    expect(element.style.cursor).toBe('move');

    handle.reset();
    expect(element.style.cursor).toBe('help');
  });

  it('preserves a ViewService base update even when it equals the active override', () => {
    const element = viewport('crosshair');
    const adapter = new CursorAdapter(element);
    const handle = adapter.open();

    handle.set('move');
    adapter.setBase('move');
    handle.destroy();

    expect(element.style.cursor).toBe('move');
  });
});
