import { expect, test, type Locator, type Page } from '@playwright/test';

interface ResourceSnapshot {
  readonly map: {
    readonly layers: number;
    readonly interactions: number;
    readonly overlays: number;
    readonly renderPasses: number;
  };
  readonly dom: {
    readonly toolbars: number;
    readonly drawTooltips: number;
    readonly editTooltips: number;
    readonly transformTooltips: number;
  };
}

interface TransformSummary {
  readonly status?: string;
  readonly selectedId?: string;
  readonly events: readonly { readonly type?: string }[];
  readonly geometry?: unknown;
  readonly resources: ResourceSnapshot;
}

interface FrameStats {
  readonly frames: number;
  readonly averageMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly over50Ms: number;
}

interface ViewStateSnapshot {
  readonly center: readonly number[];
  readonly zoom?: number;
  readonly resolution?: number;
  readonly rotation: number;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__OL_ENGINE_TEST__?.ready === true)).toBe(true);
  await expect(page.locator('#map-a canvas')).toHaveCount(1);
});

test('万元素与远 world 下 Draw 动态预览保持帧预算和资源稳定', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const map = page.locator('#map-a .ol-viewport');
  expect(await page.evaluate(() => window.__OL_ENGINE_TEST__.populatePerformanceElements(10_000))).toBe(10_000);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.setViewWorld(50.5));
  const baseline = await snapshot(page);
  const idle = frameStats(await sampleFrameIntervals(page, 60));

  await page.evaluate(() => window.__OL_ENGINE_TEST__.startDraw('polyline'));
  const openedBaseline = await snapshot(page);
  expect(openedBaseline.map.layers).toBe(baseline.map.layers + 1);
  expect(openedBaseline.map.interactions).toBe(baseline.map.interactions + 1);
  expect(openedBaseline.map.overlays).toBe(baseline.map.overlays);
  await map.click({ position: { x: 180, y: 280 } });
  const activeBaseline = await snapshot(page);
  expect(activeBaseline.map.overlays).toBe(baseline.map.overlays + 1);
  expect(activeBaseline.dom.drawTooltips).toBe(baseline.dom.drawTooltips + 1);

  const box = await map.boundingBox();
  if (box === null) throw new Error('Draw 地图没有可用的布局范围');
  const intervals = await Promise.all([sampleFrameIntervals(page, 100), movePointerDuringDrag(page, { x: box.x + 180, y: box.y + 280 }, 240)]).then(
    ([samples]) => samples
  );
  const active = frameStats(intervals);
  assertFrameBudget(active, idle, '万元素与远 world 下 Draw 动态预览');
  expectResources(await snapshot(page), activeBaseline);

  await map.click({ button: 'right', position: { x: 380, y: 280 } });
  await expect.poll(() => page.evaluate(() => (window.__OL_ENGINE_TEST__.drawSummary() as { status?: string }).status)).toBe('finished');
  expectResources(await snapshot(page), baseline);
  await testInfo.attach('Draw-万元素远world动态预览性能.json', {
    body: Buffer.from(JSON.stringify({ idle, active }, null, 2)),
    contentType: 'application/json'
  });
});

