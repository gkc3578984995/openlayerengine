import { expect, test, type Locator, type Page } from '@playwright/test';

interface ResourceSnapshot {
  readonly lifecycle: string;
  readonly isDestroyed: boolean;
  readonly registryKeys: readonly string[];
  readonly map: {
    readonly targetAttached: boolean;
    readonly size?: readonly [number, number];
    readonly layers: number;
    readonly interactions: number;
    readonly overlays: number;
    readonly controls: number;
    readonly renderPasses: number;
  };
  readonly listeners: { readonly viewport: number; readonly contextmenu: number; readonly target: number };
  readonly dom: {
    readonly viewport: number;
    readonly canvas: number;
    readonly contextMenus: number;
    readonly toolbars: number;
    readonly measureTooltips: number;
    readonly transformTooltips: number;
  };
  readonly animationHandles: number;
  readonly elementCount: number;
}

interface SessionSummary {
  readonly status?: string;
  readonly events: readonly Record<string, unknown>[];
  readonly resources: ResourceSnapshot;
}

interface DrawSummary extends SessionSummary {
  readonly resultIds: readonly string[];
  readonly results: readonly ShapeSnapshot[];
}

interface DrawPreviewProbe {
  readonly featureCount: number;
  readonly hit: boolean;
}

interface EditSummary extends SessionSummary {
  readonly original?: ShapeSnapshot;
  readonly stored?: ShapeSnapshot;
}

interface TransformSummary extends SessionSummary {
  readonly selectedId?: string;
  readonly toolbar: boolean;
  readonly geometry?: ShapeSnapshot;
}

interface ShapeSnapshot {
  readonly type: string;
  readonly controlPoints?: readonly (readonly number[])[];
  readonly center?: readonly number[];
  readonly radius?: number;
}

interface MeasureEvent {
  readonly type: string;
  readonly reason?: string;
  readonly result?: {
    readonly type: string;
    readonly value: number;
    readonly unit: string;
    readonly formatted: string;
    readonly coordinateCount: number;
    readonly segmentCount: number;
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__OL_ENGINE_TEST__?.ready === true)).toBe(true);
  await expect(page.locator('#map-a canvas')).toHaveCount(1);
  await expect(page.locator('#map-b canvas')).toHaveCount(1);
});

test('默认与命名 Earth 隔离浏览器右键，并在销毁后只解除所属 viewport', async ({ page }) => {
  const a = await snapshot(page, 'a');
  const b = await snapshot(page, 'b');

  expect(a.lifecycle).toBe('ready');
  expect(b.lifecycle).toBe('ready');
  expect(a.isDestroyed).toBe(false);
  expect(b.isDestroyed).toBe(false);
  expect(a.registryKeys).toEqual(['<default>', 'map-b']);
  expect(a.map.size).toEqual([560, 560]);
  expect(b.map.size).toEqual([560, 560]);
  expect(a.map.targetAttached).toBe(true);
  expect(b.map.targetAttached).toBe(true);
  expect(a.dom.canvas).toBeGreaterThan(0);
  expect(b.dom.canvas).toBeGreaterThan(0);
  expect(a.listeners.contextmenu).toBeGreaterThanOrEqual(2);
  expect(b.listeners.contextmenu).toBe(a.listeners.contextmenu);
  expect(await page.evaluate(() => window.__OL_ENGINE_TEST__.sameEarth('a'))).toBe(true);
  expect(await page.evaluate(() => window.__OL_ENGINE_TEST__.sameEarth('b'))).toBe(true);

  await expectContextMenu(page, 'a', page.locator('#map-a .ol-viewport'), true);
  await expectContextMenu(page, 'b', page.locator('#map-b .ol-viewport'), true);
  await expectContextMenu(page, 'outside', page.getByTestId('outside'), false);

  await page.evaluate(() => window.__OL_ENGINE_TEST__.destroyA(true));
  await expect.poll(() => page.evaluate(() => window.__OL_ENGINE_TEST__.registryKeys())).toEqual(['map-b']);
  await expectContextMenu(page, 'old-a', page.getByTestId('old-map-a-viewport'), false);
  await expectContextMenu(page, 'b', page.locator('#map-b .ol-viewport'), true);

  const afterB = await snapshot(page, 'b');
  expect(afterB.lifecycle).toBe('ready');
  expect(afterB.listeners.contextmenu).toBe(b.listeners.contextmenu);
  expect(afterB.map.targetAttached).toBe(true);
});

test('Draw 在远世界副本跨越日期变更线时仍显示动态预览', async ({ page }) => {
  const map = page.locator('#map-a .ol-viewport');
  await page.evaluate(() => window.__OL_ENGINE_TEST__.setViewWorld(50.5));
  await page.evaluate(() => window.__OL_ENGINE_TEST__.startDraw('polyline'));
  await clickMap(map, [180, 280]);
  const box = await map.boundingBox();
  if (box === null) throw new Error('地图 viewport 不可见');
  await page.mouse.move(box.x + 380, box.y + 280);

  await expect.poll(() => drawSummary(page).then((summary) => eventTypes(summary.events))).toContain('change');
  await expect
    .poll(() => page.evaluate(() => window.__OL_ENGINE_TEST__.drawPreviewProbe([280, 280]) as DrawPreviewProbe))
    .toEqual({ featureCount: 1, hit: true });

  await rightClickMap(map, [380, 280]);
  await expect.poll(() => drawSummary(page).then((summary) => summary.status)).toBe('finished');
});

