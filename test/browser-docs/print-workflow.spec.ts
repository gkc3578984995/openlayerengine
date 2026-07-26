import { Buffer } from 'node:buffer';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

const transparentTile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

test.beforeEach(async ({ page }) => {
  const fulfillTile = (route: Route) => route.fulfill({ status: 200, contentType: 'image/png', body: transparentTile });
  await page.route('https://tile.openstreetmap.org/**', fulfillTile);
  await page.route('https://server.arcgisonline.com/**', fulfillTile);
});

test('地图打印示例完整呈现五屏、实时纸张和可编辑图例', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openPrintDialog(page);
  const dialog = page.getByRole('dialog', { name: '地图打印工作台' });
  const preview = dialog.getByLabel('完整纸张实时预览');

  await expect(dialog).toHaveClass(/ol-print-dialog--embedded/u);
  await expect(dialog.getByRole('navigation', { name: '打印步骤' }).getByRole('button')).toHaveCount(5);
  await expect(dialog.getByLabel('密级', { exact: true })).toBeVisible();
  for (const label of ['主标题', '副标题', '日期', '签发人']) await expect(textbox(dialog, label)).toBeVisible();
  for (const label of ['纸张', '方向', '边距模式', '范围来源', '比例尺']) await expect(combobox(dialog, label)).toBeVisible();
  await expect(spinbutton(dialog, 'DPI')).toBeVisible();
  const rangeOptions = await combobox(dialog, '范围来源')
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).textContent));
  expect(rangeOptions).toEqual(['当前视图', '框选范围']);
  await expect(dialog.getByRole('button', { name: '导出 PDF' })).toHaveCount(0);

  const splitter = dialog.getByRole('separator', { name: '调整设置区和预览区宽度' });
  const workspaceBounds = await dialog.locator('.ol-print-dialog__workspace').boundingBox();
  const splitterBounds = await splitter.boundingBox();
  if (workspaceBounds === null || splitterBounds === null) throw new Error('打印分栏节点不可见');
  const initialRatio = Number(await splitter.getAttribute('aria-valuenow'));
  const minimumRatio = Number(await splitter.getAttribute('aria-valuemin'));
  expect(initialRatio).toBeGreaterThanOrEqual(minimumRatio);
  if (workspaceBounds.width * 0.4 >= 420 && workspaceBounds.width * 0.6 - 10 >= 360) expect(initialRatio).toBe(40);
  else expect(splitterBounds.x - workspaceBounds.x).toBeGreaterThanOrEqual(419);
  const dragSplitterTo = async (targetX: number): Promise<void> => {
    const current = await splitter.boundingBox();
    if (current === null) throw new Error('打印分栏控制柄不可见');
    const y = current.y + Math.min(60, current.height / 2);
    await page.mouse.move(current.x + current.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(targetX, y, { steps: 4 });
    await page.mouse.up();
  };
  const paper = dialog.locator('.ol-print-paper');
  await dragSplitterTo(workspaceBounds.x + workspaceBounds.width - 1);
  const [minimumPreview, narrowPaper] = await Promise.all([preview.boundingBox(), paper.boundingBox()]);
  if (minimumPreview === null || narrowPaper === null) throw new Error('最小预览栏布局不可见');
  expect(minimumPreview.width).toBeGreaterThanOrEqual(359);

  await dragSplitterTo(workspaceBounds.x + 1);
  const [minimumInput, widePreview, widePaper] = await Promise.all([
    dialog.locator('.ol-print-dialog__content').boundingBox(),
    preview.boundingBox(),
    paper.boundingBox()
  ]);
  if (minimumInput === null || widePreview === null || widePaper === null) throw new Error('最小输入栏布局不可见');
  expect(minimumInput.width).toBeGreaterThanOrEqual(419);
  expect(widePreview.width).toBeGreaterThan(minimumPreview.width);
  expect(widePaper.width).toBeGreaterThan(narrowPaper.width + 40);
  expect(widePaper.width / widePaper.height).toBeCloseTo(297 / 210, 2);

  await dialog.evaluate((element) => {
    element.style.height = '380px';
    element.style.minHeight = '380px';
  });
  await expect
    .poll(async () => {
      const bounds = await paper.boundingBox();
      return bounds === null ? 0 : bounds.width / bounds.height;
    })
    .toBeCloseTo(297 / 210, 2);
  await combobox(dialog, '方向').selectOption('portrait');
  await waitForPreview(dialog, '草稿');
  await expect
    .poll(async () => {
      const bounds = await paper.boundingBox();
      return bounds === null ? 0 : bounds.width / bounds.height;
    })
    .toBeCloseTo(210 / 297, 2);
  const [constrainedStage, constrainedPaper] = await Promise.all([dialog.locator('.ol-print-dialog__preview-stage').boundingBox(), paper.boundingBox()]);
  if (constrainedStage === null || constrainedPaper === null) throw new Error('高度受限预览不可见');
  expect(constrainedPaper.width).toBeLessThanOrEqual(constrainedStage.width + 1);
  expect(constrainedPaper.height).toBeLessThanOrEqual(constrainedStage.height + 1);
  await dialog.evaluate((element) => {
    element.style.removeProperty('height');
    element.style.removeProperty('min-height');
  });
  await combobox(dialog, '方向').selectOption('landscape');
  await waitForPreview(dialog, '草稿');

  await dragSplitterTo(workspaceBounds.x + workspaceBounds.width * 0.48);
  expect(Number(await splitter.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(47);

  const classification = dialog.getByLabel('密级', { exact: true });
  const classificationListId = await classification.getAttribute('list');
  expect(classificationListId).toMatch(/^ol-print-classification-/u);
  const classificationSuggestions = await dialog
    .locator(`datalist#${classificationListId} option`)
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(classificationSuggestions).toContain('机密★30年');

  await classification.fill('业务自定义密级★15年');
  await textbox(dialog, '主标题').fill('区域态势分析图');
  await textbox(dialog, '副标题').fill('2026 年夏季联合行动');
  await textbox(dialog, '日期').fill('2026-07-23');
  await fillAndCommit(textbox(dialog, '签发人'), '联合指挥部');
  await combobox(dialog, '纸张').selectOption('A3');
  await combobox(dialog, '方向').selectOption('portrait');
  await expect(dialog.locator('.ol-print-paper')).toHaveCSS('aspect-ratio', '297 / 420');
  await combobox(dialog, '纸张').selectOption('custom');
  await combobox(dialog, '方向').selectOption('landscape');
  await fillAndCommit(spinbutton(dialog, '纸宽（mm）'), '420');
  await fillAndCommit(spinbutton(dialog, '纸高（mm）'), '260');
  await combobox(dialog, '边距模式').selectOption('sides');
  await fillAndCommit(spinbutton(dialog, '上边距（mm）'), '10');
  await fillAndCommit(spinbutton(dialog, '右边距（mm）'), '12');
  await fillAndCommit(spinbutton(dialog, '下边距（mm）'), '14');
  await fillAndCommit(spinbutton(dialog, '左边距（mm）'), '16');

  await expect(dialog.getByLabel('密级', { exact: true })).toHaveValue('业务自定义密级★15年');
  await expect(textbox(dialog, '主标题')).toHaveValue('区域态势分析图');
  await expect(textbox(dialog, '副标题')).toHaveValue('2026 年夏季联合行动');
  await expect(textbox(dialog, '签发人')).toHaveValue('联合指挥部');
  await waitForPreview(dialog, '草稿');
  await expect(preview.getByRole('img', { name: '完整地图打印页面预览' })).toBeVisible();
  await expect(dialog.locator('.ol-print-paper')).toHaveCSS('aspect-ratio', '420 / 260');

  await dialog.getByRole('button', { name: '2 范围选择' }).click();
  await expect(dialog.getByRole('heading', { name: '2. 范围选择' })).toBeVisible();
  await dialog.getByRole('button', { name: '确认范围' }).click();
  await expect(dialog.getByText('范围已解析', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: '3 自动图例' }).click();
  await dialog.getByRole('button', { name: /生成自动图例|重新扫描/u }).click();
  await expect(dialog.getByText('print-demo-elements', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/点标绘/u).first()).toBeVisible();

  await dialog.getByRole('button', { name: '4 手动图例' }).click();
  await expect(dialog.getByText('图例版式', { exact: true })).toBeVisible();
  for (const label of ['列数', '最大宽度（mm）', '内边距（mm）', '组间距（mm）', '条目间距（mm）']) await expect(spinbutton(dialog, label)).toBeVisible();
  await expect(combobox(dialog, '排列方向')).toBeVisible();
  await expect(combobox(dialog, '图例位置')).toBeVisible();
  await expect(dialog.getByLabel('背景文本值', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('选择背景', { exact: true })).toHaveAttribute('type', 'color');
  await expect(dialog.getByLabel('图例名称').first()).toBeVisible();
  await expect(dialog.getByText(/的符号/u).first()).toBeVisible();
  const collapse = dialog.getByRole('button', { name: /折叠图例分组/u }).first();
  await collapse.click();
  await expect(dialog.getByRole('button', { name: /展开图例分组/u }).first()).toHaveAttribute('aria-expanded', 'false');
  await dialog
    .getByRole('button', { name: /展开图例分组/u })
    .first()
    .click();
  const legendNameFields = dialog.getByLabel('图例名称');
  const automaticItemCount = await legendNameFields.count();
  expect(automaticItemCount).toBe(4);
  await dialog.getByRole('button', { name: '新增分组' }).click();
  await dialog.getByRole('button', { name: '新增条目' }).click();
  await expect(legendNameFields).toHaveCount(automaticItemCount + 1);
  const manualScroll = dialog.locator('.ol-print-dialog__scroll');
  await manualScroll.evaluate((element) => (element.scrollTop = element.scrollHeight));
  await legendNameFields.last().scrollIntoViewIfNeeded();
  const preservedScrollTop = await manualScroll.evaluate((element) => element.scrollTop);
  expect(preservedScrollTop).toBeGreaterThan(0);
  await legendNameFields.last().fill('滚动位置保持测试');
  await legendNameFields.last().press('Tab');
  await waitForPreview(dialog, '草稿');
  await expect.poll(() => manualScroll.evaluate((element) => element.scrollTop)).toBe(preservedScrollTop);

  await dialog.getByRole('button', { name: '5 预览导出' }).click();
  await expect(dialog.getByRole('heading', { name: '5. 最终预览与导出' })).toBeVisible();
  await waitForPreview(dialog, '最终');
  const finalContent = dialog.locator('.ol-print-dialog__content');
  const fixedActions = finalContent.locator(':scope > .ol-print-actions--footer');
  await expect(fixedActions).toBeVisible();
  const [contentBox, actionBox] = await Promise.all([finalContent.boundingBox(), fixedActions.boundingBox()]);
  if (contentBox === null || actionBox === null) throw new Error('最终页固定操作区不可见');
  expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(contentBox.y + contentBox.height + 1);
  await expect(dialog.getByRole('button', { name: '适合窗口' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '100%' }).click();
  await expect(dialog.getByRole('button', { name: '100%' })).toHaveAttribute('aria-pressed', 'true');
  await expect(preview.locator('.ol-print-dialog__preview-label')).toContainText('最终预览 · 100%');
  const printerWarning = dialog.locator('[data-print-validation-code="printer-scaling-not-guaranteed"]').first();
  await expect(printerWarning).toContainText('打印比例提示');
  await expect(printerWarning).not.toContainText('Physical output scale');
  const png = dialog.getByRole('button', { name: '导出 PNG' });
  const browserPrint = dialog.getByRole('button', { name: '浏览器打印' });
  await expect(png).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '导出 PDF' })).toHaveCount(0);
  await expect(browserPrint).toBeDisabled();
  await dialog.getByLabel('确认当前版本的打印警告').check();
  await expect(png).toBeEnabled();
  await expect(browserPrint).toBeEnabled();

  const overflow = await dialog.evaluate((element) => ({
    dialog: element.scrollWidth - element.clientWidth,
    content: (element.querySelector('.ol-print-dialog__content')?.scrollWidth ?? 0) - (element.querySelector('.ol-print-dialog__content')?.clientWidth ?? 0)
  }));
  expect(overflow.dialog).toBeLessThanOrEqual(1);
  expect(overflow.content).toBeLessThanOrEqual(1);
});

