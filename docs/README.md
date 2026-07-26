# 设计文档索引

`docs/superpowers/` 保存 2.0 的设计决策、实施计划和历史证据，不是 TypeDoc 或网站构建产物。TypeDoc 输出位于 `website/public/api/`，网站生成数据位于 `website/src/generated/`。

## 现行设计

以下已批准文档共同构成当前 2.0 实现约束：

- [Element Kernel 架构总纲](superpowers/specs/2026-07-13-v2-element-kernel-architecture-design.md)
- [坐标转换与圆半径单位](superpowers/specs/2026-07-16-v2-coordinate-conversion-and-circle-radius-design.md)
- [Draw / Edit / Transform 交互视觉](superpowers/specs/2026-07-16-v2-interaction-visual-design.md)
- [动画效果内核](superpowers/specs/2026-07-17-v2-animation-effect-kernel-design.md)
- [路径线饰与样式工厂](superpowers/specs/2026-07-17-v2-linework-style-factory-design.md)
- [Element 几何详情](superpowers/specs/2026-07-21-v2-element-geometry-details-design.md)
- [Element 协同保护](superpowers/specs/2026-07-22-v2-element-protection-design.md)
- [地图打印](superpowers/specs/2026-07-23-v2-map-printing-design.md)
- [Callout 文本标注框](superpowers/specs/2026-07-26-v2-callout-shape-design.md)
- [路径线饰工厂衬色](superpowers/specs/2026-07-26-v2-linework-factory-casing-design.md)

修改对应能力前，应先阅读架构总纲和相关补充设计。补充设计只覆盖明确修订的条款，其余约束继续有效。

## 待确认设计

- [Polygon 多环与洞](superpowers/specs/2026-07-18-v2-polygon-inner-ring-and-hole-design.md) 当前仍标记为“待批准”。在确认其实施和批准状态前，不把它作为已批准公共契约，也不直接删除，因为后续 Linework 设计仍有引用。

## 保留的实施依据

- [2.0 架构与代码重构计划](superpowers/plans/2026-07-13-v2-architecture-code-refactor.md) 仍被能力闭环测试读取。
- [2.0 用户文档、示例与发布审计计划](superpowers/plans/2026-07-18-v2-user-documentation-and-release-audit.md) 记录文档迁移和发布审计边界。

其余 2026-07-11 至 2026-07-13 的文档站、旧 API 和一次性实施计划属于历史证据，不代表当前公共 API。旧文档中出现的 `PointLayer`、`PolygonLayer`、`GlobalEvent` 或旧 website 路径不得作为现行实现依据。

## 维护规则

- 新增或修改现行设计时，同步更新本索引和 `.gitignore` 的显式跟踪白名单。
- 被替代的文档应在文档状态中注明替代关系，不依赖文件名或 Git ignore 状态推断有效性。
- 历史文档只承担决策追踪职责；删除或迁移时应使用独立提交，并先确认没有测试或现行设计引用。
- 公开 API、用户行为和示例仍以 `website/`、TypeDoc、迁移说明和自动化测试为交付载体。