test('Transform 连续拖拽保持帧预算、提示跟手和资源稳定', async ({ page }, testInfo) => {
  const map = page.locator('#map-a .ol-viewport');
  const baseline = await snapshot(page);
  const idle = frameStats(await sampleFrameIntervals(page, 90));

  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensureTransformElement());
  const original = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.startTransformDirect(false));
  const pixels = await page.evaluate(() => window.__OL_ENGINE_TEST__.transformPixels() as { readonly translate: readonly [number, number] });
  const mapBox = await map.boundingBox();
  if (mapBox === null) throw new Error('Transform 地图没有可用的布局范围');

  const start = { x: mapBox.x + pixels.translate[0], y: mapBox.y + pixels.translate[1] };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  let finalPointer = start;
  let intervals: readonly number[] = [];
  try {
    [intervals, finalPointer] = await Promise.all([sampleFrameIntervals(page, 100), movePointerDuringDrag(page, start, 240)]);
  } finally {
    await page.mouse.up();
  }

  const active = frameStats(intervals);
  await testInfo.attach('Transform-连续拖拽性能.json', {
    body: Buffer.from(JSON.stringify({ idle, active }, null, 2)),
    contentType: 'application/json'
  });

  expect(active.frames).toBe(100);
  expect(active.averageMs).toBeLessThanOrEqual(25);
  expect(active.p95Ms).toBeLessThanOrEqual(Math.max(35, idle.p95Ms * 2));
  expect(active.over50Ms).toBeLessThanOrEqual(Math.ceil(active.frames * 0.05));

  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const tooltipBox = await page.locator('#map-a .ol-transform-tooltip').boundingBox();
  if (tooltipBox === null) throw new Error('Transform 提示框没有可用的布局范围');
  expect(Math.abs(tooltipBox.x - (finalPointer.x + 15))).toBeLessThanOrEqual(2);
  expect(Math.abs(tooltipBox.y + tooltipBox.height - (finalPointer.y - 11))).toBeLessThanOrEqual(2);

  const transformed = await transformSummary(page);
  expect(transformed.events.some(({ type }) => type === 'translateEnd')).toBe(true);
  expect(transformed.geometry).toEqual(original);
  const workingPixels = await page.evaluate(() => window.__OL_ENGINE_TEST__.transformPixels() as { readonly translate: readonly [number, number] });
  expect(workingPixels.translate).not.toEqual(pixels.translate);

  await page.keyboard.press('Escape');
  await expect.poll(() => transformSummary(page).then(({ status }) => status)).toBe('cancelled');
  expect(await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId)).toEqual(original);
  expectResources(await snapshot(page), baseline);

  await page.evaluate(() => {
    for (let index = 0; index < 20; index += 1) {
      window.__OL_ENGINE_TEST__.startTransformDirect(false);
      window.__OL_ENGINE_TEST__.cancelTransform();
    }
  });
  expectResources(await snapshot(page), baseline);
});

test('万顶点 Transform 在远 world 实际拖拽时保持帧预算和资源稳定', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const map = page.locator('#map-a .ol-viewport');
  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensurePerformanceEditElement(10_000));
  const original = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.setViewWorld(50));
  const baseline = await snapshot(page);
  await page.evaluate((id) => window.__OL_ENGINE_TEST__.startTransformElement(id), elementId);
  await expect.poll(() => transformSummary(page).then(({ status }) => status)).toBe('active');
  const activeBaseline = await snapshot(page);
  const idle = frameStats(await sampleFrameIntervals(page, 60));
  const pixels = await page.evaluate(() => window.__OL_ENGINE_TEST__.transformPixels() as { readonly translate: readonly [number, number] });
  const box = await map.boundingBox();
  if (box === null) throw new Error('Transform 地图没有可用的布局范围');
  const start = { x: box.x + pixels.translate[0], y: box.y + pixels.translate[1] };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  let intervals: readonly number[] = [];
  try {
    [intervals] = await Promise.all([sampleFrameIntervals(page, 100), movePointerDuringDrag(page, start, 240)]);
  } finally {
    await page.mouse.up();
  }
  const active = frameStats(intervals);
  assertFrameBudget(active, idle, '万顶点 Transform 远 world 实际拖拽');
  const transformed = await transformSummary(page);
  expect(transformed.events.some(({ type }) => type === 'translateEnd')).toBe(true);
  expectResources(await snapshot(page), activeBaseline);

  await page.evaluate(() => window.__OL_ENGINE_TEST__.cancelTransform());
  await expect.poll(() => transformSummary(page).then(({ status }) => status)).toBe('cancelled');
  expect(await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId)).toEqual(original);
  expectResources(await snapshot(page), baseline);
  await testInfo.attach('Transform-万顶点远world拖拽性能.json', {
    body: Buffer.from(JSON.stringify({ idle, active }, null, 2)),
    contentType: 'application/json'
  });
});

