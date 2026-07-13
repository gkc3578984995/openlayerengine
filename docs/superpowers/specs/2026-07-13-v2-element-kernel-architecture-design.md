# 2.0 Element Kernel 架构设计

## 文档状态

- 状态：设计已批准，待用户书面规格终审
- 日期：2026-07-13
- 目标版本：@vrsim/earth-engine-ol 2.0.0
- OpenLayers 基线：10.9.0
- 取代：2026-07-13-v2-public-api-design.md

本文是 2.0 架构、公共能力和实施边界的唯一设计依据。被取代的旧规格中关于兼容旧构造器、公开功能子路径、独立 Plot 入口以及继续打包 ol-wind 的内容不再有效。

## 1. 背景与目标

当前库已经具备地图实例、基础图层、绘制、Plot、测量、Transform、动画、Overlay、Descriptor、事件和右键菜单等能力，但存在以下结构性问题：

- Base 同时承担图层、Feature 生命周期、样式构造、样式反向解析和参数同步，职责过重。
- 业务参数、OpenLayers Geometry、Feature 和 Style 之间存在双向同步，依赖 OpenLayers 私有字段。
- 几何类型与图层类型绑定，扩展大量自定义图形时需要增加重复图层类和分支。
- Point、Polyline 和 FlightLine 各自维护动画监听或渲染循环，缺少统一生命周期。
- Plot 与 Draw 实质属于同一绘制领域，却维护独立入口和编辑路径。
- 业务模块、图层分组和几何类型混用，难以按模块批量操作元素。
- OpenLayers 7 到 10 的类型、事件、样式空值和渲染 API 已发生变化。

2.0 采用一次完整的主版本重构，不保留 1.x API 兼容层，但必须保留除 Wind 外的现有功能与视觉能力。主要目标如下：

- 以 Element 作为唯一业务对象和状态真源。
- 将 OpenLayers 限制在适配器边界。
- 通过统一服务管理样式、动画、绘制、编辑、变换、测量和输入交互。
- 解耦图形类型、业务模块和渲染图层。
- 保留 useEarth 的低学习成本，同时让内部依赖全部显式化。
- 为更多自定义图形、基础图层和未来 OpenLayers 大版本升级建立稳定边界。
- 让 npm pack 产物没有普通运行依赖，并可在无网络、未预装 OL 的环境中独立完成安装。
- 以能力对等矩阵、自动化测试和可运行文档示例作为 2.0 发布门槛。

## 2. 明确不做的事项

- 不提供 1.x 公共 API 兼容适配器。
- 不保留 WindLayer、ol-wind 或 wind-core。
- 不再公开 Base 及 PointLayer、BillboardLayer、PolylineLayer 等按几何类型划分的图层类。
- 不提供独立 Plot 公共入口。
- 不从 OpenLayers Style 或 Geometry 反向恢复业务参数。
- nativeStyle 不参与对外序列化或 StyleSpec 属性动画，也不承诺跨 OpenLayers 主版本兼容。
- 2.0 暂不开放公共 ShapeDefinition 注册接口；注册表先服务于内置图形，后续版本可在契约稳定后开放。
- 动画运行状态不进入 Element 快照、复制结果或持久化数据。

## 3. 总体架构

Earth 是每个地图实例的公共门面和所有服务的生命周期根节点。

    Earth
    ├─ Core
    │  ├─ ElementStore
    │  ├─ LayerManager
    │  ├─ ShapeRegistry
    │  └─ Transaction / Snapshot
    ├─ Services
    │  ├─ StyleService
    │  ├─ AnimationManager
    │  ├─ DrawService
    │  ├─ TransformService
    │  ├─ MeasureService
    │  ├─ EventService
    │  ├─ ContextMenuService
    │  └─ OverlayService
    ├─ InteractionCoordinator
    └─ OpenLayers Adapter
       ├─ FeatureBinding
       ├─ GeometryCodec
       ├─ StyleCompiler
       ├─ LayerRenderPass
       └─ InteractionAdapter

依赖规则：

