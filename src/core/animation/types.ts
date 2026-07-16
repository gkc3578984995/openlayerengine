import type { Color } from '../common/types.js';

/** 同一 Element 上可独立控制的动画通道。 */
export type AnimationChannel = string;

/** 动画句柄的生命周期状态。 */
export type AnimationStatus = 'running' | 'paused' | 'stopped' | 'finished';

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
  /** 脉冲扩散到的最大像素半径。 */
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
  /** 按位置和颜色设置移动轨迹的渐变。 */
  readonly gradient?: readonly (readonly [offset: number, color: Color])[];
  /** 移动轨迹的像素宽度。 */
  readonly width?: number;
  /** `0` 使用原路径，其他值按路径长度控制弯曲方向和幅度。 */
  readonly curvature?: number;
  /** 设置路径采样段数，数值越大越平滑。 */
  readonly smoothness?: number;
  /** 控制移动方向箭头是否可见。 */
  readonly arrow?: boolean;
  /** 移动方向箭头使用的颜色。 */
  readonly arrowColor?: Color;
  /** 控制路径起点标记是否可见。 */
  readonly showStart?: boolean;
  /** 控制路径终点标记是否可见。 */
  readonly showEnd?: boolean;
  /** 终点辅助线使用的颜色。 */
  readonly endLineColor?: Color;
  /** 选择移除动画效果或保留最后一帧。 */
  readonly finishBehavior?: 'remove' | 'retain';
}

/** 引擎内置动画的配置联合类型。 */
export type AnimationSpec = PulseAnimationSpec | DashFlowAnimationSpec | PathTravelAnimationSpec;
