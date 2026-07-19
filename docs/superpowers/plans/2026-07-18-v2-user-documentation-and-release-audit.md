# 2.0 用户文档、示例与发布审计实施计划

> **执行要求：** 按任务顺序实施并使用 `- [ ]` 更新进度。阶段 8 不发布半迁移文档；只有阶段 9 的全部门槛通过后，才允许进入 2.0 发布流程。

**Goal:** 在已经冻结的 2.0 公共 API 上完成 website、TypeDoc 源注释、README、迁移指南和同源可运行示例迁移；让每一项保留的 1.x 能力和每一个 2.0 根导出都有唯一归属页、可验证链接和运行示例，并完成最终发布审计。

**Architecture:** 以 `src/index.ts` 的 TypeScript / TypeDoc reflection 作为完整公共 surface 真源，`v2PublicApiManifest` 冻结根导出，V1/V2 capability matrix 冻结能力闭环；`.test/coverage/publicApiCoverage.ts` 只记录手工示例证据，不参与推导公开成员集合。新增文档矩阵为每项能力和每个公开成员记录 website 路由、稳定锚点、同源 Vue 示例和迁移映射；website 只展示根入口与稳定服务，TypeDoc 从源码 JSDoc 生成。Task 3 先建立可移除的迁移期编译边界，此后旧 1.x 页面、示例、测试和 API helper 在对应 2.0 垂直切片完成时精确删除，Task 13 只做零残留审计。

**Tech Stack:** TypeScript 6、Vue 3、Vite 8、OpenLayers 10.9.0、TypeDoc 0.28、Vitest 4、Playwright、Sass。

## Global Constraints

- 本计划对应架构总纲的第二个宏观步骤，即阶段 8“文档迁移”和阶段 9“最终发布审计”，不是代码实施分解中的“阶段 2：Element、Layer 与 Style”。
- 执行前必须先运行 `npm run verify:code`。只有代码门槛通过且 `src/index.ts`、公共 API manifest、严格消费者与声明输出一致，才能冻结 API 并开始文档迁移。
- API 冻结前必须把 V1 `Polygon.positions: Coordinate[][]` 的多环/内环/洞单独登记为 `polygon-multi-ring-hole` 能力，并加入 V2 closure。当前迁移指南承认内置 polygon 只能生成单环，这与“Wind 是唯一 exclusion”的批准契约冲突；若新增能力行后代码门失败，立即停止第二阶段，回到代码阶段补齐实现与验收，不得删掉迁移警告、把它并入笼统 `element-polygon` 或接受为第二个 exclusion。
- 计划生成时工作区存在未提交的 linework、animation、shape、style 和交互测试改动。它们属于调用方的代码阶段工作；执行本计划时不得覆盖、回退或顺手整理这些改动。
- 计划生成时 website 的无写入 `vue-tsc` 基线有 364 个错误、涉及 64 个文件，58 个 Vue 示例中只有 `AnimationEffectsDemo.vue` 与 `ElementCoordinateStorageDemo.vue` 不报错。Tasks 1–3 是不可拆分提交的迁移 bootstrap：Task 3 必须用路由可达的 2.0 页面树恢复 `docs:build`，并用精确 legacy inventory 隔离尚未迁移、且不再被路由引用的 1.x 文件。此后每个领域切片都必须保持 `docs:build` 绿色并缩小 inventory；不得新增隔离项、用宽泛 exclude 掩盖缺页，或把清理拖到最终任务。
- 文档不得反向引入 1.x 兼容层、旧构造器、旧功能子路径或新的公共导出。发现实现能力遗漏时，停止对应文档切片，回到代码阶段修复并重新通过 `npm run verify:code`；需要改变已批准契约时先补充设计并获得确认。
- 所有用户调用只从 `@vrsim/earth-engine-ol` 根入口导入，样式只从 `@vrsim/earth-engine-ol/style.css` 导入。`/layers`、`/draw`、`/measure`、`/transform`、`/plot` 和 `/dist/*` 只可出现在明确标注为 1.x 的迁移反例中。
- `useEarth` 是常规入口；`new Earth(options)` 是高级自管入口。不得重新展示 `destroyEarth`、双参数 `Earth` / `useEarth` 或隐式默认 Earth 依赖。
- 每个公开值、类型、构造器、属性和方法只有一个规范归属页。完整 ID 集合必须由 `src/index.ts` 的 TypeScript / TypeDoc reflection 生成，再与 ownership 和文档矩阵做集合相等；手写 manifest 只冻结根导出，`publicApiCoverage` 只证明示例调用，不能作为公开成员发现机制。跨页说明只保留链接，不复制 API 定义表；OpenLayers 类型按外部类型展示，不伪装成本包根导出。
- 所有 `ExampleBlock` 使用稳定 `example-*` 锚点，并让运行预览和展示源码引用同一个 Vue 文件及其 `?raw` 内容。示例必须展示初始化、主要行为和 disposer/session/handle/Earth 的完整清理顺序。
- 任何 capability 从 `pending` 改为 `documented` 时，必须在同一领域任务同步写入 `MIGRATION.txt` 和 `website/src/config/v2MigrationCatalog.ts` 的专属稳定 marker；不得等到 Task 12 批量补录，也不得复用与该能力无关的通用段落。Task 12 负责完整渲染和文字校准，不替前序任务伪造迁移闭环。
- 所有含底图的 website 示例统一调用 `website/src/config/mapSources.ts` 的 `createConfiguredLayer`，不得在 `website/src/examples` 中硬编码瓦片 URL。`map-sources.json` 不得包含私有 token、账号或内网地址。
- 动画示例必须由 animation effect manifest 驱动，提供启动、暂停、恢复和停止；闪烁、呼吸、告警不得自动播放，并显示光敏性风险提示。
- 路径线饰只推荐 `lineStyles.polyline()` 与 `lineStyles.polygon()` 两个工厂；低层 `linework` 类型只作为状态、序列化和高级引用记录，不开放 renderer、Definition 或 registry。
- `docs/superpowers/specs/2026-07-16-v2-interaction-visual-design.md` 是内部实现规范。除公开操作协议或公共 API 外，不把光标、临时图层、锚点渲染和 Adapter 细节扩写成产品 API。
- TypeDoc 只修改源码 JSDoc、`typedoc.json` 和生成/检查脚本。不得手工编辑或提交忽略的 `website/public/api/`、`website/src/generated/`、`.cache/` 或 `dist/`。
- 所有新增界面样式使用 `website/src/assets/styles/index.scss` 的语义主题变量；同一切片必须检查浅色、深色和窄屏，不增加单主题硬编码色。
- 每个任务先补失败测试，再实现，再运行该任务的定向文档测试。代码阶段门槛在整个文档阶段保持通过；最终同时运行 `npm run verify:code`、`npm run verify` 和 `npm run docs:build`。
- 新增文档测试统一放在 `test/docs/**/*.test.ts`。`vitest.code.config.ts` 必须排除该目录，`vitest.docs.config.ts` 必须只收集该目录和迁移期间尚未移动的显式 legacy 文档测试；禁止继续靠不断扩张的文件名通配区分代码门与文档门，Task 13 必须移除所有 legacy 兼容 pattern。
- 修改 Prettier 历史基线文件时，必须在同一任务格式化文件，并同步从 `.prettierignore` 与 `PRETTIER_BASELINE_ENTRIES` 移除对应精确项。最后一个基线项在 Task 5 退出后，删除历史 baseline checker/test，把 `.prettierignore` 恢复为普通生成物忽略文件；不得更新 hash 来掩盖新改动。
- 第二阶段修改的 `website/src/**/*.{vue,ts,scss}` 必须进入根 `format` / `format:check` 的 Prettier 范围；不能让最终 `verify` 只检查源码而跳过产品文档源文件。
- Tasks 1–3 只形成一个 bootstrap 审查边界，不得分别提交不可构建的中间态。Tasks 4–12 每个任务结束都执行下方统一收尾，保存验证证据并形成单一领域提交边界；只有获得提交授权时才创建 commit，否则仅保留经审查的工作树边界。
- 本计划只完成文档与发布审计，不执行 `npm publish`、推送远端、创建 PR 或修改发布标签。

## 垂直切片统一收尾

Task 3 恢复文档构建后，Tasks 4–12 的每个领域任务除本任务列出的定向测试外，还必须依次运行：

```bash
npm run verify:code
npm run docs:build
git diff --check
git status --short
```

Expected: 全部 exit code 0；legacy inventory 只减少不增加；本切片的新页面、同源示例、API ownership、迁移 marker、旧资产精确删除和维护规则同步出现在同一份差异中。逐文件复核链接、资源清理和生成物后记录提交边界，再开始下一任务。

## 规范归属与路由冻结

以下路由在 Task 3 冻结。子页面可以按行为族拆分，但公共 API 定义仍只出现在表中归属页。

