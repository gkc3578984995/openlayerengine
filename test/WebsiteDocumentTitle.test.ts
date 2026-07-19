import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDocumentTitle } from '../website/src/utils/documentTitle';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('website document title', () => {
  it('uses only the site name on the documentation home page', () => {
    expect(getDocumentTitle('/')).toBe('OL-DOC');
  });

  it('uses the sidebar label and site name on documentation pages', () => {
    expect(getDocumentTitle('/guide/quick-start')).toBe('安装 | OL-DOC');
    expect(getDocumentTitle('/guide/earth-create')).toBe('创建第一张地图 | OL-DOC');
    expect(getDocumentTitle('/guide/migration-v2')).toBe('1.x → 2.0 迁移 | OL-DOC');
    expect(getDocumentTitle('/components/core/earth')).toBe('Earth 与生命周期 | OL-DOC');
    expect(getDocumentTitle('/components/reference/types')).toBe('OL-DOC');
    expect(getDocumentTitle('/components/interactions/draw')).toBe('绘制（Draw） | OL-DOC');
    expect(getDocumentTitle('/components/presentation/animations')).toBe('动画（Animations） | OL-DOC');
    expect(getDocumentTitle('/components/services/descriptor')).toBe('Descriptor | OL-DOC');
    expect(getDocumentTitle('/components/reference/errors')).toBe('错误类型 | OL-DOC');
    expect(getDocumentTitle('/api/methods')).toBe('方法 | OL-DOC');
    expect(getDocumentTitle('/api/types')).toBe('类型 | OL-DOC');
  });

  it('falls back to the site name for an unknown path', () => {
    expect(getDocumentTitle('/missing')).toBe('OL-DOC');
  });

  it('sets a correct static title and updates it after navigation', () => {
    const html = readSource('website/index.html');
    const router = readSource('website/src/router/index.ts');

    expect(html).toContain('<title>OL-DOC</title>');
    expect(router).toContain("import { getDocumentTitle } from '../utils/documentTitle';");
    expect(router).toContain('router.afterEach((to) => {');
    expect(router).toContain('document.title = getDocumentTitle(to.path);');
  });
});
