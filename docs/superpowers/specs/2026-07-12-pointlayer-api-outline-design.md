# PointLayer API Outline Design

## Goal

Improve the PointLayer documentation hierarchy so readers encounter constructor parameters, all related type definitions, and methods in dependency order. Keep method names concise by moving their complete signatures into the parameter column.

## API page order

The PointLayer API section has this order:

1. Constructor parameters.
2. Type definitions.
3. Methods.

The type-definition section contains `IPointParam`, `ISetPointParam`, `IRgbColor`, `IFill`, `IStroke`, and `ILabel`. Each type keeps its current content and anchor id, but appears before the method table.

## Three-level right-side outline

The shared `PageAnchor` component supports one additional level of children. PointLayer presents the following hierarchy:

```text
API
├─ 构造参数
├─ 类型定义
│  ├─ IPointParam
│  ├─ ISetPointParam
│  ├─ IRgbColor
│  ├─ IFill
│  ├─ IStroke
│  └─ ILabel
└─ 方法
```

Each listed type is a navigable right-side anchor. The new grandchild links use a distinct indentation and subdued text so the type group remains scannable.

## Method table signatures

The method-name column contains only the callable identifier, for example `add`, `set`, `setPosition`, and `destroy`. Parentheses and parameter names move to the parameter column, which uses complete named signatures such as `param: IPointParam`, `id: string, position: Coordinate`, and `id?: string`.

Inherited method labels continue to show the existing `继承` tag. Their parameter columns also contain their full signature where applicable.

## Documentation maintenance rule

`website/AGENTS.md` states that API pages should place related type definitions between constructor parameters and methods. Every rendered type definition needs an individual right-side anchor, and method names in API tables must exclude parentheses and parameter lists when the parameter column defines that signature.

## Verification

Add static regression coverage that asserts the PointLayer API order, all six type anchors in the outline, three-level `PageAnchor` rendering, concise method names, named parameter signatures, and the contributor rule. Run the focused test and `npm run docs:build`; visually verify the nested right-side outline and method table.
