# 2.0 Architecture and Code Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不保留 1.x 公共 API 兼容层的前提下，完成 2.0 的 Element Kernel 架构、OpenLayers 10.9.0 升级、除 Wind 外的现有能力迁移、统一交互与动画生命周期，以及零普通运行时依赖和真实离线安装验收。

**Architecture:** 每个 `Earth` 独占 Core、Services、`InteractionCoordinator` 与 OpenLayers Adapter。`ElementState` 是唯一业务状态真源，OL `Feature` 仅为单向渲染投影；图形、业务模块与图层解耦；样式、绘制、测量、Transform、事件、菜单、Overlay 和动画均通过显式 `EngineContext` 协作。旧实现一直保留到最终公共入口切换，新增 v2 测试在切换前直接导入新模块，保证每个提交都有可验证状态。

**Tech Stack:** TypeScript 5.9.3、OpenLayers 10.9.0、ESM、Rollup 3、Vitest 1.6、Playwright 1.54.2、Sass、npm 9。

## Global Constraints

- 本计划只执行第一宏观步骤。不得修改 `website/`、生成的 TypeDoc `docs/` 内容、`MIGRATION.txt`、现有文档示例或 `.test/` 演示；第二阶段在 API 冻结后单独制定计划。
- 工作目录固定为 `D:\code\project\ol-engine\.worktrees\v2-architecture`，分支固定为 `codex/v2-architecture`。
- `package.json` 开始执行前已有用户改动（`description`、`directories`、`keywords`）。每次修改前先运行 `git diff -- package.json`，只用 `apply_patch` 改计划涉及的字段，提交时用 `git add -p package.json`，不得覆盖或夹带这些既有改动。
- 不提交 `dist/`。构建后用 `git status --short` 确认生成物仍被忽略。
- 每个任务严格遵循 RED → GREEN → REFACTOR：先提交失败测试或在同一任务中记录预期失败，再写最小实现；任务结束必须运行列出的定向测试、`npm run typecheck` 和 `npm run lint`。
- Core (`src/core/**`) 不得导入 `ol`、DOM 类型或任何 Adapter/Facade；Services 只依赖 Core 契约和注入端口；所有 OL 导入使用公开的带 `.js` 后缀路径，所有 TypeScript 相对 import/export 也写 `.js` 后缀（SCSS、图片和 `?raw` 资源除外），保证生成声明可被 NodeNext/Bundler 消费。
- 深层模块不得调用 `useEarth()`、`resolveEarth()` 或读取全局实例。实例依赖只通过构造函数参数和 `EngineContext` 显式传递。
- 旧 `src/Earth.ts`、`src/useEarth.ts` 与旧入口在 Task 16 前保留；新实现先位于 `src/facade/**`。Task 16 一次性切换根入口并删除旧实现，仓库不对外发布半迁移状态。
- 第一阶段完成后仍不发布 2.0、不合并到发布分支；先冻结 API，再单独制定并执行第二阶段用户文档与示例计划。
- Wind 是唯一明确删除的现有功能。其余能力必须在 `test/fixtures/v2CapabilityMatrix.ts` 中有 2.0 映射和自动化测试证据。
- 发布包只能包含根入口和 `./style.css`。`ol` 是安装时可选、运行时必需的 peer；不得把 OL 或任何第三方运行时依赖打入产物。

---

## Task 1: 建立代码阶段验证门与能力冻结矩阵

**Files:**

- Create: `vitest.code.config.ts`
- Create: `test/fixtures/v1CapabilityManifest.ts`
- Create: `test/fixtures/v2CapabilityMatrix.ts`
- Create: `test/fixtures/capabilityCoverage.ts`
- Create: `test/V2CapabilityMatrix.test.ts`
- Create: `test/V1CapabilityBaseline.test.ts`
- Modify: `package.json`（仅 `scripts`）

**Produces:** 第一阶段不依赖旧文档一致性的代码验证入口，以及除 Wind 外的能力迁移清单。

- [ ] 在 `test/V2CapabilityMatrix.test.ts` 先写失败测试，要求每一项都有唯一 `id`、明确的 `legacySources`、非空 `v2Entry`、至少一个 `testFile`，并拒绝 Wind 行：

```ts
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { v1CapabilityManifest } from './fixtures/v1CapabilityManifest.js';
import { v2CapabilityMatrix } from './fixtures/v2CapabilityMatrix.js';

describe('v2 capability matrix', () => {
  it('maps every retained capability to a v2 entry and test', () => {
    expect(v2CapabilityMatrix.map((item) => item.id).sort()).toEqual(v1CapabilityManifest.map((item) => item.id).sort());
    for (const item of v2CapabilityMatrix) {
      expect(item.legacySources.length).toBeGreaterThan(0);
      expect(item.v2Entry.length).toBeGreaterThan(0);
      expect(item.testFiles.length).toBeGreaterThan(0);
      expect(item.testFiles.every(existsSync)).toBe(true);
      expect(item.id.toLowerCase()).not.toContain('wind');
    }
  });
});
```

- [ ] 运行 `npx vitest run test/V2CapabilityMatrix.test.ts`，确认因 fixture 不存在而失败。
- [ ] `v1CapabilityManifest.ts` 是人工审计后冻结的完整 ID 集合，不从 v2 矩阵反向生成；来源必须同时核对根导出、源码公开方法、现有非文档测试、网站说明和 `.test/` 示例。`v2CapabilityMatrix.ts` 必须与 manifest 做集合相等比较，不能只检查“已填写的行”。Task 1 的 `testFiles` 先指向真实存在的 legacy 回归，Task 16 再换成 v2 测试。
- [ ] `capabilityCoverage.ts` 导出 `coversCapabilities(...ids)`，运行时验证 id 属于 frozen manifest 并返回 ids；每个新增/重写的 v2 测试在 describe 顶部调用它声明覆盖项。Task 16 的 closure test 解析这些声明，确保矩阵不是仅填写一个无关测试文件。
- [ ] 对当前没有直接自动化测试的 legacy 行创建 `V1CapabilityBaseline.test.ts`，至少用公开方法/options/源码算法断言冻结 OSM/compact-XYZ URL、cursor、DragPan、pixel hit、Camera、Overlay 全参数、Descriptor 参数、Point/Polyline/FlightLine 动画参数、20 draw/edit 方法、Measure 声明与 Transform 高级 options。它是迁移输入证据，不替代后续 v2 行为/浏览器测试。
- [ ] 固定 manifest 逐项覆盖：Earth/useEarth/生命周期/多实例、Camera/View/像素命中/地图拖动开关/鼠标 cursor、Controls、OSM/XYZ/自定义 Source/Layer、Point+icon、Polyline、Polygon、Circle、20 种 Draw shape 与 `limit/keepGraphics`、动态 Edit、四类 Measure、Transform 全部命令、事件七类输入、ContextMenu、Overlay create/update/position/show/hide/remove、Descriptor update/show/hide/drag/fixed-line/click/viewport-follow、PatternFill、多层描边、箭头、所有 icon/text/stroke/fill 样式能力、Point/Polyline/FlightLine 动画。每行列出 legacySources、planned v2Entry 与现有真实 testFiles；Wind 不进入 manifest。
- [ ] `v1CapabilityManifest.ts` 的 ID 集合严格采用下方常量；20 种 shape 用固定数组生成 draw/edit 两行，禁止手写不完整子集：

```ts
export const legacyShapeTypes = [
  'point', 'polyline', 'polygon', 'circle', 'ellipse',
  'attack-arrow', 'tailed-attack-arrow', 'fine-arrow',
  'tailed-squad-combat-arrow', 'assault-direction-arrow', 'double-arrow',
  'rectangle', 'triangle', 'equilateral-triangle', 'assemble-polygon',
  'closed-curve-polygon', 'sector', 'lune-polygon', 'lune-polyline', 'curve-polyline'
] as const;

export const fixedLegacyCapabilityIds = [
  'public-root-api', 'public-style-explicit-entry', 'public-ol-native-escape',
  'public-base-subclass-extension', 'public-low-level-plot-api',
  'public-low-level-transform-interaction', 'public-feature-metadata-keys',
  'public-legacy-type-only-ast',

  'earth-default-instance-get-or-create', 'earth-named-instance-get-or-create',
  'earth-instance-options-routing', 'earth-instance-destroy-recreate',
  'earth-explicit-unregistered-instance', 'earth-default-context-resolution',
  'earth-target-string-or-element', 'earth-map-view-public-access',
  'earth-default-interaction-policy', 'earth-browser-contextmenu-suppression',
  'earth-raster-osm-preset', 'earth-raster-xyz-compact-preset',
  'earth-raster-custom-tile-url-function', 'earth-layer-handle-lifecycle',
  'earth-layer-wrapper-registry', 'earth-default-layer-bundle',
  'earth-feature-hit-at-pixel', 'earth-cursor-control', 'earth-drag-pan-toggle',
  'earth-owned-service-reuse', 'earth-destroy-lifecycle',

  'camera-fly-home', 'camera-animate-fly-to', 'camera-fly-to',
  'control-graticule-lifecycle', 'control-scale-line-lifecycle',
  'control-earth-delegation',

  'element-metadata-id-module-data', 'layer-feature-query-remove',
  'layer-feature-hide-show', 'layer-visibility-opacity-order',
  'layer-native-layer-access', 'layer-registration-lifecycle', 'layer-wrap-x-option',
  'layer-param-live-sync', 'layer-param-snapshot', 'layer-contextmenu-state-cleanup',
  'element-point', 'element-icon-point', 'element-polyline', 'element-polygon',
  'element-circle',

  'style-stroke-basic', 'style-stroke-dash', 'style-stroke-fit-pattern-once',
  'style-layered-outline', 'style-fill-solid', 'style-fill-pattern',
  'style-label-full', 'style-icon-full', 'style-screen-stable-offset',
  'style-native-feature-override', 'style-polyline-static-arrow',

  'animation-point-pulse', 'animation-point-pulse-control',
  'animation-polyline-dash-flow', 'animation-polyline-path-flight',
  'animation-polyline-path-control', 'transform-animation-point-pause-resume',
  'transform-animation-polyline-sync', 'transform-bbox-active-blink',

  'overlay-add-config', 'overlay-update', 'overlay-position-hide',
  'overlay-query-remove', 'overlay-default-earth-resolution',
  'descriptor-list-content', 'descriptor-set-update', 'descriptor-drag',
  'descriptor-fixed-line', 'descriptor-position-fixed-mode',
  'descriptor-pixel-fixed-mode', 'descriptor-close-control',
  'descriptor-show-hide', 'descriptor-destroy-lifecycle', 'descriptor-element-target',

  ...legacyShapeTypes.flatMap((type) => [`draw-shape-${type}`, `edit-shape-${type}`] as const),
  'draw-session-events', 'draw-session-rightclick-exit', 'draw-keep-graphics',
  'draw-point-limit', 'draw-style-preview-result-parity', 'draw-result-query',
  'draw-result-remove', 'draw-session-destroy', 'edit-session-rightclick-commit',
  'edit-session-underlay', 'edit-session-history', 'edit-session-control-points',
  'edit-session-world-wrap', 'edit-session-events',

  'measure-distance-segments', 'measure-distance-total', 'measure-distance-radial',
  'measure-area', 'measure-dynamic-tooltip', 'measure-point-markers',
  'measure-line-style', 'measure-text-style', 'measure-result-payload',
  'measure-rightclick-finish', 'measure-clear-reuse',

  'transform-target-filter', 'transform-translate-modes',
  'transform-scale-stretch-rotate', 'transform-select-lifecycle',
  'transform-handle-cursor-events', 'transform-operation-events',
  'transform-vertex-edit-delegation', 'transform-history-selection-scope',
  'transform-style-snapshot', 'transform-undo-redo', 'transform-copy-preview',
  'transform-copy-cut-paste-remove', 'transform-plot-control-point-sync',
  'transform-replace-editing-feature', 'transform-toolbar-actions',
  'transform-toolbar-view-sync', 'transform-rightclick-priority',
  'transform-multi-earth-isolation', 'transform-lifecycle-cleanup',
  'transform-event-subscription', 'transform-low-level-advanced-options',

  'event-global-move', 'event-global-click', 'event-global-left-down',
  'event-global-left-up', 'event-global-double-click', 'event-global-right-click',
  'event-module-move', 'event-module-click', 'event-module-left-down',
  'event-module-left-up', 'event-module-double-click', 'event-module-right-click',
  'event-global-key-down', 'event-module-routing-payload',
  'event-module-hover-transition', 'event-listener-auto-enable',
  'event-listener-disposer', 'event-once-click', 'event-once-click-cancelable',
  'event-once-right-click', 'event-once-right-click-cancelable',
  'event-listener-state-query', 'event-module-scoped-cleanup',
  'event-manual-enable-disable',

  'contextmenu-default-menu', 'contextmenu-module-menu', 'contextmenu-nested-items',
  'contextmenu-disabled-items', 'contextmenu-before-guard',
  'contextmenu-default-item-state', 'contextmenu-feature-item-state',
  'contextmenu-mutex-state', 'contextmenu-theme',
  'contextmenu-map-anchored-position', 'contextmenu-callback-payload',
  'contextmenu-close-triggers', 'contextmenu-event-isolation',
  'contextmenu-registration-cleanup', 'contextmenu-transform-arbitration',
  'contextmenu-browser-default-suppression',

  'utils-world-width-index', 'utils-feature-translate-to-pixel',
  'utils-world-normalize-restore', 'utils-ring-close-trim', 'utils-guid',
  'utils-linear-interpolation', 'utils-vector-math', 'utils-quadratic-bezier',
  'utils-arrow-style', 'utils-point-flash', 'utils-degree-radian',
  'utils-throttle-cancel-flush', 'utils-pattern-fill-normalize',
  'utils-pattern-fill-render'
] as const;
```