| 领域           | 规范路由                      | 主要归属                                                       |
| -------------- | ----------------------------- | -------------------------------------------------------------- |
| 安装与离线物料 | `/guide/quick-start`          | ESM、根入口、`style.css`、OL optional peer 与离线安装          |
| Earth 生命周期 | `/guide/earth-create`         | `useEarth`、`Earth`、`EarthOptions`、`UseEarthOptions`         |
| 视图           | `/guide/view`                 | `ViewService`、坐标、相机、像素与 world wrap options           |
| 控件           | `/guide/controls`             | `ControlService`、Graticule 与 ScaleLine options               |
| 图层           | `/components/layers`          | `Layer`、`LayerService`、`PublicLayerSpec` 与 ownership        |
| Element        | `/components/elements`        | `Element`、`ElementService`、`ElementState`、`ElementSelector` |
| Shapes         | `/components/shapes`          | `ShapeType`、`ShapeInput`、`ShapeState`、全部内置图形          |
| 样式           | `/components/styles`          | `StyleService`、`StyleSpec`、preset、`NativeStyleRef`          |
| 路径线饰       | `/components/styles/linework` | `lineStyles`、两个工厂 options 与低层 `linework` 类型          |
| Draw / Edit    | `/components/draw-edit`       | `DrawService`、Draw/Edit options、session 和事件               |
| Measure        | `/components/measure`         | `MeasureService`、options、session、result 和事件              |
| Transform      | `/components/transform`       | `TransformService`、options、session、toolbar 和事件           |
| Animation      | `/components/animation`       | `AnimationManager`、handle、全部 Animation Spec 与公共联合     |
| Events         | `/components/events`          | `EventService`、事件类型、载荷和订阅 options                   |
| ContextMenu    | `/components/context-menu`    | `ContextMenuService`、spec、handle、item 与 target 类型        |
| Overlay        | `/components/overlays`        | `OverlayService`、Overlay spec/selector/handle/ownership       |
| Descriptor     | `/components/descriptor`      | Descriptor spec/patch/handle/content/event                     |
| Utilities      | `/guide/utilities`            | math、ID、throttle、稳定错误类型和公共基础类型                 |
| 1.x → 2.0      | `/guide/migration-v2`         | 迁移表、明确删除项和源码兼容说明                               |

旧文档路由不得继续展示已删除的类。需要保留深链接时，只能重定向到上表规范页或 `/guide/migration-v2` 的对应稳定锚点。

---

## Task 1: 冻结公共 API 并建立独立文档验证门

**Files:**

- Modify: `package.json`
- Modify: `vitest.code.config.ts`
- Create: `vitest.docs.config.ts`
- Modify: `test/fixtures/v1CapabilityManifest.ts`
- Create: `test/PolygonMultiRingCapability.test.ts`
- Create: `test/fixtures/v2DocumentationMatrix.ts`
- Create: `test/docs/V2DocumentationMatrix.test.ts`
- Modify: `test/fixtures/v2CapabilityMatrix.ts`
- Modify: `test/V2CapabilityMatrix.test.ts`
- Modify: `test/V2CapabilityClosure.test.ts`

**Interfaces:**

- Consumes: `src/index.ts`、`test/fixtures/v2PublicApiManifest.ts`、`test/fixtures/v2CapabilityMatrix.ts`、`.test/coverage/publicApiCoverage.ts`。
- Produces: `npm run test:docs`；真正独立于代码门的文档测试目录；覆盖全部 legacy capability、根导出和公开成员的文档矩阵 schema。

- [ ] **Step 1: 验证代码阶段完成条件**

先把 V1 Polygon 多环/洞登记为独立 capability，并增加 `PolygonMultiRingCapability.test.ts` 与 V2 closure 验收，使当前单环实现明确失败；不得先运行旧的笼统矩阵并据此宣称已冻结。修复若需要扩展已批准的 ShapeInput / ShapeState 公共契约，必须先回到代码阶段补充设计并获得确认，再实现与重跑全部代码门。随后运行：

```bash
npm run verify:code
```

Expected: 只有 `polygon-multi-ring-hole` 与其他全部非 Wind 能力都有真实 V2 实现和验收时 exit code 0。若失败，记录失败证据并停止第二阶段；不得通过放宽文档测试、修改示例签名、删除迁移警告或增加 exclusion 来继续。

- [ ] **Step 2: 写入文档矩阵的失败测试**

定义显式 `V2DocumentationMatrixRow`，至少包含：

```ts
interface V2DocumentationMatrixRow {
  id: LegacyCapabilityId;
  status: 'pending' | 'documented';
  websitePage?: { route: string; source: string; anchor: string };
  example?: { route: string; pageSource: string; anchor: string; componentSource: string };
  migration?: { rootSource: 'MIGRATION.txt'; rootMarker: string; websiteSource: string; websiteMarker: string };
}

interface V2PublicApiDocumentationRow {
  id: string; // export:Earth、member:Earth.destroy 等稳定 ID
  status: 'pending' | 'documented';
  owner?: { route: string; source: string; anchor: string };
  example?: { route: string; pageSource: string; anchor: string; componentSource: string };
}
```

测试固定以下约束：legacy ID 与 `v2CapabilityMatrix` 集合相等且唯一；Wind 只存在于 exclusion；`documented` 行的 route、source、anchor、同源组件和两份迁移 marker 全部真实存在。根 marker 固定来自 `MIGRATION.txt`，website marker 在 Tasks 3–11 来自类型安全的 `v2MigrationCatalog`，Task 12 再验证该 catalog 全量渲染到迁移页，防止领域任务用无关通用锚点假闭环。Task 1 先以 `v2PublicApiManifest` 固定根导出行，Task 2 再用 TypeScript / TypeDoc reflection 生成完整构造器、属性、方法和类型成员 ID 并做集合相等；`publicApiCoverage` 只检查手工示例证据，不得补写或裁剪成员集合。进入 `documented` 后必须恰好映射到一个规范归属页。示例锚点在 `pageSource` 中，运行组件与 `?raw` 导入都必须指向同一个 `componentSource`。Task 13 才增加两张矩阵“零 pending”的最终断言。

- [ ] **Step 3: 增加独立文档测试命令**

`vitest.docs.config.ts` 主收集 `test/docs/**/*.test.ts`，`vitest.code.config.ts` 显式排除同一目录，`package.json` 增加 `test:docs`。迁移期间两个 config 只能逐路径枚举以下 18 个 legacy 文档测试，不得使用 `*Docs`、`Website*` 或其他通配：

```text
test/ApiDocGenerator.test.ts
test/BaseLayerDocs.test.ts
test/CoordinateInputDocs.test.ts
test/DescriptorDocs.test.ts
test/InteractionDocs.test.ts
test/LayerCommonDemoCoverage.test.ts
test/TransformDocs.test.ts
test/UseEarthDocs.test.ts
test/WebsiteApiDescriptionPunctuation.test.ts
test/WebsiteApiPresentation.test.ts
test/WebsiteBranding.test.ts
test/WebsiteDocumentTitle.test.ts
test/WebsiteHome.test.ts
test/WebsiteMapSources.test.ts
test/WebsiteScrollbar.test.ts
test/WebsiteSidebarHierarchy.test.ts
test/WebsiteTheme.test.ts
test/WebsiteTopMenu.test.ts
```

这些测试在所属领域任务中移动到 `test/docs/`，Task 13 删除整份兼容列表。任何新文档测试都不得放回 `test/` 根目录。website 的 Prettier 范围在 Task 13 切换全部手写页面后再进入根门禁，避免为了格式化即将删除的 1.x 页面制造无关差异。

- [ ] **Step 4: 建立完整 pending 基线**

为每个保留能力创建显式 pending 行，不从 website 反向推导能力集合。测试允许中间任务存在 pending，但必须报告各领域数量；Task 13 增加“零 pending”最终断言。不得用 `startsWith`、默认路由或 wildcard 自动掩盖未审计能力。

- [ ] **Step 5: 运行定向验证并审查冻结面**

运行：

```bash
npm run test:docs -- test/docs/V2DocumentationMatrix.test.ts
npm run test:code -- test/V2CapabilityMatrix.test.ts test/V2CapabilityClosure.test.ts test/PublicApiSnapshot.test.ts
```

Expected: schema、集合闭包和 API 快照通过；矩阵报告当前 pending 数量，但不存在缺失或重复 ID。

## Task 2: 将 TypeDoc 与 API 表数据源切换到 2.0 根导出

**Files:**

- Modify: `typedoc.json`
- Modify: `scripts/docs/api-docs.mjs`
- Modify: `scripts/docs/check-api-coverage.mjs`
- Modify: `.prettierignore`
- Modify: `scripts/check-prettier-baseline.mjs`
- Create: `website/src/docs/apiOwnership.ts`
- Modify: `website/src/components/docs/ApiTable.vue`
- Move/Modify: `test/ApiDocGenerator.test.ts` → `test/docs/ApiDocGenerator.test.ts`
- Modify: `test/PublicApiDocumentation.test.ts`
- Create: `test/docs/TypeDocV2Coverage.test.ts`
- Audit/Modify: `src/index.ts`
- Audit/Modify: `src/builtins/animations/index.ts`
- Audit/Modify: `src/builtins/styles/lineStyles.ts`
- Audit/Modify: `src/builtins/styles/presets.ts`
- Audit/Modify: `src/core/animation/types.ts`
- Audit/Modify: `src/core/common/types.ts`
- Audit/Modify: `src/core/element/types.ts`
- Audit/Modify: `src/core/errors.ts`
- Audit/Modify: `src/core/layer/types.ts`
- Audit/Modify: `src/core/shape/types.ts`
- Audit/Modify: `src/core/style/types.ts`
- Audit/Modify: `src/facade/ContextMenuFacade.ts`
- Audit/Modify: `src/facade/ControlService.ts`
- Audit/Modify: `src/facade/drawTypes.ts`
- Audit/Modify: `src/facade/Element.ts`
- Audit/Modify: `src/facade/Earth.ts`
- Audit/Modify: `src/facade/EventFacade.ts`
- Audit/Modify: `src/facade/Layer.ts`
- Audit/Modify: `src/facade/measureTypes.ts`
- Audit/Modify: `src/facade/overlayTypes.ts`
- Audit/Modify: `src/facade/styleTypes.ts`
- Audit/Modify: `src/facade/transformTypes.ts`
- Audit/Modify: `src/facade/types.ts`
- Audit/Modify: `src/facade/useEarth.ts`
- Audit/Modify: `src/facade/ViewService.ts`
- Audit/Modify: `src/services/animation/types.ts`
- Audit/Modify: `src/services/events/types.ts`
- Audit/Modify: `src/utils/id.ts`
- Audit/Modify: `src/utils/math.ts`
- Audit/Modify: `src/utils/throttle.ts`

