import type { Color } from '../common/types.js';

/** 原生样式引用的内部标记。 */
const nativeStyleRefBrand: unique symbol = Symbol('ol-engine.native-style-ref');

/** 已创建的原生样式引用。 */
const issuedNativeStyleRefs = new WeakSet<object>();

/** 原生样式引用。表示样式由当前 Earth 中的 OpenLayers 对象提供。 */
export interface NativeStyleRef {
  /** 内部标记。用于识别引擎创建的原生样式引用。 */
  readonly [nativeStyleRefBrand]: true;
}

/** 线条样式。用于描边、折线和文字轮廓。 */
export interface StrokeSpec {
  /** 颜色。线条使用的颜色。 */
  color?: Color;
  /** 线宽。线条的像素宽度。 */
  width?: number;
  /** 虚线。按像素设置实线和空白的长度。 */
  lineDash?: number[];
  /** 虚线偏移。控制虚线从哪个位置开始。 */
  lineDashOffset?: number;
  /** 线帽。控制线条两端的形状。 */
  lineCap?: 'butt' | 'round' | 'square';
  /** 连接样式。控制线段拐角的形状。 */
  lineJoin?: 'bevel' | 'round' | 'miter';
  /** 斜接限制。限制尖角可以延伸的长度。 */
  miterLimit?: number;
  /** 单次适配。让整组虚线刚好铺满路径。 */
  fitPatternOnce?: boolean;
}

/** 纯色填充。使用一种颜色填充图形。 */
export interface SolidFillSpec {
  /** 类型。固定为纯色填充。 */
  type: 'solid';
  /** 颜色。填充区域使用的颜色。 */
  color: Color;
}

/** 纹理填充。使用内置图案重复填充图形。 */
export interface PatternFillSpec {
  /** 类型。固定为纹理填充。 */
  type: 'pattern';
  /** 纹理。选择斜线、交叉线、圆点、横线或竖线。 */
  pattern: 'diagonal' | 'cross' | 'dot' | 'horizontal' | 'vertical';
  /** 颜色。纹理线条或圆点使用的颜色。 */
  color?: Color;
  /** 尺寸。一个纹理单元的像素大小。 */
  size?: number;
  /** 线宽。纹理线条的像素宽度。 */
  lineWidth?: number;
  /** 圆点半径。圆点纹理中每个点的像素半径。 */
  dotRadius?: number;
  /** 背景色。纹理空白区域使用的颜色。 */
  backgroundColor?: Color;
}

/** 圆形符号。用圆点显示点元素。 */
export interface CircleSymbolSpec {
  /** 类型。固定为圆形符号。 */
  type: 'circle';
  /** 半径。圆点的像素半径。 */
  radius: number;
  /** 填充。圆点内部使用的样式。 */
  fill?: SolidFillSpec | PatternFillSpec;
  /** 描边。圆点边缘使用的样式。 */
  stroke?: StrokeSpec;
}

/** 图片符号。用一张图片显示点元素。 */
export interface IconSymbolSpec {
  /** 类型。固定为图片符号。 */
  type: 'icon';
  /** 图片地址。可以是 URL 或 Data URL。 */
  src: string;
  /** 图片尺寸。按 `[宽度, 高度]` 设置源图片大小。 */
  size?: [number, number];
  /** 颜色。用于给图片叠加颜色。 */
  color?: Color;
  /** 裁剪偏移。图片在雪碧图中的起始位置。 */
  offset?: [number, number];
  /** 显示偏移。按 `[向右, 向上]` 设置图片相对锚点的像素距离。 */
  displacement?: [number, number];
  /** 缩放。可以统一缩放，也可以分别缩放宽高。 */
  scale?: number | [number, number];
  /** 旋转角度。图片顺时针旋转的角度，单位为度。 */
  rotation?: number;
  /** 跟随视图旋转。控制图片是否随地图一起旋转。 */
  rotateWithView?: boolean;
  /** 锚点。用于控制图片的定位点。 */
  anchor?: [number, number];
  /** 锚点原点。指定锚点从图片哪个角开始计算。 */
  anchorOrigin?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** 横向锚点单位。可以使用比例或像素。 */
  anchorXUnits?: 'fraction' | 'pixels';
  /** 纵向锚点单位。可以使用比例或像素。 */
  anchorYUnits?: 'fraction' | 'pixels';
  /** 裁剪原点。指定裁剪偏移从图片哪个角开始计算。 */
  origin?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** 透明度。取值范围为 `0` 到 `1`。 */
  opacity?: number;
  /** 跨域方式。设置图片请求使用的 `crossOrigin`。 */
  crossOrigin?: string | null;
}

