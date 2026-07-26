# 2.0 Callout 文本标注框补充设计

## 文档状态

- 状态：已批准
- 日期：2026-07-26
- 批准记录：用户确认两点绘制、第二点位于文本框中心、Edit 使用框体缩放点与定位点、Transform 仅整体移动、文本自动换行、边框与填充可配置，并授权按约定实施及补齐文档；随后确认业务层恢复默认缓存、连续缩放或旋转时暂时隐藏独立文字层的性能修订；最终澄清 Transform 的几何能力与工具栏模式切换互不冲突，Transform 模式仍只整体平移，但工具栏必须允许切换到 Callout Edit
- 关联：2026-07-13-v2-element-kernel-architecture-design.md
- 关联：2026-07-16-v2-interaction-visual-design.md
- 修订：2026-07-21-v2-element-geometry-details-design.md

本文补充一个内置 `callout` Shape，并冻结它在 Draw、独立 Edit、Transform、样式、投影展示和 geometryDetails 中的契约。未被本文修改的 Element 状态真源、EngineContext 显式依赖、交互互斥、资源所有权、world-wrap 和全生命周期清理规则继续有效。

## 1. 目标与非目标

1. 一个 Callout 由屏幕轴对齐的文本框、指向定位点的尾巴和居中文本组成，三者属于同一个原子 Element。
2. Draw 使用两次点击：第一点是 `anchor`，第二点是文本框 `center`；第二次点击后自动完成。
3. 初始框体尺寸由最终结构化 `StyleSpec.text` 的原始文本、字体、内边距和最大自动宽度计算，不要求第三个尺寸点。
4. 独立 Edit 展示 8 个框体缩放点和 1 个定位点；缩放时重新换行并保证文字不越过框体内边界。
5. Transform 模式只支持整体平移，不支持旋转、缩放或拉伸；默认工具栏提供 Edit 模式切换，并在该模式复用 Callout 的 9 个上下文编辑点。
6. 首版不提供富文本、尾巴宽度配置、圆角、文字旋转、文字偏移、原生 Style 或独立尾巴控制点。

## 2. 规范状态与输入

`callout` 是专用 Shape 状态，不把 8 个框体控制点写入 Element：

```ts
type CalloutShapeInput = {
  readonly type: 'callout';
  readonly anchor: readonly number[];
  readonly center: readonly number[];
  readonly size: readonly [widthPx: number, heightPx: number];
};

type CalloutShapeState = {
  readonly type: 'callout';
  readonly anchor: Coordinate;
  readonly center: Coordinate;
  readonly size: readonly [widthPx: number, heightPx: number];
};
```

- `anchor` 和 `center` 使用 Element 当前规范投影坐标，维度必须一致。
- `size` 使用 CSS 像素，不乘 `devicePixelRatio`；两个值必须是非负有限数。
- `[0, 0]` 只作为两点 Draw 草稿的自动布局请求；提交 Draw 结果前必须解析为正有限数。直接写入 Element 时应传正尺寸。
- 原始文字只保存在 `StyleSpec.text.text`。换行结果、框体 ring、尾巴 base、9 个编辑点和 View 投影坐标都是可丢弃的展示派生数据。

## 3. 能力与 ShapeDefinition 契约

Callout 声明 `draw`、`edit`、`translate`，不声明 `rotate`、`scale`、`vertexEdit`、`controlPointInsert`、`controlPointRemove`、`freehand`、`anchor` 或 `path`。

ShapeDefinition 增加两项通用语义，而不是在 Draw、Edit、Transform 或 OpenLayers Adapter 中按 `type === 'callout'` 分支：

1. `translate(state, x, y)`：由 Shape 自己平移完整规范状态。`translate` capability 必须有对应 provider；现有控制点 Shape 与 Circle 提供等价实现。
2. 可选的 view-dependent presentation profile：在显式的像素/坐标转换、字体测量和结构化 Style 上下文中，原子生成已布局状态、标准 RenderGeometry、可选的 Transform `selectionGeometry` 与上下文编辑拓扑。

`selectionGeometry` 是内部的权威选择包络基准，只描述可操作主体；它不替代业务预览、命中或 Feature extent。Callout 用无 label 的框体矩形作为 `selectionGeometry`，完整 RenderGeometry 仍保留尾巴 tip 与中心文字。

presentation profile 可提供纯 Style 约束校验；Element Store 在提交前调用它，确保删除 Callout 文本、切换 native Style 或写入不支持的文本放置参数时原子拒绝，不让无法展示的状态成为真源。

独立 Edit 可以使用普通 `editTopology` 或 presentation profile 的 contextual edit provider。Transform 的 Edit 模式不是缩放、旋转或拉伸能力；当 Shape 声明 `edit` 且提供 contextual edit provider 时，`TransformSession` 也复用同一套 `describe` / `move` 语义。普通 `editTopology` 继续通过 `vertexEdit` 声明 Transform Edit 能力，避免把仅供独立 Edit 的普通拓扑自动暴露给 Transform。

## 4. 两点 Draw 与自动尺寸

Callout 的控制点策略固定为：

