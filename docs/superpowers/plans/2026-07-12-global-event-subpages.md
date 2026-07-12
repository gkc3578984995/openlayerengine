# GlobalEvent Subpages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 58-method GlobalEvent guide into five navigable pages with four focused runnable examples while preserving the existing overview route and deep link.

**Architecture:** Extend the generic sidebar model with nested children and always render child links without collapse controls. Keep `/components/global-event` as the overview and method index, then give each public method exactly one canonical child-page table. Each behavior page owns one runnable Vue example and links shared callback types back to the overview.

**Tech Stack:** Vue 3, Vue Router, TypeScript, Element Plus, Vitest, VitePress-style custom documentation components.

## Global Constraints

- Do not modify `src/components/GlobalEvent.ts` or any GlobalEvent public signature.
- Preserve `/components/global-event#api-methods` as a valid method-category index.
- Every one of the 58 public methods extracted from `src/components/GlobalEvent.ts` must occur in exactly one canonical API table across the five pages.
- `ModuleEventCallbackParams`, `ModuleEventCallback`, and `GlobalEventCallback` are defined only on the overview page; child pages link back to their overview anchors.
- Method cells contain names only, without parentheses or parameter lists; zero-argument methods use `—` in the parameter column.
- All runnable map examples create their basemap with `createConfiguredLayer` and dispose callbacks before `earth.destroy()`.
- The sidebar implementation is generic and uses optional `NavItem.children`; it must not hard-code GlobalEvent rendering logic.
- Page eyebrows show the parent name `GlobalEvent 全局事件`.
- Update `website/AGENTS.md` whenever the documentation behavior changes.

---

### Task 1: Nested navigation and canonical API pages

**Files:**
- Modify: `test/InteractionDocs.test.ts`
- Modify: `website/src/config/navigation.ts`
- Modify: `website/src/layouts/DocsLayout.vue`
- Modify: `website/src/assets/styles/index.scss`
- Modify: `website/src/router/index.ts`
- Modify: `website/src/views/GlobalEventView.vue`
- Create: `website/src/views/GlobalEventGlobalMouseView.vue`
- Create: `website/src/views/GlobalEventModuleEventsView.vue`
- Create: `website/src/views/GlobalEventKeyboardView.vue`
- Create: `website/src/views/GlobalEventListenerControlView.vue`

**Interfaces:**
- Produces: `NavItem.children?: NavItem[]` and five GlobalEvent routes.
- Produces: overview type anchors and `#api-methods` category index consumed by Task 2 examples and cross-page links.

- [ ] **Step 1: Write the failing navigation and ownership tests**

Add a focused test that reads the navigation, layout, router, source class, and five view files. Assert these exact route/label pairs:

```ts
const globalEventPages = [
  ['概览与初始化', '/components/global-event', 'GlobalEventView'],
  ['全局鼠标事件', '/components/global-event/global-mouse', 'GlobalEventGlobalMouseView'],
  ['模块要素事件', '/components/global-event/module-events', 'GlobalEventModuleEventsView'],
  ['键盘事件', '/components/global-event/keyboard', 'GlobalEventKeyboardView'],
  ['监听控制', '/components/global-event/listener-control', 'GlobalEventListenerControlView']
] as const;
```

Assert `NavItem` has `children?: NavItem[]`, the layout always renders child links without toggle state, and every route maps to its named component.

Define the exact canonical method sets:

```ts
const globalMouseMethods = [
  'addMouseMoveEventByGlobal', 'addMouseClickEventByGlobal', 'addMouseLeftDownEventByGlobal',
  'addMouseLeftUpEventByGlobal', 'addMouseDblClickEventByGlobal', 'addMouseRightClickEventByGlobal',
  'addMouseOnceClickEventByGlobal', 'addCancelableMouseOnceClickEventByGlobal',
  'addMouseOnceRightClickEventByGlobal', 'addCancelableMouseOnceRightClickEventByGlobal',
  'hasGlobalMouseMoveEvent', 'hasGlobalMouseClickEvent', 'hasGlobalMouseLeftDownEvent',
  'hasGlobalMouseLeftUpEvent', 'hasGlobalMouseDblClickEvent', 'hasGlobalMouseRightClickEvent'
];
const moduleMethods = [
  'addMouseMoveEventByModule', 'addMouseClickEventByModule', 'addMouseLeftDownEventByModule',
  'addMouseLeftUpEventByModule', 'addMouseDblClickEventByModule', 'addMouseRightClickEventByModule',
  'hasModuleMouseMoveEvent', 'hasModuleMouseClickEvent', 'hasModuleMouseLeftDownEvent',
  'hasModuleMouseLeftUpEvent', 'hasModuleMouseDblClickEvent', 'hasModuleMouseRightClickEvent',
  'removeModuleEvent', 'removeAllModuleEvents'
];
const keyboardMethods = [
  'addKeyDownEventByGlobal', 'enableGlobalKeyDownEvent',
  'disableGlobalKeyDownEvent', 'hasGlobalKeyDownEvent'
];
const listenerMethods = [
  'enableModuleMouseMoveEvent', 'enableModuleMouseClickEvent', 'enableModuleMouseLeftDownEvent',
  'enableModuleMouseLeftUpEvent', 'enableModuleMouseDblClickEvent', 'enableModuleMouseRightClickEvent',
  'enableGlobalMouseMoveEvent', 'enableGlobalMouseClickEvent', 'enableGlobalMouseLeftDownEvent',
  'enableGlobalMouseLeftUpEvent', 'enableGlobalMouseDblClickEvent', 'enableGlobalMouseRightClickEvent',
  'disableModuleMouseMoveEvent', 'disableModuleMouseClickEvent', 'disableModuleMouseLeftDownEvent',
  'disableModuleMouseLeftUpEvent', 'disableModuleMouseDblClickEvent', 'disableModuleMouseRightClickEvent',
  'disableGlobalMouseMoveEvent', 'disableGlobalMouseClickEvent', 'disableGlobalMouseLeftDownEvent',
  'disableGlobalMouseLeftUpEvent', 'disableGlobalMouseDblClickEvent', 'disableGlobalMouseRightClickEvent'
];
```

Extract public methods with the existing source-declaration pattern, verify the union has 58 names, and count canonical table declarations across all pages so each source method occurs exactly once.

- [ ] **Step 2: Run the target test and verify RED**

Run: `npm test -- test/InteractionDocs.test.ts`

Expected: FAIL because nested navigation, four child routes, four view files, and constructor/category index do not yet exist.

- [ ] **Step 3: Implement generic collapsible navigation**

Keep `NavItem.to` required and add children:

```ts
export interface NavItem {
  label: string;
  to: string;
  children?: NavItem[];
}
```

Change the GlobalEvent navigation item to a parent whose children are the five exact route/label pairs from Step 1. In `DocsLayout.vue`, always render indented `RouterLink` children whenever `item.children` exists, without expansion state or a toggle button. Parent active state uses exact match or `route.path.startsWith(`${item.to}/`)`; child active state uses exact match. Add focused `__children` and `__child-link` styles.

- [ ] **Step 4: Implement routes and page titles**

Import the four new view components and add the four child route records. Map the five paths to these layout titles:

```ts
const globalEventTitles: Record<string, string> = {
  '/components/global-event': 'GlobalEvent 概览与初始化',
  '/components/global-event/global-mouse': 'GlobalEvent 全局鼠标事件',
  '/components/global-event/module-events': 'GlobalEvent 模块要素事件',
  '/components/global-event/keyboard': 'GlobalEvent 键盘事件',
  '/components/global-event/listener-control': 'GlobalEvent 监听控制'
};
```

- [ ] **Step 5: Split the API tables**

Turn `GlobalEventView.vue` into overview/initialization content. Add a visible constructor before types:

```html
<div id="api-constructor" class="api-constructor">
  <span class="api-constructor__label">构造器</span>
  <code class="api-constructor__signature">new GlobalEvent(earth)</code>
  <p><code>earth: Earth</code> — 地图实例。</p>
</div>
```

Recommend `<a href="/guide/global-methods#api-methods">earth.useGlobalEvent()</a>`. Keep the three existing type anchors. Replace the long method table with `id="api-methods"` category links to the four child pages.

