import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('website API presentation', () => {
  it('gives API columns semantic property and method presentation classes', async () => {
    const apiTable = await readFile('website/src/components/docs/ApiTable.vue', 'utf8');

    expect(apiTable).toContain("presentation?: 'property' | 'method';");
    expect(apiTable).toContain(':class="col.presentation ? `api-table__${col.presentation}` : undefined"');
  });

  it('marks all API name columns and constructor sections with semantic presentation', async () => {
    const [earthCreate, globalMethods, pointLayer] = await Promise.all([
      readFile('website/src/views/EarthCreateView.vue', 'utf8'),
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/src/views/PointLayerView.vue', 'utf8')
    ]);

    expect(earthCreate).toContain("{ prop: 'name', label: '属性名', width: 160, presentation: 'property' }");
    expect(earthCreate).toContain("{ prop: 'name', label: '方法名', width: 260, presentation: 'method' }");
    expect(globalMethods).toContain("{ prop: 'name', label: '方法名', width: 280, presentation: 'method' }");
    expect(pointLayer).toContain("{ prop: 'name', label: '属性名', width: 140, presentation: 'property' }");
    expect(pointLayer).toContain("{ prop: 'name', label: '方法名', width: 240, presentation: 'method' }");
    expect(pointLayer).toContain("{ prop: 'name', label: '属性', width: 160, presentation: 'property' }");

    for (const view of [earthCreate, pointLayer]) {
      expect(view).toContain('class="api-constructor"');
      expect(view).toContain('class="api-constructor__signature"');
    }
  });
});
