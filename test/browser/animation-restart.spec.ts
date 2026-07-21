import { expect, test } from '@playwright/test';

interface AnimationRestartResult {
  readonly firstProgressed: boolean;
  readonly cleanupRendered: boolean;
  readonly secondProgressed: boolean;
  readonly secondStatus: string;
  readonly secondFrames: number;
}

interface FixtureWindow extends Window {
  readonly __OL_ENGINE_TEST__: {
    readonly ready: boolean;
    restartOverlayAnimation(): Promise<AnimationRestartResult>;
  };
}

test('停止最后一个 overlay 动画后，新动画无需移动地图即可继续出帧', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__?.ready === true);

  const result = await page.evaluate(() => (window as unknown as FixtureWindow).__OL_ENGINE_TEST__.restartOverlayAnimation());

  expect(result).toMatchObject({
    firstProgressed: true,
    cleanupRendered: true,
    secondProgressed: true,
    secondStatus: 'running'
  });
  expect(result.secondFrames).toBeGreaterThanOrEqual(4);
});
