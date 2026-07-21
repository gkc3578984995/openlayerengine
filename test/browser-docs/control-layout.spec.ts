import { Buffer } from 'node:buffer';
import { expect, test, type Route } from '@playwright/test';
import { sideGroups } from '../../website/src/config/navigation';

const documentationRoutes = sideGroups.flatMap((group) => group.items.map((item) => item.to));
const transparentTile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const controlRegionSelector = [
  '.example-demo__toolbar',
  '.example-demo [class*="__control-panel"]',
  '.example-demo [class*="__controls"]',
  '.example-demo [class*="__settings"]',
  '.example-demo [class*="__setting"]',
  '.example-demo [class*="__options"]',
  '.example-demo [class*="__actions"]',
  '.example-demo [class*="__action-group"]',
  '.example-demo [class*="__field"]',
  '.example-demo [class*="__form"]',
  '.example-demo [class*="__source"]',
  '.example-demo [class*="__scenarios"]',
  '.example-demo [class*="__colors"]',
  '.example-demo [class*="__toolbar-controls"]'
].join(', ');

const sharedSurfaceSelector = '.example-demo__control-panel, .example-demo__toolbar';

test.beforeEach(async ({ page }) => {
  const fulfillTile = (route: Route) => route.fulfill({ status: 200, contentType: 'image/png', body: transparentTile });
  await page.route('https://tile.openstreetmap.org/**', fulfillTile);
  await page.route('https://server.arcgisonline.com/**', fulfillTile);
});

