# Documentation Top Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the handwritten documentation header links with an Element Plus menu whose “组件” item remains active on every `/components/*` page.

**Architecture:** Keep `topNavItems` as the source of labels and destination routes, and add a small pure function that maps both destination paths and current route paths to stable top-level menu indexes. `DocsLayout.vue` binds the computed index to a horizontal `el-menu` and maps selection back to the existing destination routes; the sidebar remains independent.

**Tech Stack:** Vue 3, Vue Router 4, Element Plus 2, TypeScript, SCSS, Vitest

## Global Constraints

- Only the top navigation is converted to `el-menu`; the left sidebar remains unchanged.
- Existing route paths, menu labels, and `topNavItems` destinations remain unchanged.
- New UI styles must use the semantic theme variables in `website/src/assets/styles/index.scss` and support light and dark themes.
- Do not commit generated `dist/` output.
- Run `npm run docs:build` because this changes documented-site behavior.

---

### Task 1: Stable top-level navigation state

**Files:**
- Create: `test/WebsiteTopMenu.test.ts`
- Modify: `website/src/config/navigation.ts:1-16`
- Modify: `website/src/layouts/DocsLayout.vue:1-33,104-121`

**Interfaces:**
- Consumes: `topNavItems: NavItem[]`, Vue Router `route.path`, and `router.push(to)`.
- Produces: `getTopNavIndex(path: string): '/' | '/components'`, `activeTopMenu`, and an `el-menu` selection handler.

- [ ] **Step 1: Write the failing navigation test**

Create `test/WebsiteTopMenu.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTopNavIndex, topNavItems } from '../website/src/config/navigation';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('website top menu', () => {
  it('maps every component page to one stable top-level menu index', () => {
    expect(getTopNavIndex('/')).toBe('/');
    expect(getTopNavIndex('/guide/quick-start')).toBe('/');
    expect(getTopNavIndex('/components')).toBe('/components');
    expect(getTopNavIndex('/components/point-layer')).toBe('/components');
    expect(getTopNavIndex('/components/context-menu/cleanup')).toBe('/components');
    expect(getTopNavIndex(topNavItems[1].to)).toBe('/components');
  });

  it('uses the Element Plus menu and routes selections to existing destinations', () => {
    const layout = readSource('website/src/layouts/DocsLayout.vue');

    expect(layout).toContain('<el-menu');
    expect(layout).toContain('mode="horizontal"');
    expect(layout).toContain(':default-active="activeTopMenu"');
    expect(layout).toContain('@select="onTopMenuSelect"');
    expect(layout).toContain('<el-menu-item');
    expect(layout).toContain('void router.push(target.to);');
    expect(layout).not.toContain('class="docs-header__nav-item"');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run test/WebsiteTopMenu.test.ts`

Expected: FAIL because `getTopNavIndex` is not exported and the layout still contains handwritten `RouterLink` menu items.

- [ ] **Step 3: Add the minimal path-to-menu mapping**

Add to `website/src/config/navigation.ts` after the interfaces:

```ts
export type TopNavIndex = '/' | '/components';

export const getTopNavIndex = (path: string): TopNavIndex =>
  path === '/components' || path.startsWith('/components/') ? '/components' : '/';
```

- [ ] **Step 4: Replace the handwritten header links with `el-menu`**

In `website/src/layouts/DocsLayout.vue`, import and initialize the router and mapping:

```ts
import { useRoute, useRouter } from 'vue-router';
import { getTopNavIndex, sideGroups, topNavItems, type TopNavIndex } from '../config/navigation';

const route = useRoute();
const router = useRouter();
const activeTopMenu = computed(() => getTopNavIndex(route.path));

const onTopMenuSelect = (index: string) => {
  const target = topNavItems.find((item) => getTopNavIndex(item.to) === (index as TopNavIndex));
  if (target && route.path !== target.to) void router.push(target.to);
};
```

Replace the existing `<nav class="docs-header__nav">...</nav>` with:

```vue
<el-menu class="docs-header__nav" mode="horizontal" :ellipsis="false" :default-active="activeTopMenu" @select="onTopMenuSelect">
  <el-menu-item v-for="item in topNavItems" :key="item.to" :index="getTopNavIndex(item.to)">
    {{ item.label }}
  </el-menu-item>
</el-menu>
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npx vitest run test/WebsiteTopMenu.test.ts`

Expected: PASS with 2 tests.

- [ ] **Step 6: Commit the behavior change**

```bash
git add test/WebsiteTopMenu.test.ts website/src/config/navigation.ts website/src/layouts/DocsLayout.vue
git commit -m "fix: keep documentation top menu active"
```

### Task 2: Theme-aware Element menu presentation

**Files:**
- Modify: `test/WebsiteTopMenu.test.ts`
- Modify: `website/src/assets/styles/index.scss:120-140`

**Interfaces:**
- Consumes: `--doc-muted`, `--doc-primary-deep`, and `--doc-surface-soft` theme tokens.
- Produces: `.docs-header__nav.el-menu--horizontal` and scoped `.el-menu-item` presentation rules.

- [ ] **Step 1: Add the failing style assertions**

Append this test inside the existing `describe` block in `test/WebsiteTopMenu.test.ts`:

```ts
it('styles the Element menu with semantic light and dark theme tokens', () => {
  const styles = readSource('website/src/assets/styles/index.scss');

  expect(styles).toContain('.docs-header__nav.el-menu--horizontal');
  expect(styles).toContain('--el-menu-bg-color: transparent;');
  expect(styles).toContain('--el-menu-text-color: var(--doc-muted);');
  expect(styles).toContain('--el-menu-active-color: var(--doc-primary-deep);');
  expect(styles).toContain('--el-menu-hover-bg-color: var(--doc-surface-soft);');
  expect(styles).not.toContain('.docs-header__nav-item');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run test/WebsiteTopMenu.test.ts`

Expected: FAIL because the header still uses styles for `.docs-header__nav-item` and has no scoped Element menu tokens.

- [ ] **Step 3: Replace the handwritten-link styles**

Replace the existing `.docs-header__nav` and `.docs-header__nav-item` blocks in `website/src/assets/styles/index.scss` with:

```scss
.docs-header__nav.el-menu--horizontal {
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--doc-muted);
  --el-menu-hover-bg-color: var(--doc-surface-soft);
  --el-menu-active-color: var(--doc-primary-deep);
  --el-menu-horizontal-height: 40px;

  border-bottom: 0;
}

.docs-header__nav.el-menu--horizontal > .el-menu-item {
  padding: 0 14px;
  border-radius: 8px;
  font-size: 14px;
}
```

- [ ] **Step 4: Run the focused test and website type/build check**

Run: `npx vitest run test/WebsiteTopMenu.test.ts && npm run build --workspace=ol-doc`

Expected: 3 tests PASS and the website build exits with code 0.

- [ ] **Step 5: Commit the presentation change**

```bash
git add test/WebsiteTopMenu.test.ts website/src/assets/styles/index.scss
git commit -m "style: adopt Element menu header navigation"
```

### Task 3: Full verification and visual regression check

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: the completed header menu behavior and styles.
- Produces: verification evidence for tests, production documentation build, themes, and responsive layout.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`

Expected: all test files and tests PASS with no new warnings caused by the change.

- [ ] **Step 2: Run the required documentation build**

Run: `npm run docs:build`

Expected: library build, API synchronization, API coverage check, Vue typecheck, and Vite production build all exit with code 0.

- [ ] **Step 3: Inspect the documentation UI**

Run: `npm run dev --workspace=ol-doc -- --host 127.0.0.1`

Check in the browser:

- `/components/point-layer` and `/components/context-menu/cleanup` both keep “组件” active.
- A left-sidebar navigation click does not clear the top selection.
- “指南” and “组件” navigate to `/` and `/components/point-layer` respectively.
- Header hover and active states remain readable in light and dark themes.
- At widths below 860px, the header menu, theme button, and GitHub link do not overlap.

- [ ] **Step 4: Confirm the branch is clean**

Run: `git status --short --branch`

Expected: branch `codex/fix-docs-top-menu` with no uncommitted files. Generated `dist/` changes, if any, must not be committed.

### Task 4: Simplify the active menu presentation

**Files:**
- Modify: `test/WebsiteTopMenu.test.ts`
- Modify: `website/src/assets/styles/index.scss:136-153`

**Interfaces:**
- Consumes: Element Plus horizontal menu variables and its native `2px` active bottom border.
- Produces: text-only hover feedback and active text plus underline feedback, without rounded or filled menu items.

- [ ] **Step 1: Change the style regression test to the approved presentation**

In `test/WebsiteTopMenu.test.ts`, replace the existing hover-background assertion and add a scoped rounded-item prohibition:

```ts
expect(styles).toContain('--el-menu-hover-text-color: var(--doc-primary-deep);');
expect(styles).toContain('--el-menu-hover-bg-color: transparent;');
expect(styles).toContain('--el-menu-active-color: var(--doc-primary-deep);');
expect(styles).not.toMatch(/\.docs-header__nav\.el-menu--horizontal > \.el-menu-item\s*{[^}]*border-radius:/s);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run test/WebsiteTopMenu.test.ts`

Expected: FAIL because `--el-menu-hover-bg-color` is still `var(--doc-surface-soft)`, the hover text token is absent, and the menu item still has `border-radius: 8px`.

- [ ] **Step 3: Apply the minimal Element Plus variable override**

Update the header menu blocks in `website/src/assets/styles/index.scss` to:

```scss
.docs-header__nav.el-menu--horizontal {
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--doc-muted);
  --el-menu-hover-text-color: var(--doc-primary-deep);
  --el-menu-hover-bg-color: transparent;
  --el-menu-active-color: var(--doc-primary-deep);
  --el-menu-horizontal-height: 40px;

  border-bottom: 0;
}

.docs-header__nav.el-menu--horizontal > .el-menu-item {
  padding: 0 14px;
  font-size: 14px;
}
```

Element Plus already defines a transparent `2px` bottom border on horizontal items and changes it to `--el-menu-active-color` for `.is-active`, so no custom pseudo-element or template wrapper is added.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run test/WebsiteTopMenu.test.ts`

Expected: all 3 tests PASS.

- [ ] **Step 5: Run complete verification and inspect the page**

Run: `npm test && npm run docs:build`

Expected: all tests and the production documentation build PASS. In the browser, confirm light and dark themes show no menu-item fill or rounded block, the active item has blue text and a `2px` underline, and the header controls do not overlap at 375px width.

- [ ] **Step 6: Commit the refinement**

```bash
git add test/WebsiteTopMenu.test.ts website/src/assets/styles/index.scss
git commit -m "style: simplify documentation top menu"
```