test('万元素与远 world 下 Transform 激活时地图平移和缩放保持连续、帧预算及资源稳定', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const map = page.locator('#map-a .ol-viewport');
  expect(await page.evaluate(() => window.__OL_ENGINE_TEST__.populatePerformanceElements(10_000))).toBe(10_000);
  const baseline = await snapshot(page);
  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensureTransformElement());
  const original = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.setViewWorld(50));
  await page.evaluate(() => window.__OL_ENGINE_TEST__.startTransformDirect());
  await expect.poll(() => transformSummary(page).then(({ status }) => status)).toBe('active');
  const activeBaseline = await snapshot(page);
  const idle = frameStats(await sampleFrameIntervals(page, 60));

  const beforePan = await viewState(page);
  const [panIntervals, panViews] = await Promise.all([sampleFrameIntervals(page, 90), sampleViewStates(page, 90), moveMapDuringTransform(page, map, 140)]);
  const afterPan = await viewState(page);
  const pan = frameStats(panIntervals);

  expect(afterPan.center, 'Transform 激活时地图中心应随平移变化').not.toEqual(beforePan.center);
  expect(distinctCenterCount(panViews), 'Transform 激活时平移应跨多帧连续更新地图中心').toBeGreaterThan(8);
  assertFrameBudget(pan, idle, 'Transform 激活时地图平移');
  expectResources(await snapshot(page), activeBaseline);
  expectTransformActive(await transformSummary(page), elementId, original);

  await page.waitForTimeout(350);
  const mapBox = await map.boundingBox();
  if (mapBox === null) throw new Error('Transform 地图没有可用的布局范围');
  await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  const beforeZoom = await viewState(page);
  const [zoomIntervals, zoomViews] = await Promise.all([sampleFrameIntervals(page, 100), sampleViewStates(page, 100), emitTouchpadWheelSequence(page, 90)]);
  const zoom = frameStats(zoomIntervals);

  await expect.poll(() => viewState(page).then(({ resolution }) => resolution)).not.toBe(beforeZoom.resolution);
  expect(countResolutionChanges(zoomViews), 'Transform 激活时小增量滚轮应跨多帧连续更新分辨率').toBeGreaterThan(8);
  assertFrameBudget(zoom, idle, 'Transform 激活时触控板式小增量缩放');
  expectResources(await snapshot(page), activeBaseline);
  expectTransformActive(await transformSummary(page), elementId, original);

  await testInfo.attach('Transform-地图视图交互性能.json', {
    body: Buffer.from(JSON.stringify({ idle, pan, zoom, beforePan, afterPan, beforeZoom, panViews, zoomViews }, null, 2)),
    contentType: 'application/json'
  });

  await page.evaluate(() => window.__OL_ENGINE_TEST__.cancelTransform());
  await expect.poll(() => transformSummary(page).then(({ status }) => status)).toBe('cancelled');
  expectResources(await snapshot(page), baseline);
});