**Interfaces:**

- Consumes: 冻结的根导出 manifest 与源码 JSDoc。
- Produces: classes、interfaces、functions、type aliases、variables、constructors、properties、methods、overloads 和中文说明的统一生成模型，以及 website 与测试共享的 API ownership registry。

- [ ] **Step 1: 写入 V2 TypeDoc 失败夹具**

扩展 `ApiDocGenerator.test.ts` 夹具，覆盖函数重载、类型别名、判别联合、readonly 属性、可选字段、构造器、类 getter、方法 overload、外部 OL 类型和中文 summary。新增覆盖测试，断言生成模型根名称与 `v2PublicApiManifest` 完全集合相等；再从 reflection 生成稳定的 `export:`、`constructor:`、`property:`、`method:` 和类型成员 ID，断言其与 `V2PublicApiDocumentationRow` 集合完全相等。方法 overload 共用规范成员 ID，但每个签名必须完整保留并由覆盖测试逐项验证。

- [ ] **Step 2: 验证旧脚本失败**

运行：

```bash
npm run doc
npm run test:docs -- test/docs/ApiDocGenerator.test.ts test/docs/TypeDocV2Coverage.test.ts
```

Expected: 旧模型只理解 class/interface，且 `check-api-coverage.mjs` 仍硬编码 `PointLayer`，测试失败。

- [ ] **Step 3: 实现根入口生成模型**

将 TypeDoc entry point 收窄到公开入口并排除 internal/private；扩展生成器保留 overload、参数、返回值、readonly/optional、联合、泛型、中文说明与引用信息。生成完整 public surface ID 集合并与 ownership / 文档矩阵反向比对，任何 reflection 中新增但 registry 缺失的成员都必须失败；不得只验证手写 registry 自身。新增 `apiOwnership.ts` 作为网站 API 表、类型链接和覆盖测试共用的编辑归属 registry，不在各页面重复维护链接映射；ApiTable 保留构造器/property/method/type 的既有视觉层级并能渲染重载。本任务中的检查脚本先核对完整 surface ID 集合；它不把 pending 行误报成已完成页面，也不再引用 `PointLayer` 或其他 1.x 类。Task 13 再启用 route、anchor、同源示例和唯一归属的严格检查。

- [ ] **Step 4: 审计源码中文 JSDoc**

先由 reflection resolve 根入口 alias，输出“公开 declaration → 实际 source file”审计表，并与 Files 中除模块说明入口 `src/index.ts` 外逐项枚举的源码集合相等；`src/Earth.ts` 与 `src/useEarth.ts` 只是 re-export wrapper，不作为声明 JSDoc 源。若出现额外文件，先更新计划并审查工作区重叠，不得用 `src/**` 批量改写。仅修正失败审计指向的根导出及公开成员中文摘要、`@param`、`@returns`、`@typeParam` 和可编译 `@example`。注释只说明契约、单位、所有权、错误和清理；不得复述实现、格式化无关代码或修改公共行为。

- [ ] **Step 5: 退出已修改文件的 Prettier 历史基线**

格式化 `scripts/docs/api-docs.mjs`、`typedoc.json` 和移动后的 `test/docs/ApiDocGenerator.test.ts`，在同一差异中从 `.prettierignore` 与 `PRETTIER_BASELINE_ENTRIES` 精确移除原来的三个路径；不得计算新 hash 延续豁免。此时只允许 `test/LayerCommonDemoCoverage.test.ts` 继续留在历史基线，等待 Task 5 重写。

- [ ] **Step 6: 运行生成链验证**

运行：

```bash
npm test -- test/PublicApiDocumentation.test.ts
npm run test:docs -- test/docs/ApiDocGenerator.test.ts test/docs/TypeDocV2Coverage.test.ts
npm run api:sync
npm run api:check
npm run format:check
npm run verify:code
```

Expected: 生成与覆盖检查通过。`website/public/api/`、`website/src/generated/` 和 `.cache/` 只用于本地验证，不加入提交。

## Task 3: 冻结 2.0 文档信息架构、导航和旧路由策略

**Files:**

- Modify: `AGENTS.md`
- Modify: `website/AGENTS.md`
- Modify: `website/package.json`
- Modify: `website/tsconfig.json`
- Create: `website/tsconfig.migration.json`
- Modify: `website/src/config/navigation.ts`
- Create: `website/src/config/v2MigrationCatalog.ts`
- Modify: `website/src/router/index.ts`
- Modify: `website/src/layouts/DocsLayout.vue`
- Modify: `website/src/utils/documentTitle.ts`
- Modify: `website/src/views/HomeView.vue`
- Modify: `website/src/assets/styles/index.scss`
- Create: `website/src/views/PendingDocumentationView.vue`
- Create: `website/src/views/ViewServiceView.vue`
- Create: `website/src/views/ControlServiceView.vue`
- Create: `website/src/views/LayersView.vue`
- Create: `website/src/views/ElementsView.vue`
- Create: `website/src/views/ShapesView.vue`
- Create: `website/src/views/StylesView.vue`
- Create: `website/src/views/LineworkView.vue`
- Create: `website/src/views/DrawEditView.vue`
- Create: `website/src/views/DrawBasicShapesView.vue`
- Create: `website/src/views/DrawPlotShapesView.vue`
- Create: `website/src/views/EditView.vue`
- Create: `website/src/views/EventsView.vue`
- Create: `website/src/views/EventPointerView.vue`
- Create: `website/src/views/EventKeyboardView.vue`
- Create: `website/src/views/OverlaysView.vue`
- Create: `website/src/views/AnimationSurfaceEffectsView.vue`
- Create: `website/src/views/AnimationPathEffectsView.vue`
- Create: `website/src/views/AnimationRadialEffectsView.vue`
- Create: `website/src/views/AnimationFadeLifecycleView.vue`
- Create: `website/src/views/UtilitiesView.vue`
- Create: `test/fixtures/legacyV1WebsiteInventory.ts`
- Create: `test/docs/WebsiteMigrationBoundary.test.ts`
- Create: `test/docs/WebsiteV2Navigation.test.ts`
- Move/Modify: `test/WebsiteSidebarHierarchy.test.ts` → `test/docs/WebsiteSidebarHierarchy.test.ts`
- Move/Modify: `test/WebsiteDocumentTitle.test.ts` → `test/docs/WebsiteDocumentTitle.test.ts`
- Move/Modify: `test/WebsiteHome.test.ts` → `test/docs/WebsiteHome.test.ts`
- Move/Modify: `test/WebsiteTheme.test.ts` → `test/docs/WebsiteTheme.test.ts`

**Interfaces:**

- Produces: “规范归属与路由冻结”表中的稳定主路由与行为族子路由、父子导航、标题、旧路径重定向，以及从本任务起持续为绿色的迁移期 website 构建。
- Consumes: Task 1 的文档归属 manifest。

- [ ] **Step 1: 写入导航与路由失败测试**

断言所有规范路由唯一存在、导航标签使用 V2 服务名、父级带 children 时始终展开、标题来自当前导航项；断言 `PointLayer`、`BillboardLayer`、`DynamicDraw`、`GlobalEvent` 等旧名称不再作为当前能力入口。同步冻结并接线 `/components/draw-edit/basic`、`/components/draw-edit/plot`、`/components/draw-edit/edit`、`/components/events/pointer`、`/components/events/keyboard`、`/components/animation/surface`、`/components/animation/path`、`/components/animation/radial` 和 `/components/animation/fade-lifecycle`，使 Tasks 7、9、11 的 documented route 在领域实现前就真实存在。

- [ ] **Step 2: 固定旧路径重定向表**

将 `/components/layer-common`、各几何 Layer、`/components/global-event` 和 `/components/dynamic-draw` 等旧入口显式映射到新归属页或迁移锚点。重定向必须有限、可测试，不使用捕获全部路径的 fallback 掩盖坏链接。

- [ ] **Step 3: 实现导航壳与页面标题**

先为新建的主规范页和上述全部行为族子页建立最小内部页面壳，固定标题、overview/api/examples 顶层锚点和 PageAnchor 结构，并在文档矩阵中保持 `pending`；页面壳不复制旧 API，也不作为可发布内容。对于复用旧文件名、但尚未迁移的 QuickStart、Earth、Measure、Transform、ContextMenu、Descriptor、Animation 和 Migration 路由，暂时接到统一的 `PendingDocumentationView.vue`，把原 1.x 文件列入精确 inventory，后续领域任务重写完成后再切回真实组件。随后按冻结路由重组“指南、核心能力、交互与服务、参考”层级。首页只展示 2.0 服务入口、根导入和迁移入口，不展示已删除的功能子路径或旧 Layer 类。Task 13 的零 pending 门阻止任何页面壳被发布。

- [ ] **Step 4: 建立显式且可移除的迁移期编译边界**

`website/tsconfig.migration.json` 继承 `tsconfig.app.json` 的严格编译选项，但必须显式覆盖为 `include: []` 与 `files: ['src/main.ts']`，让 TypeScript 只从当前 V2 router 的真实 import graph 继续解析；不能只追加 `files` 后意外继承原有全量 include。`website/tsconfig.json` 在迁移期引用它和原有 node config，workspace build 命令保持 `vue-tsc -b && vite build`。`legacyV1WebsiteInventory.ts` 精确列出所有尚未迁移且已从 router graph 断开的 1.x view/example/helper，不允许目录 glob、自动发现后静默加入或排除共享组件。测试锁定 migration config 的 root file 集合，并验证每个 inventory 文件真实存在、没有路由引用、没有 V2 页面引用，且 router 可达的每个手写 `.vue/.ts` 都被 typecheck；Tasks 4–12 在完成对应 V2 切片后精确删除旧文件并移除 inventory 行。Task 13 必须把 inventory 降为零、恢复 `tsconfig.app.json` 的全量引用并删除迁移 config。