test('Tooltip 快捷键使用结构化语义分色并在仅位置变化时复用节点', async ({ page }) => {
  const map = page.locator('#map-a .ol-viewport');
  const baseline = await snapshot(page, 'a');

  await page.evaluate(() => window.__OL_ENGINE_TEST__.startDraw('polygon'));
  await moveMap(map, [120, 150]);
  await clickMap(map, [120, 150]);

  const drawTooltip = page.locator('#map-a .ol-draw-tooltip');
  await expect(drawTooltip).toBeVisible();
  const undoSegment = drawTooltip.locator('.ol-tooltip-segment--undo');
  await expect(undoSegment).toContainText('Ctrl+Z 撤销 (1)');
  await expectComputedColor(undoSegment, '#ff9800');
  await undoSegment.evaluate((element) => {
    element.setAttribute('data-node-reuse-probe', 'undo');
  });
  await moveMap(map, [150, 180]);
  await expect(drawTooltip.locator('[data-node-reuse-probe="undo"]')).toHaveCount(1);

  await page.keyboard.press('Control+Z');
  const redoSegment = drawTooltip.locator('.ol-tooltip-segment--redo');
  await expect(redoSegment).toContainText('Ctrl+Y 重做 (1)');
  await expectComputedColor(redoSegment, '#00bfa5');

  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensureTransformElement());
  await page.evaluate((id) => window.__OL_ENGINE_TEST__.startTransformElement(id, false), elementId);
  const transformTooltip = page.locator('#map-a .ol-transform-tooltip');
  await expect(transformTooltip).toBeVisible();
  await expect(transformTooltip).toHaveCSS('opacity', '1');
  await expectTooltipSegment(transformTooltip, 'shortcut', 'Ctrl+C', '#7dd3fc');
  await expectTooltipSegment(transformTooltip, 'muted', 'Ctrl+V', '#999');
  await expectTooltipSegment(transformTooltip, 'danger', 'Delete', '#d9363f');
  await expectTooltipSegment(transformTooltip, 'exit', 'Esc', '#fc972b');
  await page.keyboard.press('Control+C');
  await expectTooltipSegment(transformTooltip, 'shortcut', 'Ctrl+V', '#7dd3fc');

  await page.evaluate(() => window.__OL_ENGINE_TEST__.cancelTransform());
  await expect(transformTooltip).toHaveCount(0);
  const after = await snapshot(page, 'a');
  expect(after.map.layers).toBe(baseline.map.layers);
  expect(after.map.interactions).toBe(baseline.map.interactions);
  expect(after.map.overlays).toBe(baseline.map.overlays);
  expect(after.dom.canvas).toBe(baseline.dom.canvas);
});

