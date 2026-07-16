import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import RegularShape from 'ol/style/RegularShape.js';
import Stroke from 'ol/style/Stroke.js';
import Style, { type RenderFunction, type StyleFunction, type StyleLike } from 'ol/style/Style.js';

/** 编辑控制点与插入点的统一视觉尺寸（CSS 像素）。 */
export const EDIT_CONTROL_ANCHOR_RADIUS = 5;
export const EDIT_INSERTION_ANCHOR_RADIUS = 4;
export const EDIT_CONTROL_ANCHOR_HIT_RADIUS = EDIT_CONTROL_ANCHOR_RADIUS + 1;
export const EDIT_INSERTION_ANCHOR_HIT_RADIUS = EDIT_INSERTION_ANCHOR_RADIUS + 0.75;

/**
 * 编辑临时图层的保留绘制层级。所有交互样式共用最大有限值，再由稳定的 Style / Feature 顺序保证
 * accent → 插入点 → 控制点 → hover → active，避免任意有限业务 zIndex 反盖交互反馈。
 */
export const EDIT_PREVIEW_ACCENT_Z_INDEX = Number.MAX_VALUE;
export const EDIT_INSERTION_ANCHOR_Z_INDEX = EDIT_PREVIEW_ACCENT_Z_INDEX;
export const EDIT_CONTROL_ANCHOR_Z_INDEX = EDIT_PREVIEW_ACCENT_Z_INDEX;
export const EDIT_ANCHOR_HOVER_Z_INDEX = EDIT_PREVIEW_ACCENT_Z_INDEX;
export const EDIT_ANCHOR_ACTIVE_Z_INDEX = EDIT_PREVIEW_ACCENT_Z_INDEX;

export type EditAnchorFeedbackPhase = 'hover' | 'active';

/** 一类批量编辑锚点的 Canvas 视觉参数。 */
interface AnchorBatchVisual {
  readonly radius: number;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly lineDash?: readonly number[];
}

/** 编辑工作图形统一强调的 Canvas 视觉参数。 */
interface EditPreviewVisual {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly lineDash?: readonly number[];
  readonly fill?: string;
  readonly pointRadius: number;
  readonly pointFill: string;
}

/** 编辑强调描边统一使用圆角连接，避免锐角顶点产生 Canvas miter 尖峰。 */
const EDIT_PREVIEW_LINE_CAP: CanvasLineCap = 'round';
const EDIT_PREVIEW_LINE_JOIN: CanvasLineJoin = 'round';
const EDIT_PREVIEW_MITER_LIMIT = 2;

/** 交互反馈全部由语义空间索引命中，Canvas 强调层不重复参与原生命中检测。 */
const renderNoHit: RenderFunction = (): void => undefined;

/** 既有控制点：白色填充、蓝色实线描边，视觉层级高于插入点。 */
const editControlAnchorVisual: AnchorBatchVisual = {
  radius: EDIT_CONTROL_ANCHOR_RADIUS,
  fill: '#ffffff',
  stroke: '#3388ff',
  strokeWidth: 2
};
export const editControlAnchorBatchRenderer = createEditAnchorBatchRenderer(editControlAnchorVisual);
export const editControlAnchorStyle = new Style({
  renderer: editControlAnchorBatchRenderer,
  zIndex: EDIT_CONTROL_ANCHOR_Z_INDEX
});

/** 单个既有控制点使用与批次一致的 Default Builder，确保 accent 之后仍按 Feature 顺序绘制锚点。 */
export const editControlAnchorPointStyle = new Style({
  renderer: createEditAnchorPointRenderer(editControlAnchorVisual),
  hitDetectionRenderer: renderNoHit,
  zIndex: EDIT_CONTROL_ANCHOR_Z_INDEX
});

/** 可插入位置：半透明白色填充、蓝色虚线描边。 */
const editInsertionAnchorVisual: AnchorBatchVisual = {
  radius: EDIT_INSERTION_ANCHOR_RADIUS,
  fill: 'rgba(255,255,255,0.75)',
  stroke: '#3388ff',
  strokeWidth: 1.5,
  lineDash: [3, 2]
};
export const editInsertionAnchorBatchRenderer = createEditAnchorBatchRenderer(editInsertionAnchorVisual);
export const editInsertionAnchorStyle = new Style({
  renderer: editInsertionAnchorBatchRenderer,
  zIndex: EDIT_INSERTION_ANCHOR_Z_INDEX
});

