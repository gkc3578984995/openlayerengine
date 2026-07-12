# PointLayer API Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder PointLayer API content by dependency, expose every type in the right-side outline, and remove signatures from method-name cells.

**Architecture:** The shared PageAnchor gains one rendered grandchild level. PointLayer provides a 类型定义 group with six type links, moves type tables before methods, and pointLayerApi derives the output label from its signature lookup string.

**Tech Stack:** Vue 3, TypeScript, Sass, Element Plus, Vitest, Vite.

## Global Constraints

- PointLayer API order is 构造参数 → 类型定义 → 方法.
- IPointParam, ISetPointParam, IRgbColor, IFill, IStroke, and ILabel are individual right-side anchors below 类型定义.
- Method-name cells omit parentheses and parameter lists; parameter values remain TypeDoc-derived named signatures.
- Inherited labels keep 继承.
- website/AGENTS.md records the convention.

---

### Task 1: Add third-level outline links

**Files:**

- Modify: test/WebsiteApiPresentation.test.ts
- Modify: website/src/components/docs/PageAnchor.vue
- Modify: website/src/assets/styles/index.scss

**Interfaces:**

- Consumes AnchorItem.children?: AnchorItem[].
- Produces .page-anchor__grandchild links for children of child items.

- [ ] **Step 1: Write the failing test**

Append inside the existing describe block:

    it('renders third-level API outline entries with a distinct style', async () => {
      const [pageAnchor, styles] = await Promise.all([
        readFile('website/src/components/docs/PageAnchor.vue', 'utf8'),
        readFile('website/src/assets/styles/index.scss', 'utf8')
      ]);

      expect(pageAnchor).toContain('v-for="grandchild in child.children"');
      expect(pageAnchor).toContain('class="page-anchor__grandchild"');
      expect(styles).toContain('.page-anchor__grandchild.el-anchor__item {');
    });

- [ ] **Step 2: Verify red**

Run: npm test -- test/WebsiteApiPresentation.test.ts

Expected: FAIL because PageAnchor has no grandchild loop or styling.

- [ ] **Step 3: Render grandchild links and style them**

In PageAnchor.vue, replace the current outer loop body with:

    <template v-for="item in items" :key="item.id">
      <el-anchor-link :href="`#${item.id}`" :title="item.label" />
      <template v-for="child in item.children" :key="child.id">
        <el-anchor-link :href="`#${child.id}`" :title="child.label" class="page-anchor__child" />
        <el-anchor-link v-for="grandchild in child.children" :key="grandchild.id" :href="`#${grandchild.id}`" :title="grandchild.label" class="page-anchor__grandchild" />
      </template>
    </template>

Add after the current child-link rules in index.scss:

    .page-anchor__grandchild.el-anchor__item {
      padding-left: 40px;
    }

    .page-anchor__grandchild .el-anchor-link__title {
      font-size: 12px;
      color: var(--doc-muted);
    }

    .page-anchor__grandchild.is-active .el-anchor-link__title {
      color: var(--doc-primary-deep);
    }

- [ ] **Step 4: Verify green and commit**

Run: npm test -- test/WebsiteApiPresentation.test.ts

Expected: PASS.

Run: git add test/WebsiteApiPresentation.test.ts website/src/components/docs/PageAnchor.vue website/src/assets/styles/index.scss; git commit -m "feat(docs): support nested API anchors"

### Task 2: Reorder PointLayer and simplify API method labels

**Files:**

- Modify: test/WebsiteApiPresentation.test.ts
- Modify: website/src/views/PointLayerView.vue
- Modify: website/src/docs/pointLayerApi.ts

**Interfaces:**

- Consumes grandchild anchor support from Task 1.
- Produces grouped type anchors, type tables before methods, and plain method names.

- [ ] **Step 1: Write the failing test**

Append inside the existing describe block:

    it('orders PointLayer types before methods and exposes every type in the outline', async () => {
      const [pointLayer, helpers] = await Promise.all([
        readFile('website/src/views/PointLayerView.vue', 'utf8'),
        readFile('website/src/docs/pointLayerApi.ts', 'utf8')
      ]);

      expect(pointLayer.indexOf('<h3 id="api-types"')).toBeLessThan(pointLayer.indexOf('<h3 id="api-methods"'));
      expect(pointLayer).toContain("{ id: 'api-types', label: '类型定义', children: [");
      for (const id of ['api-pointparam', 'api-setpointparam', 'api-type-irgbcolor', 'api-type-ifill', 'api-type-istroke', 'api-type-ilabel']) {
        expect(pointLayer).toContain(`{ id: '${id}'`);
      }
      expect(helpers).toContain("const methodName = row.name.split('(', 1)[0];");
      expect(helpers).toContain('return { ...row, name: methodName, params: linkDocumentedTypes(method.params)');
      expect(helpers).toContain('return { ...row, name: methodName, params: method.params, returns: method.returns };');
    });