test('真实鼠标完成 polygon、attack-arrow 与动态控制点编辑，并验证右键菜单优先级', async ({ page }) => {
  const map = page.locator('#map-a .ol-viewport');
  const baseline = await snapshot(page, 'a');
  const drawBaseCursor = await computedCursor(map);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.registerMenus());

  await page.evaluate(() => window.__OL_ENGINE_TEST__.startDraw('polygon'));
  await expect.poll(() => computedCursor(map)).toBe('pointer');
  await moveMap(map, [90, 100]);
  await expect(page.locator('#map-a .ol-draw-tooltip')).toBeVisible();
  await expect(page.locator('#map-a .ol-draw-tooltip')).toContainText('左击开始绘制，右击退出绘制');
  await clickMap(map, [120, 150]);
  await clickMap(map, [300, 135]);
  await clickMap(map, [245, 310]);
  await rightClickMap(map, [245, 310]);
  await expect.poll(() => drawSummary(page).then((summary) => summary.status)).toBe('finished');
  await expect.poll(() => computedCursor(map)).toBe(drawBaseCursor);

  const polygon = await drawSummary(page);
  expect(polygon.resultIds).toHaveLength(1);
  expect(polygon.results[0]?.type).toBe('polygon');
  expect(polygon.results[0]?.controlPoints).toHaveLength(3);
  expect(eventTypes(polygon.events)).toContain('complete');
  expect(polygon.events.filter((event) => event.type === 'click').map((event) => event.controlPointCount)).toEqual([1, 2, 3]);
  expect(polygon.resources.map.interactions).toBe(baseline.map.interactions);
  await expect(page.locator('#map-a .ol-draw-tooltip')).toHaveCount(0);
  await expect(page.locator('.ol-context-menu')).toHaveCount(0);

  await page.evaluate(() => window.__OL_ENGINE_TEST__.startDraw('attack-arrow'));
  await clickMap(map, [110, 385]);
  await clickMap(map, [190, 385]);
  await clickMap(map, [265, 300]);
  await clickMap(map, [360, 240]);
  await rightClickMap(map, [360, 240]);
  await expect.poll(() => drawSummary(page).then((summary) => summary.status)).toBe('finished');

  const arrow = await drawSummary(page);
  const arrowId = arrow.resultIds[0];
  expect(arrowId).toBeTruthy();
  expect(arrow.results[0]?.type).toBe('attack-arrow');
  expect(arrow.results[0]?.controlPoints).toHaveLength(4);
  expect(eventTypes(arrow.events)).toContain('complete');

  const editBaseCursor = await computedCursor(map);
  await page.evaluate((id) => window.__OL_ENGINE_TEST__.startEdit(id), arrowId);
  const editActive = await editSummary(page);
  expect(editActive.status).toBe('active');
  expect(editActive.resources.map.layers).toBe(baseline.map.layers + 1);
  expect(editActive.resources.map.interactions).toBe(baseline.map.interactions + 1);

  const insertion = await page.evaluate(() => window.__OL_ENGINE_TEST__.editInsertionPixel(0));
  await moveMap(map, insertion);
  await expect(page.locator('#map-a .ol-edit-tooltip')).toBeVisible();
  await expect(page.locator('#map-a .ol-edit-tooltip')).toContainText('按住 Alt 单击添加点');
  await altClickMap(map, insertion);
  await expect.poll(() => editSummary(page).then((summary) => summary.events.some((event) => event.operation === 'insert'))).toBe(true);
  expect(await page.evaluate(() => window.__OL_ENGINE_TEST__.editControlPixel(4))).toHaveLength(2);

  const anchor = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementPixel(id, 0), arrowId);
  const idleAnchorVisual = await canvasNeighborhoodSignature(page, anchor);
  await moveMap(map, anchor);
  await expect.poll(() => computedCursor(map)).toBe('move');
  await expect.poll(() => canvasNeighborhoodSignature(page, anchor)).not.toBe(idleAnchorVisual);
  const hoverAnchorVisual = await canvasNeighborhoodSignature(page, anchor);
  await expect(page.locator('#map-a .ol-edit-tooltip')).toContainText('拖拽控制点编辑图形');
  const mapBox = await map.boundingBox();
  if (mapBox === null) throw new Error('地图 viewport 不可见。');
  await page.mouse.down();
  await expect.poll(() => computedCursor(map)).toBe('grabbing');
  await expect.poll(() => canvasNeighborhoodSignature(page, anchor)).not.toBe(hoverAnchorVisual);
  await page.mouse.move(mapBox.x + anchor[0] + 34, mapBox.y + anchor[1] - 24, { steps: 5 });
  await page.mouse.up();
  const released = await page.evaluate(() => ({
    control: window.__OL_ENGINE_TEST__.editControlPixel(0),
    feedback: window.__OL_ENGINE_TEST__.editFeedbackPixel()
  }));
  expect(released.feedback).toEqual(released.control);
  expect(released.feedback).not.toEqual(anchor);
  await nextAnimationFrame(page);
  expect(await page.evaluate(() => window.__OL_ENGINE_TEST__.editFeedbackPixel())).toEqual(released.control);
  await nextAnimationFrame(page);
  expect(await page.evaluate(() => window.__OL_ENGINE_TEST__.editFeedbackPixel())).toEqual(released.control);
  await expect.poll(() => computedCursor(map)).toBe('move');
  await expect.poll(() => editSummary(page).then((summary) => summary.events.some((event) => event.type === 'modifying'))).toBe(true);

  await page.keyboard.press('Control+Z');
  await expect.poll(() => computedCursor(map)).toBe(editBaseCursor);
  await expect(page.locator('#map-a .ol-edit-tooltip .ol-tooltip-segment--redo')).toContainText('Ctrl+Y 重做');
  const undoneControl = await page.evaluate(() => window.__OL_ENGINE_TEST__.editControlPixel(0));
  await moveMap(map, undoneControl);
  await expect.poll(() => computedCursor(map)).toBe('move');
  await page.keyboard.press('Control+Y');
  await expect.poll(() => computedCursor(map)).toBe(editBaseCursor);
  const redoneControl = await page.evaluate(() => window.__OL_ENGINE_TEST__.editControlPixel(0));
  await moveMap(map, redoneControl);
  await expect.poll(() => computedCursor(map)).toBe('move');

  const modifying = await editSummary(page);
  expect(modifying.events.some((event) => event.type === 'modifying' && event.operation === 'move')).toBe(true);
  const working = [...modifying.events].reverse().find((event) => event.type === 'modifying')?.geometry;
  expect(working).not.toEqual(modifying.original);
  expect(modifying.stored).toEqual(modifying.original);

  await moveMap(map, [20, 20]);
  await expect.poll(() => computedCursor(map)).toBe(editBaseCursor);
  const movedControl = await page.evaluate(() => window.__OL_ENGINE_TEST__.editControlPixel(0));
  await moveMap(map, movedControl);
  await expect.poll(() => computedCursor(map)).toBe('move');
  await rightClickMap(map, movedControl);
  await expect.poll(() => editSummary(page).then((summary) => summary.status)).toBe('finished');
  await expect.poll(() => computedCursor(map)).toBe(editBaseCursor);
  const edited = await editSummary(page);
  expect(edited.stored).not.toEqual(edited.original);
  expect(eventTypes(edited.events)).toContain('complete');
  expect(edited.resources.map.layers).toBe(baseline.map.layers);
  expect(edited.resources.map.interactions).toBe(baseline.map.interactions);
  expect(edited.resources.dom.canvas).toBe(baseline.dom.canvas);
  await expect(page.locator('#map-a .ol-edit-tooltip')).toHaveCount(0);
  await expect(page.locator('.ol-context-menu')).toHaveCount(0);

  await page.evaluate((id) => window.__OL_ENGINE_TEST__.registerMenus(id), arrowId);
  await rightClickMap(map, [500, 500]);
  await expect(page.locator('.ol-context-menu')).toBeVisible();
  await expect(page.locator('.ol-context-menu')).toContainText('地图菜单操作');
  await page.evaluate(() => window.__OL_ENGINE_TEST__.closeMenu());
  await expect(page.locator('.ol-context-menu')).toBeHidden();

  const editedAnchor = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementPixel(id, 0), arrowId);
  await rightClickMap(map, editedAnchor);
  await expect(page.locator('.ol-context-menu')).toBeVisible();
  await expect(page.locator('.ol-context-menu')).toContainText('元素菜单操作');
});

