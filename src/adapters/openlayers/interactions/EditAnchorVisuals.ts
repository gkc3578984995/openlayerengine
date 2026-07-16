import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style, { type RenderFunction } from 'ol/style/Style.js';

/** 编辑控制点与插入点的统一视觉尺寸（CSS 像素）。 */
export const EDIT_CONTROL_ANCHOR_RADIUS = 5;
export const EDIT_INSERTION_ANCHOR_RADIUS = 4;
export const EDIT_CONTROL_ANCHOR_HIT_RADIUS = EDIT_CONTROL_ANCHOR_RADIUS + 1;
export const EDIT_INSERTION_ANCHOR_HIT_RADIUS = EDIT_INSERTION_ANCHOR_RADIUS + 0.75;

/** 一类批量编辑锚点的 Canvas 视觉参数。 */
interface AnchorBatchVisual {
  readonly radius: number;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly lineDash?: readonly number[];
}

/** 既有控制点：白色填充、蓝色实线描边，视觉层级高于插入点。 */
export const editControlAnchorBatchRenderer = createEditAnchorBatchRenderer({
  radius: EDIT_CONTROL_ANCHOR_RADIUS,
  fill: '#ffffff',
  stroke: '#3388ff',
  strokeWidth: 2
});
export const editControlAnchorStyle = new Style({
  renderer: editControlAnchorBatchRenderer,
  zIndex: 1
});

/** 单个既有控制点使用的等价图片样式。 */
export const editControlAnchorPointStyle = new Style({
  image: new CircleStyle({
    radius: EDIT_CONTROL_ANCHOR_RADIUS,
    fill: new Fill({ color: '#ffffff' }),
    stroke: new Stroke({ color: '#3388ff', width: 2 })
  }),
  zIndex: 1
});

/** 可插入位置：半透明白色填充、蓝色虚线描边。 */
export const editInsertionAnchorBatchRenderer = createEditAnchorBatchRenderer({
  radius: EDIT_INSERTION_ANCHOR_RADIUS,
  fill: 'rgba(255,255,255,0.75)',
  stroke: '#3388ff',
  strokeWidth: 1.5,
  lineDash: [3, 2]
});
export const editInsertionAnchorStyle = new Style({
  renderer: editInsertionAnchorBatchRenderer,
  zIndex: 0
});

/** 单个可插入位置使用的等价图片样式。 */
export const editInsertionAnchorPointStyle = new Style({
  image: new CircleStyle({
    radius: EDIT_INSERTION_ANCHOR_RADIUS,
    fill: new Fill({ color: 'rgba(255,255,255,0.75)' }),
    stroke: new Stroke({ color: '#3388ff', width: 1.5, lineDash: [3, 2] })
  }),
  zIndex: 0
});

/** 为一个 MultiPoint 批次创建单路径 Canvas renderer。 */
function createEditAnchorBatchRenderer(visual: AnchorBatchVisual): RenderFunction {
  return (coordinates, state) => {
    const points = coordinates as readonly (readonly number[])[];
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
  };
}
