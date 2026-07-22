# 2.0 路径线饰与样式工厂补充设计

## 文档状态

- 状态：已批准
- 日期：2026-07-17
- 批准记录：2026-07-17，用户确认采用 `lineStyles.polyline()` 与 `lineStyles.polygon()` 两个公共工厂及本文约束
- 补充确认：2026-07-19，用户确认有端帽时跳过对应端点的重复装饰物
- 补充确认：2026-07-21，用户确认 `center-cross`、`center-dot`、`center-dot-pair` 与 `inline-text` 可通过 `repeatSpacingPx` 按固定 CSS 像素间距铺满完整 contour；省略时仍只放在累计长度中点
- 目标版本：@vrsim/earth-engine-ol 2.0.0
- 性质：公共样式契约、内置工厂与 OpenLayers 样式编译补充
- 适用范围：StyleSpec、StyleService、StyleCompiler、FeatureBinding、Draw、Edit、Transform、Animation presentation、命中、视觉范围与用户文档
- 补充：2026-07-13-v2-element-kernel-architecture-design.md
- 关联：2026-07-16-v2-interaction-visual-design.md
- 关联：2026-07-17-v2-animation-effect-kernel-design.md

本文只补充路径线饰的数据契约、两个公共样式工厂、路径布局和 OpenLayers 编译方式。未被本文明确补充的总纲条款继续有效。若本文与既有已批准规格存在未明确说明的冲突，以既有规格为准并返回设计评审，不得由实现自行选择解释。

本文采用以下已确认需求：

1. 对外增加 `lineStyles.polyline()` 与 `lineStyles.polygon()` 两个工厂。
2. 工厂只暴露实线/虚线、统一线饰颜色、端帽、装饰物、内嵌文本、文本外观，以及四种中心内容专用的 `repeatSpacingPx`；不暴露路径采样、法向偏移、相位或 OpenLayers 对象。
3. `color` 同时控制轨道、端帽和装饰物，默认 `#ff0000`。
4. 中心 glyph 与内嵌文本省略 `repeatSpacingPx` 时严格放在完整渲染路径累计长度的中点；传入正有限数时按该 CSS 像素间距铺满完整 contour。内嵌文本默认 12 CSS px、黑色。
5. 直线、折线、曲线和 Polygon 闭合边界使用同一线饰编译内核。

## 1. 背景、目标与非目标

现有 `StyleSpec.strokes` 支持多层同心描边、虚线和箭头装饰，但不能表达沿路径法线偏移的双轨、通用固定像素装饰、独立端帽、装饰物专用颜色继承，以及会切断轨道的中点或重复路径文字。若按图片中的每一种线型增加枚举、ShapeType 或交互分支，会让 StyleCompiler、Draw、Edit、Transform 和动画形成线型笛卡尔积。

本设计的目标是：

1. 保持 Element geometry 为唯一几何真源，不为端帽或装饰物创建子 Element。
2. 保持 Polyline、CurvePolyline 和 Polygon 的 ShapeDefinition、Draw、Edit 与 Transform 公共入口不变。
3. 以轨道、端帽、装饰物和内嵌文本四类正交部件表达现有图片及后续同规则线型。
4. 让普通调用方只使用两个函数工厂；除四种中心内容的重复间距外，不接触底层路径布局参数。
5. 让工厂输出完整、可序列化、可复制的 `StyleSpec` 快照，不在 ElementState 中保存 preset 名称或运行时回调。
6. 使用 CSS 像素定义轨道宽度、偏移、端帽尺寸、装饰物尺寸和装饰间距，保持缩放与 Transform 后的屏幕尺寸稳定。
7. 复用 Earth 级 StyleCompiler，使持久 Feature、Draw、Edit、Transform 和动画 presentation 具有相同视觉结果。
8. 使用稳定的 Style/Geometry/Text pool，避免按每个重复 glyph 或文字持续创建 OL Feature、Geometry、Style 或 Text。

本次明确不做：

- 不新增线型 ShapeType、Element 子类型、Layer 类型或独立 Draw/Edit/Transform Service。
- 不开放用户注册 renderer、glyph callback、LineworkDefinition 或全局线型 registry 的公共 API。
- 不允许工厂接收 OL Style、Geometry、Feature 或 Canvas callback。
- 除 `center-cross`、`center-dot`、`center-dot-pair` 与 `inline-text` 的 `repeatSpacingPx` 外，不允许调用方修改装饰间距、装饰尺寸、双线间距、虚线数组或闭环 seam；这些由内置定义固定。
- 不把普通 `StyleSpec.text` 当作路径内嵌文本。
- 不让 Polygon 工厂配置端帽。
- 不承诺位图 Icon 自动继承统一线饰颜色；第一版 glyph 全部由可着色矢量原语组成。

## 2. 不可变架构约束

