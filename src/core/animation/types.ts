import type { Color } from '../common/types.js';

/** 同一 Element 上可独立控制的动画通道。 */
export type AnimationChannel = string;

/** 动画句柄的生命周期状态。 */
export type AnimationStatus = 'running' | 'paused' | 'stopped' | 'finished';

/** 动画进度使用的内置缓动曲线。 */
export type AnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/** Point 周期性向外扩散的脉冲动画。 */
export interface PulseAnimationSpec {
  /** 固定为脉冲动画。 */
  readonly type: 'pulse';
  /** 独立控制这组动画的通道。 */
  readonly channel?: AnimationChannel;
  /** 单次脉冲周期，单位为毫秒。 */
  readonly periodMs?: number;
  /** 脉冲扩散时使用的颜色。 */
  readonly color?: Color;
  /** 完成后是否重新开始。 */
  readonly repeat?: boolean;
  /** 脉冲起始的像素半径；动画在此基础上继续向外扩散。 */
  readonly radius?: number;
}

/** 让折线虚线沿路径移动的动画。 */
export interface DashFlowAnimationSpec {
  /** 固定为流动虚线动画。 */
  readonly type: 'dash-flow';
  /** 独立控制这组动画的通道。 */
  readonly channel?: AnimationChannel;
  /** 虚线每秒移动的像素距离。 */
  readonly speed?: number;
  /** 按像素设置实线和空白的长度。 */
  readonly lineDash?: readonly number[];
  /** 流动虚线使用的颜色。 */
  readonly color?: Color;
}

/** 带尾迹的路径移动动画。 */
export interface PathTravelAnimationSpec {
  /** 固定为路径运动动画。 */
  readonly type: 'path-travel';
  /** 独立控制这组动画的通道。 */
  readonly channel?: AnimationChannel;
  /** 每秒移动的地图距离，不能和时长同时设置。 */
  readonly speed?: number;
  /** 完整移动一次的时长，单位为毫秒；不能和速度同时设置。 */
  readonly durationMs?: number;
  /** 到达终点后是否重新开始。 */
  readonly repeat?: boolean;
  /** 占整条路径的比例，取值大于 `0` 且不超过 `1`。 */
  readonly trailLength?: number;
  /** 移动轨迹使用的颜色。 */
  readonly color?: Color;
  /** 按位置和颜色设置移动轨迹的渐变；支持 named、hex、传统逗号及现代数值 rgb/hsl 语法、`transparent` 和数值 RGB/RGBA。 */
  readonly gradient?: readonly (readonly [offset: number, color: Color])[];
  /** 移动轨迹的像素宽度。 */
  readonly width?: number;
  /** `0` 使用原路径；两点路径使用二次 Bézier，多点路径使用 centripetal knot 与 waypoint 共享切线，正负值控制入弯或出弯侧重。 */
  readonly curvature?: number;
  /** 设置整条曲线路径的采样预算；多点路径为避免曲率失效，每个非退化原始分段至少使用两个采样段。 */
  readonly smoothness?: number;
  /** 控制路径起点标记是否可见。 */
  readonly showStart?: boolean;
  /** 控制路径终点标记是否可见。 */
  readonly showEnd?: boolean;
  /** 终点辅助线使用的颜色。 */
  readonly endLineColor?: Color;
  /** 选择移除动画效果或保留最后一帧。 */
  readonly finishBehavior?: 'remove' | 'retain';
}

/** 让结构化图形按固定占空比阶跃闪烁。 */
export interface BlinkAnimationSpec {
  /** 固定为闪烁动画。 */
  readonly type: 'blink';
  /** 独立控制这组动画的通道。 */
  readonly channel?: AnimationChannel;
  /** 单次闪烁周期，单位为毫秒。 */
  readonly periodMs?: number;
  /** 每周期保持最大透明度的比例。 */
  readonly dutyCycle?: number;
  /** 闪烁低位使用的整体透明度乘数。 */
  readonly minOpacity?: number;
  /** 闪烁高位使用的整体透明度乘数。 */
  readonly maxOpacity?: number;
  /** 完成一个周期后是否重新开始。 */
  readonly repeat?: boolean;
}

/** 在闭合面上绘制稳定或呼吸高亮。 */
export interface HighlightAnimationSpec {
  /** 固定为高亮动画。 */
  readonly type: 'highlight';
  /** 独立控制这组动画的通道。 */
  readonly channel?: AnimationChannel;
  /** 使用稳定高亮或周期性呼吸高亮。 */
  readonly mode?: 'steady' | 'breathe';
  /** 高亮填充和描边使用的颜色。 */
  readonly color?: Color;
  /** 高亮填充相对颜色 alpha 的透明度乘数。 */
  readonly fillOpacity?: number;
  /** 高亮描边的像素宽度。 */
  readonly strokeWidth?: number;
  /** 呼吸高亮的单次周期，单位为毫秒。 */
  readonly periodMs?: number;
}

