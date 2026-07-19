import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { extractExampleSnippet } from '../website/src/utils/exampleSource';
import { highlight } from '../website/src/utils/highlight';

describe('website code highlighting', () => {
  it('highlights TypeScript snippets with distinct light and dark token colors', async () => {
    const code = "const element = earth.elements.add({ geometry: { type: 'point' } });";
    const html = await highlight(code, 'typescript');
    const lightColors = new Set([...html.matchAll(/style="color:(#[\dA-F]{6})/giu)].map((match) => match[1]));

    expect(lightColors.size).toBeGreaterThanOrEqual(4);
    expect(html).toContain('--shiki-dark:');
    expect(html).toContain('class="shiki shiki-themes github-light github-dark"');
  });

  it('normalizes the ts alias and reuses an in-flight render', async () => {
    const code = 'const count: number = 1;';
    const typescriptRender = highlight(code, 'typescript');
    const aliasRender = highlight(code, 'ts');

    expect(aliasRender).toBe(typescriptRender);
    expect(await aliasRender).toBe(await typescriptRender);
  });

  it('loads every language used by the documentation site', async () => {
    const examples = [
      { lang: 'vue' as const, code: '<script setup lang="ts">\nconst ready = true;\n</script>' },
      { lang: 'json' as const, code: '{ "ready": true }' },
      { lang: 'bash' as const, code: 'npm install @vrsim/earth-engine-ol' }
    ];

    for (const example of examples) {
      const html = await highlight(example.code, example.lang);
      expect(html, example.lang).toContain('class="shiki shiki-themes github-light github-dark"');
      expect(html, example.lang).toContain('--shiki-dark:');
    }
  });

  it('extracts a named region and rejects missing, unterminated, or empty regions', () => {
    expect(extractExampleSnippet('// #region demo\nconst value = 1;\n// #endregion demo', 'demo')).toBe('const value = 1;');
    expect(() => extractExampleSnippet('const value = 1;', 'demo')).toThrow('缺少 region 起始标记');
    expect(() => extractExampleSnippet('// #region demo\nconst value = 1;', 'demo')).toThrow('缺少 region 结束标记');
    expect(() => extractExampleSnippet('// #region demo\n\n// #endregion demo', 'demo')).toThrow('region 不能为空');
  });

  it('keeps every focused Element snippet backed by a non-empty source region', async () => {
    const examples = [
      ['website/src/examples/elements/ElementOverviewDemo.vue', ['element-quick-start']],
      ['website/src/examples/elements/ElementCreateDemo.vue', ['element-create']],
      ['website/src/examples/elements/ElementQueryDemo.vue', ['element-query']],
      ['website/src/examples/elements/ElementUpdateDemo.vue', ['element-update']],
      ['website/src/examples/elements/ElementCleanupDemo.vue', ['element-cleanup']],
      ['website/src/examples/elements/ShapesDemo.vue', ['shape-gallery']],
      ['website/src/examples/elements/StylesDemo.vue', ['style-preset', 'style-patch']],
      ['website/src/examples/elements/LineworkDemo.vue', ['linework-factory', 'linework-apply']]
    ] as const;

    for (const [path, regions] of examples) {
      const source = await readFile(path, 'utf8');
      for (const region of regions) expect(extractExampleSnippet(source, region), `${path}#${region}`).not.toHaveLength(0);
    }
  });
});
