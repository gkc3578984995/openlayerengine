# GlobalEvent 子页面信息架构设计

## 背景

`GlobalEvent` 当前在单页中维护构造说明、3 个类型和 58 个公开方法。继续在同一页面补充示例会使页面过长，也会让事件注册、底层监听控制、状态检查和资源清理等不同语义混在一起。

本次将 `GlobalEvent 全局事件` 调整为左侧导航中的可展开父菜单，并按用户使用场景拆分子页面。拆分只改变文档组织，不修改 `GlobalEvent` 公共 API 或运行时行为。

## 信息架构

左侧“地图交互”导航中的 `GlobalEvent 全局事件` 成为可折叠父菜单。进入任意 GlobalEvent 路由时自动展开，子页面为：

1. `概览与初始化`：`/components/global-event`
2. `全局鼠标事件`：`/components/global-event/global-mouse`
3. `模块要素事件`：`/components/global-event/module-events`
4. `键盘事件`：`/components/global-event/keyboard`
5. `监听控制`：`/components/global-event/listener-control`

父菜单负责展开和收起；`概览与初始化` 保留现有 `/components/global-event` 地址，使外部链接和历史书签继续有效。布局顶部标题和页面眉标题根据当前子页面显示，眉标题统一使用父级菜单名称 `GlobalEvent 全局事件`。

导航数据结构增加可选 `children`，实现为可复用的通用嵌套导航能力，不写死 GlobalEvent。父菜单及其子页面命中当前路由时均具有明确的激活状态。

## 页面职责与 API 归属

### 概览与初始化

- 展示显著构造器 `new GlobalEvent(earth)`，参数为 `earth: Earth`。
- 说明类可以直接实例化，但推荐 `earth.useGlobalEvent()`，因为 Earth 会缓存统一实例并管理其生命周期。
- 维护归属类型：`ModuleEventCallbackParams`、`ModuleEventCallback`、`GlobalEventCallback`。
- 保留 `#api-methods` 锚点作为方法分类索引，链接到四个方法子页面，保证 Earth 实例方法页现有深链接有效。
- 不再放置包含全部 58 个方法的长表格。

### 全局鼠标事件

- 归属 6 个 `addMouse*EventByGlobal` 方法。
- 归属 4 个一次性或可取消一次性全局鼠标方法。
- 归属 6 个 `hasGlobalMouse*Event` 方法。
- 说明注册方法会自动启用对应监听；返回的注销函数用于移除单个回调。
- 提供“全局鼠标事件”运行示例，覆盖移动、点击、状态检查和卸载清理。

### 模块要素事件

- 归属 6 个 `addMouse*EventByModule` 方法。
- 归属 6 个 `hasModuleMouse*Event` 方法。
- 归属 `removeModuleEvent` 和 `removeAllModuleEvents`。
- 说明要素 `module` 属性的匹配规则，以及单类清理、整模块清理与注销函数的区别。
- 提供“模块要素事件”运行示例，覆盖模块点、单击、双击、状态检查和整模块清理。

### 键盘事件

- 归属 `addKeyDownEventByGlobal`、`enableGlobalKeyDownEvent`、`disableGlobalKeyDownEvent` 和 `hasGlobalKeyDownEvent`。
- 说明键盘监听挂载于 `document`，以及卸载页面前的注销要求。
- 提供“键盘事件”运行示例，允许注册、检查并取消键盘事件。

### 监听控制

- 归属 12 个全局/模块鼠标 `enable*` 方法和 12 个全局/模块鼠标 `disable*` 方法。
- 定位为高级用法；常规使用优先调用会自动启用监听的 `add*` 方法。
- 明确 `disable*` 会停用底层监听并清空该类别已注册回调，不等同于可恢复的暂停。
- 提供“监听启停与清理”运行示例，展示启用状态、停用后重新注册和销毁清理。

每个公开方法只能在一个归属页面中定义 API 表格。跨页面引用链接到真实归属页面的 `#api-methods` 或更具体锚点，不重复维护方法定义。

## 示例与资源清理

四个场景页面分别使用独立 Vue 示例组件。每个 `ExampleBlock` 的运行预览与展示源码引用同一个组件，并在右侧目录显示同名稳定锚点。

所有地图示例通过 `createConfiguredLayer` 获取底图，不硬编码瓦片地址。组件卸载时依次：

1. 执行注册方法返回的注销函数或取消一次性事件。
2. 清理模块/监听状态中需要显式处理的资源。
3. 调用 `earth.destroy()`。

## 文档规则更新

`website/AGENTS.md` 增加以下要求：

- 对外导出且可公开实例化的工具类必须展示构造器，并置于类型定义和方法之前。
- Earth 提供对应 `use*` 缓存访问器时，仍展示构造器，但正文与示例优先推荐 `use*`。
- 方法数量较多且成组对称时，应按行为族拆分子页面或示例；每个方法只能有一个文档归属页。
- 子页面之间的类型和方法引用必须链接到归属锚点。
- `disable*`、注销函数和 `remove*` 存在不同清理语义时，文档必须明确区分。

## 验证

- 自动化测试校验嵌套导航、五个路由、布局标题和旧深链接。
- 从 `src/components/GlobalEvent.ts` 提取公开方法，校验 58 个方法在所有 GlobalEvent 页面中恰好归属一次。
- 校验构造器位于类型和方法索引之前，三个归属类型只在概览页定义。
- 校验四个示例的源码/预览一致、右侧锚点、地图源和清理顺序。
- 执行目标测试、类型检查、文档构建、格式与差异检查。

## 非目标

- 不修改 `GlobalEvent` 运行时代码和公共签名。
- 不为每个同构鼠标事件创建单独页面或重复示例。
- 不增加“其他”杂项页面；新增能力必须归入明确行为族，必要时再新增独立子页。
