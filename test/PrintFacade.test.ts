import { describe, expect, it, vi } from 'vitest';
import type { PrintPageRenderer } from '../src/adapters/dom/PrintPageRenderer.js';
import type { PrintBoxSelectionAdapter } from '../src/adapters/openlayers/PrintBoxSelectionAdapter.js';
import type { PrintMapRenderer } from '../src/adapters/openlayers/PrintMapRenderer.js';
import type { PrintViewAdapter } from '../src/adapters/openlayers/PrintViewAdapter.js';
import { CapabilityError, InteractionConflictError, ObjectDisposedError, PrintError } from '../src/core/errors.js';
import type { PrintFontSample, PrintLegendResult, PrintSpec } from '../src/core/print/types.js';
import { PrintFacadeImpl } from '../src/facade/PrintFacade.js';
import type { PrintLegendBuilder } from '../src/services/print/PrintLegendBuilder.js';
import type { PrintSnapshotService } from '../src/services/print/PrintSnapshotService.js';

const spec: PrintSpec = {
  range: { source: { mode: 'view' }, scale: { mode: 'fit' } },
  paper: { size: 'A4', orientation: 'landscape', marginMm: 10, dpi: 96 },
  layout: { classification: '机密★30年', title: '区域态势图', subtitle: '行动阶段', date: '2026-07-23', issuer: '签发人：张三' },
  legend: { mode: 'auto', showCounts: true }
};

