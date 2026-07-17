import { expect, test } from '@playwright/test';

interface PresentationSpikeSnapshot {
  readonly sourceIds: readonly string[];
  readonly hits: Readonly<Record<string, readonly string[]>>;
  readonly declutterPixel: readonly [number, number, number, number];
  readonly replacementPixel: readonly [number, number, number, number];
  readonly replacementHits: readonly string[];
  readonly alpha: Readonly<{ before: number; during: number; after: number }>;
}

test('透明代理保留规范命中和 declutter，占位替身在 postrender 使用整体 alpha 且不进入命中索引', async ({ page }) => {
  await page.goto('/presentation-spike.html');
  await page.waitForFunction(() => (window as unknown as { __PRESENTATION_SPIKE__?: { ready: boolean } }).__PRESENTATION_SPIKE__?.ready === true);
  const snapshot = await page.evaluate(() =>
    (window as unknown as { __PRESENTATION_SPIKE__: { snapshot(): PresentationSpikeSnapshot } }).__PRESENTATION_SPIKE__.snapshot()
  );

  for (const id of ['point', 'icon', 'polyline', 'polygon', 'circle', 'declutter-proxy']) {
    expect(snapshot.sourceIds).toContain(id);
    expect(snapshot.hits[id]).toContain(id);
  }
  expect(snapshot.hits['declutter-proxy']).not.toContain('declutter-competitor');
  expect(snapshot.declutterPixel[3]).toBeLessThanOrEqual(5);
  expect(snapshot.alpha.before).toBe(1);
  expect(snapshot.alpha.during).toBe(0.5);
  expect(snapshot.alpha.after).toBe(1);
  expect(snapshot.replacementPixel[0]).toBeGreaterThan(100);
  expect(snapshot.replacementPixel[2]).toBeGreaterThan(100);
  expect(snapshot.replacementPixel[3]).toBeGreaterThan(240);
  expect(snapshot.replacementHits).toContain('replacement-underlay');
  expect(snapshot.replacementHits).not.toContain('replacement-not-in-source');
});