test('四类 Measure 均经过真实草稿输入，完成结果保留且 clear 或 cancel 回到基线', async ({ page }) => {
  const map = page.locator('#map-a .ol-viewport');
  const baseline = await snapshot(page, 'a');
  await page.evaluate(() => window.__OL_ENGINE_TEST__.registerMenus());

  for (const type of ['distance-segments', 'distance-total', 'area'] as const) {
    await page.evaluate((measureType) => window.__OL_ENGINE_TEST__.startMeasure(measureType), type);
    const points: readonly (readonly [number, number])[] =
      type === 'area'
        ? [
            [130, 150],
            [340, 160],
            [250, 340]
          ]
        : [
            [130, 170],
            [260, 250],
            [390, 190]
          ];
    for (const point of points) await clickMap(map, point);

    await expect.poll(() => measureSummary(page).then((summary) => summary.events.some((event) => event.type === 'change'))).toBe(true);
    await expect.poll(() => snapshot(page, 'a').then((state) => state.dom.measureTooltips)).toBeGreaterThan(0);
    await rightClickMap(map, points.at(-1) as readonly [number, number]);
    await expect.poll(() => measureSummary(page).then((summary) => summary.status)).toBe('finished');

    const complete = await measureSummary(page);
    const result = (complete.events as unknown as readonly MeasureEvent[]).find((event) => event.type === 'complete')?.result;
    expect(result?.type).toBe(type);
    expect(result?.coordinateCount).toBeGreaterThanOrEqual(type === 'area' ? 3 : 2);
    expect(result?.segmentCount).toBeGreaterThan(0);
    expect(result?.formatted).toBeTruthy();
    expect(complete.resources.map.overlays).toBeGreaterThan(baseline.map.overlays);
    expect(complete.resources.dom.measureTooltips).toBeGreaterThan(0);
    await expect(page.locator('.ol-context-menu')).toHaveCount(0);

    await page.evaluate(() => window.__OL_ENGINE_TEST__.clearMeasurements());
    await expect.poll(() => snapshot(page, 'a').then((state) => state.map.overlays)).toBe(baseline.map.overlays);
    await expect.poll(() => snapshot(page, 'a').then((state) => state.dom.measureTooltips)).toBe(0);
  }

  await page.evaluate(() => window.__OL_ENGINE_TEST__.startMeasure('distance-radial'));
  await clickMap(map, [150, 180]);
  await clickMap(map, [360, 310]);
  await expect.poll(() => measureSummary(page).then((summary) => summary.events.some((event) => event.type === 'change'))).toBe(true);
  await expect.poll(() => snapshot(page, 'a').then((state) => state.map.overlays)).toBeGreaterThan(baseline.map.overlays);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.cancelMeasure());
  await expect.poll(() => measureSummary(page).then((summary) => summary.status)).toBe('cancelled');

  const cancelled = await measureSummary(page);
  expect((cancelled.events as unknown as readonly MeasureEvent[]).some((event) => event.type === 'cancel' && event.reason === 'cancelled')).toBe(true);
  expect(cancelled.resources.map.overlays).toBe(baseline.map.overlays);
  expect(cancelled.resources.dom.measureTooltips).toBe(0);
  expect(cancelled.resources.map.interactions).toBe(baseline.map.interactions);
});

test('Transform 忽略会话启动前点击产生的延迟 singleclick', async ({ page }) => {
  const map = page.locator('#map-a .ol-viewport');
  const baseline = await snapshot(page, 'a');
  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensureTransformElement());
  const staleTargetId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensureTransformStaleTarget());
  const triggerPixel = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementPixel(id), staleTargetId);

  await page.evaluate(() => window.__OL_ENGINE_TEST__.armTransformOnNextMapClick());
  await clickMap(map, triggerPixel);
  await expect.poll(() => transformSummary(page).then((summary) => summary.status)).toBe('active');
  await expect.poll(() => page.evaluate(() => window.__OL_ENGINE_TEST__.deferredSingleClickCount())).toBe(1);

  const summary = await transformSummary(page);
  expect(summary.selectedId).toBe(elementId);
  expect(eventTypes(summary.events)).not.toContain('selectEnd');
  expect(eventTypes(summary.events)).not.toContain('select');

  await page.evaluate(() => window.__OL_ENGINE_TEST__.cancelTransform());
  await expect.poll(() => transformSummary(page).then((current) => current.status)).toBe('cancelled');
  await page.evaluate(() => window.__OL_ENGINE_TEST__.startTransformByClick());
  await clickMap(map, triggerPixel);
  await expect.poll(() => transformSummary(page).then((current) => current.selectedId)).toBe(staleTargetId);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.cancelTransform());
  await expect.poll(() => transformSummary(page).then((current) => current.status)).toBe('cancelled');
  const cancelled = await transformSummary(page);
  expect(cancelled.resources.map.layers).toBe(baseline.map.layers);
  expect(cancelled.resources.map.interactions).toBe(baseline.map.interactions);
});