describe('PrintFacade', () => {
  it('uses one plan for legend, full-page preview and PNG export', async () => {
    const destroyBitmap = vi.fn();
    const legend: PrintLegendResult = Object.freeze({
      groups: Object.freeze([{ id: 'layer:default', title: 'default' }]),
      items: Object.freeze([
        {
          id: 'point',
          groupId: 'layer:default',
          label: '点标绘',
          symbol: { kind: 'point', radiusMm: 1.2, fill: { color: '#1677ff' } },
          count: 2,
          sourceKey: 'default|point'
        }
      ]),
      sourceRevision: 1,
      warnings: Object.freeze([])
    });
    const pageCanvas = {
      width: 1123,
      height: 794,
      toBlob(callback: BlobCallback): void {
        callback(new Blob(['png'], { type: 'image/png' }));
      }
    };
    const renderPage = vi.fn(() => pageCanvas);
    const renderMap = vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 1024, heightPx: 600, destroy: destroyBitmap }));
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as unknown as PrintViewAdapter,
      boxSelection: fakeBox() as unknown as PrintBoxSelectionAdapter,
      mapRenderer: { render: renderMap, destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: { render: renderPage } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn(() => legend) } as unknown as PrintLegendBuilder
    });

    const session = facade.create({ initialSpec: spec });
    expect(session.plan?.range.sourceMode).toBe('view');
    expect((await session.generateLegend()).items[0]?.count).toBe(2);

    const preview = await session.preview({ quality: 'final' });
    const repeatedPreview = await session.preview({ quality: 'final' });
    const output = await session.export({ format: 'png' });

    expect(preview.blob.type).toBe('image/png');
    expect(repeatedPreview).not.toBe(preview);
    expect('format' in output && output.format).toBe('png');
    expect(renderPage).toHaveBeenCalledTimes(2);
    expect(renderMap).toHaveBeenCalledTimes(2);
    expect(destroyBitmap).toHaveBeenCalledTimes(2);
    expect(renderPage.mock.calls[0]?.[0].layout.subtitle).toBe('行动阶段');

    session.destroy();
    facade.destroy();
  });

  it('replaces an existing session and keeps a valid spec after an atomic update failure', () => {
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as unknown as PrintViewAdapter,
      boxSelection: fakeBox() as unknown as PrintBoxSelectionAdapter,
      mapRenderer: { render: vi.fn(), destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn() } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn() } as unknown as PrintLegendBuilder
    });
    const first = facade.create({ initialSpec: spec });
    const oldTitle = first.spec?.layout.title;
    expect(() => first.update({ ...spec, layout: { title: ' ' } })).toThrow();
    expect(first.spec?.layout.title).toBe(oldTitle);

    const second = facade.create({ initialSpec: spec });
    expect(first.status).toBe('destroyed');
    expect(second.status).toBe('ready');
    facade.destroy();
  });

  it('releases the active session when opening the built-in dialog fails', () => {
    const originalDocument = globalThis.document;
    const originalHTMLElement = globalThis.HTMLElement;
    class FakeHTMLElement {}
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: FakeHTMLElement });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        activeElement: null,
        createElement: () => {
          throw new Error('dialog DOM unavailable');
        }
      }
    });
    const facade = minimalFacade(fakeView(), fakeBox());

    try {
      expect(() => facade.open({ target: new FakeHTMLElement() as HTMLElement })).toThrow('dialog DOM unavailable');
      const replacement = facade.create({ sessionConflictPolicy: 'reject' });
      expect(replacement.status).toBe('draft');
      replacement.destroy();
    } finally {
      facade.destroy();
      Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
      Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: originalHTMLElement });
    }
  });

  it('treats an explicit headless export call as acknowledgement while retaining warnings', async () => {
    const pageCanvas = {
      width: 1123,
      height: 794,
      toBlob(callback: BlobCallback): void {
        callback(new Blob(['png'], { type: 'image/png' }));
      }
    };
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as unknown as PrintViewAdapter,
      boxSelection: fakeBox() as unknown as PrintBoxSelectionAdapter,
      mapRenderer: {
        render: vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 1024, heightPx: 600, destroy: vi.fn() })),
        destroy: vi.fn()
      } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn(() => pageCanvas) } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: {
        generate: vi.fn(() => ({ groups: Object.freeze([]), items: Object.freeze([]), sourceRevision: 1, warnings: Object.freeze([]) }))
      } as unknown as PrintLegendBuilder
    });
    const session = facade.create({ initialSpec: { ...spec, content: { animations: 'base' } } });

    expect(session.validation.canExport).toBe(false);
    const output = await session.export({ format: 'png' });

    expect('warnings' in output && output.warnings.map((warning) => warning.code)).toContain('animations-excluded');
    facade.destroy();
  });

  it('publishes and retains the physical printer scaling warning when browser print is available', async () => {
    const pageCanvas = {
      width: 1123,
      height: 794,
      toBlob(callback: BlobCallback): void {
        callback(new Blob(['png'], { type: 'image/png' }));
      }
    };
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: fakeBox() as PrintBoxSelectionAdapter,
      mapRenderer: {
        render: vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() })),
        destroy: vi.fn()
      } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn(() => pageCanvas) } as unknown as PrintPageRenderer,
      browserPrint: { available: true, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: {
        generate: vi.fn(() => ({ groups: Object.freeze([]), items: Object.freeze([]), sourceRevision: 1, warnings: Object.freeze([]) }))
      } as unknown as PrintLegendBuilder
    });
    const session = facade.create();
    const validationChanges: string[][] = [];
    session.on('validationchange', (event) => validationChanges.push(event.validation.warnings.map((warning) => warning.code)));
    session.update(spec);

    expect(session.validation.warnings).toContainEqual(
      expect.objectContaining({
        code: 'printer-scaling-not-guaranteed',
        message: '实际输出比例取决于打印机和浏览器是否设置为实际大小（100%）。',
        subject: 'browser-print',
        requiresAcknowledgement: true
      })
    );
    expect(validationChanges).toContainEqual(expect.arrayContaining(['printer-scaling-not-guaranteed']));
    const output = await session.export({ format: 'png' });
    expect('warnings' in output && output.warnings.map((warning) => warning.code)).toContain('printer-scaling-not-guaranteed');
    facade.destroy();
  });

  it('encodes an OffscreenCanvas-compatible page through convertToBlob', async () => {
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as unknown as PrintViewAdapter,
      boxSelection: fakeBox() as unknown as PrintBoxSelectionAdapter,
      mapRenderer: {
        render: vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 1024, heightPx: 600, destroy: vi.fn() })),
        destroy: vi.fn()
      } as unknown as PrintMapRenderer,
      pageRenderer: {
        render: vi.fn(() => ({ width: 1123, height: 794, convertToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }))
      } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: {
        generate: vi.fn(() => ({ groups: Object.freeze([]), items: Object.freeze([]), sourceRevision: 1, warnings: Object.freeze([]) }))
      } as unknown as PrintLegendBuilder
    });

    const output = await facade.create({ initialSpec: spec }).export({ format: 'png' });

    expect('blob' in output && output.blob.type).toBe('image/png');
    facade.destroy();
  });

  it('reports sanitized legend icon candidates when a final page is CORS tainted', async () => {
    const securityError = new Error('The canvas has been tainted by cross-origin data');
    securityError.name = 'SecurityError';
    const release = vi.fn();
    const destroyLegendImages = vi.fn();
    const legend: PrintLegendResult = Object.freeze({
      groups: Object.freeze([{ id: 'manual-icons', title: '图标' }]),
      items: Object.freeze([
        {
          id: 'manual-icon',
          groupId: 'manual-icons',
          label: '目标',
          symbol: {
            kind: 'icon',
            src: 'https://user:secret@example.test/marker.png?token=sensitive#fragment',
            size: [12, 12],
            anchor: [0.5, 0.5]
          }
        }
      ]),
      sourceRevision: 1,
      warnings: Object.freeze([])
    });
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: fakeBox() as PrintBoxSelectionAdapter,
      mapRenderer: {
        render: vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() })),
        destroy: vi.fn()
      } as unknown as PrintMapRenderer,
      pageRenderer: {
        preloadLegendImages: vi.fn(async () => ({
          resolve: () => undefined,
          resourceDescriptors: [
            {
              layerId: 'manual-icons',
              resourceType: 'icon' as const,
              sourceId: 'https://user:secret@example.test/marker.png?token=sensitive#fragment'
            }
          ],
          destroy: destroyLegendImages
        })),
        render: vi.fn(() => ({
          width: 1123,
          height: 794,
          toBlob: () => {
            throw securityError;
          }
        })),
        release
      } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn(() => legend) } as unknown as PrintLegendBuilder
    });

    await expect(facade.create({ initialSpec: spec }).preview({ quality: 'final' })).rejects.toMatchObject({
      code: 'cors-tainted-canvas',
      details: {
        layerId: 'manual-icons',
        resourceType: 'icon',
        sourceId: 'https://example.test/marker.png',
        candidates: [{ layerId: 'manual-icons', resourceType: 'icon', sourceId: 'https://example.test/marker.png' }]
      }
    });
    expect(release).toHaveBeenCalledOnce();
    expect(destroyLegendImages).toHaveBeenCalledOnce();
    facade.destroy();
  });

  it('rejects empty or non-PNG canvas encoder output', async () => {
    const wrongTypeRelease = vi.fn();
    const wrongType = encodingFacade({ width: 1123, height: 794, convertToBlob: async () => new Blob(['not-png'], { type: 'text/plain' }) }, wrongTypeRelease);
    await expect(wrongType.create({ initialSpec: spec }).preview({ quality: 'final' })).rejects.toMatchObject({ code: 'png-encode-failed' });
    expect(wrongTypeRelease).toHaveBeenCalledOnce();
    wrongType.destroy();

    const emptyRelease = vi.fn();
    const empty = encodingFacade({ width: 1123, height: 794, toBlob: (callback: BlobCallback) => callback(new Blob([], { type: 'image/png' })) }, emptyRelease);
    await expect(empty.create({ initialSpec: spec }).preview({ quality: 'final' })).rejects.toMatchObject({ code: 'png-encode-failed' });
    expect(emptyRelease).toHaveBeenCalledOnce();
    empty.destroy();

    const encoderFailureRelease = vi.fn();
    const encoderFailure = encodingFacade(
      {
        width: 1123,
        height: 794,
        convertToBlob: async () => {
          throw new Error('encoder unavailable');
        }
      },
      encoderFailureRelease
    );
    await expect(encoderFailure.create({ initialSpec: spec }).preview({ quality: 'final' })).rejects.toMatchObject({ code: 'png-encode-failed' });
    expect(encoderFailureRelease).toHaveBeenCalledOnce();
    encoderFailure.destroy();
  });

  it('keeps cancellation terminal when box rejection and queued view changes arrive later', async () => {
    let notifyView = (): void => undefined;
    let rejectSelection: (error: unknown) => void = () => undefined;
    const box = {
      select: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectSelection = reject;
          })
      ),
      cancel: vi.fn(() => rejectSelection(new PrintError('cancelled', 'cancelled'))),
      destroy: vi.fn()
    };
    const view = {
      ...fakeView(),
      subscribe: (listener: () => void) => {
        notifyView = listener;
        return () => undefined;
      }
    };
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: view as unknown as PrintViewAdapter,
      boxSelection: box as unknown as PrintBoxSelectionAdapter,
      mapRenderer: { render: vi.fn(), destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn() } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn() } as unknown as PrintLegendBuilder
    });
    const session = facade.create({
      initialSpec: { ...spec, range: { source: { mode: 'box' }, scale: { mode: 'fit' } } }
    });
    const selection = session.selectArea();

    session.cancel();
    notifyView();

    await expect(selection).rejects.toMatchObject({ code: 'cancelled' });
    await Promise.resolve();
    expect(session.status).toBe('cancelled');
    facade.destroy();
  });

  it('freezes event wrappers before dispatching them to multiple listeners', () => {
    const facade = minimalFacade(fakeView(), fakeBox());
    const session = facade.create({ initialSpec: spec });
    const observed: number[] = [];
    let frozen = false;
    session.on('rangechange', (event) => {
      frozen = Object.isFrozen(event);
      try {
        (event as { revision: number }).revision = 999;
      } catch {
        // ES module strict mode rejects mutation of the frozen wrapper.
      }
    });
    session.on('rangechange', (event) => observed.push(event.revision));

    session.update({ ...spec, layout: { ...spec.layout, title: '更新后的标题' } });

    expect(frozen).toBe(true);
    expect(observed).toEqual([2]);
    facade.destroy();
  });

  it('isolates a throwing listener, reports it, and continues dispatching the committed event', () => {
    const failure = new Error('listener failed');
    const reports: Array<readonly [unknown, unknown]> = [];
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: fakeBox() as PrintBoxSelectionAdapter,
      mapRenderer: { render: vi.fn(), destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn() } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn() } as unknown as PrintLegendBuilder,
      errorReporter: (error, context) => reports.push([error, context])
    });
    const session = facade.create();
    const observed: number[] = [];
    session.on('rangechange', () => {
      throw failure;
    });
    session.on('rangechange', (event) => observed.push(event.revision));

    session.update(spec);

    expect(observed).toEqual([1]);
    expect(reports).toEqual([[failure, { source: 'PrintSession', operation: 'emit:rangechange' }]]);
    expect(session.status).toBe('ready');
    facade.destroy();
  });

  it('stops an update transaction when a ready status listener cancels the Session', () => {
    const facade = minimalFacade(fakeView(), fakeBox());
    const session = facade.create();
    const observedStatuses: string[] = [];
    const domainEvents: string[] = [];
    session.on('statuschange', (event) => {
      if (event.status === 'ready') session.cancel();
    });
    session.on('statuschange', (event) => observedStatuses.push(event.status));
    session.on('specchange', () => domainEvents.push('specchange'));
    session.on('rangechange', () => domainEvents.push('rangechange'));
    session.on('validationchange', () => domainEvents.push('validationchange'));
    session.on('cancel', () => domainEvents.push('cancel'));

    session.update(spec);

    expect(session.status).toBe('cancelled');
    expect(session.spec).toBeUndefined();
    expect(observedStatuses).toEqual(['cancelled']);
    expect(domainEvents).toEqual(['cancel']);
    facade.destroy();
  });

  it('does not enter rendering when a previewing status listener destroys the Session', async () => {
    const renderMap = vi.fn();
    const renderPage = vi.fn();
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: fakeBox() as PrintBoxSelectionAdapter,
      mapRenderer: { render: renderMap, destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: { render: renderPage } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn() } as unknown as PrintLegendBuilder
    });
    const session = facade.create({ initialSpec: spec });
    const observedStatuses: string[] = [];
    const domainEvents: string[] = [];
    session.on('statuschange', (event) => {
      if (event.status === 'previewing') session.destroy();
    });
    session.on('statuschange', (event) => observedStatuses.push(event.status));
    session.on('previewchange', () => domainEvents.push('previewchange'));
    session.on('validationchange', () => domainEvents.push('validationchange'));
    session.on('error', () => domainEvents.push('error'));

    await expect(session.preview()).rejects.toMatchObject({ code: 'cancelled' });

    expect(session.status).toBe('destroyed');
    expect(observedStatuses).toEqual(['destroyed']);
    expect(domainEvents).toEqual([]);
    expect(renderMap).not.toHaveBeenCalled();
    expect(renderPage).not.toHaveBeenCalled();
    facade.destroy();
  });

  it('freezes completed box rotation across view changes and recenters fixed-scale changes', async () => {
    let notifyView = (): void => undefined;
    const snapshot = {
      ...fakeView().snapshot(),
      center: [500, 250] as const,
      rotation: 0,
      resolution: 1
    };
    const view = {
      ...fakeView(),
      snapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        notifyView = listener;
        return () => undefined;
      }
    };
    const selected = {
      sourceExtent: [100, 100, 300, 200] as const,
      footprint: [
        [100, 200],
        [300, 200],
        [300, 100],
        [100, 100]
      ] as const,
      center: [200, 150] as const,
      rotation: 0
    };
    const box = { select: vi.fn(async () => selected), cancel: vi.fn(), destroy: vi.fn() };
    const facade = minimalFacade(view, box);
    const fixedSpec: PrintSpec = {
      ...spec,
      range: { source: { mode: 'box' }, scale: { mode: 'fixed', denominator: 1000 } }
    };
    const session = facade.create({ initialSpec: fixedSpec });
    await session.selectArea();
    const beforeViewChange = session.plan;
    const beforeWidth = (beforeViewChange?.range.actualExtent[2] ?? 0) - (beforeViewChange?.range.actualExtent[0] ?? 0);

    snapshot.center = [900, 900] as never;
    snapshot.rotation = Math.PI / 2;
    snapshot.resolution = 20;
    notifyView();
    await Promise.resolve();

    expect(session.plan).toBe(beforeViewChange);
    expect(session.plan?.range.rotation).toBe(0);
    session.update({ ...fixedSpec, range: { source: { mode: 'box' }, scale: { mode: 'fixed', denominator: 2000 } } });
    const afterWidth = (session.plan?.range.actualExtent[2] ?? 0) - (session.plan?.range.actualExtent[0] ?? 0);
    expect(session.plan?.range.center).toEqual([200, 150]);
    expect(session.plan?.range.rotation).toBe(0);
    expect(afterWidth).toBeCloseTo(beforeWidth * 2);
    expect(session.plan?.range.sourceExtent).toEqual(session.plan?.range.actualExtent);
    facade.destroy();
  });

  it('invalidates a completed box when the View projection is replaced', async () => {
    let notifyView = (): void => undefined;
    let projectionCode = 'EPSG:3857';
    const baseView = fakeView();
    const view = {
      ...baseView,
      snapshot: () => ({ ...baseView.snapshot(), projectionCode }),
      subscribe: (listener: () => void) => {
        notifyView = listener;
        return () => undefined;
      }
    };
    const selected = {
      sourceExtent: [100, 100, 300, 200] as const,
      footprint: [
        [100, 200],
        [300, 200],
        [300, 100],
        [100, 100]
      ] as const,
      center: [200, 150] as const,
      rotation: 0
    };
    const facade = minimalFacade(view, { select: vi.fn(async () => selected), cancel: vi.fn(), destroy: vi.fn() });
    const session = facade.create({ initialSpec: { ...spec, range: { source: { mode: 'box' }, scale: { mode: 'fit' } } } });
    await session.selectArea();
    expect(session.status).toBe('ready');

    projectionCode = 'EPSG:4326';
    notifyView();
    await Promise.resolve();

    expect(session.status).toBe('draft');
    expect(session.plan).toBeUndefined();
    expect(session.validation.issues).toContainEqual(
      expect.objectContaining({ code: 'range-unresolved', message: expect.stringContaining('另一个 View 投影') })
    );
    facade.destroy();
  });

  it('binds explicit extents to their submitted View projection until the user confirms them again', async () => {
    let notifyView = (): void => undefined;
    let projectionCode = 'EPSG:3857';
    let center = 500;
    const baseView = fakeView();
    const view = {
      ...baseView,
      snapshot: () => ({ ...baseView.snapshot(), projectionCode, center: [center, 250] as const }),
      subscribe: (listener: () => void) => {
        notifyView = listener;
        return () => undefined;
      }
    };
    const facade = minimalFacade(view, fakeBox());
    const extentSpec: PrintSpec = {
      ...spec,
      range: { source: { mode: 'extent', extent: [-100, -50, 100, 50] }, scale: { mode: 'fit' } }
    };
    const session = facade.create({ initialSpec: extentSpec });
    expect(session.status).toBe('ready');

    center = 700;
    notifyView();
    await Promise.resolve();
    expect(session.status).toBe('ready');
    expect(session.plan?.revision).toBe(2);

    projectionCode = 'EPSG:4326';
    notifyView();
    await Promise.resolve();
    expect(session.status).toBe('draft');
    expect(session.plan).toBeUndefined();
    expect(session.validation.issues).toContainEqual(
      expect.objectContaining({ code: 'range-unresolved', message: expect.stringContaining('另一个 View 投影') })
    );

    session.update({ ...extentSpec, layout: { ...extentSpec.layout, title: 'layout-only update' } });
    expect(session.status).toBe('draft');
    expect(session.plan).toBeUndefined();

    const rebound = await session.selectArea();
    expect(session.status).toBe('ready');
    expect(session.plan).toBeDefined();
    expect(rebound.sourceMode).toBe('extent');
    facade.destroy();
  });

  it('invalidates cached output when a completed box View can no longer be snapshotted', async () => {
    let notifyView = (): void => undefined;
    let snapshotAvailable = true;
    const baseView = fakeView();
    const view = {
      ...baseView,
      snapshot: () => {
        if (!snapshotAvailable) throw new CapabilityError('View size is unavailable');
        return baseView.snapshot();
      },
      subscribe: (listener: () => void) => {
        notifyView = listener;
        return () => undefined;
      }
    };
    const selected = {
      sourceExtent: [100, 100, 300, 200] as const,
      footprint: [
        [100, 200],
        [300, 200],
        [300, 100],
        [100, 100]
      ] as const,
      center: [200, 150] as const,
      rotation: 0
    };
    const pageCanvas = {
      width: 1123,
      height: 794,
      toBlob(callback: BlobCallback): void {
        callback(new Blob(['png'], { type: 'image/png' }));
      }
    };
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: view as unknown as PrintViewAdapter,
      boxSelection: { select: vi.fn(async () => selected), cancel: vi.fn(), destroy: vi.fn() } as unknown as PrintBoxSelectionAdapter,
      mapRenderer: {
        render: vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() })),
        destroy: vi.fn()
      } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn(() => pageCanvas) } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn(() => emptyLegend()) } as unknown as PrintLegendBuilder
    });
    const session = facade.create({ initialSpec: { ...spec, range: { source: { mode: 'box' }, scale: { mode: 'fit' } } } });
    await session.selectArea();
    await session.preview({ quality: 'final' });

    snapshotAvailable = false;
    expect(notifyView).not.toThrow();
    expect(session.previewResult).toBeUndefined();
    const output = session.export({ format: 'png' });

    await expect(output).rejects.toMatchObject({ code: 'cancelled' });
    expect(session.status).toBe('draft');
    expect(session.plan).toBeUndefined();
    expect(session.validation.issues).toContainEqual(
      expect.objectContaining({ code: 'range-unresolved', message: expect.stringContaining('View size is unavailable') })
    );
    facade.destroy();
  });

  it('preserves the freely drawn fit source box when DPI, paper, or map-frame aspect changes', async () => {
    const selected = {
      sourceExtent: [100, 100, 300, 200] as const,
      footprint: [
        [100, 200],
        [300, 200],
        [300, 100],
        [100, 100]
      ] as const,
      center: [200, 150] as const,
      rotation: 0
    };
    const facade = minimalFacade(fakeView(), { select: vi.fn(async () => selected), cancel: vi.fn(), destroy: vi.fn() });
    const boxSpec: PrintSpec = { ...spec, range: { source: { mode: 'box' }, scale: { mode: 'fit' } } };
    const session = facade.create({ initialSpec: boxSpec });
    await session.selectArea();
    const initialFrame = session.plan!.mapFrameMm;
    const initialPage = session.plan!.pageSizeMm;
    const verticalOverhead = initialPage[1] - initialFrame.height;
    const nextMapWidth = initialFrame.width + 20;
    const equalAspectHeight = (nextMapWidth * initialFrame.height) / initialFrame.width;

    session.update({ ...boxSpec, paper: { ...boxSpec.paper, dpi: 192 } });
    expect(session.plan?.range.sourceExtent).toEqual([100, 100, 300, 200]);
    session.update({
      ...boxSpec,
      paper: {
        size: { widthMm: initialPage[0] + 20, heightMm: equalAspectHeight + verticalOverhead },
        orientation: 'landscape',
        marginMm: 10,
        dpi: 192
      }
    });
    expect(session.plan?.range.sourceExtent).toEqual([100, 100, 300, 200]);

    session.update({ ...boxSpec, paper: { size: 'A3', orientation: 'portrait', marginMm: 10, dpi: 192 } });
    expect(session.plan?.range.sourceExtent).toEqual([100, 100, 300, 200]);
    expect(session.validation.issues.map((issue) => issue.code)).not.toContain('range-unresolved');
    facade.destroy();
  });

  it('cancels a stale pointer draft and publishes a fresh draft for the committed box result', async () => {
    const selected = {
      sourceExtent: [100, 100, 300, 200] as const,
      footprint: [
        [100, 200],
        [300, 200],
        [300, 100],
        [100, 100]
      ] as const,
      center: [200, 150] as const,
      rotation: 0
    };
    let firstSignal: AbortSignal | undefined;
    const render = vi
      .fn()
      .mockImplementationOnce(
        (_plan: object, options: { readonly signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            firstSignal = options.signal;
            options.signal.addEventListener('abort', () => reject(new PrintError('cancelled', '旧草稿已取消。')), { once: true });
          })
      )
      .mockResolvedValue({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() });
    const box = {
      select: vi.fn(async (request: { readonly onChange?: (result: typeof selected) => void }) => {
        request.onChange?.(selected);
        return selected;
      }),
      cancel: vi.fn(),
      destroy: vi.fn()
    };
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: box as unknown as PrintBoxSelectionAdapter,
      mapRenderer: { render, destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: {
        render: vi.fn(() => ({
          width: 1123,
          height: 794,
          toBlob: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }))
        }))
      } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn(() => emptyLegend()) } as unknown as PrintLegendBuilder
    });
    const session = facade.create({ initialSpec: { ...spec, range: { source: { mode: 'box' }, scale: { mode: 'fit' } } } });
    const previewRevisions: number[] = [];
    session.on('previewchange', ({ result }) => previewRevisions.push(result.revision));

    await session.selectArea();
    await vi.waitFor(() => expect(session.previewResult?.revision).toBe(session.plan?.revision));

    expect(firstSignal?.aborted).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
    expect(previewRevisions).toEqual([session.plan?.revision]);
    expect(session.previewQuality).toBe('draft');
    facade.destroy();
  });

  it('invalidates a prior final preview and rejects public preview/export while reselecting a box', async () => {
    const selected = {
      sourceExtent: [100, 100, 300, 200] as const,
      footprint: [
        [100, 200],
        [300, 200],
        [300, 100],
        [100, 100]
      ] as const,
      center: [200, 150] as const,
      rotation: 0
    };
    let rejectPending: (error: unknown) => void = () => undefined;
    const select = vi
      .fn()
      .mockResolvedValueOnce(selected)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectPending = reject;
          })
      );
    const box = { select, cancel: vi.fn(() => rejectPending(new PrintError('cancelled', 'cancelled'))), destroy: vi.fn() };
    const canvas = {
      width: 1123,
      height: 794,
      toBlob: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }))
    };
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: box as unknown as PrintBoxSelectionAdapter,
      mapRenderer: {
        render: vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() })),
        destroy: vi.fn()
      } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn(() => canvas) } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: {
        generate: vi.fn(() => ({ groups: Object.freeze([]), items: Object.freeze([]), sourceRevision: 1, warnings: Object.freeze([]) }))
      } as unknown as PrintLegendBuilder
    });
    const session = facade.create({ initialSpec: { ...spec, range: { source: { mode: 'box' }, scale: { mode: 'fit' } } } });
    await session.selectArea();
    await session.preview({ quality: 'final' });
    expect(session.previewResult).toBeDefined();

    const reselection = session.selectArea();
    expect(session.previewResult).toBeUndefined();
    await expect(session.preview({ quality: 'final' })).rejects.toBeInstanceOf(InteractionConflictError);
    await expect(session.export({ format: 'png' })).rejects.toBeInstanceOf(InteractionConflictError);
    session.cancel();
    await expect(reselection).rejects.toMatchObject({ code: 'cancelled' });
    facade.destroy();
  });

  it('aborts a toBlob encoder that never calls back at the shared resource deadline and releases its surface', async () => {
    vi.useFakeTimers();
    const release = vi.fn();
    const facade = encodingFacade({ width: 1123, height: 794, toBlob: vi.fn() }, release);
    const session = facade.create({ initialSpec: { ...spec, resources: { timeoutMs: 25 } } });
    try {
      const preview = expect(session.preview({ quality: 'final' })).rejects.toMatchObject({ code: 'resource-timeout' });
      await vi.advanceTimersByTimeAsync(30);
      await preview;
      expect(release).toHaveBeenCalledOnce();
    } finally {
      facade.destroy();
      vi.useRealTimers();
    }
  });

  it('wakes a pending convertToBlob encoder when the Session is cancelled and ignores its late result', async () => {
    let resolveEncoder: (blob: Blob) => void = () => undefined;
    const release = vi.fn();
    const facade = encodingFacade(
      {
        width: 1123,
        height: 794,
        convertToBlob: () =>
          new Promise<Blob>((resolve) => {
            resolveEncoder = resolve;
          })
      },
      release
    );
    const session = facade.create({ initialSpec: spec });
    const preview = session.preview({ quality: 'draft' });
    await Promise.resolve();
    session.cancel();
    await expect(preview).rejects.toMatchObject({ code: 'cancelled' });
    resolveEncoder(new Blob(['late'], { type: 'image/png' }));
    await Promise.resolve();
    expect(release).toHaveBeenCalledOnce();
    facade.destroy();
  });

  it('refreshes an explicit final preview at a later animation clock time and lets export reuse it', async () => {
    const presentationRevision = 3;
    let capturedAt = 100;
    const capture = vi.fn((plan: { readonly revision: number }) => {
      let destroyed = false;
      const map = Object.freeze({
        revision: plan.revision,
        animationRevision: presentationRevision,
        capturedAt,
        expectedRenderableLeafCount: 0,
        layers: Object.freeze([]),
        get destroyed() {
          return destroyed;
        },
        destroy() {
          destroyed = true;
        }
      });
      return Object.freeze({
        revision: plan.revision,
        map,
        legend: emptyLegend(),
        get destroyed() {
          return destroyed;
        },
        destroy() {
          destroyed = true;
          map.destroy();
        }
      });
    });
    const renderSnapshot = vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() }));
    const pageCanvas = {
      width: 1123,
      height: 794,
      toBlob: (callback: BlobCallback) => callback(new Blob([String(capturedAt)], { type: 'image/png' }))
    };
    const snapshot = {
      get presentationRevision() {
        return presentationRevision;
      },
      subscribe: () => () => undefined,
      validationIssues: () => [],
      capture,
      destroy: vi.fn()
    } as unknown as PrintSnapshotService;
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: fakeBox() as PrintBoxSelectionAdapter,
      mapRenderer: { renderSnapshot, destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn(() => pageCanvas) } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn(() => emptyLegend()) } as unknown as PrintLegendBuilder,
      snapshot
    });
    const session = facade.create({ initialSpec: spec });

    const first = await session.preview({ quality: 'final' });
    capturedAt = 200;
    const second = await session.preview({ quality: 'final' });
    const output = await session.export({ format: 'png' });

    expect(second).not.toBe(first);
    expect(await first.blob.text()).toBe('100');
    expect(await second.blob.text()).toBe('200');
    expect('blob' in output && output.blob).toBe(second.blob);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(renderSnapshot).toHaveBeenCalledTimes(2);
    facade.destroy();
  });

  it('coalesces same-tick content then view invalidations without losing the range change', async () => {
    let notifyView = (): void => undefined;
    let notifyContent = (): void => undefined;
    let center = 500;
    const view = {
      ...fakeView(),
      snapshot: () => ({
        revision: 1,
        projectionCode: 'EPSG:3857',
        center: [center, 250],
        sourceExtent: [center - 500, 0, center + 500, 500],
        footprint: [
          [center - 500, 500],
          [center + 500, 500],
          [center + 500, 0],
          [center - 500, 0]
        ],
        resolution: 1,
        rotation: 0,
        metersPerViewUnit: 1,
        scaleVariesByPosition: false,
        northAngle: 0
      }),
      subscribe: (listener: () => void) => {
        notifyView = listener;
        return () => undefined;
      }
    };
    const snapshot = {
      presentationRevision: 1,
      subscribe: (listener: () => void) => {
        notifyContent = listener;
        return () => undefined;
      },
      validationIssues: () => [],
      destroy: vi.fn()
    } as unknown as PrintSnapshotService;
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: view as unknown as PrintViewAdapter,
      boxSelection: fakeBox() as PrintBoxSelectionAdapter,
      mapRenderer: { render: vi.fn(), destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn() } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn() } as unknown as PrintLegendBuilder,
      snapshot
    });
    const session = facade.create({ initialSpec: spec });
    const ranges: number[] = [];
    session.on('rangechange', (event) => ranges.push(event.revision));

    notifyContent();
    center = 700;
    notifyView();
    await Promise.resolve();

    expect(session.plan?.revision).toBe(2);
    expect(session.plan?.range.center).toEqual([700, 250]);
    expect(ranges).toEqual([2]);
    facade.destroy();
  });

  it('rejects a same-tick legend request after content invalidation instead of publishing the stale revision', async () => {
    let notifyContent = (): void => undefined;
    const snapshot = {
      presentationRevision: 1,
      subscribe: (listener: () => void) => {
        notifyContent = listener;
        return () => undefined;
      },
      validationIssues: () => [],
      destroy: vi.fn()
    } as unknown as PrintSnapshotService;
    const generate = vi.fn((printPlan: { readonly revision: number }) => Object.freeze({ ...emptyLegend(), sourceRevision: printPlan.revision }));
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: fakeBox() as PrintBoxSelectionAdapter,
      mapRenderer: { render: vi.fn(), destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn() } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate } as unknown as PrintLegendBuilder,
      snapshot
    });
    const session = facade.create({ initialSpec: spec });
    expect((await session.generateLegend()).sourceRevision).toBe(1);
    const validationRevisions: number[] = [];
    session.on('validationchange', (event) => validationRevisions.push(event.revision));

    notifyContent();
    const stale = session.generateLegend();
    expect(validationRevisions).toEqual([]);
    await expect(stale).rejects.toMatchObject({ code: 'cancelled' });
    await Promise.resolve();

    const fresh = await session.generateLegend();
    expect(fresh.sourceRevision).toBe(2);
    expect(session.plan?.revision).toBe(2);
    expect(validationRevisions).not.toContain(1);
    facade.destroy();
  });

  it('keeps terminal lifecycle errors ahead of queued external invalidation', async () => {
    for (const terminal of ['cancel', 'destroy'] as const) {
      let notifyContent = (): void => undefined;
      const snapshot = {
        presentationRevision: 1,
        subscribe: (listener: () => void) => {
          notifyContent = listener;
          return () => undefined;
        },
        validationIssues: () => [],
        destroy: vi.fn()
      } as unknown as PrintSnapshotService;
      const facade = new PrintFacadeImpl({
        target: {} as HTMLElement,
        view: fakeView() as PrintViewAdapter,
        boxSelection: fakeBox() as PrintBoxSelectionAdapter,
        mapRenderer: { render: vi.fn(), destroy: vi.fn() } as unknown as PrintMapRenderer,
        pageRenderer: { render: vi.fn() } as unknown as PrintPageRenderer,
        browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
        legendBuilder: { generate: vi.fn(() => emptyLegend()) } as unknown as PrintLegendBuilder,
        snapshot
      });
      const session = facade.create({ initialSpec: spec });

      notifyContent();
      session[terminal]();

      await expect(session.generateLegend()).rejects.toBeInstanceOf(ObjectDisposedError);
      facade.destroy();
    }
  });

  it.each(['legend-builder', 'legend-builder-error', 'validation-listener'] as const)(
    'rejects legend publication when %s queues a same-stack invalidation',
    async (trigger) => {
      let notifyContent = (): void => undefined;
      let armed = false;
      const snapshot = {
        presentationRevision: 1,
        subscribe: (listener: () => void) => {
          notifyContent = listener;
          return () => undefined;
        },
        validationIssues: () => [],
        destroy: vi.fn()
      } as unknown as PrintSnapshotService;
      const generate = vi.fn((printPlan: { readonly revision: number }) => {
        if (armed && (trigger === 'legend-builder' || trigger === 'legend-builder-error')) {
          armed = false;
          notifyContent();
          if (trigger === 'legend-builder-error') throw new Error('stale legend failure');
        }
        return Object.freeze({ ...emptyLegend(), sourceRevision: printPlan.revision });
      });
      const facade = new PrintFacadeImpl({
        target: {} as HTMLElement,
        view: fakeView() as PrintViewAdapter,
        boxSelection: fakeBox() as PrintBoxSelectionAdapter,
        mapRenderer: { render: vi.fn(), destroy: vi.fn() } as unknown as PrintMapRenderer,
        pageRenderer: { render: vi.fn() } as unknown as PrintPageRenderer,
        browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
        legendBuilder: { generate } as unknown as PrintLegendBuilder,
        snapshot
      });
      const session = facade.create({ initialSpec: spec });
      if (trigger === 'validation-listener') {
        session.on('validationchange', () => {
          if (!armed) return;
          armed = false;
          notifyContent();
        });
      }
      armed = true;

      await expect(session.generateLegend()).rejects.toMatchObject({ code: 'cancelled' });
      await Promise.resolve();

      expect(session.plan?.revision).toBe(2);
      const fresh = session.legendResult ?? (await session.generateLegend());
      expect(fresh.sourceRevision).toBe(2);
      facade.destroy();
    }
  );

  it('does not export a cached final preview after a same-tick content invalidation', async () => {
    let notifyContent = (): void => undefined;
    const capture = vi.fn((plan: { readonly revision: number }) => frozenSnapshot(plan.revision, []));
    const snapshot = {
      presentationRevision: 1,
      subscribe: (listener: () => void) => {
        notifyContent = listener;
        return () => undefined;
      },
      validationIssues: () => [],
      capture,
      destroy: vi.fn()
    } as unknown as PrintSnapshotService;
    const pageCanvas = {
      width: 1123,
      height: 794,
      toBlob(callback: BlobCallback): void {
        callback(new Blob(['png'], { type: 'image/png' }));
      }
    };
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: fakeBox() as PrintBoxSelectionAdapter,
      mapRenderer: {
        renderSnapshot: vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() })),
        destroy: vi.fn()
      } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn(() => pageCanvas) } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn(() => emptyLegend()) } as unknown as PrintLegendBuilder,
      snapshot
    });
    const session = facade.create({ initialSpec: spec });
    await session.preview({ quality: 'final' });
    expect(capture).toHaveBeenCalledOnce();

    notifyContent();
    expect(session.previewResult).toBeUndefined();
    const output = session.export({ format: 'png' });

    await expect(output).rejects.toMatchObject({ code: 'cancelled' });
    expect(session.plan?.revision).toBe(2);
    expect(capture).toHaveBeenCalledTimes(2);
    facade.destroy();
  });

  it('probes scale variation at a fixed print extent far from the active View', () => {
    const scaleVariesByPositionAt = vi.fn(() => true);
    const metersPerViewUnitAt = vi.fn(() => 1);
    const northAngleAt = vi.fn(() => 0);
    const view = { ...fakeView(), scaleVariesByPositionAt, metersPerViewUnitAt, northAngleAt };
    const facade = minimalFacade(view, fakeBox());
    const extentSpec: PrintSpec = {
      ...spec,
      range: {
        source: { mode: 'extent', extent: [100_000, 20_000, 101_000, 20_500] },
        scale: { mode: 'fixed', denominator: 100_000 }
      }
    };

    const session = facade.create({ initialSpec: extentSpec });

    expect(metersPerViewUnitAt).toHaveBeenCalledWith([100_500, 20_250]);
    expect(northAngleAt).toHaveBeenCalledWith([100_500, 20_250], 0);
    expect(scaleVariesByPositionAt).toHaveBeenCalledWith(
      [100_500, 20_250],
      expect.arrayContaining([
        [100_000, 20_500],
        [101_000, 20_000]
      ])
    );
    expect(session.validation.warnings).toContainEqual(expect.objectContaining({ code: 'scale-valid-at-center', subject: 'range.scale' }));
    facade.destroy();
  });

  it('cancels a stale preview when a validation listener updates the Session synchronously', async () => {
    const facade = encodingFacade(
      {
        width: 1123,
        height: 794,
        toBlob: (callback: BlobCallback) => callback(new Blob(['old'], { type: 'image/png' }))
      },
      vi.fn()
    );
    const session = facade.create({ initialSpec: spec });
    const previewEvents: number[] = [];
    let updated = false;
    session.on('previewchange', (event) => previewEvents.push(event.revision));
    session.on('validationchange', () => {
      if (updated || session.status !== 'previewing') return;
      updated = true;
      session.update({ ...spec, layout: { ...spec.layout, title: '监听器提交的新标题' } });
    });

    await expect(session.preview({ quality: 'final' })).rejects.toMatchObject({ code: 'cancelled' });

    expect(session.plan?.revision).toBe(2);
    expect(session.spec?.layout.title).toBe('监听器提交的新标题');
    expect(session.previewResult).toBeUndefined();
    expect(previewEvents).toEqual([]);
    facade.destroy();
  });

  it('does not restore ready state after a previewchange listener replaces the revision', async () => {
    const facade = encodingFacade(
      {
        width: 1123,
        height: 794,
        toBlob: (callback: BlobCallback) => callback(new Blob(['old'], { type: 'image/png' }))
      },
      vi.fn()
    );
    const session = facade.create({ initialSpec: spec });
    let updated = false;
    session.on('previewchange', () => {
      if (updated) return;
      updated = true;
      session.update({ ...spec, range: { source: { mode: 'box' }, scale: { mode: 'fit' } } });
    });

    await expect(session.preview({ quality: 'final' })).rejects.toMatchObject({ code: 'cancelled' });

    expect(session.plan).toBeUndefined();
    expect(session.status).toBe('draft');
    expect(session.previewResult).toBeUndefined();
    facade.destroy();
  });

  it('waits for a visible map Text font before starting the hidden map render', async () => {
    let resolveFont: (faces: readonly FontFace[]) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<readonly FontFace[]>((resolve) => {
          resolveFont = resolve;
        })
    );
    const previousDocument = globalThis.document;
    const check = vi.fn(() => true);
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { fonts: { ready: Promise.resolve(), load, check } }
    });
    try {
      const renderSnapshot = vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() }));
      const facade = snapshotFacade([{ font: '600 18px "Tactical Sans"', text: '中文态势' }], renderSnapshot);
      const session = facade.create({ initialSpec: spec });

      const preview = session.preview({ quality: 'final' });
      await Promise.resolve();

      expect(load).toHaveBeenCalledWith('600 18px "Tactical Sans"', '中文态势');
      expect(renderSnapshot).not.toHaveBeenCalled();
      resolveFont([]);
      await expect(preview).resolves.toMatchObject({ revision: 1 });
      expect(check).toHaveBeenCalledWith('600 18px "Tactical Sans"', '中文态势');
      expect(renderSnapshot).toHaveBeenCalledOnce();
      facade.destroy();
    } finally {
      if (previousDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
      else Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    }
  });

  it('publishes a font resource issue and clears it after the map font becomes ready on retry', async () => {
    let shouldFail = true;
    const load = vi.fn(() => (shouldFail ? Promise.reject(new Error('font unavailable')) : Promise.resolve([])));
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { fonts: { ready: Promise.resolve(), load, check: () => !shouldFail } }
    });
    try {
      const renderSnapshot = vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() }));
      const facade = snapshotFacade([{ font: '16px "Operational Sans"', text: '行动区域' }], renderSnapshot);
      const session = facade.create({ initialSpec: spec });

      await expect(session.preview({ quality: 'final' })).rejects.toMatchObject({ code: 'resource-load-failed' });
      expect(session.validation.issues).toContainEqual(expect.objectContaining({ code: 'resource-not-ready', subject: 'fonts' }));
      expect(renderSnapshot).not.toHaveBeenCalled();

      shouldFail = false;
      await expect(session.preview({ quality: 'final' })).resolves.toMatchObject({ revision: 1 });
      expect(session.validation.issues).not.toContainEqual(expect.objectContaining({ code: 'resource-not-ready', subject: 'fonts' }));
      expect(renderSnapshot).toHaveBeenCalledOnce();
      facade.destroy();
    } finally {
      if (previousDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
      else Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    }
  });

  it('cancels a failed preview when its validation listener starts a same-revision retry', async () => {
    const renderMap = vi
      .fn()
      .mockRejectedValueOnce(new PrintError('resource-load-failed', 'first map request failed'))
      .mockResolvedValueOnce({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() });
    const pageCanvas = {
      width: 1123,
      height: 794,
      toBlob: (callback: BlobCallback) => callback(new Blob(['retry'], { type: 'image/png' }))
    };
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: fakeBox() as PrintBoxSelectionAdapter,
      mapRenderer: { render: renderMap, destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn(() => pageCanvas) } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn(() => emptyLegend()) } as unknown as PrintLegendBuilder
    });
    const session = facade.create({ initialSpec: spec });
    const errors: unknown[] = [];
    let retry: Promise<unknown> | undefined;
    session.on('error', (event) => errors.push(event.error));
    session.on('validationchange', (event) => {
      if (retry === undefined && event.validation.issues.some((issue) => issue.code === 'resource-not-ready')) {
        retry = session.preview({ quality: 'final' });
      }
    });

    await expect(session.preview({ quality: 'final' })).rejects.toMatchObject({ code: 'cancelled' });
    await expect(retry).resolves.toMatchObject({ revision: 1 });

    expect(renderMap).toHaveBeenCalledTimes(2);
    expect(errors).toEqual([]);
    expect(session.status).toBe('ready');
    expect(session.validation.issues).not.toContainEqual(expect.objectContaining({ code: 'resource-not-ready' }));
    facade.destroy();
  });

  it('passes printableLayerFactory to validation and capture and publishes a blocking native Layer issue', async () => {
    const factory = vi.fn(() => undefined);
    const validationIssues = vi.fn(() => []);
    const render = vi.fn(async () => {
      throw new CapabilityError('layer-not-printable:native%3Aroads:printableLayerFactory returned undefined');
    });
    const facade = new PrintFacadeImpl({
      target: {} as HTMLElement,
      view: fakeView() as PrintViewAdapter,
      boxSelection: fakeBox() as PrintBoxSelectionAdapter,
      mapRenderer: { validationIssues, render, destroy: vi.fn() } as unknown as PrintMapRenderer,
      pageRenderer: { render: vi.fn() } as unknown as PrintPageRenderer,
      browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
      legendBuilder: { generate: vi.fn(() => emptyLegend()) } as unknown as PrintLegendBuilder
    });
    const session = facade.create({ initialSpec: spec, printableLayerFactory: factory });

    expect(validationIssues).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }), factory);
    await expect(session.preview({ quality: 'final' })).rejects.toBeInstanceOf(CapabilityError);

    expect(render).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }), expect.any(Object), factory);
    expect(session.validation.issues).toContainEqual(
      expect.objectContaining({ code: 'layer-not-printable', subject: 'native:roads', message: 'printableLayerFactory returned undefined' })
    );
    expect(session.validation.canPreview).toBe(false);
    expect(session.validation.canExport).toBe(false);
    facade.destroy();
  });

  it('cancels a PDF encoder that ignores AbortSignal and discards its late result', async () => {
    let resolvePdf: (blob: Blob) => void = () => undefined;
    const encoder = {
      encode: vi.fn(
        () =>
          new Promise<Blob>((resolve) => {
            resolvePdf = resolve;
          })
      )
    };
    const facade = encodingFacade(
      {
        width: 1123,
        height: 794,
        toBlob: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }))
      },
      vi.fn()
    );
    const session = facade.create({ initialSpec: spec });
    const exported: unknown[] = [];
    session.on('export', (event) => exported.push(event.result));

    const output = session.export({ format: 'pdf', encoder });
    for (let attempt = 0; attempt < 8 && encoder.encode.mock.calls.length === 0; attempt += 1) await Promise.resolve();
    expect(encoder.encode).toHaveBeenCalledOnce();
    session.cancel();

    await expect(output).rejects.toMatchObject({ code: 'cancelled' });
    resolvePdf(new Blob(['late'], { type: 'application/pdf' }));
    await Promise.resolve();
    expect(exported).toEqual([]);
    facade.destroy();
  });
});

