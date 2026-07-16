# 2.0 坐标转换与圆半径单位补充设计

## 文档状态

- 状态：已批准
- 日期：2026-07-16
- 目标版本：@vrsim/earth-engine-ol 2.0.0
- 补充：2026-07-13-v2-element-kernel-architecture-design.md
- 关联：2026-07-16-v2-interaction-visual-design.md

用户已确认：元素坐标继续使用当前 View 投影的既有契约，由显式公共方法完成经纬度双向转换；几何圆的 `radius` 固定使用米，不增加单位参数。

## 1. 目标与非目标

本设计解决两个易用性问题：

1. 外部系统以 EPSG:4326 经纬度保存坐标时，不需要自行拆分扁平数组并逐点调用 OpenLayers。
2. 几何圆的半径不再随 View 投影单位变化，业务状态可以稳定地以米保存、复制和读取。

本次不改变以下契约：

- `ElementState.geometry` 中除圆半径外的坐标仍是当前 View 投影坐标。
- `elements.add()`、`update()`、Draw、Edit、Transform、Event、ContextMenu、Overlay 和 View 的既有坐标字段不会自动转换为经纬度。
- 不设置或依赖 OpenLayers 全局 user projection。
- 不增加 `radiusUnit`、`dataProjection` 或每次调用都要传入的投影参数。
- 不把 OpenLayers 类型或运行时代码引入 Core。

## 2. View 坐标转换公共契约

`ViewService` 新增两个对称方法：

```ts
earth.view.toProjectedCoordinates(coordinates)
earth.view.toGeographicCoordinates(coordinates)
```

语义固定为：

- `toProjectedCoordinates`：EPSG:4326 经纬度转换为当前 Earth 的 View 投影坐标。
- `toGeographicCoordinates`：当前 Earth 的 View 投影坐标转换为 EPSG:4326 经纬度。
- 方法从所属 `earth.view.olView` 读取目标或来源投影，不接受额外投影参数。
- 多个 Earth 各自使用自己的 View 投影，不读取隐式 Earth 实例。

两种输入结构均受支持，并保持输入结构：

```ts
earth.view.toProjectedCoordinates([120, 0, 110, 0]);
earth.view.toProjectedCoordinates([
  [120, 0],
  [110, 0]
]);
```

扁平数组始终按二维坐标成对解释；空数组和非偶数长度均拒绝。嵌套坐标允许二维或三维，三维坐标只转换前两维并原样保留 Z。方法返回全新的数组，不修改、冻结或复用调用方数组。

输入必须是稠密普通数组，所有坐标分量必须为有限数值；不得混用扁平和嵌套结构。输入或投影结果无效时抛出 `InvalidArgumentError`。

## 3. 圆半径公共契约

几何圆统一使用以下语义：

```ts
const circle = earth.elements.add({
  geometry: {
    type: 'circle',
    center: earth.view.toProjectedCoordinates([120, 0]),
    radius: 1_000
  }
});

circle.state.geometry.radius; // 1000，单位为米
```

- `ShapeInput<'circle'>.radius` 和 `ShapeState<'circle'>.radius` 始终表示米。
- `Element.state`、元素快照、事务、复制、Draw 完成结果、Edit 完成结果和 Transform 持久结果中的半径都保持米。
- `style.symbol.radius` 仍表示 CSS 像素，与几何圆半径无关。
- `element.olFeature` 中原生 OL Circle 的半径仍是当前 View 投影单位；该值属于高级 OpenLayers 逃生口，不是业务状态。
- 半径必须是非负有限数值；本次不增加任何单位字段。

业务规则固定为：

- 平移圆只改变圆心，米制半径不变。
- 旋转圆不改变米制半径。
- 等比缩放按缩放比例修改米制半径。
- 非等比缩放继续使用两个轴绝对缩放量的平均值，保持既有圆缩放语义。
- 移动半径控制点时，由引擎把当前投影距离换算为米后写入状态。

## 4. 内部坐标空间边界