1. `ElementState.geometry + ElementState.style` 仍是唯一业务状态真源。
2. `StyleSpec` 是序列化、复制、patch 和动画展示的稳定输入，StyleCompiler 只做单向编译。
3. Core 和 Services 不导入 OpenLayers；OL Style、Geometry 和缓存只存在于 Adapter。
4. Draw、Edit、Transform 和 AnimationManager 不根据装饰类型或工厂名称增加分支。
5. 端帽、装饰物和文本锚点是派生渲染资源，不进入 Store、Snapshot、copy、选择集或编辑锚点。
6. 工厂是无状态纯函数；相同输入产生等价的新对象，不共享可变数组或嵌套对象。
7. Element 保存展开后的 `StyleSpec`，工厂定义后续修改不得改变已存在 Element。
8. 所有尺寸与间距按 CSS 像素解释，Adapter 负责 resolution、DPR、View rotation 和 world wrap。
9. 固定 topology、style revision、geometry revision、resolution 桶、rotation 和 font revision 的稳定帧不得创建新的 OL Feature、Geometry、Style 或 Text。
10. 新增公共字段、导出和动画行为必须进入公共 API snapshot、strict consumer、manifest、TypeDoc 和 website 示例。

## 3. 公共入口

根入口新增一个只读工厂对象：

```ts
export interface LineStyleFactories {
  polyline(options?: PolylineLineStyleOptions): StyleSpec;
  polygon(options?: PolygonLineStyleOptions): StyleSpec;
}

export const lineStyles: LineStyleFactories;
```

只增加两个函数。`single`、`double`、`inlineText` 和 `decorationOnly` 不作为独立根工厂导出，而是由 options 的判别联合表达。

### 3.1 基础类型

```ts
export type LinePattern = 'solid' | 'dashed';

export type LineCapType = 'none' | 'bar' | 'arrow';

export type TrackedLineDecorationType =
  | 'none'
  | 'tick'
  | 'alternating-tick'
  | 'double-tick'
  | 'square'
  | 'circle'
  | 'center-cross'
  | 'center-dot'
  | 'center-dot-pair';

export type DecorationOnlyLineType = 'slash';

export type InlineTextLineDecorationType = 'inline-text';

export interface LineCapsOptions {
  start?: LineCapType;
  end?: LineCapType;
}

export interface InlineLineTextStyleOptions {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: Color;
  outline?: {
    color?: Color;
    width?: number;
  };
  background?: {
    color: Color;
    paddingPx?: number;
  };
}
```

`InlineLineTextStyleOptions` 只描述视觉外观，不暴露 placement、offset、rotation 或 textAlign。文本放置由同级 `repeatSpacingPx` 控制：省略时为累计长度中点，传入时为固定像素重复；旋转始终沿各锚点的局部切线并保持文字正向。

### 3.2 装饰与文本判别分支

```ts
type CenteredLineDecorationType = Extract<TrackedLineDecorationType, 'center-cross' | 'center-dot' | 'center-dot-pair'>;
type NonCenteredLineDecorationType = Exclude<TrackedLineDecorationType, CenteredLineDecorationType>;

type TrackedDecorationOptions =
  | {
      decoration?: NonCenteredLineDecorationType;
      repeatSpacingPx?: never;
      text?: never;
      textStyle?: never;
    }
  | {
      decoration: CenteredLineDecorationType;
      repeatSpacingPx?: number;
      text?: never;
      textStyle?: never;
    }
  | {
      decoration: InlineTextLineDecorationType;
      text: string;
      textStyle?: InlineLineTextStyleOptions;
      repeatSpacingPx?: number;
    };
```

`inline-text` 是函数工厂的判别项，展开后进入专用 `linework.inlineText`，不进入普通 decoration 队列。只有选择 `decoration: 'inline-text'` 并传入非空 `text` 时才允许 `textStyle`。`repeatSpacingPx` 只属于三种中心 glyph 和 `inline-text`；其他装饰、`none` 与纯 `slash` 在类型层和运行时都拒绝该字段。不存在“非文本线接受但忽略 textStyle”的静默行为，也不允许同一工厂调用同时选择普通装饰和内嵌文本。

`repeatSpacingPx` 的公共语义固定为：

- 省略：只在完整 contour 的累计长度中点 `L / 2` 放置一次；不把省略解释为某个默认重复间距。
- 传入：必须是大于 `0` 的有限数，并按该 CSS 像素间距在完整 contour 上重复放置。
- `0`、负数、`NaN` 与正负无穷均同步拒绝，不钳制、不取绝对值，也不回退到中点。
- 字段名称中的 `Spacing` 表示相邻副本间距，不表示沿切线或法线移动单个中心内容。

### 3.3 Polyline 工厂参数

```ts
interface CommonLineStyleOptions {
  color?: Color;
}

type SingleTrackPolylineOptions = CommonLineStyleOptions &
  TrackedDecorationOptions & {
    lines?: LinePattern;
    caps?: LineCapsOptions;
  };

type DoubleTrackPolylineOptions = CommonLineStyleOptions &
  TrackedDecorationOptions & {
    lines: readonly [LinePattern, LinePattern];
    caps?: never;
  };

type DecorationOnlyPolylineOptions = CommonLineStyleOptions & {
  lines: 'none';
  caps?: never;
  decoration: DecorationOnlyLineType;
  repeatSpacingPx?: never;
  text?: never;
  textStyle?: never;
};

export type PolylineLineStyleOptions =
  | SingleTrackPolylineOptions
  | DoubleTrackPolylineOptions
  | DecorationOnlyPolylineOptions;
```

