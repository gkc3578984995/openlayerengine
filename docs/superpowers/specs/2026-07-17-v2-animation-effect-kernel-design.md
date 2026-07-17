# 2.0 可组合动画效果内核补充设计

## 文档状态

- 状态：已批准
- 日期：2026-07-17
- 实施登记：2026-07-17，按本文约束完成 deadline wake、原子批量替换、保守视口裁剪、稳定 presentation pool 与 Earth 级渲染请求去重
- 契约修订：2026-07-17，`path-travel` 移除 `arrow`、`arrowColor` 与方向箭头渲染，箭头展示继续由 Shape 样式或 `grow` 负责
- 目标版本：@vrsim/earth-engine-ol 2.0.0
- 性质：公共动画契约与内部渲染架构补充
- 适用范围：AnimationManager、AnimationRegistry、ShapeDefinition 动画能力、帧合成、LayerRenderPass 与 OpenLayers 展示适配器
- 补充：2026-07-13-v2-element-kernel-architecture-design.md
- 关联：2026-07-16-v2-coordinate-conversion-and-circle-radius-design.md
- 关联：2026-07-16-v2-interaction-visual-design.md

本设计只补充动画目标能力、公共效果契约、帧合成和展示适配边界。未被本设计明确补充的总纲条款继续有效。本设计不开放公共 ShapeDefinition、AnimationDefinition 或 AnimationRegistry 注册入口。

用户已确认：采用可组合效果内核、能力驱动兼容、双渲染路径、规范几何命中和 fade-out retain 语义，并按本文分阶段实施公共 API、代码、测试与用户文档。

## 与既有批准规格的关系

本文补充架构总纲的总体分层、Element 状态真源、ShapeRegistry、StyleService、AnimationManager、生命周期、实施顺序、验证门槛和文档设计，即总纲第 3、5.1、7、8、9、15、17、18、19 节。只有本文明确写出的动画目标能力、可组合写入域、presentation replacement、命中和新增公共 Spec 条款对这些章节形成补充；其余内容继续以架构总纲为准。

Circle 的业务米制半径、ShapeProjectionPort 和 AnimationManager 使用 View 圆的规则继续服从 `2026-07-16-v2-coordinate-conversion-and-circle-radius-design.md` 第 4、5 节。Edit/Transform 的临时视觉所有权、真实 ShapeDefinition、帧合并和 Adapter 边界继续服从 `2026-07-16-v2-interaction-visual-design.md` 第 5、9 节。

若本文与既有已批准规格存在未明确说明的冲突，以既有已批准规格为准并返回设计评审，不得由实现自行选择解释。

## 1. 背景、目标与非目标

现有动画内核已经具备 Earth 级 AnimationManager、按层共享 LayerRenderPass、统一 `frameState.time`、channel 替换、Selector 批量控制和生命周期清理。当前帧协议只能追加临时图元，不能表达原 Element 的透明度、显隐门控或中间展示几何；AnimationManager 仍存在内置类型白名单，复杂动画的缓存也缺少独立资源所有者。

如果继续按“区域动画类、线动画类、箭头动画类、雷达动画类”扩展，会造成动画类型与 ShapeType 的笛卡尔积，并把越来越多的能力分支堆积到 Service 和 OpenLayers Adapter。本设计把动画提升为可组合效果内核，以目标能力而不是具体 ShapeType 决定兼容性。

本设计的目标是：

1. 保持唯一公共入口 `earth.animations.play(selector, spec)`，不增加区域、路径或雷达专用 Manager。
2. 保持现有 `pulse`、`dash-flow`、`path-travel` 的名称与默认 channel；`path-travel` 按已确认修订移除箭头参数和渲染，其余默认值与行为保持稳定。
3. 增加闭合面闪烁、高亮和告警，路径与箭头生长和闪烁，圆形与扇面雷达扫描和中心扩散，以及所有结构化 Shape 的渐隐渐显。
4. 让目标透明度、中间几何和 overlay 可以确定性组合，不为每种组合增加新动画类型。
5. 让新增内置效果只增加 Spec、Definition、注册、测试和文档，不修改 Manager 的动画类型分支。
6. 保持 ElementState 为唯一业务状态真源，动画运行态不进入 Store、快照、复制结果或持久化数据。
7. 保持一个 Earth 一个时间源、每个活动 VectorLayer 一个共享 RenderPass，不引入逐 Element RAF、timer 或 render listener。
8. 给几何计算、图元数量、帧内对象创建、视口裁剪和资源释放设置可自动验证的预算。

本次明确不做：

- 不开放用户注册自定义动画或自定义 Shape 的公共插件 API。
- 不增加 `area-blink`、`line-blink`、`arrow-blink` 等按图形命名的重复效果。
- 不让动画自动调用 `elements.hide()`、`show()` 或写入任何业务状态。
- 不把动画运行态放入 ElementState、ElementSnapshot、copy 或序列化结果。
- 不从最终 Polygon 轮廓反推 Plot 箭头中心路径或 Sector 径向语义。
- 不使用 OpenLayers 私有 API、私有 flat-coordinate API 或全局 Earth 状态。
- 第一版不支持 `NativeStyleRef` 的新增效果，也不宣称 nativeStyle 可以完整参与 fade、grow 或雷达效果。
- 不承诺任意数量、任意覆盖面积的动画都达到 60 FPS。
- 不在首版增加随展示几何变化的独立动画命中索引。

## 2. 术语与不可变约束

本文使用以下术语：

- **AnimationSpec**：调用方传给 `play()` 的公共判别联合成员。
- **AnimationDefinition**：内置效果的无目标运行态定义，负责规范化、能力声明和创建 Runtime。
- **AnimationRuntime**：单个目标、单条动画记录拥有的运行实例，负责时间采样、缓存和销毁。
- **channel**：用户可见的控制与替换分组；相同目标、相同 channel 默认 replace。
- **写入域**：效果修改展示结果的内部属性域，包括 target-opacity、target-geometry 和 overlay。
- **目标修饰器**：作用于原目标的透明度或临时展示几何。
- **overlay**：不修改业务目标，只在目标之上绘制的高亮、告警、雷达尾迹和扩散环。
- **展示替身**：为避免每帧重建整个业务图层，在共享 RenderPass 中绘制的、由缓存 Feature、Geometry 和 Style 组成的动画展示对象。
- **presentation lease**：暂时接管一个规范 Feature 展示权的内部租约；只改变渲染投影，不改变 Source 身份或 ElementState。
- **目标能力**：从结构化样式、最终 RenderGeometry 或 ShapeDefinition provider 得到的动画兼容能力。
- **稳定 slot**：Runtime 在生命周期内反复更新的固定图元位置，例如 `base`、`radar-tail-0` 或 `ripple-1`。

以下约束不可被具体效果覆盖：

1. 每个 Earth 只有一个 AnimationManager 和一个动画时间源。
2. 每个活动 VectorLayer 最多注册一个共享 `postrender` RenderPass。
3. 同一 Earth、同一 `frameState.time` 内最多请求一次下一地图帧；所有活动图层和显式 `requestRender()` 共用同一个去重门闩。
4. 动画以经过时间推进，不依赖实际帧数。
5. Core 和 Services 不导入 OpenLayers 类型；OL 类型只存在于 Adapter。
6. Builtins 不导入 OpenLayers，也不通过全局 `useEarth()` 获取依赖。
7. Manager 不允许出现 AnimationType 或 ShapeType 白名单 switch。
8. 动画帧不得写 Store，不得替换规范 Feature geometry，不得把展示结果反向解析成业务状态。
9. 暂停、隐藏、已 retain 的稳定最终帧和无活动动画不得持续请求地图帧。
10. 所有 lease、Runtime、slot、listener 和缓存都必须有明确所有者和幂等清理路径。

## 3. 公共 API 与兼容策略

### 3.1 入口与 Handle

唯一播放入口保持不变：

```ts
const handle = earth.animations.play(selector, spec);
```

`AnimationManager` 的 `play`、`pause`、`resume`、`stop`、`stopAll` 以及 `AnimationHandle` 的 `pause`、`resume`、`stop`、`status`、`finished` 契约保持不变。不增加 `blink()`、`grow()`、`radar()` 等快捷方法。

Selector 继续支持按 `id`、`module`、`layerId` 和 `type` 批量选择。批量 `play()` 保持原子性：任一匹配目标不兼容、存在写入域冲突或配置非法时，整个调用失败，不跳过目标，也不提前替换已有记录。

