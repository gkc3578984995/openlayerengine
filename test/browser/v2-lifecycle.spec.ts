import { expect, test, type Page } from '@playwright/test';

type MapName = 'a' | 'b';

interface RuntimeSnapshot {
  readonly lifecycle: string;
  readonly isDestroyed: boolean;
  readonly registryKeys: readonly string[];
  readonly map: {
    readonly targetAttached: boolean;
    readonly size?: readonly [number, number];
    readonly layers: number;
    readonly interactions: number;
    readonly overlays: number;
    readonly controls: number;
    readonly renderPasses: number;
  };
  readonly listeners: {
    readonly viewport: number;
    readonly contextmenu: number;
    readonly target: number;
  };
  readonly dom: {
    readonly viewport: number;
    readonly canvas: number;
    readonly contextMenus: number;
    readonly toolbars: number;
    readonly measureTooltips: number;
  };
  readonly animationHandles: number;
  readonly elementCount: number;
}

interface GlobalSnapshot {
  readonly registryKeys: readonly string[];
  readonly documentListeners: number;
  readonly windowListeners: number;
  readonly mapAChildren: number;
  readonly mapBChildren: number;
  readonly mapAContextMenus: number;
  readonly mapAToolbars: number;
  readonly mapAMeasureTooltips: number;
}

interface MeasureSummary {
  readonly status?: string;
  readonly events: readonly {
    readonly type: string;
    readonly result?: {
      readonly type: string;
      readonly value: number;
      readonly unit: string;
      readonly formatted: string;
      readonly coordinateCount: number;
      readonly segmentCount: number;
    };
  }[];
  readonly resources: RuntimeSnapshot;
}

interface TransformSummary {
  readonly status?: string;
  readonly selectedId?: string;
  readonly toolbar: boolean;
  readonly resources: RuntimeSnapshot;
}

interface CycleSummary {
  readonly snapshot: RuntimeSnapshot;
  readonly transform: TransformSummary;
  readonly measure: MeasureSummary;
}

interface BrowserFixture {
  readonly ready: boolean;
  snapshot(name: MapName): RuntimeSnapshot;
  globalSnapshot(): GlobalSnapshot;
  sameEarth(name: MapName): boolean;
  armContextMenuProbe(target: MapName): void;
  readContextMenuProbe(target: MapName): Readonly<{ received: boolean; defaultPrevented: boolean }> | undefined;
  startMeasure(type: 'distance-total'): MeasureSummary;
  measureSummary(): MeasureSummary;
  startTransformDirect(): TransformSummary;
  destroyA(preserveViewport?: boolean): Promise<void>;
  createCycleEarth(): RuntimeSnapshot;
  prepareCycleResources(): unknown;
  cycleSummary(): CycleSummary;
}

type FixtureWindow = Window & {
  readonly __OL_ENGINE_TEST__: BrowserFixture;
  __OL_ENGINE_B_VIEWPORT_BASELINE__?: Element;
};