/** 在闭合面上绘制固定双峰节奏的告警。 */
export interface AlertAnimationSpec {
  /** 固定为告警动画。 */
  readonly type: 'alert';
  /** 独立控制这组动画的通道。 */
  readonly channel?: AnimationChannel;
  /** 单次告警周期，单位为毫秒。 */
  readonly periodMs?: number;
  /** 告警填充、描边和光晕使用的颜色。 */
  readonly color?: Color;
  /** 告警填充相对颜色 alpha 的透明度乘数。 */
  readonly fillOpacity?: number;
  /** 告警描边的像素宽度。 */
  readonly strokeWidth?: number;
  /** 完成一个告警周期后是否重新开始。 */
  readonly repeat?: boolean;
}

/** 从起点或终点逐步揭示路径和箭头。 */
export interface GrowAnimationSpec {
  /** 固定为生长动画。 */
  readonly type: 'grow';
  /** 独立控制这组动画的通道。 */
  readonly channel?: AnimationChannel;
  /** 完整揭示一次的时长，单位为毫秒。 */
  readonly durationMs?: number;
  /** 选择从路径起点或终点开始揭示。 */
  readonly direction?: 'forward' | 'reverse';
  /** 揭示进度使用的缓动曲线。 */
  readonly easing?: AnimationEasing;
  /** 完整揭示后是否重新开始。 */
  readonly repeat?: boolean;
}

/** 在圆形或扇面内绘制旋转雷达尾迹。 */
export interface RadarScanAnimationSpec {
  /** 固定为雷达扫描动画。 */
  readonly type: 'radar-scan';
  /** 独立控制这组动画的通道。 */
  readonly channel?: AnimationChannel;
  /** 完整扫描一轮的时长，单位为毫秒。 */
  readonly periodMs?: number;
  /** 最终屏幕上的扫描方向。 */
  readonly direction?: 'clockwise' | 'counterclockwise';
  /** 雷达尾迹使用的纯色；不能和 `gradient` 同时设置。 */
  readonly color?: Color;
  /** 从尾迹最旧端 `0` 到扫描前沿 `1` 的颜色渐变；支持确定性 RGBA 颜色语法，不能和 `color` 同时设置。 */
  readonly gradient?: readonly (readonly [offset: number, color: Color])[];
  /** 雷达尾迹相对颜色 alpha 的透明度乘数。 */
  readonly opacity?: number;
  /** 雷达尾迹角宽，单位为度。 */
  readonly beamWidthDeg?: number;
  /** 完成一轮扫描后是否重新开始。 */
  readonly repeat?: boolean;
}

/** 从圆形或扇面中心向外绘制带尾迹的扩散波纹。 */
export interface CenterSpreadAnimationSpec {
  /** 固定为中心扩散动画。 */
  readonly type: 'center-spread';
  /** 独立控制这组动画的通道。 */
  readonly channel?: AnimationChannel;
  /** 单个扩散环从中心传播到外半径的时长，单位为毫秒。 */
  readonly periodMs?: number;
  /** 扩散波纹使用的纯色；不能和 `gradient` 同时设置。 */
  readonly color?: Color;
  /** 从内侧最旧尾迹 `0` 到外侧波纹前沿 `1` 的颜色渐变；支持确定性 RGBA 颜色语法，不能和 `color` 同时设置。 */
  readonly gradient?: readonly (readonly [offset: number, color: Color])[];
  /** 扩散波纹相对颜色 alpha 的透明度乘数。 */
  readonly opacity?: number;
  /** 尾迹宽度占目标外半径的比例；`0` 退化为仅绘制前沿环或弧。 */
  readonly trailLength?: number;
  /** 波纹前沿环或弧的像素宽度。 */
  readonly strokeWidth?: number;
  /** 同时错峰传播的固定环数量。 */
  readonly ringCount?: number;
  /** 所有环完成一轮传播后是否重新开始。 */
  readonly repeat?: boolean;
}

/** 让结构化图形整体渐显或渐隐。 */
export interface FadeAnimationSpec {
  /** 固定为渐变透明度动画。 */
  readonly type: 'fade';
  /** 独立控制这组动画的通道。 */
  readonly channel?: AnimationChannel;
  /** 必须明确选择渐显或渐隐。 */
  readonly direction: 'in' | 'out';
  /** 完整渐变一次的时长，单位为毫秒。 */
  readonly durationMs?: number;
  /** 透明度进度使用的缓动曲线。 */
  readonly easing?: AnimationEasing;
}

/** 引擎内置动画的配置联合类型。 */
export type AnimationSpec =
  | PulseAnimationSpec
  | DashFlowAnimationSpec
  | PathTravelAnimationSpec
  | BlinkAnimationSpec
  | HighlightAnimationSpec
  | AlertAnimationSpec
  | GrowAnimationSpec
  | RadarScanAnimationSpec
  | CenterSpreadAnimationSpec
  | FadeAnimationSpec;
