# Multi-Earth Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the remaining cross-instance context-menu and Transform-toolbar coupling, and correct the related multi-Earth documentation.

**Architecture:** Each `Earth` owns a stable `contextmenu` listener registered only on its OpenLayers viewport. `Transform` binds toolbar events through the exact `Toolbar` instance root instead of a global DOM selector. Regression tests exercise independent viewport and toolbar event targets before documentation wording is corrected.

**Tech Stack:** TypeScript 5, OpenLayers 7, Vitest 1, Vue 3 documentation site, Prettier, TypeDoc, Vite.

## Global Constraints

- Do not change the public signatures of `useEarth`, `destroyEarth`, or the `Earth` constructor.
- Do not split or refactor Transform geometry, history, or editing behavior.
- Do not suppress the browser context menu outside map viewports.
- A listener may call `preventDefault()` but must not stop propagation to the library's own context-menu handlers.
- Do not add a document-level reference counter or viewport registry.
- Do not export the Toolbar root accessor from a package entry point.
- Follow `website/AGENTS.md` link and API presentation rules.
- Use TDD: observe each new regression test fail before changing production code.

---

### Task 1: Scope browser context-menu suppression to each Earth viewport

**Files:**
- Modify: `test/EarthElementTarget.test.ts`
- Modify: `src/Earth.ts:84-90`
- Modify: `src/Earth.ts:157-191`
- Modify: `src/Earth.ts:570-600`

**Interfaces:**
- Consumes: `Map#getViewport(): HTMLElement`, `Earth#destroy(): void`.
- Produces: a stable per-instance `closeRightMenu: (event: MouseEvent) => void` callback owned by each `Earth`.

- [ ] **Step 1: Write the failing viewport-isolation test**

Extend the mocked `TestMap` in `test/EarthElementTarget.test.ts` with its own event target:

```ts
private readonly viewport = new EventTarget();

getViewport(): HTMLElement {
  return this.viewport as unknown as HTMLElement;
}
```

Make `afterEach` clean every registry key used by the file:

```ts
afterEach(() => {
  for (const id of ['element-target', 'context-first', 'context-second']) destroyEarth(id);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});
```

Add this regression test:

```ts
it('scopes browser context-menu suppression to each viewport and cleans instances independently', () => {
  const documentAddEventListener = vi.fn();
  const documentRemoveEventListener = vi.fn();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      addEventListener: documentAddEventListener,
      removeEventListener: documentRemoveEventListener
    }
  });

  const first = useEarth({ id: 'context-first', target: { id: 'first-map' } as HTMLElement });
  const second = useEarth({ id: 'context-second', target: { id: 'second-map' } as HTMLElement });
  const firstViewport = first.map.getViewport();
  const secondViewport = second.map.getViewport();
  const packagedMenuHandler = vi.fn();
  secondViewport.addEventListener('contextmenu', packagedMenuHandler);

  const firstEvent = new Event('contextmenu', { cancelable: true });
  const secondEvent = new Event('contextmenu', { cancelable: true });
  firstViewport.dispatchEvent(firstEvent);
  secondViewport.dispatchEvent(secondEvent);

  expect(firstEvent.defaultPrevented).toBe(true);
  expect(secondEvent.defaultPrevented).toBe(true);
  expect(packagedMenuHandler).toHaveBeenCalledTimes(1);
  expect(documentAddEventListener).not.toHaveBeenCalled();

  first.destroy();

  const destroyedViewportEvent = new Event('contextmenu', { cancelable: true });
  const activeViewportEvent = new Event('contextmenu', { cancelable: true });
  firstViewport.dispatchEvent(destroyedViewportEvent);
  secondViewport.dispatchEvent(activeViewportEvent);

  expect(destroyedViewportEvent.defaultPrevented).toBe(false);
  expect(activeViewportEvent.defaultPrevented).toBe(true);
  expect(documentRemoveEventListener).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test and verify the old implementation fails**

Run:

```bash
npx vitest run test/EarthElementTarget.test.ts
```

Expected: FAIL because viewport events are not prevented and `document.addEventListener` is called.

- [ ] **Step 3: Implement viewport-owned listener lifecycle**

Replace the prototype method in `src/Earth.ts` with an instance-owned stable callback:

```ts
private readonly closeRightMenu = (event: MouseEvent): void => {
  event.preventDefault();
};
```

In `closeDefaultEvent`, replace the document registration:

```ts
this.map.getViewport().addEventListener('contextmenu', this.closeRightMenu);
```

In `destroy`, replace the document removal before clearing the map:

```ts
this.map.getViewport().removeEventListener('contextmenu', this.closeRightMenu);
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npx vitest run test/EarthElementTarget.test.ts
```

Expected: all tests in `EarthElementTarget.test.ts` PASS.

- [ ] **Step 5: Commit the Earth lifecycle fix**

```bash
git add src/Earth.ts test/EarthElementTarget.test.ts
git commit -m "fix: isolate earth context menu listeners"
```

---

### Task 2: Bind Transform events to the exact Toolbar instance

**Files:**
- Modify: `test/TransformMultiEarth.test.ts`
- Modify: `src/extends/toolbar/Toolbar.ts:25-65`
- Modify: `src/components/Transform.ts:770-800`

**Interfaces:**
- Consumes: `Toolbar#getRootElement(): HTMLDivElement | null`.
- Produces: `Transform#bindToolbarEvents(toolbar: Toolbar): void`, an internal instance-scoped binding boundary.

