import type { StyleLike } from 'ol/style/Style.js';
import type { ElementSelector } from '../core/element/types.js';
import type { StylePatch, StyleSpec } from '../core/style/types.js';

/** Element 样式输入；结构化样式与 OpenLayers 原生样式互斥。 */
export type StyleInput =
  | (StyleSpec & {
      /** 结构化样式分支不得传入原生样式。 */
      nativeStyle?: never;
    })
  | ({
      /** OpenLayers 原生样式或样式函数。 */
      nativeStyle: StyleLike;
    } & { [K in keyof StyleSpec]?: never });

/** 管理 Element 样式的公开服务。 */
export interface StyleService {
  /**
   * 完整替换匹配 Element 的样式。
   *
   * @param selector 待更新 Element 的选择器。
   * @param style 新的结构化样式或原生样式。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.styles.set({ module: 'planning' }, { strokes: [{ color: '#3388ff', width: 2 }] });
   * ```
   */
  set(selector: ElementSelector, style: StyleInput): void;
  /**
   * 局部更新匹配 Element 的结构化样式。
   *
   * @param selector 待更新 Element 的选择器。
   * @param patch 要合并到现有结构化样式的内容。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.styles.patch({ id: 'target' }, { zIndex: 10 });
   * ```
   */
  patch(selector: ElementSelector, patch: StylePatch): void;
}
