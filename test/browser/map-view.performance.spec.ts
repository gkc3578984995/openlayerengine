import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

interface MapOnlySnapshot {
  readonly elementCount: number;
  readonly center: readonly number[];
  readonly zoom?: number;
  readonly resolution?: number;
  readonly layers: number;
  readonly interactions: number;
  readonly overlays: number;
}

interface FrameStats {
  readonly frames: number;
  readonly averageMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly over50Ms: number;
}

interface ViewPerformanceResult {
  readonly idle: FrameStats;
  readonly pan: FrameStats;
  readonly zoom: FrameStats;
}

interface FrameBudget {
  readonly averageMs: number;
  readonly p95FloorMs: number;
  readonly idleP95Multiplier: number;
  readonly over50Ratio: number;
}

const interactiveFrameBudget: FrameBudget = Object.freeze({ averageMs: 25, p95FloorMs: 35, idleP95Multiplier: 2.5, over50Ratio: 0.05 });
const tenThousandElementStressBudget: FrameBudget = Object.freeze({ averageMs: 40, p95FloorMs: 60, idleP95Multiplier: 3.5, over50Ratio: 0.15 });

test.beforeEach(async ({ page }) => {
  await page.goto('/map-only.html');
  await expect.poll(() => page.evaluate(() => window.__OL_ENGINE_MAP_ONLY__?.ready === true)).toBe(true);
  await expect(page.locator('#map canvas')).toHaveCount(1);
});

test('纯地图触控板式小增量滚轮保持连续缩放与帧预算', async ({ page }, testInfo) => {
  const map = page.locator('#map .ol-viewport');
  const box = await map.boundingBox();
  if (box === null) throw new Error('纯地图页面没有可用的布局范围');
  await page.evaluate(() => window.__OL_ENGINE_MAP_ONLY__.resetView());
  const idle = frameStats(await sampleFrameIntervals(page, 60));
  const before = await snapshot(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const [intervals, resolutions] = await Promise.all([sampleFrameIntervals(page, 100), sampleResolutions(page, 100), emitTouchpadWheelSequence(page, 90)]);
  const active = frameStats(intervals);
  const distinct = new Set(resolutions.map((value) => value.toFixed(6)));

  expect(distinct.size, '小增量滚轮应产生多个连续分辨率').toBeGreaterThan(8);
  expect(countResolutionChanges(resolutions), '小增量滚轮应跨多帧更新分辨率').toBeGreaterThan(8);
  await expect.poll(() => snapshot(page).then((state) => state.resolution)).not.toBe(before.resolution);
  const after = await snapshot(page);
  expect(after.layers).toBe(before.layers);
  expect(after.interactions).toBe(before.interactions);
  expect(after.overlays).toBe(before.overlays);
  assertFrameBudget(active, idle, '触控板式小增量缩放');

  await testInfo.attach('触控板式小增量缩放性能.json', {
    body: Buffer.from(JSON.stringify({ before, after, idle, active, resolutions }, null, 2)),
    contentType: 'application/json'
  });
});

test('纯地图页面在空载、1k、10k 和远 world 场景下保持平移与缩放帧预算', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const map = page.locator('#map .ol-viewport');
  const baseline = await snapshot(page);
  const empty = await measureViewPerformance(page, map, testInfo, '空地图');

  const populated = await page.evaluate(() => window.__OL_ENGINE_MAP_ONLY__.populate(1_000));
  expect(populated.elementCount).toBe(1_000);
  expect(populated.layers).toBe(baseline.layers);
  expect(populated.interactions).toBe(baseline.interactions);
  expect(populated.overlays).toBe(baseline.overlays);
  const thousandElements = await measureViewPerformance(page, map, testInfo, '千元素');

  const populatedTenThousand = await page.evaluate(() => window.__OL_ENGINE_MAP_ONLY__.populate(10_000));
  expect(populatedTenThousand.elementCount).toBe(10_000);
  const tenThousandElements = await measureViewPerformance(page, map, testInfo, '万元素压力样本', 0, tenThousandElementStressBudget);
  const tenThousandWorld50 = await measureViewPerformance(page, map, testInfo, '万元素 world +50 压力样本', 50, tenThousandElementStressBudget);

  await testInfo.attach('地图视图性能.json', {
    body: Buffer.from(JSON.stringify({ empty, thousandElements, tenThousandElements, tenThousandWorld50 }, null, 2)),
    contentType: 'application/json'
  });
});

