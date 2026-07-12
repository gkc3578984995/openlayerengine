# Remove ContextMenu `destory` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the deprecated `ContextMenu.destory()` alias while retaining `destroy()` and updating the ContextMenu documentation.

**Architecture:** Treat the typo alias as a removed public API. A source-and-documentation regression test establishes the desired surface before the class method and API-table row are deleted.

**Tech Stack:** TypeScript, Vue 3 documentation, Vitest, TypeDoc, Vite

## Global Constraints

- Keep `ContextMenu.destroy()` and all existing cleanup examples unchanged.
- Remove only the deprecated `destory()` alias and its documentation row.
- Public API and website documentation must stay synchronized.

---

### Task 1: Remove the deprecated alias and synchronize documentation

**Files:**
- Modify: `test/InteractionDocs.test.ts`
- Modify: `src/components/ContextMenu.ts`
- Modify: `website/src/views/ContextMenuCleanupView.vue`

**Interfaces:**
- Consumes: the existing `ContextMenu.destroy(): void` lifecycle method.
- Produces: a ContextMenu public surface with `destroy()` but without `destory()`.

- [ ] **Step 1: Write the failing regression test**

Add a test that reads the component source and cleanup page, requires `destroy(): void`, and rejects both a `destory(): void` declaration and a `name: 'destory'` API row:

```ts
it('removes the deprecated ContextMenu destory alias from source and documentation', async () => {
  const [source, cleanupView] = await Promise.all([
    readFile('src/components/ContextMenu.ts', 'utf8'),
    readFile('website/src/views/ContextMenuCleanupView.vue', 'utf8')
  ]);

  expect(source).toContain('destroy(): void');
  expect(source).not.toContain('destory(): void');
  expect(cleanupView).toContain("{ name: 'destroy'");
  expect(cleanupView).not.toContain("{ name: 'destory'");
});
```

- [ ] **Step 2: Verify the regression test fails**

Run: `npm test -- test/InteractionDocs.test.ts`

Expected: FAIL because the source still declares `destory(): void` and the cleanup API table still contains `name: 'destory'`.

- [ ] **Step 3: Remove the alias and documentation row**

Delete this method from `src/components/ContextMenu.ts`:

```ts
/** @deprecated 请使用 {@link destroy}。 */
destory(): void {
  this.destroy();
}
```

Delete this row from the lifecycle methods in `website/src/views/ContextMenuCleanupView.vue`:

```ts
{ name: 'destory', desc: '@deprecated 已废弃，请使用 destroy。', params: '—', returns: 'void' }
```

- [ ] **Step 4: Verify focused behavior**

Run: `npm test -- test/InteractionDocs.test.ts test/ContextMenu.test.ts`

Expected: both test files pass and the official `destroy()` coverage remains intact.

- [ ] **Step 5: Verify repository quality gates**

Run:

```powershell
npm run typecheck
npm run lint
npx prettier --check test/InteractionDocs.test.ts src/components/ContextMenu.ts website/src/views/ContextMenuCleanupView.vue
npm run docs:build
```

Expected: every command exits with code 0; existing non-blocking warnings may remain.

- [ ] **Step 6: Commit the implementation**

```powershell
git add test/InteractionDocs.test.ts src/components/ContextMenu.ts website/src/views/ContextMenuCleanupView.vue
git commit -m "refactor: remove deprecated ContextMenu destory alias"
```
