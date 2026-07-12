# API Presentation Design

## Goal

Standardize the visual hierarchy of every API table in the documentation site so that constructors, properties, and methods are immediately distinguishable without changing their underlying documentation links.

## Visual contract

- Constructor sections use a dedicated, high-contrast presentation block. The constructor signature is the visual focal point of the section.
- Property-name cells use a light-gray treatment.
- Method-name cells use a dark-gray treatment. Links remain functional, but the method presentation must not inherit the blue interactive-reference style.
- Blue method references remain reserved for prose and example descriptions, where they communicate an inline navigable reference rather than an API-table definition.

## Implementation

`ApiTable.vue` receives a semantic column presentation value for property and method name columns. It applies a stable CSS class to the rendered cell content, allowing all existing and future API tables to follow the same rules without duplicating markup in each view.

Every view that supplies an API property-name column marks it as a property column; every view that supplies a method-name column marks it as a method column. Existing anchors in cell markup are preserved.

Every documentation page with an `api-constructor` section wraps its constructor signature in the shared constructor-presentation classes. This establishes one visible pattern for constructor documentation while keeping page structure and API content unchanged.

## Documentation maintenance rule

`website/AGENTS.md` records the semantic classes and their intended use. It also explicitly distinguishes API-table styles from blue inline example references, so future documentation updates do not reintroduce blue method names in API tables.

## Verification

Add a static documentation test that asserts:

- the generic API table supports semantic property and method presentation;
- every API view marks its property and method name columns where applicable;
- every page with an `api-constructor` section uses the constructor presentation;
- the shared style sheet defines the constructor, property, and method styles and keeps API methods out of the blue `code-fn` treatment;
- `website/AGENTS.md` contains the maintenance rule.

Run the focused test and `npm run docs:build` after implementation.