批量 replace 使用两阶段提交。第一阶段完成全部目标画像解析、能力和写入域校验、Runtime/FrameBuffer 创建以及 elapsed 0 初始采样，不改变现有记录、lease 或 RenderPass。第二阶段先安装全部新记录并确认 presentation lease、RenderPass 和 deadline 登记成功，最后才移除同 channel 旧记录。第二阶段任一步失败时，必须清理本批次全部新 Runtime、slot、临时 lease 和空闲 RenderPass，并恢复旧记录的 channel 映射；旧 Handle 和旧视觉继续有效。Runtime 的 `destroy()` 必须允许候选清理和记录回滚重复调用。

典型调用保持为一行 Spec：

```ts
earth.animations.play({ id: 'area-1' }, { type: 'highlight', mode: 'breathe' });
earth.animations.play({ id: 'area-1' }, { type: 'alert' });
earth.animations.play({ id: 'route-1' }, { type: 'grow', durationMs: 1200 });
earth.animations.play({ id: 'sector-1' }, { type: 'radar-scan' });
earth.animations.play({ id: 'element-1' }, { type: 'fade', direction: 'out' });
```

### 3.2 新增公共类型

```ts
export type AnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface BlinkAnimationSpec {
  readonly type: 'blink';
  readonly channel?: AnimationChannel;
  readonly periodMs?: number;
  readonly dutyCycle?: number;
  readonly minOpacity?: number;
  readonly maxOpacity?: number;
  readonly repeat?: boolean;
}

export interface HighlightAnimationSpec {
  readonly type: 'highlight';
  readonly channel?: AnimationChannel;
  readonly mode?: 'steady' | 'breathe';
  readonly color?: Color;
  readonly fillOpacity?: number;
  readonly strokeWidth?: number;
  readonly periodMs?: number;
}

export interface AlertAnimationSpec {
  readonly type: 'alert';
  readonly channel?: AnimationChannel;
  readonly periodMs?: number;
  readonly color?: Color;
  readonly fillOpacity?: number;
  readonly strokeWidth?: number;
  readonly repeat?: boolean;
}

export interface GrowAnimationSpec {
  readonly type: 'grow';
  readonly channel?: AnimationChannel;
  readonly durationMs?: number;
  readonly direction?: 'forward' | 'reverse';
  readonly easing?: AnimationEasing;
  readonly repeat?: boolean;
}

export interface RadarScanAnimationSpec {
  readonly type: 'radar-scan';
  readonly channel?: AnimationChannel;
  readonly periodMs?: number;
  readonly direction?: 'clockwise' | 'counterclockwise';
  readonly color?: Color;
  readonly opacity?: number;
  readonly beamWidthDeg?: number;
  readonly repeat?: boolean;
}

export interface CenterSpreadAnimationSpec {
  readonly type: 'center-spread';
  readonly channel?: AnimationChannel;
  readonly periodMs?: number;
  readonly color?: Color;
  readonly strokeWidth?: number;
  readonly ringCount?: number;
  readonly repeat?: boolean;
}

export interface FadeAnimationSpec {
  readonly type: 'fade';
  readonly channel?: AnimationChannel;
  readonly direction: 'in' | 'out';
  readonly durationMs?: number;
  readonly easing?: AnimationEasing;
}
```

`AnimationSpec` 在现有三个成员后追加上述成员。公开 `animationTypes` 只在现有值后追加，旧值不得重排：

```ts
['pulse', 'dash-flow', 'path-travel', 'blink', 'highlight', 'alert', 'grow', 'radar-scan', 'center-spread', 'fade'];
```

`PathTravelAnimationSpec` 不包含 `arrow` 或 `arrowColor`。`path-travel` 只绘制沿路径移动的尾迹及可选起终点标记，不创建方向箭头 slot；严格 Spec 校验把这两个旧字段视为未知字段。需要静态箭头时使用 Element 的结构化 Decoration，需要箭头生长时使用 `grow`，不得在动画 Runtime 内恢复第二套箭头表达。

默认 channel 继续等于 `spec.type`。需要让高亮与告警互相替换时，由调用方显式使用相同 channel：

```ts
earth.animations.play({ id }, { type: 'highlight', channel: 'attention' });
earth.animations.play({ id }, { type: 'alert', channel: 'attention' });
```

### 3.3 默认值与校验

| 类型            | 默认值                                                                                                              | 自然完成行为                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `blink`         | `periodMs: 800`、`dutyCycle: 0.5`、`minOpacity: 0`、`maxOpacity: 1`、`repeat: true`                                 | `repeat: false` 时一个周期后移除效果                 |
| `highlight`     | `mode: 'steady'`、`color: '#ffc107'`、`fillOpacity: 0.18`、`strokeWidth: 3`；呼吸周期 `1200ms`                      | 不自然完成，由 stop、replace、remove 或 destroy 结束 |
| `alert`         | `periodMs: 1200`、`color: '#ff3b30'`、`fillOpacity: 0.22`、`strokeWidth: 3`、`repeat: true`                         | `repeat: false` 时一个告警周期后移除 overlay         |
| `grow`          | `durationMs: 1200`、`direction: 'forward'`、`easing: 'linear'`、`repeat: false`                                     | 完成后移除临时几何；此时原图形已完整，不产生视觉跳变 |
| `radar-scan`    | `periodMs: 2000`、`direction: 'clockwise'`、`color: '#00e5ff'`、`opacity: 0.35`、`beamWidthDeg: 45`、`repeat: true` | `repeat: false` 时完成一轮扫描后移除                 |
| `center-spread` | `periodMs: 1600`、`color: '#00e5ff'`、`strokeWidth: 2`、`ringCount: 3`、`repeat: true`                              | `repeat: false` 时完成一轮扩散后移除                 |
| `fade`          | `durationMs: 500`、`easing: 'ease-in-out'`                                                                          | fade-in 固定 remove；fade-out 固定 retain            |

所有 Spec 继续使用现有严格普通对象规则：拒绝未知字段、accessor、symbol 字段和非法原型，不修改调用方对象。

字段约束固定为：

- `periodMs`、`durationMs` 为有限正数。
- `dutyCycle` 满足 `0 < value < 1`。
- `minOpacity`、`maxOpacity`、`fillOpacity` 和 `opacity` 位于 `[0, 1]`，且 `minOpacity < maxOpacity`，不接受无视觉变化的 blink。
- `strokeWidth` 为有限非负数。
- `beamWidthDeg` 满足 `0 < value <= 360`；Sector 的实际宽度不超过自身 sweep。
- `ringCount` 是 `1..5` 的安全整数。
- `highlight.mode === 'steady'` 时显式传入 `periodMs` 抛出 `InvalidArgumentError`，不允许参数被静默忽略。
- `FadeAnimationSpec.direction` 必填，不从 channel 或当前可见状态推断；fade-in 固定 remove，fade-out 固定 retain，不开放相反的无意义或闪回组合。

公开 easing 使用固定三次函数。令输入进度 `p = clamp(elapsed / duration, 0, 1)`：

```text
linear:      p
ease-in:     p^3
ease-out:    1 - (1 - p)^3
ease-in-out: p < 0.5 ? 4 * p^3 : 1 - (-2 * p + 2)^3 / 2
```

不得把这些名称交给 CSS、Web Animations 或 Adapter 自行解释。所有平台和重构后的实现必须使用同一纯函数。

### 3.4 TypeScript 兼容性

扩大 `AnimationType` 会使消费方 exhaustive switch、`assertNever` 和 `Record<AnimationType, ...>` 出现新的编译检查。这是新增内置类型不可避免的源码兼容影响。2.0 发布说明必须明确：内置动画判别联合和 `animationTypes` 可以在功能版本追加成员，消费方必须保留未知成员兜底；除本文明确批准的 `path-travel` 箭头字段移除外，旧成员的字段、默认值、顺序和行为保持稳定。

现有内部 `BlinkAnimationSpec` 应重命名为 `TransientBlinkAnimationSpec`，避免与新增公共类型同名；该调整不得扩大根导出面。

## 4. 目标能力模型

动画兼容性通过目标画像决定，不通过 AnimationManager 中的 ShapeType switch 决定：

```ts
type AnimationTargetCapability = 'structured-presentation' | 'closed-surface' | 'reveal-geometry' | 'radial-frame';
```

- `structured-presentation`：目标使用可由引擎编译的 StyleSpec，支持展示替身和整体 opacity。
- `closed-surface`：最终 RenderGeometry 为非退化 `polygon`，或半径大于 0 的 `circle`，由内核推导，不要求每个 Shape 重复声明。
- `reveal-geometry`：普通 Polyline 由内核提供；Polygon 箭头通过 ShapeDefinition provider 获得。
- `radial-frame`：ShapeDefinition 存在能提供中心、外半径、起始角和 sweep 的 provider。

