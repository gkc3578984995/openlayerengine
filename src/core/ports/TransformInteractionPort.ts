import type { Coordinate, Pixel } from '../common/types.js';
import type { RenderGeometryState, ShapeType } from '../shape/types.js';
import type { ElementStyleState, StyleSpec } from '../style/types.js';

export type TransformOperation = 'translate' | 'rotate' | 'scale' | 'stretch' | 'vertex';

export type TransformDelta =
  | Readonly<{ type: 'translate'; x: number; y: number }>
  | Readonly<{ type: 'rotate'; angle: number; center: Coordinate }>
  | Readonly<{ type: 'scale' | 'stretch'; scaleX: number; scaleY: number; center: Coordinate }>
  | Readonly<{ type: 'vertex'; index: number; coordinate: Coordinate }>;

export interface TransformInteractionOptions {
  readonly hitTolerance: number;
  readonly translate: 'none' | 'center' | 'feature';
  readonly scale: boolean;
  readonly stretch: boolean;
  readonly rotate: boolean;
  readonly translateBBox: boolean;
  readonly noFlip: boolean;
  readonly keepRectangle: boolean;
  readonly buffer: number;
  readonly pointRadius: number;
  readonly handleStyle?: StyleSpec;
  readonly handleCenter?: Coordinate;
}

export interface TransformInteractionTarget {
  readonly elementId: string;
  readonly type: ShapeType;
  readonly layerId: string;
  readonly geometry: RenderGeometryState;
  readonly style: ElementStyleState;
  readonly controlPoints: readonly Coordinate[];
  readonly canTranslate: boolean;
  readonly canRotate: boolean;
  readonly canScale: boolean;
  readonly canStretch: boolean;
  readonly canEditVertices: boolean;
}

export interface TransformCopyPreview {
  readonly geometry: RenderGeometryState;
  readonly style: ElementStyleState;
}

export type TransformInteractionEvent =
  | Readonly<{ type: 'select-request'; pixel: Pixel; candidateIds: readonly string[] }>
  | Readonly<{ type: 'enter-handle'; key: string; cursor?: string }>
  | Readonly<{ type: 'leave-handle'; key: string; cursor?: string }>
  | Readonly<{ type: 'operation-start'; operation: TransformOperation; delta: TransformDelta }>
  | Readonly<{ type: 'operation-change'; operation: TransformOperation; delta: TransformDelta }>
  | Readonly<{ type: 'operation-end'; operation: TransformOperation; delta: TransformDelta }>
  | Readonly<{ type: 'copy-preview-confirm'; delta: Readonly<{ x: number; y: number }> }>
  | Readonly<{ type: 'copy-preview-cancel' }>;

export interface TransformInteractionHandle {
  readonly renderLayerId: string;
  readonly renderTargetId: string;
  setTarget(target: TransformInteractionTarget): void;
  clearTarget(): void;
  startCopyPreview(preview: TransformCopyPreview): void;
  cancelCopyPreview(): void;
  destroy(): void;
}

export interface TransformInteractionPort {
  open(sessionId: string, options: TransformInteractionOptions, listener: (event: TransformInteractionEvent) => void): TransformInteractionHandle;
}