function fakeView(): object {
  return {
    snapshot: () => ({
      revision: 1,
      projectionCode: 'EPSG:3857',
      center: [500, 250],
      sourceExtent: [0, 0, 1000, 500],
      footprint: [
        [0, 500],
        [1000, 500],
        [1000, 0],
        [0, 0]
      ],
      resolution: 1,
      rotation: 0,
      metersPerViewUnit: 1,
      scaleVariesByPosition: false,
      northAngle: 0
    }),
    metersPerViewUnitAt: () => 1,
    northAngleAt: () => 0,
    subscribe: () => () => undefined,
    destroy: vi.fn()
  };
}

function fakeBox(): object {
  return { select: vi.fn(), cancel: vi.fn(), destroy: vi.fn() };
}

function minimalFacade(view: object, box: object): PrintFacadeImpl {
  return new PrintFacadeImpl({
    target: {} as HTMLElement,
    view: view as PrintViewAdapter,
    boxSelection: box as PrintBoxSelectionAdapter,
    mapRenderer: { render: vi.fn(), destroy: vi.fn() } as unknown as PrintMapRenderer,
    pageRenderer: { render: vi.fn() } as unknown as PrintPageRenderer,
    browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
    legendBuilder: { generate: vi.fn() } as unknown as PrintLegendBuilder
  });
}

