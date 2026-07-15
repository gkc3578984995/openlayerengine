import type { ElementStyleState, NativeStyleRef, StylePatch, StyleSpec } from '../../core/style/types.js';

/** 样式服务可接收的结构化样式或原生样式引用。 */
export type StyleStateInput = StyleSpec | NativeStyleRef;
/** 可合并到结构化样式的局部更新。 */
export type StructuredStylePatch = StylePatch;
/** 可安全序列化的元素样式状态。 */
export type SerializedStyleState = Exclude<ElementStyleState, NativeStyleRef>;
