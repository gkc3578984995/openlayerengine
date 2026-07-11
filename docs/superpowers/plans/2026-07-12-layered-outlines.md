# Layered Outlines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fast visual outer/inner outlines to polygon and polyline features, remove the unused parallel-overlay system, and provide automated plus controllable browser-demo coverage.

**Architecture:** A polygon or line remains one OpenLayers feature. Its outer and inner borders are a back-to-front `Style[]`, so panning and zooming only rerender the existing geometry. `Transform` preserves the style array while it synchronizes geometry; `DynamicDraw` maps the same options into both its temporary sketch and its saved feature. Browser demos move behind a lifecycle-aware registry and control panel.

**Tech Stack:** TypeScript 5.4, OpenLayers 7.5, Vitest 1.6, Vite 4, Sass.

## Global Constraints

- Preserve existing `stroke` behavior when neither `outerStroke` nor `innerStroke` is supplied.
- `outerStroke` is painted first; `innerStroke` is painted second and overrides legacy `stroke` when present.
- Do not create offset geometries or view-change listeners for visual outlines.
- Remove `parallelOverlayOnTop`, `parallelOverlayStroke`, and `isParallelOverlay`; no migration path is required.
- Do not alter `CircleLayer` or other non-polygon/non-polyline public APIs.
- Keep generated `dist/` files out of commits.

---

### Task 1: Define layered-outline public types and lock behavior with unit tests

**Files:**
- Modify: `src/interface/default.ts:308-346,348-459`
- Modify: `src/interface/dynamicDraw.ts:107-134`
- Create: `test/LayeredOutline.test.ts`

**Interfaces:**
- Produces `outerStroke?: IStroke` and `innerStroke?: IStroke` on `IPolygonParam`, `ISetPolygonParam`, `IPolylineParam`, `ISetPolylineParam`, `IDrawLine`, and `IDrawPolygon`.
- `innerStroke` is the foreground style. When it is absent, legacy `stroke` is the foreground fallback.

- [ ] **Step 1: Write the failing layer-style tests.**

```ts
import { describe, expect, it, vi } from 'vitest';
import { Style } from 'ol/style';
import PolygonLayer from '../src/base/PolygonLayer';
import PolylineLayer from '../src/base/PolylineLayer';

const earth = () => ({ map: { addLayer: vi.fn() }, _autoRegisterLayer: vi.fn(), removeLayer: vi.fn(), removeRegisteredLayer: vi.fn() }) as any;
const polygon = [[[0, 0], [10, 0], [10, 10], [0, 0]]];

const asStyles = (style: Style | Style[] | undefined) => (Array.isArray(style) ? style : [style!]);

describe('layered outlines', () => {
  it('keeps a legacy polygon stroke as one style', () => {
    const feature = new PolygonLayer(earth()).add({ positions: polygon, stroke: { color: '#111', width: 3 } });
    expect(feature.getStyle()).toBeInstanceOf(Style);
  });

  it('renders polygon outerStroke before innerStroke and preserves its fill', () => {
    const feature = new PolygonLayer(earth()).add({
      positions: polygon,
      fill: { color: '#ffffff33' },
      outerStroke: { color: '#00ff36', width: 10, lineDash: [10, 6] },
      innerStroke: { color: '#ff0000', width: 4 }
    });
    const styles = asStyles(feature.getStyle() as Style[]);
    expect(styles).toHaveLength(2);
    expect(styles[0].getStroke()?.getColor()).toBe('#00ff36');
    expect(styles[0].getFill()).toBeNull();
    expect(styles[1].getStroke()?.getColor()).toBe('#ff0000');
    expect(styles[1].getFill()?.getColor()).toBe('#ffffff33');
  });

  it('uses legacy stroke as the foreground when only an outer polyline stroke is supplied', () => {
    const feature = new PolylineLayer(earth()).add({
      positions: [[0, 0], [10, 0]],
      stroke: { color: '#000', width: 5 },
      outerStroke: { color: '#f00', width: 11 }
    });
    expect(asStyles(feature.getStyle() as Style[]).map((style) => style.getStroke()?.getColor())).toEqual(['#f00', '#000']);
  });
});
```