- [ ] **Step 5: 更新 website 维护规则**

把 `website/AGENTS.md` 改为 2.0 契约：常规 Earth 入口是 `useEarth`、高级入口是公共 `new Earth(options)`；Layer 页面不再描述 Base 继承；EventService 用 `on` / `once` disposer 自动管理监听，不再要求 `add*` / `enable*` / `disable*`。保留 API 视觉层级、同源示例、地图源和主题规则，修正动画规则使其只约束用户可观察的性能/资源边界而不公开 RenderPass、slot 等内核名，并新增文档矩阵、唯一 ownership、服务/session/handle 清理约束。同步把根 `AGENTS.md` 的文档风格基准从即将删除的 PointLayer 页面改为保留的 2.0 AnimationManager 页面及其同源示例。增加测试防止这些 1.x 维护规则或内部实现名回流。

创建类型安全的 `v2MigrationCatalog`，以 capability ID 保存 website 迁移标题、稳定锚点、V1 入口、V2 入口和归属路由；Pending 页面只显示内部迁移进度，不把 pending 条目当作完成内容。Tasks 4–11 每个领域同步更新 catalog 与 `MIGRATION.txt`，Task 12 再让正式迁移页完整渲染 catalog。

- [ ] **Step 6: 验证主题与窄屏导航**

沿用语义主题变量，确保新层级在浅色、深色和窄屏下可读；不重新引入折叠 children 控件。

- [ ] **Step 7: 恢复文档构建并形成 bootstrap 审查边界**

运行：

```bash
npm run test:docs -- test/docs/WebsiteMigrationBoundary.test.ts test/docs/WebsiteV2Navigation.test.ts test/docs/WebsiteSidebarHierarchy.test.ts test/docs/WebsiteDocumentTitle.test.ts test/docs/WebsiteHome.test.ts test/docs/WebsiteTheme.test.ts
npm run verify:code
npm run docs:build
git diff --check
git status --short
```

Expected: 新路由、导航、标题、旧路由策略、维护规则和主题契约通过；website 从本任务起可完整类型检查并构建。逐文件审查 Tasks 1–3 的 API 冻结、测试边界、TypeDoc surface、页面壳和临时编译边界，记录唯一 bootstrap 提交边界，不分别提交 Tasks 1、2 的不可构建中间态。

## Task 4: 迁移安装、Earth、View 与 Controls 文档

**Files:**

- Modify: `MIGRATION.txt`
- Modify: `website/src/config/v2MigrationCatalog.ts`
- Modify: `website/src/router/index.ts`
- Modify: `website/src/views/QuickStartView.vue`
- Modify: `website/src/views/EarthCreateView.vue`
- Modify: `website/src/views/ViewServiceView.vue`
- Modify: `website/src/views/ControlServiceView.vue`
- Create: `website/src/examples/QuickStartDemo.vue`
- Modify: `website/src/examples/EarthCreateDemo.vue`
- Modify: `website/src/examples/MultiEarthDemo.vue`
- Modify: `website/src/examples/CameraDemo.vue`
- Modify: `website/src/examples/ControlsDemo.vue`
- Modify: `website/src/examples/MouseDemo.vue`
- Modify: `website/src/examples/ElementCoordinateStorageDemo.vue`
- Modify: `website/src/config/mapSources.ts`
- Modify: `website/public/map-sources.json`
- Move/Modify: `test/UseEarthDocs.test.ts` → `test/docs/UseEarth.test.ts`
- Move/Modify: `test/CoordinateInputDocs.test.ts` → `test/docs/CoordinateInput.test.ts`
- Create: `test/docs/ViewControls.test.ts`
- Move/Modify: `test/WebsiteMapSources.test.ts` → `test/docs/WebsiteMapSources.test.ts`
- Modify: `test/fixtures/legacyV1WebsiteInventory.ts`
- Modify: `test/fixtures/v2DocumentationMatrix.ts`

**Interfaces:**

- Produces: 安装/离线说明、Earth/useEarth、ViewService、ControlService 三个唯一归属页和坐标往返示例。
- Consumes: `Earth`、`UseEarthOptions`、`ViewService`、`ControlService` 冻结 API。

- [ ] **Step 1: 写入 V2 页面契约测试**

覆盖 `useEarth()`、`useEarth(id)`、`useEarth(options)`、`new Earth(options)`、幂等 `earth.destroy()`、注册实例销毁重建、多个 Earth 隔离、View/Controls 所有公开成员和 options 锚点。坐标契约测试同时覆盖扁平/嵌套结构保持、二维/三维 Z 保留、返回新数组且不修改输入，以及空数组、奇数扁平长度、稀疏数组、混合结构、NaN、Infinity 和无效投影结果的 `InvalidArgumentError`。断言不存在 `destroyEarth` 当前用法或双参数构造签名。

- [ ] **Step 2: 完成安装与离线物料说明**

说明 engine tgz 可以在空缓存中独立安装；`ol` 是安装时 optional peer、运行和构建消费者时必需；用户必须单独准备 OL 10.9.0 完整依赖闭包。不得把 optional 描述成运行时可选，也不得暗示 engine tgz 包含 OL。安装页还必须从根 `package.json` 读取并准确记录 Node `>=24.18.0 <25` 与 npm `>=11 <12`，不保留旧 Node 18 建议。

- [ ] **Step 3: 完成 Earth 与多实例示例**

优先展示 `useEarth`，再展示公共构造器。示例覆盖默认实例、命名实例、首次配置、销毁后重建、自管实例和卸载清理；运行与源码引用同一 Vue 文件。

同时把 `createConfiguredLayer` 改为调用 `earth.layers.add({ kind: 'tile', preset: 'xyz', ... })` 并返回公开 `Layer`，移除 `earth.createXyzLayer()` 及 OL `TileLayer<XYZ>` 返回类型。保留运行时 `map-sources.json` 注入、URL 模板替换和 opacity 语义。

- [ ] **Step 4: 完成 View / Controls 页面**

ViewService 页面覆盖视角定位、光标、DragPan、像素转换和 world wrap；ControlService 页面单独覆盖 Graticule、ScaleLine、options 和生命周期。两个页面互相链接但不复制类型定义或混用运行示例。坐标页面记录扁平/嵌套输入的形状保持、Z 保留、输入不变性和上述主要拒绝条件；示例必须展示“EPSG:4326 → 当前投影创建 Element → 从 Element 读取 → 转回 EPSG:4326”，并展示保存流程：先对 `Element.state` 坐标调用 `toGeographicCoordinates()`，外部格式需要扁平数组时再调用 `toFlatCoordinates()`。明确圆业务半径为米、OL Circle 半径为投影单位。

- [ ] **Step 5: 更新矩阵并验证**

将 QuickStart、Earth 及其旧示例从 legacy inventory 移除，把 pending 路由切回真实 V2 组件；将 Earth、View、Controls、坐标和离线安装相关行标为 `documented`，记录规范页、示例与迁移 marker。

运行：

```bash
npm run test:docs -- test/docs/UseEarth.test.ts test/docs/CoordinateInput.test.ts test/docs/ViewControls.test.ts test/docs/WebsiteMapSources.test.ts test/docs/V2DocumentationMatrix.test.ts test/docs/WebsiteMigrationBoundary.test.ts
```

Expected: 本领域无 pending，示例无硬编码地图 URL，链接和锚点真实存在。随后执行“垂直切片统一收尾”。

## Task 5: 迁移 Layer、Element 与 Shapes 文档

**Files:**

- Modify: `MIGRATION.txt`
- Modify: `website/src/config/v2MigrationCatalog.ts`
- Modify: `website/src/views/LayersView.vue`
- Modify: `website/src/views/ElementsView.vue`
- Modify: `website/src/views/ShapesView.vue`
- Create: `website/src/config/shapeCatalog.ts`
- Create: `website/src/examples/LayerLifecycleDemo.vue`
- Create: `website/src/examples/TileLayerDemo.vue`
- Create: `website/src/examples/NativeLayerOwnershipDemo.vue`
- Create: `website/src/examples/ElementCrudDemo.vue`
- Create: `website/src/examples/ElementSelectorDemo.vue`
- Create: `website/src/examples/ShapeGalleryDemo.vue`
- Delete: `website/src/views/BillboardLayerView.vue`
- Delete: `website/src/views/CircleLayerView.vue`
- Delete: `website/src/views/LayerCommonView.vue`
- Delete: `website/src/views/PointLayerView.vue`
- Delete: `website/src/views/PolygonLayerView.vue`
- Delete: `website/src/views/PolylineLayerView.vue`
- Delete: `website/src/examples/BaseLayerHandleDemo.vue`
- Delete: `website/src/examples/BillboardLayerBasicDemo.vue`
- Delete: `website/src/examples/BillboardLayerStyleDemo.vue`
- Delete: `website/src/examples/BillboardLayerUpdateDemo.vue`
- Delete: `website/src/examples/CircleLayerBasicDemo.vue`
- Delete: `website/src/examples/CircleLayerPatternDemo.vue`
- Delete: `website/src/examples/CircleLayerUpdateDemo.vue`
- Delete: `website/src/examples/LayerCommonDemo.vue`
- Delete: `website/src/examples/PointLayerBasicDemo.vue`
- Delete: `website/src/examples/PointLayerFlashDemo.vue`
- Delete: `website/src/examples/PointLayerStyleDemo.vue`
- Delete: `website/src/examples/PointLayerUpdateDemo.vue`
- Delete: `website/src/examples/PolygonLayerBasicDemo.vue`
- Delete: `website/src/examples/PolygonLayerStyleDemo.vue`
- Delete: `website/src/examples/PolygonLayerUpdateDemo.vue`
- Delete: `website/src/examples/PolylineLayerArrowFlowDemo.vue`
- Delete: `website/src/examples/PolylineLayerBasicDemo.vue`
- Delete: `website/src/examples/PolylineLayerFlightDemo.vue`
- Delete: `website/src/examples/PolylineLayerUpdateDemo.vue`
- Delete: `website/src/docs/billboardLayerApi.ts`
- Delete: `website/src/docs/circleLayerApi.ts`
- Delete: `website/src/docs/pointLayerApi.ts`
- Delete: `website/src/docs/polygonLayerApi.ts`
- Delete: `website/src/docs/polylineLayerApi.ts`
- Move/Modify: `test/BaseLayerDocs.test.ts` → `test/docs/LayerElementV2.test.ts`
- Move/Modify: `test/LayerCommonDemoCoverage.test.ts` → `test/docs/LayerExampleCoverage.test.ts`
- Create: `test/docs/ShapeV2.test.ts`
- Modify: `.prettierignore`
- Modify: `package.json`
- Delete: `scripts/check-prettier-baseline.mjs`
- Delete: `test/PrettierBaseline.test.ts`
- Modify: `test/fixtures/legacyV1WebsiteInventory.ts`
- Modify: `test/fixtures/v2DocumentationMatrix.ts`