```ts
{ previewMin: 2, completeMin: 2, completeMax: 2, autoFinish: 2 }
```

- 第一次点击保存 `anchor`。指针移动期间，以当前指针作为 `center` 生成完整预览。
- 第二次点击保存 `center`，使用本会话最终 Style 完成排版，然后自动提交。
- `TextSpec.maxWidth` 是初次自动布局允许的最大文本内容宽度，单位为 CSS 像素；省略时使用 240px。
- 自动宽度不超过 `maxWidth`，并至少容纳一个 grapheme、水平 padding 和描边安全区；自动高度容纳全部行、垂直 padding 和描边安全区。
- Draw 预览、Draw `change` 事件和最终 Element 必须来自同一套 presentation 计算，不能分别使用近似尺寸。

## 5. 文本排版

1. `StyleSpec.text` 是 Callout 的必需结构化样式；native Style 不支持 Callout。
2. 顶层 `fill` 和 `strokes` 同时绘制框体与尾巴；`text.fill` 和 `text.stroke` 绘制文字。文本背景样式不参与首版 Callout。
3. `text.padding` 按 `[上, 右, 下, 左]` 解释；省略时使用 Callout 默认 padding。
4. 保留显式换行。中文、日文、韩文和超长单词按 grapheme 断行；普通英文优先保留 word；任何一行都不得超过可用内容宽度。
5. presentation 只把换行字符串放入临时 label，绝不覆盖 `StyleSpec.text.text`。
6. 文字固定在框体中心并保持屏幕正向；Callout 不应用 `placement: 'line'`、offset、rotation、rotateWithView 或非单位 scale 等会破坏居中和边界保证的放置语义。
7. 拖动左右中点改变宽度时重新断行，并把高度双向自动适配到当前文字所需高度，纵向中心保持不变；拖动上下中点或四角时保留用户的纵向控制，但不能小于当前换行文本的最小高度。不使用省略号，也不自动缩小字号。

## 6. 框体、尾巴与 View 投影

Callout 是 view-dependent presentation：

1. 使用公开的 coordinate-to-pixel API 把 `anchor` 与 `center` 转为 viewport CSS 像素。
2. 以 `center` 和 `size` 构造屏幕轴对齐矩形。
3. 从中心向 `anchor` 发射射线，与矩形边界的交点决定尾巴所在的上、右、下或左边；尾巴 base 沿该边钳制，tip 等于 `anchor`。
4. `anchor` 进入矩形内部时隐藏尾巴，只保留矩形。
5. 把完整 ring 和显式 label 中心重新转换为当前 View 坐标，最终仍输出标准 `polygon` RenderGeometry；不得新增 Callout 专用 RenderGeometry 判别项。

Draw、Edit、Transform 与 Animation 等临时展示继续按 Map 帧订阅 View presentation revision，以保证少量预览要素和控制点实时跟随。FeatureBinding 对持久业务要素使用运动门控：稳定 View 下的 revision 立即重投影；连续 resolution 或 rotation 变化期间只记录最新 revision，结束后统一重排一次。不得使用 OpenLayers 私有 API，也不得只在 Style renderer 中伪造框体而让真实 Feature extent 保持为两个点。

持久 Callout 的框体与文字采用两个相邻、同属业务层生命周期的 VectorLayer：

1. 业务主层保留框体和尾巴，恢复 OpenLayers 默认的 `updateWhileAnimating: false` 与 `updateWhileInteracting: false`。
2. 仅带显式 presentation label 的文字进入按业务层延迟创建的 companion layer；它继承主层的 `visible`、`opacity`、`zIndex`、`declutter` 与 Source `wrapX`，但不登记为可命中的业务图层。
3. resolution 或 rotation 首次变化时，在第一张 Map 帧之前同步隐藏 companion layer；主层可继续复用旧 replay，文字不会以固定 CSS 字号越过正在缩放的旧框体。
4. 最终 View 的 `precompose` 边界先发布最新 revision，再由 FeatureBinding 只重排一次框体和文字；当前 frameState 仍保留隐藏快照，紧随其后的新 Map 帧才恢复 companion。动画合成路径复用同一门控，运动期间跳过显式 Callout label。
5. Draw、Edit、Transform 与 Protection 的临时 VectorLayer 要素数量受控，继续启用 `updateWhileAnimating` 和 `updateWhileInteracting`，以维持交互反馈；native Layer 不属于 Element 承载范围，引擎不修改其刷新策略。

门控只针对会失真的 resolution / rotation，不因纯 center 平移或字体 revision 隐藏文字。伴随层使用直接隐藏而不是 CSS blur；这样无需额外滤镜合成，也不会让普通图形、框体或同层普通 TextSpec 一起消失。

View 的 change 事件只标记待刷新状态，revision 在 Map 的公开 `precompose` 帧边界发布，确保公开 coordinate-to-pixel API 已切换到本帧变换。首帧前该 API 尚不可用时，以公开 View 的 center、resolution 和 rotation 构造等价局部仿射变换；这条回退只承担 presentation 计算，不引入第二份 Shape 状态。

