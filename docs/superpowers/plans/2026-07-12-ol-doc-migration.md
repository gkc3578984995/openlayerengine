# ol-doc Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `ol-doc` Vue documentation site into this repository and build it against the local library package.

**Architecture:** The root package remains the publishable library and becomes an npm workspace coordinator for `website/`. The documentation workspace consumes the root package through `file:..`; root scripts build the library, generate TypeDoc output under the site, and invoke the workspace Vite commands.

**Tech Stack:** npm workspaces, TypeScript, Rollup, TypeDoc, Vue 3, Vite, vue-tsc.

## Global Constraints

- Preserve all existing files below `D:\code\project\ol-doc\src` and `D:\code\project\ol-doc\public` under `website/`.
- Keep `docs/superpowers/` tracked; remove only generated TypeDoc content from the root `docs/` directory.
- Do not add documentation builds to the existing `verify` script in this migration.
- Generate TypeDoc into `website/public/api/`; Git must ignore that directory.
- The root lockfile owns workspace dependencies; `website/package-lock.json` must not remain.

---

### Task 1: Move the documentation application into the repository

**Files:**
- Create: `website/` (moved from `D:\code\project\ol-doc`)
- Modify: `package.json`
- Modify: `website/package.json`
- Delete: `website/package-lock.json`

**Interfaces:**
- Consumes: root package name `@vrsim/earth-engine-ol`.
- Produces: npm workspace `ol-doc` in `website/`, consuming the root package with `file:..`.

- [ ] **Step 1: Record and move the documentation source**

Run `rg --files 'D:\code\project\ol-doc\src' 'D:\code\project\ol-doc\public'`, then move `src`, `public`, `index.html`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, and `.gitignore` into `website/`. Do not move `node_modules`, `dist`, logs, `*.tsbuildinfo`, or `package-lock.json`.

- [ ] **Step 2: Configure the root workspace and documentation scripts**

Add `"workspaces": ["website"]` as a top-level `package.json` field. Add `"docs:dev": "npm run build && npm run dev --workspace=ol-doc"` and `"docs:build": "npm run build && npm run doc && npm run build --workspace=ol-doc"` to the root scripts.

- [ ] **Step 3: Configure the moved package for the local library**

Create `website/package.json` from the original documentation package and replace its library dependency with `"@vrsim/earth-engine-ol": "file:.."`. Keep package name `ol-doc` and its `dev`, `build`, and `preview` scripts unchanged.

- [ ] **Step 4: Refresh dependencies and check the moved source**

Run `npm install`, then run `rg --files website/src website/public`. Expect the root `package-lock.json` to include the workspace, no `website/package-lock.json`, and the source inventory below `website/`.

- [ ] **Step 5: Commit the workspace migration**

Run `git add package.json package-lock.json website`, then `git commit -m "chore: move documentation site into workspace"`.

### Task 2: Relocate generated TypeDoc output

**Files:**
- Modify: `typedoc.json`
- Modify: `.gitignore`
- Delete: `docs/classes/`, `docs/enumerations/`, `docs/functions/`, `docs/interfaces/`, `docs/type-aliases/`, `docs/globals.md`, `docs/README.md`

**Interfaces:**
- Consumes: root command `typedoc --options ./typedoc.json`.
- Produces: static TypeDoc Markdown in `website/public/api/`.

- [ ] **Step 1: Change the TypeDoc destination**

Replace the TypeDoc output setting with `"out": "./website/public/api"`.

- [ ] **Step 2: Ignore generated API files and remove stale output**

Add `/website/public/api/` to `.gitignore`. Remove only the listed generated TypeDoc directories and Markdown files from root `docs/`; retain `docs/superpowers/`.

- [ ] **Step 3: Generate and validate the replacement API output**

Run `npm run doc`, then `Test-Path website/public/api/README.md` and `git status --short`. Expect the path check to return `True` and generated API content not to appear in status.

- [ ] **Step 4: Commit the API relocation**

Run `git add typedoc.json .gitignore`, then `git commit -m "chore: relocate generated API documentation"`.

### Task 3: Verify the unified documentation build

**Files:**
- Verify: `package.json`
- Verify: `website/package.json`
- Verify: `website/public/api/`

**Interfaces:**
- Consumes: root `docs:build` script and workspace `ol-doc` build script.
- Produces: Vite production output in `website/dist/` using the current library package.

- [ ] **Step 1: Run baseline library tests**

Run `npm test`. Expect Vitest to exit with zero failed tests.

- [ ] **Step 2: Run the unified documentation build**

Run `npm run docs:build`. Expect the library build, TypeDoc, `vue-tsc -b`, and Vite to exit with code 0.

- [ ] **Step 3: Confirm build artifacts and review the working tree**

Run `Test-Path website/public/api/README.md`, `Test-Path website/dist/index.html`, `git diff --check HEAD`, and `git status --short`. Expect both paths to exist, no diff-check output, and only intended migration files before the final commit.

- [ ] **Step 4: Commit the verified migration**

Run `git add package.json package-lock.json typedoc.json .gitignore website`, then `git commit -m "build: add unified documentation commands"`.
