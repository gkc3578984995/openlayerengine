import { expect, test, type Page } from '@playwright/test';

type VisualTheme = 'light' | 'dark';

interface LineworkVisualPreparation {
  readonly theme: VisualTheme;
  readonly resolution: number;
  readonly rotation: number;
  readonly worldCopy: number;
}

interface LineworkVisualFixture {
  readonly ready: boolean;
  prepare(input: LineworkVisualPreparation): void;
  probeCasingSides(): Record<string, { readonly above: number; readonly center: number; readonly below: number }>;
  probeCapColors(): {
    readonly bar: { readonly foreground: number; readonly casing: number };
    readonly arrow: { readonly foreground: number; readonly casing: number };
  };
  probePolygonTracks(): Record<string, { readonly inner: number; readonly center: number; readonly outer: number }>;
}

test.describe('路径线饰像素级视觉回归', () => {
  test.use({ viewport: { width: 860, height: 760 }, deviceScaleFactor: 1 });

  test('浅色背景下覆盖 14px 单轨装饰、10px 双轨间隙、端帽、三种衬色、曲线、文本和 Polygon', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { theme: 'light', resolution: 1, rotation: 0, worldCopy: 0 });
    await expect(page.getByTestId('linework-map')).toHaveScreenshot('linework-all-light-dpr1.png', screenshotOptions);
  });

  test('闭合 Polygon 的五种重复装饰都保留双轨，并按居中衬色填充轨间间隙', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { theme: 'light', resolution: 1, rotation: 0, worldCopy: 0 });
    const probes = await page.evaluate(() =>
      (window as unknown as { __OL_ENGINE_LINEWORK_VISUAL__: LineworkVisualFixture }).__OL_ENGINE_LINEWORK_VISUAL__.probePolygonTracks()
    );

    for (const decoration of ['tick', 'alternating-tick', 'double-tick', 'square', 'circle'] as const) {
      expect(probes[decoration]?.inner, `${decoration} inner track`).toBeGreaterThanOrEqual(45);
      expect(probes[decoration]?.outer, `${decoration} outer track`).toBeGreaterThanOrEqual(20);
      if (decoration === 'double-tick') expect(probes[decoration]?.center, `${decoration} centered casing`).toBeGreaterThanOrEqual(45);
      else expect(probes[decoration]?.center, `${decoration} logical center`).toBeLessThan(35);
    }
  });

  test('开放路径按声明方向区分衬色侧，Polygon 按拓扑内外区分', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { theme: 'light', resolution: 1, rotation: 0, worldCopy: 0 });
    const probes = await page.evaluate(() =>
      (window as unknown as { __OL_ENGINE_LINEWORK_VISUAL__: LineworkVisualFixture }).__OL_ENGINE_LINEWORK_VISUAL__.probeCasingSides()
    );

    expect(probes.openInner?.below).toBeGreaterThan(45);
    expect(probes.openInner?.above).toBeLessThan(15);
    expect(probes.openOuter?.above).toBeGreaterThan(45);
    expect(probes.openOuter?.below).toBeLessThan(15);
    expect(probes.openCenter?.center).toBeGreaterThan(35);
    expect(probes.polygonInner?.above).toBeGreaterThan(45);
    expect(probes.polygonInner?.below).toBeLessThan(15);
    expect(probes.polygonOuter?.below).toBeGreaterThan(45);
    expect(probes.polygonOuter?.above).toBeLessThan(15);
    expect(probes.polygonCenter?.above).toBeGreaterThan(45);
    expect(probes.polygonCenter?.below).toBeGreaterThan(45);
  });

  test('bar 与 arrow 端帽保持前景色，且 footprint 内不泄漏 casing 色', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { theme: 'light', resolution: 1, rotation: 0, worldCopy: 0 });
    const probes = await page.evaluate(() =>
      (window as unknown as { __OL_ENGINE_LINEWORK_VISUAL__: LineworkVisualFixture }).__OL_ENGINE_LINEWORK_VISUAL__.probeCapColors()
    );

    expect(probes.bar.foreground).toBeGreaterThanOrEqual(20);
    expect(probes.arrow.foreground).toBeGreaterThanOrEqual(30);
    expect(probes.bar.casing).toBe(0);
    expect(probes.arrow.casing).toBe(0);
  });
});

test.describe('路径线饰与衬色的高 DPI、旋转及 world wrap 视觉回归', () => {
  test.use({ viewport: { width: 860, height: 760 }, deviceScaleFactor: 2 });

  test('深色背景的相邻世界副本保持像素尺寸、装饰相位和文本正向', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { theme: 'dark', resolution: 1.2, rotation: Math.PI / 10, worldCopy: 1 });
    await expect(page.getByTestId('linework-map')).toHaveScreenshot('linework-wrapped-rotated-dark-dpr2.png', screenshotOptions);
  });
});

const screenshotOptions = Object.freeze({ animations: 'disabled' as const, maxDiffPixelRatio: 0.003, threshold: 0.18 });

async function openFixture(page: Page): Promise<void> {
  await page.goto('/linework-visual.html');
  await page.waitForFunction(
    () => (window as unknown as { __OL_ENGINE_LINEWORK_VISUAL__?: LineworkVisualFixture }).__OL_ENGINE_LINEWORK_VISUAL__?.ready === true
  );
}

async function prepare(page: Page, input: LineworkVisualPreparation): Promise<void> {
  await page.evaluate((value) => {
    (window as unknown as { __OL_ENGINE_LINEWORK_VISUAL__: LineworkVisualFixture }).__OL_ENGINE_LINEWORK_VISUAL__.prepare(value);
  }, input);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
