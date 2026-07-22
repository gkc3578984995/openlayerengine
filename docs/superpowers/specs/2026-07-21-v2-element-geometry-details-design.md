# 2.0 Element 几何详情补充设计

## 文档状态

- 状态：已批准
- 日期：2026-07-21
- 目标版本：@vrsim/earth-engine-ol 2.0.0
- 性质：Element 公共读取契约补充
- 补充：2026-07-13-v2-element-kernel-architecture-design.md
- 关联：2026-07-16-v2-coordinate-conversion-and-circle-radius-design.md
- 关联：2026-07-16-v2-interaction-visual-design.md
- 关联：2026-07-17-v2-animation-effect-kernel-design.md

用户已确认：在公共 `Element` 句柄上增加只读派生 getter `geometryDetails`，统一返回元素最新已提交规范几何所对应的完整渲染几何和二维外接范围。该结果不进入 `ElementState`，不读取 OpenLayers Feature，也不包含动画、交互预览、样式外扩或 world wrap 展示副本。

## 1. 背景与目标

`Element.state.geometry` 是业务状态真源。Circle 使用圆心和米制半径，其他 Shape 使用控制点；复杂 Plot 箭头的最终 Polygon 轮廓由 `ShapeDefinition` 动态生成。因此，调用方虽然可以读取控制点，却缺少一个与 OpenLayers 无关的公共入口来读取元素的完整最终几何和地图坐标外接范围。

`Element.olFeature` 可以作为高级逃生口读取当前 OL Geometry，但它是可变渲染投影，直接修改不会回写状态，也不应成为稳定业务查询契约。`getScreenExtent()` 返回的是包含样式影响的 CSS 像素范围，也不能替代地图投影坐标中的几何详情。

本设计的目标是：

1. 让 `earth.elements.get(id)` 返回的 `Element` 可以直接读取完整最终几何。
2. 为 Circle、Plot 箭头和基础 Shape 提供统一、纯数据、只读的判别联合。
3. 同时返回从完整最终几何计算出的二维外接范围。
4. 保持 `ElementState` 为唯一业务状态真源，不把派生结果放入事务、快照、复制或持久化数据。
5. 保持 Core、Services、Public Facade 与 OpenLayers Adapter 的既有依赖边界。

本次明确不做：

- 不把 `renderGeometry` 或 `extent` 增加到 `ElementState`、`ElementPatch`、`ElementSnapshot` 或创建参数。
- 不提供 Circle 的固定分段离散、多边形近似或圆周采样参数。
- 不返回动画中间几何、Edit / Transform 工作预览或 Draw 草稿。
- 不计算描边、Icon、Text、Decoration、PatternFill 或原生样式造成的视觉外扩。
- 不返回 world wrap 生成的当前世界或相邻世界展示副本。
- 不从 `Element.olFeature` 或其他 OpenLayers Geometry 反向恢复业务或派生状态。
- 不开放公共 `ShapeDefinition` 注册入口。

## 2. 公共 API

### 2.1 公共类型

新增以下公共类型，并从包根入口导出：

```ts
export type MapExtent = readonly [
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
];

export type ElementRenderGeometry =
  | {
      readonly type: 'point';
      readonly coordinates: Coordinate;
    }
  | {
      readonly type: 'polyline';
      readonly coordinates: readonly Coordinate[];
    }
  | {
      readonly type: 'polygon';
      readonly coordinates: readonly (readonly Coordinate[])[];
    }
  | {
      readonly type: 'circle';
      readonly center: Coordinate;
      readonly radius: number;
    };

export interface ElementGeometryDetails {
  /** 当前 Shape 的完整最终渲染几何。 */
  readonly renderGeometry: ElementRenderGeometry;
  /** renderGeometry 在当前 View 投影中的二维外接范围。 */
  readonly extent: MapExtent;
}
```

这些名称属于新的公共契约。实现可以在内部复用现有 `RenderGeometryState`，但不得从根入口额外导出内部 Shape、Adapter 或解析器类型。

### 2.2 Element getter

`Element` 新增只读 getter：