- [ ] Manifest row 的 `disposition` 只能是 `retain`、`replace`、`intentional-api-break`。`intentional-api-break` 仅用于已批准删除的旧入口/隐式全局/内部扩展面，必须填写 `replacementIds` 和规格章节；不能用于规避功能实现。另建 `v1KnownLimitations`，固定记录并在 v2 修复：`descriptor-custom-content`、`descriptor-close-callback`、`measure-text-size`、`measure-total-distance-toggle`、`dash-flow-single-remove-cleanup`、`flight-line-listener-cleanup`、`draw-remove-all-semantics`。另建 `v1ExcludedCapabilities`，只允许 Wind 项且理由固定为已批准删除。
- [ ] 固定 API break 映射：Base 继承 → `PublicLayerSpec + StyleSpec + native layer`；低层 Plot → Draw/Edit session；低层 TransformInteraction → Transform session/options；公开 FEATURE_KEYS → ElementState/Selector；`ast.ts` 类型 → 2.0 公共类型白名单；隐式默认 Earth 构造器 → useEarth 仅在最外层 get-or-create、内部 EngineContext；事件 manual enable/disable → subscription count 自动启停。其他 capability 不得标为 intentional break。
- [ ] 创建 `vitest.code.config.ts`，复用 `vitest.config.ts` 的 alias/environment，并明确排除 `test/*Docs.test.ts`、`test/Website*.test.ts`、`test/ApiDocGenerator.test.ts`、`test/DemoRegistry.test.ts`、`test/LayerCommonDemoCoverage.test.ts`。不要删除或修改这些测试。
- [ ] 给 `package.json` 增加：

```json
{
  "scripts": {
    "test:code": "vitest run --config vitest.code.config.ts",
    "verify:code": "npm run typecheck && npm run lint && npm run format:check && npm run build && npm run test:code"
  }
}
```

- [ ] 同时把根 `format`/`format:check` 的路径扩展为 `src/**/*.{ts,scss}`、`test/**/*.{ts,mjs,json,html}`、`scripts/**/*.mjs` 和根配置 `*.{json,md,ts,mjs}`，使后续 browser/package fixture 与脚本进入格式门；不要包含 `website/` 或生成的 `docs/`。

- [ ] 运行 `npm run test:code -- test/V2CapabilityMatrix.test.ts test/V1CapabilityBaseline.test.ts`，预期通过；运行 `npm test`，确认原有完整测试入口未被削弱。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "test: freeze v2 capability baseline"`。

## Task 2: 在 OL 7 基线上完整移除 Wind

**Files:**

- Create: `test/WindRemoval.test.ts`
- Delete: `src/base/WindLayer.ts`
- Modify: `src/base/index.ts`
- Modify: `src/Earth.ts`
- Modify: `src/index.ts`
- Modify: `src/interface/default.ts`
- Modify: `rollup.config.mjs`
- Modify: `package.json`（删除 `ol-wind`、`wind-core`）
- Modify: `package-lock.json`

**Produces:** 源码、类型、构建与发布清单中均不存在 Wind；其他旧实现暂时继续在 OL 7 上通过。

- [ ] 先写 `test/WindRemoval.test.ts`，扫描 `src/**`、`rollup.config.mjs` 和 `package.json`，断言没有 `WindLayer`、`ol-wind`、`wind-core`，并断言根导出不再含 Wind。
- [ ] 运行 `npx vitest run test/WindRemoval.test.ts`，确认当前因上述引用存在而失败。
- [ ] 删除 `WindLayer` 文件及 `base/index.ts`、`Earth.ts`、`index.ts`、公共类型中的 Wind 实体、参数和导出。不得修改旧 `.test/` 演示或网站页面。
- [ ] 删除 Rollup 的 `bundledDependencies` Wind 特例，使 external 计算恢复为发布依赖与 peer 的直接集合。
- [ ] 仅从 `dependencies` 删除 `ol-wind` 和 `wind-core`，运行 `npm install --package-lock-only --ignore-scripts` 更新锁文件；此时保留 lodash，直到 Task 16 完成替换。
- [ ] 运行 `npx vitest run test/WindRemoval.test.ts test/BaseLifecycle.test.ts test/PackageExports.test.ts`，预期通过。
- [ ] 运行 `npm run test:code`，确认删除 Wind 未影响其余冻结能力。
- [ ] 运行 `npm run typecheck && npm run lint && npm run build`，并用 `rg -n "ol-wind|wind-core|WindLayer" src dist rollup.config.mjs package.json` 确认零命中。
- [ ] 提交：`git commit -m "refactor: remove wind capability"`。

## Task 3: 升级 OL 10.9.0 与 TypeScript 模块边界

**Files:**

- Create: `test/OpenLayers10Contract.test.ts`
- Create: `test/EsmSpecifierContract.test.ts`
- Modify: `package.json`（`peerDependencies`、`peerDependenciesMeta`、`devDependencies`）
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `rollup.config.mjs`
- Modify: `src/**/*.ts`（OL import、泛型、空值、事件与 Canvas 迁移）

**Produces:** 旧功能基线可在 OL 10.9.0 上编译运行；所有 OL 调用只使用公开 ESM API。

- [ ] 在 `test/OpenLayers10Contract.test.ts` 写失败测试，断言：OL dev 版本精确为 `10.9.0`、peer 为 `^10.9.0` 且 `peerDependenciesMeta.ol.optional === true`；`src/**/*.ts` 不允许 `from 'ol'` 根 barrel，所有 `ol/` import 除明确的 `ol/ol.css` 外均以 `.js` 结尾；源码不含 `.anchor_`、`.downPx_`、`.context_` 或 `ol/renderer/Layer`。
- [ ] 在 `test/EsmSpecifierContract.test.ts` 扫描 `src/**/*.ts` 的静态/dynamic import 与 export-from；相对 TypeScript 模块必须写 `.js`，仅允许 `.scss/.css/.svg/.png/.jpg/.jpeg` 和 `?raw` 资源保留自身扩展名。
- [ ] 运行 `npx vitest run test/OpenLayers10Contract.test.ts`，确认版本、导入和私有字段断言失败。
- [ ] 修改依赖契约：

```json
{
  "peerDependencies": { "ol": "^10.9.0" },
  "peerDependenciesMeta": { "ol": { "optional": true } },
  "devDependencies": { "ol": "10.9.0", "typescript": "5.9.3" }
}
```

- [ ] 将 `tsconfig.json` 改为 `target: "ES2022"`、`moduleResolution: "Bundler"`、`skipLibCheck: false`；保留 strict、ESNext module 与现有 alias。
- [ ] 运行 `npm install --ignore-scripts`，随后运行 `npm run typecheck`，保存错误清单作为本任务 RED 证据。
- [ ] 机械迁移全部 OL import，例如 `ol/Feature` → `ol/Feature.js`、`ol/geom` barrel → 具体公开模块；同时把相对 TypeScript specifier 改为指向 `.js`（目录入口写为 `../interface/index.js`，不是 `../interface`）。Rollup 的 `external` 必须匹配 `id === 'ol' || id.startsWith('ol/')`，删除运行时补 `.js` 的 `toNativeEsmSpecifier`。
- [ ] 把 `VectorSource<Geometry>` 统一改为 `VectorSource<Feature<Geometry>>`，分别为 `new Feature<Point>()`、`new Feature<LineString>()`、`new Feature<Polygon>()`、`new Feature<Circle>()` 和通用 `new Feature<Geometry>()` 提供显式泛型，并处理 OL 10 的 nullable style/overlay 返回值。
- [ ] 删除 `Icon.anchor_` 反向读取，临时把 anchor 保存到引擎参数；删除 `Draw.downPx_`，改由公开 `MapBrowserEvent.pixel/coordinate` 记录按下位置；删除 renderer `context_`，从公开 render event 取得 canvas context。
- [ ] 删除 `imgSize` 用法；对 `originalEvent` 先做 `instanceof PointerEvent`/`MouseEvent` 收窄；允许 `CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`。
- [ ] 移除公共签名中的 `ol/renderer/Layer`，用 `BaseLayer`、公开 layer 类型或引擎自己的 opaque ref 取代。
- [ ] 运行 `npm run typecheck`，预期零错误；运行 `npx vitest run test/OpenLayers10Contract.test.ts test/EsmSpecifierContract.test.ts test/BaseLifecycle.test.ts test/DynamicDraw.lifecycle.test.ts test/MeasureLifecycle.test.ts test/TransformGeometry.test.ts`，预期通过。
- [ ] 运行 `npm run test:code`，确认 OL 升级后的全部非文档能力基线通过；任何失败先修复，不把测试加入 exclude。
- [ ] 运行 `npm run lint && npm run build`，再运行 `rg -n "anchor_|downPx_|context_|ol/renderer/Layer|from ['\"]ol/[^'\"]+(?<!\\.js)['\"]" src`，除正则工具不支持的报错外应零命中；若 `rg` 不支持 lookbehind，改用 `test/OpenLayers10Contract.test.ts` 作为唯一导入契约检查。
- [ ] 提交：`git commit -m "build: upgrade to OpenLayers 10.9"`。

## Task 4: 建立纯 Core 基础契约、错误与 Selector

**Files:**

- Create: `src/core/errors.ts`
- Create: `src/core/ports/ErrorReporter.ts`
- Create: `src/core/common/types.ts`
- Create: `src/core/common/clone.ts`
- Create: `src/core/native/types.ts`
- Create: `src/core/shape/types.ts`
- Create: `src/core/style/types.ts`
- Create: `src/core/element/types.ts`
- Create: `src/core/element/selector.ts`
- Create: `test/CoreBoundaries.test.ts`
- Create: `test/ArchitectureImportGraph.test.ts`
- Create: `test/ElementSelector.test.ts`
- Create: `test/CoreClone.test.ts`

**Produces:** 无 OL 依赖的值类型、稳定错误、选择器与快照克隆规则。

- [ ] 先写 `CoreBoundaries.test.ts`，递归读取 `src/core/**/*.ts`，拒绝 `from 'ol`、`from "ol`、`HTMLElement`、`document`、`window`；写 `ArchitectureImportGraph.test.ts` 固定依赖方向：Core 不导入 Services/Adapters/Facade，Services/Builtins 不导入 OL/Adapters/Facade，Adapters 可导入 Core/Services，Facade/Internal 负责装配；写 `ElementSelector.test.ts` 覆盖 selector，写 `CoreClone.test.ts` 覆盖 clone。
- [ ] 运行 `npx vitest run test/CoreBoundaries.test.ts test/ArchitectureImportGraph.test.ts test/ElementSelector.test.ts test/CoreClone.test.ts`，确认模块不存在而失败。
- [ ] 实现固定错误类：`InvalidArgumentError`、`DuplicateElementIdError`、`InvalidSelectorError`、`ObjectDisposedError`、`CapabilityError`、`InteractionConflictError`、`UnsupportedOperationError`。
- [ ] 定义 `ErrorReporter(error, context): void` 注入端口，供 Store/Event/Input 隔离用户回调异常；默认实现异步上报但不改变已提交事务，测试全部注入 spy，不读取全局 Earth。
- [ ] 实现不依赖 DOM/OL 的类型与 selector：

```ts
export type Coordinate = readonly [number, number] | readonly [number, number, number];

export interface ElementState<T = unknown> {
  readonly id: string;
  readonly type: ShapeType;
  readonly geometry: ShapeState;
  readonly style: ElementStyleState;
  readonly data?: T;
  readonly module?: string;
  readonly layerId: string;
  readonly visible: boolean;
}

export interface ElementSelector<T = unknown> {
  id?: string;
  ids?: readonly string[];
  module?: string;
  layerId?: string;
  type?: ShapeType;
  visible?: boolean;
  predicate?: (state: Readonly<ElementState<T>>) => boolean;
}

export function compileSelector<T>(selector?: ElementSelector<T>): (state: Readonly<ElementState<T>>) => boolean;
export function assertDestructiveSelector(selector: ElementSelector): void;
```

- [ ] `assertDestructiveSelector({})` 必须抛 `InvalidSelectorError`；`compileSelector(undefined)` 仅用于非破坏查询并匹配全部。`id` 与 `ids` 是互斥输入，同时出现时抛 `InvalidArgumentError`，避免含糊 OR/AND 语义。
- [ ] 实现内部通用 `NativeRef<'layer' | 'source' | 'element'>` 和只用于同步输入分发的 `TransientNativeRef<'input-event'>`，并在 `src/core/style/types.ts` 单独定义可从根入口导出的 opaque `NativeStyleRef`（含不可构造的 unique-symbol brand）。`ElementStyleState = StyleSpec | NativeStyleRef`，声明文件允许出现 `NativeStyleRef`，但不得泄漏通用/瞬时 NativeRef、Registry 或 OL/DOM 对象。
- [ ] 实现 `cloneCoreState`：数组、普通对象和坐标深拷贝；NativeStyleRef/持久内部 NativeRef 保留同一冻结 token；`TransientNativeRef`、函数和未知 class 实例拒绝克隆。持久 native ref 归当前 Earth registry 所有，copy/history/remove 不使 token 失效，统一在 Earth.destroy 清空，跨 Earth 使用或销毁后 resolve 必须抛 `ObjectDisposedError`。
- [ ] 在同一纯 Core 提交中冻结 20 项 `ShapeType` 联合、基础 `ShapeState`/`RenderGeometryState`，并定义完整的纯数据 `StyleSpec`/`ElementStyleState` 契约；这样 ElementState 从首次提交起就不使用 `unknown` 占位。Task 5 增加图形行为，Task 7 增加样式服务与 OL 编译器，不再改变 ElementState 的字段类型。
- [ ] 运行上述四个测试、`npm run typecheck && npm run lint`，预期通过。
- [ ] 提交：`git commit -m "feat: add pure core contracts"`。

