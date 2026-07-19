import { createHighlighterCore } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import bash from '@shikijs/langs/bash';
import json from '@shikijs/langs/json';
import typescript from '@shikijs/langs/typescript';
import vue from '@shikijs/langs/vue';
import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';

export type CodeLanguage = 'bash' | 'json' | 'ts' | 'typescript' | 'vue';

const normalizedLanguages = {
  bash: 'bash',
  json: 'json',
  ts: 'typescript',
  typescript: 'typescript',
  vue: 'vue'
} as const satisfies Record<CodeLanguage, 'bash' | 'json' | 'typescript' | 'vue'>;

const highlighter = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  langs: [bash, json, typescript, vue],
  themes: [githubLight, githubDark]
});

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

/** 将源码高亮为同时支持浅色与深色主题的 HTML。 */
export function highlight(code: string, lang: CodeLanguage = 'typescript'): Promise<string> {
  const normalizedLanguage = normalizedLanguages[lang];
  const key = `${normalizedLanguage}::${code}`;
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = pending.get(key);
  if (inFlight !== undefined) return inFlight;

  const rendering = highlighter.then((instance) =>
    instance.codeToHtml(code, {
      lang: normalizedLanguage,
      themes: { light: 'github-light', dark: 'github-dark' }
    })
  );
  pending.set(key, rendering);
  void rendering.then(
    (html) => {
      cache.set(key, html);
      pending.delete(key);
    },
    () => pending.delete(key)
  );
  return rendering;
}
