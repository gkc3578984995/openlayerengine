# 基础图层文档设计

## 目标

在文档站“基础图层”分组中新增 CircleLayer、PolygonLayer、BillboardLayer、OverlayLayer 和 PolylineLayer 五个完整文档页面。WindLayer 不在本次范围内；Base.ts 继续由“图层通用操作”页面承载；PointLayer 页面保持为设计与内容基准。

## 页面架构

每个图层使用独立路由、独立 View 和一组可运行 Vue 示例。页面结构统一为：顶部简介、概述、何时使用、代码演示、API、注意事项和右侧锚点。API 区按构造参数、类型定义、方法的顺序组织，并复用现有 `ApiTable`、`ExampleBlock` 和 `PageAnchor` 组件。

五个页面分别使用以下路由：

- `/components/circle-layer`
- `/components/polygon-layer`
- `/components/billboard-layer`
- `/components/overlay-layer`
- `/components/polyline-layer`

## 子流程边界

五个实现子流程各自只拥有对应页面、示例和专属 API 数据文件：

1. CircleLayer：圆的添加、半径与圆心更新、描边、普通或纹理填充、标签。
2. PolygonLayer：面的添加、几何更新、主描边、背景描边、普通或纹理填充、标签。
3. BillboardLayer：图片标记的添加、缩放、旋转、锚点、动态更新、位置更新、图标范围读取。
4. OverlayLayer：DOM 覆盖物的添加、内容与定位更新、位置更新、读取和移除，并明确其不继承 Base。
5. PolylineLayer：普通线、箭头线、流动虚线、飞线，以及对应的位置、样式、显隐和移除行为。

公共文件由主流程统一修改，包括导航、路由、布局标题映射、共享 API 辅助函数和文档覆盖测试，避免子流程并发覆盖。

## API 与类型归属

图层自有方法只在其图层页面定义，并且每个自有方法至少在本页的运行示例中调用一次。继承自 Base 的通用方法不在五个页面重复定义，页面通过链接指向 `/components/layer-common#api-methods`。

`IFill`、`IStroke` 和 `ILabel` 继续以 PointLayer 页面为规范归属，其他页面跨页链接到对应锚点。`IGeometryFill` 在 CircleLayer 页面建立基础图层侧的规范定义，PolygonLayer 跨页引用。每个图层自己的新增与更新参数接口在本页定义。OpenLayers 外部类型仅以外部类型展示，不建立库内归属链接。

## 示例与视觉规范

所有含底图示例通过 `createConfiguredLayer` 创建底图，不写入地图服务 URL。运行示例和展示源码引用同一份 Vue 文件。示例负责清理图层和 Earth 实例，避免路由切换后残留资源。

页面不新增独立视觉体系，完全复用现有语义化主题变量与文档组件。需要检查浅色、深色和窄屏布局，保持与 PointLayer 页面一致的层级、间距、代码样式和锚点行为。

## 测试与验收

先增加覆盖五个页面注册、导航、标题、页面结构、锚点、示例方法调用和地图源约束的失败测试，再实现页面。每个子流程完成后运行其覆盖测试与文档站构建；全部集成后运行：

- `npm test`
- `npm run docs:build`

验收要求为五个路由可访问、导航和标题完整、所有页内与跨页链接目标存在、每个图层自有方法均有运行示例覆盖、TypeDoc 同步检查通过，并且不产生 WindLayer 文档页面。
