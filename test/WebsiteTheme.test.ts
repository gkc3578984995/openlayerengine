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
});
