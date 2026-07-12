# ContextMenu Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the ContextMenu documentation into six GlobalEvent-style child pages with thirteen runnable examples and complete API ownership.

**Architecture:** Replace the single ContextMenu view with six focused Vue documentation views and thirteen colocated runnable example components. Keep public types on the overview page; each public method belongs to exactly one feature page. Navigation, routing and layout titles expose the same parent/child shape as GlobalEvent.

**Tech Stack:** Vue 3, Vue Router, TypeScript, Vitest, Vite, OpenLayers.

## Global Constraints

- Link any current-page public method, property or type reference to a real anchor.
- Use `api-constructor` and `api-constructor__signature` for the constructor, `presentation: 'method'` for method names, and `presentation: 'property'` for property names.
- Every `ExampleBlock` has a stable `example-*` wrapper and a matching `PageAnchor` child.
- The preview and displayed source must use the same Vue example component.
- Each map example creates its base layer through `createConfiguredLayer`; do not embed a tile URL or token.
- Every example disposes ContextMenu before Earth on unmount.

---

### Task 1: Lock the documentation contract with failing tests

**Files:**
- Modify: `test/InteractionDocs.test.ts`
- Modify: `test/WebsiteApiPresentation.test.ts`

**Interfaces:**
- Consumes: six ContextMenu documentation routes and the existing `ApiTable`/`PageAnchor` conventions.
- Produces: regression checks for navigation, route ownership, anchors, examples and API presentation.

- [ ] **Step 1: Add failing navigation and route assertions**

```ts
const contextMenuPages = [
  ['概览与初始化', '/components/context-menu', 'ContextMenuOverviewView'],
  ['全局菜单', '/components/context-menu/default-menu', 'ContextMenuDefaultMenuView'],
  ['模块菜单', '/components/context-menu/module-menu', 'ContextMenuModuleMenuView'],
  ['级联菜单', '/components/context-menu/cascade-menu', 'ContextMenuCascadeMenuView'],
  ['菜单状态', '/components/context-menu/menu-state', 'ContextMenuStateView'],
  ['菜单移除与清理', '/components/context-menu/cleanup', 'ContextMenuCleanupView']
] as const;
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- test/InteractionDocs.test.ts`

Expected: FAIL because the five child routes and view imports do not exist.

- [ ] **Step 3: Add failing anchor, example and method ownership assertions**

```ts
const contextMenuExamples = [
  ['ContextMenuOverviewView.vue', 'example-minimal-lifecycle', 'ContextMenuLifecycleDemo'],
  ['ContextMenuDefaultMenuView.vue', 'example-add-default-menu', 'ContextMenuDefaultMenuDemo'],
  ['ContextMenuDefaultMenuView.vue', 'example-default-menu-callback', 'ContextMenuDefaultMenuCallbackDemo'],
  ['ContextMenuModuleMenuView.vue', 'example-add-module-menu', 'ContextMenuModuleMenuDemo'],
  ['ContextMenuModuleMenuView.vue', 'example-module-menu-guard', 'ContextMenuModuleMenuGuardDemo'],
  ['ContextMenuModuleMenuView.vue', 'example-module-menu-callback', 'ContextMenuModuleMenuCallbackDemo'],
  ['ContextMenuCascadeMenuView.vue', 'example-nested-menu', 'ContextMenuNestedMenuDemo'],
  ['ContextMenuCascadeMenuView.vue', 'example-mutex-menu', 'ContextMenuMutexMenuDemo'],
  ['ContextMenuStateView.vue', 'example-menu-visibility', 'ContextMenuVisibilityDemo'],
  ['ContextMenuStateView.vue', 'example-menu-state-toggle', 'ContextMenuStateToggleDemo'],
  ['ContextMenuStateView.vue', 'example-menu-theme', 'ContextMenuThemeDemo'],
  ['ContextMenuCleanupView.vue', 'example-remove-default-menu', 'ContextMenuRemoveDefaultDemo'],
  ['ContextMenuCleanupView.vue', 'example-remove-module-menu-state', 'ContextMenuRemoveModuleDemo']
] as const;
```

