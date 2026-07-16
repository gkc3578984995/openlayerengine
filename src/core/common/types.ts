/** 二维或三维坐标；第三项通常表示高度。 */
export type Coordinate = readonly [number, number] | readonly [number, number, number];

/** 相对地图左上角的 `[x, y]` 屏幕像素。 */
export type Pixel = readonly [number, number];

/** CSS 颜色字符串，或 RGB / RGBA 数组。 */
export type Color = string | [number, number, number] | [number, number, number, number];
