import type { Color } from '../common/types.js';

/** 区分受控原生样式引用的内部品牌。 */
const nativeStyleRefBrand: unique symbol = Symbol('ol-engine.native-style-ref');

/** 记录由当前模块签发的原生样式引用。 */
const issuedNativeStyleRefs = new WeakSet<object>();

/** 当前 Earth 内 OpenLayers 样式对象的受控引用。 */
export interface NativeStyleRef {
  /** 仅由引擎签发的品牌字段。 */
  readonly [nativeStyleRefBrand]: true;
}

/** 描边、折线和文字轮廓共用的线条样式。 */
export interface StrokeSpec {
  /** 线条使用的颜色。 */
  color?: Color;
  /** 线条的像素宽度。 */
  width?: number;
  /** 按像素设置实线和空白的长度。 */
  lineDash?: number[];
  /** 控制虚线从哪个位置开始。 */
  lineDashOffset?: number;
  /** 控制线条两端的形状。 */
  lineCap?: 'butt' | 'round' | 'square';
  /** 控制线段拐角的形状。 */
  lineJoin?: 'bevel' | 'round' | 'miter';
  /** 限制尖角可以延伸的长度。 */
  miterLimit?: number;
  /** 让整组虚线刚好铺满路径。 */
  fitPatternOnce?: boolean;
}

/** 单色填充。 */
export interface SolidFillSpec {
  /** 固定为纯色填充。 */
  type: 'solid';
  /** 填充区域使用的颜色。 */
  color: Color;
}

/** 由内置图案平铺而成的纹理填充。 */
export interface PatternFillSpec {
  /** 固定为纹理填充。 */
  type: 'pattern';
  /** 选择斜线、交叉线、圆点、横线或竖线。 */
  pattern: 'diagonal' | 'cross' | 'dot' | 'horizontal' | 'vertical';
  /** 纹理线条或圆点使用的颜色。 */
  color?: Color;
  /** 一个纹理单元的像素大小。 */
  size?: number;
  /** 纹理线条的像素宽度。 */
  lineWidth?: number;
  /** 圆点纹理中每个点的像素半径。 */
  dotRadius?: number;
  /** 纹理空白区域使用的颜色。 */
  backgroundColor?: Color;
}

/** 以圆点渲染 Point 的符号样式。 */
export interface CircleSymbolSpec {
  /** 固定为圆形符号。 */
  type: 'circle';
  /** 圆点的像素半径。 */
  radius: number;
  /** 圆点内部使用的样式。 */
  fill?: SolidFillSpec | PatternFillSpec;
  /** 圆点边缘使用的样式。 */
  stroke?: StrokeSpec;
}

/** 以图片渲染 Point 的符号样式。 */
export interface IconSymbolSpec {
  /** 固定为图片符号。 */
  type: 'icon';
  /** 图片 URL 或 Data URL。 */
  src: string;
  /** 按 `[宽度, 高度]` 设置源图片大小。 */
  size?: [number, number];
  /** 图片叠加色。 */
  color?: Color;
  /** 图片在雪碧图中的起始位置。 */
  offset?: [number, number];
  /** 按 `[向右, 向上]` 设置图片相对锚点的像素距离。 */
  displacement?: [number, number];
  /** 可以统一缩放，也可以分别缩放宽高。 */
  scale?: number | [number, number];
  /** 图片顺时针旋转的角度，单位为度。 */
  rotation?: number;
  /** 控制图片是否随地图一起旋转。 */
  rotateWithView?: boolean;
  /** 图片定位锚点。 */
  anchor?: [number, number];
  /** 指定锚点从图片哪个角开始计算。 */
  anchorOrigin?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** 横向锚点使用比例或像素单位。 */
  anchorXUnits?: 'fraction' | 'pixels';
  /** 纵向锚点使用比例或像素单位。 */
  anchorYUnits?: 'fraction' | 'pixels';
  /** 指定裁剪偏移从图片哪个角开始计算。 */
  origin?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** 取值范围为 `0` 到 `1`。 */
  opacity?: number;
  /** 设置图片请求使用的 `crossOrigin`。 */
  crossOrigin?: string | null;
}

