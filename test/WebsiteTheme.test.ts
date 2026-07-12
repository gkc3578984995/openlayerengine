import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyTheme, getTheme, toggleTheme } from '../website/src/utils/theme';

const createStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values
  };
};

const createTarget = () => {
  const classes = new Set<string>();
  return {
    classList: {
      toggle: (name: string, force?: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
        return Boolean(force);
      }
    },
    classes
  };
};

describe('website theme', () => {
  it('uses light when storage is empty or invalid and restores a saved theme', () => {
    expect(getTheme(createStorage())).toBe('light');
    expect(getTheme(createStorage({ 'ol-doc-theme': 'system' }))).toBe('light');
    expect(getTheme(createStorage({ 'ol-doc-theme': 'dark' }))).toBe('dark');
  });

  it('applies the dark class only for the dark theme', () => {
    const target = createTarget();
    applyTheme('dark', target);
    expect(target.classes.has('dark')).toBe(true);
    applyTheme('light', target);
    expect(target.classes.has('dark')).toBe(false);
  });

  it('persists and applies the inverse theme when toggled', () => {
    const storage = createStorage();
    const target = createTarget();
    expect(toggleTheme('light', storage, target)).toBe('dark');
    expect(storage.values.get('ol-doc-theme')).toBe('dark');
    expect(target.classes.has('dark')).toBe(true);
  });

  it('applies the saved theme before mounting and provides an accessible header switch', () => {
    const main = readFileSync(new URL('../website/src/main.ts', import.meta.url), 'utf8');
    const layout = readFileSync(new URL('../website/src/layouts/DocsLayout.vue', import.meta.url), 'utf8');

    expect(main).toContain("import 'element-plus/theme-chalk/dark/css-vars.css';");
    expect(main).toContain('applyTheme(getTheme(window.localStorage), document.documentElement);');
    expect(main.indexOf('applyTheme(getTheme(window.localStorage), document.documentElement);')).toBeLessThan(main.indexOf('createApp(App)'));
    expect(layout).toContain('class="docs-header__theme"');
    expect(layout).toContain('@click="switchTheme"');
    expect(layout).toContain('aria-label');
  });

  it('defines dark site tokens and requires future documentation UI to support both themes', () => {
    const styles = readFileSync(new URL('../website/src/assets/styles/index.scss', import.meta.url), 'utf8');
    const rules = readFileSync(new URL('../website/AGENTS.md', import.meta.url), 'utf8');

    expect(styles).toContain('html.dark {');
    expect(styles).toContain('--doc-bg: #111827;');
    expect(styles).toContain('--doc-surface: #1f2937;');
    expect(styles).toContain('background: var(--doc-page-background);');
    expect(styles).toContain('.docs-header__theme {');
    expect(rules).toContain('主题适配');
    expect(rules).toContain('浅色与深色主题');
    expect(rules).toContain('语义化主题变量');
  });

  it('uses matching Shiki token colors in light and dark themes', () => {
    const highlight = readFileSync(new URL('../website/src/utils/highlight.ts', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('../website/src/assets/styles/index.scss', import.meta.url), 'utf8');

    expect(highlight).toContain("themes: { light: 'github-light', dark: 'github-dark' }");
    expect(styles).toMatch(/html\.dark \.code-block-highlight \.shiki span\s*\{[^}]*color: var\(--shiki-dark\) !important;/s);
  });
});