- Core 的状态、事务和能力协议不导入任何 OpenLayers 类型或运行时代码。
- Services 依赖 Core 定义的 Element、Selector、Session 和能力协议，不直接依赖 OL 私有实现。
- OpenLayers Adapter 是 Core 状态与 OL Map、Layer、Feature、Geometry、Style、Overlay、Interaction 之间的唯一转换边界。
- Public Facade 可以为高级逃生口暴露 OL 公共类型，但必须先转换成 Core 可识别的不透明引用；OL 对象不得进入 Core 状态协议。
- Earth 创建并显式传递 EngineContext。深层模块不得调用 useEarth 或读取隐式全局实例。
- 内置图形、样式预设和动画定义位于 builtins，公共服务不通过类型分支硬编码它们。

建议源码结构：

    src/core/element
    src/core/layer
    src/core/shape
    src/core/transaction
    src/services/animation
    src/services/draw
    src/services/transform
    src/services/measure
    src/services/events
    src/services/overlay
    src/adapters/openlayers
    src/builtins/shapes
    src/builtins/styles
    src/builtins/animations
    src/entries

每个目录只对一个清晰职责负责。内部文件变更不得直接扩大公共导出面。

## 4. Earth 与 useEarth

标准使用方式继续是：

    const earth = useEarth();
    const planning = useEarth('planning');

公共重载固定为：

    useEarth(): Earth
    useEarth(id: string): Earth
    useEarth(options: UseEarthOptions): Earth

UseEarthOptions 包含可选 id、target、view 和 controls。没有 id 时选择默认键；没有 target 时，默认实例使用 olContainer，命名实例使用 id 作为首次创建的默认 target。

useEarth 遵循“没有就创建，有就返回”：

- useEarth() 选择默认键。
- useEarth(id) 选择命名键。
- 对应实例不存在或已销毁时创建新实例。
- 对应实例仍然活动时返回同一引用。
- 首次创建可通过 options overload 提供 target、view 和 controls 配置。
- 后续调用不得用新配置隐式重建已有实例；开发环境可以报告明显的配置冲突。
- 不增加 createEarth 或 getEarth，避免为同一语义制造多个入口。
- Earth 公共构造函数作为高级入口保留，但 new Earth(options) 创建的是不进入 useEarth 注册表的调用方自管实例，即使配置内容相同也不与命名实例合并。
- 2.0 不保留 destroyEarth；注册实例和自管实例都通过各自的 earth.destroy() 销毁。

Earth 向外提供 elements、layers、styles、animations、draw、transform、measure、events、contextMenu、overlays、view 和 controls 等稳定服务。物理目录和具体实现类不等于公共 API。

## 5. Element Kernel

### 5.1 状态真源

Element 是唯一业务对象，ElementState 是可快照、可事务更新的规范状态。Core 内部保存 ElementRecord，公共 Element 是由 Earth 和 FeatureBinding 支持的门面。它至少包含：

- id：单元素身份。
- type：图形类型。
- geometry：与 OpenLayers 无关的图形状态。
- style：StyleSpec，或由 Style Adapter 管理的不透明 NativeStyleRef。
- data：业务数据。
- module：业务模块分组。
- layerId：渲染图层分组。
- visible：业务可见状态。

OpenLayers Feature 是 Element 的渲染投影，不是第二份业务状态。Feature、Geometry 或 Style 的变化不得被反向解析回 ElementState。

Element.olFeature 由公共门面的 adapter-backed getter 提供，不属于 ElementRecord、ElementState 或 Snapshot。只读表示外部不能替换该属性引用；返回的 OL Feature 本身仍然可变。直接修改 Feature 不建立业务一致性保证，可能在下一次状态投影时被覆盖，也绝不会反向写回 ElementState。持久修改必须提交到 ElementStore。

### 5.2 图层、模块、类型和 ID

四种维度含义固定：

- Layer：渲染和资源生命周期分组。
- Module：业务归属和批量操作分组。
- Type：图形形状。
- ID：单个 Element 身份。

VectorLayer 可以同时承载 Point、Polyline、Polygon、Circle 和复杂 Plot 图形。新增图形类型不要求新增图层类。

Point 和 Billboard 完全合并。图标点是 symbol.kind 为 icon 的 Point，不再存在独立 Billboard 业务类型。

### 5.3 查询与批量操作

统一 ElementSelector 至少支持：

- id 或 ids
- module
- layerId
- type
- visible
- predicate

ElementStore 提供 add、get、query、update、remove、hide、show、copy 和 clear 等能力。批量动画、样式更新和交互选择复用同一 Selector 语义。

