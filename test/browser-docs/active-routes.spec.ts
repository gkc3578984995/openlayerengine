import { Buffer } from 'node:buffer';
import { expect, test, type Route } from '@playwright/test';
import { apiNavItems, sideGroups } from '../../website/src/config/navigation';

const documentationRoutes = sideGroups.flatMap((group) => group.items.map((item) => item.to));
const activeRoutes = [...documentationRoutes, ...apiNavItems.map((item) => item.to)];
const transparentTile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

test.beforeEach(async ({ page }) => {
  const fulfillTile = (route: Route) => route.fulfill({ status: 200, contentType: 'image/png', body: transparentTile });
  await page.route('https://tile.openstreetmap.org/**', fulfillTile);
  await page.route('https://server.arcgisonline.com/**', fulfillTile);
});

test('全部有效菜单路由均可渲染且无运行时错误', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  for (const route of activeRoutes) {
    await test.step(route, async () => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'u'));
      await expect(page.locator('.doc-hero h1')).toBeVisible();
      await expect(page.locator('.docs-header__logo')).toBeVisible();
      await page.waitForTimeout(80);
    });
  }

  expect(runtimeErrors).toEqual([]);
});

test('多地图示例可独立销毁和重建实例', async ({ page }) => {
  await page.goto('/components/core/earth');
  const example = page.locator('#example-multi-earth');
  await example.scrollIntoViewIfNeeded();
  await expect(example.locator('.multi-earth-demo__stage canvas')).toHaveCount(2);
  await expect(example.getByText('两张地图均 ready')).toBeVisible();

  await example.getByRole('button', { name: '只销毁左图' }).click();
  await expect(example.getByText('存在已销毁地图')).toBeVisible();
  await expect(example.locator('.multi-earth-demo__stage canvas')).toHaveCount(1);

  await example.getByRole('button', { name: '创建 / 重建缺失地图' }).click();
  await expect(example.getByText('两张地图均 ready')).toBeVisible();
  await expect(example.locator('.multi-earth-demo__stage canvas')).toHaveCount(2);
});

test('三类 Layer 在地图与表格中可区分，并证明 external 解绑语义', async ({ page }) => {
  await page.goto('/components/core/layers');
  const example = page.locator('#example-layer-kinds');
  await example.scrollIntoViewIfNeeded();
  await expect(example.locator('canvas')).toBeVisible();
  await expect(example.locator('.el-table__body tbody tr')).toHaveCount(3);
  await expect(example.getByText('部署期底图配置', { exact: true }).first()).toBeVisible();
  await expect(example.getByText('Earth Element 容器', { exact: true })).toBeVisible();
  await expect(example.getByText('OpenLayers VectorLayer', { exact: true })).toBeVisible();

  await example.getByRole('button', { name: '用 Layer.remove() 移除 native' }).click();
  await expect(example.locator('.el-table__body tbody tr')).toHaveCount(2);
  await expect(example.getByText(/Earth 已解绑；调用方仍可读取 VectorLayer 与 VectorSource/u)).toBeVisible();

  await example.getByRole('button', { name: '清空全部图层' }).click();
  await expect(example.getByText('当前没有图层', { exact: true })).toBeVisible();
  await example.getByRole('button', { name: '重置Vector、Tile、Native 与所有权运行示例' }).click();
  await expect(example.locator('.el-table__body tbody tr')).toHaveCount(3);
});

test('样式与路径线饰的完整 API 默认显示摘要，并按需展开详细定义', async ({ page }) => {
  const cases = [
    {
      route: '/components/elements/styles',
      entryAnchor: 'api-type-style-spec',
      propertyAnchor: 'api-type-style-spec-property-fill'
    },
    {
      route: '/components/elements/linework',
      entryAnchor: 'api-type-linework-spec',
      propertyAnchor: 'api-type-linework-spec-property-tracks'
    }
  ] as const;

  for (const item of cases) {
    await test.step(item.route, async () => {
      await page.goto(item.route);
      const entry = page.locator(`[data-api-entry="${item.entryAnchor}"]`);
      const toggle = entry.locator('.public-api-section__details-toggle');
      const property = entry.locator(`#${item.propertyAnchor}`);

      await expect(entry.locator(`#${item.entryAnchor}`)).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(property).toBeHidden();

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(property).toBeVisible();

      await toggle.click();
      await expect(property).toBeHidden();
      await page.evaluate((anchor) => {
        window.location.hash = anchor;
      }, item.propertyAnchor);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(property).toBeVisible();
    });
  }
});

