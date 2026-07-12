import { codeToHtml } from 'shiki';

const cache = new Map<string, string>();

/**
 * 将源码高亮为同时支持浅色与深色主题的 HTML。
 * 结果带缓存，避免展开/收起时重复渲染。
 */
export async function highlight(code: string, lang = 'vue'): Promise<string> {
  const key = `${lang}::${code}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const html = await codeToHtml(code, { lang, themes: { light: 'github-light', dark: 'github-dark' } });
  cache.set(key, html);
  return html;
}