- [ ] **Step 4: Run the focused test to verify it still fails**

Run: `npm test -- test/InteractionDocs.test.ts`

Expected: FAIL because the specified view files, anchors and sources do not exist.

### Task 2: Create shared ContextMenu demo lifecycle helpers and thirteen examples

**Files:**
- Create: `website/src/examples/ContextMenuLifecycleDemo.vue`
- Create: `website/src/examples/ContextMenuDefaultMenuDemo.vue`
- Create: `website/src/examples/ContextMenuDefaultMenuCallbackDemo.vue`
- Create: `website/src/examples/ContextMenuModuleMenuDemo.vue`
- Create: `website/src/examples/ContextMenuModuleMenuGuardDemo.vue`
- Create: `website/src/examples/ContextMenuModuleMenuCallbackDemo.vue`
- Create: `website/src/examples/ContextMenuNestedMenuDemo.vue`
- Create: `website/src/examples/ContextMenuMutexMenuDemo.vue`
- Create: `website/src/examples/ContextMenuVisibilityDemo.vue`
- Create: `website/src/examples/ContextMenuStateToggleDemo.vue`
- Create: `website/src/examples/ContextMenuThemeDemo.vue`
- Create: `website/src/examples/ContextMenuRemoveDefaultDemo.vue`
- Create: `website/src/examples/ContextMenuRemoveModuleDemo.vue`

**Interfaces:**
- Consumes: `Earth`, `ContextMenu`, `IContextMenuItem`, `createConfiguredLayer` and Vue lifecycle hooks.
- Produces: one independently runnable, cleanup-safe component for each documented scenario.

- [ ] **Step 1: Copy the lifecycle pattern from `website/src/examples/ContextMenuDemo.vue`**

Each component initializes `Earth` with `createConfiguredLayer`, retains its own `earth` reference, invokes the page-specific ContextMenu API from UI controls or menu callbacks, and performs:

```ts
onBeforeUnmount(() => {
  earth?.useContextMenu().destroy();
  earth?.destroy();
});
```

- [ ] **Step 2: Implement one focused behavior in each component**

Use the following API mapping without combining behaviors: `addDefaultMenu`; default callback; `addModuleMenu`; `before`; module callback; `child`; `mutexKey`; `setDefaultMenuState`; `toggleModuleMenuState`; `setTheme`/`toggleTheme`; `removeDefaultMenu`; `removeModuleMenu` plus `clearModuleMenuState`.

- [ ] **Step 3: Run the documentation test**

Run: `npm test -- test/InteractionDocs.test.ts`

Expected: the test still fails only because the six views, routes and navigation are not yet connected.

### Task 3: Replace the single page with six focused ContextMenu documentation views

**Files:**
- Create: `website/src/views/ContextMenuOverviewView.vue`
- Create: `website/src/views/ContextMenuDefaultMenuView.vue`
- Create: `website/src/views/ContextMenuModuleMenuView.vue`
- Create: `website/src/views/ContextMenuCascadeMenuView.vue`
- Create: `website/src/views/ContextMenuStateView.vue`
- Create: `website/src/views/ContextMenuCleanupView.vue`
- Delete: `website/src/views/ContextMenuView.vue`

**Interfaces:**
- Consumes: the thirteen example components, `ApiTable`, `ExampleBlock`, `PageAnchor`, and `src/components/ContextMenu.ts` public APIs.
- Produces: six route-ready views with canonical anchors and no duplicated type/method definition.

- [ ] **Step 1: Implement the overview view**

Use anchors `overview`, `lifecycle`, `examples`, `example-minimal-lifecycle`, `api`, `api-constructor`, `api-types`, and the five `api-type-*` entries. Define the constructor and all five public ContextMenu types only here.

- [ ] **Step 2: Implement global and module menu views**

Create `examples`, two or three respective `example-*` entries, `api`, `api-methods`, and `tips`. Put only `addDefaultMenu` on the global API table; put only `addModuleMenu` on the module API table. Link callbacks and guards to the overview type anchors.