## Task 5: 建立 ShapeRegistry 与全部内置图形定义

**Files:**

- Modify: `src/core/shape/types.ts`
- Create: `src/core/shape/ShapeRegistry.ts`
- Create: `src/builtins/shapes/basic.ts`
- Create: `src/builtins/shapes/plot/arrows.ts`
- Create: `src/builtins/shapes/plot/polygons.ts`
- Create: `src/builtins/shapes/plot/polylines.ts`
- Create: `src/builtins/shapes/plot/index.ts`
- Create: `src/builtins/shapes/index.ts`
- Create: `test/ShapeRegistry.test.ts`
- Create: `test/BasicShapeDefinition.test.ts`
- Create: `test/PlotShapeParity.test.ts`

**Produces:** Draw、Edit、Transform、FeatureBinding 和动画共同消费的唯一图形协议；20 种类型均不依赖 OL。

- [ ] 先写失败测试：重复注册抛错；未知类型抛 `CapabilityError`；normalize 不修改输入；clone 不共享坐标；能力查询准确；20 种固定 type 全部存在并能由控制点生成渲染几何。
- [ ] 固定 `ShapeType` 为：`point`、`polyline`、`polygon`、`circle`、`ellipse`、`attack-arrow`、`tailed-attack-arrow`、`fine-arrow`、`tailed-squad-combat-arrow`、`assault-direction-arrow`、`double-arrow`、`rectangle`、`triangle`、`equilateral-triangle`、`assemble-polygon`、`closed-curve-polygon`、`sector`、`lune-polygon`、`lune-polyline`、`curve-polyline`。
- [ ] `src/builtins/shapes/index.ts` 公开稳定只读 tuple `shapeTypes`，`ShapeType` 从该 tuple 派生并在根入口作为 type-only 导出；ShapeRegistry/ShapeDefinition 仍为内部实现，不因公开 type 常量而暴露注册能力。
- [ ] 实现协议：

```ts
export type ShapeCapability = 'draw' | 'edit' | 'translate' | 'rotate' | 'scale' | 'vertexEdit' | 'anchor' | 'path';

export interface ShapeDefinition<S extends ShapeState = ShapeState> {
  readonly type: S['type'];
  readonly capabilities: ReadonlySet<ShapeCapability>;
  normalize(input: unknown): S;
  clone(state: S): S;
  toRenderGeometry(state: S): RenderGeometryState;
  getControlPoints?(state: S): readonly Coordinate[];
  updateControlPoint?(state: S, index: number, coordinate: Coordinate): S;
}
```

- [ ] 把 `src/extends/plot/**` 的纯算法按箭头、面、线迁入 `src/builtins/shapes/plot/{arrows,polygons,polylines}.ts`；每个文件只注册同类 ShapeDefinition，算法不得创建 OL Geometry，也不得把控制点挂在 Feature/Geometry 上。旧文件在 Task 16 前保留供旧入口使用。
- [ ] Circle 只保留一个规范 state；Point 与 Billboard 合并为 `point`，图标差异由 StyleSpec 表达。
- [ ] 运行 `npx vitest run test/ShapeRegistry.test.ts test/BasicShapeDefinition.test.ts test/PlotShapeParity.test.ts`，预期通过；再运行现有 `test/GeometryTransform.test.ts test/TransformGeometry.test.ts` 做算法回归。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: add shape registry and builtins"`。

## Task 6: 实现 ElementStore、事务与快照

**Files:**

- Create: `src/core/transaction/types.ts`
- Create: `src/core/transaction/ElementTransaction.ts`
- Create: `src/core/element/snapshot.ts`
- Create: `src/core/element/ElementStore.ts`
- Create: `test/ElementStore.test.ts`
- Create: `test/ElementTransaction.test.ts`
- Create: `test/ElementLifecycle.v2.test.ts`

**Consumes:** Task 4 的 selector/clone/errors，Task 5 的 ShapeRegistry。

**Produces:** Element 唯一真源、原子变更集和可用于 Edit/Transform 历史的快照。

- [ ] 先写失败测试，覆盖 add/get/query/update/remove/hide/show/copy/clear、重复 ID、缺失查询、空破坏性 selector、事务一次通知、异常回滚、快照深拷贝、NativeStyleRef 同引用、destroy 后除幂等 destroy 外均抛 `ObjectDisposedError`。
- [ ] 实现核心签名：

```ts
export class ElementStore {
  add<T>(input: ElementState<T>): Readonly<ElementState<T>>;
  get<T>(id: string): Readonly<ElementState<T>> | undefined;
  query<T>(selector?: ElementSelector<T>): readonly Readonly<ElementState<T>>[];
  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): ElementChangeSet;
  remove(selector: ElementSelector): ElementChangeSet;
  hide(selector: ElementSelector): ElementChangeSet;
  show(selector: ElementSelector): ElementChangeSet;
  copy<T>(id: string, overrides?: ElementCopyOptions<T>): Readonly<ElementState<T>>;
  clear(): ElementChangeSet;
  transaction<T>(work: (tx: ElementTransaction) => T): TransactionResult<T>;
  subscribe(listener: (changes: ElementChangeSet) => void): () => void;
  destroy(): void;
}
```

- [ ] 默认 `layerId` 在 Facade 归一化为 `default`，Core Store 不自行创建图层。所有写操作经 transaction 产生带 before/after snapshot 的 `ElementChangeSet`；外部 listener 异常要隔离并交给注入错误通道，不能回滚已提交状态。
- [ ] `copy` 必须生成新 id、共享 NativeStyleRef、深拷贝其余纯状态，且不复制动画/会话。`clear()` 是唯一允许空选择器语义的全量删除入口。
- [ ] 运行 `npx vitest run test/ElementStore.test.ts test/ElementTransaction.test.ts test/ElementLifecycle.v2.test.ts`，预期通过。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: add transactional element store"`。

## Task 7: 实现完整 StyleSpec、StyleService 与单向 StyleCompiler

**Files:**

- Modify: `src/core/style/types.ts`
- Create: `src/services/style/types.ts`
- Create: `src/services/style/StyleService.ts`
- Create: `src/facade/styleTypes.ts`
- Create: `src/facade/StyleFacade.ts`
- Create: `src/adapters/openlayers/NativeRefRegistry.ts`
- Create: `src/adapters/openlayers/style/pattern.ts`
- Create: `src/adapters/openlayers/style/StyleCompiler.ts`
- Create: `src/builtins/styles/presets.ts`
- Create: `test/StyleSpecCapabilities.test.ts`
- Create: `test/StyleService.test.ts`
- Create: `test/StyleCompiler.test.ts`
- Create: `test/NativeStyleBoundary.test.ts`

**Consumes:** ElementStore 的事务更新与 NativeRef。

**Produces:** Element 持有的规范样式状态、内置 preset、OL Style 单向编译和 nativeStyle 高级逃生口。

- [ ] 先写 `StyleSpecCapabilities.test.ts`，固定以下能力不可缺失：icon `src/size/color/offset/displacement/scale/rotation/rotateWithView/anchor/anchorOrigin/anchorXUnits/anchorYUnits/origin/opacity/crossOrigin`；text `text/font/fontFamily/fontSize/fontWeight/fontStyle/fill/stroke/backgroundFill/backgroundStroke/padding/offsetX/offsetY/scale/textAlign/textBaseline/rotation/rotateWithView/overflow/placement/maxAngle/repeat/justify/keepUpright`；stroke `color/width/lineDash/lineDashOffset/lineCap/lineJoin/miterLimit`；fill 纯色与 pattern；circle 半径/填充/描边；`fitPatternOnce`、多层描边、双描边和箭头装饰。
- [ ] Pattern 测试固定 diagonal/cross/dot/horizontal/vertical、size、lineWidth、dotRadius、backgroundColor 及缺省颜色继承 stroke；icon displacement 与 text offset 在 view rotation 下保持屏幕方向；静态箭头支持末端/每段重复，并在 geometry 事务更新后重编译。
- [ ] 写 `StyleCompiler.test.ts`，覆盖 point circle、point icon、text 背景与 padding、线多层 Style、polygon pattern、箭头、分辨率缓存；写 `NativeStyleBoundary.test.ts`，覆盖同一 Earth 保留引用、copy 共享引用、跨 Earth ref 拒绝、外部序列化报错、结构化 patch/动画报 `UnsupportedOperationError`。
- [ ] 运行四个新测试，确认模块不存在而失败。
- [ ] 实现纯 Core 样式联合：

```ts
export interface StyleSpec {
  symbol?: CircleSymbolSpec | IconSymbolSpec;
  strokes?: readonly StrokeSpec[];
  fill?: SolidFillSpec | PatternFillSpec;
  text?: TextSpec;
  decorations?: readonly ArrowDecorationSpec[];
  zIndex?: number;
}

export type ElementStyleState = StyleSpec | NativeStyleRef;
```

- [ ] `src/services/style/types.ts` 和内部 `StyleService` 只接受纯数据 `StyleSpec | NativeStyleRef`，不得导入 OL。`src/facade/styleTypes.ts` 在公共边界定义 `StyleInput = StyleSpec | { nativeStyle: StyleLike }`；`StyleFacade` 把 nativeStyle 注册为 opaque ref 后再调用内部 service。Earth 最终公开 `styles: StyleFacade`，根入口导出稳定的 `StyleService` 公共接口类型和 `NativeStyleRef` 类型，但不导出创建/resolve ref 的能力。
- [ ] `NativeRefRegistry` 每个 Earth 独立，持久引用支持 register/require/release/destroy，瞬时引用使用单独的 `registerTransient/requireTransient/releaseTransient` overload；瞬时 token 释放后立即失效且永不进入 ElementState、snapshot 或序列化输出。Task 9 再用真实输入事件固定同步作用域与异常清理。
- [ ] `StyleCompiler` 只做 `StyleSpec | NativeStyleRef → StyleLike`，绝不从 OL Style 反向生成 StyleSpec。把 `src/common/PatternFill.ts` 的算法完整迁入确定的新路径 `src/adapters/openlayers/style/pattern.ts`，StyleCompiler 只从该文件导入；处理 HTMLCanvas 与 OffscreenCanvas，Task 16 删除旧文件后不保留任何反向引用。
- [ ] 内置 preset 固定包含 `point-default`、`icon-default`、`line-default`、`polygon-default`、`measure-default`、`draw-preview`、`transform-handle`；`src/builtins/styles/presets.ts` 导出稳定 `stylePresets` 与派生的 `StylePresetName`，每次取值返回全新可修改的 StyleSpec，不共享嵌套数组。
- [ ] 运行 `npx vitest run test/StyleSpecCapabilities.test.ts test/StyleService.test.ts test/StyleCompiler.test.ts test/NativeStyleBoundary.test.ts test/PatternFill.test.ts test/LayeredOutline.test.ts test/ArchitectureImportGraph.test.ts`，预期通过。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: add canonical style pipeline"`。

## Task 8: 实现 LayerManager、GeometryCodec、FeatureBinding 与 Element/Layer Facade

**Files:**

- Create: `src/core/layer/types.ts`
- Create: `src/core/layer/LayerManager.ts`
- Create: `src/core/ports/HitTestPort.ts`
- Create: `src/adapters/openlayers/GeometryCodec.ts`
- Create: `src/adapters/openlayers/LayerAdapter.ts`
- Create: `src/adapters/openlayers/FeatureBinding.ts`
- Create: `src/adapters/openlayers/HitTestAdapter.ts`
- Create: `src/facade/types.ts`
- Create: `src/facade/Element.ts`
- Create: `src/facade/ElementService.ts`
- Create: `src/facade/Layer.ts`
- Create: `src/facade/LayerService.ts`
- Create: `test/LayerManager.test.ts`
- Create: `test/LayerSpecTypes.test.ts`
- Create: `test/fixtures/LayerSpecTypes.ts`
- Create: `test/LayerOwnership.test.ts`
- Create: `test/GeometryCodec.test.ts`
- Create: `test/FeatureBinding.test.ts`
- Create: `test/MixedVectorLayer.test.ts`

**Produces:** 混合矢量图层、基础栅格/原生图层、小参数 Facade，以及 Element → Feature 的唯一投影路径。

- [ ] 先写失败测试：默认 vector id 为 `default`；一个 vector 同时承载 point/polyline/polygon/circle/plot；缺失或非 vector `layerId` 拒绝元素；external 原生 layer 只解绑，earth ownership 调用 dispose；Feature 的直接外部修改不回写 Store，下一次 Element 事务重新覆盖 Feature。
- [ ] 实现 Core layer 契约：

```ts
export type LayerOwnership = 'external' | 'earth';

export type CoreLayerSpec =
  | { kind: 'vector'; id: string; visible: boolean; opacity: number; zIndex?: number; wrapX: boolean; declutter: boolean }
  | {
      kind: 'tile';
      id: string;
      source: TileSourcePresetState | NativeRef<'source'>;
      sourceOwnership: LayerOwnership;
      visible: boolean;
      opacity: number;
      zIndex?: number;
    }
  | { kind: 'native'; id: string; ref: NativeRef<'layer'>; ownership: LayerOwnership };
```

