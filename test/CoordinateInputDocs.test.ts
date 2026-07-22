import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('元素坐标与圆半径文档', () => {
  it('在迁移说明中明确写入、读取、投影和米制半径边界', async () => {
    const migration = await readFile(resolve('MIGRATION.txt'), 'utf8');

    expect(migration).toContain('扁平数组会按 `XY` 两两分组');
    expect(migration).toContain('只简化数组结构，不会转换坐标投影');
    expect(migration).toContain('earth.view.toProjectedCoordinates()');
    expect(migration).toContain('earth.view.toGeographicCoordinates()');
    expect(migration).toContain('center: earth.view.toProjectedCoordinates([120, 0])');
    expect(migration).toContain('`Element.state.geometry.radius`');
    expect(migration).toContain('都使用米');
    expect(migration).toContain('`element.olFeature` 中原生 OL Circle 的半径仍是 View 投影单位');
    expect(migration).toContain('toFlatCoordinates()');
  });

  it('网站使用同一个 Vue 文件提供预览和源代码', async () => {
    const page = await readFile(resolve('website/src/views/MigrationV2View.vue'), 'utf8');
    const example = await readFile(resolve('website/src/examples/ElementCoordinateStorageDemo.vue'), 'utf8');

    expect(page).toContain("import ElementCoordinateStorageDemo from '../examples/ElementCoordinateStorageDemo.vue';");
    expect(page).toContain("import elementCoordinateStorageSource from '../examples/ElementCoordinateStorageDemo.vue?raw';");
    expect(page).toContain('id="example-flat-coordinate-storage"');
    expect(page).toContain('id="circle-radius"');
    expect(page).toContain('id="api-to-flat-coordinates"');
    expect(page).toContain('earth.view.toProjectedCoordinates(lonLat)');
    expect(page).toContain('radius: 1_000');
    expect(example).toContain('Earth, toFlatCoordinates, type Coordinate, type ShapeState');
    expect(example).toContain('earth.view.toProjectedCoordinates(input)');
    expect(example).toContain("earth.elements.add({ geometry: { type: 'polyline', controlPoints: projectedInput } })");
    expect(example).toContain('earth.elements.get(element.id)?.state.geometry');
    expect(example).toContain('earth.view.toGeographicCoordinates(geometry.controlPoints)');
    expect(example).toContain('toFlatCoordinates(geographic.value)');
    expect(example).toContain('radius: 500_000');
    expect(example).toContain('circleGeometry.radius');
    expect(example).toContain('earthRef.value?.destroy()');
  });
});