- [ ] **Step 2: Run the new test to confirm the API is missing.**

Run: `npm test -- --run test/LayeredOutline.test.ts`

Expected: TypeScript/Vitest fails because `outerStroke` and `innerStroke` are not declared and the feature still exposes one style.

- [ ] **Step 3: Add the optional fields with the documented precedence.**

```ts
/** Back-most visual outline. It is drawn before innerStroke. */
outerStroke?: IStroke;
/** Foreground visual outline. It takes precedence over legacy stroke. */
innerStroke?: IStroke;
```

Add those exact declarations to every type listed in this task. Keep all existing `strokeColor` and `strokeWidth` declarations in DynamicDraw as legacy input fields.

- [ ] **Step 4: Run type checking and the focused test.**

Run: `npm run typecheck && npm test -- --run test/LayeredOutline.test.ts`

Expected: typecheck passes; the rendering assertions still fail until Task 2.

- [ ] **Step 5: Commit the type contract and failing test.**

```powershell
git add src/interface/default.ts src/interface/dynamicDraw.ts test/LayeredOutline.test.ts
git commit -m "test: define layered outline contract"
```

### Task 2: Render visual outlines without duplicating geometry

**Files:**
- Modify: `src/base/Base.ts:73-88`
- Modify: `src/base/PolygonLayer.ts:49-60,93-112`
- Modify: `src/base/PolylineLayer.ts:64-133,686-696`
- Modify: `test/LayeredOutline.test.ts`

**Interfaces:**
- Consumes the six new optional stroke fields from Task 1.
- Produces `Base.setLayeredStroke(style, stroke, outerStroke, innerStroke, width?)`, returning `Style | Style[]` in back-to-front order.

- [ ] **Step 1: Extend the test with partial update coverage.**

```ts
it('reapplies polygon layered styles after set without losing its label or fill', () => {
  const layer = new PolygonLayer(earth());
  const feature = layer.add({ positions: polygon, fill: { color: '#abcdef' }, label: { text: 'area' }, stroke: { color: '#000', width: 2 } });
  layer.set({ id: String(feature.getId()), outerStroke: { color: '#f00', width: 8 }, innerStroke: { color: '#111', width: 3 } });
  const styles = asStyles(feature.getStyle() as Style[]);
  expect(styles).toHaveLength(2);
  expect(styles[1].getFill()?.getColor()).toBe('#abcdef');
  expect(styles[1].getText()?.getText()).toBe('area');
});
```

- [ ] **Step 2: Run the focused test and confirm style-array assertions fail.**

Run: `npm test -- --run test/LayeredOutline.test.ts`

Expected: FAIL because `PolygonLayer.applyPolygonStyle` and `PolylineLayer.createFeature` still call only `setStroke`.

- [ ] **Step 3: Add the shared Base helper and use it in both layers.**

```ts
protected setLayeredStroke(style: Style, stroke?: IStroke, outerStroke?: IStroke, innerStroke?: IStroke, width?: number): Style | Style[] {
  const foreground = innerStroke ?? stroke;
  const primary = this.setStroke(style, foreground, width);
  if (!outerStroke) return primary;
  const outer = this.setStroke(new Style(), outerStroke, width);
  return [outer, primary];
}
```

In `PolygonLayer.applyPolygonStyle`, build fill and text on `style`, then call `feature.setStyle(this.setLayeredStroke(style, param.stroke, param.outerStroke, param.innerStroke))`.

In `PolylineLayer.createFeature`, build fill and text on `baseStyle`, then use `setLayeredStroke` on the non-`fitPatternOnce` path. For the `fitPatternOnce` style-function path, retain its dynamic foreground dash calculation and return `[outerStyle, cachedForegroundStyle]` when `outerStroke` exists; create `outerStyle` once outside the style function. This prevents per-frame creation of the outer style.

