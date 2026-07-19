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
}

test.describe('路径线饰像素级视觉回归', () => {
  test.use({ viewport: { width: 860, height: 760 }, deviceScaleFactor: 1 });

  test('浅色背景下覆盖全部内置线饰、曲线、文本和 Polygon', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { theme: 'light', resolution: 1, rotation: 0, worldCopy: 0 });
    await expect(page.getByTestId('linework-map')).toHaveScreenshot('linework-all-light-dpr1.png', screenshotOptions);
  });
});

test.describe('路径线饰高 DPI、旋转与 world wrap 视觉回归', () => {
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