function encodingFacade(canvas: object, release: ReturnType<typeof vi.fn>): PrintFacadeImpl {
  return new PrintFacadeImpl({
    target: {} as HTMLElement,
    view: fakeView() as PrintViewAdapter,
    boxSelection: fakeBox() as PrintBoxSelectionAdapter,
    mapRenderer: {
      render: vi.fn(async () => ({ canvas: {} as HTMLCanvasElement, widthPx: 100, heightPx: 100, destroy: vi.fn() })),
      destroy: vi.fn()
    } as unknown as PrintMapRenderer,
    pageRenderer: { render: vi.fn(() => canvas), release } as unknown as PrintPageRenderer,
    browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
    legendBuilder: {
      generate: vi.fn(() => ({ groups: Object.freeze([]), items: Object.freeze([]), sourceRevision: 1, warnings: Object.freeze([]) }))
    } as unknown as PrintLegendBuilder
  });
}

function emptyLegend(): Readonly<PrintLegendResult> {
  return Object.freeze({ groups: Object.freeze([]), items: Object.freeze([]), sourceRevision: 1, warnings: Object.freeze([]) });
}

function snapshotFacade(fontSamples: readonly Readonly<PrintFontSample>[], renderSnapshot: ReturnType<typeof vi.fn>): PrintFacadeImpl {
  const snapshot = {
    presentationRevision: 1,
    subscribe: () => () => undefined,
    validationIssues: () => [],
    capture: (plan: { readonly revision: number }) => frozenSnapshot(plan.revision, fontSamples),
    destroy: vi.fn()
  } as unknown as PrintSnapshotService;
  return new PrintFacadeImpl({
    target: {} as HTMLElement,
    view: fakeView() as PrintViewAdapter,
    boxSelection: fakeBox() as PrintBoxSelectionAdapter,
    mapRenderer: { renderSnapshot, destroy: vi.fn() } as unknown as PrintMapRenderer,
    pageRenderer: {
      fontSamples: () => [],
      render: vi.fn(() => ({
        width: 1123,
        height: 794,
        toBlob: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }))
      }))
    } as unknown as PrintPageRenderer,
    browserPrint: { available: false, print: vi.fn(), destroy: vi.fn() } as never,
    legendBuilder: { generate: vi.fn(() => emptyLegend()) } as unknown as PrintLegendBuilder,
    snapshot
  });
}

function frozenSnapshot(revision: number, fontSamples: readonly Readonly<PrintFontSample>[]): object {
  let destroyed = false;
  const map = Object.freeze({
    revision,
    animationRevision: 1,
    expectedRenderableLeafCount: 0,
    fontSamples: Object.freeze(fontSamples.map((sample) => Object.freeze({ ...sample }))),
    layers: Object.freeze([]),
    get destroyed() {
      return destroyed;
    },
    destroy() {
      destroyed = true;
    }
  });
  return Object.freeze({
    revision,
    map,
    legend: emptyLegend(),
    get destroyed() {
      return destroyed;
    },
    destroy() {
      destroyed = true;
      map.destroy();
    }
  });
}
