# 2.0 Element 协同保护模式设计

状态：已批准  
日期：2026-07-22  
适用范围：2.0 Element、Edit、Transform 与 OpenLayers 临时视图

本文补充 `2026-07-13-v2-element-kernel-architecture-design.md` 与 `2026-07-16-v2-interaction-visual-design.md`。若本文未覆盖某项约束，继续以两份总纲为准。

## 1. 目标与边界

外部协同系统可以按 Element ID 发布“正在被其他协作者编辑”的运行态。Earth 在当前实例内展示保护视觉，并阻止本地用户通过内置 Edit / Transform 交互修改该 Element。

保护状态不是 Element 业务快照的一部分，不进入 `ElementState`、事务、复制、撤销重做、动画快照或持久化输出。程序化 `Element` / `ElementService` 更新与删除仍然可用，供服务端同步、远端操作回放和冲突收敛使用。自定义原生 OpenLayers 交互也不在自动拦截范围内。

本能力只解决客户端占用提示和交互门禁，不替代服务端原子锁、租约、权限检查或提交版本校验。

## 2. 公共契约

`ElementService` 新增以下能力：

```ts
interface ElementProtectionUpdate {
  readonly protected: boolean;
  readonly operatorId?: string;
  readonly operatorName?: string;
  readonly revision?: number;
  readonly expiresAt?: number;
}

interface ElementProtectionState {
  readonly elementId: string;
  readonly protected: true;
  readonly operatorId?: string;
  readonly operatorName?: string;
  readonly revision?: number;
  readonly expiresAt?: number;
}

interface ElementService {
  setProtection(elementId: string, update: ElementProtectionUpdate): boolean;
  getProtection(elementId: string): ElementProtectionState | undefined;
}
```

- `setProtection` 返回本次输入是否改变了当前运行态。目标不存在、输入已过期、版本陈旧或内容幂等时返回 `false`。
- `protected: true` 建立或更新保护；`protected: false` 解除保护。
- `operatorId` 是稳定协作者标识，`operatorName` 是可选展示名。展示名缺省时使用通用文案，不把 ID 当作展示名。
- `revision` 是调用方提供的非负安全整数。同一 Element 代次内，带版本的输入只接受严格递增值，用于丢弃乱序消息。
- `expiresAt` 是毫秒时间戳；到期后当前保护自动解除。已经到期的输入不会建立视觉。
- `getProtection` 返回冻结的隔离快照；未保护或 Element 不存在时返回 `undefined`。

受保护目标进入 Edit / Transform 时抛出公开的 `ElementProtectedError`。错误携带 `elementId`，并在可用时携带 `operatorId`、`operatorName`。

## 3. 状态与依赖边界

新增实例级 `ElementProtectionService`，由 `EngineContext` 显式创建、注入和销毁。服务按 `Element ID + ElementGeneration` 保存保护状态和版本水位，不使用模块级可变单例。

- `ElementStore` 仍是 Element 规范状态唯一真源。
- 保护服务只读取 Element 快照和代次，并订阅 Store 变化；不得反向写入 ElementState。
- Element 被删除时立即清除对应保护、定时器和视图。相同 ID 后续重新添加属于新代次，不继承旧保护或旧版本水位。
- Element 的几何、图层、可见性变化时，保护服务把当前快照重新投影到临时视图。
- 服务销毁时必须释放 Store/保护订阅、到期定时器、Overlay、临时 Feature、临时 Source 与临时 Layer；重复销毁保持幂等。

保护更新通过内部 Port/订阅传给 Edit、Transform 与视图适配器。Core 和 Services 不直接依赖 OpenLayers 或 DOM。

## 4. 交互规则

### 4.1 进入会话

- `draw.edit(id)` 必须在交互协调器接管前检查保护，避免一次被拒绝的编辑取消当前会话。
- `transform.select(id)` 必须在创建和激活新 Session 前检查保护，避免被拒绝的选择替换当前互斥会话。
- Edit / Transform Session 在 `open` 或 `select` 内再次检查，覆盖预检查与实际打开之间的保护竞态。
- Transform 地图命中到受保护的最上层候选时停止候选穿透，不选择其下方 Element；保护错误不得复用 `CapabilityError`。

### 4.2 活跃会话

活跃 Edit / Transform 目标在会话期间变为受保护时，会话立即取消并回滚尚未提交的工作态，释放控制点、框选、工具栏、Tooltip、光标、动画预览和协调器所有权。解除保护不会自动恢复已经终止的会话。

只读命中、事件识别、查询和屏幕范围读取仍可命中受保护 Element。

## 5. 视觉规则

保护视图属于 Adapter 临时资源，不进入业务矢量 Source，不建立 FeatureBinding，也不参与库内 Element 命中。

- 点或图片符号：在原符号外绘制半透明琥珀色光晕和高对比度保护环，不遮住主体图像。
- 线：沿完整线形绘制较宽的半透明光带和虚线边缘，使窄线仍可识别为整体受保护。
- 面与圆：绘制半透明遮罩、清晰边界和虚线强调；底图与原样式仍需可辨认。
- 其他绘制图形按最终渲染几何归入点、线或面规则，不复制 Shape 内核。
- DOM 标签显示“`{operatorName} 正在编辑`”；无展示名时显示“其他协作者正在编辑”，副文案为“暂不可操作”。

标签通过 `textContent` / DOM 节点渲染，禁止拼接 HTML；`pointer-events: none`，不抢占地图交互。遮罩随目标图层的可见性、不透明度和层级同步；标签随有效可见性和层级同步，在有效不透明度大于零时保持可读，目标完全透明或不可见时隐藏。

## 6. 并发与版本语义

本地服务只对调用方给出的版本执行单调过滤：

1. 同一代次内，未带 `revision` 的输入采用调用顺序最后写入生效。
2. 一旦收到带 `revision` 的输入，后续小于或等于当前水位的带版本输入被忽略。
3. 带版本的解除保护仍保留水位，防止较旧的加锁消息重新出现。
4. 到期只解除当前记录；若到期前已被更高版本替换，旧定时器不得影响新记录。

服务端仍负责决定锁是否授予、续租、转移和最终提交。客户端不得把本地视觉状态当作权限真源。

## 7. 文档与验收

用户文档新增独立“Element 保护模式”页面和可运行示例，同一地图同时展示图片点、线、面三类保护效果，并可切换保护与编辑者。页面需说明服务端协作边界、版本与到期语义，以及程序化写入不被拦截。

测试至少覆盖：输入校验、缺失目标、点线面视图投影、图层展示同步、版本乱序、自动到期、删除与同 ID 重建、Edit/Transform 进入门禁、保护竞态、活跃会话取消、命中不穿透和全生命周期清理。公开类型夹具、API 文档链接与网站构建必须同步通过。
