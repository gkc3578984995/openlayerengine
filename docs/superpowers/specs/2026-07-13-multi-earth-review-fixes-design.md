# 多 Earth 隔离审查问题修复设计

## 背景与目标

2.0 多实例改造已经让 `useEarth()`、命名实例、图层和主要组件按具体 `Earth` 工作，但最终独立审查发现两处仍依赖页面级 DOM 状态的行为：`Transform` 通过全局选择器查找工具栏，`Earth` 通过 `document` 统一屏蔽浏览器右键菜单。并存地图因此可能互相影响生命周期或事件处理。

本次修复只解决这两处多实例隔离缺口，并修正文档中的实例 ID 表述；不拆分或重构 `Transform` 的业务实现，不增加新的外部公共 API。

## 设计决策

### Earth 右键菜单边界

每个 `Earth` 在自己的 `map.getViewport()` 上注册实例专属的 `contextmenu` 监听，销毁时从同一个 viewport 移除。

- 监听器只调用 `event.preventDefault()`，不调用 `stopPropagation()` 或 `stopImmediatePropagation()`。
- 浏览器默认右键菜单在任意地图区域内都不会出现。
- `ContextMenu`、`GlobalEvent` 和 `Transform` 等封装能力仍能接收同一事件并展示库内菜单。
- 一个 Earth 的销毁只清理自己的监听，不影响其他仍活动的地图。
- 页面非地图区域保留宿主应用原有的浏览器右键行为，外部依赖包不接管整个 `document`。

`closeRightMenu` 使用实例级稳定回调，确保注册和注销使用同一个函数引用，并避免多个实例共享原型方法引用所带来的生命周期歧义。

### Transform 工具栏事件绑定

`Toolbar` 提供仅供内部协作使用的实例根元素访问能力。`Transform` 创建工具栏后直接取得该实例的根元素，并在该元素上注册 `toolbar:itementer`、`toolbar:itemleave` 和 `toolbar:itemclick` 监听。

- 删除 `document.querySelector('.ol-toolbar')`，不再依赖 DOM 顺序或全局 class 唯一性。
- 每个 Transform 只响应自己工具栏派发的事件。
- 工具栏销毁或重建时，旧根元素连同其监听一起移除，不引入 document 级清理状态。
- 该能力不从 2.0 包入口导出，不增加外部用户学习成本。

不采用把回调继续挂到 `document` 后按 target 过滤的方案，因为它仍需要全局注册表；也不把 Transform 回调塞入 Toolbar 构造参数，以免把业务操作反向耦合进通用工具栏配置。

### 文档表述

“地图创建与销毁”页面改为明确区分：

- 同时存在的命名注册实例使用不同的 `id`。
- 默认实例和直接调用 `new Earth()` 的实例不要求提供注册 ID。
- 所有并存地图必须绑定不同的 DOM 容器。

本次只修改现有说明，不新增页面或 API 锚点。

## 测试设计

测试先于实现添加，并证明旧实现失败：

1. 创建两个独立 viewport，验证两个 Earth 都只在自己的 viewport 屏蔽浏览器默认右键菜单。
2. 销毁其中一个 Earth 后，另一个 viewport 的屏蔽仍有效；被销毁实例的 viewport 不再由该实例处理。
3. 验证监听器没有注册到 `document`，页面非地图区域不受影响。
4. 创建两个独立工具栏根元素，验证每个 Transform 的 enter、leave、click 行为只响应自己的工具栏事件。
5. 对源码增加回归约束，禁止 Transform 再次使用全局 `.ol-toolbar` 查询。
6. 文档测试验证命名实例 ID 与不同 DOM 容器的准确表述。

目标测试完成后运行相关 Vitest 文件，再运行 `npm run verify`、`npm run docs:build`、`git diff --check`，并执行一次独立只读代码审查。

## 非目标

- 不拆分 `Transform` 类或重写几何变换、历史记录、工具栏业务流程。
- 不改变 `useEarth`、`destroyEarth` 或 `Earth` 构造函数的公开签名。
- 不让依赖包屏蔽地图之外的浏览器右键菜单。
- 不新增 document 级引用计数或全局 viewport 注册表。

## 完成标准

- 单地图和多地图中，地图区域均不会出现浏览器默认右键菜单，封装右键菜单仍可接收事件。
- 销毁任意 Earth 不影响其他 Earth 的右键事件生命周期。
- 两个同时存在的 Transform 不会交叉响应工具栏事件。
- 文档准确描述默认实例、命名实例、直接构造实例和 DOM 容器之间的关系。
- 全量代码、测试、构建和文档质量门禁通过。
