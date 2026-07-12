# GlobalEvent Lifecycle Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `add* → returned disposer()` the normal GlobalEvent documentation path, relocate manual listener controls into overview, and provide seven focused runnable examples.

**Architecture:** Remove the listener-control route and move all 26 `enable*`/`disable*` rows into an overview-owned advanced table. Four scenario pages retain unique method ownership. Overview, global mouse, module events, and keyboard then own one or two focused lifecycle examples.

**Tech Stack:** Vue 3, Vue Router, TypeScript, Element Plus, Vitest, OpenLayers.

## Global Constraints

- Do not modify `src/components/GlobalEvent.ts` or a GlobalEvent public signature.
- Keep `/components/global-event#api-methods` valid as the overview method-category index.
- Remove the listener-control navigation child, route, import, and standalone view; no stale links may remain.
- Every public method is uniquely documented across four pages: global mouse 16, module events 14, keyboard 2, overview advanced control 26.
- Advanced control owns all `enable*` / `disable*`, including keyboard methods.
- Daily examples use `add*` and returned disposers, never direct manual listener controls; only the overview advanced example may call `enable*` / `disable*`.
- Every map example uses `createConfiguredLayer` and disposes/cancels before `earth.destroy()`.
- Method cells contain names only; zero-parameter cells use `—`; owned types remain overview-only.
- Update `website/AGENTS.md` with high-level lifecycle and destructive `disable*` rules.

---

### Task 1: Consolidate listener-control API and remove its page

**Files:**

- Modify: `test/InteractionDocs.test.ts`
- Modify: `website/src/config/navigation.ts`
- Modify: `website/src/router/index.ts`
- Modify: `website/src/layouts/DocsLayout.vue`
- Modify: `website/src/views/GlobalEventView.vue`
- Modify: `website/src/views/GlobalEventKeyboardView.vue`
- Delete: `website/src/views/GlobalEventListenerControlView.vue`

**Interfaces:**

- Produces overview anchor `#api-listener-control` containing the canonical 26 manual listener methods.
- Produces four GlobalEvent routes and four-page API ownership for Task 2.

- [ ] **Step 1: Write the failing route and ownership test**

Use these exact route tuples:

```ts
const globalEventPages = [
  ['概览与初始化', '/components/global-event', 'GlobalEventView'],
  ['全局鼠标事件', '/components/global-event/global-mouse', 'GlobalEventGlobalMouseView'],
  ['模块要素事件', '/components/global-event/module-events', 'GlobalEventModuleEventsView'],
  ['键盘事件', '/components/global-event/keyboard', 'GlobalEventKeyboardView']
] as const;
```

Assert navigation/router/layout do not contain `listener-control` or `GlobalEventListenerControlView`; overview has `id="api-listener-control"`; keyboard owns only `addKeyDownEventByGlobal` and `hasGlobalKeyDownEvent`; overview owns all 26 exact `enable*`/`disable*` table rows. Update source ownership to `16 + 14 + 2 + 26 = 58` and count each declaration once across overview/global mouse/module/keyboard.

- [ ] **Step 2: Run RED test**

Run `npm test -- test/InteractionDocs.test.ts` and expect failure because the old route/view and keyboard manual rows exist while overview lacks the advanced table.

- [ ] **Step 3: Implement the migration**

Remove the listener child from `sideGroups`, its router import/record, and its layout title branch. Delete the listener-control view with `apply_patch`. In `GlobalEventView.vue`, define `methodCols` with `presentation: 'method'`, then add `id="api-listener-control"` after method classification, a heading `高级：底层监听控制`, two paragraphs saying normal code uses `add*` plus its returned disposer and `disable*` clears all category callbacks, and an `ApiTable` using `listenerMethodRows`.

Move the 24 mouse rows from the deleted view plus `enableGlobalKeyDownEvent` and `disableGlobalKeyDownEvent` into `listenerMethodRows`; remove those two keyboard rows. Add the new anchor to overview `PageAnchor` and replace the old listener-page category link with a page-local advanced-section link.

