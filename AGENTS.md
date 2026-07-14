# 仓库指南

## 项目结构与模块组织

本仓库是基于 OpenLayers 的 TypeScript 地图能力库。源码位于 `src/`：`Earth.ts`、`useEarth.ts` 和 `index.ts` 是核心入口；`src/base` 放置通用图层类；`src/components` 放置绘制、测量、标牌、右键菜单、Transform 等功能组件；`src/common` 放置共享工具；`src/extends` 放置 OpenLayers 扩展；`src/interface` 放置公共类型定义。样式和图片位于 `src/assets`。单元测试位于 `test/**/*.test.ts`，本地示例与测试夹具位于 `.test/`。TypeDoc 生成文档输出到 `docs/`，构建产物输出到 `dist/`。

## 构建、测试与开发命令

- `npm install`：安装本地开发依赖。
- `npm run dev`：启动 Vite 开发服务器。
- `npm test`：运行一次 Vitest，匹配 `test/**/*.test.ts`。
- `npm run test:watch`：以监听模式运行 Vitest。
- `npm run typecheck`：执行 `tsc --noEmit` 类型检查。
- `npm run lint`：检查 `src/**/*.ts` 与 `test/**/*.ts`。
- `npm run format:check`：检查 Prettier 格式。
- `npm run build`：清理 `dist/`，生成 Rollup 包和类型声明。
- `npm run verify`：依次执行类型检查、lint、测试和构建，提交前优先运行。
- `npm run doc`：重新生成 `docs/` 下的 TypeDoc Markdown 文档。

## 编码风格与命名约定

使用 TypeScript，并保持 `strict` 兼容。格式遵循 Prettier：2 空格缩进、单引号、分号、无尾随逗号、`printWidth` 为 160。类和主要功能模块使用 PascalCase，例如 `PointLayer`、`TransformInteraction`；函数、变量和方法使用 camelCase；枚举和类型名沿用现有领域命名，例如 `DrawType`。导出 API 应优先提供清晰的类型或接口。

## 协作与输出语言

与用户交流时始终使用简体中文。所有计划、进度、总结和错误说明均使用简体中文；代码、变量名、类名、函数名和 API 名称保持英文。用户未特别指定时，Commit Message 使用中文。

## 测试规范

测试框架为 Vitest，运行环境为 Node。新增测试文件命名为 `test/<Feature>.test.ts`，保持与 `BaseLifecycle.test.ts`、`TransformGeometry.test.ts` 等现有风格一致。修改几何变换、图层生命周期、绘制交互或共享工具时，应补充覆盖正常路径和边界场景。开发中运行 `npm test`，提交前运行 `npm run verify`。

## 文档同步

修改公开 API、行为、参数或示例时，必须同步更新 `website/` 中对应的用户文档和可运行示例；文档风格遵循已配置完成的 `PointLayer 点图层` 页面。文档正文、示例说明和 API 表格需遵守 `website/AGENTS.md` 的页内链接规范，并在提交前运行 `npm run docs:build`。

## 提交与 Pull Request 规范

提交信息使用简短的中文祈使句或带英文类型前缀的 conventional commit 风格，例如 `修复测量会话清理`、`refactor: 重构图层生命周期`。除非用户特别要求，Commit Message 使用中文。提交应聚焦单一变更，并说明行为变化。Pull Request 应包含变更摘要、已执行的测试、关联 issue；涉及地图交互或视觉效果时，补充截图、录屏或演示说明。

## 安全与配置提示

除发布准备外，不要提交生成的 `dist/` 变更。大型本地夹具建议放在 `.test/data`。不要在源码、测试或文档中写入私有地图服务 token、账号密钥或内部服务地址。