test('框选步骤保留活动地图语义并在窄屏内自适应', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPrintDialog(page);
  const dialog = page.getByRole('dialog', { name: '地图打印工作台' });

  await combobox(dialog, '范围来源').selectOption('box');
  await dialog.getByRole('button', { name: '2 范围选择' }).click();
  await expect(dialog).toHaveClass(/is-selecting/u);
  await expect(dialog.getByRole('button', { name: /展开成品预览|收起成品预览/u })).toHaveCount(0);
  await expect(dialog.getByText('最终足迹', { exact: true })).toHaveCount(0);
  await expect(dialog.locator('.ol-print-dialog__workspace')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  const layout = await dialog.evaluate((element) => {
    const steps = element.querySelector<HTMLElement>('.ol-print-dialog__steps');
    const workspace = element.querySelector<HTMLElement>('.ol-print-dialog__workspace');
    const content = element.querySelector<HTMLElement>('.ol-print-dialog__content');
    const preview = element.querySelector<HTMLElement>('.ol-print-dialog__preview');
    const scroll = element.querySelector<HTMLElement>('.ol-print-dialog__scroll');
    const actions = element.querySelector<HTMLElement>('.ol-print-actions--footer');
    if (steps === null || workspace === null || content === null || preview === null || scroll === null || actions === null) {
      throw new Error('打印窄屏布局节点缺失');
    }
    const root = element.getBoundingClientRect();
    const workspaceBounds = workspace.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    const scrollBounds = scroll.getBoundingClientRect();
    const actionBounds = actions.getBoundingClientRect();
    const contentStyle = window.getComputedStyle(content);
    return {
      rootOverflow: element.scrollWidth - element.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      stepsScrollable: steps.scrollWidth >= steps.clientWidth,
      contentInside: contentBounds.left >= root.left - 1 && contentBounds.right <= root.right + 1,
      contentAligned: Math.abs(contentBounds.left - workspaceBounds.left) <= 1 && Math.abs(contentBounds.right - workspaceBounds.right) <= 1,
      contentBorderRadius: contentStyle.borderRadius,
      contentBoxShadow: contentStyle.boxShadow,
      contentPointerEvents: contentStyle.pointerEvents,
      scrollPointerEvents: window.getComputedStyle(scroll).pointerEvents,
      actionPointerEvents: window.getComputedStyle(actions).pointerEvents,
      actionBoxShadow: window.getComputedStyle(actions).boxShadow,
      footerAligned: Math.abs(actionBounds.bottom - workspaceBounds.bottom) <= 1,
      interactiveGap: actionBounds.top - scrollBounds.bottom,
      previewVisible: window.getComputedStyle(preview).display !== 'none',
      exposedMapWidth: workspaceBounds.width,
      exposedMapHeight: workspaceBounds.height
    };
  });

  expect(layout.rootOverflow).toBe(0);
  expect(layout.pageOverflow).toBe(0);
  expect(layout.stepsScrollable).toBe(true);
  expect(layout.contentInside).toBe(true);
  expect(layout.contentAligned).toBe(true);
  expect(layout.contentBorderRadius).toBe('0px');
  expect(layout.contentBoxShadow).toBe('none');
  expect(layout.contentPointerEvents).toBe('none');
  expect(layout.scrollPointerEvents).toBe('auto');
  expect(layout.actionPointerEvents).toBe('auto');
  expect(layout.actionBoxShadow).toBe('none');
  expect(layout.footerAligned).toBe(true);
  expect(layout.interactiveGap).toBeGreaterThanOrEqual(120);
  expect(layout.previewVisible).toBe(false);
  expect(layout.exposedMapWidth).toBeGreaterThanOrEqual(300);
  expect(layout.exposedMapHeight).toBeGreaterThanOrEqual(240);

  await dialog.getByRole('button', { name: '开始框选' }).click();
  const selectionBox = page.locator('.ol-print-selection-box');
  await expect(selectionBox).toHaveCSS('border-top-width', '2px');
  await expect(selectionBox).toHaveCSS('border-top-style', 'solid');
  await expect(selectionBox).toHaveCSS('border-top-color', 'rgb(22, 119, 255)');
  await expect(selectionBox).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(selectionBox).toHaveCSS('box-shadow', 'none');
  await dragFreeBoxSelection(page);
  await expect(dialog.getByText('范围已解析', { exact: true })).toBeVisible();
  await waitForPreview(dialog, '草稿');
});