- [ ] **Step 3: Implement cascade and state views**

Cascade uses `overview`, `configuration`, `examples`, `example-nested-menu`, `example-mutex-menu`, and `tips`; it links `child`, `mutexKey` and `key` to the owned item-type anchor. State uses `overview`, `examples`, its three example anchors, `api`, `api-default-menu-state`, `api-module-menu-state`, `api-theme`, and `tips`.

- [ ] **Step 4: Implement cleanup view**

Use `overview`, `examples`, its two example anchors, `api`, `api-menu-removal`, `api-lifecycle`, and `tips`. Mark `destory` deprecated and link to `destroy` rather than providing a demo.

- [ ] **Step 5: Run the focused tests to verify green**

Run: `npm test -- test/InteractionDocs.test.ts test/WebsiteApiPresentation.test.ts`

Expected: PASS.

### Task 4: Wire navigation, routing and page titles

**Files:**
- Modify: `website/src/config/navigation.ts`
- Modify: `website/src/router/index.ts`
- Modify: `website/src/layouts/DocsLayout.vue`

**Interfaces:**
- Consumes: six ContextMenu view imports and the existing GlobalEvent nested-navigation pattern.
- Produces: a non-collapsible parent `ContextMenu 右键菜单` item whose six children match route and layout titles.

- [ ] **Step 1: Add the six child navigation entries in the agreed order**

```ts
{
  label: 'ContextMenu 右键菜单',
  to: '/components/context-menu',
  children: [/* the six agreed labels and routes */]
}
```

- [ ] **Step 2: Replace the obsolete ContextMenu route import and define six routes**

Keep `/components/context-menu` as the overview route and add `default-menu`, `module-menu`, `cascade-menu`, `menu-state`, and `cleanup` child paths.

- [ ] **Step 3: Add one layout title mapping per route**

Use the same `Record<string, string>` strategy already used for GlobalEvent so the page eyebrow title and the route-specific heading remain correct.

- [ ] **Step 4: Run the full docs contract tests**

Run: `npm test -- test/InteractionDocs.test.ts test/WebsiteApiPresentation.test.ts`

Expected: PASS with all six routes, titles, anchors and API ownership checks satisfied.

### Task 5: Format and verify the documentation site

**Files:**
- Modify: files created or changed by Tasks 1-4 only.

- [ ] **Step 1: Format the changed Vue, TypeScript and Markdown files**

Run: `npx prettier --write website/src/views/ContextMenu*.vue website/src/examples/ContextMenu*.vue website/src/config/navigation.ts website/src/router/index.ts website/src/layouts/DocsLayout.vue test/InteractionDocs.test.ts test/WebsiteApiPresentation.test.ts docs/superpowers/specs/2026-07-12-contextmenu-documentation-design.md docs/superpowers/plans/2026-07-12-contextmenu-documentation.md`

- [ ] **Step 2: Run unit and document checks**

Run: `npm test && npm run typecheck && npm run lint && npm run docs:build`

Expected: all commands exit 0. Do not stage generated `dist/`, `docs/` API output, `website/public/api/`, or `website/src/generated/` changes.

- [ ] **Step 3: Review the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intended source, test and authored planning files are listed.

### Task 6: Commit the completed documentation work

**Files:**
- Modify: all intended Task 1-5 source and test files.

- [ ] **Step 1: Stage only authored sources, tests and planning records**

Run: `git add website/src/views website/src/examples website/src/config/navigation.ts website/src/router/index.ts website/src/layouts/DocsLayout.vue test/InteractionDocs.test.ts test/WebsiteApiPresentation.test.ts docs/superpowers/specs/2026-07-12-contextmenu-documentation-design.md docs/superpowers/plans/2026-07-12-contextmenu-documentation.md`

- [ ] **Step 2: Commit the documentation feature**

Run: `git commit -m "docs: organize ContextMenu documentation"`

Expected: a single feature commit follows the design-record commit and the worktree is clean.