判别规则：

- `lines` 省略时为一条实线。
- `lines: 'solid' | 'dashed'` 为单轨，允许分别设置起点和终点端帽。
- `lines: [first, second]` 为双轨，两条轨道可独立选择实线或虚线，不允许端帽。
- `lines: 'none'` 为纯装饰路径，第一版只允许 `decoration: 'slash'`，不允许端帽、文本或虚线。
- tracked 路径不允许 `decoration: 'slash'`，避免把红色斜杠线退化为可设置虚线的普通线。
- 三种中心 glyph 与 `inline-text` 在单轨和双轨上都可省略或传入 `repeatSpacingPx`；该字段不改变轨道数量、虚线节奏或端帽能力。

### 3.4 Polygon 工厂参数

```ts
type TrackedPolygonOptions = CommonLineStyleOptions &
  TrackedDecorationOptions & {
    lines?: LinePattern | readonly [LinePattern, LinePattern];
    caps?: never;
  };

type DecorationOnlyPolygonOptions = CommonLineStyleOptions & {
  lines: 'none';
  decoration: DecorationOnlyLineType;
  caps?: never;
  repeatSpacingPx?: never;
  text?: never;
  textStyle?: never;
};

export type PolygonLineStyleOptions = TrackedPolygonOptions | DecorationOnlyPolygonOptions;
```

Polygon 工厂只创建边界线饰，不接管 `StyleSpec.fill`。调用方需要填充时按现有 StyleSpec 组合：

```ts
const boundary = lineStyles.polygon({
  color: '#ff0000',
  lines: ['solid', 'dashed'],
  decoration: 'tick'
});

earth.elements.add({
  geometry: {
    type: 'polygon',
    controlPoints: [[0, 0], [2_000, 0], [1_800, 1_200], [200, 1_000]]
  },
  style: {
    ...boundary,
    fill: { type: 'solid', color: [255, 0, 0, 0.1] }
  }
});
```

## 4. 默认值与颜色继承

工厂默认值冻结为：

```text
color                  #ff0000
lines                  solid
caps.start             none
caps.end               none
decoration             none
single track width     2 CSS px
double track width     2 CSS px
double track offset    -3 / +3 CSS px
dashed pattern         [8, 6] CSS px
dashed offset          0 CSS px
repeatSpacingPx        省略；中心内容只放置一次
inline text fontSize   12 CSS px
inline text fontFamily sans-serif
inline text fontWeight normal
inline text fontStyle  normal
inline text color      #000000
inline gap padding     6 CSS px each side
```

统一 `color` 的继承规则：

1. 每条 track 的 stroke 使用该颜色。
2. bar、arrow 等端帽的 stroke 与 fill 使用该颜色。
3. tick、square、circle、cross、dot 和 slash 的 stroke 与 fill使用该颜色。
4. 文本不继承线饰颜色，使用独立 `textStyle.color`，默认黑色。
5. `outline.color` 省略时使用白色，`outline.width` 省略时为 2 CSS px；没有 `outline` 时不绘制描边。
6. `background.paddingPx` 省略时为 2 CSS px；没有 `background` 时不绘制文字背景。

`repeatSpacingPx` 没有隐式默认数值。只有调用方显式传入正有限数时才进入重复布局；这保证既有未传字段的快照、复制结果和视觉仍严格保持单一中点。

工厂内部定义可以使用 `line-color` 语义 token，但返回给调用方和写入 Element 的 StyleSpec 必须已经解析为具体 Color，不能把 token 或函数写入 Store。

## 5. 调用示例

### 5.1 单线、端帽和重复装饰

```ts
earth.elements.add({
  id: 'warning-line',
  geometry: {
    type: 'polyline',
    controlPoints: [[0, 0], [1_000, 600], [2_200, 100]]
  },
  style: lineStyles.polyline({
    color: '#ff0000',
    lines: 'dashed',
    caps: { start: 'bar', end: 'arrow' },
    decoration: 'circle'
  }),
  layerId: 'default'
});
```

### 5.2 双线独立实虚线

```ts
earth.elements.add({
  geometry: {
    type: 'curve-polyline',
    controlPoints: [[0, 0], [800, 900], [1_700, 200], [2_600, 1_000]]
  },
  style: lineStyles.polyline({
    color: '#1677ff',
    lines: ['dashed', 'solid'],
    decoration: 'tick'
  })
});
```

### 5.3 严格中点文本

```ts
earth.elements.add({
  geometry: {
    type: 'polyline',
    controlPoints: [[0, 0], [1_000, 500], [2_000, 200], [3_000, 700]]
  },
  style: lineStyles.polyline({
    color: '#2563eb',
    lines: 'dashed',
    decoration: 'inline-text',
    text: '供水管线',
    textStyle: {
      fontSize: 14,
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontWeight: 'bold',
      color: '#111827'
    }
  })
});
```

