# GlobalEvent 地图事件文档结构实施计划

> For agentic workers: execute task-by-task in this session. Steps use checkbox syntax for tracking.

**Goal:** 将 GlobalEvent 地图事件文档重组为概览加三个事件类别页面，并让手动监听控制在各事件页面就近说明。

**Architecture:** GlobalEventView.vue 只承载概览、初始化 API 与自动管理提示；三个子页各自拥有对应公开 API 和高级底层监听控制说明。导航和布局只修改显示文案，既有路由路径保持不变。Vitest 源码断言保证方法唯一归属、锚点和交叉链接不回退。

**Tech Stack:** Vue 3、TypeScript、Vitest、Vite。

## Global Constraints

- 保持现有四个 GlobalEvent 路由 URL 不变。
- add* 日常示例通过返回的注销函数清理；disable* 只在高级段说明其批量清空语义。
- 构造器、属性、类型、方法及示例锚点遵循 website/AGENTS.md。
- 所有 GlobalEvent 公共方法在 API 表中只能归属一个子页面或概览页面。
- 不新增子流程；在当前 master 分支完成工作。
- 验收命令为 npm test -- test/InteractionDocs.test.ts、npm run verify、npm run docs:build、git diff --check。

---

### Task 1: 为新文档结构建立失败断言

**Files:**
- Modify: test/InteractionDocs.test.ts

**Interfaces:**
- Consumes: 四个 GlobalEvent 页面、navigation.ts、DocsLayout.vue、GlobalMethodsView.vue 的 UTF-8 源码。
- Produces: 结构性回归断言，后续任务必须使其通过。

- [ ] **Step 1: 写失败断言**

将 globalEventPages 的显示文本改为 全局鼠标事件、模块鼠标事件、全局键盘事件；断言导航父级是 GlobalEvent 地图事件，路径仍为现有四个路径。

断言概览 anchors 依次出现：

    overview, listener-management, examples, api, tips

并且 API 子项仅包含构造器与三项类型定义。

- [ ] **Step 2: 断言方法唯一归属和高级段**

断言概览不含 api-methods、api-listener-control、GlobalEventListenerControlDemo 或 example-advanced-listener-control。

断言全局鼠标页包含 16 个日常方法和 12 个 enable*/disable*；模块鼠标页包含 14 个日常方法和 12 个高级方法；键盘页包含 2 个日常方法和 2 个高级方法。每页都应含 api-methods、api-listener-control 和 高级：底层监听控制。

断言总共 58 个公开方法恰好各出现一行。

- [ ] **Step 3: 断言自动管理语义和深链接**

加入以下语义预期：

    overview 含 add* 会自动启用对应的底层监听
    overview 含 disable* 会停止对应底层监听并清空该类别的全部回调
    useGlobalEvent 方法名链接到 /components/global-event#api-constructor
    GlobalEvent 返回类型链接到 /components/global-event#api-constructor

- [ ] **Step 4: 运行失败测试**

Run: npm test -- test/InteractionDocs.test.ts

Expected: FAIL；失败原因是新文案、锚点和方法归属尚未实现，而不是 TypeScript 或测试语法错误。

### Task 2: 重组概览与三个事件页面

**Files:**
- Modify: website/src/views/GlobalEventView.vue
- Modify: website/src/views/GlobalEventGlobalMouseView.vue
- Modify: website/src/views/GlobalEventModuleEventsView.vue
- Modify: website/src/views/GlobalEventKeyboardView.vue
- Delete: website/src/examples/GlobalEventListenerControlDemo.vue

**Interfaces:**
- Consumes: src/components/GlobalEvent.ts 的 58 个公共方法和现有可运行示例。
- Produces: 以事件类别为唯一 API 归属的四个页面。

- [ ] **Step 1: 简化概览**

删除独立手动控制示例相关 import、raw source、数组、API 表和 ExampleBlock。anchors 替换为：

    概述
    重要提示：监听自动管理
    代码演示 / 最小完整生命周期
    API / 构造器 / 类型定义
    注意事项