/** Element 文本的内容与外观。 */
export interface TextSpec {
  /** 要显示的文字内容。 */
  text: string;
  /** 未设置拆分字体字段时，直接使用完整的 CSS 字体值。 */
  font?: string;
  /** 设置文字使用的字体族。 */
  fontFamily?: string;
  /** 设置文字大小，数字按像素处理。 */
  fontSize?: number | string;
  /** 设置文字的粗细。 */
  fontWeight?: number | 'normal' | 'bold' | 'bolder' | 'lighter';
  /** 设置正常、斜体或倾斜文字。 */
  fontStyle?: 'normal' | 'italic' | 'oblique';
  /** 控制文字内部的颜色或纹理。 */
  fill?: SolidFillSpec | PatternFillSpec;
  /** 控制文字边缘的样式。 */
  stroke?: StrokeSpec;
  /** 控制文字背景的颜色或纹理。 */
  backgroundFill?: SolidFillSpec | PatternFillSpec;
  /** 控制文字背景边缘的样式。 */
  backgroundStroke?: StrokeSpec;
  /** 按 `[上, 右, 下, 左]` 设置像素距离。 */
  padding?: number[];
  /** 正值让文字向右移动，单位为像素。 */
  offsetX?: number;
  /** 正值让文字向上移动，单位为像素。 */
  offsetY?: number;
  /** 可以统一缩放，也可以分别缩放宽高。 */
  scale?: number | [number, number];
  /** 控制文字相对定位点的水平位置。 */
  textAlign?: 'left' | 'right' | 'center' | 'start' | 'end';
  /** 控制文字相对定位点的垂直位置。 */
  textBaseline?: 'bottom' | 'top' | 'middle' | 'alphabetic' | 'hanging' | 'ideographic';
  /** 文字顺时针旋转的角度，单位为度。 */
  rotation?: number;
  /** 控制文字是否随地图一起旋转。 */
  rotateWithView?: boolean;
  /** 控制文字超出几何范围时是否仍然显示。 */
  overflow?: boolean;
  /** 可以放在点上，也可以沿线放置。 */
  placement?: 'point' | 'line';
  /** 沿线文字允许的最大转角，单位为度。 */
  maxAngle?: number;
  /** 沿线重复文字之间的像素距离。 */
  repeat?: number;
  /** 控制多行文字内部的对齐方向。 */
  justify?: 'left' | 'right' | 'center';
  /** 控制沿线文字是否自动避免倒置。 */
  keepUpright?: boolean;
}

/** 沿线放置的箭头装饰。 */
export interface ArrowDecorationSpec {
  /** 固定为箭头装饰。 */
  type: 'arrow';
  /** 选择起点、终点、每段或重复放置。 */
  placement: 'start' | 'end' | 'each-segment' | 'repeat';
  /** 自定义箭头使用的图片符号。 */
  symbol?: IconSymbolSpec;
  /** 重复放置箭头时，设置第一个箭头距起点的像素距离。 */
  offset?: number;
  /** 重复放置箭头时，设置相邻箭头的像素距离。 */
  spacing?: number;
}

/** 路径线饰中不会产生虚线的端帽与装饰描边。 */
export interface PathGlyphStrokeSpec {
  /** 描边颜色。 */
  color?: Color;
  /** 描边宽度，单位为 CSS 像素。 */
  width?: number;
  /** 控制开放线段两端的形状。 */
  lineCap?: 'butt' | 'round' | 'square';
  /** 控制相邻线段拐角的形状。 */
  lineJoin?: 'bevel' | 'round' | 'miter';
  /** 限制尖角可以延伸的长度。 */
  miterLimit?: number;
}

