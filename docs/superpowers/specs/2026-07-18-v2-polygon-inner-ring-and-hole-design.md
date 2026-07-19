# 2.0 Polygon 多环与洞补充设计

## 文档状态

- 状态：待批准
- 日期：2026-07-18
- 目标版本：@vrsim/earth-engine-ol 2.0.0
- 补充：2026-07-13-v2-element-kernel-architecture-design.md
- 关联：2026-07-16-v2-coordinate-conversion-and-circle-radius-design.md
- 关联：2026-07-17-v2-linework-style-factory-design.md

## 1. 背景

V1 `PolygonLayer` 的 `positions` 与 `setPosition()` 接受 `Coordinate[][]`，第一个 ring 表示外环，其余 ring 可以表达内环和洞。当前 2.0 内置 `polygon` 只接受一组 `controlPoints`，`ShapeState<'polygon'>` 也只能保存单环；`basic.ts` 最终固定生成一个 ring。

这不是可接受的已知限制。架构总纲已经冻结“除 Wind 外全部能力对等”，因此 Polygon 多环/洞必须在第二阶段文档迁移前回到代码阶段补齐。只让 `GeometryCodec` 接受多个 ring 不能闭合该能力：Edit 会从扁平控制点重新创建草图，Transform 也只处理 `controlPoints`，两条路径都会丢失洞。

本设计以最小公共扩展恢复 V1 能力，同时保持现有单环调用、快照和根导出不变。

## 2. 目标与非目标

### 2.1 目标

1. `earth.elements.add()`、update、copy、事务和快照可以稳定保存 Polygon 外环与任意数量的洞。
2. OpenLayers Polygon 接收完整 rings，Feature 仍只是 Element 状态的单向渲染投影。
3. Edit 打开、移动、插入、移除、undo、redo、finish 和 cancel 不丢失 ring 边界。
4. Transform 的平移、旋转、缩放、stretch、顶点编辑、复制和历史同时处理所有 rings。
5. 现有不带洞的 Polygon 输入与 `ElementState` 快照保持原样，不新增空 `holes` 字段。
6. 能力矩阵新增独立 `polygon-multi-ring-hole` 行，Wind 继续是唯一 exclusion。

### 2.2 非目标

- 不增加 MultiPolygon。
- 不增加独立的 Polygon、Ring 或 Hole 根导出类型。
- 不改变 `shapeTypes`、`ShapeType` 或 Shape 公共注册边界。
- 不在 Draw 交互中新增“绘制洞”的 UI；Draw 仍只创建外环。
- 不增加包含关系、自交、ring 相交或 winding 方向校验。
- 不改变 ViewService 坐标转换方法的深层输入契约。
- 不从 OL Feature 反向恢复业务状态。
- 不让 linework 装饰 hole；已批准的 linework 仍只作用于 outer ring。

## 3. 公共数据契约

### 3.1 ShapeInput

`ShapeInput` 为 polygon 增加专属条件分支：

```ts
export type ShapeInput<T extends ShapeType = ShapeType> = T extends 'circle'
  ? {
      readonly type: 'circle';
      readonly center: readonly number[];
      readonly radius: number;
    }
  : T extends 'polygon'
    ? {
        readonly type: 'polygon';
        readonly controlPoints: readonly number[] | readonly (readonly number[])[];
        readonly holes?: readonly (readonly number[] | readonly (readonly number[])[])[];
      }
    : {
        readonly type: T;
        readonly controlPoints: readonly number[] | readonly (readonly number[])[];
      };
```

语义固定为：

- `controlPoints` 是 outer ring，继续兼容全部现有单环调用。
- `holes` 中的每一项是一个 interior ring。
- 每个 ring 可以单独使用扁平 XY 数组或二维、三维嵌套坐标。
- 扁平数组仍按 XY 两两分组；三维 ring 必须使用嵌套坐标。
- outer 与全部 holes 的坐标维度必须一致。
- `holes` 省略或传入空数组都表示没有洞；规范状态一律省略空 `holes`。
- 在 `exactOptionalPropertyTypes` 下不接受显式 `holes: undefined`；运行时 own property 为 `undefined` 也拒绝。

调用示例：

```ts
earth.elements.add({
  type: 'polygon',
  geometry: {
    type: 'polygon',
    controlPoints: [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ],
    holes: [
      [
        [25, 25],
        [75, 25],
        [75, 75],
        [25, 75]
      ]
    ]
  },
  layerId: 'planning'
});
```