在概述后加入极简代码块：注册 addMouseClickEventByGlobal、保存 dispose、调用 dispose()。文字必须区分单次注销、模块 remove* 和会清空整类回调的 disable*。将唯一运行示例段放在 API 前。

- [ ] **Step 2: 在子页归属高级 API**

三个子页各维护 日常注册与状态 和 高级：底层监听控制 两个 API 标题。高级标题使用 api-listener-control；日常表使用 api-methods。

全局鼠标：所有全局鼠标 enable*/disable*。
模块鼠标：所有模块鼠标 enable*/disable*。
全局键盘：enableGlobalKeyDownEvent 与 disableGlobalKeyDownEvent。

每个高级段提供该类别的短代码块，明确 disable* 会清空此类别的全部回调，不把该代码块包装为 ExampleBlock。

- [ ] **Step 3: 删除废弃示例**

Run: Remove-Item -LiteralPath website/src/examples/GlobalEventListenerControlDemo.vue

Expected: 文件被删除，任何页面均不再导入或引用该组件。

- [ ] **Step 4: 运行测试转绿**

Run: npm test -- test/InteractionDocs.test.ts

Expected: PASS。

### Task 3: 同步导航、Earth 深链接和维护规则

**Files:**
- Modify: website/src/config/navigation.ts
- Modify: website/src/layouts/DocsLayout.vue
- Modify: website/src/views/GlobalMethodsView.vue
- Modify: website/AGENTS.md
- Modify: test/InteractionDocs.test.ts

**Interfaces:**
- Consumes: Task 2 生成的页面标题与真实锚点。
- Produces: 仍保持有效的路由、布局标题和跨页链接规则。

- [ ] **Step 1: 更新导航与布局标题**

父级改为 GlobalEvent 地图事件；子级改为 全局鼠标事件、模块鼠标事件、全局键盘事件。同步 DocsLayout.vue 的标题映射。不得修改既有 URL。

- [ ] **Step 2: 更新 Earth 实例深链接**

在 GlobalMethodsView.vue 把 useGlobalEvent 的方法名和 GlobalEvent 返回类型改为：

    /components/global-event#api-constructor

其他三个工具保持各自真实的 #api-methods 锚点。

- [ ] **Step 3: 更新维护规则**

修改 website/AGENTS.md：工具方法与返回类型应链接到工具页的规范入口；有方法表时使用 #api-methods，概览只含构造器和类型定义时使用 #api-constructor。

增加规则：概览用重要提示说明 add* 自动管理与返回注销函数；enable*/disable* 只在相应事件页的高级段维护；不保留脱离事件类别的独立手动监听运行示例。

- [ ] **Step 4: 运行定向验证**

Run:
    npm test -- test/InteractionDocs.test.ts
    npm run docs:build

Expected: 两个命令均以退出码 0 结束。

### Task 4: 全量验证、提交和通知

**Files:**
- Modify: 本计划涉及的已修改文件

**Interfaces:**
- Consumes: 已通过的定向测试。
- Produces: 已验证并提交的文档重组。

- [ ] **Step 1: 全量验证**

Run:
    npm run verify
    git diff --check
    git status --short

Expected: npm run verify 退出码 0；git diff --check 无输出；状态只包含本任务的预期文件。

- [ ] **Step 2: 提交**

Run:
    git add website/src/views website/src/config/navigation.ts website/src/layouts/DocsLayout.vue website/src/examples/GlobalEventListenerControlDemo.vue website/AGENTS.md test/InteractionDocs.test.ts
    git commit -m "docs: reorganize GlobalEvent pages"

- [ ] **Step 3: 播放完成通知**

Run:
    Add-Type -AssemblyName System.Speech
    $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $speaker.Speak('Global Event 地图事件文档已更新并验证通过。')
    $speaker.Dispose()