test('Transform 聚焦当前地图接收键盘事件，并在按住 Alt 时保持缩放可用', async ({ page }) => {
  const map = page.locator('#map-a .ol-viewport');
  const baseline = await snapshot(page, 'a');
  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensureTransformElement());
  const original = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.startTransformDirect(false));

  await expect.poll(() => page.evaluate(() => document.activeElement === document.querySelector('#map-a'))).toBe(true);

  await page.keyboard.press('Alt');
  expect((await transformSummary(page)).status).toBe('active');

  const pixels = await transformHandlePixels(page);
  await page.keyboard.down('Alt');
  try {
    await dragMap(map, pixels.scale, [pixels.scale[0] + 32, pixels.scale[1] - 26]);
  } finally {
    await page.keyboard.up('Alt');
  }
  await expect.poll(() => transformSummary(page).then((summary) => eventTypes(summary.events))).toContain('scaleEnd');
  expect((await transformSummary(page)).geometry).toEqual(original);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.finishTransform());
  await expect.poll(() => transformSummary(page).then((summary) => summary.status)).toBe('finished');
  const scaled = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId);
  expect(scaled).not.toEqual(original);

  await page.evaluate(() => window.__OL_ENGINE_TEST__.startTransformDirect(false));
  await page.keyboard.press('Escape');
  await expect.poll(() => transformSummary(page).then((summary) => summary.status)).toBe('cancelled');
  expect(await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId)).toEqual(scaled);
  const cancelled = await transformSummary(page);
  expect(cancelled.resources.map.layers).toBe(baseline.map.layers);
  expect(cancelled.resources.map.interactions).toBe(baseline.map.interactions);
  expect(cancelled.resources.map.overlays).toBe(baseline.map.overlays);
});

test('Transform Edit 通过真实鼠标插入、拖拽和删除动态控制点，并统一光标与提示', async ({ page }) => {
  const map = page.locator('#map-a .ol-viewport');
  const baseline = await snapshot(page, 'a');
  const baseCursor = await computedCursor(map);
  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensureTransformElement());
  const original = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id) as ShapeSnapshot, elementId);
  expect(original.controlPoints).toHaveLength(3);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.setViewWorld(50));

  const editPreviewPixel = [270, 290] as const;
  const persistentVisual = await canvasNeighborhoodSignature(page, editPreviewPixel);
  await page.evaluate((id) => window.__OL_ENGINE_TEST__.startTransformEdit(id), elementId);
  await expect.poll(() => canvasNeighborhoodSignature(page, editPreviewPixel)).not.toBe(persistentVisual);
  await expect(page.locator('#map-a .ol-transform-tooltip')).toBeVisible();
  const insertion = await page.evaluate(() => window.__OL_ENGINE_TEST__.transformEditInsertionPixel(0));
  await moveMap(map, insertion);
  await expect.poll(() => computedCursor(map)).toBe('move');
  await expect(page.locator('#map-a .ol-transform-tooltip')).toContainText('按住 Alt 单击添加点');
  await altClickMap(map, insertion);
  await expect.poll(() => transformSummary(page).then((summary) => eventTypes(summary.events))).toContain('edit');
  expect((await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id) as ShapeSnapshot, elementId)).controlPoints).toHaveLength(3);

  const insertedControl = await page.evaluate(() => window.__OL_ENGINE_TEST__.transformEditControlPixel(1));
  const idleControlVisual = await canvasNeighborhoodSignature(page, insertedControl);
  await moveMap(map, insertedControl);
  await expect.poll(() => computedCursor(map)).toBe('move');
  await expect.poll(() => canvasNeighborhoodSignature(page, insertedControl)).not.toBe(idleControlVisual);
  const hoverControlVisual = await canvasNeighborhoodSignature(page, insertedControl);
  const mapBox = await map.boundingBox();
  if (mapBox === null) throw new Error('地图 viewport 不可见。');
  await page.mouse.down();
  await expect.poll(() => computedCursor(map)).toBe('grabbing');
  await expect.poll(() => canvasNeighborhoodSignature(page, insertedControl)).not.toBe(hoverControlVisual);
  await page.mouse.move(mapBox.x + insertedControl[0] + 24, mapBox.y + insertedControl[1] - 18, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => computedCursor(map)).toBe('move');
  await expect(page.locator('#map-a .ol-transform-tooltip')).toContainText('按住 Alt 单击删除点');
  await expect.poll(() => transformSummary(page).then((summary) => summary.events.filter((event) => event.type === 'edit').length)).toBeGreaterThan(1);

  await page.keyboard.press('Control+Z');
  await expect.poll(() => computedCursor(map)).toBe(baseCursor);
  await expect(page.locator('#map-a .ol-transform-tooltip .ol-tooltip-segment--redo')).toContainText('Ctrl+Y 重做');
  const undoneControl = await page.evaluate(() => window.__OL_ENGINE_TEST__.transformEditControlPixel(1));
  await moveMap(map, undoneControl);
  await expect.poll(() => computedCursor(map)).toBe('move');
  await page.keyboard.press('Control+Y');
  await expect.poll(() => computedCursor(map)).toBe(baseCursor);
  const redoneControl = await page.evaluate(() => window.__OL_ENGINE_TEST__.transformEditControlPixel(1));
  await moveMap(map, redoneControl);
  await expect.poll(() => computedCursor(map)).toBe('move');

  await page.evaluate(() => window.__OL_ENGINE_TEST__.finishTransform());
  await expect.poll(() => transformSummary(page).then((summary) => summary.status)).toBe('finished');
  await expect.poll(() => computedCursor(map)).toBe(baseCursor);
  const inserted = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id) as ShapeSnapshot, elementId);
  expect(inserted.controlPoints).toHaveLength(4);

  await page.evaluate((id) => window.__OL_ENGINE_TEST__.startTransformEdit(id), elementId);
  const removable = await page.evaluate(() => window.__OL_ENGINE_TEST__.transformEditControlPixel(1));
  await moveMap(map, removable);
  await expect(page.locator('#map-a .ol-transform-tooltip')).toContainText('按住 Alt 单击删除点');
  await altClickMap(map, removable);
  await expect.poll(() => transformSummary(page).then((summary) => eventTypes(summary.events))).toContain('edit');
  expect((await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id) as ShapeSnapshot, elementId)).controlPoints).toHaveLength(4);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.finishTransform());
  await expect.poll(() => transformSummary(page).then((summary) => summary.status)).toBe('finished');
  expect((await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id) as ShapeSnapshot, elementId)).controlPoints).toHaveLength(3);
  await expect.poll(() => computedCursor(map)).toBe(baseCursor);

  const after = await transformSummary(page);
  expect(after.resources.map.layers).toBe(baseline.map.layers);
  expect(after.resources.map.interactions).toBe(baseline.map.interactions);
  expect(after.resources.map.overlays).toBe(baseline.map.overlays);
  expect(after.resources.dom.canvas).toBe(baseline.dom.canvas);
  expect(after.resources.dom.transformTooltips).toBe(baseline.dom.transformTooltips);
});

