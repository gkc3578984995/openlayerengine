# Polygon and polyline layered-outline design

## Goal

Allow `PolygonLayer` and `PolylineLayer` to render the visually layered outlines shown in the supplied examples: a broad outer line is painted first and a narrower inner line is painted over it. The result looks like outer and inner borders without creating offset geometries.

## Public API

Add the following optional fields to both polygon and polyline add/set parameter types:

```ts
outerStroke?: IStroke;
innerStroke?: IStroke;
```

`stroke` remains unchanged for backwards compatibility.

Style selection rules:

1. If neither new field is set, render the existing single `stroke` exactly as today.
2. If either new field is set, render `outerStroke` first when present, then render `innerStroke` when present. If `innerStroke` is absent, use `stroke` as the foreground stroke.
3. When `innerStroke` is supplied, it is the foreground stroke and takes precedence over `stroke`; this avoids producing an unintended third line.

The stroke widths are normal OpenLayers pixel widths. The visual outer band is the portion of the first, broader stroke left visible after the foreground stroke covers its center. This is a rendering convention, not a geometric inside/outside offset.

## Rendering design

Each feature receives a static `Style[]`, ordered back to front:

1. An outer style containing only `outerStroke`.
2. The primary style containing polygon fill (where applicable), foreground stroke, and label.

The styles are rebuilt only on `add` or `set`. Coordinate changes do not require style recreation because OpenLayers applies the same styles to the new geometry.

Pattern fills and labels remain owned by the primary polygon style. Existing single-stroke calls retain their current `Style` result unless a layered outline is requested.

## Parallel-overlay removal

Remove the unused `parallelOverlayOnTop` and `parallelOverlayStroke` fields from `IPolylineParam` and `ISetPolylineParam`, plus the associated helper methods, maps, event subscriptions, feature creation, synchronization, and cleanup in `PolylineLayer`.

The removed mechanism calculated and rewrote an offset `LineString` for each configured line on every `change:center` and `change:resolution`. It is not needed for visual outlines and causes high-frequency work during panning and zooming.

No compatibility migration is required because the user confirmed the parallel-overlay API has not been adopted.

Remove the matching `isParallelOverlay` feature key and every Transform filter or synchronization branch that exists solely for parallel-overlay features. Polyline coordinate synchronization itself remains: Transform must continue to write changed line coordinates back through `PolylineLayer.setPosition`.

## Transform integration

Layered outlines are static `Style[]` values on the original feature, so Transform's translate, rotate, scale, and geometry-edit operations must leave them in place rather than recreate them. The implementation must support style arrays when making history snapshots: clone every `Style` in an array instead of retaining the array by reference.

Undo and redo for polygon and polyline geometry must preserve both the geometry and the current layered-outline configuration. No outline-specific Transform option is added.

## DynamicDraw integration

Add `outerStroke?: IStroke` and `innerStroke?: IStroke` to `IDrawLine` and `IDrawPolygon`.

Use one conversion path for legacy drawing options (`strokeColor` and `strokeWidth`) and the new fields. It must be used for both:

1. The temporary `Draw` interaction preview. A requested layered outline is visible while the user draws, so the completed graphic does not visually jump.
2. The final feature saved into `PolylineLayer` or `PolygonLayer`.

The existing blue geometry and control-point layers used by DynamicDraw and plot editing remain editing aids. They do not need to mirror the finished feature's outline; after an edit exits, the original feature and its layered styles are shown again.

## Tests

Add focused unit coverage for both layers:

- Existing `stroke` still produces the legacy single-stroke path.
- `outerStroke` and `innerStroke` produce a two-element style array in the correct drawing order.
- `outerStroke` plus legacy `stroke` uses `stroke` as the foreground fallback.
- `set` merges and reapplies layered-outline fields without losing fill or label configuration.
- Polyline parameter interfaces and behavior no longer expose or use parallel-overlay state.
- Transform translate, rotate/scale where supported, and undo/redo retain layered styles for polygons and polylines.
- DynamicDraw's temporary preview and the resulting polygon/polyline feature use the requested layered styles.

## Scope

This change applies only to `PolygonLayer` and `PolylineLayer`. `CircleLayer` and other geometry layers are intentionally unchanged.