Create the four child views with the exact method arrays from Step 1. Each view uses `ApiTable`, name-only method cells with `presentation: 'method'`, overview type links such as `/components/global-event#api-type-globaleventcallback`, a right-side `PageAnchor`, and a `tips` section. Do not define the three owned types on child pages.

- [ ] **Step 6: Run tests and formatting**

Run:

```powershell
npm test -- test/InteractionDocs.test.ts
npx prettier --check test/InteractionDocs.test.ts website/src/config/navigation.ts website/src/layouts/DocsLayout.vue website/src/assets/styles/index.scss website/src/router/index.ts website/src/views/GlobalEventView.vue website/src/views/GlobalEventGlobalMouseView.vue website/src/views/GlobalEventModuleEventsView.vue website/src/views/GlobalEventKeyboardView.vue website/src/views/GlobalEventListenerControlView.vue
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add test/InteractionDocs.test.ts website/src/config/navigation.ts website/src/layouts/DocsLayout.vue website/src/assets/styles/index.scss website/src/router/index.ts website/src/views/GlobalEvent*.vue
git commit -m "docs: split GlobalEvent API pages"
```

---

### Task 2: Four focused demos and documentation rules

**Files:**
- Modify: `test/InteractionDocs.test.ts`
- Modify: `website/src/views/GlobalEventGlobalMouseView.vue`
- Modify: `website/src/views/GlobalEventModuleEventsView.vue`
- Modify: `website/src/views/GlobalEventKeyboardView.vue`
- Modify: `website/src/views/GlobalEventListenerControlView.vue`
- Modify: `website/src/examples/GlobalEventDemo.vue`
- Create: `website/src/examples/GlobalEventModuleDemo.vue`
- Create: `website/src/examples/GlobalEventKeyboardDemo.vue`
- Create: `website/src/examples/GlobalEventListenerControlDemo.vue`
- Modify: `website/AGENTS.md`

**Interfaces:**
- Consumes: four canonical method pages and overview type anchors from Task 1.
- Produces: one source/preview-paired runnable example per behavior page and durable maintenance rules.

- [ ] **Step 1: Write failing demo and rules tests**

Assert these exact view/example/anchor triples:

```ts
const demos = [
  ['GlobalEventGlobalMouseView.vue', 'GlobalEventDemo.vue', 'example-global-mouse-events'],
  ['GlobalEventModuleEventsView.vue', 'GlobalEventModuleDemo.vue', 'example-module-feature-events'],
  ['GlobalEventKeyboardView.vue', 'GlobalEventKeyboardDemo.vue', 'example-keyboard-events'],
  ['GlobalEventListenerControlView.vue', 'GlobalEventListenerControlDemo.vue', 'example-listener-control']
] as const;
```

For each pair assert the view imports both the component and `?raw`, the `ExampleBlock` preview/source pair matches, the example uses `createConfiguredLayer`, and cleanup calls occur before `.destroy()`.

Assert method coverage by example:

```ts
expect(globalMouseDemo).toContain('addMouseMoveEventByGlobal');
expect(globalMouseDemo).toContain('addMouseClickEventByGlobal');
expect(globalMouseDemo).toContain('hasGlobalMouseClickEvent');
expect(moduleDemo).toContain('addMouseClickEventByModule');
expect(moduleDemo).toContain('addMouseDblClickEventByModule');
expect(moduleDemo).toContain('hasModuleMouseClickEvent');
expect(moduleDemo).toContain('removeAllModuleEvents');
expect(keyboardDemo).toContain('addKeyDownEventByGlobal');
expect(keyboardDemo).toContain('hasGlobalKeyDownEvent');
expect(listenerDemo).toContain('enableGlobalMouseClickEvent');
expect(listenerDemo).toContain('disableGlobalMouseClickEvent');
```

Assert `website/AGENTS.md` contains the five exact concepts from the design: public constructors, prefer Earth `use*`, split by behavior family, one canonical method owner, and distinction among `disable*`, disposer, and `remove*`.

- [ ] **Step 2: Run target test and verify RED**

Run: `npm test -- test/InteractionDocs.test.ts`

Expected: FAIL because three example files and the new rules do not exist and existing GlobalEventDemo mixes global/module behavior.

- [ ] **Step 3: Implement the four examples**

Use the standard example skeleton:

```ts
const earthRef = shallowRef<Earth | null>(null);
const disposers: Array<() => void> = [];
onBeforeUnmount(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  earthRef.value?.destroy();
});
```

`GlobalEventDemo.vue` becomes global-only and updates visible state on pointer move/click while displaying `hasGlobalMouseClickEvent()`.

`GlobalEventModuleDemo.vue` creates a visible `PointLayer` feature with `module: 'event-demo'`, registers click and double-click callbacks, displays `hasModuleMouseClickEvent('event-demo')`, and provides a UI button that calls `removeAllModuleEvents('event-demo')` plus a button that re-registers both callbacks.

`GlobalEventKeyboardDemo.vue` provides buttons to register and cancel `addKeyDownEventByGlobal`, displays the last key and `hasGlobalKeyDownEvent()`, and makes the map container focus guidance visible even though the listener is attached to `document`.

`GlobalEventListenerControlDemo.vue` provides buttons that call `enableGlobalMouseClickEvent()`, `disableGlobalMouseClickEvent()`, and re-register a callback through `addMouseClickEventByGlobal`; its status uses `hasGlobalMouseClickEvent()`. Explain in the UI that disabling clears callbacks, so re-registration is required.

- [ ] **Step 4: Wire examples and right-side anchors**

Each behavior page gets one `ExampleBlock` using its exact stable anchor and same-name right-side child. Descriptions link demonstrated current-page method names with blue clickable `code-fn` anchors to `#api-methods`.

- [ ] **Step 5: Update maintenance rules**

Append the five design rules under `API 引用与跳转`, using explicit language that exported constructible tools show constructors before types/methods, Earth `use*` is preferred when available, large symmetric APIs split by behavior family, each method has one canonical owner, and cleanup terms must not be conflated.

- [ ] **Step 6: Run tests, docs build, and formatting**

Run:

```powershell
npm test -- test/InteractionDocs.test.ts
npx prettier --check test/InteractionDocs.test.ts website/AGENTS.md website/src/views/GlobalEvent*.vue website/src/examples/GlobalEvent*.vue
npm run docs:build
git diff --check
```

Expected: all commands exit 0; existing TypeDoc/Vite warnings may remain unchanged.

- [ ] **Step 7: Commit**

```powershell
git add test/InteractionDocs.test.ts website/AGENTS.md website/src/views/GlobalEvent*.vue website/src/examples/GlobalEvent*.vue
git commit -m "docs: add focused GlobalEvent examples"
```

---

### Task 3: Cross-page audit and final verification

**Files:**
- Modify if required by findings: `test/InteractionDocs.test.ts`
- Modify if required by findings: `website/src/views/GlobalMethodsView.vue`
- Modify if required by findings: files changed in Tasks 1–2
- Update ignored ledger: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: completed nested navigation, five pages, four examples, and maintenance rules.
- Produces: verified branch with no duplicate method ownership or broken GlobalEvent links.

- [ ] **Step 1: Audit links and ownership**

Search all website references to `/components/global-event` and verify every hash exists on the target page. Confirm `/components/global-event#api-methods` still resolves and that child pages link owned types to the overview.

- [ ] **Step 2: Run targeted and full verification**

Run:

```powershell
npm test -- test/InteractionDocs.test.ts
npm run verify
npm run docs:build
git diff --check
git status --short
```

Expected: all commands exit 0; `git status --short` shows only intentional Task 3 changes, if any.

- [ ] **Step 3: Perform whole-task review**

Review the complete range from `8806377` to `HEAD` for spec compliance, API ownership, Vue lifecycle safety, navigation behavior, and documentation style. Fix Critical or Important findings, rerun the covering tests, and re-review until approved.

- [ ] **Step 4: Commit audit fixes if present**

```powershell
git add test/InteractionDocs.test.ts website/src/config/navigation.ts website/src/layouts/DocsLayout.vue website/src/assets/styles/index.scss website/src/router/index.ts website/src/views/GlobalMethodsView.vue website/src/views/GlobalEvent*.vue website/src/examples/GlobalEvent*.vue website/AGENTS.md
git commit -m "test: audit GlobalEvent documentation links"
```

If no files changed, do not create an empty commit.