```ts
export class Element<T = unknown> {
  /** 最新已提交规范几何所对应的完整几何详情。 */
  get geometryDetails(): Readonly<ElementGeometryDetails>;
}
```

标准用法：

```ts
const element = earth.elements.get('arrow-1');
const details = element?.geometryDetails;

if (details?.renderGeometry.type === 'polygon') {
  const outerRing = details.renderGeometry.coordinates[0];
  const [minX, minY, maxX, maxY] = details.extent;
}
```

查询不到 ID 时，`earth.elements.get(id)` 仍返回 `undefined`。当前有效 `Element` 的 `geometryDetails` 不增加 `undefined` 分支；投影或 Shape 推导失败时抛出稳定错误。失效句柄沿用 `state` 和 `olFeature` 的生命周期规则，抛出 `ObjectDisposedError`。

### 2.3 命名边界

属性固定命名为 `geometryDetails`：

- `geometry` 已用于 `ElementState.geometry` 的规范控制或参数状态，不能复用为不同语义。
- `extent` 只表示四值外接框，不能表达箭头 Polygon 的完整轮廓。
- `coordinates` 不能统一表达参数化 Circle。
- `geometryDetails` 明确表示由当前规范状态派生的“完整几何 + 外接范围”读取结果。

本次不同时增加 `ElementService.getGeometryDetails()`，避免为相同语义制造两个公共入口。批量调用方通过 `query()` 获得 Element 后读取各自 getter。

## 3. 几何语义

### 3.1 通用规则

`renderGeometry` 表示最新已提交 `ElementState.geometry` 经当前 Earth 的真实 Shape 规则解析后得到的完整最终几何：

```text
ElementState.geometry
  -> ShapeProjectionPort.toViewState()
  -> ShapeRegistry.get(type)
  -> ShapeDefinition.toRenderGeometry()
  -> 公共只读深冻结快照
```

实现应复用现有可信 Shape 渲染入口；不得在 Facade、Service 或 Adapter 中复制箭头、曲线、月牙、扇面等 Shape 专属算法。

返回结果必须满足：

- 所有数值有限，结构与当前 Shape 的最终渲染类型一致。
- 所有对象、rings、坐标数组和 Coordinate 递归冻结。
- 不与 Store 状态、ShapeDefinition 工作区、动画 Runtime、交互预览或 OL Geometry 共享可变数组。
- 调用方不得依赖连续两次读取的对象身份；实现可以按 Element generation、geometry revision 和投影上下文缓存已冻结快照。
- Z 坐标按 Shape 的既有渲染语义保留；`extent` 只统计 XY，不表达高度范围。

### 3.2 Point 与 Polyline

- Point 返回一个 `point` 及其完整 Coordinate。
- Polyline 和最终渲染为线的曲线 Shape 返回 `polyline` 及其最终有序路径坐标，而不是仅返回原始控制点。
- Point 的 `extent` 为 `[x, y, x, y]`。
- Polyline 的 `extent` 是全部路径坐标 XY 的最小、最大值。

### 3.3 Polygon 与 Plot 箭头

- Polygon 和最终渲染为面的 Plot Shape 返回 `polygon`。
- `coordinates` 按 OpenLayers 无关的 ring 结构表达；每个 ring 遵循当前 `ShapeDefinition.toRenderGeometry()` 的闭合规则。
- AttackArrow、TailedAttackArrow、FineArrow、TailedSquadCombatArrow、AssaultDirectionArrow 和 DoubleArrow 等箭头必须返回真实 ShapeDefinition 生成的最终 Polygon，不得返回控制点连线，也不得建立第二套箭头轮廓算法。
- `extent` 统计全部 rings 的所有 XY 坐标。

本契约不从最终 Polygon 反推箭头中心路径、控制点角色或动画 reveal 语义；这些仍由 ShapeDefinition 的既有状态和 provider 管理。

### 3.4 Circle

Circle 保持精确参数化表达：

```ts
{
  type: 'circle',
  center: [x, y],
  radius: projectedRadius
}
```

