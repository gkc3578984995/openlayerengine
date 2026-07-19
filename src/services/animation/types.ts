import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../../core/animation/types.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import type { LayerRenderPathReveal } from '../../core/ports/LayerRenderPort.js';
import type { RenderGeometryState, ShapeDefinition, ShapeState } from '../../core/shape/types.js';
import type { StyleSpec } from '../../core/style/types.js';

/** 控制一组由同次播放请求启动的动画。 */
export interface AnimationHandle {
  /** 本次播放请求的唯一 ID。 */
  readonly id: string;
  /** 这组动画的整体运行状态。 */
  readonly status: AnimationStatus;
  /** 所有动画自然结束或被停止后兑现。 */
  readonly finished: Promise<void>;
  /**
   * 暂停当前动画。
   *
   * @example
   * ```ts
   * const handle = earth.animations.play({ id: 'marker' }, { type: 'pulse' });
   * handle.pause();
   * ```
   */
  pause(): void;
  /**
   * 继续播放已暂停的动画。
   *
   * @example
   * ```ts
   * const handle = earth.animations.play({ id: 'marker' }, { type: 'pulse' });
   * handle.pause();
   * handle.resume();
   * ```
   */
  resume(): void;
  /**
   * 停止当前动画。
   *
   * @example
   * ```ts
   * const handle = earth.animations.play({ id: 'marker' }, { type: 'pulse' });
   * handle.stop();
   * ```
   */
  stop(): void;
}