/** 单个可插入位置使用与批次一致的 Default Builder。 */
export const editInsertionAnchorPointStyle = new Style({
  renderer: createEditAnchorPointRenderer(editInsertionAnchorVisual),
  hitDetectionRenderer: renderNoHit,
  zIndex: EDIT_INSERTION_ANCHOR_Z_INDEX
});

/** 控制点悬停反馈：扩大尺寸并增强描边。 */
const editControlAnchorHoverVisual: AnchorBatchVisual = {
  radius: 7,
  fill: '#e6f4ff',
  stroke: '#1677ff',
  strokeWidth: 3
};
export const editControlAnchorHoverStyle = new Style({
  renderer: createEditAnchorPointRenderer(editControlAnchorHoverVisual),
  hitDetectionRenderer: renderNoHit,
  zIndex: EDIT_ANCHOR_HOVER_Z_INDEX
});

/** 插入点悬停反馈：扩大尺寸，同时保留虚线语义。 */
const editInsertionAnchorHoverVisual: AnchorBatchVisual = {
  radius: 6,
  fill: '#e6f4ff',
  stroke: '#1677ff',
  strokeWidth: 2,
  lineDash: [3, 2]
};
export const editInsertionAnchorHoverStyle = new Style({
  renderer: createEditAnchorPointRenderer(editInsertionAnchorHoverVisual),
  hitDetectionRenderer: renderNoHit,
  zIndex: EDIT_ANCHOR_HOVER_Z_INDEX
});

/** 控制点按下反馈：使用实心填充，与 hover 形成非颜色差异。 */
const editControlAnchorActiveVisual: AnchorBatchVisual = {
  radius: 7,
  fill: '#1677ff',
  stroke: '#ffffff',
  strokeWidth: 2
};
export const editControlAnchorActiveStyle = new Style({
  renderer: createEditAnchorPointRenderer(editControlAnchorActiveVisual),
  hitDetectionRenderer: renderNoHit,
  zIndex: EDIT_ANCHOR_ACTIVE_Z_INDEX
});

/** 原始几何参考只使用中性轮廓，不复制业务填充、图标或文字。 */
export const editUnderlayReferenceStyle = new Style({
  fill: new Fill({ color: 'rgba(71,85,105,0.04)' }),
  stroke: new Stroke({ color: 'rgba(71,85,105,0.65)', width: 1.5, lineDash: [4, 4] }),
  image: new CircleStyle({
    radius: 8,
    fill: new Fill({ color: 'rgba(71,85,105,0.04)' }),
    stroke: new Stroke({ color: 'rgba(71,85,105,0.65)', width: 1.5, lineDash: [4, 4] })
  }),
  zIndex: -EDIT_PREVIEW_ACCENT_Z_INDEX
});

/** 工作图形上的低透明度外侧反馈。 */
const editPreviewHaloVisual: EditPreviewVisual = {
  stroke: 'rgba(22,119,255,0.28)',
  strokeWidth: 6,
  pointRadius: 12,
  pointFill: 'rgba(22,119,255,0.04)'
};
export const editPreviewHaloStyle = new Style({
  renderer: createEditPreviewRenderer(editPreviewHaloVisual),
  hitDetectionRenderer: renderNoHit,
  stroke: new Stroke({
    color: 'rgba(22,119,255,0.28)',
    width: 6,
    lineCap: EDIT_PREVIEW_LINE_CAP,
    lineJoin: EDIT_PREVIEW_LINE_JOIN,
    miterLimit: EDIT_PREVIEW_MITER_LIMIT
  }),
  image: new CircleStyle({
    radius: 12,
    fill: new Fill({ color: 'rgba(22,119,255,0.04)' }),
    stroke: new Stroke({
      color: 'rgba(22,119,255,0.28)',
      width: 6,
      lineCap: EDIT_PREVIEW_LINE_CAP,
      lineJoin: EDIT_PREVIEW_LINE_JOIN,
      miterLimit: EDIT_PREVIEW_MITER_LIMIT
    })
  }),
  zIndex: EDIT_PREVIEW_ACCENT_Z_INDEX
});

