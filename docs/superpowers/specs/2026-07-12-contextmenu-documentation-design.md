# ContextMenu 文档结构设计

## 目标

将 `ContextMenu 右键菜单` 从单页说明调整为与 `GlobalEvent 地图事件` 一致的父级导航和子页面结构。每项公开能力必须有明确的规范归属、可运行示例和可定位的页内锚点。

## 导航与页面职责

`ContextMenu 右键菜单` 保留为左侧父级入口，包含以下六个子页面，顺序固定：

1. `概览与初始化`：`useContextMenu`、构造器、公共类型、最小生命周期。
2. `全局菜单`：`addDefaultMenu` 和全局菜单回调。
3. `模块菜单`：`addModuleMenu`、模块菜单守卫和模块菜单回调。
4. `级联菜单`：`child` 菜单层级和 `mutexKey` 互斥规则。
5. `菜单状态`：默认/模块菜单项可见状态与主题切换。
6. `菜单移除与清理`：菜单移除、模块要素状态清理、关闭和销毁。

## 示例边界

共 13 个 `ExampleBlock`，每个示例使用独立 Vue 组件且同一组件同时作为预览与源码：

| 页面 | 示例 |
| --- | --- |
| 概览与初始化 | 最小完整生命周期 |
| 全局菜单 | 添加全局菜单；全局菜单点击回调 |
| 模块菜单 | 添加模块菜单；模块菜单守卫；模块菜单点击回调 |
| 级联菜单 | 多级子菜单；互斥菜单项 |
| 菜单状态 | 菜单项显示与隐藏；菜单项状态切换；菜单主题切换 |
| 菜单移除与清理 | 移除全局菜单；移除模块菜单与清理要素状态 |

所有含地图的示例均通过 `createConfiguredLayer` 创建底图；示例在卸载时清理 `ContextMenu`，再销毁 `Earth`。

## API 归属

公共类型只在概览页定义：`IContextMenuOption`、`IContextMenuItem`、`IContextMenuCallbackParam`、`ContextMenuCallback` 和 `ContextMenuBefore`。

| 页面 | 公开方法 |
| --- | --- |
| 全局菜单 | `addDefaultMenu` |
| 模块菜单 | `addModuleMenu` |
| 菜单状态 | `getDefaultMenuState`、`setDefaultMenuState`、`toggleDefaultMenuState`、`getModuleMenuState`、`setModuleMenuState`、`toggleModuleMenuState`、`setTheme`、`toggleTheme` |
| 菜单移除与清理 | `removeDefaultMenu`、`removeModuleMenu`、`clearModuleMenuState`、`close`、`remove`、`destroy`、`destory` |

`destory` 仅在 API 表中以废弃标记保留，并引导使用 `destroy`。跨页引用链接到对应页面的 API 分组锚点，不重复定义方法或类型。

## 锚点规则

页面使用 `overview`、`examples`、`api` 与 `tips` 一级锚点；每个示例使用稳定的 `example-*` 锚点，并在右侧 `PageAnchor` 中以同名子项显示。构造器使用 `api-constructor` 和 `api-constructor__signature`。类型的独立锚点为 `api-type-*`；属性与类型引用采用中性可点击代码样式，方法引用采用 `code-fn`。

级联菜单页不重复维护类型定义：它的配置规则段落仅链接回概览页的 `IContextMenuItem` 锚点。

## 验证

扩展 `InteractionDocs.test.ts`，验证六条路由、导航、布局标题、13 个示例锚点与 17 个公开方法的唯一归属；同时运行 `npm test`、`npm run typecheck`、`npm run lint` 和 `npm run docs:build`。
