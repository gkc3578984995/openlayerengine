# Docs Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, responsive map-workbench landing page for the OpenLayers TypeScript library documentation.

**Architecture:** Keep the homepage as one Vue view backed by static typed data. Render the map artwork with semantic markup and inline SVG, and keep all visual behavior in the shared theme stylesheet so light/dark tokens and responsive rules remain centralized.

**Tech Stack:** Vue 3, TypeScript, Vue Router, Element Plus icons, SCSS, Vitest.

## Global Constraints

- Do not add runtime dependencies or remote visual assets.
- Use semantic variables in `website/src/assets/styles/index.scss` with light and dark values.
- Every CTA must target an existing documentation route.
- Support reduced motion and layouts down to 320px wide.

---

### Task 1: Homepage content contract

**Files:**
- Create: `test/WebsiteHome.test.ts`
- Modify: `website/src/views/HomeView.vue`

**Interfaces:**
- Consumes: existing Vue Router routes.
- Produces: homepage links for `/guide/quick-start`, `/guide/earth-create`, `/components/point-layer`, `/components/measure`, and `/components/dynamic-draw`.

- [ ] **Step 1: Write the failing test**

  Assert that `HomeView.vue` names the library, contains the five canonical routes, includes a decorative map with `aria-hidden="true"`, and removes the old sponsor/resource placeholder content.

- [ ] **Step 2: Run test to verify it fails**

  Run: `npm test -- test/WebsiteHome.test.ts`

  Expected: FAIL because the current template does not contain the canonical homepage structure.

- [ ] **Step 3: Implement the view**

  Replace the generic hero, sponsor data, and feature data with typed capability/module collections and the map-workbench template described in the design spec.

- [ ] **Step 4: Run test to verify it passes**

  Run: `npm test -- test/WebsiteHome.test.ts`

  Expected: PASS.

### Task 2: Theme-aware visual system

**Files:**
- Modify: `website/src/assets/styles/index.scss`
- Test: `test/WebsiteHome.test.ts`

**Interfaces:**
- Consumes: `.home-*` classes emitted by `HomeView.vue` and existing `html.dark` theme switching.
- Produces: responsive, theme-aware page layout with reduced-motion handling.

- [ ] **Step 1: Extend the failing test**

  Assert that the stylesheet defines homepage surface tokens in both `:root` and `html.dark`, responsive breakpoints, and `prefers-reduced-motion` behavior.

- [ ] **Step 2: Run test to verify it fails**

  Run: `npm test -- test/WebsiteHome.test.ts`

  Expected: FAIL because the new homepage tokens and motion rule are absent.

- [ ] **Step 3: Implement the styles**

  Replace the legacy homepage/sponsor rules with the hero grid, map artwork, metrics and module card styles. Add dedicated dark-theme values and compact responsive layouts.

- [ ] **Step 4: Run tests and build**

  Run: `npm test -- test/WebsiteHome.test.ts && npm run docs:build`

  Expected: PASS with no TypeScript or Vite build errors.