按业务模块删除元素不需要持有图层或逐个 ID：

    earth.elements.remove({ module: 'planning' });

安全规则：

- 查询不到对象返回 undefined 或空集合。
- remove、hide、show 等破坏性或大范围操作收到空选择器时抛错。
- 清空全部元素必须显式调用 clear。
- 重复 ID、非法状态迁移和已失效 Element 操作抛出稳定类型错误。

### 5.4 事务与快照

所有持久变更通过 ElementStore 事务提交。事务产生变更集并驱动：

- FeatureBinding 更新 OL Feature。
- StyleCompiler 更新渲染样式。
- Element 事件通知。
- Transform 和 Edit 的撤销、重做与回滚。

复制和历史记录使用 ElementSnapshot，不克隆 OL Feature，不携带运行中的动画或会话。

## 6. LayerManager

LayerManager 管理两类稳定概念：

- VectorLayer：Element 的渲染分组和 Source 生命周期容器。
- Raster/Tile Layer：底图、影像和其他非 Element 数据源。

对外使用判别式 LayerSpec，而不是大量构造参数和几何专用类。常用底图能力通过少量内置 preset 提供，同时允许高级用户在公共门面传入公开的 OL Source 或原生 Layer。Adapter 将原生资源转换成不透明 NativeLayerRef，Core 不接触 OL 类型。

服务创建的 Source 和 Layer 由 Earth 销毁；用户传入的原生资源默认是 external ownership，Earth 只解绑、不主动 dispose。调用方必须显式选择 earth ownership，Earth 才接管其销毁。默认配置、文档和示例不得包含私有 token、账号或内网地址。

VectorLayer 不拥有 Element 样式。它只从 StyleService 获取当前帧的已解析样式，也不从 Style 反向写回参数。

内部 LayerController 只负责 Layer、Source、可见性、层级、注册、销毁和 RenderPass。原 Base 继承扩展点删除。

View、Camera 和 Controls 是 Earth 的独立能力，必须在新架构中保留现有视角、定位、缩放和控件行为。

## 7. ShapeRegistry

每个图形由 ShapeDefinition 描述。定义负责：

- 校验与规范化 geometry state。
- 通过 GeometryCodec 创建和更新 OL Geometry。
- 序列化与快照。
- 声明 draw、edit、translate、rotate、scale、vertexEdit、anchor 和 path 等能力。
- 提供复杂图形的控制点和几何重建算法。

ShapeRegistry 包含 Point、Polyline、Polygon、Circle 以及当前全部高级 Plot 图形。Draw、Transform 和 AnimationManager 只查询能力，不根据 plotType 编写分支。

2.0 先将注册接口保持为内部契约。公开扩展点必须在能力契约和版本策略经过 2.0 实战验证后单独设计。

## 8. StyleService

### 8.1 StyleSpec

StyleSpec 是规范公共样式模型，也是序列化、复制、属性更新和样式动画的唯一稳定输入。StyleCompiler 单向把 StyleSpec 编译为 OL Style，并根据状态和分辨率缓存结果。

2.0 不在架构规格中逐项冻结字段名称，但以下是不可降低的能力门槛：

- 图片图标的来源、尺寸、颜色、屏幕偏移、缩放、旋转、锚点、原点和单位语义。
- 文本内容、字体、字号、颜色、描边、背景色、背景描边、内边距、偏移、缩放、对齐、基线和旋转。
- 线颜色、宽度、虚线、虚线偏移、纹理适配、双描边、多层描边和箭头。
- 面纯色填充、纹理填充及当前 PatternFill 视觉语义。
- 点的圆形填充、描边和半径。
- 当前 Point、Billboard、Polyline、Polygon、Circle、Label、Measure、Draw、Transform 和 Descriptor 使用到的样式能力。

现有源码、测试、网站文档和可运行示例共同构成样式能力基线。除明确删除的 Wind 外，任何已有视觉能力都不能因字段重命名或架构调整而丢失。

内置 style preset 用于常见场景，用户仍可提供完整 StyleSpec。

### 8.2 nativeStyle

nativeStyle 是明确的高级逃生口，允许传入 OL Style 或样式函数。其边界固定为：

