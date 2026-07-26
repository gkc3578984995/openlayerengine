# 2.0 路径线饰工厂易用性与衬色补充设计

## 文档状态

- 状态：已批准
- 日期：2026-07-26
- 批准记录：用户确认保留 `linework`，简化 `lineStyles.polyline()` / `lineStyles.polygon()` 输入，并增加可配置轨道宽度与内侧、外侧、居中衬色
- 阶段性补充（已由下条修订）：2026-07-26，用户反馈衬色不得干扰端帽显示；当时先要求 casing 避让端帽 footprint、前景轨道保持完整
- 补充修订：2026-07-26，用户进一步确认宽轨端帽、沿线装饰和双轨间距必须随 `tracks.width` 正确布局；端帽锚点保持在真实起终点，foreground 与 casing 的可见 paint 都避让端帽 footprint
- 补充：2026-07-17-v2-linework-style-factory-design.md
- 关联：2026-07-18-v2-polygon-inner-ring-and-hole-design.md

本文完整替代原 Linework 设计中关于工厂输入、调用示例、固定轨道宽度、验证矩阵和用户文档的条款。未被本文修改的轨道、端帽、装饰、路径文字、切口、Polygon outer ring、动画、命中、缓存和生命周期规则继续有效。

## 1. 目标与边界

1. 保留两个 `lineStyles` 工厂及展开后的 `StyleSpec.linework`，不与顶层 `strokes` 合并。
2. 把工厂输入拆为 `tracks`、`casing`、`caps`、`decoration`，避免轨道与装饰形成顶层类型笛卡尔积。
3. 单轨和双轨均可配置每条前景轨道的宽度；双轨间隙、内置端帽和装饰物必须随宽度派生，不得继续假设轨道固定为 2px。
4. casing 按完整轨道视觉包络生成，单侧默认露出 2 CSS px，并与前景轨道处于同一个 Element 和 Linework 中。
5. 工厂同步拒绝非法跨维度组合；Core 状态不保存工厂参数或回调。

## 2. 公共工厂输入

```ts
export type LineTracksOptions =
  | {
      mode?: 'single';
      pattern?: LinePattern;
      patterns?: never;
      width?: number;
    }
  | {
      mode: 'double';
      pattern?: never;
      patterns?: readonly [LinePattern, LinePattern];
      width?: number;
    }
  | {
      mode: 'none';
      pattern?: never;
      patterns?: never;
      width?: never;
    };

export type LineCasingType = 'inner' | 'outer' | 'center';

export interface LineCasingOptions {
  color: Color;
  type?: LineCasingType;
  width?: number;
}

export type LineDecorationOptions =
  | TrackedLineDecorationType
  | DecorationOnlyLineType
  | {
      type: Extract<TrackedLineDecorationType, 'center-cross' | 'center-dot' | 'center-dot-pair'>;
      repeatSpacingPx?: number;
    }
  | {
      type: 'inline-text';
      text: string;
      style?: InlineLineTextStyleOptions;
      repeatSpacingPx?: number;
    };

export interface PolylineLineStyleOptions {
  color?: Color;
  tracks?: LineTracksOptions;
  casing?: LineCasingOptions;
  caps?: LineCapsOptions;
  decoration?: LineDecorationOptions;
}

export interface PolygonLineStyleOptions {
  color?: Color;
  tracks?: LineTracksOptions;
  casing?: LineCasingOptions;
  decoration?: LineDecorationOptions;
}
```

### 2.1 默认值与局部规则

- 省略 `tracks` 等价于 `{ mode: 'single', pattern: 'solid', width: 2 }`。
- `single` 只使用 `pattern`；`double` 只使用二元 `patterns`，省略时为 `['solid', 'solid']`；`none` 不接受 pattern 或 width。
- `tracks.width` 是每条前景轨道的正有限 CSS 像素宽度。双轨始终保留 4 CSS px 的透明净间隙；设每轨宽度为 `W`，offset 为 `-(W / 2 + 2)` 与 `+(W / 2 + 2)`，所以默认 `W = 2` 时仍为 `-3 / +3`。
- `casing.type` 默认为 `center`；`casing.width` 默认为 2，表示单个指定方向实际露出的正有限 CSS 像素厚度，而不是最终派生 Stroke 总宽度。
- 普通 decoration 使用字符串短写。只有三种中心 glyph 和 `inline-text` 使用对象携带 `repeatSpacingPx`；`inline-text` 还必须提供非空 `text`，文字外观位于 `style`。
- Polyline caps 只允许单轨；Polygon 不接受 caps。
- `none` 必须与 `decoration: 'slash'` 组合，且不能配置 casing 或 caps；有轨道时不能使用 slash。

