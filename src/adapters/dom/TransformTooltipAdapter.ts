import { TooltipAdapter, type TooltipAdapterOptions } from './TooltipAdapter.js';

/** @deprecated 内部兼容别名；新装配应使用 `TooltipAdapterOptions`。 */
export type TransformTooltipAdapterOptions = TooltipAdapterOptions;

/** @deprecated 内部兼容包装；新装配应使用 `TooltipAdapter`。 */
export class TransformTooltipAdapter extends TooltipAdapter {}
