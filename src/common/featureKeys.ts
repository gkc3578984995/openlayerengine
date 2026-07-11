/**
 * feature 上挂载的业务属性键名集中管理。
 *
 * 整个库通过 `feature.set(key, ...)` / `feature.get(key)` 持有业务状态，
 * 此处把散落的魔法字符串收敛为常量，避免拼写错误与跨文件约定不一致。
 */
export const FEATURE_KEYS = {
  /** 唯一 id（与 feature.setId 配合） */
  id: 'id',
  /** 附加数据 */
  data: 'data',
  /** 模块名（用于模块事件分发） */
  module: 'module',
  /** 所属封装图层 id（Base.layer.get('id')） */
  layerId: 'layerId',
  /** 图层类型标识：'Billboard' | 'Point' | 'Polyline' | 'Polygon' | 'Circle' */
  layerType: 'layerType',
  /** 业务参数对象（与各 I*Param 对应） */
  param: 'param',
  /** 注册 key（earth.getLayer 反查） */
  registryKey: 'registryKey',
  /** 屏幕空间文本偏移（未补偿的公共值） */
  labelOffset: 'labelOffset',
  /** 图标屏幕位移（Transform 写入，Billboard 同步用） */
  screenDisplacement: 'screenDisplacement',
  /** 闪烁监听 key（Utils.flash 写入，stopFlash/unbindFeatureFlash 解绑） */
  listenerKey: 'listenerKey',
  /** 标绘控制点 */
  plotPoints: 'plotPoints',
  /** 是否为箭头叠加线 */
  isArrows: 'isArrows',
  /** 平行叠加线标记（Transform 选中时跳过） */
  isParallelOverlay: 'isParallelOverlay'
} as const;

/** 图层类型标识枚举（与 FEATURE_KEYS.layerType 的值对应） */
export const LAYER_TYPE = {
  Billboard: 'Billboard',
  Point: 'Point',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  Circle: 'Circle'
} as const;