- [ ] **Step 2: Verify red**

Run: npm test -- test/WebsiteApiPresentation.test.ts

Expected: FAIL because PointLayer types follow methods, its outline has no nested type list, and helpers preserve the signature in name.

- [ ] **Step 3: Define the PointLayer API outline**

Replace the API anchor item in PointLayerView.vue with:

    {
      id: 'api',
      label: 'API',
      children: [
        { id: 'api-constructor', label: '构造参数' },
        {
          id: 'api-types',
          label: '类型定义',
          children: [
            { id: 'api-pointparam', label: 'IPointParam' },
            { id: 'api-setpointparam', label: 'ISetPointParam' },
            { id: 'api-type-irgbcolor', label: 'IRgbColor' },
            { id: 'api-type-ifill', label: 'IFill' },
            { id: 'api-type-istroke', label: 'IStroke' },
            { id: 'api-type-ilabel', label: 'ILabel' }
          ]
        },
        { id: 'api-methods', label: '方法' }
      ]
    },

- [ ] **Step 4: Move all type tables before methods**

In the PointLayer API template, retain the constructor block and table. Directly after it, move the existing 类型定义, IPointParam, ISetPointParam, IRgbColor, IFill, IStroke, and ILabel markup in that exact order. Make IPointParam and ISetPointParam h4 elements; keep 类型定义 as h3 with id api-types. Move the existing h3 api-methods and its ApiTable after ILabel. Delete the former copies so each anchor id occurs once.

- [ ] **Step 5: Return concise method labels**

In both getPointLayerMethodRows and getBaseMethodRows, replace the methodName declaration with:

    const methodName = row.name.split('(', 1)[0];

In getPointLayerMethodRows, return:

    return { ...row, name: methodName, params: linkDocumentedTypes(method.params), returns: linkDocumentedTypes(method.returns) };

In getBaseMethodRows, return:

    return { ...row, name: methodName, params: method.params, returns: method.returns };

- [ ] **Step 6: Verify green and commit**

Run: npm test -- test/WebsiteApiPresentation.test.ts

Expected: PASS.

Run: git add test/WebsiteApiPresentation.test.ts website/src/views/PointLayerView.vue website/src/docs/pointLayerApi.ts; git commit -m "docs: reorganize PointLayer API outline"

### Task 3: Record and verify the maintenance rule

**Files:**

- Modify: test/WebsiteApiPresentation.test.ts
- Modify: website/AGENTS.md

- [ ] **Step 1: Write failing documentation assertions**

Add to the existing contributor-rule test:

    expect(rules).toContain('相关类型定义应位于构造参数之后、方法之前');
    expect(rules).toContain('每个类型定义必须拥有独立的右侧锚点');
    expect(rules).toContain('方法名列只展示方法名称');

- [ ] **Step 2: Verify red**

Run: npm test -- test/WebsiteApiPresentation.test.ts

Expected: FAIL because the rule is absent.

- [ ] **Step 3: Add the contributor rule**

Append these bullets to the API-table visual hierarchy list in website/AGENTS.md:

    - 相关类型定义应位于构造参数之后、方法之前；每个类型定义必须拥有独立的右侧锚点，并在 API 目录中按类型定义分组显示。
    - 方法名列只展示方法名称，不包含括号或参数列表；完整的命名参数签名必须在参数列中展示。

- [ ] **Step 4: Verify green, build, and commit**

Run: npm test -- test/WebsiteApiPresentation.test.ts && npm run docs:build

Expected: focused tests and documentation build exit with code 0.

Run: git add test/WebsiteApiPresentation.test.ts website/AGENTS.md; git commit -m "docs: define API outline conventions"

### Task 4: Final verification

- [ ] **Step 1: Verify repository and documentation**

Run: npm run verify && npm run docs:build && git diff HEAD~3..HEAD --check && git status --short

Expected: every command exits with code 0, no whitespace errors, and a clean worktree.