/** 文本样式。控制元素旁边文字的内容和外观。 */
export interface TextSpec {
  /** 文本。要显示的文字内容。 */
  text: string;
  /** 字体。未设置拆分字体字段时，直接使用完整的 CSS 字体值。 */
  font?: string;
  /** 字体名称。设置文字使用的字体族。 */
  fontFamily?: string;
  /** 字号。设置文字大小，数字按像素处理。 */
  fontSize?: number | string;
  /** 字重。设置文字的粗细。 */
  fontWeight?: number | 'normal' | 'bold' | 'bolder' | 'lighter';
  /** 字体样式。设置正常、斜体或倾斜文字。 */
  fontStyle?: 'normal' | 'italic' | 'oblique';
  /** 文字填充。控制文字内部的颜色或纹理。 */
  fill?: SolidFillSpec | PatternFillSpec;
  /** 文字描边。控制文字边缘的样式。 */
  stroke?: StrokeSpec;
  /** 背景填充。控制文字背景的颜色或纹理。 */
  backgroundFill?: SolidFillSpec | PatternFillSpec;
  /** 背景描边。控制文字背景边缘的样式。 */
  backgroundStroke?: StrokeSpec;
  /** 内边距。按 `[上, 右, 下, 左]` 设置像素距离。 */
  padding?: number[];
  /** 横向偏移。正值让文字向右移动，单位为像素。 */
  offsetX?: number;
  /** 纵向偏移。正值让文字向上移动，单位为像素。 */
  offsetY?: number;
  /** 缩放。可以统一缩放，也可以分别缩放宽高。 */
  scale?: number | [number, number];
  /** 水平对齐。控制文字相对定位点的水平位置。 */
  textAlign?: 'left' | 'right' | 'center' | 'start' | 'end';
  /** 垂直对齐。控制文字相对定位点的垂直位置。 */
  textBaseline?: 'bottom' | 'top' | 'middle' | 'alphabetic' | 'hanging' | 'ideographic';
  /** 旋转角度。文字顺时针旋转的角度，单位为度。 */
  rotation?: number;
  /** 跟随视图旋转。控制文字是否随地图一起旋转。 */
  rotateWithView?: boolean;
  /** 允许溢出。控制文字超出几何范围时是否仍然显示。 */
  overflow?: boolean;
  /** 放置方式。可以放在点上，也可以沿线放置。 */
  placement?: 'point' | 'line';
  /** 最大夹角。沿线文字允许的最大转角，单位为度。 */
  maxAngle?: number;
  /** 重复间距。沿线重复文字之间的像素距离。 */
  repeat?: number;
  /** 对齐方式。控制多行文字内部的对齐方向。 */
  justify?: 'left' | 'right' | 'center';
  /** 保持正向。控制沿线文字是否自动避免倒置。 */
  keepUpright?: boolean;
}

/** 箭头装饰。在线条的指定位置添加箭头。 */
export interface ArrowDecorationSpec {
  /** 类型。固定为箭头装饰。 */
  type: 'arrow';
  /** 放置位置。选择起点、终点、每段或重复放置。 */
  placement: 'start' | 'end' | 'each-segment' | 'repeat';
  /** 箭头图片。自定义箭头使用的图片符号。 */
  symbol?: IconSymbolSpec;
  /** 路径偏移。重复放置箭头时，设置第一个箭头距起点的像素距离。 */
  offset?: number;
  /** 重复间距。重复放置箭头时，设置相邻箭头的像素距离。 */
  spacing?: number;
}

/** 结构化样式。统一设置符号、线条、填充、文字和装饰。 */
export interface StyleSpec {
  /** 点符号。点元素使用的圆形或图片样式。 */
  symbol?: CircleSymbolSpec | IconSymbolSpec;
  /** 线条。可以叠加多层描边。 */
  strokes?: StrokeSpec[];
  /** 填充。面元素内部使用的颜色或纹理。 */
  fill?: SolidFillSpec | PatternFillSpec;
  /** 文本。元素旁边显示的文字样式。 */
  text?: TextSpec;
  /** 装饰。沿线显示的箭头等附加内容。 */
  decorations?: ArrowDecorationSpec[];
  /** 层级。控制同一图层中样式的绘制顺序。 */
  zIndex?: number;
}

/**
 * 样式更新参数。数组会整体替换，对象会逐层合并，传入 `undefined` 可删除字段；传入 `type` 时会替换整个样式分支。
 */
