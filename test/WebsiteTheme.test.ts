import { describe, expect, it } from 'vitest';
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
});