/** 路径 glyph 使用的局部 CSS 像素矢量原语。 */
export type PathGlyphPrimitiveSpec =
  | {
      /** 固定为线段原语。 */
      type: 'segment';
      /** 线段在路径局部 `[u, v]` 坐标中的起点。 */
      from: [number, number];
      /** 线段在路径局部 `[u, v]` 坐标中的终点。 */
      to: [number, number];
      /** 线段使用的不可虚线描边。 */
      stroke: PathGlyphStrokeSpec;
    }
  | {
      /** 固定为圆形原语。 */
      type: 'circle';
      /** 圆心在路径局部 `[u, v]` 坐标中的位置。 */
      center: [number, number];
      /** 圆形半径，单位为 CSS 像素。 */
      radius: number;
      /** 圆形内部的纯色填充。 */
      fill?: SolidFillSpec;
      /** 圆形边缘使用的不可虚线描边。 */
      stroke?: PathGlyphStrokeSpec;
    }
  | {
      /** 固定为多边形原语。 */
      type: 'polygon';
      /** 多边形顶点在路径局部 `[u, v]` 坐标中的位置。 */
      points: [number, number][];
      /** 多边形内部的纯色填充。 */
      fill?: SolidFillSpec;
      /** 多边形边缘使用的不可虚线描边。 */
      stroke?: PathGlyphStrokeSpec;
    }
  | {
      /** 固定为原语组合。 */
      type: 'group';
      /** 按声明顺序组成一个 glyph 的子原语。 */
      primitives: PathGlyphPrimitiveSpec[];
    };

/** 沿路径局部切线和法线绘制的一组矢量原语。 */
export interface PathGlyphSpec {
  /** 组成 glyph 的非空原语列表。 */
  primitives: PathGlyphPrimitiveSpec[];
}

/** 开放路径起点或终点使用的端帽。 */
export interface PathCapSpec {
  /** 按端点外向切线定位的矢量 glyph。 */
  glyph: PathGlyphSpec;
}

/** 沿路径重复或在路径中点放置的装饰。 */
export type PathDecorationSpec =
  | {
      /** 按固定 CSS 像素间距重复放置。 */
      placement: {
        /** 固定为重复放置。 */
        kind: 'repeat';
        /** 相邻装饰锚点的 CSS 像素间距。 */
        spacing: number;
        /** 第一个装饰相对默认相位的 CSS 像素偏移。 */
        phase?: number;
      };
      /** 按锚点次序循环选择的非空 glyph 序列。 */
      sequence: PathGlyphSpec[];
      /** 重复装饰不使用单个中点 glyph。 */
      glyph?: never;
      /** 重复装饰不切出中点留白。 */
      cutoutPadding?: never;
    }
  | {
      /** 固定放在完整渲染路径累计长度的中点。 */
      placement: {
        /** 固定为中点放置。 */
        kind: 'center';
      };
      /** 放在路径中点的单个 glyph。 */
      glyph: PathGlyphSpec;
      /** glyph 外侧额外切出的 CSS 像素留白。 */
      cutoutPadding?: number;
      /** 中点装饰不使用重复 glyph 序列。 */
      sequence?: never;
    };

/** 路径内嵌文本的完整、可序列化外观。 */
export interface InlinePathTextSpec {
  /** 显示在完整渲染路径累计长度中点的非空文本。 */
  text: string;
  /** 文本字体族。 */
  fontFamily: string;
  /** 文本字号，单位为 CSS 像素。 */
  fontSize: number;
  /** 文本字重。 */
  fontWeight: number | 'normal' | 'bold';
  /** 文本字体样式。 */
  fontStyle: 'normal' | 'italic';
  /** 文本内部的纯色填充。 */
  fill: SolidFillSpec;
  /** 文本轮廓使用的不可虚线描边。 */
  stroke?: PathGlyphStrokeSpec;
  /** 文本背景的纯色填充。 */
  backgroundFill?: SolidFillSpec;
  /** 文本背景四周的 CSS 像素内边距。 */
  backgroundPadding?: number;
  /** 文本视觉外观两侧切断轨道的额外 CSS 像素间距。 */
  gapPadding: number;
}

