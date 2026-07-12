# Base Layer Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete, runnable documentation pages for CircleLayer, PolygonLayer, BillboardLayer, OverlayLayer, and PolylineLayer.

**Architecture:** Each layer owns one View, one API adapter, and focused runnable Vue demos. The controller owns the shared documentation test plus navigation, router, and layout-title integration so task implementers never contend for common files.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, OpenLayers, Element Plus, TypeDoc-generated API metadata.

## Global Constraints

- Follow `website/AGENTS.md` and use `website/src/views/PointLayerView.vue` as the page design baseline.
- Every page contains 概述、何时使用、代码演示、API、注意事项 and a matching `PageAnchor` tree.
- Constructor uses `api-constructor` and `api-constructor__signature`; property and method tables use the required `presentation` values.
- Every layer-owned public method is called at least once by a runnable demo on its own page.
- Base-inherited methods are not redefined; link mentions to `/components/layer-common#api-methods`.
- `IFill`, `IStroke`, and `ILabel` link to their canonical PointLayer anchors; `IGeometryFill` is defined on CircleLayer and linked from PolygonLayer.
- All map demos use `createConfiguredLayer`; no tile service URL, token, account, or internal address may appear.
- Runnable preview and displayed source import the same Vue demo file, and every demo destroys its layer/Earth resources.
- Reuse existing document components and semantic theme styles; do not add a competing visual system.
- WindLayer is out of scope.

## Controller-owned integration

Before Task 1, create `test/BaseLayerDocs.test.ts` with one focused case per layer and a shared registry case. Each layer case reads its View, API adapter, and demos and asserts required sections, stable example anchors, method coverage, `createConfiguredLayer`, and cleanup. Run the complete file and record RED because all five pages are absent.

After Tasks 1-5, update only these common files:

- `website/src/config/navigation.ts`: add five 基础图层 entries.
- `website/src/router/index.ts`: import and register all five views.
- `website/src/layouts/DocsLayout.vue`: add all five page-title mappings.
- `test/BaseLayerDocs.test.ts`: keep the registry assertions that validate the common integration and absence of a WindLayer route.

Run `npx vitest run test/BaseLayerDocs.test.ts`, then `npm test`, then `npm run docs:build`.

---

### Task 1: CircleLayer documentation

**Files:**
- Create: `website/src/docs/circleLayerApi.ts`
- Create: `website/src/views/CircleLayerView.vue`
- Create: `website/src/examples/CircleLayerBasicDemo.vue`
- Create: `website/src/examples/CircleLayerPatternDemo.vue`
- Create: `website/src/examples/CircleLayerUpdateDemo.vue`
- Test: `test/BaseLayerDocs.test.ts` (`CircleLayer` focused case, controller-owned)

**Interfaces:**
- Consumes: `generatedApi.classes.CircleLayer`, `generatedApi.interfaces.ICircleParam`, `generatedApi.interfaces.ISetCircleParam`, existing document components, and `createConfiguredLayer`.
- Produces: default Vue component `CircleLayerView`; route-ready page with canonical `IGeometryFill` anchor `api-type-igeometryfill`.

- [ ] **Step 1: Verify RED**

Run: `npx vitest run test/BaseLayerDocs.test.ts -t CircleLayer`
Expected: FAIL because `CircleLayerView.vue` and its demos/API adapter do not exist.

- [ ] **Step 2: Implement API adapter and page**

Create the adapter using the same TypeDoc validation pattern as `pointLayerApi.ts`. Document `new CircleLayer(earth?, options?)`, `ICircleParam`, `ISetCircleParam`, `IGeometryFill`, and owned methods `add`, `set`, `setPosition`. Link `IStroke` and `ILabel` to PointLayer. Do not repeat Base methods in the API table.

- [ ] **Step 3: Implement runnable demos**

`CircleLayerBasicDemo.vue` calls `add`; `CircleLayerPatternDemo.vue` demonstrates pattern fill and calls `set`; `CircleLayerUpdateDemo.vue` calls `setPosition`. Each demo uses configured basemap creation and cleanup.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run test/BaseLayerDocs.test.ts -t CircleLayer`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `docs: add CircleLayer guide`

### Task 2: PolygonLayer documentation

**Files:**
- Create: `website/src/docs/polygonLayerApi.ts`
- Create: `website/src/views/PolygonLayerView.vue`
- Create: `website/src/examples/PolygonLayerBasicDemo.vue`
- Create: `website/src/examples/PolygonLayerStyleDemo.vue`
- Create: `website/src/examples/PolygonLayerUpdateDemo.vue`
- Test: `test/BaseLayerDocs.test.ts` (`PolygonLayer` focused case, controller-owned)

**Interfaces:**
- Consumes: `generatedApi.classes.PolygonLayer`, `IPolygonParam`, `ISetPolygonParam`, PointLayer style anchors, CircleLayer `IGeometryFill`, and `createConfiguredLayer`.
- Produces: default Vue component `PolygonLayerView`.

- [ ] **Step 1: Verify RED**

Run: `npx vitest run test/BaseLayerDocs.test.ts -t PolygonLayer`
Expected: FAIL because PolygonLayer documentation files do not exist.

- [ ] **Step 2: Implement API adapter and page**

Document `new PolygonLayer(earth?, options?)`, `IPolygonParam`, `ISetPolygonParam`, and owned methods `add`, `set`, `setPosition`. Link `IStroke` and `ILabel` to PointLayer and `IGeometryFill` to `/components/circle-layer#api-type-igeometryfill`.