**Interfaces:**

- Produces: 混合 VectorLayer、Tile/native ownership、Element 真源、Selector、20 个内置 Shape 的规范页面与示例。
- Replaces: Base、PointLayer、BillboardLayer、PolylineLayer 等几何专用类的当前文档。

- [ ] **Step 1: 写入 Layer / Element / Shape 失败测试**

测试根导出和 API 表完整性；验证 `PublicLayerSpec` 各判别分支、Layer handle、Element CRUD、空 Selector 安全规则、`olLayer` / `olFeature` 高级逃生口，以及 `shapeTypes` 与 `ShapeGalleryDemo` 的集合相等。

- [ ] **Step 2: 实现 Layer 页面与示例**

覆盖 vector、osm、xyz、compact-xyz、tileUrlFunction、native layer、`external` / `earth` ownership、visible/opacity/zIndex/wrapX、query/remove/clear 和清理顺序。默认与示例不得出现私有服务地址。

- [ ] **Step 3: 实现 Element 页面与示例**

说明 ElementState 是唯一业务真源，Feature 是单向渲染投影；覆盖 add/get/query/update/remove/hide/show/copy/clear/atPixel/getScreenExtent，批量写操作的空选择器错误，以及 module/layer/type/id 四维语义。

- [ ] **Step 4: 实现 Shapes 页面与可视图册**

从 `shapeTypes` / acceptance manifest 驱动 20 种图形的选项和示例，不维护手写的另一个集合。明确 Billboard 合并为 `point + icon symbol`、Circle 半径单位和公共 Shape 注册暂不开放。

- [ ] **Step 5: 更新矩阵并验证**

在新页面与示例闭合后，精确删除 Files 中列出的旧 Layer 资产并从 legacy inventory 移除对应项；旧深链接只保留 router redirect。格式化移动后的 `test/docs/LayerExampleCoverage.test.ts`，从 `.prettierignore` 和 `PRETTIER_BASELINE_ENTRIES` 移除最后一个历史基线路径。随后删除已经为空的历史 baseline checker 及其专用测试，把 `.prettierignore` 改为只忽略生成物的普通 Prettier ignore，并从 `format:check` 移除 checker 前置调用；不得保留空 hash 豁免机制。

运行：

```bash
npm run test:docs -- test/docs/LayerElementV2.test.ts test/docs/LayerExampleCoverage.test.ts test/docs/ShapeV2.test.ts test/docs/WebsiteMapSources.test.ts test/docs/V2DocumentationMatrix.test.ts test/docs/WebsiteMigrationBoundary.test.ts
npm run format:check
```

Expected: Layer、Element、基础几何、图标点和全部 Shape 行已闭合；页面不引用旧 Base 继承或几何专用 Layer；Prettier 历史基线已完全退出。随后执行“垂直切片统一收尾”。

## Task 6: 迁移 Style、Shape 样式与路径线饰文档

**Files:**

- Modify: `MIGRATION.txt`
- Modify: `website/src/config/v2MigrationCatalog.ts`
- Modify: `website/src/views/StylesView.vue`
- Modify: `website/src/views/LineworkView.vue`
- Create: `website/src/examples/StructuredStyleDemo.vue`
- Create: `website/src/examples/StylePresetDemo.vue`
- Create: `website/src/examples/NativeStyleBoundaryDemo.vue`
- Create: `website/src/examples/LineworkDemo.vue`
- Create: `test/docs/StyleV2.test.ts`
- Create: `test/docs/Linework.test.ts`
- Modify: `test/fixtures/v2DocumentationMatrix.ts`

**Interfaces:**

- Produces: `StyleService` / `StyleSpec` 唯一归属页和 `lineStyles` 唯一路径线饰归属页。
- Consumes: StyleSpec、stylePresets、NativeStyleRef、linework 类型与两个工厂的冻结契约。

- [ ] **Step 1: 写入样式覆盖失败测试**

逐项覆盖 symbol、strokes、fill、text、decorations、linework、zIndex、patch、preset 与 nativeStyle 边界；断言低层 linework 类型只在路径线饰页定义，Draw/Edit/Transform 只跨页引用。线饰测试还固定完整默认表、统一 color 继承、与顶层 strokes/decorations 互斥、linework 整体替换/删除 patch、Polygon outer ring / caps 限制和各动画效果行为，避免只验证字段名称存在。

- [ ] **Step 2: 实现结构化样式与 nativeStyle 页面**

展示完整 StyleSpec、preset、整体 set 与 patch；记录 PatternFill、多层描边、图标、文字、静态箭头、CSS 像素单位、复制/序列化语义。nativeStyle 页面明确同 Earth 引用、不可序列化、不可结构化 patch/动画、OL 大版本边界和错误类型。

- [ ] **Step 3: 实现路径线饰归属页**

记录 `lineStyles.polyline()`、`lineStyles.polygon()`、字段判别联合、非法组合、Polygon fill 组合、固定 CSS 像素与 Transform 语义。完整默认表必须列出：`color #ff0000`、`lines solid`、两端 caps none、decoration none、单/双轨 width 2 CSS px、双轨 offset -3/+3 CSS px、dash `[8, 6]`、dash offset 0、inline text 12px sans-serif/normal/normal/#000000、两侧 gap 6 CSS px；outline 默认白色 2 CSS px，background padding 默认 2 CSS px。说明统一 color 继承到 tracks、caps 和普通 decorations，但文本使用独立颜色；`linework` 与顶层 `strokes` / `decorations` 互斥，`StylePatch.linework` 只整体替换或删除。Polygon 第一版只装饰 outer ring，hole 不生成 linework 且禁止 caps。推荐入口只允许两个工厂，不新增第三个快捷工厂。

- [ ] **Step 4: 实现完整同源线饰示例**

同一运行示例至少覆盖：单线端帽、双线独立实/虚线、每种重复装饰的可发现入口、纯 slash、严格中点文本、曲线和 Polygon；示例还要展示 linework StyleSpec 在 Draw、Edit、Transform 中自动复用，而不复制 options 表。动画兼容段明确 fade/blink/highlight/alert 作用于全部线饰与 Polygon fill；dash-flow 只推进 dashed tracks；grow 按累计长度 reveal tracks、caps、重复装饰和中点 glyph/text 的时点，不把这些行为描述成任意 StyleSpec 的通用保证。

- [ ] **Step 5: 更新矩阵并验证**

运行：

```bash
npm run test:docs -- test/docs/StyleV2.test.ts test/docs/Linework.test.ts test/docs/V2DocumentationMatrix.test.ts
npm run typecheck:tests
```

Expected: 样式和 linework 根导出、字段、示例、TypeScript 非法组合与页面锚点闭合。随后执行“垂直切片统一收尾”。

## Task 7: 迁移 Draw、Edit 与 Measure 文档

**Files:**

- Modify: `MIGRATION.txt`
- Modify: `website/src/config/v2MigrationCatalog.ts`
- Modify: `website/src/router/index.ts`
- Modify: `website/src/views/DrawEditView.vue`
- Modify: `website/src/views/DrawBasicShapesView.vue`
- Modify: `website/src/views/DrawPlotShapesView.vue`
- Modify: `website/src/views/EditView.vue`
- Modify: `website/src/views/MeasureView.vue`
- Modify: `website/src/views/MeasureDistanceView.vue`
- Modify: `website/src/views/MeasureAreaView.vue`
- Modify: `website/src/views/MeasureRemoveView.vue`
- Create: `website/src/examples/DrawSessionDemo.vue`
- Create: `website/src/examples/DrawPlotShapesDemo.vue`
- Create: `website/src/examples/EditSessionDemo.vue`
- Modify: `website/src/examples/MeasureAreaDemo.vue`
- Modify: `website/src/examples/MeasureDistanceDemo.vue`
- Modify: `website/src/examples/MeasureRemoveDemo.vue`
- Delete: `website/src/views/DynamicDrawAdvancedGeometryView.vue`
- Delete: `website/src/views/DynamicDrawBasicGeometryView.vue`
- Delete: `website/src/views/DynamicDrawEditingView.vue`
- Delete: `website/src/views/DynamicDrawManagementView.vue`
- Delete: `website/src/views/DynamicDrawView.vue`
- Delete: `website/src/examples/DynamicDrawAdvancedGeometryDemo.vue`
- Delete: `website/src/examples/DynamicDrawDemo.vue`
- Delete: `website/src/examples/DynamicDrawEditingDemo.vue`
- Delete: `website/src/examples/DynamicDrawGeometryDemo.vue`
- Delete: `website/src/examples/DynamicDrawLifecycleDemo.vue`
- Delete: `website/src/examples/DynamicDrawManagementDemo.vue`
- Delete: `website/src/config/dynamicDrawGeometries.ts`
- Create: `test/docs/DrawEditV2.test.ts`
- Create: `test/docs/MeasureV2.test.ts`
- Move/Modify: `test/InteractionDocs.test.ts` → `test/docs/InteractionShared.test.ts`
- Modify: `test/fixtures/legacyV1WebsiteInventory.ts`
- Modify: `test/fixtures/v2DocumentationMatrix.ts`

