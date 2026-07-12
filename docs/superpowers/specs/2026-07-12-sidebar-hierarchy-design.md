# Documentation Sidebar Hierarchy Design

## Goal

Make the documentation sidebar's three visual levels immediately distinguishable while preserving its always-expanded navigation and current routing behavior.

## Scope

Only `website/src/assets/styles/index.scss` changes. Navigation data, Vue templates, routes, sidebar scrollbars, and responsive visibility rules remain unchanged.

## Visual hierarchy

1. Group labels (`.docs-sidebar__title`) are non-interactive category labels. They use the smallest type, uppercase-style tracking, a subdued color, and generous separation from each group.
2. Parent links (`.docs-sidebar__link`) are module entry points. They use the largest sidebar link type, a medium weight, and a rounded, lightly tinted active state.
3. Child links (`.docs-sidebar__child-link`) are individual pages. They are smaller, visibly indented beneath a guide line, and use a compact active fill with a primary-color left indicator.
4. When a child route is current, the existing parent route matching keeps the parent in its weaker active state, while the child receives the stronger active state. This preserves both location and current-page context.

## Interaction and accessibility

Hover and keyboard focus use the same visual affordance as the corresponding level's active treatment. Color is not the sole active cue: active links also receive a background or indicator. Existing semantic links and router behavior remain intact.

## Verification

Add a source-level Vitest assertion for the required hierarchy selectors and states, then run it red before applying styles and green afterward. Run the documentation build (`npm run build` in `website/`) to check Sass, Vue type checking, and production bundling.