Merge `outerStroke` and `innerStroke` in `PolygonLayer.set` exactly as for `stroke`:

```ts
outerStroke: param.outerStroke ? { ...stored.outerStroke, ...param.outerStroke } : stored.outerStroke,
innerStroke: param.innerStroke ? { ...stored.innerStroke, ...param.innerStroke } : stored.innerStroke,
```

`PolylineLayer.set` already recreates from `Object.assign(oldParam, param)`, so its new fields are preserved by the existing path.

- [ ] **Step 4: Run focused outline and pattern-fill tests.**

Run: `npm test -- --run test/LayeredOutline.test.ts test/PolygonPatternLayer.test.ts`

Expected: PASS. Pattern-fill tests continue to assert that the foreground style contains the generated fill.

- [ ] **Step 5: Commit the rendering change.**

```powershell
git add src/base/Base.ts src/base/PolygonLayer.ts src/base/PolylineLayer.ts test/LayeredOutline.test.ts
git commit -m "feat: add layered polygon and polyline outlines"
```

### Task 3: Delete parallel overlays and make Transform snapshot style arrays safely

**Files:**
- Modify: `src/base/PolylineLayer.ts:20-43,330-540,555-624`
- Modify: `src/interface/default.ts:391-401,449-459`
- Modify: `src/common/featureKeys.ts:30-34`
- Modify: `src/components/Transform.ts:136-145,470-490,580-640,1319-1355`
- Create: `src/components/transform/styleSnapshot.ts`
- Create: `test/TransformStyleSnapshot.test.ts`
- Modify: `test/LayeredOutline.test.ts`

**Interfaces:**
- Produces `cloneStyleSnapshot(style: Style | Style[] | StyleFunction | undefined)`; a style array becomes a new array of `Style.clone()` values and a style function is retained unchanged.
- Removes all public and internal parallel-overlay identifiers.

- [ ] **Step 1: Write failing snapshot and no-overlay tests.**

```ts
import { describe, expect, it } from 'vitest';
import { Stroke, Style } from 'ol/style';
import { cloneStyleSnapshot } from '../src/components/transform/styleSnapshot';

describe('Transform style snapshots', () => {
  it('clones every style in a layered array', () => {
    const original = [new Style({ stroke: new Stroke({ color: '#f00', width: 8 }) }), new Style({ stroke: new Stroke({ color: '#000', width: 3 }) })];
    const copy = cloneStyleSnapshot(original) as Style[];
    expect(copy).not.toBe(original);
    expect(copy[0]).not.toBe(original[0]);
    expect(copy[0].getStroke()?.getColor()).toBe('#f00');
  });
});
```

Append to `LayeredOutline.test.ts`:

```ts
it('renders a layered polyline as one feature and retains no parallel-overlay state', () => {
  const layer = new PolylineLayer(earth());
  layer.add({ positions: [[0, 0], [10, 0]], outerStroke: { color: '#f00', width: 8 }, innerStroke: { color: '#000', width: 3 } });
  expect(layer.getLayer().getSource()?.getFeatures()).toHaveLength(1);
  expect((layer as any).parallelOverlayMap).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused tests and confirm missing helper/failing feature-count behavior.**

Run: `npm test -- --run test/TransformStyleSnapshot.test.ts test/LayeredOutline.test.ts`

Expected: FAIL because `cloneStyleSnapshot` does not exist and `PolylineLayer` still retains `parallelOverlayMap`.

- [ ] **Step 3: Remove all parallel-overlay code and use the snapshot helper.**

Delete `parallelOverlayMap`, `parallelOverlaySyncKeys`, `buildParallelOffsetPositions`, all `add/sync/ensure/clear` parallel-overlay methods, the add-time overlay creation, the set-position synchronization call, and the overlay-specific remove cleanup from `PolylineLayer`.

Delete `parallelOverlayOnTop` and `parallelOverlayStroke` from both polyline parameter interfaces and delete `FEATURE_KEYS.isParallelOverlay`.

Implement the snapshot helper:

```ts
import type { StyleFunction } from 'ol/style/Style';
import { Style } from 'ol/style';

