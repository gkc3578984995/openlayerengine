import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readHome = () => readFileSync(resolve(process.cwd(), 'website/src/views/HomeView.vue'), 'utf8');
const readStyles = () => readFileSync(resolve(process.cwd(), 'website/src/assets/styles/index.scss'), 'utf8');

describe('website homepage content', () => {
  it('introduces the library and links every canonical starting point', () => {
    const home = readHome();

    expect(home).toContain('@vrsim/');
    expect(home).toContain('earth-engine-ol');
    expect(home).toContain('OpenLayers + TypeScript');
    for (const route of [
      '/guide/quick-start',
      '/guide/earth-create',
      '/components/core/earth',
      '/components/core/layers',
      '/components/elements/overview',
      '/components/interactions/draw'
    ]) {
      expect(home).toContain(route);
    }
    expect(home).toContain("{ label: '创建地图', to: '/guide/earth-create', primary: false }");
    expect(home).not.toContain('/components/point-layer');
  });

  it('keeps both explicit package-title segments intact at responsive widths', () => {
    const home = readHome();
    const styles = readStyles();

    expect(home).toContain('<span class="home-hero__title-scope">@vrsim/</span>');
    expect(home).toContain('<span class="home-hero__title-name">earth-engine-ol</span>');
    expect(styles).toMatch(/\.home-hero__title-scope,\s*\.home-hero__title-name\s*\{[^}]*display: block;[^}]*white-space: nowrap;/s);
    expect(styles).toMatch(/\.home-hero__title\s*\{[^}]*font-size: clamp\(/s);
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
    for (const title of ['创建 Earth', '组织图层', '添加 Element', '接入地图交互']) expect(home).toContain(title);
  });

  it('removes the generic homepage content and hard-coded visual data', () => {
    const home = readHome();

    for (const obsolete of ['home-sponsors', '赞助商', '成为赞助商', '设计资源', "to: '/'", 'linear-gradient(']) {
      expect(home).not.toContain(obsolete);
    }
  });

  it('provides a theme-aware and responsive homepage visual system', () => {
    const styles = readStyles();
    const rootTokens = styles.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const darkTokens = styles.match(/html\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(rootTokens).toContain('--home-workbench-surface:');
    expect(darkTokens).toContain('--home-workbench-surface:');
    expect(rootTokens).toContain('--home-focus-ring: #1d4ed8;');
    expect(darkTokens).toContain('--home-focus-ring: #a0cfff;');

    for (const selector of ['.home-hero__inner', '.home-workbench', '.home-capabilities__grid', '.home-modules__grid', '.home-module-card']) {
      expect(styles).toContain(selector);
    }

    expect(styles).toMatch(/@media \(max-width: 1180px\)\s*\{[\s\S]*?\.home(?:-hero__inner|-capabilities|-modules)/);
    expect(styles).toMatch(/@media \(max-width: 860px\)\s*\{[\s\S]*?\.home-hero__inner/);
    expect(styles).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.home-hero__actions/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.home-/);
    expect(styles).toMatch(
      /\.home-hero__action:focus-visible,\s*\.home-module-card:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--home-focus-ring\);[^}]*outline-offset:\s*3px;/s
    );
    expect(styles).not.toMatch(/\.home-module-card:focus-visible\s*\{[^}]*outline:\s*none/);
    expect(styles).not.toContain('.home-sponsors');
  });
});
