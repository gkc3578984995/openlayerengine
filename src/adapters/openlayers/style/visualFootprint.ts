import type { FeatureLike } from 'ol/Feature.js';
import type ImageStyle from 'ol/style/Image.js';
import Style from 'ol/style/Style.js';
import type Stroke from 'ol/style/Stroke.js';
import type { Pixel } from '../../../core/common/types.js';

export type CompiledVisualCoordinateSpace = 'screen' | 'view';

/** 安全解析 Feature 当前分辨率下的一组标准 OL Style。 */
export function resolveCompiledStyles(feature: FeatureLike, resolution: number): Style[] {
  const styleFunction = feature.getStyleFunction();
  if (styleFunction === undefined) return [];
  try {
    const result = styleFunction(feature, resolution);
    if (result === undefined) return [];
    if (result instanceof Style) return [result];
    return result.filter((style): style is Style => style instanceof Style);
  } catch {
    return [];
  }
}

/** 汇总标准 OL Style 在指定坐标空间中的最大 CSS 像素外扩。 */
export function compiledStylesVisualFootprintPx(
  styles: readonly Style[],
  viewRotation: number,
  coordinateSpace: CompiledVisualCoordinateSpace = 'screen'
): readonly [number, number] {
  let x = 0;
  let y = 0;
  for (const style of styles) {
    const stroke = style.getStroke();
    if (stroke !== null) x = y = Math.max(x, y, compiledStrokeVisualFootprintPx(stroke));

    const image = style.getImage();
    if (image !== null) {
      const imageBox = compiledImageVisualExtentPx([0, 0], image, viewRotation, coordinateSpace);
      if (imageBox !== undefined) {
        x = Math.max(x, Math.abs(imageBox[0]), Math.abs(imageBox[2]));
        y = Math.max(y, Math.abs(imageBox[1]), Math.abs(imageBox[3]));
      }
    }

    const text = compiledTextVisualFootprintPx(style);
    x = Math.max(x, text[0]);
    y = Math.max(y, text[1]);
  }
  return Object.freeze([x, y]);
}

/** 汇总 Style 显式 geometryFunction 产生的派生几何范围。 */
export function compiledStylesGeometryExtent(styles: readonly Style[], feature: FeatureLike): readonly [number, number, number, number] | undefined {
  let result: [number, number, number, number] | undefined;
  for (const style of styles) {
    if (!isRenderableCompiledStyle(style)) continue;
    let geometry;
    try {
      geometry = style.getGeometryFunction()(feature);
    } catch {
      continue;
    }
    if (geometry === undefined) continue;
    const extent = geometry.getExtent();
    if (extent.length < 4 || extent.slice(0, 4).some((value) => !Number.isFinite(value))) continue;
    if (result === undefined) result = [extent[0], extent[1], extent[2], extent[3]];
    else {
      result[0] = Math.min(result[0], extent[0]);
      result[1] = Math.min(result[1], extent[1]);
      result[2] = Math.max(result[2], extent[2]);
      result[3] = Math.max(result[3], extent[3]);
    }
  }
  return result === undefined ? undefined : Object.freeze(result);
}

/** 计算图片绕锚点旋转后的 CSS 像素范围。 */
export function compiledImageVisualExtentPx(
  pixel: Pixel,
  image: ImageStyle,
  viewRotation: number,
  coordinateSpace: CompiledVisualCoordinateSpace = 'screen'
): readonly [number, number, number, number] | undefined {
  const size = image.getSize();
  const anchor = image.getAnchor();
  const scale = image.getScaleArray();
  if (size === null || anchor === null || size.length < 2 || anchor.length < 2 || scale.length < 2) return undefined;
  const rotationAdjustment = coordinateSpace === 'screen' ? (image.getRotateWithView() ? viewRotation : 0) : image.getRotateWithView() ? 0 : -viewRotation;
  const values = [size[0], size[1], anchor[0], anchor[1], scale[0], scale[1], image.getRotation(), rotationAdjustment];
  if (values.some((value) => !Number.isFinite(value)) || size[0] <= 0 || size[1] <= 0 || scale[0] === 0 || scale[1] === 0) return undefined;

  const rotation = image.getRotation() + rotationAdjustment;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const xs = [-anchor[0] * scale[0], (size[0] - anchor[0]) * scale[0]];
  const ys = [-anchor[1] * scale[1], (size[1] - anchor[1]) * scale[1]];
  const corners = xs.flatMap((x) => ys.map((y) => [pixel[0] + x * cosine - y * sine, pixel[1] + x * sine + y * cosine] as const));
  return Object.freeze([
    Math.min(...corners.map(([x]) => x)),
    Math.min(...corners.map(([, y]) => y)),
    Math.max(...corners.map(([x]) => x)),
    Math.max(...corners.map(([, y]) => y))
  ]);
}

/** 按字体、缩放、偏移和描边保守估算文本占用范围。 */
export function compiledTextVisualFootprintPx(style: Style): readonly [number, number] {
  const text = style.getText();
  if (text === null || text.getText() === undefined || String(text.getText()).length === 0) return [0, 0];
  const fontSize = parseFontSize(text.getFont());
  const scale = text.getScaleArray();
  if (![...scale, fontSize].every(Number.isFinite)) return [0, 0];
  const padding = text.getPadding() ?? [0, 0, 0, 0];
  const paddingMax = Math.max(0, ...padding.filter(Number.isFinite).map(Math.abs));
  const textStroke = text.getStroke();
  const background = text.getBackgroundStroke();
  const stroke = textStroke === null ? 0 : compiledStrokeVisualFootprintPx(textStroke);
  const backgroundStroke = background === null ? 0 : compiledStrokeVisualFootprintPx(background);
  const lines = String(text.getText()).split(/\r?\n/u);
  const width = Math.max(...lines.map((line) => line.length), 1) * fontSize * 0.75 * Math.abs(scale[0]);
  const height = Math.max(lines.length, 1) * fontSize * 1.5 * Math.abs(scale[1]);
  const radius = Math.hypot(width, height) + paddingMax + stroke + backgroundStroke;
  return [Math.abs(text.getOffsetX()) + radius, Math.abs(text.getOffsetY()) + radius];
}

/** 估算线宽、偏移、端点和连接方式带来的外扩距离。 */
export function compiledStrokeVisualFootprintPx(stroke: Stroke): number {
  const width = stroke.getWidth() ?? 1;
  if (!Number.isFinite(width)) return 0;
  let multiplier = stroke.getLineCap() === 'square' ? Math.SQRT2 : 1;
  if (stroke.getLineJoin() === 'miter') {
    const miterLimit = stroke.getMiterLimit() ?? 10;
    if (Number.isFinite(miterLimit)) multiplier = Math.max(multiplier, 1, Math.abs(miterLimit));
  }
  const offset = stroke.getOffset() ?? 0;
  const safeOffset = Number.isFinite(offset) ? Math.abs(offset) : 0;
  return safeOffset + (Math.abs(width) / 2) * multiplier;
}

export function isRenderableCompiledStyle(style: Style): boolean {
  return style.getStroke() !== null || style.getFill() !== null || style.getImage() !== null || (style.getText()?.getText() ?? '') !== '';
}

function parseFontSize(font: string | undefined): number {
  const match = font?.match(/(?:^|\s)(\d+(?:\.\d+)?)px\b/u);
  return match === undefined || match === null ? 10 : Number(match[1]);
}