/** 工作图形上的统一蓝色编辑轮廓与面强调。 */
const editPreviewAccentVisual: EditPreviewVisual = {
  stroke: '#1677ff',
  strokeWidth: 2,
  lineDash: [6, 4],
  fill: 'rgba(22,119,255,0.10)',
  pointRadius: 10,
  pointFill: 'rgba(22,119,255,0.10)'
};
export const editPreviewAccentStyle = new Style({
  renderer: createEditPreviewRenderer(editPreviewAccentVisual),
  hitDetectionRenderer: renderNoHit,
  fill: new Fill({ color: 'rgba(22,119,255,0.10)' }),
  stroke: new Stroke({
    color: '#1677ff',
    width: 2,
    lineDash: [6, 4],
    lineCap: EDIT_PREVIEW_LINE_CAP,
    lineJoin: EDIT_PREVIEW_LINE_JOIN,
    miterLimit: EDIT_PREVIEW_MITER_LIMIT
  }),
  image: new CircleStyle({
    radius: 10,
    fill: new Fill({ color: 'rgba(22,119,255,0.10)' }),
    stroke: new Stroke({
      color: '#1677ff',
      width: 2,
      lineDash: [6, 4],
      lineCap: EDIT_PREVIEW_LINE_CAP,
      lineJoin: EDIT_PREVIEW_LINE_JOIN,
      miterLimit: EDIT_PREVIEW_MITER_LIMIT
    })
  }),
  zIndex: EDIT_PREVIEW_ACCENT_Z_INDEX
});

/** 按锚点类型和交互阶段选择共享反馈样式。 */
export function editAnchorFeedbackStyle(kind: 'control' | 'insertion', phase: EditAnchorFeedbackPhase): Style {
  if (kind === 'insertion') return editInsertionAnchorHoverStyle;
  return phase === 'active' ? editControlAnchorActiveStyle : editControlAnchorHoverStyle;
}

type EditPreviewStyleCacheEntry =
  | Readonly<{ kind: 'style'; visible: boolean; composed: StyleLike }>
  | Readonly<{ kind: 'array'; visible: boolean; snapshot: readonly Style[]; composed: StyleLike }>
  | Readonly<{ kind: 'function'; composed: StyleFunction }>;

/** 缓存业务 StyleLike 与编辑强调组合，避免高频预览重复创建 Style。 */
const editPreviewStyleCache = new WeakMap<object, EditPreviewStyleCacheEntry>();

/** 保留完整业务样式，并在可见结果上追加统一编辑强调。 */
export function composeEditPreviewStyle(base: StyleLike): StyleLike {
  const key = base as object;
  const cached = editPreviewStyleCache.get(key);
  if (base instanceof Style) {
    const visible = styleHasVisual(base);
    if (cached?.kind === 'style' && cached.visible === visible) return cached.composed;
    const composed = visible ? [base, editPreviewHaloStyle, editPreviewAccentStyle] : base;
    editPreviewStyleCache.set(key, { kind: 'style', visible, composed });
    return composed;
  }
  if (Array.isArray(base)) {
    const visible = stylesHaveVisual(base);
    if (cached?.kind === 'array' && cached.visible === visible && sameStyleSequence(cached.snapshot, base)) return cached.composed;
    const snapshot = Object.freeze([...base]);
    const composed = visible ? [...base, editPreviewHaloStyle, editPreviewAccentStyle] : base;
    editPreviewStyleCache.set(key, { kind: 'array', visible, snapshot, composed });
    return composed;
  }
  if (cached?.kind === 'function') return cached.composed;
  const composed = composeEditPreviewStyleFunction(base);
  editPreviewStyleCache.set(key, { kind: 'function', composed });
  return composed;
}

