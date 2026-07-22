import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('website quick-start shared UI', () => {
  it('renders every API reference kind as a keyboard-focusable internal link with a visible label', async () => {
    const component = await readFile('website/src/components/docs/ApiReference.vue', 'utf8');

    expect(component).toContain("type ApiReferenceKind = 'method' | 'property' | 'type' | 'constructor';");
    expect(component).toContain('to: string;');
    expect(component).toContain('<a :href="props.to" class="api-reference"');
    expect(component).toContain('<span class="api-reference__kind">{{ kindLabels[props.kind] }}</span>');
    expect(component).toContain('<code class="api-reference__name"><slot /></code>');
    for (const label of ['方法', '属性', '类型', '构造']) expect(component).toContain(label);
  });

  it('adds type presentation and stable row self-links without changing legacy table cells', async () => {
    const component = await readFile('website/src/components/docs/ApiTable.vue', 'utf8');

    expect(component).toContain("type ApiColumnPresentation = NonNullable<LegacyApiColumnPresentation['presentation']> | 'type';");
    expect(component).toContain(':id="columnIndex === 0 ? row.anchor : undefined"');
    expect(component).toContain('v-if="columnIndex === 0 && row.anchor"');
    expect(component).toContain(':href="`#${row.anchor}`"');
    expect(component).toContain(':aria-label="`${row.name} ${col.label}的直接链接`"');
    expect(component).toContain('v-html="row[col.prop] || \'—\'"');
    expect(component).toContain('v-html="formatCellValue(col, row[col.prop])"');
  });

  it('uses Element Plus controls and accessible disclosure semantics for example source', async () => {
    const component = await readFile('website/src/components/docs/ExampleBlock.vue', 'utf8');

    expect(component).toContain('<slot name="description">');
    expect(component).toContain('example-block__toggle-button');
    expect(component).toContain(':aria-expanded="expanded"');
    expect(component).toContain(':aria-controls="sourcePanelId"');
    expect(component).toContain(':id="sourcePanelId"');
    expect(component).toContain('role="region"');
    expect(component).toContain("{{ expanded ? '收起示例代码' : '展开示例代码' }}");
    expect(component).toContain('<span aria-live="polite">{{ copyButtonLabel }}</span>');
    expect(component).not.toContain('ElMessage');
    expect(component).not.toContain('<div class="example-block__toggle" @click="toggle">');
  });

  it('offers opt-in reset and focus actions without changing existing ExampleBlock calls', async () => {
    const component = await readFile('website/src/components/docs/ExampleBlock.vue', 'utf8');

    expect(component).toContain('showReset?: boolean;');
    expect(component).toContain('showFocus?: boolean;');
    expect(component).toContain("{ sourceLang: 'vue', snippetLang: 'typescript', showReset: false, showFocus: false }");
    expect(component).toContain('reset: [];');
    expect(component).toContain('focus: [];');
    expect(component).toContain('v-if="hasPreview && (showReset || showFocus)"');
    expect(component).toContain('@click="emit(\'reset\')"');
    expect(component).toContain('@click="emit(\'focus\')"');
    expect(component).toContain('重置示例');
    expect(component).toContain('定位示例');
  });

  it('separates focused snippets from complete runnable example files without changing the disclosure contract', async () => {
    const component = await readFile('website/src/components/docs/ExampleBlock.vue', 'utf8');

    expect(component).toContain('snippet?: string;');
    expect(component).toContain('sourceLang?: CodeLanguage;');
    expect(component).toContain('snippetLang?: CodeLanguage;');
    expect(component).toContain("{ sourceLang: 'vue', snippetLang: 'typescript', showReset: false, showFocus: false }");
    expect(component).toContain("const sourceMode = ref<'snippet' | 'source'>(props.snippet === undefined ? 'source' : 'snippet');");
    expect(component).toContain("{ label: '核心代码', value: 'snippet' }");
    expect(component).toContain("{ label: '完整文件', value: 'source' }");
    expect(component).toContain('const displayedLanguage = computed');
    expect(component).toContain('{{ displayedLanguageLabel }}');
    expect(component).toContain('<el-segmented');
    expect(component).toContain('v-if="hasSnippet"');
    expect(component).toContain(':code="displayedSource"');
    expect(component).toContain(':lang="displayedLanguage"');
    expect(component).toContain('<CodeBlock v-if="expanded"');
    expect(component).toContain('@click.stop="copy(displayedSource)"');
    expect(component).toContain('@click.stop="copy(displayedSource)"');
    expect(component).toContain("return '复制代码';");
    expect(component).toContain(':aria-expanded="expanded"');
    expect(component).toContain(':aria-controls="sourcePanelId"');
  });

  it('keeps the example toolbar keyboard-visible and wrapped on narrow screens', async () => {
    const component = await readFile('website/src/components/docs/ExampleBlock.vue', 'utf8');

    expect(component).toContain('class="example-block__toolbar-section example-block__toolbar-section--code"');
    expect(component).toContain('.example-block__toolbar-button.el-button:focus-visible {');
    expect(component).toMatch(/\.example-block__toggle\s*\{[^}]*flex-wrap: wrap;/s);
    expect(component).toMatch(/@media \(max-width: 560px\)[\s\S]*\.example-block__toolbar-section\s*\{[^}]*width: 100%;/s);
    expect(component).toMatch(/\.example-block__toolbar-button\.el-button\s*\{[^}]*flex: 1 1 auto;/s);
  });

  it('loads highlighting only after source expansion and preserves readable code when rendering fails', async () => {
    const [exampleBlock, codeBlock, highlighter] = await Promise.all([
      readFile('website/src/components/docs/ExampleBlock.vue', 'utf8'),
      readFile('website/src/components/docs/CodeBlock.vue', 'utf8'),
      readFile('website/src/utils/highlight.ts', 'utf8')
    ]);

    expect(exampleBlock).toContain('<CodeBlock v-if="expanded"');
    expect(codeBlock).toContain("await import('../../utils/highlight')");
    expect(codeBlock).toContain('const version = ++renderVersion;');
    expect(codeBlock).toContain('if (version !== renderVersion) return;');
    expect(codeBlock).toContain('正在加载代码高亮');
    expect(codeBlock).toContain('代码高亮加载失败，已显示纯文本');
    expect(codeBlock).toContain('<pre class="code-block-highlight__fallback"><code>{{ code }}</code></pre>');
    expect(highlighter).toContain('const pending = new Map<string, Promise<string>>();');
    expect(highlighter).not.toContain("from 'shiki';");
  });

  it('distinguishes API kinds without color alone and covers focus, dark-theme variables, and narrow screens', async () => {
    const [styles, rules] = await Promise.all([readFile('website/src/assets/styles/index.scss', 'utf8'), readFile('website/AGENTS.md', 'utf8')]);

    expect(styles).toContain('.api-reference__kind {');
    expect(styles).toContain("content: 'P';");
    expect(styles).toContain("content: 'T';");
    expect(styles).toContain("content: 'new';");
    expect(styles).toContain('.api-reference:focus-visible {');
    expect(styles).toContain('.api-table__self-link.el-link:focus-visible {');
    expect(styles).toMatch(/\.api-reference\s*\{[^}]*var\(--doc-surface-soft\)/s);
    expect(styles).toMatch(/@media \(max-width: 560px\)\s*\{\s*\.api-reference/s);
    expect(rules).toContain('组件会展示可见的中文类别徽标，不能只依赖颜色区分语义');
    expect(rules).toContain('展开源码必须保留 `aria-expanded`、`aria-controls` 与可见按钮文案');
  });
});
