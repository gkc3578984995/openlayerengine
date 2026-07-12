# ContextMenu Map Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all thirteen ContextMenu examples produce real, observable map changes while keeping the documentation focused on ContextMenu.

**Architecture:** Each existing example remains self-contained and owns its map plus any PointLayer/PolylineLayer resources it manipulates. ContextMenu callbacks invoke existing public Earth/Base APIs; descriptions state only user actions and visible outcomes.

**Tech Stack:** Vue 3, TypeScript, OpenLayers, Vitest.

## Global Constraints

- Do not change public ContextMenu, Base, or Earth APIs.
- Global examples must not register module menus; module examples must not register global menus.
- Every callback must change the map, not only feedback text.
- Preview and raw source remain the same Vue component.
- Do not add Base/Earth API teaching copy to ContextMenu pages.

---

### Task 1: Lock real-map interaction requirements

**Files:**
- Modify: `test/InteractionDocs.test.ts`

**Interfaces:**
- Consumes: the thirteen existing ContextMenu example sources.
- Produces: regression assertions for observable layer/map mutations.

- [ ] Add a table mapping each example to at least one required mutation token, such as `markerLayer.add`, `earth.flyTo`, `vehicleLayer.hide`, `vehicleLayer.remove`, `trackLayer.show`, or `trackLayer.hide`.
- [ ] Assert ContextMenu view descriptions do not mention `PointLayer`, `Base`, `Earth.flyTo`, or other auxiliary implementation APIs.
- [ ] Run `npm test -- test/InteractionDocs.test.ts`; expect failure because most callbacks currently only update feedback text.

### Task 2: Implement overview and global-menu interactions

**Files:**
- Modify: `website/src/examples/ContextMenuLifecycleDemo.vue`
- Modify: `website/src/examples/ContextMenuDefaultMenuDemo.vue`
- Modify: `website/src/examples/ContextMenuDefaultMenuCallbackDemo.vue`
- Modify: `website/src/examples/ContextMenuRemoveDefaultDemo.vue`

**Interfaces:**
- Consumes: callback `position`, `Earth.flyTo`, and a dedicated temporary PointLayer.
- Produces: add/clear marker, center movement, coordinate label, and remove/re-register behaviors.

- [ ] Create a dedicated marker layer in each example and map each menu key to a concrete mutation.
- [ ] Keep feedback text as a short confirmation after the map mutation.
- [ ] Verify the focused documentation test passes for these four examples.

### Task 3: Implement module-menu interactions

**Files:**
- Modify: `website/src/examples/ContextMenuModuleMenuDemo.vue`
- Modify: `website/src/examples/ContextMenuModuleMenuGuardDemo.vue`
- Modify: `website/src/examples/ContextMenuModuleMenuCallbackDemo.vue`
- Modify: `website/src/examples/ContextMenuRemoveModuleDemo.vue`

**Interfaces:**
- Consumes: callback `featureId`, vehicle PointLayer, task/status PointLayers, and existing module state APIs.
- Produces: vehicle focus, position update, visibility/removal, task/status markers, guarded changes, and state cleanup.

- [ ] Implement vehicle-only actions; never register a default menu.
- [ ] Ensure guarded edit/delete actions visibly move or remove a vehicle only when permission allows.
- [ ] Keep the vehicle on the map after `removeModuleMenu` while right-click behavior disappears.
- [ ] Verify the focused documentation test passes for these four examples.

### Task 4: Implement cascade, mutex, and state interactions

**Files:**
- Modify: `website/src/examples/ContextMenuNestedMenuDemo.vue`
- Modify: `website/src/examples/ContextMenuMutexMenuDemo.vue`
- Modify: `website/src/examples/ContextMenuVisibilityDemo.vue`
- Modify: `website/src/examples/ContextMenuStateToggleDemo.vue`
- Modify: `website/src/examples/ContextMenuThemeDemo.vue`

**Interfaces:**
- Consumes: separate vehicle, track, alarm, label and marker layers.
- Produces: nested action families, visible mutex results, per-feature state isolation, and a richer theme scene.

- [ ] Connect every leaf action to its matching layer; use show/hide for mutex pairs.
- [ ] Make visibility/state controls change both menu availability and a corresponding map object or layer.
- [ ] Keep the theme example focused on theme switching while presenting several map objects.
- [ ] Verify the focused documentation test passes for these five examples.

### Task 5: Update concise usage copy and verify

**Files:**
- Modify only ContextMenu views whose existing descriptions no longer match the interaction.

- [ ] Describe right-click target, menu choice, and map result without naming auxiliary APIs.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:build`, and `git diff --check`.
- [ ] Request code review, fix all Critical/Important findings, commit, merge to `master`, and remove the worktree.