- `center` 是当前 View 投影坐标。
- `renderGeometry.radius` 是圆心处换算后的当前 View 投影单位，不是米。
- `element.state.geometry.radius` 继续固定为米，业务状态契约不变。
- `extent` 精确计算为 `[x - radius, y - radius, x + radius, y + radius]`。
- 不生成固定 32、64 或其他分段数的圆周坐标。有限顶点环只能近似圆，不得通过本 getter 伪装成精确覆盖边界。
- OL Circle 仍是平面投影圆，不增加大地测量等距圆承诺。

调用方需要经纬度时，继续显式使用 `earth.view.toGeographicCoordinates()`。Point 和 Circle center 可直接转换，Polyline 需逐 Coordinate 转换，Polygon 需逐 ring、逐 Coordinate 转换；Circle radius 不能作为坐标直接转换。本 getter 不接受或隐式选择其他输出投影。

## 4. extent 契约

`extent` 固定为 `renderGeometry` 的二维轴对齐外接范围，顺序为：

```text
[minX, minY, maxX, maxY]
```

其语义为：

- 使用当前 Earth 的 View 投影单位。
- 直接从同一次读取产生的 `renderGeometry` 计算，二者不能来自不同 revision。
- Point 使用零面积范围；Circle 使用中心和投影半径；Polyline 与 Polygon 遍历其最终坐标。
- 不随 View rotation 改变，不是旋转后的屏幕包围框。
- 不考虑当前 viewport 是否可见；hidden 或离屏 Element 仍返回规范几何范围。
- 不包含 Layer `renderBuffer`、CSS 像素样式外扩或动画视觉外扩。

需要实际屏幕视觉范围时，调用方继续使用：

```ts
earth.elements.getScreenExtent(element);
```

`ScreenExtent` 与 `MapExtent` 是两个不同单位、不同用途的公共类型，不得相互替代。

## 5. 状态、动画与交互边界

### 5.1 最新已提交状态

`geometryDetails` 每次读取以 ElementStore 中当前 generation 的最新已提交 `ElementState` 为输入：

- add、update、Edit 完成或 Transform 完成提交后，下一次读取反映新状态。
- copy 的新 Element 根据自己的已提交状态独立推导。
- snapshot、事务历史和序列化结果不携带 `geometryDetails`。
- 直接修改 `element.olFeature` 不改变 getter 结果；下一次规范投影也可以覆盖该原生修改。

### 5.2 动画

`geometryDetails` 不读取 AnimationManager 的 FrameBuffer、presentation replacement、overlay 或 retained 帧：

- grow 始终返回完整最终几何，不返回当前揭示片段。
- pulse、radar-scan、center-spread、highlight 和 alert 不扩大 `extent`。
- blink 和 fade 不改变几何或范围。
- 动画暂停、隐藏、停止、replace 和 retain 均不改变结果。

该边界与“Selector、query 和业务范围查询继续读取规范 Element 状态”的已批准动画契约一致。未来若需要查询动画展示几何，必须另行设计逐帧展示读取协议，不得改变本 getter。

### 5.3 Draw、Edit 与 Transform

- 未完成 Draw 草稿尚未形成 Element，因此没有 `geometryDetails`。
- Edit 和 Transform 会话中的工作几何、控制点、选框、复制预览及其他临时视觉不进入结果。
- 会话进行期间读取目标 Element，返回打开会话前或外部最后一次已提交的规范几何。
- 会话完成提交后返回新几何；取消、失败或回滚后保持原结果。
- 跨世界交互预览只改变展示坐标，不改变本 getter 的最新已提交状态坐标。

## 6. 样式与 world wrap 边界

### 6.1 样式

`renderGeometry` 只表达 Shape 几何，不表达绘制到屏幕后的视觉覆盖：

- Stroke 宽度、miter、CircleSymbol 半径、Icon 尺寸和位移、Text、背景、Decoration、PatternFill 以及多层描边均不改变 `extent`。
- StyleSpec 更新但 geometry 未变化时，几何数值保持不变。
- NativeStyleRef 不影响该能力；即使无法分析原生样式，规范 Shape 几何仍可读取。
- 样式箭头或路径 Decoration 不属于 Shape Polygon，不进入 `renderGeometry`。

### 6.2 world wrap

