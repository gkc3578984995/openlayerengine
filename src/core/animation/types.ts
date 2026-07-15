import type { Color } from '../common/types.js';

/** 动画通道。用于区分同一元素上的不同动画。 */
export type AnimationChannel = string;

/** 动画状态。表示动画当前正在运行、暂停、停止或已经结束。 */
export type AnimationStatus = 'running' | 'paused' | 'stopped' | 'finished';

/** 脉冲动画。让点元素按周期向外扩散。 */
export interface PulseAnimationSpec {
  /** 类型。固定为脉冲动画。 */
  readonly type: 'pulse';
  /** 通道。用于单独控制这组动画。 */
  readonly channel?: AnimationChannel;
  /** 周期。一次脉冲持续的毫秒数。 */
  readonly periodMs?: number;
  /** 颜色。脉冲扩散时使用的颜色。 */
  readonly color?: Color;
  /** 是否重复。控制动画完成后是否重新开始。 */
  readonly repeat?: boolean;
  /** 半径。脉冲扩散到的最大像素半径。 */
  readonly radius?: number;
}

/** 流动虚线动画。让线条的虚线沿路径移动。 */
export interface DashFlowAnimationSpec {
  /** 类型。固定为流动虚线动画。 */
  readonly type: 'dash-flow';
  /** 通道。用于单独控制这组动画。 */
  readonly channel?: AnimationChannel;
  /** 速度。虚线每秒移动的像素距离。 */
  readonly speed?: number;
  /** 虚线。按像素设置实线和空白的长度。 */
  readonly lineDash?: readonly number[];
  /** 颜色。流动虚线使用的颜色。 */
  readonly color?: Color;
}

/** 路径运动动画。让带尾迹的点沿线移动。 */
export interface PathTravelAnimationSpec {
  /** 类型。固定为路径运动动画。 */
  readonly type: 'path-travel';
  /** 通道。用于单独控制这组动画。 */
  readonly channel?: AnimationChannel;
  /** 速度。每秒移动的地图距离，不能和时长同时设置。 */
  readonly speed?: number;
  /** 时长。完整移动一次使用的毫秒数，不能和速度同时设置。 */
  readonly durationMs?: number;
  /** 是否重复。控制到达终点后是否重新开始。 */
  readonly repeat?: boolean;
  /** 尾迹长度。占整条路径的比例，取值大于 `0` 且不超过 `1`。 */
  readonly trailLength?: number;
  /** 颜色。移动轨迹使用的颜色。 */
  readonly color?: Color;
  /** 渐变。按位置和颜色设置移动轨迹的渐变。 */
  readonly gradient?: readonly (readonly [offset: number, color: Color])[];
  /** 线宽。移动轨迹的像素宽度。 */
  readonly width?: number;
  /** 弯曲程度。`0` 使用原路径，其他值按路径长度控制弯曲方向和幅度。 */
  readonly curvature?: number;
  /** 平滑度。设置路径采样段数，数值越大越平滑。 */
  readonly smoothness?: number;
  /** 是否显示箭头。控制移动方向箭头是否可见。 */
  readonly arrow?: boolean;
  /** 箭头颜色。移动方向箭头使用的颜色。 */
  readonly arrowColor?: Color;
  /** 是否显示起点。控制路径起点标记是否可见。 */
  readonly showStart?: boolean;
  /** 是否显示终点。控制路径终点标记是否可见。 */
  readonly showEnd?: boolean;
  /** 终点线颜色。终点辅助线使用的颜色。 */
  readonly endLineColor?: Color;
  /** 完成方式。选择移除动画效果或保留最后一帧。 */
  readonly finishBehavior?: 'remove' | 'retain';
}

/** 动画配置。包含引擎内置的全部动画类型。 */
export type AnimationSpec = PulseAnimationSpec | DashFlowAnimationSpec | PathTravelAnimationSpec;