export type StylePatch = {
  /** 点符号。更新、替换或删除圆形和图片符号。 */
  symbol?:
    | CircleSymbolSpec
    | IconSymbolSpec
    | undefined
    | ({
        /** 类型。局部更新圆形符号时不要传入。 */
        type?: never;
        /** 半径。更新圆点的像素半径。 */
        radius?: CircleSymbolSpec['radius'];
        /** 填充。更新、替换或删除圆点填充。 */
        fill?:
          | SolidFillSpec
          | PatternFillSpec
          | undefined
          | {
              /** 类型。局部更新纯色填充时不要传入。 */
              type?: never;
              /** 颜色。更新纯色填充的颜色。 */
              color?: SolidFillSpec['color'];
              /** 纹理。纯色填充不能设置这个字段。 */
              pattern?: never;
              /** 尺寸。纯色填充不能设置这个字段。 */
              size?: never;
              /** 线宽。纯色填充不能设置这个字段。 */
              lineWidth?: never;
              /** 圆点半径。纯色填充不能设置这个字段。 */
              dotRadius?: never;
              /** 背景色。纯色填充不能设置这个字段。 */
              backgroundColor?: never;
            }
          | {
              /** 类型。局部更新纹理填充时不要传入。 */
              type?: never;
              /** 纹理。更新填充使用的内置图案。 */
              pattern?: PatternFillSpec['pattern'];
              /** 颜色。更新纹理线条或圆点的颜色。 */
              color?: PatternFillSpec['color'] | undefined;
              /** 尺寸。更新纹理单元的像素大小。 */
              size?: PatternFillSpec['size'] | undefined;
              /** 线宽。更新纹理线条的像素宽度。 */
              lineWidth?: PatternFillSpec['lineWidth'] | undefined;
              /** 圆点半径。更新圆点纹理的像素半径。 */
              dotRadius?: PatternFillSpec['dotRadius'] | undefined;
              /** 背景色。更新或删除纹理背景色。 */
              backgroundColor?: PatternFillSpec['backgroundColor'] | undefined;
            };
        /** 描边。逐项更新或删除圆点描边。 */
        stroke?: { [K in keyof StrokeSpec]?: StrokeSpec[K] | undefined } | undefined;
      } & { [K in Exclude<keyof IconSymbolSpec, 'type'>]?: never })
    | ({
        /** 类型。局部更新图片符号时不要传入。 */
        type?: never;
        /** 图片地址。更新图片使用的 URL 或 Data URL。 */
        src?: IconSymbolSpec['src'];
      } & {
        [K in Exclude<keyof IconSymbolSpec, 'type' | 'src'>]?: IconSymbolSpec[K] | undefined;
      } & { [K in Exclude<keyof CircleSymbolSpec, 'type'>]?: never });
  /** 线条。整体替换或删除多层描边。 */
  strokes?: StrokeSpec[] | undefined;
  /** 填充。更新、替换或删除颜色和纹理填充。 */
  fill?:
    | SolidFillSpec
    | PatternFillSpec
    | undefined
    | {
        /** 类型。局部更新纯色填充时不要传入。 */
        type?: never;
        /** 颜色。更新纯色填充的颜色。 */
        color?: SolidFillSpec['color'];
        /** 纹理。纯色填充不能设置这个字段。 */
        pattern?: never;
        /** 尺寸。纯色填充不能设置这个字段。 */
        size?: never;
        /** 线宽。纯色填充不能设置这个字段。 */
        lineWidth?: never;
        /** 圆点半径。纯色填充不能设置这个字段。 */
        dotRadius?: never;
        /** 背景色。纯色填充不能设置这个字段。 */
        backgroundColor?: never;
      }
    | {
        /** 类型。局部更新纹理填充时不要传入。 */
        type?: never;
        /** 纹理。更新填充使用的内置图案。 */
        pattern?: PatternFillSpec['pattern'];
        /** 颜色。更新纹理线条或圆点的颜色。 */
        color?: PatternFillSpec['color'] | undefined;
        /** 尺寸。更新纹理单元的像素大小。 */
        size?: PatternFillSpec['size'] | undefined;
        /** 线宽。更新纹理线条的像素宽度。 */
        lineWidth?: PatternFillSpec['lineWidth'] | undefined;
        /** 圆点半径。更新圆点纹理的像素半径。 */
        dotRadius?: PatternFillSpec['dotRadius'] | undefined;
        /** 背景色。更新或删除纹理背景色。 */
        backgroundColor?: PatternFillSpec['backgroundColor'] | undefined;
      };
  /** 文本。逐项更新或删除文字样式。 */
  text?:
    | undefined
    | (Omit<{ [K in keyof TextSpec]?: TextSpec[K] | undefined }, 'text' | 'fill' | 'stroke' | 'backgroundFill' | 'backgroundStroke'> & {
        /** 文本。更新要显示的文字内容。 */
        text?: TextSpec['text'];
        /** 文字填充。更新、替换或删除文字内部样式。 */
        fill?:
          | SolidFillSpec
          | PatternFillSpec
          | undefined
          | {
              /** 类型。局部更新纯色填充时不要传入。 */
              type?: never;
              /** 颜色。更新纯色填充的颜色。 */
              color?: SolidFillSpec['color'];
              /** 纹理。纯色填充不能设置这个字段。 */
              pattern?: never;
              /** 尺寸。纯色填充不能设置这个字段。 */
              size?: never;
              /** 线宽。纯色填充不能设置这个字段。 */
              lineWidth?: never;
              /** 圆点半径。纯色填充不能设置这个字段。 */
              dotRadius?: never;
              /** 背景色。纯色填充不能设置这个字段。 */
              backgroundColor?: never;
            }
          | {
              /** 类型。局部更新纹理填充时不要传入。 */
              type?: never;
              /** 纹理。更新填充使用的内置图案。 */
              pattern?: PatternFillSpec['pattern'];
              /** 颜色。更新纹理线条或圆点的颜色。 */
              color?: PatternFillSpec['color'] | undefined;
              /** 尺寸。更新纹理单元的像素大小。 */
              size?: PatternFillSpec['size'] | undefined;
              /** 线宽。更新纹理线条的像素宽度。 */
              lineWidth?: PatternFillSpec['lineWidth'] | undefined;
              /** 圆点半径。更新圆点纹理的像素半径。 */
              dotRadius?: PatternFillSpec['dotRadius'] | undefined;
              /** 背景色。更新或删除纹理背景色。 */
              backgroundColor?: PatternFillSpec['backgroundColor'] | undefined;
            };
        /** 文字描边。逐项更新或删除文字边缘样式。 */
        stroke?: { [K in keyof StrokeSpec]?: StrokeSpec[K] | undefined } | undefined;
        /** 背景填充。更新、替换或删除文字背景样式。 */
        backgroundFill?:
          | SolidFillSpec
          | PatternFillSpec
          | undefined
          | {
              /** 类型。局部更新纯色填充时不要传入。 */
              type?: never;
              /** 颜色。更新纯色填充的颜色。 */
              color?: SolidFillSpec['color'];
              /** 纹理。纯色填充不能设置这个字段。 */
              pattern?: never;
              /** 尺寸。纯色填充不能设置这个字段。 */
              size?: never;
              /** 线宽。纯色填充不能设置这个字段。 */
              lineWidth?: never;
              /** 圆点半径。纯色填充不能设置这个字段。 */
              dotRadius?: never;
              /** 背景色。纯色填充不能设置这个字段。 */
              backgroundColor?: never;
            }
          | {
              /** 类型。局部更新纹理填充时不要传入。 */
              type?: never;
              /** 纹理。更新填充使用的内置图案。 */
              pattern?: PatternFillSpec['pattern'];
              /** 颜色。更新纹理线条或圆点的颜色。 */
              color?: PatternFillSpec['color'] | undefined;
              /** 尺寸。更新纹理单元的像素大小。 */
              size?: PatternFillSpec['size'] | undefined;
              /** 线宽。更新纹理线条的像素宽度。 */
              lineWidth?: PatternFillSpec['lineWidth'] | undefined;
              /** 圆点半径。更新圆点纹理的像素半径。 */
              dotRadius?: PatternFillSpec['dotRadius'] | undefined;
              /** 背景色。更新或删除纹理背景色。 */
              backgroundColor?: PatternFillSpec['backgroundColor'] | undefined;
            };
        /** 背景描边。逐项更新或删除文字背景边缘样式。 */
        backgroundStroke?: { [K in keyof StrokeSpec]?: StrokeSpec[K] | undefined } | undefined;
      });
  /** 装饰。整体替换或删除箭头等装饰。 */
  decorations?: ArrowDecorationSpec[] | undefined;
  /** 层级。更新或删除样式的绘制层级。 */
  zIndex?: number | undefined;
};

/** 元素样式状态。可以是结构化样式或受控的原生样式引用。 */
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