第一版兼容矩阵：

| Render/Shape 能力    | blink  | highlight | alert  | grow               | radar-scan         | center-spread      | fade   |
| -------------------- | ------ | --------- | ------ | ------------------ | ------------------ | ------------------ | ------ |
| Point + StyleSpec    | 支持   | 不支持    | 不支持 | 不支持             | 不支持             | 不支持             | 支持   |
| Polyline + StyleSpec | 支持   | 不支持    | 不支持 | 支持               | 不支持             | 不支持             | 支持   |
| Polygon + StyleSpec  | 支持   | 支持      | 支持   | 仅 reveal provider | 仅 radial provider | 仅 radial provider | 支持   |
| Circle + StyleSpec   | 支持   | 支持      | 支持   | 不支持             | 支持               | 支持               | 支持   |
| NativeStyleRef       | 不支持 | 不支持    | 不支持 | 不支持             | 不支持             | 不支持             | 不支持 |

所有最终渲染为 Polygon 的 Rectangle、Ellipse、Triangle、EquilateralTriangle、AssemblePolygon、ClosedCurvePolygon、LunePolygon、Sector 和面箭头自然获得 closed-surface 能力，不维护第二份 ShapeType 白名单。

Polyline、LunePolyline 和 CurvePolyline 由内核统一获得 reveal-geometry。AttackArrow、TailedAttackArrow、FineArrow、TailedSquadCombatArrow、AssaultDirectionArrow 和 DoubleArrow 由各自 ShapeDefinition provider 获得 reveal-geometry。Circle 和 Sector 获得 radial-frame。

### 4.1 ShapeDefinition provider

ShapeDefinition 增加内部可选协议：

```ts
interface ShapeAnimationProfile<S extends ShapeState> {
  revealGeometry?(viewState: Readonly<S>, progress: number, direction: 'forward' | 'reverse'): RenderGeometryState | undefined;

  createRevealSession?(viewState: Readonly<S>): {
    rebind(nextViewState: Readonly<S>): void;
    reveal(progress: number, direction: 'forward' | 'reverse'): RenderGeometryState | undefined;
    destroy(): void;
  };

  radialFrame?(viewState: Readonly<S>): {
    readonly center: Coordinate;
    readonly radius: number;
    readonly startAngleRad: number;
    readonly sweepAngleRad: number;
  };
}

interface ShapeDefinition<S extends ShapeState = ShapeState> {
  // 保留既有字段。
  readonly animation?: ShapeAnimationProfile<S>;
}
```

provider 接收的必须是已通过 ShapeProjectionPort 转换的 View 工作状态。Circle provider 不得直接把业务米制半径当作 View 半径。返回值保持 Core 纯数据，不包含 OL Geometry、Style、Feature 或 Canvas 对象。

`revealGeometry` 是无状态语义入口和兼容回退；需要逐帧生成复杂 Plot 几何的 Shape 同时提供内部 `createRevealSession`。grow Runtime 每条记录只创建一个 session，并在目标 revision 变化时调用 `rebind()`，在 stop、replace、remove 或 destroy 时调用幂等 `destroy()`。session 在 rebind 时预计算控制点、分支、累计长度和曲线权重，`reveal()` 只原地更新其持有的稳定 RenderGeometry、ring 与坐标池；不得每帧重新创建完整 Polygon 数组或重复建立 B-spline/Bezier 权重。该 session 是内核资源所有权协议，不扩大根公共导出面。

`ShapeAnimationProfile` 中 provider 的存在本身就是 Shape 语义能力声明，不再向既有 `ShapeCapability` 集合增加一份重复标志。ShapeRegistry 快照时验证 profile 结构和 provider 函数，AnimationTargetProfile 再把 provider、当前 RenderGeometry 和结构化样式归纳为本节的目标能力。

radial-frame 的 center、radius 和角度必须是有限数；radius 必须大于 0，`sweepAngleRad` 必须位于 `(0, 2π]`。总长度为 0 的 Polyline 不具备本次播放所需的 reveal-geometry。上述状态在 `play()` 建立记录前抛出 `CapabilityError`。

## 5. Definition、Runtime 与 Registry

AnimationDefinition 改为无目标运行态的定义；每条目标记录创建独立 Runtime：

```ts
interface AnimationDefinition<S extends AnimationSpec> {
  readonly type: S['type'];
  readonly writeDomains: ReadonlySet<AnimationWriteDomain>;
  readonly requirements: ReadonlySet<AnimationTargetCapability>;
  readonly interactionPolicy: {
    readonly edit: AnimationInteractionPolicy;
    readonly transform: AnimationInteractionPolicy;
  };

  normalize(input: unknown): Readonly<S>;
  create(target: AnimationTargetProfile, spec: Readonly<S>): AnimationRuntime;
}

interface AnimationRuntime {
  readonly slots: readonly AnimationSlotDefinition[];
  readonly visualOutsetPx?: number;
  readonly disableViewportCulling?: boolean;
  rebind(target: AnimationTargetProfile): void;
  sample(context: AnimationFrameContext, output: AnimationFrameBuffer): AnimationSample;
  destroy(): void;
}

interface AnimationSlotDefinition {
  readonly slotKey: string;
  readonly style: StyleSpec;
  readonly dynamicParameters?: readonly AnimationStyleParameter[];
}

type AnimationStyleParameter = 'lineDashOffset' | 'symbolRadius' | 'strokeWidth' | 'rotation';

type AnimationInteractionPolicy = 'follow-preview' | 'pause-and-suppress';

type AnimationSchedule = { readonly kind: 'continuous' } | { readonly kind: 'stable' } | { readonly kind: 'deadline'; readonly atElapsedMs: number };

interface AnimationSample {
  readonly finished: boolean;
  readonly retain?: boolean;
  readonly schedule: AnimationSchedule;
  readonly wakeAtElapsedMs?: number;
}
```

Definition 不保存 Element、Earth、Map 或 Layer 引用。Runtime 只持有自身记录需要的路径指标、provider 工作数据和稳定 slot，不拥有业务 Feature 或 LayerRenderPass。目标 geometry、style、projection 或 layer revision 变化时，Manager 通过 `rebind()` 提供最新目标画像；rebind 不重置由 Manager 维护的 elapsed。

`AnimationSlotDefinition` 在 Runtime 创建时声明固定 slot、稳定 StyleSpec 模板和允许更新的动态标量；`AnimationFrameBuffer` 是 Manager 所有的可复用内部写入缓冲区。Runtime 只更新目标修饰器、slot geometry、opacity 和动态标量，并通过 `AnimationSample.schedule` 表示下一帧、稳定等待或下一截止时间；连续效果可通过 `wakeAtElapsedMs` 声明独立的终态截止时间，保证缺少 Layer render 事件时仍会完成。Manager 取 schedule deadline 与终态 deadline 的最小值注册 Earth 级唤醒。Runtime 不得在每帧构造和冻结大型对象图。`destroy()` 释放 Runtime 缓存且幂等；同 channel replace、stop、remove、目标失效和 Earth.destroy 都必须调用。

`visualOutsetPx` 直接声明 Runtime 动态视觉相对目标 Geometry 的最大 CSS 像素外扩，例如 pulse 的动态最大半径与描边；Manager 将它与 StyleSpec 静态外扩取最大值，而不是把它当作增量重复相加。该值必须是有限非负数。`disableViewportCulling` 仅用于中间展示几何无法被规范几何范围保守包围的 Runtime，例如非 Polyline provider grow。二者都是纯数据元信息，不得把 OL Geometry 或 Canvas 状态带入 Services。

`play()` 必须在任何外部变更前完成 elapsed 0 初始采样，并立即登记该样本的阶跃或终态 deadline；因此从未收到首个 `postrender` 的非 repeat 动画仍能自然完成。rebind 前先用统一 Clock 推进已运行 elapsed，随后基于最新目标立即重采样并重新登记剩余 deadline，不得因 geometry/style/layer revision 变化延后完成时间。pause、hide 和交互抑制在冻结前同样先结算已运行时间，再取消 deadline；恢复时按剩余 elapsed 重新登记。

AnimationRegistry 由 EngineContext 显式注入，保持内部接口。Manager 不导入默认 builtin Registry，也不包含 `pulse`、`dash-flow`、`path-travel` 或新增类型的白名单。Builtins 目录是内置 AnimationDefinition 的单一注册真源。

`alert` 是一个原子 Definition，固定为双峰强度曲线：

