import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserPrintAdapter } from '../src/adapters/dom/BrowserPrintAdapter.js';

class FakeImageElement {
  decode = vi.fn(async (): Promise<void> => undefined);
}

class FakePrintWindow {
  readonly focus = vi.fn();
  readonly print = vi.fn();
  readonly #listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  dispatch(type: string): void {
    const listeners = [...(this.#listeners.get(type) ?? [])];
    this.#listeners.delete(type);
    for (const listener of listeners) listener();
  }
}

class FakePrintDocument {
  readonly open = vi.fn();
  readonly close = vi.fn();
  written = '';

  constructor(readonly image: FakeImageElement) {}

  write(value: string): void {
    this.written += value;
  }

  querySelector(selector: string): FakeImageElement | null {
    return selector === 'img' ? this.image : null;
  }
}

class FakeFrame {
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly contentWindow = new FakePrintWindow();
  readonly contentDocument: FakePrintDocument;
  className = '';
  removed = false;

  constructor(image: FakeImageElement) {
    this.contentDocument = new FakePrintDocument(image);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  remove(): void {
    this.removed = true;
  }
}

const originalDocument = globalThis.document;
const originalUrl = globalThis.URL;
const originalImageElement = globalThis.HTMLImageElement;
let image: FakeImageElement;
let frame: FakeFrame;
let append: ReturnType<typeof vi.fn>;
let createObjectUrl: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  image = new FakeImageElement();
  frame = new FakeFrame(image);
  append = vi.fn();
  createObjectUrl = vi.fn(() => 'blob:print-page');
  revokeObjectUrl = vi.fn();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { body: { append }, createElement: (tagName: string) => (tagName === 'iframe' ? frame : undefined) }
  });
  Object.defineProperty(globalThis, 'URL', { configurable: true, value: { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl } });
  Object.defineProperty(globalThis, 'HTMLImageElement', { configurable: true, value: FakeImageElement });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, 'URL', { configurable: true, value: originalUrl });
  Object.defineProperty(globalThis, 'HTMLImageElement', { configurable: true, value: originalImageElement });
});

describe('BrowserPrintAdapter', () => {
  it('writes an exact millimetre page and releases the frame after afterprint', async () => {
    const adapter = new BrowserPrintAdapter();

    await adapter.print(request({ documentTitle: '<行动图>' }));

    expect(append).toHaveBeenCalledWith(frame);
    expect(frame.contentDocument.written).toContain('<title>&lt;行动图&gt;</title>');
    expect(frame.contentDocument.written).toContain('@page{size:297mm 210mm;margin:0}');
    expect(frame.contentDocument.written).toContain('src="blob:print-page"');
    expect(image.decode).toHaveBeenCalledOnce();
    expect(frame.contentWindow.focus).toHaveBeenCalledOnce();
    expect(frame.contentWindow.print).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    frame.contentWindow.dispatch('afterprint');
    expect(frame.removed).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:print-page');
    adapter.destroy();
  });

  it('cancels a pending image decode and cleans every owned resource', async () => {
    image.decode.mockReturnValue(new Promise<void>(() => undefined));
    const controller = new AbortController();
    const adapter = new BrowserPrintAdapter();
    const pending = adapter.print(request({ signal: controller.signal }));
    await Promise.resolve();

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(frame.removed).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
    adapter.destroy();
  });

  it('times out a decode that never settles', async () => {
    vi.useFakeTimers();
    image.decode.mockReturnValue(new Promise<void>(() => undefined));
    const adapter = new BrowserPrintAdapter();
    const pending = adapter.print(request({ timeoutMs: 25 }));
    const rejection = expect(pending).rejects.toMatchObject({ code: 'resource-timeout' });
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(30);

    await rejection;
    expect(frame.removed).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
    adapter.destroy();
  });

  it('settles a pending decode immediately when destroyed', async () => {
    image.decode.mockReturnValue(new Promise<void>(() => undefined));
    const adapter = new BrowserPrintAdapter();
    const pending = adapter.print(request({ timeoutMs: 60_000 }));
    const rejection = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await Promise.resolve();

    adapter.destroy();

    await rejection;
    expect(frame.removed).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
  });

  it('wraps a blocked print call and destroy releases a frame awaiting afterprint', async () => {
    frame.contentWindow.print.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    const blocked = new BrowserPrintAdapter();
    await expect(blocked.print(request())).rejects.toMatchObject({ code: 'print-window-blocked' });
    expect(frame.removed).toBe(true);
    blocked.destroy();

    image = new FakeImageElement();
    frame = new FakeFrame(image);
    const retained = new BrowserPrintAdapter();
    await retained.print(request());
    expect(frame.removed).toBe(false);
    retained.destroy();
    retained.destroy();
    expect(frame.removed).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
  });

  it('wraps object URL creation failures without retaining a frame', async () => {
    createObjectUrl.mockImplementationOnce(() => {
      throw new Error('url unavailable');
    });
    const adapter = new BrowserPrintAdapter();

    await expect(adapter.print(request())).rejects.toMatchObject({ code: 'print-window-blocked' });

    expect(append).not.toHaveBeenCalled();
    expect(frame.removed).toBe(false);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    adapter.destroy();
  });

  it('revokes the object URL when iframe creation fails', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        body: { append },
        createElement: () => {
          throw new Error('iframe unavailable');
        }
      }
    });
    const adapter = new BrowserPrintAdapter();

    await expect(adapter.print(request())).rejects.toMatchObject({ code: 'print-window-blocked' });

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:print-page');
    adapter.destroy();
  });

  it('removes an unmounted frame and revokes its URL when document.body is unavailable', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { body: null, createElement: () => frame }
    });
    const adapter = new BrowserPrintAdapter();

    await expect(adapter.print(request())).rejects.toMatchObject({ code: 'print-window-blocked' });

    expect(frame.removed).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:print-page');
    adapter.destroy();
  });

  it('removes an unmounted frame and revokes its URL when append fails', async () => {
    append.mockImplementationOnce(() => {
      throw new Error('append failed');
    });
    const adapter = new BrowserPrintAdapter();

    await expect(adapter.print(request())).rejects.toMatchObject({ code: 'print-window-blocked' });

    expect(frame.removed).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:print-page');
    adapter.destroy();
  });
});

function request(overrides: Partial<Parameters<BrowserPrintAdapter['print']>[0]> = {}): Parameters<BrowserPrintAdapter['print']>[0] {
  return {
    blob: new Blob(['png'], { type: 'image/png' }),
    pageWidthMm: 297,
    pageHeightMm: 210,
    timeoutMs: 100,
    signal: new AbortController().signal,
    ...overrides
  };
}
