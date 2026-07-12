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
    expect(getDocumentTitle('/guide/quick-start')).toBe('安装与引入 | OL-DOC');
    expect(getDocumentTitle('/components/global-event/keyboard')).toBe('全局键盘事件 | OL-DOC');
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
