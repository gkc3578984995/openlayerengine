# 仓库指南

## 项目结构与模块组织

本仓库是基于 OpenLayers 的 TypeScript 地图能力库。`src/index.ts`、`src/Earth.ts` 和 `src/useEarth.ts` 是公共入口；`src/core` 放置与 OpenLayers、DOM 解耦的领域内核；`src/services` 放置业务服务与会话；`src/facade` 放置公共 API 门面；`src/adapters` 放置 OpenLayers 与 DOM 适配；`src/builtins` 放置内置图形、动画和样式；`src/internal` 负责实例装配。公共样式位于 `src/assets/style`。单元测试位于 `test/**/*.test.ts`，人工验收台位于 `.test/`，用户文档位于 `website/`。TypeDoc 生成内容输出到 `website/public/api/`，构建产物输出到 `dist/`。

## 构建、测试与开发命令

- `npm install`：安装本地开发依赖。
- `npm run dev`：启动 Vite 开发服务器。
- `npm test`：运行一次 Vitest，匹配 `test/**/*.test.ts`。
- `npm run test:watch`：以监听模式运行 Vitest。
- `npm run typecheck`：执行 `tsc --noEmit` 类型检查。
- `npm run lint`：检查 `src/**/*.ts` 与 `test/**/*.ts`。
- `npm run format:check`：检查 Prettier 格式。
- `npm run build`：清理 `dist/`，生成 Rollup 包和类型声明。
- `npm run verify`：依次执行类型检查、lint、构建、API 同步和测试，提交前优先运行。
- `npm run doc`：重新生成 `website/public/api/` 下的 TypeDoc Markdown 文档。

## 编码风格与命名约定

使用 TypeScript，并保持 `strict` 兼容。格式遵循 Prettier：2 空格缩进、单引号、分号、无尾随逗号、`printWidth` 为 160。类和主要功能模块使用 PascalCase，例如 `ElementStore`、`TransformSession`；函数、变量和方法使用 camelCase；枚举和类型名沿用现有领域命名，例如 `AnimationType`。导出 API 应优先提供清晰的类型或接口。

中文注释应自然、简洁，重点说明代码无法直接表达的设计意图、业务约束和取舍，不逐字翻译实现过程，也不复述变量名、类型或语句本身。避免“用于实现……”“执行以下操作……”等模板化措辞；能从代码直接看出的内容不写注释。OpenLayers、Feature、Element、Session 等领域术语保留准确的英文写法，不为追求全中文而生硬翻译。修改既有注释时应保持原有技术含义，不借注释润色改变公共契约或运行行为。

## 2.0 系统设计规范

凡涉及 2.0 的系统设计、实现、重构或评审，必须先阅读并遵循 `docs/superpowers/specs/` 中已批准的对应设计文档；当前架构总纲为 `2026-07-13-v2-element-kernel-architecture-design.md`，Draw / Edit / Transform 的光标、预览、编辑锚点与 Tooltip 还必须遵循 `2026-07-16-v2-interaction-visual-design.md`，动画效果、帧合成和动画渲染还必须遵循 `2026-07-17-v2-animation-effect-kernel-design.md`。实现必须保持 Core、Services、Public Facade 与 OpenLayers Adapter 的依赖边界，遵守 Element 状态真源、EngineContext 显式依赖、交互互斥、资源所有权和全生命周期清理等约束，不得因局部实现便利引入重复内核、隐式全局依赖、OL 私有 API 或扩大公共导出面。若需求需要改变已批准的公共契约，必须先补充设计并获得确认，再实施代码与测试。

## 协作与输出语言

与用户交流时始终使用简体中文。所有计划、进度、总结和错误说明均使用简体中文；代码、变量名、类名、函数名和 API 名称保持英文。用户未特别指定时，Commit Message 使用中文。

## 测试规范

测试框架为 Vitest，运行环境为 Node。新增测试文件命名为 `test/<Feature>.test.ts`，保持与 `BaseLifecycle.test.ts`、`TransformGeometry.test.ts` 等现有风格一致。修改几何变换、图层生命周期、绘制交互或共享工具时，应补充覆盖正常路径和边界场景。开发中运行 `npm test`，提交前运行 `npm run verify`。

## 文档同步

修改公开 API、行为、参数或示例时，必须同步更新 `website/` 中对应的用户文档和可运行示例；文档结构与交互遵循现有 Element 页面。文档正文、示例说明和 API 表格需遵守 `website/AGENTS.md` 的页内链接规范，并在提交前运行 `npm run docs:build`。

## 提交与 Pull Request 规范

提交信息使用简短的中文祈使句或带英文类型前缀的 conventional commit 风格，例如 `修复测量会话清理`、`refactor: 重构图层生命周期`。除非用户特别要求，Commit Message 使用中文。提交应聚焦单一变更，并说明行为变化。Pull Request 应包含变更摘要、已执行的测试、关联 issue；涉及地图交互或视觉效果时，补充截图、录屏或演示说明。

## 安全与配置提示

除发布准备外，不要提交生成的 `dist/` 变更。大型本地夹具建议放在 `.test/data`。不要在源码、测试或文档中写入私有地图服务 token、账号密钥或内部服务地址。