```text
[0, 0] -> [0.12, 1] -> [0.24, 0] -> [0.36, 1] -> [0.52, 0] -> [1, 0]
```

相邻关键点之间使用线性插值，phase 精确命中关键点时使用表中值。它不得在内部递归调用 Manager 启动 blink 和 highlight，否则会破坏 handle 原子性、channel 替换和资源所有权。

## 6. 帧输出与确定性合成

Runtime 输出效果意图，而不是最终独立 LayerRenderValue。每个 Runtime 拥有一份 Manager 分配的稳定 buffer；`reset()` 只复位标量和 slot active 状态，不释放或重建 slot：

```ts
interface AnimationFrameBuffer {
  targetOpacity: number | undefined;
  targetGeometry: RenderGeometryState | undefined;

  reset(): void;
  overlay(slotKey: string): AnimationOverlaySlotBuffer;
}

interface AnimationOverlaySlotBuffer {
  active: boolean;
  geometryKind: 'effective-target' | 'snapshot';
  geometry: RenderGeometryState | undefined;
  opacity: number;
  lineDashOffset: number | undefined;
  symbolRadius: number | undefined;
  strokeWidth: number | undefined;
  rotation: number | undefined;
}
```

每个 `slotKey` 必须对应 Runtime 创建时的一份 `AnimationSlotDefinition`，`overlay(slotKey)` 只能返回这份预分配 slot。StyleSpec 模板只在 slot 建立或模板 revision 变化时编译；帧 buffer 只更新 geometry、opacity 和声明过的动态标量，不能传入新的 StyleSpec。未在 `dynamicParameters` 声明的帧参数视为内部协议错误。

AnimationFrameCompositor 按 Element 汇总所有 channel，固定顺序为：

1. 解析独占 target-geometry，得到有效展示几何。
2. 对 target-opacity 做乘法并限制到 `[0, 1]`。
3. 把 `effective-target` overlay 绑定到第 1 步几何。
4. 按记录创建序和 slotKey 稳定排序 overlay。
5. 把目标总 opacity 同时乘到展示替身和该目标的全部 overlay。

写入域规则：

| 写入域          | 效果                                                                       | 合成规则                          |
| --------------- | -------------------------------------------------------------------------- | --------------------------------- |
| target-opacity  | blink、fade                                                                | 乘法，交换顺序不改变结果          |
| target-geometry | grow                                                                       | 独占；不同 channel 同时写入时报错 |
| overlay         | pulse、dash-flow、path-travel、highlight、alert、radar-scan、center-spread | 稳定追加                          |

channel 负责控制与 replace，写入域负责组合安全。总纲中的“不同 channel 可以组合”补充为：“不同 channel 且写入域可组合时组合；互斥写入域明确拒绝。”

典型组合语义：

- fade + blink：两个 opacity 相乘。
- fade + alert：fade 同时降低原目标和告警 overlay 的整体 opacity。
- grow + dash-flow：dash-flow 使用 grow 的有效展示几何。
- grow + highlight/alert：高亮和告警跟随 grow 的有效展示几何。
- 两个不同 channel 的 grow：`play()` 原子抛出 `CapabilityError`，不静默覆盖。

同目标、同 channel 的新动画先通过完整批量校验，再原子替换旧 Runtime。校验失败时旧动画继续运行。

## 7. OpenLayers 展示适配

### 7.1 双渲染路径

OpenLayers Canvas VectorLayer 会在 layer revision、resolution 等条件不变时复用渲染指令；稳定 StyleFunction 每帧读取外部展示状态并不能保证重新执行。若每帧调用 `feature.changed()` 或 `layer.changed()`，会让成本扩大为重建整个业务图层。

因此本设计采用两条渲染路径：

1. **Overlay 路径**：highlight、alert、radar-scan、center-spread 以及现有叠加类效果继续由共享 LayerRenderPass 在 `postrender` 绘制，不修改规范 Feature revision。
2. **Presentation replacement 路径**：fade、blink、grow 第一次接管目标时获取 presentation lease，把规范 Feature 一次性切换为保持命中的透明代理；动画中的基础目标和 overlay 由共享 LayerRenderPass 使用缓存展示替身绘制；最后一个 replacement 效果结束时恢复最新基础样式。

规范 Feature 始终留在原 Source。presentation lease 不得调用 Edit/Transform 使用的 `suppressProjection()`，也不得移除、替换或反向同步规范 Feature。FeatureBinding 在 lease 期间继续把最新 Store geometry 投影到规范 Feature，以维持规范命中；动画中间 geometry 只写展示替身。最新 Store style 保存为租约的基础展示模板，释放时恢复最新状态，不恢复动画启动时的旧快照。

FeatureBinding 为可动画 Feature 安装稳定代理 StyleFunction。批量建立或释放 lease 时，先更新该层全部 lease 状态，再让每个受影响图层最多执行一次 `layer.changed()`；不得逐 Feature 改 Style 并产生 N 次 revision。第一个 replacement lease 建立和最后一个 lease 释放允许各引起一次受影响图层 revision 变化。稳定动画帧不得修改规范 Feature、Source 或 Layer revision。

### 7.2 明确的视觉取舍

使用 OpenLayers 标准 VectorLayer 公共 API 时，无法同时保证逐 Element 隔离更新、完整保留同层交错顺序和 declutter、又不逐帧重建整个图层。

本设计选择稳定帧性能和资源可控性：

- replacement 目标在动画期间绘制于同一业务层普通 Feature 之后。
- 同层 replacement 目标之间按原 zIndex、原渲染顺序和 Element generation 稳定排序。
- 图层之间的顺序保持不变。
- postrender 中的 replacement 展示替身不参与 OpenLayers 原生 declutter。规范透明代理可以继续占用原 Icon、Text 或 Symbol 的 declutter box，以保持其他 Feature 的布局稳定；该行为必须由阶段 0 Spike 验证，若 OL 实际行为不成立则返回设计评审。
- world wrap 由 Adapter 根据 frame extent 和 View 投影生成必要展示副本；副本不进入 Store。
- 对同层严格交错顺序或 declutter 有要求时，用户文档建议把高频动画目标放入独立业务图层。

首版不增加昂贵的逐帧整层重建模式。未来如需要 strict presentation mode，必须另行补充设计并给出明确性能边界。

### 7.3 整体 opacity 与 Style

LayerRenderPass 在立即绘制单个展示替身及其 overlay 时，必须在现有 Canvas alpha 基础上相乘，并保证异常路径恢复上下文：

```ts
context.save();
try {
  context.globalAlpha *= effectiveOpacity;
  drawPresentation();
} finally {
  context.restore();
}
```

整体 opacity 必须覆盖 fill、pattern、stroke、circle symbol、icon、text、文字背景和 decoration，不按 StyleSpec 字段逐帧生成新的 alpha 颜色。

StyleCompiler 仍负责编译结构化 StyleSpec，但只在基础样式、slot 模板、相关 resolution 桶或 rotation 依赖变化时编译。Adapter 增加内部 `CompiledPresentationStyle` handle，通过 OL 公开 setter 更新 geometry-dependent decoration 和已声明的 lineDashOffset、symbolRadius、strokeWidth、rotation 动态标量。固定 style revision、resolution 桶和 rotation 的稳定动画帧不得调用 `StyleCompiler.compile()`。缓存 Style 不得跨 Element 共享可变实例，以免一个目标的展示修改污染其他目标。

grow 与 Decoration 组合时，CompiledPresentationStyle 在当前 resolution 桶按完整目标预计算最大位置集合，并为 start、end、each-segment 和 repeat placement 预分配对应 Style/Geometry slot。中间帧只切换 slot active 并更新有效路径上的位置和旋转，不增删 Style 实例。geometry/style revision 或 resolution 桶变化允许重新建立该池，但不得重置动画 elapsed。首版不允许无法给出有限完整目标位置集合的自定义 decoration 进入 grow。

落地实现中，每个缓存的 base/overlay primitive 独占一个 `CompiledPresentationStyle`，以规范 Feature 作为最大 Geometry、以展示替身作为当前 Geometry。池内 `Style[]`、Decoration `Style` 和 `Point` 在预热后保持身份稳定，当前帧只更新坐标、旋转、dash、半径或宽度并调整 active 数量；slot 淘汰、style 模板替换、RenderPass 清理和 Earth.destroy 都调用 handle 的幂等 `destroy()`。第一版以规范化后的实际 resolution 作为 resolution key；最大规范 Geometry 身份或 revision、该 key、相关 View rotation 变化时重建池并递增 handle revision。固定这些输入时，`compilePresentation()` 和普通 `compile()` 的稳定帧调用数都必须为 0。