test('纹理示例同时渲染五种纹理并支持重置和定位', async ({ page }) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto('/components/elements/styles');
  const example = page.locator('#example-pattern-fill');
  await example.scrollIntoViewIfNeeded();
  await expect(example.locator('canvas')).toBeVisible();
  const layout = await example.locator('.pattern-fill-demo').evaluate((root) => {
    const rect = (selector: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      if (element === null) throw new Error(`缺少纹理示例布局节点：${selector}`);
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left };
    };
    const controls = root.querySelector<HTMLElement>('.pattern-fill-demo__controls');
    if (controls === null) throw new Error('缺少纹理示例控制区');
    return {
      rootOverflow: root.scrollWidth - root.clientWidth,
      controlsOverflow: controls.scrollWidth - controls.clientWidth,
      controls: rect('.pattern-fill-demo__controls'),
      actions: rect('.pattern-fill-demo__actions'),
      buttons: rect('.pattern-fill-demo__action-buttons'),
      status: rect('.pattern-fill-demo__status'),
      panel: rect('.pattern-fill-demo__control-panel'),
      stage: rect('.pattern-fill-demo__stage')
    };
  });
  expect(layout.rootOverflow).toBeLessThanOrEqual(1);
  expect(layout.controlsOverflow).toBeLessThanOrEqual(1);
  expect(layout.actions.top - layout.controls.bottom).toBeGreaterThanOrEqual(12);
  expect(Math.abs((layout.status.top + layout.status.bottom) / 2 - (layout.buttons.top + layout.buttons.bottom) / 2)).toBeLessThanOrEqual(2);
  expect(layout.status.left - layout.buttons.right).toBeGreaterThanOrEqual(12);
  expect(layout.stage.top - layout.panel.bottom).toBeGreaterThanOrEqual(14);
  const patternSelect = example.getByRole('combobox', { name: '纹理类型' });
  await patternSelect.press('Enter');
  for (const label of ['斜线 diagonal', '交叉 cross', '圆点 dot', '水平 horizontal', '垂直 vertical']) {
    await expect(page.getByRole('option', { name: label })).toBeVisible();
  }
  await page.getByRole('option', { name: '交叉 cross' }).click();
  await expect(example.locator('.el-tag').filter({ hasText: '交叉 cross' })).toBeVisible();
  await example.getByRole('button', { name: '重置五种纹理与应用目标运行示例' }).click();
  await example.getByRole('button', { name: '定位五种纹理与应用目标运行示例' }).click();

  await page.setViewportSize({ width: 390, height: 900 });
  const demo = example.locator('.pattern-fill-demo');
  await expect(demo).toHaveAttribute('data-preview-mode', 'narrow');
  const narrowLayout = await demo.evaluate((root) => {
    const panel = root.querySelector<HTMLElement>('.pattern-fill-demo__control-panel');
    const stage = root.querySelector<HTMLElement>('.pattern-fill-demo__stage');
    const buttons = root.querySelector<HTMLElement>('.pattern-fill-demo__action-buttons');
    const status = root.querySelector<HTMLElement>('.pattern-fill-demo__status');
    if (panel === null || stage === null || buttons === null || status === null) throw new Error('缺少窄屏纹理示例布局节点');
    const buttonBounds = buttons.getBoundingClientRect();
    const statusBounds = status.getBoundingClientRect();
    const statusStyle = window.getComputedStyle(status);
    return {
      rootOverflow: root.scrollWidth - root.clientWidth,
      panelOverflow: panel.scrollWidth - panel.clientWidth,
      stageHeight: stage.getBoundingClientRect().height,
      statusGap: statusBounds.top - buttonBounds.bottom,
      statusBorderTop: Number.parseFloat(statusStyle.borderTopWidth)
    };
  });
  expect(narrowLayout.rootOverflow).toBeLessThanOrEqual(1);
  expect(narrowLayout.panelOverflow).toBeLessThanOrEqual(1);
  expect(narrowLayout.stageHeight).toBe(420);
  expect(narrowLayout.statusGap).toBeGreaterThanOrEqual(10);
  expect(narrowLayout.statusBorderTop).toBeGreaterThanOrEqual(1);
});