- [ ] `LayerManager.ensureDefaultVector()` 幂等；remove 含 Element 的 vector layer 时抛 `InvalidArgumentError`，调用方必须先移动/删除元素；`clear/destroy` 按所有权释放。
- [ ] Layer Facade 提供 id/kind/visible/opacity/zIndex/olLayer getter 与 update/remove；opacity 在 2.0 统一为 OL 语义的 0..1，越界抛错，旧 0..100 作为明确 API break 记录。wrapX 默认 true；show/hide 只是 visible update，不改 ElementState。
- [ ] `GeometryCodec` 使用 ShapeRegistry 的 `toRenderGeometry`，为同一个 Feature 就地更新 Geometry；不得从 OL Geometry 回读 ShapeState。
- [ ] `FeatureBinding` 订阅单次 `ElementChangeSet`，批量新增/更新/移动图层/删除 Feature；Feature 只保存内部 element-id 标记，不保存完整 params、module 或第二份 style state。
- [ ] 公共 Facade 固定：

```ts
export class Element<T = unknown> {
  get id(): string;
  get state(): Readonly<ElementState<T>>;
  get olFeature(): Feature<Geometry>;
  update(patch: ElementPatch<T>): void;
  remove(): void;
}

export interface VectorLayerSpec {
  kind: 'vector';
  id?: string;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
  wrapX?: boolean;
  declutter?: boolean;
}

export interface TileLayerCommonSpec {
  kind: 'tile';
  id?: string;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
}

export type TileLayerSpec = TileLayerCommonSpec &
  (
    | { preset: 'osm'; url?: never; tileUrlFunction?: never; baseUrl?: never; source?: never; ownership?: never }
    | {
        preset: 'xyz';
        url: string;
        tileUrlFunction?: never;
        baseUrl?: never;
        source?: never;
        ownership?: never;
        attributions?: string | readonly string[];
      }
    | {
        preset: 'xyz';
        url?: never;
        tileUrlFunction: TileUrlFunction;
        baseUrl?: never;
        source?: never;
        ownership?: never;
        attributions?: string | readonly string[];
      }
    | { preset: 'compact-xyz'; baseUrl: string; url?: never; tileUrlFunction?: never; source?: never; ownership?: never }
    | { preset?: never; source: TileSource; ownership?: LayerOwnership; url?: never; tileUrlFunction?: never; baseUrl?: never; attributions?: never }
  );

export interface NativeLayerSpec {
  kind: 'native';
  id?: string;
  layer: BaseLayer;
  ownership?: LayerOwnership;
}

export type PublicLayerSpec = VectorLayerSpec | TileLayerSpec | NativeLayerSpec;
```

- [ ] `LayerSpecTypes.test.ts` 调用仓库 TypeScript 编译 `test/fixtures/LayerSpecTypes.ts`；fixture 用有效赋值和 `@ts-expect-error` 验证判别联合：native 必须有 layer、xyz 必须且只能有 url 或 tileUrlFunction、compact-xyz 必须有 baseUrl、osm 不接受 source/url、vector 不接受 native source。运行时对来自 JavaScript 的非法组合仍抛 `InvalidArgumentError`。
- [ ] `ElementService` 提供 add/get/query/update/remove/hide/show/copy/clear、`atPixel(pixel)` 与 `getScreenExtent(elementOrId)`；像素命中由注入的 OL hit-test adapter 返回 element-id/layer-id，再包装为 Element/Layer，找不到返回 `undefined`。`getScreenExtent` 对 point+icon 计算屏幕包围盒，推广并替代旧 Billboard.getIconExtent；其他 shape 使用 geometry/style 的屏幕 extent。所有批量入口复用同一 `ElementSelector`；空 selector 的 remove/hide/show/update 拒绝，clear 显式清空。`LayerService` 把公开 Source/Layer 分别注册为 opaque source/layer ref，再交给 Core。
- [ ] 内置 OSM/XYZ preset 只保存公开、无 token 的配置；`compact-xyz` 精确生成 `${baseUrl}/L{z两位十进制}/R{y八位大写十六进制}/C{x八位大写十六进制}.jpg`，保留旧字符串便捷行为；`xyz` 支持标准模板 URL 或 tileUrlFunction。用户自定义 TileSource 默认 external ownership，Earth 只从自建 TileLayer 解绑，显式 earth ownership 才 dispose source；用户原生 BaseLayer 同理。Vector layer 的 source 始终由 Earth/FeatureBinding 所有，不接受用户 source，也不绑定 Element Style。
- [ ] 运行 `npx vitest run test/LayerManager.test.ts test/LayerSpecTypes.test.ts test/LayerOwnership.test.ts test/GeometryCodec.test.ts test/FeatureBinding.test.ts test/MixedVectorLayer.test.ts test/ArchitectureImportGraph.test.ts`，预期通过。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: add layer and feature adapters"`。

## Task 9: 建立 InputRouter、EventService 与 InteractionCoordinator

**Files:**

- Create: `src/core/ports/InputPort.ts`
- Create: `src/services/events/types.ts`
- Create: `src/services/events/InputRouter.ts`
- Create: `src/services/events/EventService.ts`
- Create: `src/services/events/InteractionCoordinator.ts`
- Create: `src/facade/EventFacade.ts`
- Modify: `src/adapters/openlayers/NativeRefRegistry.ts`
- Create: `src/adapters/openlayers/InputAdapter.ts`
- Create: `test/InputRouter.test.ts`
- Create: `test/EventService.test.ts`
- Create: `test/InteractionCoordinator.test.ts`
- Create: `test/MultiEarthInputIsolation.test.ts`
- Create: `test/TransientNativeEventRef.test.ts`

**Produces:** 每个 Earth 一套输入监听、selector 路由、一次性订阅、交互互斥和固定右键仲裁。

- [ ] 先写失败测试，覆盖 pointermove/click/leftdown/leftup/doubleclick/rightclick/keydown；同一输入类型只安装一个底层监听；on/once/AbortSignal/disposer；selector 路由；listener 异常隔离；replace/reject 互斥；两个 viewport 互不影响。
- [ ] 补充 module hover transition（进入新 Element 与离开）、payload 的 coordinate/pixel/element/module/layer/originalEvent、keydown repeat 忽略、每类 global/module 状态查询与 module scoped cleanup。旧 manual enable/disable 作为已批准替代项：首个订阅自动安装、最后 disposer 自动解绑，不公开手工开关。
- [ ] 在 `InputRouter.test.ts` 固定浏览器右键行为：构造时无条件在当前 Earth viewport 安装 `contextmenu` 监听并 `preventDefault()`；不依赖 ContextMenuService 是否启用；不绑定 `document`；destroy 后移除；单例与多实例一致。
- [ ] 实现公共订阅契约：

```ts
export interface EventService {
  on<T extends EarthEventType>(type: T, listener: (event: EarthEventMap[T]) => void, options?: EventSubscriptionOptions): () => void;
  once<T extends EarthEventType>(type: T, listener: (event: EarthEventMap[T]) => void, options?: EventSubscriptionOptions): () => void;
}

export interface InteractionCoordinator {
  activate(session: ExclusiveInteractionSession, policy?: 'replace' | 'reject'): void;
  release(session: ExclusiveInteractionSession): void;
  handleContextMenu(event: RoutedPointerEvent): 'consume' | 'pass';
  cancelActive(reason: InteractionCancelReason): void;
}
```

- [ ] `InputPort` 只使用 Core 坐标、pixel、element-id、disposer 和 `TransientNativeRef<'input-event'>`；`InputRouter` 构造函数只依赖该 port。`InputAdapter` 实现 port，是唯一读取 OL MapBrowserEvent/viewport DOM 的模块；它把 `Feature` 命中结果通过 FeatureBinding 转为 element-id，并为每次原生输入在当前 Earth 的 NativeRefRegistry 注册瞬时 event ref。内部 routed/EventService payload 只含 id/state、坐标/pixel 与该 opaque ref；EventFacade 在公共同步回调边界把 id 包装成 Element、把 ref resolve 为公开 `originalEvent: Event`。InputAdapter 必须在整次同步路由外围用 `try/finally` release ref，EventService 不排队或保存它，用户 listener 抛错时 registry 计数也必须恢复；Service 不导入 Facade 或任何 DOM 类型。
- [ ] `TransientNativeEventRef.test.ts` 断言 public listener 同步收到原始 Event 引用；最后一个 listener 返回后 ref 立即无法 resolve；listener 抛错、once 自注销和递归分发均恢复 registry 基线计数；A Earth 的 ref 在 B Earth resolve 抛 `ObjectDisposedError`；destroy 会使尚在测试作用域中的 ref 失效。
- [ ] rightclick 固定顺序：viewport 原生事件先 preventDefault → Coordinator 让活动 session 处理 → 若 consume 则停止 → 否则 EventService 分发，后续由 ContextMenuService 决定是否展示。
- [ ] 用户回调异常上报错误通道后继续调用其他 listener；once 在回调前注销，保证递归触发也只调用一次。
- [ ] 运行 `npx vitest run test/InputRouter.test.ts test/EventService.test.ts test/InteractionCoordinator.test.ts test/MultiEarthInputIsolation.test.ts test/TransientNativeEventRef.test.ts test/ArchitectureImportGraph.test.ts`，预期通过。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: add isolated input routing"`。

## Task 10: 迁移 Overlay、Descriptor 与 ContextMenu 服务

**Files:**

- Create: `src/core/ports/AnimationControlPort.ts`
- Create: `src/core/ports/TransientAnimationPort.ts`
- Create: `src/core/animation/types.ts`
- Create: `src/core/ports/OverlayPort.ts`
- Create: `src/core/ports/ContextMenuViewPort.ts`
- Create: `src/services/overlay/types.ts`
- Create: `src/services/overlay/OverlayHandle.ts`
- Create: `src/services/overlay/DescriptorHandle.ts`
- Create: `src/services/overlay/OverlayService.ts`
- Create: `src/services/context-menu/types.ts`
- Create: `src/services/context-menu/ContextMenuService.ts`
- Create: `src/facade/ContextMenuFacade.ts`
- Create: `src/facade/overlayTypes.ts`
- Create: `src/facade/OverlayFacade.ts`
- Create: `src/adapters/openlayers/OverlayAdapter.ts`
- Create: `src/adapters/dom/ContextMenuViewAdapter.ts`
- Create: `test/OverlayService.test.ts`
- Create: `test/DescriptorLifecycle.test.ts`
- Create: `test/ContextMenuService.test.ts`

**Consumes:** ElementStore、InputRouter/EventService、InteractionCoordinator 与纯端口；动画先注入测试用 no-op port，Task 14 换成真实 AnimationManager。公开 Element/HTMLElement 只由 Facade 转换。

**Produces:** 明确 DOM 所有权、原子 Descriptor 清理和不影响浏览器右键屏蔽的地图菜单。

- [ ] 先写失败测试：add/get/query/remove/clear；用户 HTMLElement 默认 external 只解绑；earth ownership 才移除自建 DOM；Descriptor 创建 Overlay+连接线 Element，任一创建失败都回滚，删除任一关联对象都原子清理；Element 删除同步清理菜单状态。
- [ ] 写 ContextMenu 测试覆盖地图级、Element、module、级联项、before、visible/disabled、互斥、主题及元素级状态保存；未注册菜单时 viewport 的浏览器默认菜单仍被 InputRouter 屏蔽。
- [ ] 同一测试还覆盖 callback payload（item/scope/coordinate/pixel/Element/module/layer）、地图 postrender 后地理锚点保持、菜单动作/viewport 外 pointerdown/Escape/显式 close、菜单 DOM 事件隔离、default/module registration remove 与 Transform 右键仲裁。
- [ ] 实现固定接口：

```ts
export interface OverlayService {
  add<T>(spec: OverlaySpec<T>): OverlayHandle<T>;
  get<T>(id: string): OverlayHandle<T> | undefined;
  query<T>(selector?: OverlaySelector<T>): readonly OverlayHandle<T>[];
  remove(selector: OverlaySelector): number;
  clear(): void;
  createDescriptor<T>(spec: DescriptorSpec<T>): DescriptorHandle<T>;
}

export interface OverlayHandle<T> {
  readonly id: string;
  readonly position: Coordinate | undefined;
  readonly visible: boolean;
  update(patch: OverlayPatch<T>): void;
  setPosition(position: Coordinate | undefined): void;
  show(): void;
  hide(): void;
  panIntoView(options?: PanIntoViewSpec): void;
  destroy(): void;
}

export interface DescriptorHandle<T> {
  readonly id: string;
  readonly visible: boolean;
  update(patch: DescriptorPatch<T>): void;
  setPosition(position: Coordinate): void;
  show(): void;
  hide(): void;
  on(type: 'click' | 'close', listener: (event: DescriptorEvent<T>) => void): () => void;
  destroy(): void;
}

export interface ContextMenuService {
  register(target: ContextMenuTarget, spec: ContextMenuSpec): ContextMenuHandle;
  getItemState(target: ContextMenuStateTarget, key: string): ContextMenuItemState | undefined;
  setItemState(target: ContextMenuStateTarget, key: string, patch: Partial<ContextMenuItemState>): void;
  toggleItem(target: ContextMenuStateTarget, key: string): ContextMenuItemState;
  setTheme(theme: 'light' | 'dark'): void;
  toggleTheme(): 'light' | 'dark';
  clearElementState(elementId: string): void;
  close(): void;
}
```