/** 路径线饰作用于开放路径或 Polygon 闭合外环的策略。 */
export type PathContourPolicySpec =
  | {
      /** 固定为开放路径。 */
      kind: 'open';
    }
  | {
      /** 固定为闭合路径。 */
      kind: 'closed';
      /** 第一版只装饰 Polygon 外环。 */
      rings: 'outer';
      /** 保持固定间距，并把余量集中在闭合缝。 */
      seam: 'preserve-spacing';
    };

/** 路径轨道允许的描边字段；固定像素轨道不支持整段虚线拟合。 */
export type PathTrackStrokeSpec = Omit<StrokeSpec, 'fitPatternOnce'> & {
  /** `fitPatternOnce` 只属于顶层普通 Stroke，路径轨道明确禁止。 */
  fitPatternOnce?: never;
};

/** 沿路径法线偏移的一条独立轨道。 */
export interface PathTrackSpec {
  /** 相对逻辑中心路径的法向 CSS 像素偏移。 */
  offset: number;
  /** 轨道独立使用的描边样式。 */
  stroke: PathTrackStrokeSpec;
}

/** 可组合的轨道、端帽、装饰与中点文本路径线饰。 */
export interface LineworkSpec {
  /** 零条或多条独立轨道；纯装饰路径使用空数组。 */
  tracks: PathTrackSpec[];
  /** 开放单轨路径可以分别配置起点和终点端帽。 */
  caps?: {
    /** 起点端帽。 */
    start?: PathCapSpec;
    /** 终点端帽。 */
    end?: PathCapSpec;
  };
  /** 重复装饰或严格位于累计长度中点的固定装饰。 */
  decorations?: PathDecorationSpec[];
  /** 严格位于累计长度中点并切断全部轨道的文本占位。 */
  inlineText?: InlinePathTextSpec;
  /** 省略时按开放路径解释；内置工厂始终显式写入。 */
  contour?: PathContourPolicySpec;
}

/** 可序列化、可复制的结构化样式。 */
export interface StyleSpec {
  /** Point 使用的圆形或图片样式。 */
  symbol?: CircleSymbolSpec | IconSymbolSpec;
  /** 可以叠加多层描边。 */
  strokes?: StrokeSpec[];
  /** 面图形使用的颜色或纹理。 */
  fill?: SolidFillSpec | PatternFillSpec;
  /** Element 文字样式。 */
  text?: TextSpec;
  /** 沿线显示的箭头等附加内容。 */
  decorations?: ArrowDecorationSpec[];
  /** 沿开放路径或 Polygon 外环渲染的高级路径线饰。 */
  linework?: LineworkSpec;
  /** 控制同一图层中样式的绘制顺序。 */
  zIndex?: number;
}

/**
 * 样式更新参数。数组会整体替换，对象会逐层合并，传入 `undefined` 可删除字段；传入 `type` 时会替换整个样式分支。
 */
