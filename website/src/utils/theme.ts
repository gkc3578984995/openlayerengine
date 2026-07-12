export type Theme = 'light' | 'dark';

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ThemeTarget {
  classList: Pick<DOMTokenList, 'toggle'>;
}

export const THEME_STORAGE_KEY = 'ol-doc-theme';

const isTheme = (value: string | null): value is Theme => value === 'light' || value === 'dark';

export const getTheme = (storage: ThemeStorage): Theme => {
  try {
    const savedTheme = storage.getItem(THEME_STORAGE_KEY);
    return isTheme(savedTheme) ? savedTheme : 'light';
  } catch {
    return 'light';
  }
};

export const applyTheme = (theme: Theme, target: ThemeTarget): void => {
  target.classList.toggle('dark', theme === 'dark');
};

export const toggleTheme = (theme: Theme, storage: ThemeStorage, target: ThemeTarget): Theme => {
  const nextTheme: Theme = theme === 'light' ? 'dark' : 'light';

  try {
    storage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // Theme switching still works when browser storage is unavailable.
  }

  applyTheme(nextTheme, target);
  return nextTheme;
};
