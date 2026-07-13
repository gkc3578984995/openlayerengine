/* eslint-disable @typescript-eslint/no-explicit-any */
import type Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import Point from 'ol/geom/Point.js';
import type { Coordinate } from 'ol/coordinate.js';

export function getPointVisualSizePixel(feature: Feature<any>): [number, number] | undefined {
  try {
    if (!feature?.getGeometry || feature.getGeometry()?.getType() !== 'Point') return undefined;
    const style: any = feature.getStyle?.();
    const image = style?.getImage?.();
    if (!image) return undefined;
    let width: number | undefined;
    let height: number | undefined;
    const imageSize = image.getImageSize?.();
    const size = imageSize || image.getSize?.();
    if (size?.length === 2) [width, height] = size;
    if ((width == null || height == null) && image.getWidth && image.getHeight) {
      width = image.getWidth?.();
      height = image.getHeight?.();
    }
    if (width == null && image.getRadius) {
      const radius = image.getRadius();
      if (radius) width = height = radius * 2;
    }
    if (width == null || height == null) return undefined;
    const scale = image.getScale?.();
    const scaleX = Math.abs(Array.isArray(scale) ? scale[0] || 1 : typeof scale === 'number' ? scale : 1);
    const scaleY = Math.abs(Array.isArray(scale) ? scale[1] || 1 : typeof scale === 'number' ? scale : 1);
    return [width * scaleX, height * scaleY];
  } catch {
    return undefined;
  }
}

export function rotatedBBoxHalf(width: number, height: number, rotation: number): [number, number] {
  const cosine = Math.abs(Math.cos(rotation));
  const sine = Math.abs(Math.sin(rotation));
  return [(width * cosine + height * sine) / 2, (width * sine + height * cosine) / 2];
}

export function getPointRotatedHalfSizePixel(feature: Feature<any>): [number, number] | undefined {
  const size = getPointVisualSizePixel(feature);
  if (!size) return undefined;
  const style: any = feature.getStyle?.();
  const image: any = style?.getImage?.();
  const rotation = image?.getRotation?.() || 0;
  return rotatedBBoxHalf(size[0], size[1], rotation);
}

export function isPixelInsidePointBBox(feature: Feature<any>, pixel: number[], map: Map | null, overrideCenter?: Coordinate): boolean {
  if (!map) return false;
  const geometry = feature.getGeometry?.();
  if (!geometry || geometry.getType() !== 'Point') return false;
  const size = getPointVisualSizePixel(feature);
  if (!size) return false;
  const view = map.getView();
  const projection = view.getProjection();
  const projectionExtent = projection?.getExtent?.();
  const extentWidth = projectionExtent ? projectionExtent[2] - projectionExtent[0] : 40075016.68557849;
  const centerX = view.getCenter()?.[0] || 0;
  const wrapX = (x: number) => (Math.abs(x - centerX) > extentWidth / 2 ? x + Math.round((centerX - x) / extentWidth) * extentWidth : x);
  const base = overrideCenter || (geometry as Point).getCoordinates();
  const candidates: Coordinate[] = [base, [wrapX(base[0]), base[1]]];
  return candidates.some((coordinate) => {
    const candidatePixel = map.getPixelFromCoordinate(coordinate);
    if (!candidatePixel) return false;
    const halfWidth = size[0] / 2;
    const halfHeight = size[1] / 2;
    return (
      pixel[0] >= candidatePixel[0] - halfWidth &&
      pixel[0] <= candidatePixel[0] + halfWidth &&
      pixel[1] >= candidatePixel[1] - halfHeight &&
      pixel[1] <= candidatePixel[1] + halfHeight
    );
  });
}

export function getPointVisualRadiusPixel(feature: Feature<any>): number {
  try {
    if (!feature?.getGeometry || feature.getGeometry()?.getType() !== 'Point') return 0;
    const style: any = feature.getStyle?.();
    const image: any = style?.getImage?.();
    if (image) {
      const scale = image.getScale?.();
      const scaleX = Math.abs(Array.isArray(scale) ? scale[0] || 1 : typeof scale === 'number' ? scale : 1);
      const scaleY = Math.abs(Array.isArray(scale) ? scale[1] || 1 : typeof scale === 'number' ? scale : 1);
      const sizes: [number, number][] = [];
      const imageSize = image.getImageSize?.();
      const size = image.getSize?.();
      if (imageSize?.length === 2) sizes.push([imageSize[0] * scaleX, imageSize[1] * scaleY]);
      if (size?.length === 2) sizes.push([size[0] * scaleX, size[1] * scaleY]);
      const width = image.getWidth?.();
      const height = image.getHeight?.();
      if (width && height) sizes.push([width * scaleX, height * scaleY]);
      if (sizes.length) return Math.max(...sizes.flat()) / 2;
      const radius = image.getRadius?.();
      if (radius) return Math.abs(radius) * Math.max(scaleX, scaleY);
    }
    const styleSize = style?.getSize?.();
    return styleSize?.length === 2 ? Math.max(styleSize[0], styleSize[1]) / 2 : 8;
  } catch {
    return 8;
  }
}

export function hasPointIconImage(feature: Feature<any>): boolean {
  if (!feature?.getGeometry || feature.getGeometry()?.getType() !== 'Point') return false;
  const style: any = feature.getStyle?.();
  const image = style?.getImage?.();
  if (!image || image.getRadius) return false;
  return Boolean(image.getSrc?.() || image.getImageSize?.() || image.getSize?.());
}