test('Transform 通过 singleclick 选择并分别执行 translate、scale、rotate，再验证直接选择与清理', async ({ page }) => {
  const map = page.locator('#map-a .ol-viewport');
  const baseline = await snapshot(page, 'a');
  const elementId = await page.evaluate(() => window.__OL_ENGINE_TEST__.ensureTransformElement());
  const original = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId);
  await page.evaluate((id) => window.__OL_ENGINE_TEST__.registerMenus(id), elementId);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.startTransformByClick());

  const selectionPixel = await page.evaluate(() => {
    const pixels = window.__OL_ENGINE_TEST__.transformPixels() as { translate: readonly [number, number] };
    return pixels.translate;
  });
  await clickMap(map, selectionPixel);
  await expect.poll(() => transformSummary(page).then((summary) => summary.selectedId)).toBe(elementId);

  const selected = await transformSummary(page);
  expect(selected.toolbar).toBe(false);
  expect(selected.resources.map.layers).toBe(baseline.map.layers + 1);
  expect(selected.resources.map.interactions).toBe(baseline.map.interactions + 1);
  expect(selected.resources.map.overlays).toBe(baseline.map.overlays + 1);
  expect(selected.resources.listeners.contextmenu).toBe(baseline.listeners.contextmenu + 1);
  expect(selected.resources.map.renderPasses).toBe(baseline.map.renderPasses);
  expect(selected.resources.dom.toolbars).toBe(0);
  expect(selected.resources.dom.transformTooltips).toBe(baseline.dom.transformTooltips + 1);
  await expect(page.locator('#map-a .ol-transform-tooltip')).toBeVisible();

  let pixels = await transformHandlePixels(page);
  expect(pixels.probe).toBe('native');
  await dragMap(map, pixels.scale, [pixels.scale[0] + 32, pixels.scale[1] - 26]);
  await expect.poll(() => transformSummary(page).then((summary) => eventTypes(summary.events))).toContain('scaleEnd');
  const scaledSession = await transformSummary(page);
  expect(eventTypes(scaledSession.events)).toEqual(expect.arrayContaining(['scaleStart', 'scaling', 'scaleEnd']));
  await page.evaluate(() => window.__OL_ENGINE_TEST__.finishTransform());
  await expect.poll(() => transformSummary(page).then((summary) => summary.status)).toBe('finished');
  const scaled = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId);
  expect(scaled).not.toEqual(original);

  await page.evaluate(() => window.__OL_ENGINE_TEST__.startTransformDirect(false));
  pixels = await transformHandlePixels(page);
  await dragMap(map, pixels.translate, [pixels.translate[0] + 36, pixels.translate[1] + 26]);
  await expect.poll(() => transformSummary(page).then((summary) => eventTypes(summary.events))).toContain('translateEnd');
  const translatedSession = await transformSummary(page);
  expect(eventTypes(translatedSession.events)).toEqual(expect.arrayContaining(['translateStart', 'translating', 'translateEnd']));
  await page.evaluate(() => window.__OL_ENGINE_TEST__.finishTransform());
  await expect.poll(() => transformSummary(page).then((summary) => summary.status)).toBe('finished');
  const translated = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId);
  expect(translated).not.toEqual(scaled);

  await page.evaluate(() => window.__OL_ENGINE_TEST__.startTransformDirect(false));
  pixels = await transformHandlePixels(page);
  await dragMap(map, pixels.rotate, [pixels.rotate[0] + 62, pixels.rotate[1] + 8]);
  await expect.poll(() => transformSummary(page).then((summary) => eventTypes(summary.events))).toContain('rotateEnd');

  const transformed = await transformSummary(page);
  expect(eventTypes(transformed.events)).toEqual(expect.arrayContaining(['rotateStart', 'rotating', 'rotateEnd']));

  await rightClickMap(map, [500, 500]);
  await expect.poll(() => transformSummary(page).then((summary) => summary.status)).toBe('finished');
  await expect(page.locator('.ol-context-menu')).toHaveCount(0);
  const afterFinish = await transformSummary(page);
  expect(afterFinish.geometry).not.toEqual(translated);
  expect(afterFinish.resources.map.layers).toBe(baseline.map.layers);
  expect(afterFinish.resources.map.interactions).toBe(baseline.map.interactions);
  expect(afterFinish.resources.map.overlays).toBe(baseline.map.overlays);
  expect(afterFinish.resources.map.renderPasses).toBe(baseline.map.renderPasses);
  expect(afterFinish.resources.dom.transformTooltips).toBe(baseline.dom.transformTooltips);

  await page.evaluate(() => window.__OL_ENGINE_TEST__.startTransformDirect());
  const direct = await transformSummary(page);
  expect(direct.status).toBe('active');
  expect(direct.selectedId).toBe(elementId);
  expect(direct.toolbar).toBe(true);
  expect(direct.resources.map.layers).toBe(baseline.map.layers + 1);
  expect(direct.resources.map.interactions).toBe(baseline.map.interactions + 1);
  expect(direct.resources.map.overlays).toBe(baseline.map.overlays + 2);
  expect(direct.resources.map.renderPasses).toBe(baseline.map.renderPasses);
  expect(direct.resources.dom.toolbars).toBe(baseline.dom.toolbars + 1);
  expect(direct.resources.dom.transformTooltips).toBe(baseline.dom.transformTooltips + 1);

  pixels = await transformHandlePixels(page);
  const mapBox = await map.boundingBox();
  const toolbar = page.locator('#map-a .ol-toolbar');
  const toolbarBox = await toolbar.boundingBox();
  if (mapBox === null || toolbarBox === null) throw new Error('Transform 工具栏或地图没有可用的布局范围');
  expect(await toolbar.evaluate((element) => getComputedStyle(element).flexDirection)).toBe('column');
  expect(Math.abs(toolbarBox.x - (mapBox.x + pixels.bounds.right + 15))).toBeLessThanOrEqual(2);
  expect(Math.abs(toolbarBox.y - (mapBox.y + pixels.bounds.top))).toBeLessThanOrEqual(2);

  await page.evaluate(() => window.__OL_ENGINE_TEST__.setViewRotation(Math.PI / 6));
  pixels = await transformHandlePixels(page);
  const rotatedToolbarBox = await toolbar.boundingBox();
  if (rotatedToolbarBox === null) throw new Error('旋转视图后 Transform 工具栏不可见');
  expect(Math.abs(rotatedToolbarBox.x - (mapBox.x + pixels.bounds.right + 15))).toBeLessThanOrEqual(2);
  expect(Math.abs(rotatedToolbarBox.y - (mapBox.y + pixels.bounds.top))).toBeLessThanOrEqual(2);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.setViewRotation(0));

  const tooltip = page.locator('#map-a .ol-transform-tooltip');
  for (const target of [
    [180, 180],
    [460, 320]
  ] as const) {
    await page.mouse.move(mapBox.x + target[0], mapBox.y + target[1]);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const tooltipBox = await tooltip.boundingBox();
    if (tooltipBox === null) throw new Error('Transform 提示框没有可用的布局范围');
    expect(Math.abs(tooltipBox.x - (mapBox.x + target[0] + 15))).toBeLessThanOrEqual(2);
    expect(Math.abs(tooltipBox.y + tooltipBox.height - (mapBox.y + target[1] - 11))).toBeLessThanOrEqual(2);
  }

  const committed = await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.hideTransformToolbar());
  pixels = await transformHandlePixels(page);
  await beginDragMap(map, pixels.translate, [pixels.translate[0] + 28, pixels.translate[1] - 20]);
  await expect.poll(() => transformSummary(page).then((summary) => eventTypes(summary.events))).toContain('translating');
  await expect.poll(() => transformSummary(page).then((summary) => summary.resources.map.renderPasses)).toBeGreaterThan(baseline.map.renderPasses);
  expect(await page.evaluate((id) => window.__OL_ENGINE_TEST__.elementState(id), elementId)).toEqual(committed);
  await page.evaluate(() => window.__OL_ENGINE_TEST__.cancelTransform());
  await page.mouse.up();
  await expect.poll(() => transformSummary(page).then((summary) => summary.status)).toBe('cancelled');
  const directCancelled = await transformSummary(page);
  expect(directCancelled.geometry).toEqual(committed);
  expect(directCancelled.resources.map.layers).toBe(baseline.map.layers);
  expect(directCancelled.resources.map.interactions).toBe(baseline.map.interactions);
  expect(directCancelled.resources.map.overlays).toBe(baseline.map.overlays);
  expect(directCancelled.resources.map.renderPasses).toBe(baseline.map.renderPasses);
  expect(directCancelled.resources.dom.transformTooltips).toBe(baseline.dom.transformTooltips);
});

