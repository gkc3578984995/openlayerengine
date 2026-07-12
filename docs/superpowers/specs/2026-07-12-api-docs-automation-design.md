# API Documentation Automation Design

## Goal

Keep the existing Vue documentation UI while generating API signatures and type rows from TypeDoc data.

## Design

TypeDoc will write Markdown to `website/public/api/` and JSON to `.cache/typedoc.json` in one run. A Node generator converts the JSON into an ignored `website/src/generated/api.ts` module. Editorial modules hold the Chinese copy, order, and section selection. `PointLayerView.vue` reads merged rows through a composable, leaving `ApiTable.vue` unchanged.

`docs:build` is the only developer-facing build entry point. It builds the library, runs the API sync and coverage check, then builds the Vue workspace. The coverage check rejects editorial references to unknown generated symbols.

## Scope

- Implement the pipeline and PointLayer method table first.
- Preserve the existing hand-authored PointLayer parameter/type tables until their generated mapping is added in a later increment.
- Keep TypeDoc Markdown as a static fallback reference.