test('右键菜单按 map、module、Element 优先级真实显示并执行动作', async ({ page }) => {
  await page.goto('/components/services/context-menu');
  const example = page.locator('#example-context-menu-lifecycle');
  await example.scrollIntoViewIfNeeded();
  const stage = example.locator('.example-stage');
  await stage.scrollIntoViewIfNeeded();
  await expect(stage.locator('canvas')).toBeVisible();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) return;

  await stage.click({ button: 'right', position: { x: bounds.width / 2, y: bounds.height * 0.78 } });
  const menuItem = page.getByText('在此显示坐标', { exact: true });
  await expect(menuItem).toBeVisible();
  await menuItem.click();
  await expect(example.getByText('map：在此显示坐标', { exact: true })).toBeVisible();

  const clickRegisteredMarker = async (direction: -1 | 1, label: string) => {
    const item = page.getByText(label, { exact: true });
    for (const offset of [96, 100, 92, 88, 104, 80]) {
      await stage.click({ button: 'right', position: { x: bounds.width / 2 + direction * offset, y: bounds.height / 2 } });
      if (await item.isVisible()) return item;
    }
    await expect(item).toBeVisible();
    return item;
  };

  const moduleItem = await clickRegisteredMarker(-1, '突出 module 标记');
  await moduleItem.click();
  await expect(example.getByText(/module：context-menu-demo，目标 context-menu-module-marker/u)).toBeVisible();

  const elementItem = await clickRegisteredMarker(1, '突出精确 Element');
  await elementItem.click();
  await expect(example.getByText(/Element：context-menu-element-marker/u)).toBeVisible();
});

test('Events 的七类输入、三种路由与 AbortSignal 生命周期均可操作', async ({ page }) => {
  await page.goto('/components/services/events');
  const example = page.locator('#example-event-lifecycle');
  const stage = example.getByLabel('事件交互地图');
  await stage.scrollIntoViewIfNeeded();
  await expect(stage.locator('canvas')).toBeVisible();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) return;

  await page.waitForTimeout(450);
  await stage.hover({ position: { x: bounds.width / 2 - 97, y: bounds.height / 2 } });
  await stage.click({ position: { x: bounds.width / 2 + 97, y: bounds.height / 2 } });
  await stage.dblclick({ position: { x: bounds.width / 2, y: bounds.height * 0.76 } });
  await stage.click({ button: 'right', position: { x: bounds.width / 2, y: bounds.height * 0.76 } });
  await stage.focus();
  await stage.press('A');

  const eventCard = (type: string) =>
    example.locator('.events-demo__counter').filter({ has: page.locator('code').filter({ hasText: new RegExp(`^${type}$`, 'u') }) });
  for (const type of ['pointermove', 'click', 'leftdown', 'leftup', 'doubleclick', 'rightclick', 'keydown']) {
    await expect(eventCard(type).locator('.events-demo__counter-head strong')).not.toHaveText('0');
  }
  await expect(example.getByText('AbortSignal：已结束', { exact: true })).toBeVisible();
  await example.getByRole('button', { name: '重新订阅七类事件' }).click();
  await example.getByRole('button', { name: '中止 rightclick signal' }).click();
  await expect(example.getByText('rightclick 已由 AbortSignal 中止', { exact: true })).toBeVisible();
  await example.getByRole('button', { name: '逐项调用注销函数' }).click();
  await expect(example.getByText('global：已结束', { exact: true })).toBeVisible();
  await example.getByRole('button', { name: '重新订阅七类事件' }).click();
  await expect(example.getByText('global：有效', { exact: true })).toBeVisible();
});