### 3.2 ShapeState

`ShapeState<'polygon'>` 保存已经规范化、与 OL 无关的 rings：

```ts
export type ShapeState<T extends ShapeType = ShapeType> = T extends 'circle'
  ? {
      readonly type: 'circle';
      readonly center: Coordinate;
      readonly radius: number;
    }
  : T extends 'polygon'
    ? {
        readonly type: 'polygon';
        readonly controlPoints: readonly Coordinate[];
        readonly holes?: readonly (readonly Coordinate[])[];
      }
    : {
        readonly type: T;
        readonly controlPoints: readonly Coordinate[];
      };
```

不新增根导出名称。调用方仍通过现有 `ShapeInput`、`ShapeState` 和 `ElementState` 获取类型。

### 3.3 Ring 规范化

每个 ring 使用统一规则：

1. 必须是稠密普通数组，不接受 accessor、symbol、附加属性或稀疏项。
2. 扁平输入必须是非空偶数长度；嵌套坐标必须是二维或三维有限数值。
3. 完成态至少包含 3 个控制点，并围成非零平面面积。
4. 一个 ring 内及所有 rings 之间必须使用相同坐标维度。
5. 顺序和方向保持调用方输入，不自动改 winding。
6. 状态保留现有 control point 语义；渲染时才用 `closeRing()` 补齐未闭合的 ring。
7. 已经显式闭合的 ring 保持现有行为，不擅自删除调用方最后一个控制点。
8. 不校验 hole 是否位于 outer 内部，也不校验 rings 之间是否相交；这些属于调用方数据约束和 OL Polygon 既有语义。

所有数组和坐标必须独立复制并递归冻结。输入、快照、copy 和事务结果之间不得共享可变数组。

## 4. Element 状态与服务行为

ElementState 继续是唯一业务真源。Polygon 状态映射如下：

```text
ElementState.geometry.controlPoints  -> outer ring
ElementState.geometry.holes[n]       -> interior ring n
RenderGeometry.coordinates[0]        -> closed outer ring
RenderGeometry.coordinates[n + 1]    -> closed interior ring n
```

`elements.add()`、`Element.update()`、批量 update、transaction、copy、snapshot、query 和事件载荷都必须保留完整 holes。

`ElementPatch.geometry` 仍是完整 ShapeInput 替换，不增加 holes 的深层 patch：

- 新 geometry 不带 `holes` 或使用 `holes: []` 时删除全部洞。
- 更新单个洞时，调用方提交完整 geometry。
- normalize 失败时事务原子回滚，原状态和 OL Feature 不变化。

## 5. ShapeDefinition 与编辑拓扑

### 5.1 Polygon 专属 Definition

内置 polygon 不再直接使用通用 `createControlPointDefinition()` 的完整产物。实现保留通用单环 draft、freehand 和完成策略，但用 Polygon 专属 definition 包装以下行为：

- normalize / clone / isComplete / tryComplete 处理 outer 与 holes。
- `toRenderGeometry()` 按 `[outer, ...holes]` 顺序逐环 `closeRing()`。
- Draw 的 `createDraft(controlPoints)` 只生成 outer，不凭空创建 holes。
- freehand 仍只采样 outer。
- `pathContour` 仍为 `closed`。

### 5.2 拓扑索引

Polygon edit topology 将所有 rings 展平为连续 handle 索引：

```text
outer handles
hole 0 handles
hole 1 handles
...
```

- outer handle 的 role 为 `outer`。
- hole handle 的 role 为 `hole:<holeIndex>`。
- 每个 ring 独立生成插入位置。
- move、insert、remove 只修改命中的 ring，不改变其他 ring 的顺序或坐标。
- ring 只剩 3 个控制点时，其 handle 不可移除。
- Edit UI 不提供创建或删除整条 hole 的操作；调用方通过 Element.update 替换 geometry。

### 5.3 从扁平 handles 重建状态

当前 Edit Port 在打开和完成时传递连续控制点数组。为防止 ring 边界丢失，内部 `ShapeEditTopology` 增加可选重建能力，名称固定为：

```ts
rebuild?(reference: S, controlPoints: readonly Coordinate[]): S;
```