test('64 顶点 Edit 连续拖拽保持帧预算、预览原子性和资源稳定', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const map = page.locator('#map-a .ol-viewport');
  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensurePerformanceEditElement(64));
  const baseline = await snapshot(page);
  const startEditLatencyMs = await page.evaluate((id) => (window.__OL_ENGINE_TEST__.startEdit(id) as { startLatencyMs?: number }).startLatencyMs, elementId);
  expect(startEditLatencyMs, '浏览器夹具应记录公开 earth.draw.edit 同步耗时').toBeDefined();
  expect(startEditLatencyMs, '64 顶点 Edit startEdit 同步耗时').toBeLessThanOrEqual(100);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.setViewWorld(50));
  const activeBaseline = await snapshot(page);
  expect(activeBaseline.map.layers).toBe(baseline.map.layers + 1);
  expect(activeBaseline.map.interactions).toBe(baseline.map.interactions + 1);
  const idle = frameStats(await sampleFrameIntervals(page, 60));
  const anchor = await page.evaluate(() => window.__OL_ENGINE_TEST__.editControlPixel(32));
  const box = await map.boundingBox();
  if (box === null) throw new Error('Edit 地图没有可用的布局范围');
  const start = { x: box.x + anchor[0], y: box.y + anchor[1] };
  await page.mouse.move(start.x, start.y);
  await armPointerDownLatency(page);
  await page.mouse.down();
  const pointerDownLatencyMs = await readPointerDownLatency(page);
  expect(pointerDownLatencyMs, '跨 50 world 的 Edit 锚点 pointerdown 同步命中耗时').toBeLessThanOrEqual(50);
  let intervals: readonly number[] = [];
  let pointerUpLatencyMs = Number.POSITIVE_INFINITY;
  let pointerUpWallMs = Number.POSITIVE_INFINITY;
  try {
    [intervals] = await Promise.all([sampleFrameIntervals(page, 100), movePointerDuringDrag(page, start, 240)]);
  } finally {
    await armPointerUpLatency(page);
    const pointerUpStarted = performance.now();
    await page.mouse.up();
    pointerUpWallMs = performance.now() - pointerUpStarted;
    pointerUpLatencyMs = await readPointerUpLatency(page);
  }
  expect(pointerUpLatencyMs, '64 顶点 Edit pointerup 同步恢复耗时').toBeLessThanOrEqual(100);
  const active = frameStats(intervals);
  await testInfo.attach('Edit-64顶点连续拖拽性能.json', {
    body: Buffer.from(JSON.stringify({ startEditLatencyMs, pointerDownLatencyMs, pointerUpLatencyMs, pointerUpWallMs, idle, active }, null, 2)),
    contentType: 'application/json'
  });
  assertFrameBudget(active, idle, '64 顶点 Edit 连续拖拽');
  const editing = await page.evaluate(
    () => window.__OL_ENGINE_TEST__.editSummary() as { events: readonly { type?: string }[]; stored?: unknown; original?: unknown }
  );
  expect(editing.events.some(({ type }) => type === 'modifying')).toBe(true);
  expect(editing.stored).toEqual(editing.original);

  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.9, { button: 'right' });
  await expect.poll(() => page.evaluate(() => (window.__OL_ENGINE_TEST__.editSummary() as { status?: string }).status)).toBe('finished');
  expectResources(await snapshot(page), baseline);
});