test('连续创建和销毁同名 Earth 时完整释放资源且不影响其他实例', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.ready)).toBe(true);
  await expect.poll(async () => (await readSnapshot(page, 'b')).dom.canvas).toBeGreaterThan(0);

  const bBaseline = stableRuntimeState(await readSnapshot(page, 'b'));
  await page.evaluate(() => {
    const viewport = document.querySelector('#map-b .ol-viewport');
    if (viewport === null) throw new Error('Map B viewport is unavailable.');
    (window as unknown as FixtureWindow).__OL_ENGINE_B_VIEWPORT_BASELINE__ = viewport;
  });
  await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.destroyA(false));
  await expect.poll(async () => (await readGlobalSnapshot(page)).mapAChildren).toBe(0);
  const globalBaseline = await readGlobalSnapshot(page);
  expect([...globalBaseline.registryKeys].sort()).toEqual(['map-b']);

  for (let cycle = 0; cycle < 20; cycle += 1) {
    const baseline = await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.createCycleEarth());
    expect([...baseline.registryKeys].sort()).toEqual(['cycle-earth', 'map-b']);
    expect(baseline.lifecycle).toBe('ready');
    expect(baseline.isDestroyed).toBe(false);

    await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.prepareCycleResources());
    await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.startMeasure('distance-total'));
    await clickMapA(page, [70, 430]);
    await clickMapA(page, [220, 470]);
    await clickMapA(page, [390, 430]);
    await clickMapA(page, [390, 430], 'right');

    await expect
      .poll(async () => {
        const measure = await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.measureSummary());
        return {
          status: measure.status,
          completed: measure.events.some(
            (event) =>
              event.type === 'complete' &&
              event.result?.type === 'distance-total' &&
              event.result.coordinateCount >= 2 &&
              event.result.segmentCount >= 1 &&
              Number.isFinite(event.result.value)
          ),
          overlays: measure.resources.map.overlays,
          tooltips: measure.resources.dom.measureTooltips
        };
      })
      .toEqual({
        status: 'finished',
        completed: true,
        overlays: expect.any(Number),
        tooltips: expect.any(Number)
      });

    const completedMeasure = await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.measureSummary());
    expect(completedMeasure.resources.map.overlays).toBeGreaterThan(baseline.map.overlays);
    expect(completedMeasure.resources.dom.measureTooltips).toBeGreaterThan(baseline.dom.measureTooltips);

    await clickMapA(page, [490, 100], 'right');
    await expect.poll(() => isContextMenuVisible(page)).toBe(true);
    await page.mouse.click(20, 20);
    await expect.poll(() => isContextMenuVisible(page)).toBe(false);

    await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.startTransformDirect());
    await expect
      .poll(async () => {
        const summary = await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.cycleSummary());
        return activeResourceState(summary, baseline);
      })
      .toEqual({
        transformActive: true,
        selected: true,
        toolbarCreated: true,
        contextMenuCreated: true,
        tooltipCreated: true,
        layerAdded: true,
        interactionAdded: true,
        overlayAdded: true,
        animationActive: true,
        renderPassActive: true,
        measureFinished: true
      });

    await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.destroyA(false));
    await expect
      .poll(async () => destroyedRuntimeState(await readSnapshot(page, 'a')))
      .toEqual({
        lifecycle: 'destroyed',
        isDestroyed: true,
        registryKeys: ['map-b'],
        targetAttached: false,
        layers: 0,
        interactions: 0,
        overlays: 0,
        controls: 0,
        renderPasses: 0,
        viewportListeners: 0,
        contextmenuListeners: 0,
        targetListeners: 0,
        viewportNodes: 0,
        canvasNodes: 0,
        contextMenus: 0,
        toolbars: 0,
        measureTooltips: 0,
        animationHandles: 0,
        elementCount: 0
      });
    await expect
      .poll(async () => destroyedGlobalState(await readGlobalSnapshot(page), globalBaseline))
      .toEqual({
        registryKeys: ['map-b'],
        documentListenersRestored: true,
        mapAChildren: 0,
        mapBChildrenUnchanged: true,
        mapAContextMenus: 0,
        mapAToolbars: 0,
        mapAMeasureTooltips: 0
      });
    await expect.poll(async () => stableRuntimeState(await readSnapshot(page, 'b'))).toEqual(bBaseline);
    await expect.poll(() => mapBIdentityState(page)).toEqual({ sameEarth: true, sameViewport: true });
  }

  await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.armContextMenuProbe('b'));
  await clickMapB(page, [490, 100], 'right');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.readContextMenuProbe('b')))
    .toEqual({ received: true, defaultPrevented: true });
  await expect.poll(async () => stableRuntimeState(await readSnapshot(page, 'b'))).toEqual(bBaseline);
  await expect.poll(() => mapBIdentityState(page)).toEqual({ sameEarth: true, sameViewport: true });
});

async function readSnapshot(page: Page, name: MapName): Promise<RuntimeSnapshot> {
  return page.evaluate((target) => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.snapshot(target), name);
}

async function readGlobalSnapshot(page: Page): Promise<GlobalSnapshot> {
  return page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.globalSnapshot());
}

async function clickMapA(page: Page, pixel: readonly [number, number], button: 'left' | 'right' = 'left'): Promise<void> {
  await clickViewport(page, '#map-a .ol-viewport', pixel, button);
}

