import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readStyles = () => readFileSync(resolve(process.cwd(), 'website/src/assets/styles/index.scss'), 'utf8');
const readLayout = () => readFileSync(resolve(process.cwd(), 'website/src/layouts/DocsLayout.vue'), 'utf8');

describe('website sidebar hierarchy', () => {
  it('renders the navigation with Element Plus menu components and canonical links', () => {
    const layout = readLayout();

    expect(layout).toContain('<el-menu class="docs-sidebar__menu" :default-active="route.path">');
    expect(layout).toContain('<el-menu-item-group v-for="group in sideGroups"');
    expect(layout).toContain('class="docs-sidebar__menu-item"');
    expect(layout).toContain('<RouterLink class="docs-sidebar__menu-link" :to="item.to" @click.stop>');
    expect(layout).not.toContain('<el-sub-menu');
  });

  it('uses separate parent and child active indicators', () => {
    const layout = readLayout();
    const styles = readStyles();

    expect(layout).toContain("'is-parent-active': route.path !== item.to && isParentActive(item)");
    expect(styles).toContain('.docs-sidebar__menu-item.el-menu-item.is-parent-active');
    expect(styles).toContain('font-weight: 600;');
    expect(styles).toContain('.docs-sidebar__menu-item--child.el-menu-item.is-active');
    expect(styles).toContain('box-shadow: inset 3px 0 0 var(--doc-primary);');
  });

  it('keeps child pages visibly nested below their parent module', () => {
    const layout = readLayout();
    const styles = readStyles();

    expect(layout).toContain('v-for="child in item.children ?? []"');
    expect(styles).toContain('margin: 2px 0 2px 18px;');
    expect(styles).toContain('padding: 6px 10px 6px 22px;');
  });

  it('keeps the Element Plus menu compact and theme-aware', () => {
    const styles = readStyles();

    expect(styles).toContain('--el-menu-item-height: 38px;');
    expect(styles).toContain('--el-menu-hover-bg-color: var(--doc-surface-soft);');
    expect(styles).toMatch(/\.docs-sidebar__menu\.el-menu\s*{[^}]*border-right:\s*0;/s);
  });
});