- `reference` 提供当前各 ring 的点数和边界。
- `controlPoints` 必须与 reference 展平后的 handle 数相等。
- Polygon 按 reference 的 ring 点数重建 outer 与 holes，再执行完整 normalize。
- 其他 Shape 不实现 `rebuild`，继续使用 `createDraft()`。
- `ShapeRegistry` 必须校验并快照该内部函数，不能让注册后对象替换实现。

EditSession 在初始 placement、world-wrap 规范化和 finish 时优先调用 `topology.rebuild()`；插入或移除后使用最新工作态作为 reference。该方法是 Core 内部扩展，不从包根导出，也不扩大用户 API。

## 6. Draw 与 Edit

### 6.1 Draw

- `earth.draw.start({ type: 'polygon' })` 继续只创建 outer ring。
- Draw 预览、freehand、undo 和完成行为不增加新的洞交互。
- 调用方需要洞时，通过 `elements.add()` 或完整 geometry update 提交。

### 6.2 Edit

打开带洞 Polygon 时：

1. ShapeProjectionPort 复制完整状态到 View 工作态。
2. topology.describe() 发布 outer 和所有 hole handles。
3. Edit Port 接收连续 handles，但 ring 边界保存在当前 ShapeState 中。
4. 移动、插入和移除通过 topology 操作完整状态。
5. undo / redo 历史保存规范 ShapeState，而不是 OL Geometry 或扁平 handles。
6. finish 使用最新 reference 重建所有 rings；cancel 恢复原状态。

`freezeShapeState()` 必须递归冻结 holes、每个 ring 和每个 Coordinate。任何公开 modifying/complete 事件都携带不共享可变数组的完整状态。

world-wrap 只改变连续编辑世界中的坐标放置，不得合并、拆分或重排 rings。

## 7. Transform

Transform 对 Polygon 的全部 rings 应用同一事务：

- translate：outer 与 holes 使用相同 x/y 位移。
- rotate：围绕同一中心旋转全部 rings。
- scale / stretch：围绕同一中心使用相同 scaleX/scaleY。
- vertex edit：通过 Polygon topology 命中连续 handle index。
- copy、undo、redo、finish、cancel：保存完整规范状态。

Transform 不从 RenderGeometry 或 OL Feature 反推 holes。`freezeControlPointState()` 需要改为可以冻结 Polygon holes，或拆出 Polygon 专属冻结路径。失败时保持事务原子性。

## 8. OpenLayers Adapter 与渲染边界

GeometryCodec 已经支持任意数量的 Polygon rings；实现只需要让 ShapeDefinition 输出完整 RenderGeometry：

```text
new Polygon([closedOuter, ...closedHoles])
existingPolygon.setCoordinates([closedOuter, ...closedHoles])
```

保持以下边界：

- 同一个 Element 更新 holes 时复用原 Geometry 与 Feature 身份。
- FeatureBinding 只从 ElementState 向 OL 同步。
- `element.olFeature` 仍是高级逃生口；原生修改不写回 Store。
- fill 和 OL hit detection 遵守 Polygon hole 语义。
- `getScreenExtent()` 可以读取完整渲染 geometry，但业务查询仍来自 ElementState。

ShapeProjectionPort 对非圆 Shape 不做单位转换，只通过 definition clone 保留完整 rings；不得在深层模块读取隐式 Earth 或 View。

## 9. Style、linework 与动画

- 普通 Polygon fill 必须保留透明 hole。
- linework、inline text、路径命中轮廓和路径动画继续只使用 outer ring；hole 不生成 tracks、caps、decorations 或文本。
- Polygon 不允许 caps 的既有契约不变。
- fade、blink、highlight 和 alert 等闭合面展示必须复用带 holes 的规范 RenderGeometry，不得用单 outer ring 覆盖。
- grow 仍只支持其已批准的 reveal Shape 集合，不因本设计扩展到普通 polygon。
- 动画临时展示几何不写 Store，不改变业务 holes。

## 10. 错误与兼容性

以下情况抛出 `InvalidArgumentError`：

- holes 不是稠密普通数组，或显式为 undefined。
- 任一 hole 为空、扁平长度为奇数、坐标非有限、维度非法或混合。
- outer 与 hole 或不同 holes 的维度不一致。
- 任一完成 ring 少于 3 个控制点或面积为零。
- edit rebuild 的 handle 数与 reference 拓扑不一致。
- 插入或移除后 ring 不满足最小拓扑。

向后兼容规则：