省略 `repeatSpacingPx` 时仍只生成这一份中点文字，既有调用无需迁移。

### 5.4 固定像素间距铺满中心内容

```ts
const repeatedDots = lineStyles.polyline({
  color: '#2563eb',
  decoration: 'center-dot-pair',
  repeatSpacingPx: 72
});

const repeatedText = lineStyles.polygon({
  lines: ['solid', 'dashed'],
  decoration: 'inline-text',
  text: '警戒区',
  repeatSpacingPx: 160
});
```

以上间距都是相邻副本之间的 CSS 像素距离。三种中心 glyph 会连同各自的轨道切口一起重复；文字会在每个锚点绘制，并为每份文字生成独立切口。

### 5.5 纯斜杠路径

```ts
earth.elements.add({
  geometry: {
    type: 'polyline',
    controlPoints: [[0, 0], [1_500, 400], [2_800, 0]]
  },
  style: lineStyles.polyline({
    lines: 'none',
    decoration: 'slash'
  })
});
```

## 6. StyleSpec 扩展与快照语义

`StyleSpec` 新增可序列化的高级路径分支，名称冻结为 `linework`：

```ts
export type PathTrackStrokeSpec = Omit<StrokeSpec, 'fitPatternOnce'> & {
  fitPatternOnce?: never;
};

export interface PathTrackSpec {
  offset: number;
  stroke: PathTrackStrokeSpec;
}

export interface LineworkSpec {
  tracks: PathTrackSpec[];
  caps?: {
    start?: PathCapSpec;
    end?: PathCapSpec;
  };
  decorations?: PathDecorationSpec[];
  inlineText?: InlinePathTextSpec;
  contour?: PathContourPolicySpec;
}

export interface StyleSpec {
  symbol?: CircleSymbolSpec | IconSymbolSpec;
  strokes?: StrokeSpec[];
  fill?: SolidFillSpec | PatternFillSpec;
  text?: TextSpec;
  decorations?: ArrowDecorationSpec[];
  linework?: LineworkSpec;
  zIndex?: number;
}
```

`PathDecorationSpec` 的 repeat 分支继续使用 `{ kind: 'repeat', spacing, phase } + sequence`。为完整复制三种中心 glyph 的既有视觉，该分支允许可选 `cutoutPadding`：工厂在收到 `repeatSpacingPx` 时把单个中心 glyph 展开成 `sequence: [glyph]`，并保留原 `cutoutPadding`；其他内置重复装饰不生成切口。

文本在专用状态中显式记录可选放置策略：

```ts
export type InlinePathTextPlacementSpec =
  | { kind: 'center' }
  | {
      kind: 'repeat';
      spacing: number;
      phase?: number;
    };

export interface InlinePathTextSpec {
  text: string;
  placement?: InlinePathTextPlacementSpec;
  // 其余字段仍为字体、paint、背景和切口外观
}
```

`InlinePathTextSpec.placement` 省略等价于 `{ kind: 'center' }`，保留既有快照兼容性。工厂只有在调用方传入 `repeatSpacingPx` 时才写入 `{ kind: 'repeat', spacing: repeatSpacingPx, phase: 0 }`。低层 `phase` 服务于完整状态协议和编译内核，不作为高层工厂参数开放。

低层 linework 类型必须公开，因为它们会出现在 Element state、snapshot、copy 和序列化结果中；但第一版用户文档只把两个函数工厂作为推荐创建入口。公开低层数据不等于开放 Definition、registry 或 renderer callback。

兼容与组合规则：

1. `linework` 与顶层 `strokes`、`decorations` 互斥，避免同一路径出现两个不确定的描边内核。
2. `fill` 可以与 `linework` 共存，用于 Polygon。
3. 顶层 `text` 可以与 `linework` 共存，但它仍是普通 Element label，不参与轨道切口。
4. `StylePatch.linework` 第一版只支持整体替换或删除，不对 tracks、glyph primitive 做深层局部 patch。
5. 工厂每次调用返回独立的新 StyleSpec；输入和输出均不得被后续内部修改。
6. `PathTrackStrokeSpec` 明确禁止 `fitPatternOnce`；路径轨道始终保持固定 CSS 像素虚线间距，不接受整段虚线拟合。
7. repeat decoration 的 `spacing`、`InlinePathTextPlacementSpec` 的 repeat `spacing` 和可选 `phase` 均由严格 StyleService 校验；spacing 必须为正有限数，phase 必须为有限数。
8. 未知字段、函数、类实例、非有限数、非法 Color 和非法数组长度继续由严格 StyleService 同步拒绝。

## 7. 路径与轮廓语义

Adapter 把最终 RenderGeometry 统一提取为纯数据轮廓：

```ts
interface PathContour {
  coordinates: readonly Coordinate[];
  closed: boolean;
  role: 'line' | 'outer' | 'hole';
}
```