test('32 控制点燕尾进攻箭头 Edit 连续拖拽保持帧预算、最终坐标和资源稳定', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const map = page.locator('#map-a .ol-viewport');
  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensurePerformanceTailedAttackArrow(32));
  const baseline = await snapshot(page);
  const startEditLatencyMs = await page.evaluate((id) => (window.__OL_ENGINE_TEST__.startEdit(id) as { startLatencyMs?: number }).startLatencyMs, elementId);
  expect(startEditLatencyMs, '浏览器夹具应记录燕尾进攻箭头 earth.draw.edit 同步耗时').toBeDefined();
  expect(startEditLatencyMs, '32 控制点燕尾进攻箭头 Edit startEdit 同步耗时').toBeLessThanOrEqual(100);

  const activeBaseline = await snapshot(page);
  expect(activeBaseline.map.layers).toBe(baseline.map.layers + 1);
  expect(activeBaseline.map.interactions).toBe(baseline.map.interactions + 1);
  const idle = frameStats(await sampleFrameIntervals(page, 60));
  const anchor = await page.evaluate(() => window.__OL_ENGINE_TEST__.editControlPixel(31));
  const box = await map.boundingBox();
  if (box === null) throw new Error('燕尾进攻箭头 Edit 地图没有可用的布局范围');
  const start = { x: box.x + anchor[0], y: box.y + anchor[1] };

  await page.mouse.move(start.x, start.y);
  await expect(page.locator('#map-a .ol-edit-tooltip')).toContainText('拖拽控制点编辑图形');
  await armPointerDownLatency(page);
  await page.mouse.down();
  await expect(page.locator('#map-a .ol-edit-tooltip')).toContainText('拖拽中');
  const pointerDownLatencyMs = await readPointerDownLatency(page);
  expect(pointerDownLatencyMs, '燕尾进攻箭头 Edit 锚点 pointerdown 同步命中耗时').toBeLessThanOrEqual(50);

  let intervals: readonly number[] = [];
  let finalPointer = start;
  let pointerUpLatencyMs = Number.POSITIVE_INFINITY;
  let pointerUpWallMs = Number.POSITIVE_INFINITY;
  try {
    [intervals, finalPointer] = await Promise.all([sampleFrameIntervals(page, 100), movePointerDuringDrag(page, start, 240)]);
  } finally {
    await armPointerUpLatency(page);
    const pointerUpStarted = performance.now();
    await page.mouse.up();
    pointerUpWallMs = performance.now() - pointerUpStarted;
    pointerUpLatencyMs = await readPointerUpLatency(page);
  }
  await expect(page.locator('#map-a .ol-edit-tooltip')).toContainText('拖拽控制点编辑图形');
  expect(pointerUpLatencyMs, '32 控制点燕尾进攻箭头 Edit pointerup 同步恢复耗时').toBeLessThanOrEqual(100);

  const active = frameStats(intervals);
  await testInfo.attach('Edit-32控制点燕尾进攻箭头连续拖拽性能.json', {
    body: Buffer.from(JSON.stringify({ startEditLatencyMs, pointerDownLatencyMs, pointerUpLatencyMs, pointerUpWallMs, finalPointer, idle, active }, null, 2)),
    contentType: 'application/json'
  });
  assertFrameBudget(active, idle, '32 控制点燕尾进攻箭头 Edit 连续拖拽');

  const editing = await page.evaluate(
    () =>
      window.__OL_ENGINE_TEST__.editSummary() as {
        events: readonly { type?: string; operation?: string; geometry?: { type?: string; controlPoints?: readonly (readonly number[])[] } }[];
        stored?: unknown;
        original?: unknown;
      }
  );
  const latestMove = [...editing.events].reverse().find(({ type, operation }) => type === 'modifying' && operation === 'move');
  expect(latestMove?.geometry?.type).toBe('tailed-attack-arrow');
  expect(latestMove?.geometry?.controlPoints).toHaveLength(32);
  expect(latestMove?.geometry).not.toEqual(editing.original);
  expect(editing.stored).toEqual(editing.original);

  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.9, { button: 'right' });
  await expect.poll(() => page.evaluate(() => (window.__OL_ENGINE_TEST__.editSummary() as { status?: string }).status)).toBe('finished');
  const finished = await page.evaluate(() => window.__OL_ENGINE_TEST__.editSummary() as { stored?: unknown; original?: unknown });
  expect(finished.stored).not.toEqual(finished.original);
  expectResources(await snapshot(page), baseline);
});

