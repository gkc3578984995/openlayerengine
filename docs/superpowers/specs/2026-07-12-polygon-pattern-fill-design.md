# PolygonLayer 内置纹理填充设计

## 目标

为 `PolygonLayer` 增加五种内置、可平铺的透明纹理填充：单斜线、交叉斜线、点阵、水平线和垂线。保留现有纯色填充 API，并确保 Transform、DynamicDraw 以及几何编辑过程不会丢失纹理配置。

## 非目标

- 不支持任意角度、图片、SVG 或用户自定义绘制函数。
- 不把纹理能力扩展到 CircleLayer、PointLayer 或文本背景。
- 不保证调用方直接修改 OpenLayers `Style` 后纹理自动同步；动态联动仅由 `PolygonLayer.set()` 保证。

## 公共 API

新增以下类型：

```ts
export type PolygonPatternType = 'diagonal' | 'cross' | 'dot' | 'horizontal' | 'vertical';

export interface IPolygonPatternFill {
  type: PolygonPatternType;
  color?: string;
  size?: number;
  lineWidth?: number;
  dotRadius?: number;
  backgroundColor?: string;
}

export type IPolygonFill = IFill | IPolygonPatternFill;
```

`IPolygonParam.fill` 与 `ISetPolygonParam.fill` 使用 `IPolygonFill`。`IDrawPolygon` 增加 `fill?: IPolygonFill`；既有 `fillColor?: string` 保留兼容，且新 `fill` 优先。

`type` 缺失时仍执行既有纯色填充。`type` 存在时使用纹理填充：

```ts
fill: {
  type: 'diagonal',
  size: 16,
  lineWidth: 1
}
```

`diagonal` 固定为 `/` 方向；`cross` 固定为 `/` 与 `\\` 的组合。没有角度参数。

## 默认值与颜色

- `backgroundColor` 未传时完全透明。
- `size` 默认 `16` px，`lineWidth` 默认 `1` px，`dotRadius` 默认 `1.5` px。
- 纹理颜色按 `fill.color -> 显式配置的 stroke.color -> #000000` 解析。
- 库内 `setStroke()` 的渲染默认色 `#ffcc33` 不是纹理的继承来源；调用方没有提供边框颜色时，纹理为黑色。
- `fill.color` 未传时，调用 `PolygonLayer.set({ id, stroke: { color } })` 后重新解析纹理颜色；显式设置 `fill.color` 后纹理不再跟随边框色。

纹理参数是声明式配置。解析后的 `CanvasPattern` 与派生颜色不写回 `param.fill`，以保留“颜色是否由边框继承”的信息。

## 渲染与数据流

新增仅供 Polygon 使用的 `PolygonPatternFillFactory`。它接收已规范化的纹理参数与显式边框颜色，绘制一个可重复 Canvas 图块并生成 OpenLayers `Fill` 可使用的 `CanvasPattern`。

`PolygonLayer` 统一负责创建和更新样式：新增要素和 `set()` 都先合并完整的 Polygon 参数，再同时生成 Stroke、Fill 和 Text。对于带纹理的 Polygon，`set()` 会写回合并后的声明式参数，之后重建样式。

OpenLayers 的平铺 Pattern 对图块尺寸有幂次约束。`size` 只接受 `4`、`8`、`16`、`32`、`64`、`128` 这些 2 的幂，保证相邻填充无接缝。`lineWidth` 与 `dotRadius` 可以是任意正数。非有限或非正的数值回退到对应默认值，不抛出异常。

## 与 Base、Transform 的兼容

`Base.updatePolygonParam()` 当前会从 `Style` 反向同步 fill 颜色。该逻辑必须识别纹理 Polygon：不读取或覆盖其 `param.fill`，也不以渲染中的默认 Stroke 覆盖原始边框颜色。只同步几何坐标和仍可安全推导的字段。

这样 Transform 对 Polygon 的平移、旋转和缩放只改变坐标；纹理配置、显式/继承颜色状态和参数均保持。Transform 的撤销/重做通过 `setPosition()` 恢复几何，也不会替换 Polygon 样式。

纹理始终保持固定地图/屏幕方向和像素密度，不随 Polygon 的旋转或缩放改变。

## DynamicDraw

`drawPolygon()` 将 `IDrawPolygon.fill` 原样传入 `PolygonLayer.add()`；若新字段不存在则继续从 `fillColor` 生成纯色填充，保持现有调用兼容。

`editPolygon()` 的临时编辑面不复制原要素样式。编辑结束时仅写回几何，原 feature 的纹理仍在。`isShowUnderlay: true` 且原要素使用纹理时，临时编辑面采用透明 Fill 与蓝色 Stroke，避免遮住底图纹理。

## 测试

- 五种 Pattern 的 Canvas 绘制分支，以及纯色填充向后兼容。
- 默认参数与无效参数回退；`size` 的允许值。
- 纹理色显式覆盖、继承边框色、边框改色后的联动。
- `PolygonLayer.set()` 对纹理类型和参数的更新。
- 几何变化和 `getUpdatedParam()` 后纹理参数不被 `CanvasPattern` 覆盖。
- Transform 的平移、旋转、缩放与撤销/重做后纹理配置仍完整。
- DynamicDraw 创建纹理 Polygon、编辑后保留纹理，以及 underlay 编辑预览透明。

## 验收条件

调用方只传 `type` 即可获得黑色透明的默认纹理；显式边框色会被无显式颜色的纹理继承。五种纹理在普通创建、更新、Transform、DynamicDraw 创建和 DynamicDraw 编辑后均稳定显示，且已有 `fill: { color }` 调用行为不变。