export type StylePatch = {
  /** 更新、替换或删除圆形和图片符号。 */
  symbol?:
    | CircleSymbolSpec
    | IconSymbolSpec
    | undefined
    | ({
        /** 局部更新圆形符号时不要传入。 */
        type?: never;
        /** 更新圆点的像素半径。 */
        radius?: CircleSymbolSpec['radius'];
        /** 更新、替换或删除圆点填充。 */
        fill?:
          | SolidFillSpec
          | PatternFillSpec
          | undefined
          | {
              /** 局部更新纯色填充时不要传入。 */
              type?: never;
              /** 更新纯色填充的颜色。 */
              color?: SolidFillSpec['color'];
              /** 纯色填充不能设置这个字段。 */
              pattern?: never;
              /** 纯色填充不能设置这个字段。 */
              size?: never;
              /** 纯色填充不能设置这个字段。 */
              lineWidth?: never;
              /** 纯色填充不能设置这个字段。 */
              dotRadius?: never;
              /** 纯色填充不能设置这个字段。 */
              backgroundColor?: never;
            }
          | {
              /** 局部更新纹理填充时不要传入。 */
              type?: never;
              /** 更新填充使用的内置图案。 */
              pattern?: PatternFillSpec['pattern'];
              /** 更新纹理线条或圆点的颜色。 */
              color?: PatternFillSpec['color'] | undefined;
              /** 更新纹理单元的像素大小。 */
              size?: PatternFillSpec['size'] | undefined;
              /** 更新纹理线条的像素宽度。 */
              lineWidth?: PatternFillSpec['lineWidth'] | undefined;
              /** 更新圆点纹理的像素半径。 */
              dotRadius?: PatternFillSpec['dotRadius'] | undefined;
              /** 更新或删除纹理背景色。 */
              backgroundColor?: PatternFillSpec['backgroundColor'] | undefined;
            };
        /** 逐项更新或删除圆点描边。 */
        stroke?: { [K in keyof StrokeSpec]?: StrokeSpec[K] | undefined } | undefined;
      } & { [K in Exclude<keyof IconSymbolSpec, 'type'>]?: never })
    | ({
        /** 局部更新图片符号时不要传入。 */
        type?: never;
        /** 更新图片使用的 URL 或 Data URL。 */
        src?: IconSymbolSpec['src'];
      } & {
        [K in Exclude<keyof IconSymbolSpec, 'type' | 'src'>]?: IconSymbolSpec[K] | undefined;
      } & { [K in Exclude<keyof CircleSymbolSpec, 'type'>]?: never });
  /** 整体替换或删除多层描边。 */
  strokes?: StrokeSpec[] | undefined;
  /** 更新、替换或删除颜色和纹理填充。 */
  fill?:
    | SolidFillSpec
    | PatternFillSpec
    | undefined
    | {
        /** 局部更新纯色填充时不要传入。 */
        type?: never;
        /** 更新纯色填充的颜色。 */
        color?: SolidFillSpec['color'];
        /** 纯色填充不能设置这个字段。 */
        pattern?: never;
        /** 纯色填充不能设置这个字段。 */
        size?: never;
        /** 纯色填充不能设置这个字段。 */
        lineWidth?: never;
        /** 纯色填充不能设置这个字段。 */
        dotRadius?: never;
        /** 纯色填充不能设置这个字段。 */
        backgroundColor?: never;
      }
    | {
        /** 局部更新纹理填充时不要传入。 */
        type?: never;
        /** 更新填充使用的内置图案。 */
        pattern?: PatternFillSpec['pattern'];
        /** 更新纹理线条或圆点的颜色。 */
        color?: PatternFillSpec['color'] | undefined;
        /** 更新纹理单元的像素大小。 */
        size?: PatternFillSpec['size'] | undefined;
        /** 更新纹理线条的像素宽度。 */
        lineWidth?: PatternFillSpec['lineWidth'] | undefined;
        /** 更新圆点纹理的像素半径。 */
        dotRadius?: PatternFillSpec['dotRadius'] | undefined;
        /** 更新或删除纹理背景色。 */
        backgroundColor?: PatternFillSpec['backgroundColor'] | undefined;
      };
  /** 逐项更新或删除文字样式。 */
  text?:
    | undefined
    | (Omit<{ [K in keyof TextSpec]?: TextSpec[K] | undefined }, 'text' | 'fill' | 'stroke' | 'backgroundFill' | 'backgroundStroke'> & {
        /** 更新要显示的文字内容。 */
        text?: TextSpec['text'];
        /** 更新、替换或删除文字内部样式。 */
        fill?:
          | SolidFillSpec
          | PatternFillSpec
          | undefined
          | {
              /** 局部更新纯色填充时不要传入。 */
              type?: never;
              /** 更新纯色填充的颜色。 */
              color?: SolidFillSpec['color'];
              /** 纯色填充不能设置这个字段。 */
              pattern?: never;
              /** 纯色填充不能设置这个字段。 */
              size?: never;
              /** 纯色填充不能设置这个字段。 */
              lineWidth?: never;
              /** 纯色填充不能设置这个字段。 */
              dotRadius?: never;
              /** 纯色填充不能设置这个字段。 */
              backgroundColor?: never;
            }
          | {
              /** 局部更新纹理填充时不要传入。 */
              type?: never;
              /** 更新填充使用的内置图案。 */
              pattern?: PatternFillSpec['pattern'];
              /** 更新纹理线条或圆点的颜色。 */
              color?: PatternFillSpec['color'] | undefined;
              /** 更新纹理单元的像素大小。 */
              size?: PatternFillSpec['size'] | undefined;
              /** 更新纹理线条的像素宽度。 */
              lineWidth?: PatternFillSpec['lineWidth'] | undefined;
              /** 更新圆点纹理的像素半径。 */
              dotRadius?: PatternFillSpec['dotRadius'] | undefined;
              /** 更新或删除纹理背景色。 */
              backgroundColor?: PatternFillSpec['backgroundColor'] | undefined;
            };
        /** 逐项更新或删除文字边缘样式。 */
        stroke?: { [K in keyof StrokeSpec]?: StrokeSpec[K] | undefined } | undefined;
        /** 更新、替换或删除文字背景样式。 */
        backgroundFill?:
          | SolidFillSpec
          | PatternFillSpec
          | undefined
          | {
              /** 局部更新纯色填充时不要传入。 */
              type?: never;
              /** 更新纯色填充的颜色。 */
              color?: SolidFillSpec['color'];
              /** 纯色填充不能设置这个字段。 */
              pattern?: never;
              /** 纯色填充不能设置这个字段。 */
              size?: never;
              /** 纯色填充不能设置这个字段。 */
              lineWidth?: never;
              /** 纯色填充不能设置这个字段。 */
              dotRadius?: never;
              /** 纯色填充不能设置这个字段。 */
              backgroundColor?: never;
            }
          | {
              /** 局部更新纹理填充时不要传入。 */
              type?: never;
              /** 更新填充使用的内置图案。 */
              pattern?: PatternFillSpec['pattern'];
              /** 更新纹理线条或圆点的颜色。 */
              color?: PatternFillSpec['color'] | undefined;
              /** 更新纹理单元的像素大小。 */
              size?: PatternFillSpec['size'] | undefined;
              /** 更新纹理线条的像素宽度。 */
              lineWidth?: PatternFillSpec['lineWidth'] | undefined;
              /** 更新圆点纹理的像素半径。 */
              dotRadius?: PatternFillSpec['dotRadius'] | undefined;
              /** 更新或删除纹理背景色。 */
              backgroundColor?: PatternFillSpec['backgroundColor'] | undefined;
            };
        /** 逐项更新或删除文字背景边缘样式。 */
        backgroundStroke?: { [K in keyof StrokeSpec]?: StrokeSpec[K] | undefined } | undefined;
      });
  /** 整体替换或删除箭头等装饰。 */
  decorations?: ArrowDecorationSpec[] | undefined;
  /** 整体替换或删除路径线饰，不执行深层局部合并。 */
  linework?: LineworkSpec | undefined;
  /** 更新或删除样式的绘制层级。 */
  zIndex?: number | undefined;
};

/** Element 持有的结构化样式或受控原生样式引用。 */
export type ElementStyleState = StyleSpec | NativeStyleRef;

/** 创建一个受控的原生样式引用。 */
export function createNativeStyleRef(): NativeStyleRef {
  const reference = Object.freeze({ [nativeStyleRefBrand]: true }) as NativeStyleRef;
  issuedNativeStyleRefs.add(reference);
  return reference;
}

/** 判断一个值是否是引擎创建的原生样式引用。 */
export function isNativeStyleRef(value: unknown): value is NativeStyleRef {
  if (typeof value !== 'object' || value === null) return false;
  return Object.isFrozen(value) && issuedNativeStyleRefs.has(value);
}