标准 Polygon 可携带仅供内部样式编译器消费的临时中心 label。公共 RenderGeometry 复制与 geometryDetails 必须剥离该 label。样式编译器把顶层 fill/strokes 用于主层 Polygon，并用 companion Feature 上的独立 Point style geometry 在框体中心绘制换行文本，不能依赖 Polygon interior point。普通 Point 或 Polygon 的 `StyleSpec.text` 没有显式 presentation label，不得被迁移到 companion。

## 7. 独立 Edit

控制点稳定顺序如下，全部 `removable: false`，且没有 insertion：

| index | role        | 行为                   |
| ----: | ----------- | ---------------------- |
|     0 | `anchor`    | 只移动定位点，框体不动 |
|     1 | `resize-nw` | 固定右下角，双轴缩放   |
|     2 | `resize-n`  | 固定下边，纵向缩放     |
|     3 | `resize-ne` | 固定左下角，双轴缩放   |
|     4 | `resize-e`  | 固定左边，横向缩放     |
|     5 | `resize-se` | 固定左上角，双轴缩放   |
|     6 | `resize-s`  | 固定上边，纵向缩放     |
|     7 | `resize-sw` | 固定右上角，双轴缩放   |
|     8 | `resize-w`  | 固定右边，横向缩放     |

- 控制点颜色、尺寸、hover、active 与强调层完全复用 2026-07-16 视觉规范，不新增红色或黄色主题。
- 框体不得翻转；指针越过固定边时钳制到当前文本最小尺寸。
- 拖拽发布的 active handle 必须取重新布局后的权威坐标，不能继续显示未经约束的原始指针。
- EditSession 的 world-wrap 放置和完成不再把全部 handles 送回 `createDraft()`；它只计算统一世界偏移，并通过 `translate` provider 作用于完整 ShapeState。此修订同时解除“编辑 handle 必须等于持久 controlPoints”的旧隐含假设。

## 8. Transform

- Transform 模式的 presentation 只设置 `canTranslate: true`；`canRotate`、`canScale` 与 `canStretch` 均为 `false`。
- 默认工具栏展示 Edit 项；`setMode('edit')` 切换到上下文编辑 presentation，设置 `canEditVertices: true`，展示与独立 Edit 相同的 1 个 anchor 和 8 个框体 resize 控制点，并隐藏 Transform 选中框与变换手柄。
- Edit 模式中的控制点移动必须调用 presentation profile 的 contextual edit provider，沿用自动换行、双向适高、最小尺寸和 active handle 权威坐标规则；退出 Edit 模式后恢复仅平移的 Transform presentation。
- 整体平移同时移动 `anchor` 与 `center`，保持 CSS px `size` 不变。
- Transform 预览和 feature hit 使用完整框体、尾巴与文字；选中框、平移中心、Tooltip 与工具栏锚点使用框体 `selectionGeometry`，不受远端 anchor 或已包含在框内的文字 footprint 扩张。
- 工具栏根节点以框体视觉右上角为 `top-left` 锚点，默认偏移为 `[15, 0]` CSS px：顶部与外部包络框对齐，水平方向向右留出 15px 间距。

## 9. geometryDetails 修订

本节是对 2026-07-21 geometryDetails 设计的 Callout 专项补充：

- Callout 的屏幕框体、尾巴、换行 label 和 View 依赖 Polygon 属于 presentation，不进入公共 geometryDetails。
- `renderGeometry` 固定返回 `polyline` 骨架 `[anchor, center]`；`extent` 只覆盖这两个规范投影点，继续不受 Style、resolution、rotation 或字体影响。
- `controlPoints` 为 `[anchor, center]` 的只读副本；`center` 和 `radius` 便利字段仍只属于 Circle，因此 Callout 返回 `null`。
- 命中与实际 Feature 使用 presentation Polygon，不能拿 geometryDetails.extent 推断 Callout 的屏幕视觉范围。

## 10. 验证与文档

至少覆盖：

1. 状态校验、两点自动完成、初始文本尺寸和原始文本不变。
2. 中英文混排、显式换行、超长 token、窄框自动增高和最小尺寸钳制。
3. 四边与角部尾巴、anchor 位于框内、View 缩放与旋转后 CSS px 尺寸稳定。
4. 9 个 role、8 种 resize、anchor 独立移动、undo/redo、world-wrap 和 active handle 权威坐标。
5. Transform 模式仅平移并隐藏/拒绝 rotate、scale 与 stretch；默认工具栏可切换到复用 9 个上下文控制点的 Edit 模式，并覆盖拖拽、undo/redo 与最终提交。
6. 远端 anchor 与长文本不扩大 Transform 框体包络，完整尾巴仍可命中；工具栏固定在框体视觉右上角，顶部对齐并向右偏移 15 CSS px。
7. 连续 View 动画与交互期间框体保持 CSS 像素尺寸，文字始终留在边界内。
8. 顶层边框/填充、中心 Point 文本、Feature extent、hit detection 与生命周期清理。
9. Shape/Draw/Edit/Transform/Style/Element 文档、可运行示例、公共 API 表和迁移说明同步更新。