for (const viewport of [
  { name: 'desktop', width: 1_280, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
] as const) {
  test(`全部示例控制区域在 ${viewport.name} 布局下无重叠或横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const issues: string[] = [];

    for (const route of documentationRoutes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(80);

      const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth > 2);
      if (pageOverflow) issues.push(`${route}: 页面产生横向溢出`);

      const routeIssues = await page.locator(controlRegionSelector).evaluateAll((regions) => {
        const findings: string[] = [];

        regions.forEach((region, regionIndex) => {
          const bounds = region.getBoundingClientRect();
          const style = window.getComputedStyle(region);
          if (bounds.width === 0 || bounds.height === 0 || style.display === 'none') return;

          const label = `${region.tagName.toLowerCase()}.${String(region.className).trim().replace(/\s+/gu, '.') || `region-${regionIndex}`}`;
          if (region.scrollWidth - region.clientWidth > 2) findings.push(`${label} 横向溢出 ${region.scrollWidth - region.clientWidth}px`);

          if (region.classList.contains('example-demo__toolbar')) {
            const containsGroupedControls = region.querySelector(':scope > [role="group"]') !== null;
            if (!containsGroupedControls && style.alignItems !== 'center') findings.push(`${label} 未垂直居中`);
            if (style.flexWrap !== 'wrap') findings.push(`${label} 不允许换行`);

            region.querySelectorAll(':scope > .el-button + .el-button').forEach((button) => {
              if (Number.parseFloat(window.getComputedStyle(button).marginLeft) > 0.5) findings.push(`${label} 的相邻按钮仍有额外左外边距`);
            });
          }

          const children = Array.from(region.children)
            .map((child) => ({ child, bounds: child.getBoundingClientRect(), style: window.getComputedStyle(child) }))
            .filter(
              ({ bounds: childBounds, style: childStyle }) =>
                childBounds.width > 0 &&
                childBounds.height > 0 &&
                childStyle.display !== 'none' &&
                childStyle.position !== 'absolute' &&
                childStyle.position !== 'fixed'
            );

          for (const { bounds: childBounds } of children) {
            if (childBounds.left < bounds.left - 2 || childBounds.right > bounds.right + 2) {
              findings.push(`${label} 的直接子项超出容器`);
              break;
            }
          }

          for (let leftIndex = 0; leftIndex < children.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < children.length; rightIndex += 1) {
              const left = children[leftIndex].bounds;
              const right = children[rightIndex].bounds;
              const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
              const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
              if (overlapWidth > 1 && overlapHeight > 1) {
                findings.push(`${label} 的直接子项发生重叠`);
                return;
              }
            }
          }
        });

        return findings;
      });

      issues.push(...routeIssues.map((issue) => `${route}: ${issue}`));

      const surfaceIssues = await page.locator(sharedSurfaceSelector).evaluateAll((surfaces) => {
        const findings: string[] = [];
        surfaces.forEach((surface, index) => {
          const style = window.getComputedStyle(surface);
          const label = `${surface.tagName.toLowerCase()}.${String(surface.className).trim().replace(/\s+/gu, '.') || `surface-${index}`}`;
          if (style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent') findings.push(`${label} 缺少统一表面背景`);
          if (style.borderTopStyle === 'none' || Number.parseFloat(style.borderTopWidth) < 1) findings.push(`${label} 缺少统一边框`);
          if (Number.parseFloat(style.borderTopLeftRadius) < 8) findings.push(`${label} 圆角小于统一基线`);
          if (Number.parseFloat(style.paddingTop) < 10 || Number.parseFloat(style.paddingLeft) < 10) findings.push(`${label} 内边距小于统一基线`);
        });
        return findings;
      });
      issues.push(...surfaceIssues.map((issue) => `${route}: ${issue}`));

      const feedbackIssues = await page.locator('.example-demo__feedback').evaluateAll((feedbacks) => {
        const findings: string[] = [];
        feedbacks.forEach((feedback, index) => {
          const style = window.getComputedStyle(feedback);
          const hasTopDivider = style.borderTopStyle !== 'none' && Number.parseFloat(style.borderTopWidth) >= 1;
          const hasSideDivider = style.borderLeftStyle !== 'none' && Number.parseFloat(style.borderLeftWidth) >= 1;
          if (!hasTopDivider && !hasSideDivider) findings.push(`feedback-${index} 与操作区域之间没有可见分隔`);
        });
        return findings;
      });
      issues.push(...feedbackIssues.map((issue) => `${route}: ${issue}`));

      const actionGroupIssues = await page.locator('.example-demo__action-group').evaluateAll((groups) => {
        const findings: string[] = [];
        groups.forEach((group, index) => {
          const style = window.getComputedStyle(group);
          if (style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent') findings.push(`action-group-${index} 缺少统一分组背景`);
          if (style.borderTopStyle === 'none' || Number.parseFloat(style.borderTopWidth) < 1) findings.push(`action-group-${index} 缺少统一分组边框`);
          if (Number.parseFloat(style.paddingTop) < 8 || Number.parseFloat(style.paddingLeft) < 8) findings.push(`action-group-${index} 内边距小于统一基线`);
        });
        return findings;
      });
      issues.push(...actionGroupIssues.map((issue) => `${route}: ${issue}`));

      const ungroupedActionIssues = await page.locator('.example-demo__control-panel .example-demo__action-buttons').evaluateAll((buttonGroups) => {
        const findings: string[] = [];
        buttonGroups.forEach((buttonGroup, index) => {
          if (buttonGroup.closest('.example-demo__action-group') === null) findings.push(`action-buttons-${index} 没有统一软底操作分组`);
        });
        return findings;
      });
      issues.push(...ungroupedActionIssues.map((issue) => `${route}: ${issue}`));
    }

    expect(issues).toEqual([]);
  });
}

test('删除示例的选择框与操作按钮按底边对齐', async ({ page }) => {
  await page.setViewportSize({ width: 1_280, height: 900 });
  await page.goto('/components/elements/cleanup', { waitUntil: 'domcontentloaded' });

  const select = page.locator('.element-cleanup-demo__field .el-select').first();
  const button = page.locator('.element-cleanup-demo__action-group .el-button').first();
  const [selectBounds, buttonBounds] = await Promise.all([select.boundingBox(), button.boundingBox()]);

  expect(selectBounds).not.toBeNull();
  expect(buttonBounds).not.toBeNull();
  expect(Math.abs((selectBounds?.y ?? 0) + (selectBounds?.height ?? 0) - ((buttonBounds?.y ?? 0) + (buttonBounds?.height ?? 0)))).toBeLessThanOrEqual(2);
});

test('纹理示例把状态反馈与操作按钮明确分开', async ({ page }) => {
  await page.setViewportSize({ width: 1_280, height: 900 });
  await page.goto('/components/elements/styles', { waitUntil: 'domcontentloaded' });

  const feedback = page.locator('.pattern-fill-demo__status');
  const divider = await feedback.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      top: Number.parseFloat(style.borderTopWidth),
      left: Number.parseFloat(style.borderLeftWidth)
    };
  });

  expect(Math.max(divider.top, divider.left)).toBeGreaterThanOrEqual(1);
});

test('四个重点示例在深色模式下沿用统一语义表面', async ({ page }) => {
  await page.setViewportSize({ width: 1_280, height: 900 });

  for (const route of ['/components/elements/cleanup', '/components/elements/styles', '/components/interactions/measure', '/components/elements/query']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      const normalizeColor = (value: string) => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.append(probe);
        const color = window.getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const rootStyle = window.getComputedStyle(document.documentElement);
      const expectedSurface = normalizeColor(rootStyle.getPropertyValue('--doc-surface'));
      const expectedSoftSurface = normalizeColor(rootStyle.getPropertyValue('--doc-surface-soft'));
      const panelBackgrounds = Array.from(document.querySelectorAll('.example-demo__control-panel'), (panel) => window.getComputedStyle(panel).backgroundColor);
      const groupBackgrounds = Array.from(document.querySelectorAll('.example-demo__action-group'), (group) => window.getComputedStyle(group).backgroundColor);

      return {
        dark: document.documentElement.classList.contains('dark'),
        expectedSurface,
        expectedSoftSurface,
        panelBackgrounds,
        groupBackgrounds
      };
    });

    expect(result.dark, route).toBe(true);
    expect(result.panelBackgrounds.length, route).toBeGreaterThan(0);
    expect(result.groupBackgrounds.length, route).toBeGreaterThan(0);
    expect(
      result.panelBackgrounds.every((color) => color === result.expectedSurface),
      route
    ).toBe(true);
    expect(
      result.groupBackgrounds.every((color) => color === result.expectedSoftSurface),
      route
    ).toBe(true);
  }
});