- [ ] **Step 4: Verify GREEN and commit**

Run `npm test -- test/InteractionDocs.test.ts` and `npx prettier --check test/InteractionDocs.test.ts website/src/config/navigation.ts website/src/router/index.ts website/src/layouts/DocsLayout.vue website/src/views/GlobalEventView.vue website/src/views/GlobalEventKeyboardView.vue`; both must pass. Commit with `git add test/InteractionDocs.test.ts website/src/config/navigation.ts website/src/router/index.ts website/src/layouts/DocsLayout.vue website/src/views/GlobalEventView.vue website/src/views/GlobalEventKeyboardView.vue website/src/views/GlobalEventListenerControlView.vue` then `git commit -m "docs: consolidate GlobalEvent listener controls"`.

---

### Task 2: Build seven lifecycle-focused examples and rules

**Files:**

- Modify: `test/InteractionDocs.test.ts`
- Modify: `website/src/views/GlobalEventView.vue`
- Modify: `website/src/views/GlobalEventGlobalMouseView.vue`
- Modify: `website/src/views/GlobalEventModuleEventsView.vue`
- Modify: `website/src/views/GlobalEventKeyboardView.vue`
- Modify: `website/src/examples/GlobalEventDemo.vue`
- Modify: `website/src/examples/GlobalEventModuleDemo.vue`
- Modify: `website/src/examples/GlobalEventKeyboardDemo.vue`
- Modify: `website/src/examples/GlobalEventListenerControlDemo.vue`
- Create: `website/src/examples/GlobalEventLifecycleDemo.vue`
- Create: `website/src/examples/GlobalEventOnceDemo.vue`
- Create: `website/src/examples/GlobalEventModuleCleanupDemo.vue`
- Modify: `website/AGENTS.md`

**Interfaces:**

- Consumes four-page ownership and `#api-listener-control` from Task 1.
- Produces seven raw/preview-paired `ExampleBlock`s with independent anchors and cleanup.

- [ ] **Step 1: Write failing seven-example tests**

Assert these title/anchor/component tuples:

```ts
const examples = [
  ['GlobalEventView.vue', '最小完整生命周期', 'example-minimal-lifecycle', 'GlobalEventLifecycleDemo'],
  ['GlobalEventView.vue', '高级：手动监听控制', 'example-advanced-listener-control', 'GlobalEventListenerControlDemo'],
  ['GlobalEventGlobalMouseView.vue', '持续全局事件', 'example-persistent-global-events', 'GlobalEventDemo'],
  ['GlobalEventGlobalMouseView.vue', '一次性事件与取消', 'example-once-events', 'GlobalEventOnceDemo'],
  ['GlobalEventModuleEventsView.vue', '模块回调生命周期', 'example-module-lifecycle', 'GlobalEventModuleDemo'],
  ['GlobalEventModuleEventsView.vue', '模块事件清理范围', 'example-module-cleanup-scope', 'GlobalEventModuleCleanupDemo'],
  ['GlobalEventKeyboardView.vue', '键盘事件生命周期', 'example-keyboard-lifecycle', 'GlobalEventKeyboardDemo']
] as const;
```

For every tuple assert component import, `?raw` import, preview/source pairing, stable anchor, right-side child label, configured map source where applicable, and cleanup before destroy. Assert daily demos contain `add*` plus a disposer and no manual listener calls; assert advanced copy/demo explains manual control and batch clearing. Assert the new `website/AGENTS.md` rules exist.

- [ ] **Step 2: Run RED test**

Run `npm test -- test/InteractionDocs.test.ts` and expect failure because the three new demos and seven anchors do not exist.

- [ ] **Step 3: Implement overview and global-mouse examples**

Create `GlobalEventLifecycleDemo.vue`: use `earth.useGlobalEvent()`, register a click callback through `addMouseClickEventByGlobal`, keep its nullable disposer, and provide visible register/unregister controls. It must not call manual listener APIs. Keep `GlobalEventListenerControlDemo.vue` only as the advanced example and state in UI and description that normal code uses `add*` plus its returned disposer while `disable*` batch-clears callbacks.