test('万顶点 Edit 反复跨 world 时避免重建全部锚点索引', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const map = page.locator('#map-a .ol-viewport');
  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensurePerformanceEditElement(10_000));
  const baseline = await snapshot(page);
  await page.evaluate((id) => window.__OL_ENGINE_TEST__.startEdit(id), elementId);
  const activeBaseline = await snapshot(page);
  const worlds = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? 1 : 0));
  await page.evaluate(() => window.__OL_ENGINE_TEST__.measureViewWorldChanges([1, 0]));
  const durations = await page.evaluate((indices) => window.__OL_ENGINE_TEST__.measureViewWorldChanges(indices), worlds);
  const crossings = frameStats(durations);

  expect(crossings.averageMs, '万顶点 Edit 跨 world 平均同步耗时').toBeLessThanOrEqual(8);
  expect(crossings.p95Ms, '万顶点 Edit 跨 world P95 同步耗时').toBeLessThanOrEqual(12);
  expect(crossings.maxMs, '万顶点 Edit 跨 world 最大同步耗时').toBeLessThanOrEqual(25);
  expectResources(await snapshot(page), activeBaseline);
  await testInfo.attach('Edit-万顶点跨world索引性能.json', {
    body: Buffer.from(JSON.stringify({ crossings, durations }, null, 2)),
    contentType: 'application/json'
  });

  const box = await map.boundingBox();
  if (box === null) throw new Error('Edit 地图没有可用的布局范围');
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.9, { button: 'right' });
  await expect.poll(() => page.evaluate(() => (window.__OL_ENGINE_TEST__.editSummary() as { status?: string }).status)).toBe('finished');
  expectResources(await snapshot(page), baseline);
});

/** 以 window 捕获和冒泡阶段为边界，测量 pointerdown 的同步处理耗时。 */
async function armPointerDownLatency(page: Page): Promise<void> {
  await page.evaluate(() => {
    delete document.documentElement.dataset.editPointerDownLatency;
    let started: number | undefined;
    window.addEventListener(
      'pointerdown',
      () => {
        started = performance.now();
      },
      { capture: true, once: true }
    );
    window.addEventListener(
      'pointerdown',
      () => {
        if (started !== undefined) document.documentElement.dataset.editPointerDownLatency = String(performance.now() - started);
      },
      { once: true }
    );
  });
}

/** 读取浏览器记录的 pointerdown 同步处理耗时。 */
async function readPointerDownLatency(page: Page): Promise<number> {
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.editPointerDownLatency)).not.toBeUndefined();
  return page.evaluate(() => Number(document.documentElement.dataset.editPointerDownLatency));
}

/** 以 window 捕获和冒泡阶段为边界，测量 pointerup 的同步处理耗时。 */
async function armPointerUpLatency(page: Page): Promise<void> {
  await page.evaluate(() => {
    delete document.documentElement.dataset.editPointerUpLatency;
    let started: number | undefined;
    window.addEventListener(
      'pointerup',
      () => {
        started = performance.now();
      },
      { capture: true, once: true }
    );
    window.addEventListener(
      'pointerup',
      () => {
        if (started !== undefined) document.documentElement.dataset.editPointerUpLatency = String(performance.now() - started);
      },
      { once: true }
    );
  });
}

/** 读取浏览器记录的 pointerup 同步处理耗时。 */
async function readPointerUpLatency(page: Page): Promise<number> {
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.editPointerUpLatency)).not.toBeUndefined();
  return page.evaluate(() => Number(document.documentElement.dataset.editPointerUpLatency));
}

async function sampleFrameIntervals(page: Page, frames: number): Promise<readonly number[]> {
  return page.evaluate(async (frameCount) => {
    const samples: number[] = [];
    let previous = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    for (let index = 0; index < frameCount; index += 1) {
      const current = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      samples.push(current - previous);
      previous = current;
    }
    return samples;
  }, frames);
}

async function sampleViewStates(page: Page, frames: number): Promise<readonly ViewStateSnapshot[]> {
  return page.evaluate(async (frameCount) => {
    const samples: ViewStateSnapshot[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      samples.push(window.__OL_ENGINE_TEST__.viewState('a'));
    }
    return samples;
  }, frames);
}

async function moveMapDuringTransform(page: Page, map: Locator, steps: number): Promise<void> {
  const box = await map.boundingBox();
  if (box === null) throw new Error('Transform 地图没有可用的布局范围');
  const start = { x: box.x + box.width * 0.18, y: box.y + box.height * 0.78 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  try {
    for (let index = 1; index <= steps; index += 1) {
      const progress = index / steps;
      await page.mouse.move(start.x + progress * 170, start.y - progress * 70);
      await new Promise<void>((resolve) => setTimeout(resolve, 7));
    }
  } finally {
    await page.mouse.up();
  }
}

async function emitTouchpadWheelSequence(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const direction = index < 55 || index >= 70 ? -1 : 1;
    await page.mouse.wheel(0, direction * 2);
    await new Promise<void>((resolve) => setTimeout(resolve, 12));
  }
}