/** 统一播放和控制当前 Earth 的 Element 动画。 */
export interface AnimationManager {
  /**
   * 为匹配的元素播放动画。
   *
   * @param selector 需要播放动画的 Element。
   * @param spec 动画类型及效果配置。
   * @returns 本次播放请求的控制句柄。
   *
   * @example
   * ```ts
   * const handle = earth.animations.play({ id: 'marker' }, { type: 'pulse' });
   * ```
   */
  play(selector: ElementSelector, spec: AnimationSpec): AnimationHandle;
  /**
   * 暂停匹配元素上的动画。
   *
   * @param selector 需要暂停动画的 Element。
   * @param channels 需要暂停的通道；省略时暂停匹配 Element 的全部动画。
   * @returns 本次增加暂停层级的动画数量。
   *
   * @example
   * ```ts
   * const count = earth.animations.pause({ module: 'vehicles' }, ['movement']);
   * ```
   */
  pause(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /**
   * 恢复匹配 Element 上已暂停的动画。
   *
   * @param selector 需要恢复动画的 Element。
   * @param channels 需要恢复的通道；省略时恢复匹配 Element 的全部动画。
   * @returns 本次减少暂停层级的动画数量。
   *
   * @example
   * ```ts
   * const count = earth.animations.resume({ module: 'vehicles' }, ['movement']);
   * ```
   */
  resume(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /**
   * 停止匹配元素上的动画。
   *
   * @param selector 需要停止动画的 Element。
   * @param channels 需要停止的通道；省略时停止匹配 Element 的全部动画。
   * @returns 此次真正停止的动画数量。
   *
   * @example
   * ```ts
   * const count = earth.animations.stop({ module: 'vehicles' }, ['movement']);
   * ```
   */
  stop(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /**
   * 停止当前 Earth 中的全部动画。
   *
   * @example
   * ```ts
   * earth.animations.stopAll();
   * ```
   */
  stopAll(): void;
}

/** 动画可以修改的展示属性域。 */
export type AnimationWriteDomain = 'target-opacity' | 'target-geometry' | 'overlay';

/** 动画对 Edit 或 Transform 临时视觉所有权的响应。 */
export type AnimationInteractionPolicy = 'follow-preview' | 'pause-and-suppress';

/** 动画定义声明的目标能力要求。 */
export type AnimationTargetCapability = 'structured-presentation' | 'closed-surface' | 'reveal-geometry' | 'radial-frame';

/** 动画 Runtime 绑定的当前 Element 展示画像。 */
export interface AnimationTargetProfile {
  /** 当前 Element 的只读规范状态。 */
  readonly state: Readonly<ElementState>;
  /** 已转换到当前 View 工作单位的 Shape 状态。 */
  readonly viewShape: ShapeState;
  /** Shape 状态生成的渲染几何。 */
  readonly geometry: RenderGeometryState;
  /** 当前结构化样式。 */
  readonly style: StyleSpec;
  /** 当前 Shape 的能力和动画 provider。 */
  readonly shape: ShapeDefinition;
}

/** 稳定样式槽允许逐帧修改的标量。 */
export type AnimationStyleParameter = 'lineDashOffset' | 'symbolRadius' | 'strokeWidth' | 'rotation';

/** Runtime 创建时声明的稳定 overlay 槽。 */
export interface AnimationSlotDefinition {
  /** Runtime 内唯一且跨帧稳定的槽名。 */
  readonly slotKey: string;
  /** 只在槽建立或目标重绑定时编译的样式模板。 */
  readonly style: StyleSpec;
  /** 该槽允许逐帧更新的样式标量。 */
  readonly dynamicParameters?: readonly AnimationStyleParameter[];
}

/** 一份已预分配 overlay 槽的可变帧值。 */
export interface AnimationOverlaySlotBuffer {
  /** 当前帧是否绘制该槽。 */
  active: boolean;
  /** 使用合成后的目标几何，或当前槽提供的快照。 */
  geometryKind: 'effective-target' | 'snapshot';
  /** snapshot 模式下的渲染几何。 */
  geometry: RenderGeometryState | undefined;
  /** 槽自身的透明度乘数。 */
  opacity: number;
  /** 动态虚线偏移。 */
  lineDashOffset: number | undefined;
  /** 虚线偏移只作用到第几个直接描边。 */
  lineDashOffsetStrokeIndex: number | undefined;
  /** 动态圆形 Symbol 半径。 */
  symbolRadius: number | undefined;
  /** 动态描边宽度。 */
  strokeWidth: number | undefined;
  /** 动态旋转角。 */
  rotation: number | undefined;
}

/** Runtime 重复写入的稳定帧缓冲区。 */
export interface AnimationFrameBuffer {
  /** 当前记录贡献的目标透明度乘数。 */
  targetOpacity: number | undefined;
  /** 当前记录贡献的临时展示几何。 */
  targetGeometry: RenderGeometryState | undefined;
  /** targetGeometry 对完整目标路径的真实 grow 窗口。 */
  targetReveal: LayerRenderPathReveal | undefined;
  /** 按 Runtime 声明顺序保存的稳定 overlay 槽。 */
  readonly overlays: readonly AnimationOverlaySlotBuffer[];
  /** 复位本帧标量和槽 active 状态。 */
  reset(): void;
  /** 获取 Runtime 创建时声明的稳定槽。 */
  overlay(slotKey: string): AnimationOverlaySlotBuffer;
}

/** Runtime 完成采样后声明的下一次调度方式。 */
export type AnimationSchedule = Readonly<{ kind: 'continuous' }> | Readonly<{ kind: 'stable' }> | Readonly<{ kind: 'deadline'; atElapsedMs: number }>;

/** Runtime 单次采样返回的小型状态。 */
export interface AnimationSample {
  /** 当前帧后是否自然完成。 */
  readonly finished: boolean;
  /** 完成后是否保留最终帧。 */
  readonly retain?: boolean;
  /** 下一次需要采样的时机。 */
  readonly schedule: AnimationSchedule;
  /** 即使图层没有产生渲染帧，也必须唤醒的 elapsed 截止时间。 */
  readonly wakeAtElapsedMs?: number;
}

/** 动画定义计算单帧结果时读取的上下文。 */
export interface AnimationFrameContext {
  /** Runtime 当前绑定的目标画像。 */
  readonly target: AnimationTargetProfile;
  /** 动画累计推进的时间，单位为毫秒。 */
  readonly elapsedMs: number;
  /** 当前 View 的地图分辨率。 */
  readonly resolution: number;
  /** 当前 View 旋转角。 */
  readonly rotation: number;
  /** 当前设备像素比。 */
  readonly pixelRatio: number;
  /** 当前 View 范围。 */
  readonly extent?: readonly [number, number, number, number];
}

/** 单条目标动画拥有的运行实例。 */
export interface AnimationRuntime {
  /** 此 Runtime 使用的稳定 overlay 槽。 */
  readonly slots: readonly AnimationSlotDefinition[];
  /** 动态样式可能超出 slot 模板的最大 CSS 像素外扩。 */
  readonly visualOutsetPx?: number;
  /** 中间几何无法证明被规范几何包围时禁用视口裁剪。 */
  readonly disableViewportCulling?: boolean;
  /** 在 Element 或 View 相关状态变化后绑定最新目标画像。 */
  rebind(target: AnimationTargetProfile): void;
  /** 把当前时间的效果写入稳定帧缓冲区。 */
  sample(context: AnimationFrameContext, output: AnimationFrameBuffer): AnimationSample;
  /** 释放 Runtime 自有缓存。 */
  destroy(): void;
}

/** 一类结构化动画的内部定义。 */
export interface AnimationDefinition<S extends AnimationSpec = AnimationSpec> {
  /** 此定义对应的动画类型。 */
  readonly type: S['type'];
  /** 此定义可能写入的展示属性域。 */
  readonly writeDomains: ReadonlySet<AnimationWriteDomain>;
  /** 此定义要求目标具备的能力。 */
  readonly requirements: ReadonlySet<AnimationTargetCapability>;
  /** Edit 和 Transform 期间的视觉策略。 */
  readonly interactionPolicy: Readonly<{
    edit: AnimationInteractionPolicy;
    transform: AnimationInteractionPolicy;
  }>;
  /** 校验并补齐动画配置。 */
  normalize(spec: unknown): Readonly<S>;
  /** 检查目标是否支持当前动画。 */
  assertCompatible(target: AnimationTargetProfile): void;
  /** 为一条动画记录创建独立 Runtime。 */
  create(target: AnimationTargetProfile, spec: Readonly<S>): AnimationRuntime;
}
