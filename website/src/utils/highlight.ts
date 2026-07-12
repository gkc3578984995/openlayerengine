import { codeToHtml } from 'shiki';

const cache = new Map<string, string>();

/**
 * 将源码高亮为 HTML（使用 github-light 浅色主题，贴近 Element Plus 文档风格）。
 * 结果带缓存，避免展开/收起时重复渲染。
 */
export async function highlight(code: string, lang = 'vue'): Promise<string> {
  const key = `${lang}::${code}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const html = await codeToHtml(code, { lang, theme: 'github-light' });
  cache.set(key, html);
  return html;
}