Keep `GlobalEventDemo.vue` as `持续全局事件`, with movement/click disposers and no manual calls. Create `GlobalEventOnceDemo.vue` using both cancellable once APIs with visible register/cancel/re-register controls and cleanup of both cancellation functions.

- [ ] **Step 4: Implement module, keyboard, and page wiring**

Change `GlobalEventModuleDemo.vue` to `模块回调生命周期`: register click/double-click for `module: 'event-demo'`, store two disposers, and expose independent cancellation without `removeModuleEvent` or `removeAllModuleEvents`. Create `GlobalEventModuleCleanupDemo.vue` with a visible module point and controls for one returned disposer, `removeModuleEvent('event-demo', 'dblClick')`, and `removeAllModuleEvents('event-demo')`; label scopes and support re-registration.

Keep `GlobalEventKeyboardDemo.vue` as `键盘事件生命周期`: register with `addKeyDownEventByGlobal`, display `hasGlobalKeyDownEvent()`, and cancel through its returned disposer; do not call keyboard manual controls. Wire all seven blocks with matching anchors, `PageAnchor` children, and blue `code-fn` descriptions. Daily descriptions link `#api-methods`; advanced overview descriptions link `#api-listener-control`.

- [ ] **Step 5: Update rules, verify GREEN, and commit**

Append these rules to `website/AGENTS.md`:

```markdown
- 工具日常示例优先调用返回注销函数的高层 `add*` API，展示“注册 → 保存返回值 → 调用返回值清理”的完整路径；不得要求用户预先调用 `enable*`。
- `disable*` 会批量停用底层监听并清空同类别回调时，只能在高级章节演示，并必须说明其与单次注销函数及 `remove*` 的差异。
```

Run `npm test -- test/InteractionDocs.test.ts`, `npx prettier --check test/InteractionDocs.test.ts website/AGENTS.md website/src/views/GlobalEvent*.vue website/src/examples/GlobalEvent*.vue`, `npm run docs:build`, and `git diff --check`; all must pass except existing non-blocking warnings. Commit with `git add test/InteractionDocs.test.ts website/AGENTS.md website/src/views/GlobalEvent*.vue website/src/examples/GlobalEvent*.vue` then `git commit -m "docs: expand GlobalEvent lifecycle examples"`.

---

### Task 3: Cross-page audit and full verification

**Files:**

- Modify only for a verified audit failure: `test/InteractionDocs.test.ts`, navigation/router/layout, and GlobalEvent views/examples.
- Update ignored ledger: `.superpowers/sdd/progress.md`

**Interfaces:**

- Consumes four pages, 58 unique methods, seven examples, and no listener-control route.
- Produces a reviewed, verified branch.

- [ ] **Step 1: Audit links and ownership**

Search `website/src` for `/components/global-event`, `/components/global-event/listener-control`, `#api-methods`, and `#api-listener-control`. Verify every hash exists, no listener-control path remains, all seven anchors map to real elements, and source-derived methods have one owner.

- [ ] **Step 2: Run full verification**

Run `npm test -- test/InteractionDocs.test.ts`, `npm run verify`, `npm run docs:build`, `git diff --check`, and `git status --short`. All commands must exit 0; existing lint/TypeDoc/Vite warnings remain non-blocking.

- [ ] **Step 3: Whole-branch review**

Create a diff package from the Task 1 base through `HEAD`. Review route removal, 58-method ownership, seven lifecycle paths, advanced/daily separation, and maintenance rules. Fix every Critical/Important finding with TDD, rerun covering commands, and re-review. If audit changes are needed, commit with `git add test/InteractionDocs.test.ts website/src/config/navigation.ts website/src/router/index.ts website/src/layouts/DocsLayout.vue website/src/views/GlobalEvent*.vue website/src/examples/GlobalEvent*.vue website/AGENTS.md` then `git commit -m "test: audit GlobalEvent lifecycle documentation"`.