async function clickMapB(page: Page, pixel: readonly [number, number], button: 'left' | 'right' = 'left'): Promise<void> {
  await clickViewport(page, '#map-b .ol-viewport', pixel, button);
}

async function clickViewport(page: Page, selector: string, pixel: readonly [number, number], button: 'left' | 'right'): Promise<void> {
  const bounds = await page.locator(selector).boundingBox();
  if (bounds === null) throw new Error(`Viewport is unavailable: ${selector}`);
  await page.mouse.click(bounds.x + pixel[0], bounds.y + pixel[1], { button });
}

async function isContextMenuVisible(page: Page): Promise<boolean> {
  return page.locator('#map-a .ol-context-menu').isVisible();
}

async function mapBIdentityState(page: Page): Promise<{ readonly sameEarth: boolean; readonly sameViewport: boolean }> {
  return page.evaluate(() => {
    const fixtureWindow = window as unknown as FixtureWindow;
    return {
      sameEarth: fixtureWindow.__OL_ENGINE_TEST__.sameEarth('b'),
      sameViewport: document.querySelector('#map-b .ol-viewport') === fixtureWindow.__OL_ENGINE_B_VIEWPORT_BASELINE__
    };
  });
}

function activeResourceState(summary: CycleSummary, baseline: RuntimeSnapshot) {
  const { snapshot, transform, measure } = summary;
  return {
    transformActive: transform.status === 'active',
    selected: transform.selectedId === 'transform-rectangle',
    toolbarCreated: transform.toolbar && snapshot.dom.toolbars > baseline.dom.toolbars,
    contextMenuCreated: snapshot.dom.contextMenus > baseline.dom.contextMenus,
    tooltipCreated: snapshot.dom.measureTooltips > baseline.dom.measureTooltips,
    layerAdded: snapshot.map.layers > baseline.map.layers,
    interactionAdded: snapshot.map.interactions > baseline.map.interactions,
    overlayAdded: snapshot.map.overlays > baseline.map.overlays,
    animationActive: snapshot.animationHandles > baseline.animationHandles,
    renderPassActive: snapshot.map.renderPasses > baseline.map.renderPasses,
    measureFinished: measure.status === 'finished'
  };
}

function destroyedRuntimeState(snapshot: RuntimeSnapshot) {
  return {
    lifecycle: snapshot.lifecycle,
    isDestroyed: snapshot.isDestroyed,
    registryKeys: [...snapshot.registryKeys].sort(),
    targetAttached: snapshot.map.targetAttached,
    layers: snapshot.map.layers,
    interactions: snapshot.map.interactions,
    overlays: snapshot.map.overlays,
    controls: snapshot.map.controls,
    renderPasses: snapshot.map.renderPasses,
    viewportListeners: snapshot.listeners.viewport,
    contextmenuListeners: snapshot.listeners.contextmenu,
    targetListeners: snapshot.listeners.target,
    viewportNodes: snapshot.dom.viewport,
    canvasNodes: snapshot.dom.canvas,
    contextMenus: snapshot.dom.contextMenus,
    toolbars: snapshot.dom.toolbars,
    measureTooltips: snapshot.dom.measureTooltips,
    animationHandles: snapshot.animationHandles,
    elementCount: snapshot.elementCount
  };
}

function destroyedGlobalState(snapshot: GlobalSnapshot, baseline: GlobalSnapshot) {
  return {
    registryKeys: [...snapshot.registryKeys].sort(),
    documentListenersRestored: snapshot.documentListeners === baseline.documentListeners,
    mapAChildren: snapshot.mapAChildren,
    mapBChildrenUnchanged: snapshot.mapBChildren === baseline.mapBChildren,
    mapAContextMenus: snapshot.mapAContextMenus,
    mapAToolbars: snapshot.mapAToolbars,
    mapAMeasureTooltips: snapshot.mapAMeasureTooltips
  };
}

function stableRuntimeState(snapshot: RuntimeSnapshot) {
  return {
    lifecycle: snapshot.lifecycle,
    isDestroyed: snapshot.isDestroyed,
    map: snapshot.map,
    listeners: snapshot.listeners,
    dom: snapshot.dom,
    animationHandles: snapshot.animationHandles,
    elementCount: snapshot.elementCount
  };
}
