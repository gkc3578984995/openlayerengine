import { expect, test, type Page } from '@playwright/test';

type VisualEffect = 'radar-scan' | 'center-spread' | 'path-travel';
type RadarDirection = 'clockwise' | 'counterclockwise';
type VisualTheme = 'light' | 'dark';

interface VisualPreparation {
  readonly effect: VisualEffect;
  readonly direction?: RadarDirection;
  readonly elapsedMs: number;
  readonly rotation: number;
  readonly theme: VisualTheme;
  readonly curvature?: number;
}

interface VisualFixture {
  readonly ready: boolean;
  prepare(input: VisualPreparation): void;
}

test.describe('动画像素级视觉回归', () => {
  test.use({ viewport: { width: 760, height: 480 }, deviceScaleFactor: 1 });

  test('radar-scan 顺时针跨正北并严格裁剪 Sector', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { effect: 'radar-scan', direction: 'clockwise', elapsedMs: 2_400, rotation: 0, theme: 'light' });
    await expect(page.getByTestId('animation-map')).toHaveScreenshot('radar-clockwise-north-light-dpr1.png', screenshotOptions);
  });

  test('radar-scan 逆时针跨正北并保持深色主题对比度', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { effect: 'radar-scan', direction: 'counterclockwise', elapsedMs: 2_400, rotation: 0, theme: 'dark' });
    await expect(page.getByTestId('animation-map')).toHaveScreenshot('radar-counterclockwise-north-dark-dpr1.png', screenshotOptions);
  });

  test('center-spread 在 Circle 与 Sector 内形成连续波纹带', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { effect: 'center-spread', elapsedMs: 2_400, rotation: 0, theme: 'light' });
    await expect(page.getByTestId('animation-map')).toHaveScreenshot('center-spread-circle-sector-light-dpr1.png', screenshotOptions);
  });

  test('path-travel 多点正负曲率保持共享切线与连续 RGBA 渐变', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { effect: 'path-travel', curvature: 0.65, elapsedMs: 3_900, rotation: 0, theme: 'light' });
    await expect(page.getByTestId('animation-map')).toHaveScreenshot('path-travel-positive-light-dpr1.png', pathScreenshotOptions);

    await prepare(page, { effect: 'path-travel', curvature: -1, elapsedMs: 3_900, rotation: 0, theme: 'dark' });
    await expect(page.getByTestId('animation-map')).toHaveScreenshot('path-travel-negative-dark-dpr1.png', pathScreenshotOptions);
  });
});

test.describe('动画高 DPI 与旋转视觉回归', () => {
  test.use({ viewport: { width: 760, height: 480 }, deviceScaleFactor: 2 });

  test('旋转视图中的径向效果保持屏幕方向、边界与渐变连续', async ({ page }) => {
    await openFixture(page);
    await prepare(page, { effect: 'radar-scan', direction: 'clockwise', elapsedMs: 2_400, rotation: Math.PI / 5, theme: 'dark' });
    await expect(page.getByTestId('animation-map')).toHaveScreenshot('radar-rotated-dark-dpr2.png', screenshotOptions);

    await prepare(page, { effect: 'center-spread', elapsedMs: 2_400, rotation: Math.PI / 5, theme: 'dark' });
    await expect(page.getByTestId('animation-map')).toHaveScreenshot('center-spread-rotated-dark-dpr2.png', screenshotOptions);

    await prepare(page, { effect: 'path-travel', curvature: 0.65, elapsedMs: 3_900, rotation: Math.PI / 5, theme: 'dark' });
    await expect(page.getByTestId('animation-map')).toHaveScreenshot('path-travel-rotated-dark-dpr2.png', pathScreenshotOptions);
  });
});

const screenshotOptions = Object.freeze({ animations: 'disabled' as const, maxDiffPixelRatio: 0.004, threshold: 0.18 });
const pathScreenshotOptions = Object.freeze({ ...screenshotOptions, maxDiffPixelRatio: 0.001 });

async function openFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let now = 1_000_000;
    Date.now = () => now;
    Object.defineProperty(window, '__OL_ENGINE_ANIMATION_VISUAL_CLOCK__', {
      configurable: false,
      value: Object.freeze({
        now: () => now,
        set: (value: number) => {
          if (!Number.isFinite(value)) throw new Error('视觉回归时钟必须是有限数');
          now = value;
        }
      })
    });
  });
  await page.goto('/animation-visual.html');
  await page.waitForFunction(() => (window as unknown as { __OL_ENGINE_ANIMATION_VISUAL__?: VisualFixture }).__OL_ENGINE_ANIMATION_VISUAL__?.ready === true);
}

async function prepare(page: Page, input: VisualPreparation): Promise<void> {
  await page.evaluate((value) => {
    (window as unknown as { __OL_ENGINE_ANIMATION_VISUAL__: VisualFixture }).__OL_ENGINE_ANIMATION_VISUAL__.prepare(value);
  }, input);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
