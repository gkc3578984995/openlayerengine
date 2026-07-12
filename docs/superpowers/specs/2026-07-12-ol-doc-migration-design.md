# ol-doc Migration Design

**Date:** 2026-07-12

## Goal

Move the Vue documentation application from `D:\code\project\ol-doc` into this repository as `website/`, so the library and its documentation build from one repository and the documentation no longer depends on a versioned `.tgz` archive.

## Scope

- Preserve the documentation site's existing Vue pages, demos, assets, and behavior.
- Add `website/` as an npm workspace named `ol-doc`.
- Change the site's library dependency to `file:..`, which resolves to this repository's package.
- Generate TypeDoc output into `website/public/api/` instead of the root `docs/` directory.
- Keep the tracked `docs/superpowers/` design and plan records.
- Add root-level commands for documentation development and production builds.

## Out of Scope

- Converting hand-authored API tables to generated content.
- Adding documentation checks to the existing `verify` command or CI.
- Redesigning the documentation site's pages or deployment pipeline.
- Preserving Git history from `ol-doc`; it is not a Git repository.

## Structure

```text
ol-engine/
  docs/
    superpowers/             # tracked design and plan records
  src/                       # library source
  website/                   # migrated Vue/Vite documentation application
    public/
      api/                   # ignored TypeDoc build output
    src/
  package.json               # library package and workspace coordinator
  typedoc.json               # writes into website/public/api
```

## Dependency and Build Flow

The root npm workspace owns installation and lockfile resolution. The `ol-doc` workspace uses `@vrsim/earth-engine-ol` through `file:..`, avoiding the fixed `vrsim-earth-engine-ol-1.0.3.tgz` artifact.

`npm run docs:dev` builds the library then starts the documentation workspace. `npm run docs:build` builds the library, generates static TypeDoc API pages, then builds the Vue site. Generated API output is ignored; `docs/superpowers/` remains tracked.

## Validation

Run the existing library verification before migration work, then run the root documentation build after migration. Confirm TypeDoc output exists under `website/public/api/`, the documentation workspace type-checks, and Vite completes its production build.