Core 中的 `ElementState` 继续作为唯一业务状态真源。圆心属于当前 View 投影坐标，圆半径属于投影无关的业务距离，单位为米。OL Feature、预览 Geometry 和交互半径只是该状态的展示投影。

Core 定义不依赖 OpenLayers 的 `ShapeProjectionPort`：

- `toViewState(state)`：把规范 Shape 状态转换为交互和渲染使用的 View 状态。
- `toElementState(state, referenceState?)`：把交互 View 状态转换回可提交的规范 Shape 状态；控制点编辑可传入编辑前的规范状态，用于保持未被控制点修改的业务距离。

非圆图形在本次实现中保持坐标和值不变；圆图形只转换半径。OpenLayers Adapter 提供具体实现，Earth 在创建时显式注入 Draw、Edit、Transform、GeometryCodec 和 AnimationManager，深层模块不得自行读取 `useEarth()` 或全局地图。

转换使用圆心处的局部投影比例：

```text
metersPerProjectionUnit = getPointResolution(projection, 1, center, 'm')
projectedRadius = meters / metersPerProjectionUnit
meters = projectedRadius * metersPerProjectionUnit
```

局部比例必须是有限正数，换算结果也必须是有限非负数；当前投影无法提供有效比例时抛出 `CapabilityError`，不得退化为“一投影单位等于一米”。OL Circle 仍是平面投影圆，不承诺成为大地测量意义上的等距圆。

## 5. Draw、Edit、Transform 与动画

- Draw 使用 View 状态生成预览；提交 Store 和公开 `change` 图形前转换为规范状态。
- Edit 打开时把 Store 中的规范状态转换为 View 工作状态；预览和控制点使用 View 状态，历史和公开修改事件保存规范状态，撤销或重做后再生成 View 状态。
- Edit 或 Transform 移动圆心控制点时，投影端口以编辑前的规范状态为参考：只更新圆心，并按新圆心重新生成 View 半径，米制半径保持不变；移动半径控制点时才重新计算米制半径。
- Transform 的历史和工作快照继续使用规范状态。展示几何和编辑锚点按需转换为 View 状态；顶点编辑完成后转换回规范状态。
- Transform 平移、旋转和缩放直接维护米制半径，避免圆移动到不同纬度后业务半径漂移。
- FeatureBinding 和 GeometryCodec 只把规范状态单向投影为 OL Geometry，不从 OL Circle 反向恢复米制半径。
- AnimationManager 在建立渲染上下文前把规范圆转换为 View 圆；临时预览不得反向写入 Store。
- Draw、Edit、Transform 的预览与最终结果继续共享同一个 ShapeDefinition，不新增第二套圆几何算法。

## 6. 错误、测试与迁移

自动化测试至少覆盖：

- 扁平与嵌套坐标的正向转换、反向转换和误差范围内往返。
- EPSG:4326 View、自定义 Earth 投影、三维 Z 保留、空数组拒绝和输入不变性。
- 奇数长度、稀疏数组、混合结构、NaN、Infinity 和无法转换投影的错误。
- EPSG:3857 赤道与高纬度的米制半径投影差异。
- `Element.state.geometry.radius` 始终为米，而 `olFeature` 半径为投影单位。
- 圆的 add、update、copy、Draw、Edit、Transform 平移、缩放、撤销、完成和取消。
- 多 Earth 使用不同投影时互不影响。

迁移说明必须明确：

- 原先传入投影单位半径的 2.0 调用改为传入米。
- 经纬度坐标不会因本次修改自动转换，调用方应显式使用 `toProjectedCoordinates`。
- 从 `Element.state` 保存坐标时使用 `toGeographicCoordinates`；需要扁平结构时再使用 `toFlatCoordinates`。
- 原生 `olFeature` 的 Circle 半径与业务 `Element.state` 半径单位不同。

website 中 `ViewService` 的规范归属页必须记录两个方法，并在同源可运行示例中覆盖“经纬度创建元素—读取元素—转换回经纬度”的完整流程。