- Style Adapter 保存实际 OL 对象，Core 只保存 NativeStyleRef。
- 同一 Earth 内的事务和运行时快照保留同一个引用，不深拷贝原生 Style。
- 对外序列化 nativeStyle 时明确报错，不静默丢弃；复制结果共享同一引用，不承诺隔离可变状态。
- 不保证跨 OL 主版本兼容。
- 不执行需要读取或修改 StyleSpec 字段的属性动画。
- 不从原生 Style 反向生成 StyleSpec。
- 请求不受支持的动画时明确抛错，不静默失效。

静态箭头属于 StyleSpec 的装饰能力，不属于 AnimationManager。

## 9. AnimationManager

每个 Earth 拥有一个 AnimationManager，不使用全局单例。Element 创建参数始终表示静态状态，动画只通过显式 play 启动：

    const handle = earth.animations.play(selector, animationSpec);

AnimationHandle 至少提供 pause、resume、stop、status 和 finished。清理方法幂等，其他失效操作抛出稳定错误。

渲染模型：

- 每个活动 VectorLayer 最多一个 LayerRenderPass。
- 同一 Earth 使用统一时钟和 frameState.time。
- 不允许逐元素 requestAnimationFrame 或逐元素 postrender 监听。
- 动画以时间而不是帧数推进。
- 没有活动动画时停止请求额外渲染。
- 帧内样式和几何临时值不得反向写入 ElementState。

动画定义通过目标能力和通道工作。内置定义完整覆盖当前能力：

- Point/Billboard 闪烁、脉冲等效果。
- Polyline 虚线流动。
- FlightLine 的路径移动、锚点、锚线、箭头、重复和结束行为。

相同目标和相同通道默认 replace；不同通道可以组合。Selector 可以按 id、module、layerId 或 type 启动和停止动画。

生命周期规则：

- hide 暂停，show 恢复。
- remove 和 Earth.destroy 停止动画并释放资源。
- copy 和 snapshot 不复制运行状态。
- Transform 或 Edit 暂停冲突通道，会话结束后按结果恢复或终止。

## 10. Draw、Plot 与 Edit

Plot 完全归入 DrawService。基础绘制和所有高级 Plot 图形使用统一入口：

    const session = earth.draw.start({
      type: 'attack-arrow',
      layer: 'operations',
      module: 'planning',
      style,
      data
    });

现有基础绘制及全部高级 Plot 绘制行为必须保留，但不再公开 PlotDraw、PlotEdit 或独立 plot 包入口。

DrawSession 提供 finish、cancel、undo、redo 以及 start、change、complete、cancel 事件。绘制完成返回 Element，不返回裸 Feature。

动态编辑统一通过 DrawService：

    const session = earth.draw.edit(element);

Draw 和 Edit 使用相同的 ShapeDefinition、StyleService 和 GeometryCodec。预览态与最终态不得维护两套图形算法或样式语义。

## 11. TransformService

Transform 以 Element 为公共目标：

    const session = earth.transform.select(element);

OL Feature 只用于内部命中、Interaction 和实时预览。会话开始时建立 ElementState 快照，过程中使用临时投影，结束时一次性提交事务。

- 几何平移、旋转和缩放写回 geometry state。
- 图标和文本等样式变换写回 StyleSpec。
- 复杂图形通过 ShapeDefinition 能力和控制点算法处理。
- copy、remove、undo 和 redo 使用 ElementStore 与 Snapshot。
- 事件返回 Element，并可附带只读 olFeature。
- 与变换冲突的动画通道在会话期间暂停。

Transform 不再解析 Feature 参数，不再依赖 plotType 分支或 OL 私有字段。

## 12. MeasureService

MeasureService 建立在 DrawService、临时 Element、StyleService 和 OverlayService 之上，不维护独立绘制内核。

    const session = earth.measure.start({ type: 'distance' });

MeasureSession 统一负责完成、取消、清理和结果事件。现有距离、分段距离、首段或中心标注、多段总计、面积、动态提示、回调和 clear 能力必须保留。

临时测量图形和标签遵循与普通 Element、Overlay 相同的样式和销毁规则。

## 13. InteractionCoordinator

每个 Earth 拥有一个 InteractionCoordinator。Draw、Edit、Transform 和 Measure 默认属于互斥的指针交互会话。

启动新会话时默认执行 replace：

1. 当前会话收到 cancel。
2. 当前临时状态回滚。
3. 当前会话资源释放。
4. 新会话启动。