在批准实现前必须用 Polygon PatternFill、Icon、Text、Decoration 的组合样式完成 OL 验证 Spike，确认 `globalAlpha` 和立即绘制行为一致；验证失败时不得以每帧深拷贝 StyleSpec 作为退路，应返回设计评审。

### 7.4 Geometry 和稳定 slot

LayerRenderPrimitive 增加内部 `slotKey`。Adapter 把合成后的基础替身与各 channel overlay 分开缓存：

```text
composite base: layerId / element generation / element revision / base
overlay:        layerId / element generation / element revision / channel / slotKey
```

fade + blink 等多个 opacity channel 只共享一个 composite base，不得为每个 channel 创建一份基础替身。

固定拓扑预热后，每帧禁止创建新的 OL Feature、Geometry、Style、StyleCompiler 或编译闭包。Geometry 只使用 OL 公共 `setCoordinates()`、`setCenter()`、`setRadius()` 原地更新。不得使用 OL 私有 flat-coordinate API。

GeometryCodec 和 LayerRenderPass 不得各自维护不同的 RenderGeometry 转换实现；实现阶段应抽取或复用同一个公共 Adapter 内部投影函数。

## 8. 各效果精确定义

### 8.1 blink

- 要求 structured-presentation，写入 target-opacity。
- 每周期从 phase 0 开始处于 `maxOpacity`；`phase < dutyCycle` 时为 max，否则为 min。
- minOpacity 和 maxOpacity 都是乘到目标现有展示 alpha 上的整体乘数，不覆盖 StyleSpec 中已有的颜色 alpha、Icon opacity 或 Text opacity。
- 它是阶跃闪烁，不在两个 opacity 之间插值；需要平滑呼吸时使用 `highlight.mode: 'breathe'` 或 fade。
- repeat 为 false 时完成一个周期并移除效果。
- 调度器只在下一次状态切换或完成边界唤醒，不以 60Hz 空转。
- 与 fade 组合时 opacity 相乘。

### 8.2 highlight

- 要求 closed-surface 和 structured-presentation，写入 overlay。
- steady 使用固定强度，不持续请求动画帧；地图因其他原因重绘时仍恢复 overlay。
- steady 的 intensity 固定为 1。breathe 令 `phase = (elapsedMs % periodMs) / periodMs`，并使用 `intensity = 0.35 + 0.65 * (0.5 - 0.5 * cos(2π * phase))`。
- 令 Color 自身 alpha 为 `colorAlpha`：填充 alpha 为 `colorAlpha * fillOpacity * intensity`，描边 alpha 为 `colorAlpha * intensity`。`fillOpacity` 不限制描边最大 alpha。
- overlay 使用 effective-target 几何，不修改目标原 StyleSpec。
- Polygon 使用填充和描边；Circle 使用同等语义的圆填充和描边。

### 8.3 alert

- 要求 closed-surface 和 structured-presentation，写入 overlay。
- 使用第 5 节固定双峰曲线，不暴露任意 keyframe 数组。
- fill、stroke 和外扩光晕共享同一强度曲线。填充 alpha 为 `colorAlpha * fillOpacity * intensity`，描边 alpha 为 `colorAlpha * intensity`，光晕 alpha 为 `colorAlpha * 0.35 * intensity`；首版固定使用 fill、stroke、glow 三个 overlay slot。三者保留原 Color 表达并通过 slot opacity 与整体 `globalAlpha` 相乘，不能依赖只覆盖十六进制颜色的字符串改写。
- repeat 为 false 时完成一个周期并移除。
- alert 不递归创建 blink 或 highlight。

### 8.4 grow

- 要求 reveal-geometry 和 structured-presentation，独占 target-geometry。
- progress 由 elapsed/duration 经 easing 后限制到 `[0, 1]`。
- forward 和 reverse 都从空展示逐步揭示到完整图形，只改变揭示顺序；reverse 不是从完整图形开始收缩。
- repeat 为 false 时 progress 到 1 后移除临时 geometry；规范 Feature 的完整图形无缝接替。
- 普通 Polyline 按累计长度切片，每帧二分定位末端，不按顶点数量平均推进；forward 揭示路径前缀，reverse 揭示从终点开始的路径后缀。
- LunePolyline 和 CurvePolyline 使用其最终渲染路径的累计长度，不直接按控制点连线。
- FineArrow、TailedSquadCombatArrow、AssaultDirectionArrow 的 forward 从尾部向箭头头部揭示，reverse 从头部向尾部揭示。
- AttackArrow、TailedAttackArrow 的 forward 沿有序控制路径从尾部向头部揭示，reverse 沿相反顺序从头部向尾部揭示。
- DoubleArrow forward 从共同根部向两个箭头头部并行揭示；reverse 从两个头部向共同根部并行揭示，progress 1 时同样得到完整 DoubleArrow。不得按最终 Polygon 外环顺序裁剪。
- progress 为 0 或中间控制状态不足以生成有限非退化 Polygon 时，provider 返回 undefined，Adapter 不绘制展示替身。
- 箭头 provider 复用各 ShapeDefinition 的既有生成算法，不复制第二套箭头几何实现。

### 8.5 radar-scan

- 要求 radial-frame 和 structured-presentation，写入 overlay。
- Circle 扫描完整 `2π`；Sector 只扫描自身 sweep，尾迹严格裁剪在 Sector 内。
- Circle phase 0 从 View 坐标正 Y 方向开始；Sector phase 0 从与 direction 对应的边界开始，保证一个周期覆盖完整 Sector。
- clockwise 和 counterclockwise 表示最终屏幕上的视觉旋转方向；View rotation 不得改变方向含义。
- beamWidthDeg 是尾迹角宽，Circle 最大为 360°，Sector 最大为自身 sweep。
- 尾迹把 beamWidthDeg 均分为固定 slot；最新 slot 强度为 1，第 `i` 个旧 slot 的强度为 `1 - i / slotCount`。最终 alpha 为 `colorAlpha * opacity * slotIntensity * targetOpacity`。
- 尾迹使用固定数量扇形 slot，默认 10，硬上限 16；不随播放时长增长。
- repeat 为 false 时完成一轮扫描并移除。

### 8.6 center-spread

- 要求 radial-frame 和 structured-presentation，写入 overlay。
- Circle 绘制完整扩散环；Sector 绘制裁剪在自身 sweep 内的扩散弧，不越过两条边界射线。
- `periodMs` 表示单个环从中心传播到外半径的寿命。发射间隔 `interval = periodMs / ringCount`，第 `i` 个 slot 首次发射时间为 `i * interval`；repeat 为 true 时该 slot 此后每隔 periodMs 再次发射。
- 有效环进度为 `p = (elapsedMs - emittedAt) / periodMs`；只在 `0 <= p < 1` 时绘制，半径为 `radialRadius * p`，最终 alpha 为 `colorAlpha * (1 - p) * targetOpacity`。
- ringCount 硬上限为 5；每个 slot 的弧线采样数按屏幕误差和 resolution 桶缓存并设置硬上限。
- repeat 为 false 时每个 slot 只发射一次，完成时间固定为 `periodMs + (ringCount - 1) * interval`；最后一环完成后移除全部 slot。

### 8.7 fade

- 要求 structured-presentation，写入 target-opacity。
- fade-in 从 0 插值到 1，固定 remove；完成后移除 modifier，由普通目标继续完整展示。
- fade-out 从 1 插值到 0，固定 retain；完成后 Handle 进入 finished、`finished` Promise 兑现，但最后一帧展示资源继续保留。
- retained fade 不再采样或请求地图帧；对 finished Handle 调用 `stop()` 仍必须清除最终帧。
- fade 不修改 `ElementState.visible`。需要永久隐藏时，调用方在 `finished` 后先显式 hide，再 stop 清理 retained 帧，避免闪回。
- fade-in 不会让业务 `visible: false` 的 Element 自动变为可见；调用方应先 show，再播放 fade-in。
- fade 的 opacity 同时作用于目标展示替身及其全部 overlay。
- fade 插值结果是乘到目标现有展示 alpha 上的整体乘数，不覆盖 StyleSpec 自身 alpha。

## 9. 生命周期、状态变化与交互

### 9.1 Handle 与 Element 生命周期

