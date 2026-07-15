import type { StyleLike } from 'ol/style/Style.js';
import type { ElementSelector } from '../core/element/types.js';
import type { StylePatch, StyleSpec } from '../core/style/types.js';

/** 元素样式输入。结构化样式与 OpenLayers 原生样式必须二选一。 */
export type StyleInput =
  | (StyleSpec & {
      /** 原生样式。结构化样式分支禁止设置该字段。 */
      nativeStyle?: never;
    })
  | ({
      /** 原生样式。提供 OpenLayers 原生样式或样式函数。 */
      nativeStyle: StyleLike;
    } & { [K in keyof StyleSpec]?: never });

/** 元素样式能力的公开入口。 */
export interface StyleService {
  /**
   * 完整替换匹配元素的样式。
   *
   * @param selector 元素选择器。用于定位目标元素。
   * @param style 样式输入。提供新的结构化样式或原生样式。
   * @returns 无返回值。
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
   * 局部更新匹配元素的结构化样式。
   *
   * @param selector 元素选择器。用于定位目标元素。
   * @param patch 样式更新。指定要合并到现有结构化样式的内容。
   * @returns 无返回值。
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