高级调用可以使用 reject 冲突策略，使新会话抛出 InteractionConflictError。

右键输入由 InputRouter 统一仲裁。活动会话先处理自己声明的完成或取消行为，然后 ContextMenuService 决定是否打开地图封装菜单。浏览器原生右键菜单的屏蔽不参与该会话切换逻辑。

## 14. Overlay、Descriptor、Event 与 ContextMenu

### 14.1 Overlay 与 Descriptor

DOM Overlay 不进入 ElementStore，但支持 id、module 和 data 查询及批量清理。OverlayService 使用 add 创建普通 Overlay，使用 createDescriptor 创建 Descriptor 复合对象。现有 offset、positioning、stopEvent、insertFirst、autoPan、className 等能力必须保留。

Descriptor 是“Overlay + 可选连接线 Element”的复合对象。创建、更新和销毁保持原子性，并保留拖动、固定线、点击和视口跟随等现有行为。

DOM 所有权规则：

- 服务创建的 DOM 由服务清理。
- 用户传入的 HTMLElement 在销毁时从地图容器解绑，但不清空内容、不删除用户监听，也不改变其业务所有权。

### 14.2 EventService

每个 Earth 对每类底层输入最多安装一套监听，由 InputRouter 和 EventService 分发。视口事件由 Earth viewport 承载；键盘等非视口事件仅在存在订阅时绑定到声明的 DOM target，并在最后一个订阅注销时移除。订阅统一返回幂等 disposer。

事件载荷以 Element 为主要对象，并提供 module、layer、coordinate、pixel、原始地图事件和可选 olFeature。ElementSelector 用于按模块、图层、类型或 ID 路由事件。

功能对等范围至少包括 pointer move、click、left down、left up、double click、right click 和 keydown，支持地图全局订阅、Selector 或 module 订阅、持续订阅、一次性订阅及可取消的一次性订阅。2.0 删除手工 enable/disable 的前置步骤，由订阅数量自动管理底层监听。

用户回调异常被隔离并通过错误通道上报，不得阻断其他监听或破坏输入路由。

### 14.3 ContextMenuService

浏览器原生 contextmenu 由 Earth 初始化 InputRouter 时无条件安装，不依赖用户是否访问、注册或启用 ContextMenuService。它只在对应 Earth viewport 内始终 preventDefault：

- 不在 document 级别屏蔽。
- 单地图和多地图行为一致。
- 多个 Earth 的监听和销毁完全隔离。
- Earth.destroy 后移除视口监听。

地图封装菜单继续支持地图级菜单、Element 或 module 菜单、级联项、before、显隐、禁用、互斥、主题和按元素保存的状态。Element 删除时同步清理关联菜单状态。

## 15. 生命周期与错误

Earth 生命周期为 ready、destroying、destroyed。destroy 幂等，顺序固定：

1. 取消并回滚活动交互会话。
2. 停止 AnimationManager。
3. 移除 InputRouter、EventService 和 ContextMenu 监听。
4. 销毁 Overlay 和 Descriptor。
5. 清理 ElementStore 与 LayerManager。
6. 解除并销毁 OL Map。
7. 从 useEarth 注册表注销相同引用。

同一 ID 销毁后再次调用 useEarth 会创建全新实例。旧 Element、Session 和 AnimationHandle 除幂等清理方法外均进入失效状态，继续操作时抛出 ObjectDisposedError。

错误策略：

- 无效 useEarth ID、重复 Element ID、非法 Selector、StyleSpec、ShapeState 或 LayerSpec 抛出参数类错误。
- 不具备目标能力时抛出 CapabilityError。
- 交互冲突在 reject 策略下抛出 InteractionConflictError。
- 查询缺失不是异常，返回 undefined 或空集合。
- 非法状态不得静默返回 false。
- nativeStyle 不支持的结构化操作必须明确报错。

## 16. 公共发布边界

2.0 采用 ESM-only，OpenLayers 作为 peerDependency，只支持同一 OL 10 主版本。一个 earth-engine 主版本只对应一个 OpenLayers 主版本。

标准用户从包根入口获得 useEarth、Earth、公共类型和内置能力。样式保留 style.css 显式入口。以下旧入口删除：

