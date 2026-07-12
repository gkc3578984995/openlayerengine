import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readWebsiteSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('website scrollbars', () => {
  it('keeps the sidebar outside the document content scrollbar', () => {
    const layout = readWebsiteSource('website/src/layouts/DocsLayout.vue');
    const mainStart = layout.indexOf('<main class="docs-main"');
    const mainEnd = layout.indexOf('</main>', mainStart);
    const mainScrollbar = layout.indexOf('<el-scrollbar ref="mainScrollbar"', mainStart);

    expect(layout).toContain('<el-scrollbar class="docs-sidebar__scrollbar">');
    expect(mainStart).toBeGreaterThan(-1);
    expect(mainScrollbar).toBeGreaterThan(mainStart);
    expect(mainScrollbar).toBeLessThan(mainEnd);
    expect(layout).not.toContain('<el-scrollbar ref="mainScrollbar" class="docs-scrollbar" @scroll="onMainScroll">\n      <div class="docs-body"');
  });

  it('routes scroll events and back-to-top actions through the main scrollbar', () => {
    const layout = readWebsiteSource('website/src/layouts/DocsLayout.vue');
    const backToTop = readWebsiteSource('website/src/components/BackToTop.vue');
    const router = readWebsiteSource('website/src/router/index.ts');

    expect(layout).toContain('<BackToTop :scroll-container="mainScrollContainer"');
    expect(backToTop).not.toContain('window.addEventListener');
    expect(backToTop).toContain("props.scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });");
    expect(router).toContain('scrollBehavior() {');
    expect(router).toContain('return false;');
  });

  it('keeps page anchors synchronized with the main scrollbar and uses compact nesting', () => {
    const layout = readWebsiteSource('website/src/layouts/DocsLayout.vue');
    const pageAnchor = readWebsiteSource('website/src/components/docs/PageAnchor.vue');
    const styles = readWebsiteSource('website/src/assets/styles/index.scss');

    expect(layout).toContain("provide('docsMainScrollContainer', mainScrollContainer);");
    expect(pageAnchor).toContain("inject<Readonly<Ref<HTMLElement | null>>>('docsMainScrollContainer'");
    expect(pageAnchor).toContain(':container="scrollContainer"');
    expect(styles).toMatch(/\.page-anchor__child\.el-anchor__item\s*{\s*padding-left: 16px;/);
    expect(styles).toMatch(/\.page-anchor__grandchild\.el-anchor__item\s*{\s*padding-left: 28px;/);
  });

  it('uses an Element Plus scrollbar for example source code', () => {
    const exampleBlock = readWebsiteSource('website/src/components/docs/ExampleBlock.vue');
    const styles = readWebsiteSource('website/src/assets/styles/index.scss');

    expect(exampleBlock).toContain('<el-scrollbar class="example-block__code-scrollbar" max-height="520px">');
    expect(styles).not.toContain('.code-block-highlight {\n  overflow: auto;');
    expect(styles).not.toContain('  overflow: auto;\n  background: #f6f8fa !important;');
  });
});