原顶层 `lines`、`text`、`textStyle`、`repeatSpacingPx` 删除，不保留兼容分支。

## 3. 调用示例

### 3.1 双线、装饰与居中衬色

```ts
lineStyles.polyline({
  color: '#000000',
  tracks: {
    mode: 'double',
    patterns: ['solid', 'dashed'],
    width: 2
  },
  casing: {
    color: '#ffff00',
    type: 'center',
    width: 2
  },
  decoration: 'tick'
});
```

### 3.2 路径文字

```ts
lineStyles.polyline({
  color: '#2563eb',
  tracks: { mode: 'single', pattern: 'dashed', width: 3 },
  decoration: {
    type: 'inline-text',
    text: '供水管线',
    repeatSpacingPx: 160,
    style: { fontSize: 14, fontWeight: 'bold' }
  }
});
```

### 3.3 Polygon 外侧衬色

```ts
lineStyles.polygon({
  color: '#000000',
  tracks: { mode: 'double', patterns: ['solid', 'solid'], width: 3 },
  casing: { color: '#ffff00', type: 'outer', width: 2 },
  decoration: 'square'
});
```

## 4. 低层状态与派生算法

```ts
export interface PathCasingSpec {
  color: Color;
  type: LineCasingType;
  width: number;
}

export interface LineworkSpec {
  tracks: PathTrackSpec[];
  casing?: PathCasingSpec;
  caps?: { start?: PathCapSpec; end?: PathCapSpec };
  decorations?: PathDecorationSpec[];
  inlineText?: InlinePathTextSpec;
  contour?: PathContourPolicySpec;
}
```

工厂把 casing 默认值展开为完整 `PathCasingSpec`。casing 不进入 `tracks`，不计入逻辑轨道数量，也不写回派生 paint。Adapter 通过 Core 内部纯函数在 revision 级解析零条或一条 casing paint track。

### 4.1 宽度相关的工厂派生

双轨使用固定 4 CSS px 净间隙：

```text
trackOffset = W / 2 + 2
tracks      = [-trackOffset, +trackOffset]
```

因此两条轨道的 paint 不会因 `W > 6` 而重叠，默认 `W = 2` 的既有外观不变。

内置端帽以默认 2px 单轨为尺寸基线。设 `growth = max(0, W / 2 - 1)`：

```text
bar half length       = 7 + growth
arrow depth           = 11 + growth
arrow base half width = 6 + growth
```

arrow tip 与 bar 中心始终锚定真实路径端点；尺寸扩张只保证宽轨下仍有清晰肩部，不移动语义锚点。

普通 tracked decoration 使用同一轨道模式的默认 2px 包络为基线。单轨基线半包络 `H0 = 1`，双轨基线半包络 `H0 = 4`；实际前景半包络为 `H`。设 glyph 不含 stroke 的法向半径为 `R`：

```text
delta = max(0, H - H0)
scale = (R + delta) / R
```

`tick`、`alternating-tick`、`double-tick`、`square` 与 `circle` 的局部坐标和 circle radius 按该比例整体缩放，stroke width、repeat spacing 与 cutout padding 不变。这样默认 2px 输出逐字段不变，宽轨下仍保留与基线相同的法向外露量。`center-cross`、`center-dot` 与 `center-dot-pair` 保持固定 glyph 尺寸，通过轨道切口宽度补偿保持可见；无轨道的 `slash` 不缩放。

设每条前景轨道 offset 为 `oi`、宽度为 `wi`，casing 单侧厚度为 `C`：

```text
minimumEdge = min(oi - wi / 2)
maximumEdge = max(oi + wi / 2)
visualWidth = maximumEdge - minimumEdge
```

开放路径沿 controlPoints 声明方向使用右法线为正 offset：

```text
inner  -> offset = maximumEdge + C / 2, width = C
outer  -> offset = minimumEdge - C / 2, width = C
center -> offset = (minimumEdge + maximumEdge) / 2,
          width = visualWidth + 2C
```