test('打印工作台覆盖七类批准视觉基线', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await openPrintDialog(page);
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; caret-color: transparent !important; cursor: none !important; transition: none !important; }'
  });
  const dialog = page.getByRole('dialog', { name: '地图打印工作台' });
  const paper = dialog.locator('.ol-print-paper');
  const workspace = dialog.locator('.ol-print-dialog__workspace');

  await waitForPreview(dialog, '草稿');
  await expect(paper).toHaveScreenshot('print-a4-landscape-view-fit.png', screenshotOptions);

  const zoomOut = page.locator('.print-demo__map .ol-zoom-out');
  await zoomOut.click();
  await zoomOut.click();
  await combobox(dialog, '纸张').selectOption('A3');
  await combobox(dialog, '方向').selectOption('portrait');
  await combobox(dialog, '范围来源').selectOption('box');
  await combobox(dialog, '比例尺').selectOption('fixed');
  await fillAndCommit(spinbutton(dialog, '比例尺 1∶'), '200000');
  await dialog.getByRole('button', { name: '2 范围选择' }).click();
  await dialog.getByRole('button', { name: '开始框选' }).click();
  await dragBoxSelection(page, true);
  await expect(dialog.getByText('范围已解析', { exact: true })).toBeVisible();
  await waitForPreview(dialog, '草稿');
  await expect(dialog.getByText('固定 1∶200,000', { exact: true })).toBeVisible();
  await expect(workspace).toHaveScreenshot('print-box-range-workspace.png', screenshotOptions);
  await expect(paper).toHaveScreenshot('print-a3-portrait-box-fixed.png', screenshotOptions);

  await dialog.getByRole('button', { name: '1 版式设置' }).click();
  await combobox(dialog, '范围来源').selectOption('view');
  await combobox(dialog, '比例尺').selectOption('fit');
  await combobox(dialog, '纸张').selectOption('custom');
  await combobox(dialog, '方向').selectOption('landscape');
  await fillAndCommit(spinbutton(dialog, '纸宽（mm）'), '320');
  await fillAndCommit(spinbutton(dialog, '纸高（mm）'), '180');
  await dialog.getByRole('button', { name: '2 范围选择' }).click();
  await dialog.getByRole('button', { name: '确认范围' }).click();
  await expect(dialog.getByText('范围已解析', { exact: true })).toBeVisible();
  await waitForPreview(dialog, '草稿');
  await expect(workspace).toHaveScreenshot('print-custom-landscape-view-fit.png', screenshotOptions);

  await dialog.getByRole('button', { name: '3 自动图例' }).click();
  await dialog.getByRole('button', { name: /生成自动图例|重新扫描/u }).click();
  const dynamicWarning = dialog.locator('[data-print-validation-code="unknown-dynamic-style"]').first();
  await expect(dynamicWarning).toContainText('动态样式需确认');
  await expect(dynamicWarning).not.toContainText('unknown-dynamic-style');
  await waitForPreview(dialog, '草稿');
  await expect(workspace).toHaveScreenshot('print-auto-legend-dynamic-warning.png', screenshotOptions);

  await dialog.getByRole('button', { name: '4 手动图例' }).click();
  await combobox(dialog, '图例位置').selectOption('bottom-right');
  await dialog.getByLabel('选择背景', { exact: true }).evaluate((input) => {
    const picker = input as HTMLInputElement;
    picker.value = '#fff7ed';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const groupTitles = dialog.locator('.ol-print-legend-editor__group-row input[type="text"]');
  const initialGroupCount = await groupTitles.count();
  await dialog.getByRole('button', { name: '新增分组' }).click();
  await expect(groupTitles).toHaveCount(initialGroupCount + 1);
  await dialog.getByRole('button', { name: '新增条目' }).click();
  const newItem = dialog.locator('.ol-print-legend-editor__row').last();
  const groupAssignment = newItem.locator('select').first();
  const targetGroup = await groupAssignment.locator('option').last().getAttribute('value');
  if (targetGroup === null) throw new Error('手动图例新分组缺少稳定标识');
  await groupAssignment.selectOption(targetGroup);
  await dialog.getByLabel('图例名称').last().fill('应急集结点');
  await dialog.getByLabel('图例名称').last().press('Tab');
  await expect(dialog.getByLabel('图例名称').last()).toHaveValue('应急集结点');
  await workspace.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const clippedLegendControls = await dialog.locator('.ol-print-dialog__content').evaluate((content) => {
    const bounds = content.getBoundingClientRect();
    return [...content.querySelectorAll<HTMLElement>('.ol-print-legend-editor__group-row > *, .ol-print-legend-editor__primary > *')]
      .filter((control) => {
        const rect = control.getBoundingClientRect();
        return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
      })
      .map((control) => control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.tagName);
  });
  expect(clippedLegendControls).toEqual([]);
  await expect(workspace).toHaveScreenshot('print-manual-multi-group-legend.png', screenshotOptions);

  await dialog.getByRole('button', { name: '5 预览导出' }).click();
  await dialog.getByRole('button', { name: '100%' }).click();
  await waitForPreview(dialog, '最终');
  await expect(workspace).toHaveScreenshot('print-final-preview-actual-size.png', screenshotOptions);
});

