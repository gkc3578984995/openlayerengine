/** 坐标。前两项是横纵坐标，第三项可保存高度等额外维度。 */
export type Coordinate = readonly [number, number] | readonly [number, number, number];

/** 像素坐标。依次表示距离地图左上角的横向和纵向像素。 */
export type Pixel = readonly [number, number];

/** 颜色。支持 CSS 颜色字符串、RGB 数组或 RGBA 数组。 */
export type Color = string | [number, number, number] | [number, number, number, number];
