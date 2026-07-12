import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTopNavIndex, topNavItems } from '../website/src/config/navigation';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('website top menu', () => {
  it('maps every component page to one stable top-level menu index', () => {
    expect(getTopNavIndex('/')).toBe('/');
    expect(getTopNavIndex('/guide/quick-start')).toBe('/');
    expect(getTopNavIndex('/components')).toBe('/components');
    expect(getTopNavIndex('/components/point-layer')).toBe('/components');
    expect(getTopNavIndex('/components/context-menu/cleanup')).toBe('/components');
    expect(getTopNavIndex(topNavItems[1].to)).toBe('/components');
  });

  it('uses the Element Plus menu and routes selections to existing destinations', () => {
    const layout = readSource('website/src/layouts/DocsLayout.vue');

    expect(layout).toContain('<el-menu');
    expect(layout).toContain('mode="horizontal"');
    expect(layout).toContain(':default-active="activeTopMenu"');
    expect(layout).toContain('@select="onTopMenuSelect"');
    expect(layout).toContain('<el-menu-item');
    expect(layout).toContain('void router.push(target.to);');
    expect(layout).not.toContain('class="docs-header__nav-item"');
  });

  it('styles the Element menu with semantic light and dark theme tokens', () => {
    const styles = readSource('website/src/assets/styles/index.scss');

    expect(styles).toContain('.docs-header__nav.el-menu--horizontal');
    expect(styles).toContain('--el-menu-bg-color: transparent;');
    expect(styles).toContain('--el-menu-text-color: var(--doc-muted);');
    expect(styles).toContain('--el-menu-active-color: var(--doc-primary-deep);');
    expect(styles).toContain('--el-menu-hover-bg-color: var(--doc-surface-soft);');
    expect(styles).not.toContain('.docs-header__nav-item');
  });

  it('uses a deliberate two-row header layout on compact screens', () => {
    const styles = readSource('website/src/assets/styles/index.scss');
    const compactStyles = styles.match(/@media \(max-width: 560px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(compactStyles).toMatch(/\.docs-header__inner\s*\{[^}]*display:\s*grid/);
    expect(compactStyles).toMatch(/\.docs-header__spacer\s*\{[^}]*display:\s*none/);
    expect(compactStyles).toMatch(/\.docs-header__nav\.el-menu--horizontal\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*grid-row:\s*2/);
    expect(compactStyles).toMatch(/\.docs-header__theme\s*\{[^}]*grid-row:\s*1/);
    expect(compactStyles).toMatch(/\.docs-header__gh\s*\{[^}]*grid-row:\s*1/);
  });
});