- 现有 `ShapeInput<'polygon'>` 的 `controlPoints` 调用无需修改。
- 单环 `ShapeState`、JSON、快照和类型显示不新增 `holes`。
- 不增加新根导出，公共 API snapshot 只体现现有 ShapeInput / ShapeState 联合的字段扩展。
- `holes: []` 规范化为省略，避免制造两种等价状态。
- V1 `positions: [outer, ...holes]` 迁移为 `controlPoints: outer, holes`。

## 11. 能力矩阵与测试

能力清单新增：

```text
polygon-multi-ring-hole
```

V1 证据来自 PolygonLayer positions / setPosition；V2 实现入口为内置 polygon definition。测试至少覆盖：

### 11.1 类型与规范化

- ShapeInput 接受 outer + 多 holes 的扁平/嵌套输入。
- 2D、3D 和跨 ring 维度一致性。
- 非法数组、奇数长度、NaN、Infinity、少于 3 点和零面积拒绝。
- holes 不允许出现在 circle 或其他 Shape。
- 输入隔离、clone、递归冻结和空 holes 省略。
- 现有单环快照完全不变。

### 11.2 Core 与 Element

- add/get/update/copy/transaction/batch update 保留 holes。
- normalize 失败原子回滚。
- ElementState、snapshot 和事件不共享数组。
- FeatureBinding 更新同一 Feature；GeometryCodec 更新同一 Polygon Geometry。
- RenderGeometry 顺序固定为 outer 后跟 holes，每环只闭合一次。

### 11.3 Edit 与 Transform

- describe 的连续索引、role 和逐 ring insertions。
- 移动、插入、移除一个 hole 顶点不改变 outer 或其他 holes。
- open、world-wrap、undo、redo、finish、cancel 不丢 ring 边界。
- translate、rotate、scale、stretch 和 vertex edit 处理全部 rings。
- copy 和 Transform 历史保留 holes。

### 11.4 样式、命中与浏览器

- fill 显示透明洞，洞内部不命中 Polygon fill。
- linework、inline text 和路径轮廓只使用 outer。
- Edit / Transform 后洞仍透明且 ring 顺序不变。
- 至少覆盖一个 world-wrap 和一个高 DPR 浏览器场景。

最终必须通过聚焦测试、`npm run verify:code`、公共 API snapshot、strict consumer、包声明和浏览器验收。不得用 native OL layer 逃生口替代能力闭环。

## 12. 迁移与用户文档

代码实现通过后才允许修改迁移说明：

```ts
const [controlPoints, ...holes] = positions;

earth.elements.add({
  type: 'polygon',
  geometry: {
    type: 'polygon',
    controlPoints,
    ...(holes.length === 0 ? {} : { holes })
  },
  layerId: 'planning'
});
```

届时删除 MIGRATION 中“普通 Polygon 多环/洞无对应能力”的限制，改为明确映射，并在 Polygon 归属页和同源示例中展示 outer、hole、更新、Edit/Transform 和清理。

坐标转换继续逐 ring 显式调用：调用方先对 outer 和每个 hole 分别执行 `toProjectedCoordinates()`，保存时分别执行 `toGeographicCoordinates()`；本设计不扩展 ViewService 让其递归理解 Polygon geometry。

## 13. 实施顺序

1. 批准本补充设计。
2. 在 V1/V2 capability matrix 登记 `polygon-multi-ring-hole` 并先写失败测试。
3. 扩展 ShapeInput / ShapeState 与 Polygon definition。
4. 扩展 topology rebuild、Edit 和 Transform 全环行为。
5. 补齐 Core、OL、linework、浏览器和 strict consumer 测试。
6. 运行 `npm run verify:code`，确认 Wind 仍是唯一 exclusion。
7. 回到第二阶段实施计划，更新 MIGRATION、website、同源示例和文档矩阵。

## 14. 批准项

批准本设计即确认以下公共契约：

1. `controlPoints` 继续表示 Polygon outer ring，新增可选 `holes` 表示 interior rings。
2. 不新增根导出类型，不引入 MultiPolygon。
3. Draw 只创建 outer；Element update 可以增加、替换或删除 holes。
4. Edit 与 Transform 对现有 outer 和 holes 提供完整保持及顶点操作。
5. 不验证包含关系、自交、ring 相交或 winding；只验证数据结构、维度、点数、有限数值和非零面积。
6. linework 只装饰 outer，fill 和 OL 命中遵守 hole 语义。
7. ViewService 不新增递归 Polygon 转换入口，调用方按 ring 显式转换。