**Interfaces:**

- Produces: Draw/Edit 的统一 API 归属页、按基础/Plot/编辑行为拆分的示例，以及 Measure session 文档。
- Replaces: DynamicDraw、PlotDraw、PlotEdit 和 Measure 构造器的当前文档。

- [ ] **Step 1: 写入 session 契约失败测试**

覆盖 DrawService start/edit/query/clear、options、session 状态/finished/finish/cancel/destroy/undo/redo/on、事件顺序和结果 Element；覆盖 MeasureService、四种 MeasureType、options、result、session 和 clear。

- [ ] **Step 2: 实现 Draw 概览与行为族页面**

基础图形和高级 Plot 共用 `earth.draw.start()`；示例从同一 Shape manifest 选择 type，展示 limit、keepGraphics、module/layerId/style/data、replace/reject、完成结果查询和清理。不得重新出现独立 Plot 入口。

- [ ] **Step 3: 实现 Edit 页面**

展示 `earth.draw.edit(element)`、underlay、undo/redo、finish/cancel/destroy、事件和清理。只记录用户可观察的控制点编辑协议，不把内部 CursorPort、临时 Feature 或 Adapter 资源公开成 API。

- [ ] **Step 4: 实现 Measure 页面**

按距离、面积和清理行为拆分示例；覆盖分段、总距、径向、面积、formatter/unit/precision、line/point/text、showTotal、动态结果、geographicCoordinates、右击完成和 `clear()`。明确 MeasureSession 没有虚构的 `destroy()`。

- [ ] **Step 5: 更新矩阵并验证**

把 Measure pending routes 切回重写后的真实组件；精确删除 DynamicDraw 旧页面、示例和 geometry 配置，并从 legacy inventory 移除本领域全部项。随后运行：

```bash
npm run test:docs -- test/docs/DrawEditV2.test.ts test/docs/MeasureV2.test.ts test/docs/InteractionShared.test.ts test/docs/V2DocumentationMatrix.test.ts test/docs/WebsiteMigrationBoundary.test.ts
```

Expected: 20 种 draw/edit 能力、会话生命周期和 Measure 能力都有唯一页面及运行示例。随后执行“垂直切片统一收尾”。

## Task 8: 迁移 Transform 文档与示例

**Files:**

- Modify: `MIGRATION.txt`
- Modify: `website/src/config/v2MigrationCatalog.ts`
- Modify: `website/src/router/index.ts`
- Modify: `website/src/views/TransformView.vue`
- Modify: `website/src/examples/TransformDemo.vue`
- Move/Modify: `test/TransformDocs.test.ts` → `test/docs/TransformV2.test.ts`
- Modify: `test/fixtures/legacyV1WebsiteInventory.ts`
- Modify: `test/fixtures/v2DocumentationMatrix.ts`

**Interfaces:**

- Produces: Element 目标的 TransformService、TransformSession、options、events、history 和 toolbar 唯一归属页。
- Replaces: 裸 Feature、低层 TransformInteraction 和旧构造器文档。

- [ ] **Step 1: 写入完整 Transform API 失败测试**

覆盖 start/select、selector/predicate/layerIds/hitTolerance、translate 模式、scale/stretch/rotate、translateBBox/noFlip/keepRectangle/buffer/pointRadius、handle style/center、historyLimit、toolbar 和 replace/reject；覆盖 session 全部方法、事件和 toolbar handle。

- [ ] **Step 2: 实现 Element 事务会话示例**

展示直接选择和地图选择、变换/edit 模式、undo/redo、copy/replaceSelected/remove、finish/cancel、事件 disposer 和 Element 结果。不得教用户从 OL Feature 反向恢复业务参数。

- [ ] **Step 3: 实现工具栏与生命周期示例**

覆盖 setActive/updateItem/updateOptions/show/hide/destroy，并区分“只销毁 toolbar view”和“finish/cancel Transform 会话”。说明与 Draw/Edit/Measure 的互斥和 replace/reject 行为。

- [ ] **Step 4: 更新矩阵并验证**

把 Transform pending route 切回重写后的真实组件，并从 legacy inventory 移除旧页面与示例。随后运行：

```bash
npm run test:docs -- test/docs/TransformV2.test.ts test/docs/V2DocumentationMatrix.test.ts test/docs/WebsiteMigrationBoundary.test.ts
```

Expected: Transform 相关 legacy capability、根类型和公开成员全部 documented，无低层私有 API 承诺。随后执行“垂直切片统一收尾”。

## Task 9: 迁移 EventService 与 ContextMenu 文档

**Files:**

- Modify: `MIGRATION.txt`
- Modify: `website/src/config/v2MigrationCatalog.ts`
- Modify: `website/src/router/index.ts`
- Modify: `website/src/views/EventsView.vue`
- Modify: `website/src/views/EventPointerView.vue`
- Modify: `website/src/views/EventKeyboardView.vue`
- Modify: `website/src/views/ContextMenuOverviewView.vue`
- Modify: `website/src/views/ContextMenuDefaultMenuView.vue`
- Modify: `website/src/views/ContextMenuModuleMenuView.vue`
- Modify: `website/src/views/ContextMenuCascadeMenuView.vue`
- Modify: `website/src/views/ContextMenuStateView.vue`
- Modify: `website/src/views/ContextMenuCleanupView.vue`
- Create: `website/src/examples/EventServiceDemo.vue`
- Create: `website/src/examples/EventKeyboardDemo.vue`
- Modify: `website/src/examples/ContextMenuDefaultMenuCallbackDemo.vue`
- Modify: `website/src/examples/ContextMenuDefaultMenuDemo.vue`
- Modify: `website/src/examples/ContextMenuLifecycleDemo.vue`
- Modify: `website/src/examples/ContextMenuModuleMenuCallbackDemo.vue`
- Modify: `website/src/examples/ContextMenuModuleMenuDemo.vue`
- Modify: `website/src/examples/ContextMenuModuleMenuGuardDemo.vue`
- Modify: `website/src/examples/ContextMenuMutexMenuDemo.vue`
- Modify: `website/src/examples/ContextMenuNestedMenuDemo.vue`
- Modify: `website/src/examples/ContextMenuRemoveDefaultDemo.vue`
- Modify: `website/src/examples/ContextMenuRemoveModuleDemo.vue`
- Modify: `website/src/examples/ContextMenuStateToggleDemo.vue`
- Modify: `website/src/examples/ContextMenuThemeDemo.vue`
- Modify: `website/src/examples/ContextMenuVisibilityDemo.vue`
- Delete: `website/src/views/GlobalEventGlobalMouseView.vue`
- Delete: `website/src/views/GlobalEventKeyboardView.vue`
- Delete: `website/src/views/GlobalEventModuleEventsView.vue`
- Delete: `website/src/views/GlobalEventView.vue`
- Delete: `website/src/examples/GlobalEventDemo.vue`
- Delete: `website/src/examples/GlobalEventKeyboardDemo.vue`
- Delete: `website/src/examples/GlobalEventLifecycleDemo.vue`
- Delete: `website/src/examples/GlobalEventModuleCleanupDemo.vue`
- Delete: `website/src/examples/GlobalEventModuleDemo.vue`
- Delete: `website/src/examples/GlobalEventOnceDemo.vue`
- Create: `test/docs/EventContextMenuV2.test.ts`
- Modify: `test/docs/InteractionShared.test.ts`
- Modify: `test/fixtures/legacyV1WebsiteInventory.ts`
- Modify: `test/fixtures/v2DocumentationMatrix.ts`

**Interfaces:**

- Produces: EventService 与 ContextMenuService 的两个规范归属页；按事件和菜单行为族拆分的子页只跨页引用公共定义。
- Replaces: GlobalEvent、手工 enable 前置步骤和旧 ContextMenu 构造器文档。

- [ ] **Step 1: 写入事件与菜单失败测试**

覆盖七类事件、全局/Selector/module、持续/once/可取消 once、signal、payload、has/clearModule、disposer 幂等；覆盖 map/module/Element target、嵌套项、before、状态、mutex、theme、callback、close 和 handle destroy。

- [ ] **Step 2: 实现 EventService 页面**

日常示例优先使用 `on` / `once` 返回的注销函数，说明订阅数量自动管理底层监听；不要要求预先 enable。页面明确 View 投影 coordinate、pixel、Element、module/layer、可选 olFeature 和回调异常隔离。

- [ ] **Step 3: 实现 ContextMenu 页面族**

地图、module 和 Element 菜单各自示例可观察、可清理；区分 handle.destroy、service.close、clearElementState 与状态修改。说明右键仲裁和 viewport 原生菜单屏蔽，但不暴露 InputRouter 内部接口。

- [ ] **Step 4: 更新矩阵并验证**

把 ContextMenu pending routes 切回重写后的真实组件；精确删除 GlobalEvent 页面和示例，并从 legacy inventory 移除本领域全部项。随后运行：

```bash
npm run test:docs -- test/docs/EventContextMenuV2.test.ts test/docs/InteractionShared.test.ts test/docs/V2DocumentationMatrix.test.ts test/docs/WebsiteMigrationBoundary.test.ts
```

Expected: Event/ContextMenu 能力、方法、类型、子页链接和示例清理闭合。随后执行“垂直切片统一收尾”。

