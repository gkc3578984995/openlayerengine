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
});
