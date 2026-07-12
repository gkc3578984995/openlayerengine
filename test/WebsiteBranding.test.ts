import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('website branding', () => {
  it('injects the root package version into the OL-DOC header badge', () => {
    const rootPackage = JSON.parse(readSource('package.json')) as { version: string };
    const viteConfig = readSource('website/vite.config.ts');
    const layout = readSource('website/src/layouts/DocsLayout.vue');
    const styles = readSource('website/src/assets/styles/index.scss');

    expect(viteConfig).toContain("readFileSync(resolve(__dirname, '../package.json'), 'utf8')");
    expect(viteConfig).toContain("'__OL_DOC_VERSION__': JSON.stringify(rootPackage.version)");
    expect(layout).toContain('const docVersion = __OL_DOC_VERSION__;');
    expect(layout).toContain('<span class="docs-header__logo-text">OL-DOC</span>');
    expect(layout).toContain('<span class="docs-header__version">v{{ docVersion }}</span>');
    expect(styles).toContain('.docs-header__version {');
    expect(styles).toMatch(/\.docs-header__version\s*{[^}]*background: var\(--doc-surface-soft\);/s);
    expect(rootPackage.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