- [ ] `overlayTypes.ts` 的公开 `OverlaySpec` 保留 element、position、offset、positioning、stopEvent、insertFirst、autoPan、className、module、data、ownership；`OverlaySelector` 支持 id/ids/module/visible/predicate，空 destructive selector 拒绝而 `clear()` 显式全清。`DescriptorSpec/Patch` 保留 list/custom content、header/footer、close、draggable、fixed line/color、position/pixel 固定模式、offset、data 和 item click。OverlayFacade 把 HTMLElement/custom content 转为 `NativeRef<'element'>` 后再调用内部 service。
- [ ] 把两个旧声明缺陷作为 2.0 修复：`type:'custom'` 必须实际渲染 string/HTMLElement content；内置 close 和显式 close 操作都必须触发一次用户 close callback，再执行 hide/destroy 策略。补充异常隔离和重复关闭测试。
- [ ] Overlay/Descriptor 测试覆盖 update、setPosition、show/hide、panIntoView、drag、fixed line、close/click、position 模式随地图移动、pixel 模式保持屏幕位置，以及关联 Element/animation 的原子清理。拖动通过 pointer capture/port 完成，不留下 document 级永久 listener。
- [ ] 所有 pixel-fixed Descriptor 共用每 Earth 一个 Overlay layout/render 订阅；禁止每 Descriptor 注册 map postrender。最后一个需要跟随的 handle 销毁后移除共享订阅，并在多 Earth/循环销毁测试中计数验证。
- [ ] `OverlayService` 和 `ContextMenuService` 分别只依赖 `OverlayPort`、`ContextMenuViewPort`；`OverlayAdapter` 实现前者，`ContextMenuViewAdapter` 实现后者。ContextMenuFacade 把公开 Element target 转为 id，把回调 payload 再包装为 Element。Service 文件不得导入 OL/DOM、Element Facade 或 `src/adapters/**`。
- [ ] `DescriptorHandle.destroy()` 顺序为停止关联动画 → 删除连接线 Element → 通过 OverlayPort 删除 overlay → 按 ownership 处理 DOM；重复 destroy 幂等，其他方法在销毁后抛 `ObjectDisposedError`。
- [ ] `src/core/animation/types.ts` 先定义纯数据 `AnimationChannel`、`PulseAnimationSpec`、`DashFlowAnimationSpec`、`PathTravelAnimationSpec` 与联合 `AnimationSpec`。`AnimationControlPort.ts` 定义 `play(selector, spec)` 和 `pause/resume/stop(selector, channels?)`，返回只含 stop/status 的纯端口 handle，不引用 Task 14 的实现类或 OL 类型；Task 14 的具体 manager/handle 实现以结构类型同时满足内部 port 与独立公开接口，公开声明不得 extends 内部 port。
- [ ] 同时定义不从根入口导出的 `TransientAnimationPort`：`playTransient({ ownerId, renderLayerId, renderTargetId, channel, animation })` 与 `stopTransient(ownerId)`；其中 animation 目前只含纯数据 `{ type: 'blink'; periodMs: number }`，handle 只有幂等 stop/status。它专门调度 Adapter 已注册的临时渲染目标，不接受 `ElementSelector`，也不得把 Transform 手柄写入 ElementStore。Task 10/13 使用可观测 fake/no-op，Task 14 的同一个 Earth 级 manager 实现真实调度。
- [ ] `ContextMenuService` 仅消费已经 preventDefault 的 routed event，不再自行决定是否屏蔽浏览器菜单，也不得添加 document 级 contextmenu 监听。
- [ ] 复用现有 `src/assets/style/context-menu.scss`、`descriptor.scss`、`tooltip.scss`，本阶段不修改网站或示例。
- [ ] 运行 `npx vitest run test/OverlayService.test.ts test/DescriptorLifecycle.test.ts test/ContextMenuService.test.ts test/InputRouter.test.ts test/ArchitectureImportGraph.test.ts`，预期通过。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: add overlay and context menu services"`。

## Task 11: 合并 Draw、Plot 与动态 Edit

**Files:**

- Create: `src/core/ports/DrawInteractionPort.ts`
- Create: `src/core/ports/EditInteractionPort.ts`
- Create: `src/services/draw/types.ts`
- Create: `src/services/draw/DrawService.ts`
- Create: `src/services/draw/DrawSession.ts`
- Create: `src/services/draw/EditSession.ts`
- Create: `src/facade/drawTypes.ts`
- Create: `src/facade/DrawFacade.ts`
- Create: `src/facade/DrawSessionFacade.ts`
- Create: `src/facade/EditSessionFacade.ts`
- Create: `src/adapters/openlayers/interactions/DrawInteractionAdapter.ts`
- Create: `src/adapters/openlayers/interactions/EditInteractionAdapter.ts`
- Create: `test/DrawSession.test.ts`
- Create: `test/EditSession.test.ts`
- Create: `test/ShapeDrawingParity.test.ts`
- Create: `test/DrawInteractionCoordination.test.ts`

**Consumes:** ShapeRegistry、ElementStore、内部 StyleService、InputRouter、InteractionCoordinator，以及注入的 DrawInteractionPort/EditInteractionPort；不消费 Element/Style Facade。

**Produces:** 一个覆盖基础与 Plot 的绘制入口，以及基于同一 ShapeDefinition 的事务式编辑。

- [ ] 先写失败测试：20 种 ShapeType 都可 start；点击/移动生成 preview；右键按图形语义完成或消费；finish/cancel；undo/redo；complete 返回 Element 而非 Feature；Edit cancel 恢复初始 snapshot；Edit finish 只提交一次 transaction。
- [ ] 在 `src/facade/drawTypes.ts` 实现公共接口：

```ts
export interface DrawService {
  start<T>(options: DrawOptions<T>): DrawSession<T>;
  edit<T>(element: Element<T>, options?: EditOptions): EditSession<T>;
  query<T>(selector?: ElementSelector<T>): readonly Element<T>[];
  clear(selector?: ElementSelector): number;
}

export interface DrawSession<T> {
  readonly status: InteractionStatus;
  readonly results: readonly Element<T>[];
  readonly finished: Promise<readonly Element<T>[]>;
  finish(): void;
  cancel(): void;
  undo(): boolean;
  redo(): boolean;
  on<K extends keyof DrawSessionEventMap<T>>(type: K, listener: (event: DrawSessionEventMap<T>[K]) => void): () => void;
}

export interface EditSession<T> {
  readonly element: Element<T>;
  readonly status: InteractionStatus;
  readonly finished: Promise<Element<T> | undefined>;
  finish(): void;
  cancel(): void;
  undo(): boolean;
  redo(): boolean;
  on<K extends keyof EditSessionEventMap<T>>(type: K, listener: (event: EditSessionEventMap<T>[K]) => void): () => void;
}
```

- [ ] `DrawOptions` 使用 `type/layerId/module/style/data/limit/keepGraphics`，不公开独立 PlotDraw/PlotEdit。`limit` 未定义或 0 表示持续绘制，正整数达到后自动 finish；`keepGraphics` 默认 true。false 时 complete 事件仍同步收到 live Element（绝不返回裸 Feature），所有 complete listener 返回后立即通过事务 remove，该 Element 随后按统一 disposed 规则失效，`session.results` 只包含保留的 Element。用测试固定这一时序。
- [ ] preview 与最终结果共同调用 ShapeDefinition，不维护第二套 plot 几何算法；DrawSession 事件覆盖 start/change/click/complete/cancel，并把旧 drawstart/drawing/drawingClick/drawend/drawexit 行为逐一映射。EditSessionEventMap 固定 `modifying/complete/cancel`，complete 携带提交后的 Element，cancel 恢复初始状态并让 `finished` resolve `undefined`；finish resolve 当前 Element，所有事件回调异常隔离。
- [ ] 内部 DrawService 维护当前 Earth 的 draw-owned id 集合并订阅 Element remove 清理；该集合不写入 ElementState。`query()` 只查询这些 id，`clear()` 无参显式清理全部 draw-owned 结果，有 selector 时与 owned-id 条件取 AND。这样替代旧 `get/remove` 及含糊的无参 remove，不会误删其他模块元素。
- [ ] 内部 Draw/Edit Service 的 session 只返回 element-id/state/snapshot，DrawFacade/SessionFacade/EditSessionFacade 才接收或返回 Element。Service 只调用纯端口；两个 OL Adapter 实现端口，并可在 Adapter 内部消费 GeometryCodec，负责 OL 公共交互事件、命中与 preview Feature。所有持久化写入由 session 调用 Element transaction；不得读取 `Draw.downPx_` 或在 Feature 上保存 plotType 参数。
- [ ] Edit 测试覆盖 underlay on/off、临时控制点、普通与 Plot 的 modifying/cancel/complete payload、Ctrl+Z/Ctrl+Y、右键 commit，以及 wrapX：进入编辑时归一化到当前 world copy，提交时恢复规范 world 坐标。
- [ ] InteractionCoordinator 默认 replace；reject 显式抛 `InteractionConflictError`。session 完成/取消/destroy 必须释放 OL interaction、preview、listener 和快捷键。
- [ ] 运行 `npx vitest run test/DrawSession.test.ts test/EditSession.test.ts test/ShapeDrawingParity.test.ts test/DrawInteractionCoordination.test.ts test/PlotShapeParity.test.ts test/ArchitectureImportGraph.test.ts`，预期通过。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: unify draw plot and edit sessions"`。

## Task 12: 迁移 Measure 到 Draw/Overlay 基础设施

**Files:**

- Create: `src/core/ports/MeasurementPort.ts`
- Create: `src/services/measure/types.ts`
- Create: `src/services/measure/MeasureService.ts`
- Create: `src/services/measure/MeasureSession.ts`
- Create: `src/facade/measureTypes.ts`
- Create: `src/facade/MeasureFacade.ts`
- Create: `src/adapters/openlayers/MeasurementAdapter.ts`
- Create: `test/MeasureSession.test.ts`
- Create: `test/MeasureInteractionCoordination.test.ts`

**Produces:** 四种明确的测量会话，共用绘制、样式与 Overlay 生命周期。

- [ ] 先写失败测试，覆盖 `distance-segments`、`distance-total`、`distance-radial`、`area`；单位/格式化；动态 tooltip；point/line/text 样式（含旧声明未生效的 textSize）；total-distance 显示开关；完成结果；cancel 回滚；clear；多次启动无监听/Overlay 泄漏；右键完成且不出现浏览器默认菜单。
- [ ] 在 `src/facade/measureTypes.ts` 实现公共接口；MeasureFacade 只做公开 options/result 与内部纯状态的转换：

```ts
export type MeasureType = 'distance-segments' | 'distance-total' | 'distance-radial' | 'area';

export interface MeasureService {
  start(options: MeasureOptions): MeasureSession;
  clear(): void;
}

export interface MeasureSession {
  readonly status: InteractionStatus;
  readonly finished: Promise<MeasureResult | undefined>;
  finish(): void;
  cancel(): void;
  on<K extends keyof MeasureSessionEventMap>(type: K, listener: (event: MeasureSessionEventMap[K]) => void): () => void;
}
```

- [ ] 同一文件导出稳定只读 `measureTypes = ['distance-segments', 'distance-total', 'distance-radial', 'area'] as const`，`MeasureType` 从它派生，避免运行时常量与 type union 漂移。

- [ ] MeasureSession 通过内部 DrawSession 获得 geometry，只依赖注入的纯 `MeasurementPort` 计算值，通过 OverlayService 管理 tooltip；`MeasurementAdapter` 实现该 port 并调用 OL 公共 sphere/geometry API。Service 不导入具体 Adapter，也不得自己重复安装 pointer/click/contextmenu listener。
- [ ] `MeasureSessionEventMap` 固定 `change/complete/cancel`；change 携带当前只读测量值，complete 携带最终 MeasureResult，cancel 清理临时对象并让 `finished` resolve `undefined`。事件 listener 异常通过 ErrorReporter 隔离，不阻断清理或其他 listener。
- [ ] `clear()` 只清理 MeasureService 自己创建并标记 module 的 Element/Overlay，不得清空用户其他元素；使用 `ElementSelector { module: internalMeasureModule }`。
- [ ] 把 `textSize` 与 `isShowTotalDistance` 两个旧声明缺陷在 v2 的 `MeasureOptions.text.fontSize` 和 `showTotal` 中真正实现，并加入 capability limitation resolution 断言。
- [ ] 运行 `npx vitest run test/MeasureSession.test.ts test/MeasureInteractionCoordination.test.ts test/DrawInteractionCoordination.test.ts test/ArchitectureImportGraph.test.ts`，预期通过。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: add measure sessions"`。

## Task 13: 迁移 Transform 为 Element 事务会话

**Files:**

- Create: `src/core/ports/TransformInteractionPort.ts`
- Create: `src/core/ports/TransformToolbarPort.ts`
- Create: `src/services/transform/types.ts`
- Create: `src/services/transform/TransformHistory.ts`
- Create: `src/services/transform/TransformSession.ts`
- Create: `src/services/transform/TransformService.ts`
- Create: `src/facade/transformTypes.ts`
- Create: `src/facade/TransformFacade.ts`
- Create: `src/facade/TransformSessionFacade.ts`
- Create: `src/facade/TransformToolbarHandle.ts`
- Create: `src/adapters/openlayers/interactions/TransformInteractionAdapter.ts`
- Create: `src/adapters/dom/TransformToolbarAdapter.ts`
- Create: `src/adapters/openlayers/transform/HandleLayer.ts`
- Create: `src/adapters/openlayers/transform/HitTest.ts`
- Create: `src/adapters/openlayers/transform/PreviewTransform.ts`
- Create: `test/TransformSession.v2.test.ts`
- Create: `test/TransformShapeCapabilities.test.ts`
- Create: `test/TransformHistory.v2.test.ts`
- Create: `test/TransformStyleCapabilities.test.ts`

**Consumes:** Element transaction/snapshot、ShapeRegistry、StyleService、InteractionCoordinator、Task 10 的 AnimationControlPort/TransientAnimationPort，以及注入的 TransformInteractionPort。