async function dragBoxSelection(page: Page, fixedCenter = false): Promise<void> {
  const overlay = page.locator('.ol-print-selection-overlay');
  await expect(overlay).toBeAttached();
  const map = page.locator('.print-demo__map .ol-viewport');
  await map.scrollIntoViewIfNeeded();
  const bounds = await map.boundingBox();
  if (bounds === null) throw new Error('打印示例地图不可见');
  const start = fixedCenter
    ? { x: bounds.x + bounds.width * 0.5, y: bounds.y + bounds.height * 0.5 }
    : { x: bounds.x + bounds.width * 0.25, y: bounds.y + bounds.height * 0.3 };
  const end = fixedCenter ? { x: start.x + 1, y: start.y + 1 } : { x: bounds.x + bounds.width * 0.75, y: bounds.y + bounds.height * 0.7 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await expect(overlay).not.toBeAttached();
}

async function dragFreeBoxSelection(page: Page): Promise<void> {
  const overlay = page.locator('.ol-print-selection-overlay');
  await expect(overlay).toBeAttached();
  const map = page.locator('.print-demo__map .ol-viewport');
  await map.scrollIntoViewIfNeeded();
  const bounds = await map.boundingBox();
  if (bounds === null) throw new Error('打印示例地图不可见');
  const start = { x: bounds.x + bounds.width * 0.2, y: bounds.y + bounds.height * 0.25 };
  const end = { x: bounds.x + bounds.width * 0.6, y: bounds.y + bounds.height * 0.8 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  const source = await page.locator('.ol-print-selection-box').boundingBox();
  const output = await page.locator('.ol-print-selection-output').boundingBox();
  if (source === null || output === null) throw new Error('框选范围或成品范围未显示');
  expect(source.width / source.height).not.toBeCloseTo(output.width / output.height, 1);
  expect(output.width).toBeGreaterThanOrEqual(source.width);
  expect(output.height).toBeGreaterThanOrEqual(source.height);
  await page.mouse.up();
  await expect(overlay).not.toBeAttached();
}

async function waitForPreview(dialog: Locator, quality: '草稿' | '最终'): Promise<void> {
  const label = dialog.locator('.ol-print-dialog__preview-label');
  await expect(label).toContainText(new RegExp(`当前显示 r\\d+ ${quality}预览`, 'u'), { timeout: 30_000 });
  await expect(label).not.toContainText('正在更新');
}

const screenshotOptions = Object.freeze({
  animations: 'disabled' as const,
  caret: 'hide' as const,
  scale: 'css' as const,
  maxDiffPixelRatio: 0.005,
  threshold: 0.18
});

const textbox = (scope: Locator, name: string): Locator => scope.getByRole('textbox', { name, exact: true });
const combobox = (scope: Locator, name: string): Locator => scope.getByRole('combobox', { name, exact: true });
const spinbutton = (scope: Locator, name: string): Locator => scope.getByRole('spinbutton', { name, exact: true });

async function fillAndCommit(input: Locator, value: string): Promise<void> {
  await input.fill(value);
  await input.press('Tab');
}

async function openPrintDialog(page: Page): Promise<void> {
  await page.goto('/components/services/print', { waitUntil: 'domcontentloaded' });
  const example = page.locator('#example-print-workflows');
  await example.scrollIntoViewIfNeeded();
  await expect(example.locator('.print-demo__map canvas')).toBeVisible();
  await example.getByRole('button', { name: 'earth.print.open()', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '地图打印工作台' })).toBeVisible();
}
