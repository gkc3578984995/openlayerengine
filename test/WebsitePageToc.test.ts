import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStableHeadingId, normalizeTocLabel } from '../website/src/utils/pageToc';

const readWebsiteSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('website page table of contents', () => {
  it('creates readable, stable and collision-free heading ids', () => {
    const usedIds = new Set(['api-方法']);

    expect(normalizeTocLabel('  Earth   与生命周期 ')).toBe('Earth 与生命周期');
    expect(createStableHeadingId('API 方法', usedIds)).toBe('api-方法-2');
    expect(createStableHeadingId('API 方法', usedIds)).toBe('api-方法-3');
    expect(createStableHeadingId('***', usedIds)).toBe('section');
  });

  it('scans document headings and tracks the active section with IntersectionObserver', () => {
    const anchor = readWebsiteSource('website/src/components/docs/PageAnchor.vue');

    expect(anchor).toContain("querySelectorAll<HTMLHeadingElement>('h2, h3')");
    expect(anchor).toContain("heading.dataset.pageTocGenerated = 'true'");
    expect(anchor).toContain('new IntersectionObserver(() => updateActiveHeading(observedItems)');
    expect(anchor).toContain('root: scrollContainer.value');
    expect(anchor).toContain('new MutationObserver(scheduleScan)');
    expect(anchor).not.toContain('characterData: true');
    expect(anchor).toContain('route.path');
  });

  it('reuses the page hierarchy for affixed desktop and bounded Element Plus mobile navigation', () => {
    const layout = readWebsiteSource('website/src/layouts/DocsLayout.vue');
    const anchor = readWebsiteSource('website/src/components/docs/PageAnchor.vue');
    const styles = readWebsiteSource('website/src/assets/styles/index.scss');

    expect(layout).not.toContain('<PageToc');
    expect(layout).toContain("prefersReducedMotion() ? 'auto' : 'smooth'");
    expect(anchor).toContain('<div class="page-anchor__desktop">');
    expect(anchor).toContain('<el-affix class="page-anchor"');
    expect(anchor).toContain('<el-select');
    expect(anchor).toContain('v-for="item in flatItems"');
    expect(anchor).toContain('@media (max-width: 1180px)');
    expect(anchor).toContain('max-width: 100%;');
    expect(anchor).toContain('router.replace({ path: route.path, query: route.query, hash: `#${id}` })');
    expect(anchor).toContain("reducedMotion.value ? 'auto' : 'smooth'");
    expect(styles).toMatch(/\.doc-page-layout__aside\s*{\s*display: block;[\s\S]*grid-row: 1;/);
  });
});