async function snapshot(page: Page, name: 'a' | 'b'): Promise<ResourceSnapshot> {
  return page.evaluate((mapName) => window.__OL_ENGINE_TEST__.snapshot(mapName) as ResourceSnapshot, name);
}

async function drawSummary(page: Page): Promise<DrawSummary> {
  return page.evaluate(() => window.__OL_ENGINE_TEST__.drawSummary() as DrawSummary);
}

async function editSummary(page: Page): Promise<EditSummary> {
  return page.evaluate(() => window.__OL_ENGINE_TEST__.editSummary() as EditSummary);
}

async function measureSummary(page: Page): Promise<SessionSummary> {
  return page.evaluate(() => window.__OL_ENGINE_TEST__.measureSummary() as SessionSummary);
}

async function transformSummary(page: Page): Promise<TransformSummary> {
  return page.evaluate(() => window.__OL_ENGINE_TEST__.transformSummary() as TransformSummary);
}

async function transformHandlePixels(page: Page): Promise<{
  readonly probe: string;
  readonly keys: readonly string[];
  readonly translate: readonly [number, number];
  readonly scale: readonly [number, number];
  readonly scaleAnchor: readonly [number, number];
  readonly bounds: Readonly<{ left: number; right: number; top: number; bottom: number }>;
  readonly rotate: readonly [number, number];
}> {
  return page.evaluate(
    () =>
      window.__OL_ENGINE_TEST__.transformPixels() as {
        readonly probe: string;
        readonly keys: readonly string[];
        readonly translate: readonly [number, number];
        readonly scale: readonly [number, number];
        readonly scaleAnchor: readonly [number, number];
        readonly bounds: Readonly<{ left: number; right: number; top: number; bottom: number }>;
        readonly rotate: readonly [number, number];
      }
  );
}

