# GlobalEvent 生命周期与示例重构设计

## 目标

重组 `GlobalEvent` 文档，使日常用法以“注册回调并调用返回的注销函数”为唯一主路径；将 `enable*` / `disable*` 降为概览页内的高级底层监听控制；以七个彼此独立的运行示例覆盖持续事件、一次性事件、模块回调、模块清理和键盘生命周期。

本次仅调整网站文档、运行示例和测试，不修改 `src/components/GlobalEvent.ts` 的公共 API 或运行时逻辑。

## API 语义

### 日常注册与销毁

所有返回 `() => void` 的 `add*` 注册方法均负责调用相应的 `enable*`。调用返回的注销函数会移除本次回调；当该类全局或模块回调已无剩余注册时，库会自动停用对应底层监听。

日常示例统一采用：

```ts
const dispose = events.addMouseClickEventByGlobal(callback);

// 不再需要时
dispose();
```

一次性事件中，`addMouseOnce*` 不返回取消函数；需要在触发前主动取消时，使用 `addCancelableMouseOnce*` 并调用其返回值。

### 高级底层监听控制

`enable*` / `disable*` 仍完整公开，但只用于需要直接管理底层监听的高级场景。文档必须明确：

- 常规业务不需要先调用 `enable*`，随后再调用 `add*`。
- `disable*` 会停用该类别的底层监听并清空该类别全部已注册回调，不能替代某个 `add*` 返回的注销函数。
- 需要释放单次注册时优先调用对应注销函数；需要按模块清理时使用 `removeModuleEvent` 或 `removeAllModuleEvents`。

## 页面与导航

保留以下左侧子页面：

1. `概览与初始化`：`/components/global-event`
2. `全局鼠标事件`：`/components/global-event/global-mouse`
3. `模块要素事件`：`/components/global-event/module-events`
4. `键盘事件`：`/components/global-event/keyboard`

移除独立的 `监听控制` 左侧子页面、路由和视图。全部 26 个 `enable*` / `disable*` 方法（含全局键盘）迁移到“概览与初始化”页的 `高级：底层监听控制`章节。概览原有 `#api-methods` 保持为方法分类索引，以兼容 Earth 实例方法页的既有深链接；高级章节使用独立 `#api-listener-control` 锚点。

三种归属类型仍只定义在概览页。58 个公开方法仍在四个页面中恰好归属一次：全局鼠标 16 个、模块要素 14 个、键盘 2 个、概览高级监听控制 26 个。

## 七个运行示例

| 页面 | 示例标题 | 目的 | 核心 API |
| --- | --- | --- | --- |
| 概览与初始化 | 最小完整生命周期 | 展示 `add*` 自动启用、保存并调用注销函数 | `addMouseClickEventByGlobal`、返回值 |
| 概览与初始化 | 高级：手动监听控制 | 对比底层启停与日常注册，强调不作为常规路径 | `enableGlobalMouseClickEvent`、`disableGlobalMouseClickEvent` |
| 全局鼠标事件 | 持续全局事件 | 展示移动、点击和多个独立注销函数 | `addMouseMoveEventByGlobal`、`addMouseClickEventByGlobal` |
| 全局鼠标事件 | 一次性事件与取消 | 展示可取消的一次性左键、右键监听 | `addCancelableMouseOnceClickEventByGlobal`、`addCancelableMouseOnceRightClickEventByGlobal` |
| 模块要素事件 | 模块回调生命周期 | 对同一模块注册点击、双击，并通过各自注销函数释放 | `addMouseClickEventByModule`、`addMouseDblClickEventByModule` |
| 模块要素事件 | 模块事件清理范围 | 明确单次注销、单类清理、整模块清理的范围 | 返回值、`removeModuleEvent`、`removeAllModuleEvents` |
| 键盘事件 | 键盘事件生命周期 | 展示注册、状态检查和注销 | `addKeyDownEventByGlobal`、`hasGlobalKeyDownEvent`、返回值 |

每个 `ExampleBlock` 必须有独立稳定 `example-*` 锚点、右侧同名目录项，且预览组件和 `?raw` 源码来自同一 Vue 文件。所有含地图示例通过 `createConfiguredLayer` 创建底图，且在 `onBeforeUnmount` 中先执行所有注销/取消函数，再 `earth.destroy()`。

## 文档表达

- 概览开头以日常最小生命周期为优先入口，构造器、`earth.useGlobalEvent()` 的缓存与生命周期优势说明保持不变。
- “高级：底层监听控制”在方法表前给出醒目的警示：无需为 `add*` 预先调用 `enable*`；`disable*` 会批量清空回调。
- 所有 `add*` 示例说明必须表明“自动启用 + 返回注销函数”的完整路径；一次性事件说明可取消版本的差异。
- 模块页面继续区分注销函数、`removeModuleEvent` 与 `removeAllModuleEvents`，并说明匹配依据为命中要素的 `module` 属性。
- `website/AGENTS.md` 增加工具文档的日常生命周期规则：优先演示返回注销函数的高层注册 API；底层批量控制仅在高级章节说明其破坏性范围。

## 验证

- 测试验证左侧只保留四个 GlobalEvent 子页面，旧监听控制路由、导航项和视图引用不存在。
- 从 `GlobalEvent.ts` 提取 58 个公开方法，验证四页唯一归属和 24 个高级监听方法迁入概览页。
- 验证七个 ExampleBlock 的稳定锚点、右侧目录、预览/raw 同源、配置地图源、注销先于 Earth 销毁。
- 验证日常示例不调用 `enable*` / `disable*`，高级示例与说明明确其批量清空语义。
- 执行目标文档测试、完整 `npm run verify`、`npm run docs:build`、Prettier 和 `git diff --check`。
