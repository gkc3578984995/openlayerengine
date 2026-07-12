# API Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply one visual hierarchy to every documentation API table: prominent constructors, light-gray properties, and dark-gray methods.

**Architecture:** `ApiTable.vue` gains a semantic presentation field on its column contract and renders that value as a stable CSS class. Documentation views label their API name columns by role, while shared Sass owns the treatment. A static Vitest guard keeps component, views, styles, and contributor rules in sync.

**Tech Stack:** Vue 3, TypeScript, Sass, Element Plus, Vitest, Vite.

## Global Constraints

- The change applies to every `ApiTable` consumer: `EarthCreateView.vue`, `GlobalMethodsView.vue`, and `PointLayerView.vue`.
- API-table methods must render dark gray even when cell content contains a functional `code-fn` link.
- Blue `code-fn` styling remains for inline prose and example references outside API tables.
- Every `api-constructor` section uses the shared constructor presentation.
- `website/AGENTS.md` records the API-table presentation rules.
- Do not modify public Earth APIs or generated API content.

---

## File Structure

- Create: `test/WebsiteApiPresentation.test.ts` — static regression coverage for the shared presentation contract.
- Modify: `website/src/components/docs/ApiTable.vue` — add semantic property/method role support.
- Modify: `website/src/views/EarthCreateView.vue` — mark property/method columns and present `Earth` construction.
- Modify: `website/src/views/GlobalMethodsView.vue` — mark method-name columns.
- Modify: `website/src/views/PointLayerView.vue` — mark property/method columns and present `PointLayer` construction.
- Modify: `website/src/assets/styles/index.scss` — shared constructor, property, and method styling.
- Modify: `website/AGENTS.md` — future-maintenance rule.

### Task 1: Add a semantic API-table column contract

**Files:**
- Create: `test/WebsiteApiPresentation.test.ts`
- Modify: `website/src/components/docs/ApiTable.vue`

**Interfaces:**
- Produces `ApiColumn.presentation?: 'property' | 'method'`.
- Produces `api-table__property` or `api-table__method` on non-monospace cells with a presentation role.

- [ ] **Step 1: Write the failing test**

Create `test/WebsiteApiPresentation.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('website API presentation', () => {
  it('gives API columns semantic property and method presentation classes', async () => {
    const apiTable = await readFile('website/src/components/docs/ApiTable.vue', 'utf8');

    expect(apiTable).toContain("presentation?: 'property' | 'method';");
    expect(apiTable).toContain(':class="col.presentation ? `api-table__${col.presentation}` : undefined"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/WebsiteApiPresentation.test.ts`

Expected: FAIL because `ApiColumn` has no `presentation` field and no cell presentation class.

- [ ] **Step 3: Implement the minimal component change**

Replace `website/src/components/docs/ApiTable.vue` with:

```vue
<script setup lang="ts">
interface ApiColumn {
  prop: string;
  label: string;
  width?: string | number;
  monospace?: boolean;
  presentation?: 'property' | 'method';
}

defineProps<{
  columns: ApiColumn[];
  rows: Array<Record<string, string>>;
}>();
</script>

<template>
  <el-table :data="rows" class="api-table" stripe :border="false">
    <el-table-column v-for="col in columns" :key="col.prop" :prop="col.prop" :label="col.label" :min-width="col.width ?? 160">
      <template #default="{ row }">
        <code v-if="col.monospace" class="api-table__code" v-html="row[col.prop]"></code>
        <span v-else :class="col.presentation ? `api-table__${col.presentation}` : undefined" v-html="row[col.prop]"></span>
      </template>
    </el-table-column>
  </el-table>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/WebsiteApiPresentation.test.ts`

Expected: PASS with one test.

- [ ] **Step 5: Commit the component contract**

```bash
git add test/WebsiteApiPresentation.test.ts website/src/components/docs/ApiTable.vue
git commit -m "refactor(docs): add API table presentation roles"
```

### Task 2: Mark every API table and constructor section

**Files:**
- Modify: `test/WebsiteApiPresentation.test.ts`
- Modify: `website/src/views/EarthCreateView.vue`
- Modify: `website/src/views/GlobalMethodsView.vue`
- Modify: `website/src/views/PointLayerView.vue`

**Interfaces:**
- Consumes `ApiColumn.presentation`.
- Produces property and method column roles plus `.api-constructor` / `.api-constructor__signature` markup on both constructor sections.

- [ ] **Step 1: Extend the failing test with view requirements**