- pause 冻结 elapsed；resume 从原 elapsed 继续，不累计暂停时间。
- hide 暂停该目标动画并撤下展示替身和 overlay；show 重新绑定最新 View 状态并继续。
- stop 清除 Runtime、retain 帧、presentation lease 和全部 slot，且幂等。
- remove 和 Earth.destroy 停止相关动画并释放资源。
- copy、snapshot 和事务历史不复制动画记录、elapsed、lease 或缓存。
- Element layerId 改变时，动画记录保持 elapsed，先从旧 LayerRenderPass 解绑，再绑定新层；中间不得同时绘制两份。
- geometry revision 改变时失效路径和径向缓存，并以当前 progress 对最新 View geometry 重新采样。
- style revision 改变时只重新编译受影响目标的展示样式，不重启动时间线。
- 目标变为不兼容 Shape 或 NativeStyleRef 时停止该目标记录并清理展示资源；不得继续使用旧几何或静默降级。

### 9.2 Edit 与 Transform

交互策略由每个 Definition 的 `interactionPolicy` 元数据声明，Manager 不按类型或写入域推断：

| Definition                                                     | Edit               | Transform                                       |
| -------------------------------------------------------------- | ------------------ | ----------------------------------------------- |
| pulse                                                          | pause-and-suppress | pause-and-suppress，保持现有 Point 变换暂停语义 |
| dash-flow                                                      | pause-and-suppress | follow-preview，保持现有 Transform preview 语义 |
| path-travel                                                    | pause-and-suppress | follow-preview，保持现有 Transform preview 语义 |
| blink、highlight、alert、grow、radar-scan、center-spread、fade | pause-and-suppress | pause-and-suppress                              |

pause-and-suppress 表示冻结 elapsed，暂时隐藏动画展示资源，把视觉所有权交给交互预览；会话完成、取消或打开失败后恢复原 elapsed 和最新 ElementState。动画不得修改交互工作态，交互也不得提交动画中间几何。

follow-preview 表示 elapsed 继续推进，Runtime 使用 AnimationPreviewPort 提供的 View 工作几何；会话清除 preview 后立即恢复最新规范几何。Edit 首版不向动画发布逐帧 preview，因此全部 Definition 在 Edit 中使用 pause-and-suppress。

### 9.3 命中与范围

首版保持规范 Element geometry 的命中语义：

- fade 到 0、blink 处于低 opacity 或 grow 尚未展示的部分仍可命中。
- overlay 不扩大业务命中范围，不生成独立 Element 事件目标。
- Selector、query、ContextMenu 和业务范围查询继续读取 ElementState，不读取动画帧。
- presentation lease 使用透明 hit proxy 保持规范 fill、stroke、symbol 的命中范围。
- `getScreenExtent()` 返回规范 Element 的屏幕范围，不随 grow 或扩散环变化。

该语义类似 DOM 中 `opacity: 0` 默认仍接收 pointer event，避免首版维护第二套逐帧动画命中索引。未来若需要“命中跟随展示几何”，必须另行设计，并覆盖 world wrap、declutter 和交互优先级。

在批准实现前必须验证透明 hit proxy 对无填充 Polygon、PatternFill、不同 Stroke、Icon、CircleSymbol 和 Text 的 OpenLayers 命中行为。验证失败时返回设计评审，不允许用删除规范 Feature 的方式规避。

## 10. 坐标、角度和样式边界

- 所有 Runtime 使用 ShapeProjectionPort 生成的 View 工作状态和 RenderGeometry，不读取 OL Feature geometry 作为业务输入。
- Circle 的业务 radius 始终是米；radial-frame 中的 radius 始终是当前 View 投影单位。
- radial-frame 内部角度单位为弧度，0 沿 View 坐标正 X，正方向沿 `center + [r * cos(angle), r * sin(angle)]` 的角度增加方向。
- 公共 `beamWidthDeg` 使用角度，normalize 后只在内部转换为弧度。
- View rotation、pixelRatio 和 extent 由 LayerRenderFrame 以纯数据传入 Services；Core 不接触 OL FrameState。
- StyleSpec 是新增效果的唯一稳定样式输入。动画颜色与源 Color alpha 相乘，不覆盖调用方 alpha。
- 第一版所有新增效果遇到 NativeStyleRef 都在 `play()` 原子抛出既有 `UnsupportedOperationError`，不静默忽略、不只为部分目标播放。

## 11. 性能与资源预算

### 11.1 调度

- 一个 Earth 只有一个时间调度器；禁止每记录 `setTimeout`、RAF 或 render listener。
- EngineContext 显式注入 `AnimationClockPort` 和 `AnimationWakePort`。OpenLayers 10.9 Adapter 的 `now()` 使用与 `frameState.time` 相同的 `Date.now()` 时钟域；测试 Adapter 使用同域可控时钟。不得混用 `performance.now()` 和 epoch time。

```ts
interface AnimationClockPort {
  now(): number;
}

interface AnimationWakePort {
  scheduleAt(timestamp: number, callback: () => void): { cancel(): void };
}
```

- `AnimationWakePort.scheduleAt(timestamp, callback)` 返回可幂等 cancel 的单次句柄。连续效果使用共享地图帧；阶跃 blink 和自然完成截止时间只保留 Earth 级一个最小截止唤醒。截止时间重排时先取消旧句柄；Earth.destroy 取消当前句柄；回调携带调度代次，陈旧或已取消回调不得推进状态。
- wake 回调只唤醒统一 Manager tick 或请求一次 render，不直接为单条记录采样或绘制；测试时钟必须能确定性推进 now 和触发到期 wake。
- 多个活动图层在同一 frame time 内最多请求一次 `map.render()`。
- paused、hidden、steady highlight、retained fade 和全部离屏目标不持续请求地图帧。
- 非 repeat 记录的终态推进不依赖 Layer `postrender`；即使图层隐藏、离屏或没有 render 事件，统一 tick 也必须按 ClockPort 完成记录、兑现 `finished` 并释放非 retain 资源。
- 合成后 targetOpacity 为 0 时，该目标下的 repeat alert、radar 等连续 Runtime 不再请求地图帧；其 elapsed 仍按绝对时间推进，opacity modifier 清除后按当前 phase 恢复绘制。
- deadline tick 必须把“推进 Runtime、重排下一 deadline 和同步 RenderPass 生命周期”与“请求地图重绘”分开。deadline 边界前后均有仍参与最终状态的零 opacity modifier（`!sample.finished || sample.retain`）完全遮蔽目标时，repeat blink 仍按每个阶跃推进并登记下一 deadline，但不得在每个边界请求 render；首次进入或离开全透明状态仍须请求重绘，已完成且不 retain 的记录不得继续参与遮蔽判定。最近一帧已用第 11.4 节规则保守判定目标离屏时，中间阶跃同样不请求 render。上述抑制不得阻止非 repeat 记录在终态 deadline 兑现 `finished`、清理 Runtime/lease/slot，或在遮蔽 modifier 清除后按最新 phase 恢复。

Earth 级 deadline scheduler 以记录 ID 保存最新绝对截止时间，并用带 revision 的最小堆惰性淘汰旧节点；平台侧始终只有堆顶对应的一个 wake handle。同一时刻的全部到期记录在一次统一 tick 中消费，随后再登记新的堆顶。取消顺序先递增调度代次、再调用 handle.cancel，确保同步迟到回调和已在事件队列中的旧回调都不能推进状态。

Earth 级 `LayerRenderPass` 同时为显式 `requestRender()` 和各图层 batch 的 `requestNextFrame` 提供一个共享门闩。第一次请求调用 `map.render()` 并置位；观察到新的有限 `frameState.time` 时才清除门闩。相同 time 的后续图层只消费该帧，不重复请求；`map.render()` 同步抛错时清除门闩并向调用方传播，避免永久饿死后续请求。

### 11.2 缓存与对象

固定拓扑完成预热后，稳定帧不得创建新的 OL Feature、Geometry、Style、StyleCompiler 或编译闭包。合成基础替身按 Element 身份缓存，overlay 按 Element、channel 和 slotKey 缓存，具体键遵循第 7.4 节。

展示样式缓存还必须持有并负责销毁对应的 `CompiledPresentationStyle`。规范完整 Geometry 决定 Decoration 池容量，当前中间 Geometry 只能在该容量内更新预分配 slot；固定规范 Geometry revision、StyleSpec 身份、resolution key 和 rotation 时，300 个稳定帧中的 Feature、Geometry、Style、Decoration Point 与样式编译新增数都为 0。

下列路径必须失效或释放对应缓存：

- stop、replace、remove、Earth.destroy；
- layerId、Element generation、geometry revision、style revision 变化；
- hide/show；
- Edit/Transform 取得或释放视觉所有权；
- presentation lease 从 0 变为 1 或从 1 变为 0。

每帧只遍历活跃记录和仍需绘制的 retained 记录，不遍历整个 ElementStore。Runtime 使用可复用 frame buffer 和稳定 slot；不得每帧深拷贝完整 Polygon、StyleSpec 或冻结大对象图。

