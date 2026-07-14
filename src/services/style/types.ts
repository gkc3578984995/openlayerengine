import type { ElementStyleState, NativeStyleRef, StylePatch, StyleSpec } from '../../core/style/types.js';

export type StyleStateInput = StyleSpec | NativeStyleRef;
export type StructuredStylePatch = StylePatch;
export type SerializedStyleState = Exclude<ElementStyleState, NativeStyleRef>;