规则如下：

1. 两点 `polyline` 是直线，三点及以上是折线；`curve-polyline` 使用 ShapeDefinition 已生成的采样路径。线饰内核不识别具体 ShapeType。
2. Polyline 每个开放 contour 独立计算长度、端帽、重复相位和文本放置；省略文本 placement 时才使用该 contour 的累计长度中点。
3. Polygon 第一版只装饰 outer ring；hole 保留现有 fill hole 语义，但不生成 linework。
4. Polygon ring 去掉末尾重复起点后参与累计长度，再以逻辑闭合段补齐周长；闭合缝不重复生成装饰物。
5. Polygon 的双轨以一条位于边界内侧、一条位于边界外侧表达。Adapter 先规范化 ring winding，再把 inside/outside 映射到 OL Stroke offset。
6. Polygon 不存在 start/end cap；传入 caps 在类型层和运行时均拒绝。
7. Transform 只变换业务 geometry，不缩放 CSS 像素宽度、间距、端帽、装饰物或文字。

### 7.1 固定像素分布

开放路径使用严格固定 spacing。设路径屏幕长度为 `L`、装饰或文本间距为 `D`、可放置数量为 `n`，剩余长度在路径两端对称分配，所有相邻锚点之间保持严格 `D` CSS px。锚点始终由完整 contour 计算；视口裁剪、world wrap、grow 和文字宽度都不得重新居中或改变间距。路径短于 `D` 时仍在 `L / 2` 生成一个锚点。

开放路径配置 start cap 时不物化该 contour 的首个全局重复锚点，配置 end cap 时不物化末个全局重复锚点，两端规则彼此独立，且不要求锚点恰好落在端点。若首末是同一锚点，任一端帽存在即跳过该锚点，不重复扣除。该规则统一适用于内置重复装饰、传入 `repeatSpacingPx` 的中心 glyph 和重复文字；省略 `repeatSpacingPx` 的单一中心占位不参与。静态与完整 presentation 的首末判断基于完整 contour 的全局锚点序号；视口物化和 world wrap 不得误删视口内的普通首末锚点。grow 期间 start cap 位于当前 reveal 起点时，还要跳过该 reveal 窗口的首个全局锚点；随着窗口扩展，已被端帽越过的内部锚点可以按原位置出现。其余锚点的 spacing、phase 和 sequence index 保持不变。

闭合路径无法同时保证严格 `D` 和闭合缝无余量。第一版固定使用 `preserve-spacing`：普通相邻锚点保持严格 `D`，余量集中在 ring 第一坐标对应的 seam，并在 seam 两侧对称分配。闭环没有端帽，也不在首尾重复同一锚点。工厂不暴露 fit 模式。

普通装饰定义的尺寸和 spacing 由内置 manifest 固定；三种中心 glyph 与 `inline-text` 仅在显式传入 `repeatSpacingPx` 时使用调用方给定间距。引擎不根据 glyph 或文字宽度自动增大 `D`，也不丢弃视觉重叠的副本。新增已有原语可表达的装饰，只增加 manifest 数据、快照和文档，不修改 Service 或 interaction 分支。

### 7.2 方向与局部坐标

所有 glyph primitive 使用局部 CSS 像素坐标：

- `u` 轴沿路径正切方向；
- `v` 轴沿路径右法线方向；
- start cap 使用反向切线朝路径外侧；
- end cap 使用正向切线朝路径外侧；
- bar 永远垂直于局部切线；
- arrow、tick、slash 和中心 glyph 随路径方向旋转；
- circle 与 dot 对方向不敏感。

重复点落在折点时使用相邻非零长度段的归一化切线合成；180 度反向或无法得到稳定切线时使用进入段切线，不生成 NaN 或无限 miter。

## 8. 内嵌文本契约

1. `inlineText` 使用专用文本状态，不进入普通 decoration 队列；它的 repeat placement 与 glyph repeat 复用同一套完整 contour 锚点算法。
2. `placement` 省略或为 `center` 时，文本锚点严格位于完整 render contour 累计长度 `L / 2`，不是控制点中位数、extent center 或几何顶点。
3. `placement.kind` 为 `repeat` 时，所有文本锚点按 7.1 的固定 spacing、闭环 seam、端帽避让、视口物化和全局序号规则生成；不会再额外保留一份 `L / 2` 文本。
4. Polygon 文本仅作用于 outer ring，以 ring 第一坐标为累计长度零点。
5. Adapter 使用与 OL Text 相同的最终字体串测量文字宽度。每份文本的轨道切口宽度均为文字实测宽度、背景 padding、outline 外扩和两侧固定 6 CSS px gap padding 的总和。
6. 双轨共享同一组路径长度切口区间。相邻文本、闭合 seam 两侧文字或文字与其他合法切口发生重叠时，先在 contour 累计长度域合并区间，再切分轨道；不得生成反向、零长或重复 track 片段。
7. 虚线轨道跨越每个文字或中心 glyph 切口后继续原完整 contour 的 dash phase，不从零重新开始。闭环 seam 两侧的切口同样保持相位连续。
8. 若合并后的切口覆盖完整 contour，仍绘制文本并隐藏该 contour 的全部 track；这是确定性短路径或小间距行为，不抛出依赖 resolution 的创建错误。
9. 重复间距可以小于文本视觉宽度。引擎仍保留全部全局锚点并合并轨道切口，不按字体度量静默调大 spacing 或删除重叠文字；调用方负责选择可读间距。
10. `inline-text` 与全部普通 decoration 在函数工厂判别联合中互斥，防止同一工厂调用产生两套装饰优先级。
11. 字体完成加载或字体度量改变时，使受影响的全部重复文本和切口布局缓存失效，并对对应 Layer 合并请求一次重绘。
12. 每份文本始终沿其锚点切线旋转并保持正向；调用方不能通过 textStyle 改变 placement、phase 或 rotation。