async function movePointerDuringDrag(page: Page, start: Readonly<{ x: number; y: number }>, steps: number): Promise<Readonly<{ x: number; y: number }>> {
  let current = start;
  for (let index = 0; index < steps; index += 1) {
    const phase = index % 80;
    const direction = Math.floor(index / 80) % 2 === 0 ? phase : 79 - phase;
    current = {
      x: start.x + 18 + (direction / 79) * 62,
      y: start.y + Math.sin(index / 9) * 24
    };
    await page.mouse.move(current.x, current.y);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  return current;
}

function frameStats(intervals: readonly number[]): FrameStats {
  const sorted = [...intervals].sort((left, right) => left - right);
  const p95Index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95));
  return Object.freeze({
    frames: intervals.length,
    averageMs: intervals.reduce((total, value) => total + value, 0) / Math.max(1, intervals.length),
    p95Ms: sorted[p95Index] ?? 0,
    maxMs: sorted.at(-1) ?? 0,
    over50Ms: intervals.filter((value) => value > 50).length
  });
}

function distinctCenterCount(states: readonly ViewStateSnapshot[]): number {
  return new Set(states.map(({ center }) => center.map((value) => value.toFixed(2)).join(','))).size;
}

function countResolutionChanges(states: readonly ViewStateSnapshot[]): number {
  let changes = 0;
  for (let index = 1; index < states.length; index += 1) {
    if (states[index].resolution !== states[index - 1].resolution) changes += 1;
  }
  return changes;
}

function assertFrameBudget(active: FrameStats, idle: FrameStats, label: string): void {
  expect(active.frames, `${label}采样帧数`).toBeGreaterThan(0);
  expect(active.averageMs, `${label}平均帧耗时`).toBeLessThanOrEqual(25);
  expect(active.p95Ms, `${label} P95 帧耗时`).toBeLessThanOrEqual(Math.max(35, idle.p95Ms * 2));
  expect(active.over50Ms, `${label}超过 50ms 的帧数`).toBeLessThanOrEqual(Math.ceil(active.frames * 0.05));
}

function snapshot(page: Page): Promise<ResourceSnapshot> {
  return page.evaluate(() => window.__OL_ENGINE_TEST__.snapshot('a') as ResourceSnapshot);
}

function transformSummary(page: Page): Promise<TransformSummary> {
  return page.evaluate(() => window.__OL_ENGINE_TEST__.transformSummary() as TransformSummary);
}

function viewState(page: Page): Promise<ViewStateSnapshot> {
  return page.evaluate(() => window.__OL_ENGINE_TEST__.viewState('a'));
}

function expectTransformActive(summary: TransformSummary, elementId: string, original: unknown): void {
  expect(summary.status).toBe('active');
  expect(summary.selectedId, 'Transform 激活期间应保持原选中元素').toBe(elementId);
  expect(summary.geometry).toEqual(original);
}

function expectResources(actual: ResourceSnapshot, baseline: ResourceSnapshot): void {
  expect(actual.map.layers).toBe(baseline.map.layers);
  expect(actual.map.interactions).toBe(baseline.map.interactions);
  expect(actual.map.overlays).toBe(baseline.map.overlays);
  expect(actual.map.renderPasses).toBe(baseline.map.renderPasses);
  expect(actual.dom.toolbars).toBe(baseline.dom.toolbars);
  expect(actual.dom.drawTooltips).toBe(baseline.dom.drawTooltips);
  expect(actual.dom.editTooltips).toBe(baseline.dom.editTooltips);
  expect(actual.dom.transformTooltips).toBe(baseline.dom.transformTooltips);
}