## Task 10: 迁移 Overlay 与 Descriptor 文档

**Files:**

- Modify: `MIGRATION.txt`
- Modify: `website/src/config/v2MigrationCatalog.ts`
- Modify: `website/src/router/index.ts`
- Modify: `website/src/views/OverlaysView.vue`
- Modify: `website/src/views/DescriptorView.vue`
- Create: `website/src/examples/OverlayServiceDemo.vue`
- Modify: `website/src/examples/DescriptorDemo.vue`
- Delete: `website/src/views/OverlayLayerView.vue`
- Delete: `website/src/examples/OverlayLayerBasicDemo.vue`
- Delete: `website/src/examples/OverlayLayerUpdateDemo.vue`
- Delete: `website/src/docs/overlayLayerApi.ts`
- Create: `test/docs/OverlayV2.test.ts`
- Move/Modify: `test/DescriptorDocs.test.ts` → `test/docs/DescriptorV2.test.ts`
- Modify: `test/fixtures/legacyV1WebsiteInventory.ts`
- Modify: `test/fixtures/v2DocumentationMatrix.ts`

**Interfaces:**

- Produces: OverlayService 与 Descriptor 的两个唯一归属页及 DOM 所有权示例。
- Replaces: OverlayLayer 和旧 Descriptor 构造器文档。

- [ ] **Step 1: 写入 Overlay / Descriptor 失败测试**

覆盖 add/get/query/remove/clear/createDescriptor、所有 Overlay options/patch/selector/handle、autoPan、positioning、ownership；覆盖 Descriptor list/custom content、update、drag、fixed line、position/pixel fixed mode、close action/callback、events 和生命周期。

- [ ] **Step 2: 实现 Overlay 页面**

示例展示用户 HTMLElement、position/update/show/hide/panIntoView/destroy、module 查询和批量清理。明确 earth ownership 与 external ownership：Earth 解绑外部 DOM，但不清空内容或删除用户监听。

- [ ] **Step 3: 实现 Descriptor 页面**

展示 list、string 和 HTMLElement custom content；close callback 先触发，再执行 hide/destroy 策略；连接线 Element 与 Overlay 原子更新和销毁。示例保存并调用事件 disposer。

- [ ] **Step 4: 更新矩阵并验证**

把 Descriptor pending route 切回重写后的真实组件；精确删除 OverlayLayer 页面、示例和 API helper，并从 legacy inventory 移除本领域全部项。随后运行：

```bash
npm run test:docs -- test/docs/OverlayV2.test.ts test/docs/DescriptorV2.test.ts test/docs/V2DocumentationMatrix.test.ts test/docs/WebsiteMigrationBoundary.test.ts
```

Expected: Overlay/Descriptor 全部能力和已修复限制都有页面、运行示例与清理证据。随后执行“垂直切片统一收尾”。

## Task 11: 完成 AnimationManager 页面族与动画示例审计

**Files:**

- Modify: `MIGRATION.txt`
- Modify: `website/src/config/v2MigrationCatalog.ts`
- Modify: `website/src/router/index.ts`
- Modify: `website/src/views/AnimationView.vue`
- Modify: `website/src/views/AnimationSurfaceEffectsView.vue`
- Modify: `website/src/views/AnimationPathEffectsView.vue`
- Modify: `website/src/views/AnimationRadialEffectsView.vue`
- Modify: `website/src/views/AnimationFadeLifecycleView.vue`
- Modify: `website/src/examples/AnimationEffectsDemo.vue`
- Modify: `.test/animationEffectManifest.ts` only for documentation ownership metadata, without changing effect behavior
- Modify: `test/AnimationEffectManifest.test.ts`
- Create: `test/docs/AnimationEffectManifest.test.ts`
- Create: `test/docs/AnimationV2.test.ts`
- Modify: `test/fixtures/legacyV1WebsiteInventory.ts`
- Modify: `test/fixtures/v2DocumentationMatrix.ts`

**Interfaces:**

- Produces: 一个 AnimationManager API 归属页，以及闭合面、路径/箭头、圆/扇面、fade/lifecycle 四个行为族页面。
- Consumes: 十种 AnimationType acceptance manifest、组合写入域和交互策略。

- [ ] **Step 1: 写入动画文档闭包失败测试**

把现有 `AnimationEffectManifest.test.ts` 中纯内核/acceptance 断言保留在代码门，把 website route、源码和展示断言移到 `test/docs/AnimationEffectManifest.test.ts`，防止代码门重新依赖文档文件。文档测试断言 `animationTypes`、manifest、兼容矩阵、Spec API 锚点和示例选项集合相等；每种效果都有最小调用、字段/默认值/范围/单位、默认 channel、自然完成、retain、兼容目标、NativeStyleRef 边界和清理说明。

- [ ] **Step 2: 保留唯一 API 归属并拆分行为族**

AnimationView 保留 Manager、Handle、Selector、channel、写入域、组合、公共联合和全部 Spec 的唯一 API 定义；子页只通过稳定跨页锚点引用。不得在每个子页复制方法或类型表。

- [ ] **Step 3: 审计十种效果与最新修订**

完整记录 pulse、dash-flow、path-travel、blink、highlight、alert、grow、radar-scan、center-spread、fade。特别核对：path-travel 无 arrow/arrowColor、多点 curvature；radar/center-spread gradient 与 color 互斥及默认绿色；center-spread opacity/trailLength；AnimationType 功能版本扩展策略。

- [ ] **Step 4: 完成组合、生命周期与渲染边界**

说明同目标同 channel 原子 replace、跨 channel 的 opacity 乘法、geometry 独占、overlay 稳定追加、批量 play 原子失败；完整覆盖 Handle `pause`、`resume`、`stop`、`status`、`finished`，以及 hide/show、remove、replace、Element 变化、Earth.destroy、fade-out retain 无闪回顺序、Edit/Transform policy。记录 replacement 的同层排序、declutter、world wrap、规范几何命中、overlay 不扩展命中和独立动画图层建议。

- [ ] **Step 5: 审计同源可运行示例**

所有效果由 manifest 驱动，不维护写死分支集合；每个效果提供启动、暂停、恢复、停止，页面加载时不自动播放闪烁/呼吸/告警并显示光敏提示。性能章节只说明用户可观察和可操作的边界：离屏或不可见时暂停、为并发动画目标设置明确上限、及时 stop/remove/destroy，以及硬件、浏览器、目标数量、顶点数、覆盖面积、DPR 和配置共同影响容量；不得公开 RenderPass、runtime slot、内部调度器或资源预算对象，也不做脱离上下文的帧率承诺。

- [ ] **Step 6: 更新矩阵并验证**

把 Animation pending route 切回重写后的真实组件，并从 legacy inventory 移除旧页面与示例。随后运行：

```bash
npm run test:code -- test/AnimationEffectManifest.test.ts
npm run test:docs -- test/docs/AnimationEffectManifest.test.ts test/docs/AnimationV2.test.ts test/docs/V2DocumentationMatrix.test.ts test/docs/WebsiteMigrationBoundary.test.ts
```

Expected: 十种效果、所有公开动画类型、网站锚点、同源示例和迁移 marker 闭合；内核 acceptance 与文档展示断言各归其门。随后执行“垂直切片统一收尾”。

## Task 12: 重写迁移、README、工程说明与 Utilities 参考

**Files:**

- Modify: `website/src/router/index.ts`
- Modify: `website/src/views/UtilitiesView.vue`
- Create: `website/src/examples/UtilitiesDemo.vue`
- Modify: `website/src/config/v2MigrationCatalog.ts`
- Modify: `website/src/views/MigrationV2View.vue`
- Delete: `website/src/views/GlobalMethodsView.vue`
- Modify: `MIGRATION.txt`
- Modify: `README.md`
- Modify: `V2_PUBLIC_API.md`
- Modify: `PROJECT_STRUCTURE.md`
- Modify: `test/docs/UseEarth.test.ts`
- Modify: `test/docs/CoordinateInput.test.ts`
- Create: `test/docs/MigrationV2Closure.test.ts`
- Create: `test/docs/ReadmeV2.test.ts`
- Create: `test/docs/Utilities.test.ts`
- Modify: `test/fixtures/legacyV1WebsiteInventory.ts`
- Modify: `test/fixtures/v2DocumentationMatrix.ts`

**Interfaces:**

- Produces: 完整 1.x → 2.0 迁移表、准确 README/工程状态、Utilities 唯一归属页和发布说明。
- Consumes: 全部已完成领域的规范路由、示例锚点和文档矩阵。

- [ ] **Step 1: 写入根文档与迁移失败测试**

扫描 README、V2 公共调用说明和 website 当前文档，拒绝未标注为 1.x 的旧导入、旧构造器、旧类和功能子路径。迁移闭包测试要求每个 legacy capability 行都有迁移 marker 或明确“行为不变但入口改变”映射，Wind 是唯一无替代删除项。`polygon-multi-ring-hole` 必须已有真实 V2 调用与验收；若仍只有 MIGRATION 的“暂缓迁移/接原生 OL”警告，本任务失败并回到代码阶段，禁止删除警告来让文本扫描通过。

- [ ] **Step 2: 实现 Utilities 页面**

覆盖 add2/scale2/lerp2/quadraticBezier2、角度转换、ring 工具、toFlatCoordinates、createId、throttle/flush/cancel、ThrottleOptions/ThrottledFunction 和七种稳定错误。示例只调用根导出并可通过 strict TypeScript 编译。

- [ ] **Step 3: 校准详细迁移指南**

`MIGRATION.txt` 保留完整说明；website 迁移页完整渲染 `v2MigrationCatalog`，并在 catalog 的稳定锚点下补充可导航细节，不手写第二份能力集合。两者至少覆盖：ESM/根入口/style.css、OL 10 和离线物料、Earth/useEarth、Layer/Element、Billboard 合并、样式/nativeStyle/linework、Draw/Edit/Plot、Measure、Transform、Event/ContextMenu、Overlay/Descriptor、动画、Utils、Wind 删除。