export function cloneStyleSnapshot(style: Style | Style[] | StyleFunction | undefined): Style | Style[] | StyleFunction | undefined {
  if (Array.isArray(style)) return style.map((item) => item.clone());
  if (style instanceof Style) return style.clone();
  return style;
}
```

Replace Transform's inline `style.clone ? style.clone() : style` logic with `cloneStyleSnapshot(style)`. Remove the Transform selection filter, early return, comments, and synchronization wording that mention `isParallelOverlay`; keep ordinary polyline coordinate synchronization.

- [ ] **Step 4: Run focused tests, the Transform suite, and typecheck.**

Run: `npm run typecheck && npm test -- --run test/LayeredOutline.test.ts test/TransformStyleSnapshot.test.ts test/TransformHistory.test.ts test/TransformGeometry.test.ts`

Expected: PASS. No source file contains `parallelOverlay` or `isParallelOverlay`.

- [ ] **Step 5: Commit the removal and Transform safety fix.**

```powershell
git add src/base/PolylineLayer.ts src/interface/default.ts src/common/featureKeys.ts src/components/Transform.ts src/components/transform/styleSnapshot.ts test/LayeredOutline.test.ts test/TransformStyleSnapshot.test.ts
git commit -m "refactor: remove parallel polyline overlays"
```

### Task 4: Carry layered options through DynamicDraw and test preview/save parity

**Files:**
- Modify: `src/components/DynamicDraw.ts:131-139,180-230,384-414`
- Modify: `test/DynamicDraw.lifecycle.test.ts`

**Interfaces:**
- Consumes `IDrawLine.outerStroke`, `IDrawLine.innerStroke`, `IDrawPolygon.outerStroke`, and `IDrawPolygon.innerStroke`.
- Produces `buildDrawLineStyle` and `buildDrawPolygonStyle`, each returning the persisted layer parameters and `buildDrawPreviewStyle`, returning `Style | Style[]` for OpenLayers Draw.

- [ ] **Step 1: Add failing DynamicDraw style-builder assertions.**

```ts
import { Style } from 'ol/style';