反转开放路径 controlPoints 会交换屏幕上的 inner 与 outer。Polygon outer ring 规范化为逆时针，逻辑正 offset 为拓扑外侧、负 offset 为拓扑内侧：

```text
inner  -> offset = minimumEdge - C / 2, width = C
outer  -> offset = maximumEdge + C / 2, width = C
center -> offset = (minimumEdge + maximumEdge) / 2,
          width = visualWidth + 2C
```

底层完整 Polygon Stroke 的 offset 符号转换继续由 Adapter 负责；grow/cutout 的局部 LineString 使用逻辑 offset。Polygon hole 不生成前景轨道或 casing。

## 5. 绘制、命中与动画

1. casing 固定为纯色实线并先于前景 tracks 绘制；center 会填充双轨间隙，单侧 casing 不填充间隙。
2. casing 与前景 tracks 使用相同的 contour、中心 glyph 和路径文字语义切口，虚线跨切口后的相位连续。每份 paint 还要按自身 Stroke 端部轴向伸出量补偿切口：`butt` 为 0，`round`、`square` 和省略的默认圆端为 `stroke.width / 2`；内置切口已包含默认 2px 圆端的 1px 基线，因此实际附加量为 `max(0, axialReach - 1)`。该附加量同时进入重复内容的保守视口 buffer。
3. 开放路径配置端帽时，arrow tip 与 bar 中心严格位于真实几何起终点；foreground 与 casing 的可见 paint 分别按自身 Stroke 轴向伸出量裁到端帽朝路径内部的 painted edge，不进入端帽 footprint。逻辑 contour、累计长度与透明命中走廊保持完整。start cap 的 footprint 随反向端点切线换算，end cap 只在实际显示时避让，grow 不得提前留下末端缺口；完全透明、没有可见 paint 的端帽不形成切口。
4. 低层单轨允许非零 offset；端帽锚点必须先沿原路径法线平移 `track.offset`，再对 start 使用反向切线，保证端帽与实际前景轨道对齐，`visualOutsetPx` 同时计入该锚点平移。
5. casing 参与透明命中走廊、`visualOutsetPx`、Transform 视觉范围、world wrap、grow、fade、blink、highlight 和 alert。
6. dash-flow 只遍历真实虚线 tracks，不为 casing 创建动画 slot 或 dash offset。
7. 稳定 Style/Geometry pool 在 revision 级持有 casing paint，不增加逐帧对象创建。

## 6. 严格校验与兼容

工厂和 `StyleService` 拒绝未知字段、非法 mode/pattern 组合、非正有限宽度或重复间距、缺色或不完整 casing、无轨道 casing、非法 caps、slash 与轨道错配、空 inline text，以及非中心 decoration 对象。`StylePatch.linework` 继续只允许整体替换或删除；clone 与 serialize 必须深复制 casing 颜色数组。

本次修改发生在尚未发布的 2.0 工厂契约中，仓库内调用、严格类型消费者、API snapshot、TypeDoc 和 website 示例直接迁移，不保留 deprecated overload。

## 7. 验证与文档门槛

- 单元测试覆盖单/双轨 width、双轨固定净间隙、宽轨 decoration 派生，三种 casing 的开放路径与 Polygon 公式，严格校验、clone/serialize/patch、foreground/casing caps footprint 避让、文字/glyph 圆端补偿切口、grow、命中和视觉外扩。
- 动画测试确认 casing 不进入 dash-flow，其他 presentation 动态效果仍覆盖 casing。
- 浏览器视觉回归覆盖浅色、深色、DPR 1/2、旋转、world wrap、开放路径方向、Polygon 拓扑方向、10px 双轨净间隙、14px 单轨装饰，并以端帽局部像素探针阻止 foreground/casing 泄漏。
- “路径线饰”页面必须以 `tracks / casing / caps / decoration` 解释输入，明确两个 width 的不同含义，并使用同一 Element 展示单轨、双轨、Polygon 及三种 casing；不得再创建相同 Geometry 的 guide Element。

本文已经用户确认，可进入实现、文档同步与独立审查。若标准 OL Stroke.offset 无法稳定满足单侧拐角、Polygon winding 或 presentation，必须返回设计评审，不得静默退化为 centered casing。