async function expectContextMenu(page: Page, target: 'a' | 'b' | 'outside' | 'old-a', locator: Locator, expectedPrevented: boolean): Promise<void> {
  await page.evaluate((name) => window.__OL_ENGINE_TEST__.armContextMenuProbe(name), target);
  await locator.click({ button: 'right', position: { x: 30, y: 30 } });
  await expect
    .poll(() => page.evaluate((name) => window.__OL_ENGINE_TEST__.readContextMenuProbe(name), target))
    .toEqual({ received: true, defaultPrevented: expectedPrevented });
}

async function clickMap(map: Locator, position: readonly [number, number]): Promise<void> {
  await map.click({ position: { x: position[0], y: position[1] } });
}

async function altClickMap(map: Locator, position: readonly [number, number]): Promise<void> {
  await map.click({ modifiers: ['Alt'], position: { x: position[0], y: position[1] } });
}

async function moveMap(map: Locator, position: readonly [number, number]): Promise<void> {
  const box = await map.boundingBox();
  if (box === null) throw new Error('地图 viewport 不可见。');
  await map.page().mouse.move(box.x + position[0], box.y + position[1]);
}

async function nextAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function computedCursor(target: Locator): Promise<string> {
  return target.evaluate((element) => getComputedStyle(element).cursor);
}

async function rightClickMap(map: Locator, position: readonly [number, number]): Promise<void> {
  await map.click({ button: 'right', position: { x: position[0], y: position[1] } });
}

async function dragMap(map: Locator, start: readonly [number, number], end: readonly [number, number]): Promise<void> {
  await beginDragMap(map, start, end);
  await map.page().mouse.up();
}

async function beginDragMap(map: Locator, start: readonly [number, number], end: readonly [number, number]): Promise<void> {
  const box = await map.boundingBox();
  if (box === null) throw new Error('地图 viewport 不可见。');
  await map.page().mouse.move(box.x + start[0], box.y + start[1]);
  await map.page().mouse.down();
  await map.page().mouse.move(box.x + end[0], box.y + end[1], { steps: 5 });
}

async function expectTooltipSegment(
  tooltip: Locator,
  tone: 'shortcut' | 'undo' | 'redo' | 'danger' | 'exit' | 'muted',
  text: string,
  color: string
): Promise<void> {
  const segment = tooltip.locator(`.ol-tooltip-segment--${tone}`).filter({ hasText: text });
  await expect(segment).toHaveCount(1);
  await expect(segment).toHaveText(text);
  await expectComputedColor(segment, color);
}

async function expectComputedColor(target: Locator, expectedColor: string): Promise<void> {
  const colors = await target.evaluateAll((elements, value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { actual: elements.map((element) => getComputedStyle(element).color), expected };
  }, expectedColor);
  expect(colors.actual).toEqual([colors.expected]);
}

async function canvasNeighborhoodSignature(page: Page, pixel: readonly [number, number]): Promise<string> {
  return page.evaluate(([pixelX, pixelY]) => {
    const viewport = document.querySelector<HTMLElement>('#map-a .ol-viewport');
    if (viewport === null) return 'missing-viewport';
    const viewportRect = viewport.getBoundingClientRect();
    const absoluteX = viewportRect.left + pixelX;
    const absoluteY = viewportRect.top + pixelY;
    const signatures: string[] = [];
    for (const [index, canvas] of Array.from(viewport.querySelectorAll('canvas')).entries()) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || absoluteX < rect.left || absoluteX > rect.right || absoluteY < rect.top || absoluteY > rect.bottom) continue;
      const context = canvas.getContext('2d');
      if (context === null) continue;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const centerX = (absoluteX - rect.left) * scaleX;
      const centerY = (absoluteY - rect.top) * scaleY;
      const radiusX = Math.ceil(12 * scaleX);
      const radiusY = Math.ceil(12 * scaleY);
      const left = Math.max(0, Math.floor(centerX - radiusX));
      const top = Math.max(0, Math.floor(centerY - radiusY));
      const width = Math.min(canvas.width - left, radiusX * 2 + 1);
      const height = Math.min(canvas.height - top, radiusY * 2 + 1);
      if (width <= 0 || height <= 0) continue;
      const data = context.getImageData(left, top, width, height).data;
      let hash = 2_166_136_261;
      let alphaTotal = 0;
      for (const value of data) hash = Math.imul(hash ^ value, 16_777_619) >>> 0;
      for (let offset = 3; offset < data.length; offset += 4) alphaTotal += data[offset] ?? 0;
      if (alphaTotal > 0) signatures.push(`${index}:${width}x${height}:${alphaTotal}:${hash}`);
    }
    return signatures.length === 0 ? 'no-readable-canvas' : signatures.join('|');
  }, pixel);
}

function eventTypes(events: readonly Record<string, unknown>[]): string[] {
  return events.flatMap((event) => (typeof event.type === 'string' ? [event.type] : []));
}
