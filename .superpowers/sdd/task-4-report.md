# Task 4 report: DynamicDraw preview/save parity

## Scope completed

- Added `buildDrawLineStyle` and expanded `buildDrawPolygonStyle` to persist legacy, outer, and inner stroke parameters.
- Added `buildDrawPreviewStyle` and used it for the `Draw` interaction, rendering an outer stroke before the foreground inner stroke for lines and polygons.
- Kept edit and plot-edit support layers unchanged.

## Test-driven evidence

- RED: `npm test -- --run test/DynamicDraw.lifecycle.test.ts` failed as expected because `buildDrawPreviewStyle` did not exist.
- GREEN: `npm test -- --run test/DynamicDraw.lifecycle.test.ts test/LayeredOutline.test.ts` passed: 2 files, 10 tests.
- Type check: `npm run typecheck` passed.
- Lint: `npm run lint` could not start because ESLint finds duplicate `@typescript-eslint` plugin installations in this worktree and its parent repository; this is an environment/configuration issue unrelated to the changed files.

## Self-review

- `git diff --check` passed.
- Confirmed the persisted LineString path now uses `buildDrawLineStyle`, the Polygon path uses `buildDrawPolygonStyle`, and the draw interaction uses `buildDrawPreviewStyle`; line and polygon previews reuse the corresponding persisted legacy stroke when no `innerStroke` is provided.
- Independent review identified that partial stroke objects received different defaults in OpenLayers preview and saved layers. Preview strokes now use the same `#ffcc33`/`2` defaults before creating `Stroke`; regression tests cover omitted legacy color and partial outer/inner strokes.
- The unrelated pre-existing `package-lock.json` modification remains unstaged and was not changed by this task.