### 11.3 几何与图元上限

- radar tail 默认 10 个 slot，硬上限 16。
- center-spread 默认 3 个 slot，硬上限 5。
- 弧线采样按屏幕误差和 resolution 桶缓存，并设置实现常量硬上限。
- grow 在 geometry revision 变化时计算一次累计长度，每帧二分定位终点。
- Plot 箭头 reveal session 在 rebind 时缓存控制点、分支、累计长度、B-spline/Bezier 权重和中间算法工作区；稳定 sample 原地复用 Polygon、ring 与坐标槽，输出顶点数不得随播放时长增长。
- highlight 和 alert 复用有效 RenderGeometry，不每帧深拷贝完整区域。
- path-travel 迁移时把渐变轨迹改为固定分段预算，不按每个采样点生成 Feature。
- opacity 为 0 或有效几何为空的 slot 不进入绘制。

### 11.4 视口裁剪

LayerRenderFrame 增加纯数据 `extent`、`pixelRatio`、`rotation` 和可选 `worldWidth`。离屏目标跳过 Runtime 采样、几何生成、样式准备和绘制，也不请求连续地图帧；Manager 仍按 `frameState.time` 推进 elapsed，并保留最近 View frame 供 deadline/rebind 使用。

裁剪必须使用 conservative visual bounds，而不是裸 RenderGeometry extent。Manager 对已准备目标的规范 RenderGeometry 缓存纯数据 bounds，并从结构化 StyleSpec 计算 CSS 像素外扩：至少覆盖宽 Stroke 及 miter、CircleSymbol、已知尺寸/anchor/scale/displacement 的 Icon 和 Decoration；目标存在 opacity/geometry modifier 时还要计入基础样式，所有 Runtime slot 样式与 `runtime.visualOutsetPx` 取最大值。Text、未知 Icon 尺寸或任何无法可靠估算的样式直接禁用该目标裁剪，不允许以可能漏画换取性能。

CSS 像素外扩按当前 resolution 转为 View 单位后再扩展 bounds。radar 和 center-spread 的径向几何被规范 Circle/Sector 范围包围，pulse 用 `visualOutsetPx` 补充动态外扩；非 Polyline provider grow 因中间 Polygon 不能证明被最终 bounds 包围，设置 `disableViewportCulling`。当 Adapter 提供正有限 `worldWidth` 时，交集测试必须判断任意整数世界平移副本，而不是只比较规范世界坐标；未提供时只比较当前世界，提供非法值时禁用该目标裁剪。

`LayerRenderPass` 枚举每个 primitive 的 world copy 时必须复用同一套 StyleSpec 视觉外扩规则，并把当前帧 `symbolRadius`、`strokeWidth` 动态覆盖与 Layer `renderBuffer` 一并按 CSS 像素相加，再按 resolution 转为 View 单位；不能在 Manager 已保留目标后退回裸 Geometry extent。Text、未声明 `size` 的 Icon 或其他无法可靠估算的 primitive 样式，Adapter 至少按 Geometry center 与 `frameState.extent` 枚举覆盖各可见世界并夹住两侧边界的相邻副本，多世界视口同样适用；极远世界和超量副本继续使用有限、可前进的安全上限。

### 11.5 自动化性能门槛

不依赖机器速度的结构门槛：

- 同层 1000 个动画只有一个 `postrender` listener。
- 多层活动动画在同一 frame time 内最多请求一次下一帧。
- 固定 style revision、geometry topology、resolution 桶和 rotation 的场景预热后连续 300 帧，新增 OL Feature、Geometry、Style 和 StyleCompiler.compile 调用数均为 0。
- 稳定 replacement 帧中 Layer、Source 和规范 Feature revision 不变。
- stepped blink 在两个切换边界之间不产生连续帧。
- paused、hidden、retained 和全部离屏时不产生无效连续帧。
- 连续 100 次 play/stop 后，record、slot、Feature、Geometry、Style、listener 和 RenderPass 数量恢复基线。
- Earth.destroy 后上述资源计数为 0。
- 任意效果的 slot 数不超过本设计硬上限。

普通 CI 只执行上述确定性结构门槛、manifest/场景闭包和纯数据统计算法契约，不执行依赖宿主硬件的帧间隔断言。`test/browser/animation-benchmark.contract.spec.ts` 使用合成样本验证平均值、P95、长帧比例和显式门槛开关；常规 `playwright.config.ts` 继续忽略 `*.performance.spec.ts`。因此 CPU 调频、共享 runner 抢占或无头 Chromium 偶发抖动不会让普通 CI 误报。

浏览器基准统一使用 `1280 x 720` viewport、DPR 1、仓库锁定的 Chromium、固定 View resolution 和固定随机种子。连续效果在 slot/style pool 建立后执行 120 个实际地图动画帧预热，再采样 600 个实际 `map` render/AnimationManager tick；不得用没有地图渲染的普通浏览器 RAF 填充样本。基准 manifest 记录 Chromium 版本、runner CPU、操作系统和每个场景的屏幕覆盖率。场景固定为：

- 1000 个按网格分布、6 CSS px CircleSymbol 的 Point：blink 运行 20 个完整 period 并验证边界唤醒；fade 使用 `durationMs: 20000`，保证预热和采样期间持续改变 opacity。
- 500 条各 32 个顶点、2 CSS px Stroke 的 grow Polyline，使用 `repeat: true`。
- 128 个屏幕半径 40 CSS px 的 Circle，分别运行 radar-scan 和 center-spread。
- 10000 个静态 Point 与同层 32 个 fade/grow replacement 目标混合。
- 256 个目标运行 fade + blink、grow + dash-flow、grow + alert 组合；其中 fade 使用 20000ms，grow 使用 repeat。
- 上述场景的全部离屏版本，以及跨世界副本场景。

批量 `play()`、首次 lease、slot/style pool 建立和首帧的启动成本单独计时，不混入稳定帧结果；连续 100 次批量 play/stop 同时作为启动回归和资源恢复场景。

最低压力门槛为：

```text
平均帧间隔 <= 25ms
P95 <= max(35ms, idle P95 * 2.5)
超过 50ms 的帧 <= 5%
```

显式性能运行先在相同页面、viewport 和 View 下采集无动画的实际 map `postrender` idle 基线，再对每个稳定场景计算上述统计。`npm run test:performance:animation:record` 默认只记录选定场景及环境证据，不断言硬件门槛；`npm run test:performance:animation` 默认选择全部场景和变体，并通过显式环境开关执行门槛断言。`OL_ENGINE_ANIMATION_BENCHMARK_SCENARIO` 可以把两种入口收窄到 `scenario[:variant]`。manifest 中 `sampling.absoluteHardwareThresholds: false` 表示普通/记录模式不自动执行硬门槛，不表示门槛未定义；门槛值、idle 采样数和断言环境变量由 manifest 的独立 `thresholds` 节固定。

阶段 0 必须先在参考 runner 上验证这些场景和阈值；失败时返回设计评审，不能在实现中静默降低目标数量。该门槛是回归检测，不构成 60 FPS 产品承诺。任何对外容量声明都必须同时给出硬件、浏览器、目标数量、平均顶点数、屏幕覆盖面积、DPR 和效果配置。

## 12. 错误模型

- Spec 字段、范围、互斥参数或对象结构非法：`InvalidArgumentError`。
- Shape 能力、radial/reveal provider 或写入域不支持：`CapabilityError`。
- 已销毁 Earth、Manager、Element 或 Handle 的非幂等操作：`ObjectDisposedError`。
- 同目标不同 channel 的两个 target-geometry writer：`CapabilityError`，错误消息包含目标 ID、现有 channel 和请求 channel。
- 批量 Selector 任一目标失败时，错误包含首个失败目标和原因；不得跳过、部分播放或部分 replace。
- NativeStyleRef 请求新增效果：沿用现有结构化动画契约，抛出 `UnsupportedOperationError`。
- 所有错误都在 `play()` 建立记录前完成同步校验；运行期业务状态变化导致不兼容时停止记录并清理，不保留旧展示快照。

不允许静默选择相似效果、降低几何精度到规格下限以下、跳过不兼容目标或自动修改调用方配置。

## 13. 实施分解

批准后按以下阶段制定实施计划，每阶段保持类型检查、单元测试和构建通过，并设置独立审查点：

### 阶段 0：OpenLayers 验证 Spike