`geometryDetails` 只返回 ElementState 对应的已提交状态几何：

- VectorLayer 的 `wrapX` 不会复制或平移返回坐标。
- Adapter 为当前 frame 生成的相邻世界展示副本不进入结果。
- 地图平移到其他世界副本不会改变 getter。
- getter 不会把状态中本来位于第 N 个世界的坐标自动归一化到基础世界。
- 调用方需要当前视图所在世界的单个坐标时，可显式使用 `earth.view.normalizeToViewWorld()`；批量平移整个几何由调用方根据自身业务目的处理。

这样可避免返回数组数量随 viewport、resolution 或世界副本可见性变化，也保持快照和业务查询的确定性。

## 7. 架构与实现边界

### 7.1 依赖方向

`geometryDetails` 是 Public Facade 的派生读取能力，不属于 Core 状态字段。实现必须满足：

- ElementStore 继续只保存 `ElementState`。
- Earth 通过 EngineContext 显式提供实例级 `ShapeRegistry` 和 `ShapeProjectionPort`。
- ElementService 在构造 Element 句柄时注入当前 generation 的详情读取函数。
- Element getter 复用与 `state` 相同的当前代次校验，再调用该读取函数。
- 深层模块不得调用 `useEarth()`、读取全局 View 或导入 OpenLayers。

可以新增内部纯数据 resolver，或抽取现有可信 Shape 渲染与 extent 计算工具；物理文件位置不构成公共 API。不得为了实现 getter 让 Core 导入 OL，也不得让 Public Facade 读取 `Feature.getGeometry()`。

### 7.2 单一推导路径

规范 Feature、动画目标画像、交互预览和 `geometryDetails` 都依赖同一 ShapeDefinition 最终几何语义。实现应复用单一可信渲染入口和单一纯数据 extent 算法，避免出现：

- Arrow 在 getter 与地图展示中使用不同算法。
- Circle 在 getter 中跳过 ShapeProjectionPort。
- Polygon ring 闭合方式不一致。
- extent 与返回的 renderGeometry 属于不同状态 revision。

如果投影转换或 ShapeDefinition 无法为一个已经存在的当前 Element 生成合法结果，沿用现有 `CapabilityError`；不得退化为读取 OL Geometry、返回控制点或静默给出空范围。

### 7.3 生命周期与缓存

- getter 不创建长期外部资源，不持有 OL Feature、Layer、listener 或 DOM。
- 缓存只能由所属 Earth / Element generation 管理，并在 geometry revision、投影上下文变化、remove 或 Earth.destroy 时失效。
- 缓存值必须已经深冻结；不得把动画或交互的可复用工作缓冲区作为公共返回值。
- remove 后的旧句柄、相同 ID 的新 generation 和不同 Earth 之间不得共享或误用详情缓存。

## 8. 错误模型

- 查询缺失 ID：`earth.elements.get(id)` 返回 `undefined`，既有行为不变。
- 已移除、被相同 ID 新 generation 替代或所属 Earth 已销毁的句柄：读取时抛出 `ObjectDisposedError`。
- 当前投影不能提供 Circle 所需的有限正局部比例：抛出 `CapabilityError`，不得假设一投影单位等于一米。
- 已提交状态无法生成有限合法 RenderGeometry：抛出既有参数或能力错误，并视为需要修复的不一致状态；不得返回部分 coordinates 或无穷 extent。

读取失败不修改 Store、Feature、动画、交互会话或缓存中的最后有效业务状态。

## 9. 测试与验收

自动化测试至少覆盖：