## 9. OpenLayers 编译策略

第一版使用标准 OL Style 与稳定派生 Geometry，不以 `Style.renderer` 作为主渲染路径。

### 9.1 轨道

- 没有切口时，单轨编译为一个标准 OL Stroke；双轨编译为两个标准 OL Stroke，并使用公开 `Stroke.offset` 设置 `-3/+3` CSS px 法向偏移。
- 每条轨道拥有独立 `lineDash` 和 `lineDashOffset`。
- 全部中心 glyph 与文字切口先按 contour 累计长度排序、处理闭环 seam 并合并，再把剩余轨道段分配给稳定的 LineString/MultiLineString slot；每段按自身全局起始距离调整 dash offset，保持跨任意数量切口的相位连续。

### 9.2 端帽与装饰物

- 同 paint 的 segment primitive 批量进入 MultiLineString。
- 同 paint 的 circle/dot 批量进入 MultiPoint + CircleStyle。
- square、实心 arrow 和其他 polygon primitive 批量进入 MultiPolygon 或稳定的 RegularShape slot。
- 重复文本使用按完整 contour 全局锚点序号复用的稳定 Point + Text slot；视口进入、离开或 world wrap 只更新 slot 内容，不改变 spacing 或把可见子集重新编号。
- 不为每个重复装饰创建业务 Feature。
- 由 geometry/style revision、resolution 桶、rotation 和字体度量 revision 决定布局缓存失效。布局 revision 可以调整所需 slot 容量；固定 revision 的后续帧不得继续创建 OL Geometry、Style 或 Text。

### 9.3 不首选 custom renderer 的原因

普通 VectorLayer 支持 `Style.renderer`，但现有动画 presentation 使用 `getVectorContext().drawFeature()` 的 Immediate renderer；Immediate 只读取 Fill、Stroke、Image 和 Text，不执行 custom renderer。若第一版直接使用 custom renderer，会导致规范 Feature、透明 presentation proxy、动画 replacement 和命中行为不一致。

未来只有在动画 presentation、透明 proxy、hit renderer、declutter 和 world wrap 全部具有浏览器证据后，才允许增加等价 custom renderer 优化后端；公共 StyleSpec 不因后端选择而变化。

## 10. 命中、视觉范围与裁剪

1. linework 必须提供统一的 `visualOutsetPx`，至少覆盖最大 `abs(track.offset) + width/2`、端帽、装饰物、outline 和文字背景。
2. `HitTestAdapter.getScreenExtent()` 和 Transform 视觉范围消费该统一结果，不自行解析 decoration type。
3. 普通命中覆盖轨道、端帽和装饰物，并保留完整逻辑中心路径的最小 hit corridor。
4. 文本切口和重复装饰之间的空白不能形成无法选择 Element 的洞。
5. Polygon outer ring 的内外轨道均参与命中；hole 不参与第一版 linework 命中。
6. 无法可靠计算文字或未来资源尺寸时禁止对该目标进行激进视口裁剪，不允许以漏画换性能。
7. world wrap 副本复用相同的视觉外扩和装饰相位。

## 11. Draw、Edit 与 Transform

1. Draw Session 仍只接收 `StyleInput`；工厂返回的 StyleSpec 同时用于草稿和最终 Element。
2. Edit 继续绘制完整真实 linework，再叠加 edit accent 和锚点；装饰物不是可编辑锚点。
3. Transform 继续只修改 geometry。平移、旋转、缩放和 stretch 后重新按最终路径布局，所有尺寸保持 CSS px。
4. 临时 Feature、派生 Geometry、Style pool、字体缓存和命中缓存由现有 interaction handle 所有，在 complete、cancel、replace、destroy、外部冲突和打开失败时幂等清理。
5. InteractionCoordinator 不识别 LinePattern、CapType 或 DecorationType。

## 12. 动画兼容

linework 进入既有 CompiledPresentationStyle，不建立第二个动画渲染器。