it('uses the same outer and inner strokes for polygon preview and saved parameters', () => {
  const draw = Object.create(DynamicDraw.prototype) as any;
  const param = { strokeColor: '#ffcc33', strokeWidth: 2, outerStroke: { color: '#00ff36', width: 8, lineDash: [10, 6] }, innerStroke: { color: '#f00', width: 4 } };
  const saved = draw.buildDrawPolygonStyle(param);
  const preview = draw.buildDrawPreviewStyle('Polygon', param);
  expect(saved.outerStroke).toEqual(param.outerStroke);
  expect(saved.innerStroke).toEqual(param.innerStroke);
  expect(Array.isArray(preview) ? preview : [preview]).toHaveLength(2);
  expect((Array.isArray(preview) ? preview[0] : preview).getStroke()?.getColor()).toBe('#00ff36');
});
```

- [ ] **Step 2: Run the DynamicDraw-focused test to confirm the private builders are absent.**

Run: `npm test -- --run test/DynamicDraw.lifecycle.test.ts`

Expected: FAIL with `buildDrawPreviewStyle is not a function`.

- [ ] **Step 3: Implement one legacy-to-layered conversion and use it at both call sites.**

Implement `buildDrawLineStyle` and update `buildDrawPolygonStyle` to return the legacy `stroke`, plus `outerStroke: param?.outerStroke` and `innerStroke: param?.innerStroke`.

Implement `buildDrawPreviewStyle(type, param)` as follows: construct the foreground `Style` with the existing fill, point image, and `new Stroke(innerStroke ?? legacyStroke)`; if `outerStroke` is present and `type` is `LineString` or `Polygon`, return `[new Style({ stroke: new Stroke(outerStroke) }), foreground]`; otherwise return the foreground style. Use this method as the `Draw` interaction's `style` option.

Replace inline final-feature literals in `drawChange` with `...this.buildDrawLineStyle(lineParam)` and `...this.buildDrawPolygonStyle(polygonParam)`. Do not change the blue temporary layers used by edit and plot-edit sessions.

- [ ] **Step 4: Run DynamicDraw and outline tests.**

Run: `npm test -- --run test/DynamicDraw.lifecycle.test.ts test/LayeredOutline.test.ts && npm run typecheck`

Expected: PASS. The preview and persisted parameter assertions agree.

- [ ] **Step 5: Commit DynamicDraw support.**

```powershell
git add src/components/DynamicDraw.ts test/DynamicDraw.lifecycle.test.ts
git commit -m "feat: preview layered outlines while drawing"
```

### Task 5: Replace the browser test entry with a lifecycle-aware control panel

**Files:**
- Create: `.test/harness/demoRegistry.ts`
- Create: `.test/harness/demoPanel.ts`
- Create: `.test/harness/demoPanel.scss`
- Create: `.test/features/LayeredOutline.ts`
- Modify: `.test/main.ts`
- Modify: `.test/base/BillboardLayer.ts`, `.test/base/CircleLayer.ts`, `.test/base/OverlayLayer.ts`, `.test/base/PointLayer.ts`, `.test/base/PolygonLayer.ts`, `.test/base/PolylineLayer.ts`, `.test/base/WindLayer.ts`
- Modify: `.test/components/ContextMenu.ts`, `.test/components/Descriptor.ts`, `.test/components/DynamicDraw.ts`, `.test/components/GlobalEvent.ts`, `.test/components/Measure.ts`, `.test/components/Transform.ts`
- Create: `test/DemoRegistry.test.ts`

**Interfaces:**
- Produces `DemoCleanup = () => void`, `DemoDefinition`, and `DemoRegistry`.
- Every existing browser-demo function returns `DemoCleanup`; its cleanup calls the concrete layer/component destroy/remove method and removes DOM nodes it created.

- [ ] **Step 1: Write the failing registry lifecycle test.**

```ts
import { describe, expect, it, vi } from 'vitest';
import { DemoRegistry } from '../.test/harness/demoRegistry';

it('mounts once and cleans a demo when disabled', () => {
  const cleanup = vi.fn();
  const mount = vi.fn(() => cleanup);
  const registry = new DemoRegistry([{ id: 'outline', group: 'Features', label: 'Layered outline', mount }]);
  registry.enable('outline');
  registry.enable('outline');
  registry.disable('outline');
  expect(mount).toHaveBeenCalledTimes(1);
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(registry.isEnabled('outline')).toBe(false);
});
```

- [ ] **Step 2: Run the focused registry test to confirm the harness is absent.**

Run: `npm test -- --run test/DemoRegistry.test.ts`

Expected: FAIL because `.test/harness/demoRegistry` does not exist.

- [ ] **Step 3: Implement the registry and panel.**

```ts
export type DemoCleanup = () => void;
export interface DemoDefinition { id: string; group: string; label: string; mount: () => void | DemoCleanup; }