- 验证 `globalAlpha` 对 PatternFill、Icon、Text、Decoration 的完整语义。
- 验证透明 hit proxy 对 Point、Polyline、Polygon、Circle 和组合 Style 的命中范围。
- 验证 replacement 与同层 zIndex、declutter、world wrap 的实际行为，形成浏览器证据。
- 任一关键假设失败时先修订并重新批准本文，不进入公共 API 实现。

验证结果：仓库锁定的 Chromium 与 OpenLayers 10.9 组合下，Point/Icon、Polyline、PatternFill Polygon 和 Circle 的透明规范代理继续保留命中索引，透明代理能够保留原 declutter 占位，`globalAlpha` 能整体作用于立即绘制的 replacement。replacement 在同层普通 Feature 之后绘制，不进入原生命中索引和 declutter；world wrap 由 Adapter 生成展示副本。该结果符合第 7.2、7.3 和第 9 节已接受的边界，严格同层交错顺序或 replacement declutter 仍建议拆分业务图层。

### 阶段 1：效果内核与热路径重构

- 引入 AnimationRuntime、FrameBuffer、Compositor、写入域和 presentation lease。
- AnimationRegistry 改为 EngineContext 必传，删除 Manager 内置白名单。
- 重构 LayerRenderPass 的稳定 slot 和对象缓存，消除逐帧 Feature、Geometry、Style 创建。
- 迁移 pulse、dash-flow、path-travel；除已批准移除的 path-travel 箭头能力外，不改变公共行为。
- 把内部 transient blink 改名并迁移到共享时间线工具。

### 阶段 2：通用 opacity 与闭合面效果

- 实现 blink、fade、highlight、alert。
- 覆盖完整 StyleSpec、retain、稳定 highlight、阶跃调度和组合规则。

### 阶段 3：路径与箭头 grow

- 抽取路径累计长度、切片和二分定位工具。
- 先实现 Polyline、LunePolyline、CurvePolyline。
- 再为全部箭头增加 reveal provider，单独验收 DoubleArrow。

### 阶段 4：径向效果

- 为 Circle 和 Sector 增加 radial provider。
- 实现 radar-scan、center-spread、弧线采样缓存、固定 slot 和 world wrap。

### 阶段 5：公共切换与代码门槛

- 更新根导出、公共 API manifest、consumer fixture、能力清单和 acceptance scenario。
- 运行 `npm run verify:code` 或总纲规定的等价代码验证门槛。
- 冻结公共 API 后再进入用户文档步骤。

### 阶段 6：website、TypeDoc 与迁移说明

- 按第 15 节建立唯一归属页和同源可运行示例。
- 更新 TypeDoc 源 JSDoc，不手工编辑生成页面。
- 更新 2.0 发布说明和迁移说明中的 AnimationType 扩展策略。
- 运行 `npm run docs:build` 和完整 `npm run verify`。

## 14. 自动化测试矩阵

测试至少覆盖：

1. 每个 Spec 的默认值、边界、未知字段、非法对象、输入不变性和错误类型。
2. Point、Polyline、Polygon、Circle、全部闭合 Plot、全部箭头和 NativeStyleRef 的正反能力矩阵。
3. blink 切换边界、alert 双峰关键点、easing 边界、repeat 和自然完成。
4. target-opacity 乘法、visibility AND、geometry 独占、overlay 稳定顺序和同 channel 原子 replace。
5. fade + blink、fade + alert、grow + dash-flow、grow + highlight 和非法双 grow。
6. PatternFill、MultiStroke、Symbol、Icon、Text、背景和 Decoration 的整体 opacity。
7. Polyline 端点、重复点、零长度段、CurvePolyline、LunePolyline 和全部箭头 grow。
8. DoubleArrow 双支并行、reverse、progress 0 和 provider 非退化约束。
9. Circle 在不同纬度和 View 投影下的米制半径转换；Sector 起止边界、方向和 beam 裁剪。
10. hide/show、pause/resume、stop、retain、remove、layerId 变化、style/geometry revision、copy、snapshot 和 Earth.destroy。
11. Edit/Transform 完成、取消、替换和打开失败后的 pause-and-suppress 恢复。
12. 规范命中、透明 hit proxy、overlay 不扩展命中和 ScreenExtent 不随动画变化。
13. 多 Earth 时钟、Registry、RenderPass、projection 和 destroy 隔离。
14. 第 11 节的结构、浏览器压力和资源泄漏门槛。
15. 根导出、`animationTypes` 顺序、公共 API 快照、strict consumer 和离线安装。

旧有 V1 到 V2 能力对等矩阵保持冻结，不把新增动画伪装成旧版对等能力。新增独立的 2.0 动画效果 manifest，至少记录：

```text
animationType / targetCapability / supportedShapeTypes / writeDomains /
implementation / testFiles / websitePage / acceptanceScenario / nativeStylePolicy
```

manifest 必须由自动化测试校验实现、测试、网站归属页和 acceptance scenario 闭包。

## 15. website 文档与可运行示例约定

AnimationManager 只有一个规范归属入口。大型对称行为按 website 规则拆分为以下页面或同等层级的行为族：

1. 动画总览、Handle、Selector、channel 和组合规则。
2. 闭合面效果：blink、highlight、alert。
3. 路径与箭头效果：grow、dash-flow、path-travel。
4. 圆形与扇面效果：pulse、radar-scan、center-spread。
5. 渐隐渐显、retain 和生命周期。

每种效果页面必须包含：

- 最小 `earth.animations.play()` 调用。
- 精确兼容的 Shape 或目标能力，以及不支持目标的错误。
- 所有字段、默认值、范围、单位和完成行为。
- 默认 channel、同 channel replace 和跨 channel 合成结果。
- hide/show、pause/resume、stop、remove、destroy、Edit 和 Transform 行为。
- NativeStyleRef 边界。
- retain 清理和永久隐藏的正确顺序。
- 同层 zIndex、declutter、命中与独立动画图层建议。
- 资源清理示例。

运行示例与展示源码必须引用同一个 Vue 组件。示例按 AnimationType acceptance manifest 生成或校验，禁止维护写死的三分支选择器。每个示例提供启动、暂停、恢复和停止控件；闪烁、呼吸和告警不得在页面加载时自动播放，并显示光敏性风险提示。

每个 ExampleBlock 使用稳定 `example-*` 锚点并进入右侧目录。API 名称、类型和方法按 `website/AGENTS.md` 使用正确页内链接和视觉样式。页面在浅色、深色和窄屏下完成检查，地图底图统一使用 `createConfiguredLayer`，不得写入私有地图地址或 token。

TypeDoc 页面由源码 JSDoc 生成，不手工编辑 `website/public/api` 产物。提交前运行 `npm run docs:build`，最终发布前运行完整 `npm run verify`。

本文批准后，应在 `website/AGENTS.md` 增加“动画页面约定”，把本节的兼容矩阵、组合、生命周期、清理和光敏性提示设为动画文档的固定检查项。

## 16. 完成定义与批准动作

实现完成必须同时满足：

- AnimationManager 中不存在内置 AnimationType 或 ShapeType 白名单。
- AnimationRegistry 由 EngineContext 显式注入，builtins 是单一注册真源。
- 每个 Earth 一个时间源，每个活动 VectorLayer 一个 RenderPass，无逐 Element RAF、timer 或 render listener。
- 动画帧不写 ElementState，不替换规范 Feature geometry，不进入 copy 或 snapshot。
- 现有 pulse、dash-flow、path-travel 除明确移除的 path-travel 箭头能力外，公共行为和默认值保持兼容。
- 新增效果全部通过能力、组合、生命周期、命中、性能和资源清理矩阵。
- 固定拓扑预热后稳定帧不创建 OL Feature、Geometry 或 Style，不重建规范图层 revision。
- 从未收到首个 `postrender` 的非 repeat 动画仍按 deadline 自然完成；批量 replace 的任意安装失败不影响旧记录。
- 离屏目标不采样或持续请求帧，跨世界可见副本不被误裁剪；无法证明安全的动态几何和样式禁用裁剪。
- 多个活动图层在相同 `frameState.time` 内合计最多调用一次 `map.render()`，稳定 presentation pool 通过 300 帧对象身份与编译计数验证。
- fade-out retain、DoubleArrow grow、Sector radar 和 interaction pause-and-suppress 具有明确自动化证据。
- 公共导出、manifest、TypeDoc、website、可运行示例和迁移说明同步。
- 代码阶段和文档阶段分别通过总纲规定的门槛。

批准登记完成后，先执行阶段 0 Spike；关键假设通过后才修改公共 AnimationSpec。若 Spike 推翻透明 hit proxy、`globalAlpha` 或 replacement 排序假设，必须修订本文并重新获得确认。
