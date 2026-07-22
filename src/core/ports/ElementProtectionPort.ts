import type { ElementState } from '../element/types.js';
import type { ElementProtectionState } from '../protection/types.js';
import type { ElementProtectionUpdate } from '../protection/types.js';
import type { ElementGeneration } from '../transaction/types.js';

/** 一次 Element 保护运行态变化。 */
export interface ElementProtectionChange {
  /** 状态所属 Element。 */
  readonly elementId: string;
  /** 状态绑定的 Element 实例代次。 */
  readonly generation: ElementGeneration;
  /** 变化前的保护状态。 */
  readonly previous?: ElementProtectionState;
  /** 变化后的保护状态；解除时省略。 */
  readonly current?: ElementProtectionState;
}

/** Edit 与 Transform 读取保护状态使用的内部门禁。 */
export interface ElementProtectionGuard {
  /** 读取指定 Element 当前代次的保护状态。 */
  get(elementId: string, generation?: ElementGeneration): ElementProtectionState | undefined;
  /** 目标受保护时抛出 `ElementProtectedError`。 */
  assertEditable(elementId: string, generation?: ElementGeneration): void;
  /** 订阅保护状态变化。 */
  subscribe(listener: (change: ElementProtectionChange) => void): () => void;
}

/** Element Facade 设置和读取保护运行态使用的内部控制器。 */
export interface ElementProtectionController extends ElementProtectionGuard {
  /** 建立、更新或解除保护。 */
  set(elementId: string, update: ElementProtectionUpdate): boolean;
}

/** 把保护运行态投影为 OpenLayers 与 DOM 临时视图。 */
export interface ElementProtectionViewPort {
  /** 新增或更新单个保护视图。 */
  upsert(element: Readonly<ElementState>, protection: ElementProtectionState): void;
  /** 移除指定 Element 的保护视图。 */
  remove(elementId: string): void;
  /** 释放全部保护视图资源。 */
  destroy(): void;
}

/**
 * 不建立任何保护的门禁，供无协同状态的内部装配与测试显式使用。
 *
 * @internal
 */
export const unprotectedElementGuard: ElementProtectionGuard = Object.freeze({
  get: () => undefined,
  assertEditable: () => undefined,
  subscribe: () => () => undefined
});