export class DemoRegistry {
  private readonly demos = new Map<string, DemoDefinition>();
  private readonly cleanups = new Map<string, DemoCleanup>();
  constructor(demos: DemoDefinition[]) { demos.forEach((demo) => this.demos.set(demo.id, demo)); }
  isEnabled(id: string) { return this.cleanups.has(id); }
  enable(id: string) { if (this.cleanups.has(id)) return; const demo = this.demos.get(id); if (!demo) throw new Error(`Unknown demo: ${id}`); this.cleanups.set(id, demo.mount() ?? (() => {})); }
  disable(id: string) { const cleanup = this.cleanups.get(id); if (!cleanup) return; cleanup(); this.cleanups.delete(id); }
  clear() { [...this.cleanups.keys()].forEach((id) => this.disable(id)); }
  enableAll() { [...this.demos.keys()].forEach((id) => this.enable(id)); }
}
```

`demoPanel.ts` creates an `<aside class="demo-panel">` with group headings, a checkbox for each `DemoDefinition`, and `Enable all` / `Clear all` buttons. Checkbox changes call `registry.enable(id)` or `registry.disable(id)`. Its returned cleanup removes the `<aside>` and calls `registry.clear()`.

Refactor each listed demo module so it stores all objects it creates in local variables and returns a cleanup. For a `Base` layer use `layer.remove(); layer.destroy();`; for an interaction/component use its public `destroy()` or `remove()` method; for an element appended to `document.body`, call `element.remove()` in the same cleanup. Remove the currently unused `parallelOverlayOnTop` sample from `.test/base/PolylineLayer.ts` and replace it with `outerStroke`/`innerStroke`.

Implement `.test/features/LayeredOutline.ts` with one `PolygonLayer` and one `PolylineLayer`, using `outerStroke`/`innerStroke` values from the supplied examples; return a cleanup that calls `remove()` then `destroy()` on both layers.

Update `.test/main.ts` to initialize the base map once, register every refactored demo plus `LayeredOutline`, import `demoPanel.scss`, and call `createDemoPanel(registry, demos)`. Do not invoke any demo directly from `window.onload`.

- [ ] **Step 4: Run registry tests and manually verify the Vite demo.**

Run: `npm test -- --run test/DemoRegistry.test.ts && npm run dev`

Expected: the test passes; the browser shows a grouped control panel; enabling then disabling Layered outline removes both features; enabling existing demos no longer requires editing `.test/main.ts`.

- [ ] **Step 5: Commit the demo harness.**

```powershell
git add .test test/DemoRegistry.test.ts
git commit -m "test: add controllable local demo panel"
```

### Task 6: Run the complete quality gate and document validation evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-07-12-layered-outline-design.md` only if an implementation detail differs from the approved specification.

- [ ] **Step 1: Search for removed API names.**

Run: `rg -n "parallelOverlay|isParallelOverlay" src test .test`

Expected: exit code 1 and no matches.

- [ ] **Step 2: Run formatting, static, unit, and build verification.**

Run: `npm run format:check && npm run verify`

Expected: every command exits 0. Do not include generated `dist/` changes in the commit.

- [ ] **Step 3: Reopen the local demo and exercise the integration path.**

Run: `npm run dev`

Expected: the Layered outline demo displays both screenshot-equivalent styles; Transform preserves them through drag/scale/rotate and undo/redo; DynamicDraw preview and completed line/polygon match; the control panel can enable and disable the demo repeatedly without residue.

- [ ] **Step 4: Commit any verification-only spec correction, if one was required.**

```powershell
git status --short
```

Expected: clean worktree. If the approved specification required correction, stage only `docs/superpowers/specs/2026-07-12-layered-outline-design.md` and commit it as `docs: align layered outline specification`; otherwise make no commit.

## Plan self-review

- Spec coverage: Tasks 1-2 implement the public API and static layered rendering; Task 3 removes the performance-problematic parallel overlay and covers Transform snapshots; Task 4 covers DynamicDraw preview and persisted output; Task 5 provides the requested controllable local test UI; Task 6 validates the complete change.
- Placeholder scan: no task contains deferred implementation wording; each code change has a named interface, code shape, test command, expected outcome, and commit.
- Type consistency: all tasks use `outerStroke`, `innerStroke`, `DemoCleanup`, `DemoDefinition`, `DemoRegistry`, and `cloneStyleSnapshot` consistently.
