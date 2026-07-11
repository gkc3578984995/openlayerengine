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

## Tests

Add focused unit coverage for both layers:

- Existing `stroke` still produces the legacy single-stroke path.
- `outerStroke` and `innerStroke` produce a two-element style array in the correct drawing order.
- `outerStroke` plus legacy `stroke` uses `stroke` as the foreground fallback.
- `set` merges and reapplies layered-outline fields without losing fill or label configuration.
- Polyline parameter interfaces and behavior no longer expose or use parallel-overlay state.

## Scope

This change applies only to `PolygonLayer` and `PolylineLayer`. `CircleLayer` and other geometry layers are intentionally unchanged.