1. Point、Polyline、Polygon 和 Circle 的判别联合、完整坐标及 extent。
2. CurvePolyline、LunePolyline、闭合 Plot、全部箭头和 DoubleArrow 返回真实最终 RenderGeometry，而不是控制点连线。
3. Polygon ring 闭合语义和全部 rings 的 extent 聚合。
4. Circle 在赤道、高纬度和不同 Earth 投影下的米制状态半径、View 投影半径与精确 extent。
5. add、update、copy、Edit 完成和 Transform 完成后读取最新已提交状态；取消和回滚保持原状态。
6. Edit / Transform 拖拽中不读取临时预览，完成后才切换结果。
7. grow、pulse、radar-scan、center-spread、highlight、alert、blink、fade 和 retained 帧不改变结果。
8. 宽 Stroke、Icon、Text、Decoration、PatternFill、NativeStyleRef 和样式更新不改变几何 extent。
9. `wrapX`、跨世界 viewport 和交互 world offset 不产生展示副本，也不自动归一化已提交坐标。
10. hidden、离屏和图层透明度不阻止读取。
11. 直接修改 `olFeature` geometry 不改变结果。
12. 返回对象、rings 和 Coordinate 递归冻结，且不与 Store、Runtime 或预览工作区共享可变数组。
13. remove、相同 ID 重建、Earth.destroy 和多 Earth 隔离遵循句柄生命周期。
14. 根导出、TypeScript 判别收窄、公共 API 快照和 strict consumer 覆盖三个新增公共类型及 getter。

实现完成后必须运行聚焦测试、`npm run verify:code`、公共 API snapshot 和 strict consumer。进入用户文档阶段后，还必须更新 Element 规范归属页、TypeDoc、可运行示例和迁移说明，并通过 `npm run docs:build` 与完整 `npm run verify`。

## 10. 用户文档要求

Element 归属页必须明确区分：

| 入口 | 含义 | 单位与边界 |
| --- | --- | --- |
| `element.state.geometry` | 规范业务状态、控制点或 Circle 参数 | 坐标为 View 投影；Circle radius 为米 |
| `element.geometryDetails` | 最新已提交状态生成的完整最终几何和二维范围 | 坐标与 Circle render radius 为 View 投影单位 |
| `element.olFeature` | 可变 OL 高级逃生口 | 不保证原生修改回写业务状态 |
| `earth.elements.getScreenExtent()` | 当前规范元素的屏幕视觉范围 | CSS 像素；不随动画变化 |

示例至少展示：

- 读取 Plot 箭头的完整 Polygon ring。
- 读取 Circle 的参数化 `center`、投影半径和 extent，并与状态中的米制半径对照。
- 使用 `toGeographicCoordinates()` 显式逐 Coordinate 转换返回坐标，并说明 Circle radius 不属于坐标转换。
- 说明动画、样式和 world wrap 不进入结果。

不得把 Circle 描述为已经离散成精确圆周坐标，也不得把 `extent` 描述为包含样式的实际屏幕覆盖范围。

## 11. 完成定义

只有同时满足以下条件，本补充设计才算实现完成：

- `Element.geometryDetails` 是唯一新增查询入口，返回 `renderGeometry + extent`。
- `ElementGeometryDetails`、`MapExtent` 和 `ElementRenderGeometry` 从包根导出。
- 详情从最新已提交 `ElementState` 经 ShapeProjectionPort 和真实 ShapeDefinition 单向推导。
- Circle 保持精确参数化表达，不进行隐式离散；业务 radius 继续为米，render radius 为 View 投影单位。
- Arrow 和其他复杂 Shape 返回真实最终 RenderGeometry，不复制 Shape 算法。
- 返回值递归冻结，不进入 Store、事务、快照、copy 或序列化。
- 动画、交互预览、样式外扩和 world wrap 展示副本均不影响结果。
- 不读取或反向解析 OL Feature，不新增 OL 私有 API 或隐式全局 Earth 依赖。
- 生命周期、错误、多 Earth、公共导出、测试和用户文档门槛全部通过。

## 12. 批准项

本设计的已批准公共契约固定为：

1. 新增 `Element.geometryDetails` 只读派生 getter。
2. getter 返回 `renderGeometry` 与 `extent`，不增加同义 ElementService 方法。
3. 结果表示最新已提交的规范 Shape，不表示动画帧或交互工作态。
4. Circle 使用参数化 center + View 投影半径，不返回离散圆周。
5. extent 是纯 Shape 的 View 投影二维外接范围，不包含样式、动画或 world wrap。
6. 派生链固定为 ElementState → ShapeProjectionPort → ShapeDefinition，禁止从 OL Geometry 反向读取。
7. 全部公共返回数据递归冻结，三个新增类型从包根导出。