1. fade、blink、highlight 和 alert 同时作用于 tracks、caps、decorations、inlineText 和 Polygon fill。
2. dash-flow 作用于全部 dashed tracks，各轨道保留自己的基础 phase；solid tracks、caps、decorations 和文本不参与 dash offset。
3. grow 按路径累计长度裁剪 tracks；未被端帽跳过的重复装饰、重复中心 glyph 和重复文字在各自全局 anchor 被 reveal 后原位出现，不按当前已 reveal 长度重新分布。start cap 在 progress 大于 0 时出现；end cap 只在 progress 为 1 时出现；省略 `repeatSpacingPx` 的中心 glyph 或 inlineText 仍在 reveal 到达 `L / 2` 后出现。reverse grow 使用同一组全局锚点和相反 reveal 窗口。
4. grow 帧只启用当前已 reveal 锚点对应的 glyph/text 与切口；尚未 reveal 的重复文字不得提前在可见轨道上留下空洞。动画 presentation 按完整目标、完整 cutout 拓扑和当前 resolution 桶准备足够的稳定批量 geometry/text slot；稳定 300 帧不得新增 OL Feature、Geometry、Style 或 Text。
5. Edit/Transform 获得视觉所有权时继续沿用批准设计的 pause-and-suppress 行为，结束后按最新 geometry/style revision 重绑。
6. 透明规范样式 proxy 必须能隐藏全部 linework 可见资源，同时保留规范 geometry 命中。

## 13. 验证与错误模型

工厂和 StyleService 同步拒绝：

- 未知字段；
- 非有限字号、outline width 或 padding；
- `repeatSpacingPx` 不是正有限数，或把它用于 `center-cross`、`center-dot`、`center-dot-pair`、`inline-text` 之外的 decoration；
- 空白 text；
- 非法 Color；
- `lines` 数组不是恰好两个成员；
- 双轨或纯装饰配置 caps；
- 纯装饰配置 text/textStyle；
- tracked 配置 slash；
- decoration-only 缺少 slash；
- `inline-text` 没有非空 text；
- 非 `inline-text` 配置 text 或 textStyle；
- 低层 repeat decoration/inlineText placement 缺少正有限 spacing、使用非有限 phase，或放置分支字段组合不完整；
- `linework` 与顶层 strokes/decorations 同时存在；
- Point、Circle 或不提供 path contour 的 RenderGeometry 使用 linework。

TypeScript 类型负责常见非法组合，运行时严格校验负责 JS 调用方、反序列化数据和 `as never` 绕过。不得静默删除字段、自动改成相近 decoration、自动忽略 caps 或把非法颜色替换为默认值。

## 14. 性能与资源预算

1. 路径度量复杂度为 `O(path points)`，重复 glyph/text 布局和切口合并复杂度以当前保守视口内锚点数为界，不得对每帧全量扫描超长离屏 contour。
2. repeat phase 按完整 contour 累计长度计算，但只物化当前保守视口及足以覆盖 spacing、glyph/text 外扩和切口的 buffer，避免超长世界路径为离屏副本创建资源。
3. 同 primitive/paint 的装饰批量进入固定数量的 MultiGeometry slot；重复文字、轨道分段和切口使用 revision 级稳定 slot 池，不按每帧 marker 数量创建 Style 或 Text。
4. 稳定视图只复用现有对象；geometry/style/resolution/rotation/font revision 变化时才更新坐标和布局缓存。
5. Draw/Edit 高频 geometry 变化允许更新派生 Geometry 内容，但不得为每个 marker 新建 Feature。
6. 性能测试必须记录 1,000 条线、长曲线、密集重复文字、Polygon 闭环、DPR 1/2、缩放、旋转、连续拖动和动画 300 帧的 OL 对象计数。
7. 资源预算失败不得通过降低装饰密度、改变 spacing 或跳过线型静默修复，必须返回设计评审或改进批量布局。

## 15. 自动化测试矩阵

至少覆盖：

1. 两个工厂的默认值、输入不变性、输出独立性和完整快照；四种中心内容省略 `repeatSpacingPx` 时保持单一 center placement，传入时展开为对应 repeat placement。
2. 单轨实线/虚线、双轨四种实虚线组合、默认红色和自定义统一颜色。
3. start/end 的 none/bar/arrow 组合、普通重复装饰/重复中心 glyph/重复文字的首末全局锚点避让、极短路径首末同锚点，以及非法双轨/Polygon cap。
4. 每种 tracked decoration 和纯 slash 的结构、颜色继承、固定 spacing 与方向；三种中心 glyph 使用自定义 spacing 后复制 glyph 与切口。
5. 普通线没有 textStyle、文本线默认 12px 黑色、自定义字体/颜色/outline/background。
6. 文本默认严格 `L / 2`，以及自定义 spacing 下的开放/闭合锚点、端帽避让、逐份切口、重叠区间合并、双轨共同切口、短路径、字体加载失效和多切口 dash phase 连续。
7. 直线、折线、curve-polyline、Polygon outer ring 和闭环 seam 不重复；重复内容跨 seam 保持固定间距、正确切口和正向文字。
8. Draw 预览与提交结果一致，Edit 真实样式 + accent，Transform 后固定 CSS 像素。
9. 轨道、端帽、装饰、文字切口和 Polygon 内外轨的命中与 ScreenExtent。
10. fade/blink/highlight/alert、dash-flow、grow、presentation proxy 和 pause-and-suppress；forward/reverse grow 保持完整 contour 锚点，未 reveal 内容不提前留下切口。
11. geometry/style/resolution/rotation/font 缓存失效、complete/cancel/replace/destroy 和 Earth.destroy 清理。
12. 固定拓扑 300 帧对象身份、超长路径重复 glyph/text 视口物化，以及无逐帧 marker Feature/Geometry/Style/Text。
13. PublicApiSnapshot、public manifest、strict consumer、根导出和离线安装。