async function measureViewPerformance(
  page: Page,
  map: Locator,
  testInfo: TestInfo,
  label: string,
  worldIndex = 0,
  budget: FrameBudget = interactiveFrameBudget
): Promise<ViewPerformanceResult> {
  await page.evaluate((world) => window.__OL_ENGINE_MAP_ONLY__.resetView(world), worldIndex);
  const idle = frameStats(await sampleFrameIntervals(page, 60));
  const beforePan = await snapshot(page);
  const pan = frameStats(await sampleDuringPan(page, map, 80));
  const afterPan = await snapshot(page);
  expect(afterPan.center).not.toEqual(beforePan.center);
  assertFrameBudget(pan, idle, `${label}平移`, budget);

  await page.evaluate((world) => window.__OL_ENGINE_MAP_ONLY__.resetView(world), worldIndex);
  const beforeZoom = await snapshot(page);
  const zoom = frameStats(await sampleDuringZoom(page, map, 80));
  await expect.poll(() => snapshot(page).then((state) => state.resolution)).not.toBe(beforeZoom.resolution);
  assertFrameBudget(zoom, idle, `${label}缩放`, budget);

  await testInfo.attach(`${label}视图性能.json`, {
    body: Buffer.from(JSON.stringify({ idle, pan, zoom }, null, 2)),
    contentType: 'application/json'
  });
  return Object.freeze({ idle, pan, zoom });
}

async function sampleDuringPan(page: Page, map: Locator, frames: number): Promise<readonly number[]> {
  const box = await map.boundingBox();
  if (box === null) throw new Error('纯地图页面没有可用的布局范围');
  const start = { x: box.x + box.width * 0.56, y: box.y + box.height * 0.52 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  try {
    const [samples] = await Promise.all([sampleFrameIntervals(page, frames), emitPanSequence(page, start, 160)]);
    return samples;
  } finally {
    await page.mouse.up();
  }
}

async function sampleDuringZoom(page: Page, map: Locator, frames: number): Promise<readonly number[]> {
  const box = await map.boundingBox();
  if (box === null) throw new Error('纯地图页面没有可用的布局范围');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const [samples] = await Promise.all([sampleFrameIntervals(page, frames), emitWheelSequence(page, 30)]);
  return samples;
}

async function emitPanSequence(page: Page, start: Readonly<{ x: number; y: number }>, steps: number): Promise<void> {
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await page.mouse.move(start.x + progress * 180, start.y - progress * 90);
    await new Promise<void>((resolve) => setTimeout(resolve, 7));
  }
}

async function emitWheelSequence(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const direction = index < 12 || index >= 22 ? -1 : 1;
    await page.mouse.wheel(0, direction * 60);
    await new Promise<void>((resolve) => setTimeout(resolve, 24));
  }
}

async function emitTouchpadWheelSequence(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const direction = index < 55 || index >= 70 ? -1 : 1;
    await page.mouse.wheel(0, direction * 2);
    await new Promise<void>((resolve) => setTimeout(resolve, 12));
  }
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

async function sampleResolutions(page: Page, frames: number): Promise<readonly number[]> {
  return page.evaluate(async (frameCount) => {
    const samples: number[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      const resolution = window.__OL_ENGINE_MAP_ONLY__.snapshot().resolution;
      if (resolution !== undefined) samples.push(resolution);
    }
    return samples;
  }, frames);
}

function countResolutionChanges(resolutions: readonly number[]): number {
  let changes = 0;
  for (let index = 1; index < resolutions.length; index += 1) {
    if (resolutions[index] !== resolutions[index - 1]) changes += 1;
  }
  return changes;
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

function assertFrameBudget(active: FrameStats, idle: FrameStats, label: string, budget: FrameBudget = interactiveFrameBudget): void {
  expect(active.averageMs, `${label} 平均帧耗时`).toBeLessThanOrEqual(budget.averageMs);
  expect(active.p95Ms, `${label} P95 帧耗时`).toBeLessThanOrEqual(Math.max(budget.p95FloorMs, idle.p95Ms * budget.idleP95Multiplier));
  expect(active.over50Ms, `${label} 超过 50ms 的帧数`).toBeLessThanOrEqual(Math.ceil(active.frames * budget.over50Ratio));
}

function snapshot(page: Page): Promise<MapOnlySnapshot> {
  return page.evaluate(() => window.__OL_ENGINE_MAP_ONLY__.snapshot());
}