test('replace 与 reject 在四种交互间真实仲裁并恢复资源', async ({ page }) => {
  await page.goto('/components/interactions/draw');
  const example = page.locator('#example-interaction-policy');
  await example.scrollIntoViewIfNeeded();

  await example.getByRole('button', { name: '启动 Draw' }).click();
  await expect(example.getByText('当前：Draw', { exact: true })).toBeVisible();
  await example.getByRole('button', { name: '启动 Measure' }).click();
  await expect(example.getByText(/Draw → replaced/u)).toBeVisible();
  await expect(example.getByText('当前：Measure', { exact: true })).toBeVisible();

  await example.getByLabel('交互冲突策略').getByText('reject', { exact: true }).click();
  await example.getByRole('button', { name: '启动 Edit' }).click();
  await expect(example.getByRole('cell', { name: /^InteractionConflictError：活动 Measure/u })).toBeVisible();
  await expect(example.getByText('当前：Measure', { exact: true })).toBeVisible();

  await example.getByRole('button', { name: '取消当前会话' }).click();
  await expect(example.getByText('当前：无活动交互', { exact: true })).toBeVisible();
  await expect(example.getByText(/资源数量已恢复/u)).toBeVisible();
});

test('动画目录、隔离目标和 Handle 控制均可运行', async ({ page }) => {
  await page.goto('/components/presentation/animations');
  await expect(page.locator('#effect-catalog .animation-doc__effect-card')).toHaveCount(10);

  const example = page.locator('#example-animation-manager');
  await example.scrollIntoViewIfNeeded();
  await expect(example.locator('.animation-manager-demo__stage canvas')).toBeVisible();
  await expect(example.locator('.animation-manager-demo__target-button')).toHaveCount(10);

  await example.locator('.animation-manager-demo__target-button').filter({ hasText: 'radar-scan' }).click();
  await expect(example.getByLabel('当前兼容目标')).toHaveValue('Sector（独立目标）');
  await expect(example.getByText('Sector 扫描方式', { exact: true })).toBeVisible();
  await expect(example.getByText('Sector 首程方向', { exact: true })).toBeVisible();
  await expect(example.getByText('往复', { exact: true })).toBeVisible();
  await example.getByRole('button', { name: '启动所选' }).click();
  await expect(example.getByText('运行中', { exact: true })).toBeVisible();
  await example.getByRole('radio', { name: '纯色' }).check({ force: true });
  await expect(example.getByText('radar-scan 参数已应用并重新启动。', { exact: true })).toBeVisible();
  await example.getByRole('button', { name: '暂停' }).click();
  await expect(example.getByText('已暂停', { exact: true })).toBeVisible();
  await example.getByRole('button', { name: '恢复' }).click();
  await example.getByRole('button', { name: '停止当前' }).click();
  await expect(example.getByText('已停止', { exact: true })).toBeVisible();

  await example.locator('.animation-manager-demo__target-button').filter({ hasText: 'center-spread' }).click();
  await example.getByRole('button', { name: '启动所选' }).click();
  await example.getByRole('radio', { name: '纯色' }).check({ force: true });
  await expect(example.getByText('center-spread 参数已应用并重新启动。', { exact: true })).toBeVisible();
  await example.getByRole('button', { name: '停止当前' }).click();

  await example.getByRole('button', { name: '组合 highlight + alert' }).click();
  await expect(example.getByText(/组合成功/u)).toBeVisible();
  await example.getByRole('button', { name: '重置十种独立目标、参数实验室与 Handle 控制运行示例' }).click();
  await example.getByRole('button', { name: '定位十种独立目标、参数实验室与 Handle 控制运行示例' }).click();
});

test('错误示例通过真实 API 触发、识别并恢复全部稳定错误', async ({ page }) => {
  await page.goto('/components/reference/errors');
  const example = page.locator('#example-error-recognition');
  await example.scrollIntoViewIfNeeded();
  await expect(example.locator('.errors-demo__map canvas')).toBeVisible();
  await example.getByRole('button', { name: '依次运行全部 7 类' }).click();
  await expect(example.locator('.el-table__body-wrapper tbody tr')).toHaveCount(7);
  await expect(example.getByText('未识别', { exact: true })).toHaveCount(0);
  await expect(example.getByText(/恢复失败/u)).toHaveCount(0);
  for (const errorName of [
    'InvalidArgumentError',
    'DuplicateElementIdError',
    'InvalidSelectorError',
    'ObjectDisposedError',
    'CapabilityError',
    'InteractionConflictError',
    'UnsupportedOperationError'
  ]) {
    await expect(example.getByRole('cell', { name: errorName, exact: true })).toHaveCount(3);
  }
  await example.getByRole('button', { name: '重置真实 API 失败、识别与恢复运行示例' }).click();
  await expect(example.locator('.el-table__body-wrapper tbody tr')).toHaveCount(0);
});
