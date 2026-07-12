# 移除 ContextMenu 废弃 `destory` 方法

## 目标

从 ContextMenu 公共 API 中移除拼写错误且已废弃的 `destory()`，保留正式的 `destroy()`，并同步清理文档中的废弃方法说明。

## 变更范围

- 删除 `src/components/ContextMenu.ts` 中的 `destory()` 兼容方法及其废弃注释。
- 保留 `destroy()` 的实现、API 文档和所有示例清理流程。
- 删除 ContextMenu“菜单移除与清理”页面 API 表中的 `destory` 行。
- 不修改 ContextMenu 的菜单移除、关闭、状态清理或销毁行为。

## 测试与验证

- 先增加回归测试，要求 ContextMenu 源码和相关文档不再出现 `destory`，并确认 `destroy()` 仍被文档覆盖。
- 运行 ContextMenu 与文档基础设施测试。
- 运行类型检查、Lint、目标文件格式检查和 `npm run docs:build`。

## 完成标准

- TypeScript 用户无法再调用 `ContextMenu.destory()`。
- ContextMenu 文档不再展示废弃的拼写错误方法。
- 正式的 `destroy()` 及现有卸载示例保持有效。