- [ ] **Step 1: Write failing toolbar-isolation tests**

Add these imports to `test/TransformMultiEarth.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import Transform from '../src/components/Transform';
import { Toolbar } from '../src/extends/toolbar/Toolbar';
```

Add an event helper and the following tests:

```ts
class DetailEvent<T> extends Event {
  readonly detail: T;

  constructor(type: string, detail: T) {
    super(type);
    this.detail = detail;
  }
}

it('keeps each Toolbar root element instance-local', () => {
  const firstRoot = new EventTarget() as unknown as HTMLDivElement;
  const secondRoot = new EventTarget() as unknown as HTMLDivElement;
  const firstToolbar = Object.create(Toolbar.prototype) as { rootEl: HTMLDivElement; getRootElement(): HTMLDivElement | null };
  const secondToolbar = Object.create(Toolbar.prototype) as { rootEl: HTMLDivElement; getRootElement(): HTMLDivElement | null };
  firstToolbar.rootEl = firstRoot;
  secondToolbar.rootEl = secondRoot;

  expect(firstToolbar.getRootElement()).toBe(firstRoot);
  expect(secondToolbar.getRootElement()).toBe(secondRoot);
});

it('routes toolbar events only to the Transform bound to that Toolbar', () => {
  const firstRoot = new EventTarget();
  const secondRoot = new EventTarget();
  const firstTransform = Object.create(Transform.prototype) as any;
  const secondTransform = Object.create(Transform.prototype) as any;
  firstTransform.baseTransformTipFlag = 'first';
  secondTransform.baseTransformTipFlag = 'second';
  firstTransform.updateHelpTooltip = vi.fn();
  secondTransform.updateHelpTooltip = vi.fn();
  firstTransform.handleToolbarClick = vi.fn();
  secondTransform.handleToolbarClick = vi.fn();

  firstTransform.bindToolbarEvents({ getRootElement: () => firstRoot });
  secondTransform.bindToolbarEvents({ getRootElement: () => secondRoot });

  const detail = { key: 'remove', item: { title: '删除' }, pixel: [12, 24] };
  firstRoot.dispatchEvent(new DetailEvent('toolbar:itementer', { item: detail.item }));
  firstRoot.dispatchEvent(new DetailEvent('toolbar:itemleave', {}));
  firstRoot.dispatchEvent(new DetailEvent('toolbar:itemclick', detail));

  expect(firstTransform.updateHelpTooltip).toHaveBeenCalledWith('删除');
  expect(firstTransform.updateHelpTooltip).toHaveBeenCalledWith('first');
  expect(firstTransform.handleToolbarClick).toHaveBeenCalledWith(detail, detail.pixel);
  expect(secondTransform.updateHelpTooltip).not.toHaveBeenCalled();
  expect(secondTransform.handleToolbarClick).not.toHaveBeenCalled();
});

it('does not query a global toolbar element', async () => {
  const source = await readFile('src/components/Transform.ts', 'utf8');

  expect(source).not.toContain("document.querySelector('.ol-toolbar')");
  expect(source).toContain('this.bindToolbarEvents(this.toolbar)');
});
```

- [ ] **Step 2: Run the test and verify the old implementation fails**

Run:

```bash
npx vitest run test/TransformMultiEarth.test.ts
```

Expected: FAIL because `Toolbar#getRootElement` and `Transform#bindToolbarEvents` do not exist, and the global query is still present.

- [ ] **Step 3: Expose the internal Toolbar root**

Add this method to `Toolbar` after `createOverlay`:

```ts
getRootElement(): HTMLDivElement | null {
  return this.rootEl;
}
```

Do not export a new symbol from any package entry.

- [ ] **Step 4: Move Transform event registration behind an instance method**

Add this method immediately before `createToolbar`:

```ts
private bindToolbarEvents(toolbar: Toolbar): void {
  const toolbarRoot = toolbar.getRootElement();
  if (!toolbarRoot) return;
  toolbarRoot.addEventListener('toolbar:itementer', (event: Event) => {
    const detail = (event as CustomEvent).detail;
    this.updateHelpTooltip(detail.item.title);
  });
  toolbarRoot.addEventListener('toolbar:itemleave', () => {
    this.updateHelpTooltip(this.baseTransformTipFlag);
  });
  toolbarRoot.addEventListener('toolbar:itemclick', (event: Event) => {
    const detail = (event as CustomEvent).detail;
    this.handleToolbarClick(detail, detail.pixel);
  });
}
```