Append this test inside the existing `describe` block:

```ts
  it('marks all API name columns and constructor sections with semantic presentation', async () => {
    const [earthCreate, globalMethods, pointLayer] = await Promise.all([
      readFile('website/src/views/EarthCreateView.vue', 'utf8'),
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/src/views/PointLayerView.vue', 'utf8')
    ]);

    expect(earthCreate).toContain("{ prop: 'name', label: '属性名', width: 160, presentation: 'property' }");
    expect(earthCreate).toContain("{ prop: 'name', label: '方法名', width: 260, presentation: 'method' }");
    expect(globalMethods).toContain("{ prop: 'name', label: '方法名', width: 280, presentation: 'method' }");
    expect(pointLayer).toContain("{ prop: 'name', label: '属性名', width: 140, presentation: 'property' }");
    expect(pointLayer).toContain("{ prop: 'name', label: '方法名', width: 240, presentation: 'method' }");
    expect(pointLayer).toContain("{ prop: 'name', label: '属性', width: 160, presentation: 'property' }");

    for (const view of [earthCreate, pointLayer]) {
      expect(view).toContain('class="api-constructor"');
      expect(view).toContain('class="api-constructor__signature"');
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/WebsiteApiPresentation.test.ts`

Expected: FAIL because no view supplies roles and neither constructor uses the shared markup.

- [ ] **Step 3: Update the Earth page**

In `website/src/views/EarthCreateView.vue`, add `presentation?: 'property' | 'method';` to its local `ApiColumn` interface. Then replace the first `attrCols` and `methodCols` entries with:

```ts
{ prop: 'name', label: '属性名', width: 160, presentation: 'property' }
{ prop: 'name', label: '方法名', width: 260, presentation: 'method' }
```

Replace its constructor heading and signature with:

```vue
<div class="api-constructor">
  <h3 id="api-constructor" class="doc-h3">构造参数</h3>
  <p class="api-constructor__signature"><code>new Earth(viewOptions?, options?)</code></p>
</div>
```

- [ ] **Step 4: Update the global-methods page**

In `website/src/views/GlobalMethodsView.vue`, add `presentation?: 'property' | 'method';` to its local `ApiColumn` interface. Then replace the first `methodCols` entry with:

```ts
{ prop: 'name', label: '方法名', width: 280, presentation: 'method' }
```

- [ ] **Step 5: Update the PointLayer page**

In `website/src/views/PointLayerView.vue`, add `presentation?: 'property' | 'method';` to its local `ApiColumn` interface. Then replace the first `attrCols`, `methodCols`, and `typeCols` entries with:

```ts
{ prop: 'name', label: '属性名', width: 140, presentation: 'property' }
{ prop: 'name', label: '方法名', width: 240, presentation: 'method' }
{ prop: 'name', label: '属性', width: 160, presentation: 'property' }
```

Replace its constructor heading and signature with:

```vue
<div class="api-constructor">
  <h3 id="api-constructor" class="doc-h3">构造参数</h3>
  <p class="api-constructor__signature"><code>new PointLayer(earth?, options?)</code></p>
</div>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- test/WebsiteApiPresentation.test.ts`

Expected: PASS with two tests.

- [ ] **Step 7: Commit the view markup**

```bash
git add test/WebsiteApiPresentation.test.ts website/src/views/EarthCreateView.vue website/src/views/GlobalMethodsView.vue website/src/views/PointLayerView.vue
git commit -m "docs: classify API constructors properties and methods"
```

### Task 3: Define the hierarchy styles and maintenance rule

**Files:**
- Modify: `test/WebsiteApiPresentation.test.ts`
- Modify: `website/src/assets/styles/index.scss`
- Modify: `website/AGENTS.md`

**Interfaces:**
- Consumes `.api-constructor`, `.api-constructor__signature`, `.api-table__property`, and `.api-table__method`.
- Produces a prominent constructor, light-gray property names, and dark-gray method names that override nested `code-fn` links.

- [ ] **Step 1: Extend the failing test with styles and rules**

Append this test inside the existing `describe` block:

```ts
  it('defines the shared visual hierarchy and documents it for contributors', async () => {
    const [styles, rules] = await Promise.all([
      readFile('website/src/assets/styles/index.scss', 'utf8'),
      readFile('website/AGENTS.md', 'utf8')
    ]);

    expect(styles).toContain('.api-constructor {');
    expect(styles).toContain('.api-constructor__signature code {');
    expect(styles).toContain('.api-table__property {');
    expect(styles).toContain('.api-table__method {');
    expect(styles).toContain('.api-table__method .code-fn {');
    expect(styles).not.toContain('.api-table code.code-fn {');
    expect(rules).toContain('API 表格中的构造器、属性名和方法名使用固定视觉层级');
    expect(rules).toContain('api-table__property');
    expect(rules).toContain('api-table__method');
    expect(rules).toContain('api-constructor__signature');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/WebsiteApiPresentation.test.ts`

Expected: FAIL because no shared styles or contributor rule exist and `.api-table code.code-fn` remains.

- [ ] **Step 3: Replace the old blue API-table style**

In `website/src/assets/styles/index.scss`, remove the complete `.api-table code.code-fn`, `.api-table code.code-fn a`, and `.api-table code.code-fn a:hover` blocks. Add these rules after `.code-fn-inline`:

```scss
.api-constructor {
  margin: 28px 0 18px;
  padding: 16px 18px;
  border: 1px solid var(--el-border-color, var(--doc-border));
  border-left: 4px solid var(--doc-primary-deep);
  border-radius: 8px;
  background: var(--el-fill-color-lighter, #fafbfc);
}

.api-constructor .doc-h3 {
  margin: 0 0 10px;
}

.api-constructor__signature {
  margin: 0;
}

.api-constructor__signature code {
  display: inline-block;
  padding: 5px 8px;
  border-radius: 5px;
  background: var(--el-text-color-primary, #303133);
  color: var(--el-bg-color, #fff);
  font-size: 13px;
  font-weight: 700;
}

.api-table__property {
  color: var(--el-text-color-secondary, #909399);
  font-weight: 600;
}

.api-table__method {
  color: var(--el-text-color-primary, #303133);
  font-weight: 600;
}

.api-table__method .code-fn {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color, #f0f2f5);
  color: inherit;
  font-family: "Cascadia Code", "Consolas", monospace;
}

.api-table__method .code-fn a {
  color: inherit;
  text-decoration: none;
}

.api-table__method .code-fn a:hover {
  text-decoration: underline;
}
```

Remove the `.api-table td:first-child` rule so first-column appearance comes only from semantic classes.

- [ ] **Step 4: Add the contributor rule**

In `website/AGENTS.md`, place this block directly below `## API 引用与跳转`, keeping the existing anchor-target requirement after it:

```md
API 表格中的构造器、属性名和方法名使用固定视觉层级：

- 构造器必须使用 `api-constructor` 容器和 `api-constructor__signature` 签名样式，作为 API 区域最明显的入口。
- 属性名列必须声明 `presentation: 'property'`，由 `api-table__property` 显示为浅灰色。
- 方法名列必须声明 `presentation: 'method'`，由 `api-table__method` 显示为深灰色；即使方法名包含可点击锚点，也不得使用蓝色的 API 表格样式。
- 正文和示例说明中的可点击方法引用继续使用蓝色 `code-fn` 样式，用于与 API 定义表区分。
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- test/WebsiteApiPresentation.test.ts`

Expected: PASS with three tests.

- [ ] **Step 6: Build the documentation site**

Run: `npm run docs:build`

Expected: TypeScript checks, API synchronization and coverage checks, and the Vite documentation build exit with code 0.

- [ ] **Step 7: Commit styles, rules, and coverage**

```bash
git add test/WebsiteApiPresentation.test.ts website/src/assets/styles/index.scss website/AGENTS.md
git commit -m "docs: standardize API presentation"
```

### Task 4: Final verification

**Files:**
- Verify all files changed by Tasks 1 through 3.

**Interfaces:**
- Consumes the semantic table component, documentation metadata, Sass, contributor rule, and regression test.
- Produces a verified presentation update on the current branch.

- [ ] **Step 1: Run the focused regression test**

Run: `npm test -- test/WebsiteApiPresentation.test.ts`

Expected: PASS with three tests.

- [ ] **Step 2: Run repository verification**

Run: `npm run verify`

Expected: type checking, linting, all Vitest tests, and package build exit with code 0.

- [ ] **Step 3: Rebuild the documentation site**

Run: `npm run docs:build`

Expected: documentation type checking, TypeDoc synchronization, API coverage checking, and Vite build exit with code 0.

- [ ] **Step 4: Inspect the final change set**

Run: `git diff HEAD~4..HEAD --check && git status --short`

Expected: no whitespace errors and a clean working tree.
