import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('元素扁平坐标文档', () => {
  it('在迁移说明中明确写入、读取和投影边界', async () => {
    const migration = await readFile(resolve('MIGRATION.txt'), 'utf8');

    expect(migration).toContain('扁平数组会按 `XY` 两两分组');
    expect(migration).toContain('只简化数组结构，不会转换坐标投影');
    expect(migration).toContain('`circle.center` 接受 OpenLayers 返回的普通 `number[]`');
    expect(migration).toContain('center: fromLonLat([120, 0])');
    expect(migration).toContain('toFlatCoordinates()');
  });

  it('网站使用同一个 Vue 文件提供预览和源代码', async () => {
    const page = await readFile(resolve('website/src/views/MigrationV2View.vue'), 'utf8');
    const example = await readFile(resolve('website/src/examples/ElementCoordinateStorageDemo.vue'), 'utf8');

    expect(page).toContain("import ElementCoordinateStorageDemo from '../examples/ElementCoordinateStorageDemo.vue';");
    expect(page).toContain("import elementCoordinateStorageSource from '../examples/ElementCoordinateStorageDemo.vue?raw';");
    expect(page).toContain('id="example-flat-coordinate-storage"');
    expect(page).toContain('id="api-to-flat-coordinates"');
    expect(page).toContain('可以直接传入 <code>fromLonLat([120, 0])</code>');
    expect(example).toContain('Earth, toFlatCoordinates, type ShapeInput, type ShapeState');
    expect(example).toContain('earth.elements.add({ geometry: input })');
    expect(example).toContain('earth.elements.get(element.id)?.state.geometry');
    expect(example).toContain('toFlatCoordinates(geometry.controlPoints)');
    expect(example).toContain('earthRef.value?.destroy()');
  });
});
