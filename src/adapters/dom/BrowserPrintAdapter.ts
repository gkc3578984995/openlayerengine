import { CapabilityError, PrintError } from '../../core/errors.js';

export interface BrowserPrintRequest {
  readonly blob: Blob;
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly documentTitle?: string;
  readonly timeoutMs?: number;
  readonly signal: AbortSignal;
}

/** 在隔离 iframe 中以精确毫米页面打开浏览器打印对话框。 */
export class BrowserPrintAdapter {
  readonly #frames = new Set<HTMLIFrameElement>();
  readonly #frameCleanups = new Map<HTMLIFrameElement, () => void>();
  #disposed = false;

  get available(): boolean {
    return !this.#disposed && typeof document !== 'undefined' && typeof URL !== 'undefined';
  }

  async print(request: BrowserPrintRequest): Promise<void> {
    if (!this.available) throw new CapabilityError('Browser printing requires a browser document');
    if (request.signal.aborted) throw cancelledError();
    const operationController = new AbortController();
    let url: string | undefined;
    let frame: HTMLIFrameElement | undefined;
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
      request.signal.removeEventListener('abort', onAbort);
      operationController.abort();
      if (frame !== undefined) {
        this.#frames.delete(frame);
        this.#frameCleanups.delete(frame);
        frame.remove();
      }
      if (url !== undefined) URL.revokeObjectURL(url);
    };
    const onAbort = (): void => cleanup();

    try {
      url = URL.createObjectURL(request.blob);
      frame = document.createElement('iframe');
      frame.className = 'ol-print-browser-frame';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.position = 'fixed';
      frame.style.width = '1px';
      frame.style.height = '1px';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      const body = document.body;
      if (body === null) throw new PrintError('print-window-blocked', '浏览器打印需要可用的 document.body。');
      body.append(frame);
      this.#frames.add(frame);
      this.#frameCleanups.set(frame, cleanup);
      request.signal.addEventListener('abort', onAbort, { once: true });

      const frameWindow = frame.contentWindow;
      const frameDocument = frame.contentDocument;
      if (frameWindow === null || frameDocument === null) throw new PrintError('print-window-blocked', '浏览器阻止了打印文档。');
      frameDocument.open();
      frameDocument.write(createPrintDocument(request, url));
      frameDocument.close();
      const image = frameDocument.querySelector('img');
      // iframe 拥有独立的 JavaScript realm，不能用父页面的 HTMLImageElement 做 instanceof 判断。
      if (image === null) throw new PrintError('print-window-blocked', '无法创建浏览器打印页面。');
      await decodeImage(image, operationController.signal, normalizeTimeout(request.timeoutMs));
      if (request.signal.aborted || operationController.signal.aborted) throw cancelledError();
      const afterPrint = (): void => cleanup();
      frameWindow.addEventListener('afterprint', afterPrint, { once: true });
      timeout = globalThis.setTimeout(cleanup, 60_000);
      frameWindow.focus();
      frameWindow.print();
    } catch (error) {
      cleanup();
      if (error instanceof PrintError) throw error;
      throw new PrintError('print-window-blocked', '浏览器未能打开打印对话框。', { cause: error });
    }
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const cleanup of [...this.#frameCleanups.values()]) cleanup();
    this.#frames.clear();
    this.#frameCleanups.clear();
  }
}

async function decodeImage(image: HTMLImageElement, signal: AbortSignal, timeoutMs: number): Promise<void> {
  if (signal.aborted) throw cancelledError();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(cancelledError()));
    const timeout = globalThis.setTimeout(
      () => finish(() => reject(new PrintError('resource-timeout', '等待浏览器打印图片解码超时。', { details: { timeoutMs } }))),
      timeoutMs
    );
    signal.addEventListener('abort', onAbort, { once: true });
    void Promise.resolve()
      .then(() => image.decode())
      .then(
        () => finish(resolve),
        (cause) => finish(() => reject(cause))
      );
    if (signal.aborted) onAbort();
  });
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  return timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000;
}

function createPrintDocument(request: BrowserPrintRequest, objectUrl: string): string {
  const title = escapeHtml(request.documentTitle ?? '地图打印');
  const width = request.pageWidthMm;
  const height = request.pageHeightMm;
  const source = escapeHtml(objectUrl);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>@page{size:${width}mm ${height}mm;margin:0}html,body{margin:0;width:${width}mm;height:${height}mm;background:#fff;overflow:hidden}img{display:block;width:${width}mm;height:${height}mm}</style></head><body><img alt="地图打印页面" src="${source}"></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function cancelledError(): PrintError {
  return new PrintError('cancelled', '浏览器打印已取消。');
}
