import { afterEach, describe, expect, it, vi } from 'vitest';

const earthConstructor = vi.hoisted(() => vi.fn());

vi.mock('../src/Earth', () => ({
  default: class MockEarth {
    isDestroyed = false;

    constructor(view?: unknown, options?: unknown) {
      earthConstructor(view, options);
    }

    destroy(): void {
      this.isDestroyed = true;
    }
  }
}));

import { destroyEarth, useEarth } from '../src/useEarth';

const namedIds = ['compare', 'first', 'second'];

afterEach(() => {
  destroyEarth();
  namedIds.forEach((id) => destroyEarth(id));
  earthConstructor.mockClear();
});

describe('useEarth registry', () => {
  it('creates and reuses the default Earth', () => {
    const first = useEarth();

    expect(useEarth()).toBe(first);
    expect(earthConstructor).toHaveBeenCalledOnce();
    expect(earthConstructor).toHaveBeenCalledWith(undefined, { target: 'olContainer' });
  });

  it('creates and reuses named Earth instances', () => {
    const first = useEarth('compare');

    expect(useEarth('compare')).toBe(first);
    expect(first).not.toBe(useEarth());
    expect(earthConstructor).toHaveBeenNthCalledWith(1, undefined, { target: 'compare' });
  });

  it('uses options to create a named Earth', () => {
    const first = useEarth({ id: 'compare', target: 'compare-target', view: { zoom: 8 }, controls: { zoom: true } });

    expect(useEarth('compare')).toBe(first);
    expect(earthConstructor).toHaveBeenCalledWith({ zoom: 8 }, { target: 'compare-target', zoom: true });
  });

  it('uses the named ID as the options target when target is omitted', () => {
    useEarth({ id: 'compare' });

    expect(earthConstructor).toHaveBeenCalledWith(undefined, { target: 'compare' });
  });

  it('recreates a named instance after destroy', () => {
    const first = useEarth('compare');

    first.destroy();

    expect(useEarth('compare')).not.toBe(first);
  });

  it('destroys and recreates the default instance', () => {
    const first = useEarth();

    destroyEarth();

    expect(first.isDestroyed).toBe(true);
    expect(useEarth()).not.toBe(first);
  });

  it('destroys only the requested named instance', () => {
    const first = useEarth('first');
    const second = useEarth('second');

    destroyEarth('first');

    expect(first.isDestroyed).toBe(true);
    expect(useEarth('first')).not.toBe(first);
    expect(useEarth('second')).toBe(second);
  });

  it('treats missing instances as no-ops when destroying', () => {
    expect(() => destroyEarth('compare')).not.toThrow();
    expect(() => destroyEarth()).not.toThrow();
  });

  it('rejects empty string IDs', () => {
    expect(() => useEarth('  ')).toThrow(TypeError);
    expect(() => useEarth({ id: '' })).toThrow(TypeError);
  });

  it('recreates instances already marked as destroyed', () => {
    const first = useEarth('compare');
    first.isDestroyed = true;

    expect(useEarth('compare')).not.toBe(first);
  });

  it('keeps a replacement registered when the old instance is destroyed again', () => {
    const first = useEarth('compare');
    first.isDestroyed = true;
    const replacement = useEarth('compare');

    first.destroy();

    expect(useEarth('compare')).toBe(replacement);
  });

  it('isolates instances registered under different names', () => {
    expect(useEarth('first')).not.toBe(useEarth('second'));
  });
});