- ./layers
- ./draw
- ./measure
- ./transform
- ./plot
- 任何 ./dist 深层路径

ESM tree-shaking 负责消除未使用导出；不把内部目录直接变成外部兼容承诺。

包中删除 heatmap.js、lodash、mitt、ol-wind、wind-core 和 @types/lodash。所有 OL 导入使用官方公开 ESM 模块路径，不依赖 renderer 私有类型或带下划线字段。生成声明不得暴露内部 Adapter、lodash 或其他已删除依赖的类型。

### 16.1 零普通依赖契约

发布 tarball 的 package.json 必须满足：

    {
      "peerDependencies": {
        "ol": "^10.9.0"
      },
      "peerDependenciesMeta": {
        "ol": {
          "optional": true
        }
      }
    }

- dependencies 为空或不存在。
- optionalDependencies 和 bundleDependencies 为空或不存在。
- ol 仅作为 optional peer 存在于发布契约中；optional 只表示安装 engine 时允许暂时不存在，运行和构建消费者应用时仍然必需。
- ol 以精确版本 10.9.0 保留在本仓库 devDependencies 中，供构建、测试和示例使用。
- Rollup 将 ol 和 ol/* 全部 external，不把 OL 打入 engine 产物。
- tarball 不包含会在消费者安装时执行的 preinstall、install、postinstall 或 prepare 脚本。
- 构建工具只属于 devDependencies，不会成为消费者安装依赖。

npm 7 及以上会自动安装普通 peer；将 ol 标记为 optional peer 是保证 npm install engine.tgz 不主动下载 OL 的必要发布契约。用户可以先安装 engine，但在导入或运行前必须自行准备兼容的 OL。

OL 10.9.0 自身拥有普通依赖。用户负责准备 OL 及其完整依赖闭包；单独一个 ol tgz 不属于完整离线物料。本项目只保证 engine tarball 不携带、不安装也不下载 OL 或其他第三方运行依赖。

### 16.2 已有依赖的代码清理

不能只修改 package.json，必须先消除源码、构建配置和声明文件中的引用：

- Base 和 Transform 的 lodash 深拷贝由 ElementState、Transaction 和 Snapshot 取代，不再深拷贝 OL Feature。
- Plot 坐标复制使用 Shape 状态快照或内部坐标复制。
- Utils 提供内部 throttle，并公开本包自己的 ThrottledFunction 类型，保留 leading、trailing、cancel 和 flush 行为。
- 删除 Rollup 中 lodash 路径修补、interop 和 external 特例。
- WindLayer、Wind 接口、Earth 默认 wind 实体、公共导出和相关构建逻辑整体删除。
- heatmap.js 和 mitt 当前没有运行时代码引用，继续通过包测试保证它们不会重新进入依赖清单。

## 17. 实施分解与 OL 10 升级顺序

本设计是覆盖全部阶段的总架构规格。实施分成两个宏观步骤：第一步只完成架构、代码、测试和离线打包；第二步集中完成用户文档和可运行示例。架构规格和能力矩阵属于内部实施依据，不计入第二步的产品文档。

每个阶段都是独立的实施和审查单元，必须有单独的计划、验证证据和提交边界；阶段之间保持代码测试可验证，不在外部发布半迁移状态。若某阶段需要改变本文公共契约，必须先提交补充设计并重新获得批准。

### 第一步：架构与代码重构

第一步不得修改 website 用户页面、TypeDoc 输出、MIGRATION 用户文档或文档运行示例。允许读取它们建立能力基线。第一步完成后不发布 2.0，也不合并为对外发布版本。

#### 阶段 0：能力基线

- 从公共导出、源码、测试、网站文档和示例生成能力矩阵。
- 冻结除 Wind 外的现有行为和视觉基线。
- 为高风险交互、样式和生命周期补充回归测试。

#### 阶段 1：OL 10 与 Adapter 基础

- 删除 Wind 及依赖。
- 升级 OpenLayers 10.9.0、TypeScript 和模块解析配置。
- 迁移标准 ESM 导入、Feature/Source 泛型、空值、事件和 Canvas 类型。
- 清除 anchor_、downPx_、context_ 等私有 API。
- 建立 GeometryCodec、FeatureBinding 和 OL 10 消费测试。

#### 阶段 2：Element、Layer 与 Style

- 建立 ElementStore、Selector、Transaction、Snapshot 和 LayerManager。
- 迁移基础元素与混合 VectorLayer。
- 建立 StyleSpec、StyleCompiler、preset 和 nativeStyle 边界。
- 用单向状态投影替换 Base 的反向参数同步。

#### 阶段 3：输入与界面服务

- 建立 InputRouter、EventService 和 InteractionCoordinator。
- 迁移 ContextMenu、Overlay 和 Descriptor。
- 验证多 Earth 隔离和 DOM 所有权。

#### 阶段 4：Draw、Plot 与 Measure

- 建立 ShapeRegistry 和全部内置 ShapeDefinition。
- 合并基础 Draw、Plot 和动态 Edit。
- 迁移 Measure 到 Draw/Overlay 基础设施。

#### 阶段 5：Transform

- 迁移 Element 事务式 Transform。
- 保留复杂图形控制点、历史、复制、删除和样式变换。

#### 阶段 6：Animation

- 建立 Earth 级 AnimationManager 和 LayerRenderPass。
- 迁移 Point、Polyline 和 FlightLine 的全部动画。
- 删除逐元素 postrender、RAF 和旧动画入口。

#### 阶段 7：公共切换与离线包

- 切换根导出和 package exports。
- 删除旧 Base、类型图层、独立 Plot 及重复实现。
- 完成零普通依赖清理和 OL optional peer 配置。
- 生成 tgz，执行 engine 独立离线安装和预置 OL 后的完整消费测试。
- 运行第一步代码验证门槛；此时允许旧用户文档与新 API 暂时不一致。

### 第二步：用户文档与示例

#### 阶段 8：文档迁移

- 更新 website 用户页面、API 表格、TypeDoc 和同源可运行示例。
- 完成跨阶段的 1.x 到 2.0 迁移指南。
- 增加离线安装说明，明确 OL 是安装可选、运行必需的 peer，并说明用户需要准备 OL 完整依赖闭包。

#### 阶段 9：最终发布审计

- 对照能力矩阵审计所有 API 归属页、链接、示例和迁移映射。
- 运行完整代码、文档和发布门槛。
- 只有本阶段通过后才允许发布 2.0。

## 18. 验证与发布门槛

### 18.1 能力对等矩阵

能力矩阵来源必须同时覆盖公共导出、源码、现有测试、网站文档和可运行示例。第一步完成代码与测试列，第二步完成文档与示例列。除 Wind 外，每一项必须记录：

- 1.x 能力和行为。
- 2.0 新入口或明确替代方式。
- 单元或集成测试。
- 网站归属页。
- 同源可运行示例。

矩阵未全部通过时不得发布 2.0。

### 18.2 自动化验证

必须覆盖：

- Core 单元测试：Selector、事务、快照、生命周期和错误。
- OL 10 集成测试：Geometry、Style、Feature、Layer、Overlay 和 Interaction Adapter。
- 浏览器交互测试：Draw、Edit、Measure、Transform、事件和右键仲裁。
- 多 Earth 隔离测试。
- Overlay DOM 所有权和 Descriptor 原子清理测试。
- 反复创建销毁后无监听、RAF、postrender、Overlay 或注册表泄漏。
- AnimationManager 空闲停止和大量元素性能预算。
- nativeStyle 能力边界和错误测试。
- 类型/API 快照。
- npm pack 后真实消费者的 ESM、类型和 style.css 测试。
- tarball package.json 零 dependencies、零 optionalDependencies、零 bundleDependencies 检查。
- 空缓存下 engine tgz 独立离线安装测试。
- 用户预置 OL 完整依赖闭包后的离线 ESM、TypeScript 和最小 Earth 浏览器消费测试。

第一步新增 npm run verify:code，至少执行类型检查、lint、非文档单元测试、OL 10 集成测试、浏览器交互测试、构建、包结构检查和离线安装测试。现有文档契约测试归入独立文档测试集，不在第一步为迁就旧文档而削弱或删除。

### 18.3 离线安装验收

engine 独立安装测试必须使用真实 tarball，而不是 workspace 或 file directory：

1. 运行 npm pack --dry-run --json 检查文件清单，再生成正式 tgz。
2. 解出 tgz 内的 package/package.json，断言普通、可选和打包依赖均为空，ol 仅存在于 optional peer。
3. 创建全新空消费项目和全新空 npm cache。
4. 执行 npm install --offline --cache <empty-cache> --no-audit --ignore-scripts <engine.tgz>。
5. 断言安装成功、node_modules 中只有 engine，不存在 ol、lodash、mitt、ol-wind、wind-core 或其他由 engine 带入的包。
6. 在另一个已经离线预置 OL 完整依赖闭包的消费项目中安装同一 engine tgz。
7. 运行最小 ESM 导入、TypeScript 类型检查、Earth 创建与销毁浏览器用例及 npm ls ol @vrsim/earth-engine-ol。

不得用 --omit=peer、--legacy-peer-deps 或已有 npm cache 掩盖发布契约问题。

第二步完成后最终必须同时通过：

- npm run verify
- npm run docs:build

并确认：

- 无 OL 私有字段或私有 renderer 类型。
- 无逐元素 RAF 或 postrender。
- 无未映射的非 Wind 公开能力。
- tarball 没有普通或打包运行依赖，且 OL 只作为 optional peer。
- 使用全新空 npm cache 执行 npm install --offline --no-audit --ignore-scripts engine.tgz 成功，并且不会安装 OL。
- dist 只作为发布构建产物，不作为日常源码提交内容。

## 19. 文档设计

用户文档统一放在第二个宏观步骤处理。第一步不修改 website、TypeDoc、MIGRATION 或文档运行示例；第二步一次性以已经稳定的新架构和公共 API 为依据完成迁移，避免代码重构期间反复维护两套文档。

第二步开始前必须冻结第一步公共 API。文档工作不得反向引入兼容旧 API 的实现；如果发现能力遗漏，应返回代码阶段修复并重新通过 verify:code。

文档必须：

- 优先展示 useEarth 的标准用法，完整记录 Earth 高级构造入口。
- 为 Element、ElementSelector、LayerSpec、StyleSpec、Animation、Draw/Edit Session、Measure Session、Transform Session、Overlay、Descriptor、Event 和 ContextMenu 建立唯一归属页。
- 遵守 website/AGENTS.md 的页内锚点、跨页链接、API 展示层级和同源示例规则。
- 示例源码和运行组件引用同一 Vue 文件。
- 底图示例统一通过 createConfiguredLayer 和 map-sources.json 配置。
- 同时验证浅色、深色主题和窄屏布局。
- 新增完整的 1.x 到 2.0 迁移表。
- 安装页明确 engine tgz 可以独立离线安装，但 OL 及其依赖闭包由用户单独准备；不得把 optional peer 描述成运行时可选。

迁移指南至少说明：

| 1.x 能力 | 2.0 方向 |
| --- | --- |
| PointLayer、BillboardLayer、PolylineLayer 等 | Earth.elements + ElementState |
| Billboard | Point + icon symbol |
| Base 图层继承 | LayerSpec、Element 和稳定服务 |
| DynamicDraw、PlotDraw、PlotEdit | Earth.draw.start / Earth.draw.edit |
| Measure 构造器 | Earth.measure session |
| Transform 构造器和裸 Feature | Earth.transform + Element |
| Point flash、Polyline flow、FlightLine | Earth.animations.play |
| GlobalEvent | Earth.events |
| ContextMenu | Earth.contextMenu |
| OverlayLayer、Descriptor | Earth.overlays.add / Earth.overlays.createDescriptor |
| WindLayer | 删除，无 2.0 替代 |

## 20. 完成定义

只有同时满足以下条件，2.0 架构迁移才算完成：

- 本规格中的服务边界、依赖规则和生命周期已落地。
- useEarth 保持 get-or-create 的默认与命名实例语义。
- 内部所有依赖都通过 EngineContext 显式传递。
- Element 是唯一业务状态真源，OL Feature 只作为投影和高级逃生口。
- 图形、模块和图层完全解耦。
- 当前样式、绘制、编辑、测量、变换、事件、菜单、Overlay 和动画能力除 Wind 外全部对等。
- OpenLayers 10.9.0、ESM 包、类型声明和真实消费者验证通过。
- 发布包零普通依赖，OL 是 optional peer，engine tgz 空缓存离线安装验证通过。
- 第一步架构与代码、第二步用户文档均分别完成并通过各自门槛。
- 能力矩阵、自动化测试、网站文档和迁移指南全部完成。