- [ ] **Step 4: 纳入补充设计的迁移事项**

明确坐标不会自动转为经纬度、Circle 业务 radius 改为米、olFeature radius 单位不同；从 `Element.state` 保存时先调用 `toGeographicCoordinates()`，需要扁平结构时再调用 `toFlatCoordinates()`。记录 path-travel 箭头字段移除、AnimationType 可扩展和消费方未知成员兜底；记录 lineStyles 是新增 2.0 工厂，不伪装成 1.x 对等能力。

- [ ] **Step 5: 重写 README 与工程说明**

README 基础用法只使用 `useEarth + earth.layers/elements`，删除 PointLayer、destroyEarth 和功能子路径说明；安装章节准确描述 OL peer、离线边界以及 package.json 中冻结的 Node/npm engines。`V2_PUBLIC_API.md` 同步十种动画、lineStyles 和最终签名。`PROJECT_STRUCTURE.md` 删除“暂不更新网站”的阶段性文字，更新 TypeDoc/文档测试职责。

- [ ] **Step 6: 更新矩阵并验证**

把 Migration pending route 切回重写后的真实组件，精确删除已由 Utilities 替代的 `GlobalMethodsView.vue`，并从 legacy inventory 移除本领域全部项。随后运行：

```bash
npm run test:docs -- test/docs/MigrationV2Closure.test.ts test/docs/ReadmeV2.test.ts test/docs/Utilities.test.ts test/docs/UseEarth.test.ts test/docs/CoordinateInput.test.ts test/docs/V2DocumentationMatrix.test.ts test/docs/WebsiteMigrationBoundary.test.ts
```

Expected: 每项 legacy 能力有迁移映射；Polygon 多环/洞已迁移而非降级；根文档不把旧 API 当作当前用法；Utilities 全部导出已归属。随后执行“垂直切片统一收尾”。

## Task 13: 收口迁移边界并完成最终发布审计

**Files:**

- Delete: `website/src/views/PendingDocumentationView.vue`
- Delete: `website/tsconfig.migration.json`
- Modify: `website/tsconfig.json`
- Modify: `website/src/config/navigation.ts`
- Modify: `website/src/router/index.ts`
- Modify: `scripts/docs/check-api-coverage.mjs`
- Modify: `package.json`
- Modify: `vitest.code.config.ts`
- Modify: `vitest.docs.config.ts`
- Modify: `.prettierignore`
- Delete: `test/fixtures/legacyV1WebsiteInventory.ts`
- Modify: `test/fixtures/v2DocumentationMatrix.ts`
- Modify: `test/docs/V2DocumentationMatrix.test.ts`
- Move/Modify: `test/WebsiteApiDescriptionPunctuation.test.ts` → `test/docs/WebsiteApiDescriptionPunctuation.test.ts`
- Move/Modify: `test/WebsiteApiPresentation.test.ts` → `test/docs/WebsiteApiPresentation.test.ts`
- Move/Modify: `test/WebsiteBranding.test.ts` → `test/docs/WebsiteBranding.test.ts`
- Move/Modify: `test/WebsiteScrollbar.test.ts` → `test/docs/WebsiteScrollbar.test.ts`
- Move/Modify: `test/WebsiteTopMenu.test.ts` → `test/docs/WebsiteTopMenu.test.ts`
- Move/Modify: `test/docs/WebsiteMigrationBoundary.test.ts` → `test/docs/WebsiteBuildBoundary.test.ts`
- Create: `test/docs/WebsiteV2Api.test.ts`
- Create: `test/docs/WebsiteApiOwnership.test.ts`
- Create: `test/docs/WebsiteExampleCoverage.test.ts`
- Create: `test/docs/WebsiteLinkIntegrity.test.ts`
- Create: `test/docs-browser/docs-site.spec.ts`
- Create: `playwright.docs.config.ts`

**Interfaces:**

- Consumes: Tasks 1–12 的所有页面、路由、锚点、示例和迁移映射。
- Produces: 零 pending 文档矩阵、无旧当前 API 的 website、完整链接/主题/窄屏证据和最终发布结论。

- [ ] **Step 1: 证明 legacy inventory 已在领域任务中归零**

先断言 `legacyV1WebsiteInventory` 已经是空集合，再用 `rg` 列出旧 API token 的每个命中，逐项分类为“迁移说明/历史证据保留”或“错误的当前文档”。若发现 inventory 非空或任何未预期旧资产，停止 Task 13 并返回其领域任务完成替代、定向测试、精确删除和切片收尾；不得在最终审计中临时通配删除，也不得触碰 specs、plans 或测试夹具中的历史证据。确认归零后才删除空 inventory fixture。

- [ ] **Step 2: 移除迁移期编译边界**

确保导航只指向规范页，且没有路由继续引用 `PendingDocumentationView.vue`；旧深链接只保留 Task 3 明确的重定向。将 `website/tsconfig.json` 恢复为引用 `tsconfig.app.json`，删除 pending view 与 `tsconfig.migration.json`，用全量 `vue-tsc -b` 证明整个 `website/src` 无隔离文件、无隐藏错误。把所有剩余根目录文档测试精确移动到 `test/docs/`，并从两个 Vitest config 删除迁移期 legacy pattern，使代码门与文档门只按目录分离。

- [ ] **Step 3: 将文档矩阵收口为零 pending**

对每个 legacy capability 验证实现测试、website route#anchor、同源 example#anchor 和 migration marker；对 TypeScript / TypeDoc reflection 发现的每个根导出、构造器、属性、方法和类型成员验证唯一归属。新增最终断言：`pending === 0`，且除 Wind 外没有 missing/excluded 行；`polygon-multi-ring-hole` 必须是 documented，不得成为 exclusion。

- [ ] **Step 4: 审计链接、锚点与 API 表视觉层级**

`WebsiteV2Api` 拒绝迁移页之外的 1.x 当前调用；`WebsiteApiOwnership` 从 reflection 反向验证完整 surface 的唯一 route#anchor；`WebsiteExampleCoverage` 验证运行组件与 `?raw` 同源、能力调用和完整清理。另解析 router、navigation、PageAnchor、正文链接和 ApiTable 数据，验证所有站内 route/anchor 真实存在；构造器、property、method、type 的 presentation 符合已更新的 `website/AGENTS.md`，无参数方法显示 `—`，跨页类型不重复定义。此时让根 `format` / `format:check` 覆盖 `website/src/**/*.{vue,ts,scss}`，`.prettierignore` 只忽略精确生成目录，并格式化全部保留的手写网站文件。

- [ ] **Step 5: 浏览器检查浅色、深色和窄屏**

用独立 `playwright.docs.config.ts` 和独立的 `test/docs-browser` testDir 启动 website 构建产物的 preview，不复用、也不进入面向 `test/browser` 内核夹具的默认 Vite server。在文档站构建产物上覆盖桌面浅色、桌面深色和窄屏；检查导航、右侧目录、API 表横向滚动、代码块、示例控件、地图尺寸和光敏提示。截图用于审查证据，不提交临时运行产物，除非仓库已有明确快照策略。

- [ ] **Step 6: 运行完整文档门**

运行：

```bash
npm run test:docs
npm run format:check
npm run docs:build
npx playwright test --config playwright.docs.config.ts
```

Expected: exit code 0；TypeDoc 生成、API 覆盖、website 类型检查、Vite 构建、链接与文档浏览器测试全部通过。

- [ ] **Step 7: 运行最终代码与发布门**

运行：

```bash
npm run verify:code
npm run verify
npm run docs:build
npm pack --dry-run --json
```

Expected: 全部 exit code 0；tarball 仍为 ESM-only、零普通/可选/打包运行依赖，OL 只作为 optional peer；文档准确说明其运行时必需和离线依赖闭包责任。

- [ ] **Step 8: 最终差异与生成物审查**

确认未提交 `dist/`、`website/public/api/`、`website/src/generated/`、`.cache/`、`.test-output*`、`test-results/` 或 tgz；确认未覆盖计划开始前的用户代码改动。审查所有 Critical / Important 问题并修复后，记录阶段 9 通过证据。

## 第二阶段完成条件

- [ ] `npm run verify:code`、`npm run verify` 和 `npm run docs:build` 全部通过。
- [ ] `v2DocumentationMatrix` 与冻结的非 Wind 能力集合完全相等，且零 pending、零重复、零缺失。
- [ ] V1 Polygon 多环/内环/洞已有 V2 实现、验收、迁移映射和运行示例；Wind 仍是唯一 exclusion。
- [ ] 每个 2.0 根导出和受审公开成员只有一个规范归属页，所有跨页链接、右侧锚点和路由有效。
- [ ] 每个保留能力都有同源可运行 Vue 示例；运行预览与展示源码引用同一文件，并覆盖资源清理。
- [ ] README、V2 公共 API 调用说明、MIGRATION 和 website 不再把 1.x API 当作当前用法。
- [ ] 坐标转换、米制圆、路径线饰和十种动画效果的补充设计全部进入用户文档与示例。
- [ ] TypeDoc 来自源码 JSDoc，生成和检查链覆盖完整根入口；未手工编辑或提交生成产物。
- [ ] 所有底图示例使用 `createConfiguredLayer`，没有私有 token、账号、内网地址或硬编码瓦片 URL。
- [ ] 浅色、深色、窄屏、API 表、导航、代码块和交互示例已完成浏览器审查。
- [ ] tarball 的 ESM、style.css、零普通依赖、OL optional peer 和离线安装契约与文档一致。
- [ ] 阶段 9 审计通过前未发布 2.0；通过后也只形成“允许发布”的结论，不由本计划自动执行发布。
