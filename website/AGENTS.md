# 文档站维护规则

## API 引用与跳转

文档正文、示例说明和 API 表格中，只要引用的公开方法、属性或类型在当前页面存在对应锚点，就必须提供页内跳转链接；自动生成的类型文本也必须保留这些链接。

API 表格中的构造器、属性名和方法名使用固定视觉层级：

- 构造器必须使用 `api-constructor` 容器和 `api-constructor__signature` 签名样式，作为 API 区域最明显的入口。
- 属性名列必须声明 `presentation: 'property'`，由 `api-table__property` 显示为浅灰色。
- 方法名列必须声明 `presentation: 'method'`，由 `api-table__method` 显示为浅灰背景的深灰代码块；即使方法名包含可点击锚点，也不得使用蓝色的 API 表格样式。
- 正文和示例说明中的可点击方法引用继续使用蓝色 `code-fn` 样式，用于与 API 定义表区分。

- 属性和类型引用使用默认的中性代码样式：`<code><a href="#api-property">propertyOrType</a></code>`。
- 这两类引用不得使用相同视觉样式；方法代表可调用行为，属性/类型代表配置或数据结构。
- 链接目标必须是当前页面真实存在的锚点。新增或改名锚点时，同步更新示例说明、API 表格和自动类型链接映射。

## 示例要求

示例说明中的 API 名称应链接到其对应文档；运行示例与展示源码必须引用同一份 Vue 示例组件，避免文档代码与实际行为漂移。

## 运行时地图源

所有含底图的运行示例必须通过 `website/src/config/mapSources.ts` 的 `createConfiguredLayer` 创建图层，禁止在 `website/src/examples` 中直接写入瓦片服务 URL。部署人员通过构建产物根目录的 `map-sources.json` 替换矢量或卫星 XYZ 地址；新增配置字段、底图示例或地图源行为时，必须同步更新该 JSON 示例和“地图创建与销毁”页面说明。默认配置、示例和文档不得包含私有 token、账号或内网地址。