**Produces:** 保留地图点击选取和直接 Element 选取的 Transform，会话中不克隆 Feature、不解析 OL Style。

- [ ] 先写失败测试，覆盖 `start()` 后点击地图选择、`select(element)` 直接选择、translate/rotate/scale/stretch/vertex edit、复杂图形控制点、copy/remove、undo/redo、finish 一次提交、cancel 回滚、工具栏命令和 session 清理。
- [ ] `TransformOptions` 测试固定 target selector/predicate/layer filter、hitTolerance、translate `none|center|feature`、scale/stretch/rotate 独立开关、translateBBox、noFlip、keepRectangle、buffer、pointRadius、custom handle style/center、historyLimit、toolbar 和 replace/reject policy。已批准的 2.0 session 仍以单个 Element 为公共目标；旧低层多 selection API 作为 intentional API break 记录，不从内部 TransformInteraction 重新导出。
- [ ] 事件测试覆盖 select/selectEnd、enterHandle/leaveHandle、translate/rotate/scale 的 start/progress/end、edit、copy-preview confirm/cancel、remove 和 error；右键在活动 session 中优先退出/取消，不打开地图菜单。
- [ ] `TransformStyleCapabilities.test.ts` 固定现有视觉变换能力：icon scale/rotation/displacement/anchor、text font size/scale/rotation/offset、circle radius、stroke width、pattern 与多层描边不得因变换丢失；nativeStyle 请求结构化变换时明确报错。
- [ ] 在 `src/facade/transformTypes.ts` 实现公共契约：

```ts
export interface TransformService {
  start(options?: TransformOptions): TransformSession;
  select<T>(element: Element<T>, options?: TransformOptions): TransformSession<T>;
}

export interface TransformReplaceOptions {
  retainHistory?: boolean;
}

export interface TransformSession<T = unknown> {
  readonly selected: Element<T> | undefined;
  readonly status: InteractionStatus;
  readonly toolbar: TransformToolbarHandle | undefined;
  select(element: Element<T>): void;
  finish(): void;
  cancel(): void;
  undo(): boolean;
  redo(): boolean;
  copy(options?: ElementCopyOptions<T>): Element<T>;
  replaceSelected(element: Element<T>, options?: TransformReplaceOptions): void;
  remove(): void;
  on<K extends keyof TransformEventMap<T>>(type: K, listener: (event: TransformEventMap<T>[K]) => void): () => void;
}

export interface TransformToolbarHandle {
  setActive(key: string): void;
  updateItem(key: string, patch: TransformToolbarItemPatch): void;
  updateOptions(patch: TransformToolbarOptionsPatch): void;
  show(): void;
  hide(): void;
  destroy(): void;
}
```

- [ ] 内部 TransformService/Session 只操作 element-id/state/snapshot；TransformFacade/SessionFacade 才接收和返回 Element。Service 先查询 ShapeDefinition capability，再通过纯 `TransformInteractionPort` 请求手柄/preview；不得导入具体 Adapter、Element Facade 或按 `plotType` switch。OL Adapter 实现该 port，只做命中、手柄和临时 preview，最终 geometry/style 通过一次 Element transaction 提交。
- [ ] `TransformInteractionPort` 创建会话时返回纯数据 `{ renderLayerId, renderTargetId }`，指向 Adapter 内部 HandleLayer 的 bbox 渲染目标；TransformSession 只把这两个 id 交给 `TransientAnimationPort.playTransient`，从不把 HandleLayer/bbox 建模为公开 Element。session finish/cancel/destroy 必须先 stop transient handle，再让 interaction adapter 注销目标；Task 13 用 fake port 固定调用顺序和重复清理幂等。
- [ ] 复制能力保留指针 preview（mousemove 更新、左键确认、右键取消）以及 Ctrl+C/V/X、Delete；clipboard 只保存 ElementSnapshot，cut/remove 是事务，paste/copy 生成新 id。`replaceSelected` 刷新 adapter、toolbar 和可选历史，替代旧 replaceEditingFeature。
- [ ] `TransformHistory` 只保存 ElementSnapshot 与命令元数据，禁止 clone OL Feature/Geometry/Style；删除 lodash clone/cut 依赖路径。
- [ ] 会话激活时通过 `AnimationControlPort` 暂停冲突 channel，并通过 `TransientAnimationPort` 启动 bbox blink；finish 后按提交结果恢复，remove/cancel/destroy 按契约恢复或终止。此任务用可观测 fake port 测试，Task 14 绑定真实 manager。
- [ ] `TransformToolbarAdapter` 通过纯 TransformToolbarPort 与 SessionFacade 交互；保留现有工具栏图标、copy/edit/undo/redo/remove/save 命令和 setActive/updateItem/updateOptions 能力。toolbar 是 TransformSession 的可选视图，不拥有选择、历史或 geometry 状态；show/hide 不得开始或结束 session，destroy 只销毁视图。
- [ ] Toolbar view-sync 测试在 map moveend、resolution 和 rotation 变化后重新定位到当前 selection bbox，并确认另一个 Earth 的 toolbar 不移动；session/destroy 后所有 view listener 归零。
- [ ] 运行 `npx vitest run test/TransformSession.v2.test.ts test/TransformShapeCapabilities.test.ts test/TransformHistory.v2.test.ts test/TransformStyleCapabilities.test.ts test/ArchitectureImportGraph.test.ts`，预期通过；再运行现有 `test/TransformGeometry.test.ts test/TransformHistory.test.ts test/TransformStyleSnapshot.test.ts` 做算法回归。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: add transactional transform sessions"`。

## Task 14: 建立统一 AnimationManager 与每图层单 RenderPass

**Files:**

- Create: `src/core/ports/LayerRenderPort.ts`
- Create: `src/services/animation/types.ts`
- Modify: `src/core/animation/types.ts`
- Create: `src/services/animation/AnimationHandle.ts`
- Create: `src/services/animation/AnimationRegistry.ts`
- Create: `src/services/animation/AnimationManager.ts`
- Create: `src/builtins/animations/pulse.ts`
- Create: `src/builtins/animations/dashFlow.ts`
- Create: `src/builtins/animations/pathTravel.ts`
- Create: `src/builtins/animations/index.ts`
- Create: `src/adapters/openlayers/render/LayerRenderPass.ts`
- Modify: `src/adapters/openlayers/interactions/TransformInteractionAdapter.ts`
- Modify: `src/adapters/openlayers/transform/HandleLayer.ts`
- Create: `test/AnimationManager.test.ts`
- Create: `test/AnimationBuiltins.test.ts`
- Create: `test/LayerRenderPass.test.ts`
- Create: `test/AnimationLifecycle.test.ts`

**Produces:** Point/Polyline/FlightLine 能力统一由 Earth 级 manager 管理，不存在逐元素 RAF/postrender。

- [ ] 先写失败测试：play/pause/resume/stop/status/finished；同目标同 channel replace；不同 channel 组合；selector 按 id/module/layerId/type；hide 暂停/show 恢复；remove/destroy 停止；copy/snapshot 不复制运行状态。
- [ ] `src/builtins/animations/index.ts` 固定导出 `animationTypes = ['pulse', 'dash-flow', 'path-travel'] as const`，`AnimationType` 从它派生；registry 实现仍为内部类型。
- [ ] `LayerRenderPass.test.ts` 用 fake scheduler 创建同层 1,000 个 Element 动画和一个 Transform transient target，断言该 layer 仍只有一个 postrender 订阅和每帧最多一次 `layer.changed()`；无活动动画后取消调度；时间只读取同一 `frameState.time`。
- [ ] 实现接口：

```ts
export interface AnimationManager {
  play(selector: ElementSelector, spec: AnimationSpec): AnimationHandle;
  pause(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  resume(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  stop(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  stopAll(): void;
}

export interface AnimationHandle {
  readonly id: string;
  readonly status: AnimationStatus;
  readonly finished: Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
}
```

- [ ] `pulse` 覆盖 Point+icon 的 flash/pulse；`dashFlow` 覆盖 Polyline 虚线流动；`pathTravel` 覆盖 FlightLine 的路径移动、曲率/平滑度、基于时间的速度、头部、尾迹、箭头、渐变/纯色、重复、结束行为、起终锚点、结束锚线及其颜色。旧 `setFlightPosition` 映射为事务更新 path geometry，运行中的 definition 在下一帧读取新 state；静态箭头继续属于 StyleSpec decoration。
- [ ] wrapX 测试把 view 移到相邻 world copy，确认 pulse、dashFlow 与 pathTravel 在可见副本绘制且不修改规范坐标；动画时间、暂停和完成状态在跨 world 后连续。
- [ ] 公开 `AnimationManager` 完整声明自身方法，不 extends 或引用内部 port；具体实现类以结构类型同时实现公开接口、内部 `AnimationControlPort` 与 `TransientAnimationPort`，且只依赖 `LayerRenderPort` 安装/移除图层级帧回调。`LayerRenderPass` 实现该 port 并持有 OL layer/render event；TransformInteractionAdapter/HandleLayer 在 port 中注册和注销 `renderTargetId`，manager 每帧只提交纯 blink channel 值，找不到或已注销 target 时停止对应 handle。每个 animation definition 只输出当前帧的临时 geometry/style channel 值，不写回 ElementState。NativeStyleRef 请求样式字段动画时抛 `UnsupportedOperationError`。
- [ ] `AnimationManager` 订阅 Element change set，把 hide/show/remove/layer move 映射到 handle 生命周期；Earth destroy 时先 stopAll，再释放 render pass。
- [ ] Transform bbox 的 420ms active blink 调用内部 `playTransient({ ownerId: session.id, renderLayerId, renderTargetId, channel: 'transform-bbox', animation: { type: 'blink', periodMs: 420 } })`，不占用公开 `AnimationManager.play(ElementSelector, ...)`，禁止独立 interval、RAF 或逐 Element postrender；translate/scale 暂停 point pulse，结束后恢复，polyline arrow/dash/path 在事务 preview 中跟随 geometry。
- [ ] 增加 transient 生命周期断言：Transform target 不出现在 `earth.elements.query()`；session finish/cancel/destroy 会停止贡献并注销 target；先注销 target、重复 stop、Earth.destroy 均不泄漏；同一个 layer 的普通动画和 bbox blink 共用一个 RenderPass。
- [ ] 针对旧缺陷增加清理测试：按单 Element stop/remove 必须同时移除 dash-flow 的临时投影；pathTravel remove/stop 必须解绑唯一 layer pass 中对应条目；最后一项移除后 layer postrender listener 为 0。
- [ ] 用真实 AnimationManager 替换 Descriptor/Transform 构造中的 no-op port，并运行其生命周期测试。
- [ ] 运行 `npx vitest run test/AnimationManager.test.ts test/AnimationBuiltins.test.ts test/LayerRenderPass.test.ts test/AnimationLifecycle.test.ts test/DescriptorLifecycle.test.ts test/TransformSession.v2.test.ts test/ArchitectureImportGraph.test.ts`，预期通过。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: add unified animation manager"`。

## Task 15: 组装新 Earth、View/Controls 与 useEarth get-or-create 注册表

**Files:**

- Create: `src/internal/EngineContext.ts`
- Create: `src/internal/createEngineContext.ts`
- Create: `src/facade/ViewService.ts`
- Create: `src/facade/ControlService.ts`
- Create: `src/adapters/openlayers/world.ts`
- Create: `src/facade/earthRegistry.ts`
- Create: `src/facade/Earth.ts`
- Create: `src/facade/useEarth.ts`
- Create: `test/EarthServices.test.ts`
- Create: `test/EarthLifecycle.v2.test.ts`
- Create: `test/UseEarthRegistry.v2.test.ts`
- Create: `test/EarthContextBoundaries.v2.test.ts`
- Create: `test/EarthMultiInstance.v2.test.ts`
- Create: `test/ViewService.v2.test.ts`

**Produces:** 每实例完整服务树、明确销毁顺序、默认/命名实例 get-or-create 与高级未注册构造方式。

- [ ] 先写失败测试固定 overload 与行为：

```ts
useEarth(): Earth;
useEarth(id: string): Earth;
useEarth(options: UseEarthOptions): Earth;
new Earth(options?: EarthOptions);
```