/** 为动态业务样式保留最后一组 Style 引用，即使调用方每帧返回新数组也不重复分配组合数组。 */
function composeEditPreviewStyleFunction(base: StyleFunction): StyleFunction {
  let previousKind: 'style' | 'array' | undefined;
  let previousVisible = false;
  let previousStyle: Style | undefined;
  let previousStyles: readonly Style[] | undefined;
  let previousComposition: Style[] | undefined;
  return (feature, resolution) => {
    const result = base(feature, resolution);
    if (result === undefined) return undefined;
    if (result instanceof Style) {
      const visible = styleHasVisual(result);
      if (previousKind === 'style' && previousVisible === visible && previousStyle === result) return visible ? previousComposition : result;
      previousKind = 'style';
      previousVisible = visible;
      previousStyle = result;
      previousStyles = undefined;
      previousComposition = visible ? [result, editPreviewHaloStyle, editPreviewAccentStyle] : undefined;
      return previousComposition ?? result;
    }
    const visible = stylesHaveVisual(result);
    if (previousKind === 'array' && previousVisible === visible && previousStyles !== undefined && sameStyleSequence(previousStyles, result)) {
      return visible ? previousComposition : result;
    }
    previousKind = 'array';
    previousVisible = visible;
    previousStyle = undefined;
    previousStyles = Object.freeze([...result]);
    previousComposition = visible ? [...result, editPreviewHaloStyle, editPreviewAccentStyle] : undefined;
    return previousComposition ?? result;
  };
}

/** 只有业务结果本身可绘制时才显示编辑强调，保留空样式的不可见语义。 */
function stylesHaveVisual(styles: readonly Style[]): boolean {
  return styles.some(styleHasVisual);
}

/** 判断单个 OpenLayers Style 是否携带实际绘制内容。 */
function styleHasVisual(style: Style): boolean {
  if (style.getRenderer() !== null || fillIsVisible(style.getFill()) || strokeIsVisible(style.getStroke())) return true;
  const image = style.getImage();
  if (image !== null && image.getOpacity() > 0 && scaleIsVisible(image.getScale())) {
    if (!(image instanceof RegularShape) || fillIsVisible(image.getFill()) || strokeIsVisible(image.getStroke())) return true;
  }
  const text = style.getText();
  const textValue = text?.getText();
  return textValue !== undefined && textValue !== null && String(textValue).length > 0 && scaleIsVisible(text?.getScale());
}

function fillIsVisible(fill: Fill | null): boolean {
  return fill !== null && colorIsVisible(fill.getColor());
}

function strokeIsVisible(stroke: Stroke | null): boolean {
  return stroke !== null && (stroke.getWidth() ?? 1) > 0 && colorIsVisible(stroke.getColor());
}

/** 识别常见的全透明颜色，同时保守保留渐变、图案和未知 CSS 颜色。 */
function colorIsVisible(color: ReturnType<Fill['getColor']>): boolean {
  if (color === null) return false;
  if (Array.isArray(color)) return color.length < 4 || (color[3] ?? 1) > 0;
  if (typeof color !== 'string') return true;
  const normalized = color.trim().toLowerCase();
  if (normalized === 'transparent' || /^#[0-9a-f]{3}0$/u.test(normalized) || /^#[0-9a-f]{6}00$/u.test(normalized)) return false;
  return !/^rgba\([^)]*[,/]\s*0(?:\.0+)?%?\s*\)$/u.test(normalized);
}

/** 图片或文字缩放任一维为零时不会形成可见反馈。 */
function scaleIsVisible(scale: number | readonly number[] | undefined): boolean {
  if (scale === undefined) return true;
  return typeof scale === 'number' ? scale !== 0 : scale.every((value) => value !== 0);
}

/** 比较两组业务 Style 引用，允许调用方每帧返回内容相同的新数组。 */
function sameStyleSequence(left: readonly Style[], right: readonly Style[]): boolean {
  return left.length === right.length && left.every((style, index) => style === right[index]);
}

/**
 * 用 Default Builder 绘制工作图形强调。业务的 Polygon / Image / Text 等 Builder 会先完成，随后依次绘制
 * halo、accent 和锚点，避免同一 zIndex 下 OpenLayers 固定 Builder 顺序反转设计层序。
 */