Replace the global query and listeners in `createToolbar` with:

```ts
this.toolbar = new Toolbar(params, this.earth);
this.bindToolbarEvents(this.toolbar);
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
npx vitest run test/TransformMultiEarth.test.ts
```

Expected: all tests in `TransformMultiEarth.test.ts` PASS.

- [ ] **Step 6: Commit the Transform isolation fix**

```bash
git add src/components/Transform.ts src/extends/toolbar/Toolbar.ts test/TransformMultiEarth.test.ts
git commit -m "fix: isolate transform toolbar events"
```

---

### Task 3: Correct the named-instance documentation contract

**Files:**
- Modify: `test/UseEarthDocs.test.ts`
- Modify: `website/src/views/EarthCreateView.vue:248-258`

**Interfaces:**
- Consumes: the existing `#api-constructor` and `#api-type-use-earth-options` anchors.
- Produces: accurate guidance for named registry IDs and distinct map containers.

- [ ] **Step 1: Write the failing documentation test**

Add this test to `test/UseEarthDocs.test.ts`:

```ts
it('distinguishes named registry ids from map container isolation', async () => {
  const earthCreate = await readFile('website/src/views/EarthCreateView.vue', 'utf8');

  expect(earthCreate).toContain('同时存在的命名实例应使用不同的');
  expect(earthCreate).toContain('默认实例和直接调用');
  expect(earthCreate).toContain('无需注册');
  expect(earthCreate).toContain('所有并存地图都应绑定不同的 DOM 容器');
  expect(earthCreate).not.toMatch(/每个\s*<code><a href="#api-constructor">Earth<\/a><\/code>\s*实例必须使用不同的/);
});
```

- [ ] **Step 2: Run the test and verify the old documentation fails**

Run:

```bash
npx vitest run test/UseEarthDocs.test.ts
```

Expected: FAIL because the page still says every Earth must use a different ID.

- [ ] **Step 3: Replace the inaccurate tip while preserving page anchors**

Replace the final multi-instance tip in `website/src/views/EarthCreateView.vue` with this exact structure and wording:

```vue
<li>
  同时存在的命名实例应使用不同的 <code><a href="#api-type-use-earth-options">id</a></code
  >；默认实例和直接调用 <code><a href="#api-constructor">new Earth()</a></code> 创建的实例无需注册
  <code><a href="#api-type-use-earth-options">id</a></code
  >。所有并存地图都应绑定不同的 DOM 容器。
</li>
```

- [ ] **Step 4: Run documentation tests and formatting checks**

Run:

```bash
npx vitest run test/UseEarthDocs.test.ts
npx prettier --check website/src/views/EarthCreateView.vue test/UseEarthDocs.test.ts
```

Expected: all `UseEarthDocs` tests PASS and both files match Prettier formatting.

- [ ] **Step 5: Commit the documentation correction**

```bash
git add website/src/views/EarthCreateView.vue test/UseEarthDocs.test.ts
git commit -m "docs: clarify multi-earth instance ids"
```

---

### Task 4: Run release-level verification and independent review

**Files:**
- Verify only: all tracked files changed by Tasks 1-3.

**Interfaces:**
- Consumes: the three task commits.
- Produces: a clean, reviewed branch with no Critical or Important findings.

- [ ] **Step 1: Run focused regression tests together**

```bash
npx vitest run test/EarthElementTarget.test.ts test/TransformMultiEarth.test.ts test/UseEarthDocs.test.ts
```

Expected: all selected test files PASS.

- [ ] **Step 2: Run the repository verification gate**

```bash
npm run verify
```

Expected: typecheck, lint, production build, package contract tests, and the full Vitest suite PASS; lint warnings may remain but there must be zero lint errors.

- [ ] **Step 3: Build and validate the documentation site**

```bash
npm run docs:build
```

Expected: TypeDoc API coverage reports zero errors and the Vite documentation build succeeds.

- [ ] **Step 4: Check formatting boundaries and repository state**

```bash
git diff --check
git status --short
```

Expected: `git diff --check` prints nothing and `git status --short` is empty.

- [ ] **Step 5: Request a fresh read-only code review**

Review the range from commit `6bf5da7` through the new HEAD. Require explicit checks for viewport listener ownership, Toolbar DOM isolation, test realism, document wording, and the absence of Transform internal refactoring.

Expected: no Critical or Important findings. If an Important finding is valid, return to the relevant task and repeat its RED/GREEN cycle before declaring completion.