- [ ] **Step 3: Implement runnable demos**

Basic demo calls `add`; style demo exercises main/background strokes and calls `set`; update demo calls `setPosition`. Use configured basemap creation and cleanup.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run test/BaseLayerDocs.test.ts -t PolygonLayer`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `docs: add PolygonLayer guide`

### Task 3: BillboardLayer documentation

**Files:**
- Create: `website/src/docs/billboardLayerApi.ts`
- Create: `website/src/views/BillboardLayerView.vue`
- Create: `website/src/examples/BillboardLayerBasicDemo.vue`
- Create: `website/src/examples/BillboardLayerStyleDemo.vue`
- Create: `website/src/examples/BillboardLayerUpdateDemo.vue`
- Test: `test/BaseLayerDocs.test.ts` (`BillboardLayer` focused case, controller-owned)

**Interfaces:**
- Consumes: `generatedApi.classes.BillboardLayer`, `IBillboardParam`, `ISetBillboardParam`, PointLayer `ILabel`, and `createConfiguredLayer`.
- Produces: default Vue component `BillboardLayerView`.

- [ ] **Step 1: Verify RED**

Run: `npx vitest run test/BaseLayerDocs.test.ts -t BillboardLayer`
Expected: FAIL because BillboardLayer documentation files do not exist.

- [ ] **Step 2: Implement API adapter and page**

Document `new BillboardLayer(earth?, options?)`, `IBillboardParam`, `ISetBillboardParam`, and owned methods `add`, `set`, `setPosition`, `getIconExtent`. Treat OpenLayers icon enums and sizes as external types.

- [ ] **Step 3: Implement runnable demos**

Basic demo calls `add`; style demo calls `set` for scale/rotation/anchor-related presentation; update demo calls `setPosition` and `getIconExtent`. Use a repository-local or data-URL marker asset, configured basemap creation, and cleanup.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run test/BaseLayerDocs.test.ts -t BillboardLayer`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `docs: add BillboardLayer guide`

### Task 4: OverlayLayer documentation

**Files:**
- Create: `website/src/docs/overlayLayerApi.ts`
- Create: `website/src/views/OverlayLayerView.vue`
- Create: `website/src/examples/OverlayLayerBasicDemo.vue`
- Create: `website/src/examples/OverlayLayerUpdateDemo.vue`
- Test: `test/BaseLayerDocs.test.ts` (`OverlayLayer` focused case, controller-owned)

**Interfaces:**
- Consumes: `generatedApi.classes.OverlayLayer`, `IOverlayParam`, `ISetOverlayParam`, existing document components, and `createConfiguredLayer`.
- Produces: default Vue component `OverlayLayerView` that explicitly states OverlayLayer does not inherit Base.

- [ ] **Step 1: Verify RED**

Run: `npx vitest run test/BaseLayerDocs.test.ts -t OverlayLayer`
Expected: FAIL because OverlayLayer documentation files do not exist.

- [ ] **Step 2: Implement API adapter and page**

Document `new OverlayLayer(earth?)`, `IOverlayParam`, `ISetOverlayParam`, and owned methods `add`, `set`, `setPosition`, `get`, `remove`. Do not show Base inherited APIs.

- [ ] **Step 3: Implement runnable demos**

Basic demo creates a DOM element and calls `add`, `get`, and `remove`; update demo calls `set` and `setPosition`. Use configured basemap creation and cleanup, including removing Overlay DOM/resources.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run test/BaseLayerDocs.test.ts -t OverlayLayer`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `docs: add OverlayLayer guide`

### Task 5: PolylineLayer documentation

**Files:**
- Create: `website/src/docs/polylineLayerApi.ts`
- Create: `website/src/views/PolylineLayerView.vue`
- Create: `website/src/examples/PolylineLayerBasicDemo.vue`
- Create: `website/src/examples/PolylineLayerArrowFlowDemo.vue`
- Create: `website/src/examples/PolylineLayerFlightDemo.vue`
- Create: `website/src/examples/PolylineLayerUpdateDemo.vue`
- Test: `test/BaseLayerDocs.test.ts` (`PolylineLayer` focused case, controller-owned)

**Interfaces:**
- Consumes: `generatedApi.classes.PolylineLayer`, `IPolylineParam`, `ISetPolylineParam`, `IPolylineFlyParam`, PointLayer style anchors, and `createConfiguredLayer`.
- Produces: default Vue component `PolylineLayerView`.

- [ ] **Step 1: Verify RED**

Run: `npx vitest run test/BaseLayerDocs.test.ts -t PolylineLayer`
Expected: FAIL because PolylineLayer documentation files do not exist.

- [ ] **Step 2: Implement API adapter and page**

Document `new PolylineLayer(earth?, options?)`, `IPolylineParam`, `ISetPolylineParam`, `IPolylineFlyParam`, and all owned methods: `add`, `addFlightLine`, `setPosition`, `remove`, `setFlightPosition`, `removeFlightLine`, `set`, `hide`, and `show`. Mark top-level `width` deprecated in favor of `stroke.width`.

- [ ] **Step 3: Implement runnable demos**

Basic demo calls `add`; arrow/flow demo covers arrow and flowing-dash configuration; flight demo calls `addFlightLine`, `setFlightPosition`, and `removeFlightLine`; update demo calls `setPosition`, `set`, `hide`, `show`, and `remove`. Use configured basemap creation and cleanup.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run test/BaseLayerDocs.test.ts -t PolylineLayer`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `docs: add PolylineLayer guide`
