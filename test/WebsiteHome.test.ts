import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readHome = () => readFileSync(resolve(process.cwd(), 'website/src/views/HomeView.vue'), 'utf8');
const readHomeStyles = () => readFileSync(resolve(process.cwd(), 'website/src/assets/styles/index.scss'), 'utf8');

describe('website homepage content', () => {
  it('introduces the library and links every canonical starting point', () => {
    const home = readHome();

    expect(home).toContain('@vrsim/earth-engine-ol');
    expect(home).toContain('OpenLayers + TypeScript');
    for (const route of ['/guide/quick-start', '/guide/earth-create', '/components/point-layer', '/components/measure', '/components/dynamic-draw']) {
      expect(home).toContain(route);
    }
  });

  it('provides a decorative map workbench beside the hero content', () => {
    const home = readHome();

    expect(home).toContain('class="home-hero__copy"');
    expect(home).toContain('class="home-workbench" aria-hidden="true"');
    expect(home).toContain('<svg');
    expect(home).toMatch(/interface WorkbenchLayer\s*\{/);
    expect(home).toMatch(/const workbenchLayers: WorkbenchLayer\[\] = \[/);
    expect(home).toContain('v-for="layer in workbenchLayers"');
    for (const concept of [
      'home-workbench__map',
      'home-workbench__route',
      'home-workbench__water',
      'home-workbench__area',
      'home-workbench__marker',
      'home-workbench__layers',
      'home-workbench__zoom',
      'home-workbench__coordinates'
    ]) {
      expect(home).toContain(concept);
    }
  });

  it('renders typed capability highlights and core module cards', () => {
    const home = readHome();

    expect(home).toMatch(/interface CapabilityHighlight\s*\{/);
    expect(home).toMatch(/const capabilityHighlights: CapabilityHighlight\[\] = \[/);
    expect(home).toContain('v-for="capability in capabilityHighlights"');
    for (const title of ['类型安全', '模块化能力', '可运行示例']) expect(home).toContain(title);

    expect(home).toMatch(/interface CoreModule\s*\{/);
    expect(home).toMatch(/const coreModules: CoreModule\[\] = \[/);
    expect(home).toContain('v-for="module in coreModules"');
    for (const title of ['Earth 创建', 'PointLayer', 'Measure', 'DynamicDraw']) expect(home).toContain(title);
  });

  it('removes the generic homepage content and hard-coded visual data', () => {
    const home = readHome();

    for (const obsolete of ['home-sponsors', '赞助商', '成为赞助商', '设计资源', "to: '/'", 'linear-gradient(']) {
      expect(home).not.toContain(obsolete);
    }
  });

  it('provides a theme-aware and responsive homepage visual system', () => {
    const styles = readHomeStyles();
    const rootTokens = styles.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const darkTokens = styles.match(/html\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(rootTokens).toContain('--home-workbench-surface:');
    expect(darkTokens).toContain('--home-workbench-surface:');

    for (const selector of ['.home-hero__inner', '.home-workbench', '.home-capabilities__grid', '.home-modules__grid', '.home-module-card']) {
      expect(styles).toContain(selector);
    }

    expect(styles).toMatch(/@media \(max-width: 860px\)\s*\{[\s\S]*?\.home-hero__inner/);
    expect(styles).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.home-hero__actions/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.home-/);
    expect(styles).not.toMatch(/\.home-module-card:focus-visible\s*\{[^}]*outline:\s*none/);
    expect(styles).not.toContain('.home-sponsors');
  });
});