浏览器视觉测试至少覆盖 DPR 1/2、不同 zoom、View rotation、浅色/深色底图和 world wrap，并为图片中每一种目标线型建立确定性截图；三种中心 glyph 与路径文字都要同时保留“中点一次”和“固定间距铺满”证据。

## 16. 文档与示例

公共 API 冻结后：

1. website 增加“路径线饰”归属页，解释两个工厂、默认值、`repeatSpacingPx` 的适用分支与校验、端帽避让、错误组合和 Polygon 语义。
2. 提供同源可运行示例，至少包含单线端帽、双线独立虚线、内置重复装饰、纯斜杠、中心 glyph/文字的中点一次与固定像素间距铺满、曲线和 Polygon；示例控件必须能实际切换省略/传入 `repeatSpacingPx`，不能只展示静态代码。
3. `elements.add()` 是主要示例入口；Draw/Edit/Transform 页面只说明同一 StyleSpec 自动复用，不重复维护线型参数表。
4. TypeDoc 从源码 JSDoc 生成，不手工编辑生成产物。
5. 文档阶段遵循 `website/AGENTS.md` 的页内链接、示例锚点和 `npm run docs:build` 门槛。

## 17. 实施分解

### 阶段 0：设计确认与 OpenLayers Spike

- 确认两个工厂名称、参数判别联合、默认值和装饰类型集合。
- 浏览器验证 OL Stroke.offset 的双轨、虚线、Polygon ring、Immediate animation 和原生命中。
- 验证派生 MultiGeometry、重复 glyph/text、多切口合并、dash phase 和字体加载重绘。
- 任何关键假设失败时先修订本文并重新确认，不进入公共 API 实现。

### 阶段 1：Core 与公共工厂

- 增加 linework 纯数据类型、严格验证、clone、patch、快照和两个纯函数工厂。
- 增加根导出、API snapshot、manifest 和 strict consumer。
- 此阶段不发布只有类型没有渲染的半成品。

### 阶段 2：静态编译与路径布局

- 实现 contour 提取、累计长度、固定像素布局、tracks、caps、decorations、inlineText placement 和多切口合并。
- 实现 native Stroke.offset、批量 MultiGeometry、缓存、visualOutset 与命中。
- 接入 FeatureBinding、Draw、Edit 和 Transform 的共享 StyleCompiler。

### 阶段 3：Polygon 与动画 presentation

- 实现 outer ring、inside/outside、closed seam、Polygon text 和 fill 组合。
- 扩展 CompiledPresentationStyle、透明 proxy、dash-flow、grow 和资源预算。

### 阶段 4：代码验证与 API 冻结

- 运行类型检查、lint、单元测试、浏览器视觉测试、性能结构门槛和构建。
- 完成审查后冻结公共 API，再进入用户文档阶段。

### 阶段 5：website 与 TypeDoc

- 更新源码 JSDoc、归属页、可运行示例和迁移说明。
- 运行 `npm run docs:build` 与完整 `npm run verify`。

## 18. 完成定义与批准动作

实现完成必须同时满足：

- 只有 `lineStyles.polyline()` 和 `lineStyles.polygon()` 两个新增公共工厂。
- 默认红色统一作用于轨道、端帽和装饰，文本默认 12px 黑色。
- 纯 slash 无虚线能力，双轨和 Polygon 无端帽能力，非法组合在类型和运行时均被拒绝。
- 直线、折线、曲线和 Polygon 复用同一个 linework 编译内核。
- Draw、Edit、Transform 和 AnimationManager 不存在 decoration type 分支。
- 三种中心 glyph 与 inline-text 省略 `repeatSpacingPx` 时严格位于 `L / 2`，传入时按固定 CSS 像素间距铺满 contour；逐份切口、Polygon seam、命中和视觉范围具有浏览器证据。
- 稳定帧无新增 OL Feature、Geometry、Style 或 Text，所有资源在完整生命周期后恢复基线。
- 公共导出、snapshot、manifest、strict consumer、TypeDoc、website 和可运行示例同步。
- 代码阶段和文档阶段分别通过总纲规定的验证门槛。

本文及 2026-07-21 的 `repeatSpacingPx` 补充已经用户确认，可以进入阶段 0 Spike 和后续实现。若后续需要改变两个工厂的含义、命名或能力范围，必须先修订本文并重新获得确认，不得由实现自行猜测。