断言 `useEarth()` 连续调用返回同一默认实例；`useEarth('planning')` 独立且重复返回同一实例；实例 destroy 后同 key 再调用创建新引用；`new Earth()` 从不进入注册表；不存在 `createEarth/getEarth/destroyEarth`。
- [ ] `UseEarthOptions` 固定包含可选 `id/target/view/controls`；无 id 使用内部默认 registry key，首次无 target 时默认实例 target 为 `olContainer`、命名实例 target 为该 id。已有实例再次传入冲突 options 时返回同一实例，并在非 production 通过注入 warning reporter 报告冲突，不隐式重建。
- [ ] `EngineContext` 只由 `createEngineContext` 创建并显式传给每个 service；新增 `EarthContextBoundaries.v2.test.ts` 扫描 `src/core/**`、`src/services/**`、`src/adapters/**`，拒绝 `useEarth`、`earthRegistry`、`resolveEarth`。
- [ ] EngineContext 内部字段使用 `map: Map`、`olView: View`、`viewport: HTMLElement`，避免与公开 ViewService 命名重叠；各模块只接收实际需要字段的 `Pick<EngineContext, ...>`，不把完整 context 存成方便但隐式的 service locator。
- [ ] `Earth` 固定公开 `map/elements/layers/styles/animations/draw/transform/measure/events/contextMenu/overlays/view/controls`；其中 `map` 是高级 OL Map 逃生口，`view` 是 ViewService 并通过只读 `view.olView` 暴露 OL View，避免“同一属性既是服务又是原生 View”的冲突。内部实现类不从根入口导出。
- [ ] `EarthServices.test.ts` 断言每个 service getter 在实例生命周期内引用稳定；默认 vector layer 取代旧 Point/Billboard/Polyline/Polygon/Circle/Overlay bundle，LayerService 的 id registry 取代 wrapper registry，均不再产生类型专用图层类。
- [ ] 保留默认交互行为：默认移除 DoubleClickZoom，MouseWheelZoom 使用当前零 duration/timeout 语义；测试只检查所属 Earth 的 interaction collection，不触碰其他实例。
- [ ] 在本任务先实现 `src/adapters/openlayers/world.ts`，再由 ViewService 迁移当前 flyHome/animateFlyTo/flyTo、center/zoom/定位行为，并提供 `setCursor(cursor)`、`useDefaultCursor()`、`useCrosshairCursor()`、`setDragEnabled(enabled)`、`worldWidth()`、`worldIndex(x)`、`normalizeToViewWorld(coords)`、`restoreToWorld(coords,index)`、`coordinateAtPixel(pixel)` 和 `translateCoordinatesToPixel(pixel,coords)`；`ViewService.v2.test.ts` 直接覆盖 world wrap 与 pixel 转换。ControlService 迁移 Graticule 和 ScaleLine。像素命中位于 `earth.elements.atPixel(pixel)`。所有 OL interaction/control 对象由当前 Earth Map 拥有，不使用默认实例。
- [ ] 生命周期固定为 `ready → destroying → destroyed`，`destroy(): void` 顺序：取消并回滚交互 → stop animations → 移除 input/events/contextmenu → destroy overlays/descriptors → clear elements/layers → detach/dispose map → 从 registry 注销相同引用。重复 destroy 为同步幂等 no-op，销毁返回后同 key 的下一次 useEarth 必须立即创建新实例。
- [ ] 多实例测试分别创建两个 map/viewport，断言 Store、Layer、NativeRef、events、context menu、overlay、interaction、animation、registry 完全隔离；销毁 A 不改变 B。
- [ ] 运行 `npx vitest run test/EarthServices.test.ts test/EarthLifecycle.v2.test.ts test/UseEarthRegistry.v2.test.ts test/EarthContextBoundaries.v2.test.ts test/EarthMultiInstance.v2.test.ts test/ViewService.v2.test.ts test/ArchitectureImportGraph.test.ts`，预期通过。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "feat: compose v2 earth facade"`。

## Task 16: 一次性切换 2.0 公共入口并删除旧架构与 lodash

**Files:**

- Create: `src/utils/id.ts`
- Create: `src/utils/math.ts`
- Create: `src/utils/throttle.ts`
- Create: `test/Throttle.test.ts`
- Create: `test/PublicApiSnapshot.test.ts`
- Create: `test/fixtures/v2PublicApiManifest.ts`
- Create: `test/NoRemovedDependencyImports.test.ts`
- Create: `test/V2CapabilityClosure.test.ts`
- Modify: `src/index.ts`
- Replace: `src/Earth.ts`（仅 re-export `src/facade/Earth.ts`）
- Replace: `src/useEarth.ts`（仅 re-export `src/facade/useEarth.ts`）
- Delete: `src/earthContext.ts`
- Delete: `src/ast.ts`
- Delete: `src/base/**`
- Delete: `src/components/**`
- Delete: `src/entries/**`
- Delete: `src/enum/**`
- Delete: `src/extends/flight-line/**`
- Delete: `src/extends/plot/**`
- Delete: `src/extends/toolbar/**`
- Delete: `src/extends/transform-interaction/**`
- Delete: `src/extends/index.ts`
- Delete: `src/interface/**`
- Delete: `src/modules/**`
- Delete: `src/common/Utils.ts`
- Delete: `src/common/PatternFill.ts`（其算法已在 Task 7 迁移）
- Delete: `src/common/featureKeys.ts`（内部 element-id key 已归 FeatureBinding）
- Delete: `src/common/index.ts`
- Modify: `rollup.config.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `test/PackageExports.test.ts`
- Replace: `test/Base.test.ts`
- Replace: `test/BaseLifecycle.test.ts`
- Replace: `test/BaseRegistration.test.ts`
- Replace: `test/CirclePatternLayer.test.ts`
- Replace: `test/ContextMenu.test.ts`
- Replace: `test/Controls.test.ts`
- Replace: `test/DynamicDraw.edit-session.test.ts`
- Replace: `test/DynamicDraw.lifecycle.test.ts`
- Replace: `test/DynamicDrawPolygonStyle.test.ts`
- Replace: `test/EarthContext.test.ts`
- Replace: `test/EarthContextBoundaries.test.ts`
- Replace: `test/EarthElementTarget.test.ts`
- Replace: `test/EarthLayerHandle.test.ts`
- Replace: `test/GeometryTransform.test.ts`
- Replace: `test/GlobalEvent.test.ts`
- Replace: `test/LayeredOutline.test.ts`
- Replace: `test/Measure.lifecycle.test.ts`
- Replace: `test/MeasureLifecycle.test.ts`
- Replace: `test/PatternFill.test.ts`
- Replace: `test/PolygonPatternLayer.test.ts`
- Replace: `test/PolylineWidth.test.ts`
- Replace: `test/Transform.lifecycle.test.ts`
- Replace: `test/TransformContextMenu.test.ts`
- Replace: `test/TransformDescriptorNavigation.test.ts`
- Replace: `test/TransformGeometry.test.ts`
- Replace: `test/TransformHistory.test.ts`
- Replace: `test/TransformMultiEarth.test.ts`
- Replace: `test/TransformStyleSnapshot.test.ts`
- Replace: `test/UseEarthRegistry.test.ts`
- Replace: `test/Utils.test.ts`
- Replace: `test/V1CapabilityBaseline.test.ts`

**Produces:** ESM-only 根 API、无旧 subpath、无重复实现、无 lodash 或其他普通运行时依赖。

- [ ] 先创建 `test/fixtures/v2PublicApiManifest.ts`，将根入口冻结为下面两个精确集合；`valueExports` 是运行时可导入符号，`typeExports` 只允许通过 `export type` 暴露。实施中若发现签名缺少命名类型，必须先在本计划/已批准设计中补充理由后修改 manifest，禁止让测试从当前 `src/index.ts` 反向生成期望值。

```ts
export const publicApiManifest = {
  valueExports: [
    'CapabilityError',
    'DuplicateElementIdError',
    'Earth',
    'Element',
    'InteractionConflictError',
    'InvalidArgumentError',
    'InvalidSelectorError',
    'Layer',
    'ObjectDisposedError',
    'UnsupportedOperationError',
    'add2',
    'animationTypes',
    'closeRing',
    'createId',
    'degToRad',
    'lerp2',
    'measureTypes',
    'quadraticBezier2',
    'radToDeg',
    'scale2',
    'shapeTypes',
    'stylePresets',
    'throttle',
    'trimClosingCoordinate',
    'useEarth'
  ],
  typeExports: [
    'AnimationChannel',
    'AnimationHandle',
    'AnimationManager',
    'AnimationSpec',
    'AnimationStatus',
    'AnimationType',
    'ArrowDecorationSpec',
    'CircleSymbolSpec',
    'Color',
    'ContextMenuHandle',
    'ContextMenuItemContext',
    'ContextMenuItemSpec',
    'ContextMenuItemState',
    'ContextMenuService',
    'ContextMenuSpec',
    'ContextMenuStateTarget',
    'ContextMenuTarget',
    'ControlService',
    'Coordinate',
    'DashFlowAnimationSpec',
    'DescriptorContent',
    'DescriptorEvent',
    'DescriptorHandle',
    'DescriptorPatch',
    'DescriptorSpec',
    'DrawOptions',
    'DrawService',
    'DrawSession',
    'DrawSessionEventMap',
    'EarthEventMap',
    'EarthEventType',
    'EarthKeyboardEvent',
    'EarthLifecycleState',
    'EarthOptions',
    'EarthPointerEvent',
    'EditOptions',
    'EditSession',
    'EditSessionEventMap',
    'ElementCopyOptions',
    'ElementCreateInput',
    'ElementPatch',
    'ElementSelector',
    'ElementService',
    'ElementState',
    'ElementStyleState',
    'EventService',
    'EventSubscriptionOptions',
    'FlyToOptions',
    'GraticuleOptions',
    'IconSymbolSpec',
    'InteractionPolicy',
    'InteractionStatus',
    'LayerKind',
    'LayerOwnership',
    'LayerPatch',
    'LayerService',
    'LayerState',
    'MeasureOptions',
    'MeasureResult',
    'MeasureService',
    'MeasureSession',
    'MeasureSessionEventMap',
    'MeasureType',
    'NativeLayerSpec',
    'NativeStyleRef',
    'OverlayHandle',
    'OverlayOwnership',
    'OverlayPatch',
    'OverlayPositioning',
    'OverlaySelector',
    'OverlayService',
    'OverlaySpec',
    'PanIntoViewSpec',
    'PathTravelAnimationSpec',
    'PatternFillSpec',
    'Pixel',
    'PublicLayerSpec',
    'PulseAnimationSpec',
    'ScaleLineOptions',
    'ScreenExtent',
    'ShapeState',
    'ShapeType',
    'SolidFillSpec',
    'StrokeSpec',
    'StyleInput',
    'StylePresetName',
    'StyleService',
    'StyleSpec',
    'TextSpec',
    'ThrottleOptions',
    'ThrottledFunction',
    'TileLayerCommonSpec',
    'TileLayerSpec',
    'TileUrlFunction',
    'TransformEventMap',
    'TransformOptions',
    'TransformReplaceOptions',
    'TransformService',
    'TransformSession',
    'TransformToolbarHandle',
    'TransformToolbarItemPatch',
    'TransformToolbarItemSpec',
    'TransformToolbarOptions',
    'TransformToolbarOptionsPatch',
    'TransformTranslateMode',
    'UseEarthOptions',
    'VectorLayerSpec',
    'ViewAnimationOptions',
    'ViewService'
  ]
} as const;
```

- [ ] `PublicApiSnapshot.test.ts` 用仓库 TypeScript Compiler API 和解析后的仓库 tsconfig 建立 `src/index.ts` Program。value/type 分类以 `ExportDeclaration.isTypeOnly`、`ExportSpecifier.isTypeOnly` 及直接 export declaration 的语法为准；checker 只负责 resolve alias 并验证符号确实具有相应 value/type flags。class（Earth、Element、Layer、错误类）只列在 valueExports，虽然它们也可用于类型位置，不要求在 typeExports 重复。两个集合都与 manifest 做集合相等比较，并断言无同名重复导出、无 `export *`、typeExports 不产生运行时值、pre-emit diagnostics 为空。
- [ ] 对 source Program 的每个根公共符号递归遍历 properties、call/construct signatures、base types、参数、返回值和 type arguments；用 visited set 防循环，忽略 TypeScript lib、JavaScript/DOM 标准声明与 `node_modules/ol/**` 公共声明。其余声明位于本仓库 `src/**` 的命名符号必须属于 `valueExports ∪ typeExports`，任何内部 port/Adapter/Registry/Store/transaction/history 类型或未导出 package-owned symbol 都使测试失败。唯一白名单是 `NativeStyleRef` 同文件中不可导入的一个 `unique symbol` brand 声明，并额外断言它没有根导出。公共参数/返回值上的 package-owned inline options type literal 也失败，必须改成 manifest 中的命名类型；回调 function type 和标准 utility generic 不受此规则影响。
- [ ] 先运行 `npm run build`，再用同一闭包算法和解析后的 tsconfig 对实际 `dist/types/index.d.ts` 建立第二个 Program，要求 diagnostics 为空、所有 package-owned 声明闭包均由同一 manifest 覆盖且无内部相对声明泄漏；随后动态 import `dist/esm/index.mjs` 并比较完整 `valueExports`。这两个路径与 Rollup/tsc/package exports 契约一致，不改成未规划的扁平 dist；因此 type-only 缺口和“导出接口 extends 内部 port”都无法绕过检查。
- [ ] 明确拒绝 `Base`、几何专用 Layer class、`Billboard`、`PlotDraw`、`PlotEdit`、`GlobalEvent`、旧 `Transform`、`destroyEarth`、`ShapeDefinition` 和内部 Adapter/Registry/Store/port 实现类。公开 Facade 的每个参数与返回值只能引用 manifest 中的命名类型、OL 10 的公开类型或 JavaScript/DOM 标准类型；声明不得借内部相对路径泄漏未导出类型。
- [ ] 写 `NoRemovedDependencyImports.test.ts`，递归扫描 `src`、Rollup 和构建声明，拒绝 `heatmap.js`、`lodash`、`mitt`、`ol-wind`、`wind-core`、`@types/lodash`，并拒绝逐元素 `requestAnimationFrame`/`postrender` 注册（唯一允许位置是 `LayerRenderPass.ts`）。
- [ ] 实现本包自己的 throttle，并固定类型与行为：

```ts
export interface ThrottledFunction<This, Args extends unknown[], Result> {
  (this: This, ...args: Args): Result | undefined;
  cancel(): void;
  flush(): Result | undefined;
}

export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

export function throttle<This, Args extends unknown[], Result>(
  fn: (this: This, ...args: Args) => Result,
  wait?: number,
  options?: ThrottleOptions
): ThrottledFunction<This, Args, Result>;
```

测试 leading/trailing 组合、this、参数、返回值、cancel、flush 和计时器释放。把旧 GUID、角度、二维插值/贝塞尔/向量/ring 能力迁为 `createId/degToRad/radToDeg/lerp2/add2/scale2/quadraticBezier2/closeRing/trimClosingCoordinate`；world wrap/pixel 坐标能力已在 Task 15 由 `src/adapters/openlayers/world.ts` 支持 ViewService，本任务只核对旧 Utils 测试已迁移，不再创建或移动该 adapter；旧 createStyle 映射内置 arrow style preset，旧 flash 映射 AnimationManager pulse，Pattern normalize/render 映射 Task 7 pattern adapter。不把旧 `Utils` class 作为兼容层保留。
- [ ] 重写 `src/index.ts` 为人工白名单导出；内部文件的存在不自动构成公共 API。`src/Earth.ts` 和 `src/useEarth.ts` 只做代理 re-export，方便仓库内部清晰入口，但 package 只暴露根路径。
- [ ] Rollup input 只保留 `{ index: 'src/index.ts' }`；external 明确排除 `ol` 和 `ol/*`；删除 multi-entry、lodash interop、Wind bundle 与 path rewrite。
- [ ] `package.json` 改为 ESM 发布契约：`type: "module"`，`exports` 仅 `.` 与 `./style.css`；删除 `./core`、`./layers`、`./draw`、`./measure`、`./transform`、`./plot`；`files` 只含 `dist`；保留 style side effect。
- [ ] 删除 `dependencies`，确保不存在 `optionalDependencies`、`bundleDependencies`；删除 `@types/lodash`。保留 `ol: 10.9.0` dev 与 `^10.9.0` optional peer。运行 `npm install --package-lock-only --ignore-scripts` 更新锁文件。
- [ ] 删除旧实现文件后，逐项把 capability matrix 的 `v2Entry` 与 `testFiles` 更新为实际新入口；不得通过重新导出旧类让 snapshot 通过。
- [ ] `V2CapabilityClosure.test.ts` 要求矩阵每行状态为 `implemented`，将 `v2Entry` 解析为实际根导出或仓库文件并断言存在，将 `testFiles` 解析为实际测试文件并断言存在；随后逐个检查这些测试文件确实包含对应 capability id，防止只填写无关测试路径。
- [ ] 同一 closure test 要求 `v1KnownLimitations` 每项都有 `fixed` 状态和测试证据，`v1ExcludedCapabilities` 只能匹配 `wind-*` 且引用规格第 2/16 节；任何其他 excluded/unmapped/untested 项都失败。
- [ ] 同步重写上方列出的全部非文档旧测试，使其导入 v2 Facade/Service/Adapter 并保留原场景断言：Base 系列映射 Element/Layer/FeatureBinding，pattern/outline/width 映射 StyleCompiler，DynamicDraw 映射 Draw/Edit，GlobalEvent 映射 EventService，Measure/Transform/ContextMenu/Controls/Earth/useEarth 映射各自新服务；`V1CapabilityBaseline.test.ts` 改为逐行断言 legacy evidence 已由 v2 coverage marker 接管。不得把这些文件加入 code-test exclude；若与新增 v2 测试场景重复，也保留一个简短回归断言，确保旧缺陷编号仍可定位。
- [ ] 先运行 `npm run typecheck && npm run lint && npm run build` 生成全新 dist，再运行 `npx vitest run test/PublicApiSnapshot.test.ts test/NoRemovedDependencyImports.test.ts test/PackageExports.test.ts test/Throttle.test.ts test/V2CapabilityMatrix.test.ts test/V2CapabilityClosure.test.ts`，预期通过；禁止针对旧 dist 运行产物 API 断言。
- [ ] `PublicApiSnapshot.test.ts` 还必须断言 ShapeDefinition 注册、AnimationRegistry、NativeRefRegistry、ElementStore 和所有 Adapter 均未从根入口导出；2.0 只内置图形，不提前公开不稳定的注册扩展点。
- [ ] 运行 `npm run test:code`，确认所有已重写的非文档旧回归与新增 v2 测试一起通过。
- [ ] 运行 `rg -n "lodash|heatmap\.js|mitt|ol-wind|wind-core|destroyEarth|PlotDraw|PlotEdit" src dist rollup.config.mjs package.json`，预期零命中。
- [ ] 提交时只暂存本任务 package hunks与源码：`git add -p package.json` 后检查 `git diff --cached -- package.json`，确认未夹带用户原有 metadata 改动。
- [ ] 提交：`git commit -m "refactor: cut over v2 public api"`。

## Task 17: 增加真实浏览器交互、隔离与泄漏回归

**Files:**

- Create: `playwright.config.ts`
- Create: `test/browser/vite.config.ts`
- Create: `test/browser/index.html`
- Create: `test/browser/main.ts`
- Create: `test/browser/v2-interactions.spec.ts`
- Create: `test/browser/v2-lifecycle.spec.ts`
- Modify: `package.json`（devDependency 与 scripts）
- Modify: `package-lock.json`

**Produces:** OL 10 真实 DOM/Canvas 下的 Draw/Edit/Measure/Transform、右键、多 Earth 和销毁验收。

- [ ] 添加精确 devDependency `@playwright/test: "1.54.2"`，添加 `test:browser: "playwright test"`；运行 `npx playwright install chromium` 准备本地测试浏览器。它是开发依赖，不进入发布包。
- [ ] fixture 页面只导入 `src/index.ts` 与 `src/assets/style/public.scss`，创建 `map-a`、`map-b` 两个 viewport；暴露测试专用、只读的 counters（listener 数、active render pass、overlay 数、registry keys），不得把这些 counters 导出到包 API。
- [ ] 先写浏览器失败用例：默认实例与命名实例各自显示地图；两个 viewport 的原生 contextmenu 均 `defaultPrevented`，页面其他区域不被屏蔽；销毁 A 后 A 恢复浏览器默认行为，B 仍屏蔽。
- [ ] 写交互用例：在 A 绘制 polygon 和 attack-arrow；动态编辑控制点；执行四类 measure 至少各一个完成/取消路径；用 `transform.start()` 点击选中并 translate/rotate/scale，再用 `transform.select()` 直接选择；验证右键完成优先于菜单，空闲时地图/element 菜单展示。
- [ ] 写生命周期用例：循环创建/销毁同一 id 20 次，断言 registry、DOM listener、OL overlay、interaction、animation handle、render pass 全部回到基线；同时存在 B 时其状态不变。
- [ ] 运行 `npm run test:browser`，预期全部通过；失败时先按 systematic-debugging 定位，不得用增加 timeout 掩盖 race。
- [ ] 把 `verify:code` 改为：`npm run typecheck && npm run lint && npm run format:check && npm run build && npm run test:code && npm run test:browser && npm run test:package`。build 必须位于 `test:code` 之前，保证 PublicApiSnapshot 总是读取本次全新 dist；此时 `test:package` 在 Task 18 完成前先保留现有命令，Task 18 再扩展。
- [ ] 运行 `npm run typecheck && npm run lint`。
- [ ] 提交：`git commit -m "test: add v2 browser interaction coverage"`。

## Task 18: 验收发布包、空缓存离线安装与完整消费者

**Files:**

- Create: `scripts/package/assert-package-contract.mjs`
- Create: `scripts/package/test-offline-install.mjs`
- Create: `test/fixtures/package-consumer/package.json`
- Create: `test/fixtures/package-consumer/index.mjs`
- Create: `test/fixtures/package-consumer/index.ts`
- Create: `test/fixtures/package-consumer/tsconfig.json`
- Create: `test/fixtures/package-consumer/index.html`
- Create: `test/fixtures/package-consumer/browser.ts`
- Create: `test/fixtures/ol-material/package.json`
- Create: `test/fixtures/ol-material/package-lock.json`
- Modify: `test/PackageExports.test.ts`
- Modify: `package.json`（scripts）

**Produces:** 对真实 tgz 的结构、零普通依赖、空缓存 engine-only 安装，以及预置 OL 完整闭包后的 ESM/类型/浏览器消费证明。

- [ ] 扩展 `PackageExports.test.ts`，只读取实际 `dist`，断言根 ESM 与声明可导入、`style.css` 存在、旧 subpath 都被 package exports 拒绝、声明不泄漏 internal Adapter、通用 `NativeRef<...>`、`TransientNativeRef<...>`、Registry、lodash 或 OL renderer 私有类型；稳定公开的 opaque `NativeStyleRef` 是明确允许项。
- [ ] `assert-package-contract.mjs` 先执行 `npm pack --dry-run --json` 并检查文件清单只含 package metadata、README/LICENSE（若存在）和 `dist/**`；再执行 `npm pack --json --ignore-scripts`，用系统 `tar -xzf <tgz> -C <temp>` 解包并读取 `package/package.json`，断言：

```js
assert.deepEqual(pkg.dependencies ?? {}, {});
assert.deepEqual(pkg.optionalDependencies ?? {}, {});
assert.deepEqual(pkg.bundleDependencies ?? pkg.bundledDependencies ?? [], []);
assert.deepEqual(pkg.peerDependencies, { ol: '^10.9.0' });
assert.deepEqual(pkg.peerDependenciesMeta, { ol: { optional: true } });
for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(pkg.scripts?.[name], undefined);
```

- [ ] `test-offline-install.mjs` 使用 `fs.mkdtemp` 创建 consumer 与全新空 cache；通过 `process.execPath` + `process.env.npm_execpath` 调 npm，执行且不得添加 `--omit=peer` 或 `--legacy-peer-deps`：

```text
npm install --offline --cache <empty-cache> --no-audit --ignore-scripts --no-fund <absolute-engine.tgz>
```

断言 exit code 0，`node_modules` 中只有 `@vrsim/earth-engine-ol`（以及 npm 自身的元文件），不存在 `ol/lodash/mitt/ol-wind/wind-core/heatmap.js`。
- [ ] 提交独立 `test/fixtures/ol-material/package.json` 与 lockfile，唯一 dependency 为精确 `ol: 10.9.0`。脚本先把 fixture 复制到临时目录，执行允许联网的 `npm ci --cache <material-cache> --ignore-scripts --no-audit --no-fund` 明确预置完整闭包，然后删除 node_modules；再创建全新 consumer，执行 `npm install --offline --cache <material-cache> ... ol@10.9.0 <engine.tgz>`。日志必须把“material preparation（可联网）”与“consumer installation（强制 offline）”分段，且该 cache 绝不用于前一个空缓存 engine-only 测试。
- [ ] 在完整 consumer 中运行 `node index.mjs` 验证根 ESM；用仓库的 TypeScript 5.9.3 对 fixture `index.ts` 执行 `--noEmit`；用仓库 Vite 启动 `browser.ts`，Playwright 创建并 destroy 最小 Earth；运行 `npm ls ol @vrsim/earth-engine-ol` 并断言版本唯一。
- [ ] package scripts 固定为：

```json
{
  "scripts": {
    "test:package": "npm run build && vitest run test/PackageExports.test.ts && node scripts/package/assert-package-contract.mjs && node scripts/package/test-offline-install.mjs"
  }
}
```

- [ ] 运行 `npm run test:package` 两次，第二次仍必须为每个 engine-only 用例创建新的空 cache，预期全部通过。
- [ ] 运行最终第一阶段门：`npm run verify:code`。随后单独运行 `npm test` 只记录因旧 website/文档契约与新 API 不一致产生的预期文档测试失败；任何非文档测试失败都是阻塞项。第一阶段不运行 `npm run docs:build`，也不为使 `npm test` 全绿而修改旧文档测试。
- [ ] 运行最终静态审计：

```text
git diff --check
rg -n "from ['\"]ol/(?!.*\\.js['\"])|anchor_|downPx_|context_|ol/renderer/Layer" src
rg -n "heatmap\.js|lodash|mitt|ol-wind|wind-core|@types/lodash" src dist rollup.config.mjs package.json
git status --short
```

第一条 `rg` 若因当前 ripgrep 不支持 lookaround 而报错，改由 `OpenLayers10Contract.test.ts` 执行同一断言；依赖扫描必须零命中。`git status` 只允许用户原有 `package.json` metadata 改动，不允许生成的 `dist/` 或临时 tgz/cache 被跟踪。
- [ ] 对照 `test/fixtures/v2CapabilityMatrix.ts` 逐行运行所列测试，确认除 Wind 外没有 `unmapped` 或 `untested` 行。
- [ ] 提交：`git commit -m "test: verify offline v2 package contract"`。

---

## 第一阶段完成条件

- [ ] `npm run verify:code` 从干净构建开始通过。
- [ ] OL 固定为 dev `10.9.0`，peer 为 `^10.9.0` 且 optional；所有 OL import 使用公开 `.js` 路径，无私有字段或 renderer 类型。
- [ ] Core 无 OL/DOM；Element 是唯一真源；Feature 外部修改不回写；Shape/module/layer/id 解耦。
- [ ] useEarth 默认与命名实例均为 get-or-create；内部无隐式全局实例；多 Earth 资源完全隔离。
- [ ] 浏览器默认右键只在每个 Earth viewport 内无条件屏蔽，destroy 后解除，不影响页面其他区域。
- [ ] Draw/Plot/Edit、Measure、Transform、ContextMenu、Overlay/Descriptor、事件、View/Controls 和全部非 Wind 样式能力有自动化对等证据。
- [ ] 动画统一由每 Earth 一个 AnimationManager 管理，每活动 vector layer 最多一个 RenderPass，无逐元素 RAF/postrender。
- [ ] 发布包只有根 ESM 与 `style.css`；没有普通、optional 或 bundled runtime dependency；engine tgz 在全新空 npm cache 中独立离线安装成功且不安装 OL。
- [ ] `website/`、TypeDoc 输出、MIGRATION 和既有文档示例未被修改；第二阶段文档计划尚未开始。