function createEditPreviewRenderer(visual: EditPreviewVisual): RenderFunction {
  return (coordinates, state) => {
    const context = state.context;
    const pixelRatio = Number.isFinite(state.pixelRatio) && state.pixelRatio > 0 ? state.pixelRatio : 1;
    const geometryType = state.geometry.getType();
    context.save();
    try {
      context.beginPath();
      if (geometryType === 'Point') {
        const point = coordinates as readonly number[];
        const x = point[0];
        const y = point[1];
        if (x === undefined || y === undefined) return;
        const radius = visual.pointRadius * pixelRatio;
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, 2 * Math.PI);
        context.fillStyle = visual.pointFill;
        context.fill();
      } else if (geometryType === 'Circle') {
        const points = coordinates as readonly (readonly number[])[];
        const center = points[0];
        const edge = points[1];
        if (center === undefined || edge === undefined) return;
        const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
        context.moveTo(center[0] + radius, center[1]);
        context.arc(center[0], center[1], radius, 0, 2 * Math.PI);
        if (visual.fill !== undefined) {
          context.fillStyle = visual.fill;
          context.fill();
        }
      } else if (geometryType === 'Polygon') {
        for (const ring of coordinates as readonly (readonly (readonly number[])[])[]) traceEditPath(context, ring, true);
        if (visual.fill !== undefined) {
          context.fillStyle = visual.fill;
          context.fill();
        }
      } else {
        traceEditPath(context, coordinates as readonly (readonly number[])[], false);
      }
      context.strokeStyle = visual.stroke;
      context.lineWidth = visual.strokeWidth * pixelRatio;
      context.lineCap = EDIT_PREVIEW_LINE_CAP;
      context.lineJoin = EDIT_PREVIEW_LINE_JOIN;
      context.miterLimit = EDIT_PREVIEW_MITER_LIMIT;
      if (visual.lineDash !== undefined) context.setLineDash(visual.lineDash.map((length) => length * pixelRatio));
      context.stroke();
    } finally {
      context.restore();
    }
  };
}

function traceEditPath(context: CanvasRenderingContext2D, points: readonly (readonly number[])[], close: boolean): void {
  const first = points[0];
  if (first === undefined) return;
  context.moveTo(first[0], first[1]);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point !== undefined) context.lineTo(point[0], point[1]);
  }
  if (close) context.closePath();
}

/** 为一个 MultiPoint 批次创建单路径 Canvas renderer。 */
function createEditAnchorBatchRenderer(visual: AnchorBatchVisual): RenderFunction {
  return (coordinates, state) => renderEditAnchorPoints(coordinates as readonly (readonly number[])[], state, visual);
}

/** 为单个 Point 反馈创建与批量锚点相同 BuilderType 的 Canvas renderer，保证反馈最后覆盖静止锚点。 */
function createEditAnchorPointRenderer(visual: AnchorBatchVisual): RenderFunction {
  return (coordinate, state) => renderEditAnchorPoints([coordinate as readonly number[]], state, visual);
}

/** 按统一 CSS 像素规格绘制一个或多个编辑锚点。 */
function renderEditAnchorPoints(points: readonly (readonly number[])[], state: Parameters<RenderFunction>[1], visual: AnchorBatchVisual): void {
  if (points.length === 0) return;
  const context = state.context;
  const pixelRatio = Number.isFinite(state.pixelRatio) && state.pixelRatio > 0 ? state.pixelRatio : 1;
  const radius = visual.radius * pixelRatio;
  context.save();
  try {
    context.beginPath();
    for (const point of points) {
      const x = point[0];
      const y = point[1];
      if (x === undefined || y === undefined) continue;
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, 2 * Math.PI);
    }
    context.fillStyle = visual.fill;
    context.fill();
    context.strokeStyle = visual.stroke;
    context.lineWidth = visual.strokeWidth * pixelRatio;
    if (visual.lineDash !== undefined) context.setLineDash(visual.lineDash.map((length) => length * pixelRatio));
    context.stroke();
  } finally {
    context.restore();
  }
}
